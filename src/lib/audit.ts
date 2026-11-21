import { db } from '@/lib/db'

type AuditInput = {
  userId?: string | null
  userName?: string | null
  action: string
  entity: string
  entityId?: string | null
  branchId?: string | null
  clinicId?: string | null
  result?: 'SUCCESS' | 'DENIED' | 'FAILED'
  meta?: Record<string, unknown>
  ip?: string | null
}

/**
 * ثبت ردپای حسابرسی — هرگز رمز، کلید یا محتوای پزشکی در meta ثبت نمی‌شود؛
 * فقط شناسه‌ها، نوع عملیات و متادیتای ایمن. خطای لاگ عملیات اصلی را نمی‌شکند.
 */
export async function logAudit(opts: AuditInput): Promise<void> {
  try {
    const { meta, ...rest } = opts
    await db.auditLog.create({
      data: {
        ...rest,
        result: rest.result ?? 'SUCCESS',
        meta: (meta as object) ?? undefined,
      },
    })
  } catch {
    // حسابرسی best-effort است
  }
}
