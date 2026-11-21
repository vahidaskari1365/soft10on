import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * پروفایل جامع بیمار (Patient 360):
 * هویت، نوبت‌ها، فاکتورها و پرداخت‌ها، پیام‌ها، پرونده پزشکی و خرید محصولات
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const patient = await db.patient.findUnique({ where: { id } })
  if (!patient) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const [history, sales, invoices, payments, messages, records] = await Promise.all([
    db.appointment.findMany({
      where: { patientId: id },
      include: { service: true, doctor: true },
      orderBy: { start: 'desc' },
      take: 12,
    }),
    db.productSale.findMany({ where: { patientId: id }, include: { product: true }, orderBy: { date: 'desc' }, take: 5 }),
    db.invoice.findMany({
      where: { patientId: id },
      include: { payments: { select: { amount: true, date: true, method: true } } },
      orderBy: { date: 'desc' },
      take: 10,
    }),
    db.payment.findMany({
      where: { patientId: id, direction: 'RECEIVED' },
      orderBy: { date: 'desc' },
      take: 10,
    }),
    db.message.findMany({
      where: { patientId: id },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { id: true, direction: true, channel: true, body: true, createdAt: true, readAt: true, aiGenerated: true },
    }),
    db.medicalRecord.findMany({
      where: { patientId: id },
      include: { doctor: { select: { name: true } } },
      orderBy: { date: 'desc' },
      take: 10,
    }),
  ])

  const visits = history.filter((a) => a.status === 'DONE')
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
  const totalDebt = invoices.reduce((s, inv) => s + (inv.total - inv.payments.reduce((ps, p) => ps + p.amount, 0)), 0)
  const totalDebtPositive = Math.max(0, totalDebt)

  return NextResponse.json({
    patient,
    history,
    sales,
    invoices,
    payments,
    messages,
    records,
    totalSpent: visits.reduce((s, a) => s + a.price, 0),
    totalPaid,
    totalDebt: totalDebtPositive,
    lastVisit: visits[0]?.start ?? null,
  })
}
