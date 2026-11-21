import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role !== 'ADMIN' && session.role !== 'RECEPTIONIST') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const expenses = await db.expense.findMany({ orderBy: { date: 'desc' }, take: 40 })
  return NextResponse.json({ expenses })
}

export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const body = await request.json()
  const { category, amount, description, date } = body as { category: string; amount: number; description?: string; date?: string }
  if (!category?.trim()) return NextResponse.json({ error: 'دسته هزینه الزامی است' }, { status: 400 })
  const amt = Math.round(Number(amount))
  if (!Number.isFinite(amt) || amt <= 0) return NextResponse.json({ error: 'مبلغ باید عددی بزرگ‌تر از صفر باشد' }, { status: 400 })
  let dt = new Date()
  if (date) {
    dt = new Date(date)
    if (isNaN(dt.getTime())) return NextResponse.json({ error: 'تاریخ نامعتبر است' }, { status: 400 })
  }
  const expense = await db.expense.create({
    data: { category: category.trim(), amount: amt, description: description ?? 'ثبت دستی', date: dt },
  })
  return NextResponse.json({ expense })
}
