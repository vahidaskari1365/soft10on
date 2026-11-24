import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { postJournal, ACC } from '@/lib/ledger'
import { refreshInvoiceStatus } from '@/lib/accounting'
import { tenantHandler } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'

const PAY_METHODS = new Set(['CASH', 'CARD', 'POS', 'ONLINE', 'TRANSFER', 'CHECK'])

/** جزئیات فاکتور (برای چاپ) — scope خودکار کلینیک؛ بیمار فقط فاکتور خودش */
export const GET = tenantHandler()(async (session, _request, { params }) => {
  const { id } = await params
  // findFirst با تزریق clinicId — findUnique بدون scope ممنوع
  const invoice = await db.invoice.findFirst({
    where: { id },
    include: {
      patient: true,
      items: true,
      payments: { orderBy: { date: 'asc' } },
      branch: { select: { name: true, phone: true, address: true } },
    },
  })
  if (!invoice) return NextResponse.json({ error: 'فاکتور یافت نشد' }, { status: 404 })
  if (session.role === 'PATIENT' && session.patientId !== invoice.patientId) {
    return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  }
  const paid = invoice.payments.reduce((s, p) => s + p.amount, 0)
  return NextResponse.json({
    invoice: {
      ...invoice,
      date: invoice.date.toISOString(),
      createdAt: invoice.createdAt.toISOString(),
      payments: invoice.payments.map((p) => ({ ...p, date: p.date.toISOString(), createdAt: p.createdAt.toISOString() })),
      paid,
      remaining: invoice.status === 'CANCELLED' ? 0 : Math.max(0, invoice.total - paid),
    },
  })
})

/**
 * عملیات فاکتور — { action: 'pay'|'cancel'|'reopen', amount?, method?, cashAccountId? }
 * پرداخت: اتمیک با سند دوبل + Audit هم‌تراکنش + Idempotency؛ پرداخت بیش از مانده رد می‌شود.
 */
