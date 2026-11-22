#!/usr/bin/env python3
"""تولید SQL مهاجرت فاز ۲ — Tenant Isolation (idempotent).
حالت‌ها: --test  → BEGIN ... ROLLBACK (اعتبارسنجی بدون تغییر)
         --apply → اجرای واقعی"""
import subprocess, sys

BRANCH_MODELS = ['Appointment','Task','Product','Purchase','ProductSale','Expense',
 'CashAccount','Invoice','Payment','Check','Payroll','Message','Waitlist',
 'PublicBooking','RoomUnit','Holiday','MedicalRecord','JournalEntry']
PATIENT_MODELS = ['Prescription','TreatmentPlan','EmergencyContact','TimelineEvent']
APPT_MODELS = ['AppointmentHistory']
SOLE_MODELS = ['Service','Supplier','LedgerAccount']
ALL = BRANCH_MODELS + PATIENT_MODELS + APPT_MODELS + SOLE_MODELS

lines = ['-- tenant isolation: clinicId + FK + index + composite uniques + tokenVersion + idempotency']
for m in ALL:
    lines.append(f'ALTER TABLE "{m}" ADD COLUMN IF NOT EXISTS "clinicId" TEXT;')
for m in BRANCH_MODELS:
    lines.append(f'UPDATE "{m}" t SET "clinicId" = b."clinicId" FROM "Branch" b WHERE t."branchId" = b."id" AND t."clinicId" IS NULL;')
for m in PATIENT_MODELS:
    lines.append(f'UPDATE "{m}" t SET "clinicId" = p."clinicId" FROM "Patient" p WHERE t."patientId" = p."id" AND t."clinicId" IS NULL;')
for m in APPT_MODELS:  # بعد از backfill Appointment (clinicId از branch) و همچنین از مسیر بیمار
    lines.append(f'UPDATE "{m}" t SET "clinicId" = p."clinicId" FROM "Appointment" a JOIN "Patient" p ON p."id" = a."patientId" WHERE t."appointmentId" = a."id" AND t."clinicId" IS NULL;')
for m in SOLE_MODELS:
    lines.append(f'UPDATE "{m}" SET "clinicId" = (SELECT "id" FROM "Clinic" LIMIT 1) WHERE "clinicId" IS NULL AND (SELECT COUNT(*) FROM "Clinic") = 1;')

for m in ALL:
    tbl = f'"{m}"'
    con = f'fk_{m}_clinic'
    lines.append(f'ALTER TABLE {tbl} DROP CONSTRAINT IF EXISTS "{con}";')
    lines.append(f'ALTER TABLE {tbl} ADD CONSTRAINT "{con}" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;')
    lines.append(f'CREATE INDEX IF NOT EXISTS "idx_{m}_clinic" ON {tbl}("clinicId");')

# شماره per-tenant: حذف unique global، افزودن مرکب
for tbl, con in (('Invoice','Invoice_number_key'), ('JournalEntry','JournalEntry_number_key')):
    lines.append(f'ALTER TABLE "{tbl}" DROP CONSTRAINT IF EXISTS "{con}";')
    lines.append(f'ALTER TABLE "{tbl}" DROP CONSTRAINT IF EXISTS "{tbl}_clinicId_number_key";')
    lines.append(f'ALTER TABLE "{tbl}" ADD CONSTRAINT "{tbl}_clinicId_number_key" UNIQUE ("clinicId", "number");')

# نشست‌های قابل ابطال + Idempotency پرداخت
lines.append('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 1;')
lines.append('ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;')
lines.append('CREATE UNIQUE INDEX IF NOT EXISTS "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;')

# گزارش کنترلی داخل تراکنش آزمایشی
checks = ['SELECT \'unscoped\' AS k, COUNT(*) FROM "Appointment" WHERE "clinicId" IS NULL;',
          'SELECT \'unscoped\' AS k, COUNT(*) FROM "Invoice" WHERE "clinicId" IS NULL;',
          'SELECT \'unscoped\' AS k, COUNT(*) FROM "Payment" WHERE "clinicId" IS NULL;']

sql = '\n'.join(lines) + '\n'
mode = sys.argv[1] if len(sys.argv) > 1 else '--test'

import json, os, urllib.request
API = 'https://api.supabase.com/v1/projects/yufrqgfegdrakceimkve/database/query'
TOK = os.environ.get('SUPABASE_MGMT_TOKEN', 'REDACTED — از متغیر محیطی SUPABASE_MGMT_TOKEN بخوانید')
REF = 'yufrqgfegdrakceimkve'

def run_sql(query):
    req = urllib.request.Request(API, data=json.dumps({'query': query}).encode(),
        headers={'Authorization': f'Bearer {TOK}', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'HTTP {e.code}: {e.read().decode()[:400]}') from None

if mode == '--test':
    body = 'BEGIN;\n' + sql + '\n'.join(checks) + '\nROLLBACK;\nSELECT 1 AS survived;'
    out = run_sql(body)
    print('TEST MODE (rollback) →', json.dumps(out)[:300])
elif mode == '--api':
    # اعمال واقعی — دسته‌های کوچک برای پرهیز از timeout
    stmts = [s.strip() for s in sql.split(';') if s.strip()]
    errs = 0
    for i, s in enumerate(stmts):
        try:
            run_sql(s)
        except Exception as e:
            errs += 1
            print(f'FAIL #{i}: {str(e)[:120]}\n  → {s[:100]}')
    print(f'applied {len(stmts) - errs}/{len(stmts)} statements, errors={errs}')
    # گزارش کنترلی
    for c in checks:
        print('check:', json.dumps(run_sql(c))[:120])
else:
    open('prisma/migration_tenant.sql','w',encoding='utf-8').write(sql)
    print('SQL written → prisma/migration_tenant.sql (%d statements)' % sql.count(';'))
