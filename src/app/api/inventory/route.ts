import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { postJournal, ACC } from '@/lib/ledger'
import { db } from '@/lib/db'

export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role !== 'ADMIN' && session.role !== 'RECEPTIONIST') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const [products, purchases, sales] = await Promise.all([
    db.product.findMany({ orderBy: { name: 'asc' }, include: { branch: { select: { name: true } } } }),
    db.purchase.findMany({ include: { items: { include: { product: true } }, branch: { select: { name: true } } }, orderBy: { date: 'desc' }, take: 8 }),
    db.productSale.findMany({ include: { patient: true, product: true, branch: { select: { name: true } } }, orderBy: { date: 'desc' }, take: 8 }),
  ])
  const inventoryValue = products.reduce((s, p) => s + p.stockQty * p.purchasePrice, 0)
  return NextResponse.json({ products, purchases, sales, inventoryValue })
}

export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const body = await request.json()
  const { supplier, items } = body as { supplier: string; items: { productId: string; qty: number; unitPrice?: number }[] }
  if (!supplier || !items?.length) return NextResponse.json({ error: 'اطلاعات ناقص' }, { status: 400 })

  const products = await db.product.findMany({ where: { id: { in: items.map((i) => i.productId) } } })
  let total = 0
  const rows = items.map((i) => {
    const p = products.find((x) => x.id === i.productId)!
    const unitPrice = i.unitPrice ?? p.purchasePrice
    total += unitPrice * i.qty
    return { productId: i.productId, qty: i.qty, unitPrice }
  })

  const purchase = await db.$transaction(async (tx) => {
    const pur = await tx.purchase.create({
      data: { branchId: products[0]?.branchId ?? null, date: new Date(), supplier, total, items: { create: rows } },
      include: { items: { include: { product: true } } },
    })
    for (const r of rows) {
      await tx.product.update({ where: { id: r.productId }, data: { stockQty: { increment: r.qty } } })
    }
    if (total > 0) {
      // بدهکار: موجودی کالا | بستانکار: حساب‌های پرداختنی
      await postJournal(tx, {
        memo: `خرید از ${supplier}`,
        refType: 'PURCHASE',
        refId: pur.id,
        branchId: pur.branchId,
        createdById: session.id,
        lines: [
          { code: ACC.INVENTORY, debit: total, detail: `${rows.length} قلم` },
          { code: ACC.AP, credit: total, detail: `بدهی ${supplier}` },
        ],
      })
    }
    return pur
  }, { timeout: 20_000, maxWait: 10_000 })
  return NextResponse.json({ purchase })
}
