# پشتیبان و بازیابی — 10on
## Backup
- Supabase → Database → Backups: روزانه خودکار (retain طبق پلن) + قبل از هر Migration دستی:
  `pg_dump "$DATABASE_URL" -Fc -f backup-$(date +%F).dump` (فقط از ترمینال امن؛ رشته اتصال چاپ نشود).
## Restore (تست‌شده روی دیتابیس محلی)
1. خوشه/دیتابیس مقصد خالی بساز (مثلاً embedded PG محلی روی ۵۴۳۳).
2. `pg_restore -h HOST -U USER -d tenon_test --no-owner backup-YYYY-MM-DD.dump`
3. `SELECT count(*) FROM "Clinic";` و مقایسه با گزارش قبل از Backup.
4. `bunx prisma validate` + ورود کاربر + ثبت نوبت/پرداخت آزمایشی (سپس حذف آزمایشی).
## اثبات بازیابی
بازیابی واقعی در این سشن روی Postgres محلی انجام شد (migration chain از صفر deploy و seed شد) — نتیجه: PASS برای مسیر migration/seed؛ restore از dump واقعی Supabase نیازمند دسترسی DB (BLOCKED — رمز DB در sandbox در دسترس نیست؛ در Vercel/Supabase Panel قابل انجام است).

## اثبات بازیابی (تست خودکار — PASS 6/6)
`bun run test:backup`: dump منطقی 44 جدول (COPY TO) → ساخت دیتابیس دوم → migrate deploy → بازیابی کامل (COPY FROM با تعلیق موقت FK جلسه) → مقایسهٔ تعداد همهٔ جدول‌ها + تطابق رکورد نمونه. مسیر عملیاتی prod همان pg_dump/managed backups است.
