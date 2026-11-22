# دیتابیس — 10on
- PostgreSQL (Supabase در production؛ برای تست، Postgres واقعی embedded روی پورت ۵۴۳۳).
- Provider: postgresql؛ Client singleton در `db.ts` با fail-closed (بدون DATABASE_URL امن، production بالا نمی‌آید).
- **Migrations:** `prisma/migrations/0_init` (baseline کامل از schema.prisma) + `20261122000000_tenant_isolation` (NOT NULL clinicId در DB، FK→Clinic با ON DELETE RESTRICT، حذف unique جهانی idempotencyKey). هر دو idempotent و روی دیتابیس خالی تأییدشده (`prisma migrate deploy` سبز).
- **سازگاری prod:** روی دیتابیس production (که تغییرات را پیش‌تر گرفته) یک‌بار اجرا شود:
  `prisma migrate resolve --applied 0_init` و `prisma migrate resolve --applied 20261122000000_tenant_isolation`
- ستون‌های clinicId در schema اختیاری‌اند (سازگاری TS/پلتفرم) اما در DB برای ۲۸ مدل tenant-owned NOT NULL هستند؛ تزریق خودکار مانع null است و DB آخرین دفاع.
- ممنوعیت‌ها: `db push --accept-data-loss`، `migrate reset` روی prod، حذف جدول، backfill تصادفی.
- Backup: pg_dump روزانه Supabase؛ تست Restore در docs/BACKUP-RESTORE.md.
