# معماری — 10on
- **Stack:** Next.js 16 App Router + React 19 + TypeScript + Prisma + PostgreSQL + Tailwind + Bun/Node؛ استقرار Vercel (standalone).
- **لایه‌های دفاعی Tenant:**
  1. `tenantHandler(roleList)` / `platformHandler()` — احراز هویت+RBAC سروری روی هر ۶۴ route.
  2. `tenant-als` (AsyncLocalStorage) — زمینهٔ درخواست: clinicId، branchId مؤثر (نقش‌های ADMIN/MANAGER/ACCOUNTANT کلینیک‌گسترده؛ بقیه ستاد شعبه‌محدود)، patientId برای بیمار.
  3. `db.ts` Proxy Extension — تزریق خودکار clinicId به همهٔ queryها؛ branchId برای مدل‌های BRANCH_SCOPED؛ تزریق در create با ممنوعیت mismatch (TENANT_MISMATCH/BRANCH_MISMATCH)؛ findUniqueهای حساس به findFirst با scope تبدیل شده‌اند.
  4. کنترل صریح در تراکنش‌های مالی (`assertBranch`، clinicId صریح).
- **مالی:** Double-entry؛ `postJournal` تراز بدهکار/بستانکار را تضمین می‌کند؛ شماره سند اتمیک per-clinic (UPDATE..RETURNING + unique مرکب)؛ پرداخت+سند+Audit در یک تراکنش؛ Idempotency per-clinic با fingerprint محتوا.
- **نوبت‌دهی:** قفل ردیف پزشک (`SELECT ... FOR UPDATE`) + بازبینی تداخل داخل تراکنش + Conditional update اتاق.
- **انبار:** کاهش/افزایش موجودی با conditional update داخل تراکنش → موجودی منفی ناممکن.
- **Rate Limit:** شمارندهٔ Fixed-Window در SystemMeta با UPDATE اتمیک مشترک بین instanceها؛ fail-closed؛ دو لایه لاگین (per-IP ۶۰/min، per-username ۵/min فقط تلاش ناموفق).
- **Health:** `/api/health` — فقط وضعیت، بدون Secret.
