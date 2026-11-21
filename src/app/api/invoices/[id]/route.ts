import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { refreshInvoiceStatus } from '@/lib/accounting'

/** جزئیات فاکتور (برای چاپ) */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  const { id } = await params
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: {
      patient: true,
      items: true,
      payments: { orderBy: { date: 'asc' } },
      branch: { select: { name: true, phone: true, address: true } },
    },
  })
  if (!invoice) return NextResponse.json({ error: 'فاکتور یافت نشد' }, { status: 404 })
  if (session.role === 'PATIENT' && session.patientId !== invoice.patientId) {
    return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  }
  const paid = invoice.payments.reduce((s, p) => s + p.amount, 0)
  return NextResponse.json({
    invoice: {
      ...invoice,
      date: invoice.date.toISOString(),
      createdAt: invoice.createdAt.toISOString(),
      payments: invoice.payments.map((p) => ({ ...p, date: p.date.toISOString(), createdAt: p.createdAt.toISOString() })),
      paid,
      remaining: invoice.status === 'CANCELLED' ? 0 : Math.max(0, invoice.total - paid),
    },
  })
}

/** عملیات فاکتور — { action: 'pay'|'cancel'|'reopen', amount?, method?, cashAccountId? } */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as {
    action?: 'pay' | 'cancel' | 'reopen'
    amount?: number
    method?: string
    cashAccountId?: string
  }

  const invoice = await db.invoice.findUnique({ where: { id }, include: { payments: { where: { refType: 'INVOICE' } } } })
  if (!invoice) return NextResponse.json({ error: 'فاکتور یافت نشد' }, { status: 404 })

  if (body.action === 'cancel') {
    await db.invoice.update({ where: { id }, data: { status: 'CANCELLED' } })
    return NextResponse.json({ ok: true, status: 'CANCELLED' })
  }
  if (body.action === 'reopen') {
    await db.invoice.update({ where: { id }, data: { status: 'ISSUED' } })
    await refreshInvoiceStatus(id)
    return NextResponse.json({ ok: true, status: 'ISSUED' })
  }

  // پرداخت (کامل یا جزئی)
  const paid = invoice.payments.reduce((s, p) => s + p.amount, 0)
  const remaining = Math.max(0, invoice.total - paid)
  const amount = Math.min(Math.max(1, body.amount ?? remaining), remaining)
  if (remaining <= 0) return NextResponse.json({ error: 'این فاکتور قبلاً تسویه شده است' }, { status: 400 })

  await db.payment.create({
    data: {
      branchId: invoice.branchId,
      date: new Date(),
      direction: 'IN',
      method: body.method ?? 'CASH',
      amount,
      cashAccountId: body.cashAccountId || null,
      patientId: invoice.patientId,
      invoiceId: invoice.id,
      description: `پرداخت فاکتور شماره ${invoice.number}`,
      refType: 'INVOICE',
      refId: invoice.id,
    },
  })
  const status = await refreshInvoiceStatus(id)
  return NextResponse.json({ ok: true, status, paid: paid + amount, remaining: Math.max(0, remaining - amount) })
}
