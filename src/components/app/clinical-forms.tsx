'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { Plus, Trash2, Pill as PillIcon, ClipboardList } from 'lucide-react'

/** صدور نسخه با اقلام دارویی کامل — پزشک یا مدیر */
export function PrescriptionForm({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const { toast } = useToast()
  const [diagnosis, setDiagnosis] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [items, setItems] = useState([
    { drug: '', form: '', dose: '', frequency: '', duration: '', method: '' },
  ])

  const setItem = (idx: number, k: string, v: string) =>
    setItems((its) => its.map((it, i) => (i === idx ? { ...it, [k]: v } : it)))

  const submit = async () => {
    setErr('')
    const valid = items.filter((it) => it.drug.trim())
    if (!valid.length) { setErr('حداقل یک دارو با نام وارد کنید'); return }
    setSaving(true)
    const r = await fetch('/api/prescriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId, diagnosis: diagnosis.trim() || undefined, note: note.trim() || undefined, items: valid }),
    })
    setSaving(false)
    const j = await r.json().catch(() => ({}))
    if (r.ok) {
      toast({ title: 'نسخه صادر شد', description: `${valid.length} قلم دارو در پرونده بیمار ثبت شد` })
      onDone()
    } else {
      setErr(String(j.error ?? 'خطا در صدور نسخه'))
    }
  }

  const inp = 'rounded-xl'
  return (
    <div className="space-y-2 text-sm max-h-[60vh] overflow-y-auto scroll-thin">
      <Input className={inp} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="تشخیص (اختیاری)" />
      {items.map((it, idx) => (
        <div key={idx} className="rounded-xl border p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <PillIcon className="h-4 w-4 text-primary shrink-0" />
            <Input className={inp} value={it.drug} onChange={(e) => setItem(idx, 'drug', e.target.value)} placeholder="نام دارو *" />
            {items.length > 1 ? (
              <button className="text-rose-500 hover:text-rose-700 shrink-0" onClick={() => setItems((its) => its.filter((_, i) => i !== idx))}>
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
            <Input className={inp} value={it.form} onChange={(e) => setItem(idx, 'form', e.target.value)} placeholder="شکل (قرص…)" />
            <Input className={inp} value={it.dose} onChange={(e) => setItem(idx, 'dose', e.target.value)} placeholder="دوز (500mg)" />
            <Input className={inp} value={it.frequency} onChange={(e) => setItem(idx, 'frequency', e.target.value)} placeholder="دفعات" />
            <Input className={inp} value={it.duration} onChange={(e) => setItem(idx, 'duration', e.target.value)} placeholder="مدت" />
          </div>
          <Input className={inp} value={it.method} onChange={(e) => setItem(idx, 'method', e.target.value)} placeholder="روش مصرف (بعد از غذا…)" />
        </div>
      ))}
      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setItems((its) => [...its, { drug: '', form: '', dose: '', frequency: '', duration: '', method: '' }])}>
        <Plus className="h-3.5 w-3.5 ml-1" /> افزودن دارو
      </Button>
      <Input className={inp} value={note} onChange={(e) => setNote(e.target.value)} placeholder="توصیه پزشکی (اختیاری)" />
      {err ? <div className="text-xs text-rose-600">{err}</div> : null}
      <Button className="rounded-xl w-full" onClick={submit} disabled={saving}>
        {saving ? 'در حال ثبت…' : 'صدور نسخه'}
      </Button>
    </div>
  )
}

type PlanStep = { title: string; cost: string; serviceId: string }

/** ایجاد طرح درمان با مراحل و هزینه هر مرحله */
export function TreatmentPlanForm({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [services, setServices] = useState<{ id: string; name: string; price: number }[]>([])
  const [steps, setSteps] = useState<PlanStep[]>([{ title: '', cost: '', serviceId: '' }])

  useEffect(() => {
    fetch('/api/services?active=1').then((r) => r.json()).then((j) => setServices(j.services ?? [])).catch(() => {})
  }, [])

  const setStep = (idx: number, k: keyof PlanStep, v: string) =>
    setSteps((ss) => ss.map((st, i) => (i === idx ? { ...st, [k]: v } : st)))

  const submit = async () => {
    setErr('')
    const valid = steps
      .filter((st) => st.title.trim())
      .map((st) => ({ title: st.title.trim(), cost: Number(st.cost) || 0, serviceId: st.serviceId || undefined }))
    if (!title.trim()) { setErr('عنوان طرح درمان الزامی است'); return }
    if (!valid.length) { setErr('حداقل یک مرحله با عنوان وارد کنید'); return }
    setSaving(true)
    const r = await fetch('/api/treatments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId, title: title.trim(), note: note.trim() || undefined, steps: valid }),
    })
    setSaving(false)
    const j = await r.json().catch(() => ({}))
    if (r.ok) {
      toast({ title: 'طرح درمان ثبت شد', description: `${valid.length} مرحله` })
      onDone()
    } else {
      setErr(String(j.error ?? 'خطا در ثبت طرح درمان'))
    }
  }

  const inp = 'rounded-xl'
  return (
    <div className="space-y-2 text-sm max-h-[60vh] overflow-y-auto scroll-thin">
      <Input className={inp} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان درمان (مثلاً: ایمپلنت فک بالا) *" />
      {steps.map((st, idx) => (
        <div key={idx} className="rounded-xl border p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary shrink-0" />
            <Input className={inp} value={st.title} onChange={(e) => setStep(idx, 'title', e.target.value)} placeholder="عنوان مرحله *" />
            {steps.length > 1 ? (
              <button className="text-rose-500 hover:text-rose-700 shrink-0" onClick={() => setSteps((ss) => ss.filter((_, i) => i !== idx))}>
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Input className={inp} dir="ltr" value={st.cost} onChange={(e) => setStep(idx, 'cost', e.target.value.replace(/\D/g, ''))} placeholder="هزینه (تومان)" />
            <select className={`w-full h-9 rounded-xl border bg-background px-2 text-xs ${inp}`} value={st.serviceId} onChange={(e) => setStep(idx, 'serviceId', e.target.value)}>
              <option value="">خدمت مرتبط (اختیاری)</option>
              {services.map((sv) => <option key={sv.id} value={sv.id}>{sv.name}</option>)}
            </select>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setSteps((ss) => [...ss, { title: '', cost: '', serviceId: '' }])}>
        <Plus className="h-3.5 w-3.5 ml-1" /> افزودن مرحله
      </Button>
      <Input className={inp} value={note} onChange={(e) => setNote(e.target.value)} placeholder="توضیحات (اختیاری)" />
      {err ? <div className="text-xs text-rose-600">{err}</div> : null}
      <Button className="rounded-xl w-full" onClick={submit} disabled={saving}>
        {saving ? 'در حال ثبت…' : 'ثبت طرح درمان'}
      </Button>
    </div>
  )
}
