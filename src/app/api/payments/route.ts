import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { monthKeyStart, monthKeyEnd, lastNMonthKeys } from '@/lib/jalali'
import { PAYMENT_METHOD_LABEL } from '@/lib/accounting'

/** دفتر روزنه — همه‌ی واریز و برداشت‌ها با فیلتر */
export async function GET(request: Request) {
  const session = await getSessionUser()
  if (!session || session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('month')
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw ?? '')
  const monthKey = valid ? raw! : lastNMonthKeys(1)[0]
  const direction = searchParams.get('direction') ?? ''
  const branchId = searchParams.get('branch') || undefined
  const refType = searchParams.get('refType') ?? ''

  const where = {
    date: { gte: monthKeyStart(monthKey), lt: monthKeyEnd(monthKey) },
    ...(direction ? { direction } : {}),
    ...(refType ? { refType } : {}),
    ...(branchId ? { branchId } : {}),
  }

  const [payments, inSum, outSum] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 400,
      include: {
        patient: { select: { firstName: true, lastName: true } },
        cashAccount: { select: { name: true, type: true } },
        invoice: { select: { number: true } },
      },
    }),
    db.payment.aggregate({ where: { ...where, direction: 'IN' }, _sum: { amount: true } }),
    db.payment.aggregate({ where: { ...where, direction: 'OUT' }, _sum: { amount: true } }),
  ])

  return NextResponse.json({
    items: payments.map((p) => ({
      id: p.id,
      date: p.date.toISOString(),
      direction: p.direction,
      method: p.method,
      methodFa: PAYMENT_METHOD_LABEL[p.method] ?? p.method,
      amount: p.amount,
      description: p.description,
      refType: p.refType,
      transferGroup: p.transferGroup,
      patient: p.patient,
      cashAccount: p.cashAccount,
      invoiceNumber: p.invoice?.number ?? null,
    })),
    stats: { inSum: inSum._sum.amount ?? 0, outSum: outSum._sum.amount ?? 0, count: payments.length },
  })
}

/** ثبت پرداخت دستی — { direction, amount, method?, cashAccountId?, patientId?, description, refType? } */
export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session || session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as {
    direction?: string
    amount?: number
    method?: string
    cashAccountId?: string
    patientId?: string
    description?: string
    refType?: string
    branchId?: string
    date?: string
  }

  const amount = Math.round(body.amount ?? 0)
  if (amount <= 0) return NextResponse.json({ error: 'مبلغ باید بزرگ‌تر از صفر باشد' }, { status: 400 })
  const direction = body.direction === 'OUT' ? 'OUT' : 'IN'
  if (!body.description?.trim()) return NextResponse.json({ error: 'توضیح الزامی است' }, { status: 400 })

  const payment = await db.payment.create({
    data: {
      branchId: body.branchId || session.branchId || null,
      date: body.date ? new Date(body.date) : new Date(),
      direction,
      method: body.method ?? 'CASH',
      amount,
      cashAccountId: body.cashAccountId || null,
      patientId: body.patientId || null,
      description: body.description.trim(),
      refType: body.refType ?? 'OTHER',
    },
    include: { patient: { select: { firstName: true, lastName: true } }, cashAccount: { select: { name: true } } },
  })
  return NextResponse.json({ payment: { ...payment, date: payment.date.toISOString() } }, { status: 201 })
}
