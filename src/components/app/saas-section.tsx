'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SectionHeader, EmptyState, LoadingBlock } from './bits'
import { faDigits, formatJDate } from '@/lib/jalali'
import { formatToman } from '@/lib/format'
import { Cloud, Building2, Users, Bot, CreditCard, CircleCheck, CircleX, Layers, Headset, Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

type AiUsage = {
  summary: { total: number; aiUsed: number; ok: number; avgLatencyMs: number; aiShare: number }
  byAgent: Record<string, { total: number; aiUsed: number; ok: number }>
  byRole: Record<string, { total: number }>
  recent?: { ok: boolean; agent: string; latencyMs?: number; aiUsed?: boolean; createdAt: string }[]
}

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

const PLANS = [
  {
    key: 'basic', name: 'Basic', price: '۱٫۵ میلیون', period: 'ماهانه',
    features: { 'تعداد پزشک': '۱', 'کاربر': '۳', 'شعبه': '۱', 'فضای ذخیره‌سازی': '۱ گیگابایت', 'سهمیه AI': '۲۰۰ درخواست', 'گزارش‌ها': 'پایه', 'پشتیبانی': 'ایمیل' },
  },
  {
    key: 'pro', name: 'Professional', price: '۳٫۵ میلیون', period: 'ماهانه',
    features: { 'تعداد پزشک': '۳', 'کاربر': '۱۰', 'شعبه': '۲', 'فضای ذخیره‌سازی': '۵ گیگابایت', 'سهمیه AI': '۱٫۰۰۰ درخواست', 'گزارش‌ها': 'کامل', 'پشتیبانی': 'اولویت‌دار' },
  },
  {
    key: 'business', name: 'Business', price: '۷ میلیون', period: 'ماهانه',
    features: { 'تعداد پزشک': '۱۰', 'کاربر': '۲۵', 'شعبه': '۴', 'فضای ذخیره‌سازی': '۲۰ گیگابایت', 'سهمیه AI': '۵٫۰۰۰ درخواست', 'گزارش‌ها': 'کامل + خروجی', 'پشتیبانی': 'تلفنی' },
  },
  {
    key: 'enterprise', name: 'Enterprise', price: 'توافقی', period: 'سالانه',
    features: { 'تعداد پزشک': 'نامحدود', 'کاربر': 'نامحدود', 'شعبه': 'نامحدود', 'فضای ذخیره‌سازی': 'اختصاصی', 'سهمیه AI': 'نامحدود', 'گزارش‌ها': 'کامل + API', 'پشتیبانی': 'مدیر موفقیت اختصاصی' },
  },
] as const

const DEMO_LOGS = [
  { time: new Date(Date.now() - 12 * 60000).toISOString(), level: 'INFO', where: 'ai/provider', text: 'برگرداندن به لایه رایگان — کلید اختصاصی تنظیم نشده' },
  { time: new Date(Date.now() - 55 * 60000).toISOString(), level: 'WARN', where: 'pooler/db', text: 'تأخیر اتصال بالای ۲ ثانیه (اولین اتصال پس از cold start)' },
  { time: new Date(Date.now() - 3 * 3600_000).toISOString(), level: 'INFO', where: 'auth', text: 'ورود موفق manager از دستگاه جدید' },
  { time: new Date(Date.now() - 26 * 3600_000).toISOString(), level: 'WARN', where: 'appointments', text: 'تلاش رزرو روی بازه پر — پیشنهاد بازه جایگزین داده شد' },
]

export function SaasSection() {
  const [data, setData] = useState<PlatformData | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/staff').then((r) => r.json()).catch(() => null),
      fetch('/api/patients').then((r) => r.json()).catch(() => null),
      fetch('/api/branches').then((r) => r.json()).catch(() => null),
      fetch('/api/ai/usage').then((r) => r.json()).catch(() => null),
    ]).then(([s, p, b, ai]) => {
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
    })
  }, [])

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
          <TabsTrigger value="plans">پلن‌های اشتراک</TabsTrigger>
          <TabsTrigger value="ai">هوش مصنوعی</TabsTrigger>
          <TabsTrigger value="ops">سلامت و پشتیبانی</TabsTrigger>
        </TabsList>

        {/* ——— پلتفرم ——— */}
        <TabsContent value="platform" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="rounded-2xl card-hover">
              <CardContent className="p-4">
                <div className="flex items-center justify-between"><span className="text-[11px] text-muted-foreground">کلینیک فعال</span><Building2 className="h-4 w-4 text-sky-600" /></div>
                <div className="text-xl font-extrabold mt-1.5">{faDigits(1)}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{faDigits(data.branches.length)} شعبه ثبت‌شده</div>
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
                    <div className="text-sm font-bold">اشتراک فعلی پلتفرم</div>
                    <div className="text-[11px] text-muted-foreground">پلن دموی رایگان — بدون محدودیت زمانی تا عرضه تجاری</div>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 text-[11px] font-semibold px-3 py-1">فعال</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-2">مدیریت پلن‌های تجاری پس از راه‌اندازی درگاه پرداخت فعال می‌شود (نیازمند اتصال واقعی).</div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ——— پلن‌ها ——— */}
        <TabsContent value="plans" className="space-y-4">
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
            {PLANS.map((plan, idx) => (
              <Card key={plan.key} className={cn('rounded-2xl card-hover', idx === 1 && 'border-sky-500/60 shadow-lg shadow-sky-500/10')}>
                <CardContent className="p-4">
                  {idx === 1 ? <span className="rounded-full bg-sky-500 text-white text-[10px] font-bold px-2 py-0.5">پیشنهادی</span> : null}
                  <div className="font-extrabold text-lg mt-1" dir="ltr">{plan.name}</div>
                  <div className="mt-1"><span className="text-xl font-bold">{plan.price}</span> <span className="text-[10px] text-muted-foreground">تومان / {plan.period}</span></div>
                  <div className="mt-3 space-y-1.5">
                    {Object.entries(plan.features).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-semibold">{v}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="text-[11px] text-muted-foreground">ویژگی‌های هر پلن نمایشی است و پس از راه‌اندازی صورتحساب واقعی (درگاه پرداخت + فاکتور اشتراک) قابل تنظیم خواهد بود.</div>
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
              <div className="text-sm font-bold mb-2">رویدادهای اخیر سامانه</div>
              <div className="space-y-2">
                {DEMO_LOGS.map((l, i) => (
                  <div key={i} className="rounded-xl border px-3 py-2 flex items-start gap-2.5 text-xs">
                    {l.level === 'WARN' ? <CircleX className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" /> : <CircleCheck className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{l.text}</div>
                      <div className="text-[10px] text-muted-foreground" dir="ltr">{l.where} · {formatJDate(new Date(l.time))}</div>
                    </div>
                    <span className={cn('rounded-full px-2 py-0.5 text-[9px] font-bold border shrink-0', l.level === 'WARN' ? 'bg-amber-500/10 text-amber-700 border-amber-500/30' : 'bg-sky-500/10 text-sky-700 border-sky-500/30')}>{l.level}</span>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground mt-2">لاگ نمایشی است؛ لاگ‌گیری ماندگار در نسخه‌های بعدی اضافه می‌شود.</div>
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
    </div>
  )
}
