'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ShieldCheck, Stethoscope, Headset, UserRound, Loader2, Bot, MapPin, LineChart, HeartPulse } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SessionUser } from './types'

const DEMO: { username: string; role: string; label: string; icon: typeof ShieldCheck; color: string; desc: string }[] = [
  { username: 'manager', role: 'ADMIN', label: 'مدیر کل', icon: ShieldCheck, color: '#0284C7', desc: 'داشبورد، شعب، پرسنل، مالی' },
  { username: 'doctor', role: 'DOCTOR', label: 'دکتر', icon: Stethoscope, color: '#0D9488', desc: 'برنامه من، بیماران، کارنامه' },
  { username: 'reception', role: 'RECEPTIONIST', label: 'منشی پذیرش', icon: Headset, color: '#38BDF8', desc: 'نوبت‌ها، کارتابل، دستیار' },
  { username: 'patient', role: 'PATIENT', label: 'بیمار', icon: UserRound, color: '#B08D57', desc: 'پرتال من، رزرو با شینا' },
]

export function LoginScreen({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  async function login(user: string, pass: string, key: string) {
    setError(null)
    setLoading(key)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'خطا در ورود')
        return
      }
      onLogin(data.user as SessionUser)
    } catch {
      setError('ارتباط با سرور برقرار نشد')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F7F9FB]">
      {/* Brand panel — بلوک عمیق برند 10on */}
      <div className="relative lg:w-[46%] bg-linear-to-bl from-[#0A0A0C] via-[#0C1B26] to-[#082F49] text-white p-8 lg:p-12 flex flex-col justify-between overflow-hidden deep-grid">
        <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-sky-500/25 blur-3xl blob" />
        <div className="absolute bottom-10 -right-16 h-72 w-72 rounded-full bg-teal-500/20 blur-3xl blob blob-delay" />
        <div className="absolute top-1/3 right-1/4 h-40 w-40 rounded-full bg-[#B08D57]/25 blur-3xl blob blob-delay" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-13 w-13 items-center justify-center rounded-2xl bg-white/10 backdrop-blur border border-white/15 p-1.5">
              { }
              <img src="/10on-icon.svg" alt="لوگوی 10on" className="h-10 w-10" />
            </span>
            <div>
              <div className="text-3xl font-extrabold tracking-tight leading-none" dir="ltr">
                <span className="brand-gradient-text">10on</span>
              </div>
              <div className="text-sm text-white/60 mt-1.5">لبخند شما، سرمایه ماست</div>
            </div>
          </div>

          <h1 className="mt-10 text-2xl lg:text-4xl font-extrabold leading-relaxed">
            کلینیک شما،<br />
            <span className="brand-gradient-text">هوشمند و یکپارچه</span> در ۳ شعبه
          </h1>
          <p className="mt-4 text-white/70 text-sm lg:text-base leading-7 max-w-md">
            پذیرش، نوبت‌دهی، بیماران، مالی و انبار — همه در یک سامانه با ایجنت‌های هوشمند
            که واقعاً کار می‌کنند: دستیار بیمار، دستیار پذیرش و دستیار مدیریتی.
          </p>

          <div className="mt-8 space-y-3 text-sm">
            {[
              { icon: Bot, text: 'ایجنت‌های هوشمند با اتصال واقعی به داده‌ها' },
              { icon: MapPin, text: 'مدیریت چند شعبه با آمار مستقل هر شعبه' },
              { icon: LineChart, text: 'سود و زیان ماهانه با تقویم شمسی' },
              { icon: HeartPulse, text: 'مراقبت ۲۴ ساعته پس از جراحی، همان‌طور که 10on وعده داده است' },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-white/85">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 border border-white/10">
                  <f.icon className="h-4 w-4 text-sky-300" />
                </span>
                {f.text}
              </div>
            ))}
          </div>
        </div>

        <div className="relative mt-10 text-xs text-white/45">
          10on — سامانه هوشمند کلینیک دندان‌پزشکی · نسخه‌ی نمایشی با داده‌های نمونه
        </div>
      </div>

      {/* Login panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="rounded-3xl bg-card border shadow-xl shadow-slate-900/5 p-6 md:p-8">
            <h2 className="text-xl font-extrabold">ورود به سامانه 10on</h2>
            <p className="text-sm text-muted-foreground mt-1">با حساب خودتان وارد شوید یا از حساب‌های نمونه استفاده کنید</p>

            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                login(username, password, 'form')
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="username">نام کاربری</Label>
                <Input id="username" name="username" autoComplete="username" dir="ltr" className="text-left" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="manager" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">رمز عبور</Label>
                <Input id="password" name="password" autoComplete="current-password" dir="ltr" className="text-left" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="۱۲۳۴۵۶" required />
              </div>
              {error ? <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2">{error}</div> : null}
              <Button type="submit" className="w-full rounded-xl bg-sky-600 hover:bg-sky-500 text-white" disabled={loading !== null}>
                {loading === 'form' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ورود'}
              </Button>
            </form>

            <div className="flex items-center gap-3 my-6">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] text-muted-foreground">حساب‌های نمایشی (رمز همه: ۱۲۳۴۵۶)</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {DEMO.map((d) => {
                const Icon = d.icon
                return (
                  <button
                    key={d.username}
                    onClick={() => login(d.username, '123456', d.username)}
                    disabled={loading !== null}
                    aria-label={`ورود سریع به عنوان ${d.label}`}
                    className={cn(
                      'group text-right rounded-2xl border bg-background p-3.5 transition-all card-hover outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-60',
                      'border-border hover:border-sky-200'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: d.color }}>
                        <Icon className="h-4.5 w-4.5" />
                      </span>
                      {loading === d.username ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                    </div>
                    <div className="mt-2.5 text-sm font-bold">{d.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{d.desc}</div>
                    <div className="text-[10px] text-muted-foreground/70 mt-1" dir="ltr">
                      {d.username} / 123456
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <p className="text-center text-[11px] text-muted-foreground mt-5 leading-5">
            ورود شما به معنای پذیرش قوانین سامانه 10on است.<br />
            داده‌های این نسخه نمایشی است و به‌صورت دوره‌ای بازنشانی می‌شود.
          </p>
        </div>
      </div>
    </div>
  )
}
