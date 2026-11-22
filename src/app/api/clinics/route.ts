import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { platformHandler } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'

/** مدیریت کلینیک‌های پلتفرم (SaaS) — فقط مدیر کل سیستم */
export const GET = platformHandler()(async () => {
  const clinics = await db.clinic.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      plan: { select: { id: true, name: true, price: true, period: true } },
      branches: { select: { id: true, name: true, isActive: true } },
      users: { select: { id: true, role: true, active: true } },
    },
  })
  const plans = await db.plan.findMany({ orderBy: { price: 'asc' } })
  return NextResponse.json({
    clinics: clinics.map((c) => ({
      id: c.id,
      name: c.name,
      legalName: c.legalName,
      nationalId: c.nationalId,
      ownerName: c.ownerName,
      contactPhone: c.contactPhone,
      email: c.email,
      isActive: c.isActive,
      plan: c.plan,
      planStartsAt: c.planStartsAt,
      planEndsAt: c.planEndsAt,
      branchCount: c.branches.length,
      userCount: c.users.length,
      activeUserCount: c.users.filter((u) => u.active).length,
      createdAt: c.createdAt,
    })),
    plans,
  })
})

/** ثبت کلینیک جدید */
export const POST = platformHandler()(async (session, request) => {

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name.length < 2) return NextResponse.json({ error: 'نام کلینیک الزامی است' }, { status: 400 })
  if (body.nationalId && !/^\d{10,11}$/.test(String(body.nationalId).trim()))
    return NextResponse.json({ error: 'شناسه ملی باید ۱۰ یا ۱۱ رقم باشد' }, { status: 400 })

  const exists = await db.clinic.findUnique({ where: { name } })
  if (exists) return NextResponse.json({ error: 'کلینیکی با این نام قبلاً ثبت شده است' }, { status: 409 })

  const clinic = await db.clinic.create({
    data: {
      name,
      legalName: typeof body.legalName === 'string' ? body.legalName.trim() || null : null,
      nationalId: typeof body.nationalId === 'string' ? body.nationalId.trim() || null : null,
      ownerName: typeof body.ownerName === 'string' ? body.ownerName.trim() || null : null,
      contactPhone: typeof body.contactPhone === 'string' ? body.contactPhone.trim() || null : null,
      email: typeof body.email === 'string' ? body.email.trim() || null : null,
    },
  })
  await logAudit({ userId: session.id, userName: session.fullName, action: 'CREATE', entity: 'Clinic', entityId: clinic.id, branchId: null, clinicId: clinic.id, meta: { name } })
  return NextResponse.json({ clinic }, { status: 201 })
})

/** ویرایش کلینیک — تخصیص/تغییر پلن، فعال/تعلیق */
export const PATCH = platformHandler()(async (session, request) => {

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'شناسه کلینیک لازم است' }, { status: 400 })
  const clinic = await db.clinic.findUnique({ where: { id } })
  if (!clinic) return NextResponse.json({ error: 'کلینیک یافت نشد' }, { status: 404 })

  const data: Record<string, string | boolean | Date | null> = {}
  if (typeof body.name === 'string' && body.name.trim().length >= 2) data.name = body.name.trim()
  if (typeof body.ownerName === 'string') data.ownerName = body.ownerName.trim() || null
  if (typeof body.contactPhone === 'string') data.contactPhone = body.contactPhone.trim() || null
  if (typeof body.email === 'string') data.email = body.email.trim() || null
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive
  if (typeof body.planId === 'string') {
    if (body.planId) {
      const plan = await db.plan.findUnique({ where: { id: body.planId } })
      if (!plan) return NextResponse.json({ error: 'پلن یافت نشد' }, { status: 404 })
      data.planId = plan.id
      data.planStartsAt = new Date()
      data.planEndsAt = new Date(Date.now() + (plan.period === 'YEARLY' ? 365 : 30) * 86_400_000)
    } else {
      data.planId = null
      data.planStartsAt = null
      data.planEndsAt = null
    }
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'فیلدی برای ویرایش ارسال نشده' }, { status: 400 })

  const updated = await db.clinic.update({ where: { id }, data })
  await logAudit({ userId: session.id, userName: session.fullName, action: 'UPDATE', entity: 'Clinic', entityId: id, branchId: null, clinicId: id, meta: { keys: Object.keys(data) } })
  return NextResponse.json({ clinic: updated })
})
