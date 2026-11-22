import { NextResponse } from 'next/server'
import { tenantHandler, platformHandler } from '@/lib/tenant'
import { db } from '@/lib/db'
import { utcDayStart } from '@/lib/jalali'
import { llmChat, logAiCall } from '@/lib/ai'
import { getClinicDNA } from '@/lib/clinic-dna'
import { formatTomanFull } from '@/lib/format'

/** تحویل شیفت — خلاصه‌ی خودکار وضعیت امروز برای منشای شیفت بعد */
export const GET = tenantHandler()(async (session, _request) => {
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const started = Date.now()

  const dayStart = utcDayStart(new Date())
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000)

  const [todayAppts, openTasks, unreadMsgs, waitlistCount, paymentsToday] = await Promise.all([
    db.appointment.findMany({
      where: { start: { gte: dayStart, lt: dayEnd } },
      include: { patient: { select: { firstName: true, lastName: true } }, doctor: { select: { name: true } }, service: { select: { name: true } } },
      orderBy: { start: 'asc' },
    }),
    db.task.findMany({
      where: { status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] } },
      include: { patient: { select: { firstName: true, lastName: true } } },
      orderBy: { dueAt: 'asc' },
      take: 12,
    }),
    db.message.findMany({ where: { direction: 'IN', readAt: null }, include: { patient: { select: { firstName: true, lastName: true } } }, take: 8 }),
    db.waitlist.count({ where: { status: { in: ['WAITING', 'OFFERED'] } } }),
    db.payment.findMany({ where: { date: { gte: dayStart, lt: dayEnd } } }),
  ])

  const done = todayAppts.filter((a) => a.status === 'DONE')
  const upcoming = todayAppts.filter((a) => a.status === 'CONFIRMED' || a.status === 'PENDING')
  const cancelled = todayAppts.filter((a) => a.status === 'CANCELLED' || a.status === 'NO_SHOW')
  const cashIn = paymentsToday.filter((p) => p.direction === 'IN').reduce((s, p) => s + p.amount, 0)
  const cashOut = paymentsToday.filter((p) => p.direction === 'OUT').reduce((s, p) => s + p.amount, 0)

  const facts = {
    today: { total: todayAppts.length, done: done.length, upcoming: upcoming.length, cancelled: cancelled.length },
    upcomingList: upcoming.map((a) => `${a.start.toISOString().slice(11, 16)} — ${a.patient.firstName} ${a.patient.lastName} · ${a.service.name} · ${a.doctor.name}`),
    openTasks: openTasks.map((t) => `${t.title}${t.patient ? ` (${t.patient.firstName} ${t.patient.lastName})` : ''} — تا ${t.dueAt.toISOString().slice(0, 10)}`),
    unreadMsgs: unreadMsgs.map((m) => `${m.patient.firstName} ${m.patient.lastName}: ${m.body.slice(0, 60)}`),
    waitlistCount,
    cash: { in: cashIn, out: cashOut },
  }

  const dna = await getClinicDNA()
  const summary = await llmChat([
    {
      role: 'system',
      content: `${dna.text}

# نقش تو
دستیار تحویل شیفت هستی. متن خلاصه‌ی تحویل شیفت برای منشای شیفت بعد می‌نویسی — حرفه‌ای، شفاف و کاربردی.
فرمت: ۳ بخش کوتاه با تیتر ساده فارسی: «جمع‌بندی امروز»، «کارهای ناتمام و پیگیری»، «نکات مهم برای شیفت بعد».
عدد و مبلغ را فقط از داده‌ها بردار.`,
    },
    { role: 'user', content: `داده‌های واقعی امروز:\n${JSON.stringify(facts, null, 1)}` },
  ])

  await logAiCall({ role: session.role, agent: 'HANDOFF', ok: Boolean(summary), aiUsed: Boolean(summary), latencyMs: Date.now() - started })

  const fallback = [
    'جمع‌بندی امروز:',
    `${done.length} ویزیت انجام شد، ${upcoming.length} نوبت پیش‌رو مانده، ${cancelled.length} لغو/عدم حضور.`,
    `ورودی صندوق امروز: ${formatTomanFull(cashIn)} — خروجی: ${formatTomanFull(cashOut)}`,
    '',
    'کارهای ناتمام:',
    ...(openTasks.length ? openTasks.slice(0, 6).map((t) => `• ${t.title}${t.patient ? ` — ${t.patient.firstName} ${t.patient.lastName}` : ''}`) : ['• موردی نیست']),
    '',
    `پیام خوانده‌نشده: ${unreadMsgs.length} · صف انتظار: ${waitlistCount} نفر`,
  ].join('\n')

  return NextResponse.json({
    summary: (summary && summary.trim()) || fallback,
    aiUsed: Boolean(summary),
    facts: { today: facts.today, cash: facts.cash, openTasks: openTasks.length, unread: unreadMsgs.length, waitlist: waitlistCount },
  })
})
