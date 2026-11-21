import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/** تاریخچه تغییرات نوبت — ایجاد، تغییر زمان، لغو و وضعیت‌ها */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const { id } = await params
  const appt = await db.appointment.findUnique({ where: { id }, select: { id: true } })
  if (!appt) return NextResponse.json({ error: 'نوبت یافت نشد' }, { status: 404 })
  const history = await db.appointmentHistory.findMany({ where: { appointmentId: id }, orderBy: { createdAt: 'asc' } })
  return NextResponse.json({ history })
}
