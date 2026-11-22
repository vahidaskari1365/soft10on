# استقرار — 10on
1. Vercel Project ← ریپو `soft10on`؛ Framework: Next.js؛ Build: `next build`؛ Runtime: Node.
2. Environment Variables (Vercel Settings): DATABASE_URL، AUTH_SECRET (هر دو برای Production+Preview).
3. Deploy → چک پس از انتشار:
   - `GET /api/health` → `{"status":"ok","db":"up"}` (بدون افشا)
   - ورود کاربر واقعی + ثبت نوبت/پرداخت نمونه
   - Headers: X-Frame-Options DENY، HSTS فعال
4. Rollback: Vercel Deployments → Promote به نسخهٔ قبلی (اتمیک).
5. Migration روی prod: فقط بعد از Backup و با `prisma migrate resolve` طبق docs/DATABASE.md.
6. Serverless: Prisma client singleton در globalThis؛ pooler (Session mode) برای پایداری اتصال.
