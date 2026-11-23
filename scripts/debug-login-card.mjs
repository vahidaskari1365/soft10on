// دیباگ: کلیک کارت «دکتر» — ثبت ناوبری‌ها، درخواست‌های API و کنسول تا پیدا کردن عامل reload
import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()
page.on('framenavigated', (f) => {
  if (f === page.mainFrame()) console.log('MAIN-NAV', f.url().slice(0, 80))
})
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text().slice(0, 160))
})
page.on('response', (r) => {
  if (r.url().includes('/api/') && r.status() >= 400) console.log('API-ERR', r.status(), r.url().slice(0, 100))
})
page.on('request', (r) => {
  if (r.url().includes('/api/auth/')) console.log('REQ', r.method(), r.url().slice(0, 80))
})

await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 60000 })
const card = page.locator('button[aria-label="ورود سریع به عنوان دکتر"]')
await card.waitFor({ timeout: 30000 })
console.log('card found, clicking...')
for (let i = 0; i < 8; i++) {
  await card.click().catch((e) => console.log('click err', String(e).slice(0, 80)))
  const h2 = page.locator('h2:has-text("ورود به سامانه 10on")')
  try {
    await h2.waitFor({ state: 'detached', timeout: 4000 })
    console.log('LOGIN OK (h2 detached)')
    break
  } catch {
    console.log('retry', i)
  }
}
await page.waitForTimeout(6000)
const url = page.url()
console.log('FINAL URL:', url)
const body = await page.locator('body').innerText().catch((e) => 'READ-ERR ' + String(e).slice(0, 80))
console.log('BODY:', body.slice(0, 150).replace(/\s+/g, ' '))
await browser.close()
