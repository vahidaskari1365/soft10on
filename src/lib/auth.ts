import { cookies } from 'next/headers'
import { createHmac } from 'crypto'
import { db } from '@/lib/db'

const COOKIE = 'sina_session'
const SECRET = process.env.AUTH_SECRET ?? 'sina-demo-secret-1404'
const MAX_AGE = 60 * 60 * 24 * 30 // ۳۰ روز

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

function sign(value: string): string {
  return createHmac('sha256', SECRET).update(value).digest('hex').slice(0, 32)
}

export function makeToken(userId: string): string {
  return `${userId}.${sign(userId)}`
}

function parseToken(token: string): string | null {
  const idx = token.lastIndexOf('.')
  if (idx < 0) return null
  const userId = token.slice(0, idx)
  const sig = token.slice(idx + 1)
  return sign(userId) === sig ? userId : null
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

/** خواندن کاربر جاری از کوکی (فقط در Server / Route Handler) */
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
    path: '/',
    maxAge: MAX_AGE,
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
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
