// اسکرین‌شات چشمی حسابداری: اعمال هزینه و سود + فاکتورهای خرید + چک‌ها با صیادی
import { chromium } from 'playwright'

const BASE = 'http://localhost:3000'
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 800 } })

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await page.locator('button:has-text("دکتر مدیر")').first().click()
await page.waitForTimeout(2200)
await page.locator('aside nav button', { hasText: 'حسابداری و انبار' }).first().click()
await page.waitForTimeout(1800)

// تب اعمال هزینه و سود
await page.locator('button[role="tab"]', { hasText: 'اعمال هزینه' }).first().click()
await page.waitForTimeout(2200)
await page.screenshot({ path: '/tmp/shot-profit.png' })

// تب فاکتورهای خرید
await page.locator('button[role="tab"]', { hasText: 'فاکتورهای خرید' }).first().click()
await page.waitForTimeout(1600)
await page.screenshot({ path: '/tmp/shot-purchases.png' })

// تب چک‌ها — صیادی
await page.locator('button[role="tab"]', { hasText: 'چک‌ها' }).first().click()
await page.waitForTimeout(1600)
await page.screenshot({ path: '/tmp/shot-checks.png' })

await b.close()

// ترکیب عمودی سه شات (فقط نیمهٔ بالای هر شات برای خوانایی)
const { execSync } = await import('node:child_process')
execSync(`python3 - <<'PY'
from PIL import Image
shots = ['/tmp/shot-profit.png', '/tmp/shot-purchases.png', '/tmp/shot-checks.png']
parts = []
for s in shots:
    im = Image.open(s)
    im = im.crop((0, 0, im.width, min(im.height, 560)))
    im.thumbnail((1100, 520))
    parts.append(im.convert('RGB'))
H = sum(p.height for p in parts) + 8 * (len(parts) - 1)
comp = Image.new('RGB', (parts[0].width, H), (40, 44, 50))
y = 0
for p in parts:
    comp.paste(p, (0, y)); y += p.height + 8
comp.save('/tmp/finance-check.jpg', quality=72)
print('composite ok')
PY`, { stdio: 'inherit' })
