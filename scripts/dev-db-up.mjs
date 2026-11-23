/**
 * بالا آوردن خودکار دیتابیس محلی برای dev — بدون دستور دستی.
 * اجرا: bun scripts/dev-db-up.mjs  (همچنین هنگام بوت سرور از src/instrumentation.ts صدا زده می‌شود)
 * ترتیب: ping → اگر در دسترس نبود شروع embedded-postgres (initialize فقط برای خوشهٔ تازه) →
 * ساخت دیتابیس هدف → prisma migrate deploy → seed فقط اگر خالی → فایل آماده‌باش .pgdata/.up-to-date
 * پس از شروع postgres این فرآیند زنده می‌ماند تا سرور بالا باشد.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(PROJECT_ROOT, '.pgdata')
const READY_FILE = path.join(DATA_DIR, '.up-to-date')

// مسیر داده داخل پروژه — وابسته به کامپیوتر خاصی نیست
if (!DATA_DIR.startsWith(PROJECT_ROOT)) {
  console.error('BLOCKED: data dir خارج از پروژه مجاز نیست')
  process.exit(1)
}

function parseDb(url) {
  const u = new URL(url)
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username || 'tenon'),
    password: decodeURIComponent(u.password || 'tenon-local'),
    database: u.pathname.replace(/^\//, '') || 'postgres',
  }
}

async function reachable(url, timeoutSec = 2) {
  const sql = postgres(url, { max: 1, connect_timeout: timeoutSec, onnotice: () => {} })
  try {
    await sql`SELECT 1`
    return true
  } catch {
    return false
  } finally {
    try { await sql.end({ timeout: 1 }) } catch {}
  }
}

async function ensureSchemaAndSeed(url) {
  execFileSync('bunx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
    env: { ...process.env, DATABASE_URL: url },
  })
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  const rows = await sql`SELECT count(*)::int AS c FROM "User"`
  await sql.end()
  if ((rows[0]?.c ?? 0) === 0) {
    console.log('DB خالی است — seed...')
    execFileSync('bun', ['prisma/seed.ts'], {
      stdio: 'inherit',
      cwd: PROJECT_ROOT,
      env: { ...process.env, DATABASE_URL: url },
    })
  }
}

async function main() {
  const url = process.env.DATABASE_URL || 'postgresql://tenon:tenon-local@localhost:5433/tenon_test'
  const cfg = parseDb(url)
  fs.mkdirSync(DATA_DIR, { recursive: true })

  if (await reachable(url)) {
    await ensureSchemaAndSeed(url)
    fs.writeFileSync(READY_FILE, new Date().toISOString())
    console.log(`DB READY (در حال اجرا بود): ${cfg.host}:${cfg.port}/${cfg.database}`)
    process.exit(0)
  }

  const { default: EmbeddedPostgres } = await import('embedded-postgres')
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: cfg.user,
    password: cfg.password,
    port: cfg.port,
    persistent: false,
  })
  if (!fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) await pg.initialise()
  await pg.start()

  // ساخت دیتابیس هدف اگر وجود ندارد — اتصال مدیریتی به postgres
  const maint = new URL(url)
  maint.pathname = '/postgres'
  const adm = postgres(maint.toString(), { max: 1, onnotice: () => {} })
  try {
    await adm.unsafe(`CREATE DATABASE "${cfg.database}"`)
    console.log(`database ساخته شد: ${cfg.database}`)
  } catch { /* از قبل هست */ }
  await adm.end()

  await ensureSchemaAndSeed(url)
  fs.writeFileSync(READY_FILE, new Date().toISOString())
  console.log(`DB READY: ${cfg.host}:${cfg.port}/${cfg.database}`)
  setInterval(() => {}, 1_000_000) // زنده نگه‌داشتن postgres تا وقتی این فرآیند زنده است
}

main().catch((e) => {
  console.error('db-ensure failed:', String(e).slice(0, 300))
  process.exit(1)
})
