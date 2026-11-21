import { db } from '@/lib/db'

/**
 * اعتبارسنجی زمان نوبت — نامعتبر یا گذشته را رد می‌کند
 */
export function validateApptTime(start: string): { ok: true; startMs: number } | { ok: false; error: string } {
  const startMs = new Date(start).getTime()
  if (!Number.isFinite(startMs)) return { ok: false, error: 'تاریخ و ساعت نامعتبر است' }
  if (startMs < Date.now() - 60_000) return { ok: false, error: 'نمی‌توان برای زمان گذشته نوبت ثبت کرد' }
  return { ok: true, startMs }
}

/**
 * بررسی تداخل بازه‌ی نوبت جدید با نوبت‌های فعال پزشک (PENDING/CONFIRMED/DONE)
 * تداخل: بازه‌ها روی هم بیفتند با در نظر گرفتن مدت خدمت هر نوبت
 */
export async function doctorHasConflict(doctorId: string, startMs: number, durationMin: number): Promise<boolean> {
  const endMs = startMs + Math.max(durationMin, 15) * 60_000
  const cands = await db.appointment.findMany({
    where: {
      doctorId,
      status: { in: ['PENDING', 'CONFIRMED', 'DONE'] },
      start: { gte: new Date(startMs - 4 * 3_600_000), lt: new Date(endMs + 4 * 3_600_000) },
    },
    include: { service: { select: { durationMin: true } } },
  })
  return cands.some((c) => {
    const cs = c.start.getTime()
    const ce = cs + Math.max(c.service.durationMin, 15) * 60_000
    return startMs < ce && endMs > cs
  })
}
