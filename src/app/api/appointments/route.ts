import { NextResponse } from 'next/server'
import { tenantHandler, platformHandler } from '@/lib/tenant'
import { db } from '@/lib/db'
import { validateApptTime, doctorHasConflict, doctorHasConflictTx } from '@/lib/scheduling'
import { addTimeline } from '@/lib/timeline'
import { logAudit } from '@/lib/audit'

export const GET = tenantHandler()(async (session, request) => {
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')

  if (date) {
    const start = new Date(`${date}T00:00:00.000Z`)
    const end = new Date(start.getTime() + 86400000)
    const appts = await db.appointment.findMany({
      where: { start: { gte: start, lt: end } },
      include: { patient: true, doctor: true, service: true },
      orderBy: { start: 'asc' },
    })
    return NextResponse.json({ appointments: appts })
  }

  // upcoming week
  const now = new Date()
  const end = new Date(now.getTime() + 7 * 86400000)
  const appts = await db.appointment.findMany({
    where: { start: { gte: now, lt: end }, status: { in: ['PENDING', 'CONFIRMED'] } },
    include: { patient: true, doctor: true, service: true },
    orderBy: { start: 'asc' },
  })
  return NextResponse.json({ appointments: appts })
})

export const POST = tenantHandler()(async (session, request) => {
  const body = await request.json()
  const { patientId, newPatient, doctorId, serviceId, start, source, note } = body as {
    patientId?: string
    newPatient?: { firstName: string; lastName: string; phone: string }
    doctorId: string
    serviceId: string
    start: string
    source?: string
    note?: string
  }
  if (!doctorId || !serviceId || !start) {
    return NextResponse.json({ error: 'اطلاعات ناقص است' }, { status: 400 })
  }

  let pid = patientId
  if (!pid && newPatient?.phone) {
    const existing = await db.patient.findFirst({ where: { phone: newPatient.phone } })
    if (existing) {
      pid = existing.id
    } else {
      const created = await db.patient.create({
        data: { firstName: newPatient.firstName || 'بیمار', lastName: newPatient.lastName || 'جدید', phone: newPatient.phone },
      })
      pid = created.id
    }
  }
  if (!pid) return NextResponse.json({ error: 'بیمار مشخص نیست' }, { status: 400 })
  // findFirst با scope خودکار — بیمار کلینیک دیگر قابل ارجاع نیست
  const patientRec = await db.patient.findFirst({ where: { id: pid }, select: { id: true } })
  if (!patientRec) return NextResponse.json({ error: 'بیمار یافت نشد' }, { status: 404 })

  const service = await db.service.findFirst({ where: { id: serviceId } })
  if (!service) return NextResponse.json({ error: 'خدمت یافت نشد' }, { status: 400 })

  // ————— اعتبارسنجی زمان + کنترل تداخل نوبت پزشک —————
  const time = validateApptTime(start)
  if (!time.ok) return NextResponse.json({ error: time.error }, { status: 400 })
  if (await doctorHasConflict(doctorId, time.startMs, service.durationMin)) {
    return NextResponse.json({ error: 'تداخل زمانی: پزشک در این بازه نوبت دیگری دارد' }, { status: 409 })
  }
  const startMs = time.startMs
  const startDt = new Date(startMs)

  // ————— بررسی برنامه کاری شعبه و تعطیلات —————
  // findFirst با scope رابطه‌ای شعبه→کلینیک — پزشک کلینیک دیگر قابل ارجاع نیست
  const doctorRec = await db.doctor.findFirst({ where: { id: doctorId }, include: { branch: true } })
  const branchRec = doctorRec?.branch
  if (branchRec) {
    const isFri = startDt.getUTCDay() === 5
    const hour = startDt.getUTCHours() + startDt.getUTCMinutes() / 60
    if (branchRec.closedFri && isFri) {
      return NextResponse.json({ error: 'شعبه در روز جمعه تعطیل است' }, { status: 400 })
    }
    const closeH = isFri ? (branchRec.thuCloseHour ?? branchRec.closeHour) : branchRec.closeHour
    const endHour = hour + Math.max(service.durationMin, 15) / 60
    if (hour < branchRec.openHour || endHour > closeH + 1) {
      return NextResponse.json({ error: `ساعت نوبت خارج از ساعات کاری شعبه (${branchRec.openHour} تا ${closeH}) است` }, { status: 400 })
    }
    const dayStart = new Date(Date.UTC(startDt.getUTCFullYear(), startDt.getUTCMonth(), startDt.getUTCDate()))
    const holiday = await db.holiday.findFirst({
      where: { OR: [{ branchId: branchRec.id }, { branchId: null }], date: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) } },
    })
    if (holiday) {
      return NextResponse.json({ error: `این روز تعطیل است: ${holiday.title}` }, { status: 400 })
    }
  }

  // ————— کنترل تداخل اتاق/یونیت —————
  const bodyTyped = body as { roomUnitId?: string; reason?: string; deposit?: number }
  const roomUnitId = bodyTyped.roomUnitId || null
  if (roomUnitId) {
    // findFirst با scope خودکار — اتاق کلینیک دیگر قابل ارجاع نیست
    const room = await db.roomUnit.findFirst({ where: { id: roomUnitId } })
    if (!room) return NextResponse.json({ error: 'اتاق یا یونیت یافت نشد' }, { status: 400 })
    if (!room.active) return NextResponse.json({ error: 'این اتاق غیرفعال است' }, { status: 400 })
    if (doctorRec && room.branchId !== doctorRec.branchId) {
      return NextResponse.json({ error: 'اتاق انتخابی متعلق به شعبهٔ پزشک نیست' }, { status: 400 })
    }
    const endMs = startMs + Math.max(service.durationMin, 15) * 60_000
    const roomCands = await db.appointment.findMany({
      where: { roomUnitId, status: { in: ['REQUESTED', 'PENDING', 'CONFIRMED', 'ARRIVED', 'IN_VISIT', 'DONE'] }, start: { gte: new Date(startMs - 4 * 3_600_000), lt: new Date(endMs + 4 * 3_600_000) } },
      include: { service: { select: { durationMin: true } } },
    })
    const roomOverlap = roomCands.some((c) => {
      const cs = c.start.getTime()
      const ce = cs + Math.max(c.service.durationMin, 15) * 60_000
      return startMs < ce && endMs > cs
    })
    if (roomOverlap) {
      return NextResponse.json({ error: 'تداخل زمانی: این اتاق در بازه انتخابی نوبت دیگری دارد' }, { status: 409 })
    }
  }
  const deposit = Math.max(0, Math.round(Number(bodyTyped.deposit ?? 0) || 0))
  if (!Number.isFinite(deposit) || deposit < 0) return NextResponse.json({ error: 'مبلغ بیعانه نامعتبر است' }, { status: 400 })

  const doctor = await db.doctor.findFirst({ where: { id: doctorId } })
  if (!doctor) return NextResponse.json({ error: 'پزشک یافت نشد' }, { status: 400 })

  // ————— ثبت اتمیک: قفل ردیف پزشک (+ اتاق) → بازبینی تداخل داخل قفل → ثبت
  // دو درخواست هم‌زمان برای یک زمان فقط یکی موفق می‌شود؛ بررسی قبل از Insert کافی نیست
  const durationMin = Math.max(service.durationMin, 15)
  const endMs = startMs + durationMin * 60_000
  const appt = await db
    .$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Doctor" WHERE id = ${doctorId} FOR UPDATE`
      if (roomUnitId) await tx.$queryRaw`SELECT id FROM "RoomUnit" WHERE id = ${roomUnitId} FOR UPDATE`
      if (await doctorHasConflictTx(tx, doctorId, startMs, durationMin)) throw new Error('SLOT_TAKEN')
      if (roomUnitId) {
        const roomCands = await tx.appointment.findMany({
          where: { roomUnitId, status: { in: ['REQUESTED', 'PENDING', 'CONFIRMED', 'ARRIVED', 'IN_VISIT', 'DONE'] }, start: { gte: new Date(startMs - 4 * 3_600_000), lt: new Date(endMs + 4 * 3_600_000) } },
          include: { service: { select: { durationMin: true } } },
        })
        const roomOverlap = roomCands.some((c) => {
          const cs = c.start.getTime()
          const ce = cs + Math.max(c.service.durationMin, 15) * 60_000
          return startMs < ce && endMs > cs
        })
        if (roomOverlap) throw new Error('ROOM_TAKEN')
      }
      return tx.appointment.create({
        data: {
          clinicId: session.clinicId,
          branchId: doctor.branchId,
          patientId: pid,
          doctorId,
          serviceId,
          start: new Date(startMs),
          status: 'PENDING',
          source: source ?? 'PANEL',
          price: service.price,
          deposit,
          note: note ?? null,
          reason: bodyTyped.reason?.trim() || null,
          roomUnitId,
          reminderSent: 'PENDING',
        },
        include: { patient: true, doctor: true, service: true, roomUnit: true },
      })
    })
    .catch((e: unknown) => {
      if (e instanceof Error && (e.message === 'SLOT_TAKEN' || e.message === 'ROOM_TAKEN')) return null
      throw e
    })
  if (!appt) return NextResponse.json({ error: 'تداخل زمانی: این بازه هم‌اکنون رزرو شد' }, { status: 409 })

  await db.appointmentHistory.create({
    data: { appointmentId: appt.id, action: 'CREATE', newStart: appt.start, newStatus: appt.status, changedByName: session.fullName },
  })
  await addTimeline(pid, 'APPOINTMENT', `ثبت نوبت ${service.name} با ${doctor.name} — ${new Date(startMs).toISOString().slice(0, 16).replace('T', ' ')}`, { refId: appt.id, actorName: session.fullName })
  await logAudit({ userId: session.id, userName: session.fullName, action: 'CREATE', entity: 'Appointment', entityId: appt.id, branchId: appt.branchId, clinicId: session.clinicId })

  return NextResponse.json({ appointment: appt }, { status: 201 })
})
