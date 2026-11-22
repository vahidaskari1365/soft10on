import { NextResponse } from 'next/server'
import { tenantHandler } from '@/lib/tenant'
import { db } from '@/lib/db'
import { vStr, vPhone } from '@/lib/validation'
import { addTimeline } from '@/lib/timeline'
import { logAudit } from '@/lib/audit'

/** مدیریت تماس اضطراری بیمار — کارکنان؛ بیمار فقط برای پرونده خودش (مشاهده و ویرایش خودش) */
export const GET = tenantHandler()(async (session, request, { params }) => {
  const { id } = await params
  if (session.role === 'PATIENT' && session.patientId !== id)
    return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const contacts = await db.emergencyContact.findMany({ where: { patientId: id }, orderBy: { createdAt: 'asc' } })
  return NextResponse.json({ contacts })
})

export const POST = tenantHandler()(async (session, request, { params }) => {
  const { id } = await params

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const name = vStr(body.name, { required: true, min: 2, max: 80, label: 'نام تماس اضطراری' })
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 })
  const relation = vStr(body.relation, { required: true, max: 40, label: 'نسبت' })
  if (!relation.ok) return NextResponse.json({ error: relation.error }, { status: 400 })
  const phone = vPhone(body.phone, 'شماره تماس', true)
  if (!phone.ok) return NextResponse.json({ error: phone.error }, { status: 400 })
  const note = vStr(body.note, { label: 'توضیحات', max: 200 })
  if (!note.ok) return NextResponse.json({ error: note.error }, { status: 400 })

  const patient = await db.patient.findUnique({ where: { id }, select: { id: true } })
  if (!patient) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const contact = await db.emergencyContact.create({
    data: { patientId: id, name: name.value, relation: relation.value, phone: phone.value, note: note.value || null },
  })

  await addTimeline(id, 'PATIENT_UPDATED', `ثبت تماس اضطراری — ${name.value} (${relation.value})`, { refId: contact.id, actorName: session.fullName })
  await logAudit({ userId: session.id, userName: session.fullName, action: 'CREATE', entity: 'EmergencyContact', entityId: contact.id, branchId: session.branchId, clinicId: session.clinicId })

  return NextResponse.json({ contact }, { status: 201 })
})

export const DELETE = tenantHandler()(async (session, request, { params }) => {
  const { id } = await params

  const { searchParams } = new URL(request.url)
  const contactId = searchParams.get('contactId')
  if (!contactId) return NextResponse.json({ error: 'شناسه تماس لازم است' }, { status: 400 })

  const contact = await db.emergencyContact.findFirst({ where: { id: contactId, patientId: id } })
  if (!contact) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  await db.emergencyContact.delete({ where: { id: contactId } })
  await logAudit({ userId: session.id, userName: session.fullName, action: 'DELETE', entity: 'EmergencyContact', entityId: contactId, branchId: session.branchId, clinicId: session.clinicId })
  return NextResponse.json({ ok: true })
})
