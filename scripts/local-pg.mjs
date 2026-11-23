/**
 * پستگرس واقعی embedded برای محیط تست مستقل — باینری رسمی PostgreSQL، بدون root.
 * اجرا: bun scripts/local-pg.mjs  (پورت 5433، دیتابیس tenon_test)
 */
import EmbeddedPostgres from 'embedded-postgres'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// مسیر داده نسبت به ریشهٔ پروژه — وابسته به کامپیوتر خاصی نیست
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(PROJECT_ROOT, '.pgdata')

// جلوگیری از اتصال اشتباه به دیتابیس واقعی — فقط مسیر داخل پروژه مجاز است
if (!DATA_DIR.startsWith(PROJECT_ROOT)) {
  console.error('BLOCKED: data dir خارج از پروژه مجاز نیست')
  process.exit(1)
}

// فقط خوشهٔ initialize‌شده مانع است — پوشهٔ خالی مشکلی ندارد
if (fs.existsSync(DATA_DIR + '/PG_VERSION')) {
  console.error('.pgdata خوشهٔ آماده دارد — پستگرس احتمالاً در حال اجراست؛ برای بازسازی: rm -rf .pgdata')
  process.exit(0)
}

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: 'tenon',
  password: 'tenon-local',
  port: 5433,
  persistent: false,
})
await pg.initialise()
await pg.start()
await pg.createDatabase('tenon_test')
console.log('PG ready on :5433, db=tenon_test')
setInterval(() => {}, 1_000_000)
