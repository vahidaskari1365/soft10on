import { NextResponse } from 'next/server'
import { getSessionUser, type SessionUser } from './auth'
import { db } from '@/lib/db'
import { als, tenantCtxFromUser } from './tenant-als'

/** خطای استاندارد API — پیام‌ها جزئیات داخلی را افشا نمی‌کنند */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

type RouteParams = { params: Promise<Record<string, string>> }

/**
 * دروازهٔ استاندارد APIهای Tenant-scoped:
 * ۱) سشن معتبر (کاربر فعال، کلینیک فعال، توکن ابطال‌نشده) — در غیر این صورت 401
 * ۲) نقش مجاز — در غیر این صورت 403
 * ۳) کل بدنهٔ handler داخل als.run اجرا می‌شود تا Prisma (db.ts) همهٔ Queryها
 *    را خودکار به کلینیکِ سشن محدود کند (دفاع مرکزی IDOR).
 */
export function tenantHandler(...roles: string[]) {
  return (
    fn: (session: SessionUser, request: Request, params: RouteParams) => Promise<Response>,
  ): ((request: Request, params: RouteParams) => Promise<Response>) => {
    return async (request, params) => {
      const user = await getSessionUser()
      if (!user) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
      // سلسله‌مراتب نقش: SUPER_ADMIN همهٔ دسترسی‌های سطح کلینیک را نیز دارد
      if (roles.length && !roles.includes(user.role) && user.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
      }
      const ctx = tenantCtxFromUser(user)
      if (!ctx) {
        // کاربر پلتفرمی (بدون کلینیک) از این دروازه عبور نمی‌کند — platformHandler جدا است
        return NextResponse.json({ error: 'این عملیات نیازمند عضویت در کلینیک فعال است' }, { status: 403 })
      }
      return als.run(ctx, () => fn(user, request, params))
    }
  }
}

/** APIهای سراسری پلتفرم — فقط SUPER_ADMIN؛ بدون زمینهٔ کلینیک (دید پلتفرمی) */
export function platformHandler() {
  return (
    fn: (session: SessionUser, request: Request, params: RouteParams) => Promise<Response>,
  ): ((request: Request, params: RouteParams) => Promise<Response>) => {
    return async (request, params) => {
      const user = await getSessionUser()
      if (!user) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
      if (user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
      return fn(user, request, params)
    }
  }
}

/**
 * اعتبارسنجی branchId درخواستی — شعبه باید متعلق به کلینیک کاربر باشد؛
 * کاربر تک‌شعبه‌ای فقط شعبهٔ خودش، مدیر کلینیک (بدون شعبه) همهٔ شعب کلینیک.
 */
export async function assertBranch(session: SessionUser, requestedBranchId?: string | null): Promise<string | null> {
  if (!requestedBranchId) return session.branchId ?? null
  if (session.branchId && requestedBranchId !== session.branchId) {
    throw new HttpError(403, 'دسترسی به این شعبه مجاز نیست')
  }
  if (!session.branchId) {
    // مدیر کلینیک — شعبه باید از همان کلینیک باشد (scope خودکار Extension)
    const br = await db.branch.findFirst({ where: { id: requestedBranchId }, select: { id: true } })
    if (!br) throw new HttpError(403, 'دسترسی به این شعبه مجاز نیست')
  }
  return requestedBranchId
}

/**
 * where غالب Tenant برای استفادهٔ صریح داخل db.$transaction (tx خام بدون Extension).
 * نمونه: tx.invoice.findFirst({ where: tenantWhere(session, { id }) })
 */
export function tenantWhere(
  session: Pick<SessionUser, 'clinicId' | 'role' | 'patientId'>,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const conds: Record<string, unknown>[] = []
  if (session.clinicId) conds.push({ clinicId: session.clinicId })
  if (session.role === 'PATIENT' && session.patientId) conds.push({ patientId: session.patientId })
  if (extra) conds.push(extra)
  return { AND: conds }
}
