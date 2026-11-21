import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * پروفایل جامع بیمار (Patient 360):
 * هویت، نوبت‌ها، فاکتورها و پرداخت‌ها، پیام‌ها، پرونده پزشکی و خرید محصولات
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  // بیمار فقط پرونده خودش را می‌بیند؛ کارکنان پرونده همه بیماران مراجعه‌کننده
  if (session.role === 'PATIENT' && session.patientId !== id)
    return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const patient = await db.patient.findUnique({ where: { id } })
  if (!patient) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const [history, sales, invoices, payments, messages, records] = await Promise.all([
    db.appointment.findMany({
      where: { patientId: id },
      include: { service: true, doctor: true },
      orderBy: { start: 'desc' },
      take: 12,
    }),
    db.productSale.findMany({ where: { patientId: id }, include: { product: true }, orderBy: { date: 'desc' }, take: 5 }),
    db.invoice.findMany({
      where: { patientId: id },
      include: { payments: { select: { amount: true, date: true, method: true } } },
      orderBy: { date: 'desc' },
      take: 10,
    }),
    db.payment.findMany({
      where: { patientId: id, direction: 'RECEIVED' },
      orderBy: { date: 'desc' },
      take: 10,
    }),
    db.message.findMany({
      where: { patientId: id },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { id: true, direction: true, channel: true, body: true, createdAt: true, readAt: true, aiGenerated: true },
    }),
    db.medicalRecord.findMany({
      where: { patientId: id },
      include: { doctor: { select: { name: true } } },
      orderBy: { date: 'desc' },
      take: 10,
    }),
  ])

  const visits = history.filter((a) => a.status === 'DONE')
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
  const totalDebt = invoices.reduce((s, inv) => s + (inv.total - inv.payments.reduce((ps, p) => ps + p.amount, 0)), 0)
  const totalDebtPositive = Math.max(0, totalDebt)

  return NextResponse.json({
    patient,
    history,
    sales,
    invoices,
    payments,
    messages,
    records,
    totalSpent: visits.reduce((s, a) => s + a.price, 0),
    totalPaid,
    totalDebt: totalDebtPositive,
    lastVisit: visits[0]?.start ?? null,
  })
}

/** ویرایش اطلاعات بیمار — فقط کارکنان */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as {
    firstName?: string
    lastName?: string
    phone?: string
    nationalId?: string
    birthYear?: number
    notes?: string
    allergies?: string
    incompleteTreatment?: boolean
  }
  const data: Record<string, string | number | boolean | null> = {}
  if (body.firstName !== undefined) {
    const v = body.firstName.trim()
    if (!v) return NextResponse.json({ error: 'نام نمی‌تواند خالی باشد' }, { status: 400 })
    data.firstName = v
  }
  if (body.lastName !== undefined) {
    const v = body.lastName.trim()
    if (!v) return NextResponse.json({ error: 'نام خانوادگی نمی‌تواند خالی باشد' }, { status: 400 })
    data.lastName = v
  }
  if (body.phone !== undefined) {
    const v = body.phone.trim()
    if (!/^09\d{9}$/.test(v)) return NextResponse.json({ error: 'شماره موبایل معتبر نیست' }, { status: 400 })
    const dup = await db.patient.findFirst({ where: { phone: v, id: { not: id } } })
    if (dup) return NextResponse.json({ error: 'شماره موبایل متعلق به بیمار دیگری است' }, { status: 409 })
    data.phone = v
  }
  if (body.nationalId !== undefined) {
    const v = body.nationalId.trim()
    if (v && !/^\d{10}$/.test(v)) return NextResponse.json({ error: 'کد ملی باید ۱۰ رقم باشد' }, { status: 400 })
    data.nationalId = v || null
  }
  if (body.birthYear !== undefined) {
    const y = Number(body.birthYear)
    if (!Number.isFinite(y) || y < 1250 || y > 1500) return NextResponse.json({ error: 'سال تولد شمسی نامعتبر است' }, { status: 400 })
    data.birthYear = Math.round(y)
  }
  if (body.notes !== undefined) data.notes = body.notes.trim() || null
  if (body.allergies !== undefined) data.allergies = body.allergies.trim() || null
  if (body.incompleteTreatment !== undefined) data.incompleteTreatment = body.incompleteTreatment

  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'فیلدی برای ویرایش ارسال نشده' }, { status: 400 })

  const existing = await db.patient.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const patient = await db.patient.update({ where: { id }, data })
  return NextResponse.json({ patient })
}
