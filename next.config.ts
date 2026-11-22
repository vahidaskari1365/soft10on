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
    "/api/**/*": ["./db/seed.db"],
  },
};

export default nextConfig;
