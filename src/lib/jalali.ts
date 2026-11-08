// ---------------- Jalali (Shamsi) calendar utilities ----------------
// Standard jalaali algorithm (based on the well-known jalaali-js, MIT)

function div(a: number, b: number) {
  return ~~(a / b)
}
function mod(a: number, b: number) {
  return a - ~~(a / b) * b
}

const breaks = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097,
  2192, 2262, 2324, 2394, 2456, 3178,
]

function jalCal(jy: number) {
  let bl = breaks.length
  const gy = jy + 621
  let leapJ = -14
  let jp = breaks[0]
  if (jy < jp || jy >= breaks[bl - 1]) throw new Error('Invalid Jalaali year ' + jy)
  let jump = 0
  for (let i = 1; i < bl; i += 1) {
    const jm = breaks[i]
    jump = jm - jp
    if (jy < jm) break
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4)
    jp = jm
  }
  let n = jy - jp
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  let leap = mod(mod(n + 1, 33) - 1, 4)
  if (leap === -1) leap = 4
  return { leap, gy, march }
}

function g2d(gy: number, gm: number, gd: number) {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
  return d
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = div(mod(j, 1461), 4) * 5 + 308
  const gd = div(mod(i, 153), 5) + 1
  const gm = mod(div(i, 153), 12) + 1
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6)
  return { gy, gm, gd }
}

function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy)
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1
}

function d2j(jdn: number) {
  const gy = d2g(jdn).gy
  let jy = gy - 621
  const r = jalCal(jy)
  const jdn1f = g2d(gy, 3, r.march)
  let k = jdn - jdn1f
  if (k >= 0) {
    if (k <= 185) {
      const jm = 1 + div(k, 31)
      const jd = mod(k, 31) + 1
      return { jy, jm, jd }
    } else {
      k -= 186
    }
  } else {
    jy -= 1
    k += 179
    if (r.leap === 1) k += 1
  }
  const jm = 7 + div(k, 30)
  const jd = mod(k, 30) + 1
  return { jy, jm, jd }
}

export function toJalaali(gy: number, gm: number, gd: number) {
  return d2j(g2d(gy, gm, gd))
}

export function toGregorian(jy: number, jm: number, jd: number) {
  return d2g(j2d(jy, jm, jd))
}

export function isLeapJalaaliYear(jy: number) {
  return jalCal(jy).leap === 0
}

export function jalaaliMonthLength(jy: number, jm: number) {
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  return isLeapJalaaliYear(jy) ? 30 : 29
}

// ---------------- friendly helpers ----------------

export const J_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

export function faDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)])
}

export function faNumber(n: number): string {
  return faDigits(new Intl.NumberFormat('en-US').format(Math.round(n)))
}

export function getJalali(date: Date): { jy: number; jm: number; jd: number } {
  return toJalaali(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

/** «۱۷ آبان ۱۴۰۵» */
export function formatJDate(date: Date, withYear = true): string {
  const { jy, jm, jd } = getJalali(date)
  return withYear ? `${faDigits(jd)} ${J_MONTHS[jm - 1]} ${faDigits(jy)}` : `${faDigits(jd)} ${J_MONTHS[jm - 1]}`
}

/** «امروز» / «فردا» / «۱۹ آبان» */
export function formatDayRelative(date: Date, today = new Date()): string {
  const d0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const d1 = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const diff = Math.round((d1 - d0) / 86400000)
  if (diff === 0) return 'امروز'
  if (diff === 1) return 'فردا'
  if (diff === -1) return 'دیروز'
  return formatJDate(date, false)
}

/** «۰۹:۳۰» */
export function formatTime(date: Date): string {
  const h = String(date.getUTCHours()).padStart(2, '0')
  const m = String(date.getUTCMinutes()).padStart(2, '0')
  return faDigits(`${h}:${m}`)
}

/** weekday in Persian, e.g. «شنبه» */
export function weekdayName(date: Date): string {
  return new Intl.DateTimeFormat('fa-IR', { weekday: 'long', timeZone: 'UTC' }).format(date)
}

/** month key like «1405-08» */
export function jMonthKey(date: Date): string {
  const { jy, jm } = getJalali(date)
  return `${jy}-${String(jm).padStart(2, '0')}`
}

/** «آبان ۱۴۰۵» from key */
export function keyToLabel(key: string): string {
  const [jy, jm] = key.split('-')
  return `${J_MONTHS[Number(jm) - 1]} ${faDigits(jy)}`
}

export function shiftJMonth(key: string, delta: number): string {
  let [jy, jm] = key.split('-').map(Number)
  jm += delta
  while (jm > 12) { jm -= 12; jy += 1 }
  while (jm < 1) { jm += 12; jy -= 1 }
  return `${jy}-${String(jm).padStart(2, '0')}`
}

/** first millisecond of Jalali month (UTC wall time) */
export function monthKeyStart(key: string): Date {
  const [jy, jm] = key.split('-').map(Number)
  const g = toGregorian(jy, jm, 1)
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd, 0, 0, 0, 0))
}

/** first millisecond of next Jalali month */
export function monthKeyEnd(key: string): Date {
  return monthKeyStart(shiftJMonth(key, 1))
}

export function lastNMonthKeys(n: number, from = new Date()): string[] {
  const cur = jMonthKey(from)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(shiftJMonth(cur, -i))
  return out
}

/** UTC midnight of today */
export function utcDayStart(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}
