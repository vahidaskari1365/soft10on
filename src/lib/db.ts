import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'

// ------------------------------------------------------------------
// بوت‌استرپ دیتابیس برای استقرار سرورلس (Vercel و مشابه)
// ------------------------------------------------------------------
// روی Vercel فایل‌سیستم فقطخواندنی است به‌جز /tmp؛ پس در اولین اجرای
// هر نمونهٔ تابع (cold start)، دیتابیس بذر (db/seed.db) که داخل باندل
// قرار دارد به /tmp/10on.db کپی می‌شود و DATABASE_URL به همان مسیر
// تغییر می‌کند. فایل بذر از طریق outputFileTracingIncludes در باندل
// تابع گنجانده شده است (next.config.ts).
// ------------------------------------------------------------------

function resolveDbFile(filePart: string): string | null {
  // مسیر مطلق
  if (path.isAbsolute(filePart)) {
    return fs.existsSync(filePart) ? filePart : null
  }
  // مسیر نسبی: هم نسبت به ریشه پروژه و هم نسبت به پوشه prisma (قرارداد Prisma) بررسی می‌شود
  const byRoot = path.resolve(process.cwd(), filePart)
  if (fs.existsSync(byRoot)) return byRoot
  const byPrisma = path.resolve(process.cwd(), 'prisma', filePart)
  if (fs.existsSync(byPrisma)) return byPrisma
  return null
}

function bootstrapDatabase() {
  const url = process.env.DATABASE_URL ?? ''
  const filePart = url.startsWith('file:') ? url.slice('file:'.length) : ''

  // آیا نیاز به بوت‌استرپ داریم؟
  const needsBootstrap =
    process.env.VERCEL === '1' || // محیط سرورلس ورسل
    !url || // هیچ URL ای تنظیم نشده
    (filePart !== '' && resolveDbFile(filePart) === null) // فایل تنظیم‌شده وجود ندارد

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

bootstrapDatabase()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
