import { NextResponse } from 'next/server'
import { tenantHandler, platformHandler } from '@/lib/tenant'
import { db } from '@/lib/db'

/** گزارش حسابرسی — فقط مدیر؛ فیلتر بر اساس کاربر، موجودیت و عملیات */
export const GET = tenantHandler('ADMIN')(async (session, request) => {
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const take = Math.min(300, Math.max(1, Number(searchParams.get('take') ?? 100)))
  const entity = searchParams.get('entity') ?? undefined
  const action = searchParams.get('action') ?? undefined
  const result = searchParams.get('result') ?? undefined

  const logs = await db.auditLog.findMany({
    where: { ...(entity ? { entity } : {}), ...(action ? { action } : {}), ...(result ? { result } : {}) },
    orderBy: { createdAt: 'desc' },
    take,
    include: { user: { select: { fullName: true, role: true } } },
  })
  return NextResponse.json({ logs })
})
