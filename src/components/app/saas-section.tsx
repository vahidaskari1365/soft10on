'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SectionHeader, EmptyState, LoadingBlock } from './bits'
import { faDigits, formatJDate } from '@/lib/jalali'
import { formatToman } from '@/lib/format'
import { Cloud, Building2, Users, Bot, CreditCard, CircleCheck, CircleX, Layers, Headset, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

type AiUsage = {
  summary: { total: number; aiUsed: number; ok: number; avgLatencyMs: number; aiShare: number }
  byAgent: Record<string, { total: number; aiUsed: number; ok: number }>
  byRole: Record<string, { total: number }>
  recent?: { ok: boolean; agent: string; latencyMs?: number; aiUsed?: boolean; createdAt: string }[]
}

type PlanRow = {
  id: string
  name: string
  price: number
  period: string
  maxUsers: number
  maxBranches: number
  aiCallsLimit: number
  storageMb: number
  active: boolean
}

type ClinicRow = {
  id: string
  name: string
  ownerName: string | null
  contactPhone: string | null
  email: string | null
  isActive: boolean
  plan: { id: string; name: string; price: number; period: string } | null
  planEndsAt: string | null
  branchCount: number
  userCount: number
  activeUserCount: number
}

type AuditRow = { id: string; action: string; entity: string; entityId?: string; userName?: string; result?: string; createdAt: string }

type PlatformData = {
  users: { total: number; active: number; admins: number }
  patients: number
  branches: { id: string; name: string; city?: string }[]
  ai: AiUsage | null
}

const AGENT_LABEL: Record<string, string> = {
  MANAGER: 'دستیار مدیر',
  SHINA: 'شینا (دستیار بیمار)',
  SUMMARY: 'خلاصه‌ساز پرونده',
  AUTO_REPLY: 'پاسخ خودکار',
  RECEPTION: 'دستیار پذیرش',
}

export function SaasSection() {
  const [data, setData] = useState<PlatformData | null>(null)
  const [clinics, setClinics] = useState<ClinicRow[] | null>(null)
  const [plans, setPlans] = useState<PlanRow[] | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditRow[] | null>(null)
  const [clinicDialog, setClinicDialog] = useState(false)
  const [planDialog, setPlanDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cName, setCName] = useState('')
  const [cOwner, setCOwner] = useState('')
  const [cPhone, setCPhone] = useState('')
  const [pName, setPName] = useState('')
  const [pPrice, setPPrice] = useState('')
  const [pPeriod, setPPeriod] = useState('MONTHLY')
  const [pUsers, setPUsers] = useState('5')
  const [pBranches, setPBranches] = useState('1')
  const [pAi, setPAi] = useState('500')
  const [pStorage, setPStorage] = useState('512')

  const loadClinics = () => {
    fetch('/api/clinics')
      .then((r) => r.json())
      .then((j) => {
        setClinics(j.clinics ?? [])
        setPlans(j.plans ?? [])
      })
      .catch(() => {
        setClinics([])
        setPlans([])
      })
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/staff').then((r) => r.json()).catch(() => null),
      fetch('/api/patients').then((r) => r.json()).catch(() => null),
      fetch('/api/branches').then((r) => r.json()).catch(() => null),
      fetch('/api/ai/usage').then((r) => r.json()).catch(() => null),
      fetch('/api/audit?take=12').then((r) => r.json()).catch(() => null),
    ]).then(([s, p, b, ai, aud]) => {
      const users = s?.users ?? []
      setData({
        users: {
          total: users.length,
          active: users.filter((u: { active?: boolean }) => u.active).length,
          admins: users.filter((u: { role?: string }) => u.role === 'ADMIN').length,
        },
        patients: (p?.patients ?? []).length,
        branches: b?.branches ?? [],
        ai: (ai as AiUsage) ?? null,
      })
      setAuditLogs(aud?.logs ?? [])
    })
    loadClinics()
  }, [])

  const createClinic = async () => {
    setSaving(true)
    const r = await fetch('/api/clinics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cName.trim(), ownerName: cOwner.trim() || undefined, contactPhone: cPhone.trim() || undefined }),
    })
    setSaving(false)
    const j = await r.json().catch(() => ({}))
    if (r.ok) {
      setClinicDialog(false)
      setCName(''); setCOwner(''); setCPhone('')
      loadClinics()
    } else {
      alert(String(j.error ?? 'خطا در ثبت کلینیک'))
    }
  }

  const createPlan = async () => {
    setSaving(true)
    const r = await fetch('/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: pName.trim(),
        price: Math.max(0, Math.round(Number(pPrice.replace(/\D/g, '')) || 0)),
        period: pPeriod,
        maxUsers: Math.max(1, Math.round(Number(pUsers.replace(/\D/g, '')) || 1)),
        maxBranches: Math.max(1, Math.round(Number(pBranches.replace(/\D/g, '')) || 1)),
        aiCallsLimit: Math.max(0, Math.round(Number(pAi.replace(/\D/g, '')) || 0)),
        storageMb: Math.max(0, Math.round(Number(pStorage.replace(/\D/g, '')) || 0)),
      }),
    })
    setSaving(false)
    const j = await r.json().catch(() => ({}))
    if (r.ok) {
      setPlanDialog(false)
      setPName(''); setPPrice('')
      loadClinics()
    } else {
      alert(String(j.error ?? 'خطا در ثبت پلن'))
    }
  }

  const assignPlan = async (clinicId: string, planId: string) => {
    const r = await fetch('/api/clinics', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: clinicId, planId: planId === 'none' ? '' : planId }),
    })
    if (r.ok) loadClinics()
    else alert('خطا در تخصیص پلن')
  }

  const toggleClinic = async (clinicId: string, isActive: boolean) => {
    const r = await fetch('/api/clinics', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: clinicId, isActive }),
    })
    if (r.ok) loadClinics()
    else alert('خطا در تغییر وضعیت')
  }

  if (!data) return <LoadingBlock rows={6} />

  return (
    <div className="space-y-4">
      <SectionHeader
        title="پنل پلتفرم 10on (SaaS)"
        subtitle="مدیریت کل پلتفرم: کلینیک‌ها، اشتراک‌ها، مصرف هوش مصنوعی و سلامت سامانه"
      />

      <Tabs defaultValue="platform">
        <TabsList className="rounded-xl flex-wrap justify-start h-auto">
          <TabsTrigger value="platform">پلتفرم</TabsTrigger>
          <TabsTrigger value="clinics">کلینیک‌ها</TabsTrigger>
          <TabsTrigger value="plans">پلن‌های اشتراک</TabsTrigger>
          <TabsTrigger value="ai">هوش مصنوعی</TabsTrigger>
          <TabsTrigger value="ops">سلامت و پشتیبانی</TabsTrigger>
        </TabsList>

        {/* ——— پلتفرم ——— */}
        <TabsContent value="platform" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="rounded-2xl card-hover">
              <CardContent className="p-4">
                <div className="flex items-center justify-between"><span className="text-[11px] text-muted-foreground">کلینیک ثبت‌شده</span><Building2 className="h-4 w-4 text-sky-600" /></div>
                <div className="text-xl font-extrabold mt-1.5">{faDigits(clinics?.length ?? 0)}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{faDigits(clinics?.filter((c) => c.isActive).length ?? 0)} فعال · {faDigits(data.branches.length)} شعبه</div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl card-hover">
              <CardContent className="p-4">
                <div className="flex items-center justify-between"><span className="text-[11px] text-muted-foreground">کاربران سامانه</span><Users className="h-4 w-4 text-teal-600" /></div>
                <div className="text-xl font-extrabold mt-1.5">{faDigits(data.users.total)}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{faDigits(data.users.active)} فعال · {faDigits(data.users.admins)} مدیر</div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl card-hover">
              <CardContent className="p-4">
                <div className="flex items-center justify-between"><span className="text-[11px] text-muted-foreground">پرونده بیمار</span><Layers className="h-4 w-4 text-violet-600" /></div>
                <div className="text-xl font-extrabold mt-1.5">{faDigits(data.patients)}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">در این کلینیک</div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl card-hover">
              <CardContent className="p-4">
                <div className="flex items-center justify-between"><span className="text-[11px] text-muted-foreground">سهم AI از پاسخ‌ها</span><Bot className="h-4 w-4 text-gold" /></div>
                <div className="text-xl font-extrabold mt-1.5">{faDigits(data.ai?.summary.aiShare ?? 0)}٪</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{faDigits(data.ai?.summary.total ?? 0)} درخواست ثبت‌شده</div>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <CreditCard className="h-5 w-5 text-sky-600" />
                  <div>
                    <div className="text-sm font-bold">اشتراک‌ها و صورتحساب</div>
                    <div className="text-[11px] text-muted-foreground">تخصیص پلن به هر کلینیک از تب «کلینیک‌ها» — پایان دوره در جدول ثبت می‌شود.</div>
                  </div>
                </div>
                <span className="rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-700 text-[11px] font-semibold px-3 py-1">مدیریت فعال</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-2">صورتحساب خودکار و پرداخت آنلاین اشتراک پس از اتصال درگاه پرداخت فعال می‌شود (نیازمند تنظیمات واقعی).</div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ——— کلینیک‌ها ——— */}
        <TabsContent value="clinics" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">ثبت کلینیک، تخصیص پلن اشتراک و تعلیق/فعال‌سازی از این بخش انجام می‌شود.</div>
            <Button size="sm" className="rounded-xl" onClick={() => setClinicDialog(true)}>
              <Plus className="h-4 w-4 ml-1" /> کلینیک جدید
            </Button>
          </div>
          {clinics === null ? (
            <LoadingBlock rows={4} />
          ) : clinics.length === 0 ? (
            <EmptyState text="هنوز کلینیکی ثبت نشده است." />
          ) : (
            <Card className="rounded-2xl">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-right">کلینیک</TableHead>
                        <TableHead className="text-right">مدیر</TableHead>
                        <TableHead className="text-right">پلن</TableHead>
                        <TableHead className="text-right">پایان دوره</TableHead>
                        <TableHead className="text-right">شعبه/کاربر</TableHead>
                        <TableHead className="text-right">وضعیت</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clinics.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs font-semibold">{c.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{c.ownerName ?? '—'}</TableCell>
                          <TableCell className="text-xs">
                            <Select value={c.plan?.id ?? 'none'} onValueChange={(v) => assignPlan(c.id, v)}>
                              <SelectTrigger className="h-8 rounded-lg text-xs w-[130px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">بدون پلن</SelectItem>
                                {(plans ?? []).filter((p) => p.active).map((p) => (
                                  <SelectItem key={p.id} value={p.id}>{p.name} — {formatToman(p.price)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-xs">{c.planEndsAt ? formatJDate(new Date(c.planEndsAt)) : '—'}</TableCell>
                          <TableCell className="text-xs">{faDigits(c.branchCount)} / {faDigits(c.activeUserCount)}</TableCell>
                          <TableCell className="text-xs">
                            <button
                              onClick={() => toggleClinic(c.id, !c.isActive)}
                              className={cn('rounded-full px-2.5 py-1 text-[10px] font-bold border transition-colors', c.isActive ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' : 'bg-amber-500/10 text-amber-700 border-amber-500/30')}
                            >
                              {c.isActive ? 'فعال — تعلیق' : 'معلق — فعال‌سازی'}
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ——— پلن‌ها ——— */}
        <TabsContent value="plans" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">پلن‌های واقعی اشتراک — محدودیت‌ها مبنای تخصیص به کلینیک‌ها هستند.</div>
            <Button size="sm" className="rounded-xl" onClick={() => setPlanDialog(true)}>
              <Plus className="h-4 w-4 ml-1" /> پلن جدید
            </Button>
          </div>
          {plans === null ? (
            <LoadingBlock rows={3} />
          ) : plans.length === 0 ? (
            <EmptyState text="هنوز پلنی تعریف نشده است — با «پلن جدید» اولین پلن را بسازید." />
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
              {plans.filter((p) => p.active).map((plan) => (
                <Card key={plan.id} className="rounded-2xl card-hover">
                  <CardContent className="p-4">
                    <div className="font-extrabold text-lg mt-1" dir="ltr">{plan.name}</div>
                    <div className="mt-1"><span className="text-xl font-bold">{formatToman(plan.price)}</span> <span className="text-[10px] text-muted-foreground">تومان / {plan.period === 'YEARLY' ? 'سالانه' : 'ماهانه'}</span></div>
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]"><span className="text-muted-foreground">حداکثر کاربر</span><span className="font-semibold">{faDigits(plan.maxUsers)}</span></div>
                      <div className="flex items-center justify-between text-[11px]"><span className="text-muted-foreground">حداکثر شعبه</span><span className="font-semibold">{faDigits(plan.maxBranches)}</span></div>
                      <div className="flex items-center justify-between text-[11px]"><span className="text-muted-foreground">سهمیه AI</span><span className="font-semibold">{faDigits(plan.aiCallsLimit)} درخواست</span></div>
                      <div className="flex items-center justify-between text-[11px]"><span className="text-muted-foreground">فضای ذخیره‌سازی</span><span className="font-semibold">{faDigits(plan.storageMb)} مگابایت</span></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <div className="text-[11px] text-muted-foreground">صورتحساب خودکار و تمدید پرداخت‌محور پس از اتصال درگاه پرداخت فعال می‌شود (نیازمند تنظیمات واقعی).</div>
        </TabsContent>

        {/* ——— هوش مصنوعی ——— */}
        <TabsContent value="ai" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="rounded-2xl"><CardContent className="p-4">
              <div className="text-[11px] text-muted-foreground">کل درخواست‌ها</div>
              <div className="text-xl font-extrabold mt-1">{faDigits(data.ai?.summary.total ?? 0)}</div>
            </CardContent></Card>
            <Card className="rounded-2xl"><CardContent className="p-4">
              <div className="text-[11px] text-muted-foreground">با هوش مصنوعی</div>
              <div className="text-xl font-extrabold mt-1">{faDigits(data.ai?.summary.aiUsed ?? 0)}</div>
            </CardContent></Card>
            <Card className="rounded-2xl"><CardContent className="p-4">
              <div className="text-[11px] text-muted-foreground">موفق</div>
              <div className="text-xl font-extrabold mt-1 text-emerald-600">{faDigits(data.ai?.summary.ok ?? 0)}</div>
            </CardContent></Card>
            <Card className="rounded-2xl"><CardContent className="p-4">
              <div className="text-[11px] text-muted-foreground">میانگین تأخیر</div>
              <div className="text-xl font-extrabold mt-1">{faDigits(data.ai?.summary.avgLatencyMs ?? 0)}ms</div>
            </CardContent></Card>
          </div>

          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <div className="text-sm font-bold mb-2">مصرف به تفکیک دستیار</div>
              {Object.keys(data.ai?.byAgent ?? {}).length === 0 ? (
                <EmptyState text="هنوز درخواستی ثبت نشده." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-right">دستیار</TableHead>
                        <TableHead className="text-right">کل</TableHead>
                        <TableHead className="text-right">با AI</TableHead>
                        <TableHead className="text-right">موفق</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(data.ai?.byAgent ?? {}).map(([agent, v]) => (
                        <TableRow key={agent}>
                          <TableCell className="text-xs font-semibold">{AGENT_LABEL[agent] ?? agent}</TableCell>
                          <TableCell className="text-xs">{faDigits(v.total)}</TableCell>
                          <TableCell className="text-xs">{faDigits(v.aiUsed)}</TableCell>
                          <TableCell className="text-xs">
                            <span className="inline-flex items-center gap-1 text-emerald-600"><CircleCheck className="h-3.5 w-3.5" />{faDigits(v.ok)}</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <div className="text-sm font-bold mb-1.5">مسیر مدل‌ها (Model Router)</div>
              <div className="text-[11px] text-muted-foreground leading-5 mb-3">
                درخواست‌ها اول از پرووایدر اختصاصی (اگر کلید تنظیم شده باشد) استفاده می‌کنند؛ در غیر این‌صورت لایه رایگان بدون کلید پاسخ می‌دهد.
              </div>
              <div className="space-y-2">
                <div className="rounded-xl border px-3 py-2 text-xs flex items-center justify-between">
                  <span className="font-semibold">۱. پرووایدر اختصاصی</span>
                  <span className="text-muted-foreground">قابل تنظیم در بخش تنظیمات (baseUrl / apiKey / model)</span>
                </div>
                <div className="rounded-xl border px-3 py-2 text-xs flex items-center justify-between">
                  <span className="font-semibold">۲. لایه رایگان بدون کلید</span>
                  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 text-[10px] px-2 py-0.5">فعال</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ——— سلامت و پشتیبانی ——— */}
        <TabsContent value="ops" className="space-y-4">
          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <div className="text-sm font-bold mb-2">رویدادهای اخیر سامانه (Audit Log واقعی)</div>
              {auditLogs === null ? (
                <LoadingBlock rows={4} />
              ) : auditLogs.length === 0 ? (
                <EmptyState text="هنوز رویدادی ثبت نشده است." />
              ) : (
                <div className="space-y-2">
                  {auditLogs.map((l) => (
                    <div key={l.id} className="rounded-xl border px-3 py-2 flex items-start gap-2.5 text-xs">
                      {l.result && l.result !== 'OK' ? <CircleX className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" /> : <CircleCheck className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{l.entity} — {l.action}{l.userName ? ` · ${l.userName}` : ''}</div>
                        <div className="text-[10px] text-muted-foreground" dir="ltr">{l.createdAt ? formatJDate(new Date(l.createdAt)) : ''}</div>
                      </div>
                      <span className={cn('rounded-full px-2 py-0.5 text-[9px] font-bold border shrink-0', l.result && l.result !== 'OK' ? 'bg-amber-500/10 text-amber-700 border-amber-500/30' : 'bg-sky-500/10 text-sky-700 border-sky-500/30')}>{l.result ?? 'OK'}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <div className="text-sm font-bold mb-2 flex items-center gap-1.5"><Headset className="h-4 w-4 text-teal-600" /> پشتیبانی پلتفرم</div>
              <div className="grid md:grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border px-3 py-2">پاسخ‌گویی: شنبه تا چهارشنبه، ۹ تا ۱۸</div>
                <div className="rounded-xl border px-3 py-2">گزارش خطای بحرانی: اولویت تلفنی</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* دیالوگ کلینیک جدید */}
      <Dialog open={clinicDialog} onOpenChange={setClinicDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right">ثبت کلینیک جدید</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">نام کلینیک *</label>
              <Input className="rounded-xl mt-1" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="مثلاً: کلینیک لبخند مهر" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">نام مالک</label>
              <Input className="rounded-xl mt-1" value={cOwner} onChange={(e) => setCOwner(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">تلفن تماس</label>
              <Input className="rounded-xl mt-1" dir="ltr" value={cPhone} onChange={(e) => setCPhone(e.target.value.replace(/[^0-9+]/g, ''))} placeholder="021XXXXXXXX" />
            </div>
            <Button className="w-full rounded-xl" onClick={createClinic} disabled={saving || !cName.trim()}>
              {saving ? 'در حال ثبت…' : 'ثبت کلینیک'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* دیالوگ پلن جدید */}
      <Dialog open={planDialog} onOpenChange={setPlanDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right">تعریف پلن اشتراک</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">نام پلن *</label>
              <Input className="rounded-xl mt-1" value={pName} onChange={(e) => setPName(e.target.value)} placeholder="مثلاً: Professional" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">قیمت (تومان) *</label>
                <Input className="rounded-xl mt-1" dir="ltr" value={pPrice} onChange={(e) => setPPrice(e.target.value.replace(/\D/g, ''))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">دوره</label>
                <Select value={pPeriod} onValueChange={setPPeriod}>
                  <SelectTrigger className="w-full rounded-xl mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">ماهانه</SelectItem>
                    <SelectItem value="YEARLY">سالانه</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">حداکثر کاربر</label>
                <Input className="rounded-xl mt-1" dir="ltr" value={pUsers} onChange={(e) => setPUsers(e.target.value.replace(/\D/g, ''))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">حداکثر شعبه</label>
                <Input className="rounded-xl mt-1" dir="ltr" value={pBranches} onChange={(e) => setPBranches(e.target.value.replace(/\D/g, ''))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">سهمیه AI</label>
                <Input className="rounded-xl mt-1" dir="ltr" value={pAi} onChange={(e) => setPAi(e.target.value.replace(/\D/g, ''))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">فضا (مگابایت)</label>
                <Input className="rounded-xl mt-1" dir="ltr" value={pStorage} onChange={(e) => setPStorage(e.target.value.replace(/\D/g, ''))} />
              </div>
            </div>
            <Button className="w-full rounded-xl" onClick={createPlan} disabled={saving || !pName.trim() || !pPrice}>
              {saving ? 'در حال ثبت…' : 'ثبت پلن'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
