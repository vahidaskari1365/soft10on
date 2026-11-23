#!/usr/bin/env node
// دیباگ networkidle — فهرست درخواست‌های باز/در حال تکرار صفحهٔ لاگین
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage()
const events = []
page.on('console', (m) => { const t = m.text(); if (/error|warn|hydrat|Reload|reload/i.test(t)) events.push(['CONSOLE', m.type(), t.slice(0, 160), Date.now()]) })
page.on('pageerror', (e) => events.push(['PAGEERROR', '', String(e).slice(0, 200), Date.now()]))
page.on('request', (r) => events.push(['REQ', r.method(), r.url().slice(0, 110), Date.now()]))
page.on('requestfinished', (r) => events.push(['FIN', r.method(), r.url().slice(0, 110), Date.now()]))
page.on('requestfailed', (r) => events.push(['FAIL', r.method(), r.url().slice(0, 110), Date.now() + ' ' + (r.failure()?.errorText ?? '')]))
page.on('websocket', (w) => {
  events.push(['WS-OPEN', '', w.url().slice(0, 110), Date.now()])
  w.on('framereceived', (f) => {
    const payload = String(f.payload ?? '').slice(0, 120)
    if (payload && payload !== 'ping') events.push(['WS-MSG', '', payload, Date.now()])
  })
})
page.on('close', () => {})
const BASE = process.argv[2] ?? 'http://localhost:3000'
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(12000)
// دلتای درخواست‌های بدون پایان (REQ بدون FIN) و درخواست‌های تکراری
const reqs = events.filter((e) => e[0] === 'REQ')
const fins = new Set(events.filter((e) => e[0] === 'FIN').map((e) => e[2] + '|' + e[1]))
const pending = reqs.filter((r) => !fins.has(r[2] + '|' + r[1]))
console.log('total req:', reqs.length, 'pending:', pending.length)
for (const p of pending.slice(0, 10)) console.log('PENDING:', p[1], p[2])
// تکراری‌ها
const counts = {}
for (const r of reqs) counts[r[2]] = (counts[r[2]] ?? 0) + 1
const dupes = Object.entries(counts).filter(([, c]) => c > 3)
for (const [u, c] of dupes.slice(0, 10)) console.log('REPEATED x' + c + ':', u)
const ws = events.filter((e) => e[0] === 'WS-OPEN')
for (const w of ws.slice(0, 3)) console.log('WS:', w[2])
for (const m of events.filter((e) => e[0] === 'WS-MSG').slice(0, 6)) console.log('WS-MSG:', m[2])
await browser.close()
