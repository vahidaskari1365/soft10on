import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { runToolAgent, type AgentTool } from '@/lib/agents'
import { requireRole } from '@/lib/auth'
import { utcDayStart, formatJDate, formatTime } from '@/lib/jalali'
import { getClinicDNA } from '@/lib/clinic-dna'
import { logAiCall } from '@/lib/ai'

export const maxDuration = 60

type TurnMessage = { role: 'user' | 'assistant'; content: string }

/** ابزارهای دستیار پزشک — با داده‌های سشن پزشک بسته می‌شوند */
function buildTools(ctx: { doctorId: string; doctorName: string; branchId: string | null; userId: string }): AgentTool[] {
  return [
    {
      name: 'today_schedule',
      description: 'برنامه امروز من (پزشک): نوبت‌ها با ساعت، بیمار و خدمت',
      argsHint: '{}',
      run: async () => {
        if (!ctx.doctorId) return { error: 'پروفایل پزشک یافت نشد' }
        const start = utcDayStart(new Date())
        const end = new Date(start.getTime() + 24 * 3600 * 1000)
        const appts = await db.appointment.findMany({
          where: { doctorId: ctx.doctorId, start: { gte: start, lt: end }, status: { in: ['CONFIRMED', 'PENDING', 'DONE'] } },
          orderBy: { start: 'asc' },
          include: { patient: { select: { id: true, firstName: true, lastName: true } }, service: { select: { name: true } } },
        })
        return appts.map((a) => ({
          time: formatTime(a.start),
          patient: `${a.patient.firstName} ${a.patient.lastName}`,
          patientId: a.patient.id,
          service: a.service.name,
          status: a.status === 'DONE' ? 'انجام‌شده' : a.status === 'CONFIRMED' ? 'تأییدشده' : 'در انتظار',
        }))
      },
    },
    {
      name: 'patient_file',
      description: 'پرونده کامل یک بیمار + هشدارهای ایمنی (حساسیت دارویی، بارداری، بیماری زمینه‌ای)',
      argsHint: '{"patientId":"شناسه بیمار"} یا {"query":"نام یا شماره"}',
      run: async (args) => {
        let patientId = typeof args.patientId === 'string' ? args.patientId : ''
        if (!patientId && typeof args.query === 'string') {
          const q = args.query.trim()
          const tokens = q.split(/\s+/).filter(Boolean).slice(0, 3)
          const found = await db.patient.findFirst({
            where: { AND: tokens.map((t) => ({ OR: [{ firstName: { contains: t } }, { lastName: { contains: t } }, { phone: { contains: t } }] })) },
          })
          patientId = found?.id ?? ''
        }
        if (!patientId) return { error: 'بیمار یافت نشد؛ نام یا شماره دقیق‌تر بدهید' }
        const file = await patientSafety(patientId)
        if (!file) return { error: 'بیمار یافت نشد' }
        return file
      },
    },
    {
      name: 'add_record',
      description: 'ثبت سند بالینی در پرونده بیمار (ویزیت، آزمایش، تصویربرداری یا یادداشت)',
      argsHint: '{"patientId":"شناسه","type":"VISIT|TEST|IMAGING|NOTE","title":"عنوان","content":"متن"}',
      run: async (args) => {
        const patientId = String(args.patientId ?? '')
        const title = String(args.title ?? '').trim()
        const content = String(args.content ?? '').trim()
        if (!patientId || !title || !content) return { error: 'شناسه بیمار، عنوان و متن الزامی است' }
        const patient = await db.patient.findUnique({ where: { id: patientId }, select: { id: true } })
        if (!patient) return { error: 'بیمار یافت نشد' }
        const record = await db.medicalRecord.create({
          data: {
            branchId: ctx.branchId,
            patientId,
            doctorId: ctx.doctorId,
            date: new Date(),
            type: ['VISIT', 'TEST', 'IMAGING', 'NOTE'].includes(String(args.type)) ? String(args.type) : 'NOTE',
            title,
            content,
            source: 'ASSISTANT',
            createdBy: ctx.userId,
          },
        })
        return { ok: true, recordId: record.id, message: 'سند در پرونده ثبت شد' }
      },
    },
    {
      name: 'create_task',
      description: 'تبدیل دستور به وظیفه برای پذیرش (مثلاً «پیگیری تماس هفته بعد»)',
      argsHint: '{"title":"عنوان","priority":"LOW|MEDIUM|HIGH|URGENT","description":"توضیح"}',
      run: async (args) => {
        const title = String(args.title ?? '').trim()
        if (!title) return { error: 'عنوان الزامی است' }
        const task = await db.task.create({
          data: {
            branchId: ctx.branchId,
            title,
            description: args.description ? String(args.description) : `دستور ${ctx.doctorName} — ثبت‌شده توسط دستیار پزشک`,
            assigneeRole: 'RECEPTIONIST',
            dueAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
            priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(String(args.priority)) ? String(args.priority) : 'MEDIUM',
            status: 'OPEN',
            source: 'DOCTOR',
          },
        })
        return { ok: true, taskId: task.id, message: 'وظیفه به کارتابل پذیرش ثبت شد' }
      },
    },
  ]
}

