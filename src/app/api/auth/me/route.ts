import { NextResponse } from 'next/server'
import { tenantHandler, platformHandler } from '@/lib/tenant'

export const GET = tenantHandler()(async (session) => {
  return NextResponse.json({ user: session })
})
