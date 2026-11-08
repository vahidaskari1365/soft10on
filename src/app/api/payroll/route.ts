import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { lastNMonthKeys } from '@/lib/jalali'
import { doctorCommissions } from '@/lib/accounting'

const STAFF_BASE: Record<string, number> = {
  RECEPTIONIST: 24_000_000,
  DOCTOR: 0, // کارانه‌محور
  ADMIN: 38_000_000,
}

/** حقوق و کارانه ماهانه — پیش‌نمایش محاسبه + لیست پرداخت‌شده‌ها */
export async function GET(request: Request) {
  const session = await getSessionUser()
  if (!session || session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('month')
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw ?? '')
  const monthKey = valid ? raw! : lastNMonthKeys(1)[0]
  const branchId = searchParams.get('branch') || undefined

  const [users, commissions, saved] = await Promise.all([
    db.user.findMany({
      where: { role: { in: ['RECEPTIONIST', 'ADMIN'] }, active: true, ...(branchId ? { branchId } : {}) },
      include: { branch: { select: { name: true } } },
    }),
    doctorCommissions(monthKey, branchId),
    db.payroll.findMany({ where: { month: monthKey, ...(branchId ? { branchId } : {}) }, orderBy: { staffName: 'asc' } }),
  ])

  const preview: {
    key: string
    staffName: string
    role: string
    roleFa: string
    baseSalary: number
    commission: number
    overtime: number
    bonus: number
    deductions: number
    total: number
    saved: boolean
    status?: string
  }[] = []

  const ROLE_FA: Record<string, string> = { RECEPTIONIST: 'منشی پذیرش', ADMIN: 'مدیر کل', DOCTOR: 'پزشک' }

  for (const u of users) {
    const base = STAFF_BASE[u.role] ?? 20_000_000
    preview.push({
      key: `${monthKey}:${u.username}`,
      staffName: u.fullName,
      role: u.role,
      roleFa: ROLE_FA[u.role] ?? u.role,
      baseSalary: base,
      commission: 0,
      overtime: 0,
      bonus: 0,
      deductions: 0,
      total: base,
      saved: false,
    })
  }
  for (const c of commissions) {
    preview.push({
      key: `${monthKey}:dr-${c.doctorId}`,
      staffName: c.name,
      role: 'DOCTOR',
      roleFa: ROLE_FA.DOCTOR,
      baseSalary: 0,
      commission: Math.round(c.commission),
      overtime: 0,
      bonus: 0,
      deductions: 0,
      total: Math.round(c.commission),
      saved: false,
    })
  }
  // ادغام با رکوردهای ذخیره‌شده
  const merged = preview.map((p) => {
    const s = saved.find((x) => x.staffName === p.staffName)
    if (!s) return p
    return { ...p, saved: true, status: s.status, total: s.total, overtime: s.overtime, bonus: s.bonus, deductions: s.deductions }
  })

  const totalDue = merged.filter((p) => p.status !== 'PAID').reduce((s, p) => s + p.total, 0)
  return NextResponse.json({ month: monthKey, rows: merged, totalDue, savedCount: saved.length })
}

/** ثبت یا پرداخت حقوق — { action: 'save'|'pay', month, staffName, role, baseSalary?, overtime?, bonus?, deductions?, commission?, method?, cashAccountId? } */
export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as {
    action?: 'save' | 'pay'
    month?: string
    staffName?: string
    role?: string
    baseSalary?: number
    overtime?: number
    bonus?: number
    deductions?: number
    commission?: number
    method?: string
    cashAccountId?: string
    branchId?: string
  }

  const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(body.month ?? '') ? body.month! : lastNMonthKeys(1)[0]
  if (!body.staffName?.trim()) return NextResponse.json({ error: 'نام پرسنل الزامی است' }, { status: 400 })

  const data = {
    month: monthKey,
    staffName: body.staffName.trim(),
    role: body.role ?? 'RECEPTIONIST',
    baseSalary: Math.max(0, Math.round(body.baseSalary ?? 0)),
    overtime: Math.max(0, Math.round(body.overtime ?? 0)),
    bonus: Math.max(0, Math.round(body.bonus ?? 0)),
    deductions: Math.max(0, Math.round(body.deductions ?? 0)),
    commission: Math.max(0, Math.round(body.commission ?? 0)),
    total: Math.max(0, Math.round((body.baseSalary ?? 0) + (body.overtime ?? 0) + (body.bonus ?? 0) + (body.commission ?? 0) - (body.deductions ?? 0))),
  }

  const payroll = await db.payroll.upsert({
    where: { month_staffName: { month: monthKey, staffName: data.staffName } },
    create: { ...data, branchId: body.branchId || session.branchId || null },
    update: data,
  })

  if (body.action === 'pay') {
    await db.payroll.update({ where: { id: payroll.id }, data: { status: 'PAID', paidAt: new Date(), method: body.method ?? 'TRANSFER' } })
    await db.payment.create({
      data: {
        branchId: payroll.branchId,
        date: new Date(),
        direction: 'OUT',
        method: body.method ?? 'TRANSFER',
        amount: payroll.total,
        cashAccountId: body.cashAccountId || null,
        description: `حقوق ${payroll.staffName} — ${monthKey}`,
        refType: 'PAYROLL',
        refId: payroll.id,
      },
    })
    await db.expense.create({
      data: {
        branchId: payroll.branchId,
        date: new Date(),
        category: 'SALARY',
        amount: payroll.total,
        description: `حقوق و کارانه ${payroll.staffName} — ${monthKey}`,
      },
    })
    return NextResponse.json({ ok: true, paid: true, total: payroll.total })
  }

  return NextResponse.json({ ok: true, payroll: { ...payroll, paidAt: payroll.paidAt?.toISOString() ?? null } }, { status: 201 })
}
