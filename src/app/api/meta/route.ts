import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const [doctors, services] = await Promise.all([
    db.doctor.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    db.service.findMany({ orderBy: { price: 'asc' } }),
  ])
  return NextResponse.json({ doctors, services })
}