export const PATCH = tenantHandler('ADMIN', 'MANAGER', 'RECEPTIONIST', 'ACCOUNTANT')(async (session, request, { params }) => {
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as {
    action?: 'pay' | 'cancel' | 'reopen' | 'applyCosts'
    amount?: number
    method?: string
    cashAccountId?: string
    materialCost?: number
    laborCost?: number
  }
  const idemKey = request.headers.get('idempotency-key')?.trim() || null

  // فاکتور باید متعلق به کلینیک کاربر باشد (scope خودکار)
  const invoice = await db.invoice.findFirst({ where: { id }, include: { payments: { where: { refType: 'INVOICE' } } } })
  if (!invoice) return NextResponse.json({ error: 'فاکتور یافت نشد' }, { status: 404 })

  if (body.action === 'cancel') {
    const updated = await db.invoice.update({ where: { id }, data: { status: 'CANCELLED' } })
    await logAudit({
      userId: session.id, userName: session.fullName, action: 'INVOICE_CANCEL', entity: 'Invoice',
      entityId: id, branchId: invoice.branchId, clinicId: session.clinicId, meta: { number: invoice.number },
    })
    return NextResponse.json({ ok: true, status: updated.status })
  }
  if (body.action === 'reopen') {
    await db.invoice.update({ where: { id }, data: { status: 'ISSUED' } })
    const st = await refreshInvoiceStatus(id)
    await logAudit({
      userId: session.id, userName: session.fullName, action: 'INVOICE_REOPEN', entity: 'Invoice',
      entityId: id, branchId: invoice.branchId, clinicId: session.clinicId, meta: { number: invoice.number },
    })
    return NextResponse.json({ ok: true, status: st })
  }

  // اعمال هزینهٔ پرونده — تفکیک جنس/دستمزد برای محاسبهٔ سود خالص هر فاکتور
  if (body.action === 'applyCosts') {
    if (session.role !== 'ADMIN' && session.role !== 'ACCOUNTANT' && session.role !== 'MANAGER') {
      return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
    }
    const m = Math.round(Number(body.materialCost ?? 0))
    const l = Math.round(Number(body.laborCost ?? 0))
    if (!Number.isFinite(m) || !Number.isFinite(l) || m < 0 || l < 0) {
      return NextResponse.json({ error: 'مبلغ جنس و دستمزد باید اعداد صحیح نامنفی باشند' }, { status: 400 })
    }
    if (m > invoice.total || l > invoice.total) {
      return NextResponse.json({ error: 'هزینهٔ اعمالی نمی‌تواند از مبلغ فاکتور بیشتر باشد' }, { status: 400 })
    }
    await db.invoice.update({ where: { id }, data: { materialCost: m, laborCost: l } })
    await logAudit({
      userId: session.id, userName: session.fullName, action: 'INVOICE_APPLY_COSTS', entity: 'Invoice',
      entityId: id, branchId: invoice.branchId, clinicId: session.clinicId, meta: { number: invoice.number, materialCost: m, laborCost: l },
    })
    return NextResponse.json({ ok: true, materialCost: m, laborCost: l, net: invoice.total - m - l })
  }

  // پرداخت (کامل یا جزئی) — با اعتبارسنجی مبلغ و صندوق
  const paid = invoice.payments.reduce((s, p) => s + p.amount, 0)
  const remaining = Math.max(0, invoice.total - paid)
  if (remaining <= 0) return NextResponse.json({ error: 'این فاکتور قبلاً تسویه شده است' }, { status: 400 })
  const rawAmount = Math.round(Number(body.amount ?? remaining))
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    return NextResponse.json({ error: 'مبلغ باید عدد صحیح بزرگ‌تر از صفر باشد' }, { status: 400 })
  }
  // پرداخت بیش از مانده رد می‌شود — بدون clamp پنهان
  if (rawAmount > remaining) {
    return NextResponse.json({ error: `مبلغ بیش از ماندهٔ فاکتور است (باقی‌مانده: ${remaining})` }, { status: 400 })
  }
  const method = typeof body.method === 'string' && PAY_METHODS.has(body.method) ? body.method : 'CASH'
  const cashAccountId = typeof body.cashAccountId === 'string' && body.cashAccountId ? body.cashAccountId : null

  // Idempotency per-clinic — کلید تکراری با مبلغ متفاوت رد می‌شود
  const fingerprint = createHash('sha256').update(['pay', invoice.id, rawAmount, method].join('|')).digest('hex')
  if (idemKey) {
    const existing = await db.payment.findFirst({ where: { idempotencyKey: idemKey } })
    if (existing) {
      if (existing.idempotencyFingerprint && existing.idempotencyFingerprint !== fingerprint) {
        return NextResponse.json({ error: 'این کلید Idempotency قبلاً با مبلغ متفاوت استفاده شده است' }, { status: 409 })
      }
      return NextResponse.json({ ok: true, duplicate: true, status: invoice.status })
    }
  }

  try {
    const result = await db.$transaction(
      async (tx) => {
        const account = cashAccountId ? await tx.cashAccount.findFirst({ where: { id: cashAccountId } }) : null
        if (cashAccountId && !account) throw Object.assign(new Error('صندوق/حساب یافت نشد'), { status: 404 })

        const payment = await tx.payment.create({
          data: {
            clinicId: session.clinicId,
            branchId: invoice.branchId,
            date: new Date(),
            direction: 'IN',
            method,
            amount: rawAmount,
            cashAccountId,
            patientId: invoice.patientId,
            invoiceId: invoice.id,
            description: `پرداخت فاکتور شماره ${invoice.number}`,
            refType: 'INVOICE',
            refId: invoice.id,
            ...(idemKey ? { idempotencyKey: idemKey, idempotencyFingerprint: fingerprint } : {}),
          },
        })
        // بدهکار: صندوق/بانک | بستانکار: حساب‌های دریافتنی
        const cashCode = account ? (account.type === 'BANK' ? ACC.BANK : ACC.CASH) : method === 'CASH' ? ACC.CASH : ACC.BANK
        await postJournal(tx, {
          memo: `دریافت وجه فاکتور شماره ${invoice.number}`,
          refType: 'PAYMENT',
          refId: payment.id,
          clinicId: session.clinicId,
          branchId: invoice.branchId,
          createdById: session.id,
          lines: [
            { code: cashCode, debit: rawAmount, detail: `فاکتور ${invoice.number}` },
            { code: ACC.AR, credit: rawAmount, detail: `تسویه فاکتور ${invoice.number}` },
          ],
        })
        const st = await refreshInvoiceStatus(invoice.id, tx)
        await logAudit(
          {
            userId: session.id, userName: session.fullName, action: 'PAYMENT_IN', entity: 'Payment',
            entityId: payment.id, branchId: invoice.branchId, clinicId: session.clinicId,
            meta: { amount: rawAmount, method, invoiceNumber: invoice.number },
          },
          tx,
        )
        return { status: st, paid: paid + rawAmount, remaining: Math.max(0, remaining - rawAmount) }
      },
      { timeout: 20_000, maxWait: 10_000 },
    )
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    if (idemKey && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const existing = await db.payment.findFirst({ where: { idempotencyKey: idemKey } })
      if (existing) return NextResponse.json({ ok: true, duplicate: true, status: invoice.status })
    }
    const status = (e as { status?: number }).status ?? 500
    if (status >= 500) console.error('[invoice-pay] tx failed:', (e as Error).message)
    return NextResponse.json({ error: status >= 500 ? 'خطای سرور در ثبت پرداخت' : (e as Error).message }, { status })
  }
})
