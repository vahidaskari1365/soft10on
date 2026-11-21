import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { vStr } from '@/lib/validation'
import { addTimeline } from '@/lib/timeline'
import { logAudit } from '@/lib/audit'

/** نسخه‌های بیمار — بیمار فقط نسخه‌های خودش؛ ثبت فقط پزشک یا مدیر */
export async function GET(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const patientId = searchParams.get('patient') || (session.role === 'PATIENT' ? session.patientId ?? '' : '')
  if (!patientId) return NextResponse.json({ error: 'شناسه بیمار لازم است' }, { status: 400 })
  if (session.role === 'PATIENT' && session.patientId !== patientId)
    return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const prescriptions = await db.prescription.findMany({
    where: { patientId },
    include: { doctor: { select: { id: true, name: true } }, items: true },
    orderBy: { date: 'desc' },
    take: 50,
  })
  return NextResponse.json({ prescriptions })
}

export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role !== 'DOCTOR' && session.role !== 'ADMIN')
    return NextResponse.json({ error: 'صدور نسخه فقط توسط پزشک انجام می‌شود' }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const patientId = typeof body.patientId === 'string' ? body.patientId : ''
  if (!patientId) return NextResponse.json({ error: 'شناسه بیمار لازم است' }, { status: 400 })
  const patient = await db.patient.findUnique({ where: { id: patientId }, select: { id: true, firstName: true, lastName: true } })
  if (!patient) return NextResponse.json({ error: 'بیمار یافت نشد' }, { status: 404 })

  const diagnosis = vStr(body.diagnosis, { label: 'تشخیص', max: 400 })
  if (!diagnosis.ok) return NextResponse.json({ error: diagnosis.error }, { status: 400 })
  const note = vStr(body.note, { label: 'توضیحات', max: 400 })
  if (!note.ok) return NextResponse.json({ error: note.error }, { status: 400 })

  const rawItems = Array.isArray(body.items) ? body.items : []
  const items = (rawItems as Record<string, unknown>[])
    .map((it) => ({
      drug: typeof it.drug === 'string' ? it.drug.trim() : '',
      form: typeof it.form === 'string' ? it.form.trim() || null : null,
      dose: typeof it.dose === 'string' ? it.dose.trim() || null : null,
      frequency: typeof it.frequency === 'string' ? it.frequency.trim() || null : null,
      duration: typeof it.duration === 'string' ? it.duration.trim() || null : null,
      method: typeof it.method === 'string' ? it.method.trim() || null : null,
      note: typeof it.note === 'string' ? it.note.trim() || null : null,
    }))
    .filter((it) => it.drug.length >= 1)
  if (!items.length) return NextResponse.json({ error: 'حداقل یک قلم دارو لازم است' }, { status: 400 })
  if (items.some((it) => it.drug.length > 120)) return NextResponse.json({ error: 'نام دارو حداکثر ۱۲۰ نویسه است' }, { status: 400 })

  // پزشک لاگین‌شده باید به Doctor متصل باشد (مگر مدیر که پزشک را مشخص می‌کند)
  let doctorId = session.doctorId
  if (!doctorId && session.role === 'ADMIN' && typeof body.doctorId === 'string') doctorId = body.doctorId
  if (!doctorId) return NextResponse.json({ error: 'پزشک صادرکننده مشخص نیست' }, { status: 400 })

  const prescription = await db.$transaction(async (tx) => {
    return tx.prescription.create({
      data: {
        patientId,
        doctorId,
        diagnosis: diagnosis.value || null,
        note: note.value || null,
        createdById: session.id,
        items: { create: items },
      },
      include: { doctor: { select: { id: true, name: true } }, items: true },
    })
  })

  await addTimeline(patientId, 'RX', `صدور نسخه توسط ${prescription.doctor?.name ?? 'پزشک'} — ${items.length} قلم دارو`, { refId: prescription.id, actorName: session.fullName, meta: { drugs: items.map((i) => i.drug).slice(0, 8) } })
  await logAudit({ userId: session.id, userName: session.fullName, action: 'CREATE', entity: 'Prescription', entityId: prescription.id, branchId: session.branchId, clinicId: session.clinicId, meta: { items: items.length } })

  return NextResponse.json({ prescription }, { status: 201 })
}
