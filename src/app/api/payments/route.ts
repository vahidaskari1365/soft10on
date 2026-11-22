import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { monthKeyStart, monthKeyEnd, lastNMonthKeys } from '@/lib/jalali'
import { PAYMENT_METHOD_LABEL } from '@/lib/accounting'
import { postJournal, ACC } from '@/lib/ledger'
import { refreshInvoiceStatus } from '@/lib/accounting'
import { assertBranch, tenantHandler } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'

const METHODS = new Set(['CASH', 'CARD', 'POS', 'ONLINE', 'TRANSFER', 'CHECK'])
const DIRECTIONS = new Set(['IN', 'OUT'])

/** دفتر روزنامه — همه‌ی واریز و برداشت‌های کلینیک خود کاربر با فیلتر شعبهٔ مجاز */
export const GET = tenantHandler('ADMIN', 'MANAGER', 'RECEPTIONIST', 'ACCOUNTANT')(async (session, request) => {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('month')
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw ?? '')
  const monthKey = valid ? raw! : lastNMonthKeys(1)[0]
  const direction = searchParams.get('direction') ?? ''
  // branchId درخواستی فقط در محدودهٔ مجاز کاربر پذیرفته می‌شود
  const branchId = await assertBranch(session, searchParams.get('branch') || undefined) ?? undefined
  const refType = searchParams.get('refType') ?? ''

  const where = {
    date: { gte: monthKeyStart(monthKey), lt: monthKeyEnd(monthKey) },
    ...(direction ? { direction } : {}),
    ...(refType ? { refType } : {}),
    ...(branchId ? { branchId } : {}),
  }

  const [payments, inSum, outSum] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 400,
      include: {
        patient: { select: { firstName: true, lastName: true } },
        cashAccount: { select: { name: true, type: true } },
        invoice: { select: { number: true } },
      },
    }),
    db.payment.aggregate({ where: { ...where, direction: 'IN' }, _sum: { amount: true } }),
    db.payment.aggregate({ where: { ...where, direction: 'OUT' }, _sum: { amount: true } }),
  ])

  return NextResponse.json({
    items: payments.map((p) => ({
      id: p.id,
      date: p.date.toISOString(),
      direction: p.direction,
      method: p.method,
      methodFa: PAYMENT_METHOD_LABEL[p.method] ?? p.method,
      amount: p.amount,
      description: p.description,
      refType: p.refType,
      transferGroup: p.transferGroup,
      patient: p.patient,
      cashAccount: p.cashAccount,
      invoiceNumber: p.invoice?.number ?? null,
    })),
    stats: { inSum: inSum._sum.amount ?? 0, outSum: outSum._sum.amount ?? 0, count: payments.length },
  })
})

/**
 * ثبت پرداخت دستی — اتمیک با سند حسابداری، Idempotency و Audit هم‌تراکنش:
 * ۱) اعتبارسنجی ورودی ۲) شعبهٔ مجاز ۳) صندوق/بیمار همان کلینیک ۴) ثبت پرداخت
 * ۵) سند دوبل ۶) وضعیت فاکتور (در صورت اتصال) ۷) Audit — شکست هر مرحله = Rollback کامل
 */
