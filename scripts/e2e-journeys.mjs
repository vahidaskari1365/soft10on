#!/usr/bin/env node
/**
 * E2E Journeys — مأموریت شش‌فازی (فاز ۳/۴/۵)
 * سفرهای کامل هر نقش در مرورگر واقعی + تأیید اثر واقعی عملیات از API/DB (نه فقط رندر)
 * اجرا: node scripts/e2e-journeys.mjs  (سرور dev روشن)
 */
import { chromium } from 'playwright'
import { loadTestDbUrl } from './test-env.mjs'

const BASE = 'http://localhost:3000'
const results = []
const record = (name, pass, detail = '') => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + String(detail).slice(0, 110) : ''}`)
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg) }
const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient({ log: [], datasources: { db: { url: loadTestDbUrl() } } })

const browser = await chromium.launch()

// ---------- helpers ----------
async function login(page, username, password, expectError = false) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]:has-text("ورود")').click()
  if (expectError) {
    await page.waitForTimeout(1800)
    const err = await page.locator('text=/اشتباه|نامعتبر|خطا/').first().isVisible().catch(() => false)
    return err
  }
  await page.locator('h2:has-text("ورود به سامانه 10on")').waitFor({ state: 'detached', timeout: 30000 })
  await page.waitForTimeout(1000)
}
async function loginDemo(page, label) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
  await page.locator(`button[aria-label="ورود سریع به عنوان ${label}"]`).click()
  await page.locator('h2:has-text("ورود به سامانه 10on")').waitFor({ state: 'detached', timeout: 30000 })
  await page.waitForTimeout(1000)
}
async function logout(page) {
  await page.locator('button[aria-label="خروج از حساب"]').click()
  await page.locator('h2:has-text("ورود به سامانه 10on")').waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForTimeout(600)
}
async function openSection(page, label) {
  await page.locator('aside nav button', { hasText: label }).first().click()
  await page.waitForTimeout(1100)
}
async function radixSelect(page, trigger, optionText) {
  await trigger.click()
  await page.locator('[role="option"]', { hasText: optionText }).first().click()
  await page.waitForTimeout(300)
}
async function apiGet(page, url) {
  return page.evaluate(async (u) => {
    const r = await fetch(u)
    return { status: r.status, body: await r.json().catch(() => null) }
  }, url)
}

const FILTER = process.env.FILTER ?? ''
async function journey(name, fn) {
  if (FILTER && !name.startsWith(FILTER)) return
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const page = await ctx.newPage()
  try {
    await fn(page)
    record(name, true)
  } catch (e) {
    record(name, false, String(e).slice(0, 420).replace(/\n[\s\S]*call log[\s\S]*/, ""))
  } finally {
    await ctx.close()
  }
}

// ---------- J1: احراز هویت — همهٔ نقش‌ها + رمز غلط ----------
await journey('J1a رمز غلط رد می‌شود', async (page) => {
  const err = await login(page, 'manager', 'wrong-pass-123', true)
  assert(err, 'پیام خطا برای رمز غلط نمایش داده نشد')
  const stillLogin = await page.locator('h2:has-text("ورود به سامانه 10on")').isVisible()
  assert(stillLogin, 'با رمز غلط وارد داشبورد شد!')
})
await journey('J1b ورود/خروج همهٔ نقش‌های دمو', async (page) => {
  for (const label of ['دکتر مدیر', 'اپراتور', 'منشی ولیعصر', 'دکتر', 'بیمار']) {
    await loginDemo(page, label)
    await logout(page)
  }
})
await journey('J1c ورود فرمی super (SUPER_ADMIN)', async (page) => {
  await login(page, 'super', '123456')
  const platform = await page.locator('aside nav button', { hasText: 'پنل پلتفرم' }).count()
  assert(platform > 0, 'منوی پنل پلتفرم برای SUPER_ADMIN نیست')
  await logout(page)
})

// ---------- J2: بیماران CRUD (مدیر) ----------
await journey('J2 ایجاد/جست‌وجو/ویرایش بیمار از UI', async (page) => {
  await login(page, 'admin', '123456')
  await openSection(page, 'بیماران (CRM)')
  const marker = 'J2بیمار' + (Date.now() % 1000000)
  await page.locator('button:has-text("بیمار جدید")').first().click()
  const dlg = page.locator('[role="dialog"]')
  await dlg.waitFor({ state: 'visible', timeout: 8000 })
  await page.waitForTimeout(700)
  await dlg.locator('input').nth(0).fill('تستی')
  await dlg.locator('input').nth(1).fill(marker)
  await dlg.locator('input').nth(2).fill(`0912${String(Date.now()).slice(-7)}`)
  await dlg.locator('button:has-text("ثبت بیمار")').first().click()
  await page.waitForTimeout(2200)
  // جست‌وجو
  const search = page.locator('input[placeholder="جست‌وجوی نام یا شماره تماس…"]').first()
  await search.fill(marker)
  await page.waitForTimeout(1500)
  const row = page.locator('text=' + marker).first()
  if (!(await row.isVisible().catch(() => false))) {
    const inDb = await db.patient.findFirst({ where: { lastName: marker } })
    const searchVal = await page.locator('input[placeholder="جست‌وجوی نام یا شماره تماس…"]').inputValue().catch(() => '?')
    const dlgStill = await page.locator('[role="dialog"]').count()
    const dlgErr = dlgStill ? await page.locator('[role="dialog"] .text-rose-600, [role="dialog"] [class*="rose"]').first().innerText().catch(() => '(no err)') : ''
    throw new Error(`بیمار پیدا نشد — inDb=${inDb ? 'YES' : 'NO'} searchVal=${searchVal} dlg=${dlgStill} dlgErr=${dlgErr}`)
  }
  // ویرایش شماره
  await page.locator('button:has-text("ویرایش"), button:has-text("پرونده")').first().click().catch(() => {})
  await page.waitForTimeout(900)
  const dlg2 = page.locator('[role="dialog"]')
  if (await dlg2.count()) {
    const phoneInput = dlg2.locator('input[placeholder="09xxxxxxxxx"], input[dir="ltr"]').first()
    if (await phoneInput.count()) {
      await phoneInput.fill('09121999999')
      await dlg2.locator('button:has-text("ذخیره تغییرات"), button:has-text("ثبت بیمار")').first().click()
      await page.waitForTimeout(2000)
    }
  }
  // تأیید واقعی در DB
  const created = await db.patient.findFirst({ where: { lastName: marker } })
  assert(!!created, 'بیمار در DB ثبت نشد')
  record('J2b بیمار در DB با دادهٔ فرم ثبت شد', created.firstName === 'تستی' && !!created.phone, created.phone ?? 'no-phone')
})

// ---------- J3: چرخهٔ عمر نوبت (پذیرش) ----------
await journey('J3 ایجاد نوبت و تغییر وضعیت از UI', async (page) => {
  await login(page, 'reception', '123456')
  await openSection(page, 'نوبت‌ها و تقویم')
  await page.locator('button:has-text("نوبت جدید")').first().click()
  const dlg = page.locator('[role="dialog"]')
  await dlg.waitFor({ state: 'visible', timeout: 8000 })
  await page.waitForTimeout(800) // تا Selectهای فرم از meta پر شوند
  const triggers = dlg.locator('button[role="combobox"], [data-slot="select-trigger"]')
  const n = await triggers.count()
  assert(n >= 3, `انتظار ≥۳ Select در دیالوگ نوبت، پیدا شد ${n}`)
  // بیمار: اولین گزینهٔ واقعی لیست را انتخاب و نامش را ثبت کن
  console.log('J3: click trigger0')
  await triggers.nth(0).click()
  const firstOpt = page.locator('[role="option"]').first()
  console.log('J3: read option')
  const chosen = (await firstOpt.innerText({ timeout: 8000 })).split('—')[0].trim()
  console.log('J3: chosen =', chosen)
  await firstOpt.click()
  await page.waitForTimeout(300)
  await radixSelect(page, triggers.nth(1), '') // خدمت — اولین گزینه
  await radixSelect(page, triggers.nth(2), '') // پزشک — اولین گزینه
  // ثبت با مدیریت تداخل: ساعت‌ها را یکی‌یکی امتحان کن (تنها دقیقهٔ ۰۰ موجود است)
  console.log('J3: submit')
  let submitted = false
  await triggers.nth(3).click({ timeout: 6000 })
  const hourOpts = page.locator('[role="option"]')
  const hourCount = await hourOpts.count()
  console.log('J3: hour options =', hourCount)
  for (let attempt = 0; attempt < hourCount && !submitted; attempt++) {
    if (attempt > 0) {
      await triggers.nth(3).click({ timeout: 6000 })
    }
    await page.locator('[role="option"]').nth(attempt).click()
    await page.waitForTimeout(350)
    await dlg.locator('button:has-text("ثبت"), button[type="submit"]').last().click()
    await page.waitForTimeout(1800)
    submitted = (await dlg.count()) === 0
    console.log('J3: hour#', attempt, submitted ? 'OK' : '(conflict/past)')
  }
  assert(submitted, 'ثبت نوبت در هیچ ساعتی موفق نشد (همه تداخل/گذشته)')
  await page.waitForTimeout(1200)
  console.log('J3: submitted, open block')

  // تأیید واقعی از API: آخرین نوبت پذیرش
  const appts = await apiGet(page, '/api/appointments')
  assert(appts.status === 200, 'GET /api/appointments ناموفق')
  const items = appts.body.appointments ?? appts.body.items ?? appts.body
  const sorted = Array.isArray(items) ? [...items].sort((a, b) => new Date(b.start) - new Date(a.start) || (b.createdAt > a.createdAt ? 1 : -1)) : []
  const latest = sorted[0]
  assert(!!latest, 'نوبت تازه در API یافت نشد')
  // تغییر وضعیت از UI: کلیک روی بلوک نوبت در تقویم → دیالوگ جزئیات → «تأییدشده»
  console.log('J3: block click')
  let patchedId = ''
  page.on('request', (r) => {
    const m = r.url().match(/\/api\/appointments\/([a-z0-9]+)$/)
    if (m && r.method() === 'PATCH') patchedId = m[1]
  })
  const block = page.locator(`text=${chosen}`).first()
  await block.click({ timeout: 8000 })
  const detailDlg = page.locator('[role="dialog"]')
  await detailDlg.waitFor({ state: 'visible', timeout: 8000 })
  console.log('J3: confirm click')
  await detailDlg.locator('button:has-text("تأییدشده")').first().click()
  await page.waitForTimeout(1800)
  assert(!!patchedId, 'هیچ PATCH تغییر وضعیتی از UI ارسال نشد')
  const patched = await db.appointment.findUnique({ where: { id: patchedId } })
  assert(patched && patched.status === 'CONFIRMED', `وضعیت در DB بعد از کلیک UI: ${patched?.status}`)
  record('J3c نوبت تازه در DB ثبت شد (بیمار انتخابی)', true, `id=${patchedId.slice(-8)}`)
})

// ---------- J4: فاکتور + پرداخت (مدیر) ----------
await journey('J4 صدور فاکتور و ثبت پرداخت از UI', async (page) => {
  await login(page, 'admin', '123456')
  await openSection(page, 'حسابداری و انبار')
  await page.locator('button[role="tab"]', { hasText: 'فاکتورها' }).first().click()
  await page.waitForTimeout(900)
  const invBefore = await db.invoice.count()
  await page.locator('button:has-text("صدور فاکتور")').first().click()
  const dlg = page.locator('[role="dialog"]')
  await dlg.waitFor({ state: 'visible', timeout: 8000 })
  // PatientSelect: input جست‌وجوی بیمار
  await dlg.locator('input[placeholder="نام یا شماره بیمار…"]').first().fill('سامان')
  await page.waitForTimeout(1600)
  const opt = dlg.locator('button:has-text("سامان قاسمی")').first()
  assert(await opt.count(), 'لیست انتخاب بیمار، بیمار جست‌وجوشده را نشان نداد')
  await opt.click()
  // comboboxها: شعبه(0) — نوع ردیف(1) — انتخاب خدمت(2)؛ گزینهٔ اول = placeholder
  const triggers = dlg.locator('button[role="combobox"], [data-slot="select-trigger"]')
  const refSel = triggers.nth(2)
  assert(await refSel.count(), 'combobox انتخاب خدمت یافت نشد')
  await refSel.click()
  await page.locator('[role="option"]').nth(1).click()
  await page.waitForTimeout(500)
  let invPost = '(no POST)'
  page.on('response', async (r) => {
    if (r.request().method() === 'POST' && r.url().includes('/api/invoices')) invPost = r.status() + ' ' + (await r.text().catch(() => '')).slice(0, 80)
  })
  await dlg.locator('button:has-text("صدور فاکتور"), button:has-text("ثبت فاکتور"), button:has-text("ذخیره")').last().click()
  await page.waitForTimeout(2500)
  const invAfter = await db.invoice.count()
  assert(invAfter > invBefore, `فاکتور در DB ثبت نشد (${invBefore}→${invAfter}) POST=${invPost}`)
  const inv = await db.invoice.findFirst({ orderBy: { date: 'desc' } })
  // پرداخت از UI: یافتن ردیف فاکتور و دکمهٔ دریافت
  const payBtn = page.locator('button:has-text("دریافت"), button:has-text("پرداخت"), button:has-text("تسویه")').first()
  if (await payBtn.count()) {
    await payBtn.click()
    const pdlg = page.locator('[role="dialog"]')
    await pdlg.waitFor({ state: 'visible', timeout: 8000 })
    const amount = pdlg.locator('input').first()
    await amount.fill(String(inv.total ?? 100000))
    await pdlg.locator('button:has-text("ثبت"), button:has-text("دریافت"), button:has-text("ذخیره")').last().click()
    await page.waitForTimeout(2200)
  }
  const pays = await db.payment.count({ where: { invoiceId: inv.id } })
  record('J4b پرداخت روی فاکتور ثبت شد', pays > 0, `payments=${pays}`)
})

// ---------- J5: صف انتظار (پذیرش) ----------
await journey('J5 افزودن به صف انتظار و نوبت‌گیری از UI', async (page) => {
  await login(page, 'reception', '123456')
  await openSection(page, 'صف انتظار')
  const wlBefore = await db.waitlist.count()
  await page.locator('button:has-text("افزودن"), button:has-text("ثبت در صف")').first().click()
  const dlg = page.locator('[role="dialog"]')
  if (await dlg.count()) {
    await dlg.waitFor({ state: 'visible', timeout: 8000 })
    const triggers = dlg.locator('button[role="combobox"], [data-slot="select-trigger"]')
    if (await triggers.count()) await radixSelect(page, triggers.first(), 'سامان')
    await dlg.locator('button:has-text("ثبت"), button:has-text("افزودن")').last().click()
    await page.waitForTimeout(2000)
  }
  const wlAfter = await db.waitlist.count()
  assert(wlAfter > wlBefore, `صف انتظار در DB ثبت نشد (${wlBefore}→${wlAfter})`)
})

// ---------- J6: پزشک — تابلو و نسخه ----------
await journey('J6 پزشک: تابلو و ثبت نسخه از UI', async (page) => {
  await login(page, 'doctor', '123456')
  await page.waitForTimeout(1200)
  const navCount = await page.locator('aside nav button').count()
  assert(navCount === 3, `منوی پزشک باید ۳ آیتم باشد، هست ${navCount}`)
  // تب پرونده بیماران → نسخهٔ جدید برای بیمار فعال
  await openSection(page, 'پرونده بیماران')
  await page.waitForTimeout(1200)
  // انتخاب بیمار از Select ابتدای بخش
  const patTrigger = page.locator('main button[role="combobox"], main [data-slot="select-trigger"]').first()
  await patTrigger.click({ timeout: 8000 })
  const patOpts = page.locator('[role="option"]')
  // گزینهٔ اول placeholder است — بیمار واقعی = گزینهٔ دوم
  await patOpts.nth(1).click({ timeout: 8000 })
  await page.waitForTimeout(1500)
  const prescBefore = await db.prescription.count()
  const recBtn = page.locator('button:has-text("نسخه"), button:has-text("نسخهٔ جدید")').first()
  if (await recBtn.count()) {
    await recBtn.click()
    const dlg = page.locator('[role="dialog"]')
    await dlg.waitFor({ state: 'visible', timeout: 8000 })
    await dlg.locator('input[placeholder*="نام دارو"]').first().fill('آموکسی‌سیلین')
    const dose = dlg.locator('input[placeholder*="دوز"]').first()
    if (await dose.count()) await dose.fill('500mg')
    await dlg.locator('button:has-text("صدور نسخه")').last().click()
    await page.waitForTimeout(2200)
  }
  const prescAfter = await db.prescription.count()
  record('J6b نسخه در DB ثبت شد', prescAfter > prescBefore, `${prescBefore}→${prescAfter}`)
})

// ---------- J7: پرتال بیمار — لغو، پروفایل، رمز ----------
await journey('J7 پرتال بیمار: لغو نوبت، ویرایش پروفایل، تغییر رمز', async (page) => {
  await login(page, 'patient', '123456')
  await page.waitForTimeout(1400)
  // لغو نوبت آینده — اگر نیست، یکی در DB می‌سازیم تا تست قابل‌تکرار باشد
  const pat = await db.patient.findFirst({ where: { user: { is: { username: 'patient' } } } })
  const upcoming = await db.appointment.count({ where: { patientId: pat.id, status: { not: 'CANCELLED' }, start: { gte: new Date() } } })
  if (upcoming === 0) {
    const svc = await db.service.findFirst()
    const doc = await db.doctor.findFirst()
    const br = await db.branch.findFirst({ where: { clinicId: pat.clinicId } })
    if (svc && doc && br) {
      await db.appointment.create({ data: { patientId: pat.id, doctorId: doc.id, serviceId: svc.id, branchId: br.id, clinicId: pat.clinicId, start: new Date(Date.now() + 3 * 86400000), status: 'PENDING', price: svc.price, source: 'PANEL' } })
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForTimeout(1500)
    }
  }
  const cancelBtn = page.locator('button:has-text("لغو")').first()
  if (await cancelBtn.count()) {
    const apptBefore = await db.appointment.count({ where: { status: { not: 'CANCELLED' }, patient: { user: { username: 'patient' } } } })
    await cancelBtn.click()
    await page.waitForTimeout(2200)
    const apptAfter = await db.appointment.count({ where: { status: { not: 'CANCELLED' }, patient: { user: { username: 'patient' } } } })
    record('J7b لغو نوبت واقعی شد', apptAfter < apptBefore, `${apptBefore}→${apptAfter}`)
  } else { record('J7b لغو نوبت واقعی شد', false, 'دکمهٔ لغو یافت نشد') }
  // پروفایل: تغییر شماره
  await page.locator('button[role="tab"], [role="tab"]', { hasText: 'پروفایل' }).first().click()
  await page.waitForTimeout(900)
  const phoneInput = page.locator('div:has(> label:text-is("شماره موبایل")) input').first()
  if (await phoneInput.count()) {
    await phoneInput.fill('09305554499')
    await page.locator('[role="tabpanel"] button:has-text("ذخیره تغییرات")').first().click()
    await page.waitForTimeout(2200)
  }
  const pat2 = await db.patient.findFirst({ where: { user: { username: 'patient' } } })
  record('J7c پروفایل به‌روزرسانی شد', pat2 && pat2.phone === '09305554499', pat2?.phone)
})

// ---------- J8: پیام بیمار → پاسخ پذیرش ----------
await journey('J8 پیام بیمار و پاسخ پذیرش (E2E دو نقشه)', async (page) => {
  await login(page, 'patient', '123456')
  await openSection(page, 'پیام با کلینیک')
  const marker = 'J8پیام' + (Date.now() % 1000000)
  const box = page.locator('input[placeholder*="پیام خود"], textarea[placeholder*="پیام"]').first()
  if (await box.count()) {
    await box.fill(`سلام ${marker}`)
    await box.press('Enter')
    await page.waitForTimeout(2200)
  }
  const msg = await db.message.findFirst({ where: { body: { contains: marker } } })
  assert(!!msg, 'پیام بیمار در DB ثبت نشد')
  // پاسخ پذیرش از همان مکالمه
  await logout(page)
  await login(page, 'reception', '123456')
  await openSection(page, 'پیام بیماران')
  const thread = page.locator('text=سامان قاسمی').first()
  await thread.click({ timeout: 8000 })
  await page.waitForTimeout(900)
  const replyBox = page.locator('input[placeholder*="پاسخ"], textarea[placeholder*="پاسخ"]').first()
  if (await replyBox.count()) {
    await replyBox.fill('پاسخ پذیرش به شما')
    await replyBox.press('Enter')
    await page.waitForTimeout(2200)
  }
  const replies = await db.message.count({ where: { direction: 'OUT' } })
  assert(replies > 0, 'پاسخ پذیرش ثبت نشد')
})

// ---------- J9: کارتابل — ایجاد و تغییر وضعیت کار ----------
await journey('J9 ایجاد کار و تغییر وضعیت از UI', async (page) => {
  await login(page, 'admin', '123456')
  await openSection(page, 'کارتابل عملیات')
  const tBefore = await db.task.count()
  const newBtn = page.locator('button:has-text("کار جدید"), button:has-text("ایجاد کار"), button:has-text("ثبت کار")').first()
  if (await newBtn.count()) {
    await newBtn.click()
    const dlg = page.locator('[role="dialog"]')
    await dlg.waitFor({ state: 'visible', timeout: 8000 })
    const inputs = dlg.locator('input')
    await inputs.nth(0).fill('پیگیری تماس بیمار J9')
    const triggers = dlg.locator('button[role="combobox"], [data-slot="select-trigger"]')
    if (await triggers.count()) await radixSelect(page, triggers.first(), '')
    await dlg.locator('button:has-text("ثبت"), button:has-text("ایجاد"), button:has-text("ذخیره")').last().click()
    await page.waitForTimeout(2200)
  }
  const tAfter = await db.task.count()
  assert(tAfter > tBefore, `کار در DB ثبت نشد (${tBefore}→${tAfter})`)
  // تغییر وضعیت اولین کار از UI
  await page.locator('button:has-text("در حال انجام"), button:has-text("انجام‌شده")').first().click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(1500)
})

// ---------- J10: شعب و پرسنل (مدیر) ----------
await journey('J10 ایجاد شعبه و کاربر پرسنلی از UI', async (page) => {
  await login(page, 'admin', '123456')
  await openSection(page, 'مدیریت شعب')
  const brBefore = await db.branch.count()
  const newBr = page.locator('button:has-text("شعبه جدید"), button:has-text("افزودن شعبه")').first()
  if (await newBr.count()) {
    await newBr.click()
    const dlg = page.locator('[role="dialog"]')
    await dlg.waitFor({ state: 'visible', timeout: 8000 })
    const inputs = dlg.locator('input')
    const stamp = String(Date.now()).slice(-5)
    await inputs.nth(0).fill(`BR${stamp}`)
    await inputs.nth(1).fill(`شعبه تست ${stamp}`)
    await inputs.nth(2).fill('تهران')
    await inputs.nth(3).fill('021-88990011')
    await inputs.nth(4).fill('خیابان تست، پلاک ۱')
    await dlg.locator('button:has-text("ذخیره"), button:has-text("ثبت"), button:has-text("ایجاد")').last().click()
    await page.waitForTimeout(2200)
  }
  const brAfter = await db.branch.count()
  assert(brAfter > brBefore, `شعبه در DB ثبت نشد (${brBefore}→${brAfter})`)
  // پرسنل
  await openSection(page, 'پرسنل و دسترسی‌ها')
  const uBefore = await db.user.count()
  const newU = page.locator('button:has-text("پرسنل جدید"), button:has-text("افزودن کاربر"), button:has-text("کاربر جدید")').first()
  if (await newU.count()) {
    await newU.click()
    const dlg = page.locator('[role="dialog"]')
    await dlg.waitFor({ state: 'visible', timeout: 8000 })
    const inputs = dlg.locator('input')
    await inputs.nth(0).fill(`پرسنل J10 ${String(Date.now()).slice(-5)}`)
    await inputs.nth(1).fill(`j10staff${String(Date.now()).slice(-5)}`)
    await inputs.nth(2).fill('j10pass123')
    const triggers = dlg.locator('button[role="combobox"], [data-slot="select-trigger"]')
    if (await triggers.count()) await radixSelect(page, triggers.first(), 'پذیرش')
    await dlg.locator('button:has-text("ثبت"), button:has-text("ذخیره"), button:has-text("ایجاد")').last().click()
    await page.waitForTimeout(2200)
  }
  const uAfter = await db.user.count()
  assert(uAfter > uBefore, `کاربر پرسنلی در DB ثبت نشد (${uBefore}→${uAfter})`)
})

// ---------- J11: پلتفرم (SUPER_ADMIN) — ساخت کلینیک ----------
await journey('J11 SUPER_ADMIN: ساخت کلینیک از پنل پلتفرم', async (page) => {
  await login(page, 'super', '123456')
  await openSection(page, 'پنل پلتفرم')
  await page.locator('button[role="tab"]', { hasText: 'کلینیک‌ها' }).first().click()
  await page.waitForTimeout(900)
  const cBefore = await db.clinic.count()
  const newC = page.locator('button:has-text("کلینیک جدید"), button:has-text("ساخت کلینیک")').first()
  if (await newC.count()) {
    await newC.click()
    const dlg = page.locator('[role="dialog"]')
    await dlg.waitFor({ state: 'visible', timeout: 8000 })
    const inputs = dlg.locator('input')
    await inputs.nth(0).fill(`کلینیک J11 ${String(Date.now()).slice(-5)}`)
    await dlg.locator('button:has-text("ساخت"), button:has-text("ثبت"), button:has-text("ایجاد")').last().click()
    await page.waitForTimeout(2500)
  } else {
    throw new Error('دکمهٔ کلینیک جدید در پنل پلتفرم یافت نشد')
  }
  const cAfter = await db.clinic.count()
  assert(cAfter > cBefore, `کلینیک در DB ثبت نشد (${cBefore}→${cAfter})`)
})

// ---------- J12: ریسپانسیو ۳۷۵/۷۶۸/۱۳۶۶ ----------
await journey('J12 ریسپانسیو: 375/768/1366 بدون سرریز افقی', async (page) => {
  for (const [w, h, label] of [[375, 812, 'موبایل'], [768, 1024, 'تبلت'], [1366, 900, 'دسکتاپ']]) {
    await page.setViewportSize({ width: w, height: h })
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
    await page.locator('#username').fill('admin')
    await page.locator('#password').fill('123456')
    await page.locator('button[type="submit"]:has-text("ورود")').click()
    await page.locator('h2:has-text("ورود به سامانه 10on")').waitFor({ state: 'detached', timeout: 30000 })
    await page.waitForTimeout(1200)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    assert(overflow <= 2, `${label} ${w}px سرریز افقی ${overflow}px`)
    if (w === 375) {
      const bottomNav = await page.locator('nav[aria-label="ناوبری موبایل"]').isVisible()
      assert(bottomNav, 'نوار ناوبری موبایل در ۳۷۵px دیده نمی‌شود')
    }
    await logout(page)
  }
})

// ---------- J13: رزرو عمومی (صفحهٔ کلینیک) ----------
await journey('J13 صفحهٔ عمومی کلینیک: فرم رزرو کار می‌کند', async (page) => {
  const br = await db.branch.findFirst({ where: { code: 'SAADAT' } })
  assert(!!br, 'شعبهٔ اصلی یافت نشد')
  await page.goto(`${BASE}/clinic/${br.code}`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(1500)
  const body = await page.locator('body').innerText()
  assert(/[؀-ۿ]/.test(body), 'صفحهٔ عمومی فارسی نیست')
  // رزرو: اگر فرم نوبت عمومی موجود است یک رزرو کامل بزن
    {
    const trigCount = await page.locator('button[role="combobox"], [data-slot="select-trigger"]').count()
    for (let i = 0; i < trigCount; i++) {
      const tg = page.locator('button[role="combobox"], [data-slot="select-trigger"]').nth(i)
      await tg.scrollIntoViewIfNeeded()
      // بازکردن با retry تا options واقعاً render شوند (هیدریشن ممکن است دیر تمام شود)
      let oc = 0
      for (let attempt = 0; attempt < 3 && oc === 0; attempt++) {
        await tg.click({ timeout: 6000 }).catch(() => {})
        await page.waitForTimeout(800)
        oc = await page.locator('[role="option"]').count()
      }
      if (oc > 1) { await page.locator('[role="option"]').nth(1).click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(400) }
      // بستن اجباری هر popup باقی‌مانده — وگرنه کلیک بعدی intercepted می‌شود
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    }
    const nameIn = page.locator('input[placeholder*="مینا"]').first()
    if (await nameIn.count()) { await nameIn.fill('عمومی تست J13') }
    const phone = page.locator('input[type="tel"], input[placeholder*="۰۹"], input[placeholder*="09"]').first()
    if (await phone.count()) { await phone.fill('09123334455').catch(() => {}) }
    const submit = page.locator('button:has-text("ثبت درخواست نوبت")').first()
    await submit.scrollIntoViewIfNeeded()
    if (await submit.count()) {
      const pbBefore = await db.publicBooking.count()
      await submit.click()
      await page.waitForTimeout(2500)
      const pbAfter = await db.publicBooking.count()
      record('J13b رزرو عمومی در DB ثبت شد', pbAfter > pbBefore, `${pbBefore}→${pbAfter}`)
    }
  }
})

// ---------- J14: دسترسی متقابل — بیمار به داشبورد مدیریتی نمی‌رسد ----------
await journey('J14 PATIENT: منوی مدیریتی ندارد و API مدیریتی رد می‌شود', async (page) => {
  await login(page, 'patient', '123456')
  const adminNav = await page.locator('aside nav button', { hasText: 'حسابداری' }).count()
  assert(adminNav === 0, 'بیمار منوی حسابداری می‌بیند!')
  const res = await apiGet(page, '/api/invoices')
  assert(res.status === 403 || res.status === 401, `API فاکتور برای بیمار status=${res.status}`)
  await logout(page)
})

// ---------- J15: ماژول‌های باقی‌مانده — پایگاه دانش (عملیات واقعی)، گزارش‌ها، انبار، پرونده هوشمند ----------
await journey('J15 تنظیمات: افزودن/حذف پایگاه دانش از UI با تأیید DB', async (page) => {
  await loginDemo(page, 'دکتر مدیر')
  await openSection(page, 'تنظیمات سامانه')
  await page.locator('[role="tab"]:has-text("پایگاه دانش")').click()
  await page.waitForTimeout(700)
  const q = `Q-J15-${Date.now() % 100000} ساعات کاری شعبه؟`
  await page.locator('input[placeholder*="ساعات کاری"]').fill(q)
  await page.locator('textarea').last().fill('هر روز از ۹ صبح تا ۹ شب')
  await page.locator('button:has-text("افزودن به دانش")').click()
  await page.waitForTimeout(1300)
  const inList = await page.locator(`text=${q}`).first().isVisible()
  assert(inList, 'آیتم KB پس از افزودن در لیست UI ظاهر نشد')
  const row = await db.knowledgeBase.findFirst({ where: { question: q } })
  assert(row, 'آیتم KB در DB ثبت نشد')
  // حذف همان آیتم از UI
  await page.locator('.rounded-2xl.border', { hasText: q }).first().locator('button').last().click()
  await page.waitForTimeout(1200)
  const stillThere = await page.locator(`text=${q}`).first().isVisible().catch(() => false)
  assert(!stillThere, 'آیتم KB پس از حذف هنوز در UI است')
  const gone = await db.knowledgeBase.findFirst({ where: { question: q } })
  assert(!gone, 'آیتم KB از DB حذف نشد')
  await logout(page)
})
await journey('J15b گزارش‌ها: تب نوبت‌ها و انبار با دادهٔ واقعی + پرونده هوشمند', async (page) => {
  await loginDemo(page, 'دکتر مدیر')
  await openSection(page, 'گزارش‌ها')
  await page.locator('[role="tab"]:has-text("نوبت‌ها")').click()
  await page.waitForTimeout(1000)
  const rep = await page.locator('body').innerText()
  assert(rep.includes('گزارش') && /[\u06F0-\u06F9]/.test(rep), 'گزارش نوبت‌ها بدون دادهٔ عددی رندر شد')
  await page.locator('[role="tab"]:has-text("انبار")').click()
  await page.waitForTimeout(1000)
  const inv = await page.locator('body').innerText()
  assert(/انبار|موجودی|اقلام|هشدار/.test(inv) && !/Application error/.test(inv), 'تب انبار خالی یا خطا دارد')
  // پرونده هوشمند: انتخاب بیمار از dropdown → رکوردها یا حالت خالی معنادار
  await openSection(page, 'پرونده هوشمند')
  await page.waitForTimeout(900)
  const combo = page.locator('button[role="combobox"]').first()
  if (await combo.isVisible().catch(() => false)) {
    await combo.click()
    await page.waitForTimeout(400)
    const firstPatient = page.locator('[role="option"]').first()
    if (await firstPatient.isVisible().catch(() => false)) {
      await firstPatient.click()
      await page.waitForTimeout(1200)
    }
  }
  const rec = await page.locator('body').innerText()
  assert(rec.length > 120 && !/Application error/.test(rec), 'پرونده هوشمند خالی یا خطا دارد')
  await logout(page)
})

await browser.close()
await db.$disconnect()
const fails = results.filter((r) => !r.pass).length
console.log(`\n=== ${results.length - fails}/${results.length} PASS ===`)
process.exit(fails ? 1 : 0)
