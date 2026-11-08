import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { cashBalances } from '@/lib/accounting'

/** صندوق‌ها و حساب‌های بانکی با موجودی زنده + آخرین تراکنش‌ها */
export async function GET(request: Request) {
  const session = await getSessionUser()
  if (!session || session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const { searchParams } = new URL(request.url)
  const branchId = searchParams.get('branch') || undefined

  const [accounts, recent] = await Promise.all([
    cashBalances(branchId),
    db.payment.findMany({
      where: { ...(branchId ? { branchId } : {}) },
      orderBy: { date: 'desc' },
      take: 15,
      include: { patient: { select: { firstName: true, lastName: true } }, cashAccount: { select: { name: true } } },
    }),
  ])

  return NextResponse.json({
    accounts,
    totalBalance: accounts.reduce((s, a) => s + a.balance, 0),
    recent: recent.map((p) => ({
      id: p.id,
      date: p.date.toISOString(),
      direction: p.direction,
      amount: p.amount,
      description: p.description,
      patient: p.patient,
      cashAccount: p.cashAccount,
    })),
  })
}

/** حساب جدید یا انتقال بین حساب‌ها */
export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session || session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as {
    action?: 'create' | 'transfer'
    name?: string
    type?: string
    bankName?: string
    accountNo?: string
    openingBalance?: number
    branchId?: string
    fromId?: string
    toId?: string
    amount?: number
    description?: string
  }

  if (body.action === 'transfer') {
    const amount = Math.round(body.amount ?? 0)
    if (!body.fromId || !body.toId || body.fromId === body.toId) {
      return NextResponse.json({ error: 'حساب مبدأ و مقصد باید متفاوت باشند' }, { status: 400 })
    }
    if (amount <= 0) return NextResponse.json({ error: 'مبلغ نامعتبر است' }, { status: 400 })
    const group = `TR-${Date.now()}`
    await db.$transaction([
      db.payment.create({
        data: {
          date: new Date(),
          direction: 'OUT',
          method: 'TRANSFER',
          amount,
          cashAccountId: body.fromId,
          description: body.description?.trim() || 'انتقال بین حساب‌ها',
          refType: 'TRANSFER',
          transferGroup: group,
        },
      }),
      db.payment.create({
        data: {
          date: new Date(),
          direction: 'IN',
          method: 'TRANSFER',
          amount,
          cashAccountId: body.toId,
          description: body.description?.trim() || 'انتقال بین حساب‌ها',
          refType: 'TRANSFER',
          transferGroup: group,
        },
      }),
    ])
    return NextResponse.json({ ok: true }, { status: 201 })
  }

  if (!body.name?.trim()) return NextResponse.json({ error: 'نام حساب الزامی است' }, { status: 400 })
  const account = await db.cashAccount.create({
    data: {
      branchId: body.branchId || session.branchId || null,
      name: body.name.trim(),
      type: body.type === 'BANK' ? 'BANK' : 'CASH',
      bankName: body.bankName?.trim() || null,
      accountNo: body.accountNo?.trim() || null,
      openingBalance: Math.max(0, Math.round(body.openingBalance ?? 0)),
    },
  })
  return NextResponse.json({ account }, { status: 201 })
}
