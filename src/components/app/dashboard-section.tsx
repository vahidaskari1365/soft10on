'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatCard, SectionHeader, Pill, LoadingBlock, Avatar } from './bits'
import type { Appointment, MonthRow, TaskItem, TraceStep } from './types'
import { APPOINTMENT_STATUS, SOURCE_LABEL, TASK_PRIORITY } from '@/lib/format'
import { formatToman, millionsShort } from '@/lib/format'
import { formatJDate, formatTime, formatDayRelative, faDigits } from '@/lib/jalali'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import { TrendingUp, CalendarCheck, Wallet, AlertTriangle, Package, Clock, Bot, Inbox, CalendarDays, Users, Building2, UserCog, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const PIE_COLORS = ['#0284C7', '#B08D57', '#0D9488', '#EA580C', '#94A3B8', '#075985']

/** کاشی‌های میان‌بر داشبورد — کلیک روی هر آیکن، مستقیم به همان بخش می‌رود */
const QUICK: { key: string; label: string; icon: typeof CalendarDays; chip: string }[] = [
  { key: 'appointments', label: 'نوبت‌ها و تقویم', icon: CalendarDays, chip: 'bg-sky-50 text-sky-600' },
  { key: 'tasks', label: 'کارتابل عملیات', icon: Inbox, chip: 'bg-amber-50 text-amber-600' },
  { key: 'patients', label: 'بیماران (CRM)', icon: Users, chip: 'bg-teal-50 text-teal-600' },
  { key: 'finance', label: 'مالی و انبار', icon: Wallet, chip: 'bg-[#F6EFE3] text-[#8C6F3F]' },
  { key: 'branches', label: 'مدیریت شعب', icon: Building2, chip: 'bg-slate-100 text-slate-600' },
  { key: 'staff', label: 'پرسنل و دسترسی‌ها', icon: UserCog, chip: 'bg-cyan-50 text-cyan-600' },
  { key: 'agent', label: 'دستیار هوشمند', icon: Bot, chip: 'bg-linear-to-tl from-sky-500 to-teal-500 text-white' },
]

interface DashData {
  todayAppts: Appointment[]
  nextUp: Appointment[]
  series: MonthRow[]
  composition: { name: string; value: number }[]
  kpis: {
    todayCount: number
    pendingCount: number
    monthRevenue: number
    monthNetProfit: number
    revenueGrowth: number
    noShowRate: number
    openTasks: number
    overdueTasks: number
    lowStock: number
  }
}

export function DashboardSection({ onNavigate, quickKeys = [] }: { onNavigate: (key: string) => void; quickKeys?: string[] }) {
  const [data, setData] = useState<DashData | null>(null)
  const [tasks, setTasks] = useState<TaskItem[]>([])

  useEffect(() => {
    fetch('/api/dashboard').then((r) => r.json()).then(setData).catch(() => {})
    fetch('/api/tasks').then((r) => r.json()).then((d) => setTasks(d.tasks ?? [])).catch(() => {})
  }, [])

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-muted/60 animate-pulse" />
          ))}
        </div>
        <LoadingBlock rows={4} />
      </div>
    )
  }

  const { kpis, series, composition, todayAppts } = data
  const urgentTasks = tasks
    .filter((t) => t.status !== 'DONE')
    .sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1))
    .slice(0, 5)
  const doneToday = todayAppts.filter((a) => a.status === 'DONE').length

  return (
    <div className="space-y-5">
      <SectionHeader title="داشبورد مدیر" subtitle="تصویر لحظه‌ای از عملیات کلینیک — بدون پیگیری تکی‌تکی افراد">
        <Button size="sm" variant="outline" className="rounded-xl border-sky-200 text-sky-700 hover:bg-sky-50" onClick={() => onNavigate('agent')}>
          <Bot className="h-4 w-4 ml-1" /> دستیار هوشمند
        </Button>
      </SectionHeader>

      {/* کاشی‌های میان‌بر — کلیک روی آیکن = پرش به همان بخش */}
      {quickKeys.length > 0 ? (
        <div className="grid grid-cols-4 md:grid-cols-7 gap-2.5">
          {QUICK.filter((q) => quickKeys.includes(q.key)).map((q) => {
            const Icon = q.icon
            return (
              <button
                key={q.key}
                onClick={() => onNavigate(q.key)}
                aria-label={`رفتن به ${q.label}`}
                className="group flex flex-col items-center gap-2 rounded-2xl border bg-card px-2 py-3.5 card-hover outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <span className={cn('inline-flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110', q.chip)}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-[10.5px] font-medium text-foreground/80 leading-4 text-center">{q.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="درآمد این ماه"
          value={formatToman(kpis.monthRevenue)}
          hint={
            <span className="inline-flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {faDigits(kpis.revenueGrowth.toFixed(1))}٪ نسبت به ماه قبل
            </span>
          }
          tone="purple"
          icon={<Wallet className="h-5 w-5" />}
          onClick={() => onNavigate('finance')}
        />
        <StatCard
          title="سود خالص این ماه"
          value={formatToman(kpis.monthNetProfit)}
          hint="پس از کارانه، هزینه‌ها و بهای کالا"
          tone="gold"
          icon={<TrendingUp className="h-5 w-5" />}
          onClick={() => onNavigate('finance')}
        />
        <StatCard
          title="نوبت‌های امروز"
          value={`${faDigits(kpis.todayCount)} نوبت`}
          hint={`${faDigits(doneToday)} انجام‌شده · ${faDigits(kpis.pendingCount)} در انتظار تأیید`}
          icon={<CalendarCheck className="h-5 w-5" />}
          onClick={() => onNavigate('appointments')}
        />
        <StatCard
          title="کارهای نیازمند توجه"
          value={`${faDigits(kpis.openTasks)} کار باز`}
          hint={kpis.overdueTasks > 0 ? `${faDigits(kpis.overdueTasks)} کار سررسید گذشته!` : 'همه‌چیز سر وقت است'}
          tone={kpis.overdueTasks > 0 ? 'red' : 'green'}
          icon={<Inbox className="h-5 w-5" />}
          onClick={() => onNavigate('tasks')}
        />
      </div>

      {/* mini KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'نرخ عدم حضور (۳۰ روز)', value: `${faDigits(kpis.noShowRate.toFixed(0))}٪` },
          { label: 'نوبت‌های در انتظار تأیید', value: faDigits(kpis.pendingCount) },
          { label: 'اقلام زیر حد انبار', value: faDigits(kpis.lowStock) },
          { label: 'کارهای سررسید گذشته', value: faDigits(kpis.overdueTasks) },
        ].map((x) => (
          <div key={x.label} className="rounded-xl border bg-card px-4 py-3">
            <div className="text-[11px] text-muted-foreground">{x.label}</div>
            <div className="text-base font-bold mt-0.5">{x.value}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="rounded-2xl lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">درآمد، هزینه و سود خالص — ۱۲ ماه اخیر</CardTitle>
          </CardHeader>
          <CardContent>
            <div dir="ltr" className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ECECF0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: 'inherit' }} interval={0} angle={-35} textAnchor="end" height={50} />
                  <YAxis tickFormatter={millionsShort} tick={{ fontSize: 11 }} width={44} />
                  <Tooltip
                    formatter={(v: number, name: string) => [formatToman(v), name]}
                    contentStyle={{ fontFamily: 'inherit', borderRadius: 12, border: '1px solid #E6E8EC', direction: 'rtl' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'inherit' }} />
                  <Bar dataKey="revenue" name="درآمد" fill="#0284C7" radius={[6, 6, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="totalExpenses" name="هزینه‌ها" fill="#B08D57" radius={[6, 6, 0, 0]} maxBarSize={26} />
                  <Line type="monotone" dataKey="netProfit" name="سود خالص" stroke="#0D9488" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ترکیب درآمد این ماه</CardTitle>
          </CardHeader>
          <CardContent>
            <div dir="ltr" className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={composition} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={3}>
                    {composition.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, name: string) => [formatToman(v), name]}
                    contentStyle={{ fontFamily: 'inherit', borderRadius: 12, border: '1px solid #E6E8EC', direction: 'rtl' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 justify-center">
              {composition.slice(0, 6).map((c, i) => (
                <span key={c.name} className="inline-flex items-center gap-1.5 text-[11px]">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {c.name}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today + Tasks */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl min-w-0">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-base">امروز در کلینیک</CardTitle>
            <Button size="sm" variant="ghost" className="text-xs rounded-lg text-sky-700 hover:bg-sky-50" onClick={() => onNavigate('appointments')}>
              مشاهده تقویم
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[340px] overflow-y-auto scroll-thin">
            {todayAppts.length === 0 ? <div className="text-sm text-muted-foreground p-3">امروز نوبتی ثبت نشده است.</div> : null}
            {todayAppts.map((a) => {
              const st = APPOINTMENT_STATUS[a.status]
              return (
                <div key={a.id} className="flex items-center gap-3 rounded-xl border bg-background/60 px-3 py-2.5">
                  <div className="text-center w-12 shrink-0">
                    <div className="text-sm font-bold">{formatTime(new Date(a.start))}</div>
                    <div className="text-[10px] text-muted-foreground">{a.service.durationMin} دقیقه</div>
                  </div>
                  <Avatar name={a.patient.firstName + ' ' + a.patient.lastName} color={a.doctor.color} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">
                      {a.patient.firstName} {a.patient.lastName}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {a.service.name} · {a.doctor.name}
                    </div>
                  </div>
                  <Pill label={st.label} color={st.color} />
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card className="rounded-2xl min-w-0">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-base">کارهای نیازمند توجه</CardTitle>
            <Button size="sm" variant="ghost" className="text-xs rounded-lg text-sky-700 hover:bg-sky-50" onClick={() => onNavigate('tasks')}>
              کارتابل
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[340px] overflow-y-auto scroll-thin">
            {urgentTasks.length === 0 ? <div className="text-sm text-muted-foreground p-3">کار بازی وجود ندارد 🎉</div> : null}
            {urgentTasks.map((t) => {
              const overdue = t.dueAt && new Date(t.dueAt) < new Date() && t.status !== 'DONE'
              const pr = TASK_PRIORITY[t.priority]
              return (
                <div key={t.id} className="flex items-start gap-3 rounded-xl border bg-background/60 px-3 py-2.5">
                  <span className="mt-1.5 h-2.5 w-2.5 rounded-full shrink-0" style={{ background: pr.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold leading-5">{t.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDayRelative(new Date(t.dueAt))} · {formatTime(new Date(t.dueAt))}
                      </span>
                      <span>·</span>
                      <span>{t.assigneeName}</span>
                    </div>
                  </div>
                  {overdue ? (
                    <Badge className="bg-rose-100 text-rose-700 border-rose-200 rounded-full" variant="outline">
                      <AlertTriangle className="h-3 w-3 ml-1" /> عقب‌افتاده
                    </Badge>
                  ) : null}
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* Next up + low stock */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> نوبت‌های پیش‌رو
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.nextUp.slice(0, 4).map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-xl border bg-background/60 px-3 py-2.5">
                <div className="text-center w-20 shrink-0">
                  <div className="text-xs font-bold">{formatDayRelative(new Date(a.start))}</div>
                  <div className="text-[11px] text-muted-foreground">{formatTime(new Date(a.start))}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">
                    {a.patient.firstName} {a.patient.lastName}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{a.service.name} · {a.doctor.name}</div>
                </div>
                <Pill label={SOURCE_LABEL[a.source] ?? a.source} color="bg-secondary text-secondary-foreground border-transparent" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" /> هشدار انبار
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground mb-3">
              {faDigits(kpis.lowStock)} قلم کالا به حد هشدار رسیده است.
            </div>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => onNavigate('finance')}>
              مشاهده انبار
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
