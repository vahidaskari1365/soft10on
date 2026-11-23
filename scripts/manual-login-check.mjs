#!/usr/bin/env node
// تست دستی مسیرهای ورود (با DB بالا) — خروجی: PASS/FAIL هر مورد
const BASE = 'http://localhost:3000'
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
const checks = []
const rec = (n, ok, d = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' :: ' + d : ''}`) }

// کلیدهای UI — نشست واقعی (DB بالا، seed موجود)
for (const [u, role, label] of [['manager','ADMIN','دکتر مدیر'],['doctor','DOCTOR','دکتر'],['reception','RECEPTIONIST','اپراتور'],['patient','PATIENT','بیمار'],['reception2','RECEPTIONIST','منشی ولیعصر']]) {
  const r = await login(u, '123456')
  rec(`کلید «${label}»`, r.status === 200 && r.body?.user?.role === role, `status=${r.status} role=${r.body?.user?.role}`)
}
// fallback — فقط-ایستا
const op = await login('operator', '123456')
rec('fallback operator', op.status === 200 && op.body?.demo === true && op.body?.user?.id?.startsWith('demo-'), `status=${op.status} demo=${op.body?.demo}`)
// meta با کوکی دمو
const meta = await fetch(`${BASE}/api/meta`, { headers: { cookie: op.cookie } })
rec('meta با کوکی دمو', meta.status === 200, `status=${meta.status}`)
// رمزهای غلط
rec('operator رمز غلط → 401', (await login('operator', 'x')).status === 401)
rec('manager رمز غلط → 401', (await login('manager', 'wrong-pass-123')).status === 401)
rec('نام‌کاربری ناشناخته → 401', (await login('no_such_rl', 'wrong')).status === 401)
console.log(checks.every(Boolean) ? '=== ALL OK ===' : '=== HAS FAILURES ===')
process.exit(checks.every(Boolean) ? 0 : 1)
