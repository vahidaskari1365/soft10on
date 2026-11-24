/**
 * نمونه‌های حسابداری — برای دیدن «اعمال هزینه و سود»، «فاکتورهای خرید» و «صیادی چک»
 * Idempotent: هر اجرا فقط نمونه‌های نشان‌دار «نمونهٔ حسابداری —» را می‌سازد (بدون تکرار).
 * اجرا: DATABASE_URL=... bun scripts/seed-finance-samples.ts
 */
import { db } from '../src/lib/db'
import { postJournal, ACC } from '../src/lib/ledger'
import { withTenantContext } from '../src/lib/tenant-als'

const MARK = 'نمونهٔ حسابداری —'

/** سند دوبل فقط روی پستگرس — atomicNext از UPDATE...RETURNING + FOR UPDATE استفاده می‌کند که در sqlite پشتیبانی نمی‌شود */
const IS_SQLITE = (process.env.DATABASE_URL ?? '').startsWith('file:')
type TxLike = Parameters<typeof postJournal>[0]
async function journal(tx: TxLike, opts: Parameters<typeof postJournal>[1]): Promise<unknown> {
  if (IS_SQLITE) return null
  return postJournal(tx, opts)
}

/** پاک‌سازی نمونه‌های قبلی با اسناد و پرداخت‌های وابسته (اجرای مجدد تمیز) */
async function resetSamples() {
  const invs = await db.invoice.findMany({ where: { note: { startsWith: MARK } }, select: { id: true } })
  for (const inv of invs) {
    await db.invoiceItem.deleteMany({ where: { invoiceId: inv.id } })
    await db.journalEntry.deleteMany({ where: { refType: 'INVOICE', refId: inv.id } })
    await db.invoice.delete({ where: { id: inv.id } })
  }
  const chks = await db.check.findMany({ where: { note: { startsWith: MARK } }, select: { id: true } })
  for (const c of chks) {
    await db.payment.deleteMany({ where: { refType: 'OTHER', refId: c.id } })
    await db.check.delete({ where: { id: c.id } })
  }
  const exps = await db.expense.findMany({ where: { description: { startsWith: MARK } }, select: { id: true } })
  for (const e of exps) {
    await db.journalEntry.deleteMany({ where: { refType: 'EXPENSE', refId: e.id } })
    await db.expense.delete({ where: { id: e.id } })
  }
  const purs = await db.purchase.findMany({ where: { supplier: { startsWith: MARK } }, select: { id: true } })
  for (const p of purs) {
    await db.purchaseItem.deleteMany({ where: { purchaseId: p.id } })
    await db.journalEntry.deleteMany({ where: { refType: 'PURCHASE', refId: p.id } })
    await db.purchase.delete({ where: { id: p.id } })
  }
  if (invs.length + chks.length + exps.length + purs.length > 0) console.log('reset:', invs.length, 'invoices,', chks.length, 'checks,', exps.length, 'expenses,', purs.length, 'purchases')
}

