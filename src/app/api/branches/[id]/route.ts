import { NextResponse } from 'next/server'
import { tenantHandler } from '@/lib/tenant'
import { db } from '@/lib/db'

/** ویرایش شعبه — فقط مدیر کل */
export const PATCH = tenantHandler('ADMIN')(async (session, request, { params }) => {
  const { id } = await params

  const body = await request.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = String(body.name).trim()
  if (body.city !== undefined) data.city = String(body.city).trim()
  if (body.address !== undefined) data.address = String(body.address).trim()
  if (body.phone !== undefined) data.phone = String(body.phone).trim()
  if (body.openHour !== undefined) data.openHour = Number(body.openHour) || 9
  if (body.closeHour !== undefined) data.closeHour = Number(body.closeHour) || 19
  if (body.thuCloseHour !== undefined) data.thuCloseHour = body.thuCloseHour ? Number(body.thuCloseHour) : null
  if (body.closedFri !== undefined) data.closedFri = Boolean(body.closedFri)
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive)

  const branch = await db.branch.update({ where: { id }, data })
  return NextResponse.json({ branch })
})

/** تعطیلی (غیرفعال‌سازی) شعبه — فقط مدیر کل */
export const DELETE = tenantHandler('ADMIN')(async (session, request, { params }) => {
  const { id } = await params

  const doctorCount = await db.doctor.count({ where: { branchId: id, active: true } })
  if (doctorCount > 0) {
    return NextResponse.json({ error: `این شعبه ${doctorCount} پزشک فعال دارد؛ اول پزشکان را منتقل کنید` }, { status: 400 })
  }
  const branch = await db.branch.update({ where: { id }, data: { isActive: false } })
  return NextResponse.json({ branch })
})
