'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { faDigits, formatJDate, weekdayName } from '@/lib/jalali'
import { LayoutDashboard, CalendarDays, Inbox, Bot, Users, Wallet, Sparkles } from 'lucide-react'
import { DashboardSection } from './dashboard-section'
import { AppointmentsSection } from './appointments-section'
import { TasksSection } from './tasks-section'
import { AssistantSection } from './assistant-section'
import { PatientsSection } from './patients-section'
import { FinanceSection } from './finance-section'

const NAV = [
  { key: 'dashboard', label: 'داشبورد مدیر', icon: LayoutDashboard },
  { key: 'appointments', label: 'نوبت‌ها و تقویم', icon: CalendarDays },
  { key: 'tasks', label: 'کارتابل عملیات', icon: Inbox },
  { key: 'assistant', label: 'دستیار بیمار', icon: Bot },
  { key: 'patients', label: 'بیماران (CRM)', icon: Users },
  { key: 'finance', label: 'مالی و انبار', icon: Wallet },
] as const

type SectionKey = (typeof NAV)[number]['key']

export function AppShell() {
  const [section, setSection] = useState<SectionKey>('dashboard')
  const today = new Date()

  return (
    <div className="min-h-screen flex flex-col">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex fixed inset-y-0 right-0 w-60 flex-col bg-sidebar border-l border-sidebar-border z-30">
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <div className="font-bold text-lg leading-tight">سینا</div>
              <div className="text-[11px] text-muted-foreground">سیستم‌عامل هوشمند کلینیک</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = section === item.key
            return (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
                className={cn(
                  'w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors text-right',
                  active
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {item.label}
              </button>
            )
          })}
        </nav>
        <div className="p-4 border-t border-sidebar-border text-[11px] text-muted-foreground leading-5">
          <div className="font-semibold text-foreground/80 mb-0.5">کلینیک دندان‌پزشکی لبخند مهر</div>
          نسخه‌ی دمو v۰٫۱ — داده‌های نمونه
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col lg:pr-60 min-h-screen">
        {/* Topbar */}
        <header className="sticky top-0 z-20 bg-background/85 backdrop-blur border-b border-border">
          <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0">
                <div className="font-bold text-sm md:text-base truncate">کلینیک دندان‌پزشکی لبخند مهر</div>
                <div className="text-[11px] text-muted-foreground">
                  {weekdayName(today)}، {formatJDate(today)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center rounded-full border border-[#C9A227] bg-[#F7EFDA] text-[#7a5d14] px-3 py-1 text-[11px] font-semibold">
                نسخه‌ی دمو
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-primary text-[11px] font-bold">م</span>
                مدیر کلینیک
              </span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-4 md:px-6 py-5 pb-24 lg:pb-6">
          {section === 'dashboard' && <DashboardSection onNavigate={(s) => setSection(s as SectionKey)} />}
          {section === 'appointments' && <AppointmentsSection />}
          {section === 'tasks' && <TasksSection />}
          {section === 'assistant' && <AssistantSection onNavigate={(s) => setSection(s as SectionKey)} />}
          {section === 'patients' && <PatientsSection />}
          {section === 'finance' && <FinanceSection />}
        </main>

        {/* Footer */}
        <footer className="mt-auto border-t border-border bg-card">
          <div className="px-4 md:px-6 py-3 text-[11px] text-muted-foreground flex flex-wrap items-center justify-between gap-2">
            <span>سینا — سیستم‌عامل هوشمند کلینیک دندان‌پزشکی · پروتوتایپ نمایشی</span>
            <span>{faDigits('1405')} © همه‌ی داده‌ها نمونه است</span>
          </div>
        </footer>
      </div>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-border">
        <div className="grid grid-cols-6">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = section === item.key
            return (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
                className={cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium min-h-[56px] justify-center',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate max-w-full px-0.5">{item.label.split(' ')[0]}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
