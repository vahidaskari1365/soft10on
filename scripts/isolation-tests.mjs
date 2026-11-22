#!/usr/bin/env node
/**
 * تست‌های ایزولاسیون عمیق — فاز ۲ مأموریت (کلینیک A و B + سه شعبه)
 * پوشش: خواندن/به‌روزرسانی/حذف/Upsert بین‌Tenant، branchId جعلی، دانلود سند، پزشک، شعبه
 * اجرا: node scripts/isolation-tests.mjs   (سرور dev باید روشن باشد)
 */
import { assertTestDb, loadTestDbUrl } from './test-env.mjs'
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
const login = async (u, p) => (await api('/api/auth/login', { method: 'POST', body: { username: u, password: p } })).cookie
const { randomBytes, scryptSync } = await import('node:crypto')
const stamp = randomBytes(4).toString('hex')
const mkHash = (p) => { const salt = randomBytes(8).toString('hex'); return `${salt}:${scryptSync(p, salt, 32).toString('hex')}` }
const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient({ log: [], datasources: { db: { url: loadTestDbUrl() } } })

// ————— setup: دو کلینیک، سه شعبه در A، یک شعبه در B
const superCookie = await login('super', '123456')
const cA = (await api('/api/clinics', { method: 'POST', cookie: superCookie, body: { name: `A-${stamp}` } })).data.clinic
const cB = (await api('/api/clinics', { method: 'POST', cookie: superCookie, body: { name: `B-${stamp}` } })).data.clinic
const a1 = await db.branch.create({ data: { code: `A1${stamp}`, name: 'A-شعبه۱', city: 'تهران', address: 'x', phone: '02100000011', clinicId: cA.id } })
const a2 = await db.branch.create({ data: { code: `A2${stamp}`, name: 'A-شعبه۲', city: 'تهران', address: 'x', phone: '02100000012', clinicId: cA.id } })
const a3 = await db.branch.create({ data: { code: `A3${stamp}`, name: 'A-شعبه۳', city: 'تهران', address: 'x', phone: '02100000013', clinicId: cA.id } })
const b1 = await db.branch.create({ data: { code: `B1${stamp}`, name: 'B-شعبه۱', city: 'تهران', address: 'x', phone: '02100000014', clinicId: cB.id } })
const pw = 'Iso-' + stamp
const adminA = await db.user.create({ data: { username: `adA${stamp}`, password: mkHash(pw), fullName: 'مدیر A', role: 'ADMIN', clinicId: cA.id, branchId: null, active: true } })
const recA = await db.user.create({ data: { username: `rcA${stamp}`, password: mkHash(pw), fullName: 'پذیرش A', role: 'RECEPTIONIST', clinicId: cA.id, branchId: a1.id, active: true } })
const adminB = await db.user.create({ data: { username: `adB${stamp}`, password: mkHash(pw), fullName: 'مدیر B', role: 'ADMIN', clinicId: cB.id, branchId: null, active: true } })
const docA1 = await db.doctor.create({ data: { name: 'دکتر A1', specialty: 'عمومی', commissionRate: 0.4, branchId: a1.id, active: true } })
const svcA = await db.service.create({ data: { name: 'خدمت A', category: 'عمومی', price: 150000, durationMin: 30, clinicId: cA.id, active: true } })
const patA1 = await db.patient.create({ data: { firstName: 'بیمار', lastName: `A-${stamp}`, phone: `0936${stamp}1`, clinicId: cA.id } })
const cookieA = await login(adminA.username, pw)
const cookieRecA = await login(recA.username, pw)
const cookieB = await login(adminB.username, pw)
record('ورود مدیران A و B', !!cookieA && !!cookieB)

// رکوردهای B (فقط مستقیم در DB تا مالکیت مطلق معلوم باشد)
const patB = await db.patient.create({ data: { firstName: 'بیمار', lastName: `B-${stamp}`, phone: `0935${stamp}1`, clinicId: cB.id } })
const docB = await db.doctor.create({ data: { name: 'دکتر B', specialty: 'عمومی', commissionRate: 0.4, branchId: b1.id, active: true } })
const svcB = await db.service.create({ data: { name: 'خدمت B', category: 'عمومی', price: 100000, durationMin: 30, clinicId: cB.id, active: true } })
const apptB = await db.appointment.create({ data: { clinicId: cB.id, branchId: b1.id, patientId: patB.id, doctorId: docB.id, serviceId: svcB.id, start: new Date(Date.now() + 3 * 86_400_000), status: 'PENDING', price: svcB.price } })
const invB = await db.invoice.create({ data: { clinicId: cB.id, branchId: b1.id, patientId: patB.id, date: new Date(), number: 900000 + Math.floor(Math.random() * 99999), subtotal: 100000, total: 100000, status: 'UNPAID' } })
const docBfile = await db.document.create({ data: { clinicId: cB.id, branchId: b1.id, patientId: patB.id, title: 'سند محرمانه B', kind: 'XRAY', mimeType: 'image/png', sizeBytes: 10, data: Buffer.from('secret-B') } })

