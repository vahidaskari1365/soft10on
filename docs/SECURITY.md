# امنیت — 10on
## کنترل‌های فعال
- RBAC سروری در همهٔ مسیرها؛ مخفی‌سازی UI کنترل نیست.
- Tenant/Branch Isolation سه‌لایه (handler → ALS → extension) + تزریق create با rejection.
- Session: توکن امضاشده (HMAC) + `tokenVersion`؛ ابطال با غیرفعال‌سازی/تغییر نقش؛ Cookie HttpOnly+Secure(prod)+SameSite=Lax؛ Expiry ۳۰ روز.
- Password: scrypt با salt؛ پیام یکسان برای کاربر نبود/رمز غلط (ضد User Enumeration).
- Rate Limit توزیع‌شده (SystemMeta)؛ fail-closed؛ لاگین ۶۰/min/IP و ۵/min/username (فقط ناموفق).
- Audit: LOGIN/FAILED/DENIED، مالی هم‌تراکنش (rethrow)، سند/حذف اسناد، تغییرات نقش؛ مسیر audit فقط ADMIN و فقط-خواندن.
- Idempotency پرداخت per-clinic + SHA-256 fingerprint → کلید تکراری با مبلغ متفاوت = 409.
- Headers: X-Frame-Options DENY، X-Content-Type-Options nosniff، Referrer-Policy، Permissions-Policy، HSTS (prod).
- آپلود: allowlist MIME، سقف ۱۰MB، ذخیره خصوصی در DB، دانلود فقط با مجوز (بیمار فقط سند خودش).
## پوشش تست
IDOR پزشکی/مالی/اسناد، cross-tenant create، clinicId جعلی، توکن دستکاری‌شده/ناقص، ابطال با غیرفعال‌سازی، هم‌زمانی idempotency، رزرو و فروش هم‌زمان، 429.

## آسیب‌پذیری‌های باقی‌مانده
- ۲۵ مورد وابستگی transitive (بیشتر sharp/libvips) — نیاز به upgrade breaking؛ در مسیر آپلود استفاده نمی‌شود.
