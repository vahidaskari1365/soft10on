import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import { cleanEnvValue } from './env-value'
import { currentTenant, type TenantCtx } from './tenant-als'
import { isDemoAuthEnabled } from './demo-users'

// ------------------------------------------------------------------
// بوت‌استرپ دیتابیس برای استقرار سرورلس (Vercel و مشابه)
// ------------------------------------------------------------------
// حالت PostgreSQL (Supabase): DATABASE_URL با postgres شروع می‌شود؛
// نیازی به بوت‌استرپ فایل نیست و مستقیم همان اتصال استفاده می‌شود.
//
// حالت SQLite (fallback): روی Vercel فایل‌سیستم فقطخواندنی است به‌جز
// /tmp؛ پس در اولین اجرای هر نمونهٔ تابع (cold start)، دیتابیس بذر
// (db/seed.db) که داخل باندل قرار دارد به /tmp/10on.db کپی می‌شود و
// DATABASE_URL به همان مسیر تغییر می‌کند.
//
// نکتهٔ مهم (lazy): هیچ گارد پیکربندی در زمان import اجرا نمی‌شود؛
// وگرنه مرحلهٔ «Collecting page data» در build ورسل — که هنوز متغیرهای
// محیطی را تزریق نکرده — با خطا متوقف می‌شد. گارد fail-closed و ساخت
// کلاینت با اولین دسترسی واقعی به دیتابیس انجام می‌شود.
// ------------------------------------------------------------------

/** خواندن DATABASE_URL از فایل‌های env پروژه (برای محیط‌هایی که متغیر ناسازگار تزریق می‌کنند) */
function envFileUrl(): string | null {
  for (const f of ['.env.local', '.env']) {
    try {
      const raw = fs.readFileSync(path.join(process.cwd(), f), 'utf8')
      const m = raw.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1]
      if (m) return m
    } catch {
      // فایل وجود ندارد؛ فایل بعدی
    }
  }
  return null
}

/** مسیر دیتابیس بذر داخل مخزن/باندل — با هر چیدمان استقرار پیدا می‌شود */
function findSeedDb(): string | null {
  const candidates = [
    path.join(process.cwd(), 'db', 'seed.db'),
    path.join(process.cwd(), 'prisma', 'seed.db'),
    path.join(process.cwd(), 'db', 'custom.db'),
    path.join(process.cwd(), '.next', 'standalone', 'db', 'seed.db'),
    path.join(process.cwd(), '..', 'db', 'seed.db'),
  ]
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch {
      // مسیر خوانا نیست؛ گزینهٔ بعدی
    }
  }
  return null
}

/** آستانهٔ «دیتابیس خالی»: فایل sqlite تازه‌ساخت schema-only چند ده کیلوبایت است؛ بذر ~۸۰۰KB */
const EMPTY_DB_MAX_BYTES = 65_536

/**
 * نشاندن بذر روی فایل sqlite هدف — فقط وقتی فایل غایب یا خالی است یا از نسخهٔ
 * بذر قدیمی‌تر است (meta اندازهٔ بذر؛ redeploy با schema جدید فایل کهنگهٔ
 * ناسازگار را جایگزین می‌کند). فایل حجیمِ هم‌نسخه با بذر دست‌نخورده می‌ماند.
 */
function ensureSeeded(target: string): void {
  const seed = findSeedDb()
  if (!seed) return
  const meta = `${target}.seedmeta`
  let seedSize = -1
  try {
    seedSize = fs.statSync(seed).size
  } catch {
    return
  }
  let currentSize = -1
  try {
    currentSize = fs.statSync(target).size
  } catch {
    /* فایل نیست — بذر می‌خورد */
  }
  let lastSeedSize = -1
  try {
    lastSeedSize = Number(fs.readFileSync(meta, 'utf8').trim())
  } catch {
    /* meta نیست */
  }
  if (currentSize > EMPTY_DB_MAX_BYTES && lastSeedSize === seedSize) return
  try {
    fs.copyFileSync(seed, target)
    fs.writeFileSync(meta, String(seedSize))
  } catch {
    /* فایل‌سیستم فقطخواندنی — با همان فایل موجود ادامه می‌دهیم */
  }
}

