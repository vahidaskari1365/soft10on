import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/** درخواست رزرو از صفحه عمومی — بدون احراز هویت */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    phone?: string
    serviceId?: string
    branchId?: string
    preferredAt?: string
    note?: string
  }

  const name = body.name?.trim()
  const phone = body.phone?.trim()
  if (!name || !phone) return NextResponse.json({ error: 'نام و شماره تماس الزامی است' }, { status: 400 })

  const booking = await db.publicBooking.create({
    data: {
      branchId: body.branchId || null,
      name,
      phone,
      serviceId: body.serviceId || null,
      preferredAt: body.preferredAt ? new Date(body.preferredAt) : null,
      note: body.note?.trim() || null,
    },
  })

  // کار یادآوری برای منشی پذیرش
  await db.task.create({
    data: {
      branchId: body.branchId || null,
      title: `درخواست رزرو عمومی — ${name}`,
      description: `${name} (${phone}) از صفحه‌ی عمومی درخواست نوبت ثبت کرد${body.note ? ` — یادداشت: ${body.note}` : ''}`,
      assigneeRole: 'RECEPTIONIST',
      dueAt: new Date(Date.now() + 4 * 3600 * 1000),
      priority: 'HIGH',
      status: 'OPEN',
      source: 'SYSTEM',
    },
  })

  return NextResponse.json({ ok: true, id: booking.id, message: 'درخواست شما ثبت شد؛ همکاران ما برای هماهنگی تماس می‌گیرند' }, { status: 201 })
}
