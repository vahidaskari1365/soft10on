import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tenantHandler } from '@/lib/tenant'
import { postJournal, trialBalance, ACC } from '@/lib/ledger'
import { vInt, vStr, vDate } from '@/lib/validation'
import { logAudit } from '@/lib/audit'

/**
 * حسابداری دوبل — کدینگ، اسناد، دفتر روزنامه و تراز آزمایشی.
 * مشاهده: ADMIN و RECEPTIONIST | ثبت سند دستی: فقط ADMIN
 */
export const GET = tenantHandler('ADMIN', 'RECEPTIONIST', 'ACCOUNTANT')(async (session, request) => {
  const { searchParams } = new URL(request.url)
  const view = searchParams.get('view') ?? 'summary'

  if (view === 'accounts') {
    const accounts = await db.ledgerAccount.findMany({ orderBy: { code: 'asc' } })
    return NextResponse.json({ accounts })
  }
  if (view === 'trial') {
    const tb = await trialBalance(session.clinicId)
    const debit = tb.reduce((s, r) => s + r.debit, 0)
    const credit = tb.reduce((s, r) => s + r.credit, 0)
    return NextResponse.json({ trialBalance: tb, debit, credit, balanced: debit === credit })
  }
  if (view === 'account') {
    // دفتر معین — گردش یک حساب با ماندهٔ تجمعی (فقط اسناد POSTED)
    const code = (searchParams.get('code') ?? '').trim()
    const acc = await db.ledgerAccount.findUnique({ where: { code } })
    if (!acc) return NextResponse.json({ error: 'حساب یافت نشد' }, { status: 404 })
    const lines = await db.journalLine.findMany({
      where: { accountId: acc.id, entry: { clinicId: session.clinicId, status: 'POSTED' } },
      include: { entry: { select: { number: true, date: true, memo: true, refType: true } } },
      orderBy: [{ entry: { date: 'asc' } }, { entryId: 'asc' }],
      take: 400,
    })
    let balance = 0
    const rows = lines.map((l) => {
      balance += l.debit - l.credit
      return {
        id: l.id,
        date: l.entry.date,
        number: l.entry.number,
        memo: l.entry.memo,
        refType: l.entry.refType,
        detail: l.detail,
        debit: l.debit,
        credit: l.credit,
        balance,
      }
    })
    return NextResponse.json({ account: { code: acc.code, name: acc.name, type: acc.type }, rows })
  }
  // دفتر روزنامه — آخرین اسناد با آرتیکل‌ها
  const take = Math.min(100, Number(searchParams.get('take') ?? 30))
  const entries = await db.journalEntry.findMany({
    include: { lines: { include: { account: { select: { code: true, name: true } } } }, createdBy: { select: { fullName: true } } },
    orderBy: { date: 'desc' },
    take,
  })
  return NextResponse.json({ entries })
})

/** ثبت سند دستی — باید تراز باشد؛ فقط مدیر */
export const POST = tenantHandler('ADMIN')(async (session, request) => {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const memo = vStr(body.memo, { required: true, min: 2, max: 200, label: 'شرح سند' })
  if (!memo.ok) return NextResponse.json({ error: memo.error }, { status: 400 })
  const date = vDate(body.date, 'تاریخ سند')
  if (!date.ok) return NextResponse.json({ error: date.error }, { status: 400 })

  const rawLines = Array.isArray(body.lines) ? body.lines : []
  const lines: { code: string; debit: number; credit: number; detail?: string }[] = []
  for (const l of rawLines as Record<string, unknown>[]) {
    const code = typeof l.code === 'string' ? l.code.trim() : ''
    if (!code) return NextResponse.json({ error: 'کد حساب در آرتیکل الزامی است' }, { status: 400 })
    const debit = vInt(l.debit, { label: 'بدهکار', min: 0 })
    if (!debit.ok) return NextResponse.json({ error: debit.error }, { status: 400 })
    const credit = vInt(l.credit, { label: 'بستانکار', min: 0 })
    if (!credit.ok) return NextResponse.json({ error: credit.error }, { status: 400 })
    if (debit.value > 0 && credit.value > 0)
      return NextResponse.json({ error: 'هر آرتیکل یا بدهکار است یا بستانکار، نه هر دو' }, { status: 400 })
    lines.push({ code, debit: debit.value, credit: credit.value, detail: typeof l.detail === 'string' ? l.detail.slice(0, 120) : undefined })
  }

  try {
    const result = await db.$transaction(
      (tx) =>
        postJournal(tx, {
          memo: memo.value,
          date: date.value ?? new Date(),
          refType: 'MANUAL',
          clinicId: session.clinicId,
          branchId: session.branchId,
          createdById: session.id,
          lines,
        }),
      { timeout: 20_000, maxWait: 10_000 },
    )
    await logAudit({ userId: session.id, userName: session.fullName, action: 'CREATE', entity: 'JournalEntry', entityId: result.entryId, branchId: session.branchId, clinicId: session.clinicId, meta: { number: result.number } })
    return NextResponse.json({ ok: true, ...result }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 400 })
  }
})
