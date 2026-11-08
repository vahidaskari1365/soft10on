import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { hashPassword } from '@/lib/password'

/** ویرایش کاربر (فعال/غیرفعال، تغییر شعبه، تغییر رمز) — فقط مدیر کل */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || user.role !== 'ADMIN') return NextResponse.json({ error: 'فقط مدیر کل مجاز است' }, { status: 403 })
  const { id } = await params

  const body = await request.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (body.fullName !== undefined) data.fullName = String(body.fullName).trim()
  if (body.phone !== undefined) data.phone = body.phone ? String(body.phone) : null
  if (body.email !== undefined) data.email = body.email ? String(body.email) : null
  if (body.branchId !== undefined) data.branchId = body.branchId ? String(body.branchId) : null
  if (body.active !== undefined) data.active = Boolean(body.active)
  if (body.password) {
    const pass = String(body.password).trim()
    if (pass.length < 6) return NextResponse.json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' }, { status: 400 })
    data.password = hashPassword(pass)
  }

  const updated = await db.user.update({ where: { id }, data })
  return NextResponse.json({ user: { id: updated.id, username: updated.username, active: updated.active } })
}
