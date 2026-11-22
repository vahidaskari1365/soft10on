# ماتریس تکمیل پروژه — 10on Smart Clinic OS
به‌روزرسانی: فاز hardening کامل (Branch Isolation + ثبت اتمیک نوبت). منبع حقیقت: کد واقعی + تست‌های اجراشده.

## مدل‌های داده (Prisma)
| مدل | مالکیت | Scope خودکار Query | NOT NULL clinicId در DB |
|---|---|---|---|
| Clinic, Plan, PlanFeature | Global | — (پلتفرمی) | نا‌مربوط |
| LedgerAccount, KnowledgeBase, SystemMeta | Global/Platform | — | نا‌مربوط |
| AuditLog (رویداد پلتفرمی) | Global با clinicId اختیاری | clinicId وقتی ctx باشد | خیر (موجود) |
| User | Tenant + Branch-خانه | clinicId؛ create → تزریق | بله |
| Doctor | Tenant (via Branch) | branch.clinicId + branchId | — (بدون ستون) |
| Branch, Patient, Service, Supplier, TimelineEvent, Prescription, TreatmentPlan, EmergencyContact, AppointmentHistory | Tenant | clinicId | بله |
| Appointment, Task, Product, Purchase, ProductSale, Expense, CashAccount, Invoice, Payment, Check, Payroll, Message, Waitlist, PublicBooking, RoomUnit, Holiday, MedicalRecord, JournalEntry, Document, AuditLog | Tenant + Branch | clinicId + branchId برای نقش‌های ستاد | بله |

## ماژول‌ها و وضعیت
| ماژول | Backend | API Scope | تست | وضعیت |
|---|---|---|---|---|
| Auth (login/logout/me, tokenVersion, revoke) | ✔ | ✔ | unit+security+auth ۱۳/۱۳ | کامل |
| Clinic/SaaS/Platform Admin | ✔ | platformHandler | security | کامل |
| Branch management + شعبه‌محوری | ✔ | tenantHandler + assertBranch | branch ۱۰/۱۰ | کامل |
| Patients + Documents + Timeline | ✔ | scoped findFirst | security/auth | کامل |
| Appointments + اتاق + تعطیلی + انتظار | ✔ | + قفل ردیف پزشک (اتمیک) | branch (رزرو هم‌زمان ۱+۱) | کامل |
| Medical Records/Prescription/Treatment | ✔ | scoped | agent scoped | کامل |
| Accounting (Journal/Trial/Counter) | ✔ | هم‌تراکنش، شماره اتمیک | finance ۱۵/۱۵ | کامل |
| Payments + Idempotency per-clinic | ✔ | fingerprint+409 | auth ۱۳/۱۳ | کامل |
| Inventory (خرید/فروش/انقضا) | ✔ | conditional decrement | finance+branch | کامل |
| AI Agents (doctor/manager/reception/assistant) | ✔ | ابزارها scoped | rate-limit 429 | کامل |
| Portal بیمار | ✔ | patientId-scope | E2E بیمار | کامل |
| Notifications/Tasks/Messages/Reports/Settings | ✔ | scoped | E2E نقش‌ها | کامل |
| Public Booking (/clinic/[code]) | ✔ | branch-scoped متا | E2E عمومی | کامل |
| Health | /api/health | بدون Secret | curl ok/degraded | کامل |

## فناوری‌های محدودکننده/KNOWN LIMITS → docs/KNOWN-LIMITATIONS.md

## تست‌ها (دیتابیس واقعی Postgres، بدون Mock)
unit ۲۲/۲۲ · branch ۱۰/۱۰ · security ۱۰/۱۰ · finance ۱۵/۱۵ · auth ۱۳/۱۳ · E2E ۵/۵ — جمع ۷۵/۷۵ PASS
