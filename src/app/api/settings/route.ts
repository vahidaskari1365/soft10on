import { NextResponse } from 'next/server'
import { tenantHandler } from '@/lib/tenant'
import { db } from '@/lib/db'
import { aiEngine, invalidateAiConfig, testAiProvider } from '@/lib/ai'

const DNA_KEYS = ['clinic_dna_tone', 'clinic_dna_rules', 'clinic_dna_processes', 'clinic_name', 'clinic_tagline']

function mask(key: string | undefined | null): string {
  if (!key) return ''
  if (key.length <= 8) return '••••'
  return `${key.slice(0, 4)}••••••${key.slice(-4)}`
}

/** تنظیمات سیستم — فقط مدیر کل */
export const GET = tenantHandler('ADMIN')(async (session, _request) => {
  const keyMeta = await db.systemMeta.findUnique({ where: { key: 'ai_api_key' } })
  const metas = await db.systemMeta.findMany({ where: { key: { in: [...DNA_KEYS, 'ai_base_url', 'ai_model'] } } })
  const map = Object.fromEntries(metas.map((m) => [m.key, m.value]))
  const engine = await aiEngine()
  return NextResponse.json({
    ai: {
      baseUrl: map['ai_base_url'] ?? '',
      apiKeyMasked: mask(keyMeta?.value),
      model: map['ai_model'] ?? 'gpt-4o-mini',
      engine: engine.label,
    },
    dna: {
      clinicName: map['clinic_name'] ?? 'کلینیک دندان‌پزشکی لبخند مهر',
      tagline: map['clinic_tagline'] ?? 'لبخند شما، سرمایه ماست',
      tone: map['clinic_dna_tone'] ?? '',
      rules: map['clinic_dna_rules'] ?? '',
      processes: map['clinic_dna_processes'] ?? '',
    },
  })
})

/** ذخیره تنظیمات — بدنه: { ai?: {baseUrl, apiKey?, model}, dna?: {...} } */
export const PUT = tenantHandler('ADMIN')(async (session, request) => {
  const body = (await request.json().catch(() => ({}))) as {
    ai?: { baseUrl?: string; apiKey?: string; model?: string }
    dna?: { clinicName?: string; tagline?: string; tone?: string; rules?: string; processes?: string }
  }

  if (body.ai) {
    const pairs: [string, string][] = []
    if (body.ai.baseUrl !== undefined) pairs.push(['ai_base_url', body.ai.baseUrl.trim()])
    if (body.ai.apiKey !== undefined && body.ai.apiKey.trim()) pairs.push(['ai_api_key', body.ai.apiKey.trim()])
    if (body.ai.model !== undefined) pairs.push(['ai_model', body.ai.model.trim() || 'gpt-4o-mini'])
    for (const [key, value] of pairs) {
      await db.systemMeta.upsert({ where: { key }, create: { key, value }, update: { value } })
    }
    invalidateAiConfig()
  }

  if (body.dna) {
    const map: Record<string, string> = {
      clinic_name: body.dna.clinicName ?? '',
      clinic_tagline: body.dna.tagline ?? '',
      clinic_dna_tone: body.dna.tone ?? '',
      clinic_dna_rules: body.dna.rules ?? '',
      clinic_dna_processes: body.dna.processes ?? '',
    }
    for (const [key, value] of Object.entries(map)) {
      if (value !== undefined) {
        await db.systemMeta.upsert({ where: { key }, create: { key, value }, update: { value } })
      }
    }
  }

  const engine = await aiEngine()
  return NextResponse.json({ ok: true, engine: engine.label })
})

/** تست اتصال پرووایدر — { baseUrl, apiKey?, model? } (apiKey خالی = از ذخیره‌شده) */
export const POST = tenantHandler('ADMIN')(async (session, request) => {
  const body = (await request.json().catch(() => ({}))) as { baseUrl?: string; apiKey?: string; model?: string }
  let baseUrl = (body.baseUrl ?? '').trim()
  let apiKey = (body.apiKey ?? '').trim()
  const model = (body.model ?? '').trim() || 'gpt-4o-mini'
  if (!baseUrl || !apiKey) {
    const saved = await db.systemMeta.findMany({ where: { key: { in: ['ai_base_url', 'ai_api_key'] } } })
    const map = Object.fromEntries(saved.map((m) => [m.key, m.value]))
    baseUrl = baseUrl || map['ai_base_url'] || ''
    apiKey = apiKey || map['ai_api_key'] || ''
  }
  if (!baseUrl || !apiKey) {
    return NextResponse.json({ ok: false, message: 'آدرس پایه و کلید API هر دو لازم است' })
  }
  const result = await testAiProvider(baseUrl, apiKey, model)
  return NextResponse.json(result)
})
