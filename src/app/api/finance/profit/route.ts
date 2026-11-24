import { NextResponse } from 'next/server'
import { tenantHandler } from '@/lib/tenant'
import { db } from '@/lib/db'
import { monthKeyStart, monthKeyEnd, lastNMonthKeys } from '@/lib/jalali'

/**
 * اعمال هزینه و سود — تفکیک جنس/دستمزد/سود خالص هر فاکتور + جمع ماه
 * زنجیرهٔ وابستگی: خرید انبار → purchasePrice محصول → جنسِ پیشنهادی اقلام فاکتور؛
 * نرخ کارانهٔ پزشک (commissionRate) → دستمزدِ پیشنهادی خدمات؛ هزینه‌های ماه → بالاسری؛
 * چک‌ها تا وصول فقط جریان نقدی‌اند و روی سود اثر نمی‌گذارند.
 */
export const GET = tenantHandler('ADMIN', 'ACCOUNTANT')(async (session, request) => {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('month')
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw ?? '')
  const monthKey = valid ? raw! : lastNMonthKeys(1)[0]
  const start = monthKeyStart(monthKey)
  const end = monthKeyEnd(monthKey)
  const branchId = searchParams.get('branch') || undefined
  const br = branchId ? { branchId } : {}

  const invoices = await db.invoice.findMany({
    where: { date: { gte: start, lt: end }, status: { not: 'CANCELLED' }, ...br },
    orderBy: { date: 'desc' },
    include: {
      patient: { select: { firstName: true, lastName: true } },
      items: true,
    },
  })

  // refId ها را یک‌جا جمع می‌کنیم: محصول → قیمت خرید (جنس پیشنهادی)، نوبت → نرخ کارانهٔ پزشک (دستمزد پیشنهادی)
  const productIds = new Set<string>()
  const apptIds = new Set<string>()
  for (const inv of invoices) {
    for (const it of inv.items) {
      if (it.kind === 'PRODUCT' && it.refId) productIds.add(it.refId)
      if (it.kind === 'SERVICE' && it.refId) apptIds.add(it.refId)
    }
  }
  const [products, appts, expenses, checks, purchases] = await Promise.all([
    productIds.size
      ? db.product.findMany({ where: { id: { in: [...productIds] } }, select: { id: true, purchasePrice: true } })
      : Promise.resolve([] as { id: string; purchasePrice: number }[]),
    apptIds.size
      ? db.appointment.findMany({ where: { id: { in: [...apptIds] } }, select: { id: true, doctor: { select: { commissionRate: true } } } })
      : Promise.resolve([] as { id: string; doctor: { commissionRate: number } | null }[]),
    db.expense.findMany({ where: { date: { gte: start, lt: end }, ...br } }),
    db.check.findMany({ where: { createdAt: { gte: start, lt: end }, ...br }, select: { direction: true, status: true, amount: true } }),
    db.purchase.findMany({ where: { date: { gte: start, lt: end }, ...br }, select: { total: true } }),
  ])

  const productCost = new Map(products.map((p) => [p.id, p.purchasePrice]))
  const apptRate = new Map(appts.map((a) => [a.id, a.doctor?.commissionRate ?? 0]))

  let revenue = 0
  let appliedMaterial = 0
  let appliedLabor = 0
  let suggestedMaterialSum = 0
  let suggestedLaborSum = 0
  let unapplied = 0

  const rows = invoices.map((inv) => {
    let sMat = 0
    let sLab = 0
    for (const it of inv.items) {
      if (it.kind === 'PRODUCT' && it.refId) sMat += it.qty * (productCost.get(it.refId) ?? 0)
      if (it.kind === 'SERVICE' && it.refId) sLab += Math.round(it.total * (apptRate.get(it.refId) ?? 0))
    }
    const applied = inv.materialCost > 0 || inv.laborCost > 0
    if (!applied) unapplied++
    revenue += inv.total
    appliedMaterial += inv.materialCost
    appliedLabor += inv.laborCost
    suggestedMaterialSum += sMat
    suggestedLaborSum += sLab
    return {
      id: inv.id,
      number: inv.number,
      date: inv.date.toISOString(),
      patient: inv.patient ? `${inv.patient.firstName} ${inv.patient.lastName}` : null,
      status: inv.status,
      revenue: inv.total,
      materialCost: inv.materialCost,
      laborCost: inv.laborCost,
      net: inv.total - inv.materialCost - inv.laborCost,
      applied,
      suggestedMaterial: sMat,
      suggestedLabor: sLab,
    }
  })

  const overhead = expenses.reduce((s, e) => s + e.amount, 0)
  const appliedNet = revenue - appliedMaterial - appliedLabor
  const purchaseTotal = purchases.reduce((s, p) => s + p.total, 0)

  // چک‌ها تا وصول روی سود اثر ندارند — فقط وضعیت جریان نقدی گزارش می‌شود
  const inFlow = (c: { status: string }) => c.status === 'IN_HAND' || c.status === 'DEPOSITED'
  const checksSummary = {
    receivedPending: checks.filter((c) => inFlow(c) && c.direction === 'RECEIVED').reduce((s, c) => s + c.amount, 0),
    cleared: checks.filter((c) => c.status === 'CLEARED' && c.direction === 'RECEIVED').reduce((s, c) => s + c.amount, 0),
    bounced: checks.filter((c) => c.status === 'BOUNCED').reduce((s, c) => s + c.amount, 0),
    issuedPending: checks.filter((c) => inFlow(c) && c.direction === 'ISSUED').reduce((s, c) => s + c.amount, 0),
  }

  return NextResponse.json({
    monthKey,
    rows,
    unapplied,
    totals: {
      revenue,
      material: appliedMaterial,
      labor: appliedLabor,
      net: appliedNet,
      overhead,
      finalNet: appliedNet - overhead,
      suggestedMaterial: suggestedMaterialSum,
      suggestedLabor: suggestedLaborSum,
      purchaseTotal,
    },
    checksSummary,
  })
})
