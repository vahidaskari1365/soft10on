import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { runToolAgent, type AgentTool, type AgentStep } from '@/lib/agents'
import { requireRole } from '@/lib/auth'
import { formatJDate, formatTime, formatDayRelative, weekdayName, faDigits } from '@/lib/jalali'
import { formatToman, APPOINTMENT_STATUS } from '@/lib/format'

export const maxDuration = 60

type TurnMessage = { role: 'user' | 'assistant'; content: string }

function statusFa(s: string) {
  return APPOINTMENT_STATUS[s]?.label ?? s
}

async function freeSlots(serviceName?: string, doctorName?: string) {
  const svc = serviceName
    ? await db.service.findFirst({ where: { name: { contains: serviceName.trim() } } })
    : await db.service.findFirst({ orderBy: { price: 'asc' } })
  if (!svc) return { error: 'خدمت یافت نشد' }
  const doctors = await db.doctor.findMany({ where: { active: true }, include: { branch: true } })
  let doctor = undefined
  if (doctorName) doctor = doctors.find((d) => d.name.includes(doctorName.trim()))
  if (!doctor) {
    const preferred =
      svc.category === 'جراحی' ? doctors.find((x) => x.name.includes('امیر'))
      : svc.category === 'زیبایی' ? doctors.find((x) => x.name.includes('سارا'))
      : doctors.find((x) => x.name.includes('نگین'))
    doctor = preferred ?? doctors[0]
  }
  const now = new Date()
  const days: Date[] = []
  let t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + 86400000
  while (days.length < 4) {
    const dt = new Date(t)
    if (dt.getUTCDay() !== 5) days.push(new Date(t))
    t += 86400000
  }
  const out: { day: string; doctor: string; branch: string; slots: { iso: string; time: string }[] }[] = []
  for (const day of days) {
    const dayMs = day.getTime()
    const taken = await db.appointment.findMany({
      where: { doctorId: doctor.id, start: { gte: new Date(dayMs), lt: new Date(dayMs + 86400000) }, status: { in: ['PENDING', 'CONFIRMED', 'DONE'] } },
      select: { start: true, service: { select: { durationMin: true } } },
    })
    const busy = taken.map((b) => ({ s: b.start.getTime(), e: b.start.getTime() + Math.max(b.service.durationMin, 30) * 60000 }))
    const slots: { iso: string; time: string }[] = []
    for (let h = doctor.branch?.openHour ?? 9; h <= (doctor.branch?.closeHour ?? 19) - 1 && slots.length < 6; h++) {
      for (const m of [0, 30]) {
        const cand = new Date(dayMs + h * 3600000 + m * 60000)
        if (cand.getTime() < now.getTime() + 60 * 60000) continue
        const cs = cand.getTime()
        const ce = cs + svc.durationMin * 60000
        if (busy.some((b) => cs < b.e && ce > b.s)) continue
        slots.push({ iso: cand.toISOString(), time: formatTime(cand) })
      }
    }
    if (slots.length) {
      out.push({
        day: `${formatDayRelative(day)} ${weekdayName(day)} ${formatJDate(day, false)}`,
        doctor: doctor.name,
        branch: doctor.branch?.name ?? '—',
        slots,
      })
    }
  }
  return { service: svc.name, priceFa: formatToman(svc.price), durationMin: svc.durationMin, options: out }
}

