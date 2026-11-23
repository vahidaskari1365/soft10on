'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatCard, SectionHeader, LoadingBlock, EmptyState, ErrorState, Pill, Avatar } from '../bits'
import { useToast } from '@/hooks/use-toast'
import type { DoctorOverview } from '../types'
import { APPOINTMENT_STATUS, TASK_PRIORITY, SOURCE_LABEL, millionsShort } from '@/lib/format'
import { formatToman } from '@/lib/format'
import { formatTime, formatJDate, formatDayRelative, weekdayName, faDigits } from '@/lib/jalali'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import {
  Stethoscope, CalendarCheck, Users, Wallet, Clock, CheckCircle2, XCircle, MapPin,
  Building2, BadgePercent, Inbox, Loader2,
} from 'lucide-react'

export function DoctorSection() {
  const [data, setData] = useState<DoctorOverview | null>(null)
  const [failed, setFailed] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)
  const { toast } = useToast()

  // بارگذاری با تفکیک حالت خطا از حالت خالی — شکست شبکه هیچ‌گاه اسکلت بی‌نهایت نمی‌سازد
  const load = useCallback(() => {
    setFailed(false)
    fetch('/api/doctor/overview')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const d: DoctorOverview & { error?: string } = await r.json()
        if (!d || d.error) throw new Error('api')
        setData(d)
      })
      .catch(() => {
        setData(null)
        setFailed(true)
      })
  }, [])
  useEffect(load, [load])

  async function setStatus(id: string, status: string) {
    setUpdating(id)
    try {
      const r = await fetch(`/api/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const j: { error?: string } = await r.json().catch(() => ({}))
      if (!r.ok) {
        toast({ title: 'ثبت وضعیت ناموفق بود', description: String(j.error ?? `خطای ${r.status}`), variant: 'destructive' })
        return // داده را تازه نکن — وضعیت قبلی معتبر می‌ماند
      }
      toast({ title: status === 'DONE' ? 'نوبت به‌عنوان انجام‌شده ثبت شد' : 'عدم حضور بیمار ثبت شد' })
      load()
    } catch {
      toast({ title: 'ارتباط با سرور برقرار نشد', description: 'اتصال شبکه را بررسی کنید و دوباره تلاش کنید', variant: 'destructive' })
    } finally {
      setUpdating(null)
    }
  }

  if (failed) return <ErrorState onRetry={load} />
  if (!data) return <LoadingBlock rows={5} />

  const doneToday = data.today.filter((a) => a.status === 'DONE').length
  const maxCommission = Math.max(...data.series.map((s) => s.commission), 1)

  return (
    <div className="space-y-5">
      <SectionHeader
        title={`تابلوی ${data.doctor.name}`}
        subtitle={`${data.doctor.specialty}${data.doctor.branch ? ` · ${data.doctor.branch}` : ''}`}
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#B08D57] bg-[#F6EFE3] text-[#7C6434] px-3 py-1 text-[11px] font-semibold">
          <BadgePercent className="h-3.5 w-3.5" />
          کارانه: {faDigits(Math.round((data.thisMonth.rate ?? 0) * 100))}٪
        </span>
      </SectionHeader>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="نوبت امروز" value={faDigits(data.today.length)} hint={`${faDigits(doneToday)} انجام‌شده`} icon={<CalendarCheck className="h-4.5 w-4.5" />} />
        <StatCard title="درآمد من این ماه" value={data.thisMonth.revenueFa} icon={<Wallet className="h-4.5 w-4.5" />} />
        <StatCard title="کارانه این ماه" value={data.thisMonth.commissionFa} tone="gold" hint={`${faDigits(data.thisMonth.done)} نوبت انجام‌شده`} icon={<BadgePercent className="h-4.5 w-4.5" />} />
        <StatCard title="بیماران فعال من" value={faDigits(data.myPatients.length)} icon={<Users className="h-4.5 w-4.5" />} />
      </div>

      <Tabs defaultValue="today" dir="rtl">
        <TabsList className="rounded-xl bg-secondary/60 h-11">
          <TabsTrigger value="today" className="rounded-lg">برنامه امروز</TabsTrigger>
          <TabsTrigger value="patients" className="rounded-lg">بیماران من</TabsTrigger>
          <TabsTrigger value="finance" className="rounded-lg">کارنامه مالی من</TabsTrigger>
          <TabsTrigger value="tasks" className="rounded-lg">کارتابل من</TabsTrigger>
        </TabsList>

        {/* ---------- امروز ---------- */}
        <TabsContent value="today" className="mt-4 space-y-4">
          {data.today.length === 0 ? (
            <EmptyState text="امروز نوبتی ندارید — روز خوبی برای استراحت است 🌿" />
          ) : (
            <div className="space-y-2.5">
              {data.today.map((a) => {
                const st = APPOINTMENT_STATUS[a.status]
                return (
                  <Card key={a.id} className="rounded-2xl shadow-sm">
                    <CardContent className="p-4 flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-3 min-w-[180px]">
                        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary text-xs font-bold">
                          {formatTime(new Date(a.start))}
                        </span>
                        <div>
                          <div className="font-semibold text-sm">{a.patient.firstName} {a.patient.lastName}</div>
                          <div className="text-[11px] text-muted-foreground">{a.service.name}</div>
                        </div>
                      </div>
                      <Pill label={st.label} color={st.color} />
                      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> {faDigits(a.service.durationMin)} دقیقه · {formatToman(a.price)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">منبع: {SOURCE_LABEL[a.source] ?? a.source}</span>
                      <div className="flex-1" />
                      {a.status === 'DONE' || a.status === 'CANCELLED' || a.status === 'NO_SHOW' ? null : (
                        <div className="flex items-center gap-1.5">
                          {updating === a.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <>
                              <Button size="sm" className="rounded-lg h-8" onClick={() => setStatus(a.id, 'DONE')}>
                                <CheckCircle2 className="h-3.5 w-3.5 ml-1" /> انجام شد
                              </Button>
                              <Button size="sm" variant="outline" className="rounded-lg h-8 text-rose-600" onClick={() => setStatus(a.id, 'NO_SHOW')}>
                                <XCircle className="h-3.5 w-3.5 ml-1" /> حاضر نشد
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {/* Upcoming */}
          <div>
            <h3 className="text-sm font-bold mb-2.5 mt-6">نوبت‌های پیش‌رو</h3>
            {data.upcoming.length === 0 ? (
              <EmptyState text="نوبت پیش‌رویی ثبت نشده است" />
            ) : (
              <div className="grid md:grid-cols-2 gap-2.5">
                {data.upcoming.map((a) => {
                  const st = APPOINTMENT_STATUS[a.status]
                  return (
                    <Card key={a.id} className="rounded-2xl shadow-sm">
                      <CardContent className="p-3.5 flex items-center gap-3">
                        <Avatar name={`${a.patient.firstName} ${a.patient.lastName}`} color={a.doctor.color} size={34} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold truncate">{a.patient.firstName} {a.patient.lastName}</div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {formatDayRelative(new Date(a.start))} {weekdayName(new Date(a.start))} {formatJDate(new Date(a.start), false)} · {formatTime(new Date(a.start))} · {a.service.name}
                          </div>
                        </div>
                        <Pill label={st.label} color={st.color} />
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ---------- بیماران من ---------- */}
        <TabsContent value="patients" className="mt-4">
          {data.myPatients.length === 0 ? (
            <EmptyState text="هنوز بیماری با شما ویزیت نداشته است" />
          ) : (
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-right">بیمار</TableHead>
                      <TableHead className="text-right">تعداد ویزیت</TableHead>
                      <TableHead className="text-right">آخرین مراجعه</TableHead>
                      <TableHead className="text-right">عدم حضور</TableHead>
                      <TableHead className="text-right">مجموع خدمات</TableHead>
                      <TableHead className="text-right">پرچم</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.myPatients.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="text-sm font-semibold">{p.name}</div>
                          <div className="text-[11px] text-muted-foreground" dir="ltr">{p.phone}</div>
                        </TableCell>
                        <TableCell className="text-sm">{faDigits(p.visits)} ویزیت</TableCell>
                        <TableCell className="text-xs">{p.lastVisit ? formatJDate(new Date(p.lastVisit)) : '—'}</TableCell>
                        <TableCell className="text-sm">{faDigits(p.noShow)}</TableCell>
                        <TableCell className="text-xs">{p.spentFa}</TableCell>
                        <TableCell>
                          {p.incompleteTreatment ? <Pill label="درمان نیمه‌کاره" color="bg-amber-100 text-amber-800 border-amber-200" /> : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          )}
        </TabsContent>

        {/* ---------- کارنامه مالی ---------- */}
        <TabsContent value="finance" className="mt-4">
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-5">
              <div className="text-sm font-bold mb-1">کارانه ۱۲ ماه اخیر</div>
              <div className="text-xs text-muted-foreground mb-4">
                بر اساس نوبت‌های انجام‌شده × نرخ کارانه ({faDigits(Math.round((data.thisMonth.rate ?? 0) * 100))}٪)
              </div>
              <div className="h-72" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={[...data.series].reverse()} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E0F2FE" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: 'Vazirmatn' }} reversed />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => millionsShort(Number(v))} width={45} orientation="right" />
                    <Tooltip contentStyle={{ fontFamily: 'Vazirmatn', fontSize: 12, borderRadius: 12, direction: 'rtl' }} />
                    <Legend formatter={(v) => (v === 'commission' ? 'کارانه من' : 'درآمد شعبه')} wrapperStyle={{ fontFamily: 'Vazirmatn', fontSize: 12 }} />
                    <Bar dataKey="revenue" fill="#BAE6FD" radius={[6, 6, 0, 0]} name="revenue" />
                    <Line type="monotone" dataKey="commission" stroke="#B08D57" strokeWidth={2.5} dot={false} name="commission" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- کارتابل من ---------- */}
        <TabsContent value="tasks" className="mt-4">
          {data.tasks.length === 0 ? (
            <EmptyState text="کاری به نام شما در کارتابل نیست" />
          ) : (
            <div className="space-y-2.5">
              {data.tasks.map((t) => (
                <Card key={t.id} className="rounded-2xl shadow-sm">
                  <CardContent className="p-4 flex flex-wrap items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-primary">
                      <Inbox className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{t.title}</div>
                      {t.description ? <div className="text-[11px] text-muted-foreground truncate">{t.description}</div> : null}
                    </div>
                    <Pill label={TASK_PRIORITY[t.priority]?.label ?? t.priority} color={TASK_PRIORITY[t.priority]?.color ? 'bg-secondary' : 'bg-secondary'} />
                    <span className="text-[11px] text-muted-foreground">مهلت: {formatJDate(new Date(t.dueAt))}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
