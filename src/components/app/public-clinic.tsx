'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { faDigits } from '@/lib/jalali'
import { CalendarCheck, CheckCircle2, MapPin, Phone, Stethoscope, Sparkles } from 'lucide-react'
import { formatToman } from '@/lib/format'

type BranchPublic = {
  id: string; code: string; name: string; city: string; address: string; phone: string
  openHour: number; closeHour: number; thuCloseHour: number | null; closedFri: boolean
  doctorCount: number
  doctors: { id: string; name: string; specialty: string; color: string }[]
}
type ServicePublic = { id: string; name: string; category: string; price: number; durationMin: number }

export function PublicClinic({ branchCode }: { branchCode?: string }) {
  const [branches, setBranches] = useState<BranchPublic[]>([])
  const [services, setServices] = useState<ServicePublic[]>([])
  const [selected, setSelected] = useState<string>('')
  const [form, setForm] = useState({ name: '', phone: '', serviceId: '', note: '' })
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/branches?code=${encodeURIComponent(branchCode ?? '')}`).then((r) => r.json()).then((d) => {
      const list = (d.branches ?? []) as BranchPublic[]
      setBranches(list)
      const initial = branchCode ? list.find((b) => b.code === branchCode) : list[0]
      setSelected(initial?.id ?? '')
    }).catch(() => {})
  }, [branchCode])
  useEffect(() => {
    // خدمات و پزشکان عمومی فقط برای شعبهٔ انتخابی — بدون افشای سایر کلینیک‌ها
    if (!selected) return
    fetch(`/api/meta?branchId=${encodeURIComponent(selected)}`).then((r) => r.json()).then((d) => setServices((d.services ?? []) as ServicePublic[])).catch(() => {})
  }, [selected])

  const branch = branches.find((b) => b.id === selected)

  const submit = useCallback(async () => {
    if (!form.name.trim() || !form.phone.trim()) { setError('نام و شماره تماس را وارد کنید'); return }
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/public-booking', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, branchId: selected, serviceId: form.serviceId || undefined }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error((d as { error?: string }).error ?? 'خطا')
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ثبت درخواست')
    } finally { setBusy(false) }
  }, [form, selected])

  return (
    <div className="min-h-screen bg-linear-to-b from-sky-50 via-white to-white">
      {/* Hero */}
      <div className="bg-linear-to-l from-sky-600 via-sky-500 to-teal-500 text-white">
        <div className="max-w-5xl mx-auto px-4 py-14 md:py-20">
          <div className="flex items-center gap-3 mb-6" dir="ltr">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
              <img src="/10on-icon.svg" alt="10on" className="h-8 w-8" aria-hidden="true" />
            </span>
            <span className="text-2xl font-extrabold brand-gradient-text-none">10on</span>
          </div>
          <h1 className="text-2xl md:text-4xl font-extrabold leading-relaxed">
            نوبت‌دهی آنلاین {branch?.name ?? 'کلینیک دندان‌پزشکی لبخند مهر'}
          </h1>
          <p className="mt-3 text-white/85 text-sm md:text-base max-w-2xl leading-7">
            فرم را پر کنید؛ همکاران ما ظرف یک ساعت کاری برای هماهنگی نهایی تماس می‌گیرند. بدون تماس تلفنی و انتظار.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            {branch && (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5"><MapPin className="h-4 w-4" /> {branch.city} — {branch.address}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5"><Phone className="h-4 w-4" /> {faDigits(branch.phone)}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5"><CalendarCheck className="h-4 w-4" /> {faDigits(branch.openHour)} تا {faDigits(branch.closeHour)} {branch.closedFri ? '· جمعه‌ها تعطیل' : ''}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10 grid md:grid-cols-2 gap-8">
        {/* فرم رزرو */}
        <div className="rounded-3xl border bg-white shadow-xl shadow-sky-100 p-6">
          {done ? (
            <div className="text-center py-10">
              <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
              <h2 className="text-lg font-bold mt-4">درخواست شما ثبت شد ✓</h2>
              <p className="text-sm text-muted-foreground mt-2 leading-6">همکاران پذیرش برای هماهنگی نهایی با شما تماس می‌گیرند.<br />شماره پیگیری برای اطمینان یادداشت کنید.</p>
              <button className="mt-4 text-sm text-sky-600 underline" onClick={() => { setDone(false); setForm({ name: '', phone: '', serviceId: '', note: '' }) }}>ثبت درخواست دیگر</button>
            </div>
          ) : (
            <>
              <h2 className="font-bold text-lg mb-1">درخواست نوبت</h2>
              <p className="text-xs text-muted-foreground mb-4">کمتر از یک دقیقه طول می‌کشد</p>
              <div className="space-y-3">
                <div><Label>شعبه</Label>
                  <Select value={selected} onValueChange={setSelected}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>نام و نام خانوادگی</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-xl" placeholder="مثلاً مینا کریمی" /></div>
                <div><Label>شماره موبایل</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded-xl" placeholder="۰۹۱۲..." dir="ltr" /></div>
                <div><Label>خدمت موردنظر (اختیاری)</Label>
                  <Select value={form.serviceId || 'none'} onValueChange={(v) => setForm({ ...form, serviceId: v === 'none' ? '' : v })}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">مشاوره و معاینه</SelectItem>
                      {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({formatToman(s.price)})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>یادداشت (اختیاری)</Label><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="rounded-xl" placeholder="مثلاً درد دارم، ترجیحاً عصر" /></div>
                {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-2.5">{error}</div>}
                <Button className="w-full rounded-xl h-11 text-sm" onClick={submit} disabled={busy}>
                  <CalendarCheck className="h-4 w-4" /> {busy ? 'در حال ثبت…' : 'ثبت درخواست نوبت'}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* خدمات و پزشکان */}
        <div className="space-y-6">
          <div>
            <h3 className="font-bold mb-3 flex items-center gap-2"><Stethoscope className="h-4 w-4 text-sky-600" /> پزشکان {branch?.name ?? ''}</h3>
            <div className="space-y-2.5">
              {branch?.doctors.map((d) => (
                <div key={d.id} className="flex items-center gap-3 rounded-2xl border bg-white p-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white font-bold" style={{ background: d.color }}>{d.name.replace('دکتر ', '').charAt(0)}</span>
                  <div><div className="text-sm font-bold">{d.name}</div><div className="text-xs text-muted-foreground">{d.specialty}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-bold mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-teal-600" /> خدمات پرطرفدار</h3>
            <div className="grid grid-cols-2 gap-2.5">
              {services.slice(0, 8).map((s) => (
                <div key={s.id} className="rounded-2xl border bg-white p-3">
                  <div className="text-xs font-bold truncate">{s.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">{formatToman(s.price)} · {faDigits(s.durationMin)} دقیقه</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        <span dir="ltr" className="font-bold">10on</span> — سامانه مدیریت هوشمند کلینیک · لبخند شما، سرمایه ماست
      </footer>
    </div>
  )
}
