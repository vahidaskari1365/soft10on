import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

type Tx = Prisma.TransactionClient

/** کدینگ پیش‌فرض حساب‌ها (کدینگ مشترک پلتفرم — دادهٔ مالی در JournalEntry با clinicId جداست) */
export const ACC = {
  CASH: '1001',
  BANK: '1002',
  AR: '1101', // حساب‌های دریافتنی
  INVENTORY: '1201',
  AP: '2001',
  EQUITY: '3001',
  SERVICE_REVENUE: '4001',
  PRODUCT_REVENUE: '4002',
  SALES_DISCOUNT: '4101',
  RENT: '5001',
  SALARY: '5002',
  OTHER_EXPENSE: '5003',
  COGS: '5004',
} as const

/**
 * شماره سند اتمیک per-clinic — قفل ردیف شمارنده با UPDATE ... RETURNING در همان تراکنش.
 * شمارنده در SystemMeta با کلید journal_next:{clinicId} نگهداری می‌شود و از بزرگ‌ترین
 * شمارهٔ موجود همان کلینیک بذر می‌گیرد. Constraint یکتای (clinicId, number) تضمین نهایی است.
 */
async function atomicNext(tx: Tx, key: string, table: 'journalEntry' | 'invoice', clinicId: string): Promise<number> {
  // value = «آخرین عدد مصرف‌شده»؛ UPDATE اتمیک همیشه عدد بعدی را قفل و برمی‌گرداند.
  // قفل ردیف تراکنش‌های هم‌زمان را سری می‌کند → دو سند هرگز شمارهٔ یکسان نمی‌گیرند.
  const ensured = await tx.$queryRaw<{ value: string }[]>(
    Prisma.sql`UPDATE "public"."SystemMeta" SET value = (COALESCE(value::bigint, 0) + 1)::text WHERE key = ${key} RETURNING value`,
  )
  if (ensured.length > 0) return Number(ensured[0].value)

  // بذر اولیه = بزرگ‌ترین شمارهٔ موجود همان کلینیک (بدون تخصیص تصادفی)
  const agg =
    table === 'journalEntry'
      ? await tx.journalEntry.aggregate({ _max: { number: true }, where: { clinicId } })
      : await tx.invoice.aggregate({ _max: { number: true }, where: { clinicId } })
  const seed = agg._max.number ?? (table === 'invoice' ? 14000 : 0)
  await tx.$executeRaw(Prisma.sql`INSERT INTO "public"."SystemMeta" ("key", "value") VALUES (${key}, ${String(seed)}) ON CONFLICT ("key") DO NOTHING`)
  const rows = await tx.$queryRaw<{ value: string }[]>(
    Prisma.sql`UPDATE "public"."SystemMeta" SET value = (COALESCE(value::bigint, 0) + 1)::text WHERE key = ${key} RETURNING value`,
  )
  if (rows.length === 0) throw new Error('خطای شماره‌گذاری سند')
  return Number(rows[0].value)
}

/** شماره سند بعدی برای کلینیک — داخل تراکنش caller (اتمیک) */
export async function nextJournalNumber(tx: Tx, clinicId: string): Promise<number> {
  return atomicNext(tx, `journal_next:${clinicId}`, 'journalEntry', clinicId)
}

export type JournalLineInput = { code: string; debit?: number; credit?: number; detail?: string }

/**
 * ثبت سند دوبل داخل تراکنش caller — جمع بدهکار و بستانکار باید برابر باشد.
 * اعداد صحیح تومان؛ اعشار گرد می‌شود و مبلغ منفی ممنوع است.
 * clinicId الزامی است (از session یا branchId استخراج می‌شود) — سند بین‌کلینیکی ممنوع.
 */
export async function postJournal(
  tx: Tx,
  opts: {
    date?: Date
    memo: string
    refType?: string
    refId?: string
    clinicId?: string | null
    branchId?: string | null
    createdById?: string | null
    lines: JournalLineInput[]
  }
): Promise<{ entryId: string; number: number }> {
  const lines = opts.lines
    .map((l) => ({
      code: l.code,
      debit: Math.max(0, Math.round(l.debit ?? 0)),
      credit: Math.max(0, Math.round(l.credit ?? 0)),
      detail: l.detail,
    }))
    .filter((l) => l.debit > 0 || l.credit > 0)
  if (!lines.length) throw new Error('سند بدون آرتیکل مجاز نیست')

  const debitSum = lines.reduce((s, l) => s + l.debit, 0)
  const creditSum = lines.reduce((s, l) => s + l.credit, 0)
  if (debitSum !== creditSum) {
    throw new Error(`سند تراز نیست: بدهکار ${debitSum} ≠ بستانکار ${creditSum}`)
  }

  // تعیین clinicId — بدون آن هیچ سندی ثبت نمی‌شود
  let clinicId = opts.clinicId ?? null
  if (!clinicId && opts.branchId) {
    const br = await tx.branch.findUnique({ where: { id: opts.branchId }, select: { clinicId: true } })
    clinicId = br?.clinicId ?? null
  }
  if (!clinicId) throw new Error('ثبت سند بدون کلینیک مجاز نیست')

  const number = await nextJournalNumber(tx, clinicId)
  const entry = await tx.journalEntry.create({
    data: {
      number,
      date: opts.date ?? new Date(),
      memo: opts.memo,
      refType: opts.refType,
      refId: opts.refId,
      clinicId,
      branchId: opts.branchId ?? null,
      status: 'POSTED',
      createdById: opts.createdById ?? null,
      lines: {
        create: await Promise.all(
          lines.map(async (l) => {
            const account = await tx.ledgerAccount.findUnique({ where: { code: l.code } })
            if (!account) throw new Error(`حساب ${l.code} یافت نشد`)
            return { accountId: account.id, debit: l.debit, credit: l.credit, detail: l.detail }
          }),
        ),
      },
    },
  })
  return { entryId: entry.id, number: entry.number }
}

/** تراز آزمایشی per-clinic — فقط اسناد POSTED همان کلینیک */
export async function trialBalance(
  clinicId: string | null,
): Promise<{ code: string; name: string; type: string; debit: number; credit: number }[]> {
  const accounts = await db.ledgerAccount.findMany({ orderBy: { code: 'asc' } })
  const entries = await db.journalEntry.findMany({
    where: { status: 'POSTED', ...(clinicId ? { clinicId } : {}) },
    include: { lines: true },
  })
  const byCode = new Map<string, { debit: number; credit: number }>()
  for (const e of entries) {
    for (const l of e.lines) {
      const acc = accounts.find((a) => a.id === l.accountId)
      if (!acc) continue
      const cur = byCode.get(acc.code) ?? { debit: 0, credit: 0 }
      cur.debit += l.debit
      cur.credit += l.credit
      byCode.set(acc.code, cur)
    }
  }
  return accounts.map((a) => ({
    code: a.code,
    name: a.name,
    type: a.type,
    debit: byCode.get(a.code)?.debit ?? 0,
    credit: byCode.get(a.code)?.credit ?? 0,
  }))
}