export const POST = tenantHandler('ADMIN', 'MANAGER', 'RECEPTIONIST', 'ACCOUNTANT')(async (session, request) => {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const idemKey = (typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()) ||
    request.headers.get('idempotency-key')?.trim() || null

  const amount = Math.round(Number(body.amount ?? 0))
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'مبلغ باید عدد صحیح بزرگ‌تر از صفر باشد' }, { status: 400 })
  }
  const direction = body.direction === 'OUT' ? 'OUT' : body.direction === 'IN' ? 'IN' : null
  if (!direction) return NextResponse.json({ error: 'جهت پرداخت نامعتبر است' }, { status: 400 })
  const method = typeof body.method === 'string' && METHODS.has(body.method) ? body.method : 'CASH'
  if (!body.description?.toString().trim()) {
    return NextResponse.json({ error: 'توضیح الزامی است' }, { status: 400 })
  }
  const date = body.date ? new Date(String(body.date)) : new Date()
  if (isNaN(date.getTime())) return NextResponse.json({ error: 'تاریخ نامعتبر است' }, { status: 400 })

  // شعبهٔ درخواستی فقط در محدودهٔ مجاز کاربر
  const branchId = await assertBranch(session, typeof body.branchId === 'string' ? body.branchId : undefined) ?? session.branchId
  const cashAccountId = typeof body.cashAccountId === 'string' && body.cashAccountId ? body.cashAccountId : null
  const patientId = typeof body.patientId === 'string' && body.patientId ? body.patientId : null
  if (!cashAccountId) {
    return NextResponse.json({ error: 'انتخاب صندوق/حساب برای ثبت پرداخت الزامی است' }, { status: 400 })
  }

  // Idempotency — درخواست تکراری همان پرداخت را برمی‌گرداند، دوباره ثبت نمی‌کند
  if (idemKey) {
    const existing = await db.payment.findUnique({ where: { idempotencyKey: idemKey } })
    if (existing) return NextResponse.json({ payment: { ...existing, date: existing.date.toISOString() }, duplicate: true })
  }

  try {
    const payment = await db.$transaction(
      async (tx) => {
        // صندوق باید متعلق به همین کلینیک باشد (داخل تراکنش، با scope صریح)
        const account = await tx.cashAccount.findFirst({ where: { id: cashAccountId } })
        if (!account) throw Object.assign(new Error('صندوق/حساب یافت نشد'), { status: 404 })
        if (account.branchId && branchId && account.branchId !== branchId) {
          throw Object.assign(new Error('صندوق متعلق به شعبهٔ دیگری است'), { status: 403 })
        }
        if (patientId) {
          const patient = await tx.patient.findFirst({ where: { id: patientId } })
          if (!patient) throw Object.assign(new Error('بیمار یافت نشد'), { status: 404 })
        }

        const created = await tx.payment.create({
          data: {
            clinicId: session.clinicId,
            branchId,
            date,
            direction,
            method,
            amount,
            cashAccountId,
            patientId,
            description: String(body.description).trim().slice(0, 500),
            refType: typeof body.refType === 'string' && body.refType ? body.refType : 'OTHER',
            ...(idemKey ? { idempotencyKey: idemKey } : {}),
          },
          include: { patient: { select: { firstName: true, lastName: true } }, cashAccount: { select: { name: true } } },
        })

        // سند حسابداری دوبل — دریافت: بدهکار صندوق/بانک | برداشت: بستانکار صندوق/بانک
        const cashCode = account.type === 'BANK' ? ACC.BANK : ACC.CASH
        await postJournal(tx, {
          memo: `${direction === 'IN' ? 'دریافت' : 'برداشت'} — ${created.description}`,
          refType: 'PAYMENT',
          refId: created.id,
          clinicId: session.clinicId,
          branchId,
          createdById: session.id,
          lines:
            direction === 'IN'
              ? [
                  { code: cashCode, debit: amount, detail: account.name },
                  { code: patientId ? ACC.AR : ACC.SERVICE_REVENUE, credit: amount },
                ]
              : [
                  { code: patientId ? ACC.AR : ACC.OTHER_EXPENSE, debit: amount, detail: patientId ? 'برگشت به بیمار' : undefined },
                  { code: cashCode, credit: amount, detail: account.name },
                ],
        })

        // وضعیت فاکتور متصل (در صورت وجود) در همان تراکنش
        if (created.refType === 'INVOICE' && created.refId) {
          await refreshInvoiceStatus(created.refId, tx)
        }

        // Audit در همان تراکنش — شکست Audit = شکست کل عملیات
        await logAudit(
          {
            userId: session.id,
            userName: session.fullName,
            action: direction === 'IN' ? 'PAYMENT_IN' : 'PAYMENT_OUT',
            entity: 'Payment',
            entityId: created.id,
            branchId,
            clinicId: session.clinicId,
            meta: { amount, method, cashAccountId },
          },
          tx,
        )

        return created
      },
      { timeout: 20_000, maxWait: 10_000 },
    )

    return NextResponse.json({ payment: { ...payment, date: payment.date.toISOString() } }, { status: 201 })
  } catch (e) {
    // رقابت Idempotency: خطای یکتایی → پرداخت موجود برگردانده می‌شود
    if (idemKey && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const existing = await db.payment.findUnique({ where: { idempotencyKey: idemKey } })
      if (existing) return NextResponse.json({ payment: { ...existing, date: existing.date.toISOString() }, duplicate: true })
    }
    const status = (e as { status?: number }).status ?? 500
    const message = status >= 500 ? 'خطای سرور در ثبت پرداخت' : (e as Error).message
    if (status >= 500) console.error('[payment] tx failed:', (e as Error).message)
    return NextResponse.json({ error: message }, { status })
  }
})
