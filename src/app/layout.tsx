import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'

const vazir = localFont({
  src: [
    { path: '../../public/fonts/Vazirmatn-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/Vazirmatn-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/Vazirmatn-SemiBold.woff2', weight: '600', style: 'normal' },
    { path: '../../public/fonts/Vazirmatn-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-vazir',
  display: 'swap',
})

export const metadata: Metadata = {
  title: '10on — سامانه هوشمند کلینیک دندان‌پزشکی',
  description: '10on؛ لبخند شما، سرمایه ماست. سامانه یکپارچه کلینیک: نوبت‌دهی، دستیارهای هوشمند، CRM بیمار، مالی و انبار با تقویم شمسی و مدیریت چند شعبه',
  icons: { icon: '/10on-icon.svg' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
    <head>{/* جلوگیری از فلش حالت تاریک قبل از رنگ‌آمیزی */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('tenon-theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
    </head>
      <body className={`${vazir.variable} antialiased bg-background text-foreground font-sans`}>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
