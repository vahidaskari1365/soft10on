import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/** صف انتظار نوبت */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const items = await db.waitlist.findMany({
    where: { status: { in: ['WAITING', 'OFFERED'] } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
      doctor: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json({
    items: items.map((w) => ({
      id: w.id,
      status: w.status,
      priority: w.priority,
      note: w.note,
      createdAt: w.createdAt.toISOString(),
      patient: w.patient,
      doctor: w.doctor,
    })),
  })
}

/** افزودن به صف — { patientId, doctorId?, note?, priority? } یا { name, phone, ... } (بیمار ثبت‌نام‌نشده) */
export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as {
    patientId?: string
    doctorId?: string
    note?: string
    priority?: string
  }

  let patientId = body.patientId
  if (session.role === 'PATIENT') patientId = session.patientId ?? ''
  if (!patientId) return NextResponse.json({ error: 'شناسه بیمار لازم است' }, { status: 400 })

  const item = await db.waitlist.create({
    data: {
      branchId: session.branchId,
      patientId,
      doctorId: body.doctorId || null,
      note: body.note?.trim() || null,
      priority: ['LOW', 'NORMAL', 'URGENT'].includes(body.priority ?? '') ? body.priority! : 'NORMAL',
    },
    include: { patient: { select: { firstName: true, lastName: true } }, doctor: { select: { name: true } } },
  })
  return NextResponse.json({ item: { ...item, createdAt: item.createdAt.toISOString() } }, { status: 201 })
}
