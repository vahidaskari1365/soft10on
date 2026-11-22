import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tenantHandler } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'
import { addTimeline } from '@/lib/timeline'

/**
 * دانلود امن سند پزشکی — بدون احراز هویت هیچ فایلی قابل دریافت نیست.
 * بیمار فقط اسناد پرونده خودش؛ کارکنان اسناد بیماران تحت پوشش کلینیک.
 */
export const GET = tenantHandler()(async (session, _request, { params }) => {
  const { id } = await params

  // findFirst با scope خودکار — سند پزشکی کلینیک دیگر قابل دریافت نیست
  const doc = await db.document.findFirst({
    where: { id },
    select: { id: true, patientId: true, title: true, mimeType: true, sizeBytes: true, data: true },
  })
  if (!doc) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  if (session.role === 'PATIENT' && session.patientId !== doc.patientId) {
    await logAudit({ userId: session.id, userName: session.fullName, action: 'DOWNLOAD', entity: 'Document', entityId: id, result: 'DENIED', clinicId: session.clinicId })
    return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  }

  await logAudit({ userId: session.id, userName: session.fullName, action: 'DOWNLOAD', entity: 'Document', entityId: id, branchId: session.branchId, clinicId: session.clinicId, meta: { sizeBytes: doc.sizeBytes } })

  const bytes = new Uint8Array(doc.data)
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': doc.mimeType,
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `inline; filename="doc-${id}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

/** حذف سند — فقط مدیر یا آپلودکننده؛ تایم‌لاین و حسابرسی ثبت می‌شود */
export const DELETE = tenantHandler()(async (session, _request, { params }) => {
  const { id } = await params

  // findFirst با scope خودکار — حذف سند کلینیک دیگر ممکن نیست
  const doc = await db.document.findFirst({ where: { id }, select: { id: true, patientId: true, title: true, uploadedById: true } })
  if (!doc) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const canDelete = session.role === 'ADMIN' || doc.uploadedById === session.id
  if (!canDelete) {
    await logAudit({ userId: session.id, userName: session.fullName, action: 'DELETE', entity: 'Document', entityId: id, result: 'DENIED', clinicId: session.clinicId })
    return NextResponse.json({ error: 'فقط مدیر یا آپلودکننده می‌تواند سند را حذف کند' }, { status: 403 })
  }

  await db.document.delete({ where: { id } })
  await addTimeline(doc.patientId, 'DOCUMENT', `حذف سند — ${doc.title}`, { actorName: session.fullName })
  await logAudit({ userId: session.id, userName: session.fullName, action: 'DELETE', entity: 'Document', entityId: id, branchId: session.branchId, clinicId: session.clinicId, meta: { title: doc.title } })
  return NextResponse.json({ ok: true })
})
