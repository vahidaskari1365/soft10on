import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { runToolAgent, type AgentTool, type AgentStep } from '@/lib/agents'
import { requireRole } from '@/lib/auth'
import { jMonthKey, monthKeyStart, monthKeyEnd, formatJDate, formatTime, formatDayRelative, weekdayName, faDigits } from '@/lib/jalali'
import { formatToman } from '@/lib/format'

export const maxDuration = 60

type TurnMessage = { role: 'user' | 'assistant'; content: string }

function monthBounds() {
  const key = jMonthKey(new Date())
  return { start: monthKeyStart(key), end: monthKeyEnd(key), key }
}

async function branchStats() {
  const { start, end } = monthBounds()
  const branches = await db.branch.findMany({ include: { doctors: true } })
  const out = []
  for (const b of branches) {
    const [appts, doneThisMonth, last30] = await Promise.all([
      db.appointment.count({ where: { branchId: b.id, start: { gte: start, lt: end } } }),
      db.appointment.findMany({ where: { branchId: b.id, start: { gte: start, lt: end }, status: 'DONE' }, select: { price: true } }),
      db.appointment.findMany({
        where: { branchId: b.id, start: { gte: new Date(Date.now() - 30 * 86400000), lt: new Date() }, status: { in: ['DONE', 'NO_SHOW', 'CANCELLED'] } },
        select: { status: true },
      }),
    ])
    const revenue = doneThisMonth.reduce((s, a) => s + a.price, 0)
    const noShow = last30.filter((a) => a.status === 'NO_SHOW').length
    out.push({
      branch: b.name,
      city: b.city,
      activeDoctors: b.doctors.filter((d) => d.active).length,
      appointmentsThisMonth: appts,
      revenueThisMonth: revenue,
      revenueFa: formatToman(revenue),
      noShowRate30d: last30.length ? Math.round((noShow / last30.length) * 1000) / 10 : 0,
    })
  }
  return out
}

