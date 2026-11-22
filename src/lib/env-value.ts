/**
 * پاک‌سازی مقدار متغیر محیطی از خطاهای رایج هنگام paste در پنل هاست:
 * ۱) کل خط paste شده (DATABASE_URL=... یا AUTH_SECRET=...) ۲) نقل‌قول دور مقدار ۳) فاصلهٔ اضافه.
 * مقدار واقعی معتبر دست‌نخورده می‌ماند.
 */
export function cleanEnvValue(raw: string, prefix: string): string {
  let v = raw.trim()
  if (v.toUpperCase().startsWith(prefix.toUpperCase() + '=')) v = v.slice(prefix.length + 1)
  if (v.length > 1 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    v = v.slice(1, -1)
  }
  return v.trim()
}
