import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const patient = await db.patient.findUnique({ where: { id } })
  if (!patient) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const [history, sales] = await Promise.all([
    db.appointment.findMany({
      where: { patientId: id },
      include: { service: true, doctor: true },
      orderBy: { start: 'desc' },
      take: 12,
    }),
    db.productSale.findMany({ where: { patientId: id }, include: { product: true }, orderBy: { date: 'desc' }, take: 5 }),
  ])

  const visits = history.filter((a) => a.status === 'DONE')
  return NextResponse.json({ patient, history, sales, totalSpent: visits.reduce((s, a) => s + a.price, 0) })
}
