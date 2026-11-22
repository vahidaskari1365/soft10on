import { NextResponse } from 'next/server'
import { tenantHandler, platformHandler } from '@/lib/tenant'
import { db } from '@/lib/db'

/** برداشتن از صف / رزرو برای بیمار صف / لغو */
export const PATCH = tenantHandler()(async (session, request, { params }) => {
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as {
    action?: 'offer' | 'book' | 'cancel'
    start?: string
    doctorId?: string
    serviceId?: string
  }

  const item = await db.waitlist.findUnique({ where: { id } })
  if (!item) return NextResponse.json({ error: 'صف یافت نشد' }, { status: 404 })

  if (body.action === 'cancel') {
    await db.waitlist.update({ where: { id }, data: { status: 'CANCELLED' } })
    return NextResponse.json({ ok: true, status: 'CANCELLED' })
  }
  if (body.action === 'offer') {
    await db.waitlist.update({ where: { id }, data: { status: 'OFFERED' } })
    return NextResponse.json({ ok: true, status: 'OFFERED' })
  }

  // book → واقعاً نوبت بساز
  const start = body.start ? new Date(body.start) : null
  if (!start || Number.isNaN(start.getTime())) return NextResponse.json({ error: 'زمان نوبت نامعتبر است' }, { status: 400 })
  const serviceId = body.serviceId
  const doctorId = body.doctorId || item.doctorId
  if (!serviceId || !doctorId) return NextResponse.json({ error: 'خدمت و پزشک لازم است' }, { status: 400 })

  const [service, patient] = await Promise.all([
    db.service.findUnique({ where: { id: serviceId } }),
    db.patient.findUnique({ where: { id: item.patientId } }),
  ])
  if (!service || !patient) return NextResponse.json({ error: 'خدمت یا بیمار یافت نشد' }, { status: 404 })

  const appointment = await db.appointment.create({
    data: {
      branchId: item.branchId ?? session.branchId,
      patientId: item.patientId,
      doctorId,
      serviceId,
      start,
      status: 'CONFIRMED',
      source: 'PANEL',
      price: service.price,
    },
  })
  await db.waitlist.update({ where: { id }, data: { status: 'BOOKED' } })
  return NextResponse.json({ ok: true, appointmentId: appointment.id, status: 'BOOKED' }, { status: 201 })
})
