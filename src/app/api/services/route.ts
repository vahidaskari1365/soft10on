import { NextResponse } from 'next/server'
import { tenantHandler, platformHandler } from '@/lib/tenant'
import { db } from '@/lib/db'
import { vStr, vInt, vEnum } from '@/lib/validation'
import { logAudit } from '@/lib/audit'

const CATEGORIES = ['ترمیمی', 'جراحی', 'زیبایی', 'پیشگیری', 'تشخیص', 'ارتودنسی'] as const

/** مدیریت خدمات کلینیک — مشاهده برای کارکنان؛ مدیریت فقط مدیر */
export const GET = tenantHandler()(async (session, request) => {
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const { searchParams } = new URL(request.url)
  const active = searchParams.get('active')
  const services = await db.service.findMany({
    where: active === '1' ? { active: true } : {},
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ services })
})

export const POST = tenantHandler('ADMIN')(async (session, request) => {

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const name = vStr(body.name, { required: true, min: 2, max: 80, label: 'نام خدمت' })
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 })
  const price = vInt(body.price, { label: 'قیمت', min: 0 })
  if (!price.ok) return NextResponse.json({ error: price.error }, { status: 400 })
  const durationMin = vInt(body.durationMin, { label: 'مدت زمان', min: 5, max: 480 })
  if (!durationMin.ok) return NextResponse.json({ error: durationMin.error }, { status: 400 })
  const category = vEnum(body.category, CATEGORIES, 'دسته‌بندی', true)
  if (!category.ok) return NextResponse.json({ error: category.error }, { status: 400 })
  if (!category.value) return NextResponse.json({ error: 'دسته‌بندی الزامی است' }, { status: 400 })
  const code = vStr(body.code, { label: 'کد خدمت', max: 20 })
  if (!code.ok) return NextResponse.json({ error: code.error }, { status: 400 })
  const commissionPercent = vInt(body.commissionPercent, { label: 'درصد کارانه', min: 0, max: 100 })
  if (!commissionPercent.ok) return NextResponse.json({ error: commissionPercent.error }, { status: 400 })
  const taxPercent = vInt(body.taxPercent, { label: 'مالیات', min: 0, max: 100 })
  if (!taxPercent.ok) return NextResponse.json({ error: taxPercent.error }, { status: 400 })

  if (code.value) {
    const dup = await db.service.findUnique({ where: { code: code.value } })
    if (dup) return NextResponse.json({ error: 'کد خدمت تکراری است' }, { status: 409 })
  }

  const service = await db.service.create({
    data: {
      name: name.value,
      price: price.value,
      durationMin: durationMin.value,
      category: category.value,
      code: code.value || null,
      description: vStr(body.description, { label: 'شرح', max: 300 }).ok ? ((vStr(body.description, { label: 'شرح', max: 300 }) as { ok: true; value: string }).value || null) : null,
      commissionPercent: commissionPercent.value,
      taxPercent: taxPercent.value,
      needsRoom: Boolean(body.needsRoom),
      active: body.active === undefined ? true : Boolean(body.active),
    },
  })
  await logAudit({ userId: session.id, userName: session.fullName, action: 'CREATE', entity: 'Service', entityId: service.id, clinicId: session.clinicId })
  return NextResponse.json({ service }, { status: 201 })
})

export const PATCH = tenantHandler('ADMIN')(async (session, request) => {

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'شناسه لازم است' }, { status: 400 })
  const existing = await db.service.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const data: Record<string, string | number | boolean | null> = {}
  if (body.name !== undefined) {
    const v = vStr(body.name, { required: true, min: 2, max: 80, label: 'نام' })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    data.name = v.value
  }
  if (body.price !== undefined) {
    const v = vInt(body.price, { label: 'قیمت', min: 0 })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    data.price = v.value
  }
  if (body.durationMin !== undefined) {
    const v = vInt(body.durationMin, { label: 'مدت زمان', min: 5, max: 480 })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    data.durationMin = v.value
  }
  if (body.category !== undefined) {
    const v = vEnum(body.category, CATEGORIES, 'دسته‌بندی', true)
    if (!v.ok || !v.value) return NextResponse.json({ error: 'دسته‌بندی نامعتبر است' }, { status: 400 })
    data.category = v.value
  }
  if (body.code !== undefined) {
    const v = vStr(body.code, { label: 'کد', max: 20 })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    if (v.value) {
      const dup = await db.service.findFirst({ where: { code: v.value, id: { not: id } } })
      if (dup) return NextResponse.json({ error: 'کد خدمت تکراری است' }, { status: 409 })
    }
    data.code = v.value || null
  }
  if (body.commissionPercent !== undefined) {
    const v = vInt(body.commissionPercent, { label: 'کارانه', min: 0, max: 100 })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    data.commissionPercent = v.value
  }
  if (body.taxPercent !== undefined) {
    const v = vInt(body.taxPercent, { label: 'مالیات', min: 0, max: 100 })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    data.taxPercent = v.value
  }
  if (body.active !== undefined) data.active = Boolean(body.active)
  if (body.needsRoom !== undefined) data.needsRoom = Boolean(body.needsRoom)
  if (body.description !== undefined) {
    const v = vStr(body.description, { label: 'شرح', max: 300 })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    data.description = v.value || null
  }

  const service = await db.service.update({ where: { id }, data })
  await logAudit({ userId: session.id, userName: session.fullName, action: 'UPDATE', entity: 'Service', entityId: id, clinicId: session.clinicId })
  return NextResponse.json({ service })
})
