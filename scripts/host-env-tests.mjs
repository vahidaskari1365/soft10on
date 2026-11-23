/**
 * اثبات سناریوی هاست — سرور production standalone (دقیقاً مثل استقرار واقعی):
 *
 * S1) بدون DATABASE_URL و بدون AUTH_SECRET — همان حالتی که پیام
 *     «خطای سرور — تنظیمات محیطی هاست» می‌داد: هر ۴ کلید ورود سریع باید
 *     بدون هیچ تنظیمات وارد کنند، نشست کوکی امضاشده بگیرند و صفحات پاسخ دهند.
 * S2) دیتابیس تنظیم شده ولی AUTH_SECRET ندارد — ورود نمایشی نباید ۵۰۰ بدهد.
 * S3) AUTH_SECRET paste خراب (کل خط با نقل‌قول) — پاک‌سازی محیطی باید نجاتش دهد.
 * S4) AUTH_SECRET سالم (کنترل) — مسیر واقعی و ارتقای نشست دست‌نخورده است.
 * S5) حالت سخت‌گیرانه TENON_REQUIRE_AUTH_SECRET=1 — fail-closed حفظ می‌شود.
 *
 * اجرا: node scripts/host-env-tests.mjs — نیاز به build production قبلی (.next/standalone)
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { assertTestDb, loadTestDbUrl } from './test-env.mjs'

const ROOT = path.resolve(new URL('..', import.meta.url).pathname)
const STANDALONE = path.join(ROOT, '.next', 'standalone')
const SERVER = path.join(STANDALONE, 'server.js')
const EPHEMERAL_SECRET_FILE = '/tmp/tenon-auth-secret'

if (!fs.existsSync(SERVER)) {
  console.error('BLOCKED: build production یافت نشد — ابتدا `bun run build` (.next/standalone/server.js)')
  process.exit(2)
}

// دیتابیس تست مستقل برای سناریوهای S2–S4 (مانند بقیهٔ سوییت‌ها؛ S1 عمداً بدون DB است)
assertTestDb()
const TEST_DB_URL = loadTestDbUrl()

const results = []
const record = (name, pass, detail = '') => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`)
}

let child = null
function startServer(envOverrides, port) {
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOSTNAME: '127.0.0.1' }
  delete env.DATABASE_URL
  delete env.AUTH_SECRET
  env.TENON_SKIP_DB_ENSURE = '1'
  Object.assign(env, envOverrides)
  child = spawn('bun', ['server.js'], { cwd: STANDALONE, env, stdio: ['ignore', 'pipe', 'pipe'] })
  const logs = []
  child.stdout.on('data', (d) => logs.push(String(d)))
  child.stderr.on('data', (d) => logs.push(String(d)))
  child.logs = logs
  return child
}

async function waitReady(port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`)
      if (res.status < 500) return true
    } catch {
      /* هنوز بالا نیامده */
    }
    await new Promise((r) => setTimeout(r, 700))
  }
  return false
}

async function stopServer() {
  if (!child) return
  const c = child
  child = null
  c.kill('SIGTERM')
  await new Promise((r) => setTimeout(r, 800))
  try {
    if (!c.killed || c.exitCode === null) c.kill('SIGKILL')
  } catch {
    /* پایان یافته */
  }
}

async function login(port, username, password) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  let body = {}
  try {
    body = await res.json()
  } catch {
    /* پاسخ غیر JSON (مثلاً ۵۰۰ strict) */
  }
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  return { status: res.status, body, cookie }
}

const KEYS = [
  { username: 'manager', role: 'ADMIN', label: 'دکتر مدیر' },
  { username: 'doctor', role: 'DOCTOR', label: 'دکتر' },
  { username: 'reception', role: 'RECEPTIONIST', label: 'اپراتور' },
  { username: 'patient', role: 'PATIENT', label: 'بیمار' },
]

