import { NextResponse } from 'next/server'
import { tenantHandler, platformHandler } from '@/lib/tenant'
import { db } from '@/lib/db'

/** تایم‌لاین بیمار — append-only؛ تاریخچه با ویرایش از بین نمی‌رود */
export const GET = tenantHandler()(async (session, request, { params }) => {
  const { id } = await params
  if (session.role === 'PATIENT' && session.patientId !== id)
    return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const take = Math.min(200, Math.max(1, Number(searchParams.get('take') ?? 100)))
  const type = searchParams.get('type')

  const events = await db.timelineEvent.findMany({
    where: { patientId: id, ...(type ? { type } : {}) },
    orderBy: { createdAt: 'desc' },
    take,
  })
  return NextResponse.json({ events })
})
