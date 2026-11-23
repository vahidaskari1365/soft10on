# آمادگی انتشار — 10on
## شروط فاز ۲۰
- تست الزامی FAIL: **صفر** (۱۴۱/۱۴۱)
- تست حیاتی NOT RUN: صفر (موارد ذیل NOT RUN غیرحیاتی/مستند)
- نقص بحرانی امنیتی در کد اپلیکیشن: **صفر** — اما آسیب‌پذیری‌های audit وابستگی‌ها **صفر نیستند**: پس از ارتقای امن (next 16.4.6، next-auth 4.24.15، overrides) **6 مورد prod باقی است (0 critical / 2 high / 4 moderate)** — مستند در KNOWN-LIMITATIONS و برنامهٔ ارتقا
- Tenant/Branch Isolation اثبات‌شده: **بله** (isolation ۱۹/۱۹ + branch ۱۱/۱۱ با تأیید DB)
- مالی و نوبت‌دهی: **بله** (finance ۱۵/۱۵ + concurrency)
- Workflowهای اصلی E2E: **بله** (۷/۷ کارگاه، ۳۵ چک)
- Migration واقعی: **بله** (روی DB خالی + روی DB دارای دادهٔ چندکلینیکی — seed-safety)
- Restore واقعی: **بله** (۴۴ جدول → دیتابیس دوم → مقایسهٔ کامل)
- Build/Typecheck/Lint: **بله**
- Mock جایگزین تست واقعی: **خیر**
- حذف/Skip تست برای سبزی Pipeline: **خیر** (+ deliberate-fail check اجرا شد)

## BLOCKED (نیازمند محیط بیرونی)
1. `prisma migrate resolve --applied 0_init` و `--applied 20261122000000_tenant_isolation` و `--applied 20261123000000_per_tenant_uniques` روی **دیتابیس production** — نیازمند دسترسی Supabase (پنل یا DATABASE_URL).
2. تست واقعی Provider AI (کلید سرویس).
3. Backup خودکار prod = Supabase managed backups (فعال‌سازی در پنل).

## بازبینی دوم (ادعاها و نتایج)
| ادعای بازبین | نتیجهٔ راستی‌آزمایی روی کد |
|---|---|
| effectiveBranchId محاسبه ولی ذخیره نمی‌شود | **تأیید** — اصلاح شد (branchId مؤثر در ctx) + تست رگرسیون (ADMIN با branchId ثبت‌شده = کلینیک‌گسترده) |
| Doctor در BRANCH_SCOPED نیست | **رد** — Doctor عضو BRANCH_SCOPED است؛ اثبات: booking با پزشک شعبهٔ دیگر → «پزشک یافت نشد» و فهرست عمومی هر شعبه فقط پزشکان خودش (test:branch) |
| Promise بدون await در db.ts | **تأیید** — pre-check تکراری fire-and-forget حذف شد؛ مسیر واحد awaited با P2025 |
| schema هنوز @unique سراسری دارد | **تأیید** — composite @@unique در schema اعمال و با migration تطبیق داده شد (+ اصلاح دو فراخوانی findUnique/upsert در services/suppliers) |
| test-env اولویت اشتباه | **تأیید** — env-first + حفاظت consistency (تغییر URL در میانهٔ اجرا = شکست بلندصدا)؛ باگ واقعی فایل کهن .env + dotenv داخلی prisma کشف شد |
| seed KB/AiCall تکراری | **تأیید** — KB با deleteBy-question و AiCall با marker `refKey=seed` idempotent شد (تست 12/12) |
| local-pg مسیر مطلق | **تأیید** — مسیر نسبی به ریشهٔ پروژه |
| CI فقط Vercel | **تأیید** — GitHub Actions tests.yml اضافه شد |
| UI فقط ورود | **تأیید** — پیمایش واقعی تب‌ها (۱۴/۳/۸/۸/۳) + ثبت بیمار از فرم با تأیید DB اضافه شد |
| توکن انقضا تست نشده | **انجام شد** — توکن ۳۱ روزه با امضای درست → 401 (test:security auth) |

## Verdict
**READY FOR PRODUCTION (کد اپلیکیشن)** — همهٔ ادعاهای تأییدشدهٔ بازبینی اصلاح و با تست رگرسیون اثبات شد؛ رگرسیون کامل 153/153 سبز است. دو محفظهٔ صادقانه باقی است: (۱) 6 آسیب‌پذیری prod وابستگی‌ها (0 critical) با برنامهٔ ارتقای breaking در PR جدا؛ (۲) سه مورد عملیاتی BLOCKED نیازمند دسترسی Supabase (migrate resolve ×۳، managed backup، تست Provider AI). این موارد مانع انتشار کد نیستند اما پیش از go-live عملیاتی باید بسته شوند.
