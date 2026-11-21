import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/** تامین‌کنندگان با مجموع خرید */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const [suppliers, purchases] = await Promise.all([
    db.supplier.findMany({ orderBy: { name: 'asc' } }),
    db.purchase.findMany({ select: { supplier: true, total: true, date: true } }),
  ])
  const items = suppliers.map((s) => {
    const mine = purchases.filter((p) => p.supplier === s.name)
    return {
      id: s.id,
      name: s.name,
      phone: s.phone,
      note: s.note,
      purchaseCount: mine.length,
      totalPurchased: mine.reduce((x, p) => x + p.total, 0),
      lastPurchase: mine.length ? mine.sort((a, b) => b.date.getTime() - a.date.getTime())[0].date.toISOString() : null,
    }
  })
  // تامین‌کنندگان آزاد در خریدها که هنوز ثبت نشده‌اند
  const known = new Set(suppliers.map((s) => s.name))
  const extras = [...new Set(purchases.map((p) => p.supplier).filter((n) => n && !known.has(n)))]
  return NextResponse.json({ items, unregistered: extras })
}

export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as { name?: string; phone?: string; note?: string }
  if (!body.name?.trim()) return NextResponse.json({ error: 'نام تامین‌کننده الزامی است' }, { status: 400 })
  const supplier = await db.supplier.upsert({
    where: { name: body.name.trim() },
    create: { name: body.name.trim(), phone: body.phone?.trim() || null, note: body.note?.trim() || null },
    update: { phone: body.phone?.trim() || null, note: body.note?.trim() || null },
  })
  return NextResponse.json({ supplier }, { status: 201 })
}
