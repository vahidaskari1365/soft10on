'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionHeader } from '../bits'
import type { AgentResponse, AgentStepUI } from '../types'
import { cn } from '@/lib/utils'
import { BrainCircuit, Send, Loader2, Wrench, ChevronDown, Sparkles, CheckCircle2, XCircle, Cpu } from 'lucide-react'

type Msg = { role: 'user' | 'agent'; text: string; steps?: AgentStepUI[]; aiUsed?: boolean; at: number }

export function AgentChatSection({
  endpoint,
  title,
  subtitle,
  suggestions,
}: {
  endpoint: string
  title: string
  subtitle: string
  suggestions: string[]
}) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [openStep, setOpenStep] = useState<number | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    const history = messages.slice(-8).map((m) => ({ role: m.role === 'agent' ? 'assistant' : 'user', content: m.text }))
    setMessages((prev) => [...prev, { role: 'user', text: trimmed, at: Date.now() }])
    setInput('')
    setBusy(true)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history }),
      })
      const data = (await res.json()) as AgentResponse & { error?: string }
      if (!res.ok) {
        setMessages((prev) => [...prev, { role: 'agent', text: data.error ?? 'خطا در اجرای ایجنت', at: Date.now() }])
        return
      }
      setMessages((prev) => [...prev, { role: 'agent', text: data.answer, steps: data.steps, aiUsed: data.aiUsed, at: Date.now() }])
    } catch {
      setMessages((prev) => [...prev, { role: 'agent', text: 'ارتباط با ایجنت برقرار نشد؛ دوباره تلاش کنید.', at: Date.now() }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <SectionHeader title={title} subtitle={subtitle} />

      <div className="grid lg:grid-cols-[1fr_280px] gap-4 items-start">
        {/* Chat panel */}
        <Card className="rounded-2xl shadow-sm flex flex-col h-[68vh] min-h-[480px]">
          <CardContent className="p-0 flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6">
                  <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <BrainCircuit className="h-7 w-7" />
                  </span>
                  <div className="mt-4 font-bold">ایجنت آماده است</div>
                  <p className="text-xs text-muted-foreground mt-1.5 max-w-sm leading-6">
                    این ایجنت به‌جای پاسخ‌های از پیش نوشته‌شده، ابزارهای واقعی را روی دیتابیس اجرا می‌کند؛
                    مراحل کارش را در پنل «پشت‌صحنه» می‌بینید.
                  </p>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className={cn('flex', m.role === 'user' ? 'justify-start' : 'justify-end')}>
                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 whitespace-pre-wrap',
                        m.role === 'user'
                          ? 'bg-secondary text-foreground rounded-tr-sm'
                          : 'bg-primary text-primary-foreground rounded-tl-sm'
                      )}
                    >
                      {m.role === 'agent' && m.aiUsed === false ? (
                        <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px]">
                          حالت آفلاین ایجنت
                        </span>
                      ) : null}
                      {m.text}
                      {m.steps && m.steps.length > 0 ? (
                        <div className="mt-2.5 border-t border-white/20 pt-2 space-y-1.5">
                          {m.steps.map((s, j) => (
                            <div key={j}>
                              <button
                                onClick={() => setOpenStep(openStep === i * 100 + j ? null : i * 100 + j)}
                                className="inline-flex items-center gap-1.5 text-[11px] opacity-90 hover:opacity-100"
                              >
                                {s.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                                <Wrench className="h-3 w-3" />
                                {s.title}
                                <ChevronDown className={cn('h-3 w-3 transition-transform', openStep === i * 100 + j && 'rotate-180')} />
                              </button>
                              {openStep === i * 100 + j ? (
                                <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-black/25 p-2 text-[10px] leading-4 text-white/85" dir="ltr">
                                  {JSON.stringify(s.result, null, 1)}
                                </pre>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
              {busy ? (
                <div className="flex justify-end">
                  <div className="rounded-2xl bg-primary/10 text-primary px-4 py-3 text-sm inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    ایجنت در حال فکر کردن و اجرای ابزارها…
                  </div>
                </div>
              ) : null}
              <div ref={endRef} />
            </div>

            <div className="border-t p-3">
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  send(input)
                }}
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="سؤال یا دستور خود را بنویسید…"
                  disabled={busy}
                  className="rounded-xl"
                />
                <Button type="submit" size="icon" className="rounded-xl shrink-0" disabled={busy || !input.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

        {/* Side: suggestions + how it works */}
        <div className="space-y-4">
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm font-bold mb-3">
                <Sparkles className="h-4 w-4 text-[#B08D57]" /> پیشنهاد شروع
              </div>
              <div className="space-y-2">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    disabled={busy}
                    className="w-full text-right text-xs rounded-xl border bg-background px-3 py-2.5 leading-5 hover:border-primary/40 hover:bg-secondary/50 transition-colors disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm bg-secondary/40 border-secondary">
            <CardContent className="p-4 text-xs leading-6 text-muted-foreground">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground mb-2">
                <Cpu className="h-4 w-4 text-primary" /> ایجنت چطور کار می‌کند؟
              </div>
              ایجنت پیام شما را می‌خواند، از بین ابزارهای موجود (جست‌وجو، تقویم، ثبت نوبت، گزارش مالی…) ابزار لازم را
              <b className="text-foreground"> واقعاً روی دیتابیس </b>
              اجرا می‌کند و بعد از دیدن نتیجه، پاسخ نهایی را می‌نویسد. هر مرحله در گفتگو ثبت می‌شود.
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
