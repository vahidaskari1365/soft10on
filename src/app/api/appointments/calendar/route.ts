import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * تقویم نوبت‌ها — بازه‌ای (روز/هفته/ماه) با فیلتر شعبه، پزشک، خدمت و وضعیت.
 * هر نوبت با پزشک، خدمت، اتاق و بیمار برای نمایش روی تقویم.
 */
export async function GET(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const now = new Date()
  const fromStr = searchParams.get('from')
  const toStr = searchParams.get('to')
  // پیش‌فرض: هفته جاری
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay()))
  const from = fromStr ? new Date(fromStr) : weekStart
  const to = toStr ? new Date(toStr) : new Date(weekStart.getTime() + 7 * 86_400_000)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: 'بازه تاریخ نامعتبر است' }, { status: 400 })
  }
  const branchId = searchParams.get('branchId') ?? undefined
  const doctorId = searchParams.get('doctorId') ?? undefined
  const serviceId = searchParams.get('serviceId') ?? undefined
  const status = searchParams.get('status') ?? undefined

  const appointments = await db.appointment.findMany({
    where: {
      start: { gte: from, lt: to },
      ...(branchId ? { branchId } : {}),
      ...(doctorId ? { doctorId } : {}),
      ...(serviceId ? { serviceId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
      doctor: { select: { id: true, name: true, color: true } },
      service: { select: { id: true, name: true, durationMin: true } },
      roomUnit: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: { start: 'asc' },
    take: 600,
  })

  // خلاصه وضعیت برای نمایش ظرفیت و تداخل
  const byStatus: Record<string, number> = {}
  for (const a of appointments) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1
  const byDoctor: Record<string, number> = {}
  for (const a of appointments) byDoctor[a.doctor.name] = (byDoctor[a.doctor.name] ?? 0) + 1

  return NextResponse.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    appointments,
    summary: { total: appointments.length, byStatus, byDoctor },
  })
}
