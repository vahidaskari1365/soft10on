import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { enterTenant, tenantCtxFromUser } from '@/lib/tenant-als'

export async function GET(request: Request) {
  const branchId = new URL(request.url).searchParams.get('branchId') ?? ''
  const demoMode = process.env.DEMO_MODE === '1' || process.env.NODE_ENV !== 'production'
  // ————— کاربر واردشده: فهرست کلینیک خودش با scope خودکار زمینه
  const session = await getSessionUser()
  if (session?.clinicId) {
    const ctx = tenantCtxFromUser(session)
    if (ctx) enterTenant(ctx)
    const [doctors, services] = await Promise.all([
      db.doctor.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      db.service.findMany({ where: { active: true }, orderBy: { price: 'asc' } }),
    ])
    return NextResponse.json({ doctors, services, demoMode })
  }
  // ————— مسیر عمومی: فقط برای شعبهٔ مشخص‌شده تا پزشکان/خدمات همهٔ کلینیک‌ها افشا نشود
  if (!branchId) return NextResponse.json({ doctors: [], services: [], demoMode })
  const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true, clinicId: true, isActive: true } })
  if (!branch || !branch.isActive) return NextResponse.json({ error: 'شعبه یافت نشد' }, { status: 404 })
  const [doctors, services] = await Promise.all([
    db.doctor.findMany({ where: { active: true, branchId }, orderBy: { name: 'asc' } }),
    db.service.findMany({ where: { active: true, clinicId: branch.clinicId }, orderBy: { price: 'asc' } }),
  ])
  return NextResponse.json({ doctors, services, demoMode })
}
