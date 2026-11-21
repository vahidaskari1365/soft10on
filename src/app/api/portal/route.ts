import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { formatToman } from '@/lib/format'

/** پرتال بیمار: نوبت‌ها، پرداخت‌ها و فاکتورها، اسناد، نسخه‌ها، طرح درمان، پیام‌ها و اطلاعات من */
export async function GET() {
  const user = await requireRole('PATIENT')
  if (!user) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (!user.patientId) return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const now = new Date()
  const [patient, upcoming, past, sales, branches, documents, prescriptions, plans, invoices, messages] = await Promise.all([
    db.patient.findUnique({ where: { id: user.patientId } }),
    db.appointment.findMany({
      where: { patientId: user.patientId, start: { gte: now }, status: { in: ['REQUESTED', 'PENDING', 'CONFIRMED'] } },
      include: { doctor: true, service: true, branch: true, roomUnit: { select: { id: true, name: true } } },
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
    db.document.findMany({
      where: { patientId: user.patientId },
      select: { id: true, kind: true, title: true, mimeType: true, sizeBytes: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
    db.prescription.findMany({
      where: { patientId: user.patientId },
      include: { doctor: { select: { name: true } }, items: true },
      orderBy: { date: 'desc' },
      take: 15,
    }),
    db.treatmentPlan.findMany({
      where: { patientId: user.patientId },
      include: { doctor: { select: { name: true } }, steps: { include: { service: { select: { name: true, price: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    db.invoice.findMany({
      where: { patientId: user.patientId, status: { in: ['ISSUED', 'PARTIAL', 'PAID'] } },
      include: { payments: { select: { amount: true, date: true, method: true } } },
      orderBy: { date: 'desc' },
      take: 20,
    }),
    db.message.findMany({
      where: { patientId: user.patientId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, direction: true, body: true, createdAt: true, readAt: true },
    }),
  ])
  if (!patient) return NextResponse.json({ error: 'پرونده یافت نشد' }, { status: 404 })

  const totalPaidAppts = past.filter((a) => a.status === 'DONE' && a.paid).reduce((s, a) => s + a.price, 0)
  const totalPaidProducts = sales.reduce((s, x) => s + x.total, 0)
  const totalDebt = invoices.reduce((s, inv) => s + Math.max(0, inv.total - inv.payments.reduce((ps, p) => ps + p.amount, 0)), 0)
  const remaining = past.filter((a) => a.status === 'DONE' && !a.paid).reduce((s, a) => s + (a.price - a.deposit), 0)

  return NextResponse.json({
    profile: {
      patientId: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      phone: patient.phone,
      nationalId: patient.nationalId,
      birthYear: patient.birthYear,
      gender: patient.gender,
      email: patient.email ?? user.email,
      province: patient.province,
      city: patient.city,
      address: patient.address,
      postalCode: patient.postalCode,
      landline: patient.landline,
      fileNo: patient.fileNo,
      incompleteTreatment: patient.incompleteTreatment,
      since: patient.createdAt,
    },
    upcoming,
    past,
    sales,
    totals: {
      paidFa: formatToman(totalPaidAppts + totalPaidProducts),
      remainingFa: formatToman(remaining),
      debtFa: formatToman(totalDebt),
      visits: past.filter((a) => a.status === 'DONE').length,
    },
    branches,
    documents,
    prescriptions,
    treatmentPlans: plans,
    invoices,
    messages,
  })
}
