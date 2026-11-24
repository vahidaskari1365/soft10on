// اسکرین‌شات چشمی: صفحهٔ لاگین + پوستهٔ برنامه (سایدبار و topbar) با لوگوی جدید
import { chromium } from 'playwright'

const BASE = 'http://localhost:3000'
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 800 } })

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: '/tmp/shot-login.png' })

// ورود با کلید دکتر مدیر
await page.locator('button:has-text("دکتر مدیر")').first().click()
await page.waitForTimeout(2500)
await page.screenshot({ path: '/tmp/shot-shell.png' })

await b.close()

// ترکیب دو شات به یک تصویر
const { default: sharp } = await import('sharp').catch(() => ({ default: null }))
if (sharp) {
  const a = await sharp('/tmp/shot-login.png').resize(1280).toBuffer()
  const c = await sharp('/tmp/shot-shell.png').resize(1280).toBuffer()
  const ah = Math.round((await sharp(a).metadata()).height)
  const ch = Math.round((await sharp(c).metadata()).height)
  await sharp({ create: { width: 1280, height: ah + ch, channels: 3, background: '#000' } })
    .composite([{ input: a, top: 0, left: 0 }, { input: c, top: ah, left: 0 }])
    .jpeg({ quality: 70 })
    .toFile('/tmp/ui-check.jpg')
  console.log('composite ok')
} else {
  console.log('sharp unavailable — shots saved raw')
}
