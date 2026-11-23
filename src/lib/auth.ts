import { cookies } from 'next/headers'
import { createHmac, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'
import { cleanEnvValue } from '@/lib/env-value'
import { tenantCtxFromUser } from './tenant-als'
import { demoUserId, isDemoAuthEnabled, staticDemoSessionUser } from './demo-users'

const COOKIE = 'sina_session'
const MAX_AGE = 60 * 60 * 24 * 30 // ۳۰ روز

const isProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'

/**
 * Secret نشست — فقط از متغیر محیطی.
 * Production بدون AUTH_SECRET (حداقل ۳۲ کاراکتر) باید امن متوقف شود؛
 * secret پیش‌فرض ثابت وجود ندارد. fallback فقط برای توسعه محلی است.
 */
function getSecret(): string {
  // مقدار paste شده در پنل ممکن است کل خط یا داخل نقل‌قول باشد — پاک‌سازی و بازنویسی
  const raw = process.env.AUTH_SECRET ?? ''
  const s = cleanEnvValue(raw, 'AUTH_SECRET')
  if (s !== raw) process.env.AUTH_SECRET = s
  if (s && s.length >= 32) return s
  if (isProduction) {
    throw new Error(
      'CONFIGURATION ERROR: AUTH_SECRET environment variable (min 32 chars) is required in production. ' +
        'Set it in the hosting provider before deploying.'
    )
  }
  return 'tenon-dev-only-fallback-secret—FORBIDDEN-IN-PRODUCTION'
}

export type SessionUser = {
  id: string
  username: string
  fullName: string
  role: string // SUPER_ADMIN | ADMIN | MANAGER | RECEPTIONIST | DOCTOR | PATIENT
  phone: string | null
  email: string | null
  branchId: string | null
  branch: { id: string; name: string; code: string; city: string } | null
  clinicId: string | null
  doctorId: string | null
  doctorName: string | null
  patientId: string | null
  patientName: string | null
}

/** HMAC-SHA256 با secret محیطی */
function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url')
}

/**
 * توکن نشست: userId.tokenVersion.issuedAtMs.signature
 * tokenVersion در DB نگهداری می‌شود؛ افزایش آن (تغییر رمز، غیرفعال‌سازی،
 * خروج از همه دستگاه‌ها) همهٔ توکن‌های قبلی را بی‌اعتبار می‌کند (Revocation).
 */
export function makeToken(userId: string, tokenVersion: number): string {
  const payload = `${userId}.${tokenVersion}.${Date.now()}`
  return `${payload}.${sign(payload)}`
}

function parseToken(token: string): { userId: string; ver: number } | null {
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [userId, ver, issuedAt, sig] = parts
  const payload = `${userId}.${ver}.${issuedAt}`
  const expected = sign(payload)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  const issued = Number(issuedAt)
  const version = Number(ver)
  if (!Number.isFinite(issued) || issued <= 0 || Date.now() - issued > MAX_AGE * 1000) return null
  if (!Number.isFinite(version) || version < 1) return null
  return { userId, ver: version }
}

export function toSessionUser(u: {
  id: string
  username: string
  fullName: string
  role: string
  phone: string | null
  email: string | null
  branchId: string | null
  branch?: { id: string; name: string; code: string; city: string; clinicId?: string | null } | null
  clinicId: string | null
  doctorId: string | null
  doctor?: { name: string } | null
  patientId: string | null
  patient?: { firstName: string; lastName: string } | null
}): SessionUser {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    phone: u.phone,
    email: u.email,
    branchId: u.branchId,
    branch: u.branch ? { id: u.branch.id, name: u.branch.name, code: u.branch.code, city: u.branch.city } : null,
    clinicId: u.clinicId ?? u.branch?.clinicId ?? null,
    doctorId: u.doctorId,
    doctorName: u.doctor?.name ?? null,
    patientId: u.patientId,
    patientName: u.patient ? `${u.patient.firstName} ${u.patient.lastName}` : null,
  }
}

