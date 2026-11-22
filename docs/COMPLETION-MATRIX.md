# ماتریس تکمیل — 10on
به‌روزرسانی پس از فاز hardening عمیق. وضعیت‌ها: PASS = اجرا و تأیید شده.

## لایهٔ داده و ایزولاسیون
| قابلیت | کد | API | DB | UI | تست | وضعیت |
|---|---|---|---|---|---|---|
| Clinic Isolation (خواندن/نوشتن) | db.ts extension | همهٔ ۶۴ route | NOT NULL clinicId ×۲۸ مدل، RESTRICT FK | شفاف | security+isolation ۲۹/۲۹ | PASS |
| Branch Isolation | tenant-als CLINIC_WIDE_ROLES + BRANCH_SCOPED | tenantHandler+assertBranch | branchId ستون ×۲۰ مدل | فیلتر شعبه | branch ۱۱/۱۱ | PASS |
| Unique-Where Mutators (update/delete/upsert) | db.ts pre-check→P2025 + mass-assign guard | همه | — | — | isolation ۱۹/۱۹ | PASS |
| findUnique→findFirst scoping | db.ts mapping | همه | — | — | isolation | PASS |
| Patient-owned scoping | PATIENT_OWNED set | portal/patients | patientId | پرتال | isolation F | PASS |
| Raw SQL/tx ownership | audit همهٔ $transaction؛ tx clinicId صریح | prescriptions/payroll اصلاح شد | — | — | workflows C | PASS |
| Per-tenant uniques (fileNo/code/supplier) | schema+migration 20261123000000 | patients/services/suppliers | unique مرکب | فرم‌ها | workflows A | PASS |

## ماژول‌های عملیاتی
| ماژول | تست | وضعیت |
|---|---|---|
| Auth/Session/RBAC (۸ نقش) | auth ۱۳/۱۳ + isolation | PASS |
| نوبت‌دهی (قفل پزشک + اتاق + تعطیل + ساعت کاری) | branch (۲۰ رزرو هم‌زمان اتاق/زمان) + workflows A | PASS |
| مالی (سند، تراز، idempotency، شماره اتمیک) | finance ۱۵/۱۵ + workflows C | PASS |
| انبار (خرید/فروش/هم‌زمانی) | workflows D | PASS |
| مدیریت کلینیک/شعبه/کاربر | workflows E | PASS |
| پرتال بیمار | workflows F | PASS |
| رزرو عمومی | workflows G | PASS |
| AI عامل‌ها | scoped ابزارها + rate-limit (واحد قبلی) | PASS |
| Health/Headers/Logging | curl + build smoke | PASS |
| Seed ایمن (دو کلینیک) | seed ۱۰/۱۰ | PASS |
| Backup/Restore واقعی | backup ۶/۶ | PASS |
| Performance حجمی | perf (اعداد واقعی) | PASS |

## تست‌های کم‌شده/باقی‌مانده
- Expiry زمانی توکن (۳۰ روز) — NOT RUN (زمان‌بر در CI؛ منطق امضا/ابطال پوشش داده شد)
- E2E UI عمیق هر تب (فقط ورود نقش‌ها در UI؛ فرآیندها در سطح API-E2E پوشش دارند) — NOT APPLICABLE به‌عنوان مانع؛ توصیهٔ آینده
- تست واقعی Provider AI خارجی — BLOCKED (کلید سرویس در sandbox نیست؛ مرز خطا تست شده)
