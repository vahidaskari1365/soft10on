import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'

/**
 * راه‌اندازی غیرمسدودکنندهٔ دیتابیس محلی هنگام بوت سرور.
 * اسکریپت مستقل (scripts/dev-db-up.mjs) به‌صورت detached اجرا می‌شود و
 * حداکثر ۶۰ ثانیه برای آماده‌باش (فایل sentinel + ping) صبر می‌کنیم؛
 * اگر دیر شد بوت ادامه می‌یابد — اسکریپت خودش در پس‌زمینه تمام می‌کند و
 * ورود نمایشی بدون دیتابیس هم از همان لحظه کار می‌کند.
 */
const READY_FILE = path.join(process.cwd(), '.pgdata', '.up-to-date')

export async function isDbReachable(url: string, timeoutSec = 2): Promise<boolean> {
  const sql = postgres(url, { max: 1, connect_timeout: timeoutSec, onnotice: () => {} })
  try {
    await sql`SELECT 1`
    return true
  } catch {
    return false
  } finally {
    try { await sql.end({ timeout: 1 }) } catch {}
  }
}

export async function ensureLocalDb(): Promise<void> {
  const url = process.env.DATABASE_URL ?? ''
  if (!url) return
  if (await isDbReachable(url)) return
  console.warn('[db-ensure] دیتابیس محلی در دسترس نیست — راه‌اندازی خودکار...')
  mkdirSync(path.join(process.cwd(), '.pgdata'), { recursive: true })
  const child = spawn('bun', ['scripts/dev-db-up.mjs'], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })
  child.unref()
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (existsSync(READY_FILE) && (await isDbReachable(url, 1))) {
      console.log('[db-ensure] دیتابیس محلی آماده شد')
      return
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  console.warn('[db-ensure] دیتابیس محلی در ۶۰ ثانیه آماده نشد — بوت ادامه می‌یابد؛ ورود نمایشی بدون دیتابیس کار می‌کند')
}
