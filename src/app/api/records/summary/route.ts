import { NextResponse } from 'next/server'
import { tenantHandler, platformHandler } from '@/lib/tenant'
import { db } from '@/lib/db'
import { llmChat, logAiCall } from '@/lib/ai'
import { getClinicDNA } from '@/lib/clinic-dna'

/** خلاصه‌ی هوشمند پرونده برای پزشک — «خلاصه آماده پیش از ویزیت» */
export const POST = tenantHandler()(async (session, request) => {
  if (session.role === 'PATIENT') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const started = Date.now()
  const body = (await request.json().catch(() => ({}))) as { patientId?: string }
  if (!body.patientId) return NextResponse.json({ error: 'شناسه بیمار لازم است' }, { status: 400 })

  const [patient, records] = await Promise.all([
    db.patient.findUnique({ where: { id: body.patientId } }),
    db.medicalRecord.findMany({
      where: { patientId: body.patientId },
      orderBy: { date: 'desc' },
      take: 20,
      include: { doctor: { select: { name: true } } },
    }),
  ])
  if (!patient) return NextResponse.json({ error: 'بیمار یافت نشد' }, { status: 404 })

  const flags: string[] = []
  if (patient.allergies) flags.push(`⚠️ حساسیت دارویی: ${patient.allergies}`)
  if (patient.isPregnant) flags.push('⚠️ بارداری — تداخل دارویی بررسی شود')
  if (patient.chronicNote) flags.push(`بیماری زمینه‌ای: ${patient.chronicNote}`)
  if (patient.incompleteTreatment) flags.push('درمان نیمه‌کاره دارد')

  const timeline = records
    .map((r) => `${r.date.toISOString().slice(0, 10)} [${r.type}] ${r.title}: ${r.content.slice(0, 200)}`)
    .join('\n')

  const dna = await getClinicDNA()
  const system = `${dna.text}

# نقش تو
دستیار پزشک هستی. یک خلاصه‌ی کوتاه و ساختارمند پرونده برای پیش‌زمینه‌ی ویزیت می‌نویسی.
فرمت پاسخ (فقط متن ساده، بدون عناوین markdown):
۱) وضعیت کلی در یک جمله
۲) نکات مهم بالینی (۳ تا ۵ مورد کوتاه)
۳) موارد نیازمند توجه در ویزیت بعدی
هیچ تشخیص قطعی و تجویزی ننویس — فقط خلاصه و یادآوری.`

  const userMessage = `بیمار: ${patient.firstName} ${patient.lastName} (متولد ${patient.birthYear ?? '؟'})
هشدارها: ${flags.join(' | ') || 'ندارد'}
سوابق:
${timeline || 'بدون سند قبلی'}`

  const raw = await llmChat([
    { role: 'system', content: system },
    { role: 'user', content: userMessage },
  ])

  await logAiCall({ role: session.role, agent: 'SUMMARY', ok: Boolean(raw), aiUsed: Boolean(raw), latencyMs: Date.now() - started })

  if (!raw) {
    // fallback قانون‌محور
    const lines = [
      `${patient.firstName} ${patient.lastName} — ${records.length} سند در پرونده.`,
      ...flags,
      records[0] ? `آخرین سند: ${records[0].title} (${records[0].date.toISOString().slice(0, 10)})` : '',
    ].filter(Boolean)
    return NextResponse.json({ summary: lines.join('\n'), aiUsed: false })
  }

  return NextResponse.json({ summary: raw.trim(), aiUsed: true })
})
