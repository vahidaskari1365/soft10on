import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { vStr, vEnum, vInt } from '@/lib/validation'
import { logAudit } from '@/lib/audit'

const ROOM_TYPES = ['ROOM', 'UNIT'] as const

/** اتاق‌ها و یونیت‌ها — مشاهده برای کارکنان، مدیریت فقط مدیر */
export async function GET(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const { searchParams } = new URL(request.url)
  const branchId = searchParams.get('branchId') ?? undefined
  const rooms = await db.roomUnit.findMany({
    where: { branchId, ...(session.branchId && session.role !== 'ADMIN' ? { branchId: session.branchId } : {}) },
    include: { branch: { select: { id: true, name: true } } },
    orderBy: [{ branchId: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json({ rooms })
}

export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const name = vStr(body.name, { required: true, min: 2, max: 60, label: 'نام اتاق/یونیت' })
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 })
  const type = vEnum(body.type, ROOM_TYPES, 'نوع')
  if (!type.ok) return NextResponse.json({ error: type.error }, { status: 400 })
  if (!type.value) return NextResponse.json({ error: 'نوع الزامی است' }, { status: 400 })
  const capacity = vInt(body.capacity, { label: 'ظرفیت', min: 1, max: 20 })
  if (!capacity.ok) return NextResponse.json({ error: capacity.error }, { status: 400 })
  let branchId = typeof body.branchId === 'string' && body.branchId ? body.branchId : session.branchId
  if (!branchId) {
    const first = await db.branch.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } })
    branchId = first?.id ?? null
  }
  if (!branchId) return NextResponse.json({ error: 'شعبه الزامی است' }, { status: 400 })
  const branch = await db.branch.findUnique({ where: { id: branchId } })
  if (!branch) return NextResponse.json({ error: 'شعبه یافت نشد' }, { status: 400 })
  const note = vStr(body.note, { label: 'توضیحات', max: 200 })
  if (!note.ok) return NextResponse.json({ error: note.error }, { status: 400 })

  const room = await db.roomUnit.create({
    data: { name: name.value, type: type.value, capacity: capacity.value, branchId, note: note.value || null, active: body.active === undefined ? true : Boolean(body.active) },
  })
  await logAudit({ userId: session.id, userName: session.fullName, action: 'CREATE', entity: 'RoomUnit', entityId: room.id, branchId, clinicId: session.clinicId })
  return NextResponse.json({ room }, { status: 201 })
}

export async function PATCH(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'شناسه لازم است' }, { status: 400 })
  const room = await db.roomUnit.findUnique({ where: { id } })
  if (!room) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const data: Record<string, string | number | boolean | null> = {}
  if (body.name !== undefined) {
    const v = vStr(body.name, { required: true, min: 2, max: 60, label: 'نام' })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    data.name = v.value
  }
  if (body.type !== undefined) {
    const v = vEnum(body.type, ROOM_TYPES, 'نوع')
    if (!v.ok || !v.value) return NextResponse.json({ error: 'نوع نامعتبر است' }, { status: 400 })
    data.type = v.value
  }
  if (body.capacity !== undefined) {
    const v = vInt(body.capacity, { label: 'ظرفیت', min: 1, max: 20 })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    data.capacity = v.value
  }
  if (body.active !== undefined) data.active = Boolean(body.active)
  if (body.note !== undefined) {
    const v = vStr(body.note, { label: 'توضیحات', max: 200 })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    data.note = v.value || null
  }
  const updated = await db.roomUnit.update({ where: { id }, data })
  await logAudit({ userId: session.id, userName: session.fullName, action: 'UPDATE', entity: 'RoomUnit', entityId: id, branchId: room.branchId, clinicId: session.clinicId })
  return NextResponse.json({ room: updated })
}

export async function DELETE(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'شناسه لازم است' }, { status: 400 })
  const room = await db.roomUnit.findUnique({ where: { id }, include: { appointments: { where: { status: { in: ['REQUESTED', 'PENDING', 'CONFIRMED', 'ARRIVED', 'IN_VISIT'] } }, select: { id: true } } } })
  if (!room) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  if (room.appointments.length) return NextResponse.json({ error: 'اتاق نوبت فعال دارد؛ ابتدا آن‌ها را منتقل کنید' }, { status: 409 })
  await db.roomUnit.update({ where: { id }, data: { active: false } })
  await logAudit({ userId: session.id, userName: session.fullName, action: 'DELETE', entity: 'RoomUnit', entityId: id, branchId: room.branchId, clinicId: session.clinicId })
  return NextResponse.json({ ok: true })
}
