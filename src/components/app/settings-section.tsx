'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SectionHeader, Pill, LoadingBlock, EmptyState, StatCard } from './bits'
import { formatJDate, faDigits } from '@/lib/jalali'
import { Sparkles, Plug, Brain, BookOpen, Trash2, Save, FlaskConical, BarChart3 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

type AiCfg = { baseUrl: string; apiKeyMasked: string; model: string; engine: string }
type Dna = { clinicName: string; tagline: string; tone: string; rules: string; processes: string }
type KbItem = { id: string; question: string; answer: string; category: string; isActive: boolean }
type Usage = {
  summary: { total: number; aiUsed: number; ok: number; avgLatencyMs: number; aiShare: number }
  byAgent: Record<string, { total: number; aiUsed: number; ok: number }>
  daily: { date: string; count: number }[]
  recent: { id: string; role: string; agent: string; ok: boolean; aiUsed: boolean; latencyMs: number; createdAt: string }[]
}

const AGENT_FA: Record<string, string> = {
  MANAGER: 'دستیار مدیر', RECEPTION: 'دستیار پذیرش', DOCTOR: 'دستیار پزشک', SHINA: 'دستیار بیمار (شینا)', AUTO_REPLY: 'پاسخ خودکار پیام', SUMMARY: 'خلاصه پرونده', HANDOFF: 'تحویل شیفت',
}
const ROLE_FA: Record<string, string> = { ADMIN: 'مدیر کل', DOCTOR: 'پزشک', RECEPTIONIST: 'منشی', PATIENT: 'بیمار', MANAGER: 'مدیر' }

export function SettingsSection() {
  const { toast } = useToast()
  const [ai, setAi] = useState<AiCfg | null>(null)
  const [dna, setDna] = useState<Dna | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; message: string } | null>(null)
  const [kb, setKb] = useState<KbItem[]>([])
  const [usage, setUsage] = useState<Usage | null>(null)
  const [newQ, setNewQ] = useState('')
  const [newA, setNewA] = useState('')

  const load = useCallback(() => {
    fetch('/api/settings').then((r) => r.json()).then((d) => { setAi((d.ai ?? null) as AiCfg | null); setDna((d.dna ?? null) as Dna | null) }).catch(() => {})
    fetch('/api/knowledge').then((r) => r.json()).then((d) => setKb((d.items ?? []) as KbItem[])).catch(() => {})
    fetch('/api/ai/usage').then((r) => r.json()).then((d) => setUsage((d as Usage) ?? null)).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  async function saveAi() {
    if (!ai) return
    setBusy(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai: { baseUrl: ai.baseUrl, apiKey: apiKey || undefined, model: ai.model } }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error((d as { error?: string }).error)
      toast({ title: 'تنظیمات هوش مصنوعی ذخیره شد ✓', description: `موتور فعال: ${(d as { engine?: string }).engine ?? '—'}` })
      setApiKey('')
      load()
    } catch (e) { toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' }) }
    finally { setBusy(false) }
  }

  async function testAi() {
    setTestMsg(null)
    const res = await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: ai?.baseUrl, apiKey: apiKey || undefined, model: ai?.model }),
    })
    const d = (await res.json().catch(() => null)) as { ok: boolean; message: string } | null
    setTestMsg(d ?? { ok: false, message: `خطای ${res.status} در آزمایش اتصال` })
  }

  async function saveDna() {
    if (!dna) return
    setBusy(true)
    try {
      const res = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dna }) })
      const d = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(d.error ?? `خطای ${res.status}`)
      toast({ title: 'هویت کلینیک ذخیره شد ✓', description: 'از این پس دستیارها با همین لحن و قواعد جواب می‌دهند' })
    } catch (e) { toast({ title: 'خطا', description: e instanceof Error ? e.message : 'ذخیره‌سازی ناموفق بود', variant: 'destructive' }) }
    finally { setBusy(false) }
  }

  async function addKb() {
    if (!newQ.trim() || !newA.trim()) { toast({ title: 'خطا', description: 'پرسش و پاسخ لازم است', variant: 'destructive' }); return }
    setBusy(true)
    try {
      const res = await fetch('/api/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: newQ, answer: newA }) })
      const d = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(d.error ?? `خطای ${res.status}`)
      setNewQ(''); setNewA('')
      load()
      toast({ title: 'به پایگاه دانش اضافه شد ✓' })
    } catch (e) { toast({ title: 'خطا', description: e instanceof Error ? e.message : 'افزودن ناموفق بود', variant: 'destructive' }) }
    finally { setBusy(false) }
  }

  async function delKb(id: string) {
    const res = await fetch(`/api/knowledge/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast({ title: 'خطا', description: `حذف ناموفق بود (خطای ${res.status})`, variant: 'destructive' }); return }
    load()
    toast({ title: 'از پایگاه دانش حذف شد' })
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="تنظیمات سامانه" subtitle="اتصال هوش مصنوعی، هویت مجموعه، پایگاه دانش و پایش دستیارها" />

      <Tabs defaultValue="ai" dir="rtl">
        <TabsList className="rounded-xl bg-muted flex-wrap h-auto">
          <TabsTrigger value="ai" className="rounded-lg text-xs md:text-sm"><Plug className="inline h-3.5 w-3.5 ml-1" />هوش مصنوعی</TabsTrigger>
          <TabsTrigger value="dna" className="rounded-lg text-xs md:text-sm"><Brain className="inline h-3.5 w-3.5 ml-1" />هویت کلینیک</TabsTrigger>
          <TabsTrigger value="kb" className="rounded-lg text-xs md:text-sm"><BookOpen className="inline h-3.5 w-3.5 ml-1" />پایگاه دانش</TabsTrigger>
          <TabsTrigger value="usage" className="rounded-lg text-xs md:text-sm"><BarChart3 className="inline h-3.5 w-3.5 ml-1" />عملکرد دستیارها</TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="mt-4 space-y-4">
          {ai && (
            <Card className="rounded-2xl border">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-sky-600" />
                    <span className="text-muted-foreground">موتور فعال فعلی:</span>
                    <Pill label={ai.engine} color="bg-sky-100 text-sky-800 border-sky-200" />
                  </div>
                  <span className="text-xs text-muted-foreground">بدون تنظیم هم کار می‌کند؛ برای پرووایدر خودتان (OpenAI‌سازگار) مقادیر زیر را پر کنید.</span>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div><Label>آدرس پایه (مثل https://api.provider.com/v1)</Label><Input value={ai.baseUrl} onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })} className="rounded-xl text-sm" dir="ltr" placeholder="https://api.omuiroute.local/v1" /></div>
                  <div><Label>مدل (مثل gpt-4o-mini یا glm-4-flash)</Label><Input value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} className="rounded-xl text-sm" dir="ltr" /></div>
                  <div className="md:col-span-2"><Label>کلید API {ai.apiKeyMasked ? `(ذخیره‌شده: ${ai.apiKeyMasked})` : ''}</Label><Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="rounded-xl text-sm" dir="ltr" placeholder="sk-..." type="password" /></div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button className="rounded-xl" onClick={saveAi} disabled={busy}><Save className="h-4 w-4" /> ذخیره</Button>
                  <Button variant="outline" className="rounded-xl" onClick={testAi}><FlaskConical className="h-4 w-4" /> تست اتصال</Button>
                </div>
                {testMsg && <div className={`text-sm rounded-xl p-3 ${testMsg.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{testMsg.message}</div>}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="dna" className="mt-4">
          {dna && (
            <Card className="rounded-2xl border"><CardContent className="p-4 space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div><Label>نام مجموعه</Label><Input value={dna.clinicName} onChange={(e) => setDna({ ...dna, clinicName: e.target.value })} className="rounded-xl" /></div>
                <div><Label>شعار</Label><Input value={dna.tagline} onChange={(e) => setDna({ ...dna, tagline: e.target.value })} className="rounded-xl" /></div>
              </div>
              <div><Label>لحن و ارتباط (نحوه صحبت دستیارها با بیماران)</Label><Textarea rows={3} value={dna.tone} onChange={(e) => setDna({ ...dna, tone: e.target.value })} className="rounded-xl" /></div>
              <div><Label>قواعد و استثناها (اولویت‌ها، اورژانس‌ها، بیماران خاص)</Label><Textarea rows={4} value={dna.rules} onChange={(e) => setDna({ ...dna, rules: e.target.value })} className="rounded-xl" /></div>
              <div><Label>روال‌ها (نوبت‌دهی، پذیرش، پیگیری، تحویل شیفت)</Label><Textarea rows={4} value={dna.processes} onChange={(e) => setDna({ ...dna, processes: e.target.value })} className="rounded-xl" /></div>
              <Button className="rounded-xl" onClick={saveDna} disabled={busy}><Save className="h-4 w-4" /> ذخیره هویت</Button>
              <p className="text-[11px] text-muted-foreground">این متن در پرامپت همه‌ی دستیارها (بیمار، منشی، پزشک، مدیر) تزریق می‌شود — «هرچه بیشتر کار کنید، بیشتر شبیه مجموعه شما می‌شود».</p>
            </CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="kb" className="mt-4 space-y-4">
          <Card className="rounded-2xl border"><CardContent className="p-4 space-y-3">
            <div><Label>پرسش</Label><Input value={newQ} onChange={(e) => setNewQ(e.target.value)} className="rounded-xl" placeholder="مثلاً ساعات کاری؟" /></div>
            <div><Label>پاسخ</Label><Textarea rows={3} value={newA} onChange={(e) => setNewA(e.target.value)} className="rounded-xl" /></div>
            <Button className="rounded-xl" onClick={addKb}><BookOpen className="h-4 w-4" /> افزودن به دانش</Button>
          </CardContent></Card>
          <div className="space-y-2.5">
            {kb.length === 0 && <EmptyState text="پایگاه دانش خالی است" />}
            {kb.map((k) => (
              <Card key={k.id} className="rounded-2xl border"><CardContent className="p-3.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold">{k.question}</div>
                  <div className="text-xs text-muted-foreground mt-1 leading-5">{k.answer}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Pill label={k.isActive ? 'فعال' : 'غیرفعال'} color={k.isActive ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-stone-100 text-stone-600 border-stone-200'} />
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" aria-label="حذف آیتم دانش" onClick={() => delKb(k.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent></Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="usage" className="mt-4 space-y-4">
          {!usage?.summary ? <div className="text-sm text-muted-foreground p-4 rounded-xl border bg-card">دادهٔ عملکرد دستیارها برای نقش شما در دسترس نیست — با نقش کلینیک وارد شوید.</div> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard title="فراخوانی ۳۰ روز اخیر" value={faDigits(usage.summary?.total)} tone="purple" icon={<Sparkles className="h-5 w-5" />} />
                <StatCard title="سهم هوش مصنوعی واقعی" value={`${faDigits(usage.summary?.aiShare)}٪`} tone="green" hint={`بقیه حالت قانون‌محور`} />
                <StatCard title="میانگین تأخیر" value={`${faDigits(usage.summary.avgLatencyMs)}ms`} />
                <StatCard title="موفق" value={`${faDigits(usage.summary.ok)}/${faDigits(usage.summary?.total)}`} />
              </div>
              <Card className="rounded-2xl border"><CardContent className="p-4">
                <h3 className="font-bold mb-3">به تفکیک دستیار</h3>
                <div className="space-y-2">
                  {Object.entries(usage.byAgent).map(([agent, s]) => (
                    <div key={agent} className="flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm">
                      <span className="font-medium">{AGENT_FA[agent] ?? agent}</span>
                      <span className="text-xs text-muted-foreground">
                        {faDigits(s.total)} فراخوانی · هوش مصنوعی {faDigits(Math.round((s.aiUsed / Math.max(1, s.total)) * 100))}٪ · موفقیت {faDigits(Math.round((s.ok / Math.max(1, s.total)) * 100))}٪
                      </span>
                    </div>
                  ))}
                  {Object.keys(usage.byAgent).length === 0 && <EmptyState text="آماری ثبت نشده است" />}
                </div>
              </CardContent></Card>
              <Card className="rounded-2xl border"><CardContent className="p-4">
                <h3 className="font-bold mb-3">آخرین فراخوانی‌ها</h3>
                <div className="divide-y rounded-xl border text-xs">
                  {usage.recent.map((c) => (
                    <div key={c.id} className="flex items-center justify-between px-3 py-2">
                      <span>{AGENT_FA[c.agent] ?? c.agent} — {ROLE_FA[c.role] ?? c.role}</span>
                      <span className="text-muted-foreground">{c.aiUsed ? '🤖' : '📐'} {faDigits(c.latencyMs)}ms · {formatJDate(new Date(c.createdAt), false)}</span>
                    </div>
                  ))}
                </div>
              </CardContent></Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
