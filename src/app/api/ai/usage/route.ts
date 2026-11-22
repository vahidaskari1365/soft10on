import { NextResponse } from 'next/server'
import { tenantHandler, platformHandler } from '@/lib/tenant'
import { db } from '@/lib/db'

/** آمار عملکرد دستیارهای هوشمند — فقط مدیر کل */
export const GET = tenantHandler('ADMIN')(async (session, _request) => {
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000)
  const calls = await db.aiCall.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 2000,
  })

  const total = calls.length
  const aiUsed = calls.filter((c) => c.aiUsed).length
  const ok = calls.filter((c) => c.ok).length
  const avgLatency = total ? Math.round(calls.reduce((s, c) => s + c.latencyMs, 0) / total) : 0

  const byAgent: Record<string, { total: number; aiUsed: number; ok: number }> = {}
  const byRole: Record<string, { total: number }> = {}
  for (const c of calls) {
    byAgent[c.agent] ??= { total: 0, aiUsed: 0, ok: 0 }
    byAgent[c.agent].total++
    if (c.aiUsed) byAgent[c.agent].aiUsed++
    if (c.ok) byAgent[c.agent].ok++
    byRole[c.role] ??= { total: 0 }
    byRole[c.role].total++
  }

  // ۱۴ روز اخیر
  const days: Record<string, number> = {}
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10)
    days[d] = 0
  }
  for (const c of calls) days[c.createdAt.toISOString().slice(0, 10)] = (days[c.createdAt.toISOString().slice(0, 10)] ?? 0) + 1

  return NextResponse.json({
    summary: { total, aiUsed, ok, avgLatencyMs: avgLatency, aiShare: total ? Math.round((aiUsed / total) * 100) : 0 },
    byAgent,
    byRole,
    daily: Object.entries(days).map(([date, count]) => ({ date, count })),
    recent: calls.slice(0, 12).map((c) => ({
      id: c.id,
      role: c.role,
      agent: c.agent,
      ok: c.ok,
      aiUsed: c.aiUsed,
      latencyMs: c.latencyMs,
      createdAt: c.createdAt.toISOString(),
    })),
  })
})
