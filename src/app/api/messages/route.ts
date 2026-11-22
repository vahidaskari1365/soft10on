import { NextResponse } from 'next/server'
import { tenantHandler, platformHandler } from '@/lib/tenant'
import { db } from '@/lib/db'
import { llmChat, logAiCall } from '@/lib/ai'
import { getClinicDNA, getKnowledgeBase } from '@/lib/clinic-dna'

/** صندوق پیام‌ها — رشته‌های گفتگو با بیماران + تعداد خوانده‌نشده */
export const GET = tenantHandler()(async (session, request) => {

  const { searchParams } = new URL(request.url)
  const patientId = searchParams.get('patient')

  if (session.role === 'PATIENT') {
    // بیمار فقط گفتگوی خودش را می‌بیند
    const myId = session.patientId ?? ''
    const thread = await db.message.findMany({
      where: { patientId: myId },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })
    await db.message.updateMany({ where: { patientId: myId, direction: 'OUT', readAt: null }, data: { readAt: new Date() } })
    return NextResponse.json({
      thread: thread.map((m) => ({ id: m.id, direction: m.direction, body: m.body, aiGenerated: m.aiGenerated, createdAt: m.createdAt.toISOString() })),
    })
  }

  if (patientId) {
    const thread = await db.message.findMany({
      where: { patientId },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { patient: { select: { firstName: true, lastName: true, phone: true } } },
    })
    await db.message.updateMany({ where: { patientId, direction: 'IN', readAt: null }, data: { readAt: new Date() } })
    return NextResponse.json({
      thread: thread.map((m) => ({ id: m.id, direction: m.direction, body: m.body, aiGenerated: m.aiGenerated, createdAt: m.createdAt.toISOString() })),
    })
  }

  // لیست گفتگوها (بیماران دارای پیام) + unread
  const messages = await db.message.findMany({
    orderBy: { createdAt: 'desc' },
    take: 400,
    include: { patient: { select: { id: true, firstName: true, lastName: true, phone: true } } },
  })
  const threads = new Map<string, {
    patientId: string
    name: string
    phone: string
    last: string
    lastAt: string
    lastDirection: string
    unread: number
  }>()
  for (const m of messages) {
    const key = m.patientId
    const cur = threads.get(key)
    const unreadInc = m.direction === 'IN' && !m.readAt ? 1 : 0
    if (!cur) {
      threads.set(key, {
        patientId: m.patientId,
        name: `${m.patient.firstName} ${m.patient.lastName}`,
        phone: m.patient.phone,
        last: m.body,
        lastAt: m.createdAt.toISOString(),
        lastDirection: m.direction,
        unread: unreadInc,
      })
    } else {
      cur.unread += unreadInc
    }
  }
  return NextResponse.json({
    threads: [...threads.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1)),
    totalUnread: [...threads.values()].reduce((s, t) => s + t.unread, 0),
  })
})

/**
 * ارسال پیام
 * - منشی/پزشک/مدیر: { patientId, body } → OUT
 * - بیمار: { body } → IN + پاسخ خودکار هوشمند (فقط وقتی از سمت بیمار می‌آید)
 */
export const POST = tenantHandler()(async (session, request) => {
  const body = (await request.json().catch(() => ({}))) as { patientId?: string; body?: string }
  const text = body.body?.trim()
  if (!text) return NextResponse.json({ error: 'متن پیام خالی است' }, { status: 400 })

  if (session.role === 'PATIENT') {
    const myId = session.patientId
    if (!myId) return NextResponse.json({ error: 'پروفایل بیمار یافت نشد' }, { status: 400 })
    await db.message.create({ data: { branchId: session.branchId, patientId: myId, direction: 'IN', channel: 'CHAT', body: text } })

    // پاسخ خودکار هوشمند
    const started = Date.now()
    const [kb, dna, unread] = await Promise.all([
      getKnowledgeBase(),
      getClinicDNA(),
      db.message.findMany({ where: { patientId: myId, direction: 'OUT' }, orderBy: { createdAt: 'desc' }, take: 5 }),
    ])
    const patient = await db.patient.findUnique({ where: { id: myId }, select: { firstName: true, lastName: true, incompleteTreatment: true } })
    const upcoming = await db.appointment.findFirst({
      where: { patientId: myId, start: { gte: new Date() }, status: { in: ['PENDING', 'CONFIRMED'] } },
      orderBy: { start: 'asc' },
      include: { doctor: { select: { name: true } }, service: { select: { name: true } } },
    })

    const reply = await llmChat([
      {
        role: 'system',
        content: `${dna.text}
${kb}

# نقش تو
دستیار بیمار ${patient?.firstName ?? ''} هستی. کوتاه، گرم و دقیق جواب بده (حداکثر ۴ جمله).
اگر پرسش در پایگاه دانش بود، همان پاسخ را با لحن خودت بگو. تاریخ و ساعت نوبت را فقط از داده‌ی واقعی پایین بگو، نه حدس.
اگر موضوع اورژانسی بود (درد شدید، خونریزی، تورم شدید) بگو «همین الان با پذیرش تماس بگیرید» و شماره پذیرش را بده.`,
      },
      {
        role: 'user',
        content: `نوبت پیش‌رو: ${upcoming ? `${upcoming.service.name} با ${upcoming.doctor.name} — ${upcoming.start.toISOString().slice(0, 16).replace('T', ' ')}` : 'نوبت فعالی ندارد'}
پیام‌های قبلی کلینیک: ${unread.map((m) => m.body.slice(0, 60)).join(' / ') || 'نداریم'}
پیام جدید بیمار: ${text}`,
      },
    ])
    await logAiCall({ role: 'PATIENT', agent: 'AUTO_REPLY', ok: Boolean(reply), aiUsed: Boolean(reply), latencyMs: Date.now() - started })

    const fallback = `سلام! پیام شما دریافت شد. همکاران ما در پذیرش در ساعات کاری (۹ تا ۱۹) پاسخ می‌دهند. برای ثبت یا تغییر نوبت با پذیرش تماس بگیرید.`
    const answer = (reply && reply.trim()) || fallback
    const msg = await db.message.create({
      data: { branchId: session.branchId, patientId: myId, direction: 'OUT', channel: 'CHAT', body: answer, aiGenerated: Boolean(reply), fromUserId: null },
    })
    return NextResponse.json({ sent: true, reply: { id: msg.id, body: answer, aiGenerated: Boolean(reply), createdAt: msg.createdAt.toISOString() } }, { status: 201 })
  }

  // ارسال از سمت کلینیک
  if (!body.patientId) return NextResponse.json({ error: 'شناسه بیمار لازم است' }, { status: 400 })
  const msg = await db.message.create({
    data: {
      branchId: session.branchId,
      patientId: body.patientId,
      direction: 'OUT',
      channel: 'CHAT',
      body: text,
      fromUserId: session.id,
    },
  })
  return NextResponse.json({ sent: true, id: msg.id }, { status: 201 })
})
