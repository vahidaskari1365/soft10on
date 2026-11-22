/**
 * گارد محیط تست — مأموریت فاز ۱
 * هر سویت قبل از اجرا: DATABASE_URL باید دیتابیس تست مستقل (tenon_test / :5433) باشد؛
 * در غیر این صورت اجرا متوقف می‌شود تا هیچ‌گاه به دیتابیس Production متصل نشود.
 */
import fs from 'node:fs'

export function loadTestDbUrl() {
  for (const f of ['.env.local', '.env']) {
    try {
      const raw = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8')
      const m = raw.match(/^DATABASE_URL="?([^"\n]+)"?/m)
      if (m) return m[1].trim()
    } catch { /* فایل بعدی */ }
  }
  return process.env.DATABASE_URL ?? ''
}

export function assertTestDb() {
  const url = loadTestDbUrl()
  if (!url) {
    console.error('BLOCKED: DATABASE_URL یافت نشد — ابتدا `bun run db:test:up` و سپس تنظیم .env.local')
    process.exit(2)
  }
  const isTestDb = url.includes('tenon_test') || url.includes(':5433')
  const isProdish = /supabase\.com|amazonaws|neon\.tech|render\.com/i.test(url)
  if (isProdish || !isTestDb) {
    console.error(`BLOCKED: DATABASE_URL به دیتابیس تست مستقل اشاره نمی‌کند (اجبار فاز ۱).`)
    console.error('  برای امنیت دادهٔ واقعی، اجرا متوقف شد. راه‌اندازی تست: bun run db:test:up')
    process.exit(2)
  }
  return url
}