async function main() {
  if (process.argv.includes('--reset')) await resetSamples()
  const clinic = await db.clinic.findFirst()
  if (!clinic) { console.error('هیچ کلینیکی یافت نشد — اول seed اصلی را اجرا کنید'); process.exit(1) }

  await withTenantContext(clinic.id, async () => {
    const branch = await db.branch.findFirst({ where: { clinicId: clinic.id } })
    const [doctor, patients, products, cash] = await Promise.all([
      db.doctor.findFirst({ where: { active: true, ...(branch ? { branchId: branch.id } : {}) } }),
      db.patient.findMany({ where: { clinicId: clinic.id }, take: 2, orderBy: { id: 'asc' } }),
      db.product.findMany({ where: { clinicId: clinic.id }, take: 2, orderBy: { id: 'asc' } }),
      db.cashAccount.findFirst({ where: { clinicId: clinic.id, type: 'CASH' } }),
    ])
    if (patients.length === 0 || products.length === 0) {
      console.error('بیمار/محصول نمونه یافت نشد — اول seed اصلی را اجرا کنید'); process.exit(1)
    }
    const activeDoctor = doctor ?? await db.doctor.findFirst({ where: { active: true } })
    if (!activeDoctor) { console.error('هیچ پزشکی یافت نشد'); process.exit(1) }
    const [p1, p2] = patients
    const [prod1, prod2] = products
    const branchId = branch?.id ?? null

    // ———— ۱) فاکتورهای خرید (زنجیرهٔ قیمت تمام‌شده) ————
    const existingPurchases = await db.purchase.count({ where: { supplier: { startsWith: MARK } } })
    if (existingPurchases === 0) {
      const buys = [
        { supplier: `${MARK}پارس تک دنتال`, product: prod1, qty: 10, days: -1 },
        { supplier: `${MARK}آریا ایمپلنت`, product: prod2, qty: 5, days: 0 },
      ]
      for (const b of buys) {
        const total = b.qty * b.product.purchasePrice
        await db.$transaction(async (tx) => {
          const pur = await tx.purchase.create({
            data: {
              clinicId: clinic.id, branchId, date: new Date(Date.now() + b.days * 86400_000),
              supplier: b.supplier, total,
              items: { create: { productId: b.product.id, qty: b.qty, unitPrice: b.product.purchasePrice } },
            },
          })
          // زنجیره: خرید → افزایش موجودی انبار (قیمت خرید همان می‌ماند؛ پایهٔ «جنس پیشنهادی»)
          await tx.product.update({ where: { id: b.product.id }, data: { stockQty: { increment: b.qty } } })
          // بدهکار: انبار | بستانکار: حساب پرداختنی تأمین‌کننده
          await journal(tx, {
            memo: `${MARK}خرید از ${b.supplier} (${b.product.name} ×${b.qty})`,
            refType: 'PURCHASE', refId: pur.id, clinicId: clinic.id, branchId,
            lines: [
              { code: ACC.INVENTORY, debit: total, detail: `${b.product.name} ×${b.qty}` },
              { code: ACC.AP, credit: total, detail: b.supplier },
            ],
          })
        }, { timeout: 20_000, maxWait: 10_000 })
        console.log('purchase sample:', b.supplier, total.toLocaleString('en-US'))
      }
    }

    // ———— ۲) چک‌ها با صیادی ————
    const existingChecks = await db.check.count({ where: { note: { startsWith: MARK } } })
    if (existingChecks === 0) {
      const day = 86400_000
      const samples = [
        { direction: 'RECEIVED', patientId: p1.id, number: 'R1042', sayadi: '1234567890123456', bank: 'بانک ملت', dueDays: 10, amount: 25_000_000, status: 'IN_HAND' },
        { direction: 'RECEIVED', patientId: p2.id, number: 'R1043', sayadi: '6789012345678901', bank: 'بانک صادرات', dueDays: -5, amount: 12_000_000, status: 'CLEARED' },
        { direction: 'ISSUED', patientId: null, number: 'I2087', sayadi: null, bank: 'بانک تجارت', dueDays: 20, amount: 8_500_000, status: 'IN_HAND' },
      ]
      for (const s of samples) {
        const check = await db.check.create({
          data: {
            clinicId: clinic.id, branchId, direction: s.direction, number: s.number, sayadiNo: s.sayadi,
            bank: s.bank, dueDate: new Date(Date.now() + s.dueDays * day), amount: s.amount, status: s.status,
            patientId: s.patientId, supplierName: s.direction === 'ISSUED' ? `${MARK}پارس تک دنتال` : null,
            cashAccountId: cash?.id ?? null, note: `${MARK}چک نمونه`,
          },
        })
        // چک وصول‌شده → پرداخت وصول متناظر (مثل رفتار API) تا صندوق و تراز هم‌خوان بماند
        if (s.status === 'CLEARED' && cash) {
          await db.payment.create({
            data: {
              clinicId: clinic.id, branchId, date: new Date(), direction: 'IN', method: 'CHECK',
              amount: s.amount, cashAccountId: cash.id, patientId: s.patientId,
              description: `وصول چک شماره ${s.number} (${s.bank})`, refType: 'OTHER', refId: check.id,
            },
          })
        }
        console.log('check sample:', s.number, s.amount.toLocaleString('en-US'), s.status)
      }
    }

    // ———— ۳) فاکتورهای نمونه با تفکیک جنس/دستمزد ————
    const existingInvoices = await db.invoice.count({ where: { note: { startsWith: MARK } } })
    if (existingInvoices === 0) {
      const appts = await db.appointment.findMany({
        where: { clinicId: clinic.id, status: 'DONE', ...(activeDoctor ? { doctorId: activeDoctor.id } : {}) },
        orderBy: { start: 'desc' }, take: 2,
        include: { service: { select: { name: true, price: true } } },
      })
      const lastInv = await db.invoice.findFirst({ where: { clinicId: clinic.id }, orderBy: { number: 'desc' } })
      let nextNo = (lastInv?.number ?? 100) + 1
      const rate = activeDoctor.commissionRate || 0.4

      const invSpecs = [
        {
          patient: p1, appt: appts[0], product: prod1, days: 0,
          servicePrice: appts[0]?.service?.price ?? 2_500_000, serviceTitle: appts[0]?.service?.name ?? 'ترمیم کامپوزیت',
          productQty: 2, applied: true,
        },
        {
          patient: p2, appt: appts[1] ?? appts[0], product: prod2, days: -1,
          servicePrice: (appts[1] ?? appts[0])?.service?.price ?? 1_800_000, serviceTitle: (appts[1] ?? appts[0])?.service?.name ?? 'جلسهٔ درمان',
          productQty: 1, applied: false,
        },
      ]

      for (const sp of invSpecs) {
        if (!sp.appt) { console.error('نوبت DONE یافت نشد — فاکتور نمونه رد شد'); break }
        const serviceTotal = sp.servicePrice
        const productTotal = sp.productQty * sp.product.salePrice
        const total = serviceTotal + productTotal
        const material = sp.productQty * sp.product.purchasePrice
        const labor = Math.round(serviceTotal * rate)
        const inv = await db.$transaction(async (tx) => {
          const created = await tx.invoice.create({
            data: {
              clinicId: clinic.id, branchId, number: nextNo++, date: new Date(Date.now() + sp.days * 86400_000),
              status: 'ISSUED', subtotal: total, discount: 0, total,
              patientId: sp.patient.id,
              note: `${MARK}${sp.applied ? 'با اعمال هزینه' : 'بدون اعمال هزینه (برای تست پیشنهاد)'}`,
              items: {
                create: [
                  { kind: 'SERVICE', refId: sp.appt.id, title: sp.serviceTitle, qty: 1, unitPrice: serviceTotal, total: serviceTotal },
                  { kind: 'PRODUCT', refId: sp.product.id, title: sp.product.name, qty: sp.productQty, unitPrice: sp.product.salePrice, total: productTotal },
                ],
              },
            },
            include: { items: true },
          })
          // سند فاکتور — همان قاعدهٔ route اصلی: بدهکار حساب‌های دریافتنی، بستانکار درآمد خدمات/محصول
          await journal(tx, {
            memo: `صدور فاکتور شماره ${created.number}`,
            refType: 'INVOICE', refId: created.id, clinicId: clinic.id, branchId,
            lines: [
              { code: ACC.AR, debit: total, detail: `فاکتور ${created.number}` },
              ...(serviceTotal > 0 ? [{ code: ACC.SERVICE_REVENUE, credit: serviceTotal, detail: `فاکتور ${created.number}` }] : []),
              ...(productTotal > 0 ? [{ code: ACC.PRODUCT_REVENUE, credit: productTotal, detail: `فاکتور ${created.number}` }] : []),
            ],
          })
          return created
        }, { timeout: 20_000, maxWait: 10_000 })
        // اعمال هزینه — یکی اعمال‌شده برای دیدن سود خالص، یکی باز برای تست پیشنهاد سیستم
        if (sp.applied) {
          await db.invoice.update({ where: { id: inv.id }, data: { materialCost: material, laborCost: labor } })
        }
        console.log(`invoice sample: #${inv.number} total=${total.toLocaleString('en-US')} material=${material.toLocaleString('en-US')} labor=${labor.toLocaleString('en-US')} applied=${sp.applied}`)
      }
    }

    // ———— ۴) هزینهٔ بالاسری ماه (برای «سود نهایی») ————
    const existingExpense = await db.expense.count({ where: { description: { startsWith: MARK } } })
    if (existingExpense === 0) {
      const amount = 15_000_000
      await db.$transaction(async (tx) => {
        const exp = await tx.expense.create({
          data: { clinicId: clinic.id, branchId, date: new Date(), category: 'RENT', amount, description: `${MARK}اجارهٔ شعبهٔ اصلی ماه جاری` },
        })
        await journal(tx, {
          memo: `${MARK}اجارهٔ شعبهٔ اصلی`,
          refType: 'EXPENSE', refId: exp.id, clinicId: clinic.id, branchId,
          lines: [
            { code: ACC.RENT, debit: amount, detail: 'RENT' },
            { code: ACC.CASH, credit: amount, detail: 'پرداخت هزینه از صندوق' },
          ],
        })
        return exp
      }, { timeout: 20_000, maxWait: 10_000 })
      console.log('expense sample: RENT', amount.toLocaleString('en-US'))
    }

    console.log('✓ نمونه‌های حسابداری آماده است')
  })
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
