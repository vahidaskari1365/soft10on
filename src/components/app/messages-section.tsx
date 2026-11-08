'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionHeader, Pill, LoadingBlock, EmptyState, Avatar } from './bits'
import { faDigits, formatJDate, formatTime } from '@/lib/jalali'
import { MessageSquare, Send, Bot, UserRound } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

type Thread = { patientId: string; name: string; phone: string; last: string; lastAt: string; lastDirection: string; unread: number }
type Msg = { id: string; direction: string; body: string; aiGenerated: boolean; createdAt: string }

export function MessagesSection({ isPatient }: { isPatient?: boolean }) {
  const { toast } = useToast()
  const [threads, setThreads] = useState<Thread[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [thread, setThread] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadThreads = useCallback(() => {
    if (isPatient) { setLoading(false); return }
    fetch('/api/messages').then((r) => r.json()).then((d) => setThreads((d.threads ?? []) as Thread[])).finally(() => setLoading(false))
  }, [isPatient])

  const loadThread = useCallback((pid: string | null) => {
    if (!pid && !isPatient) return
    const url = pid ? `/api/messages?patient=${pid}` : '/api/messages'
    fetch(url).then((r) => r.json()).then((d) => setThread((d.thread ?? []) as Msg[]))
  }, [isPatient])

  useEffect(() => { loadThreads() }, [loadThreads])
  useEffect(() => { if (isPatient) loadThread(null) }, [isPatient, loadThread])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [thread])

  async function send() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isPatient ? { body } : { patientId: selected, body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'خطا')
      setText('')
      if (isPatient) loadThread(null)
      else if (selected) loadThread(selected)
      loadThreads()
      if ((data as { reply?: { aiGenerated: boolean } }).reply?.aiGenerated) {
        toast({ title: 'پاسخ خودکار هوشمند ارسال شد', description: 'دستیار 10on به پیام شما جواب داد' })
      }
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'ارسال ناموفق بود', variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  if (isPatient) {
    return (
      <div className="space-y-4">
        <SectionHeader title="پیام با کلینیک" subtitle="سؤال بپرسید؛ دستیار هوشمند فوراً جواب می‌دهد و پیام‌هایتان برای پذیرش هم می‌رود" />
        <Card className="rounded-2xl border">
          <CardContent className="p-0">
            <div className="h-[55vh] overflow-y-auto p-4 space-y-3 scroll-thin">
              {thread.length === 0 && <EmptyState text="اولین پیام را بفرستید 👋" />}
              {thread.map((m) => (
                <div key={m.id} className={`flex ${m.direction === 'IN' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${m.direction === 'IN' ? 'bg-muted' : 'bg-linear-to-l from-sky-500 to-teal-500 text-white'}`}>
                    <div className="whitespace-pre-wrap">{m.body}</div>
                    <div className={`mt-1 text-[10px] flex items-center gap-1 ${m.direction === 'IN' ? 'text-muted-foreground' : 'text-white/70'}`}>
                      {m.aiGenerated && <Bot className="h-3 w-3" />}
                      {formatJDate(new Date(m.createdAt), false)} {formatTime(new Date(m.createdAt))}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="border-t p-3 flex gap-2">
              <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} placeholder="پیام خود را بنویسید…" className="rounded-xl" />
              <Button onClick={send} disabled={sending || !text.trim()} className="rounded-xl shrink-0"><Send className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="صندوق پیام‌ها" subtitle="گفتگو با بیماران — پاسخ‌های خودکار دستیار با علامت 🤖 مشخص می‌شود" />
      <div className="grid md:grid-cols-[300px_1fr] gap-4">
        <Card className="rounded-2xl border overflow-hidden">
          <CardContent className="p-0 max-h-[60vh] overflow-y-auto">
            {loading ? <div className="p-4"><LoadingBlock rows={4} /></div> : threads.length === 0 ? <div className="p-6"><EmptyState text="گفتگویی وجود ندارد" /></div> : (
              <div className="divide-y">
                {threads.map((t) => (
                  <button key={t.patientId} onClick={() => { setSelected(t.patientId); loadThread(t.patientId) }} className={`w-full text-right px-4 py-3 hover:bg-muted/60 ${selected === t.patientId ? 'bg-sky-50' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{t.name}</span>
                      {t.unread > 0 && <span className="rounded-full bg-sky-500 text-white text-[10px] px-1.5 py-0.5">{faDigits(t.unread)}</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate mt-1">{t.lastDirection === 'IN' ? '' : 'شما: '}{t.last.slice(0, 50)}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{faDigits(t.phone)}</div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border flex flex-col">
          <CardContent className="p-0 flex flex-col h-[60vh]">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center"><EmptyState text="یک گفتگو را انتخاب کنید" /></div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 scroll-thin">
                  {thread.map((m) => (
                    <div key={m.id} className={`flex ${m.direction === 'IN' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${m.direction === 'IN' ? 'bg-muted' : 'bg-linear-to-l from-sky-500 to-teal-500 text-white'}`}>
                        <div className="whitespace-pre-wrap">{m.body}</div>
                        <div className={`mt-1 text-[10px] flex items-center gap-1 ${m.direction === 'IN' ? 'text-muted-foreground' : 'text-white/70'}`}>
                          {m.aiGenerated && <Bot className="h-3 w-3" />}
                          {formatJDate(new Date(m.createdAt), false)} {formatTime(new Date(m.createdAt))}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
                <div className="border-t p-3 flex gap-2">
                  <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} placeholder="پاسخ به بیمار…" className="rounded-xl" />
                  <Button onClick={send} disabled={sending || !text.trim()} className="rounded-xl shrink-0"><Send className="h-4 w-4" /></Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <MessageSquare className="h-4 w-4" /> پیام‌های ورودیِ بی‌پاسخ در کارتابل یادآوری‌ها هم نشان داده می‌شوند
        <UserRound className="h-3.5 w-3.5" />
      </div>
    </div>
  )
}
