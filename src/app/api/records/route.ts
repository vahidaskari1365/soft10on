import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/** پرونده‌ی هوشمند یک بیمار + شناسنامه (حساسیت، بارداری، زمینه) */
export async function GET(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const patientId = searchParams.get('patient') || (session.role === 'PATIENT' ? session.patientId ?? '' : '')
  if (!patientId) return NextResponse.json({ error: 'شناسه بیمار لازم است' }, { status: 400 })
  if (session.role === 'PATIENT' && session.patientId !== patientId) {
    return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  }

  const [patient, records] = await Promise.all([
    db.patient.findUnique({ where: { id: patientId } }),
    db.medicalRecord.findMany({
      where: { patientId },
      orderBy: { date: 'desc' },
      take: 100,
      include: { doctor: { select: { name: true } } },
    }),
  ])
  if (!patient) return NextResponse.json({ error: 'بیمار یافت نشد' }, { status: 404 })

  return NextResponse.json({
    profile: {
      id: patient.id,
      name: `${patient.firstName} ${patient.lastName}`,
      phone: patient.phone,
      birthYear: patient.birthYear,
      allergies: patient.allergies,
      isPregnant: patient.isPregnant,
      chronicNote: patient.chronicNote,
      incompleteTreatment: patient.incompleteTreatment,
    },
    records: records.map((r) => ({
      id: r.id,
      date: r.date.toISOString(),
      type: r.type,
      title: r.title,
      content: r.content,
      aiSummary: r.aiSummary,
      source: r.source,
      doctor: r.doctor?.name ?? null,
    })),
  })
}

/** ثبت سند پرونده — { patientId, type, title, content, doctorId?, source? } */
export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as {
    patientId?: string
    type?: string
    title?: string
    content?: string
    doctorId?: string
    source?: string
  }
  if (!body.patientId || !body.title?.trim() || !body.content?.trim()) {
    return NextResponse.json({ error: 'بیمار، عنوان و محتوا الزامی است' }, { status: 400 })
  }
  const record = await db.medicalRecord.create({
    data: {
      branchId: session.branchId,
      patientId: body.patientId,
      doctorId: body.doctorId || session.doctorId || null,
      date: new Date(),
      type: ['VISIT', 'TEST', 'IMAGING', 'NOTE', 'ALLERGY'].includes(body.type ?? '') ? body.type! : 'NOTE',
      title: body.title.trim(),
      content: body.content.trim(),
      source: ['MANUAL', 'VOICE', 'PHOTO', 'ASSISTANT'].includes(body.source ?? '') ? body.source! : 'MANUAL',
      createdBy: session.id,
    },
    include: { doctor: { select: { name: true } } },
  })
  // اگر سند حساسیت بود، به شناسنامه بیمار هم اضافه شود
  if (record.type === 'ALLERGY') {
    const patient = await db.patient.findUnique({ where: { id: body.patientId }, select: { allergies: true } })
    const list = [patient?.allergies, record.title].filter(Boolean).join('، ')
    await db.patient.update({ where: { id: body.patientId }, data: { allergies: list } })
  }
  return NextResponse.json({ record: { ...record, date: record.date.toISOString() } }, { status: 201 })
}

/** به‌روزرسانی شناسنامه — { patientId, allergies?, isPregnant?, chronicNote? } */
export async function PATCH(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as {
    patientId?: string
    allergies?: string
    isPregnant?: boolean
    chronicNote?: string
  }
  if (!body.patientId) return NextResponse.json({ error: 'شناسه بیمار لازم است' }, { status: 400 })
  const patient = await db.patient.update({
    where: { id: body.patientId },
    data: {
      ...(body.allergies !== undefined ? { allergies: body.allergies.trim() || null } : {}),
      ...(body.isPregnant !== undefined ? { isPregnant: body.isPregnant } : {}),
      ...(body.chronicNote !== undefined ? { chronicNote: body.chronicNote.trim() || null } : {}),
    },
  })
  return NextResponse.json({ ok: true, allergies: patient.allergies, isPregnant: patient.isPregnant, chronicNote: patient.chronicNote })
}
