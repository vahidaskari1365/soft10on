import { NextResponse } from 'next/server'
import { tenantHandler, platformHandler } from '@/lib/tenant'
import { db } from '@/lib/db'
import { vStr, vInt, vEnum } from '@/lib/validation'

const PERIODS = ['MONTHLY', 'YEARLY'] as const

/** پلن‌های اشتراک SaaS — مشاهده برای کارکنان؛ مدیریت فقط مدیر */
export const GET = platformHandler()(async (session, _request) => {
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const plans = await db.plan.findMany({ orderBy: { price: 'asc' }, include: { clinics: { select: { id: true, name: true, isActive: true } } } })
  return NextResponse.json({ plans })
})

export const POST = tenantHandler('ADMIN')(async (session, request) => {

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const name = vStr(body.name, { required: true, min: 2, max: 40, label: 'نام پلن' })
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 })
  const price = vInt(body.price, { label: 'قیمت', min: 0 })
  if (!price.ok) return NextResponse.json({ error: price.error }, { status: 400 })
  const period = vEnum(body.period, PERIODS, 'دوره', true)
  if (!period.ok) return NextResponse.json({ error: period.error }, { status: 400 })
  if (!period.value) return NextResponse.json({ error: 'دوره الزامی است' }, { status: 400 })
  const maxUsers = vInt(body.maxUsers, { label: 'حداکثر کاربران', min: 1, max: 500 })
  if (!maxUsers.ok) return NextResponse.json({ error: maxUsers.error }, { status: 400 })
  const maxBranches = vInt(body.maxBranches, { label: 'حداکثر شعب', min: 1, max: 50 })
  if (!maxBranches.ok) return NextResponse.json({ error: maxBranches.error }, { status: 400 })

  const dup = await db.plan.findUnique({ where: { name: name.value } })
  if (dup) return NextResponse.json({ error: 'پلنی با این نام وجود دارد' }, { status: 409 })

  const plan = await db.plan.create({
    data: {
      name: name.value,
      price: price.value,
      period: period.value,
      maxUsers: maxUsers.value,
      maxBranches: maxBranches.value,
      aiCallsLimit: vInt(body.aiCallsLimit, { label: 'سهمیه AI', min: 0, max: 100000 }).ok ? (vInt(body.aiCallsLimit, { label: 'سهمیه AI', min: 0, max: 100000 }) as { ok: true; value: number }).value : 500,
      storageMb: vInt(body.storageMb, { label: 'فضا', min: 0, max: 1000000 }).ok ? (vInt(body.storageMb, { label: 'فضا', min: 0, max: 1000000 }) as { ok: true; value: number }).value : 512,
      features: (body.features as object) ?? undefined,
    },
  })
  return NextResponse.json({ plan }, { status: 201 })
})

export const PATCH = tenantHandler('ADMIN')(async (session, request) => {

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'شناسه لازم است' }, { status: 400 })
  const plan = await db.plan.findUnique({ where: { id } })
  if (!plan) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const data: Record<string, string | number | boolean | object> = {}
  if (body.price !== undefined) data.price = Math.max(0, Math.round(Number(body.price) || 0))
  if (body.active !== undefined) data.active = Boolean(body.active)
  if (body.maxUsers !== undefined) data.maxUsers = Math.max(1, Math.round(Number(body.maxUsers) || 1))
  if (body.aiCallsLimit !== undefined) data.aiCallsLimit = Math.max(0, Math.round(Number(body.aiCallsLimit) || 0))
  const updated = await db.plan.update({ where: { id }, data: data as { price?: number; active?: boolean; maxUsers?: number; aiCallsLimit?: number } })
  return NextResponse.json({ plan: updated })
})
