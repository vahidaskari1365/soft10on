import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

/**
 * محدودساز نرخ درخواست توزیع‌شده — Store مشترک دیتابیس (SystemMeta).
 * - همهٔ Instanceها (Serverless) همان شمارنده را می‌بینند؛ برخلاف Map محلی.
 * - اتمیک: قفل ردیف در UPDATE ... RETURNING — درخواست‌های هم‌زمان نمی‌توانند سقف را دور بزنند.
 * - الگوریتم: شمارندهٔ پنجره ثابت (Fixed Window) با مقدار «شماره پنجره:تعداد».
 * - Fail-Secure: در خطای Store، پاسخ منفی است (Endpoint حساس بدون کنترل ادامه نمی‌یابد).
 *   دیتابیس خود وابستگی اصلی برنامه است؛ خطای آن به هر حال درخواست‌ها را شکست می‌دهد.
 */

type LimitResult = { ok: boolean; retryAfterSec: number; storeError?: boolean }

const FAIL_CLOSED: LimitResult = { ok: false, retryAfterSec: 5, storeError: true }

/** استخراج IP کلاینت از هدرهای پلتفرم (در Vercel: x-forwarded-for توسط پلتفرم تنظیم می‌شود) */
export function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'local'
  )
}

/** پاکسازی دوره‌ای پنجره‌های منقضی — با احتمال کم تا هزینه هر درخواست ثابت بماند */
function maybeCleanup(ws: number): void {
  if (Math.random() > 0.02) return
  const cutoff = ws - 2
  void db
    .$executeRaw(
      Prisma.sql`DELETE FROM "public"."SystemMeta" WHERE key LIKE 'rl:%' AND split_part(value, ':', 1)::bigint < ${cutoff}`,
    )
    .catch(() => {}) // پاکسازی best-effort است — عملیات اصلی را نمی‌شکند
}

/**
 * بررسی و ثبت یک درخواست در سطل محدودیت (async).
 * کلید توصیه‌شده: `<endpoint>:<clinicId?>:<userId|ip>` — نقش‌ها و Tenantهای مستقل سطل مستقل دارند.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<LimitResult> {
  const now = Date.now()
  const ws = Math.floor(now / windowMs) // شماره پنجرهٔ جاری
  const k = `rl:${key}:${windowMs}`
  try {
    // ساخت ردیف سطل در صورت نبود — رقابت با ON CONFLICT حل می‌شود
    await db.$executeRaw(
      Prisma.sql`INSERT INTO "public"."SystemMeta" ("key", "value") VALUES (${k}, ${`${ws}:0`}) ON CONFLICT ("key") DO NOTHING`,
    )
    // شمارش اتمیک: پنجرهٔ جدید → ریست؛ همان پنجره → +1 (قفل ردیف، مشترک بین instanceها)
    const rows = await db.$queryRaw<{ value: string }[]>(
      Prisma.sql`UPDATE "public"."SystemMeta" SET value = CASE
          WHEN split_part(value, ':', 1)::bigint < ${ws} THEN ${`${ws}:1`}
          ELSE split_part(value, ':', 1) || ':' || (split_part(value, ':', 2)::bigint + 1)
        END WHERE key = ${k} RETURNING value`,
    )
    maybeCleanup(ws)
    if (rows.length === 0) return FAIL_CLOSED // سطل موجود نیست؟ fail-secure
    const count = Number(rows[0].value.split(':')[1] ?? 0)
    if (count > limit) {
      const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now % windowMs)) / 1000))
      return { ok: false, retryAfterSec }
    }
    return { ok: true, retryAfterSec: 0 }
  } catch {
    // خطای Store — Endpoint حساس نباید بدون محدودیت ادامه دهد
    return FAIL_CLOSED
  }
}

/**
 * محدودساز نرخ درون‌حافظه‌ای (per-instance) — برای مسیر ورود نمایشی.
 * مسیر دمو باید وقتی DB قطع است هم کار کند؛ پس نمی‌تواند به Store دیتابیسی
 * تکیه کند (fail-closed). سقف متحافظه‌تر از مسیر عادی و فقط ضد سوءاستخدام شدید.
 */
const memBuckets = new Map<string, { ws: number; count: number }>()

export function memoryRateLimit(key: string, limit: number, windowMs: number): LimitResult {
  const now = Date.now()
  const ws = Math.floor(now / windowMs)
  const b = memBuckets.get(key)
  if (!b || b.ws !== ws) {
    memBuckets.set(key, { ws, count: 1 })
    // جلوگیری از رشد بی‌حد نقشه
    if (memBuckets.size > 10_000) {
      for (const [k, v] of memBuckets) if (v.ws < ws - 1) memBuckets.delete(k)
    }
    return { ok: true, retryAfterSec: 0 }
  }
  b.count += 1
  if (b.count > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now % windowMs)) / 1000)) }
  }
  return { ok: true, retryAfterSec: 0 }
}
