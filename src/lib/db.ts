import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import { cleanEnvValue } from './env-value'

// ------------------------------------------------------------------
// بوت‌استرپ دیتابیس برای استقرار سرورلس (Vercel و مشابه)
// ------------------------------------------------------------------
// حالت PostgreSQL (Supabase): DATABASE_URL با postgres شروع می‌شود؛
// نیازی به بوت‌استرپ فایل نیست و مستقیم همان اتصال استفاده می‌شود.
//
// حالت SQLite (fallback): روی Vercel فایل‌سیستم فقطخواندنی است به‌جز
// /tmp؛ پس در اولین اجرای هر نمونهٔ تابع (cold start)، دیتابیس بذر
// (db/seed.db) که داخل باندل قرار دارد به /tmp/10on.db کپی می‌شود و
// DATABASE_URL به همان مسیر تغییر می‌کند.
//
// نکتهٔ مهم (lazy): هیچ گارد پیکربندی در زمان import اجرا نمی‌شود؛
// وگرنه مرحلهٔ «Collecting page data» در build ورسل — که هنوز متغیرهای
// محیطی را تزریق نکرده — با خطا متوقف می‌شد. گارد fail-closed و ساخت
// کلاینت با اولین دسترسی واقعی به دیتابیس انجام می‌شود.
// ------------------------------------------------------------------

/** خواندن DATABASE_URL از فایل‌های env پروژه (برای محیط‌هایی که متغیر ناسازگار تزریق می‌کنند) */
function envFileUrl(): string | null {
  for (const f of ['.env.local', '.env']) {
    try {
      const raw = fs.readFileSync(path.join(process.cwd(), f), 'utf8')
      const m = raw.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1]
      if (m) return m
    } catch {
      // فایل وجود ندارد؛ فایل بعدی
    }
  }
  return null
}

/** بوت‌استرپ SQLite برای توسعه — فقط در محیط غیر production فراخوانی می‌شود */
function bootstrapSqliteFallback(url: string) {
  const filePart = url.startsWith('file:') ? url.slice('file:'.length) : ''

  // آیا فایل تنظیم‌شده وجود دارد؟ (نسبت به ریشه پروژه و پوشه prisma)
  const resolvedFile =
    filePart === ''
      ? null
      : path.isAbsolute(filePart) && fs.existsSync(filePart)
        ? filePart
        : [path.resolve(process.cwd(), filePart), path.resolve(process.cwd(), 'prisma', filePart)]
            .find((p) => fs.existsSync(p)) ?? null

  // آیا نیاز به بوت‌استرپ داریم؟
  const needsBootstrap =
    process.env.VERCEL === '1' || // محیط سرورلس ورسل
    !url || // هیچ URL ای تنظیم نشده
    (filePart !== '' && resolvedFile === null) // فایل تنظیم‌شده وجود ندارد

  if (!needsBootstrap) return

  const target = '/tmp/10on.db'
  if (!fs.existsSync(target)) {
    const candidates = [
      path.join(process.cwd(), 'db', 'seed.db'),
      path.join(process.cwd(), 'prisma', 'seed.db'),
      path.join(process.cwd(), 'db', 'custom.db'),
    ]
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          fs.copyFileSync(candidate, target)
          break
        }
      } catch {
        // نادیده بگیر و سراغ گزینه بعدی برو
      }
    }
  }
  process.env.DATABASE_URL = `file:${target}`
}

/**
 * اتصال دیتابیس را تضمین می‌کند — فقط با اولین دسترسی واقعی صدا زده می‌شود.
 * Production بدون DATABASE_URL امن متوقف می‌شود (fail-closed):
 * هیچ fallback فایلِ حاوی اعتبارنامه، هیچ دیتابیس آزمایشی خاموش.
 * خطا نباید مقدار تلاش‌شده یا بخشی از رشته اتصال را نشان دهد.
 */
function requireDatabaseUrl() {
  // مقدار paste شده در پنل ممکن است کل خط یا داخل نقل‌قول باشد — پاک‌سازی و بازنویسی
  const raw = process.env.DATABASE_URL ?? ''
  const url = cleanEnvValue(raw, 'DATABASE_URL')
  if (url !== raw) process.env.DATABASE_URL = url

  // PostgreSQL/Supabase — بدون بوت‌استرپ
  if (url.startsWith('postgres')) return

  // متغیر وراثتی ناسازگار (file:) → اولویت با PostgreSQL داخل .env پروژه
  const fromEnvFile = envFileUrl()
  if (fromEnvFile?.startsWith('postgres')) {
    process.env.DATABASE_URL = fromEnvFile
    return
  }

  const isProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'
  if (isProduction) {
    throw new Error(
      'CONFIGURATION ERROR: DATABASE_URL environment variable is required in production. ' +
        'Set it in the hosting provider (e.g. Vercel Project Settings → Environment Variables). ' +
        'Refusing to start with a demo database.'
    )
  }

  bootstrapSqliteFallback(url)
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

let client: PrismaClient | undefined

function getDb(): PrismaClient {
  if (!client) client = globalForPrisma.prisma
  if (!client) {
    requireDatabaseUrl()
    client = new PrismaClient({
      log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error'],
    })
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client
  }
  return client
}

/**
 * دسترسی lazy به Prisma — کلاینت و گارد پیکربندی فقط با اولین دسترسی واقعی
 * ساخته/اجرا می‌شوند تا build ورسل (جمع‌آوری داده صفحات) بدون متغیر محیطی هم سبز بماند.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const real = getDb()
    const value: unknown = Reflect.get(real, prop, real)
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(real)
      : value
  },
})