/**
 * خواندن کاربر جاری از کوکی (فقط در Server / Route Handler).
 * رد می‌شود اگر: توکن نامعتبر/منقضی، کاربر غیرفعال، نسخهٔ توکن با tokenVersion
 * کاربر نخواند (نشست ابطال‌شده)، یا کلینیک عضویت غیرفعال باشد.
 * پس از تأیید، زمینهٔ Tenant در AsyncLocalStorage ثبت می‌شود تا Prisma (db.ts)
 * همهٔ Queryهای ادامهٔ request را به کلینیک خود کاربر محدود کند.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies()
    const token = store.get(COOKIE)?.value
    if (!token) return null
    const parsed = parseToken(token)
    if (!parsed) return null
    // ————— نشست نمایشی (demo-): کاربر واقعی هم‌نام ترجیح دارد؛ در قطعی DB کاربر ایستا
    if (parsed.userId.startsWith('demo-')) {
      const uname = parsed.userId.slice(5)
      try {
        const real = await db.user.findUnique({
          where: { username: uname },
          include: { branch: true, doctor: true, patient: true, clinic: true },
        })
        if (real && real.active) {
          const clinicId = real.clinicId ?? real.branch?.clinicId ?? null
          tenantCtxFromUser({
            id: real.id,
            role: real.role,
            clinicId,
            branchId: real.branchId,
            patientId: real.patientId,
          })
          return toSessionUser(real)
        }
      } catch {
        /* DB در دسترس نیست — ادامه با کاربر ایستا */
      }
      if (!isDemoAuthEnabled()) return null
      const su = staticDemoSessionUser(uname)
      if (!su) return null
      tenantCtxFromUser({ id: su.id, role: su.role, clinicId: null, branchId: null, patientId: null })
      return su
    }
    const user = await db.user.findUnique({
      where: { id: parsed.userId },
      include: { branch: true, doctor: true, patient: true, clinic: true },
    })
    if (!user || !user.active) return null
    if (user.tokenVersion !== parsed.ver) return null // نشست ابطال‌شده
    const clinicId = user.clinicId ?? user.branch?.clinicId ?? null
    if (clinicId && user.clinic && !user.clinic.isActive) return null // کلینیک غیرفعال
    const ctx = tenantCtxFromUser({
      id: user.id,
      role: user.role,
      clinicId,
      branchId: user.branchId,
      patientId: user.patientId,
    })
    // زمینهٔ Tenant توسط tenantHandler با als.run فعال می‌شود (enterWith در Next 16 بین
    // فریم‌های async از بین می‌رود — اثبات‌شده با تست)
    return toSessionUser(user)
  } catch {
    return null
  }
}

export async function setSessionCookie(userId: string) {
  const store = await cookies()
  const user = await db.user.findUnique({ where: { id: userId }, select: { tokenVersion: true } })
  store.set(COOKIE, makeToken(userId, user?.tokenVersion ?? 1), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: MAX_AGE,
  })
}

/**
 * نشست نمایشی بدون دیتابیس — userId با پیشوند demo- قابل تشخیص است و
 * getSessionUser برای آن کاربر ایستای ایستا را برمی‌گرداند (بدون کوئری الزامی).
 */
export async function setDemoSessionCookie(username: string) {
  const store = await cookies()
  const payload = `${demoUserId(username)}.1.${Date.now()}`
  store.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: MAX_AGE,
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.set(COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/', maxAge: 0 })
}

/** ابطال همهٔ نشست‌های کاربر — با تغییر رمز، غیرفعال‌سازی یا «خروج از همه دستگاه‌ها» */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } })
}

export const ROLE_FA: Record<string, string> = {
  SUPER_ADMIN: 'مدیر پلتفرم',
  ADMIN: 'مدیر کل',
  MANAGER: 'مدیر عملیات',
  DOCTOR: 'پزشک',
  RECEPTIONIST: 'منشی پذیرش',
  ACCOUNTANT: 'حسابدار',
  PATIENT: 'بیمار',
}

/** محافظت API: برگرداندن کاربر یا خطا */
export async function requireRole(...roles: string[]): Promise<SessionUser | null> {
  const user = await getSessionUser()
  if (!user) return null
  if (roles.length && !roles.includes(user.role)) return null
  return user
}