const tools: AgentTool[] = [
  {
    name: 'branch_stats',
    description: 'آمار ماه جاری همه‌ی شعب: تعداد نوبت، درآمد، نرخ عدم حضور و تعداد پزشک فعال',
    argsHint: '{}',
    run: branchStats,
  },
  {
    name: 'pnl_this_month',
    description: 'سود و زیان ماه جاری (درآمد خدمات، فروش کالا، کارانه پزشکان، هزینه‌ها، سود خالص)',
    argsHint: '{"branchName":"اختیاری: نام شعبه"}',
    run: async (args) => {
      const { start, end } = monthBounds()
      let branchId: string | undefined
      if (typeof args.branchName === 'string' && args.branchName.trim()) {
        const b = await db.branch.findFirst({ where: { name: { contains: args.branchName.trim() } } })
        branchId = b?.id
      }
      const br = branchId ? { branchId } : {}
      const [doneAppts, sales, expenses] = await Promise.all([
        db.appointment.findMany({ where: { start: { gte: start, lt: end }, status: 'DONE', ...br }, select: { price: true, doctor: { select: { commissionRate: true } } } }),
        db.productSale.findMany({ where: { date: { gte: start, lt: end }, ...br }, select: { total: true, qty: true, product: { select: { purchasePrice: true } } } }),
        db.expense.findMany({ where: { date: { gte: start, lt: end }, ...br }, select: { amount: true } }),
      ])
      const revenueServices = doneAppts.reduce((s, a) => s + a.price, 0)
      const revenueProducts = sales.reduce((s, x) => s + x.total, 0)
      const cogs = sales.reduce((s, x) => s + x.qty * x.product.purchasePrice, 0)
      const commission = doneAppts.reduce((s, a) => s + a.price * a.doctor.commissionRate, 0)
      const opExpenses = expenses.reduce((s, e) => s + e.amount, 0)
      const revenue = revenueServices + revenueProducts
      const net = revenue - opExpenses - commission - cogs
      return {
        scope: branchId ? 'شعبه انتخابی' : 'همه‌ی شعب',
        revenueServicesFa: formatToman(revenueServices),
        revenueProductsFa: formatToman(revenueProducts),
        commissionFa: formatToman(commission),
        operationalExpensesFa: formatToman(opExpenses),
        cogsFa: formatToman(cogs),
        netProfitFa: formatToman(net),
        marginPercent: revenue > 0 ? Math.round((net / revenue) * 1000) / 10 : 0,
        doneAppointments: doneAppts.length,
      }
    },
  },
  {
    name: 'top_services',
    description: 'پرفروش‌ترین خدمات ماه جاری بر اساس درآمد',
    argsHint: '{}',
    run: async () => {
      const { start, end } = monthBounds()
      const appts = await db.appointment.findMany({
        where: { start: { gte: start, lt: end }, status: 'DONE' },
        select: { price: true, service: { select: { name: true } } },
      })
      const m = new Map<string, number>()
      for (const a of appts) m.set(a.service.name, (m.get(a.service.name) ?? 0) + a.price)
      const rows = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([name, value]) => ({ service: name, revenueFa: formatToman(value) }))
      return rows
    },
  },
  {
    name: 'doctor_workload',
    description: 'کارنامه پزشکان در ماه جاری: تعداد نوبت انجام‌شده، درآمد و کارانه',
    argsHint: '{}',
    run: async () => {
      const { start, end } = monthBounds()
      const appts = await db.appointment.findMany({
        where: { start: { gte: start, lt: end }, status: 'DONE' },
        select: { price: true, doctor: { select: { name: true, commissionRate: true, branch: { select: { name: true } } } } },
      })
      const m = new Map<string, { doctor: string; branch: string; count: number; revenue: number; commission: number }>()
      for (const a of appts) {
        const cur = m.get(a.doctor.name) ?? { doctor: a.doctor.name, branch: a.doctor.branch?.name ?? '—', count: 0, revenue: 0, commission: 0 }
        cur.count += 1
        cur.revenue += a.price
        cur.commission += a.price * a.doctor.commissionRate
        m.set(a.doctor.name, cur)
      }
      return [...m.values()].map((r) => ({ ...r, revenueFa: formatToman(r.revenue), commissionFa: formatToman(r.commission) }))
    },
  },
  {
    name: 'low_stock',
    description: 'اقلام انبار که موجودی آن‌ها به حد هشدار رسیده',
    argsHint: '{}',
    run: async () => {
      const products = await db.product.findMany({ where: { stockQty: { lte: 6 } }, include: { branch: true } })
      return products.map((p) => ({
        product: p.name,
        branch: p.branch?.name ?? '—',
        stock: faDigits(p.stockQty),
        minStock: faDigits(p.minStock),
      }))
    },
  },
  {
    name: 'task_summary',
    description: 'خلاصه‌ی کارتابل عملیات: تعداد کارهای باز، در جریان، متوقف و عقب‌افتاده',
    argsHint: '{}',
    run: async () => {
      const now = new Date()
      const [open, inProgress, blocked, overdue] = await Promise.all([
        db.task.count({ where: { status: 'OPEN' } }),
        db.task.count({ where: { status: 'IN_PROGRESS' } }),
        db.task.count({ where: { status: 'BLOCKED' } }),
        db.task.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] }, dueAt: { lt: now } } }),
      ])
      return { open: faDigits(open), inProgress: faDigits(inProgress), blocked: faDigits(blocked), overdue: faDigits(overdue) }
    },
  },
  {
    name: 'search_patient',
    description: 'جست‌وجوی بیمار با نام یا شماره موبایل + خلاصه پرونده',
    argsHint: '{"query":"نام یا شماره"}',
    run: async (args) => {
      const q = String(args.query ?? '').trim()
      if (!q) return { error: 'عبارت جست‌وجو خالی است' }
      const tokens = q.split(/\s+/).filter(Boolean).slice(0, 4)
      const patients = await db.patient.findMany({
        where: { AND: tokens.map((t) => ({ OR: [{ firstName: { contains: t } }, { lastName: { contains: t } }, { phone: { contains: t } }] })) },
        take: 5,
        include: { appointments: { orderBy: { start: 'desc' }, take: 3, select: { start: true, status: true, service: { select: { name: true } } } } },
      })
      return patients.map((p) => ({
        patient: `${p.firstName} ${p.lastName}`,
        phone: p.phone,
        lastVisits: p.appointments.map((a) => `${formatDayRelative(a.start)} — ${a.service.name} (${a.status === 'DONE' ? 'انجام‌شده' : a.status === 'NO_SHOW' ? 'عدم حضور' : a.status === 'CANCELLED' ? 'لغوشده' : 'در انتظار'})`),
        incompleteTreatment: p.incompleteTreatment,
      }))
    },
  },
  {
    name: 'create_task',
    description: 'ثبت کار جدید در کارتابل پذیرش (مثلاً پیگیری تماس)',
    argsHint: '{"title":"عنوان","priority":"LOW|MEDIUM|HIGH|URGENT","description":"توضیح"}',
    run: async (args) => {
      const title = String(args.title ?? '').trim()
      if (!title) return { error: 'عنوان کار الزامی است' }
      const task = await db.task.create({
        data: {
          title,
          description: args.description ? String(args.description) : 'ایجادشده توسط دستیار مدیریتی 10on',
          assigneeRole: 'RECEPTIONIST',
          assigneeName: 'سمیرا (منشی)',
          dueAt: new Date(Date.now() + 24 * 3600 * 1000),
          priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(String(args.priority)) ? String(args.priority) : 'MEDIUM',
          status: 'OPEN',
          source: 'ASSISTANT',
        },
      })
      return { ok: true, taskId: task.id, message: 'کار به کارتابل پذیرش اضافه شد' }
    },
  },
]

