'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { faDigits, formatJDate, weekdayName } from '@/lib/jalali'
import {
  LayoutDashboard, CalendarDays, Inbox, Bot, Users, Wallet, Sparkles, LogOut,
  Building2, UserCog, Stethoscope, UserRound, BrainCircuit, Headset, ChevronLeft,
  MessageSquare, FolderOpen, Hourglass, Settings, Globe, RefreshCw, ClipboardList,
} from 'lucide-react'
import { LoginScreen } from './login-screen'
import { DashboardSection } from './dashboard-section'
import { AppointmentsSection } from './appointments-section'
import { TasksSection } from './tasks-section'
import { PatientsSection } from './patients-section'
import { FinanceSection } from './finance-section'
import { BranchesSection } from './manager/branches-section'
import { StaffSection } from './manager/staff-section'
import { AgentChatSection } from './agent/agent-chat-section'
import { DoctorSection } from './doctor/doctor-section'
import { PortalSection } from './patient/portal-section'
import { MessagesSection } from './messages-section'
import { RecordsSection } from './records-section'
import { WaitlistSection } from './waitlist-section'
import { SettingsSection } from './settings-section'
import { RemindersBar } from './reminders-bar'
import { ROLE_LABEL } from '@/lib/format'
import type { SessionUser } from './types'

type NavItem = { key: string; label: string; icon: typeof LayoutDashboard }

const NAV_ADMIN: NavItem[] = [
  { key: 'dashboard', label: 'داشبورد مدیریتی', icon: LayoutDashboard },
  { key: 'branches', label: 'مدیریت شعب', icon: Building2 },
  { key: 'staff', label: 'پرسنل و دسترسی‌ها', icon: UserCog },
  { key: 'appointments', label: 'نوبت‌ها و تقویم', icon: CalendarDays },
  { key: 'waitlist', label: 'صف انتظار', icon: Hourglass },
  { key: 'tasks', label: 'کارتابل عملیات', icon: Inbox },
  { key: 'messages', label: 'پیام بیماران', icon: MessageSquare },
  { key: 'patients', label: 'بیماران (CRM)', icon: Users },
  { key: 'records', label: 'پرونده هوشمند', icon: FolderOpen },
  { key: 'finance', label: 'حسابداری و انبار', icon: Wallet },
  { key: 'agent', label: 'دستیار مدیریتی', icon: BrainCircuit },
  { key: 'settings', label: 'تنظیمات سامانه', icon: Settings },
]

const NAV_RECEPTION: NavItem[] = [
  { key: 'dashboard', label: 'امروز پذیرش', icon: LayoutDashboard },
  { key: 'appointments', label: 'نوبت‌ها و تقویم', icon: CalendarDays },
  { key: 'waitlist', label: 'صف انتظار', icon: Hourglass },
  { key: 'tasks', label: 'کارتابل عملیات', icon: Inbox },
  { key: 'messages', label: 'پیام بیماران', icon: MessageSquare },
  { key: 'patients', label: 'بیماران (CRM)', icon: Users },
  { key: 'records', label: 'پرونده هوشمند', icon: FolderOpen },
  { key: 'agent', label: 'دستیار پذیرش', icon: Bot },
]

const NAV_DOCTOR: NavItem[] = [
  { key: 'doctor', label: 'تابلوی من', icon: Stethoscope },
  { key: 'agent', label: 'دستیار پزشک', icon: BrainCircuit },
  { key: 'records', label: 'پرونده بیماران', icon: FolderOpen },
]

