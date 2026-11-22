import { NextResponse } from 'next/server'
import { tenantHandler, platformHandler } from '@/lib/tenant'
import { db } from '@/lib/db'

export const PATCH = tenantHandler()(async (session, request, { params }) => {
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const { id } = await params
  const body = await request.json()
  const { status } = body as { status: string }
  const allowed = ['OPEN', 'IN_PROGRESS', 'DONE', 'BLOCKED']
  if (!allowed.includes(status)) return NextResponse.json({ error: 'وضعیت نامعتبر' }, { status: 400 })
  const task = await db.task.update({
    where: { id },
    data: { status, doneAt: status === 'DONE' ? new Date() : null },
  })
  return NextResponse.json({ task })
})
