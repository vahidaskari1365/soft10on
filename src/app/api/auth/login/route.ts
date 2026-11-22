import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/password'
import { setSessionCookie, toSessionUser } from '@/lib/auth'
import { rateLimit, clientIp } from '@/lib/ratelimit'
import { logAudit } from '@/lib/audit'

export async function POST(request: Request) {
  const ip = clientIp(request)
  // محدودیت نرخ ورود: حداکثر ۱۰ تلاش در دقیقه برای هر IP
  const rl = await rateLimit(`login:${ip}`, 10, 60_000)
  if (!rl.ok) {
    await logAudit({ action: 'LOGIN', entity: 'User', result: 'DENIED', ip, meta: { reason: 'rate_limited' } })
    return NextResponse.json({ error: `تلاش‌های زیادی انجام شده؛ ${rl.retryAfterSec} ثانیه دیگر تلاش کنید` }, { status: 429 })
  }

  const { username, password } = await request.json().catch(() => ({}) as { username?: string; password?: string })
  if (!username || !password) return NextResponse.json({ error: 'نام کاربری و رمز عبور الزامی است' }, { status: 400 })

  const user = await db.user.findUnique({
    where: { username: String(username).trim() },
    include: { branch: true, doctor: true, patient: true, clinic: true },
  })
  if (!user || !user.active || !verifyPassword(String(password), user.password)) {
    await logAudit({ action: 'LOGIN', entity: 'User', result: 'FAILED', ip, meta: { username: String(username).slice(0, 40) } })
    return NextResponse.json({ error: 'نام کاربری یا رمز عبور اشتباه است' }, { status: 401 })
  }

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await setSessionCookie(user.id)
  await logAudit({
    userId: user.id,
    userName: user.fullName,
    action: 'LOGIN',
    entity: 'User',
    entityId: user.id,
    branchId: user.branchId,
    clinicId: user.clinicId,
    ip,
  })
  return NextResponse.json({ user: toSessionUser(user) })
}
