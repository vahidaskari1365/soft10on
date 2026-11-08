import { db } from '@/lib/db'
import { lastNMonthKeys, monthKeyStart, monthKeyEnd, keyToLabel } from '@/lib/jalali'

export type MonthRow = {
  key: string
  label: string
  revenueServices: number
  revenueProducts: number
  revenue: number
  cogs: number
  commission: number
  expenses: number
  totalExpenses: number
  netProfit: number
  appointments: number
  noShow: number
  cancelled: number
}

/** سری ۱۲ ماه اخیر: درآمد خدمات + فروش کالا، کارانه، هزینه‌ها، سود خالص */
export async function monthlySeries(n = 12): Promise<MonthRow[]> {
  const keys = lastNMonthKeys(n)
  const start = monthKeyStart(keys[0])
  const end = monthKeyEnd(keys[keys.length - 1])

  const [appts, sales, expenses, products, doctors] = await Promise.all([
    db.appointment.findMany({
      where: { start: { gte: start, lt: end } },
      select: { start: true, status: true, price: true, service: { select: { category: true } }, doctor: { select: { commissionRate: true } } },
    }),
    db.productSale.findMany({
      where: { date: { gte: start, lt: end } },
      select: { date: true, total: true, qty: true, product: { select: { purchasePrice: true } } },
    }),
    db.expense.findMany({ where: { date: { gte: start, lt: end } }, select: { date: true, category: true, amount: true } }),
    db.product.findMany({ select: { id: true, purchasePrice: true } }),
    db.doctor.findMany({ select: { commissionRate: true } }),
  ])
  void products
  void doctors

  // پیش‌محاسبه‌ی بازه‌ی هر ماه
  const ranges = keys.map((k) => ({ key: k, start: monthKeyStart(k).getTime(), end: monthKeyEnd(k).getTime() }))
  const keyOf = (d: Date) => ranges.find((r) => d.getTime() >= r.start && d.getTime() < r.end)?.key
  const rows = new Map<string, MonthRow>()
  for (const k of keys) {
    rows.set(k, {
      key: k,
      label: keyToLabel(k),
      revenueServices: 0, revenueProducts: 0, revenue: 0,
      cogs: 0, commission: 0, expenses: 0, totalExpenses: 0,
      netProfit: 0, appointments: 0, noShow: 0, cancelled: 0,
    })
  }
  for (const a of appts) {
    const key = keyOf(a.start)
    if (!key) continue
    const r = rows.get(key)!
    if (a.status === 'DONE') {
      r.revenueServices += a.price
      r.commission += a.price * a.doctor.commissionRate
      r.appointments += 1
    } else if (a.status === 'NO_SHOW') r.noShow += 1
    else if (a.status === 'CANCELLED') r.cancelled += 1
  }
  for (const s of sales) {
    const key = keyOf(s.date)
    if (!key) continue
    const r = rows.get(key)!
    r.revenueProducts += s.total
    r.cogs += s.qty * s.product.purchasePrice
  }
  for (const e of expenses) {
    const key = keyOf(e.date)
    if (!key) continue
    rows.get(key)!.expenses += e.amount
  }
  for (const r of rows.values()) {
    r.revenue = r.revenueServices + r.revenueProducts
    r.totalExpenses = r.expenses + r.commission + r.cogs
    r.netProfit = r.revenue - r.totalExpenses
  }
  return keys.map((k) => rows.get(k)!)
}

/** تفکیک ماه جاری برای دونات */
export async function monthComposition(key: string) {
  const start = monthKeyStart(key)
  const end = monthKeyEnd(key)
  const [appts, productTotal] = await Promise.all([
    db.appointment.findMany({
      where: { start: { gte: start, lt: end }, status: 'DONE' },
      select: { price: true, service: { select: { category: true } } },
    }),
    db.productSale.aggregate({ where: { date: { gte: start, lt: end } }, _sum: { total: true } }),
  ])
  const byCat = new Map<string, number>()
  for (const a of appts) {
    byCat.set(a.service.category, (byCat.get(a.service.category) ?? 0) + a.price)
  }
  const out: { name: string; value: number }[] = [...byCat.entries()].map(([name, value]) => ({ name, value }))
  if ((productTotal._sum.total ?? 0) > 0) out.push({ name: 'فروش کالا', value: productTotal._sum.total ?? 0 })
  return out.sort((a, b) => b.value - a.value)
}
