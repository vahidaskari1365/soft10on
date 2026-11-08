import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const { status } = body as { status: string }
  const allowed = ['PENDING', 'CONFIRMED', 'DONE', 'CANCELLED', 'NO_SHOW']
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: 'وضعیت نامعتبر' }, { status: 400 })
  }
  const appt = await db.appointment.update({
    where: { id },
    data: { status, paid: status === 'DONE' ? true : undefined },
    include: { patient: true, doctor: true, service: true },
  })
  return NextResponse.json({ appointment: appt })
}
