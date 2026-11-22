import { NextResponse } from 'next/server'
import { tenantHandler, platformHandler } from '@/lib/tenant'
import { db } from '@/lib/db'
import { vStr, vDate, vEnum } from '@/lib/validation'
import { logAudit } from '@/lib/audit'

const HOLIDAY_TYPES = ['OFFICIAL', 'CLINIC'] as const

/** تعطیلات رسمی و اختصاصی کلینیک — مشاهده برای همه کارکنان، مدیریت با مدیر */
export const GET = tenantHandler()(async (session, request) => {
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const { searchParams } = new URL(request.url)
  const branchId = searchParams.get('branchId') ?? undefined
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const holidays = await db.holiday.findMany({
    where: {
      ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
      ...(from && to ? { date: { gte: new Date(from), lt: new Date(to) } } : {}),
    },
    orderBy: { date: 'asc' },
    include: { branch: { select: { name: true } } },
  })
  return NextResponse.json({ holidays })
})

export const POST = tenantHandler('ADMIN')(async (session, request) => {

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const date = vDate(body.date, 'تاریخ تعطیلی')
  if (!date.ok) return NextResponse.json({ error: date.error }, { status: 400 })
  if (!date.value) return NextResponse.json({ error: 'تاریخ تعطیلی الزامی است' }, { status: 400 })
  const title = vStr(body.title, { required: true, min: 2, max: 80, label: 'عنوان' })
  if (!title.ok) return NextResponse.json({ error: title.error }, { status: 400 })
  const type = vEnum(body.type, HOLIDAY_TYPES, 'نوع تعطیلی')
  if (!type.ok || !type.value) return NextResponse.json({ error: 'نوع تعطیلی نامعتبر است' }, { status: 400 })
  const branchId = typeof body.branchId === 'string' && body.branchId ? body.branchId : null
  if (branchId) {
    const b = await db.branch.findUnique({ where: { id: branchId } })
    if (!b) return NextResponse.json({ error: 'شعبه یافت نشد' }, { status: 400 })
  }

  const holiday = await db.holiday.create({ data: { date: date.value, title: title.value, type: type.value, branchId } })
  await logAudit({ userId: session.id, userName: session.fullName, action: 'CREATE', entity: 'Holiday', entityId: holiday.id, branchId, clinicId: session.clinicId })
  return NextResponse.json({ holiday }, { status: 201 })
})

export const DELETE = tenantHandler('ADMIN')(async (session, request) => {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'شناسه لازم است' }, { status: 400 })
  const holiday = await db.holiday.findUnique({ where: { id } })
  if (!holiday) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  await db.holiday.delete({ where: { id } })
  await logAudit({ userId: session.id, userName: session.fullName, action: 'DELETE', entity: 'Holiday', entityId: id, clinicId: session.clinicId })
  return NextResponse.json({ ok: true })
})
