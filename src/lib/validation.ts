/** اعتبارسنجی‌های مشترک سمت سرور — پیام‌ها فارسی */

export function validateIranianNationalId(raw: string): boolean {
  const id = raw.trim()
  if (!/^\d{10}$/.test(id)) return false
  if (/^(\d)\1{9}$/.test(id)) return false // همه رقم یکسان نامعتبر
  const check = Number(id[9])
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(id[i]) * (10 - i)
  const rem = sum % 11
  return rem < 2 ? check === rem : check === 11 - rem
}

export const MOBILE_RE = /^09\d{9}$/
export const LANDLINE_RE = /^0\d{9,10}$/
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const POSTAL_CODE_RE = /^\d{10}$/
export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const
export const GENDERS = ['FEMALE', 'MALE'] as const
export const PATIENT_STATUS = ['ACTIVE', 'ARCHIVED'] as const

export function validateEmail(raw: string): boolean {
  return EMAIL_RE.test(raw.trim())
}

/** نتیجه استاندارد اعتبارسنجی: یا مقدار پاک‌شده یا خطا */
export type VResult<T = string> = { ok: true; value: T } | { ok: false; error: string }

export function vStr(raw: unknown, opts: { required?: boolean; min?: number; max?: number; label: string } = { label: 'مقدار' }): VResult {
  const v = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw).trim()
  if (!v) return opts.required ? { ok: false, error: `${opts.label} الزامی است` } : { ok: true, value: '' }
  if (opts.min && v.length < opts.min) return { ok: false, error: `${opts.label} باید حداقل ${opts.min} نویسه باشد` }
  if (opts.max && v.length > opts.max) return { ok: false, error: `${opts.label} حداکثر ${opts.max} نویسه است` }
  return { ok: true, value: v }
}

export function vPhone(raw: unknown, label: string, required = false): VResult {
  const v = typeof raw === 'string' ? raw.trim() : ''
  if (!v) return required ? { ok: false, error: `${label} الزامی است` } : { ok: true, value: '' }
  const digits = v.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  if (!MOBILE_RE.test(digits)) return { ok: false, error: `${label} معتبر نیست (نمونه: 09123456789)` }
  return { ok: true, value: digits }
}

export function vNationalId(raw: unknown, required = false): VResult {
  const v = typeof raw === 'string' ? raw.trim() : ''
  if (!v) return required ? { ok: false, error: 'کد ملی الزامی است' } : { ok: true, value: '' }
  const digits = v.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  if (!validateIranianNationalId(digits)) return { ok: false, error: 'کد ملی معتبر نیست (۱۰ رقم با رقم کنترل درست)' }
  return { ok: true, value: digits }
}

export function vEmail(raw: unknown): VResult {
  const v = typeof raw === 'string' ? raw.trim() : ''
  if (!v) return { ok: true, value: '' }
  if (!validateEmail(v)) return { ok: false, error: 'ایمیل معتبر نیست' }
  return { ok: true, value: v }
}

export function vInt(raw: unknown, opts: { label: string; min?: number; max?: number; required?: boolean }): VResult<number> {
  if (raw === undefined || raw === null || raw === '') {
    return opts.required ? { ok: false, error: `${opts.label} الزامی است` } : { ok: true, value: 0 }
  }
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n)) return { ok: false, error: `${opts.label} باید عدد باشد` }
  if (opts.min !== undefined && n < opts.min) return { ok: false, error: `${opts.label} باید حداقل ${opts.min} باشد` }
  if (opts.max !== undefined && n > opts.max) return { ok: false, error: `${opts.label} حداکثر ${opts.max} است` }
  return { ok: true, value: n }
}

export function vEnum<T extends readonly string[]>(raw: unknown, allowed: T, label: string, required = false): VResult<T[number]> {
  const v = typeof raw === 'string' ? raw.trim() : ''
  if (!v) return required ? { ok: false, error: `${label} الزامی است` } : { ok: true, value: undefined as unknown as T[number] }
  if (!allowed.includes(v)) return { ok: false, error: `${label} نامعتبر است` }
  return { ok: true, value: v as T[number] }
}

export function vDate(raw: unknown, label: string): VResult<Date | null> {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null }
  const d = new Date(String(raw))
  if (isNaN(d.getTime())) return { ok: false, error: `${label} نامعتبر است` }
  return { ok: true, value: d }
}
