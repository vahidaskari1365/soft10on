import { NextResponse } from 'next/server'
import { tenantHandler, platformHandler } from '@/lib/tenant'
import { db } from '@/lib/db'
import { revokeAllSessions } from '@/lib/auth'
import { hashPassword } from '@/lib/password'

/** ویرایش کاربر (فعال/غیرفعال، تغییر شعبه، تغییر رمز) — فقط مدیر کل */
export const PATCH = tenantHandler('ADMIN')(async (user, request, { params }) => {
  const { id } = await params

  const body = await request.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (body.fullName !== undefined) data.fullName = String(body.fullName).trim()
  if (body.phone !== undefined) data.phone = body.phone ? String(body.phone) : null
  if (body.email !== undefined) data.email = body.email ? String(body.email) : null
  if (body.branchId !== undefined) data.branchId = body.branchId ? String(body.branchId) : null
  if (body.active !== undefined) data.active = Boolean(body.active)
  // غیرفعال‌سازی کاربر → همهٔ نشست‌های او فوراً باطل می‌شود
  // فیلدهای تکمیلی پرسنلی
  if (body.nationalId !== undefined) data.nationalId = body.nationalId ? String(body.nationalId).trim() : null
  if (body.jobTitle !== undefined) data.jobTitle = body.jobTitle ? String(body.jobTitle).trim().slice(0, 60) : null
  if (body.hireDate !== undefined) {
    const d = body.hireDate ? new Date(String(body.hireDate)) : null
    if (d && isNaN(d.getTime())) return NextResponse.json({ error: 'تاریخ استخدام نامعتبر است' }, { status: 400 })
    data.hireDate = d
  }
  if (body.contractType !== undefined && ['FULL_TIME', 'PART_TIME', 'CONTRACT'].includes(String(body.contractType))) {
    data.contractType = String(body.contractType)
  }
  if (body.baseSalary !== undefined) data.baseSalary = Math.max(0, Math.round(Number(body.baseSalary) || 0))
  if (body.commissionPercent !== undefined) {
    const cp = Number(body.commissionPercent)
    if (!Number.isFinite(cp) || cp < 0 || cp > 100) return NextResponse.json({ error: 'درصد کارانه باید بین ۰ تا ۱۰۰ باشد' }, { status: 400 })
    data.commissionPercent = cp
  }
  if (body.workHours !== undefined) data.workHours = body.workHours ? String(body.workHours).trim().slice(0, 120) : null
  if (body.password) {
    const pass = String(body.password).trim()
    if (pass.length < 6) return NextResponse.json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' }, { status: 400 })
    data.password = hashPassword(pass)
  }

  const updated = await db.user.update({ where: { id }, data })
  if (data.active === false) await revokeAllSessions(updated.id)
  return NextResponse.json({ user: { id: updated.id, username: updated.username, active: updated.active } })
})
