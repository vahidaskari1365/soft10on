import { faDigits } from './jalali'

/** «۲۴۰٬۰۰۰٬۰۰۰ تومان» کامل */
export function formatTomanFull(n: number): string {
  return `${faDigits(new Intl.NumberFormat('en-US').format(Math.round(n)))} تومان`
}

/** «۴۸۰ میلیون تومان» / «۲٫۴ میلیون تومان» / «۹۵۰ هزار تومان» */
export function formatToman(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) {
    const v = n / 1_000_000_000
    return `${faDigits(v.toFixed(1).replace(/\.0$/, '').replace('.', '٫'))} میلیارد تومان`
  }
  if (abs >= 1_000_000) {
    const v = n / 1_000_000
    return `${faDigits(v.toFixed(1).replace(/\.0$/, '').replace('.', '٫'))} میلیون تومان`
  }
  if (abs >= 1000) return `${faDigits(Math.round(n / 1000))} هزار تومان`
  return `${faDigits(Math.round(n))} تومان`
}

/** axis value: «۴۸۰م» */
export function millionsShort(n: number): string {
  const v = Math.round(n / 1_000_000)
  return `${faDigits(v)}م`
}

export const EXPENSE_CATEGORY_LABEL: Record<string, string> = {
  RENT: 'اجاره',
  SALARY: 'حقوق پرسنل',
  UTILITIES: 'آب، برق و گاز',
  MARKETING: 'تبلیغات',
  COMMISSION: 'کارانه پزشکان',
  EQUIPMENT: 'تجهیزات و تعمیرات',
  COGS: 'بهای کالای فروخته‌شده',
  OTHER: 'متفرقه',
}

export const APPOINTMENT_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'در انتظار تأیید', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  CONFIRMED: { label: 'تأییدشده', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  DONE: { label: 'انجام‌شده', color: 'bg-violet-100 text-violet-800 border-violet-200' },
  CANCELLED: { label: 'لغوشده', color: 'bg-stone-100 text-stone-600 border-stone-200' },
  NO_SHOW: { label: 'عدم حضور', color: 'bg-rose-100 text-rose-700 border-rose-200' },
}

export const TASK_STATUS: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'باز', color: 'bg-sky-100 text-sky-800 border-sky-200' },
  IN_PROGRESS: { label: 'در حال انجام', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  DONE: { label: 'انجام‌شده', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  BLOCKED: { label: 'متوقف‌شده', color: 'bg-rose-100 text-rose-700 border-rose-200' },
}

export const TASK_PRIORITY: Record<string, { label: string; color: string }> = {
  LOW: { label: 'کم', color: '#8D80AB' },
  MEDIUM: { label: 'متوسط', color: '#C9A227' },
  HIGH: { label: 'زیاد', color: '#E76F51' },
  URGENT: { label: 'فوری', color: '#C0392B' },
}

export const SOURCE_LABEL: Record<string, string> = {
  ASSISTANT: 'دستیار بیمار',
  WHATSAPP: 'واتساپ',
  PHONE: 'تماس',
  WALKIN: 'حضوری',
  PANEL: 'پنل',
  SYSTEM: 'خودکار',
  DOCTOR: 'پزشک',
  MANAGER: 'مدیر',
  MANUAL: 'دستی',
}

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'مدیر کل',
  DOCTOR: 'پزشک',
  RECEPTIONIST: 'منشی پذیرش',
  PATIENT: 'بیمار',
  MANAGER: 'مدیر',
}
