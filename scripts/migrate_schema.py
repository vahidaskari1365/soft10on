#!/usr/bin/env python3
"""مهاجرت اسکیما فاز تکمیل — همه تغییرات الحاقی (ستون nullable و جدول جدید) + تبدیل پول به Int."""
import re

P = 'prisma/schema.prisma'
s = open(P).read()

def rep(old, new, n=1):
    global s
    assert s.count(old) >= n, f'anchor missing: {old[:60]!r}'
    s = s.replace(old, new, n)

# ————— تبدیل پول: Float → Int (Toman صحیح؛ validation سرور گرد می‌کند) —————
money_pairs = [
    ('  price        Float   // تومان', '  price        Int     // تومان (واحد صحیح — بدون اعشار)', 1),
    ('  price     Float\n  paid      Boolean  @default(false)\n  deposit   Float    @default(0)',
     '  price     Int\n  paid      Boolean  @default(false)\n  deposit   Int      @default(0)', 1),
    ('  subtotal  Float\n  discount  Float         @default(0)\n  total     Float',
     '  subtotal  Int\n  discount  Int           @default(0)\n  total     Int', 1),
    ('  qty       Int      @default(1)\n  unitPrice Float\n  total     Float',
     '  qty       Int      @default(1)\n  unitPrice Int\n  total     Int', 1),
    ('  amount        Float', '  amount        Int', 2),  # Payment.amount + Check.amount
    ('  openingBalance Float       @default(0)', '  openingBalance Int          @default(0)', 1),
    ('  purchasePrice Float\n  salePrice     Float', '  purchasePrice Int\n  salePrice     Int', 1),
    ('  qty       Int\n  unitPrice Float\n  total     Float',  # ProductSale
     '  qty       Int\n  unitPrice Int\n  total     Int', 1),
    ('  qty        Int\n  unitPrice  Float',  # PurchaseItem
     '  qty        Int\n  unitPrice  Int', 1),
    ('  total     Float', '  total     Int', 1),  # Purchase.total
    ('  amount      Float', '  amount      Int', 1),  # Expense.amount
    ('  baseSalary Float\n  overtime   Float     @default(0)\n  bonus      Float     @default(0)\n  deductions Float     @default(0)\n  commission Float     @default(0) // کارانه محاسبه‌شده از نوبت‌های DONE همان ماه\n  total      Float',
     '  baseSalary Int\n  overtime   Int       @default(0)\n  bonus      Int       @default(0)\n  deductions Int       @default(0)\n  commission Int       @default(0) // کارانه محاسبه‌شده از نوبت‌های DONE همان ماه\n  total      Int', 1),
]
for old, new, n in money_pairs:
    if old != new:
        rep(old, new, n)

# همه باقی‌مانده‌های پولی؟ بررسی نهایی: هیچ Float پولی نباید مانده باشد
leftover = re.findall(r'amount\s+Float|price\s+Float|total\s+Float|unitPrice\s+Float|Balance\s+Float|Salary\s+Float|commission\s+Float\s+@', s)
for lv in leftover:
    print('LEFTOVER:', lv)

# ————— گسترش Branch —————
rep('''  publicBookings PublicBooking[]
}''', '''  publicBookings PublicBooking[]
  // — فاز تکمیل —
  managerName String?
  province    String?
  postalCode  String?
  mobile      String?
  email       String?
  bankInfo    String?
  scheduleJson Json?   // برنامه کاری روزانه: [{dow, open, close, breakStart, breakEnd, closed, shifts}]
  clinicId    String?
  clinic      Clinic?  @relation(fields: [clinicId], references: [id])
  roomUnits   RoomUnit[]
  holidays    Holiday[]
  documents   Document[]
  journalEntries JournalEntry[]
}''')

# ————— گسترش User —————
rep('''  active      Boolean   @default(true)
  lastLoginAt DateTime?
  createdAt   DateTime  @default(now())
}''', '''  active      Boolean   @default(true)
  lastLoginAt DateTime?
  createdAt   DateTime  @default(now())
  // — فاز تکمیل —
  nationalId        String?
  jobTitle          String?
  hireDate          DateTime?
  contractType      String?   // FULL_TIME | PART_TIME | CONTRACT
  baseSalary        Int       @default(0)
  commissionPercent Float     @default(0)
  workHours         String?
  clinicId          String?
  clinic            Clinic?   @relation(fields: [clinicId], references: [id])
  documentsUploaded Document[]
  auditLogs         AuditLog[]
  journalEntries    JournalEntry[]
}''')

