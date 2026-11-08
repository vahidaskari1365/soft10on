import { db } from '@/lib/db'
import ZAI from 'z-ai-web-dev-sdk'

// ------------------------------------------------------------------
// لایه‌ی هوش مصنوعی 10on — نسخه ۴
// زنجیره‌ی پرووایدر (اولین گزینه‌ی سالم):
//   ۱) تنظیمات داخل نرم‌افزار (پنل مدیریت → تنظیمات؛ ذخیره در SystemMeta)
//      → هر سرویس OpenAI‌سازگار بدون دیپلوی مجدد وصل می‌شود
//   ۲) متغیرهای محیطی AI_API_KEY + AI_BASE_URL
//   ۳) موتور رایگان بدون کلید (Pollinations) — همیشه فعال، روی هر هاستی کار می‌کند
//   ۴) SDK داخلی (GLM) — در محیط دمو/سندباکس
//   ۵) fallback قانون‌محور ایجنت‌ها
// ------------------------------------------------------------------

export type LLMMessage = { role: 'system' | 'user' | 'assistant'; content: string }

type ProviderInfo = {
  kind: 'custom' | 'env' | 'free' | 'sdk' | 'none'
  label: string
  model?: string
}

let _zai: Awaited<ReturnType<typeof ZAI.create>> | null = null
async function zai() {
  if (!_zai) _zai = await ZAI.create()
  return _zai
}

// --- خواندن تنظیمات از دیتابیس (کش ۶۰ ثانیه‌ای) ---

type DbAiConfig = { baseUrl: string; apiKey: string; model: string } | null
let _dbCfgCache: { at: number; cfg: DbAiConfig } = { at: 0, cfg: null }

async function dbAiConfig(): Promise<DbAiConfig> {
  const now = Date.now()
  if (now - _dbCfgCache.at < 60_000) return _dbCfgCache.cfg
  try {
    const metas = await db.systemMeta.findMany({
      where: { key: { in: ['ai_base_url', 'ai_api_key', 'ai_model'] } },
    })
    const map = Object.fromEntries(metas.map((m) => [m.key, m.value]))
    const cfg: DbAiConfig =
      map['ai_base_url'] && map['ai_api_key']
        ? { baseUrl: map['ai_base_url'], apiKey: map['ai_api_key'], model: map['ai_model'] || 'gpt-4o-mini' }
        : null
    _dbCfgCache = { at: now, cfg }
    return cfg
  } catch {
    return null
  }
}

/** پاک کردن کش تنظیمات بعد از ذخیره در پنل */
export function invalidateAiConfig() {
  _dbCfgCache = { at: 0, cfg: null }
}

// --- پرووایدر سفارشی (OpenAI‌سازگار) ---

async function customProviderChat(
  messages: LLMMessage[],
  cfg: { baseUrl: string; apiKey: string; model: string },
): Promise<string | null> {
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: 0.2,
        max_tokens: 1400,
      }),
      signal: AbortSignal.timeout(45_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    return data.choices?.[0]?.message?.content ?? null
  } catch {
    return null
  }
}

// --- موتور رایگان بدون کلید (Pollinations — OpenAI‌سازگار، بدون ثبت‌نام) ---

async function freeProviderChat(messages: LLMMessage[]): Promise<string | null> {
  try {
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages,
        temperature: 0.2,
        max_tokens: 1400,
      }),
      signal: AbortSignal.timeout(55_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    return data.choices?.[0]?.message?.content ?? null
  } catch {
    return null
  }
}

/** پاسخ متنی از LLM؛ در صورت قطعی null */
export async function llmChat(messages: LLMMessage[]): Promise<string | null> {
  // ۱) تنظیمات داخل نرم‌افزار
  const dbCfg = await dbAiConfig()
  if (dbCfg) {
    const out = await customProviderChat(messages, dbCfg)
    if (out && out.trim()) return out
  }
  // ۲) متغیر محیطی
  const envKey = process.env.AI_API_KEY
  const envBase = process.env.AI_BASE_URL
  if (envKey && envBase) {
    const out = await customProviderChat(messages, {
      baseUrl: envBase,
      apiKey: envKey,
      model: process.env.AI_MODEL ?? 'gpt-4o-mini',
    })
    if (out && out.trim()) return out
  }
  // ۳) موتور رایگان بدون کلید — تضمین کارکرد هوش مصنوعی روی هر هاستی
  const freeOut = await freeProviderChat(messages)
  if (freeOut && freeOut.trim()) return freeOut
  // ۴) SDK داخلی
  try {
    const z = await zai()
    const completion = await z.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
    })
    const content = completion.choices[0]?.message?.content
    return content && content.trim() ? content : null
  } catch {
    return null
  }
}

/** موتور فعال فعلی — برای نمایش وضعیت در UI */
export async function aiEngine(): Promise<ProviderInfo> {
  const dbCfg = await dbAiConfig()
  if (dbCfg) return { kind: 'custom', label: `پرووایدر اختصاصی (${dbCfg.model})`, model: dbCfg.model }
  if (process.env.AI_API_KEY && process.env.AI_BASE_URL) {
    return { kind: 'env', label: `پرووایدر محیطی (${process.env.AI_MODEL ?? 'gpt-4o-mini'})` }
  }
  return { kind: 'free', label: 'موتور رایگان ابری (بدون نیاز به کلید)' }
}

/** تست اتصال پرووایدر از پنل تنظیمات */
export async function testAiProvider(baseUrl: string, apiKey: string, model?: string): Promise<{ ok: boolean; message: string }> {
  const base = baseUrl.replace(/\/+$/, '')
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'سلام' }],
        max_tokens: 20,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (res.ok) {
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      const text = data.choices?.[0]?.message?.content
      return { ok: true, message: `اتصال موفق بود ✓${text ? ` — پاسخ نمونه: ${text.slice(0, 40)}` : ''}` }
    }
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } | string } | null
    const detail = typeof body?.error === 'string' ? body.error : body?.error?.message
    return { ok: false, message: `خطا ${res.status}${detail ? `: ${detail}` : ''}` }
  } catch (e) {
    return { ok: false, message: `اتصال برقرار نشد: ${e instanceof Error ? e.message : 'خطای شبکه'}` }
  }
}

/** استخراج اولین بلوک JSON از متن (تحمل ```json و متن اضافه) */
export function extractJSON<T>(raw: string): T | null {
  if (!raw) return null
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('{')
  if (start < 0) return null
  // پیدا کردن { } متوازن
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (esc) { esc = false; continue }
    if (ch === '\\') { esc = true; continue }
    if (ch === '"') inStr = !inStr
    if (inStr) continue
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as T
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/** درخواست پاسخ JSON ساختاریافته */
export async function llmJSON<T>(messages: LLMMessage[]): Promise<T | null> {
  const raw = await llmChat(messages)
  if (!raw) return null
  return extractJSON<T>(raw)
}

/** ثبت آمار هر فراخوانی هوش مصنوعی (پایش عملکرد دستیارها) */
export async function logAiCall(opts: { role: string; agent: string; ok: boolean; aiUsed: boolean; latencyMs: number }) {
  try {
    await db.aiCall.create({
      data: {
        role: opts.role,
        agent: opts.agent,
        ok: opts.ok,
        aiUsed: opts.aiUsed,
        latencyMs: Math.round(opts.latencyMs),
      },
    })
  } catch {
    // ثبت آمار نباید پاسخ را خراب کند
  }
}
