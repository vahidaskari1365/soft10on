import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * زمینهٔ Tenant در سطح درخواست — پس از حل Session توسط auth.ts تنظیم می‌شود و
 * Prisma Client Extension (در db.ts) برای هر Query به‌طور خودکار اعمالش می‌کند.
 * این لایه، دفاع مرکزی IDOR است: هیچ Route نباید به فیلد clinicId ارسالی کلاینت اعتماد کند.
 */
export type TenantCtx = {
  clinicId: string
  userId: string
  role: string
  branchId: string | null // شعبهٔ محدود کاربر؛ null = همهٔ شعب کلینیک (مدیر/حسابدار)
  patientId: string | null // برای نقش بیمار — محدودسازی به رکوردهای خودش
}

/**
 * نقش‌های کلینیک‌گسترده — دادهٔ همهٔ شعب را می‌بینند:
 * مدیر کلینیک، مدیر، حسابدار (مالی در سطح کلینیک). سایر نقش‌های ستاد
 * (پزشک، پذیرش، انبار) به شعبهٔ خودشان محدود می‌شوند؛ بیمار مستثناست
 * (رکوردهایش ممکن است در هر شعبه ثبت شده باشد — scoping او با patientId است).
 */
const CLINIC_WIDE_ROLES = new Set(['ADMIN', 'MANAGER', 'ACCOUNTANT'])

const g = globalThis as unknown as { __tenonAls?: AsyncLocalStorage<TenantCtx> }
// Singleton سراسری — جلوگیری از دوباره‌ساخت ماژول در باندل‌های جدا Turbopack
// (دو نمونهٔ AsyncLocalStorage = store در یکی نوشته و در دیگری خوانده می‌شود!)
export const als: AsyncLocalStorage<TenantCtx> = (g.__tenonAls ??= new AsyncLocalStorage<TenantCtx>())

/** فعال‌سازی زمینه برای ادامهٔ زنجیرهٔ async همین request */
export function enterTenant(ctx: TenantCtx): void {
  als.enterWith(ctx)
}

/** زمینهٔ جاری — null یعنی بدون scope (bootstrap، کار پلتفرمی یا بدون سشن) */
export function currentTenant(): TenantCtx | null {
  return als.getStore() ?? null
}

/** ساخت زمینه از خروجی SessionUser — کاربر پلتفرمی (بدون کلینیک) زمینه نمی‌گیرد */
export function tenantCtxFromUser(u: {
  id: string
  role: string
  clinicId: string | null
  branchId: string | null
  patientId: string | null
}): TenantCtx | null {
  if (!u.clinicId) return null
  const effectiveBranchId = CLINIC_WIDE_ROLES.has(u.role) ? null : u.branchId
  return {
    clinicId: u.clinicId,
    userId: u.id,
    role: u.role,
    branchId: u.branchId,
    patientId: u.patientId,
  }
}

/** اجرای یک بلوک کامل (مثلاً seed) داخل زمینهٔ Tenant مشخص */
export async function withTenantContext<T>(clinicId: string, fn: () => Promise<T>): Promise<T> {
  return als.run({ clinicId, userId: 'seed', role: 'ADMIN', branchId: null, patientId: null }, fn)
}
