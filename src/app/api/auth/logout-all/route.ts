import { NextResponse } from 'next/server'
import { getSessionUser, clearSessionCookie, revokeAllSessions } from '@/lib/auth'

/** خروج از همهٔ دستگاه‌ها — tokenVersion کاربر افزایش می‌یابد و همهٔ توکن‌ها ابطال می‌شوند */
export async function POST() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  await revokeAllSessions(session.id)
  await clearSessionCookie()
  return NextResponse.json({ ok: true })
}
