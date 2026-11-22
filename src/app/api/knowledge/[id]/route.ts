import { NextResponse } from 'next/server'
import { tenantHandler, platformHandler } from '@/lib/tenant'
import { db } from '@/lib/db'

/** ویرایش/حذف یک سطر پایگاه دانش */
export const PATCH = tenantHandler('ADMIN')(async (session, request, { params }) => {
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as { question?: string; answer?: string; category?: string; isActive?: boolean }
  const item = await db.knowledgeBase.update({
    where: { id },
    data: {
      ...(body.question !== undefined ? { question: body.question.trim() } : {}),
      ...(body.answer !== undefined ? { answer: body.answer.trim() } : {}),
      ...(body.category !== undefined ? { category: body.category.trim() || 'GENERAL' } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
  })
  return NextResponse.json({ item })
})

export const DELETE = tenantHandler('ADMIN')(async (session, request, { params }) => {
  const { id } = await params
  await db.knowledgeBase.delete({ where: { id } })
  return NextResponse.json({ ok: true })
})
