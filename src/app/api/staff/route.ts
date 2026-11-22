import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { ROLE_FA } from '@/lib/auth'

/** لیست پرسنل و کاربران */
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  }
  if (user.role !== 'ADMIN' && user.role !== 'RECEPTIONIST') {
    return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  }
  const users = await db.user.findMany({
    orderBy: { createdAt: 'asc' },
    include: { branch: true, doctor: true, patient: true },
  })
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      role: u.role,
      roleFa: ROLE_FA[u.role] ?? u.role,
      phone: u.phone,
      email: u.email,
      active: u.active,
      lastLoginAt: u.lastLoginAt,
      branch: u.branch ? { id: u.branch.id, name: u.branch.name } : null,
      doctorName: u.doctor?.name ?? null,
      patientName: u.patient ? `${u.patient.firstName} ${u.patient.lastName}` : null,
    })),
  })
}

/** ایجاد کاربر جدید — فقط مدیر کل */
export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'فقط مدیر کل مجاز است' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const username = String(body.username ?? '').trim()
  const password = String(body.password ?? '').trim()
  const fullName = String(body.fullName ?? '').trim()
  const role = String(body.role ?? '').trim()
  if (!username || !password || !fullName || !['ADMIN', 'DOCTOR', 'RECEPTIONIST', 'PATIENT'].includes(role)) {
    return NextResponse.json({ error: 'اطلاعات ناقص است (نام کاربری، رمز، نام کامل و نقش الزامی است)' }, { status: 400 })
  }
  if (password.length < 6) return NextResponse.json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' }, { status: 400 })

  const exists = await db.user.findUnique({ where: { username } })
  if (exists) return NextResponse.json({ error: 'این نام کاربری قبلاً گرفته شده' }, { status: 400 })

  // محدودیت پلن — تعداد کاربران
  const clinic = await db.clinic.findFirst({ where: { id: user.clinicId! }, include: { plan: true } })
  if (clinic?.plan) {
    const count = await db.user.count({ where: { clinicId: user.clinicId } })
    if (count >= clinic.plan.maxUsers) {
      return NextResponse.json({ error: `سقف کاربران پلن «${clinic.plan.name}» پر است (${clinic.plan.maxUsers} کاربر)` }, { status: 402 })
    }
  }

  const branchId = body.branchId ? String(body.branchId) : null

  // برای پزشک: ساخت پرونده پزشک در صورت نیاز
  let doctorId: string | undefined
  if (role === 'DOCTOR') {
    if (body.doctorId) {
      doctorId = String(body.doctorId)
    } else {
      const doctor = await db.doctor.create({
        data: {
          name: fullName.startsWith('دکتر') ? fullName : `دکتر ${fullName}`,
          specialty: String(body.specialty ?? 'دندان‌پزشکی عمومی'),
          commissionRate: Number(body.commissionRate) > 0 ? Number(body.commissionRate) : 0.35,
          color: '#0284C7',
          branchId,
        },
      })
      doctorId = doctor.id
    }
  }

  // برای بیمار: اتصال به پرونده بیمار موجود با شماره موبایل
  let patientId: string | undefined
  if (role === 'PATIENT' && body.patientId) patientId = String(body.patientId)

  const created = await db.user.create({
    data: {
      username,
      password: hashPassword(password),
      fullName,
      role,
      phone: body.phone ? String(body.phone) : null,
      email: body.email ? String(body.email) : null,
      clinicId: user.clinicId!, // عضویت کاربر جدید همیشه در کلینیک مدیرِ ایجادکننده
      branchId,
      doctorId,
      patientId,
    },
  })
  return NextResponse.json({ user: { id: created.id, username: created.username, role: created.role } })
}
