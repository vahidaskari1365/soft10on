-- فاز ۵ مأموریت: marker مالکیت دادهٔ دمو برای idempotency کامل seed روی جدول global AiCall
ALTER TABLE "AiCall" ADD COLUMN IF NOT EXISTS "refKey" TEXT;
