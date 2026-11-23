/**
 * بوت سرور — اگر دیتابیس محلی (localhost) در دسترس نیست، خودکار بالا می‌آید:
 * embedded-postgres + migrate + seed (scripts/dev-db-up.mjs) تا ورود و کل نرم‌افزار
 * بدون خطای «دیتابیس قطع» کار کند. با URL راه‌دور (مثل Vercel/Supabase) هیچ دخالتی نمی‌کند.
 * برای غیرفعال‌سازی: TENON_SKIP_DB_ENSURE=1
 */
export async function register(): Promise<void> {
  try {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return
    if (process.env.TENON_SKIP_DB_ENSURE === '1') return
    const url = process.env.DATABASE_URL ?? ''
    if (!url || !/localhost|127\.0\.0\.1/.test(url)) return
    const { ensureLocalDb } = await import('./lib/db-ensure')
    await ensureLocalDb()
  } catch {
    /* هرگز بوت سرور را نبند — اپ بدون DB هم با کلیدهای نمایشی قابل مرور است */
  }
}
