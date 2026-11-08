'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionHeader, Pill } from './bits'
import type { AssistantResponse, BotMessage, Chip, TraceStep } from './types'
import { formatDayRelative, formatJDate, formatTime, faDigits } from '@/lib/jalali'
import { Bot, Check, Loader2, MessageSquareText, Send, Sparkles, CalendarDays, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Bubble {
  from: 'bot' | 'patient'
  text: string
  kind?: 'info' | 'success' | 'warn'
}

const INITIAL_TRACE: TraceStep[] = [
  { key: 'understand', label: 'دریافت و درک پیام بیمار', state: 'pending' },
  { key: 'identify', label: 'شناسایی بیمار در سیستم', state: 'pending' },
  { key: 'calendar', label: 'بررسی تقویم و ظرفیت پزشکان', state: 'pending' },
  { key: 'book', label: 'ثبت نوبت در سیستم', state: 'pending' },
  { key: 'cartable', label: 'ثبت در کارتابل منشی + یادآوری', state: 'pending' },
]

export function AssistantSection({
  onNavigate,
  patient,
}: {
  onNavigate: (key: string) => void
  patient?: { id: string; name: string; phone: string }
}) {
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [chips, setChips] = useState<Chip[]>([])
  const [trace, setTrace] = useState<TraceStep[]>(INITIAL_TRACE)
  const [ctx, setCtx] = useState<Record<string, unknown>>({})
  const [thinking, setThinking] = useState(false)
  const [input, setInput] = useState('')
  const [booked, setBooked] = useState<{ text: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [bubbles, thinking, chips])

  async function send(payload: { action: string; [k: string]: unknown }, patientText: string | null) {
    if (patientText) {
      setBubbles((b) => [...b, { from: 'patient', text: patientText }])
    }
    setThinking(true)
    setChips([])
    try {
      const r = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, ctx }),
      })
      const j: AssistantResponse = await r.json()
      setThinking(false)
      if (j.messages?.length) {
        setBubbles((b) => [...b, ...j.messages.map((m: BotMessage) => ({ from: 'bot' as const, text: m.text, kind: m.kind }))])
      }
      setChips(j.chips ?? [])
      setTrace(j.trace ?? INITIAL_TRACE)
      setCtx(j.ctx ?? {})
      if (j.result?.appointmentId) {
        const last = j.messages?.find((m) => m.kind === 'success')
        setBooked({ text: last?.text ?? 'نوبت ثبت شد' })
      }
    } catch {
      setThinking(false)
      setBubbles((b) => [...b, { from: 'bot', text: 'ارتباط برقرار نشد؛ دوباره تلاش کنید.', kind: 'warn' }])
    }
  }

  useEffect(() => {
    send({ action: 'greet' }, null)
  }, [])

  const onChip = (c: Chip) => {
    const isBooking = c.payload.action === 'book' && c.payload.start
    setBubbles((b) => [...b, { from: 'patient', text: c.label }])
    setChips([])
    // اگر بیمار لاگین‌شده باشد، نوبت به پرونده‌ی خودش ثبت می‌شود؛ وگرنه هویت نمایشی
    const identity = patient
      ? { patientId: patient.id, name: patient.name, phone: patient.phone }
      : { name: c.payload.name ?? 'مینا کریمی', phone: c.payload.phone ?? '09121234567' }
    send({ ...c.payload, ...identity }, isBooking ? null : null)
  }

  const submitInput = () => {
    const t = input.trim()
    if (!t || thinking) return
    setInput('')
    send({ action: 'text', text: t }, t)
  }

  const doneCount = trace.filter((s) => s.state === 'done').length

  return (
    <div className="space-y-4">
      <SectionHeader
        title="دستیار بیمار — شینا"
        subtitle="همان تجربه‌ای که بیمار در واتساپ و وب‌سایت دارد؛ نتیجه‌اش مستقیم در تقویم و کارتابل شماست"
      >
        <Pill label="واتساپ" color="bg-emerald-100 text-emerald-800 border-emerald-200" />
        <Pill label="وب‌سایت" color="bg-violet-100 text-violet-800 border-violet-200" />
        <Pill label="پیامک" color="bg-amber-100 text-amber-800 border-amber-200" />
        <Pill label="۲۴ ساعته" color="bg-[#F7EFDA] text-[#7a5d14] border-transparent" />
      </SectionHeader>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Chat */}
        <Card className="rounded-2xl lg:col-span-2 flex flex-col h-[620px]">
          <CardContent className="p-0 flex flex-col h-full">
            {/* header */}
            <div className="flex items-center gap-3 border-b px-4 py-3 bg-gradient-to-l from-[#5B2A86] to-[#7C4AA8] text-white rounded-t-2xl">
              <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
                <Bot className="h-5 w-5" />
                <span className="absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-white" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">شینا · دستیار هوشمند بیمار</div>
                <div className="text-[11px] opacity-85">آنلاین — پاسخ‌گویی شبانه‌روزی</div>
              </div>
              <MessageSquareText className="h-4 w-4 opacity-70" />
            </div>

            {/* messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-thin px-4 py-4 space-y-3 bg-[#FAF7F1]">
              {bubbles.map((b, i) => (
                <div key={i} className={cn('flex bubble-in', b.from === 'patient' ? 'justify-start' : 'justify-end')}>
                  <div
                    className={cn(
                      'max-w-[85%] md:max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 whitespace-pre-line shadow-sm',
                      b.from === 'patient'
                        ? 'bg-[#5B2A86] text-white rounded-bl-md'
                        : 'bg-white border text-foreground rounded-br-md',
                      b.kind === 'success' ? 'border-emerald-300 bg-emerald-50' : '',
                      b.kind === 'warn' ? 'border-rose-300 bg-rose-50' : ''
                    )}
                  >
                    {b.text}
                  </div>
                </div>
              ))}
              {thinking ? (
                <div className="flex justify-end">
                  <div className="bg-white border rounded-2xl rounded-br-md px-4 py-2.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    شینا در حال بررسی…
                  </div>
                </div>
              ) : null}
            </div>

            {/* chips */}
            {chips.length > 0 ? (
              <div className="border-t px-3 py-2.5 flex flex-wrap gap-1.5 bg-white max-h-36 overflow-y-auto scroll-thin">
                {chips.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => onChip(c)}
                    className="rounded-full border border-primary/30 bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            ) : null}

            {/* input */}
            <div className="border-t p-3 flex items-center gap-2 bg-white rounded-b-2xl">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitInput()}
                placeholder="پیام خود را بنویسید… (مثلاً: برای جرم‌گیری نوبت می‌خوام)"
                className="rounded-xl text-sm"
              />
              <Button size="icon" className="rounded-xl h-10 w-10 shrink-0" onClick={submitInput} disabled={thinking}>
                <Send className="h-4 w-4 rotate-180" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Agent trace */}
        <div className="space-y-4">
          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold">پشت‌صحنه‌ی دستیار</span>
                <span className="text-[11px] text-muted-foreground mr-auto">
                  {faDigits(doneCount)} از {faDigits(trace.length)} گام
                </span>
              </div>
              <div className="space-y-0">
                {trace.map((s, i) => (
                  <div key={s.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          'inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] shrink-0',
                          s.state === 'done' ? 'bg-emerald-500 text-white' : s.state === 'active' ? 'bg-amber-400 text-white trace-active' : 'bg-muted text-muted-foreground border'
                        )}
                      >
                        {s.state === 'done' ? <Check className="h-3.5 w-3.5" /> : faDigits(i + 1)}
                      </span>
                      {i < trace.length - 1 ? <span className="w-px flex-1 bg-border my-0.5" /> : null}
                    </div>
                    <div className={cn('pb-4 text-xs leading-5', s.state === 'pending' ? 'text-muted-foreground' : 'text-foreground font-medium')}>
                      {s.label}
                      {s.state === 'active' ? <span className="block text-[10px] text-amber-600 font-normal">در حال انجام…</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {booked ? (
            <Card className="rounded-2xl border-emerald-300 bg-emerald-50/60">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                  <Check className="h-4 w-4" /> نوبت در سیستم ثبت شد
                </div>
                <p className="text-xs text-muted-foreground leading-5 whitespace-pre-line">{booked.text}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" className="rounded-xl text-xs" onClick={() => onNavigate('appointments')}>
                    <CalendarDays className="h-3.5 w-3.5 ml-1" /> در تقویم
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-xl text-xs" onClick={() => onNavigate('tasks')}>
                    <Inbox className="h-3.5 w-3.5 ml-1" /> در کارتابل
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-2xl">
              <CardContent className="p-4 text-xs text-muted-foreground leading-6">
                <div className="font-bold text-foreground text-sm mb-2">چطور امتحان کنیم؟</div>
                روی «🗓 نوبت می‌خوام» بزنید، خدمت را انتخاب کنید و یکی از زمان‌های خالی واقعی تقویم پزشکان را بگیرید.
                نوبت با وضعیت «در انتظار تأیید» ثبت می‌شود، تسک تأیید در کارتابل منشی ساخته می‌شود و یادآوری خودکار زمان‌بندی می‌شود.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
