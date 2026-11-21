import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { jMonthKey, monthKeyStart, monthKeyEnd } from '@/lib/jalali'
import { formatToman } from '@/lib/format'

/** لیست شعب + آمار ماه جاری هر شعبه */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })

  const key = jMonthKey(new Date())
  const start = monthKeyStart(key)
  const end = monthKeyEnd(key)
  const branches = await db.branch.findMany({
    orderBy: { createdAt: 'asc' },
    include: { doctors: true, users: true },
  })

  type BranchSummary = {
      id: string; code: string; name: string; city: string; address: string; phone: string
      openHour: number; closeHour: number; thuCloseHour: number | null; closedFri: boolean; isActive: boolean
      doctorCount: number; staffCount: number
      doctors: { id: string; name: string; specialty: string; color: string }[]
      appointmentsMonth: number; revenueMonth: number; revenueMonthFa: string
      expensesMonth: number
      todayPending: number
    }
    const out: BranchSummary[] = []
  for (const b of branches) {
    const [apptsMonth, done, expenses, todayStart] = await Promise.all([
      db.appointment.count({ where: { branchId: b.id, start: { gte: start, lt: end } } }),
      db.appointment.findMany({ where: { branchId: b.id, start: { gte: start, lt: end }, status: 'DONE' }, select: { price: true } }),
      db.expense.aggregate({ where: { branchId: b.id, date: { gte: start, lt: end } }, _sum: { amount: true } }),
      db.appointment.count({
        where: {
          branchId: b.id,
          start: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)), lt: new Date(new Date().setUTCHours(24, 0, 0, 0)) },
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
      }),
    ])
    const revenue = done.reduce((s, a) => s + a.price, 0)
    out.push({
      id: b.id,
      code: b.code,
      name: b.name,
      city: b.city,
      address: b.address,
      phone: b.phone,
      openHour: b.openHour,
      closeHour: b.closeHour,
      thuCloseHour: b.thuCloseHour,
      closedFri: b.closedFri,
      isActive: b.isActive,
      doctorCount: b.doctors.filter((d) => d.active).length,
      staffCount: b.users.length,
      doctors: b.doctors.filter((d) => d.active).map((d) => ({ id: d.id, name: d.name, specialty: d.specialty, color: d.color })),
      appointmentsMonth: apptsMonth,
      revenueMonth: revenue,
      revenueMonthFa: formatToman(revenue),
      expensesMonth: expenses._sum.amount ?? 0,
      todayPending: todayStart,
    })
  }
  return NextResponse.json({ branches: out })
}

/** ایجاد شعبه جدید — فقط مدیر کل */
export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'فقط مدیر کل مجاز است' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const code = String(body.code ?? '').trim().toUpperCase()
  const name = String(body.name ?? '').trim()
  const city = String(body.city ?? '').trim()
  const address = String(body.address ?? '').trim()
  const phone = String(body.phone ?? '').trim()
  if (!code || !name || !city || !address) {
    return NextResponse.json({ error: 'کد، نام، شهر و آدرس شعبه الزامی است' }, { status: 400 })
  }
  const exists = await db.branch.findUnique({ where: { code } })
  if (exists) return NextResponse.json({ error: 'کد شعبه تکراری است' }, { status: 400 })

  const branch = await db.branch.create({
    data: {
      code,
      name,
      city,
      address,
      phone: phone || '—',
      openHour: Number(body.openHour) || 9,
      closeHour: Number(body.closeHour) || 19,
      thuCloseHour: body.thuCloseHour ? Number(body.thuCloseHour) : null,
      closedFri: body.closedFri !== false,
    },
  })
  return NextResponse.json({ branch })
}
