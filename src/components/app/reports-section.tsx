'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { SectionHeader, EmptyState, LoadingBlock } from './bits'
import { faDigits, keyToLabel, lastNMonthKeys, formatTime } from '@/lib/jalali'
import { formatToman } from '@/lib/format'
import { Download, Users, CalendarDays, Wallet, MessageSquare, Package, TrendingUp, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

type Reports = {
  month: string | null
  patients: { total: number; newThisMonth: number; active6m: number; inactive6m: number; visitedThisMonth: number }
  appointments: {
    total: number
    byStatus: Record<string, number>
    cancelRate: number
    byDoctor: { name: string; done: number; cancelled: number; noShow: number; revenue: number }[]
    byService: { name: string; category: string; count: number; revenue: number }[]
    peakHours: { hour: number; count: number }[]
  }
  finance: null | {
    revenue: number
    collectedFromInvoices: number
    received: number
    expenses: number
    profit: number
    receivables: number
    expenseByCategory: { category: string; amount: number }[]
  }
  crm: { messagesIn: number; messagesOut: number; aiRequests: number; aiOk: number; aiAvgLatency: number; newBookings: number }
  inventory: null | { stockValue: number; lowStock: { name: string; stockQty: number; minStock: number }[] }
  trend: { key: string; revenue: number; expense: number }[]
}

type BranchRow = { id: string; name: string }

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = '\uFEFF' + rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${name}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function Kpi({ label, value, sub, icon: Icon, tone }: { label: string; value: string; sub?: string; icon: typeof Users; tone?: string }) {
  return (
    <Card className="rounded-2xl card-hover">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">{label}</span>
          <Icon className={cn('h-4 w-4', tone ?? 'text-sky-600')} />
        </div>
        <div className="text-xl font-extrabold mt-1.5">{value}</div>
        {sub ? <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div> : null}
      </CardContent>
    </Card>
  )
}

/** نمودار میله‌ای سبک (بدون وابستگی) */
function Bars({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  if (data.length === 0) return <EmptyState text="داده‌ای برای نمایش نیست." />
  return (
    <div className="flex items-end gap-2 h-32 px-1">
      {data.map((d) => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${d.label}: ${faDigits(d.value)}`}>
          <div className="w-full flex items-end justify-center" style={{ height: '96px' }}>
            <div className={cn('w-full max-w-10 rounded-t-lg transition-all', color)} style={{ height: `${Math.max(6, (d.value / max) * 96)}px` }} />
          </div>
          <div className="text-[9px] text-muted-foreground truncate max-w-full">{d.label}</div>
        </div>
      ))}
    </div>
  )
}

export function ReportsSection() {
  const months = useMemo(() => lastNMonthKeys(12), [])
  const [month, setMonth] = useState(months[0])
  const [branch, setBranch] = useState('')
  const [branches, setBranches] = useState<BranchRow[]>([])
  const [data, setData] = useState<Reports | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/branches').then((r) => r.json()).then((j) => setBranches(j.branches ?? j ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    setData(null)
    setError(false)
    const params = new URLSearchParams({ month })
    if (branch) params.set('branch', branch)
    fetch(`/api/reports?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setData(d as Reports))
      .catch(() => setError(true))
  }, [month, branch])

  const canFinance = data?.finance != null

  function exportSummary() {
    if (!data) return
    const rows: (string | number)[][] = [['گزارش', 'مقدار']]
    rows.push(['ماه', keyToLabel(month)])
    rows.push(['کل بیماران', data.patients.total])
    rows.push(['بیماران جدید این ماه', data.patients.newThisMonth])
    rows.push(['بیماران فعال ۶ ماه اخیر', data.patients.active6m])
    rows.push(['نوبت‌های ماه', data.appointments.total])
    rows.push(['نرخ لغو/عدم حضور (٪)', data.appointments.cancelRate])
    if (data.finance) {
      rows.push(['درآمد', data.finance.revenue])
      rows.push(['هزینه', data.finance.expenses])
      rows.push(['سود', data.finance.profit])
      rows.push(['مطالبات', data.finance.receivables])
    }
    downloadCsv('10on-reports', rows)
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="گزارش‌ها" subtitle="گزارش تجمیعی بیماران، نوبت‌ها، مالی، CRM و انبار با فیلتر ماه شمسی و شعبه" />

      {/* فیلترها */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-xl border bg-card px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          aria-label="انتخاب ماه"
        >
          {months.map((m) => (
            <option key={m} value={m}>{keyToLabel(m)}</option>
          ))}
        </select>
        <select
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          className="rounded-xl border bg-card px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          aria-label="انتخاب شعبه"
        >
          <option value="">همه شعب</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={exportSummary} disabled={!data}>
          <Download className="h-3.5 w-3.5" /> خروجی CSV
        </Button>
      </div>

      {error ? (
        <EmptyState text="خطا در بارگیری گزارش — دوباره تلاش کنید." />
      ) : !data ? (
        <LoadingBlock rows={6} />
      ) : (
        <Tabs defaultValue="overview">
          <TabsList className="rounded-xl flex-wrap justify-start h-auto">
            <TabsTrigger value="overview">خلاصه</TabsTrigger>
            <TabsTrigger value="appointments">نوبت‌ها</TabsTrigger>
            <TabsTrigger value="patients">بیماران</TabsTrigger>
            {canFinance ? <TabsTrigger value="finance">مالی</TabsTrigger> : null}
            <TabsTrigger value="crm">CRM و AI</TabsTrigger>
            {canFinance ? <TabsTrigger value="inventory">انبار</TabsTrigger> : null}
          </TabsList>

          {/* ——— خلاصه ——— */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="کل بیماران" value={faDigits(data.patients.total)} sub={`${faDigits(data.patients.newThisMonth)} جدید این ماه`} icon={Users} />
              <Kpi label="نوبت‌های این ماه" value={faDigits(data.appointments.total)} sub={`${faDigits(data.patients.visitedThisMonth)} بیمار مراجعه‌کننده`} icon={CalendarDays} />
              {canFinance && data.finance ? (
                <Kpi label="سود ماه" value={formatToman(data.finance.profit).replace(' تومان', '')} sub={`هزینه: ${formatToman(data.finance.expenses).replace(' تومان', '')}`} icon={Wallet} tone="text-emerald-600" />
              ) : null}
              <Kpi label="نرخ لغو/عدم حضور" value={`${faDigits(data.appointments.cancelRate)}٪`} sub={`${faDigits(data.appointments.byStatus.CANCELLED ?? 0)} لغو · ${faDigits(data.appointments.byStatus.NO_SHOW ?? 0)} عدم حضور`} icon={TrendingUp} tone="text-rose-500" />
            </div>
            {canFinance && data.trend.length > 0 ? (
              <Card className="rounded-2xl">
                <CardContent className="p-4">
                  <div className="text-sm font-bold mb-3">روند درآمد و هزینه (۶ ماه)</div>
                  <Bars data={data.trend.map((t) => ({ label: keyToLabel(t.key), value: t.revenue }))} color="bg-sky-500/80" />
                  <div className="text-[11px] text-muted-foreground mt-2">
                    هزینه آخرین ماه: {formatToman(data.trend.at(-1)?.expense ?? 0)}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          {/* ——— نوبت‌ها ——— */}
          <TabsContent value="appointments" className="space-y-4">
            <Card className="rounded-2xl">
              <CardContent className="p-4">
                <div className="text-sm font-bold mb-3 flex items-center gap-1.5"><Clock className="h-4 w-4 text-sky-600" /> ساعات پرترافیک</div>
                <Bars data={data.appointments.peakHours.map((h) => ({ label: faDigits(`${h.hour}:۰۰`), value: h.count }))} color="bg-teal-500/80" />
              </CardContent>
            </Card>
            <Card className="rounded-2xl">
              <CardContent className="p-4">
                <div className="text-sm font-bold mb-2">عملکرد پزشکان</div>
                {data.appointments.byDoctor.length === 0 ? (
                  <EmptyState text="نوبتی در این ماه ثبت نشده." />
                ) : (
                  <div className="overflow-x-auto scroll-thin">
                    <table className="w-full text-xs min-w-[420px]">
                      <thead>
                        <tr className="text-muted-foreground border-b">
                          <th className="py-2 text-right font-medium">پزشک</th>
                          <th className="py-2 text-center font-medium">انجام‌شده</th>
                          <th className="py-2 text-center font-medium">لغو</th>
                          <th className="py-2 text-center font-medium">عدم حضور</th>
                          {canFinance ? <th className="py-2 text-left font-medium">درآمد</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {data.appointments.byDoctor.map((d) => (
                          <tr key={d.name} className="border-b last:border-b-0">
                            <td className="py-2 font-semibold">{d.name}</td>
                            <td className="py-2 text-center">{faDigits(d.done)}</td>
                            <td className="py-2 text-center">{faDigits(d.cancelled)}</td>
                            <td className="py-2 text-center">{faDigits(d.noShow)}</td>
                            {canFinance ? <td className="py-2 text-left">{formatToman(d.revenue).replace(' تومان', '')}</td> : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="rounded-2xl">
              <CardContent className="p-4">
                <div className="text-sm font-bold mb-2">پرمصرف‌ترین خدمات</div>
                <div className="space-y-2">
                  {data.appointments.byService.slice(0, 6).map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-xs">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground">{faDigits(s.count)} نوبت {canFinance ? `· ${formatToman(s.revenue).replace(' تومان', '')}` : ''}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ——— بیماران ——— */}
          <TabsContent value="patients" className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="کل بیماران" value={faDigits(data.patients.total)} icon={Users} />
              <Kpi label="جدید این ماه" value={faDigits(data.patients.newThisMonth)} icon={Users} tone="text-emerald-600" />
              <Kpi label="فعال (۶ ماه اخیر)" value={faDigits(data.patients.active6m)} icon={Users} />
              <Kpi label="غیرفعال" value={faDigits(data.patients.inactive6m)} icon={Users} tone="text-amber-600" />
            </div>
          </TabsContent>

          {/* ——— مالی ——— */}
          {canFinance && data.finance ? (
            <TabsContent value="finance" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="درآمد" value={formatToman(data.finance.revenue).replace(' تومان', '')} icon={Wallet} />
                <Kpi label="دریافتی نقدی" value={formatToman(data.finance.received).replace(' تومان', '')} icon={Wallet} tone="text-emerald-600" />
                <Kpi label="مطالبات" value={formatToman(data.finance.receivables).replace(' تومان', '')} icon={Wallet} tone="text-rose-500" />
                <Kpi label="سود" value={formatToman(data.finance.profit).replace(' تومان', '')} icon={Wallet} tone="text-teal-600" />
              </div>
              <Card className="rounded-2xl">
                <CardContent className="p-4">
                  <div className="text-sm font-bold mb-2">هزینه‌ها بر اساس دسته</div>
                  {data.finance.expenseByCategory.length === 0 ? (
                    <EmptyState text="هزینه‌ای ثبت نشده." />
                  ) : (
                    <div className="space-y-2">
                      {data.finance.expenseByCategory.map((e) => (
                        <div key={e.category} className="flex items-center justify-between text-xs">
                          <span className="font-medium">{e.category}</span>
                          <span className="text-muted-foreground">{formatToman(e.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ) : null}

          {/* ——— CRM و AI ——— */}
          <TabsContent value="crm" className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Kpi label="پیام دریافتی" value={faDigits(data.crm.messagesIn)} icon={MessageSquare} />
              <Kpi label="پیام ارسالی" value={faDigits(data.crm.messagesOut)} icon={MessageSquare} tone="text-teal-600" />
              <Kpi label="درخواست رزرو وب" value={faDigits(data.crm.newBookings)} icon={MessageSquare} tone="text-violet-600" />
              <Kpi label="درخواست‌های AI" value={faDigits(data.crm.aiRequests)} icon={MessageSquare} />
              <Kpi label="موفق AI" value={faDigits(data.crm.aiOk)} icon={MessageSquare} tone="text-emerald-600" />
              <Kpi label="میانگین پاسخ AI" value={`${faDigits(data.crm.aiAvgLatency)}ms`} icon={MessageSquare} />
            </div>
          </TabsContent>

          {/* ——— انبار ——— */}
          {canFinance && data.inventory ? (
            <TabsContent value="inventory" className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Kpi label="ارزش موجودی انبار" value={formatToman(data.inventory.stockValue).replace(' تومان', '')} icon={Package} />
                <Kpi label="اقلام کم‌موجود" value={faDigits(data.inventory.lowStock.length)} icon={Package} tone="text-amber-600" />
              </div>
              <Card className="rounded-2xl">
                <CardContent className="p-4">
                  {data.inventory.lowStock.length === 0 ? (
                    <EmptyState text="هیچ قلمی زیر حد حداقل موجودی نیست." />
                  ) : (
                    <div className="space-y-2">
                      {data.inventory.lowStock.map((p) => (
                        <div key={p.name} className="flex items-center justify-between text-xs">
                          <span className="font-medium">{p.name}</span>
                          <span className="text-amber-700">{faDigits(p.stockQty)} از حداقل {faDigits(p.minStock)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ) : null}
        </Tabs>
      )}
    </div>
  )
}
