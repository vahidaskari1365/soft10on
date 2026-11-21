import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { validateApptTime, doctorHasConflict } from '@/lib/scheduling'
import { addTimeline } from '@/lib/timeline'
import { logAudit } from '@/lib/audit'

const ALLOWED_STATUS = ['REQUESTED', 'PENDING', 'CONFIRMED', 'ARRIVED', 'IN_VISIT', 'DONE', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED']

/** تغییر وضعیت، تأیید پذیرش، لغو با دلیل و تغییر زمان با ثبت تاریخچه */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const status = typeof body.status === 'string' ? body.status : undefined
  const action = typeof body.action === 'string' ? body.action : undefined

  const appt = await db.appointment.findUnique({
    where: { id },
    include: { patient: true, doctor: true, service: true, roomUnit: true },
  })
  if (!appt) return NextResponse.json({ error: 'نوبت یافت نشد' }, { status: 404 })

  // ————— تغییر زمان (reschedule) —————
  if (action === 'reschedule') {
    const newStart = typeof body.newStart === 'string' ? body.newStart : ''
    const time = validateApptTime(newStart)
    if (!time.ok) return NextResponse.json({ error: time.error }, { status: 400 })
    if (await doctorHasConflict(appt.doctorId, time.startMs, appt.service.durationMin)) {
      return NextResponse.json({ error: 'تداخل زمانی: پزشک در بازه جدید نوبت دیگری دارد' }, { status: 409 })
    }
    const oldStart = appt.start
    const updated = await db.$transaction(async (tx) => {
      const u = await tx.appointment.update({
        where: { id },
        data: { start: new Date(time.startMs), status: 'RESCHEDULED' },
        include: { patient: true, doctor: true, service: true, roomUnit: true },
      })
      await tx.appointmentHistory.create({
        data: {
          appointmentId: id,
          action: 'RESCHEDULE',
          oldStart,
          newStart: u.start,
          oldStatus: appt.status,
          newStatus: 'RESCHEDULED',
          changedByName: session.fullName,
          note: typeof body.note === 'string' ? body.note.slice(0, 200) : null,
        },
      })
      return u
    }, { timeout: 20_000, maxWait: 10_000 })
    await addTimeline(appt.patientId, 'APPOINTMENT', `تغییر زمان نوبت ${appt.service.name} — زمان جدید: ${new Date(time.startMs).toISOString().slice(0, 16).replace('T', ' ')}`, { refId: id, actorName: session.fullName })
    await logAudit({ userId: session.id, userName: session.fullName, action: 'RESCHEDULE', entity: 'Appointment', entityId: id, branchId: appt.branchId, clinicId: session.clinicId, meta: { from: oldStart.toISOString(), to: new Date(time.startMs).toISOString() } })
    return NextResponse.json({ appointment: updated })
  }

  // ————— لغو با ثبت دلیل —————
  if (status === 'CANCELLED' || status === 'NO_SHOW') {
    const cancelReason = typeof body.cancelReason === 'string' ? body.cancelReason.trim().slice(0, 200) : ''
    if (!cancelReason) return NextResponse.json({ error: 'ثبت دلیل لغو / عدم حضور الزامی است' }, { status: 400 })
    const updated = await db.$transaction(async (tx) => {
      const u = await tx.appointment.update({
        where: { id },
        data: { status, cancelReason, paid: false },
        include: { patient: true, doctor: true, service: true, roomUnit: true },
      })
      await tx.appointmentHistory.create({
        data: { appointmentId: id, action: 'CANCEL', oldStatus: appt.status, newStatus: status, changedByName: session.fullName, note: cancelReason },
      })
      return u
    }, { timeout: 20_000, maxWait: 10_000 })
    await addTimeline(appt.patientId, 'APPOINTMENT', `${status === 'CANCELLED' ? 'لغو' : 'عدم حضور'} نوبت ${appt.service.name} — دلیل: ${cancelReason}`, { refId: id, actorName: session.fullName })
    await logAudit({ userId: session.id, userName: session.fullName, action: 'CANCEL', entity: 'Appointment', entityId: id, branchId: appt.branchId, clinicId: session.clinicId, meta: { status, reasonLen: cancelReason.length } })
    return NextResponse.json({ appointment: updated })
  }

  // ————— تغییر وضعیت ساده با اعتبارسنجی گردش کار —————
  if (!status || !ALLOWED_STATUS.includes(status)) {
    return NextResponse.json({ error: 'وضعیت نامعتبر' }, { status: 400 })
  }
  // قواعد گردش: نوبت لغوشده فقط بازگشایی می‌شود؛ DONE قابل رد شدن نیست
  const forbidden: Record<string, string[]> = {
    CANCELLED: ['DONE', 'IN_VISIT', 'ARRIVED'],
    NO_SHOW: ['DONE', 'IN_VISIT'],
  }
  if (forbidden[appt.status]?.includes(status)) {
    return NextResponse.json({ error: `تغییر وضعیت از ${appt.status} به ${status} مجاز نیست` }, { status: 400 })
  }
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.appointment.update({
      where: { id },
      data: { status, paid: status === 'DONE' ? true : undefined },
      include: { patient: true, doctor: true, service: true, roomUnit: true },
    })
    await tx.appointmentHistory.create({
      data: { appointmentId: id, action: 'STATUS', oldStatus: appt.status, newStatus: status, changedByName: session.fullName },
    })
    return u
  })
  await addTimeline(appt.patientId, 'APPOINTMENT', `تغییر وضعیت نوبت ${appt.service.name} — ${status}`, { refId: id, actorName: session.fullName })
  await logAudit({ userId: session.id, userName: session.fullName, action: 'UPDATE', entity: 'Appointment', entityId: id, branchId: appt.branchId, clinicId: session.clinicId, meta: { status } })
  return NextResponse.json({ appointment: updated })
}

