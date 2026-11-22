-- ============================================================
-- Tenant Isolation — DB-level hardening (phase 5)
-- روی schema.prisma (baseline 0_init) اعمال می‌شود:
--  ۱) clinicId در DB واقعاً NOT NULL می‌شود (در schema برای سازگاری TS اختیاری می‌ماند)
--  ۲) FK های clinicId → Clinic با ON DELETE RESTRICT (حذف کلینیک، یتیم‌سازی مالی/پزشکی ممنوع)
--  ۳) guardهای idempotent — اجرای مجدد بی‌اثر است
-- (backfillهای یک‌بارهٔ prod پیش‌تر خارج از migration اجرا و مستند شده‌اند)
-- ============================================================

DO $$ BEGIN
  ALTER TABLE "Patient" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Patient" DROP CONSTRAINT IF EXISTS "fk_Patient_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_Patient_clinic') THEN
    ALTER TABLE "Patient" ADD CONSTRAINT "fk_Patient_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "Appointment" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "fk_Appointment_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_Appointment_clinic') THEN
    ALTER TABLE "Appointment" ADD CONSTRAINT "fk_Appointment_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "Task" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "fk_Task_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_Task_clinic') THEN
    ALTER TABLE "Task" ADD CONSTRAINT "fk_Task_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "Product" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "fk_Product_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_Product_clinic') THEN
    ALTER TABLE "Product" ADD CONSTRAINT "fk_Product_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "Purchase" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Purchase" DROP CONSTRAINT IF EXISTS "fk_Purchase_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_Purchase_clinic') THEN
    ALTER TABLE "Purchase" ADD CONSTRAINT "fk_Purchase_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "ProductSale" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ProductSale" DROP CONSTRAINT IF EXISTS "fk_ProductSale_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ProductSale_clinic') THEN
    ALTER TABLE "ProductSale" ADD CONSTRAINT "fk_ProductSale_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "Expense" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Expense" DROP CONSTRAINT IF EXISTS "fk_Expense_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_Expense_clinic') THEN
    ALTER TABLE "Expense" ADD CONSTRAINT "fk_Expense_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "CashAccount" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CashAccount" DROP CONSTRAINT IF EXISTS "fk_CashAccount_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_CashAccount_clinic') THEN
    ALTER TABLE "CashAccount" ADD CONSTRAINT "fk_CashAccount_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "Invoice" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "fk_Invoice_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_Invoice_clinic') THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "fk_Invoice_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "Payment" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "fk_Payment_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_Payment_clinic') THEN
    ALTER TABLE "Payment" ADD CONSTRAINT "fk_Payment_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "Check" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Check" DROP CONSTRAINT IF EXISTS "fk_Check_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_Check_clinic') THEN
    ALTER TABLE "Check" ADD CONSTRAINT "fk_Check_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "Payroll" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Payroll" DROP CONSTRAINT IF EXISTS "fk_Payroll_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_Payroll_clinic') THEN
    ALTER TABLE "Payroll" ADD CONSTRAINT "fk_Payroll_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "Message" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "fk_Message_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_Message_clinic') THEN
    ALTER TABLE "Message" ADD CONSTRAINT "fk_Message_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "Waitlist" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Waitlist" DROP CONSTRAINT IF EXISTS "fk_Waitlist_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_Waitlist_clinic') THEN
    ALTER TABLE "Waitlist" ADD CONSTRAINT "fk_Waitlist_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "PublicBooking" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PublicBooking" DROP CONSTRAINT IF EXISTS "fk_PublicBooking_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_PublicBooking_clinic') THEN
    ALTER TABLE "PublicBooking" ADD CONSTRAINT "fk_PublicBooking_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "RoomUnit" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RoomUnit" DROP CONSTRAINT IF EXISTS "fk_RoomUnit_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_RoomUnit_clinic') THEN
    ALTER TABLE "RoomUnit" ADD CONSTRAINT "fk_RoomUnit_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "Holiday" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Holiday" DROP CONSTRAINT IF EXISTS "fk_Holiday_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_Holiday_clinic') THEN
    ALTER TABLE "Holiday" ADD CONSTRAINT "fk_Holiday_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "MedicalRecord" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MedicalRecord" DROP CONSTRAINT IF EXISTS "fk_MedicalRecord_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_MedicalRecord_clinic') THEN
    ALTER TABLE "MedicalRecord" ADD CONSTRAINT "fk_MedicalRecord_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "JournalEntry" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "JournalEntry" DROP CONSTRAINT IF EXISTS "fk_JournalEntry_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_JournalEntry_clinic') THEN
    ALTER TABLE "JournalEntry" ADD CONSTRAINT "fk_JournalEntry_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "Prescription" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Prescription" DROP CONSTRAINT IF EXISTS "fk_Prescription_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_Prescription_clinic') THEN
    ALTER TABLE "Prescription" ADD CONSTRAINT "fk_Prescription_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "TreatmentPlan" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TreatmentPlan" DROP CONSTRAINT IF EXISTS "fk_TreatmentPlan_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_TreatmentPlan_clinic') THEN
    ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "fk_TreatmentPlan_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "EmergencyContact" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EmergencyContact" DROP CONSTRAINT IF EXISTS "fk_EmergencyContact_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_EmergencyContact_clinic') THEN
    ALTER TABLE "EmergencyContact" ADD CONSTRAINT "fk_EmergencyContact_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "TimelineEvent" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TimelineEvent" DROP CONSTRAINT IF EXISTS "fk_TimelineEvent_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_TimelineEvent_clinic') THEN
    ALTER TABLE "TimelineEvent" ADD CONSTRAINT "fk_TimelineEvent_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "AppointmentHistory" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AppointmentHistory" DROP CONSTRAINT IF EXISTS "fk_AppointmentHistory_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_AppointmentHistory_clinic') THEN
    ALTER TABLE "AppointmentHistory" ADD CONSTRAINT "fk_AppointmentHistory_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "Service" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Service" DROP CONSTRAINT IF EXISTS "fk_Service_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_Service_clinic') THEN
    ALTER TABLE "Service" ADD CONSTRAINT "fk_Service_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "Supplier" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Supplier" DROP CONSTRAINT IF EXISTS "fk_Supplier_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_Supplier_clinic') THEN
    ALTER TABLE "Supplier" ADD CONSTRAINT "fk_Supplier_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "Branch" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Branch" DROP CONSTRAINT IF EXISTS "fk_Branch_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_Branch_clinic') THEN
    ALTER TABLE "Branch" ADD CONSTRAINT "fk_Branch_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "Document" ALTER COLUMN "clinicId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "fk_Document_clinic";
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_Document_clinic') THEN
    ALTER TABLE "Document" ADD CONSTRAINT "fk_Document_clinic" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- legacy cleanup: unique global idempotencyKey حذف (جایگزین: مرکب per-clinic در baseline)
DO $$ BEGIN
  ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_idempotencyKey_key";
END $$;
DROP INDEX IF EXISTS "Payment_idempotencyKey_key";
