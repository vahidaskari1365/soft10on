#!/usr/bin/env node
/**
 * تست‌های Branch Isolation و Concurrency — فاز ۲/۷/۸
 * اجرا: node scripts/branch-tests.mjs
 * گارد محیط: فقط روی دیتابیس تست مستقل (فاز ۱)
 */
import { assertTestDb } from './test-env.mjs'
assertTestDb()

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
const results = []
function record(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`)
}
async function api(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
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
  const { PrismaClient } = await import('@prisma/client')
  return new PrismaClient({ log: [], datasources: { db: { url: assertTestDb() } } })
}
const { randomBytes, scryptSync } = await import('node:crypto')
const stamp = randomBytes(4).toString('hex')
const mkHash = (p) => { const salt = randomBytes(8).toString('hex'); return `${salt}:${scryptSync(p, salt, 32).toString('hex')}` }

// ---------- setup ----------
const superCookie = await login('super', '123456')
const db = await dbClient()
const clinicRes = await api('/api/clinics', { method: 'POST', cookie: superCookie, body: { name: `برنچ-${stamp}` } })
if (!clinicRes.data?.clinic) { console.error('clinics POST failed:', clinicRes.status, JSON.stringify(clinicRes.data).slice(0, 200)); process.exit(2) }
const clinic = clinicRes.data.clinic
const br1 = await db.branch.create({ data: { code: `B1${stamp}`, name: 'شعبه یک', city: 'تهران', address: 'تهران', phone: '02100000001', clinicId: clinic.id } })
const br2 = await db.branch.create({ data: { code: `B2${stamp}`, name: 'شعبه دو', city: 'تهران', address: 'تهران', phone: '02100000002', clinicId: clinic.id } })
const doc1 = await db.doctor.create({ data: { name: 'دکتر شعبه‌یک', specialty: 'عمومی', commissionRate: 0.4, branchId: br1.id, active: true } })
const doc2 = await db.doctor.create({ data: { name: 'دکتر شعبه‌دو', specialty: 'عمومی', commissionRate: 0.4, branchId: br2.id, active: true } })
const svc = await db.service.create({ data: { name: 'چکاپ برنچ', category: 'دندان‌پزشکی عمومی', price: 200000, durationMin: 30, clinicId: clinic.id, active: true } })
const passR = 'Br-' + stamp
const r1 = await db.user.create({ data: { username: `r1${stamp}`, password: mkHash(passR), fullName: 'پذیرش یک', role: 'RECEPTIONIST', clinicId: clinic.id, branchId: br1.id, active: true } })
const r2 = await db.user.create({ data: { username: `r2${stamp}`, password: mkHash(passR), fullName: 'پذیرش دو', role: 'RECEPTIONIST', clinicId: clinic.id, branchId: br2.id, active: true } })
const adm = await db.user.create({ data: { username: `adm${stamp}`, password: mkHash(passR), fullName: 'مدیر کلینیک تست', role: 'ADMIN', clinicId: clinic.id, branchId: null, active: true } })
const pat = await db.patient.create({ data: { firstName: 'برنچ', lastName: `بیمار-${stamp}`, phone: `0912${stamp}`, clinicId: clinic.id } })

const cookieR1 = await login(r1.username, passR)
const cookieR2 = await login(r2.username, passR)
record('ورود پذیرش‌های دو شعبه', !!cookieR1 && !!cookieR2)

// نوبت‌های اولیه در دو شعبه (مستقیم با دیتابیس برای کنترل مطلق داده)
const day = (n, h) => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n, h, 0, 0)) }
const slotBase = day(2, 10).getTime()
const appt1 = await db.appointment.create({ data: { clinicId: clinic.id, branchId: br1.id, patientId: pat.id, doctorId: doc1.id, serviceId: svc.id, start: new Date(slotBase), status: 'PENDING', price: svc.price } })
const appt2 = await db.appointment.create({ data: { clinicId: clinic.id, branchId: br2.id, patientId: pat.id, doctorId: doc2.id, serviceId: svc.id, start: new Date(slotBase + 3_600_000), status: 'PENDING', price: svc.price } })

// ---------- ۱) جداسازی دادهٔ شعبه ----------
const listR1 = await api(`/api/appointments?branchId=${br1.id}`, { cookie: cookieR1 })
const ids1 = JSON.stringify(listR1.data)
record('پذیرش شعبه ۱ نوبت شعبه ۱ را می‌بیند', listR1.status === 200 && ids1.includes(appt1.id), `status=${listR1.status}`)
record('پذیرش شعبه ۱ نوبت شعبه ۲ را نمی‌بیند', !ids1.includes(appt2.id))
const listR1all = await api('/api/appointments', { cookie: cookieR1 })
record('بدون فیلتر هم شعبه ۲ برای پذیرش ۱ مخفی است', !JSON.stringify(listR1all.data).includes(appt2.id))
const listR2 = await api('/api/appointments', { cookie: cookieR2 })
record('پذیرش شعبه ۲ فقط شعبهٔ خودش را می‌بیند', JSON.stringify(listR2.data).includes(appt2.id) && !JSON.stringify(listR2.data).includes(appt1.id), `status=${listR2.status} has2=${JSON.stringify(listR2.data).includes(appt2.id)} has1=${JSON.stringify(listR2.data).includes(appt1.id)}`)

// ---------- ۲) استفاده از پزشک شعبهٔ دیگر در نوبت ----------
const crossDoc = await api('/api/appointments', { method: 'POST', cookie: cookieR1, body: { doctorId: doc2.id, serviceId: svc.id, patientId: pat.id, start: new Date(day(8, 10)).toISOString() } })
record('نوبت با پزشک شعبهٔ دیگر → رد', crossDoc.status !== 201, `status=${crossDoc.status} ${JSON.stringify(crossDoc.data).slice(0, 60)}`)

// ---------- ۳) دید کلینیک‌گسترده مدیر کلینیک (ADMIN) ----------
const cookieAdm = await login(adm.username, passR)
const listM = await api(`/api/appointments?branchId=${br2.id}`, { cookie: cookieAdm })
const mgmtSeesBoth = JSON.stringify(listM.data).includes(appt2.id)
const listM1 = await api(`/api/appointments?branchId=${br1.id}`, { cookie: cookieAdm })
record('مدیر کلینیک هر دو شعبه را می‌بیند', mgmtSeesBoth && JSON.stringify(listM1.data).includes(appt1.id), `br2=${mgmtSeesBoth} br1=${JSON.stringify(listM1.data).includes(appt1.id)} status=${listM.status}`)

// ---------- ۴) رزرو هم‌زمان یک زمان پزشک ----------
const t0 = day(6, 10)
const body = { doctorId: doc1.id, serviceId: svc.id, patientId: pat.id, start: t0.toISOString() }
const [b1, b2] = await Promise.all([
  api('/api/appointments', { method: 'POST', cookie: cookieR1, body }),
  api('/api/appointments', { method: 'POST', cookie: cookieR1, body }),
])
const wins = [b1, b2].filter((r) => r.status === 201).length
const conflicts = [b1, b2].filter((r) => r.status === 409).length
record('رزرو هم‌زمان یک زمان → دقیقاً یک موفق و یک 409', wins === 1 && conflicts === 1, `201=${wins} 409=${conflicts}`)

// ---------- ۵) رزرو هم‌زمان یک اتاق (۲۰ درخواست — فاز ۷) ----------
const room = await db.roomUnit.create({ data: { name: 'یونیت تست', branchId: br1.id, clinicId: clinic.id, active: true } })
const roomBody = { doctorId: doc1.id, serviceId: svc.id, patientId: pat.id, start: day(10, 10).toISOString(), roomUnitId: room.id }
const roomTries = await Promise.all(Array.from({ length: 20 }, () => api('/api/appointments', { method: 'POST', cookie: cookieR1, body: roomBody })))
const roomWins = roomTries.filter((r) => r.status === 201).length
const roomBookings = await db.appointment.count({ where: { roomUnitId: room.id, start: new Date(day(10, 10)) } })
record('۲۰ رزرو هم‌زمان یک اتاق → فقط یک ثبت واقعی', roomWins === 1 && roomBookings === 1, `201s=${roomWins} dbRows=${roomBookings}`)

// ---------- ۶) فروش هم‌زمان آخرین موجودی ----------
const prod = await db.product.create({ data: { name: `کالای آخر-${stamp}`, code: `P${stamp}`, category: 'مصرفی', purchasePrice: 10000, salePrice: 20000, stockQty: 1, minStock: 0, branchId: br1.id, clinicId: clinic.id, active: true } })
const saleBody = { type: 'SALE', items: [{ productId: prod.id, qty: 1, unitPrice: 20000 }] }
const [s1, s2] = await Promise.all([
  api('/api/inventory', { method: 'POST', cookie: cookieR1, body: saleBody }),
  api('/api/inventory', { method: 'POST', cookie: cookieR1, body: saleBody }),
])
const saleWins = [s1, s2].filter((r) => r.status === 201).length
const stockAfter = await db.$queryRaw`SELECT "stockQty" FROM "Product" WHERE id = ${prod.id}`
record('فروش هم‌زمان آخرین موجودی → فقط یکی موفق', saleWins === 1, `201s=${saleWins}`)
record('موجودی منفی نمی‌شود', Number(stockAfter[0]?.stockQty ?? -1) === 0, `qty=${stockAfter[0]?.stockQty}`)

// cleanup
await db.$disconnect()
const fails = results.filter((r) => !r.pass).length
console.log(`\n=== ${results.length - fails}/${results.length} PASS ===`)
process.exit(fails ? 1 : 0)
