'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { faDigits } from '@/lib/jalali'
import { formatToman } from '@/lib/format'
import {
  Bell, PhoneCall, Receipt, MessageSquare, Package, CalendarCheck, ClipboardList, Globe, Wallet, CheckCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Reminders = {
  counts: { tomorrowCalls: number; checksDue: number; overdueInvoices: number; lowStock: number; overdueTasks: number; unreadMsgs: number; newBookings: number }
  tomorrowCalls: { id: string; start: string; patient: { firstName: string; lastName: string; phone: string }; doctor: string; service: string }[]
  checksDue: { id: string; number: string; bank: string; dueDate: string; amount: number; direction: string }[]
  newBookings: { id: string; name: string; phone: string }[]
}

type Notice = {
  key: string
  category: 'appointment' | 'finance' | 'message' | 'inventory' | 'task' | 'web'
  icon: typeof Bell
  title: string
  detail?: string
  nav: string
  count: number
}

const CATEGORY_LABEL: Record<Notice['category'], string> = {
  appointment: 'نوبت',
  finance: 'مالی',
  message: 'پیام',
  inventory: 'انبار',
  task: 'وظیفه',
  web: 'وب',
}

const FILTERS: { key: 'all' | Notice['category']; label: string }[] = [
  { key: 'all', label: 'همه' },
  { key: 'appointment', label: 'نوبت‌ها' },
  { key: 'finance', label: 'مالی' },
  { key: 'message', label: 'پیام‌ها' },
]

/** مرکز اعلان‌های یکپارچه — زنگوله هدر با شمارنده و فیلتر */
export function NotificationCenter({ onNavigate }: { onNavigate: (section: string) => void }) {
  const [data, setData] = useState<Reminders | null>(null)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | Notice['category']>('all')
  const [readKeys, setReadKeys] = useState<Set<string>>(new Set())

  const load = useCallback(() => {
    fetch('/api/reminders')
      .then((r) => r.json())
      // فقط پاسخ با شکل درست ست می‌شود؛ بدنه‌های خطا (مثل 403) → null تا کرش نکند
      .then((d) => setData(d && (d as Reminders).counts ? (d as Reminders) : null))
      .catch(() => {})
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const notices = useMemo<Notice[]>(() => {
    if (!data) return []
    const c = data.counts
    const out: Notice[] = []
    if (c.tomorrowCalls) {
      const first = data.tomorrowCalls[0]
      out.push({
        key: 'tomorrow-calls', category: 'appointment', icon: PhoneCall, count: c.tomorrowCalls,
        title: `${faDigits(c.tomorrowCalls)} تماس یادآوری برای فردا`,
        detail: first ? `${first.patient.firstName} ${first.patient.lastName} — ${first.service}` : undefined,
        nav: 'agent',
      })
    }
    if (c.checksDue) {
      const first = data.checksDue[0]
      out.push({
        key: 'checks-due', category: 'finance', icon: Wallet, count: c.checksDue,
        title: `${faDigits(c.checksDue)} چک نزدیک سررسید`,
        detail: first ? `چک ${faDigits(first.number)} ${first.bank} — ${formatToman(first.amount)}` : undefined,
        nav: 'finance',
      })
    }
    if (c.overdueInvoices) out.push({ key: 'overdue-invoices', category: 'finance', icon: Receipt, count: c.overdueInvoices, title: `${faDigits(c.overdueInvoices)} فاکتور معوق`, nav: 'finance' })
    if (c.unreadMsgs) out.push({ key: 'unread-msgs', category: 'message', icon: MessageSquare, count: c.unreadMsgs, title: `${faDigits(c.unreadMsgs)} پیام خوانده‌نشده`, nav: 'messages' })
    if (c.overdueTasks) out.push({ key: 'overdue-tasks', category: 'task', icon: ClipboardList, count: c.overdueTasks, title: `${faDigits(c.overdueTasks)} وظیفه عقب‌افتاده`, nav: 'tasks' })
    if (c.lowStock) out.push({ key: 'low-stock', category: 'inventory', icon: Package, count: c.lowStock, title: `${faDigits(c.lowStock)} قلم کالا کم‌موجود`, nav: 'finance' })
    if (c.newBookings) {
      const first = data.newBookings[0]
      out.push({
        key: 'new-bookings', category: 'web', icon: Globe, count: c.newBookings,
        title: `${faDigits(c.newBookings)} درخواست رزرو جدید از وب`,
        detail: first ? `${first.name} — ${faDigits(first.phone)}` : undefined,
        nav: 'tasks',
      })
    }
    return out
  }, [data])

  const visible = filter === 'all' ? notices : notices.filter((n) => n.category === filter)
  const unreadCount = notices.filter((n) => !readKeys.has(n.key)).reduce((s, n) => s + n.count, 0)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="مرکز اعلان‌ها"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border bg-card text-muted-foreground hover:text-foreground hover:border-sky-300 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -left-1 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-1 shadow">
              {faDigits(Math.min(unreadCount, 99))}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 md:w-96 p-0">
        <div className="flex items-center justify-between px-3 py-2.5 border-b">
          <div className="text-sm font-bold">اعلان‌ها</div>
          <button
            onClick={() => setReadKeys(new Set(notices.map((n) => n.key)))}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-sky-600 transition-colors"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            خواندن همه
          </button>
        </div>
        <div className="px-3 py-2 flex gap-1.5 flex-wrap border-b">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                filter === f.key
                  ? 'bg-sky-500 text-white border-sky-500'
                  : 'text-muted-foreground hover:text-foreground hover:border-sky-300'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="max-h-72 overflow-y-auto scroll-thin">
          {data === null ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">در حال بارگیری…</div>
          ) : visible.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">اعلان جدیدی نیست 🎉</div>
          ) : (
            visible.map((n) => {
              const Icon = n.icon
              const isRead = readKeys.has(n.key)
              return (
                <button
                  key={n.key}
                  onClick={() => {
                    setReadKeys((s) => new Set(s).add(n.key))
                    setOpen(false)
                    onNavigate(n.nav)
                  }}
                  className={cn(
                    'w-full flex items-start gap-2.5 px-3 py-2.5 text-right hover:bg-accent transition-colors border-b last:border-b-0',
                    isRead && 'opacity-55'
                  )}
                >
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-semibold leading-5">{n.title}</span>
                    {n.detail ? <span className="block text-[11px] text-muted-foreground truncate">{n.detail}</span> : null}
                  </span>
                  <span className="mt-1 inline-flex items-center gap-1 shrink-0">
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{CATEGORY_LABEL[n.category]}</span>
                    {!isRead ? <span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> : null}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
