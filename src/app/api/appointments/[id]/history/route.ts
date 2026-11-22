import { NextResponse } from 'next/server'
import { tenantHandler, platformHandler } from '@/lib/tenant'
import { db } from '@/lib/db'

/** تاریخچه تغییرات نوبت — ایجاد، تغییر زمان، لغو و وضعیت‌ها */
export const GET = tenantHandler()(async (session, request, { params }) => {
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const { id } = await params
  const appt = await db.appointment.findUnique({ where: { id }, select: { id: true } })
  if (!appt) return NextResponse.json({ error: 'نوبت یافت نشد' }, { status: 404 })
  const history = await db.appointmentHistory.findMany({ where: { appointmentId: id }, orderBy: { createdAt: 'asc' } })
  return NextResponse.json({ history })
})
