'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { SectionHeader, Pill, LoadingBlock, EmptyState } from './bits'
import { faDigits, formatJDate } from '@/lib/jalali'
import { Hourglass, PhoneCall, CalendarPlus, XCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

type WaitItem = {
  id: string; status: string; priority: string; note: string | null; createdAt: string
  patient: { id: string; firstName: string; lastName: string; phone: string }
  doctor: { id: string; name: string } | null
}

export function WaitlistSection() {
  const { toast } = useToast()
  const [items, setItems] = useState<WaitItem[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [bookItem, setBookItem] = useState<WaitItem | null>(null)
  const [services, setServices] = useState<{ id: string; name: string; price: number }[]>([])

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/waitlist').then((r) => r.json()).then((d) => setItems((d.items ?? []) as WaitItem[])).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  async function action(id: string, act: 'cancel' | 'offer') {
    await fetch(`/api/waitlist/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: act }) })
    toast({ title: act === 'cancel' ? 'از صف حذف شد' : 'پیشنهاد ظرفیت ثبت شد' })
    load()
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="صف انتظار نوبت" subtitle="بیمارانی که منتظر ظرفیت خالی هستند — با اولین کنسلی، همین لیست را زنگ بزنید">
        <Button className="rounded-xl" onClick={() => setAddOpen(true)}><Hourglass className="h-4 w-4" /> افزودن به صف</Button>
      </SectionHeader>

      {loading ? <LoadingBlock rows={3} /> : items.length === 0 ? <EmptyState text="صف انتظار خالی است" /> : (
        <div className="space-y-2.5">
          {items.map((w) => (
            <Card key={w.id} className="rounded-2xl border">
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm">{w.patient.firstName} {w.patient.lastName}</span>
                    <Pill label={w.priority === 'URGENT' ? 'فوری' : w.priority === 'LOW' ? 'اولویت کم' : 'معمولی'} color={w.priority === 'URGENT' ? 'bg-rose-100 text-rose-700 border-rose-200' : w.priority === 'LOW' ? 'bg-stone-100 text-stone-600 border-stone-200' : 'bg-sky-100 text-sky-800 border-sky-200'} />
                    {w.doctor && <Pill label={w.doctor.name} color="bg-teal-100 text-teal-800 border-teal-200" />}
                    <span className="text-[11px] text-muted-foreground">{faDigits(w.patient.phone)}</span>
                  </div>
                  {w.note && <div className="text-xs text-muted-foreground mt-1">{w.note}</div>}
                  <div className="text-[11px] text-muted-foreground mt-0.5">ثبت‌شده {formatJDate(new Date(w.createdAt))}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={() => action(w.id, 'offer')}><PhoneCall className="h-4 w-4" /> تماس و پیشنهاد</Button>
                  <Button size="sm" className="rounded-lg" onClick={() => setBookItem(w)}><CalendarPlus className="h-4 w-4" /> رزرو نوبت</Button>
                  <Button size="sm" variant="ghost" className="rounded-lg text-red-500" onClick={() => action(w.id, 'cancel')}><XCircle className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>افزودن به صف انتظار</DialogTitle></DialogHeader>
          <WaitAddForm onDone={() => { setAddOpen(false); load() }} toast={toast} />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(bookItem)} onOpenChange={(o) => { if (!o) setBookItem(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>رزرو برای {bookItem?.patient.firstName} {bookItem?.patient.lastName}</DialogTitle></DialogHeader>
          {bookItem && (
            <BookForm
              item={bookItem}
              services={services}
              onServices={(s) => setServices(s)}
              onDone={() => { setBookItem(null); load(); toast({ title: 'نوبت ثبت شد ✓', description: 'بیمار از صف خارج شد' }) }}
              toast={toast}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function WaitAddForm({ onDone, toast }: { onDone: () => void; toast: ReturnType<typeof useToast>['toast'] }) {
  const [patients, setPatients] = useState<{ id: string; firstName: string; lastName: string }[]>([])
  const [patientId, setPatientId] = useState('')
  const [note, setNote] = useState('')
  const [priority, setPriority] = useState('NORMAL')
  useEffect(() => {
    fetch('/api/patients').then((r) => r.json()).then((d) => setPatients((d.patients ?? []).slice(0, 30) as { id: string; firstName: string; lastName: string }[]))
  }, [])
  async function submit() {
    if (!patientId) { toast({ title: 'خطا', description: 'بیمار را انتخاب کنید', variant: 'destructive' }); return }
    await fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patientId, note, priority }) })
    toast({ title: 'به صف اضافه شد ✓' })
    onDone()
  }
  return (
    <div className="space-y-3">
      <div><Label>بیمار</Label>
        <Select value={patientId || 'none'} onValueChange={(v) => setPatientId(v === 'none' ? '' : v)}>
          <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="none">— انتخاب —</SelectItem>{patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>اولویت</Label>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="LOW">کم</SelectItem><SelectItem value="NORMAL">معمولی</SelectItem><SelectItem value="URGENT">فوری</SelectItem></SelectContent>
        </Select>
      </div>
      <div><Label>یادداشت</Label><Input value={note} onChange={(e) => setNote(e.target.value)} className="rounded-xl" placeholder="مثلاً فقط بعدازظهرها" /></div>
      <Button className="w-full rounded-xl" onClick={submit}>افزودن</Button>
    </div>
  )
}

function BookForm({ item, services, onServices, onDone, toast }: {
  item: WaitItem
  services: { id: string; name: string; price: number }[]
  onServices: (s: { id: string; name: string; price: number }[]) => void
  onDone: () => void
  toast: ReturnType<typeof useToast>['toast']
}) {
  const [serviceId, setServiceId] = useState('')
  const [start, setStart] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (services.length) return
    fetch('/api/meta').then((r) => r.json()).then((d) => onServices((d.services ?? []) as { id: string; name: string; price: number }[]))
  }, [services, onServices])

  async function submit() {
    if (!serviceId || !start) { toast({ title: 'خطا', description: 'خدمت و زمان لازم است', variant: 'destructive' }); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/waitlist/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'book', serviceId, start, doctorId: item.doctor?.id }) })
      if (!res.ok) throw new Error('ثبت ناموفق بود')
      onDone()
    } catch (e) { toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' }) }
    finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <div><Label>خدمت</Label>
        <Select value={serviceId || 'none'} onValueChange={(v) => setServiceId(v === 'none' ? '' : v)}>
          <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="none">— انتخاب —</SelectItem>{services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({faDigits(s.price)})</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>زمان (تاریخ و ساعت)</Label><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-xl" /></div>
      <Button className="w-full rounded-xl" onClick={submit} disabled={busy}>ثبت نوبت</Button>
    </div>
  )
}
