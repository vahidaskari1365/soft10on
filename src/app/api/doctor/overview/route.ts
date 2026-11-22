import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { lastNMonthKeys, monthKeyStart, monthKeyEnd, keyToLabel } from '@/lib/jalali'
import { formatToman } from '@/lib/format'

/** تابلوی پزشک: برنامه امروز، بیماران من، کارنامه مالی من */
export async function GET() {
  const user = await requireRole('DOCTOR')
  if (!user || !user.doctorId) return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const doctorId = user.doctorId

  const now = new Date()
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dayEnd = new Date(dayStart.getTime() + 86400000)

  const [today, upcoming, myAppts, myTasks, branch] = await Promise.all([
    db.appointment.findMany({
      where: { doctorId, start: { gte: dayStart, lt: dayEnd } },
      include: { patient: true, service: true, doctor: true },
      orderBy: { start: 'asc' },
    }),
    db.appointment.findMany({
      where: { doctorId, start: { gte: now }, status: { in: ['PENDING', 'CONFIRMED'] } },
      include: { patient: true, service: true, doctor: true },
      orderBy: { start: 'asc' },
      take: 8,
    }),
    db.appointment.findMany({
      where: { doctorId, start: { gte: new Date(now.getTime() - 365 * 86400000) }, status: { in: ['DONE', 'NO_SHOW', 'CANCELLED'] } },
      select: { start: true, status: true, price: true, patientId: true, service: { select: { name: true } } },
      orderBy: { start: 'desc' },
    }),
    db.task.findMany({ where: { assigneeRole: 'DOCTOR', status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] } }, orderBy: { dueAt: 'asc' }, take: 6 }),
    db.doctor.findFirst({ where: { id: doctorId }, include: { branch: true } }),
  ])

  // سری ۱۲ ماه کارانه
  const keys = lastNMonthKeys(12)
  const ranges = keys.map((k) => ({ k, s: monthKeyStart(k).getTime(), e: monthKeyEnd(k).getTime() }))
  const bucket = new Map<string, { revenue: number; commission: number; done: number }>()
  for (const k of keys) bucket.set(k, { revenue: 0, commission: 0, done: 0 })
  for (const a of myAppts) {
    if (a.status !== 'DONE') continue
    const t = a.start.getTime()
    const r = ranges.find((x) => t >= x.s && t < x.e)
    if (!r) continue
    const b = bucket.get(r.k)!
    b.revenue += a.price
    b.commission += a.price * (branch?.commissionRate ?? 0.35)
    b.done += 1
  }
  const series = keys.map((k) => ({ key: k, label: keyToLabel(k), ...(bucket.get(k)!) }))

  // بیماران من (از نوبت‌های ۱۲ ماه اخیر)
  const patientMap = new Map<string, { visits: number; lastVisit: Date | null; spent: number; noShow: number }>()
  for (const a of [...myAppts].reverse()) {
    const cur = patientMap.get(a.patientId) ?? { visits: 0, lastVisit: null, spent: 0, noShow: 0 }
    if (a.status === 'DONE') {
      cur.visits += 1
      cur.spent += a.price
      cur.lastVisit = a.start
    }
    if (a.status === 'NO_SHOW') cur.noShow += 1
    patientMap.set(a.patientId, cur)
  }
  const topPatientIds = [...patientMap.entries()].sort((a, b) => b[1].visits - a[1].visits).slice(0, 12)
  const patientRecords = await db.patient.findMany({ where: { id: { in: topPatientIds.map(([id]) => id) } } })
  const myPatients = topPatientIds.map(([id, stat]) => {
    const p = patientRecords.find((x) => x.id === id)!
    return {
      id,
      name: `${p.firstName} ${p.lastName}`,
      phone: p.phone,
      incompleteTreatment: p.incompleteTreatment,
      visits: stat.visits,
      noShow: stat.noShow,
      spentFa: formatToman(stat.spent),
      lastVisit: stat.lastVisit,
    }
  })

  const key = keys[keys.length - 1]
  const cur = bucket.get(key)!
  const thisMonth = {
    done: cur.done,
    revenueFa: formatToman(cur.revenue),
    commissionFa: formatToman(cur.commission),
    rate: branch?.commissionRate ?? 0.35,
  }

  return NextResponse.json({
    doctor: { name: branch?.name ?? user.fullName, specialty: branch?.specialty ?? '', branch: branch?.branch?.name ?? null, branchCity: branch?.branch?.city ?? null },
    today,
    upcoming,
    myPatients,
    series,
    thisMonth,
    tasks: myTasks,
  })
}
