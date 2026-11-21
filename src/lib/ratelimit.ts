/** محدودیت نرخ درخواست (پنجره لغزان در حافظه — برای هر نمونه سرور) */
const buckets = new Map<string, number[]>()

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now()
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (arr.length >= limit) {
    buckets.set(key, arr)
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - arr[0])) / 1000)) }
  }
  arr.push(now)
  buckets.set(key, arr)
  // پاکسازی دوره‌ای برای جلوگیری از رشد حافظه
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t > windowMs)) buckets.delete(k)
  }
  return { ok: true, retryAfterSec: 0 }
}

/** استخراج IP کلاینت از هدرها (در Vercel: x-forwarded-for) */
export function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'local'
  )
}