/**
 * بوت‌استرپ SQLite — توسعه، ورسل و هاستِ بدون PostgreSQL.
 * در production هم وقتی «حالت نمایشی» فعال است (پیش‌فرض؛ برای استقرار واقعی:
 * TENON_DISABLE_DEMO_LOGIN=1 یا TENON_REQUIRE_DATABASE_URL=1) از همین مسیر
 * استفاده می‌شود تا کل نرم‌افزار روی هاستی که دیتابیس تنظیم نکرده به‌جای خطا
 * با دادهٔ نمونه بالا بیاید.
 */
function bootstrapSqliteFallback(url: string) {
  const filePart = url.startsWith('file:') ? url.slice('file:'.length) : ''

  // آیا فایل تنظیم‌شده وجود دارد؟ (نسبت به ریشه پروژه و پوشه prisma)
  const resolvedFile =
    filePart === ''
      ? null
      : path.isAbsolute(filePart) && fs.existsSync(filePart)
        ? filePart
        : [path.resolve(process.cwd(), filePart), path.resolve(process.cwd(), 'prisma', filePart)]
            .find((p) => fs.existsSync(p)) ?? null

  // فایل موجودِ پلتفرم اما خالی (schema-only) → با دیتابیس بذر جایگزین می‌شود.
  // فقط فایل‌های بیرون از مخزن — فایل‌های توسعهٔ داخل پروژه هرگز بازنویسی نمی‌شوند.
  if (process.env.VERCEL !== '1' && resolvedFile) {
    const inProject = resolvedFile.startsWith(process.cwd() + path.sep)
    try {
      if (!inProject && fs.statSync(resolvedFile).size <= EMPTY_DB_MAX_BYTES) ensureSeeded(resolvedFile)
    } catch {
      // اندازه خوانا نشد؛ با همان فایل ادامه
    }
    return
  }

  // آیا نیاز به بوت‌استرپ داریم؟
  const needsBootstrap =
    process.env.VERCEL === '1' || // محیط سرورلس ورسل (فایل‌سیستم فقطخواندنی به‌جز /tmp)
    !url || // هیچ URL ای تنظیم نشده
    filePart !== '' // فایل تنظیم‌شده پیدا نشد

  if (!needsBootstrap) return

  const target = '/tmp/10on.db'
  ensureSeeded(target)
  process.env.DATABASE_URL = `file:${target}`
}

/**
 * اتصال دیتابیس را تضمین می‌کند — فقط با اولین دسترسی واقعی صدا زده می‌شود.
 * Production با PostgreSQL پیکربندی‌شده مستقیم وصل می‌شود؛ در حالت نمایشی
 * (پیش‌فرض) بدون PostgreSQL از دیتابیس بذر SQLite استفاده می‌شود تا کل
 * نرم‌افزار روی هاست بدون تنظیمات هم کار کند — نه خطای «تنظیمات محیطی».
 * استقرار واقعی fail-closed می‌ماند: TENON_DISABLE_DEMO_LOGIN=1 یا TENON_REQUIRE_DATABASE_URL=1
 * خطا نباید مقدار تلاش‌شده یا بخشی از رشته اتصال را نشان دهد.
 */
function requireDatabaseUrl() {
  // مقدار paste شده در پنل ممکن است کل خط یا داخل نقل‌قول باشد — پاک‌سازی و بازنویسی
  const raw = process.env.DATABASE_URL ?? ''
  const url = cleanEnvValue(raw, 'DATABASE_URL')
  if (url !== raw) process.env.DATABASE_URL = url

  // PostgreSQL/Supabase — بدون بوت‌استرپ
  if (url.startsWith('postgres')) return

  // متغیر وراثتی ناسازگار (file:) → اولویت با PostgreSQL داخل .env پروژه
  const fromEnvFile = envFileUrl()
  if (fromEnvFile?.startsWith('postgres')) {
    process.env.DATABASE_URL = fromEnvFile
    return
  }

  const isProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'
  if (isProduction && (process.env.TENON_REQUIRE_DATABASE_URL === '1' || !isDemoAuthEnabled())) {
    throw new Error(
      'CONFIGURATION ERROR: DATABASE_URL environment variable is required in production. ' +
        'Set it in the hosting provider (e.g. Vercel Project Settings → Environment Variables). ' +
        'Refusing to start with a demo database.'
    )
  }

  bootstrapSqliteFallback(url)
}

