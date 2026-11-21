import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { monthKeyStart, monthKeyEnd, shiftJMonth, jMonthKey } from '@/lib/jalali'

/**
 * گزارش‌های مدیریتی تجمیعی (فیلتر ماه شمسی + شعبه)
 * ADMIN: همه گزارش‌ها | RECEPTIONIST: بدون داده مالی
 */
export async function GET(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role !== 'ADMIN' && session.role !== 'RECEPTIONIST')
    return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('month')
  const key = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw ?? '') ? raw! : null
  const start = key ? monthKeyStart(key) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const end = key ? monthKeyEnd(key) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
  const branchId = searchParams.get('branch') || undefined
  const canFinance = session.role === 'ADMIN'

  const apptWhere = { start: { gte: start, lt: end }, ...(branchId ? { branchId } : {}) }

  const [patientTotal, patientNew, appointments, invoices, receivedPayments, expenses, messages, aiCalls, newBookings, products, doneAppts6m] =
    await Promise.all([
      db.patient.count(),
      db.patient.count({ where: { createdAt: { gte: start, lt: end } } }),
      db.appointment.findMany({ where: apptWhere, include: { doctor: { select: { name: true } }, service: { select: { name: true, category: true } }, patient: { select: { id: true } } } }),
      canFinance
        ? db.invoice.findMany({ where: { date: { gte: start, lt: end }, ...(branchId ? { branchId } : {}) }, include: { payments: { select: { amount: true } } } })
        : Promise.resolve([]),
      canFinance
        ? db.payment.findMany({ where: { date: { gte: start, lt: end }, direction: 'RECEIVED', ...(branchId ? { branchId } : {}) } })
        : Promise.resolve([]),
      canFinance
        ? db.expense.findMany({ where: { date: { gte: start, lt: end }, ...(branchId ? { branchId } : {}) } })
        : Promise.resolve([]),
      db.message.findMany({ where: { createdAt: { gte: start, lt: end } }, select: { direction: true } }),
      db.aiCall.findMany({ where: { createdAt: { gte: start, lt: end } }, select: { aiUsed: true, ok: true, latencyMs: true } }),
      db.publicBooking.count({ where: { createdAt: { gte: start, lt: end }, ...(branchId ? { branchId } : {}) } }),
      canFinance
        ? db.product.findMany({ ...(branchId ? { where: { branchId } } : {}), select: { name: true, stockQty: true, minStock: true, purchasePrice: true } })
        : Promise.resolve([]),
      db.appointment.findMany({ where: { status: 'DONE', start: { gte: new Date(Date.now() - 180 * 86400_000) }, ...(branchId ? { branchId } : {}) }, select: { patientId: true }, distinct: ['patientId'] }),
    ])

  // ——— نوبت‌ها ———
  const byStatus: Record<string, number> = {}
  for (const a of appointments) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1
  const doctorMap = new Map<string, { name: string; done: number; cancelled: number; noShow: number; revenue: number }>()
  const serviceMap = new Map<string, { name: string; category: string; count: number; revenue: number }>()
  const hourMap = new Map<number, number>()
  const uniquePatients = new Set<string>()
  for (const a of appointments) {
    uniquePatients.add(a.patientId)
    const d = doctorMap.get(a.doctorId) ?? { name: a.doctor.name, done: 0, cancelled: 0, noShow: 0, revenue: 0 }
    if (a.status === 'DONE') {
      d.done += 1
      d.revenue += a.price
    } else if (a.status === 'CANCELLED') d.cancelled += 1
    else if (a.status === 'NO_SHOW') d.noShow += 1
    doctorMap.set(a.doctorId, d)
    const s = serviceMap.get(a.serviceId) ?? { name: a.service.name, category: a.service.category ?? '', count: 0, revenue: 0 }
    s.count += 1
    if (a.status === 'DONE') s.revenue += a.price
    serviceMap.set(a.serviceId, s)
    if (a.status === 'DONE') {
      const h = new Date(a.start).getHours()
      hourMap.set(h, (hourMap.get(h) ?? 0) + 1)
    }
  }

  // ——— مالی ——— (هم‌راستا با تعریف /api/finance: درآمد خدمات = نوبت‌های DONE، درآمد کالا = فروش محصولات)
  const [productSales, apptRevenue] = await Promise.all([
    canFinance
      ? db.productSale.findMany({ where: { date: { gte: start, lt: end }, ...(branchId ? { branchId } : {}) }, select: { total: true } })
      : Promise.resolve([]),
    Promise.resolve(appointments.filter((a) => a.status === 'DONE').reduce((s, a) => s + a.price, 0)),
  ])
  const productRevenue = productSales.reduce((s, p) => s + p.total, 0)
  const revenue = apptRevenue + productRevenue
  const paidFromInvoices = invoices.reduce((s, i) => s + i.payments.reduce((ps, p) => ps + p.amount, 0), 0)
  const totalReceived = receivedPayments.reduce((s, p) => s + p.amount, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const expenseByCategory = new Map<string, number>()
  for (const e of expenses) expenseByCategory.set(e.category, (expenseByCategory.get(e.category) ?? 0) + e.amount)

  // ——— روند ۶ ماه اخیر ———
  const trend: { key: string; revenue: number; expense: number }[] = []
  if (canFinance) {
    const baseKey = key ?? jMonthKey(new Date())
    for (let i = 5; i >= 0; i--) {
      const k = shiftJMonth(baseKey, -i)
      const s = monthKeyStart(k).getTime()
      const e = monthKeyEnd(k).getTime()
      const [revApt, revProd, exp] = await Promise.all([
        db.appointment.aggregate({ where: { start: { gte: new Date(s), lt: new Date(e) }, status: 'DONE', ...(branchId ? { branchId } : {}) }, _sum: { price: true } }),
        db.productSale.aggregate({ where: { date: { gte: new Date(s), lt: new Date(e) }, ...(branchId ? { branchId } : {}) }, _sum: { total: true } }),
        db.expense.aggregate({ where: { date: { gte: new Date(s), lt: new Date(e) }, ...(branchId ? { branchId } : {}) }, _sum: { amount: true } }),
      ])
      trend.push({ key: k, revenue: (revApt._sum.price ?? 0) + (revProd._sum.total ?? 0), expense: exp._sum.amount ?? 0 })
    }
  }

  const aiOk = aiCalls.filter((c) => c.ok).length
  const aiAvgLatency = aiCalls.length ? Math.round(aiCalls.reduce((s, c) => s + (c.latencyMs ?? 0), 0) / aiCalls.length) : 0

  return NextResponse.json({
    month: key,
    patients: {
      total: patientTotal,
      newThisMonth: patientNew,
      active6m: doneAppts6m.length,
      inactive6m: Math.max(0, patientTotal - doneAppts6m.length),
      visitedThisMonth: uniquePatients.size,
    },
    appointments: {
      total: appointments.length,
      byStatus,
      cancelRate: appointments.length ? Math.round(((byStatus.CANCELLED ?? 0) + (byStatus.NO_SHOW ?? 0)) / appointments.length * 100) : 0,
      byDoctor: [...doctorMap.values()].sort((a, b) => b.done - a.done),
      byService: [...serviceMap.values()].sort((a, b) => b.count - a.count).slice(0, 10),
      peakHours: [...hourMap.entries()].sort((a, b) => a[0] - b[0]).map(([hour, count]) => ({ hour, count })),
    },
    finance: canFinance
      ? {
          revenue,
          collectedFromInvoices: paidFromInvoices,
          received: totalReceived,
          expenses: totalExpenses,
          profit: revenue - totalExpenses,
          receivables: Math.max(0, revenue - paidFromInvoices),
          expenseByCategory: [...expenseByCategory.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
        }
      : null,
    crm: {
      messagesIn: messages.filter((m) => m.direction === 'IN').length,
      messagesOut: messages.filter((m) => m.direction === 'OUT').length,
      aiRequests: aiCalls.length,
      aiOk,
      aiAvgLatency,
      newBookings,
    },
    inventory: canFinance
      ? {
          stockValue: products.reduce((s, p) => s + p.stockQty * p.purchasePrice, 0),
          lowStock: products.filter((p) => p.stockQty <= p.minStock).map((p) => ({ name: p.name, stockQty: p.stockQty, minStock: p.minStock })),
        }
      : null,
    trend,
  })
}