const tools: AgentTool[] = [
  {
    name: 'search_patient',
    description: 'جست‌وجوی بیمار با نام یا شماره موبایل',
    argsHint: '{"query":"نام یا شماره"}',
    run: async (args) => {
      const q = String(args.query ?? '').trim()
      if (!q) return { error: 'عبارت جست‌وجو خالی است' }
      // جست‌وجوی چندکلمه‌ای: هر کلمه باید در نام یا نام خانوادگی یا موبایل بیاید
      const tokens = q.split(/\s+/).filter(Boolean).slice(0, 4)
      const patients = await db.patient.findMany({
        where: { AND: tokens.map((t) => ({ OR: [{ firstName: { contains: t } }, { lastName: { contains: t } }, { phone: { contains: t } }] })) },
        take: 5,
      })
      return patients.map((p) => ({
        id: p.id,
        patient: `${p.firstName} ${p.lastName}`,
        phone: p.phone,
        incompleteTreatment: p.incompleteTreatment,
      }))
    },
  },
  {
    name: 'today_appointments',
    description: 'نوبت‌های امروز کلینیک با ساعت، بیمار، پزشک و وضعیت',
    argsHint: '{}',
    run: async () => {
      const now = new Date()
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      const end = new Date(start.getTime() + 86400000)
      const appts = await db.appointment.findMany({
        where: { start: { gte: start, lt: end } },
        include: { patient: true, doctor: true, service: true, branch: true },
        orderBy: { start: 'asc' },
      })
      return appts.map((a) => ({
        id: a.id,
        time: formatTime(a.start),
        patient: `${a.patient.firstName} ${a.patient.lastName}`,
        doctor: a.doctor.name,
        branch: a.branch?.name ?? '—',
        service: a.service.name,
        status: statusFa(a.status),
      }))
    },
  },
  {
    name: 'find_free_slots',
    description: 'پیدا کردن زمان‌های خالی برای یک خدمت (و اختیاری پزشک مشخص) در روزهای کاری آینده',
    argsHint: '{"serviceName":"نام خدمت","doctorName":"اختیاری"}',
    run: async (args) => freeSlots(
      typeof args.serviceName === 'string' ? args.serviceName : undefined,
      typeof args.doctorName === 'string' ? args.doctorName : undefined,
    ),
  },
  {
    name: 'create_appointment',
    description: 'ثبت نوبت جدید. قبل از این فراخوانی باید زمان خالی با find_free_slots گرفته شده باشد.',
    argsHint: '{"serviceName":"نام خدمت","startISO":"iso از نتایج find_free_slots","patientId":"اگر دارید","patientName":"نام بیمار جدید","phone":"موبایل","doctorName":"اختیاری"}',
    run: async (args) => {
      const startISO = String(args.startISO ?? '')
      const serviceName = String(args.serviceName ?? '').trim()
      if (!startISO || !serviceName) return { error: 'نام خدمت و زمان الزامی است' }
      const svc = await db.service.findFirst({ where: { name: { contains: serviceName } } })
      if (!svc) return { error: 'خدمت یافت نشد' }

      // بیمار
      let patientId = typeof args.patientId === 'string' ? args.patientId : undefined
      if (!patientId && typeof args.phone === 'string' && args.phone.trim()) {
        const existing = await db.patient.findFirst({ where: { phone: args.phone.trim() } })
        if (existing) patientId = existing.id
      }
      let createdPatient = false
      if (!patientId && typeof args.patientName === 'string' && args.patientName.trim() && typeof args.phone === 'string' && args.phone.trim()) {
        const parts = args.patientName.trim().split(' ')
        const p = await db.patient.create({
          data: { firstName: parts[0], lastName: parts.slice(1).join(' ') || '—', phone: args.phone.trim() },
        })
        patientId = p.id
        createdPatient = true
      }
      if (!patientId) return { error: 'برای ثبت نوبت، شناسه بیمار یا نام+موبایل لازم است' }

      // پزشک
      const doctors = await db.doctor.findMany({ where: { active: true }, include: { branch: true } })
      let doctor = typeof args.doctorName === 'string' && args.doctorName.trim()
        ? doctors.find((d) => d.name.includes(args.doctorName as string))
        : undefined
      if (!doctor) {
        const preferred =
          svc.category === 'جراحی' ? doctors.find((x) => x.name.includes('امیر'))
          : svc.category === 'زیبایی' ? doctors.find((x) => x.name.includes('سارا'))
          : doctors.find((x) => x.name.includes('نگین'))
        doctor = preferred ?? doctors[0]
      }

      const start = new Date(startISO)
      const appt = await db.appointment.create({
        data: {
          branchId: doctor.branchId,
          patientId,
          doctorId: doctor.id,
          serviceId: svc.id,
          start,
          status: 'PENDING',
          source: 'PANEL',
          price: svc.price,
          note: 'ثبت‌شده توسط دستیار پذیرش',
        },
        include: { patient: true },
      })
      await db.task.create({
        data: {
          branchId: doctor.branchId,
          title: `تماس تأیید نوبت — ${svc.name}`,
          description: `بیمار: ${appt.patient.firstName} ${appt.patient.lastName} · ${formatDayRelative(start)} ${weekdayName(start)} ${formatJDate(start)} ساعت ${formatTime(start)} · ثبت با دستیار پذیرش`,
          assigneeRole: 'RECEPTIONIST',
          assigneeName: 'سمیرا (منشی)',
          patientId,
          appointmentId: appt.id,
          dueAt: new Date(Date.now() + 4 * 3600 * 1000),
          priority: 'HIGH',
          status: 'OPEN',
          source: 'ASSISTANT',
        },
      })
      return {
        ok: true,
        createdPatient,
        appointment: {
          id: appt.id,
          patient: `${appt.patient.firstName} ${appt.patient.lastName}`,
          doctor: doctor.name,
          branch: doctor.branch?.name ?? '—',
          service: svc.name,
          time: `${formatDayRelative(start)} ${weekdayName(start)} ${formatJDate(start)} ساعت ${formatTime(start)}`,
          priceFa: formatToman(svc.price),
        },
      }
    },
  },
  {
    name: 'patient_history',
    description: 'تاریخچه‌ی نوبت‌های یک بیمار بر اساس شماره موبایل یا شناسه',
    argsHint: '{"patientId":"اختیاری","phone":"اختیاری"}',
    run: async (args) => {
      const where = typeof args.patientId === 'string' && args.patientId
        ? { id: args.patientId }
        : typeof args.phone === 'string' ? { phone: args.phone.trim() } : null
      if (!where) return { error: 'شناسه یا شماره لازم است' }
      const p = await db.patient.findFirst({
        where,
        include: { appointments: { orderBy: { start: 'desc' }, take: 6, include: { service: true, doctor: true } } },
      })
      if (!p) return { error: 'بیمار یافت نشد' }
      return {
        patient: `${p.firstName} ${p.lastName}`,
        phone: p.phone,
        incompleteTreatment: p.incompleteTreatment,
        visits: p.appointments.map((a) => ({
          when: `${formatDayRelative(a.start)} ${formatJDate(a.start, false)}`,
          service: a.service.name,
          doctor: a.doctor.name,
          status: statusFa(a.status),
        })),
      }
    },
  },
  {
    name: 'create_task',
    description: 'ثبت یادداشت/کار در کارتابل پذیرش',
    argsHint: '{"title":"عنوان","priority":"LOW|MEDIUM|HIGH|URGENT","description":"توضیح"}',
    run: async (args) => {
      const title = String(args.title ?? '').trim()
      if (!title) return { error: 'عنوان الزامی است' }
      const task = await db.task.create({
        data: {
          title,
          description: args.description ? String(args.description) : undefined,
          assigneeRole: 'RECEPTIONIST',
          assigneeName: 'سمیرا (منشی)',
          dueAt: new Date(Date.now() + 24 * 3600 * 1000),
          priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(String(args.priority)) ? String(args.priority) : 'MEDIUM',
          status: 'OPEN',
          source: 'ASSISTANT',
        },
      })
      return { ok: true, taskId: task.id, message: 'به کارتابل اضافه شد' }
    },
  },
]

