import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // گنجاندن دیتابیس بذر و اتصال production داخل باندل توابع سرورلس (Vercel)
  outputFileTracingIncludes: {
    "/api/**/*": ["./db/seed.db", "./db/production.json"],
  },
};

export default nextConfig;
