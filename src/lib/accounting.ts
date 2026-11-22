import { db } from '@/lib/db'
import { monthKeyStart, monthKeyEnd } from '@/lib/jalali'

// ------------------------------------------------------------------
// حسابداری 10on — موجودی صندوق، وضعیت فاکتور، چک‌ها و حقوق
// همه‌ی مبالغ تومان و تاریخ‌ها UTC
// ------------------------------------------------------------------

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'نقدی',
  CARD: 'کارت به کارت',
  POS: 'کارت‌خوان',
  ONLINE: 'درگاه آنلاین',
  TRANSFER: 'انتقال بین حساب',
  CHECK: 'چک',
}

export const INVOICE_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'پیش‌نویس', color: 'bg-stone-100 text-stone-600 border-stone-200' },
  ISSUED: { label: 'صادرشده', color: 'bg-sky-100 text-sky-800 border-sky-200' },
  PARTIAL: { label: 'پرداخت جزئی', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  PAID: { label: 'تسویه‌شده', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  CANCELLED: { label: 'ابطال‌شده', color: 'bg-rose-100 text-rose-700 border-rose-200' },
}

export const CHECK_STATUS: Record<string, { label: string; color: string }> = {
  IN_HAND: { label: 'در جریان', color: 'bg-sky-100 text-sky-800 border-sky-200' },
  DEPOSITED: { label: 'خرج شده به بانک', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  CLEARED: { label: 'وصول‌شده', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  BOUNCED: { label: 'برگشتی', color: 'bg-rose-100 text-rose-700 border-rose-200' },
  CANCELLED: { label: 'ابطال‌شده', color: 'bg-stone-100 text-stone-600 border-stone-200' },
}

/** موجودی فعلی هر حساب: موجودی افتتاحیه + واریز - برداشت */
export async function cashBalances(branchId?: string | null) {
  const br = branchId ? { branchId } : {}
  const accounts = await db.cashAccount.findMany({
    where: { isActive: true, ...br },
    orderBy: { createdAt: 'asc' },
  })
  const payments = await db.payment.findMany({
    where: { cashAccountId: { not: null }, ...br },
    select: { cashAccountId: true, direction: true, amount: true, method: true },
  })
  const checks = await db.check.findMany({
    where: { status: 'CLEARED', cashAccountId: { not: null }, ...br },
    select: { cashAccountId: true, direction: true, amount: true },
  })

  const balances = new Map<string, number>()
  for (const a of accounts) balances.set(a.id, a.openingBalance)
  for (const p of payments) {
    if (!p.cashAccountId) continue
    const cur = balances.get(p.cashAccountId) ?? 0
    balances.set(p.cashAccountId, cur + (p.direction === 'IN' ? p.amount : -p.amount))
  }
  for (const c of checks) {
    if (!c.cashAccountId) continue
    // چک دریافتیِ وصول‌شده به حساب اضافه می‌شود؛ چک صادره از حساب کم می‌شود
    const cur = balances.get(c.cashAccountId) ?? 0
    balances.set(c.cashAccountId, cur + (c.direction === 'RECEIVED' ? c.amount : -c.amount))
  }

  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    bankName: a.bankName,
    accountNo: a.accountNo,
    branchId: a.branchId,
    opening: a.openingBalance,
    balance: balances.get(a.id) ?? a.openingBalance,
  }))
}

export type CashBalance = Awaited<ReturnType<typeof cashBalances>>[number]

/** شماره فاکتور بعدی */
import { Prisma } from '@prisma/client'

/**
 * شماره فاکتور اتمیک per-clinic — قفل ردیف شمارنده (UPDATE ... RETURNING) در تراکنش.
 * Constraint یکتای (clinicId, number) تضمین نهایی یکتایی است.
 */
export async function nextInvoiceNumber(tx: Prisma.TransactionClient, clinicId: string): Promise<number> {
  const key = `invoice_next:${clinicId}`
  const ensured = await tx.$queryRaw<{ value: string }[]>(
    Prisma.sql`UPDATE "public"."SystemMeta" SET value = (COALESCE(value::bigint, 0) + 1)::text WHERE key = ${key} RETURNING value`,
  )
  if (ensured.length > 0) return Number(ensured[0].value)

  const agg = await tx.invoice.aggregate({ _max: { number: true }, where: { clinicId } })
  const seed = agg._max.number ?? 14000
  await tx.$executeRaw(Prisma.sql`INSERT INTO "public"."SystemMeta" ("key", "value") VALUES (${key}, ${String(seed)}) ON CONFLICT ("key") DO NOTHING`)
  const rows = await tx.$queryRaw<{ value: string }[]>(
    Prisma.sql`UPDATE "public"."SystemMeta" SET value = (COALESCE(value::bigint, 0) + 1)::text WHERE key = ${key} RETURNING value`,
  )
  if (rows.length === 0) throw new Error('خطای شماره‌گذاری فاکتور')
  return Number(rows[0].value)
}

/** به‌روزرسانی وضعیت پرداخت فاکتور — ترجیحاً داخل همان تراکنش ثبت پرداخت (tx) */
export async function refreshInvoiceStatus(invoiceId: string, tx?: Prisma.TransactionClient) {
  const client = tx ?? db
  const invoice = await client.invoice.findFirst({ where: { id: invoiceId }, include: { payments: { where: { refType: 'INVOICE' } } } })
  if (!invoice || invoice.status === 'CANCELLED' || invoice.status === 'DRAFT') return invoice?.status ?? null
  const paid = invoice.payments.reduce((s, p) => s + p.amount, 0)
  const status = paid <= 0 ? 'ISSUED' : paid >= invoice.total - 0.5 ? 'PAID' : 'PARTIAL'
  if (status !== invoice.status) {
    await client.invoice.update({ where: { id: invoiceId }, data: { status } })
  }
  return status
}

/** کارانه‌ی ماه پزشکان بر اساس نوبت‌های DONE */
export async function doctorCommissions(monthKey: string, branchId?: string | null) {
  const start = monthKeyStart(monthKey)
  const end = monthKeyEnd(monthKey)
  const appts = await db.appointment.findMany({
    where: { start: { gte: start, lt: end }, status: 'DONE', ...(branchId ? { branchId } : {}) },
    select: { price: true, doctorId: true, doctor: { select: { id: true, name: true, commissionRate: true } } },
  })
  const byDoctor = new Map<string, { doctorId: string; name: string; rate: number; done: number; revenue: number; commission: number }>()
  for (const a of appts) {
    const cur = byDoctor.get(a.doctorId) ?? {
      doctorId: a.doctorId,
      name: a.doctor.name,
      rate: a.doctor.commissionRate,
      done: 0,
      revenue: 0,
      commission: 0,
    }
    cur.done++
    cur.revenue += a.price
    cur.commission += a.price * a.doctor.commissionRate
    byDoctor.set(a.doctorId, cur)
  }
  return [...byDoctor.values()].sort((a, b) => b.commission - a.commission)
}

/** چک‌های سررسیدنزدیک (هفت روز آینده) یا برگشتی — برای هشدار */
export async function urgentChecks(branchId?: string | null) {
  const now = new Date()
  const in7 = new Date(now.getTime() + 7 * 24 * 3600 * 1000)
  const br = branchId ? { branchId } : {}
  return db.check.findMany({
    where: {
      ...br,
      status: { in: ['IN_HAND', 'DEPOSITED'] },
      OR: [{ dueDate: { lte: in7 } }, { status: 'IN_HAND' }],
    },
    orderBy: { dueDate: 'asc' },
    take: 20,
    include: { patient: { select: { firstName: true, lastName: true } } },
  })
}
