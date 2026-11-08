import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { formatToman } from '@/lib/format'

/** پرتال بیمار: نوبت‌های من، پرداخت‌های من، اطلاعات من */
export async function GET() {
  const user = await requireRole('PATIENT')
  if (!user || !user.patientId) return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const now = new Date()
  const [patient, upcoming, past, sales, branches] = await Promise.all([
    db.patient.findUnique({ where: { id: user.patientId } }),
    db.appointment.findMany({
      where: { patientId: user.patientId, start: { gte: now }, status: { in: ['PENDING', 'CONFIRMED'] } },
      include: { doctor: true, service: true, branch: true },
      orderBy: { start: 'asc' },
    }),
    db.appointment.findMany({
      where: { patientId: user.patientId, status: { in: ['DONE', 'CANCELLED', 'NO_SHOW'] } },
      include: { doctor: true, service: true, branch: true },
      orderBy: { start: 'desc' },
      take: 20,
    }),
    db.productSale.findMany({
      where: { patientId: user.patientId },
      include: { product: true },
      orderBy: { date: 'desc' },
      take: 10,
    }),
    db.branch.findMany({ where: { isActive: true }, select: { id: true, name: true, city: true, address: true, phone: true, openHour: true, closeHour: true } }),
  ])
  if (!patient) return NextResponse.json({ error: 'پرونده یافت نشد' }, { status: 404 })

  const totalPaidAppts = past.filter((a) => a.status === 'DONE' && a.paid).reduce((s, a) => s + a.price, 0)
  const totalPaidProducts = sales.reduce((s, x) => s + x.total, 0)
  const remaining = past.filter((a) => a.status === 'DONE' && !a.paid).reduce((s, a) => s + (a.price - a.deposit), 0)

  return NextResponse.json({
    profile: {
      patientId: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      phone: patient.phone,
      nationalId: patient.nationalId,
      birthYear: patient.birthYear,
      incompleteTreatment: patient.incompleteTreatment,
      email: user.email,
      since: patient.createdAt,
    },
    upcoming,
    past,
    sales,
    totals: {
      paidFa: formatToman(totalPaidAppts + totalPaidProducts),
      remainingFa: formatToman(remaining),
      visits: past.filter((a) => a.status === 'DONE').length,
    },
    branches,
  })
}
