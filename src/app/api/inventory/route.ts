import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const [products, purchases, sales] = await Promise.all([
    db.product.findMany({ orderBy: { name: 'asc' } }),
    db.purchase.findMany({ include: { items: { include: { product: true } } }, orderBy: { date: 'desc' }, take: 8 }),
    db.productSale.findMany({ include: { patient: true, product: true }, orderBy: { date: 'desc' }, take: 8 }),
  ])
  const inventoryValue = products.reduce((s, p) => s + p.stockQty * p.purchasePrice, 0)
  return NextResponse.json({ products, purchases, sales, inventoryValue })
}

export async function POST(request: Request) {
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

  const purchase = await db.purchase.create({
    data: { date: new Date(), supplier, total, items: { create: rows } },
    include: { items: { include: { product: true } } },
  })
  for (const r of rows) {
    await db.product.update({ where: { id: r.productId }, data: { stockQty: { increment: r.qty } } })
  }
  return NextResponse.json({ purchase })
}
