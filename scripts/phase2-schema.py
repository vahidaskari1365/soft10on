#!/usr/bin/env python3
"""افزودن clinicId به مدل‌های Tenant-scoped در schema.prisma — فاز ۲ مأموریت.
- ستون clinicId + رابطه به Clinic + ایندکس در مدل‌های هدف
- بک‌رلیشن در مدل Clinic
- unique مرکب Invoice(clinicId,number) و JournalEntry(clinicId,number) به‌جای global
ایده‌آل: idempotent — اجرای دوباره تغییری نمی‌دهد."""
import re, sys

SCHEMA = 'prisma/schema.prisma'
src = open(SCHEMA, encoding='utf-8').read()

# مدل‌هایی که ستون clinicId می‌گیرند (کلید مدل → مبنای backfill در migration)
BRANCH_MODELS = [  # backfill از branch.clinicId
    'Appointment', 'Task', 'Product', 'Purchase', 'ProductSale', 'Expense',
    'CashAccount', 'Invoice', 'Payment', 'Check', 'Payroll', 'Message',
    'Waitlist', 'PublicBooking', 'RoomUnit', 'Holiday', 'MedicalRecord',
    'JournalEntry',
]
PATIENT_MODELS = [  # backfill از patient.clinicId
    'Prescription', 'TreatmentPlan', 'EmergencyContact', 'TimelineEvent',
    'AppointmentHistory',
]
SOLE_MODELS = ['Service', 'Supplier', 'LedgerAccount']  # backfill: تک‌کلینیک

ALL = BRANCH_MODELS + PATIENT_MODELS + SOLE_MODELS

# ۱) استخراج بلاک مدل‌ها
def model_block(name):
    m = re.search(rf'(?ms)^model {name} \{{.*?^\}}\s*$', src)
    if not m:
        sys.exit(f'model {name} not found')
    return m

clinic_block = model_block('Clinic')
clinic_start, clinic_end = clinic_block.span()
clinic_text = clinic_block.group(0)

# ۲) افزودن فیلد به مدل‌های هدف
for name in ALL:
    m = model_block(name)
    blk = m.group(0)
    if 'clinicId' in blk:
        continue  # idempotent
    if name in BRANCH_MODELS:
        rel = ('  clinicId    String?\n'
               '  clinic      Clinic? @relation(fields: [clinicId], references: [id])\n')
    else:
        rel = ('  clinicId    String?\n'
               '  clinic      Clinic? @relation(fields: [clinicId], references: [id])\n')
    # فیلد درست بعد از خط id
    blk2 = re.sub(r'(?m)^(  id\s+String\s+@id.*\n)', r'\1' + rel, blk, count=1)
    # ایندکس — همیشه بلوک مستقل، اگر نبود
    if '@@index([clinicId])' not in blk2:
        blk2 = blk2.replace('\n}', '\n\n  @@index([clinicId])\n}')
    # unique مرکب برای Invoice و JournalEntry
    if name in ('Invoice', 'JournalEntry'):
        blk2 = re.sub(r'(?m)^\s*number\s+Int\s+@unique\s*$', lambda mm: re.sub(r'\s*@unique\s*$', '', mm.group(0)), blk2, count=1)
        if '@@unique([clinicId, number])' not in blk2:
            blk2 = blk2.replace('\n}', '\n  @@unique([clinicId, number])\n}')
    src = src[:m.start()] + blk2 + src[m.end():]
    # مختصات Clinic بعد از تغییر src جابه‌جا می‌شود — دوباره پیدا کن
    clinic_block = model_block('Clinic')
    clinic_start, clinic_end = clinic_block.span()
    clinic_text = clinic_block.group(0)

# ۳) بک‌رلیشن‌ها در Clinic
new_rels = []
for name in ALL:
    rname = name[0].lower() + name[1:] + 's'
    if f'{rname} ' in clinic_text or f'{rname}\n' in clinic_text:
        continue
    opt = '?' if name in BRANCH_MODELS else '[]'
    # برای مدل‌های دارای clinicId غیر optional در آینده، رابطه لیستی است
    new_rels.append(f'  {rname}     {name}[]\n')
if new_rels:
    src = src[:clinic_start] + clinic_text.replace('\n}', '\n' + ''.join(new_rels) + '}') + src[clinic_end:]

open(SCHEMA, 'w', encoding='utf-8').write(src)
print('schema updated:', ', '.join(ALL))
