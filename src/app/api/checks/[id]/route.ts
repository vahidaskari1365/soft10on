import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { CHECK_STATUS } from '@/lib/accounting'

/** تغییر وضعیت چک — deposit (خرج به بانک)، clear (وصول)، bounce (برگشت)، cancel */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session || session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as { status?: string; cashAccountId?: string }

  const check = await db.check.findUnique({ where: { id } })
  if (!check) return NextResponse.json({ error: 'چک یافت نشد' }, { status: 404 })

  const allowed: Record<string, string> = { deposit: 'DEPOSITED', clear: 'CLEARED', bounce: 'BOUNCED', cancel: 'CANCELLED', hold: 'IN_HAND' }
  const status = allowed[body.status ?? '']
  if (!status) return NextResponse.json({ error: 'وضعیت نامعتبر' }, { status: 400 })

  await db.check.update({
    where: { id },
    data: {
      status,
      ...(body.cashAccountId !== undefined ? { cashAccountId: body.cashAccountId || null } : {}),
    },
  })

  // وصول چک دریافتی → ورود پول به حساب (ثبت خودکار پرداخت)
  if (status === 'CLEARED' && check.direction === 'RECEIVED' && check.cashAccountId) {
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
}