# ————— گسترش Service —————
rep('''  durationMin  Int     @default(30)
  appointments Appointment[]
  publicBookings PublicBooking[]
}''', '''  durationMin  Int     @default(30)
  appointments Appointment[]
  publicBookings PublicBooking[]
  // — فاز تکمیل —
  code             String?  @unique
  description      String?
  active           Boolean  @default(true)
  commissionPercent Float   @default(0)
  taxPercent       Float    @default(0)
  needsRoom        Boolean  @default(false)
}''')

# ————— گسترش Patient —————
rep('''  chronicNote        String?       // بیماری زمینه‌ای
  createdAt          DateTime      @default(now())''', '''  chronicNote        String?       // بیماری زمینه‌ای
  createdAt          DateTime      @default(now())
  // — فاز تکمیل: هویتی —
  gender             String?       // FEMALE | MALE
  birthDate          DateTime?     // تاریخ تولد کامل
  email              String?
  landline           String?
  province           String?
  city               String?
  address            String?
  postalCode         String?
  fileNo             String?       @unique // شماره پرونده اختصاصی
  status             String        @default("ACTIVE") // ACTIVE | ARCHIVED
  referralSource     String?       // منبع آشنایی با کلینیک
  // — فاز تکمیل: پزشکی —
  bloodType          String?
  medications        String?       // داروهای مصرفی
  surgeryHistory     String?
  hospitalizationHistory String?
  treatmentHistory   String?
  medWarnings        String?       // هشدارهای پزشکی
  treatingDoctorId   String?
  treatingDoctor     Doctor?       @relation("PatientTreatingDoctor", fields: [treatingDoctorId], references: [id])
  // — فاز تکمیل: بیمه —
  insuranceInsurer   String?       // بیمه پایه
  insurancePolicyNo  String?
  suppInsurer        String?       // بیمه تکمیلی
  suppPolicyNo       String?
  clinicId           String?
  clinic             Clinic?       @relation(fields: [clinicId], references: [id])
  documents          Document[]
  emergencyContacts  EmergencyContact[]
  prescriptions      Prescription[]
  treatmentPlans     TreatmentPlan[]
  timeline           TimelineEvent[]
}''')

# ————— گسترش Doctor (ارتباط بیماران تحت درمان) —————
rep('''  user           User?
  appointments   Appointment[]
  medicalRecords MedicalRecord[]
  waitlists      Waitlist[]
}''', '''  user           User?
  appointments   Appointment[]
  medicalRecords MedicalRecord[]
  waitlists      Waitlist[]
  treatedPatients Patient[]       @relation("PatientTreatingDoctor")
}''')

# ————— گسترش Appointment —————
rep('''  deposit   Int      @default(0)
  note      String?
  createdAt DateTime @default(now())
  tasks     Task[]

  @@index([start])
}''', '''  deposit   Int      @default(0)
  note      String?
  createdAt DateTime @default(now())
  tasks     Task[]
  // — فاز تکمیل —
  roomUnitId  String?
  roomUnit    RoomUnit?   @relation(fields: [roomUnitId], references: [id])
  reason      String?     // علت مراجعه
  cancelReason String?    // دلیل لغو یا عدم حضور
  reminderSent String?    // PENDING | SENT | FAILED | NONE
  histories   AppointmentHistory[]

  @@index([start])
}''')

# ————— گسترش Product —————
rep('''  supplier      String?
  purchaseItems PurchaseItem[]
  sales         ProductSale[]
}''', '''  supplier      String?
  purchaseItems PurchaseItem[]
  sales         ProductSale[]
  // — فاز تکمیل —
  code       String?
  barcode    String?
  expiryDate DateTime?
  batchNo    String?
  active     Boolean @default(true)
}''')

