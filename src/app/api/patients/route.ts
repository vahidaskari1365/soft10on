import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const patients = await db.patient.findMany({ orderBy: { createdAt: 'asc' } })
  const now = new Date()
  const sixMonthsAgo = new Date(now.getTime() - 182 * 86400000)

  const appts = await db.appointment.findMany({
    where: { patientId: { in: patients.map((p) => p.id) } },
    include: { service: true, doctor: true },
    orderBy: { start: 'desc' },
  })

  const list = patients.map((p) => {
    const mine = appts.filter((a) => a.patientId === p.id)
    const visits = mine.filter((a) => a.status === 'DONE')
    const noShows = mine.filter((a) => a.status === 'NO_SHOW').length
    const lastVisit = visits[0]?.start ?? null
    return {
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      phone: p.phone,
      nationalId: p.nationalId,
      incompleteTreatment: p.incompleteTreatment,
      visitCount: visits.length,
      noShowCount: noShows,
      lastVisit,
      signalNoVisit: lastVisit ? lastVisit < sixMonthsAgo : visits.length === 0,
      signalNoShow: noShows >= 1,
      signalIncomplete: p.incompleteTreatment,
      totalSpent: visits.reduce((s, a) => s + a.price, 0),
    }
  })

  return NextResponse.json({ patients: list })
}
