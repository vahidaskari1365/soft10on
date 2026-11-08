import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/** ویرایش/حذف یک سطر پایگاه دانش */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
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
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const { id } = await params
  await db.knowledgeBase.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
