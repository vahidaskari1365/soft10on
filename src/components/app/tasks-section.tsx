'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SectionHeader, Pill, EmptyState, LoadingBlock } from './bits'
import type { TaskItem } from './types'
import { TASK_STATUS, TASK_PRIORITY, ROLE_LABEL, SOURCE_LABEL } from '@/lib/format'
import { formatJDate, formatTime, formatDayRelative, faDigits } from '@/lib/jalali'
import { CheckCircle2, CircleDot, PauseCircle, Clock } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const FILTERS = [
  { key: 'all', label: 'همه' },
  { key: 'OPEN', label: 'باز' },
  { key: 'IN_PROGRESS', label: 'در حال انجام' },
  { key: 'BLOCKED', label: 'متوقف‌شده' },
  { key: 'DONE', label: 'انجام‌شده' },
] as const

export function TasksSection() {
  const [tasks, setTasks] = useState<TaskItem[] | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const { toast } = useToast()

  const load = async () => {
    const r = await fetch('/api/tasks')
    const j = await r.json()
    setTasks(j.tasks ?? [])
  }
  useEffect(() => {
    load()
  }, [])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, OPEN: 0, IN_PROGRESS: 0, BLOCKED: 0, DONE: 0 }
    for (const t of tasks ?? []) {
      c.all += 1
      c[t.status] = (c[t.status] ?? 0) + 1
    }
    return c
  }, [tasks])

  const changeStatus = async (t: TaskItem, status: string) => {
    const r = await fetch(`/api/tasks/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (r.ok) {
      toast({ title: 'وضعیت کار به‌روزرسانی شد', description: `${t.title} — ${TASK_STATUS[status].label}` })
      load()
    }
  }

  const filtered =
    filter === 'all'
      ? (tasks ?? []).filter((t) => t.status !== 'DONE')
      : (tasks ?? []).filter((t) => t.status === filter)

  return (
    <div className="space-y-4">
      <SectionHeader title="کارتابل عملیات" subtitle="هر درخواست، یک کار با مسئول و مهلت مشخص — هیچ کاری گم نمی‌شود" />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
              filter === f.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-secondary'
            }`}
          >
            {f.label}
            <span className={`mr-1.5 text-[10px] ${filter === f.key ? 'opacity-80' : 'text-muted-foreground'}`}>
              {faDigits(counts[f.key] ?? 0)}
            </span>
          </button>
        ))}
      </div>

      {!tasks ? (
        <LoadingBlock rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState text="کاری در این وضعیت وجود ندارد." />
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {filtered.map((t) => {
            const st = TASK_STATUS[t.status]
            const pr = TASK_PRIORITY[t.priority]
            const overdue = t.status !== 'DONE' && new Date(t.dueAt) < new Date()
            return (
              <Card key={t.id} className={`rounded-2xl ${overdue ? 'border-rose-300' : ''}`}>
                <CardHeader className="pb-1.5 px-4 pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm leading-5 font-bold">
                      <span className="inline-block h-2 w-2 rounded-full ml-1.5 align-middle" style={{ background: pr.color }} />
                      {t.title}
                    </CardTitle>
                    <StatusMenu t={t} onChange={changeStatus} />
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  {t.description ? <p className="text-xs text-muted-foreground leading-5">{t.description}</p> : null}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <Pill label={st.label} color={st.color} />
                    <Pill label={`اولویت: ${pr.label}`} color="bg-muted text-foreground/70 border-transparent" />
                    <Pill label={ROLE_LABEL[t.assigneeRole] ?? t.assigneeRole} color="bg-secondary text-secondary-foreground border-transparent" />
                    <Pill label={`منبع: ${SOURCE_LABEL[t.source] ?? t.source}`} color="bg-muted text-muted-foreground border-transparent" />
                    {t.patient ? (
                      <Pill
                        label={`بیمار: ${t.patient.firstName} ${t.patient.lastName}`}
                        color="bg-[#F6EFE3] text-[#7C6434] border-transparent"
                      />
                    ) : null}
                  </div>
                  <div className={`flex items-center gap-1.5 text-[11px] ${overdue ? 'text-rose-600 font-semibold' : 'text-muted-foreground'}`}>
                    <Clock className="h-3 w-3" />
                    مهلت: {formatDayRelative(new Date(t.dueAt))} — {formatJDate(new Date(t.dueAt), false)}، {formatTime(new Date(t.dueAt))}
                    {overdue ? ' (سررسید گذشته)' : ''}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatusMenu({ t, onChange }: { t: TaskItem; onChange: (t: TaskItem, s: string) => void }) {
  const items: { key: string; label: string; icon: React.ReactNode }[] = [
    { key: 'OPEN', label: TASK_STATUS.OPEN.label, icon: <CircleDot className="h-3.5 w-3.5" /> },
    { key: 'IN_PROGRESS', label: TASK_STATUS.IN_PROGRESS.label, icon: <Clock className="h-3.5 w-3.5" /> },
    { key: 'DONE', label: TASK_STATUS.DONE.label, icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    { key: 'BLOCKED', label: TASK_STATUS.BLOCKED.label, icon: <PauseCircle className="h-3.5 w-3.5" /> },
  ]
  return (
    <div className="flex gap-1">
      {items
        .filter((i) => i.key !== t.status)
        .slice(0, 2)
        .map((i) => (
          <Button key={i.key} size="sm" variant="ghost" className="h-7 px-2 text-[11px] rounded-lg" onClick={() => onChange(t, i.key)}>
            {i.icon}
            <span className="hidden sm:inline mr-1">{i.label}</span>
          </Button>
        ))}
    </div>
  )
}
