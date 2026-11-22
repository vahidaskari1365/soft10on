/**
 * Unit Tests — منطق خالص (بدون دیتابیس): validation، تقویم، هم‌پوشانی نوبت، فرمت پول، توازن سند
 * اجرا: bun scripts/unit-tests.ts
 */
let pass = 0, fail = 0
function t(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`PASS ${name}`) } else { fail++; console.log(`FAIL ${name} :: ${detail}`) }
}

// ————— validation
import { vStr, vInt, vEnum, vPhone, vDate, validateIranianNationalId, validateEmail } from '../src/lib/validation'
t('vStr: required خالی رد می‌شود', !vStr('', { required: true, label: 'نام' }).ok)
t('vStr: بیشینهٔ طول رد می‌شود', !vStr('x'.repeat(300), { max: 200, label: 'متن' }).ok)
t('vStr: مقدار معتبر ok', vStr('علی', { required: true, max: 50, label: 'نام' }).ok === true)
t('vInt: عدد نامعتبر رد می‌شود', !vInt('abc', { label: 'مبلغ' }).ok)
t('vInt: منفی وقتی min=0 رد می‌شود', !vInt(-5, { label: 'مبلغ', min: 0 }).ok)
t('vEnum: مقدار خارج از لیست رد می‌شود', !vEnum('X', ['A', 'B'], 'وضعیت').ok)
t('vEnum: مقدار مجاز ok', vEnum('A', ['A', 'B'], 'وضعیت').ok === true)
t('vPhone: شمارهٔ کوتاه رد می‌شود', !vPhone('0912', 'موبایل').ok)
t('vPhone: شمارهٔ معتبر ok', vPhone('09123456789', 'موبایل').ok === true)
t('کد ملی نامعتبر رد می‌شود', !validateIranianNationalId('1111111111'))
t('کد ملی معتبر پذیرفته می‌شود', validateIranianNationalId('0079144683'))
t('ایمیل نامعتبر رد می‌شود', !validateEmail('not-an-email'))
t('vDate: تاریخ نامعتبر رد می‌شود', vDate('غیرتاریخ', 'تاریخ').ok !== true)

// ————— jalali
import { jMonthKey, monthKeyStart, monthKeyEnd } from '../src/lib/jalali'
const k = jMonthKey(new Date(2026, 10, 22)) // 2026-11-22
t('jMonthKey: قالب ماه/سال', /^\d{4}-\d{2}$/.test(k), k)
t('monthKeyStart < monthKeyEnd', monthKeyStart(k).getTime() < monthKeyEnd(k).getTime())

// ————— scheduling (منطق هم‌پوشانی با دادهٔ ساختگی — بدون دیتابیس)
const overlap = (aS: number, aD: number, bS: number, bD: number) => {
  const aE = aS + Math.max(aD, 15) * 60_000
  const bE = bS + Math.max(bD, 15) * 60_000
  return aS < bE && bS < aE
}
const H = 3_600_000
t('هم‌پوشانی کامل تشخیص داده می‌شود', overlap(0, 30, 0, 30))
t('هم‌پوشانی جزئی تشخیص داده می‌شود', overlap(0, 30, 15 * 60_000, 30))
t('بازه‌های متوالی بدون فاصله، تداخل نیست', !overlap(0, 30, 30 * 60_000, 30))
t('فاصلهٔ یک‌ساعته، تداخل نیست', !overlap(0, 30, 2 * H, 30))

// ————— format
import { formatToman } from '../src/lib/format'
t('formatToman: فرمت خوانا', formatToman(1_250_000).length > 0 && formatToman(1_250_000) !== '1250000', formatToman(1_250_000))
t('formatToman: صفر', formatToman(0) === '۰ تومان', formatToman(0))

// ————— accounting: رد سند نامتوازن/خالی (قبل از هر دسترسی به دیتابیس)
import { postJournal } from '../src/lib/ledger'
let threw = false
try {
  await postJournal({} as never, { memo: 'تست', clinicId: 'cl', lines: [{ code: 'CASH', debit: 50000, credit: 0 }, { code: 'AR', debit: 0, credit: 40000 }] })
} catch (e) {
  threw = String(e).includes('تراز')
}
t('سند نامتوازن رد می‌شود (بدهکار≠بستانکار)', threw)
threw = false
try {
  await postJournal({} as never, { memo: 'تست', clinicId: 'cl', lines: [] })
} catch (e) {
  threw = String(e).includes('بدون آرتیکل')
}
t('سند بدون آرتیکل رد می‌شود', threw)

console.log(`\n=== ${pass}/${pass + fail} PASS ===`)
process.exit(fail ? 1 : 0)
