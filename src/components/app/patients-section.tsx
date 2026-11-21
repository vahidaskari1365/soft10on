'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SectionHeader, Pill, Avatar, EmptyState, LoadingBlock } from './bits'
import type { Appointment, PatientRow, ProductSale } from './types'
import { APPOINTMENT_STATUS } from '@/lib/format'
import { formatJDate, faDigits, formatDayRelative } from '@/lib/jalali'
import { formatToman } from '@/lib/format'
import { Search, PhoneCall, UserRound, ClipboardList, AlertTriangle, TimerReset, CalendarDays, Wallet, MessageSquare, FolderOpen, FileText, Stethoscope, Sparkles } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const SIGNALS = [
  { key: 'noVisit', label: 'عدم مراجعه ۶ ماه+', icon: TimerReset },
  { key: 'noShow', label: 'سابقه عدم حضور', icon: AlertTriangle },
  { key: 'incomplete', label: 'درمان نیمه‌کاره', icon: ClipboardList },
] as const

type InvoiceRow = {
  id: string
  number: number
  date: string
  status: string
  total: number
  discount?: number
  payments: { amount: number; date: string; method: string }[]
}
type PaymentRow = { id: string; date: string; method: string; amount: number; description?: string | null }
type MessageRow = { id: string; direction: string; channel: string; body: string; createdAt: string; readAt?: string | null; aiGenerated?: boolean }
type RecordRow = { id: string; date: string; type: string; title: string; content?: string | null; aiSummary?: string | null; doctor?: { name: string } | null }

type Detail = {
  history: Appointment[]
  sales: ProductSale[]
  invoices: InvoiceRow[]
  payments: PaymentRow[]
  messages: MessageRow[]
  records: RecordRow[]
  totalSpent: number
  totalPaid: number
  totalDebt: number
  lastVisit: string | null
}

