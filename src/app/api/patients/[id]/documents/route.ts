import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { vStr, vEnum } from '@/lib/validation'
import { addTimeline } from '@/lib/timeline'
import { logAudit } from '@/lib/audit'

const DOC_KINDS = ['LAB', 'IMAGING', 'RX', 'INSURANCE', 'CONSENT', 'MEDICAL', 'AVATAR', 'PORTAL_UPLOAD'] as const
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

/** فهرست اسناد بیمار (فقط متادیتا) — بیمار فقط اسناد خودش */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  if (session.role === 'PATIENT' && session.patientId !== id)
    return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })
  const documents = await db.document.findMany({
    where: { patientId: id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, kind: true, title: true, mimeType: true, sizeBytes: true, note: true, createdAt: true, uploadedBy: { select: { fullName: true } } },
  })
  return NextResponse.json({ documents })
}

/** آپلود سند پزشکی — ذخیره در دیتابیس با کنترل نوع، حجم و مجوز؛ لینک عمومی وجود ندارد */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  // بیمار فقط سند PORTAL_UPLOAD برای پرونده خودش می‌فرستد
  const isPatient = session.role === 'PATIENT'
  if (isPatient && session.patientId !== id)
    return NextResponse.json({ error: 'دسترسی مجاز نیست' }, { status: 403 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'فرمت درخواست نامعتبر است (multipart لازم است)' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'فایل ارسال نشده است' }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'فایل خالی است' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'حجم فایل حداکثر ۱۰ مگابایت است' }, { status: 400 })
  if (!ALLOWED_MIME.includes(file.type))
    return NextResponse.json({ error: 'نوع فایل مجاز نیست (PDF یا تصویر JPG/PNG/WebP)' }, { status: 400 })

  const kindRaw = form.get('kind')
  const kindDefault = isPatient ? 'PORTAL_UPLOAD' : 'MEDICAL'
  const kind = vEnum(kindRaw ?? kindDefault, DOC_KINDS, 'دسته سند')
  if (!kind.ok) return NextResponse.json({ error: kind.error }, { status: 400 })
  if (isPatient && kind.value !== 'PORTAL_UPLOAD')
    return NextResponse.json({ error: 'دسته سند مجاز نیست' }, { status: 403 })

  const title = vStr(form.get('title') ?? file.name, { required: true, max: 120, label: 'عنوان سند' })
  if (!title.ok) return NextResponse.json({ error: title.error }, { status: 400 })
  const note = vStr(form.get('note'), { label: 'توضیحات', max: 300 })
  if (!note.ok) return NextResponse.json({ error: note.error }, { status: 400 })

  const patient = await db.patient.findUnique({ where: { id }, select: { id: true } })
  if (!patient) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  const document = await db.document.create({
    data: {
      patientId: id,
      branchId: session.branchId,
      clinicId: session.clinicId,
      kind: kind.value,
      title: title.value,
      mimeType: file.type,
      sizeBytes: file.size,
      data: bytes,
      uploadedById: session.id,
      note: note.value || null,
    },
    select: { id: true, kind: true, title: true, mimeType: true, sizeBytes: true, createdAt: true },
  })

  await addTimeline(id, 'DOCUMENT', `آپلود سند — ${title.value}`, { refId: document.id, actorName: session.fullName, meta: { kind: kind.value, sizeBytes: file.size } })
  await logAudit({ userId: session.id, userName: session.fullName, action: 'UPLOAD', entity: 'Document', entityId: document.id, branchId: session.branchId, clinicId: session.clinicId, meta: { kind: kind.value, sizeBytes: file.size, mimeType: file.type } })

  return NextResponse.json({ document }, { status: 201 })
}
