import { NextResponse } from 'next/server'
import { tenantHandler } from '@/lib/tenant'
import { db } from '@/lib/db'
import { monthKeyStart, monthKeyEnd, lastNMonthKeys } from '@/lib/jalali'

/** فاکتورهای خرید — لیست ماهانه با اقلام، تأمین‌کننده و جمع (زنجیرهٔ قیمت تمام‌شدهٔ انبار) */
export const GET = tenantHandler('ADMIN', 'ACCOUNTANT', 'RECEPTIONIST')(async (session, request) => {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('month')
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw ?? '')
  const monthKey = valid ? raw! : lastNMonthKeys(1)[0]
  const start = monthKeyStart(monthKey)
  const end = monthKeyEnd(monthKey)
  const branchId = searchParams.get('branch') || undefined

  const purchases = await db.purchase.findMany({
    where: { date: { gte: start, lt: end }, ...(branchId ? { branchId } : {}) },
    orderBy: { date: 'desc' },
    include: {
      items: { include: { product: { select: { name: true, unit: true } } } },
      branch: { select: { name: true } },
    },
  })

  const items = purchases.map((p) => ({
    id: p.id,
    date: p.date.toISOString(),
    supplier: p.supplier,
    total: p.total,
    branch: p.branch?.name ?? null,
    items: p.items.map((i) => ({
      title: i.product.name,
      unit: i.product.unit,
      qty: i.qty,
      unitPrice: i.unitPrice,
      total: i.qty * i.unitPrice,
    })),
  }))

  return NextResponse.json({ items, total: items.reduce((s, r) => s + r.total, 0) })
})
