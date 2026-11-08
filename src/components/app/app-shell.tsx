'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { faDigits, formatJDate, weekdayName } from '@/lib/jalali'
import {
  LayoutDashboard, CalendarDays, Inbox, Bot, Users, Wallet, Sparkles, LogOut,
  Building2, UserCog, Stethoscope, UserRound, BrainCircuit, Headset,
} from 'lucide-react'
import { LoginScreen } from './login-screen'
import { DashboardSection } from './dashboard-section'
import { AppointmentsSection } from './appointments-section'
import { TasksSection } from './tasks-section'
import { AssistantSection } from './assistant-section'
import { PatientsSection } from './patients-section'
import { FinanceSection } from './finance-section'
import { BranchesSection } from './manager/branches-section'
import { StaffSection } from './manager/staff-section'
import { AgentChatSection } from './agent/agent-chat-section'
import { DoctorSection } from './doctor/doctor-section'
import { PortalSection } from './patient/portal-section'
import { ROLE_LABEL } from '@/lib/format'
import type { SessionUser } from './types'

type NavItem = { key: string; label: string; icon: typeof LayoutDashboard }

const NAV_ADMIN: NavItem[] = [
  { key: 'dashboard', label: 'داشبورد مدیریتی', icon: LayoutDashboard },
  { key: 'branches', label: 'مدیریت شعب', icon: Building2 },
  { key: 'staff', label: 'پرسنل و دسترسی‌ها', icon: UserCog },
  { key: 'appointments', label: 'نوبت‌ها و تقویم', icon: CalendarDays },
  { key: 'tasks', label: 'کارتابل عملیات', icon: Inbox },
  { key: 'patients', label: 'بیماران (CRM)', icon: Users },
  { key: 'finance', label: 'مالی و انبار', icon: Wallet },
  { key: 'agent', label: 'دستیار مدیریتی', icon: BrainCircuit },
]

const NAV_RECEPTION: NavItem[] = [
  { key: 'dashboard', label: 'امروز پذیرش', icon: LayoutDashboard },
  { key: 'appointments', label: 'نوبت‌ها و تقویم', icon: CalendarDays },
  { key: 'tasks', label: 'کارتابل عملیات', icon: Inbox },
  { key: 'patients', label: 'بیماران (CRM)', icon: Users },
  { key: 'agent', label: 'دستیار پذیرش', icon: Bot },
]

const NAV_DOCTOR: NavItem[] = [
  { key: 'doctor', label: 'تابلوی من', icon: Stethoscope },
]

const NAV_PATIENT: NavItem[] = [
  { key: 'portal', label: 'پرتال من', icon: UserRound },
]

const ROLE_HOME: Record<string, string> = {
  ADMIN: 'dashboard',
  RECEPTIONIST: 'dashboard',
  DOCTOR: 'doctor',
  PATIENT: 'portal',
}

const ROLE_ICON: Record<string, typeof ShieldIcon> = { ADMIN: ShieldIcon, DOCTOR: Stethoscope, RECEPTIONIST: Headset, PATIENT: UserRound }
function ShieldIcon(props: { className?: string }) {
  return <Sparkles {...props} />
}

export function AppShell({ initialUser }: { initialUser: SessionUser | null }) {
  const [user, setUser] = useState<SessionUser | null>(initialUser)
  const [section, setSection] = useState<string>(user ? ROLE_HOME[user.role] ?? 'dashboard' : 'dashboard')
  const today = new Date()

  if (!user) {
    return (
      <LoginScreen
        onLogin={(u) => {
          setUser(u)
          setSection(ROLE_HOME[u.role] ?? 'dashboard')
        }}
      />
    )
  }

  const nav = user.role === 'ADMIN' ? NAV_ADMIN : user.role === 'RECEPTIONIST' ? NAV_RECEPTION : user.role === 'DOCTOR' ? NAV_DOCTOR : NAV_PATIENT
  const RoleIcon = ROLE_ICON[user.role] ?? UserRound

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
    setSection('dashboard')
  }

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
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.map((item) => {
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
          ۳ شعبه فعال · نسخه دمو v۰٫۲
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
                  {user.branch ? ` · ${user.branch.name}` : ''}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#C9A227] bg-[#F7EFDA] text-[#7a5d14] px-3 py-1 text-[11px] font-semibold">
                <RoleIcon className="h-3.5 w-3.5" />
                {ROLE_LABEL[user.role] ?? user.role}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-primary text-[11px] font-bold">
                  {user.fullName.trim().charAt(0)}
                </span>
                <span className="hidden md:inline">{user.fullName}</span>
              </span>
              <button
                onClick={logout}
                title="خروج از حساب"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border bg-card text-muted-foreground hover:text-rose-600 hover:border-rose-200 transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-4 md:px-6 py-5 pb-24 lg:pb-6">
          {section === 'dashboard' && <DashboardSection onNavigate={(s) => setSection(s)} />}
          {section === 'appointments' && <AppointmentsSection />}
          {section === 'tasks' && <TasksSection />}
          {section === 'patients' && <PatientsSection />}
          {section === 'finance' && <FinanceSection />}
          {section === 'branches' && <BranchesSection />}
          {section === 'staff' && <StaffSection />}
          {section === 'agent' && (user.role === 'ADMIN'
            ? <AgentChatSection
                key="manager"
                endpoint="/api/agent/manager"
                title="دستیار مدیریتی هوشمند"
                subtitle="سؤال بپرسید؛ ایجنت به داده‌های واقعی سه شعبه وصل می‌شود، ابزار اجرا می‌کند و تحلیل می‌دهد"
                suggestions={[
                  'مقایسه عملکرد سه شعبه در این ماه',
                  'سود و زیان این ماه چطور بود؟',
                  'کدام خدمت بیشترین درآمد را دارد؟',
                  'کارنامه پزشکان این ماه',
                  'انبار کدام اقلام هشدار دارد؟',
                ]}
              />
            : <AgentChatSection
                key="reception"
                endpoint="/api/agent/reception"
                title="دستیار پذیرش هوشمند"
                subtitle="بگویید چه کاری لازم است؛ ایجنت در سیستم جست‌وجو می‌کند، زمان خالی پیدا می‌کند و نوبت را واقعاً ثبت می‌کند"
                suggestions={[
                  'نوبت‌های امروز را بگو',
                  'برای بیمار جدید به اسم مریم با شماره ۰۹۳۶۵۵۵۶۶۷۷ نوبت جرم‌گیری بگیر',
                  'پرونده بیمار شماره ۰۹۱۲۱۲۳۴۵۶۷ را ببین',
                  'یک کار برای پیگیری تماس فردا ثبت کن',
                ]}
              />)}
          {section === 'doctor' && <DoctorSection />}
          {section === 'portal' && <PortalSection userName={user.fullName} />}
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
        <div className="grid" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
          {nav.map((item) => {
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