const PORT = 3171
try {
  // ————— S1: هاست بدون هیچ تنظیمات (DATABASE_URL و AUTH_SECRET هر دو غایب)
  try {
    fs.rmSync(EPHEMERAL_SECRET_FILE, { force: true })
  } catch {}
  startServer({}, PORT)
  if (!(await waitReady(PORT))) {
    record('S1: سرور production بدون هیچ تنظیمات بالا می‌آید', false, (child?.logs ?? []).join('').slice(-400))
    process.exit(1)
  }
  record('S1: سرور production بدون هیچ تنظیمات بالا می‌آید', true)

  for (const k of KEYS) {
    const r = await login(PORT, k.username, '123456')
    record(
      `S1: کلید «${k.label}» بدون تنظیمات وارد می‌شود و نقش درست دارد`,
      r.status === 200 && r.body?.user?.role === k.role && r.cookie.includes('sina_session='),
      `status=${r.status} role=${r.body?.user?.role ?? '?'}`,
    )
  }

  const op = await login(PORT, 'operator', '123456')
  record(
    'S1: fallback ایستا (operator) نشست بدون DB می‌گیرد',
    op.status === 200 && op.body?.demo === true && op.body?.user?.id?.startsWith('demo-'),
    `status=${op.status} demo=${op.body?.demo}`,
  )
  const wrong = await login(PORT, 'manager', 'wrong-pass')
  record(
    'S1: رمز اشتباه با DB قطع → 503 روشن با راهنمای کلیدهای نمایشی (نه ۵۰۰ مبهم)',
    wrong.status === 503 && wrong.body?.dbDown === true && String(wrong.body?.error ?? '').includes('کلیدهای نمایشی'),
    `status=${wrong.status} dbDown=${wrong.body?.dbDown}`,
  )

  const me = await fetch(`http://127.0.0.1:${PORT}/api/auth/me`, { headers: { cookie: op.cookie } })
  const meBody = await me.json().catch(() => ({}))
  record(
    'S1: نشست نمایشی با /api/auth/me تأیید می‌شود (توکن بدون AUTH_SECRET قابل امضا/تأیید است)',
    me.status === 200 && meBody?.user?.role === 'RECEPTIONIST',
    `status=${me.status} role=${meBody?.user?.role ?? '?'}`,
  )

  const meta = await fetch(`http://127.0.0.1:${PORT}/api/meta`, { headers: { cookie: op.cookie } })
  const metaBody = await meta.json().catch(() => ({}))
  record(
    'S1: /api/meta با نشست نمایشی پاسخ 200 می‌دهد',
    meta.status === 200 && typeof metaBody.demoMode === 'boolean',
    `status=${meta.status}`,
  )

  const page = await (await fetch(`http://127.0.0.1:${PORT}/`)).text()
  const missing = ['دکتر مدیر', 'دکتر', 'اپراتور', 'بیمار'].filter((k) => !page.includes(k))
  record('S1: کلیدهای ورود سریع در صفحهٔ لاگین production دیده می‌شوند', missing.length === 0, missing.join(', ') || 'هر ۴ کلید')

  record(
    'S1: secret تصادفی ephemer ساخته شد (/tmp/tenon-auth-secret)',
    fs.existsSync(EPHEMERAL_SECRET_FILE) && fs.statSync(EPHEMERAL_SECRET_FILE).size >= 43,
  )
  await stopServer()

  // ————— S2: دیتابیس تنظیم شده، AUTH_SECRET ندارد
  startServer({ DATABASE_URL: TEST_DB_URL }, PORT)
  if (!(await waitReady(PORT))) {
    record('S2: سرور با DB و بدون AUTH_SECRET بالا می‌آید', false, (child?.logs ?? []).join('').slice(-400))
    process.exit(1)
  }
  const s2 = await login(PORT, 'manager', '123456')
  record(
    'S2: کلید «دکتر مدیر» با DB و بدون AUTH_SECRET وارد می‌شود',
    s2.status === 200 && s2.body?.user?.role === 'ADMIN' && s2.cookie.includes('sina_session='),
    `status=${s2.status} role=${s2.body?.user?.role ?? '?'}`,
  )
  const s2wrong = await login(PORT, 'manager', 'wrong-pass')
  record('S2: رمز اشتباه با DB در دسترس → 401', s2wrong.status === 401, `status=${s2wrong.status}`)
  const s2me = await fetch(`http://127.0.0.1:${PORT}/api/auth/me`, { headers: { cookie: s2.cookie } })
  const s2meBody = await s2me.json().catch(() => ({}))
  record(
    'S2: نشست با /api/auth/me تأیید می‌شود (بدون AUTH_SECRET هم توکن تأیید می‌شود)',
    s2me.status === 200 && s2meBody?.user?.role === 'ADMIN',
    `status=${s2me.status} role=${s2meBody?.user?.role ?? '?'}`,
  )
  await stopServer()

  // ————— S3: AUTH_SECRET paste خراب (کل خط + نقل‌قول + فاصله)
  startServer({ DATABASE_URL: TEST_DB_URL, AUTH_SECRET: ' AUTH_SECRET="host-paste-secret-0123456789abcdef" ' }, PORT)
  if (!(await waitReady(PORT))) {
    record('S3: سرور با AUTH_SECRET خراب paste شده بالا می‌آید', false, (child?.logs ?? []).join('').slice(-400))
    process.exit(1)
  }
  const s3 = await login(PORT, 'manager', '123456')
  record(
    'S3: AUTH_SECRET paste خراب پاک‌سازی می‌شود و ورود کار می‌کند',
    s3.status === 200 && s3.body?.user?.role === 'ADMIN',
    `status=${s3.status} role=${s3.body?.user?.role ?? '?'}`,
  )
  await stopServer()

  // ————— S4: کنترل — تنظیمات سالم، مسیر واقعی دست‌نخورده
  startServer({ DATABASE_URL: TEST_DB_URL, AUTH_SECRET: 'control-secret-0123456789abcdefghij' }, PORT)
  if (!(await waitReady(PORT))) {
    record('S4: سرور با تنظیمات سالم بالا می‌آید', false, (child?.logs ?? []).join('').slice(-400))
    process.exit(1)
  }
  const s4 = await login(PORT, 'manager', '123456')
  record(
    'S4: با AUTH_SECRET سالم، ورود واقعی (ارتقای نشست) دست‌نخورده است',
    s4.status === 200 && s4.body?.user?.role === 'ADMIN' && !String(s4.body?.user?.id ?? '').startsWith('demo-'),
    `status=${s4.status} id=${s4.body?.user?.id ?? '?'}`,
  )
  await stopServer()

  // ————— S5: حالت سخت‌گیرانه — fail-closed حفظ می‌شود
  startServer({ TENON_REQUIRE_AUTH_SECRET: '1' }, PORT)
  if (!(await waitReady(PORT))) {
    record('S5: سرور سخت‌گیرانه بالا می‌آید', false, (child?.logs ?? []).join('').slice(-400))
    process.exit(1)
  }
  const s5 = await login(PORT, 'manager', '123456')
  record(
    'S5: TENON_REQUIRE_AUTH_SECRET=1 بدون AUTH_SECRET ورود را fail-closed می‌کند',
    s5.status >= 500 && !s5.cookie.includes('sina_session='),
    `status=${s5.status}`,
  )
  await stopServer()
} finally {
  await stopServer()
}

const fails = results.filter((r) => !r.pass).length
console.log(`\n=== ${results.length - fails}/${results.length} PASS ===`)
process.exit(fails ? 1 : 0)
