'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { SectionHeader, Pill, Avatar, EmptyState, LoadingBlock } from './bits'
import type { Appointment, PatientRow, ProductSale } from './types'
import { APPOINTMENT_STATUS } from '@/lib/format'
import { formatJDate, faDigits, formatDayRelative } from '@/lib/jalali'
import { formatToman } from '@/lib/format'
import { Search, PhoneCall, UserRound, ClipboardList, AlertTriangle, TimerReset } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const SIGNALS = [
  { key: 'noVisit', label: 'عدم مراجعه ۶ ماه+', icon: TimerReset },
  { key: 'noShow', label: 'سابقه عدم حضور', icon: AlertTriangle },
  { key: 'incomplete', label: 'درمان نیمه‌کاره', icon: ClipboardList },
] as const

export function PatientsSection() {
  const [patients, setPatients] = useState<PatientRow[] | null>(null)
  const [query, setQuery] = useState('')
  const [signal, setSignal] = useState<string>('all')
  const [selected, setSelected] = useState<PatientRow | null>(null)
  const [detail, setDetail] = useState<{ history: Appointment[]; sales: ProductSale[]; totalSpent: number } | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetch('/api/patients').then((r) => r.json()).then((j) => setPatients(j.patients ?? [])).catch(() => {})
  }, [])

  const openDetail = async (p: PatientRow) => {
    setSelected(p)
    setDetail(null)
    const r = await fetch(`/api/patients/${p.id}`)
    const j = await r.json()
    setDetail({ history: j.history ?? [], sales: j.sales ?? [], totalSpent: j.totalSpent ?? 0 })
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

      {/* Detail sheet */}
      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent side="left" className="w-full sm:max-w-md overflow-y-auto scroll-thin p-5">
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
                <LoadingBlock rows={4} />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl border py-2">
                      <div className="font-bold">{faDigits(selected.visitCount)}</div>
                      <div className="text-[10px] text-muted-foreground">ویزیت انجام‌شده</div>
                    </div>
                    <div className="rounded-xl border py-2">
                      <div className="font-bold">{faDigits(selected.noShowCount)}</div>
                      <div className="text-[10px] text-muted-foreground">عدم حضور</div>
                    </div>
                    <div className="rounded-xl border py-2">
                      <div className="font-bold">{formatToman(detail.totalSpent).replace(' تومان', '')}</div>
                      <div className="text-[10px] text-muted-foreground">مجموع پرداخت</div>
                    </div>
                  </div>

                  <Button className="w-full rounded-xl" size="sm" onClick={() => createFollowUpTask(selected)}>
                    ساخت تسک پیگیری در کارتابل
                  </Button>

                  <div>
                    <div className="text-sm font-bold mb-2">سابقه‌ی ویزیت‌ها</div>
                    <div className="space-y-2">
                      {detail.history.length === 0 ? <EmptyState text="سابقه‌ای ثبت نشده." /> : null}
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
                    </div>
                  </div>

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
                </div>
              )}
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
