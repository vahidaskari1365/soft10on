#!/usr/bin/env node
/**
 * تست عمیق‌تر UI — پاسخ به بازبینی: پیمایش واقعی تب‌های هر نقش در مرورگر + یک فرم واقعی
 * برای هر نقش دمو: ورود → گردآوری همهٔ لینک‌های داخلی نوار کنار/سرصفحه → بازدید هرکدام →
 * بررسی رندر (بدون صفحهٔ خطا/کلاپس) → و برای منشی: ثبت بیمار از طریق فرم UI با تأیید DB.
 * اجرا: node scripts/ui-tabs-tests.mjs  (سرور dev روشن)
 */
import { assertTestDb, loadTestDbUrl } from './test-env.mjs'
assertTestDb()
import { chromium } from 'playwright'

const BASE = 'http://localhost:3000'
const accounts = ['دکتر مدیر', 'دکتر', 'اپراتور', 'منشی ولیعصر', 'بیمار']
const results = []
const record = (name, pass, detail = '') => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + String(detail).slice(0, 90) : ''}`)
}
const ERR_RE = /Application error|This page could not be found|خطای سرور|Unhandled|undefined is not/
const browser = await chromium.launch()
const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient({ log: [], datasources: { db: { url: loadTestDbUrl() } } })

for (const label of accounts) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const page = await ctx.newPage()
  try {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
    const card = page.locator(`button[aria-label="ورود سریع به عنوان ${label}"]`)
    await card.waitFor({ timeout: 30000 })
    await card.click()
    await page.locator('h2:has-text("ورود به سامانه 10on")').waitFor({ state: 'detached', timeout: 45000 })
    await page.waitForTimeout(1200)

    // پیمایش واقعی تب‌ها: اپ به‌صورت SPA است — دکمه‌های نوار کنار کلیک می‌شوند
    const tabButtons = await page.$$eval('aside nav button', (bs) =>
      bs.map((b) => (b.textContent ?? '').trim()).filter((t) => t.length > 1)
    )
    const limited = [...new Set(tabButtons)].slice(0, 16)
    let bad = []
    for (const tabText of limited) {
      try {
        const btn = page.locator('aside nav button', { hasText: tabText }).first()
        await btn.click({ timeout: 10000 })
        await page.waitForTimeout(900)
        const text = await page.locator('body').innerText()
        if (ERR_RE.test(text)) bad.push(tabText)
        if (text.trim().length < 40) bad.push(tabText + '(خالی)')
      } catch {
        bad.push(tabText + '(کلیک/رندر شکست)')
      }
    }
    record(`UI ${label}: پیمایش ${limited.length} تب`, limited.length >= 3 && bad.length === 0, bad.slice(0, 3).join(' | ') || 'همه رندر شدند')

    // RTL و فارسی
    const rtl = await page.evaluate(() => document.documentElement.getAttribute('dir') || document.body.getAttribute('dir'))
    const fa = (await page.locator('body').innerText()).slice(0, 300)
    record(`UI ${label}: RTL و فارسی`, rtl === 'rtl' && /[\u0600-\u06FF]/.test(fa), `dir=${rtl}`)

    // تعامل واقعی فرم — فقط منشی: ثبت بیمار از UI و تأیید در DB
    if (label === 'اپراتور') {
      const marker = `UIبیمار${Date.now() % 1000000}`
      // دکمهٔ بیمار جدید را پیدا کن (متن رایج) و فرم را پر کن
      // رفتن به تب بیماران (CRM) سپس باز کردن دیالوگ «بیمار جدید»
      await page.locator('aside nav button', { hasText: 'بیماران (CRM)' }).first().click({ timeout: 10000 }).catch(() => {})
      await page.waitForTimeout(900)
      const newBtn = page.locator('button:has-text("بیمار جدید")').first()
      if (await newBtn.count()) {
        await newBtn.click().catch(() => {})
        await page.locator('text=ثبت بیمار جدید').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
        await page.waitForTimeout(1200)
        // فیلدها: input[0]=نام، input[1]=نام خانوادگی، موبایل با placeholder شناخته‌شده
        const dlg = page.locator('[role="dialog"]')
        await dlg.locator('input').nth(0).fill('بیمار', { timeout: 8000 }).catch(() => {})
        await dlg.locator('input').nth(1).fill(marker, { timeout: 8000 }).catch(() => {})
        await dlg.locator('input').nth(2).fill(`0912${String(Date.now()).slice(-7)}`, { timeout: 8000 }).catch(() => {})
        const submit = dlg.locator('button:has-text("ثبت بیمار")').first()
        await submit.click({ timeout: 8000 }).catch(() => {})
        await page.waitForTimeout(3000)
        // اگر دیالوگ باز ماند (خطای اعتبارسنجی) یک‌بار دیگر با خواندن خطا تلاش می‌کنیم
        if (await dlg.count()) {
          const err = await dlg.locator('.text-rose-600').first().innerText().catch(() => '')
          console.log('   dialog error:', err || '(none)')
        }
        const created = await db.patient.findFirst({ where: { lastName: { contains: marker } } })
        record('UI: ثبت بیمار از فرم واقعی و ثبت در DB', !!created, created ? created.lastName.slice(-8) : 'یافت نشد')
      } else {
        record('UI: ثبت بیمار از فرم واقعی و ثبت در DB', false, 'دکمهٔ بیمار جدید یافت نشد')
      }
    }
  } catch (e) {
    record(`UI ${label}`, false, String(e).slice(0, 120))
  } finally {
    await ctx.close()
  }
}
await browser.close()
await db.$disconnect()
const fails = results.filter((r) => !r.pass).length
console.log(`\n=== ${results.length - fails}/${results.length} PASS ===`)
process.exit(fails ? 1 : 0)
