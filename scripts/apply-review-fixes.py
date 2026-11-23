#!/usr/bin/env python3
"""اصلاحات ناشی از بازبینی — ادعاهای تأییدشده ۱،۳،۴،۵،۶،۷ + marker AiCall + CI"""
import re, json, os

# ————— ۱) tenant-als: ذخیرهٔ effectiveBranchId (نه u.branchId خام)
p = 'src/lib/tenant-als.ts'; s = open(p, encoding='utf-8').read()
assert 'branchId: u.branchId' in s
s = s.replace("""  const effectiveBranchId = CLINIC_WIDE_ROLES.has(u.role) ? null : u.branchId
  return {
    clinicId: u.clinicId,
    userId: u.id,
    role: u.role,
    branchId: u.branchId,""", """  const effectiveBranchId = CLINIC_WIDE_ROLES.has(u.role) ? null : u.branchId
  return {
    clinicId: u.clinicId,
    userId: u.id,
    role: u.role,
    // نقش‌های کلینیک‌گسترده باید branchId مؤثر null بگیرند — حتی اگر در DB شعبه‌ای ثبت شده باشد
    branchId: effectiveBranchId,""")
open(p, 'w', encoding='utf-8').write(s)
print('1) tenant-als: effectiveBranchId stored ✓')

# ————— ۳) db.ts: حذف pre-check بی‌صدا (void Promise بدون مدیریت خطا)
p = 'src/lib/db.ts'; s = open(p, encoding='utf-8').read()
assert 'void Promise.resolve(checkFn.apply' in s
s = s.replace("""          void Promise.resolve(checkFn.apply(d, [checkArgs])).then((found) => {
            if (!found) throw ownershipNotFound(model, first.where)
          })
""", "")
open(p, 'w', encoding='utf-8').write(s)
print('3) db.ts: stray fire-and-forget pre-check removed ✓')

# ————— ۵) schema.prisma: سه unique سراسری → مرکب per-clinic
p = 'prisma/schema.prisma'; s = open(p, encoding='utf-8').read()
def model_block(name):
    m = re.search(r'(?ms)^model ' + name + r' \{(.*?)^\}', s)
    return m
# Patient.fileNo
m = model_block('Patient')
blk = m.group(0)
blk2 = blk.replace('@unique // شماره پرونده اختصاصی', '').replace('fileNo', 'fileNo', 1)
blk2 = blk2.replace('@@map', '@@unique([clinicId, fileNo])\n  @@map', 1)
s = s.replace(blk, blk2)
# Service.code
m = model_block('Service')
blk = m.group(0)
blk2 = re.sub(r'(code\s+String\??\s+)@unique[^\n]*', r'\1', blk, count=1)
blk2 = blk2.replace('@@map', '@@unique([clinicId, code])\n  @@map', 1)
s = s.replace(blk, blk2)
# Supplier.name
m = model_block('Supplier')
blk = m.group(0)
blk2 = re.sub(r'(name\s+String\??\s+)@unique[^\n]*', r'\1', blk, count=1)
blk2 = blk2.replace('@@map', '@@unique([clinicId, name])\n  @@map', 1)
s = s.replace(blk, blk2)
# AiCall.refKey marker برای idempotency دادهٔ دموی seed
m = model_block('AiCall')
blk = m.group(0)
blk2 = blk.replace('  createdAt   DateTime @default(now())', '  createdAt  DateTime @default(now())\n  refKey     String? // شناسه منبع داده — ردیف‌های دموی seed با refKey=seed')
if 'refKey' not in blk2:
    blk2 = blk.replace('}', '  refKey     String? // شناسه منبع داده — ردیف‌های دموی seed با refKey=seed\n}')
s = s.replace(blk, blk2)
open(p, 'w', encoding='utf-8').write(s)
leftover = re.findall(r'(?m)^\s*(fileNo|code|name)\s+String\??\s+@unique', open(p, encoding='utf-8').read())
print('5) schema: composite uniques set ✓ (leftover global on tenant fields:', leftover, ')')

# ————— ۴) migration for AiCall.refKey
os.makedirs('prisma/migrations/20261123200000_aicall_seed_marker', exist_ok=True)
open('prisma/migrations/20261123200000_aicall_seed_marker/migration.sql', 'w', encoding='utf-8').write(
"""-- فاز ۵ مأموریت: marker مالکیت دادهٔ دمو برای idempotency کامل seed روی جدول global AiCall
ALTER TABLE "AiCall" ADD COLUMN IF NOT EXISTS "refKey" TEXT;
""")
print('4) AiCall refKey migration ✓')

