#!/usr/bin/env node
/**
 * تست‌های امنیتی فاز ۱۲ — Session، Idempotency per-clinic، Rate Limit، IDOR مالی/اسناد
 * اجرا: node scripts/auth-security-tests.mjs [baseURL]
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
async function dbClient() {
  const fs = await import('node:fs')
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = fs.readFileSync(fs.existsSync('.env.local') ? '.env.local' : '.env', 'utf8').match(/^DATABASE_URL="?([^"\n]+)"?/m)[1].trim()
  }
  const { PrismaClient } = await import('@prisma/client')
  const db = new PrismaClient()
  return db
}

const { randomBytes, scryptSync } = await import('node:crypto')
const stamp = randomBytes(4).toString('hex')

// ---------- setup: دو کلینیک + کاربر + بیمار + فاکتور + صندوق + سند ----------
const mCookie = await login('super', '123456')
const db = await dbClient()
const cA = await api('/api/clinics', { method: 'POST', cookie: mCookie, body: { name: `سکیور A-${stamp}` } })
const cB = await api('/api/clinics', { method: 'POST', cookie: mCookie, body: { name: `سکیور B-${stamp}` } })
const mkUser = async (clinicId, tag) => {
  const salt = randomBytes(8).toString('hex')
  const pass = 'Sec-' + tag + '-' + stamp
  const hash = `${salt}:${scryptSync(pass, salt, 32).toString('hex')}`
  const u = await db.user.create({ data: { username: `sec${tag}${stamp}`, password: hash, fullName: 'کاربر امنیتی', role: 'ADMIN', clinicId, active: true } })
  return { user: u, pass }
}
const A = await mkUser(cA.data.clinic.id, 'a')
const B = await mkUser(cB.data.clinic.id, 'b')
const brA = await db.branch.create({ data: { code: `SA${stamp}`, name: 'شعبه امنیتی', city: 'تهران', address: 'تهران', phone: '02100000001', clinicId: cA.data.clinic.id } })
const cashA = await db.cashAccount.create({ data: { name: `صندوق ${stamp}`, type: 'CASH', openingBalance: 0, branchId: brA.id, clinicId: cA.data.clinic.id, isActive: true } })
const patA = await db.patient.create({ data: { firstName: 'امنیتی', lastName: `بیمار-${stamp}`, phone: `0913${stamp}`, clinicId: cA.data.clinic.id } })
const invA = await db.invoice.create({ data: { number: 930000 + Math.floor(Math.random() * 69999), subtotal: 80000, total: 80000, status: 'ISSUED', patientId: patA.id, clinicId: cA.data.clinic.id, branchId: brA.id, date: new Date() } })
const docA = await db.document.create({ data: { patientId: patA.id, clinicId: cA.data.clinic.id, kind: 'MEDICAL', title: 'سند محرمانه A', mimeType: 'application/pdf', sizeBytes: 128, data: new Uint8Array(128), branchId: brA.id } })
await db.$disconnect()

const cookieA = await login(A.user.username, A.pass)
const cookieB = await login(B.user.username, B.pass)
record('ورود A و B', !!cookieA && !!cookieB)

// ---------- ۱) IDOR اسناد پزشکی ----------
const docLeak = await api(`/api/documents/${docA.id}`, { cookie: cookieB })
record('IDOR سند: B→سند A مسدود', docLeak.status === 404 || docLeak.status === 403, `status=${docLeak.status}`)
const docOwn = await api(`/api/documents/${docA.id}`, { cookie: cookieA })
record('دسترسی مجاز: A→سند خودش', docOwn.status === 200, `status=${docOwn.status}`)

// ---------- ۲) IDOR لیست پرداخت ----------
const payLeak = await api('/api/payments?month=2026-11', { cookie: cookieB })
record('IDOR پرداخت: لیست B شامل پرداخت A نیست', payLeak.status !== 200 || !JSON.stringify(payLeak.data).includes('تست'), `status=${payLeak.status}`)

// ---------- ۳) Idempotency per-clinic ----------
const key = randomBytes(8).toString('hex')
const m1 = await api('/api/payments', { method: 'POST', cookie: cookieA, body: { direction: 'IN', amount: 30000, method: 'CASH', cashAccountId: cashA.id, patientId: patA.id, description: 'پرداخت امنیتی', idempotencyKey: key } })
record('پرداخت با کلید جدید → 201', m1.status === 201, `status=${m1.status}`)
// همان کلید در کلینیک B — باید مستقل باشد (پرداخت جدید در B یا خطای صندوق؛ نه بازگشت پرداخت A)
const m2 = await api('/api/payments', { method: 'POST', cookie: cookieB, body: { direction: 'IN', amount: 30000, method: 'CASH', cashAccountId: cashA.id, patientId: patA.id, description: 'پرداخت امنیتی', idempotencyKey: key } })
const leakedViaIdem = m2.status === 200 && m2.data?.duplicate === true
record('کلید یکسان در کلینیک دیگر → تداخل/افشا نیست', !leakedViaIdem, `status=${m2.status} (${m2.data?.error ?? ''}`.slice(0, 60) + ')')
// کلید تکراری با مبلغ متفاوت در همان کلینیک → 409
const m3 = await api('/api/payments', { method: 'POST', cookie: cookieA, body: { direction: 'IN', amount: 45000, method: 'CASH', cashAccountId: cashA.id, patientId: patA.id, description: 'پرداخت امنیتی', idempotencyKey: key } })
record('کلید تکراری با مبلغ متفاوت → 409', m3.status === 409, `status=${m3.status}`)
// کلید تکراری با همان محتوا → duplicate بدون ایجاد رکورد جدید
const m4 = await api('/api/payments', { method: 'POST', cookie: cookieA, body: { direction: 'IN', amount: 30000, method: 'CASH', cashAccountId: cashA.id, patientId: patA.id, description: 'پرداخت امنیتی', idempotencyKey: key } })
record('کلید تکراری همان محتوا → duplicate', m4.status === 200 && m4.data?.duplicate === true, `status=${m4.status}`)
// هم‌زمانی: دو درخواست هم‌زمان با یک کلید جدید → فقط یک پرداخت
const key2 = randomBytes(8).toString('hex')
const [c1, c2] = await Promise.all([
  api('/api/payments', { method: 'POST', cookie: cookieA, body: { direction: 'IN', amount: 12000, method: 'CASH', cashAccountId: cashA.id, patientId: patA.id, description: 'هم‌زمانی', idempotencyKey: key2 } }),
  api('/api/payments', { method: 'POST', cookie: cookieA, body: { direction: 'IN', amount: 12000, method: 'CASH', cashAccountId: cashA.id, patientId: patA.id, description: 'هم‌زمانی', idempotencyKey: key2 } }),
])
const created = [c1, c2].filter((r) => r.status === 201).length
record('هم‌زمانی یک کلید → فقط یک پرداخت', created === 1, `201s=${created}`)

// ---------- ۴) Session security ----------
const tampered = cookieA.replace(/.$/, (ch) => (ch === 'A' ? 'B' : 'A'))
const t1 = await api('/api/auth/me', { cookie: tampered })
record('توکن دستکاری‌شده → 401', t1.status === 401, `status=${t1.status}`)
const t2 = await api('/api/auth/me', { cookie: cookieA.slice(0, -10) })
record('توکن ناقص → 401', t2.status === 401, `status=${t2.status}`)
// غیرفعال‌سازی → ابطال نشست
const d1 = await dbClient()
await d1.user.update({ where: { id: B.user.id }, data: { active: false } })
await d1.$disconnect()
const t3 = await api('/api/auth/me', { cookie: cookieB })
record('کاربر غیرفعال → نشست رد می‌شود', t3.status === 401, `status=${t3.status}`)

// ---------- ۵) Rate Limit (لاگین: 10/min/IP) ----------
let got429 = false
for (let i = 0; i < 12; i++) {
  const r = await api('/api/auth/login', { method: 'POST', body: { username: 'nonexistent_rl', password: 'wrong' } })
  if (r.status === 429) { got429 = true; break }
}
record('سقف لاگین → 429', got429)

const fails = results.filter((r) => !r.pass).length
console.log(`\n=== ${results.length - fails}/${results.length} PASS ===`)
process.exit(fails ? 1 : 0)
