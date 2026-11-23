import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/password'
import { setSessionCookie, setDemoSessionCookie, toSessionUser } from '@/lib/auth'
import { rateLimit, memoryRateLimit, clientIp } from '@/lib/ratelimit'
import { logAudit } from '@/lib/audit'
import { DEMO_PASSWORD, DEMO_USERS, isDemoAuthEnabled, staticDemoSessionUser } from '@/lib/demo-users'

export async function POST(request: Request) {
  const ip = clientIp(request)

  const { username, password } = await request.json().catch(() => ({}) as { username?: string; password?: string })
  if (!username || !password) return NextResponse.json({ error: 'نام کاربری و رمز عبور الزامی است' }, { status: 400 })

  const uname = String(username).trim()

  // ————— مسیر نمایشی: کلیدهای «ورود سریع» حتی با دیتابیس قطع یا خالی (بدون seed) کار می‌کنند.
  // اول تلاش ورود واقعی — اگر DB بالاست و کاربر seed شده، نشست واقعی با کل داده‌ها صادر می‌شود؛
  // نشست ایستای بدون DB فقط fallback است (فقط در دمو/توسعه).
  if (isDemoAuthEnabled() && DEMO_USERS[uname] && String(password) === DEMO_PASSWORD) {
    // به Store دیتابیسی تکیه نمی‌کند (ممکن است DB قطع باشد) — محدودساز حافظه‌ای ضد سوءاستخدام
    const mem = memoryRateLimit(`demo-login:${ip}`, 30, 60_000)
    if (!mem.ok) {
      return NextResponse.json(
        { error: `تلاش‌های زیادی انجام شده؛ ${mem.retryAfterSec} ثانیه دیگر تلاش کنید` },
        { status: 429 },
      )
    }
    try {
      const real = await db.user.findUnique({
        where: { username: uname },
        include: { branch: true, doctor: true, patient: true, clinic: true },
      })
      if (real) {
        // کاربر واقعی موجود است — حالت واقعی مطلقاً اولویت دارد؛ هیچ fallbackی نقش واقعی را جعل نمی‌کند
        if (real.active && verifyPassword(String(password), real.password)) {
          await db.user.update({ where: { id: real.id }, data: { lastLoginAt: new Date() } })
          await setSessionCookie(real.id)
          await logAudit({
            userId: real.id,
            userName: real.fullName,
            action: 'LOGIN',
            entity: 'User',
            entityId: real.id,
            branchId: real.branchId,
            clinicId: real.clinicId,
            ip,
          })
          return NextResponse.json({ user: toSessionUser(real) })
        }
        await logAudit({ action: 'LOGIN', entity: 'User', result: 'FAILED', ip, meta: { username: uname, demo: true } })
        return NextResponse.json({ error: 'نام کاربری یا رمز عبور اشتباه است' }, { status: 401 })
      }
      // کاربر در DB نیست (بدون seed) → نشست نمایشی ایستا
    } catch {
      /* DB در دسترس نیست → نشست نمایشی ایستا */
    }
    const su = staticDemoSessionUser(uname)
    if (su) {
      await setDemoSessionCookie(uname)
      await logAudit({
        userName: su.fullName,
        action: 'LOGIN',
        entity: 'User',
        result: 'SUCCESS',
        ip,
        meta: { demo: true, username: uname },
      })
      return NextResponse.json({ user: su, demo: true })
    }
  }

  // ————— مسیر عادی
  // دو لایه محدودیت: سقف IP (تحمل NAT دفتری) + سقف هر نام‌کاربری (دفاع brute-force هدفمند)
  const rlIp = await rateLimit(`login:ip:${ip}`, 60, 60_000)
  if (!rlIp.ok) {
    if (rlIp.storeError) {
      // محدودساز DB-backup است؛ خطای store یعنی DB قطع — پیام 429 گمراه‌کننده است
      return NextResponse.json(
        { error: 'دیتابیس در دسترس نیست — با کلیدهای نمایشی می‌توانید بدون دیتابیس وارد شوید', dbDown: true },
        { status: 503 },
      )
    }
    await logAudit({ action: 'LOGIN', entity: 'User', result: 'DENIED', ip, meta: { reason: 'rate_limited' } })
    return NextResponse.json({ error: `تلاش‌های زیادی انجام شده؛ ${rlIp.retryAfterSec} ثانیه دیگر تلاش کنید` }, { status: 429 })
  }

  let user: Awaited<ReturnType<typeof db.user.findUnique>> | null = null
  try {
    user = await db.user.findUnique({
      where: { username: uname },
      include: { branch: true, doctor: true, patient: true, clinic: true },
    })
  } catch {
    // پیام روشن به‌جای 500 مبهم — کاربر می‌داند از کلیدهای نمایشی می‌تواند استفاده کند
    return NextResponse.json(
      { error: 'دیتابیس در دسترس نیست — با کلیدهای نمایشی می‌توانید بدون دیتابیس وارد شوید', dbDown: true },
      { status: 503 },
    )
  }
  if (!user || !user.active || !verifyPassword(String(password), user.password)) {
    // سقف per-user فقط تلاش ناموفق را می‌شمارد — لاگین موفق سهمیه را مصرف نمی‌کند
    const rlFail = await rateLimit(`loginfail:${uname.slice(0, 40)}`, 5, 60_000)
    if (!rlFail.ok) {
      if (rlFail.storeError) {
        return NextResponse.json(
          { error: 'دیتابیس در دسترس نیست — با کلیدهای نمایشی می‌توانید بدون دیتابیس وارد شوید', dbDown: true },
          { status: 503 },
        )
      }
      await logAudit({ action: 'LOGIN', entity: 'User', result: 'DENIED', ip, meta: { reason: 'user_rate_limited', username: uname.slice(0, 40) } })
      return NextResponse.json({ error: `تلاش‌های ناموفق زیادی برای این حساب؛ ${rlFail.retryAfterSec} ثانیه دیگر تلاش کنید` }, { status: 429 })
    }
    // جلوگیری از User Enumeration — پیام یکسان برای نبود کاربر و رمز اشتباه
    await logAudit({ action: 'LOGIN', entity: 'User', result: 'FAILED', ip, meta: { username: uname.slice(0, 40) } })
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
