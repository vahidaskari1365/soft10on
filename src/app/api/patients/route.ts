import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tenantHandler } from '@/lib/tenant'
import { vStr, vPhone, vNationalId, vEmail, vInt, vEnum, vDate, BLOOD_TYPES, GENDERS, PATIENT_STATUS, POSTAL_CODE_RE } from '@/lib/validation'
import { addTimeline } from '@/lib/timeline'
import { logAudit } from '@/lib/audit'

export const GET = tenantHandler('ADMIN', 'MANAGER', 'RECEPTIONIST', 'DOCTOR', 'ACCOUNTANT')(async () => {
  const patients = await db.patient.findMany({ orderBy: { createdAt: 'asc' } })
  const now = new Date()
  const sixMonthsAgo = new Date(now.getTime() - 182 * 86400000)

  const appts = await db.appointment.findMany({
    where: { patientId: { in: patients.map((p) => p.id) } },
    include: { service: true, doctor: true },
    orderBy: { start: 'desc' },
  })

  const list = patients.map((p) => {
    const mine = appts.filter((a) => a.patientId === p.id)
    const visits = mine.filter((a) => a.status === 'DONE')
    const noShows = mine.filter((a) => a.status === 'NO_SHOW').length
    const lastVisit = visits[0]?.start ?? null
    return {
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      phone: p.phone,
      nationalId: p.nationalId,
      incompleteTreatment: p.incompleteTreatment,
      visitCount: visits.length,
      noShowCount: noShows,
      lastVisit,
      signalNoVisit: lastVisit ? lastVisit < sixMonthsAgo : visits.length === 0,
      signalNoShow: noShows >= 1,
      signalIncomplete: p.incompleteTreatment,
      totalSpent: visits.reduce((s, a) => s + a.price, 0),
    }
  })

  return NextResponse.json({ patients: list })
})

