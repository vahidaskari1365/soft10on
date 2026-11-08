'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SectionHeader, LoadingBlock, EmptyState, Avatar } from '../bits'
import type { StaffUser, BranchInfo } from '../types'
import { faDigits, formatJDate } from '@/lib/jalali'
import { ROLE_LABEL } from '@/lib/format'
import { UserCog, Plus, KeyRound, Power, ShieldCheck, Stethoscope, Headset, UserRound, Loader2 } from 'lucide-react'

const ROLE_ICON: Record<string, typeof UserCog> = { ADMIN: ShieldCheck, DOCTOR: Stethoscope, RECEPTIONIST: Headset, PATIENT: UserRound }
const ROLE_COLOR: Record<string, string> = { ADMIN: '#5B2A86', DOCTOR: '#C9A227', RECEPTIONIST: '#2A9D8F', PATIENT: '#E76F51' }

type FormState = {
  fullName: string
  username: string
  password: string
  role: string
  branchId: string
  phone: string
  email: string
  specialty: string
  commissionRate: string
}

const EMPTY: FormState = { fullName: '', username: '', password: '', role: 'RECEPTIONIST', branchId: '', phone: '', email: '', specialty: '', commissionRate: '' }

export function StaffSection() {
  const [users, setUsers] = useState<StaffUser[] | null>(null)
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [dialog, setDialog] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pwTarget, setPwTarget] = useState<StaffUser | null>(null)
  const [newPass, setNewPass] = useState('')

  const load = useCallback(() => {
    fetch('/api/staff').then((r) => r.json()).then((d) => setUsers(d.users ?? [])).catch(() => setUsers([]))
    fetch('/api/branches').then((r) => r.json()).then((d) => setBranches(d.branches ?? [])).catch(() => {})
  }, [])
  useEffect(load, [load])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          branchId: form.branchId || null,
          commissionRate: form.commissionRate ? Number(form.commissionRate) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'خطا در ذخیره')
        return
      }
      setDialog(false)
      setForm(EMPTY)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(u: StaffUser) {
    await fetch(`/api/staff/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !u.active }),
    })
    load()
  }

  async function resetPassword() {
    if (!pwTarget || newPass.length < 6) return
    setSaving(true)
    try {
      const res = await fetch(`/api/staff/${pwTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPass }),
      })
      if (res.ok) {
        setPwTarget(null)
        setNewPass('')
      }
    } finally {
      setSaving(false)
    }
  }

  if (!users) return <LoadingBlock rows={5} />

  return (
    <div className="space-y-5">
      <SectionHeader
        title="پرسنل و دسترسی‌ها"
        subtitle={`${faDigits(users.filter((u) => u.active).length)} کاربر فعال — هر نقش فقط ابزارهای مربوط به خودش را می‌بیند`}
      >
        <Button
          onClick={() => {
            setForm(EMPTY)
            setError(null)
            setDialog(true)
          }}
          className="rounded-xl"
        >
          <Plus className="h-4 w-4 ml-1" /> کاربر جدید
        </Button>
      </SectionHeader>

      {users.length === 0 ? (
        <EmptyState text="کاربری ثبت نشده است" />
      ) : (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-right">کاربر</TableHead>
                    <TableHead className="text-right">نقش</TableHead>
                    <TableHead className="text-right">شعبه</TableHead>
                    <TableHead className="text-right">تماس</TableHead>
                    <TableHead className="text-right">آخرین ورود</TableHead>
                    <TableHead className="text-right">وضعیت</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const Icon = ROLE_ICON[u.role] ?? UserRound
                    return (
                      <TableRow key={u.id} className={u.active ? '' : 'opacity-60'}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={u.fullName} color={ROLE_COLOR[u.role] ?? '#5B2A86'} size={32} />
                            <div>
                              <div className="text-sm font-semibold">{u.fullName}</div>
                              <div className="text-[11px] text-muted-foreground" dir="ltr">{u.username}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <Icon className="h-3.5 w-3.5" style={{ color: ROLE_COLOR[u.role] }} />
                            {u.roleFa}
                          </span>
                          {u.doctorName ? <div className="text-[10px] text-muted-foreground mt-0.5">{u.doctorName}</div> : null}
                        </TableCell>
                        <TableCell className="text-xs">{u.branch?.name ?? 'همه شعب'}</TableCell>
                        <TableCell className="text-xs" dir="ltr">{u.phone ?? '—'}</TableCell>
                        <TableCell className="text-xs">{u.lastLoginAt ? formatJDate(new Date(u.lastLoginAt)) : '—'}</TableCell>
                        <TableCell>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${u.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-stone-100 text-stone-500 border-stone-200'}`}>
                            {u.active ? 'فعال' : 'غیرفعال'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 justify-start">
                            <Button variant="ghost" size="sm" className="h-8 rounded-lg" onClick={() => { setPwTarget(u); setNewPass('') }}>
                              <KeyRound className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-8 rounded-lg ${u.active ? 'text-rose-600' : 'text-emerald-600'}`}
                              onClick={() => toggleActive(u)}
                            >
                              <Power className="h-3.5 w-3.5" />
                            </Button>
                          </div>
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

      {/* Create user dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ایجاد کاربر جدید</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>نام کامل</Label>
              <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="مثلاً نگار مهدوی" />
            </div>
            <div className="space-y-1.5">
              <Label>نام کاربری (لاتین)</Label>
              <Input dir="ltr" className="text-left" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="reception3" />
            </div>
            <div className="space-y-1.5">
              <Label>رمز عبور (حداقل ۶ کاراکتر)</Label>
              <Input dir="ltr" className="text-left" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••" />
            </div>
            <div className="space-y-1.5">
              <Label>نقش</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">مدیر کل</SelectItem>
                  <SelectItem value="DOCTOR">پزشک</SelectItem>
                  <SelectItem value="RECEPTIONIST">منشی پذیرش</SelectItem>
                  <SelectItem value="PATIENT">بیمار</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>شعبه</Label>
              <Select value={form.branchId || 'none'} onValueChange={(v) => setForm({ ...form, branchId: v === 'none' ? '' : v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="انتخاب شعبه" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">همه شعب / بدون شعبه</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.role === 'DOCTOR' ? (
              <>
                <div className="space-y-1.5">
                  <Label>تخصص</Label>
                  <Input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="دندان‌پزشکی عمومی" />
                </div>
                <div className="space-y-1.5">
                  <Label>درصد کارانه (مثلاً 0.35)</Label>
                  <Input dir="ltr" className="text-left" value={form.commissionRate} onChange={(e) => setForm({ ...form, commissionRate: e.target.value })} placeholder="0.35" />
                </div>
              </>
            ) : null}
            <div className="space-y-1.5">
              <Label>موبایل</Label>
              <Input dir="ltr" className="text-left" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0912..." />
            </div>
            <div className="space-y-1.5">
              <Label>ایمیل (اختیاری)</Label>
              <Input dir="ltr" className="text-left" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@clinic.ir" />
            </div>
          </div>
          {error ? <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2">{error}</div> : null}
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDialog(false)}>انصراف</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `ایجاد ${ROLE_LABEL[form.role] ?? 'کاربر'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={pwTarget !== null} onOpenChange={(v) => !v && setPwTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>تغییر رمز {pwTarget?.fullName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>رمز جدید (حداقل ۶ کاراکتر)</Label>
            <Input dir="ltr" className="text-left" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="••••••" />
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setPwTarget(null)}>انصراف</Button>
            <Button onClick={resetPassword} disabled={saving || newPass.length < 6}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'تغییر رمز'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
