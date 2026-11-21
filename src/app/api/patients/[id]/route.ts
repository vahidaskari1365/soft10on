import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { vStr, vPhone, vNationalId, vEmail, vInt, vEnum, vDate, BLOOD_TYPES, GENDERS, PATIENT_STATUS } from '@/lib/validation'
import { addTimeline } from '@/lib/timeline'
import { logAudit } from '@/lib/audit'

/**
 * پروفایل جامع بیمار (Patient 360):
 * هویت کامل، نوبت‌ها، فاکتورها و پرداخت‌ها، پیام‌ها، پرونده پزشکی، اسناد، نسخه‌ها،
 * طرح درمان، تماس اضطراری و تایم‌لاین — بیمار فقط پرونده خودش را می‌بیند.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role === 'PATIENT' && session.patientId !== id)
    return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const patient = await db.patient.findUnique({ where: { id }, include: { treatingDoctor: { select: { id: true, name: true } } } })
  if (!patient) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const [history, sales, invoices, payments, messages, records, documents, prescriptions, plans, emergency, timeline] = await Promise.all([
    db.appointment.findMany({
      where: { patientId: id },
      include: { service: true, doctor: true, roomUnit: { select: { id: true, name: true } } },
      orderBy: { start: 'desc' },
      take: 24,
    }),
    db.productSale.findMany({ where: { patientId: id }, include: { product: true }, orderBy: { date: 'desc' }, take: 10 }),
    db.invoice.findMany({
      where: { patientId: id },
      include: { payments: { select: { amount: true, date: true, method: true } } },
      orderBy: { date: 'desc' },
      take: 20,
    }),
    db.payment.findMany({
      where: { patientId: id, direction: 'IN' },
      orderBy: { date: 'desc' },
      take: 20,
    }),
    db.message.findMany({
      where: { patientId: id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, direction: true, channel: true, body: true, createdAt: true, readAt: true, aiGenerated: true },
    }),
    db.medicalRecord.findMany({
      where: { patientId: id },
      include: { doctor: { select: { name: true } } },
      orderBy: { date: 'desc' },
      take: 20,
    }),
    // اسناد — فقط متادیتا؛ محتوا از مسیر /api/documents/[id] با کنترل دسترسی
    db.document.findMany({
      where: { patientId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, kind: true, title: true, mimeType: true, sizeBytes: true, note: true, createdAt: true, uploadedBy: { select: { fullName: true } } },
      take: 60,
    }),
    db.prescription.findMany({
      where: { patientId: id },
      include: { doctor: { select: { id: true, name: true } }, items: true },
      orderBy: { date: 'desc' },
      take: 20,
    }),
    db.treatmentPlan.findMany({
      where: { patientId: id },
      include: { doctor: { select: { id: true, name: true } }, steps: { include: { service: { select: { name: true, price: true } } }, orderBy: { id: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    db.emergencyContact.findMany({ where: { patientId: id }, orderBy: { createdAt: 'asc' } }),
    db.timelineEvent.findMany({ where: { patientId: id }, orderBy: { createdAt: 'desc' }, take: 80 }),
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
    documents,
    prescriptions,
    treatmentPlans: plans,
    emergencyContacts: emergency,
    timeline,
    totalSpent: visits.reduce((s, a) => s + a.price, 0),
    totalPaid,
    totalDebt: totalDebtPositive,
    lastVisit: visits[0]?.start ?? null,
  })
}

const OPT_FIELDS = [
  ['landline', 'تلفن ثابت', 12], ['province', 'استان', 60], ['city', 'شهر', 60], ['address', 'آدرس', 300],
  ['referralSource', 'منبع آشنایی', 80], ['allergies', 'حساسیت‌ها', 300], ['chronicNote', 'بیماری زمینه‌ای', 500],
  ['medications', 'داروهای مصرفی', 300], ['surgeryHistory', 'سابقه جراحی', 500], ['hospitalizationHistory', 'سابقه بستری', 500],
  ['treatmentHistory', 'سابقه درمان', 500], ['medWarnings', 'هشدارهای پزشکی', 300], ['insuranceInsurer', 'بیمه پایه', 80],
  ['insurancePolicyNo', 'شماره بیمه', 40], ['suppInsurer', 'بیمه تکمیلی', 80], ['suppPolicyNo', 'شماره بیمه تکمیلی', 40],
  ['notes', 'توضیحات', 500], ['postalCode', 'کد پستی', 10],
] as const

/** ویرایش اطلاعات بیمار — فقط کارکنان؛ اعتبارسنجی کامل + ثبت تایم‌لاین و حسابرسی */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const data: Record<string, string | number | boolean | Date | null> = {}
  const changed: string[] = []

  if (body.firstName !== undefined) {
    const v = vStr(body.firstName, { required: true, min: 2, max: 60, label: 'نام' })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    data.firstName = v.value
    changed.push('نام')
  }
  if (body.lastName !== undefined) {
    const v = vStr(body.lastName, { required: true, min: 2, max: 60, label: 'نام خانوادگی' })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    data.lastName = v.value
    changed.push('نام خانوادگی')
  }
  if (body.phone !== undefined) {
    const v = vPhone(body.phone, 'شماره موبایل', true)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    const dup = await db.patient.findFirst({ where: { phone: v.value, id: { not: id } } })
    if (dup) return NextResponse.json({ error: 'شماره موبایل متعلق به بیمار دیگری است' }, { status: 409 })
    data.phone = v.value
    changed.push('موبایل')
  }
  if (body.nationalId !== undefined) {
    const v = vNationalId(body.nationalId)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    if (v.value) {
      const dup = await db.patient.findFirst({ where: { nationalId: v.value, id: { not: id } } })
      if (dup) return NextResponse.json({ error: 'کد ملی متعلق به بیمار دیگری است' }, { status: 409 })
    }
    data.nationalId = v.value || null
    changed.push('کد ملی')
  }
  if (body.email !== undefined) {
    const v = vEmail(body.email)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    data.email = v.value || null
    changed.push('ایمیل')
  }
  if (body.gender !== undefined) {
    const v = vEnum(body.gender, GENDERS, 'جنسیت')
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    data.gender = v.value ?? null
    changed.push('جنسیت')
  }
  if (body.birthYear !== undefined) {
    const v = vInt(body.birthYear, { label: 'سال تولد', min: 1250, max: 1500 })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    data.birthYear = v.value || null
    changed.push('سال تولد')
  }
  if (body.birthDate !== undefined) {
    const v = vDate(body.birthDate, 'تاریخ تولد')
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    data.birthDate = v.value
    changed.push('تاریخ تولد')
  }
  if (body.bloodType !== undefined) {
    const v = vEnum(body.bloodType, BLOOD_TYPES, 'گروه خونی')
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    data.bloodType = v.value ?? null
    changed.push('گروه خونی')
  }
  if (body.status !== undefined) {
    const v = vEnum(body.status, PATIENT_STATUS, 'وضعیت بیمار')
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    if (!v.value) return NextResponse.json({ error: 'وضعیت بیمار الزامی است' }, { status: 400 })
    data.status = v.value
    changed.push('وضعیت بیمار')
  }
  if (body.treatingDoctorId !== undefined) {
    const v = typeof body.treatingDoctorId === 'string' && body.treatingDoctorId ? body.treatingDoctorId : null
    if (v) {
      const doc = await db.doctor.findUnique({ where: { id: v } })
      if (!doc) return NextResponse.json({ error: 'پزشک معالج یافت نشد' }, { status: 400 })
    }
    data.treatingDoctorId = v
    changed.push('پزشک معالج')
  }
  if (body.incompleteTreatment !== undefined) {
    data.incompleteTreatment = Boolean(body.incompleteTreatment)
    changed.push('درمان نیمه‌تمام')
  }
  if (body.isPregnant !== undefined) {
    data.isPregnant = Boolean(body.isPregnant)
    changed.push('بارداری')
  }
  for (const [field, label, max] of OPT_FIELDS) {
    if (body[field] !== undefined) {
      const v = vStr(body[field], { label, max })
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
      if (field === 'postalCode' && v.value && !/^\d{10}$/.test(v.value))
        return NextResponse.json({ error: 'کد پستی باید ۱۰ رقم باشد' }, { status: 400 })
      ;(data as Record<string, string | null>)[field] = v.value || null
      changed.push(label)
    }
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'فیلدی برای ویرایش ارسال نشده' }, { status: 400 })

  const existing = await db.patient.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const patient = await db.patient.update({ where: { id }, data })

  await addTimeline(id, 'PATIENT_UPDATED', `ویرایش اطلاعات پرونده — ${changed.slice(0, 6).join('، ')}`, { refId: id, actorName: session.fullName, meta: { fields: changed } })
  await logAudit({ userId: session.id, userName: session.fullName, action: 'UPDATE', entity: 'Patient', entityId: id, branchId: session.branchId, clinicId: session.clinicId, meta: { fields: changed } })

  return NextResponse.json({ patient })
}
