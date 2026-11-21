import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { faDigits, formatJDate, formatTime, formatDayRelative, weekdayName } from '@/lib/jalali'
import { formatToman } from '@/lib/format'
import { llmChat, extractJSON } from '@/lib/ai'
import { doctorHasConflict } from '@/lib/scheduling'
import { rateLimit } from '@/lib/ratelimit'
import { getSessionUser } from '@/lib/auth'

export const maxDuration = 60

type Chip = { label: string; payload: { action: string; [k: string]: unknown } }
type TraceStep = { key: string; label: string; state: 'done' | 'active' | 'pending' }
type BotMessage = { text: string; kind?: 'info' | 'success' | 'warn' }

const FULL_TRACE: TraceStep[] = [
  { key: 'understand', label: 'دریافت و درک پیام بیمار', state: 'active' },
  { key: 'identify', label: 'شناسایی بیمار در سیستم', state: 'pending' },
  { key: 'calendar', label: 'بررسی تقویم و ظرفیت پزشکان', state: 'pending' },
  { key: 'book', label: 'ثبت نوبت در سیستم', state: 'pending' },
  { key: 'cartable', label: 'ثبت در کارتابل منشی + یادآوری', state: 'pending' },
]

function workingDays(count = 5): Date[] {
  const out: Date[] = []
  const now = new Date()
  let t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + 86400000
  while (out.length < count) {
    const dt = new Date(t)
    if (dt.getUTCDay() !== 5) out.push(new Date(t))
    t += 86400000
  }
  return out
}

async function freeSlots(doctorId: string | null, serviceId: string, maxDays = 4, perDay = 3) {
  const svc = await db.service.findUnique({ where: { id: serviceId } })
  if (!svc) return { days: [], doctor: null }
  let doctorIdFinal = doctorId
  if (!doctorIdFinal) {
    const doctors = await db.doctor.findMany({ where: { active: true } })
    const preferred =
      svc.category === 'جراحی' ? doctors.find((x) => x.name.includes('امیر'))
      : svc.category === 'زیبایی' ? doctors.find((x) => x.name.includes('سارا'))
      : doctors.find((x) => x.name.includes('نگین'))
    doctorIdFinal = (preferred ?? doctors[0]).id
  }
  const doctor = await db.doctor.findUnique({ where: { id: doctorIdFinal } })
  const now = new Date()
  const days = workingDays(maxDays)
  const result: { dayLabel: string; dateISO: string; slots: { label: string; iso: string }[] }[] = []
  for (const day of days) {
    const dayMs = day.getTime()
    const ds = new Date(dayMs)
    const de = new Date(dayMs + 86400000)
    const taken = await db.appointment.findMany({
      where: { doctorId: doctorIdFinal, start: { gte: ds, lt: de }, status: { in: ['PENDING', 'CONFIRMED', 'DONE'] } },
      select: { start: true, service: { select: { durationMin: true } } },
    })
    const busy = taken.map((t) => ({
      s: t.start.getTime(),
      e: t.start.getTime() + Math.max(t.service.durationMin, 30) * 60000,
    }))
    const slots: { label: string; iso: string }[] = []
    for (let h = 9; h <= 18 && slots.length < perDay; h++) {
      for (const m of [0, 30]) {
        const cand = new Date(dayMs + h * 3600000 + m * 60000)
        if (cand.getTime() < now.getTime() + 60 * 60000) continue
        const cs = cand.getTime()
        const ce = cs + svc.durationMin * 60000
        if (busy.some((b) => cs < b.e && ce > b.s)) continue
        slots.push({ label: formatTime(cand), iso: cand.toISOString() })
      }
    }
    if (slots.length) {
      result.push({
        dayLabel: `${formatDayRelative(day)} — ${weekdayName(day)} ${formatJDate(day, false)}`,
        dateISO: ds.toISOString(),
        slots,
      })
    }
  }
  return { days: result, doctor }
}

function detectIntent(text: string): string {
  const t = text.trim()
  if (/(نوبت|وقت|ساعت خالی|رزرو|ویزیت)/.test(t)) return 'booking'
  if (/(قیمت|تعرفه|هزینه|چند|تومان)/.test(t)) return 'prices'
  if (/(آدرس|کجا|موقعیت|پارک|شعبه)/.test(t)) return 'address'
  if (/(ساعت کار|باز|تعطیل|چند شنبه)/.test(t)) return 'hours'
  if (/(سلام|درود|خسته|وقت بخیر)/.test(t)) return 'greet'
  if (/(ممنون|سپاس|مرسی|خداحافظ|بای)/.test(t)) return 'thanks'
  return 'unknown'
}

