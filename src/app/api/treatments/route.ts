import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { vStr, vInt, vDate } from '@/lib/validation'
import { addTimeline } from '@/lib/timeline'
import { logAudit } from '@/lib/audit'

/** طرح‌های درمان بیمار — بیمار فقط طرح‌های خودش */
export async function GET(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const patientId = searchParams.get('patient') || (session.role === 'PATIENT' ? session.patientId ?? '' : '')
  if (!patientId) return NextResponse.json({ error: 'شناسه بیمار لازم است' }, { status: 400 })
  if (session.role === 'PATIENT' && session.patientId !== patientId)
    return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const plans = await db.treatmentPlan.findMany({
    where: { patientId },
    include: { doctor: { select: { id: true, name: true } }, steps: { include: { service: { select: { name: true, price: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
  return NextResponse.json({ plans })
}

/** ایجاد طرح درمان با مراحل — پزشک یا مدیر */
export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role !== 'DOCTOR' && session.role !== 'ADMIN')
    return NextResponse.json({ error: 'ثبت طرح درمان فقط توسط پزشک انجام می‌شود' }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const patientId = typeof body.patientId === 'string' ? body.patientId : ''
  if (!patientId) return NextResponse.json({ error: 'شناسه بیمار لازم است' }, { status: 400 })
  const patient = await db.patient.findUnique({ where: { id: patientId }, select: { id: true } })
  if (!patient) return NextResponse.json({ error: 'بیمار یافت نشد' }, { status: 404 })

  const title = vStr(body.title, { required: true, min: 2, max: 120, label: 'عنوان درمان' })
  if (!title.ok) return NextResponse.json({ error: title.error }, { status: 400 })
  const note = vStr(body.note, { label: 'توضیحات', max: 400 })
  if (!note.ok) return NextResponse.json({ error: note.error }, { status: 400 })

  let doctorId = session.doctorId
  if (!doctorId && session.role === 'ADMIN' && typeof body.doctorId === 'string') doctorId = body.doctorId
  if (!doctorId) return NextResponse.json({ error: 'پزشک مسئول مشخص نیست' }, { status: 400 })

  const rawSteps = Array.isArray(body.steps) ? body.steps : []
  const steps: { title: string; serviceId: string | null; cost: number; scheduledAt: Date | null }[] = []
  for (const st of rawSteps as Record<string, unknown>[]) {
    const stTitle = vStr(st.title, { required: true, min: 2, max: 120, label: 'عنوان مرحله' })
    if (!stTitle.ok) return NextResponse.json({ error: stTitle.error }, { status: 400 })
    const cost = vInt(st.cost, { label: 'هزینه مرحله', min: 0 })
    if (!cost.ok) return NextResponse.json({ error: cost.error }, { status: 400 })
    let serviceId: string | null = typeof st.serviceId === 'string' && st.serviceId ? st.serviceId : null
    if (serviceId) {
      const svc = await db.service.findUnique({ where: { id: serviceId } })
      if (!svc) return NextResponse.json({ error: 'خدمت انتخابی مرحله یافت نشد' }, { status: 400 })
    }
    const sched = vDate(st.scheduledAt, 'زمان‌بندی مرحله')
    if (!sched.ok) return NextResponse.json({ error: sched.error }, { status: 400 })
    steps.push({ title: stTitle.value, serviceId, cost: cost.value, scheduledAt: sched.value })
  }
  if (!steps.length) return NextResponse.json({ error: 'حداقل یک مرحله درمان لازم است' }, { status: 400 })

  const plan = await db.treatmentPlan.create({
    data: {
      patientId,
      doctorId,
      title: title.value,
      note: note.value || null,
      createdById: session.id,
      steps: { create: steps.map((st) => ({ title: st.title, serviceId: st.serviceId, cost: st.cost, scheduledAt: st.scheduledAt })) },
    },
    include: { doctor: { select: { id: true, name: true } }, steps: { include: { service: { select: { name: true, price: true } } } } },
  })

  const total = plan.steps.reduce((s, st) => s + st.cost, 0)
  await addTimeline(patientId, 'TREATMENT', `ثبت طرح درمان «${plan.title}» — ${plan.steps.length} مرحله، جمع ${total} تومان`, { refId: plan.id, actorName: session.fullName })
  await logAudit({ userId: session.id, userName: session.fullName, action: 'CREATE', entity: 'TreatmentPlan', entityId: plan.id, branchId: session.branchId, clinicId: session.clinicId, meta: { steps: plan.steps.length, total } })

  return NextResponse.json({ plan }, { status: 201 })
}

/** به‌روزرسانی وضعیت طرح یا مرحله — پزشک یا مدیر */
export async function PATCH(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role !== 'DOCTOR' && session.role !== 'ADMIN')
    return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const planId = typeof body.planId === 'string' ? body.planId : ''
  const stepId = typeof body.stepId === 'string' ? body.stepId : null
  if (!planId) return NextResponse.json({ error: 'شناسه طرح لازم است' }, { status: 400 })
  const plan = await db.treatmentPlan.findUnique({ where: { id: planId }, include: { steps: true, doctor: true } })
  if (!plan) return NextResponse.json({ error: 'طرح یافت نشد' }, { status: 404 })

  if (stepId) {
    // تغییر وضعیت یک مرحله
    const step = plan.steps.find((s) => s.id === stepId)
    if (!step) return NextResponse.json({ error: 'مرحله یافت نشد' }, { status: 404 })
    const status = typeof body.status === 'string' ? body.status : ''
    if (!['PENDING', 'DONE', 'CANCELLED'].includes(status)) return NextResponse.json({ error: 'وضعیت مرحله نامعتبر است' }, { status: 400 })
    const nextSession = vDate(body.nextSessionAt, 'جلسه بعدی')
    if (!nextSession.ok) return NextResponse.json({ error: nextSession.error }, { status: 400 })
    await db.treatmentPlanStep.update({
      where: { id: stepId },
      data: { status, doneAt: status === 'DONE' ? new Date() : null, nextSessionAt: nextSession.value },
    })
    if (status === 'DONE') {
      const remaining = (await db.treatmentPlanStep.findMany({ where: { planId, id: { not: stepId } } })).filter((s) => s.status !== 'DONE' && s.status !== 'CANCELLED')
      if (!remaining.length) await db.treatmentPlan.update({ where: { id: planId }, data: { status: 'COMPLETED' } })
    }
    await addTimeline(plan.patientId, 'TREATMENT', `مرحله «${step.title}» طرح «${plan.title}» — ${status === 'DONE' ? 'انجام شد' : status === 'CANCELLED' ? 'لغو شد' : 'در انتظار'}`, { refId: planId, actorName: session.fullName })
    await logAudit({ userId: session.id, userName: session.fullName, action: 'UPDATE', entity: 'TreatmentPlanStep', entityId: stepId, clinicId: session.clinicId, meta: { status } })
  } else {
    const status = typeof body.status === 'string' ? body.status : ''
    if (!['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(status)) return NextResponse.json({ error: 'وضعیت طرح نامعتبر است' }, { status: 400 })
    await db.treatmentPlan.update({ where: { id: planId }, data: { status } })
    await addTimeline(plan.patientId, 'TREATMENT', `وضعیت طرح «${plan.title}» — ${status}`, { refId: planId, actorName: session.fullName })
    await logAudit({ userId: session.id, userName: session.fullName, action: 'UPDATE', entity: 'TreatmentPlan', entityId: planId, clinicId: session.clinicId, meta: { status } })
  }

  const updated = await db.treatmentPlan.findUnique({ where: { id: planId }, include: { steps: { include: { service: { select: { name: true, price: true } } } }, doctor: { select: { id: true, name: true } } } })
  return NextResponse.json({ plan: updated })
}
