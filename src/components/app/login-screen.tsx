'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sparkles, ShieldCheck, Stethoscope, Headset, UserRound, Loader2, MapPin, Bot, LineChart } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SessionUser } from './types'

const DEMO: { username: string; role: string; label: string; icon: typeof ShieldCheck; color: string; desc: string }[] = [
  { username: 'manager', role: 'ADMIN', label: 'مدیر کل', icon: ShieldCheck, color: '#5B2A86', desc: 'داشبورد، شعب، پرسنل، مالی' },
  { username: 'doctor', role: 'DOCTOR', label: 'دکتر', icon: Stethoscope, color: '#C9A227', desc: 'برنامه من، بیماران، کارنامه' },
  { username: 'reception', role: 'RECEPTIONIST', label: 'منشی پذیرش', icon: Headset, color: '#2A9D8F', desc: 'نوبت‌ها، کارتابل، دستیار' },
  { username: 'patient', role: 'PATIENT', label: 'بیمار', icon: UserRound, color: '#E76F51', desc: 'پرتال من، رزرو با شینا' },
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
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F6F2FA]">
      {/* Brand panel */}
      <div className="relative lg:w-[46%] bg-gradient-to-bl from-[#5B2A86] via-[#4A2268] to-[#2E1543] text-white p-8 lg:p-12 flex flex-col justify-between overflow-hidden">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#C9A227]/20 blur-3xl" />
        <div className="absolute bottom-10 -right-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
              <Sparkles className="h-6 w-6 text-[#C9A227]" />
            </span>
            <div>
              <div className="text-2xl font-extrabold">سینا</div>
              <div className="text-sm text-white/70">سیستم‌عامل هوشمند کلینیک</div>
            </div>
          </div>

          <h1 className="mt-10 text-2xl lg:text-4xl font-extrabold leading-relaxed">
            کلینیک شما،<br />
            <span className="text-[#E9C64B]">هوشمند و یکپارچه</span> در ۳ شعبه
          </h1>
          <p className="mt-4 text-white/75 text-sm lg:text-base leading-7 max-w-md">
            پذیرش، نوبت‌دهی، بیماران، مالی و انبار — همه در یک سامانه با چهار ایجنت هوشمند
            که واقعاً کار می‌کنند: دستیار بیمار، دستیار پذیرش و دستیار مدیریتی.
          </p>

          <div className="mt-8 space-y-3 text-sm">
            {[
              { icon: Bot, text: 'ایجنت‌های هوشمند با اتصال واقعی به داده‌ها' },
              { icon: MapPin, text: 'مدیریت چند شعبه با آمار مستقل هر شعبه' },
              { icon: LineChart, text: 'سود و زیان ماهانه با تقویم شمسی' },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-white/85">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                  <f.icon className="h-4 w-4 text-[#E9C64B]" />
                </span>
                {f.text}
              </div>
            ))}
          </div>
        </div>

        <div className="relative mt-10 text-xs text-white/50">
          کلینیک دندان‌پزشکی لبخند مهر — نسخه‌ی نمایشی با داده‌های نمونه
        </div>
      </div>

      {/* Login panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="rounded-3xl bg-card border shadow-sm p-6 md:p-8">
            <h2 className="text-xl font-extrabold">ورود به سامانه</h2>
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
                <Input id="username" dir="ltr" className="text-left" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="manager" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">رمز عبور</Label>
                <Input id="password" dir="ltr" className="text-left" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="۱۲۳۴۵۶" required />
              </div>
              {error ? <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2">{error}</div> : null}
              <Button type="submit" className="w-full rounded-xl" disabled={loading !== null}>
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
                    className={cn(
                      'group text-right rounded-2xl border bg-background p-3.5 transition-all hover:shadow-md hover:-translate-y-0.5 disabled:opacity-60',
                      'border-border'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white" style={{ background: d.color }}>
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
            ورود شما به معنای پذیرش قوانین سامانه است.<br />
            داده‌های این نسخه نمایشی است و به‌صورت دوره‌ای بازنشانی می‌شود.
          </p>
        </div>
      </div>
    </div>
  )
}
