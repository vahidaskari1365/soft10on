#!/usr/bin/env node
import { assertTestDb, loadTestDbUrl } from './test-env.mjs'
assertTestDb()
const TEST_URL = loadTestDbUrl()

/**
 * تست‌های مالی، هم‌زمانی و انبار روی API واقعی — فاز ۹-۱۰ مأموریت
 * اجرا: node scripts/finance-tests.mjs [baseURL]
 */
const BASE = process.argv[2] ?? 'http://localhost:3000'
const results = []
function record(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`)
}

async function api(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = null
  try { data = await res.json() } catch { data = null }
  return { status: res.status, data, cookie: res.headers.get('set-cookie')?.split(';')[0] }
}
async function login(u, p) {
  return (await api('/api/auth/login', { method: 'POST', body: { username: u, password: p } })).cookie
}
async function rawSql(sql) {
  const { PrismaClient } = await import('@prisma/client')
  const db = new PrismaClient({ log: [], datasources: { db: { url: TEST_URL } } })
  const r = await db.$queryRawUnsafe(sql)
  await db.$disconnect()
  return r
}

const { randomBytes } = await import('node:crypto')
const stamp = randomBytes(4).toString('hex')

// DATABASE_URL باید پیش از اولین import @prisma/client ست شود
{
  const fs = await import('node:fs')
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = fs.readFileSync(fs.existsSync('.env.local') ? '.env.local' : '.env', 'utf8').match(/^DATABASE_URL="?([^"\n]+)"?/m)[1].trim()
  }
}

// ---------- راه‌اندازی: دو کلینیک + کاربر + کالا + بیمار + فاکتور ----------
async function setup() {
  const mCookie = await login('super', '123456')
  const cA = await api('/api/clinics', { method: 'POST', cookie: mCookie, body: { name: `مالی A-${stamp}` } })
  const cB = await api('/api/clinics', { method: 'POST', cookie: mCookie, body: { name: `مالی B-${stamp}` } })
  const { PrismaClient } = await import('@prisma/client')
  const db = new PrismaClient({ log: [], datasources: { db: { url: TEST_URL } } })
  const mk = async (clinicId, tag, pass) => {
    const { scryptSync } = await import('node:crypto')
    const salt = randomBytes(8).toString('hex')
    const hash = `${salt}:${scryptSync(pass, salt, 32).toString('hex')}`
    return db.user.create({ data: { username: `fin${tag}${stamp}`, password: hash, fullName: 'مدیر مالی', role: 'ADMIN', clinicId, active: true } })
  }
  const passA = 'FinA-' + stamp, passB = 'FinB-' + stamp
  await mk(cA.data.clinic.id, 'a', passA)
  await mk(cB.data.clinic.id, 'b', passB)
  const brA = await db.branch.create({ data: { code: `FA${stamp}`, name: 'شعبه مالی A', city: 'تهران', address: 'تهران', phone: '02100000000', clinicId: cA.data.clinic.id } })
  const prodA = await db.product.create({ data: { name: `کالای A-${stamp}`, category: 'TEST', purchasePrice: 20000, salePrice: 50000, stockQty: 5, minStock: 1, branchId: brA.id, clinicId: cA.data.clinic.id } })
  const prodB = await db.product.create({ data: { name: `کالای B-${stamp}`, category: 'TEST', purchasePrice: 10000, salePrice: 30000, stockQty: 2, minStock: 1, branchId: brA.id, clinicId: cA.data.clinic.id } })
  const patA = await db.patient.create({ data: { firstName: 'مالی', lastName: `بیمار-${stamp}`, phone: `0912${stamp.slice(0, 8)}`, clinicId: cA.data.clinic.id } })
  const cashA = await db.cashAccount.create({ data: { name: `صندوق A-${stamp}`, type: 'CASH', openingBalance: 0, branchId: brA.id, clinicId: cA.data.clinic.id, isActive: true } })
  const inv = await db.invoice.create({ data: { number: 910000 + Math.floor(Math.random() * 89999), subtotal: 100000, discount: 0, total: 100000, status: 'ISSUED', patientId: patA.id, clinicId: cA.data.clinic.id, branchId: brA.id, date: new Date() } })
  await db.$disconnect()
  return { cookieA: await login(`fina${stamp}`, passA), cookieB: await login(`finb${stamp}`, passB), prodA: prodA.id, prodB: prodB.id, patA: patA.id, cashA: cashA.id, inv: inv.id, clinicA: cA.data.clinic.id }
}
const S = await setup()

// ---------- ۱) فروش کالا با سند و Audit ----------
const sale = await api('/api/inventory', { method: 'POST', cookie: S.cookieA, body: { type: 'SALE', items: [{ productId: S.prodA, qty: 2, unitPrice: 50000 }], patientId: S.patA } })
record('فروش کالا → 201', sale.status === 201, `status=${sale.status} ${JSON.stringify(sale.data).slice(0, 80)}`)
const stockAfter = await rawSql(`SELECT "stockQty" FROM "Product" WHERE id = '${S.prodA}'`)
record('موجودی پس از فروش = ۳', stockAfter[0]?.stockQty === 3, `qty=${stockAfter[0]?.stockQty}`)

// ---------- ۲) فروش بیش از موجودی (تکی) → رد ----------
const overSale = await api('/api/inventory', { method: 'POST', cookie: S.cookieA, body: { type: 'SALE', items: [{ productId: S.prodA, qty: 99 }] } })
record('فروش بیش از موجودی → 409', overSale.status === 409, `status=${overSale.status}`)

// ---------- ۳) فروش کالای کلینیک دیگر توسط B → ناموجود برای B ----------
const crossSale = await api('/api/inventory', { method: 'POST', cookie: S.cookieB, body: { type: 'SALE', items: [{ productId: S.prodA, qty: 1 }] } })
record('فروش کالای کلینیک دیگر مسدود', crossSale.status !== 201, `status=${crossSale.status}`)

// ---------- ۴) هم‌زمانی: دو فروش از موجودی ۳ (هر کدام qty=2) → فقط یکی موفق ----------
const [s1, s2] = await Promise.all([
  api('/api/inventory', { method: 'POST', cookie: S.cookieA, body: { type: 'SALE', items: [{ productId: S.prodA, qty: 2 }] } }),
  api('/api/inventory', { method: 'POST', cookie: S.cookieA, body: { type: 'SALE', items: [{ productId: S.prodA, qty: 2 }] } }),
])
const stockRace = await rawSql(`SELECT "stockQty" FROM "Product" WHERE id = '${S.prodA}'`)
const okCount = [s1, s2].filter((r) => r.status === 201).length
record('رقابت موجودی: فقط یک فروش موفق', okCount === 1 && stockRace[0]?.stockQty === 1, `ok=${okCount} qty=${stockRace[0]?.stockQty}`)

// ---------- ۵) پرداخت فاکتور جزئی + کامل + بیش از مانده ----------
const pay1 = await api(`/api/invoices/${S.inv}`, { method: 'PATCH', cookie: S.cookieA, body: { action: 'pay', amount: 40000, method: 'CASH', cashAccountId: S.cashA } })
record('پرداخت جزئی ۴۰هزار → ok', pay1.status === 200 && pay1.data?.status === 'PARTIAL', `status=${pay1.status} st=${pay1.data?.status}`)
const overPay = await api(`/api/invoices/${S.inv}`, { method: 'PATCH', cookie: S.cookieA, body: { action: 'pay', amount: 999999, method: 'CASH', cashAccountId: S.cashA } })
record('پرداخت بیش از مانده → 400', overPay.status === 400, `status=${overPay.status}`)
const pay2 = await api(`/api/invoices/${S.inv}`, { method: 'PATCH', cookie: S.cookieA, body: { action: 'pay', amount: 60000, method: 'CASH', cashAccountId: S.cashA } })
record('تسویه کامل → PAID', pay2.status === 200 && pay2.data?.status === 'PAID', `st=${pay2.data?.status}`)
const pay3 = await api(`/api/invoices/${S.inv}`, { method: 'PATCH', cookie: S.cookieA, body: { action: 'pay', amount: 5000, method: 'CASH', cashAccountId: S.cashA } })
record('پرداخت روی فاکتور تسویه‌شده → 400', pay3.status === 400, `status=${pay3.status}`)

// ---------- ۶) Idempotency پرداخت دستی ----------
const idem = randomBytes(8).toString('hex')
const m1 = await api('/api/payments', { method: 'POST', cookie: S.cookieA, body: { direction: 'IN', amount: 25000, method: 'CASH', cashAccountId: S.cashA, patientId: S.patA, description: 'تست idem', idempotencyKey: idem } })
const m2 = await api('/api/payments', { method: 'POST', cookie: S.cookieA, body: { direction: 'IN', amount: 25000, method: 'CASH', cashAccountId: S.cashA, patientId: S.patA, description: 'تست idem', idempotencyKey: idem } })
record('Idempotency: retry همان پرداخت تکراری نمی‌سازد', m1.status === 201 && m2.status === 200 && m2.data?.duplicate === true, `m1=${m1.status} m2=${m2.status}`)

// ---------- ۷) تراز آزمایشی per-clinic: بدهکار = بستانکار ----------
const trial = await api('/api/ledger?view=trial', { cookie: S.cookieA })
record('تراز آزمایشی برقرار (Debit=Credit)', trial.status === 200 && trial.data?.balanced === true, `d=${trial.data?.debit} c=${trial.data?.credit}`)

// ---------- ۸) شماره سند: تولید هم‌زمان ۶ سند → بدون تکرار ----------
const nums = await Promise.all(
  Array.from({ length: 6 }, () =>
    api('/api/ledger', {
      method: 'POST', cookie: S.cookieA,
      body: { memo: `سند هم‌زمانی ${randomBytes(3).toString('hex')}`, lines: [{ code: '1001', debit: 1000 }, { code: '4001', credit: 1000 }] },
    }),
  ),
)
const okNums = nums.filter((n) => n.status === 201).map((n) => n.data.number)
record('۶ سند هم‌زمان → همه موفق', okNums.length === 6, `ok=${okNums.length}`)
const dup = new Set(okNums).size !== okNums.length
record('شماره اسناد یکتا', !dup, `nums=[${okNums.join(',')}]`)

// ---------- ۹) پرداخت هم‌زمان روی ماندهٔ صفر → هر دو رد ----------
const [p1, p2] = await Promise.all([
  api(`/api/invoices/${S.inv}`, { method: 'PATCH', cookie: S.cookieA, body: { action: 'pay', amount: 1000, method: 'CASH', cashAccountId: S.cashA } }),
  api(`/api/invoices/${S.inv}`, { method: 'PATCH', cookie: S.cookieA, body: { action: 'pay', amount: 1000, method: 'CASH', cashAccountId: S.cashA } }),
])
record('پرداخت هم‌زمان روی مانده صفر → هر دو رد', p1.status === 400 && p2.status === 400, `${p1.status}/${p2.status}`)

// ---------- ۱۰) Audit هم‌تراکنش: پرداخت‌ها ردپای دارند ----------
const audits = await rawSql(`SELECT COUNT(*)::int AS c FROM "AuditLog" WHERE "entityId" = '${S.inv}' OR action LIKE 'PAYMENT%'`)
record('Audit عملیات مالی ثبت شده', audits[0]?.c > 0, `count=${audits[0]?.c}`)

const fails = results.filter((r) => !r.pass).length
console.log(`\n=== ${results.length - fails}/${results.length} PASS ===`)
process.exit(fails ? 1 : 0)
