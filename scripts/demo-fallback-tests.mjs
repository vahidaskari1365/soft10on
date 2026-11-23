/**
 * تست مسیر ورود نمایشی — کلیدهای صفحهٔ لاگین بدون وابستگی قطعی به دیتابیس.
 * ۱) ورود واقعی با کاربران seed-شده ترجیح دارد (نقش درست)؛
 * ۲) نام‌کاربری فقط-ایستا (operator که در DB seed نمی‌شود) مسیر fallback نشست بدون DB را اثبات می‌کند؛
 * ۳) رمز اشتباه در مسیر دمو رد می‌شود (حافظه‌ای rate-limit هم فعال)؛
 * ۴) نشست نمایشی کوکی امضاشده دارد و با آن APIها پاسخ می‌دهند.
 * اجرا: node scripts/demo-fallback-tests.mjs (نیازمند dev server روی :3000)
 */
import { assertTestDb, loadTestDbUrl } from './test-env.mjs'
assertTestDb()
loadTestDbUrl()

const BASE = process.env.TENON_BASE_URL || 'http://localhost:3000'
const results = []
const record = (name, pass, detail = '') => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`)
}

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  let body = {}
  try { body = await res.json() } catch {}
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  return { status: res.status, body, cookie }
}

// ————— ۱) کلیدهای صفحهٔ لاگین: کاربر واقعی seed-شده ترجیح دارد (نشست کامل با داده‌ها)
const KEYS = [
  { username: 'manager', role: 'ADMIN', label: 'دکتر مدیر' },
  { username: 'doctor', role: 'DOCTOR', label: 'دکتر' },
  { username: 'reception', role: 'RECEPTIONIST', label: 'اپراتور' },
  { username: 'patient', role: 'PATIENT', label: 'بیمار' },
  { username: 'reception2', role: 'RECEPTIONIST', label: 'منشی ولیعصر' },
]
for (const k of KEYS) {
  const r = await login(k.username, '123456')
  record(
    `کلید «${k.label}» (${k.username}) وارد می‌شود و نقش درست دارد`,
    r.status === 200 && r.body?.user?.role === k.role && !!r.cookie,
    `status=${r.status} role=${r.body?.user?.role ?? '?'}`,
  )
}

// ————— ۲) مسیر fallback بدون DB: نام‌کاربری فقط-ایستا (در DB seed نمی‌شود)
const op = await login('operator', '123456')
record(
  'fallback: ورود نمایشی بدون رکورد DB (operator) نشست ایستا می‌گیرد',
  op.status === 200 && op.body?.demo === true && op.body?.user?.role === 'RECEPTIONIST' && op.body?.user?.id?.startsWith('demo-'),
  `status=${op.status} demo=${op.body?.demo}`,
)
record('کوکی نشست نمایشی صادر شد', op.cookie.includes('sina_session='), op.cookie.slice(0, 30))

// ————— ۳) نشست نمایشی با APIها پاسخ می‌دهد (بدون هیچ کوئری الزامی DB)
const meta = await fetch(`${BASE}/api/meta`, { headers: { cookie: op.cookie } })
const metaBody = await meta.json().catch(() => ({}))
record(
  'نشست نمایشی: /api/meta با کوکی دمو پاسخ 200 می‌دهد',
  meta.status === 200 && typeof metaBody.demoMode === 'boolean',
  `status=${meta.status}`,
)

// ————— ۴) رمز اشتباه در مسیر دمو رد می‌شود (نشست ایستا بدون رمز درست صادر نمی‌شود)
const wrong = await login('operator', 'wrong-pass')
record('fallback با رمز اشتباه → 401', wrong.status === 401, `status=${wrong.status}`)
const wrongReal = await login('manager', 'wrong-pass')
record('کاربر واقعی با رمز اشتباه → 401', wrongReal.status === 401, `status=${wrongReal.status}`)

const fails = results.filter((r) => !r.pass).length
console.log(`\n=== ${results.length - fails}/${results.length} PASS ===`)
process.exit(fails ? 1 : 0)
