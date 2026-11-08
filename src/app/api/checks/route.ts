import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { CHECK_STATUS } from '@/lib/accounting'

/** لیست چک‌های دریافتی و صادره */
export async function GET(request: Request) {
  const session = await getSessionUser()
  if (!session || session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const { searchParams } = new URL(request.url)
  const direction = searchParams.get('direction') ?? ''
  const status = searchParams.get('status') ?? ''
  const branchId = searchParams.get('branch') || undefined

  const checks = await db.check.findMany({
    where: {
      ...(direction ? { direction } : {}),
      ...(status ? { status } : {}),
      ...(branchId ? { branchId } : {}),
    },
    orderBy: { dueDate: 'asc' },
    take: 200,
    include: {
      patient: { select: { firstName: true, lastName: true } },
      cashAccount: { select: { name: true } },
    },
  })

  const now = Date.now()
  const items = checks.map((c) => ({
    id: c.id,
    direction: c.direction,
    number: c.number,
    bank: c.bank,
    dueDate: c.dueDate.toISOString(),
    amount: c.amount,
    status: c.status,
    statusFa: CHECK_STATUS[c.status]?.label ?? c.status,
    patient: c.patient,
    supplierName: c.supplierName,
    cashAccount: c.cashAccount,
    note: c.note,
    dueInDays: Math.ceil((c.dueDate.getTime() - now) / 86_400_000),
  }))

  const inHand = items.filter((c) => c.status === 'IN_HAND' || c.status === 'DEPOSITED')
  return NextResponse.json({
    items,
    stats: {
      receivedPending: inHand.filter((c) => c.direction === 'RECEIVED').reduce((s, c) => s + c.amount, 0),
      issuedPending: inHand.filter((c) => c.direction === 'ISSUED').reduce((s, c) => s + c.amount, 0),
      bounced: items.filter((c) => c.status === 'BOUNCED').length,
      dueSoon: inHand.filter((c) => c.dueInDays <= 7).length,
    },
  })
}

/** ثبت چک جدید — { direction, number, bank, dueDate, amount, patientId?, supplierName?, cashAccountId?, note? } */
export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session || session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as {
    direction?: string
    number?: string
    bank?: string
    dueDate?: string
    amount?: number
    patientId?: string
    supplierName?: string
    cashAccountId?: string
    note?: string
    branchId?: string
  }

  const amount = Math.round(body.amount ?? 0)
  if (amount <= 0) return NextResponse.json({ error: 'مبلغ نامعتبر است' }, { status: 400 })
  if (!body.number?.trim() || !body.bank?.trim() || !body.dueDate) {
    return NextResponse.json({ error: 'شماره، بانک و سررسید الزامی است' }, { status: 400 })
  }
  const check = await db.check.create({
    data: {
      branchId: body.branchId || session.branchId || null,
      direction: body.direction === 'ISSUED' ? 'ISSUED' : 'RECEIVED',
      number: body.number.trim(),
      bank: body.bank.trim(),
      dueDate: new Date(body.dueDate),
      amount,
      patientId: body.patientId || null,
      supplierName: body.supplierName?.trim() || null,
      cashAccountId: body.cashAccountId || null,
      note: body.note?.trim() || null,
    },
    include: { patient: { select: { firstName: true, lastName: true } } },
  })
  return NextResponse.json({ check: { ...check, dueDate: check.dueDate.toISOString() } }, { status: 201 })
}