const NAV_PATIENT: NavItem[] = [
  { key: 'portal', label: 'پرتال من', icon: UserRound },
  { key: 'messages', label: 'پیام با کلینیک', icon: MessageSquare },
  { key: 'records', label: 'پرونده من', icon: FolderOpen },
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

/** میان‌برهای داشبورد برای هر نقش (کلیک روی آیکن = پرش به همان بخش) */
const QUICK_KEYS: Record<string, string[]> = {
  ADMIN: ['appointments', 'waitlist', 'tasks', 'messages', 'patients', 'records', 'finance', 'branches', 'staff', 'agent', 'settings'],
  RECEPTIONIST: ['appointments', 'waitlist', 'tasks', 'messages', 'patients', 'records', 'agent'],
}

export function AppShell({ initialUser }: { initialUser: SessionUser | null }) {
  const [user, setUser] = useState<SessionUser | null>(initialUser)
  const [section, setSection] = useState<string>(user ? ROLE_HOME[user.role] ?? 'dashboard' : 'dashboard')
  const [handoffText, setHandoffText] = useState<string | null>(null)
  const [handoffBusy, setHandoffBusy] = useState(false)
  const today = new Date()

  async function generateHandoff() {
    setHandoffBusy(true)
    try {
      const res = await fetch('/api/handoff')
      const d = await res.json()
      setHandoffText((d.summary as string) ?? 'خلاصه‌ای ساخته نشد')
    } catch {
      setHandoffText('ساخت خلاصه شیفت ناموفق بود')
    } finally { setHandoffBusy(false) }
  }

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
    <div className="min-h-screen flex flex-col bg-background">
      {/* Sidebar (desktop) — بلوک عمیق برند 10on */}
      <aside className="hidden lg:flex fixed inset-y-0 right-0 w-64 flex-col bg-sidebar text-sidebar-foreground border-l border-sidebar-border z-30">
        <div className="p-5 border-b border-sidebar-border/80">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-linear-to-br from-sky-400 via-sky-500 to-teal-500 shadow-lg shadow-sky-500/25">
              { }
              <img src="/10on-icon.svg" alt="لوگوی 10on" className="h-7 w-7" aria-hidden="true" />
            </span>
            <div>
              <div className="text-xl font-extrabold leading-none tracking-tight" dir="ltr">
                <span className="brand-gradient-text">10on</span>
              </div>
              <div className="text-[11px] text-white/50 mt-1">لبخند شما، سرمایه ماست</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto scroll-thin" aria-label="ناوبری اصلی">
          {nav.map((item) => {
            const Icon = item.icon
            const active = section === item.key
            return (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all text-right outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70',
                  active
                    ? 'bg-linear-to-l from-sky-500 to-teal-500 text-white shadow-lg shadow-sky-500/25'
                    : 'text-white/60 hover:bg-white/[0.07] hover:text-white'
                )}
              >
                <Icon className={cn('h-[18px] w-[18px] shrink-0 transition-transform', active ? 'scale-110' : '')} />
                <span className="flex-1">{item.label}</span>
                {active ? <ChevronLeft className="h-4 w-4 opacity-80" /> : null}
              </button>
            )
          })}
        </nav>
        <div className="p-4 border-t border-sidebar-border/80 text-[11px] text-white/45 leading-5">
          <div className="font-semibold text-white/70 mb-0.5">کلینیک دندان‌پزشکی لبخند مهر</div>
          {faDigits(3)} شعبه فعال · نسخه دمو v{faDigits('0.2')}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col lg:pr-64 min-h-screen">
        {/* Topbar */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-border">
          <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-sky-400 to-teal-500 shadow-md shadow-sky-500/20">
                { }
                <img src="/10on-icon.svg" alt="10on" className="h-5.5 w-5.5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="font-bold text-sm md:text-base truncate">
                  کلینیک دندان‌پزشکی لبخند مهر
                  <span className="hidden md:inline text-muted-foreground font-medium"> · سامانه 10on</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {weekdayName(today)}، {formatJDate(today)}
                  {user.branch ? ` · ${user.branch.name}` : ''}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-[#F6EFE3] text-[#7C6434] px-3 py-1 text-[11px] font-semibold">
                <RoleIcon className="h-3.5 w-3.5" />
                {ROLE_LABEL[user.role] ?? user.role}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs shadow-sm">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-linear-to-br from-sky-500 to-teal-500 text-white text-[11px] font-bold">
                  {user.fullName.trim().charAt(0)}
                </span>
                <span className="hidden md:inline">{user.fullName}</span>
              </span>
              <button
                onClick={logout}
                title="خروج از حساب"
                aria-label="خروج از حساب"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-card text-muted-foreground hover:text-red-600 hover:border-red-200 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Content — هر بخش با انیمیشن نرم وارد می‌شود */}
        <main className="flex-1 px-4 md:px-6 py-5 pb-24 lg:pb-6">
          {(user.role === 'ADMIN' || user.role === 'RECEPTIONIST') && section === 'dashboard' && (
            <RemindersBar onNavigate={(s) => setSection(s)} />
          )}
          {(user.role === 'ADMIN' || user.role === 'RECEPTIONIST') && (
            <div className="mb-5 flex justify-start">
              <Dialog open={Boolean(handoffText) || handoffBusy} onOpenChange={(o) => { if (!o) setHandoffText(null) }}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="rounded-xl text-xs" onClick={generateHandoff} disabled={handoffBusy}>
                    {handoffBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                    تحویل شیفت
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>خلاصه تحویل شیفت</DialogTitle></DialogHeader>
                  <div className="text-sm whitespace-pre-wrap leading-7 max-h-[50vh] overflow-y-auto">{handoffText ?? 'در حال جمع‌بندی…'}</div>
                </DialogContent>
              </Dialog>
            </div>
          )}
          <div key={section} className="fade-up">
            {section === 'dashboard' && (
              <DashboardSection onNavigate={(s) => setSection(s)} quickKeys={QUICK_KEYS[user.role] ?? []} />
            )}
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
            {section === 'messages' && <MessagesSection isPatient={user.role === 'PATIENT'} />}
            {section === 'waitlist' && <WaitlistSection />}
            {section === 'records' && <RecordsSection isPatient={user.role === 'PATIENT'} patientName={user.patientName ?? undefined} />}
            {section === 'settings' && user.role === 'ADMIN' && <SettingsSection />}
            {section === 'agent' && user.role === 'DOCTOR' && (
              <AgentChatSection
                key="doctor-agent"
                endpoint="/api/agent/doctor"
                title="دستیار پزشک هوشمند"
                subtitle="پرونده را باز کنید، خلاصه بگیرید، سند ثبت کنید یا دستور صوتی‌تان را به وظیفه بدهید — هشدار حساسیت و بارداری همیشه قبل از همه‌چیز اعلام می‌شود"
                suggestions={[
                  'برنامه امروز من چیست؟',
                  'پرونده بیمار سامان قاسمی را باز کن و خلاصه بده',
                  'یادداشت کن: کنترل بخیه هفته بعد برای بیمار ایمپلنت',
                  'برای پذیرش وظیفه ثبت کن که آزمایش بیمار فردا پیگیری شود',
                ]}
              />
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="mt-auto border-t border-border bg-card">
          <div className="px-4 md:px-6 py-3 text-[11px] text-muted-foreground flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="font-bold text-foreground/70" dir="ltr">10on</span>
              <span> — لبخند شما، سرمایه ماست · سامانه هوشمند کلینیک دندان‌پزشکی</span>
              <a href="/clinic/SAADAT" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mr-3 text-sky-600 hover:underline">
                <Globe className="h-3 w-3" /> صفحه عمومی رزرو نوبت
              </a>
            </span>
            <span>{faDigits('1405')} © همه‌ی داده‌ها نمونه است</span>
          </div>
        </footer>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/90 backdrop-blur-md border-t border-border pb-[env(safe-area-inset-bottom)]"
        aria-label="ناوبری موبایل"
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
          {nav.map((item) => {
            const Icon = item.icon
            const active = section === item.key
            return (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium min-h-[56px] justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400',
                  active ? 'text-sky-600' : 'text-muted-foreground'
                )}
              >
                {active ? <span className="absolute top-0 h-0.5 w-8 rounded-full bg-linear-to-l from-sky-500 to-teal-500" /> : null}
                <Icon className={cn('h-5 w-5 transition-transform', active ? 'scale-110' : '')} />
                <span className="truncate max-w-full px-0.5">{item.label.split(' ')[0]}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
