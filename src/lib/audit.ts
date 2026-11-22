import { Prisma } from '@prisma/client'
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
export async function logAudit(opts: AuditInput, tx?: Prisma.TransactionClient): Promise<void> {
  const { meta, ...rest } = opts
  // داخل تراکنش caller: شکست Audit = شکست عملیات اصلی (فینancial integrity) — خطا بلعیده نمی‌شود
  if (tx) {
    await tx.auditLog.create({
      data: { ...rest, result: rest.result ?? 'SUCCESS', meta: (meta as object) ?? undefined },
    })
    return
  }
  try {
    await db.auditLog.create({
      data: { ...rest, result: rest.result ?? 'SUCCESS', meta: (meta as object) ?? undefined },
    })
  } catch {
    // خارج از تراکنش: best-effort — عملیات اصلی را نمی‌شکند
  }
}
