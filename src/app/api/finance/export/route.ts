import { NextResponse } from 'next/server'
import { tenantHandler, platformHandler } from '@/lib/tenant'
import { db } from '@/lib/db'
import { monthKeyStart, monthKeyEnd, lastNMonthKeys } from '@/lib/jalali'
import { PAYMENT_METHOD_LABEL } from '@/lib/accounting'
import { EXPENSE_CATEGORY_LABEL } from '@/lib/format'

function csvCell(v: string | number | null | undefined): string {
  const s = String(v ?? '')
  return `"${s.replace(/"/g, '""')}"`
}

/** خروجی CSV گزارش ماه — ?type=ledger|expenses|invoices&month=1405-08 */
export const GET = tenantHandler('ADMIN', 'RECEPTIONIST')(async (session, request) => {
  if (session.role !== 'ADMIN' && session.role !== 'RECEPTIONIST') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('month')
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw ?? '')
  const monthKey = valid ? raw! : lastNMonthKeys(1)[0]
  const type = searchParams.get('type') ?? 'ledger'
  const start = monthKeyStart(monthKey)
  const end = monthKeyEnd(monthKey)
  const branchId = searchParams.get('branch') || undefined
  const br = branchId ? { branchId } : {}

  let rows: string[] = []
  let filename = ''

  if (type === 'expenses') {
    const items = await db.expense.findMany({ where: { date: { gte: start, lt: end }, ...br }, orderBy: { date: 'asc' } })
    rows.push(['تاریخ', 'دسته', 'شرح', 'مبلغ (تومان)'].join(','))
    for (const e of items) {
      rows.push([e.date.toISOString().slice(0, 10), EXPENSE_CATEGORY_LABEL[e.category] ?? e.category, csvCell(e.description), Math.round(e.amount)].join(','))
    }
    filename = `10on-expenses-${monthKey}.csv`
  } else if (type === 'invoices') {
    const items = await db.invoice.findMany({
      where: { date: { gte: start, lt: end }, ...br },
      include: { patient: true },
      orderBy: { number: 'asc' },
    })
    rows.push(['شماره', 'تاریخ', 'بیمار', 'جمع', 'تخفیف', 'قابل پرداخت', 'وضعیت'].join(','))
    const STATUS: Record<string, string> = { DRAFT: 'پیش‌نویس', ISSUED: 'صادرشده', PARTIAL: 'پرداخت جزئی', PAID: 'تسویه‌شده', CANCELLED: 'ابطال‌شده' }
    for (const i of items) {
      rows.push([i.number, i.date.toISOString().slice(0, 10), csvCell(i.patient ? `${i.patient.firstName} ${i.patient.lastName}` : 'بدون بیمار'), Math.round(i.subtotal), Math.round(i.discount), Math.round(i.total), STATUS[i.status] ?? i.status].join(','))
    }
    filename = `10on-invoices-${monthKey}.csv`
  } else {
    // دفتر روزنه (پرداخت‌ها)
    const items = await db.payment.findMany({
      where: { date: { gte: start, lt: end }, ...br },
      include: { patient: true, cashAccount: true },
      orderBy: { date: 'asc' },
    })
    rows.push(['تاریخ', 'نوع', 'روش', 'شرح', 'حساب', 'بیمار', 'مبلغ (تومان)'].join(','))
    for (const p of items) {
      rows.push([
        p.date.toISOString().slice(0, 10),
        p.direction === 'IN' ? 'دریافت' : 'پرداخت',
        PAYMENT_METHOD_LABEL[p.method] ?? p.method,
        csvCell(p.description),
        csvCell(p.cashAccount?.name ?? ''),
        csvCell(p.patient ? `${p.patient.firstName} ${p.patient.lastName}` : ''),
        (p.direction === 'IN' ? 1 : -1) * Math.round(p.amount),
      ].join(','))
    }
    filename = `10on-ledger-${monthKey}.csv`
  }

  const csv = '\uFEFF' + rows.join('\n') // BOM برای اکسل فارسی
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
})
