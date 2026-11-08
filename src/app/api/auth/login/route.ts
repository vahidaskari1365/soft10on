import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/password'
import { setSessionCookie, toSessionUser } from '@/lib/auth'

export async function POST(request: Request) {
  const { username, password } = await request.json().catch(() => ({}) as { username?: string; password?: string })
  if (!username || !password) return NextResponse.json({ error: 'نام کاربری و رمز عبور الزامی است' }, { status: 400 })

  const user = await db.user.findUnique({
    where: { username: String(username).trim() },
    include: { branch: true, doctor: true, patient: true },
  })
  if (!user || !user.active || !verifyPassword(String(password), user.password)) {
    return NextResponse.json({ error: 'نام کاربری یا رمز عبور اشتباه است' }, { status: 401 })
  }

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await setSessionCookie(user.id)
  return NextResponse.json({ user: toSessionUser(user) })
}
