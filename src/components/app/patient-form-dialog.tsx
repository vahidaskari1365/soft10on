'use client'

import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { faDigits } from '@/lib/jalali'

type DoctorLite = { id: string; name: string }
type PatientAny = Record<string, unknown> & { id?: string }

const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const PROVINCES = ['تهران', 'البرز', 'اصفهان', 'فارس', 'خراسان رضوی', 'آذربایجان شرقی', 'گیلان', 'مازندران', 'خوزستان', 'کرج', 'سایر']

const empty = {
  firstName: '', lastName: '', phone: '', landline: '', nationalId: '', gender: '',
  birthYear: '', birthDate: '', email: '', province: '', city: '', address: '', postalCode: '',
  referralSource: '', status: 'ACTIVE',
  bloodType: '', allergies: '', chronicNote: '', medications: '', surgeryHistory: '',
  hospitalizationHistory: '', treatmentHistory: '', medWarnings: '',
  insuranceInsurer: '', insurancePolicyNo: '', suppInsurer: '', suppPolicyNo: '',
  treatingDoctorId: '', isPregnant: false, incompleteTreatment: false, notes: '',
}

const FIELD = 'rounded-xl'
const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[11px] text-muted-foreground">{children}</span>
)
const T = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs font-bold text-primary mt-3 mb-1.5 first:mt-0">{children}</div>
)

