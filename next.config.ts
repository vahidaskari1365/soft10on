import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

// ------------------------------------------------------------------
// DATABASE_URL در محیط‌هایی که متغیر سراسری ناسازگار تزریق می‌کنند
// (مثل سندباکس با file: قدیمی) باید از .env پروژه غلبه کند.
// روی Vercel هیچ override ای انجام نمی‌شود؛ env واقعی ورسل معتبر است.
// ------------------------------------------------------------------
function localDatabaseUrl(): string | undefined {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
    return raw.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
  } catch {
    return undefined;
  }
}

const envOverrides =
  process.env.VERCEL === "1"
    ? {}
    : (() => {
        const u = localDatabaseUrl();
        return u ? { DATABASE_URL: u } : {};
      })();

const nextConfig: NextConfig = {
  output: "standalone",
  env: envOverrides,
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
