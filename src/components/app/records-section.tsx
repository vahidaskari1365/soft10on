'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { SectionHeader, Pill, LoadingBlock, EmptyState } from './bits'
import { formatJDate, faDigits } from '@/lib/jalali'
import { FolderOpen, Sparkles, AlertTriangle, Baby, Plus, Save } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const RECORD_TYPE_FA: Record<string, { label: string; color: string }> = {
  VISIT: { label: 'ویزیت', color: 'bg-sky-100 text-sky-800 border-sky-200' },
  TEST: { label: 'آزمایش', color: 'bg-teal-100 text-teal-800 border-teal-200' },
  IMAGING: { label: 'تصویربرداری', color: 'bg-violet-100 text-violet-800 border-violet-200' },
  NOTE: { label: 'یادداشت', color: 'bg-stone-100 text-stone-600 border-stone-200' },
  ALLERGY: { label: 'حساسیت', color: 'bg-rose-100 text-rose-700 border-rose-200' },
}

type Profile = {
  id: string; name: string; phone: string; birthYear: number | null
  allergies: string | null; isPregnant: boolean; chronicNote: string | null; incompleteTreatment: boolean
}
type RecordRow = { id: string; date: string; type: string; title: string; content: string; aiSummary?: string | null; source: string; doctor?: string | null }

