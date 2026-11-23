import type { SessionUser } from './auth'

/**
 * حساب‌های نمایشی ایستا — مستقل از دیتابیس.
 * هدف: کلیدهای «ورود سریع» صفحهٔ لاگین حتی وقتی دیتابیس قطع است یا seed نشده
 * کار کنند تا کل نرم‌افزار قابل مرور باشد (بدون خطای ورود).
 * قواعد:
 * - فقط در حالت دمو/توسعه فعال است (isDemoAuthEnabled) — در production واقعی مسیر بسته است.
 * - اگر DB در دسترس و کاربر واقعی هم‌نام موجود باشد، نشست واقعی ترجیح داده می‌شود
 *   (تجربهٔ کامل با داده‌های واقعی)؛ نشست ایستا فقط fallback است.
 * - رمز دمو همان رمز حساب‌های نمایشی صفحهٔ لاگین است و محدودساز نرخ حافظه‌ای دارد.
 */
export const DEMO_PASSWORD = '123456'

type DemoDef = { role: string; fullName: string }

/** کلیدهای صفحهٔ لاگین + نام‌کاربری‌های جایگزین؛ usernameهایی که در DB هم seed می‌شوند */
export const DEMO_USERS: Record<string, DemoDef> = {
  manager: { role: 'ADMIN', fullName: 'رضا آریایی — دکتر مدیر' },
  doctor: { role: 'DOCTOR', fullName: 'دکتر نگین موسوی' },
  reception: { role: 'RECEPTIONIST', fullName: 'سمیرا احمدی — اپراتور' },
  reception2: { role: 'RECEPTIONIST', fullName: 'نگار مهدوی — منشی ولیعصر' },
  patient: { role: 'PATIENT', fullName: 'سامان قاسمی' },
  // نام‌کاربری فقط-ایستا: مسیر fallback نشست بدون DB را حتی وقتی DB بالاست قابل تست می‌کند
  operator: { role: 'RECEPTIONIST', fullName: 'اپراتور پذیرش' },
}

/** دمو فقط خارج از production واقعی، یا وقتی صریحاً DEMO_MODE=1 است */
export function isDemoAuthEnabled(): boolean {
  return process.env.DEMO_MODE === '1' || process.env.NODE_ENV !== 'production'
}

export function demoUserId(username: string): string {
  return `demo-${username}`
}

/** کاربر نمایشی ایستا (بدون هیچ اتصال DB) — برای usernameهای ناشناخته null */
export function staticDemoSessionUser(username: string): SessionUser | null {
  const def = DEMO_USERS[username]
  if (!def) return null
  return {
    id: demoUserId(username),
    username,
    fullName: def.fullName,
    role: def.role,
    phone: null,
    email: null,
    branchId: null,
    branch: null,
    clinicId: null,
    doctorId: null,
    doctorName: null,
    patientId: null,
    patientName: null,
  }
}
