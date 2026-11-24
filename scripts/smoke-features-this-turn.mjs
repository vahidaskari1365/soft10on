/** smoke دستی تغییرات این turn: تقویم ماهانه + حسابداری (سند دستی، دفتر معین، تراز) */
const BASE = 'http://localhost:3000'

async function api(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = null
  try { data = await res.json() } catch { data = null }
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  return { status: res.status, data, setCookies }
}

function jMonthKey(d) {
  // حدس ساده کافی نیست — از مسیر خود برنامه استفاده می‌کنیم: از روز اول میلادیِ ماه شمسی صرف‌نظر و از API تقویم می‌خوانیم
  return null
}

const login = await api('/api/auth/login', { method: 'POST', body: { username: 'manager', password: '123456' } })
if (!login.data?.user) { console.log('LOGIN FAIL', login.status, JSON.stringify(login.data).slice(0, 120)); process.exit(1) }
const sess = login.setCookies.find((c) => c.startsWith('sina_session='))
const cookie = sess ? sess.split(';')[0] : login.setCookies[0]?.split(';')[0]
console.log('LOGIN ok role=', login.data.user.role, 'cookie=', cookie ? cookie.slice(0, 24) + '…' : 'MISSING')

// ۱) نمای ماهانه: از امروز تا +۴۰ روز (بازهٔ from/to)
const now = new Date()
const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 10))
const to = new Date(from.getTime() + 60 * 86400000)
const month = await api(`/api/appointments?from=${from.toISOString()}&to=${to.toISOString()}`, { cookie })
console.log('MONTH RANGE:', month.status, 'count=', (month.data?.appointments ?? []).length)

// بازهٔ نامعتبر باید 400 بدهد
const bad = await api(`/api/appointments?from=broken&to=${to.toISOString()}`, { cookie })
console.log('BAD RANGE:', bad.status, bad.data?.error ?? '')

// ۲) حسابداری: فهرست حساب‌ها
const accs = await api('/api/ledger?view=accounts', { cookie })
const list = accs.data?.accounts ?? []
console.log('ACCOUNTS:', accs.status, 'count=', list.length, list[0] ? `${list[0].code} ${list[0].name}` : '')
const codeA = list[0]?.code
const codeB = list[1]?.code

// ۳) ثبت سند دستی تراز
const entry = await api('/api/ledger', {
  method: 'POST',
  cookie,
  body: {
    memo: 'سند تست دستی — turn لوگو و تقویم',
    date: new Date().toISOString(),
    lines: [
      { code: codeA, debit: 250000, credit: 0, detail: 'بدهکار تست' },
      { code: codeB, debit: 0, credit: 250000, detail: 'بستانکار تست' },
    ],
  },
})
console.log('POST ENTRY:', entry.status, entry.data?.number ?? entry.data?.error ?? '')

// ۴) سند ناتراز باید رد شود
const badEntry = await api('/api/ledger', {
  method: 'POST',
  cookie,
  body: {
    memo: 'سند ناتراز تست',
    date: new Date().toISOString(),
    lines: [
      { code: codeA, debit: 100, credit: 0 },
      { code: codeB, debit: 0, credit: 500 },
    ],
  },
})
console.log('UNBALANCED REJECT:', badEntry.status, String(badEntry.data?.error ?? '').slice(0, 60))

// ۵) دفتر معین حساب اول
const stmt = await api(`/api/ledger?view=account&code=${encodeURIComponent(codeA)}`, { cookie })
const rows = stmt.data?.rows ?? []
console.log('ACCOUNT STATEMENT:', stmt.status, 'rows=', rows.length, 'lastBalance=', rows.length ? rows[rows.length - 1].balance : '—')

// ۶) تراز آزمایشی پس از سند
const trial = await api('/api/ledger?view=trial', { cookie })
console.log('TRIAL:', trial.status, 'balanced=', trial.data?.balanced, 'Dr=', trial.data?.debit, 'Cr=', trial.data?.credit)

// ۷) دفتر معین حساب ناموجود → 404
const missing = await api('/api/ledger?view=account&code=NOPE999', { cookie })
console.log('MISSING ACCOUNT:', missing.status)
