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
  const bodyTyped = body as {
    type?: string
    supplier?: string
    items?: { productId: string; qty: number; unitPrice?: number }[]
    patientId?: string
  }
  const { supplier, items } = bodyTyped as { supplier?: string; items?: { productId: string; qty: number; unitPrice?: number }[] }

  // ————— فروش / مصرف کالا برای بیمار —————
  if (bodyTyped.type === 'SALE') {
    const saleItems = bodyTyped.items ?? []
    if (!saleItems.length) return NextResponse.json({ error: 'حداقل یک قلم کالا لازم است' }, { status: 400 })
    const products = await db.product.findMany({ where: { id: { in: saleItems.map((i) => i.productId) } } })
    for (const it of saleItems) {
      const p = products.find((x) => x.id === it.productId)
      if (!p) return NextResponse.json({ error: 'کالا یافت نشد' }, { status: 404 })
      const q = Math.max(1, Math.round(Number(it.qty) || 0))
      if (p.stockQty < q) return NextResponse.json({ error: `موجودی «${p.name}» کافی نیست (موجودی فعلی: ${p.stockQty})` }, { status: 409 })
    }
    const branchId = products[0]?.branchId ?? null
    const sales = await db.$transaction(async (tx) => {
      let revenue = 0
      let cost = 0
      const created: { id: string }[] = []
      for (const it of saleItems) {
        const p = products.find((x) => x.id === it.productId)!
        const q = Math.max(1, Math.round(Number(it.qty) || 0))
        const unit = Math.max(0, Math.round(Number(it.unitPrice ?? p.salePrice)))
        revenue += unit * q
        cost += p.purchasePrice * q
        await tx.product.update({ where: { id: p.id }, data: { stockQty: { decrement: q } } })
        created.push(await tx.productSale.create({
          data: { branchId: p.branchId, patientId: bodyTyped.patientId || null, productId: p.id, qty: q, unitPrice: unit, total: unit * q, date: new Date() },
        }))
      }
      if (revenue > 0 || cost > 0) {
        // فروش نقدی + بهای تمام‌شده در یک تراکنش
        await postJournal(tx, {
          memo: `فروش/مصرف کالا — ${created.length} قلم`,
          refType: 'PRODUCT_SALE',
          refId: created[0]?.id,
          branchId,
          createdById: session.id,
          lines: [
            ...(revenue > 0 ? [
              { code: ACC.CASH, debit: revenue, detail: 'فروش نقدی' },
              { code: ACC.PRODUCT_REVENUE, credit: revenue },
            ] : []),
            ...(cost > 0 ? [
              { code: ACC.COGS, debit: cost, detail: 'بهای تمام‌شده' },
              { code: ACC.INVENTORY, credit: cost },
            ] : []),
          ],
        })
      }
      return created
    }, { timeout: 20_000, maxWait: 10_000 })
    return NextResponse.json({ sales }, { status: 201 })
  }

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
