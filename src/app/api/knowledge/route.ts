import { NextResponse } from 'next/server'
import { tenantHandler, platformHandler } from '@/lib/tenant'
import { db } from '@/lib/db'

/** پایگاه دانش — پرسش‌های متداول که به دستیارها تزریق می‌شود */
export const GET = tenantHandler()(async (_session, _request) => {
  const items = await db.knowledgeBase.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ items })
})

export const POST = tenantHandler('ADMIN')(async (session, request) => {
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
})
