'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { SectionHeader, LoadingBlock, EmptyState, Avatar } from '../bits'
import type { BranchInfo } from '../types'
import { faDigits } from '@/lib/jalali'
import { millionsShort } from '@/lib/format'
import { Building2, Plus, MapPin, Phone, Clock, Pencil, Power, Users, Loader2 } from 'lucide-react'

type FormState = {
  id?: string
  code: string
  name: string
  city: string
  address: string
  phone: string
  openHour: string
  closeHour: string
  thuCloseHour: string
}

const EMPTY: FormState = { code: '', name: '', city: '', address: '', phone: '', openHour: '9', closeHour: '19', thuCloseHour: '' }

export function BranchesSection() {
  const [branches, setBranches] = useState<BranchInfo[] | null>(null)
  const [dialog, setDialog] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/branches').then((r) => r.json()).then((d) => setBranches(d.branches ?? [])).catch(() => setBranches([]))
  }, [])
  useEffect(load, [load])

  function openCreate() {
    setForm(EMPTY)
    setError(null)
    setDialog(true)
  }

  function openEdit(b: BranchInfo) {
    setForm({
      id: b.id,
      code: b.code,
      name: b.name,
      city: b.city,
      address: b.address,
      phone: b.phone,
      openHour: String(b.openHour),
      closeHour: String(b.closeHour),
      thuCloseHour: b.thuCloseHour ? String(b.thuCloseHour) : '',
    })
    setError(null)
    setDialog(true)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        code: form.code,
        name: form.name,
        city: form.city,
        address: form.address,
        phone: form.phone,
        openHour: Number(form.openHour) || 9,
        closeHour: Number(form.closeHour) || 19,
        thuCloseHour: form.thuCloseHour ? Number(form.thuCloseHour) : null,
      }
      const res = await fetch(form.id ? `/api/branches/${form.id}` : '/api/branches', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'خطا در ذخیره')
        return
      }
      setDialog(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(b: BranchInfo) {
    await fetch(`/api/branches/${b.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !b.isActive }),
    })
    load()
  }

  if (!branches) return <LoadingBlock rows={4} />

  const activeCount = branches.filter((b) => b.isActive).length

  return (
    <div className="space-y-5">
      <SectionHeader
        title="مدیریت شعب"
        subtitle={`${faDigits(activeCount)} شعبه فعال — آمار هر شعبه به‌صورت لحظه‌ای از نوبت‌ها و هزینه‌ها محاسبه می‌شود`}
      >
        <Button onClick={openCreate} className="rounded-xl">
          <Plus className="h-4 w-4 ml-1" /> شعبه جدید
        </Button>
      </SectionHeader>

      {branches.length === 0 ? (
        <EmptyState text="هنوز شعبه‌ای ثبت نشده است" />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {branches.map((b) => (
            <Card key={b.id} className={`rounded-2xl shadow-sm ${b.isActive ? '' : 'opacity-70'}`}>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${b.isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                      <Building2 className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold truncate">{b.name}</div>
                      <div className="text-[11px] text-muted-foreground">کد: {b.code} · {b.city}</div>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${b.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-stone-100 text-stone-500 border-stone-200'}`}>
                    {b.isActive ? 'فعال' : 'غیرفعال'}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{b.address}</span></div>
                  <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" /> <span dir="ltr">{b.phone}</span></div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    شنبه تا چهارشنبه {faDigits(b.openHour)} تا {faDigits(b.closeHour)} · پنجشنبه تا {faDigits(b.thuCloseHour ?? 13)} · جمعه تعطیل
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-secondary/60 p-2.5">
                    <div className="text-[10px] text-muted-foreground">نوبت این ماه</div>
                    <div className="text-sm font-bold mt-0.5">{faDigits(b.appointmentsMonth)}</div>
                  </div>
                  <div className="rounded-xl bg-secondary/60 p-2.5">
                    <div className="text-[10px] text-muted-foreground">درآمد ماه</div>
                    <div className="text-sm font-bold mt-0.5">{faDigits(millionsShort(b.revenueMonth))}</div>
                  </div>
                  <div className="rounded-xl bg-secondary/60 p-2.5">
                    <div className="text-[10px] text-muted-foreground">نوبت امروز</div>
                    <div className="text-sm font-bold mt-0.5">{faDigits(b.todayPending)}</div>
                  </div>
                </div>

                {/* Doctors */}
                <div className="flex items-center gap-2 flex-wrap">
                  {b.doctors.map((d) => (
                    <span key={d.id} className="inline-flex items-center gap-1.5 rounded-full border bg-background pl-2 pr-1 py-0.5 text-[11px]">
                      <Avatar name={d.name} color={d.color} size={20} />
                      {d.name}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Users className="h-3.5 w-3.5" /> {faDigits(b.staffCount)} کاربر
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t">
                  <Button variant="outline" size="sm" className="rounded-lg flex-1" onClick={() => openEdit(b)}>
                    <Pencil className="h-3.5 w-3.5 ml-1" /> ویرایش
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`rounded-lg flex-1 ${b.isActive ? 'text-rose-600 hover:text-rose-700' : 'text-emerald-600 hover:text-emerald-700'}`}
                    onClick={() => toggleActive(b)}
                  >
                    <Power className="h-3.5 w-3.5 ml-1" /> {b.isActive ? 'تعطیلی شعبه' : 'فعال‌سازی'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'ویرایش شعبه' : 'ایجاد شعبه جدید'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>کد شعبه (لاتین)</Label>
              <Input dir="ltr" className="text-left" value={form.code} disabled={Boolean(form.id)} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="TEHRAN-2" />
            </div>
            <div className="space-y-1.5">
              <Label>نام شعبه</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="شعبه تهرانپارس" />
            </div>
            <div className="space-y-1.5">
              <Label>شهر</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="تهران" />
            </div>
            <div className="space-y-1.5">
              <Label>تلفن</Label>
              <Input dir="ltr" className="text-left" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="021-12345678" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>آدرس کامل</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="خیابان، بلوار، پلاک" />
            </div>
            <div className="space-y-1.5">
              <Label>ساعت شروع</Label>
              <Input dir="ltr" className="text-left" type="number" min={7} max={12} value={form.openHour} onChange={(e) => setForm({ ...form, openHour: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>ساعت پایان</Label>
              <Input dir="ltr" className="text-left" type="number" min={15} max={23} value={form.closeHour} onChange={(e) => setForm({ ...form, closeHour: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>پایان پنجشنبه</Label>
              <Input dir="ltr" className="text-left" type="number" min={10} max={18} value={form.thuCloseHour} onChange={(e) => setForm({ ...form, thuCloseHour: e.target.value })} placeholder="13" />
            </div>
          </div>
          {error ? <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2">{error}</div> : null}
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDialog(false)}>انصراف</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ذخیره شعبه'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
