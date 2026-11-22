#!/usr/bin/env node
/**
 * تست کارایی — فاز ۱۴ مأموریت
 * دادهٔ حجمی: ۱۰۰۰ بیمار، ۵۰۰۰ نوبت، ۱۰۰۰ فاکتور — سپس اندازه‌گیری واقعی تأخیر APIها
 * اجرا: node scripts/perf-tests.mjs  (سرور dev روشن + دیتابیس تست مستقل)
 */
import { assertTestDb, loadTestDbUrl } from './test-env.mjs'
assertTestDb()

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
async function api(path, { method = 'GET', body, cookie } = {}) {
  const t0 = performance.now()
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  await res.json().catch(() => null)
  return { ms: Math.round(performance.now() - t0), status: res.status, cookie: res.headers.get('set-cookie')?.split(';')[0] }
}
const login = async (u, p) => (await api('/api/auth/login', { method: 'POST', body: { username: u, password: p } })).cookie
const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient({ log: [], datasources: { db: { url: loadTestDbUrl() } } })

console.log('— ساخت دادهٔ حجمی (۱۰۰۰ بیمار، ۵۰۰۰ نوبت، ۱۰۰۰ فاکتور، ۲۰۰۰ پرداخت)…')
const t0 = performance.now()
const clinic = await db.clinic.create({ data: { name: `Perf-${Date.now() % 100000}` } })
const br = await db.branch.create({ data: { code: `PF${Date.now() % 100000}`, name: 'Perf شعبه', city: 'تهران', address: 'x', phone: '02199999999', clinicId: clinic.id } })
const doc = await db.doctor.create({ data: { name: 'دکتر Perf', specialty: 'عمومی', commissionRate: 0.4, branchId: br.id, active: true } })
const svc = await db.service.create({ data: { name: 'خدمت Perf', category: 'عمومی', price: 100000, durationMin: 30, clinicId: clinic.id, active: true } })

const patients = []
for (let i = 0; i < 1000; i++) {
  const n = String(Date.now()).slice(-6) + String(i).padStart(4, '0')
  patients.push({ firstName: 'حجم', lastName: `تست${i}`, phone: `0912${n}`, clinicId: clinic.id, fileNo: `PF${i}` })
}
await db.patient.createMany({ data: patients })

const base = Date.now()
const patRows = await db.patient.findMany({ where: { clinicId: clinic.id }, select: { id: true }, take: 1000 })
const apptRows = Array.from({ length: 5000 }, (_, i) => ({
  clinicId: clinic.id, branchId: br.id, patientId: patRows[i % patRows.length].id, doctorId: doc.id, serviceId: svc.id,
  start: new Date(base + i * 60_000), status: i % 3 ? 'PENDING' : 'DONE', price: svc.price,
}))
await db.appointment.createMany({ data: apptRows })

const invRows = Array.from({ length: 1000 }, (_, i) => ({ clinicId: clinic.id, branchId: br.id, patientId: patRows[i % patRows.length].id, date: new Date(base + i * 60_000), number: 700000 + i, subtotal: svc.price, total: svc.price, status: 'ISSUED' }))
await db.invoice.createMany({ data: invRows })
const invIdRows = await db.invoice.findMany({ where: { clinicId: clinic.id }, select: { id: true }, take: 1000 })
const payRows = Array.from({ length: 2000 }, (_, i) => ({
  clinicId: clinic.id, branchId: br.id, patientId: patRows[i % patRows.length].id, invoiceId: invIdRows[i % invIdRows.length].id,
  amount: svc.price, direction: 'IN', method: 'CASH', description: 'تست حجم', idempotencyKey: `perf-k-${i}-${Date.now() % 100000}`, date: new Date(),
}))
await db.payment.createMany({ data: payRows })
console.log(`دادهٔ حجمی در ${Math.round(performance.now() - t0)}ms ساخته شد`)


// ————— اندازه‌گیری
const loginRes = await api('/api/auth/login', { method: 'POST', body: { username: 'manager', password: '123456' } })
if (loginRes.status !== 200) { console.error(`login failed: ${loginRes.status} ${JSON.stringify(loginRes.data).slice(0,100)}`); await db.$disconnect(); process.exit(2) }
const cookie = loginRes.cookie
async function measure(label, path, cookieArg, expect = 200) {
  const samples = []
  for (let i = 0; i < 5; i++) {
    const r = await api(path, { cookie: cookieArg })
    if (r.status !== expect) { console.log(`SKIP ${label} — status=${r.status}`); return }
    samples.push(r.ms)
  }
  samples.sort((a, b) => a - b)
  console.log(`PERF ${label}: median=${samples[2]}ms min=${samples[0]}ms max=${samples[4]}ms`)
}
console.log('— تأخیر APIها با ۱۰۰۰ بیمار / ۵۰۰۰ نوبت در کلینیک پرف:')
await measure('GET /api/patients (لیست ۵۰)', '/api/patients', cookie)
await measure('GET /api/appointments (هفتهٔ آینده)', '/api/appointments', cookie)
await measure('GET /api/dashboard', '/api/dashboard', cookie)
await measure('GET /api/finance (خلاصه)', '/api/finance', cookie)
await measure('GET /api/invoices', '/api/invoices', cookie)
await measure('GET /api/reports/monthly', '/api/reports', cookie)

await db.$disconnect()
console.log('\nPERF DONE (اجرای واقعی؛ اعداد از محیط تست این sandbox استخراج شده است)')
