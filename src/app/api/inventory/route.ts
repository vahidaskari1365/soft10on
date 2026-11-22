import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { postJournal, ACC } from '@/lib/ledger'
import { db } from '@/lib/db'
import { assertBranch, tenantHandler } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'

/** مشاهده انبار — فقط محصولات/خرید/فروش کلینیک خود کاربر (scope خودکار Extension) */
export const GET = tenantHandler('ADMIN', 'MANAGER', 'RECEPTIONIST', 'ACCOUNTANT')(async () => {
  const [products, purchases, sales] = await Promise.all([
    db.product.findMany({ orderBy: { name: 'asc' }, include: { branch: { select: { name: true } } } }),
    db.purchase.findMany({ include: { items: { include: { product: true } }, branch: { select: { name: true } } }, orderBy: { date: 'desc' }, take: 8 }),
    db.productSale.findMany({ include: { patient: true, product: true, branch: { select: { name: true } } }, orderBy: { date: 'desc' }, take: 8 }),
  ])
  const inventoryValue = products.reduce((s, p) => s + p.stockQty * p.purchasePrice, 0)
  return NextResponse.json({ products, purchases, sales, inventoryValue })
})

/**
 * خرید/فروش کالا — اتمیک با سند حسابداری، scope کامل Tenant و موجودی غیرمنفی:
 * - همهٔ کالاها باید از همان شعبهٔ مجاز کاربر باشند
 * - کاهش موجودی با Conditional Update (stockQty >= qty) داخل تراکنش — رقابت منفی نمی‌سازد
 * - خرید: qty صحیح مثبت | فروش: قیمت از کالا مگر override مثبت معتبر
 */