/** نکات ایمنی بیمار — حساسیت، بارداری، بیماری زمینه‌ای */
async function patientSafety(patientId: string) {
  const patient = await db.patient.findUnique({
    where: { id: patientId },
    include: {
      medicalRecords: { orderBy: { date: 'desc' }, take: 12, include: { doctor: { select: { name: true } } } },
      appointments: { orderBy: { start: 'desc' }, take: 5, select: { start: true, status: true, service: { select: { name: true } } } },
    },
  })
  if (!patient) return null
  const warnings: string[] = []
  if (patient.allergies) warnings.push(`حساسیت دارویی: ${patient.allergies}`)
  if (patient.isPregnant) warnings.push('باردار — تداخل دارویی و رادیوگرافی بررسی شود')
  if (patient.chronicNote) warnings.push(`بیماری زمینه‌ای: ${patient.chronicNote}`)
  return {
    patient: `${patient.firstName} ${patient.lastName}`,
    phone: patient.phone,
    birthYear: patient.birthYear,
    warnings,
    incompleteTreatment: patient.incompleteTreatment,
    records: patient.medicalRecords.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      type: r.type === 'VISIT' ? 'ویزیت' : r.type === 'TEST' ? 'آزمایش' : r.type === 'IMAGING' ? 'تصویربرداری' : r.type === 'ALLERGY' ? 'حساسیت' : 'یادداشت',
      title: r.title,
      content: r.content.slice(0, 300),
      doctor: r.doctor?.name ?? null,
    })),
    lastVisits: patient.appointments.map((a) => ({ date: a.start.toISOString().slice(0, 10), service: a.service.name, status: a.status })),
  }
}

const TOOL_TITLES: Record<string, string> = {
  today_schedule: 'برنامه امروز',
  patient_file: 'باز کردن پرونده بیمار',
  add_record: 'ثبت سند بالینی',
  create_task: 'تبدیل به وظیفه پذیرش',
}

const SYSTEM = `شما «10on» هستید؛ دستیار پزشک هوشمند. کاربر شما پزشک معالج است.
- خلاصه‌ی پرونده را کوتاه و بالینی بدهید؛ هشدارهای ایمنی (حساسیت، بارداری) را همیشه اول و برجسته بگویید.
- تشخیص قطعی نمی‌دهید و دارو تجویز نمی‌کنید؛ فقط یادآوری و خلاصه.
- برای ثبت هر سند یا وظیفه از ابزار استفاده کنید و نتیجه را اعلام کنید.
- پاسخ نهایی کوتاه، منظم و فارسی باشد.`

export async function POST(request: Request) {
  const user = await requireRole('DOCTOR')
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

  const ctx = {
    doctorId: user.doctorId ?? '',
    doctorName: user.doctorName ?? 'پزشک',
    branchId: user.branchId,
    userId: user.id,
  }

  const dna = await getClinicDNA()
  const started = Date.now()
  const turn = await runToolAgent({
    system: SYSTEM + dna.text,
    tools: buildTools(ctx),
    history,
    userMessage: message,
    toolTitles: TOOL_TITLES,
    maxSteps: 5,
    fallback: async (msg) => ({
      answer: `دستیار در حالت آفلاین است. برنامه امروز و پرونده بیماران را از تابلوی خود ببینید؛ برای ثبت سند بالینی از فرم «پرونده» استفاده کنید. پیام شما: «${msg.slice(0, 60)}»`,
    }),
  })
  await logAiCall({ role: 'DOCTOR', agent: 'DOCTOR', ok: true, aiUsed: turn.aiUsed, latencyMs: Date.now() - started })

  return NextResponse.json({
    answer: turn.answer,
    steps: turn.steps.map((s) => ({ title: s.title, ok: s.ok, result: s.result })),
    aiUsed: turn.aiUsed,
  })
}
