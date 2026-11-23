'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SectionHeader, Pill, Avatar, LoadingBlock } from './bits'
import type { Appointment, Doctor, PatientLite, Service } from './types'
import { APPOINTMENT_STATUS, SOURCE_LABEL, formatToman } from '@/lib/format'
import { formatJDate, formatTime, weekdayName, faDigits } from '@/lib/jalali'
import { ChevronRight, ChevronLeft, Plus, CalendarDays } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const HOUR_H = 56 // px per hour
const START_H = 9
const END_H = 20

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function AppointmentsSection() {
  const [day, setDay] = useState<Date>(new Date())
  const [appts, setAppts] = useState<Appointment[] | null>(null)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [patients, setPatients] = useState<PatientLite[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [open, setOpen] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async (d: Date) => {
    setAppts(null)
    const r = await fetch(`/api/appointments?date=${isoDay(d)}`)
    const j = await r.json()
    setAppts(j.appointments ?? [])
  }, [])

  useEffect(() => {
    load(day)
  }, [day, load])

  useEffect(() => {
    fetch('/api/meta').then((r) => r.json()).then((j) => {
      setDoctors(j.doctors ?? [])
      setServices(j.services ?? [])
    }).catch(() => {})
    fetch('/api/patients').then((r) => r.json()).then((j) => setPatients(j.patients ?? [])).catch(() => {})
  }, [])

  const hours = useMemo(() => Array.from({ length: END_H - START_H }, (_, i) => START_H + i), [])

  const yOf = (iso: string) => {
    const d = new Date(iso)
    return ((d.getUTCHours() + d.getUTCMinutes() / 60) - START_H) * HOUR_H
  }
  const hOf = (a: Appointment) => Math.max((a.service.durationMin / 60) * HOUR_H, 34)

  const changeStatus = async (a: Appointment, status: string) => {
    const r = await fetch(`/api/appointments/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (r.ok) {
      toast({ title: 'وضعیت نوبت به‌روزرسانی شد', description: `${a.patient.firstName} ${a.patient.lastName} — ${APPOINTMENT_STATUS[status].label}` })
      load(day)
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="نوبت‌ها و تقویم" subtitle="تقویم شمسی روزانه به تفکیک پزشک — کلیک روی نوبت برای تغییر وضعیت">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="rounded-xl h-9 w-9" aria-label="روز قبل" onClick={() => setDay(new Date(day.getTime() - 86400000))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="rounded-xl border bg-card px-4 py-1.5 text-center min-w-[150px]">
            <div className="text-sm font-bold">{formatJDate(day)}</div>
            <div className="text-[10px] text-muted-foreground">{weekdayName(day)}</div>
          </div>
          <Button variant="outline" size="icon" className="rounded-xl h-9 w-9" aria-label="روز بعد" onClick={() => setDay(new Date(day.getTime() + 86400000))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" className="rounded-xl text-xs" onClick={() => setDay(new Date())}>
            امروز
          </Button>
        </div>
        <AddAppointmentDialog
          day={day}
          doctors={doctors}
          patients={patients}
          services={services}
          open={open}
          setOpen={setOpen}
          onDone={() => load(day)}
          toast={toast}
        />
      </SectionHeader>

      {/* legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(APPOINTMENT_STATUS).map(([k, v]) => (
          <Pill key={k} label={v.label} color={v.color} />
        ))}
      </div>

      <Card className="rounded-2xl overflow-hidden">
        <CardContent className="p-0">
          {!appts ? (
            <div className="p-4"><LoadingBlock rows={5} /></div>
          ) : (
            <div className="overflow-x-auto scroll-thin">
              <div className="min-w-[640px]">
                {/* header row */}
                <div className="grid border-b bg-muted/40" style={{ gridTemplateColumns: `64px repeat(${doctors.length}, 1fr)` }}>
                  <div className="py-2.5 text-[11px] text-muted-foreground text-center">ساعت</div>
                  {doctors.map((d) => (
                    <div key={d.id} className="py-2.5 flex items-center justify-center gap-2 border-r border-border/70 px-2">
                      <Avatar name={d.name} color={d.color} size={26} />
                      <div className="text-center">
                        <div className="text-xs font-bold">{d.name}</div>
                        <div className="text-[10px] text-muted-foreground">{d.specialty}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* grid body */}
                <div className="grid relative" style={{ gridTemplateColumns: `64px repeat(${doctors.length}, 1fr)` }}>
                  {/* hour column */}
                  <div>
                    {hours.map((h) => (
                      <div key={h} className="text-[10px] text-muted-foreground text-center border-b border-border/60 relative" style={{ height: HOUR_H }}>
                        <span className="absolute top-0.5 right-1/2 translate-x-1/2">{faDigits(String(h).padStart(2, '0'))}:۰۰</span>
                      </div>
                    ))}
                  </div>
                  {/* doctor columns */}
                  {doctors.map((doc) => (
                    <div key={doc.id} className="relative border-r border-border/60">
                      {hours.map((h) => (
                        <div key={h} className="border-b border-border/60" style={{ height: HOUR_H }} />
                      ))}
                      {appts
                        .filter((a) => a.doctorId === doc.id)
                        .map((a) => {
                          const st = APPOINTMENT_STATUS[a.status]
                          const top = yOf(a.start)
                          const height = hOf(a)
                          return (
                            <AppointmentBlock key={a.id} a={a} top={top} height={height} st={st} onChange={changeStatus} />
                          )
                        })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AppointmentBlock({
  a, top, height, st, onChange,
}: {
  a: Appointment
  top: number
  height: number
  st: { label: string; color: string }
  onChange: (a: Appointment, status: string) => void
}) {
  const [open, setOpen] = useState(false)
  const statusColors: Record<string, string> = {
    PENDING: 'bg-amber-50 border-amber-300 text-amber-900',
    CONFIRMED: 'bg-emerald-50 border-emerald-300 text-emerald-900',
    DONE: 'bg-violet-50 border-violet-300 text-violet-900',
    CANCELLED: 'bg-stone-50 border-stone-300 text-stone-500',
    NO_SHOW: 'bg-rose-50 border-rose-300 text-rose-900',
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className={`absolute inset-x-1.5 rounded-lg border-r-4 border px-2 py-1 text-right overflow-hidden hover:shadow-md transition-shadow ${statusColors[a.status]}`}
          style={{ top: top + 1, height: height - 2 }}
        >
          <div className="text-[11px] font-bold leading-4 truncate">
            {formatTime(new Date(a.start))} · {a.patient.firstName} {a.patient.lastName}
          </div>
          {height > 52 ? (
            <div className="text-[10px] opacity-80 truncate">{a.service.name} · {SOURCE_LABEL[a.source] ?? a.source}</div>
          ) : null}
        </button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">جزئیات نوبت</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-xl border p-3 space-y-2 bg-background/60">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">بیمار</span>
              <span className="font-semibold">{a.patient.firstName} {a.patient.lastName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">پزشک</span>
              <span className="font-semibold">{a.doctor.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">خدمت</span>
              <span className="font-semibold">{a.service.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">زمان</span>
              <span className="font-semibold">{formatJDate(new Date(a.start))} — {formatTime(new Date(a.start))}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">مبلغ</span>
              <span className="font-semibold">{formatToman(a.price)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">منبع ثبت</span>
              <span className="font-semibold">{SOURCE_LABEL[a.source] ?? a.source}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">وضعیت</span>
              <Pill label={st.label} color={st.color} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {['CONFIRMED', 'DONE', 'CANCELLED', 'NO_SHOW'].map((s) => (
              <Button
                key={s}
                size="sm"
                variant={a.status === s ? 'default' : 'outline'}
                className="rounded-xl text-xs"
                onClick={() => {
                  onChange(a, s)
                  setOpen(false)
                }}
              >
                {APPOINTMENT_STATUS[s].label}
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AddAppointmentDialog({
  day, doctors, patients, services, open, setOpen, onDone, toast,
}: {
  day: Date
  doctors: Doctor[]
  patients: PatientLite[]
  services: Service[]
  open: boolean
  setOpen: (v: boolean) => void
  onDone: () => void
  toast: ReturnType<typeof useToast>['toast']
}) {
  const [patientId, setPatientId] = useState<string>('')
  const [doctorId, setDoctorId] = useState<string>('')
  const [serviceId, setServiceId] = useState<string>('')
  const [hour, setHour] = useState<string>('10')
  const [minute, setMinute] = useState<string>('00')
  const [reason, setReason] = useState<string>('')
  const [deposit, setDeposit] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [roomId, setRoomId] = useState<string>('')
  const [rooms, setRooms] = useState<{ id: string; name: string; type: string }[]>([])
  // فهرست بیماران/پزشکان/خدمات از طریق props از والد می‌آید و اینجا بارگیری مجدد نمی‌شود
  // اتاق/یونیت‌های شعبه — برای تخصیص اختیاری نوبت به اتاق
  useEffect(() => {
    if (!open) return
    fetch('/api/rooms')
      .then((r) => r.json())
      .then((j) => setRooms((j.rooms ?? []).filter((x: { active?: boolean }) => x.active !== false)))
      .catch(() => {})
  }, [open])

  const submit = async () => {
    if (!patientId || !doctorId || !serviceId) {
      toast({ title: 'لطفاً همه‌ی فیلدها را انتخاب کنید', variant: 'destructive' })
      return
    }
    setSaving(true)
    const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), Number(hour), Number(minute), 0, 0))
    if (isNaN(start.getTime())) { setErr('زمان انتخابی نامعتبر است'); setSaving(false); return }
    const r = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId, doctorId, serviceId, start: start.toISOString(), source: 'PANEL',
        reason: reason.trim() || undefined,
        deposit: deposit ? Math.max(0, Math.round(Number(deposit) || 0)) : undefined,
        roomUnitId: roomId && roomId !== '—' ? roomId : undefined,
      }),
    })
    setSaving(false)
    const j = await r.json().catch(() => ({}))
    if (r.ok) {
      toast({ title: 'نوبت ثبت شد', description: `${formatJDate(day)} ساعت ${faDigits(hour + ':' + minute)}` })
      setOpen(false)
      onDone()
    } else {
      const msg = String(j.error ?? 'خطا در ثبت نوبت')
      setErr(msg)
      toast({ title: msg, variant: 'destructive' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-xl">
          <Plus className="h-4 w-4 ml-1" /> نوبت جدید
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" /> ثبت نوبت جدید
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">بیمار</label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger className="w-full rounded-xl mt-1"><SelectValue placeholder="انتخاب بیمار" /></SelectTrigger>
              <SelectContent>
                {patients.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName} — {faDigits(p.phone)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">خدمت</label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger className="w-full rounded-xl mt-1"><SelectValue placeholder="انتخاب خدمت" /></SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} — {formatToman(s.price)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">پزشک</label>
            <Select value={doctorId} onValueChange={setDoctorId}>
              <SelectTrigger className="w-full rounded-xl mt-1"><SelectValue placeholder="انتخاب پزشک" /></SelectTrigger>
              <SelectContent>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">ساعت</label>
              <Select value={hour} onValueChange={setHour}>
                <SelectTrigger className="w-full rounded-xl mt-1"><SelectValue /></SelectTrigger>
                <SelectContent dir="ltr">
                  {Array.from({ length: 10 }, (_, i) => i + 9).map((h) => (
                    <SelectItem key={h} value={String(h)}>{faDigits(String(h).padStart(2, '0'))}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">دقیقه</label>
              <Select value={minute} onValueChange={setMinute}>
                <SelectTrigger className="w-full rounded-xl mt-1"><SelectValue /></SelectTrigger>
                <SelectContent dir="ltr">
                  {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map((m) => (
                    <SelectItem key={m} value={m}>{faDigits(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">علت مراجعه</label>
            <Input className="rounded-xl mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: درد دندان عقل" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">بیعانه (تومان)</label>
            <Input className="rounded-xl mt-1" dir="ltr" value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/\D/g, ''))} placeholder="0" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">اتاق / یونیت (اختیاری)</label>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger className="w-full rounded-xl mt-1"><SelectValue placeholder="بدون تخصیص" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="—">بدون تخصیص</SelectItem>
                {rooms.map((rm) => (
                  <SelectItem key={rm.id} value={rm.id}>{rm.type === 'UNIT' ? 'یونیت' : 'اتاق'} {rm.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {err ? <div className="text-xs text-rose-600 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2">{err}</div> : null}
          <Button className="w-full rounded-xl" onClick={submit} disabled={saving}>
            {saving ? 'در حال ثبت…' : 'ثبت نوبت'}
          </Button>
          <p className="text-[11px] text-muted-foreground">تداخل پزشک و اتاق، تعطیلات و ساعات کاری شعبه به‌صورت خودکار کنترل می‌شود. یادآوری پیامکی در وضعیت «در انتظار ارسال» ثبت می‌گردد.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
