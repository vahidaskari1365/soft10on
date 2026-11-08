'use client'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export function StatCard({
  title,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  title: string
  value: string
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'purple' | 'gold' | 'green' | 'red'
}) {
  const tones: Record<string, string> = {
    default: 'bg-card',
    purple: 'bg-[#5B2A86] text-[#FBF9F4] border-[#5B2A86]',
    gold: 'bg-[#C9A227] text-[#2b2005] border-[#C9A227]',
    green: 'bg-[#2A9D8F] text-white border-[#2A9D8F]',
    red: 'bg-[#FBEAE7] text-[#8C2F1F] border-[#F0CFC8]',
  }
  const isColor = tone !== 'default' && tone !== 'red'
  return (
    <Card className={cn('rounded-2xl shadow-sm border', tones[tone])}>
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className={cn('text-xs font-medium', isColor || tone === 'red' ? 'opacity-80' : 'text-muted-foreground')}>{title}</div>
            <div className={cn('mt-1.5 text-lg md:text-2xl font-bold truncate', isColor || tone === 'red' ? '' : 'text-foreground')}>
              {value}
            </div>
            {hint ? <div className={cn('mt-1 text-[11px]', isColor ? 'opacity-85' : tone === 'red' ? 'opacity-90' : 'text-muted-foreground')}>{hint}</div> : null}
          </div>
          {icon ? <div className={cn('shrink-0 rounded-xl p-2', isColor || tone === 'red' ? 'bg-white/15' : 'bg-secondary text-primary')}>{icon}</div> : null}
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

export function Avatar({ name, color = '#5B2A86', size = 36 }: { name: string; color?: string; size?: number }) {
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
