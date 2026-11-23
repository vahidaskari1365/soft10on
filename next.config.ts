import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // هدرهای امنیتی سراسری — clickjacking، MIME-sniffing، HSTS در production
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
  // بررسی کیفیت: خطاهای TypeScript نباید نادیده گرفته شوند
  reactStrictMode: false,
  // گنجاندن دیتابیس بذر داخل باندل توابع سرورلس (fallback توسعه)
  outputFileTracingIncludes: {
    // در همهٔ مسیرها (API و SSR) — بوت‌استرپ SQLite در هر نقطه‌ای که db لمس شود باید بذر را پیدا کند
    "*": ["./db/seed.db"],
  },
  // پوشه‌های دادهٔ runtime (embedded-postgres فعال در حال نوشتن) داخل trace باندل نمی‌روند —
  // کپی آن‌ها هنگام build با ENOENT شکست می‌خورد و shipping دادهٔ زنده هم غلط است
  outputFileTracingExcludes: {
    "*": [".pgdata/**", ".pgbackup/**"],
  },
};

export default nextConfig;