export function PatientFormDialog({
  open, setOpen, editing, onSaved, toast,
}: {
  open: boolean
  setOpen: (v: boolean) => void
  editing: PatientAny | null
  onSaved: () => void
  toast: ReturnType<typeof useToast>['toast']
}) {
  const [form, setForm] = useState({ ...empty })
  const [saving, setSaving] = useState(false)
  const [doctors, setDoctors] = useState<DoctorLite[]>([])
  const [doctorsErr, setDoctorsErr] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  // بارگذاری لیست پزشکان با بازخورد شکست و تلاش دوباره — نه شکست بی‌صدا
  const loadDoctors = useCallback(() => {
    setDoctorsErr(false)
    fetch('/api/meta')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const j: { doctors?: DoctorLite[] } = await r.json()
        setDoctors(j.doctors ?? [])
      })
      .catch(() => setDoctorsErr(true))
  }, [])
  useEffect(loadDoctors, [loadDoctors])

  useEffect(() => {
    if (!open) return
    setErr('')
    loadDoctors()
    if (editing) {
      const p = editing as Record<string, string | boolean | null>
      setForm({
        ...empty,
        firstName: String(p.firstName ?? ''), lastName: String(p.lastName ?? ''), phone: String(p.phone ?? ''),
        landline: String(p.landline ?? ''), nationalId: String(p.nationalId ?? ''), gender: String(p.gender ?? ''),
        birthYear: p.birthYear ? String(p.birthYear) : '', birthDate: '', email: String(p.email ?? ''),
        province: String(p.province ?? ''), city: String(p.city ?? ''), address: String(p.address ?? ''),
        postalCode: String(p.postalCode ?? ''), referralSource: String(p.referralSource ?? ''),
        status: String(p.status ?? 'ACTIVE'), bloodType: String(p.bloodType ?? ''),
        allergies: String(p.allergies ?? ''), chronicNote: String(p.chronicNote ?? ''),
        medications: String(p.medications ?? ''), surgeryHistory: String(p.surgeryHistory ?? ''),
        hospitalizationHistory: String(p.hospitalizationHistory ?? ''), treatmentHistory: String(p.treatmentHistory ?? ''),
        medWarnings: String(p.medWarnings ?? ''), insuranceInsurer: String(p.insuranceInsurer ?? ''),
        insurancePolicyNo: String(p.insurancePolicyNo ?? ''), suppInsurer: String(p.suppInsurer ?? ''),
        suppPolicyNo: String(p.suppPolicyNo ?? ''), treatingDoctorId: String(p.treatingDoctorId ?? ''),
        isPregnant: Boolean(p.isPregnant), incompleteTreatment: Boolean(p.incompleteTreatment),
        notes: String(p.notes ?? ''),
      })
    } else {
      setForm({ ...empty })
    }
  }, [open, editing])

  const submit = async () => {
    setErr('')
    if (!form.firstName.trim() || !form.lastName.trim()) { setErr('نام و نام خانوادگی الزامی است'); return }
    if (!/^09\d{9}$/.test(form.phone.trim())) { setErr('شماره موبایل معتبر نیست (09xxxxxxxxx)'); return }
    if (saving) return // جلوگیری از ارسال دوباره
    setSaving(true)
    try {
      const payload: Record<string, unknown> = { ...form }
      if (!payload.birthYear) delete payload.birthYear
      if (!payload.nationalId) payload.nationalId = null
      const r = await fetch(editing ? `/api/patients/${editing.id}` : '/api/patients', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const j: { error?: string; patient?: { fileNo?: string } } = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(String(j.error ?? 'خطا در ذخیره‌سازی')); return }
      toast({ title: editing ? 'اطلاعات بیمار به‌روزرسانی شد' : `بیمار ثبت شد — پرونده ${faDigits(j.patient?.fileNo ?? '')}` })
      setOpen(false)
      onSaved()
    } catch {
      // خطای شبکه — دادهٔ وارد‌شده حفظ می‌شود و دکمه باز می‌گردد
      setErr('ارتباط با سرور برقرار نشد؛ اتصال را بررسی کنید و دوباره تلاش کنید')
    } finally {
      setSaving(false) // در هر حالت (موفق/خطا/شبکه) بازنشانی می‌شود
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto scroll-thin">
        <DialogHeader>
          <DialogTitle className="text-right">{editing ? 'ویرایش اطلاعات بیمار' : 'ثبت بیمار جدید'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <T>هویتی و تماس</T>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <div><Label>نام *</Label><Input className={FIELD} value={form.firstName} onChange={set('firstName')} /></div>
            <div><Label>نام خانوادگی *</Label><Input className={FIELD} value={form.lastName} onChange={set('lastName')} /></div>
            <div><Label>موبایل *</Label><Input className={FIELD} dir="ltr" value={form.phone} onChange={set('phone')} placeholder="09xxxxxxxxx" /></div>
            <div><Label>تلفن ثابت</Label><Input className={FIELD} dir="ltr" value={form.landline} onChange={set('landline')} /></div>
            <div><Label>کد ملی</Label><Input className={FIELD} dir="ltr" value={form.nationalId} onChange={set('nationalId')} maxLength={10} /></div>
            <div>
              <Label>جنسیت</Label>
              <select className={`w-full h-9 rounded-xl border bg-background px-2 text-xs ${FIELD}`} value={form.gender} onChange={set('gender')}>
                <option value="">—</option><option value="FEMALE">خانم</option><option value="MALE">آقا</option>
              </select>
            </div>
            <div><Label>سال تولد (شمسی)</Label><Input className={FIELD} dir="ltr" value={form.birthYear} onChange={set('birthYear')} placeholder="1369" /></div>
            <div><Label>ایمیل</Label><Input className={FIELD} dir="ltr" value={form.email} onChange={set('email')} /></div>
            <div>
              <Label>استان</Label>
              <select className={`w-full h-9 rounded-xl border bg-background px-2 text-xs ${FIELD}`} value={form.province} onChange={set('province')}>
                <option value="">—</option>{PROVINCES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div><Label>شهر</Label><Input className={FIELD} value={form.city} onChange={set('city')} /></div>
            <div className="col-span-2"><Label>آدرس</Label><Input className={FIELD} value={form.address} onChange={set('address')} /></div>
            <div><Label>کد پستی</Label><Input className={FIELD} dir="ltr" value={form.postalCode} onChange={set('postalCode')} maxLength={10} /></div>
            <div><Label>منبع آشنایی</Label><Input className={FIELD} value={form.referralSource} onChange={set('referralSource')} /></div>
          </div>

          <T>اطلاعات پزشکی</T>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <div>
              <Label>گروه خونی</Label>
              <select className={`w-full h-9 rounded-xl border bg-background px-2 text-xs ${FIELD}`} value={form.bloodType} onChange={set('bloodType')}>
                <option value="">—</option>{BLOOD.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <Label>پزشک معالج</Label>
              <select className={`w-full h-9 rounded-xl border bg-background px-2 text-xs ${FIELD}`} value={form.treatingDoctorId} onChange={set('treatingDoctorId')}>
                <option value="">—</option>{doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              {doctorsErr ? (
                <button type="button" onClick={loadDoctors} className="mt-1 text-[11px] text-amber-700 underline underline-offset-2">
                  بارگذاری لیست پزشکان ناموفق بود — تلاش دوباره
                </button>
              ) : null}
            </div>
            <div className="col-span-2 md:col-span-3"><Label>حساسیت‌های دارویی</Label><Input className={FIELD} value={form.allergies} onChange={set('allergies')} /></div>
            <div className="col-span-2 md:col-span-3"><Label>بیماری‌های زمینه‌ای</Label><Input className={FIELD} value={form.chronicNote} onChange={set('chronicNote')} /></div>
            <div className="col-span-2 md:col-span-3"><Label>داروهای مصرفی</Label><Input className={FIELD} value={form.medications} onChange={set('medications')} /></div>
            <div><Label>سابقه جراحی</Label><Input className={FIELD} value={form.surgeryHistory} onChange={set('surgeryHistory')} /></div>
            <div><Label>سابقه بستری</Label><Input className={FIELD} value={form.hospitalizationHistory} onChange={set('hospitalizationHistory')} /></div>
            <div><Label>سابقه درمان</Label><Input className={FIELD} value={form.treatmentHistory} onChange={set('treatmentHistory')} /></div>
            <div className="col-span-2 md:col-span-3"><Label>هشدارهای پزشکی</Label><Input className={FIELD} value={form.medWarnings} onChange={set('medWarnings')} /></div>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.isPregnant} onChange={(e) => setForm((f) => ({ ...f, isPregnant: e.target.checked }))} /> بارداری</label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.incompleteTreatment} onChange={(e) => setForm((f) => ({ ...f, incompleteTreatment: e.target.checked }))} /> درمان نیمه‌تمام</label>
          </div>

          <T>بیمه</T>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div><Label>بیمه پایه</Label><Input className={FIELD} value={form.insuranceInsurer} onChange={set('insuranceInsurer')} /></div>
            <div><Label>شماره بیمه</Label><Input className={FIELD} dir="ltr" value={form.insurancePolicyNo} onChange={set('insurancePolicyNo')} /></div>
            <div><Label>بیمه تکمیلی</Label><Input className={FIELD} value={form.suppInsurer} onChange={set('suppInsurer')} /></div>
            <div><Label>شماره تکمیلی</Label><Input className={FIELD} dir="ltr" value={form.suppPolicyNo} onChange={set('suppPolicyNo')} /></div>
          </div>

          <T>توضیحات</T>
          <Input className={FIELD} value={form.notes} onChange={set('notes')} placeholder="یادداشت درباره بیمار…" />

          {err ? <div className="text-xs text-rose-600 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2">{err}</div> : null}
          <div className="flex gap-2 pt-1">
            <Button className="rounded-xl flex-1" onClick={submit} disabled={saving}>
              {saving ? 'در حال ذخیره…' : editing ? 'ذخیره تغییرات' : 'ثبت بیمار'}
            </Button>
            <Button className="rounded-xl" variant="outline" onClick={() => setOpen(false)} disabled={saving}>لغو</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
