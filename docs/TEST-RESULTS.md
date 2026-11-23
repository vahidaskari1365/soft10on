# نتایج تست — 10on (اجرای واقعی، دیتابیس Postgres مستقل، بدون Mock)
محیط: PostgreSQL واقعی embedded (:5433/tenon_test) — گارد محیطی در همهٔ سویت‌ها مانع اتصال به prod می‌شود.
آخرین اجرای کامل Regression (همه روی یک نسخه از کد):

| Suite | دستور | Total | PASS | FAIL |
|---|---|---:|---:|---:|
| Unit (validation، تقویم، هم‌پوشانی، تراز سند) | test:unit | 23 | 23 | 0 |
| Branch Isolation + Concurrency (۲۰ رزرو هم‌زمان اتاق/زمان + دو بازبینی جدید) | test:branch | 14 | 14 | 0 |
| Deep Isolation (IDOR خواندن/Update/Delete/Upsert، branchId جعلی، شعبه، بیمار) | test:isolation | 19 | 19 | 0 |
| Multi-Tenant Security | test:security | 10 | 10 | 0 |
| Financial/Concurrency/Audit | test:finance | 15 | 15 | 0 |
| Auth/Session/Idempotency/RateLimit + انقضای واقعی توکن (۳۱ روز با امضای درست) | test:security (auth) | 14 | 14 | 0 |
| Seed Safety (دو کلینیک، idempotent شامل KB/AiCall، prod-block) | test:seed | 12 | 12 | 0 |
| E2E Workflows A–G (با تأیید DB) | test:e2e:workflows | 35 | 35 | 0 |
| E2E UI — ورود ۵ نقش (Playwright) | test:e2e | 5 | 5 | 0 |
| E2E UI عمیق — پیمایش واقعی تب‌های هر نقش در SPA + ثبت بیمار از فرم با تأیید DB + RTL | test:e2e:ui | 11 | 11 | 0 |
| **جمع** | test:all | **153** | **153** | **0** |

## دیگر Gateها
| Gate | نتیجه |
|---|---|
| `tsc --noEmit` | PASS (۰ خطا) |
| `next build` (production) | PASS (rc=0) |
| `prisma validate / generate / migrate deploy` روی DB خالی | PASS (۳ migration) |
| Backup/Restore واقعی (dump 44 جدول → DB دوم → migrate → restore → مقایسه) | **6/6 PASS** (`test:backup`) |
| Performance (۱۰۰۰ بیمار، ۵۰۰۰ نوبت، ۱۰۰۰ فاکتور، ۲۰۰۰ پرداخت) | patients median 96ms · appointments 17ms · dashboard 59ms · finance 56ms · invoices 10ms · reports 40ms (`test:perf`) |
| Deliberate-fail check (runner باید شکست را ببیند) | PASS — exit=1 تشخیص داده شد |
| گارد محیط (env-first + تشخیص تغییر URL در میانهٔ اجرا توسط dotenv وابستگی‌ها) | PASS — باگ واقعی فایل کهن .env کشف و اصلاح شد |
| npm audit (prod، پس از ارتقای امن next→16.4.6 و next-auth→4.24.15 + overrides) | **6 مورد باقی‌مانده: 0 critical، 2 high، 4 moderate** — قبلاً 2 critical/15 high بود؛ باقی‌مانده‌ها زنجیره‌های parse/ReDoS (effect، js-yaml و…) خارج از مسیر درخواست‌های حساس؛ upgradeهای باقی‌مانده نیازمند breaking (mdxeditor 4.5.0 و…) — docs/KNOWN-LIMITATIONS.md |
| نکتهٔ پوشش | `test:all` gate سریع است؛ Backup/Restore و Performance در `test:full` و در CI جدا اجرا می‌شوند (`.github/workflows/tests.yml` — هر دو در CI step مجزا) |
| CI | workflow اضافه شد: typecheck+lint+build+migrate+test:all+test:backup+test:performance روی postgres service — اثبات اجرای تست‌ها مستقل از Vercel |

## E2E Workflows (فاز ۱۲) — همه با تأیید در دیتابیس
- **A پذیرش بیمار:** ثبت بیمار → DB(clinicId درست) → رزرو نوبت → DB(شعبه/پزشک/قیمت) → دیده‌شدن در تقویم ✔
- **B ویزیت پزشک:** ARRIVED → ثبت شرح/تشخیص → صدور نسخه → DB(doctorId) → پذیرش اجازهٔ نسخه ندارد ✔
- **C مالی:** فاکتور(201، مبلغ درست) → پرداخت idempotent → تکرار=duplicate → سند حسابداری مرتبط → Audit ✔
- **D انبار:** کالا → خرید(+10) → فروش(−4) → ۶ فروش هم‌زمان → موجودی دقیق ۰ ✔
- **E مدیریت:** شعبه → کاربر با نقش/شعبه → DB(مالکیت) → پذیرش نمی‌تواند کلینیک بسازد ✔
- **F بیمار:** پرتال → پروندهٔ بیمار دیگر مسدود ✔
- **G عمومی:** شعبه با کد → متای شعبه → رزرو عمومی → DB(PublicBooking) → بدون سشن 401 ✔
