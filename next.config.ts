import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // گنجاندن دیتابیس بذر داخل باندل توابع سرورلس (برای استقرار روی Vercel)
  outputFileTracingIncludes: {
    "/api/**/*": ["./db/seed.db"],
  },
};

export default nextConfig;