const INVOICE_STATUS: Record<string, { label: string; color: string }> = {
  PAID: { label: 'پرداخت‌شده', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  PARTIAL: { label: 'پرداخت جزئی', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  UNPAID: { label: 'پرداخت‌نشده', color: 'bg-rose-100 text-rose-700 border-rose-200' },
}

const PAYMENT_METHOD: Record<string, string> = {
  CASH: 'نقدی',
  CARD: 'کارت‌خوان',
  TRANSFER: 'انتقال بانکی',
  CHECK: 'چک',
}

const RECORD_TYPE: Record<string, string> = {
  NOTE: 'یادداشت پزشک',
  TREATMENT: 'اقدام درمانی',
  PRESCRIPTION: 'نسخه',
  LAB: 'آزمایش',
  IMAGE: 'تصویر پزشکی',
  DOCUMENT: 'سند',
}

export function PatientsSection() {
  const [patients, setPatients] = useState<PatientRow[] | null>(null)
  const [query, setQuery] = useState('')
  const [signal, setSignal] = useState<string>('all')
  const [selected, setSelected] = useState<PatientRow | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetch('/api/patients').then((r) => r.json()).then((j) => setPatients(j.patients ?? [])).catch(() => {})
  }, [])

  const openDetail = async (p: PatientRow) => {
    setSelected(p)
    setDetail(null)
    const r = await fetch(`/api/patients/${p.id}`)
    const j = await r.json()
    setDetail({
      history: j.history ?? [],
      sales: j.sales ?? [],
      invoices: j.invoices ?? [],
      payments: j.payments ?? [],
      messages: j.messages ?? [],
      records: j.records ?? [],
      totalSpent: j.totalSpent ?? 0,
      totalPaid: j.totalPaid ?? 0,
      totalDebt: j.totalDebt ?? 0,
      lastVisit: j.lastVisit ?? null,
    })
  }

  const createFollowUpTask = async (p: PatientRow) => {
    const r = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `پیگیری بیمار — ${p.firstName} ${p.lastName}`,
        description: 'ایجادشده از بخش CRM بیماران',
        assigneeRole: 'RECEPTIONIST',
        assigneeName: 'سمیرا (منشی)',
        patientId: p.id,
        priority: 'MEDIUM',
        source: 'MANUAL',
      }),
    })
    if (r.ok) toast({ title: 'تسک پیگیری در کارتابل ساخته شد', description: `${p.firstName} ${p.lastName}` })
  }

  const filtered = useMemo(() => {
    let list = patients ?? []
    if (query.trim()) {
      const q = query.trim()
      list = list.filter((p) => `${p.firstName} ${p.lastName}`.includes(q) || p.phone.includes(q))
    }
    if (signal !== 'all') {
      list = list.filter((p) =>
        signal === 'noVisit' ? p.signalNoVisit : signal === 'noShow' ? p.signalNoShow : p.signalIncomplete
      )
    }
    return list
  }, [patients, query, signal])

  const signalCount = (key: string) =>
    (patients ?? []).filter((p) => (key === 'noVisit' ? p.signalNoVisit : key === 'noShow' ? p.signalNoShow : p.signalIncomplete)).length

  /** تایم‌لاین جامع — ادغام همه رویدادهای بیمار مرتب‌شده از جدید به قدیم */
  const timeline = useMemo(() => {
    if (!detail || !selected) return []
    type Ev = { key: string; date: Date; icon: typeof CalendarDays; title: string; sub?: string }
    const evs: Ev[] = []
    evs.push({
      key: 'reg',
      date: new Date(detail.history.at(-1)?.start ?? Date.now()),
      icon: UserRound,
      title: 'ثبت‌نام بیمار در سامانه',
      sub: `${faDigits(selected.visitCount)} مراجعه تاکنون`,
    })
    for (const a of detail.history)
      evs.push({
        key: `a-${a.id}`,
        date: new Date(a.start),
        icon: CalendarDays,
        title: `نوبت: ${a.service?.name ?? ''}`,
        sub: `${a.doctor?.name ?? ''} · ${APPOINTMENT_STATUS[a.status]?.label ?? a.status}`,
      })
    for (const i of detail.invoices)
      evs.push({ key: `i-${i.id}`, date: new Date(i.date), icon: FileText, title: `فاکتور شماره ${faDigits(i.number)}`, sub: formatToman(i.total) })
    for (const p of detail.payments)
      evs.push({ key: `p-${p.id}`, date: new Date(p.date), icon: Wallet, title: `دریافت ${formatToman(p.amount)}`, sub: PAYMENT_METHOD[p.method] ?? p.method })
    for (const m of detail.messages)
      evs.push({
        key: `m-${m.id}`,
        date: new Date(m.createdAt),
        icon: MessageSquare,
        title: m.direction === 'OUT' ? 'پیام ارسالی کلینیک' : 'پیام دریافتی بیمار',
        sub: (m.body ?? '').slice(0, 60),
      })
    for (const r of detail.records)
      evs.push({
        key: `r-${r.id}`,
        date: new Date(r.date),
        icon: FolderOpen,
        title: `${RECORD_TYPE[r.type] ?? 'سند پزشکی'}: ${r.title}`,
        sub: r.doctor?.name,
      })
    return evs.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 30)
  }, [detail, selected])

  return (
    <div className="space-y-4">
      <SectionHeader title="بیماران (CRM)" subtitle="سیستم خودش وضعیت هر بیمار را رصد می‌کند و فرصت‌های پیگیری را نشان می‌دهد" />

      {/* signals row */}
      <div className="grid grid-cols-3 gap-3">
        {SIGNALS.map((s) => {
          const Icon = s.icon
          const active = signal === s.key
          return (
            <button
              key={s.key}
              onClick={() => setSignal(active ? 'all' : s.key)}
              className={`rounded-2xl border px-3 py-3 text-right transition-colors ${
                active ? 'border-primary bg-secondary' : 'bg-card hover:bg-muted/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-xl font-bold">{faDigits(signalCount(s.key))}</div>
                <Icon className={`h-5 w-5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">{s.label}</div>
            </button>
          )
        })}
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جست‌وجوی نام یا شماره تماس…"
          className="rounded-xl pr-9"
        />
      </div>

      {!patients ? (
        <LoadingBlock rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState text="بیماری با این شرایط پیدا نشد." />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <Card key={p.id} className="rounded-2xl hover:shadow-md transition-shadow cursor-pointer" onClick={() => openDetail(p)}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={`${p.firstName} ${p.lastName}`} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm truncate">{p.firstName} {p.lastName}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5" dir="ltr">
                      <PhoneCall className="h-3 w-3 inline" />
                      {faDigits(p.phone)}
                    </div>
                  </div>
                  <UserRound className="h-4 w-4 text-muted-foreground/40" />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div className="rounded-lg bg-muted/60 py-1.5">
                    <div className="text-xs font-bold">{faDigits(p.visitCount)}</div>
                    <div className="text-[10px] text-muted-foreground">ویزیت</div>
                  </div>
                  <div className="rounded-lg bg-muted/60 py-1.5">
                    <div className="text-xs font-bold">
                      {p.lastVisit ? formatDayRelative(new Date(p.lastVisit)) : '—'}
                    </div>
                    <div className="text-[10px] text-muted-foreground">آخرین مراجعه</div>
                  </div>
                  <div className="rounded-lg bg-muted/60 py-1.5">
                    <div className="text-xs font-bold">{p.totalSpent > 0 ? formatToman(p.totalSpent).replace(' تومان', '') : '—'}</div>
                    <div className="text-[10px] text-muted-foreground">مجموع پرداخت</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {p.signalNoVisit ? <Pill label="۶ ماه مراجعه نکرده" color="bg-amber-100 text-amber-800 border-amber-200" /> : null}
                  {p.signalNoShow ? <Pill label={`${faDigits(p.noShowCount)}× عدم حضور`} color="bg-rose-100 text-rose-700 border-rose-200" /> : null}
                  {p.signalIncomplete ? <Pill label="درمان نیمه‌کاره" color="bg-violet-100 text-violet-800 border-violet-200" /> : null}
                  {p.noShowCount === 0 && !p.signalNoVisit && !p.signalIncomplete ? (
                    <Pill label="وضعیت عادی" color="bg-emerald-100 text-emerald-800 border-emerald-200" />
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Patient 360 sheet */}
      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent side="left" className="w-full sm:max-w-xl overflow-y-auto scroll-thin p-5">
          {selected ? (
            <>
              <SheetHeader className="p-0 pb-3">
                <SheetTitle className="text-right flex items-center gap-3">
                  <Avatar name={`${selected.firstName} ${selected.lastName}`} size={44} />
                  <div>
                    <div className="font-bold">{selected.firstName} {selected.lastName}</div>
                    <div className="text-xs text-muted-foreground font-normal" dir="ltr">{faDigits(selected.phone)}</div>
                  </div>
                </SheetTitle>
              </SheetHeader>
              {!detail ? (
                <LoadingBlock rows={5} />
              ) : (
                <Tabs defaultValue="summary" className="mt-1">
                  <TabsList className="w-full justify-start rounded-xl">
                    <TabsTrigger value="summary">خلاصه</TabsTrigger>
                    <TabsTrigger value="visits">نوبت‌ها</TabsTrigger>
                    <TabsTrigger value="finance">مالی</TabsTrigger>
                    <TabsTrigger value="records">پرونده</TabsTrigger>
                    <TabsTrigger value="messages">پیام‌ها</TabsTrigger>
                    <TabsTrigger value="timeline">تایم‌لاین</TabsTrigger>
                  </TabsList>

                  {/* ——— خلاصه ——— */}
                  <TabsContent value="summary" className="space-y-4">
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-xl border py-2">
                        <div className="font-bold">{faDigits(selected.visitCount)}</div>
                        <div className="text-[10px] text-muted-foreground">ویزیت انجام‌شده</div>
                      </div>
                      <div className="rounded-xl border py-2">
                        <div className="font-bold">{faDigits(selected.noShowCount)}</div>
                        <div className="text-[10px] text-muted-foreground">عدم حضور</div>
                      </div>
                      <div className="rounded-xl border py-2">
                        <div className="font-bold text-emerald-700">{formatToman(detail.totalPaid).replace(' تومان', '')}</div>
                        <div className="text-[10px] text-muted-foreground">مجموع دریافتی</div>
                      </div>
                      <div className="rounded-xl border py-2">
                        <div className={`font-bold ${detail.totalDebt > 0 ? 'text-rose-600' : ''}`}>
                          {formatToman(detail.totalDebt).replace(' تومان', '')}
                        </div>
                        <div className="text-[10px] text-muted-foreground">بدهی فعلی</div>
                      </div>
                    </div>
                    <div className="rounded-xl border px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
                      <span>آخرین مراجعه</span>
                      <span className="font-semibold text-foreground">{detail.lastVisit ? formatJDate(new Date(detail.lastVisit)) : 'ثبت نشده'}</span>
                    </div>
                    <Button className="w-full rounded-xl" size="sm" onClick={() => createFollowUpTask(selected)}>
                      ساخت تسک پیگیری در کارتابل
                    </Button>
                    {detail.sales.length > 0 ? (
                      <div>
                        <div className="text-sm font-bold mb-2">خرید محصولات</div>
                        <div className="space-y-2">
                          {detail.sales.map((s) => (
                            <div key={s.id} className="rounded-xl border px-3 py-2 flex items-center justify-between text-xs">
                              <span>{s.product.name} × {faDigits(s.qty)}</span>
                              <span className="font-semibold">{formatToman(s.total)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </TabsContent>

                  {/* ——— نوبت‌ها ——— */}
                  <TabsContent value="visits" className="space-y-2">
                    {detail.history.length === 0 ? <EmptyState text="نوبتی ثبت نشده." /> : null}
                    {detail.history.map((a) => {
                      const st = APPOINTMENT_STATUS[a.status]
                      return (
                        <div key={a.id} className="rounded-xl border px-3 py-2.5 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">{a.service.name}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {a.doctor.name} · {formatJDate(new Date(a.start))}
                            </div>
                          </div>
                          <Pill label={st.label} color={st.color} />
                        </div>
                      )
                    })}
                  </TabsContent>

                  {/* ——— مالی ——— */}
                  <TabsContent value="finance" className="space-y-4">
                    <div>
                      <div className="text-sm font-bold mb-2">فاکتورها</div>
                      <div className="space-y-2">
                        {detail.invoices.length === 0 ? <EmptyState text="فاکتوری صادر نشده." /> : null}
                        {detail.invoices.map((inv) => {
                          const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
                          const st = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.UNPAID
                          return (
                            <div key={inv.id} className="rounded-xl border px-3 py-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold">فاکتور {faDigits(inv.number)}</span>
                                <Pill label={st.label} color={st.color} />
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
                                <span>{formatJDate(new Date(inv.date))}</span>
                                <span>
                                  جمع {formatToman(inv.total).replace(' تومان', '')} · پرداخت‌شده {formatToman(paid).replace(' تومان', '')}
                                </span>
                              </div>
                              {inv.payments.length > 0 ? (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {inv.payments.map((p, idx) => (
                                    <Pill key={idx} label={`${PAYMENT_METHOD[p.method] ?? p.method}: ${formatToman(p.amount).replace(' تومان', '')}`} color="bg-sky-50 text-sky-700 border-sky-200" />
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-bold mb-2">دریافتی‌ها</div>
                      <div className="space-y-2">
                        {detail.payments.length === 0 ? <EmptyState text="دریافتی ثبت نشده." /> : null}
                        {detail.payments.map((p) => (
                          <div key={p.id} className="rounded-xl border px-3 py-2 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{formatJDate(new Date(p.date))} · {PAYMENT_METHOD[p.method] ?? p.method}</span>
                            <span className="font-semibold text-emerald-700">{formatToman(p.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  {/* ——— پرونده پزشکی ——— */}
                  <TabsContent value="records" className="space-y-2">
                    {detail.records.length === 0 ? <EmptyState text="سند پزشکی ثبت نشده." /> : null}
                    {detail.records.map((r) => (
                      <div key={r.id} className="rounded-xl border px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold flex items-center gap-1.5">
                            {r.type === 'PRESCRIPTION' ? <Stethoscope className="h-3.5 w-3.5 text-teal-600" /> : <FolderOpen className="h-3.5 w-3.5 text-sky-600" />}
                            {r.title}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{formatJDate(new Date(r.date))}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          {RECORD_TYPE[r.type] ?? 'سند'} {r.doctor ? `· ${r.doctor.name}` : ''}
                        </div>
                        {r.content ? <div className="text-[11px] leading-5 mt-1.5 text-foreground/80">{r.content}</div> : null}
                        {r.aiSummary ? (
                          <div className="mt-2 rounded-lg bg-sky-500/[0.07] border border-sky-500/20 px-2.5 py-2 flex gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 shrink-0 text-sky-600 mt-0.5" />
                            <span className="text-[11px] leading-5 text-sky-800 dark:text-sky-300">{r.aiSummary}</span>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </TabsContent>

                  {/* ——— پیام‌ها ——— */}
                  <TabsContent value="messages" className="space-y-2">
                    {detail.messages.length === 0 ? <EmptyState text="گفتگویی ثبت نشده." /> : null}
                    {detail.messages.map((m) => (
                      <div key={m.id} className={`rounded-xl border px-3 py-2.5 ${m.direction === 'OUT' ? 'bg-secondary/50' : ''}`}>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                          <span>{m.direction === 'OUT' ? 'کلینیک' : 'بیمار'} {m.aiGenerated ? '· هوش مصنوعی' : ''}</span>
                          <span>{formatJDate(new Date(m.createdAt))}</span>
                        </div>
                        <div className="text-xs leading-5">{m.body}</div>
                      </div>
                    ))}
                  </TabsContent>

                  {/* ——— تایم‌لاین ——— */}
                  <TabsContent value="timeline" className="space-y-0">
                    {timeline.length === 0 ? <EmptyState text="رویدادی ثبت نشده." /> : null}
                    <ol className="relative border-r-2 border-border/70 mr-3 space-y-3">
                      {timeline.map((ev) => {
                        const Icon = ev.icon
                        return (
                          <li key={ev.key} className="relative pr-6">
                            <span className="absolute -right-[11px] top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-white shadow">
                              <Icon className="h-2.5 w-2.5" />
                            </span>
                            <div className="text-xs font-semibold leading-5">{ev.title}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {formatJDate(ev.date)} {ev.sub ? `· ${ev.sub}` : ''}
                            </div>
                          </li>
                        )
                      })}
                    </ol>
                  </TabsContent>
                </Tabs>
              )}
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
