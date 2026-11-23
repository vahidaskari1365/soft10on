import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { verifyPassword, hashPassword } from '@/lib/password'
import { formatDayRelative, formatJDate, formatTime } from '@/lib/jalali'

/** اقدامات بیمار: لغو نوبت، ویرایش پروفایل، تغییر رمز */
export async function POST(request: Request) {
  const user = await requireRole('PATIENT')
  if (!user) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (!user.patientId) return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const action = String(body.action ?? '')

  // ---------- لغو نوبت ----------
  if (action === 'cancel') {
    const apptId = String(body.appointmentId ?? '')
    const appt = await db.appointment.findFirst({
      where: { id: apptId, patientId: user.patientId },
      include: { service: true },
    })
    if (!appt) return NextResponse.json({ error: 'نوبت یافت نشد' }, { status: 404 })
    if (appt.start.getTime() < Date.now()) return NextResponse.json({ error: 'نوبت گذشته قابل لغو نیست' }, { status: 400 })
    if (!['PENDING', 'CONFIRMED'].includes(appt.status)) return NextResponse.json({ error: 'این نوبت قابل لغو نیست' }, { status: 400 })

    await db.appointment.update({ where: { id: apptId }, data: { status: 'CANCELLED', note: 'لغو توسط بیمار از پرتال' } })
    await db.task.create({
      data: {
        branchId: appt.branchId,
        title: `پیگیری لغو نوبت بیمار — ${appt.service.name}`,
        description: `${user.fullName} نوبت ${formatDayRelative(appt.start)} ${formatJDate(appt.start)} ساعت ${formatTime(appt.start)} را از پرتال لغو کرد. تماس برای هماهنگی زمان جدید پیشنهاد می‌شود.`,
        assigneeRole: 'RECEPTIONIST',
        assigneeName: 'سمیرا (منشی)',
        patientId: user.patientId,
        appointmentId: appt.id,
        dueAt: new Date(Date.now() + 12 * 3600 * 1000),
        priority: 'MEDIUM',
        status: 'OPEN',
        source: 'SYSTEM',
      },
    })
    return NextResponse.json({ ok: true, message: 'نوبت لغو شد و به کارتابل پذیرش اطلاع داده شد' })
  }

  // ---------- ویرایش پروفایل ----------
  if (action === 'update_profile') {
    const data: Record<string, unknown> = {}
    if (body.phone) data.phone = String(body.phone).trim()
    if (body.email !== undefined) data.email = body.email ? String(body.email).trim() : null
    const patientData: Record<string, unknown> = {}
    // تلفن تماس نمایش‌داده‌شده در پرتال patient.phone است — هر دو باید هم‌گام شوند وگرنه
    // پیام موفقیت جعلی می‌شود (UI مقدار قدیمی را نشان می‌دهد)
    if (body.phone) patientData.phone = String(body.phone).trim()
    if (body.birthYear) patientData.birthYear = Number(body.birthYear) || null

    await db.user.update({ where: { id: user.id }, data })
    if (Object.keys(patientData).length) await db.patient.update({ where: { id: user.patientId }, data: patientData })
    return NextResponse.json({ ok: true, message: 'اطلاعات حساب به‌روزرسانی شد' })
  }

  // ---------- تغییر رمز ----------
  if (action === 'change_password') {
    const current = String(body.currentPassword ?? '')
    const next = String(body.newPassword ?? '')
    if (next.length < 6) return NextResponse.json({ error: 'رمز جدید باید حداقل ۶ کاراکتر باشد' }, { status: 400 })
    const me = await db.user.findUnique({ where: { id: user.id } })
    if (!me || !verifyPassword(current, me.password)) {
      return NextResponse.json({ error: 'رمز فعلی اشتباه است' }, { status: 400 })
    }
    await db.user.update({ where: { id: user.id }, data: { password: hashPassword(next) } })
    return NextResponse.json({ ok: true, message: 'رمز عبور تغییر کرد' })
  }

  return NextResponse.json({ error: 'اکشن نامشخص' }, { status: 400 })
}