const TOOL_TITLES: Record<string, string> = {
  branch_stats: 'گرفتن آمار شعب',
  pnl_this_month: 'محاسبه سود و زیان ماه',
  top_services: 'پرفروش‌ترین خدمات',
  doctor_workload: 'کارنامه پزشکان',
  low_stock: 'بررسی هشدار انبار',
  task_summary: 'خلاصه کارتابل',
  search_patient: 'جست‌وجوی بیمار',
  create_task: 'ثبت کار در کارتابل',
}

const SYSTEM = `شما «10on» هستید؛ دستیار مدیریتی هوشمند مجموعه‌ی کلینیک دندان‌پزشکی «لبخند مهر» (۳ شعبه: مرکزی سعادت‌آباد، ولیعصر و کرج مهرشهر).
کاربر شما «مدیر کل» مجموعه است. وظیفه‌تان تحلیل داده‌های عملیاتی و مالی کلینیک و پیشنهاد اقدام است.
همیشه برای اعداد از ابزارها استفاده کنید و اعداد را دقیقاً همان‌طور که ابزار داده (قالب فارسی) نقل کنید.
در پایان پاسخ‌های تحلیلی، یک «پیشنهاد اقدام» کوتاه هم بدهید. پاسخ‌ها مختصر، منظم و با بولت باشند.`

/** fallback قانون‌محور وقتی هوش مصنوعی قطع است */
async function fallback(userMessage: string): Promise<{ answer: string; steps: AgentStep[] }> {
  const t = userMessage.trim()
  const steps: AgentStep[] = []
  const has = (...k: string[]) => k.some((x) => t.includes(x))
  if (has('شعبه', 'مقایسه')) {
    const stats = await branchStats()
    steps.push({ tool: 'branch_stats', title: 'گرفتن آمار شعب', args: {}, result: stats, ok: true })
    const lines = stats.map((s) => `• ${s.branch}: ${faDigits(s.appointmentsThisMonth)} نوبت — درآمد ${s.revenueFa}`).join('\n')
    return { answer: `آمار ماه جاری شعب:\n${lines}\n\n(حالت آفلاین دستیار — برای تحلیل کامل، اتصال هوش مصنوعی لازم است)`, steps }
  }
  const { start, end, key } = monthBounds()
  const [done, sales, expenses] = await Promise.all([
    db.appointment.findMany({ where: { start: { gte: start, lt: end }, status: 'DONE' }, select: { price: true } }),
    db.productSale.findMany({ where: { date: { gte: start, lt: end } }, select: { total: true } }),
    db.expense.findMany({ where: { date: { gte: start, lt: end } }, select: { amount: true } }),
  ])
  const revenue = done.reduce((s, a) => s + a.price, 0) + sales.reduce((s, x) => s + x.total, 0)
  const exp = expenses.reduce((s, e) => s + e.amount, 0)
  return {
    answer: `خلاصه‌ی ماه جاری (${formatJDate(new Date())}):\n• درآمد: ${formatToman(revenue)}\n• هزینه‌ها: ${formatToman(exp)}\n• سود تقریبی: ${formatToman(revenue - exp)}\n\n(حالت آفلاین دستیار مدیریتی — کلید ماه: ${key})`,
    steps,
  }
}

export async function POST(request: Request) {
  const user = await requireRole('ADMIN')
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
    maxSteps: 4,
  })

  return NextResponse.json({
    answer: turn.answer,
    steps: turn.steps.map((s) => ({ title: s.title, ok: s.ok, result: s.result })),
    aiUsed: turn.aiUsed,
  })
}
