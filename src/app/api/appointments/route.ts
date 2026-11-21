import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { validateApptTime, doctorHasConflict } from '@/lib/scheduling'

export async function GET(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
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
}

export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
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

  const service = await db.service.findUnique({ where: { id: serviceId } })
  if (!service) return NextResponse.json({ error: 'خدمت یافت نشد' }, { status: 400 })

  // ————— اعتبارسنجی زمان + کنترل تداخل نوبت پزشک —————
  const time = validateApptTime(start)
  if (!time.ok) return NextResponse.json({ error: time.error }, { status: 400 })
  if (await doctorHasConflict(doctorId, time.startMs, service.durationMin)) {
    return NextResponse.json({ error: 'تداخل زمانی: پزشک در این بازه نوبت دیگری دارد' }, { status: 409 })
  }
  const startMs = time.startMs

  const doctor = await db.doctor.findUnique({ where: { id: doctorId } })
  if (!doctor) return NextResponse.json({ error: 'پزشک یافت نشد' }, { status: 400 })

  const appt = await db.appointment.create({
    data: {
      branchId: doctor.branchId,
      patientId: pid,
      doctorId,
      serviceId,
      start: new Date(start),
      status: 'PENDING',
      source: source ?? 'PANEL',
      price: service.price,
      note: note ?? null,
    },
    include: { patient: true, doctor: true, service: true },
  })
  return NextResponse.json({ appointment: appt })
}
