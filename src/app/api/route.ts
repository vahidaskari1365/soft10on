import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  let database = 'error'
  try {
    await db.$queryRaw`SELECT 1`
    database = 'ok'
  } catch {
    database = 'error'
  }
  return NextResponse.json({
    app: '10on',
    message: 'سلام از 10on! 🦷',
    database,
    time: new Date().toISOString(),
  })
}
