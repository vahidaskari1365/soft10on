import { NextResponse } from 'next/server'
import { tenantHandler, platformHandler } from '@/lib/tenant'
import { db } from '@/lib/db'
import { CHECK_STATUS } from '@/lib/accounting'

/** تغییر وضعیت چک — deposit (خرج به بانک)، clear (وصول)، bounce (برگشت)، cancel */
export const PATCH = tenantHandler()(async (session, request, { params }) => {
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as { status?: string; cashAccountId?: string; sayadiNo?: string }
  const sayadiProvided = body.sayadiNo !== undefined

  const check = await db.check.findUnique({ where: { id } })
  if (!check) return NextResponse.json({ error: 'چک یافت نشد' }, { status: 404 })

  const allowed: Record<string, string> = { deposit: 'DEPOSITED', clear: 'CLEARED', bounce: 'BOUNCED', cancel: 'CANCELLED', hold: 'IN_HAND' }
  const status = allowed[body.status ?? '']
  if (!status && !sayadiProvided) return NextResponse.json({ error: 'وضعیت نامعتبر' }, { status: 400 })

  // ویرایش صیادی (اختیاری، مستقل از تغییر وضعیت) — همان قاعدهٔ ثبت
  let sayadi: string | null | undefined = undefined
  if (sayadiProvided) {
    const digits = (body.sayadiNo ?? '').replace(/[\s-]/g, '')
    if (!digits) sayadi = null
    else if (!/^\d{6,24}$/.test(digits)) return NextResponse.json({ error: 'شمارهٔ صیادی نامعتبر است — فقط رقم (معمولاً ۱۶ رقم)' }, { status: 400 })
    else sayadi = digits
  }

  await db.check.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(sayadiProvided ? { sayadiNo: sayadi } : {}),
      ...(body.cashAccountId !== undefined ? { cashAccountId: body.cashAccountId || null } : {}),
    },
  })

  // وصول چک دریافتی → ورود پول به حساب (ثبت خودکار پرداخت) — فقط بار اول؛ وصول تکراری پرداخت دوباره نمی‌سازد
  if (status === 'CLEARED' && check.status !== 'CLEARED' && check.direction === 'RECEIVED' && check.cashAccountId) {
    await db.payment.create({
      data: {
        branchId: check.branchId,
        date: new Date(),
        direction: 'IN',
        method: 'CHECK',
        amount: check.amount,
        cashAccountId: check.cashAccountId,
        patientId: check.patientId,
        description: `وصول چک شماره ${check.number} (${check.bank})`,
        refType: 'OTHER',
        refId: check.id,
      },
    })
  }

  return NextResponse.json({ ok: true, status, statusFa: CHECK_STATUS[status]?.label })
})
