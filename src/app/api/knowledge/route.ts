import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/** پایگاه دانش — پرسش‌های متداول که به دستیارها تزریق می‌شود */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  const items = await db.knowledgeBase.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ items })
}

export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as { question?: string; answer?: string; category?: string }
  if (!body.question?.trim() || !body.answer?.trim()) {
    return NextResponse.json({ error: 'پرسش و پاسخ هر دو الزامی است' }, { status: 400 })
  }
  const item = await db.knowledgeBase.create({
    data: {
      question: body.question.trim(),
      answer: body.answer.trim(),
      category: body.category?.trim() || 'GENERAL',
    },
  })
  return NextResponse.json({ item }, { status: 201 })
}
