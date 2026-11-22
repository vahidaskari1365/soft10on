import { NextResponse } from 'next/server'
import { tenantHandler, platformHandler } from '@/lib/tenant'
import { getSessionUser, clearSessionCookie, revokeAllSessions } from '@/lib/auth'

/** خروج از همهٔ دستگاه‌ها — tokenVersion کاربر افزایش می‌یابد و همهٔ توکن‌ها ابطال می‌شوند */
export const POST = tenantHandler()(async (session, _request) => {
  await revokeAllSessions(session.id)
  await clearSessionCookie()
  return NextResponse.json({ ok: true })
})
