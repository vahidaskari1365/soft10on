# تست‌ها — 10on (همه روی Postgres واقعی، بدون Mock)
| دستور | پوشش | آخرین نتیجه |
|---|---|---|
| `bun run test:unit` | validation، تقویم، هم‌پوشانی، فرمت، تراز سند | ۲۲/۲۲ |
| `bun run test:branch` | جداسازی شعبه/کلینیک، رزرو اتمیک هم‌زمان، فروش هم‌زمان | ۱۰/۱۰ |
| `bun run test:integration` | security + finance | ۱۰/۱۰ + ۱۵/۱۵ |
| `bun run test:security` | IDOR/cross-tenant/session/idempotency/ratelimit | ۱۰/۱۰ + ۱۳/۱۳ |
| `bun run test:e2e` | Playwright — ورود ۵ نقش از UI واقعی | ۵/۵ |
| `bun run test:all` | همهٔ موارد بالا | ۷۵/۷۵ |
## محیط تست مستقل
- Postgres واقعی embedded (پورت ۵۴۳۳): `bun run db:test:up` → `bun run db:migrate` → `bun run db:seed`
- سرور: `bun run dev` سپس `bun run test:all`
- هیچ تستی با Mock دیتابیس/تراکنش نوشته نشده؛ Mock فقط در unitهای خالص وجود ندارد (همه منطق واقعی).
## Quality Gates
`tsc --noEmit` (۰ خطا) · `eslint` · `next build` (سبز) · `prisma validate/generate/migrate deploy` (سبز) · smoke بیلد (health + صفحه ورود).
