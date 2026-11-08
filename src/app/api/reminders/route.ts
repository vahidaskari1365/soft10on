import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { utcDayStart } from '@/lib/jalali'

/** یادآوری‌های خودکار — کارتابل هوشمند منشی و مدیر */
export async function GET() {
  const session = await getSessionUser()
  if (!session || session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const now = new Date()
  const tomorrowStart = new Date(utcDayStart(now).getTime() + 24 * 3600 * 1000)
  const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 3600 * 1000)
  const in7 = new Date(now.getTime() + 7 * 24 * 3600 * 1000)
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 3600 * 1000)

  const [tomorrowAppts, checksDue, invoicesOverdue, lowStock, overdueTasks, unreadMsgs, newBookings] = await Promise.all([
    db.appointment.findMany({
      where: { start: { gte: tomorrowStart, lt: tomorrowEnd }, status: { in: ['PENDING', 'CONFIRMED'] } },
      orderBy: { start: 'asc' },
      include: { patient: { select: { id: true, firstName: true, lastName: true, phone: true } }, doctor: { select: { name: true } }, service: { select: { name: true } } },
    }),
    db.check.findMany({
      where: { status: { in: ['IN_HAND', 'DEPOSITED'] }, dueDate: { lte: in7 } },
      orderBy: { dueDate: 'asc' },
      include: { patient: { select: { firstName: true, lastName: true } } },
    }),
    db.invoice.findMany({
      where: { status: { in: ['ISSUED', 'PARTIAL'] }, date: { lte: twoWeeksAgo } },
      include: { patient: { select: { firstName: true, lastName: true } } },
      take: 20,
    }),
    db.product.findMany({ where: { stockQty: { lte: db.product.fields.minStock } }, take: 20 }),
    db.task.findMany({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, dueAt: { lt: now } },
      include: { patient: { select: { firstName: true, lastName: true } } },
      orderBy: { dueAt: 'asc' },
      take: 15,
    }),
    db.message.findMany({ where: { direction: 'IN', readAt: null }, include: { patient: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, take: 10 }),
    db.publicBooking.findMany({ where: { status: 'NEW' }, orderBy: { createdAt: 'desc' }, take: 10 }),
  ])

  return NextResponse.json({
    tomorrowCalls: tomorrowAppts.map((a) => ({
      id: a.id,
      start: a.start.toISOString(),
      patient: a.patient,
      doctor: a.doctor.name,
      service: a.service.name,
      status: a.status,
    })),
    checksDue: checksDue.map((c) => ({ id: c.id, number: c.number, bank: c.bank, dueDate: c.dueDate.toISOString(), amount: c.amount, direction: c.direction, patient: c.patient })),
    overdueInvoices: invoicesOverdue.map((i) => ({ id: i.id, number: i.number, total: i.total, patient: i.patient, date: i.date.toISOString() })),
    lowStock: lowStock.map((p) => ({ id: p.id, name: p.name, stockQty: p.stockQty, minStock: p.minStock })),
    overdueTasks: overdueTasks.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt.toISOString(), priority: t.priority, patient: t.patient })),
    unreadMsgs: unreadMsgs.map((m) => ({ id: m.id, body: m.body.slice(0, 80), patient: m.patient, createdAt: m.createdAt.toISOString() })),
    newBookings: newBookings.map((b) => ({ id: b.id, name: b.name, phone: b.phone, createdAt: b.createdAt.toISOString() })),
    counts: {
      tomorrowCalls: tomorrowAppts.length,
      checksDue: checksDue.length,
      overdueInvoices: invoicesOverdue.length,
      lowStock: lowStock.length,
      overdueTasks: overdueTasks.length,
      unreadMsgs: unreadMsgs.length,
      newBookings: newBookings.length,
    },
  })
}