// ---------- LLM: فکت‌های کلینیک + درک پیام آزاد ----------
const faHour = (h: number) => faDigits(String(h))

async function clinicFacts() {
  const [branches, services] = await Promise.all([
    db.branch.findMany({ where: { isActive: true } }),
    db.service.findMany({ orderBy: { price: 'asc' } }),
  ])
  return {
    branches: branches.map((b) => ({
      name: b.name,
      city: b.city,
      address: b.address,
      phone: b.phone,
      hours: `${faHour(b.openHour)} تا ${faHour(b.closeHour)}`,
      thuHours: `${faHour(b.openHour)} تا ${faHour(b.thuCloseHour ?? 13)}`,
    })),
    services: services.map((s) => `${s.name}: ${formatToman(s.price)}`),
  }
}

async function llmIntent(
  text: string,
  facts: Awaited<ReturnType<typeof clinicFacts>>,
): Promise<{ intent: string; reply?: string } | null> {
  try {
    const raw = await llmChat([
      {
        role: 'assistant',
        content: `شما «شینا» هستید؛ دستیار بیمار کلینیک دندان‌پزشکی «لبخند مهر» با ۳ شعبه. فقط با اطلاعات زیر پاسخ بدهید؛ اطلاعات از خودتان نسازید.

# اطلاعات کلینیک
شعب:
${facts.branches.map((b) => `- ${b.name} (${b.city}) — ${b.address} — ${b.phone} — ساعات: شنبه تا چهارشنبه ${b.hours}، پنجشنبه ${b.thuHours}، جمعه تعطیل`).join('\n')}

خدمات و تعرفه‌ها:
${facts.services.join(' | ')}

# وظیفه
پیام بیمار را تحلیل کنید و فقط این JSON را برگردانید:
{"intent":"greet|booking|prices|address|hours|thanks|free","reply":"..."}

- اگر پیام درباره‌ی نوبت/رزرو است → intent=booking و reply خالی
- اگر درباره تعرفه است → prices، آدرس/شعبه → address، ساعت کار → hours، سلام → greet، تشکر → thanks
- برای سوال آزاد دیگر (مثلاً «درد دندان چیکار کنم؟» یا «بیمه می‌پذیرید؟») → intent=free و پاسخ کامل فارسی محترمانه در reply بر اساس اطلاعات بالا بنویسید. برای سوال پزشکی، توصیه عمومی بدهید و تشویق به مراجعه کنید؛ تشخیص قطعی ندهید.`,
      },
      { role: 'user', content: text },
    ])
    if (!raw) return null
    const parsed = extractJSON<{ intent?: string; reply?: string }>(raw)
    if (!parsed?.intent) return null
    return { intent: parsed.intent, reply: parsed.reply }
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const session = await getSessionUser()
  const rl = rateLimit(`ai:{session.id}`, 20, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'درخواست‌های زیادی ارسال شده؛ کمی بعد تلاش کنید' }, { status: 429 })
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  const body = await request.json()
  const action = body.action as 'text' | 'slots' | 'book' | 'prices' | 'services' | 'greet' | 'choose_service'
  const text = body.text as string | undefined
  // ادغام فیلدهای سطح payload با context (چیپ‌ها مقادیر را در سطح payload می‌فرستند)
  const ctx: {
    name?: string
    phone?: string
    serviceId?: string
    doctorId?: string
    start?: string
    patientId?: string
  } = {
    ...(body.ctx ?? {}),
    serviceId: body.serviceId ?? body.ctx?.serviceId,
    doctorId: body.doctorId ?? body.ctx?.doctorId,
    start: body.start ?? body.ctx?.start,
    name: body.name ?? body.ctx?.name,
    phone: body.phone ?? body.ctx?.phone,
    patientId: body.patientId ?? body.ctx?.patientId,
  }

  // ---------- greeting / entry ----------
  if (action === 'greet' || (action === 'text' && detectIntent(text ?? '') === 'greet')) {
    return NextResponse.json({
      messages: [
        { text: 'سلام! 👋 من شینا هستم، دستیار بیمارِ کلینیک دندان‌پزشکی لبخند مهر.' },
        { text: 'هر سوالی داشته باشید شبانه‌روز پاسخ می‌دهم؛ می‌توانم همین‌جا برایتان نوبت ثبت کنم.' },
      ] as BotMessage[],
      chips: [
        { label: '🗓 نوبت می‌خوام', payload: { action: 'services' } },
        { label: '💰 تعرفه‌ی خدمات', payload: { action: 'prices' } },
        { label: '📍 آدرس و ساعت کاری', payload: { action: 'text', text: 'آدرس کلینیک کجاست؟' } },
      ] as Chip[],
      trace: FULL_TRACE.map((s, i) => ({ ...s, state: i === 0 ? 'done' : 'pending' })),
      ctx,
    })
  }

  // ---------- services list ----------
  if (action === 'services') {
    const services = await db.service.findMany({ orderBy: { price: 'asc' }, take: 8 })
    return NextResponse.json({
      messages: [{ text: 'بفرمایید، برای کدام خدمت نوبت می‌خواهید؟' }] as BotMessage[],
      chips: services.map((s) => ({
        label: `${s.name} (${formatToman(s.price)})`,
        payload: { action: 'choose_service', serviceId: s.id },
      })) as Chip[],
      trace: FULL_TRACE.map((s, i) => ({ ...s, state: i === 0 ? 'done' : 'pending' })),
      ctx,
    })
  }

  if (action === 'choose_service') {
    const serviceId = ctx.serviceId
    const svc = serviceId ? await db.service.findUnique({ where: { id: serviceId } }) : null
    if (!svc) return NextResponse.json({ error: 'خدمت یافت نشد' }, { status: 400 })
    return NextResponse.json({
      messages: [{ text: `عالی. برای «${svc.name}» (${formatToman(svc.price)}) چه زمانی مناسب شماست؟` }] as BotMessage[],
      chips: [
        { label: '🔎 زمان‌های خالی را نشان بده', payload: { action: 'slots' } },
      ] as Chip[],
      trace: FULL_TRACE.map((s, i) => ({ ...s, state: i <= 0 ? 'done' : 'pending' })),
      ctx,
    })
  }

  // ---------- free slots ----------
  if (action === 'slots') {
    if (!ctx.serviceId) {
      const services = await db.service.findMany({ orderBy: { price: 'asc' }, take: 6 })
      return NextResponse.json({
        messages: [{ text: 'اول بگویید برای کدام خدمت؟' }] as BotMessage[],
        chips: services.map((s) => ({ label: s.name, payload: { action: 'choose_service', serviceId: s.id } })) as Chip[],
        trace: FULL_TRACE,
        ctx,
      })
    }
    const { days, doctor } = await freeSlots(ctx.doctorId ?? null, ctx.serviceId)
    const chips: Chip[] = []
    for (const day of days) for (const s of day.slots) {
      chips.push({ label: `${day.dayLabel.split(' — ')[0]} ${s.label}`, payload: { action: 'book', start: s.iso } })
    }
    return NextResponse.json({
      messages: [
        { text: `ظرفیت‌های آزادِ ${doctor ? doctor.name : 'پزشک'} را بررسی کردم. این زمان‌ها خالی است:` },
      ] as BotMessage[],
      chips: chips.slice(0, 8) as Chip[],
      trace: FULL_TRACE.map((s) => ({
        ...s,
        state: s.key === 'understand' || s.key === 'calendar' ? 'done' : s.key === 'identify' ? 'active' : 'pending',
      })),
      ctx,
    })
  }

  // ---------- booking ----------
  if (action === 'book') {
    if (!ctx.serviceId || !ctx.start) return NextResponse.json({ error: 'اطلاعات ناقص' }, { status: 400 })
    const svc = await db.service.findUnique({ where: { id: ctx.serviceId } })
    if (!svc) return NextResponse.json({ error: 'خدمت یافت نشد' }, { status: 400 })

    const trace: TraceStep[] = FULL_TRACE.map((s) => ({ ...s, state: 'done' }))
    const messages: BotMessage[] = []
    const startDt = new Date(ctx.start)
    const summary = `${formatDayRelative(startDt)} ${weekdayName(startDt)} ${formatJDate(startDt)} ساعت ${formatTime(startDt)}`

    let patientId = ctx.patientId
    if (!patientId && ctx.phone) {
      const existing = await db.patient.findFirst({ where: { phone: ctx.phone } })
      if (existing) {
        patientId = existing.id
        messages.push({ text: `خوشحالم که دوباره مهمان ما هستید ${existing.firstName} عزیز 🌸 پرونده‌تان را پیدا کردم.`, kind: 'info' })
      }
    }
    if (!patientId && ctx.name && ctx.phone) {
      const created = await db.patient.create({
        data: { firstName: ctx.name.split(' ')[0], lastName: ctx.name.split(' ').slice(1).join(' ') || '—', phone: ctx.phone },
      })
      patientId = created.id
      messages.push({ text: 'پرونده‌ی جدید برای شما ساختم. ✅', kind: 'success' })
    }
    if (!patientId) {
      return NextResponse.json({
        messages: [{ text: 'برای ثبت نوبت، لطفاً نام و شماره‌ی موبایلتان را بفرمایید:' }] as BotMessage[],
        chips: [{ label: 'مینا کریمی — ۰۹۱۲۱۲۳۴۵۶۷', payload: { action: 'book', name: 'مینا کریمی', phone: '09121234567' } }] as Chip[],
        trace: FULL_TRACE.map((s) => ({ ...s, state: s.key === 'identify' ? 'active' : s.state })),
        ctx,
      })
    }

    const doctor = ctx.doctorId
      ? await db.doctor.findUnique({ where: { id: ctx.doctorId } })
      : (await freeSlots(null, ctx.serviceId)).doctor

    if (await doctorHasConflict(doctor!.id, startDt.getTime(), svc.durationMin)) {
      return NextResponse.json({
        bubbles: [{ text: 'این بازه تازه پر شده است. لطفاً بازه دیگری انتخاب کنید.', kind: 'warn' }] as BotMessage[],
        ctx,
      })
    }

    const appt = await db.appointment.create({
      data: {
        branchId: doctor!.branchId,
        patientId,
        doctorId: doctor!.id,
        serviceId: svc.id,
        start: startDt,
        status: 'PENDING',
        source: 'ASSISTANT',
        price: svc.price,
        note: 'ثبت‌شده توسط دستیار بیمار (شینا)',
      },
      include: { patient: true, doctor: true },
    })

    const task = await db.task.create({
      data: {
        branchId: doctor!.branchId,
        title: `تأیید نوبت دستیار — ${svc.name}`,
        description: `بیمار: ${appt.patient.firstName} ${appt.patient.lastName} · ${summary} · ثبت‌شده خودکار توسط دستیار بیمار`,
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

    messages.push({
      text: `✅ نوبت شما ثبت شد!\n\n🔹 خدمت: ${svc.name}\n🔹 پزشک: ${doctor!.name}\n🔹 زمان: ${summary}\n🔹 مبلغ: ${formatToman(svc.price)}`,
      kind: 'success',
    })
    messages.push({ text: 'پیام تأیید و یادآوری ۲۴ ساعت قبل به‌صورت خودکار برایتان ارسال می‌شود. نوبت برای تأیید نهایی به کارتابل پذیرش هم رفت.' })

    return NextResponse.json({
      messages,
      chips: [{ label: 'ممنون، عالی بود 🙏', payload: { action: 'text', text: 'ممنون' } }] as Chip[],
      trace,
      ctx: { ...ctx, patientId },
      result: { appointmentId: appt.id, taskId: task.id },
    })
  }

  // ---------- prices ----------
  if (action === 'prices' || (action === 'text' && detectIntent(text ?? '') === 'prices')) {
    const services = await db.service.findMany({ orderBy: { price: 'asc' }, take: 8 })
    const lines = services.map((s) => `• ${s.name}: ${formatToman(s.price)}`).join('\n')
    return NextResponse.json({
      messages: [{ text: `تعرفه‌ی خدمات ما:\n\n${lines}\n\nبرای نوبت‌گیری روی هر خدمت بگویید.` }] as BotMessage[],
      chips: [{ label: '🗓 همین حالا نوبت بگیر', payload: { action: 'services' } }] as Chip[],
      trace: FULL_TRACE.map((s, i) => ({ ...s, state: i === 0 ? 'done' : 'pending' })),
      ctx,
    })
  }

  if (action === 'text') {
    // ---------- درک هوشمند پیام با LLM (با fallback قانونی) ----------
    const facts = await clinicFacts()
    const llm = await llmIntent(text ?? '', facts)
    const intent = llm?.intent ?? detectIntent(text ?? '')

    if (llm?.intent === 'free' && llm.reply) {
      return NextResponse.json({
        messages: [{ text: llm.reply }] as BotMessage[],
        chips: [
          { label: '🗓 نوبت می‌خوام', payload: { action: 'services' } },
          { label: '💰 تعرفه‌ها', payload: { action: 'prices' } },
          { label: '📍 شعب و آدرس‌ها', payload: { action: 'text', text: 'آدرس شعب کجاست؟' } },
        ] as Chip[],
        trace: FULL_TRACE.map((s, i) => ({ ...s, state: i === 0 ? 'done' : 'pending' })),
        ctx,
      })
    }

    if (intent === 'address') {
      const branchLines = facts.branches.map((b) => `📍 ${b.name} — ${b.city}\n   ${b.address}\n   ☎️ ${b.phone} · ساعت کاری: ${b.hours}`).join('\n\n')
      return NextResponse.json({
        messages: [{ text: `سه شعبه‌ی فعال ما:\n\n${branchLines}\n\nهر سه شعبه جمعه‌ها تعطیل هستند. 🌸` }] as BotMessage[],
        chips: [
          { label: '🗓 نوبت می‌خوام', payload: { action: 'services' } },
          { label: '💰 تعرفه‌ی خدمات', payload: { action: 'prices' } },
        ] as Chip[],
        trace: FULL_TRACE.map((s, i) => ({ ...s, state: i === 0 ? 'done' : 'pending' })),
        ctx,
      })
    }
    if (intent === 'hours') {
      const hoursLines = facts.branches.map((b) => `🕐 ${b.name}: شنبه تا چهارشنبه ${b.hours} — پنجشنبه ${b.thuHours}`).join('\n')
      return NextResponse.json({
        messages: [{ text: `${hoursLines}\n\nجمعه‌ها در همه‌ی شعب تعطیل هستیم.` }] as BotMessage[],
        chips: [{ label: '🔎 زمان‌های خالی', payload: { action: 'services' } }] as Chip[],
        trace: FULL_TRACE.map((s, i) => ({ ...s, state: i === 0 ? 'done' : 'pending' })),
        ctx,
      })
    }
    if (intent === 'booking') return await handleFallbackToServices(ctx)
    if (intent === 'thanks') {
      return NextResponse.json({
        messages: [{ text: 'خواهش می‌کنم! هر زمان سوالی داشتید در خدمتم 🌸' }] as BotMessage[],
        chips: [{ label: 'سؤال دیگری دارم', payload: { action: 'greet' } }] as Chip[],
        trace: FULL_TRACE.map((s, i) => ({ ...s, state: i === 0 ? 'done' : 'pending' })),
        ctx,
      })
    }
    return NextResponse.json({
      messages: [{ text: 'من شینا هستم؛ در ثبت نوبت، تعرفه‌ها و اطلاعاتی مثل آدرس و ساعت کاری شعب کمکتان می‌کنم. کدام را می‌خواهید؟' }] as BotMessage[],
      chips: [
        { label: '🗓 نوبت می‌خوام', payload: { action: 'services' } },
        { label: '💰 تعرفه‌ها', payload: { action: 'prices' } },
        { label: '📍 شعب و آدرس‌ها', payload: { action: 'text', text: 'آدرس شعب کجاست؟' } },
      ] as Chip[],
      trace: FULL_TRACE.map((s, i) => ({ ...s, state: i === 0 ? 'done' : 'pending' })),
      ctx,
    })
  }

  async function handleFallbackToServices(ctx: Record<string, unknown>) {
    const services = await db.service.findMany({ orderBy: { price: 'asc' }, take: 6 })
    return NextResponse.json({
      messages: [{ text: 'برای کدام خدمت نوبت می‌خواهید؟' }] as BotMessage[],
      chips: services.map((s) => ({ label: s.name, payload: { action: 'choose_service', serviceId: s.id } })) as Chip[],
      trace: FULL_TRACE,
      ctx,
    })
  }

  return NextResponse.json({ error: 'اکشن نامشخص' }, { status: 400 })
}