/** ثبت بیمار جدید — فقط کارکنان؛ اعتبارسنجی کامل هویتی و پزشکی */
export const POST = tenantHandler('ADMIN', 'MANAGER', 'RECEPTIONIST', 'DOCTOR', 'ACCOUNTANT')(async (session, request) => {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const firstName = vStr(body.firstName, { required: true, min: 2, max: 60, label: 'نام' })
  if (!firstName.ok) return NextResponse.json({ error: firstName.error }, { status: 400 })
  const lastName = vStr(body.lastName, { required: true, min: 2, max: 60, label: 'نام خانوادگی' })
  if (!lastName.ok) return NextResponse.json({ error: lastName.error }, { status: 400 })
  const phone = vPhone(body.phone, 'شماره موبایل', true)
  if (!phone.ok) return NextResponse.json({ error: phone.error }, { status: 400 })
  const nationalId = vNationalId(body.nationalId)
  if (!nationalId.ok) return NextResponse.json({ error: nationalId.error }, { status: 400 })
  const email = vEmail(body.email)
  if (!email.ok) return NextResponse.json({ error: email.error }, { status: 400 })
  const landline = vStr(body.landline, { label: 'تلفن ثابت', max: 12 })
  if (!landline.ok) return NextResponse.json({ error: landline.error }, { status: 400 })
  const gender = vEnum(body.gender, GENDERS, 'جنسیت')
  if (!gender.ok) return NextResponse.json({ error: gender.error }, { status: 400 })
  const bloodType = vEnum(body.bloodType, BLOOD_TYPES, 'گروه خونی')
  if (!bloodType.ok) return NextResponse.json({ error: bloodType.error }, { status: 400 })
  const status = vEnum(body.status, PATIENT_STATUS, 'وضعیت بیمار')
  if (!status.ok) return NextResponse.json({ error: status.error }, { status: 400 })
  const birthYear = vInt(body.birthYear, { label: 'سال تولد', min: 1250, max: 1500 })
  if (!birthYear.ok) return NextResponse.json({ error: birthYear.error }, { status: 400 })
  const birthDate = vDate(body.birthDate, 'تاریخ تولد')
  if (!birthDate.ok) return NextResponse.json({ error: birthDate.error }, { status: 400 })
  const postalCode = vStr(body.postalCode, { label: 'کد پستی', max: 10 })
  if (!postalCode.ok) return NextResponse.json({ error: postalCode.error }, { status: 400 })
  if (postalCode.value && !POSTAL_CODE_RE.test(postalCode.value))
    return NextResponse.json({ error: 'کد پستی باید ۱۰ رقم باشد' }, { status: 400 })
  const treatingDoctorId = typeof body.treatingDoctorId === 'string' && body.treatingDoctorId ? body.treatingDoctorId : null
  if (treatingDoctorId) {
    // findFirst با scope خودکار — پزشک باید از همان کلینیک باشد
    const doc = await db.doctor.findFirst({ where: { id: treatingDoctorId } })
    if (!doc) return NextResponse.json({ error: 'پزشک معالج یافت نشد' }, { status: 400 })
  }

  const dup = await db.patient.findFirst({ where: { phone: phone.value } })
  if (dup) return NextResponse.json({ error: 'بیماری با این شماره موبایل قبلاً ثبت شده است' }, { status: 409 })
  if (nationalId.value) {
    const dupNid = await db.patient.findFirst({ where: { nationalId: nationalId.value } })
    if (dupNid) return NextResponse.json({ error: 'کد ملی قبلاً برای بیمار دیگری ثبت شده است' }, { status: 409 })
  }

  const province = vStr(body.province, { label: 'استان', max: 60 })
  if (!province.ok) return NextResponse.json({ error: province.error }, { status: 400 })
  const city = vStr(body.city, { label: 'شهر', max: 60 })
  if (!city.ok) return NextResponse.json({ error: city.error }, { status: 400 })
  const address = vStr(body.address, { label: 'آدرس', max: 300 })
  if (!address.ok) return NextResponse.json({ error: address.error }, { status: 400 })
  const referralSource = vStr(body.referralSource, { label: 'منبع آشنایی', max: 80 })
  if (!referralSource.ok) return NextResponse.json({ error: referralSource.error }, { status: 400 })
  const allergies = vStr(body.allergies, { label: 'حساسیت‌ها', max: 300 })
  if (!allergies.ok) return NextResponse.json({ error: allergies.error }, { status: 400 })
  const chronicNote = vStr(body.chronicNote, { label: 'بیماری زمینه‌ای', max: 500 })
  if (!chronicNote.ok) return NextResponse.json({ error: chronicNote.error }, { status: 400 })
  const medications = vStr(body.medications, { label: 'داروهای مصرفی', max: 300 })
  if (!medications.ok) return NextResponse.json({ error: medications.error }, { status: 400 })
  const surgeryHistory = vStr(body.surgeryHistory, { label: 'سابقه جراحی', max: 500 })
  if (!surgeryHistory.ok) return NextResponse.json({ error: surgeryHistory.error }, { status: 400 })
  const hospitalizationHistory = vStr(body.hospitalizationHistory, { label: 'سابقه بستری', max: 500 })
  if (!hospitalizationHistory.ok) return NextResponse.json({ error: hospitalizationHistory.error }, { status: 400 })
  const treatmentHistory = vStr(body.treatmentHistory, { label: 'سابقه درمان', max: 500 })
  if (!treatmentHistory.ok) return NextResponse.json({ error: treatmentHistory.error }, { status: 400 })
  const medWarnings = vStr(body.medWarnings, { label: 'هشدارهای پزشکی', max: 300 })
  if (!medWarnings.ok) return NextResponse.json({ error: medWarnings.error }, { status: 400 })
  const insuranceInsurer = vStr(body.insuranceInsurer, { label: 'بیمه پایه', max: 80 })
  if (!insuranceInsurer.ok) return NextResponse.json({ error: insuranceInsurer.error }, { status: 400 })
  const insurancePolicyNo = vStr(body.insurancePolicyNo, { label: 'شماره بیمه', max: 40 })
  if (!insurancePolicyNo.ok) return NextResponse.json({ error: insurancePolicyNo.error }, { status: 400 })
  const suppInsurer = vStr(body.suppInsurer, { label: 'بیمه تکمیلی', max: 80 })
  if (!suppInsurer.ok) return NextResponse.json({ error: suppInsurer.error }, { status: 400 })
  const suppPolicyNo = vStr(body.suppPolicyNo, { label: 'شماره بیمه تکمیلی', max: 40 })
  if (!suppPolicyNo.ok) return NextResponse.json({ error: suppPolicyNo.error }, { status: 400 })
  const notes = vStr(body.notes, { label: 'توضیحات', max: 500 })
  if (!notes.ok) return NextResponse.json({ error: notes.error }, { status: 400 })

  // شماره پرونده اختصاصی خودکار
  const maxPatient = await db.patient.aggregate({ _max: { fileNo: true } })
  const lastNo = Number(maxPatient._max.fileNo?.replace(/\D/g, '') ?? 0) || 0
  const fileNo = String(lastNo + 1).padStart(5, '0')

  const patient = await db.patient.create({
    data: {
      firstName: firstName.value,
      lastName: lastName.value,
      phone: phone.value,
      nationalId: nationalId.value || null,
      email: email.value || null,
      landline: landline.value || null,
      gender: gender.value ?? null,
      birthYear: birthYear.value || null,
      birthDate: birthDate.value,
      province: province.value || null,
      city: city.value || null,
      address: address.value || null,
      postalCode: postalCode.value || null,
      status: status.value ?? 'ACTIVE',
      referralSource: referralSource.value || null,
      bloodType: bloodType.value ?? null,
      allergies: allergies.value || null,
      chronicNote: chronicNote.value || null,
      medications: medications.value || null,
      surgeryHistory: surgeryHistory.value || null,
      hospitalizationHistory: hospitalizationHistory.value || null,
      treatmentHistory: treatmentHistory.value || null,
      medWarnings: medWarnings.value || null,
      insuranceInsurer: insuranceInsurer.value || null,
      insurancePolicyNo: insurancePolicyNo.value || null,
      suppInsurer: suppInsurer.value || null,
      suppPolicyNo: suppPolicyNo.value || null,
      notes: notes.value || null,
      treatingDoctorId,
      fileNo,
      clinicId: session.clinicId,
    },
  })

  await addTimeline(patient.id, 'PATIENT_CREATED', `ایجاد پرونده بیمار — ${patient.firstName} ${patient.lastName} (${fileNo})`, { refId: patient.id, actorName: session.fullName })
  await logAudit({ userId: session.id, userName: session.fullName, action: 'CREATE', entity: 'Patient', entityId: patient.id, branchId: session.branchId, clinicId: session.clinicId, meta: { fileNo, phone: phone.value.slice(0, 4) + '****' } })

  return NextResponse.json({ patient }, { status: 201 })
})
