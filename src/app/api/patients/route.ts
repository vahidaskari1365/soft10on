import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const patients = await db.patient.findMany({ orderBy: { createdAt: 'asc' } })
  const now = new Date()
  const sixMonthsAgo = new Date(now.getTime() - 182 * 86400000)

  const appts = await db.appointment.findMany({
    where: { patientId: { in: patients.map((p) => p.id) } },
    include: { service: true, doctor: true },
    orderBy: { start: 'desc' },
  })

  const list = patients.map((p) => {
    const mine = appts.filter((a) => a.patientId === p.id)
    const visits = mine.filter((a) => a.status === 'DONE')
    const noShows = mine.filter((a) => a.status === 'NO_SHOW').length
    const lastVisit = visits[0]?.start ?? null
    return {
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      phone: p.phone,
      nationalId: p.nationalId,
      incompleteTreatment: p.incompleteTreatment,
      visitCount: visits.length,
      noShowCount: noShows,
      lastVisit,
      signalNoVisit: lastVisit ? lastVisit < sixMonthsAgo : visits.length === 0,
      signalNoShow: noShows >= 1,
      signalIncomplete: p.incompleteTreatment,
      totalSpent: visits.reduce((s, a) => s + a.price, 0),
    }
  })

  return NextResponse.json({ patients: list })
}

/** ثبت بیمار جدید — فقط کارکنان؛ اعتبارسنجی شماره موبایل و جلوگیری از تکرار */
export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as {
    firstName?: string
    lastName?: string
    phone?: string
    nationalId?: string
    birthYear?: number
    notes?: string
  }
  const firstName = (body.firstName ?? '').trim()
  const lastName = (body.lastName ?? '').trim()
  const phone = (body.phone ?? '').trim()
  if (!firstName || !lastName) return NextResponse.json({ error: 'نام و نام خانوادگی الزامی است' }, { status: 400 })
  if (!/^09\d{9}$/.test(phone)) return NextResponse.json({ error: 'شماره موبایل معتبر نیست (مثال: 09123456789)' }, { status: 400 })
  if (body.nationalId && !/^\d{10}$/.test(body.nationalId.trim()))
    return NextResponse.json({ error: 'کد ملی باید ۱۰ رقم باشد' }, { status: 400 })

  const existing = await db.patient.findFirst({ where: { phone } })
  if (existing) return NextResponse.json({ error: 'بیماری با این شماره موبایل قبلاً ثبت شده است' }, { status: 409 })

  const patient = await db.patient.create({
    data: {
      firstName,
      lastName,
      phone,
      nationalId: body.nationalId?.trim() || null,
      birthYear: body.birthYear ?? null,
      notes: body.notes?.trim() || null,
    },
  })
  return NextResponse.json({ patient })
}
