import { chromium } from 'playwright'
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 800 } })
page.on('request', r => { if (r.url().includes('/api/finance/profit') || r.url().includes('/api/purchases')) console.log('REQ:', r.url()) })
page.on('response', async r => {
  if (r.url().includes('/api/finance/profit')) {
    try { const j = await r.json(); console.log('RES status:', r.status(), 'revenue:', j.totals?.revenue, 'rows:', j.rows?.length) } catch {}
  }
})
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.locator('button:has-text("دکتر مدیر")').first().click()
await page.waitForTimeout(2000)
await page.locator('aside nav button', { hasText: 'حسابداری و انبار' }).first().click()
await page.waitForTimeout(1500)
await page.locator('button[role="tab"]', { hasText: 'اعمال هزینه' }).first().click()
await page.waitForTimeout(2500)
// مقدار select ماه
const monthVal = await page.locator('section button[role="combobox"]').first().textContent().catch(() => '?')
console.log('month dropdown label:', monthVal)
await b.close()
