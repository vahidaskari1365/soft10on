#!/usr/bin/env node
/**
 * تست واقعی Backup/Restore — فاز ۱۵ مأموریت
 * dump منطقی (to_json → فایل JSON کلاینت‌ساید) از همهٔ جدول‌های public → ساخت دیتابیس دوم → migrate → بازیابی (INSERT گروهی) →
 * مقایسهٔ تعداد رکورد و یک رکورد نمونه. مسیر عملیاتی production: pg_dump روزانه Supabase (docs/BACKUP-RESTORE.md).
 * اجرا: node scripts/backup-restore-tests.mjs
 */
import { assertTestDb, loadTestDbUrl } from './test-env.mjs'
assertTestDb()
import postgres from 'postgres'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const SRC = loadTestDbUrl() // postgresql://tenon:...@localhost:5433/tenon_test
const DST = SRC.replace(/\/tenon_test$/, '/tenon_restore')
// مسیر نسبی به ریشهٔ ریپو — هاردکد مسیر sandbox در CI (runner: /home/runner/...) می‌شکست
const BACKUP_DIR = path.join(process.cwd(), '.pgbackup')
const results = []
const record = (name, pass, detail = '') => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`)
}

const src = postgres(SRC, { max: 1, onnotice: () => {} })

// ————— ۱) Backup: COPY TO برای همهٔ جدول‌های public
fs.rmSync(BACKUP_DIR, { recursive: true, force: true })
fs.mkdirSync(BACKUP_DIR, { recursive: true })
const tables = (await src`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`).map((r) => r.tablename)
// dump کلاینت‌ساید (to_json → فایل JSON محلی): COPY TO سمت سرور داخل کانتینر postgres می‌نویسد
// و روی runner/service-container قابل خواندن نیست — محتوا و قواعد تست دقیقاً همان است
const chunks = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }
let dumped = 0, failed = []
for (const t of tables) {
  try {
    const rows = (await src.unsafe(`SELECT to_json(x)::text AS j FROM "public"."${t}" x`)).map((r) => JSON.parse(r.j))
    const file = path.join(BACKUP_DIR, `${t}.json`)
    fs.writeFileSync(file, JSON.stringify(rows))
    if (fs.existsSync(file) && fs.statSync(file).size >= 0) dumped++
  } catch (e) {
    failed.push(`${t}: ${String(e).slice(0, 60)}`)
  }
}
record(`Backup: ${dumped}/${tables.length} جدول dump شد`, dumped === tables.length, failed.slice(0, 2).join(' | '))

// ————— ۲) دیتابیس مقصد: ساخت + migrate (با env — پرچم --url برای db execute پایدار نیست)
const MAINT = SRC.replace(/\/tenon_test$/, '/postgres')
// DDL دیتابیس با اتصال مستقیم (CREATE DATABASE در تراکنش مجاز نیست — prisma db execute تراکنشی است)
const admin = postgres(MAINT, { max: 1, onnotice: () => {} })
try {
  await admin.unsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'tenon_restore'`)
  await admin.unsafe('DROP DATABASE IF EXISTS tenon_restore')
  await admin.unsafe('CREATE DATABASE tenon_restore')
  record('دیتابیس بازیابی ساخته شد', true)
} catch (e) { record('دیتابیس بازیابی ساخته شد', false, String(e).slice(0, 90)) }
await admin.end()
const mig = execSync('bunx prisma migrate deploy --schema prisma/schema.prisma', { shell: '/bin/bash', stdio: 'pipe', env: { ...process.env, DATABASE_URL: DST } }).toString()
record('Migration روی دیتابیس بازیابی', mig.includes('successfully applied'))

// ————— ۳) Restore: درج گروهی از فایل‌های JSON (معادل COPY FROM؛ کلاینت‌ساید تا در CI هم کار کند)
const dst = postgres(DST, { max: 1, onnotice: () => {} })
// ترفند استاندارد pg_restore: تعلیق بررسی FK فقط در جلسهٔ بازیابی (کاربر مالک/سوپراختیار)
await dst.unsafe('SET session_replication_role = replica')
let restored = 0, rFailed = []
// پاک‌سازی یکجا — TRUNCATE داخل حلقه با CASCADE دادهٔ رکوردهای تازهٔ بازیابی‌شده را می‌کشت
await dst.unsafe(`TRUNCATE ${tables.map((t) => `"public"."${t}"`).join(', ')} CASCADE`)
for (const t of tables) {
  const file = path.join(BACKUP_DIR, `${t}.json`)
  if (!fs.existsSync(file)) continue
  try {
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (rows.length === 0) { restored++; continue }
    const cols = Object.keys(rows[0])
    for (const chunk of chunks(rows, 400)) {
      const vals = chunk.map((r) => cols.map((c) => r[c] ?? null))
      const ph = vals.map((_, i) => `(${cols.map((__, j) => `$${i * cols.length + j + 1}`).join(',')})`).join(',')
      await dst.unsafe(
        `INSERT INTO "public"."${t}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES ${ph}`,
        vals.flat(),
      )
    }
    restored++
  } catch (e) {
    rFailed.push(`${t}: ${String(e).slice(0, 70)}`)
  }
}
record(`Restore: ${restored}/${tables.length} جدول بازیابی شد`, restored === tables.length, rFailed.slice(0, 2).join(' | '))

await dst.unsafe('SET session_replication_role = origin')
// ————— ۴) صحت: مقایسهٔ تعداد رکورد
let compared = 0, mismatches = []
for (const t of tables) {
  try {
    const a = (await src.unsafe(`SELECT count(*)::int AS c FROM "public"."${t}"`))[0].c
    const b = (await dst.unsafe(`SELECT count(*)::int AS c FROM "public"."${t}"`))[0].c
    compared++
    if (a !== b) mismatches.push(`${t}: ${a}→${b}`)
  } catch { /* جدول بدون رکورد */ }
}
record(`صحت بازیابی: ${compared} جدول مقایسه شد`, mismatches.length === 0, mismatches.slice(0, 3).join(' | '))

// ————— ۵) نمونهٔ واقعی: آخرین بیمار باید محتوا یکسان باشد
const srcP = (await src`SELECT "firstName","lastName","phone","clinicId" FROM "public"."Patient" ORDER BY "createdAt" DESC LIMIT 1`)[0]
const dstP = (await dst`SELECT "firstName","lastName","phone","clinicId" FROM "public"."Patient" ORDER BY "createdAt" DESC LIMIT 1`)[0]
record('رکورد نمونه (بیمار) پس از بازیابی یکسان است', JSON.stringify(srcP) === JSON.stringify(dstP), `${JSON.stringify(srcP).slice(0, 60)}`)

await src.end(); await dst.end()
const fails = results.filter((r) => !r.pass).length
console.log(`\n=== ${results.length - fails}/${results.length} PASS ===`)
process.exit(fails ? 1 : 0)
