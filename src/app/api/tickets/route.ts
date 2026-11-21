import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * پشتیبانی پلتفرم (SaaS ops) — ثبت و پیگیری تیکت.
 * ثبت برای همه کارکنان؛ مدیریت وضعیت و پاسخ: ADMIN.
 */
export async function GET(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const tickets = await db.supportTicket.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return NextResponse.json({ tickets })
}

export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const subject = String(body.subject ?? '').trim()
  const text = String(body.body ?? '').trim()
  if (subject.length < 3 || subject.length > 120) return NextResponse.json({ error: 'موضوع باید بین ۳ تا ۱۲۰ نویسه باشد' }, { status: 400 })
  if (text.length < 5 || text.length > 2000) return NextResponse.json({ error: 'متن تیکت باید بین ۵ تا ۲۰۰۰ نویسه باشد' }, { status: 400 })
  const priority = ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(String(body.priority)) ? String(body.priority) : 'NORMAL'
  const category = ['GENERAL', 'BILLING', 'TECHNICAL', 'AI', 'FEATURE'].includes(String(body.category)) ? String(body.category) : 'GENERAL'

  const ticket = await db.supportTicket.create({
    data: { subject, body: text, priority, category, requesterName: session.fullName, clinicName: session.clinicId ?? undefined },
  })
  return NextResponse.json({ ticket }, { status: 201 })
}

export async function PATCH(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'شناسه لازم است' }, { status: 400 })
  const ticket = await db.supportTicket.findUnique({ where: { id } })
  if (!ticket) return NextResponse.json({ error: 'تیکت یافت نشد' }, { status: 404 })

  const data: Record<string, string | object> = {}
  if (body.status !== undefined && ['OPEN', 'IN_PROGRESS', 'ANSWERED', 'CLOSED'].includes(String(body.status))) {
    data.status = String(body.status)
  }
  if (body.assigneeName !== undefined) {
    data.assigneeName = String(body.assigneeName ?? '').trim().slice(0, 80) || ''
  }
  if (body.response !== undefined) {
    const resp = { by: session.fullName, at: new Date().toISOString(), text: String(body.response ?? '').slice(0, 1000) }
    const existing = Array.isArray(ticket.responses) ? (ticket.responses as object[]) : []
    data.responses = [...existing, resp]
    if (!data.status) data.status = 'ANSWERED'
  }
  const updated = await db.supportTicket.update({ where: { id }, data: data as { status?: string; assigneeName?: string; responses?: object } })
  return NextResponse.json({ ticket: updated })
}
