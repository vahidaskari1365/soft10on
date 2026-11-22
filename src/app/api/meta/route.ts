import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const [doctors, services] = await Promise.all([
    db.doctor.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    db.service.findMany({ where: { active: true }, orderBy: { price: 'asc' } }),
  ])
  // کارت‌های ورود دمو فقط در حالت دمو/توسعه نشان داده می‌شوند
  const demoMode = process.env.DEMO_MODE === '1' || process.env.NODE_ENV !== 'production'
  return NextResponse.json({ doctors, services, demoMode })
}
