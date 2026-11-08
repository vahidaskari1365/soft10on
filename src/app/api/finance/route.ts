import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { monthlySeries } from '@/lib/finance'
import { monthKeyStart, monthKeyEnd, lastNMonthKeys } from '@/lib/jalali'
import { EXPENSE_CATEGORY_LABEL } from '@/lib/format'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('month')
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw ?? '')
  const monthKey = valid ? raw! : lastNMonthKeys(1)[0]
  const start = monthKeyStart(monthKey)
  const end = monthKeyEnd(monthKey)

  const [doneAppts, productSales, expenses] = await Promise.all([
    db.appointment.findMany({
      where: { start: { gte: start, lt: end }, status: 'DONE' },
      select: { price: true, doctor: { select: { id: true, name: true, commissionRate: true } }, service: { select: { name: true, category: true } } },
    }),
    db.productSale.findMany({ where: { date: { gte: start, lt: end } }, include: { product: true } }),
    db.expense.findMany({ where: { date: { gte: start, lt: end } } }),
  ])

  const revenueServices = doneAppts.reduce((s, a) => s + a.price, 0)
  const revenueProducts = productSales.reduce((s, x) => s + x.total, 0)
  const cogs = productSales.reduce((s, x) => s + x.qty * x.product.purchasePrice, 0)
  const commission = doneAppts.reduce((s, a) => s + a.price * a.doctor.commissionRate, 0)

  const expByCat = new Map<string, number>()
  for (const e of expenses) expByCat.set(e.category, (expByCat.get(e.category) ?? 0) + e.amount)
  const expenseRows = [...expByCat.entries()].map(([category, amount]) => ({
    category,
    label: EXPENSE_CATEGORY_LABEL[category] ?? category,
    amount,
  }))

  const commissionRow = { category: 'COMMISSION', label: EXPENSE_CATEGORY_LABEL.COMMISSION, amount: commission }
  const cogsRow = { category: 'COGS', label: EXPENSE_CATEGORY_LABEL.COGS, amount: cogs }

  // درآمد به تفکیک خدمت
  const byService = new Map<string, { name: string; value: number; count: number }>()
  for (const a of doneAppts) {
    const cur = byService.get(a.service.name) ?? { name: a.service.name, value: 0, count: 0 }
    cur.value += a.price
    cur.count += 1
    byService.set(a.service.name, cur)
  }
  const topServices = [...byService.values()].sort((a, b) => b.value - a.value).slice(0, 7)

  // کارانه هر پزشک
  const byDoctor = new Map<string, { name: string; revenue: number; commission: number }>()
  for (const a of doneAppts) {
    const cur = byDoctor.get(a.doctor.id) ?? { name: a.doctor.name, revenue: 0, commission: 0 }
    cur.revenue += a.price
    cur.commission += a.price * a.doctor.commissionRate
    byDoctor.set(a.doctor.id, cur)
  }

  const series = await monthlySeries(12)
  const revenue = revenueServices + revenueProducts
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0) + commission + cogs

  return NextResponse.json({
    monthKey,
    pnl: {
      revenueServices,
      revenueProducts,
      revenue,
      cogs,
      commission,
      operationalExpenses: expenses.reduce((s, e) => s + e.amount, 0),
      totalExpenses,
      netProfit: revenue - totalExpenses,
      margin: revenue > 0 ? ((revenue - totalExpenses) / revenue) * 100 : 0,
    },
    expenseRows: [...expenseRows, commissionRow, cogsRow].sort((a, b) => b.amount - a.amount),
    topServices,
    doctors: [...byDoctor.values()].sort((a, b) => b.revenue - a.revenue),
    series,
    appointmentCount: doneAppts.length,
  })
}
