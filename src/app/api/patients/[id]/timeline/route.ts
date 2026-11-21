import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/** تایم‌لاین بیمار — append-only؛ تاریخچه با ویرایش از بین نمی‌رود */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role === 'PATIENT' && session.patientId !== id)
    return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const { searchParams } = new URL(_request.url)
  const take = Math.min(200, Math.max(1, Number(searchParams.get('take') ?? 100)))
  const type = searchParams.get('type')

  const events = await db.timelineEvent.findMany({
    where: { patientId: id, ...(type ? { type } : {}) },
    orderBy: { createdAt: 'desc' },
    take,
  })
  return NextResponse.json({ events })
}
