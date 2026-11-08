import { db } from '@/lib/db'

// ------------------------------------------------------------------
// «هویت» کلینیک (Clinic DNA) — لحن، قواعد و روال‌ها
// در پنل تنظیمات ثبت می‌شود و به پرامپت همه‌ی دستیارها تزریق می‌شود
// ------------------------------------------------------------------

let _cache: { at: number; text: string } = { at: 0, text: '' }

const DEFAULTS: Record<string, string> = {
  clinic_name: 'کلینیک دندان‌پزشکی لبخند مهر',
  clinic_tagline: 'لبخند شما، سرمایه ماست',
  clinic_dna_tone: 'لحن گرم، محترمانه و امیدبخش؛ از اصطلاحات تخصصی خشک پرهیز شود و مفاهیم ساده توضیح داده شود.',
  clinic_dna_rules:
    '۱) هشدار حساسیت دارویی و بارداری همیشه با رنگ هشدار اعلام شود. ۲) برای درد شدید یا تروما، نوبت اورژانسی در همان روز پیشنهاد شود. ۳) تشخیص قطعی و تجویز دارو با پزشک است؛ دستیار فقط راهنمایی عمومی می‌دهد. ۴) بیماران خاص و کودکان زیر ۷ سال اولویت نوبت دارند.',
  clinic_dna_processes:
    '۱) پذیرش: ثبت نوبت → تأیید پیامکی → یادآوری روز قبل. ۲) ویزیت: ثبت در پرونده → فاکتور → برنامه‌ی درمان بعدی. ۳) پیگیری: تماس ۴۸ ساعت پس از جراحی. ۴) تحویل شیفت: جمع‌بندی کارهای ناتمام به منشای بعدی.',
}

export async function getClinicDNA(): Promise<{ text: string; clinicName: string; tagline: string }> {
  const now = Date.now()
  if (now - _cache.at < 60_000) return { text: _cache.text, clinicName: DEFAULTS.clinic_name, tagline: DEFAULTS.clinic_tagline }
  try {
    const keys = Object.keys(DEFAULTS)
    const metas = await db.systemMeta.findMany({ where: { key: { in: keys } } })
    const map = Object.fromEntries(metas.map((m) => [m.key, m.value]))
    const clinicName = map['clinic_name']?.trim() || DEFAULTS.clinic_name
    const tagline = map['clinic_tagline']?.trim() || DEFAULTS.clinic_tagline
    const tone = map['clinic_dna_tone']?.trim() || DEFAULTS.clinic_dna_tone
    const rules = map['clinic_dna_rules']?.trim() || DEFAULTS.clinic_dna_rules
    const processes = map['clinic_dna_processes']?.trim() || DEFAULTS.clinic_dna_processes
    const text = `
# هویت مجموعه (Clinic DNA) — این بخش را دقیقاً رعایت کن
نام مجموعه: ${clinicName}
لحن و ارتباط: ${tone}
قواعد و استثناها: ${rules}
روال‌ها: ${processes}`
    _cache = { at: now, text }
    return { text, clinicName, tagline }
  } catch {
    return { text: '', clinicName: DEFAULTS.clinic_name, tagline: DEFAULTS.clinic_tagline }
  }
}

/** پایگاه دانش فعال — برای پاسخ به پرسش‌های متداول بیماران */
export async function getKnowledgeBase(): Promise<string> {
  try {
    const items = await db.knowledgeBase.findMany({ where: { isActive: true }, take: 40, orderBy: { createdAt: 'desc' } })
    if (!items.length) return ''
    return `
# پایگاه دانش (پرسش‌های متداول — بر اساس این‌ها جواب بده)
${items.map((k) => `پرسش: ${k.question}\nپاسخ: ${k.answer}`).join('\n---\n')}`
  } catch {
    return ''
  }
}
