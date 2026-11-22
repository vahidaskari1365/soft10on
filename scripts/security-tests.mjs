#!/usr/bin/env node
/**
 * تست‌های امنیتی واقعی روی API زنده — Multi-Tenant Matrix + RBAC + IDOR
 * اجرا: node scripts/security-tests.mjs [baseURL]
 * دو کلینیک آزمایشی با کاربران اختصاصی می‌سازد و عبور/نفوذ را می‌سنجد.
 */
const BASE = process.argv[2] ?? 'http://localhost:3000'
const results = []
function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
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

async function login(username, password) {
  const r = await api('/api/auth/login', { method: 'POST', body: { username, password } })
  return r.cookie
}

// ---------- راه‌اندازی: دو کلینیک با مدیر مستقل ----------
const { randomBytes, scryptSync } = await import('node:crypto')
const hash = (p) => {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(p, salt, 32).toString('hex')}`
} // همان قالب src/lib/password.ts — scrypt
const stamp = randomBytes(4).toString('hex')
const passA = 'TstA-' + stamp, passB = 'TstB-' + stamp

async function setup() {
  const mCookie = await login('manager', '123456')
  if (!mCookie) throw new Error('manager login failed')
  const cA = await api('/api/clinics', { method: 'POST', cookie: mCookie, body: { name: `کلینیک تست A-${stamp}` } })
  const cB = await api('/api/clinics', { method: 'POST', cookie: mCookie, body: { name: `کلینیک تست B-${stamp}` } })
  if (cA.status !== 201 || cB.status !== 201) throw new Error('clinic create failed: ' + cA.status + '/' + cB.status)
  // مدیر هر کلینیک — مستقیماً در DB (ایجاد کاربر via API به کلینیک هدف نیاز دارد)
  // DATABASE_URL از .env.local خوانده می‌شود (node خودش env فایل نمی‌خواند)
  const fs = await import('node:fs')
  if (!process.env.DATABASE_URL) {
    const line = fs.readFileSync('.env.local', 'utf8').match(/^DATABASE_URL="?([^"\n]+)"?/m)
    process.env.DATABASE_URL = line[1].trim()
  }
  const { PrismaClient } = await import('@prisma/client')
  const db = new PrismaClient()
  const uA = await db.user.create({ data: { username: `ta${stamp}`, password: hash(passA), fullName: 'مدیر A', role: 'ADMIN', clinicId: cA.data.clinic.id, active: true } })
  const uB = await db.user.create({ data: { username: `tb${stamp}`, password: hash(passB), fullName: 'مدیر B', role: 'ADMIN', clinicId: cB.data.clinic.id, active: true } })
  const pA = await db.patient.create({ data: { firstName: 'بیمار', lastName: 'کلینیک‌A', phone: '09120000001', clinicId: cA.data.clinic.id } })
  const invA = await db.invoice.create({ data: { number: 900000 + Math.floor(Math.random() * 99999), subtotal: 100000, total: 100000, status: 'ISSUED', patientId: pA.id, clinicId: cA.data.clinic.id, date: new Date() } })
  const pB = await db.patient.create({ data: { firstName: 'بیمار', lastName: 'کلینیک‌B', phone: '09120000002', clinicId: cB.data.clinic.id } })
  await db.$disconnect()
  return { cA: cA.data.clinic.id, cB: cB.data.clinic.id, userA: `ta${stamp}`, userB: `tb${stamp}`, passA, passB, pA: pA.id, pB: pB.id, invA: invA.id, mCookie }
}

const S = await setup()
const cookieA = await login(S.userA, S.passA)
const cookieB = await login(S.userB, S.passB)
record('login admin A', !!cookieA)
record('login admin B', !!cookieB)

// ---------- ماتریس Tenant ----------
const listA = await api('/api/patients', { cookie: cookieA })
const listB = await api('/api/patients', { cookie: cookieB })
record('A فقط بیماران A', listA.status === 200 && !JSON.stringify(listA.data).includes('کلینیک‌B'), `count=${listA.data?.patients?.length ?? '?'}`)
record('B فقط بیماران B', listB.status === 200 && !JSON.stringify(listB.data).includes('کلینیک‌A'), `count=${listB.data?.patients?.length ?? '?'}`)

const idorPat = await api(`/api/patients/${S.pA}`, { cookie: cookieB })
record('IDOR: B→پرونده بیمار A مسدود', idorPat.status === 403 || idorPat.status === 404, `status=${idorPat.status}`)
const idorInv = await api(`/api/invoices/${S.invA}`, { cookie: cookieB })
record('IDOR: B→فاکتور A مسدود', idorInv.status === 403 || idorInv.status === 404, `status=${idorInv.status}`)

// تغییر clinicId در بدنه — نباید به کلینیک دیگر بنویسد
const crossCreate = await api('/api/patients', { method: 'POST', cookie: cookieB, body: { firstName: 'نفوذ', lastName: 'آزمون', phone: '09129999999', clinicId: S.cA } })
const crossList = await api('/api/patients', { cookie: cookieA })
const leaked = crossCreate.status === 201 && JSON.stringify(crossList.data).includes('نفوذ')
record('نفوذ با clinicId جعلی در create مسدود', !leaked && (crossCreate.status !== 201 || !JSON.stringify(crossList.data).includes('نفوذ')), `status=${crossCreate.status}`)

// ---------- RBAC ----------
const anon = await api('/api/patients')
record('بدون سشن → 401', anon.status === 401, `status=${anon.status}`)
const patSelf = await api(`/api/patients/${S.pA}`, { cookie: cookieA })
record('مدیر کلینیک A → پرونده بیمار خودش مجاز', patSelf.status === 200, `status=${patSelf.status}`)
const platView = await api(`/api/patients/${S.pA}`, { cookie: S.mCookie })
record('مدیر پلتفرم (کلینیک دیگر) → بیمار کلینیک A مسدود', platView.status === 404 || platView.status === 403, `status=${platView.status}`)

// ---------- خلاصه ----------
const fails = results.filter((r) => !r.pass).length
console.log(`\n=== ${results.length - fails}/${results.length} PASS ===`)
process.exit(fails ? 1 : 0)
