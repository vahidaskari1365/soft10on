// E2E Smoke: کلیک روی هر کارت دمو در صفحه لاگین و اطمینان از ورود نقش
import { chromium } from '/home/z/.npm-global/lib/node_modules/playwright/index.mjs'

const accounts = ['مدیر کل', 'دکتر', 'منشی پذیرش', 'منشی ولیعصر', 'بیمار']
const results = []
const browser = await chromium.launch()

for (const label of accounts) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
    const card = page.locator(`button[aria-label="ورود سریع به عنوان ${label}"]`)
    await card.waitFor({ timeout: 30000 })
    await card.click()
    // ورود موفق = صفحه لاگین محو می‌شود
    await page.locator('h2:has-text("ورود به سامانه 10on")').waitFor({ state: 'detached', timeout: 45000 })
    await page.waitForTimeout(1500)
    // فقط پیام خطای واقعی — هشدارهای قرمز داشبورد (مثل «کار عقب‌افتاده») خطا نیستند
    const errTexts = await page.locator('.bg-red-50').allInnerTexts()
    const err = errTexts.filter((t) => /خطا|مجاز نیست|شکست|نامعتبر|اشتباه/.test(t)).length
    const body = (await page.locator('body').innerText()).slice(0, 110).replace(/\s+/g, ' ')
    results.push({ label, ok: err === 0, sample: body })
  } catch (e) {
    results.push({ label, ok: false, sample: String(e).slice(0, 130) })
  } finally {
    await ctx.close()
  }
}
await browser.close()

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.label} :: ${r.sample}`)
const fails = results.filter((r) => !r.ok).length
console.log(`\n${results.length - fails}/${results.length} PASS`)
process.exit(fails === 0 ? 0 : 1)
