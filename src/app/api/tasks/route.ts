import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const now = new Date()
  const tasks = await db.task.findMany({
    include: { patient: { select: { firstName: true, lastName: true } } },
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
  })
  const sorted = [...tasks].sort((a, b) => {
    const done = (t: typeof a) => (t.status === 'DONE' ? 1 : 0)
    const overdue = (t: typeof a) => (t.status !== 'DONE' && t.dueAt < now ? 1 : 0)
    if (done(a) !== done(b)) return done(a) - done(b)
    if (overdue(a) !== overdue(b)) return overdue(b) - overdue(a)
    return a.dueAt.getTime() - b.dueAt.getTime()
  })
  return NextResponse.json({ tasks: sorted })
}

export async function POST(request: Request) {
  const body = await request.json()
  const { title, description, assigneeRole, assigneeName, patientId, dueAt, priority, source } = body as {
    title: string
    description?: string
    assigneeRole?: string
    assigneeName?: string
    patientId?: string
    dueAt?: string
    priority?: string
    source?: string
  }
  if (!title) return NextResponse.json({ error: 'عنوان الزامی است' }, { status: 400 })
  const task = await db.task.create({
    data: {
      title,
      description: description ?? null,
      assigneeRole: assigneeRole ?? 'RECEPTIONIST',
      assigneeName: assigneeName ?? 'سمیرا (منشی)',
      patientId: patientId ?? null,
      dueAt: dueAt ? new Date(dueAt) : new Date(Date.now() + 86400000),
      priority: priority ?? 'MEDIUM',
      source: source ?? 'MANUAL',
    },
  })
  return NextResponse.json({ task })
}