// ------------------------------------------------------------------
// جداسازی Tenant — مدل‌های دارای ستون clinicId (اعمال خودکار)
// LedgerAccount عمداً مستثناست: کدینگ حساب‌ها مشترک است؛ دادهٔ مالی در
// JournalEntry (scoped) نگهداری می‌شود. User هم مستثناست (کار پلتفرمی).
// ------------------------------------------------------------------
const TENANT_SCOPED = new Set([
  'Patient', 'Appointment', 'Task', 'Product', 'Purchase', 'ProductSale', 'Expense',
  'CashAccount', 'Invoice', 'Payment', 'Check', 'Payroll', 'Message',
  'Waitlist', 'PublicBooking', 'RoomUnit', 'Holiday', 'MedicalRecord',
  'JournalEntry', 'Prescription', 'TreatmentPlan', 'EmergencyContact',
  'TimelineEvent', 'AppointmentHistory', 'Service', 'Supplier', 'Branch',
  'Document', 'AuditLog',
])

/**
 * مدل‌های Branch-owned — کاربران محدود به شعبه (ctx.branchId) فقط دادهٔ شعبهٔ خود را
 * می‌بینند/می‌سازند. User مستثناست (branchId او «شعبهٔ خانه» است نه مالکیت داده) و
 * PATIENT نیز مستثناست (رکوردهایش ممکن است در هر شعبه ثبت شده باشد).
 */
const BRANCH_SCOPED = new Set([
  'Doctor', 'Appointment', 'Task', 'Product', 'Purchase', 'ProductSale', 'Expense',
  'CashAccount', 'Invoice', 'Payment', 'Check', 'Payroll', 'Message',
  'Waitlist', 'PublicBooking', 'RoomUnit', 'Holiday', 'MedicalRecord',
  'JournalEntry', 'Document', 'AuditLog',
])

/** مدل‌های دارای patientId — برای نقش بیمار فقط رکوردهای خودش */
const PATIENT_OWNED = new Set([
  'Appointment', 'Invoice', 'Payment', 'Check', 'MedicalRecord', 'ProductSale',
  'TreatmentPlan', 'Prescription', 'Document', 'TimelineEvent',
  'EmergencyContact', 'Message',
])

/** عملیات where-پذیر که تزریق امن دارند (unique-whereها مستثنا) */
const SCOPED_METHODS = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate',
  'groupBy', 'updateMany', 'deleteMany', 'create', 'createMany',
])

type AnyArgs = Record<string, unknown>

/** ترکیب شرط where با AND — بدون تخریب شرط موجود */
function andWhere(args: AnyArgs, cond: AnyArgs) {
  const w = (args.where ?? {}) as AnyArgs
  args.where = { AND: [cond, w] }
}

/** تزریق clinicId به دادهٔ create (تکی یا گروهی) — مقدار ناسازگار ممنوع */
function injectClinicId(args: AnyArgs, clinicId: string) {
  if (!('data' in args) || !args.data || typeof args.data !== 'object') return
  const rows: unknown[] = Array.isArray(args.data) ? args.data : [args.data]
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as AnyArgs
    if ('clinicId' in r && r.clinicId !== clinicId) {
      throw new Error('TENANT_MISMATCH: clinicId با زمینهٔ سشن نمی‌خواند')
    }
    if (!('clinicId' in r)) r.clinicId = clinicId
  }
}