# ————— ۶) seed: KB و AiCall idempotent (حذف فقط ردیف‌های متعلق به seed)
p = 'prisma/seed.ts'; s = open(p, encoding='utf-8').read()
# KB — قبل از حلقهٔ create
if "knowledgeBase.deleteMany({ where: { question: { in: kbQuestions } } })" not in s:
    # مجموعهٔ سؤال‌ها را قبل از حلقه جمع می‌کنیم
    s = s.replace("""    await db.knowledgeBase.create({ data: { question: q, answer: a, category: cat } })""",
"""    await db.knowledgeBase.create({ data: { question: q, answer: a, category: cat } })""")
    # تزریق پاک‌سازی قبل از اولین create — با مجموعهٔ سؤال‌های seed
    s = re.sub(r'(?ms)(for \(const \[q, a, cat\] of kbItems\) \{)',
               r'''// idempotency: فقط ردیف‌هایی که متن سؤالشان از این seed است پاک می‌شوند
    await db.knowledgeBase.deleteMany({ where: { question: { in: kbItems.map(([q]) => q) } } })
    \1''', s, count=1)
# AiCall — حذف ردیف‌های دموی قبلی (refKey=seed) و ثبت با marker
s = s.replace("""    await db.aiCall.create({
      data: {
        role,""", """    await db.aiCall.create({
      data: {
        refKey: 'seed',
        role,""")
s = s.replace("""  for (let d = 13; d >= 0; d--) {""", """  // idempotency: فقط ردیف‌های دموی خود seed (با marker) پاک می‌شوند — دادهٔ واقعی global دست‌نخورده
  await db.aiCall.deleteMany({ where: { refKey: 'seed' } })
  for (let d = 13; d >= 0; d--) {""")
open(p, 'w', encoding='utf-8').write(s)
ok_kb = 'knowledgeBase.deleteMany({ where: { question: { in: kbItems' in s
ok_ai = "refKey: 'seed'" in s and "deleteMany({ where: { refKey: 'seed' } })" in s
print(f'6) seed idempotency: KB={ok_kb} AiCall={ok_ai}')

# ————— ۷) test-env: اولویت process.env (آنچه فرآیند سرور/تست واقعاً استفاده می‌کند)
p = 'scripts/test-env.mjs'; s = open(p, encoding='utf-8').read()
s = s.replace("""export function loadTestDbUrl() {
  for (const f of ['.env.local', '.env']) {
    try {
      const raw = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8')
      const m = raw.match(/^DATABASE_URL="?([^"\\n]+)"?/m)
      if (m) return m[1].trim()
    } catch { /* فایل بعدی */ }
  }
  return process.env.DATABASE_URL ?? ''
}""", """export function loadTestDbUrl() {
  // اولویت: متغیر محیطی همان چیزی است که سرور/فرزند واقعاً استفاده می‌کند؛ فایل فقط fallback
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim()
  for (const f of ['.env.local', '.env']) {
    try {
      const raw = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8')
      const m = raw.match(/^DATABASE_URL="?([^"\\n]+)"?/m)
      if (m) return m[1].trim()
    } catch { /* فایل بعدی */ }
  }
  return ''
}""")
open(p, 'w', encoding='utf-8').write(s)
print('7) test-env: env-var first ✓')

# ————— ۸) local-pg: مسیر داده نسبی به ریشهٔ پروژه (قابل‌حمل)
p = 'scripts/local-pg.mjs'; s = open(p, encoding='utf-8').read()
s = s.replace("""import fs from 'node:fs'

const DATA_DIR = '/home/z/my-project/.pgdata'

// جلوگیری از اتصال اشتباه به دیتابیس واقعی — فقط مسیر محلی مجاز است
if (!DATA_DIR.startsWith('/home/z/my-project/')) {
  console.error('BLOCKED: data dir خارج از پروژه مجاز نیست')
  process.exit(1)
}""", """import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// مسیر داده نسبت به ریشهٔ پروژه — وابسته به کامپیوتر خاصی نیست
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(PROJECT_ROOT, '.pgdata')

// جلوگیری از اتصال اشتباه به دیتابیس واقعی — فقط مسیر داخل پروژه مجاز است
if (!DATA_DIR.startsWith(PROJECT_ROOT)) {
  console.error('BLOCKED: data dir خارج از پروژه مجاز نیست')
  process.exit(1)
}""")
open(p, 'w', encoding='utf-8').write(s)
print('8) local-pg: project-relative data dir ✓')

# ————— ۹) package.json: test:full (همه + backup + perf)
pj = json.load(open('package.json', encoding='utf-8'))
pj['scripts']['test:full'] = pj['scripts']['test:all'] + ' && node scripts/backup-restore-tests.mjs && node scripts/perf-tests.mjs'
json.dump(pj, open('package.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('9) package.json: test:full ✓')
