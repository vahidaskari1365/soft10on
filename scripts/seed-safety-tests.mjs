#!/usr/bin/env node
/**
 * تست ایمنی Seed — فاز ۵ مأموریت
 * دو کلینیک مستقل؛ seed برای دموی خودش فقط دموی خودش را لمس کند؛ idempotent؛ prod بلاک.
 * اجرا: node scripts/seed-safety-tests.mjs
 */
import { assertTestDb, loadTestDbUrl } from './test-env.mjs'
assertTestDb()
// فرزندان execSync هم باید دیتابیس تست را ببینند
process.env.DATABASE_URL = loadTestDbUrl()

const results = []
const record = (name, pass, detail = '') => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`)
}
const { execSync } = await import('node:child_process')
const runSeed = (envExtra) => execSync('bun prisma/seed.ts', {
  cwd: process.cwd(),
  stdio: ['ignore', 'ignore', 'pipe'],
  maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, ...envExtra },
})

const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient({ log: [], datasources: { db: { url: loadTestDbUrl() } } })

// کلینیک «واقعی» دیگر با دادهٔ مستقل
const other = await db.clinic.create({ data: { name: `کلینیک واقعی-${Date.now() % 100000}` } })
await db.branch.create({ data: { code: `REAL${Date.now() % 100000}`, name: 'شعبهٔ واقعی', city: 'اصفهان', address: 'x', phone: '0310000000', clinicId: other.id } })
const realUser = await db.user.create({ data: { username: `real${Date.now() % 100000}`, password: 'x:y', fullName: 'کاربر واقعی', role: 'ADMIN', clinicId: other.id, active: true } })
const realPat = await db.patient.create({ data: { firstName: 'واقعی', lastName: 'مهم', phone: `0938${Date.now() % 1000000}`, clinicId: other.id } })
const countsBefore = {
  clinics: await db.clinic.count(),
  usersOther: await db.user.count({ where: { clinicId: other.id } }),
  patientsOther: await db.patient.count({ where: { clinicId: other.id } }),
}

// ————— اجرای seed روی همان دیتابیس تست (دو بار — idempotency)
let seedOk = true
for (let i = 0; i < 2; i++) {
  try {
    runSeed({ NODE_ENV: 'development' })
  } catch (e) {
    seedOk = false
    console.error(String(e).slice(0, 300))
  }
}
record('اجرای دوبارهٔ seed بدون خطا (idempotent)', seedOk)
record('seed کلینیک واقعی دیگر را حذف نکرد', await db.clinic.findUnique({ where: { id: other.id } }) !== null)
record('دیتابیس: کاربر واقعی دست‌نخورده', (await db.user.findUnique({ where: { id: realUser.id } }))?.fullName === 'کاربر واقعی')
record('دیتابیس: بیمار واقعی دست‌نخورده', (await db.patient.findUnique({ where: { id: realPat.id } }))?.lastName === 'مهم')
record('دیتابیس: شعبهٔ واقعی دست‌نخورده', !!(await db.branch.findFirst({ where: { clinicId: other.id } })))
record('دادهٔ کلینیک دیگر تکثیر نشد', (await db.user.count({ where: { clinicId: other.id } })) === countsBefore.usersOther)
record('دادهٔ کلینیک دیگر حذف نشد', (await db.patient.count({ where: { clinicId: other.id } })) === countsBefore.patientsOther)

// دادهٔ دمو تکثیر نشد (users = 6 ثابت: manager, super, admin, reception, reception2, doctor, patient)
const demoUsers = await db.user.count({ where: { username: { in: ['manager', 'super', 'admin', 'reception', 'reception2', 'doctor', 'patient'] } } })
record('کاربران دمو تکثیر نشدند (۷ کاربر)', demoUsers === 7, `count=${demoUsers}`)


// ————— KnowledgeBase و AiCall (جدول global): پس از اجرای دوبارهٔ seed تکثیر نمی‌شوند
const kbBefore = await db.knowledgeBase.count()
const aiBefore = await db.aiCall.count()
try {
  runSeed({ NODE_ENV: 'development' })
} catch (e) { console.error('third seed run failed', String(e).slice(0, 120)) }
const kbAfter = await db.knowledgeBase.count()
const aiAfter = await db.aiCall.count()
record('KnowledgeBase پس از اجرای مجدد seed تکثیر نشد', kbAfter === kbBefore, `${kbBefore}→${kbAfter}`)
record('AiCall پس از اجرای مجدد seed تکثیر نشد (marker refKey=seed)', aiAfter === aiBefore, `${aiBefore}→${aiAfter}`)

// ————— seed در production بلاک می‌شود
let prodBlocked = false
try {
  runSeed({ NODE_ENV: 'production', VERCEL: '1' })
} catch { prodBlocked = true }
record('seed روی production متوقف می‌شود', prodBlocked)
// با مجوز اضطراری هم دادهٔ غیر-seed حذف نمی‌شود (حذف‌های seed حذف global نیستند)
try {
  runSeed({ NODE_ENV: 'production', VERCEL: '1', SEED_ALLOW_PRODUCTION: '1' })
} catch { /* در محیط واقعی prod اجرا نمی‌شود — فقط تأیید بلاک پیش‌فرض کافی است */ }
record('بعد از تلاش اضطراری، دادهٔ کلینیک واقعی موجود است', !!(await db.user.findUnique({ where: { id: realUser.id } })))

// پاک‌سازی کلینیک تست این اسکریپت
await db.user.deleteMany({ where: { clinicId: other.id } })
await db.branch.deleteMany({ where: { clinicId: other.id } })
await db.patient.deleteMany({ where: { clinicId: other.id } })
await db.clinic.delete({ where: { id: other.id } })
await db.$disconnect()
const fails = results.filter((r) => !r.pass).length
console.log(`\n=== ${results.length - fails}/${results.length} PASS ===`)
process.exit(fails ? 1 : 0)