/** تزریق branchId به دادهٔ create — کاربر محدود به شعبه فقط در شعبهٔ خودش ثبت می‌کند */
function injectBranchId(args: AnyArgs, branchId: string) {
  if (!('data' in args) || !args.data || typeof args.data !== 'object') return
  const rows: unknown[] = Array.isArray(args.data) ? args.data : [args.data]
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as AnyArgs
    if ('branchId' in r && r.branchId !== null && r.branchId !== branchId) {
      throw new Error('BRANCH_MISMATCH: branchId با شعبهٔ مجاز سشن نمی‌خواند')
    }
    if (!('branchId' in r)) r.branchId = branchId
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

let client: PrismaClient | undefined

function getDb(): PrismaClient {
  if (!client) client = globalForPrisma.prisma
  if (!client) {
    requireDatabaseUrl()
    client = new PrismaClient({
      log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error'],
    })
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client
  }
  return client
}

type AnyFn = (...args: unknown[]) => unknown

/** مدل‌های دارای مالکیت قابل کنترل در سطح سشن — برای findUnique/update/delete/upsert */
const OWNERSHIP_SCOPED = new Set(['Doctor', 'User'])

/** خطای «یافت نشد» سازگار با Prisma — مسیرها آن را به 404 نگاشت می‌کنند */
function ownershipNotFound(model: string, where: unknown): Error {
  const err = new Error(`No record found in ${model} within tenant scope for ${JSON.stringify(where)}`)
  ;(err as unknown as { code: string }).code = 'P2025'
  return err
}

/**
 * افزودن همهٔ شرط‌های scope به where عملیات خواندن/به‌روزرسانی گروهی.
 * ترتیب: clinicId (یا رابطهٔ Doctor) → شعبهٔ ستاد → مالکیت بیمار.
 */
function applyWhereScope(model: string, args: AnyArgs, ctx: TenantCtx): void {
  if (TENANT_SCOPED.has(model)) andWhere(args, { clinicId: ctx.clinicId })
  else if (model === 'Doctor') andWhere(args, { branch: { clinicId: ctx.clinicId } })
  else if (model === 'User') andWhere(args, { clinicId: ctx.clinicId })
  // محدودسازی شعبه‌ای برای نقش‌های ستاد (بیمار مستثنا — scoping او patientId است)
  if (ctx.branchId && !ctx.patientId && BRANCH_SCOPED.has(model)) andWhere(args, { branchId: ctx.branchId })
  if (ctx.role === 'PATIENT' && PATIENT_OWNED.has(model)) andWhere(args, { patientId: ctx.patientId })
  if (ctx.role === 'PATIENT' && model === 'Patient') andWhere(args, { id: ctx.patientId })
}

/** آیا این مدل در این زمینه نیاز به کنترل مالکیت دارد؟ */
function ownershipRelevant(model: string, ctx: TenantCtx): boolean {
  return (
    TENANT_SCOPED.has(model) ||
    BRANCH_SCOPED.has(model) ||
    OWNERSHIP_SCOPED.has(model) ||
    (ctx.role === 'PATIENT' && (PATIENT_OWNED.has(model) || model === 'Patient'))
  )
}

/** wrap متدهای یک delegate مدل با منطق Tenant */
function scopedDelegate(model: string, delegate: object): object {
  return new Proxy(delegate, {
    get(d, method) {
      const v: unknown = Reflect.get(d, method, d)
      if (typeof v !== 'function') return v
      const fn = v as AnyFn
      const m = String(method)

      // ————— عملیات unique-where: مالکیت قبل از اعمال، در همان زمینهٔ سشن کنترل می‌شود
      if (m === 'update' || m === 'delete' || m === 'upsert' || m === 'findUnique' || m === 'findUniqueOrThrow') {
        return (...callArgs: unknown[]) => {
          const ctx = currentTenant()
          const first = (callArgs[0] ?? {}) as AnyArgs
          if (!ctx || !ownershipRelevant(model, ctx)) return fn.apply(d, callArgs)

          // findUnique → findFirst با scope (unique-where در Prisma قابل ترکیب با clinicId نیست)
          if (m === 'findUnique' || m === 'findUniqueOrThrow') {
            const mapped = m === 'findUnique' ? 'findFirst' : 'findFirstOrThrow'
            const scopedFn = Reflect.get(d, mapped, d) as AnyFn
            applyWhereScope(model, first, ctx)
            callArgs[0] = first
            return (scopedFn as unknown as (...a: unknown[]) => unknown).apply(d, callArgs)
          }

          // update/delete/upsert: ابتدا مالکیت با scope معتبر، سپس عملیات اصلی
          const checkFn = Reflect.get(d, 'findFirst', d) as AnyFn
          const checkArgs: AnyArgs = { where: first.where }
          applyWhereScope(model, checkArgs, ctx)
          // mass-assignment: دادهٔ به‌روزرسانی حق تغییر مالکیت Tenant/Branch ندارد
          const mutData = ((first as AnyArgs).update ?? (first as AnyArgs).data ?? {}) as AnyArgs
          if (mutData && typeof mutData === 'object') {
            if ('clinicId' in mutData && mutData.clinicId !== ctx.clinicId && TENANT_SCOPED.has(model)) throw new Error('TENANT_MISMATCH: clinicId با زمینهٔ سشن نمی‌خواند')
            if (ctx.branchId && !ctx.patientId && BRANCH_SCOPED.has(model) && 'branchId' in mutData && mutData.branchId !== null && mutData.branchId !== ctx.branchId) throw new Error('BRANCH_MISMATCH: branchId با شعبهٔ مجاز سشن نمی‌خواند')
          }
          // update/delete: نبودِ رکورد در scope = P2025 — upsert: نبود = مسیر create تحت مالکیت
          return Promise.resolve(checkFn.apply(d, [checkArgs])).then((found) => {
            if (!found && m !== 'upsert') throw ownershipNotFound(model, first.where)
            if (!found) {
              // مسیر create این upsert باید تحت مالکیت درست ثبت شود
              const create = (first.create ?? {}) as AnyArgs
              if (TENANT_SCOPED.has(model) || model === 'User') {
                if ('clinicId' in create && create.clinicId !== ctx.clinicId) throw new Error('TENANT_MISMATCH: clinicId با زمینهٔ سشن نمی‌خواند')
                if (!('clinicId' in create)) create.clinicId = ctx.clinicId
              }
              if (ctx.branchId && !ctx.patientId && BRANCH_SCOPED.has(model)) {
                if ('branchId' in create && create.branchId !== null && create.branchId !== ctx.branchId) throw new Error('BRANCH_MISMATCH: branchId با شعبهٔ مجاز سشن نمی‌خواند')
                if (!('branchId' in create)) create.branchId = ctx.branchId
              }
              first.create = create
            }
            return (fn as unknown as (...a: unknown[]) => unknown).apply(d, callArgs)
          })
        }
      }

      if (!SCOPED_METHODS.has(m)) return fn.bind(d)
      return (...callArgs: unknown[]) => {
        const ctx = currentTenant()
        if (process.env.NODE_ENV !== 'production' && process.env.TENANT_DEBUG === '1') {
          console.log(`[tenant] ${model}.${m} ctx=${ctx ? ctx.clinicId.slice(-6) : 'null'}`)
        }
        const first = (callArgs[0] ?? {}) as AnyArgs
        if (ctx) {
          if (m === 'create' || m === 'createMany') {
            // فقط مدل‌های دارای ستون clinicId — User (NOT NULL) هم در create تزریق می‌شود
            if (TENANT_SCOPED.has(model) || model === 'User') injectClinicId(first, ctx.clinicId)
            // کاربر محدود به شعبه — بدون بیمار بودن — فقط در شعبهٔ خودش ثبت می‌کند
            if (ctx.branchId && !ctx.patientId && BRANCH_SCOPED.has(model)) injectBranchId(first, ctx.branchId)
          } else {
            applyWhereScope(model, first, ctx)
          }
        }
        callArgs[0] = first
        return fn.apply(d, callArgs)
      }
    },
  })
}

/**
 * دسترسی lazy به Prisma + دفاع مرکزی Tenant:
 * هر `db.<model>` یک delegate مجهز به scope سشن برمی‌گرداند.
 * داخل db.$transaction کلاینت tx خام است — Routeهای مالی باید scope را
 * صریح اعمال کنند (helpers در tenant.ts).
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const real = getDb()
    const name = String(prop)
    if (name.startsWith('$')) {
      const v: unknown = Reflect.get(real, prop, real)
      return typeof v === 'function' ? (v as AnyFn).bind(real) : v
    }
    // نام مدل: حرف اول بزرگ (patient → Patient)
    const model = name.charAt(0).toUpperCase() + name.slice(1)
    const delegateV: unknown = Reflect.get(real, prop, real)
    if (!delegateV || typeof delegateV !== 'object') return delegateV
    return scopedDelegate(model, delegateV as object)
  },
}) as PrismaClient
