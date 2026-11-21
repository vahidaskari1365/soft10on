import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { postJournal, ACC } from '@/lib/ledger'
import { monthKeyStart, monthKeyEnd, lastNMonthKeys } from '@/lib/jalali'
import { nextInvoiceNumber, refreshInvoiceStatus } from '@/lib/accounting'

type ItemInput = { kind?: string; refId?: string; title?: string; qty?: number; unitPrice?: number }

/** لیست فاکتورها با فیلتر ماه/وضعیت/جستجو */
export async function GET(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('month')
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw ?? '')
  const monthKey = valid ? raw! : lastNMonthKeys(1)[0]
  const status = searchParams.get('status') ?? ''
  const q = (searchParams.get('q') ?? '').trim()
  const branchId = searchParams.get('branch') || undefined

  const where = {
    date: { gte: monthKeyStart(monthKey), lt: monthKeyEnd(monthKey) },
    ...(status ? { status } : {}),
    ...(branchId ? { branchId } : {}),
    ...(q ? { patient: { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { phone: { contains: q } }] } } : {}),
  }

  const [invoices, totals] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 300,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
        items: { select: { id: true, title: true, qty: true, unitPrice: true, total: true, kind: true } },
        payments: { select: { amount: true } },
      },
    }),
    db.invoice.aggregate({ where, _sum: { total: true, discount: true }, _count: true }),
  ])

  const paidSum = invoices.filter((i) => i.status === 'PAID').reduce((s, i) => s + i.total, 0)
  const remaining = invoices
    .filter((i) => i.status === 'ISSUED' || i.status === 'PARTIAL')
    .reduce((s, i) => s + i.total - i.payments.reduce((x, p) => x + p.amount, 0), 0)

  return NextResponse.json({
    items: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      date: i.date.toISOString(),
      status: i.status,
      subtotal: i.subtotal,
      discount: i.discount,
      total: i.total,
      note: i.note,
      paid: i.payments.reduce((s, p) => s + p.amount, 0),
      patient: i.patient,
      items: i.items,
    })),
    stats: { count: totals._count, total: totals._sum.total ?? 0, discount: totals._sum.discount ?? 0, paidSum, remaining },
  })
}

/** صدور فاکتور — { patientId?, branchId?, discount, note, items: [{kind, refId, title, qty, unitPrice}] } */
export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as {
    patientId?: string
    branchId?: string
    discount?: number
    note?: string
    items?: ItemInput[]
    status?: string
  }

  const items = (body.items ?? []).filter((it) => it.title?.trim() && (it.qty ?? 1) > 0 && (it.unitPrice ?? 0) >= 0)
  if (!items.length) return NextResponse.json({ error: 'حداقل یک قلم کالا یا خدمت لازم است' }, { status: 400 })

  const lines = items.map((it) => {
    const qty = Math.max(1, Math.round(it.qty ?? 1))
    const unitPrice = Math.max(0, it.unitPrice ?? 0)
    return {
      kind: it.kind ?? 'CUSTOM',
      refId: it.refId ?? null,
      title: it.title!.trim(),
      qty,
      unitPrice,
      total: qty * unitPrice,
    }
  })
  const subtotal = lines.reduce((s, l) => s + l.total, 0)
  const discount = Math.min(Math.max(0, body.discount ?? 0), subtotal)
  const total = subtotal - discount

  // صدور فاکتور + ثبت سند دوبل در یک تراکنش اتمیک
  const invoice = await db.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        number: await nextInvoiceNumber(tx),
        branchId: body.branchId || session.branchId || null,
        patientId: body.patientId || null,
        date: new Date(),
        status: body.status === 'DRAFT' ? 'DRAFT' : 'ISSUED',
        subtotal,
        discount,
        total,
        note: body.note?.trim() || null,
        items: { create: lines },
      },
      include: { items: true, patient: { select: { firstName: true, lastName: true, phone: true } } },
    })
    if (inv.status === 'ISSUED' && inv.total > 0) {
      // بدهکار: حساب‌های دریافتنی (کل) | بستانکار: درآمد خدمات | بدهکار: تخفیف فروش
      const jLines: { code: string; debit?: number; credit?: number; detail?: string }[] = [
        { code: ACC.AR, debit: inv.total, detail: `فاکتور ${inv.number}` },
      ]
      if (inv.subtotal > 0) jLines.push({ code: ACC.SERVICE_REVENUE, credit: inv.subtotal, detail: `فاکتور ${inv.number}` })
      if (inv.discount > 0) jLines.push({ code: ACC.SALES_DISCOUNT, debit: inv.discount, detail: `تخفیف فاکتور ${inv.number}` })
      await postJournal(tx, { memo: `صدور فاکتور شماره ${inv.number}`, refType: 'INVOICE', refId: inv.id, branchId: inv.branchId, createdById: session.id, lines: jLines })
    }
    return inv
  }, { timeout: 20_000, maxWait: 10_000 })
  void refreshInvoiceStatus(invoice.id)
  return NextResponse.json({ invoice }, { status: 201 })
}
