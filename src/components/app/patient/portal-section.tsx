'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatCard, SectionHeader, LoadingBlock, EmptyState, Pill } from '../bits'
import { AssistantSection } from '../assistant-section'
import type { PortalOverview } from '../types'
import { APPOINTMENT_STATUS } from '@/lib/format'
import { formatToman } from '@/lib/format'
import { formatTime, formatJDate, formatDayRelative, weekdayName, faDigits } from '@/lib/jalali'
import { cn } from '@/lib/utils'
import {
  CalendarCheck, Wallet, Clock, MapPin, Phone, Stethoscope, BadgeCheck, Loader2,
  KeyRound, UserRound, CheckCircle2, Sparkles,
} from 'lucide-react'

export function PortalSection({ userName }: { userName: string }) {
  const [data, setData] = useState<PortalOverview | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // profile form
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  // password form
  const [curPass, setCurPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [savingPass, setSavingPass] = useState(false)

  const load = useCallback(() => {
    fetch('/api/portal').then((r) => r.json()).then((d) => {
      if (d.error) return
      setData(d)
      setPhone(d.profile.phone ?? '')
      setEmail(d.profile.email ?? '')
      setBirthYear(d.profile.birthYear ? String(d.profile.birthYear) : '')
    }).catch(() => {})
  }, [])
  useEffect(load, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  async function cancel(id: string) {
    setCancelling(id)
    try {
      const res = await fetch('/api/portal/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', appointmentId: id }),
      })
      const d = await res.json()
      setToast(res.ok ? (d.message ?? 'نوبت لغو شد') : (d.error ?? 'خطا در لغو نوبت'))
      if (res.ok) load()
    } finally {
      setCancelling(null)
    }
  }

  async function saveProfile() {
    setSavingProfile(true)
    try {
      const res = await fetch('/api/portal/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_profile', phone, email, birthYear }),
      })
      const d = await res.json()
      setToast(res.ok ? 'اطلاعات حساب به‌روزرسانی شد ✅' : (d.error ?? 'خطا'))
    } finally {
      setSavingProfile(false)
    }
  }

  async function changePass() {
    setSavingPass(true)
    try {
      const res = await fetch('/api/portal/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change_password', currentPassword: curPass, newPassword: newPass }),
      })
      const d = await res.json()
      setToast(res.ok ? 'رمز عبور تغییر کرد ✅' : (d.error ?? 'خطا'))
      if (res.ok) { setCurPass(''); setNewPass('') }
    } finally {
      setSavingPass(false)
    }
  }

  if (!data) return <LoadingBlock rows={5} />

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <SectionHeader
        title={`سلام ${userName} 👋`}
        subtitle="پرتال شخصی شما — نوبت‌ها، پرداخت‌ها و رزرو با دستیار هوشمند"
      />

      {toast ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm px-4 py-3">{toast}</div>
      ) : null}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="نوبت‌های پیش‌رو" value={faDigits(data.upcoming.length)} icon={<CalendarCheck className="h-4.5 w-4.5" />} />
        <StatCard title="مجموع پرداختی" value={data.totals.paidFa} tone="green" icon={<Wallet className="h-4.5 w-4.5" />} />
        <StatCard title="مانده حساب" value={data.totals.remainingFa} tone={data.totals.remainingFa === faDigits(0) + ' تومان' ? 'default' : 'red'} icon={<Clock className="h-4.5 w-4.5" />} />
        <StatCard title="ویزیت‌های انجام‌شده" value={faDigits(data.totals.visits)} icon={<BadgeCheck className="h-4.5 w-4.5" />} />
      </div>

      <Tabs
        defaultValue="appts"
        dir="rtl"
        onValueChange={(v) => {
          if (v === 'appts') load()
        }}
      >
        <TabsList className="rounded-xl bg-secondary/60 h-11">
          <TabsTrigger value="appts" className="rounded-lg">نوبت‌های من</TabsTrigger>
          <TabsTrigger value="book" className="rounded-lg">
            <Sparkles className="h-3.5 w-3.5 ml-1 text-[#C9A227]" /> رزرو با شینا
          </TabsTrigger>
          <TabsTrigger value="payments" className="rounded-lg">پرداخت‌های من</TabsTrigger>
          <TabsTrigger value="profile" className="rounded-lg">پروفایل من</TabsTrigger>
        </TabsList>

        {/* ---------- نوبت‌های من ---------- */}
        <TabsContent value="appts" className="mt-4 space-y-5">
          <div>
            <h3 className="text-sm font-bold mb-2.5">نوبت‌های پیش‌رو</h3>
            {data.upcoming.length === 0 ? (
              <EmptyState text="نوبت فعالی ندارید — از تب «رزرو با شینا» همان‌جا نوبت بگیرید" />
            ) : (
              <div className="space-y-2.5">
                {data.upcoming.map((a) => {
                  const st = APPOINTMENT_STATUS[a.status]
                  return (
                    <Card key={a.id} className="rounded-2xl shadow-sm">
                      <CardContent className="p-4 flex flex-wrap items-center gap-3">
                        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground text-xs font-bold">
                          {formatTime(new Date(a.start))}
                        </span>
                        <div className="min-w-[200px]">
                          <div className="font-semibold text-sm">{a.service.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {formatDayRelative(new Date(a.start))} {weekdayName(new Date(a.start))} {formatJDate(new Date(a.start))}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Stethoscope className="h-3.5 w-3.5" /> {a.doctor.name}
                        </span>
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" /> {a.branch?.name ?? '—'}
                        </span>
                        <Pill label={st.label} color={st.color} />
                        <div className="flex-1" />
                        <span className="text-xs font-semibold">{formatToman(a.price)}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg h-8 text-rose-600 hover:text-rose-700"
                          disabled={cancelling === a.id}
                          onClick={() => cancel(a.id)}
                        >
                          {cancelling === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'لغو نوبت'}
                        </Button>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold mb-2.5">تاریخچه‌ی من</h3>
            {data.past.length === 0 ? (
              <EmptyState text="تاریخچه‌ای ثبت نشده" />
            ) : (
              <Card className="rounded-2xl shadow-sm">
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-right">تاریخ</TableHead>
                          <TableHead className="text-right">خدمت</TableHead>
                          <TableHead className="text-right">پزشک</TableHead>
                          <TableHead className="text-right">شعبه</TableHead>
                          <TableHead className="text-right">وضعیت</TableHead>
                          <TableHead className="text-right">مبلغ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.past.map((a) => {
                          const st = APPOINTMENT_STATUS[a.status]
                          return (
                            <TableRow key={a.id}>
                              <TableCell className="text-xs">{formatJDate(new Date(a.start), false)}</TableCell>
                              <TableCell className="text-xs">{a.service.name}</TableCell>
                              <TableCell className="text-xs">{a.doctor.name}</TableCell>
                              <TableCell className="text-xs">{a.branch?.name ?? '—'}</TableCell>
                              <TableCell><Pill label={st.label} color={st.color} /></TableCell>
                              <TableCell className="text-xs">
                                {formatToman(a.price)}
                                {!a.paid && a.status === 'DONE' ? <span className="text-[10px] text-rose-600 mr-1">(پرداخت نشده)</span> : null}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Branch info */}
          <div>
            <h3 className="text-sm font-bold mb-2.5">شعب ما</h3>
            <div className="grid md:grid-cols-3 gap-3">
              {data.branches.map((b) => (
                <Card key={b.id} className="rounded-2xl shadow-sm">
                  <CardContent className="p-4 text-xs space-y-1.5">
                    <div className="font-bold text-sm">{b.name}</div>
                    <div className="text-muted-foreground flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0" /> {b.address}</div>
                    <div className="text-muted-foreground flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" /> <span dir="ltr">{b.phone}</span></div>
                    <div className="text-muted-foreground flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 shrink-0" /> {faDigits(b.openHour)} تا {faDigits(b.closeHour)}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ---------- رزرو با شینا ---------- */}
        <TabsContent value="book" className="mt-4">
          <AssistantSection
            patient={{
              id: data.profile.patientId,
              name: `${data.profile.firstName} ${data.profile.lastName}`,
              phone: data.profile.phone,
            }}
          />
        </TabsContent>

        {/* ---------- پرداخت‌ها ---------- */}
        <TabsContent value="payments" className="mt-4 space-y-5">
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-5">
              <div className="text-sm font-bold mb-3">پرداخت‌های خدماتی</div>
              {data.past.filter((a) => a.status === 'DONE').length === 0 ? (
                <EmptyState text="پرداختی ثبت نشده" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-right">تاریخ</TableHead>
                        <TableHead className="text-right">خدمت</TableHead>
                        <TableHead className="text-right">مبلغ</TableHead>
                        <TableHead className="text-right">وضعیت</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.past.filter((a) => a.status === 'DONE').map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-xs">{formatJDate(new Date(a.start), false)}</TableCell>
                          <TableCell className="text-xs">{a.service.name}</TableCell>
                          <TableCell className="text-xs">{formatToman(a.price)}</TableCell>
                          <TableCell>
                            <Pill
                              label={a.paid ? 'پرداخت‌شده' : 'در انتظار پرداخت'}
                              color={a.paid ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-5">
              <div className="text-sm font-bold mb-3">خرید محصولات</div>
              {data.sales.length === 0 ? (
                <EmptyState text="خرید محصولی ثبت نشده" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-right">تاریخ</TableHead>
                        <TableHead className="text-right">محصول</TableHead>
                        <TableHead className="text-right">تعداد</TableHead>
                        <TableHead className="text-right">مبلغ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.sales.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="text-xs">{formatJDate(new Date(s.date), false)}</TableCell>
                          <TableCell className="text-xs">{s.product.name}</TableCell>
                          <TableCell className="text-xs">{faDigits(s.qty)} {s.product.unit}</TableCell>
                          <TableCell className="text-xs">{formatToman(s.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- پروفایل ---------- */}
        <TabsContent value="profile" className="mt-4 space-y-4">
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <UserRound className="h-6 w-6" />
                </span>
                <div>
                  <div className="font-bold">{data.profile.firstName} {data.profile.lastName}</div>
                  <div className="text-[11px] text-muted-foreground">
                    کد ملی: {data.profile.nationalId ?? '—'} · سال تولد: {data.profile.birthYear ? faDigits(data.profile.birthYear) : '—'}
                    {data.profile.incompleteTreatment ? ' · درمان نیمه‌کاره دارید' : ''}
                  </div>
                </div>
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>شماره موبایل</Label>
                  <Input dir="ltr" className="text-left" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>ایمیل</Label>
                  <Input dir="ltr" className="text-left" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
                </div>
                <div className="space-y-1.5">
                  <Label>سال تولد (شمسی)</Label>
                  <Input dir="ltr" className="text-left" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} placeholder="1370" />
                </div>
              </div>
              <Button onClick={saveProfile} disabled={savingProfile} className="rounded-xl">
                {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 ml-1" />} ذخیره تغییرات
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold">
                <KeyRound className="h-4 w-4 text-primary" /> تغییر رمز عبور
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>رمز فعلی</Label>
                  <Input dir="ltr" className="text-left" type="password" value={curPass} onChange={(e) => setCurPass(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>رمز جدید (حداقل ۶ کاراکتر)</Label>
                  <Input dir="ltr" className="text-left" type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={changePass} disabled={savingPass || !curPass || newPass.length < 6} className="rounded-xl w-full">
                    {savingPass ? <Loader2 className="h-4 w-4 animate-spin" /> : 'تغییر رمز'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
