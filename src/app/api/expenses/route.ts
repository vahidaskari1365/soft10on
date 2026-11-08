import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const expenses = await db.expense.findMany({ orderBy: { date: 'desc' }, take: 40 })
  return NextResponse.json({ expenses })
}

export async function POST(request: Request) {
  const body = await request.json()
  const { category, amount, description, date } = body as { category: string; amount: number; description?: string; date?: string }
  if (!category || !amount) return NextResponse.json({ error: 'دسته و مبلغ الزامی است' }, { status: 400 })
  const expense = await db.expense.create({
    data: { category, amount, description: description ?? 'ثبت دستی', date: date ? new Date(date) : new Date() },
  })
  return NextResponse.json({ expense })
}
