'use client'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { KeyboardEvent, ReactNode } from 'react'

export function StatCard({
  title,
  value,
  hint,
  icon,
  tone = 'default',
  onClick,
}: {
  title: string
  value: string
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'purple' | 'gold' | 'green' | 'red'
  onClick?: () => void
}) {
  const tones: Record<string, string> = {
    default: 'bg-card',
    purple: 'bg-linear-to-tl from-sky-600 via-sky-500 to-teal-500 text-white border-transparent shadow-lg shadow-sky-500/20',
    gold: 'bg-linear-to-tl from-[#B08D57] to-[#CBAF83] text-white border-transparent shadow-lg shadow-[#B08D57]/25',
    green: 'bg-linear-to-tl from-teal-600 to-teal-400 text-white border-transparent shadow-lg shadow-teal-500/20',
    red: 'bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]',
  }
  const isColor = tone !== 'default' && tone !== 'red'
  const clickable = typeof onClick === 'function'

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (!clickable) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick?.()
    }
  }

  return (
    <Card
      className={cn('rounded-2xl border', tones[tone], clickable && 'cursor-pointer card-hover outline-none focus-visible:ring-2 focus-visible:ring-sky-400')}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={handleKey}
      aria-label={clickable ? `${title} — رفتن به بخش مربوط` : undefined}
    >
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className={cn('text-xs font-medium', isColor || tone === 'red' ? 'opacity-80' : 'text-muted-foreground')}>{title}</div>
            <div className={cn('mt-1.5 text-lg md:text-2xl font-bold truncate', isColor || tone === 'red' ? '' : 'text-foreground')}>
              {value}
            </div>
            {hint ? <div className={cn('mt-1 text-[11px]', isColor ? 'opacity-85' : tone === 'red' ? 'opacity-90' : 'text-muted-foreground')}>{hint}</div> : null}
          </div>
          {icon ? <div className={cn('shrink-0 rounded-xl p-2', isColor || tone === 'red' ? 'bg-white/15' : 'bg-accent text-sky-600')}>{icon}</div> : null}
        </div>
      </CardContent>
    </Card>
  )
}

export function SectionHeader({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div>
        <h2 className="text-xl md:text-2xl font-bold">{title}</h2>
        {subtitle ? <p className="text-sm text-muted-foreground mt-1">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex items-center gap-2 flex-wrap">{children}</div> : null}
    </div>
  )
}

export function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', color)}>
      {label}
    </span>
  )
}

export function Avatar({ name, color = '#0284C7', size = 36 }: { name: string; color?: string; size?: number }) {
  const initial = name.trim().replace('دکتر ', '').charAt(0)
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold text-white shrink-0"
      style={{ background: color, width: size, height: size, fontSize: size * 0.45 }}
    >
      {initial}
    </span>
  )
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 rounded-2xl bg-muted/60 animate-pulse" />
      ))}
    </div>
  )
}
