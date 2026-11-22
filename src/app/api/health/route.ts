import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Health Check — بدون افشای Secret یا جزئیات اتصال.
 * فقط «سرویس زنده است» + «دیتابیس پاسخ می‌دهد» را می‌گوید.
 */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok', db: 'up', time: new Date().toISOString() })
  } catch {
    // جزئیات خطا (رشتهٔ اتصال، نام host و…) افشا نمی‌شود
    return NextResponse.json({ status: 'degraded', db: 'down' }, { status: 503 })
  }
}
