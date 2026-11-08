import { llmChat, type LLMMessage } from './ai'

// ------------------------------------------------------------------
// فریم‌ورک ایجنت 10on — حلقه‌ی ابزارمحور (Tool Loop)
// هر ایجنت: پرامپت سیستم + مجموعه ابزار واقعی روی دیتابیس
// مدل یا ابزار صدا می‌زند (JSON) یا پاسخ نهایی می‌دهد.
// در صورت قطعی هوش مصنوعی، fallback قانون‌محور اجرا می‌شود.
// ------------------------------------------------------------------

export type AgentTool = {
  name: string
  description: string
  argsHint: string // توضیح آرگومان‌ها به‌صورت نمونه JSON
  run: (args: Record<string, unknown>) => Promise<unknown>
}

export type AgentStep = {
  tool: string
  title: string
  args: Record<string, unknown>
  result: unknown
  ok: boolean
}

export type AgentTurn = {
  answer: string
  steps: AgentStep[]
  aiUsed: boolean
}

type TurnMessage = { role: 'user' | 'assistant'; content: string }

type ModelDecision = { tool?: string; args?: Record<string, unknown>; answer?: string }

function buildSystem(system: string, tools: AgentTool[]): string {
  const toolDocs = tools
    .map((t) => `- ${t.name}: ${t.description}\n  آرگومان‌ها (JSON): ${t.argsHint}`)
    .join('\n')
  return `${system}

# ابزارهای در دسترس شما
${toolDocs}

# قانون پاسخ‌دهی (بسیار مهم)
در هر نوبت فقط و فقط یک JSON خالص برمی‌گردانید، بدون هیچ متن اضافه و بدون markdown:
1) اگر برای پاسخ به اطلاعات یا انجام کاری نیاز به ابزار دارید:
{"tool":"نام_ابزار","args":{...}}
2) اگر اطلاعات کافی دارید و می‌خواهید پاسخ نهایی بدهید:
{"answer":"پاسخ کامل به فارسی روان و محترمانه"}

نکات:
- پاسخ نهایی را همیشه کاملاً فارسی، با اعداد فارسی و لحن حرفه‌ای بدهید.
- اگر ابزار خطا داد، به بیمار/کاربر محترمانه بگویید و راهنمایی جایگزین بدهید.
- حداکثر ${6} بار می‌توانید ابزار صدا بزنید؛ بعد حتماً answer بدهید.
- داده‌های عددی (مبالغ، درصد، تاریخ) را فقط از نتایج ابزار بردارید؛ عدد از خودتان نسازید.`
}

/** یک نوبت گفتگو با ایجنت را اجرا می‌کند (حلقه‌ی ابزار) */
export async function runToolAgent(opts: {
  system: string
  tools: AgentTool[]
  history: TurnMessage[]
  userMessage: string
  fallback?: (userMessage: string, history: TurnMessage[]) => Promise<{ answer: string; steps?: AgentStep[] }>
  toolTitles?: Record<string, string>
  maxSteps?: number
}): Promise<AgentTurn> {
  const { system, tools, history, userMessage } = opts
  const maxSteps = opts.maxSteps ?? 4
  const steps: AgentStep[] = []

  const messages: LLMMessage[] = [
    { role: 'system', content: buildSystem(system, tools) },
    ...history.slice(-8),
    { role: 'user', content: userMessage },
  ]

  for (let i = 0; i < maxSteps; i++) {
    const raw = await llmChat(messages)
    if (!raw) {
      // هوش مصنوعی در دسترس نیست → مسیر پایدار قانون‌محور
      if (opts.fallback) {
        const fb = await opts.fallback(userMessage, history)
        return { answer: fb.answer, steps: [...steps, ...(fb.steps ?? [])], aiUsed: false }
      }
      return {
        answer: 'فعلاً نمی‌توانم به هوش مصنوعی وصل شوم؛ لطفاً چند لحظه بعد دوباره تلاش کنید. برای ثبت نوبت هم می‌توانید با پذیرش تماس بگیرید.',
        steps,
        aiUsed: false,
      }
    }

    const decision = parseDecision(raw)
    if (!decision) {
      // مدل JSON نداد → خودش را جواب نهایی فرض می‌کنیم
      return { answer: sanitizeAnswer(raw), steps, aiUsed: true }
    }

    if (decision.answer) {
      return { answer: sanitizeAnswer(decision.answer), steps, aiUsed: true }
    }

    const toolName = decision.tool ?? ''
    const tool = tools.find((t) => t.name === toolName)
    if (!tool) {
      messages.push({ role: 'assistant', content: raw })
      messages.push({
        role: 'user',
        content: `ابزار «${toolName}» وجود ندارد. ابزارهای موجود: ${tools.map((t) => t.name).join(', ')}. لطفاً دوباره فقط JSON بدهید.`,
      })
      continue
    }

    let result: unknown
    let ok = true
    try {
      result = await tool.run(decision.args ?? {})
    } catch (e) {
      ok = false
      result = { error: e instanceof Error ? e.message : 'خطای ابزار' }
    }
    steps.push({
      tool: tool.name,
      title: opts.toolTitles?.[tool.name] ?? tool.name,
      args: decision.args ?? {},
      result,
      ok,
    })

    messages.push({ role: 'assistant', content: raw })
    messages.push({
      role: 'user',
      content: `TOOL_RESULT (${tool.name}):\n${JSON.stringify(result).slice(0, 3500)}\n\nاگر اطلاعات کافی داری {"answer":"..."} بده، وگرنه ابزار بعدی را صدا بزن.`,
    })
  }

  // سقف مراحل → پاسخ جمع‌بندی
  const raw = await llmChat([
    ...messages,
    { role: 'user', content: 'سقف استفاده از ابزار پر شد. با همین اطلاعات {"answer":"..."} نهایی بده.' },
  ])
  if (raw) {
    const d = parseDecision(raw)
    if (d?.answer) return { answer: sanitizeAnswer(d.answer), steps, aiUsed: true }
    return { answer: sanitizeAnswer(raw), steps, aiUsed: true }
  }
  return {
    answer: 'اطلاعات را گرفتم ولی در جمع‌بندی به مشکل خوردم. لطفاً دوباره تلاش کنید.',
    steps,
    aiUsed: false,
  }
}

function parseDecision(raw: string): ModelDecision | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const text = (fence ? fence[1] : raw).trim()
  const start = text.indexOf('{')
  if (start < 0) return null
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
          return JSON.parse(text.slice(start, i + 1)) as ModelDecision
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/** حذف احتمالی json باقی‌مانده در متن نهایی */
function sanitizeAnswer(text: string): string {
  return text.replace(/```(?:json)?[\s\S]*?```/g, '').trim() || text.trim()
}
