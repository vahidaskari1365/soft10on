import { cookies } from 'next/headers'
import { createHmac, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'

const COOKIE = 'sina_session'
const MAX_AGE = 60 * 60 * 24 * 30 // ۳۰ روز

const isProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'

/**
 * Secret نشست — فقط از متغیر محیطی.
 * Production بدون AUTH_SECRET (حداقل ۳۲ کاراکتر) باید امن متوقف شود؛
 * secret پیش‌فرض ثابت وجود ندارد. fallback فقط برای توسعه محلی است.
 */
function getSecret(): string {
  const s = process.env.AUTH_SECRET
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
  role: string // ADMIN | DOCTOR | RECEPTIONIST | PATIENT
  phone: string | null
  email: string | null
  branchId: string | null
  branch: { id: string; name: string; code: string; city: string } | null
  doctorId: string | null
  doctorName: string | null
  patientId: string | null
  patientName: string | null
}

/** HMAC-SHA256 با secret محیطی */
function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url')
}

/** توکن نشست: userId.issuedAtMs.signature — امضا شامل زمان صدور است */
export function makeToken(userId: string): string {
  const payload = `${userId}.${Date.now()}`
  return `${payload}.${sign(payload)}`
}

function parseToken(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [userId, issuedAt, sig] = parts
  const payload = `${userId}.${issuedAt}`
  const expected = sign(payload)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  const issued = Number(issuedAt)
  if (!Number.isFinite(issued) || issued <= 0 || Date.now() - issued > MAX_AGE * 1000) return null
  return userId
}

export function toSessionUser(u: {
  id: string
  username: string
  fullName: string
  role: string
  phone: string | null
  email: string | null
  branchId: string | null
  branch?: { id: string; name: string; code: string; city: string } | null
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
    doctorId: u.doctorId,
    doctorName: u.doctor?.name ?? null,
    patientId: u.patientId,
    patientName: u.patient ? `${u.patient.firstName} ${u.patient.lastName}` : null,
  }
}

/** خواندن کاربر جاری از کوکی (فقط در Server / Route Handler) — کاربر غیرفعال یا توکن نامعتبر رد می‌شود */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies()
    const token = store.get(COOKIE)?.value
    if (!token) return null
    const userId = parseToken(token)
    if (!userId) return null
    const user = await db.user.findUnique({
      where: { id: userId },
      include: { branch: true, doctor: true, patient: true },
    })
    if (!user || !user.active) return null
    return toSessionUser(user)
  } catch {
    return null
  }
}

export async function setSessionCookie(userId: string) {
  const store = await cookies()
  store.set(COOKIE, makeToken(userId), {
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

export const ROLE_FA: Record<string, string> = {
  ADMIN: 'مدیر کل',
  DOCTOR: 'پزشک',
  RECEPTIONIST: 'منشی پذیرش',
  PATIENT: 'بیمار',
}

/** محافظت API: برگرداندن کاربر یا خطا */
export async function requireRole(...roles: string[]): Promise<SessionUser | null> {
  const user = await getSessionUser()
  if (!user) return null
  if (roles.length && !roles.includes(user.role)) return null
  return user
}
