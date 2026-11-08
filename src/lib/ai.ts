import ZAI from 'z-ai-web-dev-sdk'

// ------------------------------------------------------------------
// لایه‌ی هوش مصنوعی 10on
// ۱) اگر AI_API_KEY + AI_BASE_URL در env تنظیم شده باشد → پرووایدر
//    OpenAI‑سازگار کاربر (هر سرویس رایگان/پولی؛ سازگار با روترهایی مثل OmniRoute)
// ۲) در غیر این صورت SDK داخلی (GLM)
// ۳) اگر هیچ‌کدام در دسترس نبود، ایجنت‌ها به حالت قانون‌محور برمی‌گردند
// ------------------------------------------------------------------

export type LLMMessage = { role: 'system' | 'user' | 'assistant'; content: string }

let _zai: Awaited<ReturnType<typeof ZAI.create>> | null = null
async function zai() {
  if (!_zai) _zai = await ZAI.create()
  return _zai
}

async function customProviderChat(messages: LLMMessage[]): Promise<string | null> {
  const key = process.env.AI_API_KEY
  const base = process.env.AI_BASE_URL
  if (!key || !base) return null
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL ?? 'gpt-4o-mini',
        messages,
        temperature: 0.2,
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    return data.choices?.[0]?.message?.content ?? null
  } catch {
    return null
  }
}

/** پاسخ متنی از LLM؛ در صورت خطا null */
export async function llmChat(messages: LLMMessage[]): Promise<string | null> {
  const custom = await customProviderChat(messages)
  if (custom && custom.trim()) return custom
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

export function aiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY && process.env.AI_BASE_URL) || true // SDK همیشه در دسترس است
}
