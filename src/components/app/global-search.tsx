'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Search } from 'lucide-react'
import { faDigits } from '@/lib/jalali'
import { formatToman } from '@/lib/format'

type SearchRow = { key: string; group: string; title: string; hint?: string; nav: string }
type PatientRow = { id: string; firstName: string; lastName: string; phone?: string | null; code?: string | null }
type InvoiceRow = { id: string; number: number; total?: number; grandTotal?: number; status: string; patientName?: string }
type TaskRow = { id: string; title: string; status?: string; priority?: string }
type MessageRow = { id: string; subject?: string; body?: string; patientName?: string; direction?: string }

const GROUP_LABEL: Record<string, string> = {
  patient: 'بیماران',
  invoice: 'فاکتورها',
  task: 'وظایف',
  message: 'پیام‌ها',
}

/**
 * جست‌وجوی سراسری + Command Palette (⌘K)
 * داده‌ها یک‌بار پس از باز شدن پنجره بارگیری و سمت کاربر فیلتر می‌شوند؛
 * برای حجم بالا باید نسخه server-side جست‌وجو اضافه شود (موارد تکمیل‌نشده گزارش).
 */
export function GlobalSearch({ onNavigate }: { onNavigate: (section: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<SearchRow[]>([])
  const [loading, setLoading] = useState(false)
  const loaded = useRef(false)

  const load = useCallback(async () => {
    if (loaded.current) return
    setLoading(true)
    try {
      const [p, i, t, m] = await Promise.all([
        fetch('/api/patients').then((r) => r.json()).catch(() => null),
        fetch('/api/invoices').then((r) => r.json()).catch(() => null),
        fetch('/api/tasks').then((r) => r.json()).catch(() => null),
        fetch('/api/messages').then((r) => r.json()).catch(() => null),
      ])
      const out: SearchRow[] = []
      const patients: PatientRow[] = p?.items ?? p ?? []
      for (const x of patients as PatientRow[]) {
        out.push({
          key: `p-${x.id}`,
          group: 'patient',
          title: `${x.firstName} ${x.lastName}`,
          hint: x.phone ? faDigits(x.phone) : undefined,
          nav: 'patients',
        })
      }
      const invoices: InvoiceRow[] = i?.items ?? []
      for (const x of invoices) {
        out.push({
          key: `i-${x.id}`,
          group: 'invoice',
          title: `فاکتور شماره ${faDigits(x.number)}`,
          hint: `${(x.patientName ?? '')} · ${formatToman(x.grandTotal ?? x.total ?? 0)} · ${x.status === 'PAID' ? 'پرداخت‌شده' : x.status === 'PARTIAL' ? 'پرداخت جزئی' : 'پرداخت‌نشده'}`,
          nav: 'finance',
        })
      }
      const tasks: TaskRow[] = t?.items ?? t ?? []
      for (const x of tasks as TaskRow[]) {
        out.push({ key: `t-${x.id}`, group: 'task', title: x.title, hint: x.priority ? `اولویت ${x.priority}` : undefined, nav: 'tasks' })
      }
      const messages: MessageRow[] = m?.items ?? []
      for (const x of messages) {
        out.push({
          key: `m-${x.id}`,
          group: 'message',
          title: x.subject || (x.body ?? '').slice(0, 40),
          hint: x.patientName,
          nav: 'messages',
        })
      }
      setRows(out)
      loaded.current = true
    } finally {
      setLoading(false)
    }
  }, [])

  // میان‌بر کیبورد ⌘K / Ctrl+K
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => {
          const next = !o
          if (next) void load()
          return next
        })
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return rows
    const norm = q.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    return rows.filter(
      (r) => r.title.includes(q) || r.title.includes(norm) || (r.hint ?? '').includes(q) || (r.hint ?? '').includes(norm)
    )
  }, [rows, query])

  const grouped = useMemo(() => {
    const g: Record<string, SearchRow[]> = {}
    for (const r of filtered) (g[r.group] ??= []).push(r)
    return g
  }, [filtered])

  function go(r: SearchRow) {
    setOpen(false)
    setQuery('')
    onNavigate(r.nav)
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true)
          void load()
        }}
        className="hidden md:inline-flex items-center gap-2 rounded-xl border bg-card px-3 h-9 text-xs text-muted-foreground hover:border-sky-300 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        aria-label="جست‌وجوی سراسری"
      >
        <Search className="h-3.5 w-3.5" />
        جست‌وجو…
        <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium" dir="ltr">⌘K</kbd>
      </button>
      <button
        onClick={() => {
          setOpen(true)
          void load()
        }}
        aria-label="جست‌وجو"
        className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-full border bg-card text-muted-foreground"
      >
        <Search className="h-4 w-4" />
      </button>

      <CommandDialog open={open} onOpenChange={(o) => { setOpen(o); if (o) void load() }}>
        <CommandInput
          placeholder={loading ? 'در حال بارگیری داده‌ها…' : 'جست‌وجو در بیماران، فاکتورها، وظایف و پیام‌ها…'}
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className="max-h-[55vh]">
          <CommandEmpty>نتیجه‌ای یافت نشد</CommandEmpty>
          {Object.entries(grouped).map(([g, items]) => (
            <CommandGroup key={g} heading={GROUP_LABEL[g] ?? g}>
              {items.slice(0, 8).map((r) => (
                <CommandItem key={r.key} onSelect={() => go(r)} className="gap-2">
                  <span className="font-medium">{r.title}</span>
                  {r.hint ? <span className="text-xs text-muted-foreground">{r.hint}</span> : null}
                </CommandItem>
              ))}
              {items.length > 8 ? (
                <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                  {faDigits(items.length - 8)} مورد دیگر…
                </div>
              ) : null}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  )
}
