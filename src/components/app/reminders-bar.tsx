'use client'

import { useEffect, useState } from 'react'
import { Bell, PhoneCall, Receipt, MessageSquare, Package, AlertTriangle, CalendarCheck, ChevronLeft } from 'lucide-react'
import { faDigits } from '@/lib/jalali'
import { formatToman } from '@/lib/format'

type Reminders = {
  counts: { tomorrowCalls: number; checksDue: number; overdueInvoices: number; lowStock: number; overdueTasks: number; unreadMsgs: number; newBookings: number }
  tomorrowCalls: { id: string; start: string; patient: { firstName: string; lastName: string; phone: string }; doctor: string; service: string }[]
  checksDue: { id: string; number: string; bank: string; dueDate: string; amount: number; direction: string }[]
  newBookings: { id: string; name: string; phone: string }[]
}

/** نوار یادآوری‌های هوشمند — بالای داشبورد منشی و مدیر */
export function RemindersBar({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const [data, setData] = useState<Reminders | null>(null)

  useEffect(() => {
    fetch('/api/reminders')
      .then((r) => r.json())
      // فقط پاسخ با شکل درست ست می‌شود؛ بدنه‌های خطا (مثل 403) → null تا کرش نکند
      .then((d) => setData(d && (d as Reminders).counts ? (d as Reminders) : null))
      .catch(() => {})
  }, [])

  if (!data) return null
  const { counts } = data
  const chips: { label: string; tone: string; icon: typeof Bell; nav?: string }[] = []
  if (counts.tomorrowCalls) chips.push({ label: `${faDigits(counts.tomorrowCalls)} تماس یادآوری فردا`, tone: 'bg-sky-50 text-sky-800 border-sky-200', icon: PhoneCall, nav: 'agent' })
  if (counts.checksDue) chips.push({ label: `${faDigits(counts.checksDue)} چک سررسیدنزدیک`, tone: 'bg-amber-50 text-amber-900 border-amber-200', icon: CalendarCheck, nav: 'finance' })
  if (counts.overdueInvoices) chips.push({ label: `${faDigits(counts.overdueInvoices)} فاکتور معوق`, tone: 'bg-rose-50 text-rose-700 border-rose-200', icon: Receipt, nav: 'finance' })
  if (counts.unreadMsgs) chips.push({ label: `${faDigits(counts.unreadMsgs)} پیام خوانده‌نشده`, tone: 'bg-teal-50 text-teal-800 border-teal-200', icon: MessageSquare, nav: 'messages' })
  if (counts.newBookings) chips.push({ label: `${faDigits(counts.newBookings)} درخواست رزرو وب`, tone: 'bg-violet-50 text-violet-800 border-violet-200', icon: CalendarCheck, nav: 'tasks' })
  if (counts.lowStock) chips.push({ label: `${faDigits(counts.lowStock)} قلم کم‌موجود`, tone: 'bg-orange-50 text-orange-800 border-orange-200', icon: Package, nav: 'finance' })
  if (counts.overdueTasks) chips.push({ label: `${faDigits(counts.overdueTasks)} کار عقب‌افتاده`, tone: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle, nav: 'tasks' })

  if (!chips.length) return null

  const firstCall = data.tomorrowCalls[0]
  void firstCall
  void data.checksDue[0]

  return (
    <div className="rounded-2xl border bg-white/70 backdrop-blur px-4 py-3 mb-5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-foreground">
          <Bell className="h-3.5 w-3.5 text-amber-500" /> کارتابل هوشمند
        </span>
        {chips.map((c) => (
          <button key={c.label} onClick={() => c.nav && onNavigate?.(c.nav)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-transform hover:scale-[1.03] ${c.tone}`}>
            <c.icon className="h-3 w-3" /> {c.label} <ChevronLeft className="h-3 w-3 opacity-50" />
          </button>
        ))}
        <span className="text-[10px] text-muted-foreground mr-auto">کلید روی هر هشدار = پرش به همان بخش</span>
      </div>
    </div>
  )
}