// ————— خواندن بین‌Tenant
record('A→بیمار B مسدود', (await api(`/api/patients/${patB.id}`, { cookie: cookieA })).status === 404, `id=${patB.id.slice(-6)}`)
record('A→فاکتور B مسدود', (await api(`/api/invoices/${invB.id}`, { cookie: cookieA })).status === 404)
record('A→پرداخت‌های B در لیست نیست', !JSON.stringify(await api('/api/payments', { cookie: cookieA })).includes(cB.id))
record('A→دانلود سند پزشکی B مسدود', (await api(`/api/documents/${docBfile.id}`, { cookie: cookieA })).status === 404)
record('A→اطلاعات پزشک B مسدود (doctor)', !(JSON.stringify(await api('/api/doctors', { cookie: cookieA })).includes(docB.id)))

// ————— تغییر بین‌Tenant (الگوی امن findFirst→update در extension)
record('A→Update بیمار B مسدود (P2025)', (await api(`/api/patients/${patB.id}`, { method: 'PATCH', cookie: cookieA, body: { firstName: 'هک‌شده' } })).status !== 200)
const patBAfter = await db.patient.findUnique({ where: { id: patB.id } })
record('دیتابیس: نام بیمار B دست‌نخورده', patBAfter.firstName === 'بیمار', `now=${patBAfter.firstName}`)
record('A→Delete بیمار B مسدود', (await api(`/api/patients/${patB.id}`, { method: 'DELETE', cookie: cookieA })).status !== 200)
record('دیتابیس: بیمار B هنوز موجود است', !!(await db.patient.findUnique({ where: { id: patB.id } })))
record('A→Update نوبت B مسدود', (await api(`/api/appointments/${apptB.id}`, { method: 'PATCH', cookie: cookieA, body: { status: 'DONE' } })).status !== 200)
record('A→تغییر شعبهٔ B مسدود', (await api(`/api/branches/${b1.id}`, { method: 'PATCH', cookie: cookieA, body: { name: 'هک B' } })).status !== 200)
record('دیتابیس: نام شعبهٔ B دست‌نخورده', (await db.branch.findUnique({ where: { id: b1.id } })).name === 'B-شعبه۱')

// ————— شناسه‌های جعلی در درخواست
record('clinicId جعلی در create بیمار ← نادیده/مسدود', (await api('/api/patients', { method: 'POST', cookie: cookieA, body: { firstName: 'تزریق', lastName: 'Tenant', phone: `0911${stamp}9`, clinicId: cB.id } })).status !== 200 ||
  !!(await db.patient.findFirst({ where: { phone: `0911${stamp}9`, clinicId: cA.id } })))
record('branchId جعلی در create نوبت مسدود', (await api('/api/appointments', { method: 'POST', cookie: cookieRecA, body: { doctorId: docA1.id, serviceId: svcA.id, patientId: patA1.id, start: new Date(Date.now() + 5 * 86_400_000).toISOString(), branchId: b1.id } })).status !== 201)

// ————— بیمار فقط خودش (پرتال) — و patients استف آر_modules مسدود
const cookiePat = (await api('/api/auth/login', { method: 'POST', body: { username: 'patient', password: '123456' } })).cookie
const portal = await api('/api/portal', { cookie: cookiePat })
const portalStr = JSON.stringify(portal.data)
record('بیمار پرتال خودش را می‌بیند', portal.status === 200)
record('بیمار فهرست staff بیماران را ندارد', (await api('/api/patients', { cookie: cookiePat })).status === 403)

// ————— دسترسی مدیر به همهٔ شعب مجاز و عدم دیدن کلینیک دیگر
const branchesA = await api('/api/branches', { cookie: cookieA })
const bCodes = JSON.stringify(branchesA.data)
record('مدیر A هر سه شعبهٔ خودش را می‌بیند', bCodes.includes(`A1${stamp}`) && bCodes.includes(`A2${stamp}`) && bCodes.includes(`A3${stamp}`))
record('مدیر A شعبهٔ B را نمی‌بیند', !bCodes.includes(`B1${stamp}`))

await db.$disconnect()
const fails = results.filter((r) => !r.pass).length
console.log(`\n=== ${results.length - fails}/${results.length} PASS ===`)
process.exit(fails ? 1 : 0)
