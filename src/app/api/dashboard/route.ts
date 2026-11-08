import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { monthlySeries, monthComposition } from '@/lib/finance'
import { jMonthKey } from '@/lib/jalali'

export async function GET() {
  const now = new Date()
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
  const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0))
  const monthKey = jMonthKey(now)

  const [todayAppts, series, composition] = await Promise.all([
    db.appointment.findMany({
      where: { start: { gte: dayStart, lt: dayEnd } },
      include: { patient: true, doctor: true, service: true },
      orderBy: { start: 'asc' },
    }),
    monthlySeries(12),
    monthComposition(monthKey),
  ])

  const [pendingCount, openTasks, overdueTasks, lowStock, last30Appts, current, prev] = await Promise.all([
    db.appointment.count({ where: { status: 'PENDING', start: { gte: now } } }),
    db.task.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] } } }),
    db.task.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] }, dueAt: { lt: now } } }),
    db.product.count({ where: { stockQty: { lte: 6 } } }),
    db.appointment.findMany({
      where: { start: { gte: new Date(now.getTime() - 30 * 86400000), lt: now }, status: { in: ['DONE', 'NO_SHOW', 'CANCELLED'] } },
      select: { status: true },
    }),
    series[series.length - 1],
    series[series.length - 2],
  ])

  const noShowRate = last30Appts.length ? (last30Appts.filter((a) => a.status === 'NO_SHOW').length / last30Appts.length) * 100 : 0
  const revenueGrowth = prev.revenue > 0 ? ((current.revenue - prev.revenue) / prev.revenue) * 100 : 0

  const nextUp = await db.appointment.findMany({
    where: { start: { gte: now }, status: { in: ['PENDING', 'CONFIRMED'] } },
    include: { patient: true, doctor: true, service: true },
    orderBy: { start: 'asc' },
    take: 5,
  })

  return NextResponse.json({
    todayAppts,
    nextUp,
    series,
    composition,
    kpis: {
      todayCount: todayAppts.length,
      pendingCount,
      monthRevenue: current.revenue,
      monthNetProfit: current.netProfit,
      revenueGrowth,
      noShowRate,
      openTasks,
      overdueTasks,
      lowStock,
    },
  })
}