# ————— مدل‌های جدید —————
s = s.rstrip() + '''

// ---------- فاز تکمیل: پرونده، اسناد و درمان ----------

model EmergencyContact {
  id        String  @id @default(cuid())
  patientId String
  patient   Patient @relation(fields: [patientId], references: [id], onDelete: Cascade)
  name      String
  relation  String
  phone     String
  note      String?
  createdAt DateTime @default(now())
}

model Document {
  id           String   @id @default(cuid())
  branchId     String?
  branch       Branch?  @relation(fields: [branchId], references: [id])
  patientId    String
  patient      Patient  @relation(fields: [patientId], references: [id], onDelete: Cascade)
  clinicId     String?
  clinic       Clinic?  @relation(fields: [clinicId], references: [id])
  kind         String   @default("MEDICAL") // LAB | IMAGING | RX | INSURANCE | CONSENT | MEDICAL | AVATAR | PORTAL_UPLOAD
  title        String
  mimeType     String
  sizeBytes    Int
  data         Bytes
  uploadedById String?
  uploadedBy   User?    @relation(fields: [uploadedById], references: [id])
  note         String?
  createdAt    DateTime @default(now())

  @@index([patientId])
}

model Prescription {
  id        String            @id @default(cuid())
  patientId String
  patient   Patient           @relation(fields: [patientId], references: [id], onDelete: Cascade)
  doctorId  String?
  doctor    Doctor?           @relation(fields: [doctorId], references: [id])
  date      DateTime          @default(now())
  diagnosis String?
  note      String?
  items     PrescriptionItem[]
  createdById String?
  createdAt DateTime          @default(now())

  @@index([patientId])
}

model PrescriptionItem {
  id            String       @id @default(cuid())
  prescriptionId String
  prescription  Prescription @relation(fields: [prescriptionId], references: [id], onDelete: Cascade)
  drug          String
  form          String?      // شکل دارویی: قرص، کپسول، شربت، آمپول…
  dose          String?
  frequency     String?      // تعداد دفعات مصرف
  duration      String?      // مدت مصرف
  method        String?      // روش مصرف
  note          String?
}

model TreatmentPlan {
  id        String              @id @default(cuid())
  patientId String
  patient   Patient             @relation(fields: [patientId], references: [id], onDelete: Cascade)
  doctorId  String?
  doctor    Doctor?             @relation(fields: [doctorId], references: [id])
  title     String
  status    String              @default("ACTIVE") // ACTIVE | COMPLETED | CANCELLED
  note      String?
  steps     TreatmentPlanStep[]
  createdById String?
  createdAt DateTime            @default(now())

  @@index([patientId])
}

model TreatmentPlanStep {
  id        String        @id @default(cuid())
  planId    String
  plan      TreatmentPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  title     String
  serviceId String?
  service   Service?      @relation(fields: [serviceId], references: [id])
  cost      Int           @default(0)
  scheduledAt DateTime?
  status    String        @default("PENDING") // PENDING | DONE | CANCELLED
  doneAt    DateTime?
  nextSessionAt DateTime?
}

model AppointmentHistory {
  id             String      @id @default(cuid())
  appointmentId  String
  appointment    Appointment @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  action         String      // CREATE | RESCHEDULE | CANCEL | STATUS
  oldStart       DateTime?
  newStart       DateTime?
  oldStatus      String?
  newStatus      String?
  changedByName  String?
  note           String?
  createdAt      DateTime    @default(now())

  @@index([appointmentId])
}

model RoomUnit {
  id       String  @id @default(cuid())
  branchId String
  branch   Branch  @relation(fields: [branchId], references: [id], onDelete: Cascade)
  name     String
  type     String  @default("ROOM") // ROOM | UNIT
  capacity Int     @default(1)
  active   Boolean @default(true)
  note     String?
  appointments Appointment[]
  createdAt DateTime @default(now())
}

model Holiday {
  id       String   @id @default(cuid())
  branchId String?
  branch   Branch?  @relation(fields: [branchId], references: [id])
  date     DateTime
  title    String
  type     String   @default("OFFICIAL") // OFFICIAL | CLINIC
  createdAt DateTime @default(now())

  @@unique([branchId, date, title])
}

model AuditLog {
  id        String   @id @default(cuid())
  userId    String?
  user      User?    @relation(fields: [userId], references: [id])
  userName  String?
  action    String   // LOGIN | CREATE | UPDATE | DELETE | UPLOAD | DOWNLOAD | PAY | APPROVE | EXPORT | PASSWORD_RESET …
  entity    String   // Patient | Invoice | Payment | Document | User | Appointment …
  entityId  String?
  branchId  String?
  clinicId  String?
  result    String   @default("SUCCESS") // SUCCESS | DENIED | FAILED
  meta      Json?
  ip        String?
  createdAt DateTime @default(now())

  @@index([entity, entityId])
  @@index([createdAt])
}

model TimelineEvent {
  id        String   @id @default(cuid())
  patientId String
  patient   Patient  @relation(fields: [patientId], references: [id], onDelete: Cascade)
  type      String   // PATIENT_CREATED | APPOINTMENT | PAYMENT | INVOICE | DOCUMENT | MESSAGE | RX | TREATMENT | STATUS …
  title     String
  refId     String?
  actorName String?
  meta      Json?
  createdAt DateTime @default(now())

  @@index([patientId, createdAt])
}

// ---------- فاز تکمیل: چندمستاجری و اشتراک ----------

model Plan {
  id          String   @id @default(cuid())
  name        String   @unique
  price       Int      @default(0)       // تومان در دوره
  period      String   @default("MONTHLY") // MONTHLY | YEARLY
  maxUsers    Int      @default(5)
  maxBranches Int      @default(1)
  aiCallsLimit Int     @default(500)
  storageMb   Int      @default(512)
  features    Json?
  active      Boolean  @default(true)
  clinics     Clinic[]
  createdAt   DateTime @default(now())
}

model Clinic {
  id          String    @id @default(cuid())
  name        String    @unique
  legalName   String?
  nationalId  String?
  ownerName   String?
  contactPhone String?
  email       String?
  isActive    Boolean   @default(true)
  planId      String?
  plan        Plan?     @relation(fields: [planId], references: [id])
  planStartsAt DateTime?
  planEndsAt  DateTime?
  createdAt   DateTime  @default(now())
  branches    Branch[]
  patients    Patient[]
  users       User[]
  documents   Document[]
}

// ---------- فاز تکمیل: حسابداری دوبل ----------

model LedgerAccount {
  id         String  @id @default(cuid())
  code       String  @unique
  name       String
  type       String  // ASSET | LIABILITY | EQUITY | INCOME | EXPENSE
  parentCode String?
  isActive   Boolean @default(true)
  lines      JournalLine[]
  createdAt  DateTime @default(now())
}

model JournalEntry {
  id          String        @id @default(cuid())
  number      Int           @unique
  date        DateTime      @default(now())
  memo        String
  refType     String?       // INVOICE | PAYMENT | EXPENSE | PAYROLL | PURCHASE | MANUAL
  refId       String?
  branchId    String?
  branch      Branch?       @relation(fields: [branchId], references: [id])
  status      String        @default("POSTED") // DRAFT | POSTED
  createdById String?
  createdBy   User?         @relation(fields: [createdById], references: [id])
  lines       JournalLine[]
  createdAt   DateTime      @default(now())

  @@index([date])
}

model JournalLine {
  id        String        @id @default(cuid())
  entryId   String
  entry     JournalEntry  @relation(fields: [entryId], references: [id], onDelete: Cascade)
  accountId String
  account   LedgerAccount @relation(fields: [accountId], references: [id])
  debit     Int           @default(0)
  credit    Int           @default(0)
  detail    String?
}

// ---------- فاز تکمیل: پشتیبانی پلتفرم ----------

model SupportTicket {
  id            String   @id @default(cuid())
  subject       String
  category      String   @default("GENERAL")
  priority      String   @default("NORMAL") // LOW | NORMAL | HIGH | URGENT
  status        String   @default("OPEN") // OPEN | IN_PROGRESS | ANSWERED | CLOSED
  requesterName String?
  clinicName    String?
  assigneeName  String?
  body          String
  responses     Json?
  createdAt     DateTime @default(now())
}
'''
open(P, 'w').write(s)
print('schema patched OK')
