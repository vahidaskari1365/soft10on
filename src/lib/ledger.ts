import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

type Tx = Prisma.TransactionClient

/** کدینگ پیش‌فرض حساب‌ها */
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

/** شماره سند اتمیک — با قفل ردیف SystemMeta داخل تراکنش */
export async function nextJournalNumber(tx: Tx): Promise<number> {
  const meta = await tx.systemMeta.findUnique({ where: { key: 'journal_next_number' } })
  const next = Number(meta?.value ?? 1) || 1
  await tx.systemMeta.upsert({
    where: { key: 'journal_next_number' },
    update: { value: String(next + 1) },
    create: { key: 'journal_next_number', value: String(next + 1) },
  })
  return next
}

export type JournalLineInput = { code: string; debit?: number; credit?: number; detail?: string }

/**
 * ثبت سند دوبل داخل تراکنش caller — جمع بدهکار و بستانکار باید برابر باشد.
 * اعداد صحیح تومان؛ اعشار گرد می‌شود و مبلغ منفی ممنوع است.
 */
export async function postJournal(
  tx: Tx,
  opts: {
    date?: Date
    memo: string
    refType?: string
    refId?: string
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

  const number = await nextJournalNumber(tx)
  const entry = await tx.journalEntry.create({
    data: {
      number,
      date: opts.date ?? new Date(),
      memo: opts.memo,
      refType: opts.refType,
      refId: opts.refId,
      branchId: opts.branchId ?? null,
      status: 'POSTED',
      createdById: opts.createdById ?? null,
      lines: {
        create: await Promise.all(
          lines.map(async (l) => {
            const account = await tx.ledgerAccount.findUnique({ where: { code: l.code } })
            if (!account) throw new Error(`حساب ${l.code} یافت نشد`)
            return { accountId: account.id, debit: l.debit, credit: l.credit, detail: l.detail }
          })
        ),
      },
    },
  })
  return { entryId: entry.id, number: entry.number }
}

/** تراز آزمایشی از اسناد POSTED */
export async function trialBalance(): Promise<{ code: string; name: string; type: string; debit: number; credit: number }[]> {
  const accounts = await db.ledgerAccount.findMany({ orderBy: { code: 'asc' } })
  const entries = await db.journalEntry.findMany({
    where: { status: 'POSTED' },
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
