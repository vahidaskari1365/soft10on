# متغیرهای محیطی — 10on
| نام | اجباری؟ | محیط | کاربرد | اثر نبودن |
|---|---|---|---|---|
| DATABASE_URL | بله | همه | اتصال Postgres (Supabase pooler یا سازگار) | production fail-closed متوقف می‌شود؛ dev به SQLite نمی‌رود (provider postgres است) |
| AUTH_SECRET | بله در prod | همه | امضای Session Cookie (≥۳۲ کاراکتر) | prod متوقف می‌شود؛ dev fallback توسعه |
| NODE_ENV | خودکار | همه | رفتار dev/prod | — |
| VERCEL | خودکار | prod | تشخیص سرورلس | — |
| DEMO_MODE | اختیاری | prod | نمایش کارت‌های ورود دمو | پیش‌فرض خاموش در prod |
| SEED_ALLOW_PRODUCTION | اختیاری | prod | اجازهٔ صریح seed روی prod | seed بلاک می‌ماند |
| OPENAI_BASE_URL / کلید سرویس AI | اختیاری | همه | موتور AI عامل‌ها | عامل‌ها پیام «سرویس در دسترس نیست» می‌دهند؛ بقیهٔ اپ سالم |
| SEED_CLINIC/سایر | — | — | استفاده نمی‌شود | — |
- هیچ Secret واقعی در Git ثبت نمی‌شود؛ `.env.local` فقط محلی است.
- Production: همهٔ مقادیر از تنظیمات Vercel Project تزریق می‌شود.