export const POST = tenantHandler('ADMIN', 'MANAGER', 'RECEPTIONIST')(async (session, request) => {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const bodyTyped = body as {
    type?: string
    supplier?: string
    items?: { productId?: string; qty?: number; unitPrice?: number }[]
    patientId?: string
  }

  // ————— فروش / مصرف کالا برای بیمار —————
  if (bodyTyped.type === 'SALE') {
    const saleItems = bodyTyped.items ?? []
    if (!saleItems.length) return NextResponse.json({ error: 'حداقل یک قلم کالا لازم است' }, { status: 400 })
    const ids = saleItems.map((i) => String(i.productId ?? ''))
    if (ids.some((x) => !x)) return NextResponse.json({ error: 'شناسه کالا نامعتبر است' }, { status: 400 })

    // همهٔ کالاها با scope خودکار کلینیک — کالای کلینیک دیگر اصلاً دیده نمی‌شود
    const products = await db.product.findMany({ where: { id: { in: ids } } })
    const branchIds = new Set(products.map((p) => p.branchId))
    if (branchIds.size !== 1) {
      return NextResponse.json({ error: 'تمام اقلام باید از یک شعبه باشند' }, { status: 400 })
    }
    const branchId = await assertBranch(session, products[0]?.branchId ?? undefined)
    if (!branchId) return NextResponse.json({ error: 'شعبهٔ کالا در محدودهٔ دسترسی شما نیست' }, { status: 403 })
    if (typeof bodyTyped.patientId === 'string' && bodyTyped.patientId) {
      const pat = await db.patient.findFirst({ where: { id: bodyTyped.patientId } })
      if (!pat) return NextResponse.json({ error: 'بیمار یافت نشد' }, { status: 404 })
    }

    // اعتبارسنجی کامل پیش از تراکنش
    type ValidSale = { p: (typeof products)[number]; q: number; unit: number }
    const clean: (ValidSale | { error: string })[] = saleItems.map((it) => {
      const p = products.find((x) => x.id === it.productId)
      const q = Number(it.qty)
      if (!p) return { error: 'کالا یافت نشد' } as const
      if (!Number.isFinite(q) || q < 1 || Math.round(q) !== q) return { error: `تعداد نامعتبر برای «${p.name}»` } as const
      const unit = it.unitPrice === undefined || it.unitPrice === null ? p.salePrice : Number(it.unitPrice)
      if (!Number.isFinite(unit) || unit < 0 || Math.round(unit) !== unit) return { error: `قیمت نامعتبر برای «${p.name}»` } as const
      return { p, q: Math.round(q), unit: Math.round(unit) } as const
    })
    const bad = clean.find((c): c is { error: string } => 'error' in c)
    if (bad) return NextResponse.json({ error: bad.error }, { status: 400 })
    const valid = clean.filter((c): c is ValidSale => !('error' in c))

    try {
      const sales = await db.$transaction(
        async (tx) => {
          let revenue = 0
          let cost = 0
          const created: { id: string }[] = []
          for (const item of valid) {
            const { p, q, unit } = item
            // کاهش اتمیک موجودی — اگر موجودی کافی نباشد count=0 و تراکنش شکست می‌خورد
            const upd = await tx.product.updateMany({
              where: { id: p.id, stockQty: { gte: q } },
              data: { stockQty: { decrement: q } },
            })
            if (upd.count === 0) {
              throw Object.assign(new Error(`موجودی «${p.name}» کافی نیست`), { status: 409 })
            }
            revenue += unit * q
            cost += p.purchasePrice * q
            created.push(await tx.productSale.create({
              data: { clinicId: session.clinicId, branchId: p.branchId, patientId: bodyTyped.patientId || null, productId: p.id, qty: q, unitPrice: unit, total: unit * q, date: new Date() },
            }))
          }
          if (revenue > 0 || cost > 0) {
            // فروش نقدی + بهای تمام‌شده در همان تراکنش
            await postJournal(tx, {
              memo: `فروش/مصرف کالا — ${created.length} قلم`,
              refType: 'PRODUCT_SALE',
              refId: created[0]?.id,
              clinicId: session.clinicId,
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
          await logAudit(
            {
              userId: session.id, userName: session.fullName, action: 'PRODUCT_SALE',
              entity: 'ProductSale', entityId: created[0]?.id ?? null, branchId, clinicId: session.clinicId,
              meta: { items: created.length, revenue },
            },
            tx,
          )
          return created
        },
        { timeout: 20_000, maxWait: 10_000 },
      )
      return NextResponse.json({ sales }, { status: 201 })
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500
      if (status >= 500) console.error('[inventory-sale] tx failed:', (e as Error).message)
      return NextResponse.json({ error: status >= 500 ? 'خطای سرور در ثبت فروش' : (e as Error).message }, { status })
    }
  }

  // ————— خرید کالا —————
  const supplier = typeof bodyTyped.supplier === 'string' ? bodyTyped.supplier.trim().slice(0, 120) : ''
  const items = (bodyTyped.items ?? []) as { productId?: string; qty?: number; unitPrice?: number }[]
  if (!supplier || !items.length) return NextResponse.json({ error: 'اطلاعات ناقص' }, { status: 400 })
  const ids = items.map((i) => String(i.productId ?? ''))
  if (ids.some((x) => !x)) return NextResponse.json({ error: 'شناسه کالا نامعتبر است' }, { status: 400 })
  const products = await db.product.findMany({ where: { id: { in: ids } } })
  const branchIds = new Set(products.map((p) => p.branchId))
  if (branchIds.size !== 1) return NextResponse.json({ error: 'تمام اقلام باید از یک شعبه باشند' }, { status: 400 })
  const branchId = await assertBranch(session, products[0]?.branchId ?? undefined)
  if (!branchId) return NextResponse.json({ error: 'شعبهٔ کالا در محدودهٔ دسترسی شما نیست' }, { status: 403 })

  type ValidRow = { productId: string; qty: number; unitPrice: number; name: string }
  const rows: (ValidRow | { error: string })[] = items.map((i) => {
    const p = products.find((x) => x.id === i.productId)
    if (!p) return { error: 'کالا یافت نشد' } as const
    const q = Number(i.qty)
    if (!Number.isFinite(q) || q < 1 || Math.round(q) !== q) return { error: `تعداد نامعتبر برای «${p.name}»` } as const
    const unitPrice = i.unitPrice === undefined || i.unitPrice === null ? p.purchasePrice : Number(i.unitPrice)
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || Math.round(unitPrice) !== unitPrice) {
      return { error: `قیمت نامعتبر برای «${p.name}»` } as const
    }
    return { productId: p.id, qty: Math.round(q), unitPrice: Math.round(unitPrice), name: p.name } as const
  })
  const bad = rows.find((r): r is { error: string } => 'error' in r)
  if (bad) return NextResponse.json({ error: bad.error }, { status: 400 })
  const validRows = rows.filter((r): r is ValidRow => !('error' in r))
  const total = validRows.reduce((s, r) => s + r.unitPrice * r.qty, 0)

  try {
    const purchase = await db.$transaction(
      async (tx) => {
        const pur = await tx.purchase.create({
          data: { clinicId: session.clinicId, branchId, date: new Date(), supplier, total, items: { create: validRows.map(({ productId, qty, unitPrice }) => ({ productId, qty, unitPrice })) } },
          include: { items: { include: { product: true } } },
        })
        for (const r of validRows) {
          await tx.product.updateMany({ where: { id: r.productId }, data: { stockQty: { increment: r.qty } } })
        }
        if (total > 0) {
          // بدهکار: موجودی کالا | بستانکار: حساب‌های پرداختنی
          await postJournal(tx, {
            memo: `خرید از ${supplier}`,
            refType: 'PURCHASE',
            refId: pur.id,
            clinicId: session.clinicId,
            branchId,
            createdById: session.id,
            lines: [
              { code: ACC.INVENTORY, debit: total, detail: `${validRows.length} قلم` },
              { code: ACC.AP, credit: total, detail: `بدهی ${supplier}` },
            ],
          })
        }
        await logAudit(
          {
            userId: session.id, userName: session.fullName, action: 'PRODUCT_PURCHASE',
            entity: 'Purchase', entityId: pur.id, branchId, clinicId: session.clinicId,
            meta: { items: rows.length, total, supplier: supplier.slice(0, 40) },
          },
          tx,
        )
        return pur
      },
      { timeout: 20_000, maxWait: 10_000 },
    )
    return NextResponse.json({ purchase })
  } catch (e) {
    console.error('[inventory-purchase] tx failed:', (e as Error).message)
    return NextResponse.json({ error: 'خطای سرور در ثبت خرید' }, { status: 500 })
  }
})