export function RecordsSection({ isPatient, patientName }: { isPatient?: boolean; patientName?: string }) {
  const { toast } = useToast()
  const [patients, setPatients] = useState<{ id: string; firstName: string; lastName: string; phone: string }[]>([])
  const [selected, setSelected] = useState<string>('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [records, setRecords] = useState<RecordRow[]>([])
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [summarizing, setSummarizing] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editProfile, setEditProfile] = useState(false)

  useEffect(() => {
    if (isPatient) { setSelected('self'); load('self'); return }
    fetch('/api/patients').then((r) => r.json()).then((d) => setPatients((d.patients ?? []) as { id: string; firstName: string; lastName: string; phone: string }[]))
  }, [isPatient])

  const load = useCallback((pid: string) => {
    setLoading(true); setSummary(null)
    fetch(`/api/records${pid === 'self' ? '' : `?patient=${pid}`}`)
      .then((r) => r.json())
      .then((d) => { setProfile((d.profile ?? null) as Profile | null); setRecords((d.records ?? []) as RecordRow[]) })
      .finally(() => setLoading(false))
  }, [])

  async function generateSummary() {
    const pid = profile?.id
    if (!pid) return
    setSummarizing(true)
    try {
      const res = await fetch('/api/records/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patientId: pid }) })
      const d = await res.json()
      setSummary((d.summary as string) ?? 'خلاصه‌ای در دسترس نیست')
    } catch {
      toast({ title: 'خطا', description: 'تولید خلاصه ناموفق بود', variant: 'destructive' })
    } finally { setSummarizing(false) }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title={isPatient ? `پرونده من — ${patientName ?? ''}` : 'پرونده هوشمند'}
        subtitle={isPatient ? 'سوابق پزشکی، آزمایش‌ها و یادداشت‌های کلینیک' : 'تایم‌لاین پزشکی بیمار، هشدارهای ایمنی و خلاصه هوشمند پیش از ویزیت'}
      >
        {!isPatient && (
          <Select value={selected || 'none'} onValueChange={(v) => { setSelected(v === 'none' ? '' : v); if (v !== 'none') load(v) }}>
            <SelectTrigger className="w-56 rounded-xl text-sm"><SelectValue placeholder="انتخاب بیمار…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— انتخاب بیمار —</SelectItem>
              {patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName} ({faDigits(p.phone)})</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {!isPatient && selected && <Button className="rounded-xl" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> سند جدید</Button>}
      </SectionHeader>

      {!isPatient && !selected ? (
        <EmptyState text="برای مشاهده پرونده، یک بیمار را انتخاب کنید" />
      ) : loading ? <LoadingBlock rows={4} /> : !profile ? <EmptyState text="پرونده‌ای یافت نشد" /> : (
        <>
          {/* شناسنامه و هشدارها */}
          <Card className={`rounded-2xl border ${(profile.allergies || profile.isPregnant || profile.chronicNote) ? 'border-amber-300 bg-amber-50/50' : ''}`}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-bold">{profile.name} <span className="text-xs font-normal text-muted-foreground">· متولد {profile.birthYear ? faDigits(profile.birthYear) : '؟'}</span></div>
                  <div className="text-xs text-muted-foreground mt-1">{faDigits(profile.phone)}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {profile.allergies && <Pill label={`⚠ حساسیت: ${profile.allergies}`} color="bg-rose-100 text-rose-700 border-rose-200" />}
                  {profile.isPregnant && <Pill label="🤰 بارداری" color="bg-violet-100 text-violet-800 border-violet-200" />}
                  {profile.chronicNote && <Pill label={profile.chronicNote} color="bg-amber-100 text-amber-800 border-amber-200" />}
                  {profile.incompleteTreatment && <Pill label="درمان نیمه‌کاره" color="bg-sky-100 text-sky-800 border-sky-200" />}
                  {!isPatient && <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setEditProfile(true)}>ویرایش هشدارها</Button>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* خلاصه هوشمند */}
          {!isPatient && (
            <Card className="rounded-2xl border border-dashed border-sky-300 bg-sky-50/40">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4 text-sky-600" /> خلاصه هوشمند برای پیش‌زمینه ویزیت</div>
                  <Button size="sm" className="rounded-lg" onClick={generateSummary} disabled={summarizing}>{summarizing ? 'در حال تحلیل…' : 'تولید خلاصه'}</Button>
                </div>
                {summary ? <div className="text-sm whitespace-pre-wrap leading-6">{summary}</div> : <div className="text-xs text-muted-foreground">با یک کلیک، دستیار کل پرونده را خلاصه می‌کند (بدون تشخیص و تجویز).</div>}
              </CardContent>
            </Card>
          )}

          {/* تایم‌لاین */}
          <div className="space-y-3">
            {records.length === 0 && <EmptyState text="سندی در این پرونده ثبت نشده است" />}
            {records.map((r) => {
              const t = RECORD_TYPE_FA[r.type] ?? RECORD_TYPE_FA.NOTE
              return (
                <Card key={r.id} className="rounded-2xl border">
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Pill label={t.label} color={t.color} />
                        <span className="font-bold text-sm">{r.title}</span>
                        {r.source === 'PHOTO' && <Pill label="از روی عکس" color="bg-stone-100 text-stone-600 border-stone-200" />}
                        {r.source === 'VOICE' && <Pill label="صوتی" color="bg-stone-100 text-stone-600 border-stone-200" />}
                      </div>
                      <span className="text-[11px] text-muted-foreground">{formatJDate(new Date(r.date))}{r.doctor ? ` · ${r.doctor}` : ''}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 leading-6">{r.content}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* فرم سند جدید */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>ثبت سند بالینی</DialogTitle></DialogHeader>
          {selected && <RecordForm patientId={selected} onDone={() => { setAddOpen(false); load(selected) }} toast={toast} />}
        </DialogContent>
      </Dialog>

      {/* ویرایش هشدارها */}
      <Dialog open={editProfile} onOpenChange={setEditProfile}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>هشدارهای ایمنی — {profile?.name}</DialogTitle></DialogHeader>
          {profile && <SafetyForm profile={profile} onDone={() => { setEditProfile(false); load(profile.id) }} toast={toast} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RecordForm({ patientId, onDone, toast }: { patientId: string; onDone: () => void; toast: ReturnType<typeof useToast>['toast'] }) {
  const [type, setType] = useState('VISIT')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (!title.trim() || !content.trim()) { toast({ title: 'خطا', description: 'عنوان و متن لازم است', variant: 'destructive' }); return }
    setBusy(true)
    try {
      await fetch('/api/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patientId, type, title, content }) })
      toast({ title: 'سند ثبت شد ✓' })
      onDone()
    } catch { toast({ title: 'خطا', description: 'ثبت ناموفق بود', variant: 'destructive' }) }
    finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <div><Label>نوع سند</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="VISIT">ویزیت</SelectItem>
            <SelectItem value="TEST">آزمایش</SelectItem>
            <SelectItem value="IMAGING">تصویربرداری</SelectItem>
            <SelectItem value="NOTE">یادداشت</SelectItem>
            <SelectItem value="ALLERGY">حساسیت (به شناسنامه هم اضافه می‌شود)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div><Label>عنوان</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-xl" placeholder="مثلاً ویزیت ترمیمی دندان ۱۲" /></div>
      <div><Label>محتوا</Label><Textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} className="rounded-xl" /></div>
      <Button className="w-full rounded-xl" onClick={submit} disabled={busy}><Save className="h-4 w-4" /> ثبت در پرونده</Button>
    </div>
  )
}

function SafetyForm({ profile, onDone, toast }: { profile: Profile; onDone: () => void; toast: ReturnType<typeof useToast>['toast'] }) {
  const [allergies, setAllergies] = useState(profile.allergies ?? '')
  const [chronicNote, setChronicNote] = useState(profile.chronicNote ?? '')
  const [isPregnant, setIsPregnant] = useState(profile.isPregnant)
  const [busy, setBusy] = useState(false)
  async function submit() {
    setBusy(true)
    try {
      await fetch('/api/records', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patientId: profile.id, allergies, chronicNote, isPregnant }) })
      toast({ title: 'شناسنامه به‌روزرسانی شد ✓' })
      onDone()
    } catch { toast({ title: 'خطا', variant: 'destructive' }) }
    finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <div><Label>حساسیت‌های دارویی (جدا با ویرگول)</Label><Input value={allergies} onChange={(e) => setAllergies(e.target.value)} className="rounded-xl" placeholder="پنی‌سیلین، آسپرین" /></div>
      <div><Label>بیماری زمینه‌ای</Label><Input value={chronicNote} onChange={(e) => setChronicNote(e.target.value)} className="rounded-xl" placeholder="دیابت، فشار خون…" /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isPregnant} onChange={(e) => setIsPregnant(e.target.checked)} /> بارداری — هشدار فعال باشد</label>
      <Button className="w-full rounded-xl" onClick={submit} disabled={busy}><AlertTriangle className="h-4 w-4" /> ذخیره هشدارها</Button>
      <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Baby className="h-3 w-3" /> این هشدارها در دستیار پزشک و خلاصه پرونده همیشه اول نمایش داده می‌شوند</div>
    </div>
  )
}

// آیکون‌های بی‌استفاده برای lint حذف شدند
void FolderOpen