const TOOL_TITLES: Record<string, string> = {
  search_patient: 'جست‌وجوی بیمار در سیستم',
  today_appointments: 'خواندن نوبت‌های امروز',
  find_free_slots: 'بررسی تقویم و زمان‌های خالی',
  create_appointment: 'ثبت نوبت در سیستم',
  patient_history: 'مرور پرونده‌ی بیمار',
  create_task: 'ثبت کار در کارتابل',
}

const SYSTEM = `شما «سینا» هستید؛ دستیار پذیرش کلینیک دندان‌پزشکی «لبخند مهر» (۳ شعبه) که به منشی پذیرش کمک می‌کند.
کارهای شما: جست‌وجوی بیمار، دیدن نوبت‌های امروز، پیدا کردن زمان خالی و ثبت نوبت، مرور پرونده بیمار و ثبت کار در کارتابل.
برای ثبت نوبت حتماً این چرخه را رعایت کنید: ۱) find_free_slots ۲) create_appointment با startISO از همان نتایج.
برای بیمار جدید، نام و شماره موبایل را از کاربر بگیرید. اعداد و مبالغ را دقیقاً از خروجی ابزار نقل کنید و فارسی بنویسید.
پاسخ‌ها کوتاه و عملیاتی باشند.`

async function fallback(userMessage: string): Promise<{ answer: string; steps: AgentStep[] }> {
  const steps: AgentStep[] = []
  const t = userMessage.trim()
  if (/(امروز|نوبت‌های امروز|برنامه امروز)/.test(t)) {
    const tool = tools.find((x) => x.name === 'today_appointments')!
    const result = await tool.run({})
    steps.push({ tool: 'today_appointments', title: 'خواندن نوبت‌های امروز', args: {}, result, ok: true })
    const rows = (result as { time: string; patient: string; status: string }[])
      .map((r) => `• ${faDigits(r.time)} — ${r.patient} (${r.status})`).join('\n')
    return { answer: `نوبت‌های امروز:\n${rows || 'نوبتی برای امروز ثبت نشده.'}\n\n(حالت آفلاین دستیار پذیرش)`, steps }
  }
  return {
    answer: 'دستیار پذیرش فعلاً در حالت آفلاین است؛ از بخش نوبت‌ها و تقویم به‌صورت دستی استفاده کنید یا بعداً تلاش کنید.',
    steps,
  }
}

export async function POST(request: Request) {
  const user = await requireRole('ADMIN', 'RECEPTIONIST')
  if (!user) return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const message = String(body.message ?? '').trim()
  const history: TurnMessage[] = Array.isArray(body.history)
    ? body.history.slice(-8).map((m: { role: string; content: string }) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content).slice(0, 2000),
      }))
    : []
  if (!message) return NextResponse.json({ error: 'پیام خالی است' }, { status: 400 })

  const turn = await runToolAgent({
    system: SYSTEM,
    tools,
    history,
    userMessage: message,
    fallback,
    toolTitles: TOOL_TITLES,
    maxSteps: 5,
  })

  return NextResponse.json({
    answer: turn.answer,
    steps: turn.steps.map((s) => ({ title: s.title, ok: s.ok, result: s.result })),
    aiUsed: turn.aiUsed,
  })
}
