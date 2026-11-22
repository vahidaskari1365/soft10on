-- فاز ۴ مأموریت: یکتایی شماره پرونده/کد خدمت/تأمین‌کننده در سطح کلینیک (نه جهانی)
-- شماره‌گذاری per-clinic است؛ unique جهانی باعث تصادم بین کلینیک‌ها و 500 در ثبت بیمار می‌شد
ALTER TABLE "Patient" DROP CONSTRAINT IF EXISTS "Patient_fileNo_key";
DROP INDEX IF EXISTS "Patient_fileNo_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Patient_clinicId_fileNo_key" ON "Patient"("clinicId", "fileNo");
ALTER TABLE "Service" DROP CONSTRAINT IF EXISTS "Service_code_key";
DROP INDEX IF EXISTS "Service_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Service_clinicId_code_key" ON "Service"("clinicId", "code");
ALTER TABLE "Supplier" DROP CONSTRAINT IF EXISTS "Supplier_name_key";
DROP INDEX IF EXISTS "Supplier_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_clinicId_name_key" ON "Supplier"("clinicId", "name");
