import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import { cleanEnvValue } from './env-value'
import { currentTenant } from './tenant-als'

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

/** بوت‌استرپ SQLite برای توسعه — فقط در محیط غیر production فراخوانی می‌شود */
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

  // آیا نیاز به بوت‌استرپ داریم؟
  const needsBootstrap =
    process.env.VERCEL === '1' || // محیط سرورلس ورسل
    !url || // هیچ URL ای تنظیم نشده
    (filePart !== '' && resolvedFile === null) // فایل تنظیم‌شده وجود ندارد

  if (!needsBootstrap) return

  const target = '/tmp/10on.db'
  if (!fs.existsSync(target)) {
    const candidates = [
      path.join(process.cwd(), 'db', 'seed.db'),
      path.join(process.cwd(), 'prisma', 'seed.db'),
      path.join(process.cwd(), 'db', 'custom.db'),
    ]
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          fs.copyFileSync(candidate, target)
          break
        }
      } catch {
        // نادیده بگیر و سراغ گزینه بعدی برو
      }
    }
  }
  process.env.DATABASE_URL = `file:${target}`
}

/**
 * اتصال دیتابیس را تضمین می‌کند — فقط با اولین دسترسی واقعی صدا زده می‌شود.
 * Production بدون DATABASE_URL امن متوقف می‌شود (fail-closed):
 * هیچ fallback فایلِ حاوی اعتبارنامه، هیچ دیتابیس آزمایشی خاموش.
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
  if (isProduction) {
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

/** wrap متدهای یک delegate مدل با منطق Tenant */
function scopedDelegate(model: string, delegate: object): object {
  return new Proxy(delegate, {
    get(d, method) {
      const v: unknown = Reflect.get(d, method, d)
      if (typeof v !== 'function') return v
      const fn = v as AnyFn
      const m = String(method)
      if (!SCOPED_METHODS.has(m)) return fn.bind(d)
      return (...callArgs: unknown[]) => {
        const ctx = currentTenant()
        if (process.env.NODE_ENV !== 'production' && process.env.TENANT_DEBUG === '1') {
          console.log(`[tenant] ${model}.${m} ctx=${ctx ? ctx.clinicId.slice(-6) : 'null'}`)
        }
        const first = (callArgs[0] ?? {}) as AnyArgs
        if (ctx) {
          if (m === 'create' || m === 'createMany') injectClinicId(first, ctx.clinicId)
          else if (TENANT_SCOPED.has(model)) andWhere(first, { clinicId: ctx.clinicId })
          if (ctx.role === 'PATIENT' && PATIENT_OWNED.has(model)) andWhere(first, { patientId: ctx.patientId })
          if (ctx.role === 'PATIENT' && model === 'Patient') andWhere(first, { id: ctx.patientId })
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
