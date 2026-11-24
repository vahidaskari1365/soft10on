// اسکرین‌شات تقویم ماهانه با استیکرها — ورود دکتر مدیر → نوبت‌ها و تقویم → نمای ماهانه
import { chromium } from 'playwright'

const BASE = 'http://localhost:3000'
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
await page.locator('button:has-text("دکتر مدیر")').first().click()
await page.waitForTimeout(2500)
// سایدبار → نوبت‌ها و تقویم
await page.locator('aside nav button', { hasText: 'نوبت‌ها و تقویم' }).first().click()
await page.waitForTimeout(2500)
// اگر سوییچ نمای ماهانه هست، فعالش کن
const monthBtn = page.locator('button', { hasText: 'ماه' }).filter({ hasNotText: 'ماهانه' }).first()
if (await monthBtn.count().catch(() => 0)) { await monthBtn.click().catch(() => {}); await page.waitForTimeout(1800) }
await page.screenshot({ path: '/tmp/shot-calendar.png' })
await b.close()
console.log('calendar shot ok')
