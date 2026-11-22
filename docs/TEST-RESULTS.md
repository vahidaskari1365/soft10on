# نتایج تست — 10on (اجرای واقعی، دیتابیس Postgres مستقل، بدون Mock)
محیط: PostgreSQL واقعی embedded (:5433/tenon_test) — گارد محیطی در همهٔ سویت‌ها مانع اتصال به prod می‌شود.
آخرین اجرای کامل Regression (همه روی یک نسخه از کد):

| Suite | دستور | Total | PASS | FAIL |
|---|---|---:|---:|---:|
| Unit (validation، تقویم، هم‌پوشانی، تراز سند) | test:unit | 23 | 23 | 0 |
| Branch Isolation + Concurrency (رزرو/اتاق/فروش هم‌زمان) | test:branch | 11 | 11 | 0 |
| Deep Isolation (IDOR خواندن/Update/Delete/Upsert، branchId جعلی، شعبه، بیمار) | test:isolation | 19 | 19 | 0 |
| Multi-Tenant Security | test:security | 10 | 10 | 0 |
| Financial/Concurrency/Audit | test:finance | 15 | 15 | 0 |
| Auth/Session/Idempotency/RateLimit | test:security (auth) | 13 | 13 | 0 |
| Seed Safety (دو کلینیک، idempotent، prod-block) | test:seed | 10 | 10 | 0 |
| E2E Workflows A–G (با تأیید DB) | test:e2e:workflows | 35 | 35 | 0 |
| E2E UI (Playwright — ورود ۵ نقش) | test:e2e | 5 | 5 | 0 |
| **جمع** | test:all | **141** | **141** | **0** |

## دیگر Gateها
| Gate | نتیجه |
|---|---|
| `tsc --noEmit` | PASS (۰ خطا) |
| `next build` (production) | PASS (rc=0) |
| `prisma validate / generate / migrate deploy` روی DB خالی | PASS (۳ migration) |
| Backup/Restore واقعی (dump 44 جدول → DB دوم → migrate → restore → مقایسه) | **6/6 PASS** (`test:backup`) |
| Performance (۱۰۰۰ بیمار، ۵۰۰۰ نوبت، ۱۰۰۰ فاکتور، ۲۰۰۰ پرداخت) | patients median 96ms · appointments 17ms · dashboard 59ms · finance 56ms · invoices 10ms · reports 40ms (`test:perf`) |
| Deliberate-fail check (runner باید شکست را ببیند) | PASS — exit=1 تشخیص داده شد |
| npm audit (prod) | 25 مورد (2 critical/15 high — زنجیرهٔ transitive sharp/libvips؛ در مسیر آپلود استفاده نمی‌شود؛ upgrade نیازمند breaking change — docs/KNOWN-LIMITATIONS.md) |

## E2E Workflows (فاز ۱۲) — همه با تأیید در دیتابیس
- **A پذیرش بیمار:** ثبت بیمار → DB(clinicId درست) → رزرو نوبت → DB(شعبه/پزشک/قیمت) → دیده‌شدن در تقویم ✔
- **B ویزیت پزشک:** ARRIVED → ثبت شرح/تشخیص → صدور نسخه → DB(doctorId) → پذیرش اجازهٔ نسخه ندارد ✔
- **C مالی:** فاکتور(201، مبلغ درست) → پرداخت idempotent → تکرار=duplicate → سند حسابداری مرتبط → Audit ✔
- **D انبار:** کالا → خرید(+10) → فروش(−4) → ۶ فروش هم‌زمان → موجودی دقیق ۰ ✔
- **E مدیریت:** شعبه → کاربر با نقش/شعبه → DB(مالکیت) → پذیرش نمی‌تواند کلینیک بسازد ✔
- **F بیمار:** پرتال → پروندهٔ بیمار دیگر مسدود ✔
- **G عمومی:** شعبه با کد → متای شعبه → رزرو عمومی → DB(PublicBooking) → بدون سشن 401 ✔
