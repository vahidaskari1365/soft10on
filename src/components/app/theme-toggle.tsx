'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

/**
 * سوییچ حالت روشن/تاریک
 * مقدار انتخابی در localStorage ذخیره می‌شود و کلاس dark روی <html> اعمال می‌گردد.
 * اسکریپت ضد فلش در layout قبل از رنگ‌آمیزی اولیه کلاس را می‌خواند.
 */
const STORAGE_KEY = 'tenon-theme'

export function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
  } catch {
    // حالت private browsing — نادیده گرفته می‌شود
  }
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
    setMounted(true)
  }, [])

  return (
    <button
      onClick={() => {
        const next = !dark
        setDark(next)
        applyTheme(next)
      }}
      title={dark ? 'حالت روشن' : 'حالت تاریک'}
      aria-label={dark ? 'فعال‌سازی حالت روشن' : 'فعال‌سازی حالت تاریک'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-card text-muted-foreground hover:text-foreground hover:border-sky-300 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
    >
      {mounted && dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
