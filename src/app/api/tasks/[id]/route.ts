import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
}
