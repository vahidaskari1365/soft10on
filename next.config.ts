import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // بررسی کیفیت: خطاهای TypeScript نباید نادیده گرفته شوند
  reactStrictMode: false,
  // گنجاندن دیتابیس بذر داخل باندل توابع سرورلس (fallback توسعه)
  outputFileTracingIncludes: {
    "/api/**/*": ["./db/seed.db"],
  },
};

export default nextConfig;
