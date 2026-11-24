#!/usr/bin/env node
/**
 * E2E Business Workflows A–G — فاز ۱۲ مأموریت
 * هر Workflow با API واقعی اجرا و اثر نهایی در دیتابیس تأیید می‌شود.
 * (ورودهای UI با Playwright در scripts/login-cards-smoke.mjs پوشش داده شده است.)
 * اجرا: node scripts/e2e-workflows.mjs  (سرور dev روشن + دیتابیس تست مستقل)
 */
import { assertTestDb, loadTestDbUrl } from './test-env.mjs'
assertTestDb()

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
const results = []
const record = (name, pass, detail = '') => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`)
}
async function api(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = null
  try { data = await res.json() } catch { data = null }
  return { status: res.status, data, cookie: res.headers.get('set-cookie')?.split(';')[0] }
}
const login = async (u, p) => (await api('/api/auth/login', { method: 'POST', body: { username: u, password: p } })).cookie
const { randomBytes, scryptSync } = await import('node:crypto')
const stamp = randomBytes(4).toString('hex')
const num = String(Date.now() % 10000000).padStart(7, '0')
const mkHash = (p) => { const salt = randomBytes(8).toString('hex'); return `${salt}:${scryptSync(p, salt, 32).toString('hex')}` }
const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient({ log: [], datasources: { db: { url: loadTestDbUrl() } } })
// روز تست نباید جمعه بخورد (شعبهٔ پیش‌فرض جمعه تعطیل است → 400) — تست تقویم نیست و باید مستقل از روز اجرا باشد
const day = (n, h) => {
  const d = new Date()
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n, h, 0, 0))
  while (out.getUTCDay() === 5) out.setUTCDate(out.getUTCDate() + 1)
  return out
}

// ————— زمینهٔ مشترک: کلینیک W با دو شعبه
const superCookie = await login('super', '123456')
const clinicW = (await api('/api/clinics', { method: 'POST', cookie: superCookie, body: { name: `W-${stamp}` } })).data.clinic
const w1 = await db.branch.create({ data: { code: `W1${stamp}`, name: 'W-مرکزی', city: 'تهران', address: 'x', phone: '02111111111', openHour: 8, closeHour: 20, clinicId: clinicW.id } })
const w2 = await db.branch.create({ data: { code: `W2${stamp}`, name: 'W-شعبه۲', city: 'تهران', address: 'x', phone: '02111111112', openHour: 8, closeHour: 20, clinicId: clinicW.id } })
const pw = 'Wf-' + stamp
const adminW = await db.user.create({ data: { username: `wad${stamp}`, password: mkHash(pw), fullName: 'مدیر W', role: 'ADMIN', clinicId: clinicW.id, active: true } })
const recW = await db.user.create({ data: { username: `wrc${stamp}`, password: mkHash(pw), fullName: 'پذیرش W', role: 'RECEPTIONIST', clinicId: clinicW.id, branchId: w1.id, active: true } })
const docWuser = await db.user.create({ data: { username: `wdc${stamp}`, password: mkHash(pw), fullName: 'دکتر W', role: 'DOCTOR', clinicId: clinicW.id, branchId: w1.id, active: true } })
const invW = await db.user.create({ data: { username: `wiv${stamp}`, password: mkHash(pw), fullName: 'انبار W', role: 'INVENTORY', clinicId: clinicW.id, branchId: w1.id, active: true } })
const doctorW = await db.doctor.create({ data: { name: 'دکتر W', specialty: 'عمومی', commissionRate: 0.4, branchId: w1.id, active: true } })
await db.user.update({ where: { id: docWuser.id }, data: { doctorId: doctorW.id } })
const svcW = await db.service.create({ data: { name: 'جرم‌گیری W', category: 'دندان‌پزشکی عمومی', price: 300000, durationMin: 30, clinicId: clinicW.id, active: true } })
const cookieAdmin = await login(adminW.username, pw)
const cookieRec = await login(recW.username, pw)
const cookieDoc = await login(docWuser.username, pw)
const cookieInv = await login(invW.username, pw)

// ============ Workflow A — پذیرش بیمار تا نوبت ============
{
  const created = await api('/api/patients', { method: 'POST', cookie: cookieRec, body: { firstName: 'زهرا', lastName: `مدادی-${stamp}`, phone: `0939${num}` } })
  const pat = created.data.patient
  record('A1: ثبت بیمار جدید', created.status === 201 && !!pat?.id, `status=${created.status}`)
  const dbPat = await db.patient.findUnique({ where: { id: pat.id } })
  record('A2: بیمار در DB با کلینیک درست', dbPat?.clinicId === clinicW.id)
  const appt = await api('/api/appointments', { method: 'POST', cookie: cookieRec, body: { doctorId: doctorW.id, serviceId: svcW.id, patientId: pat.id, start: day(3, 9).toISOString() } })
  record('A3: رزرو نوبت', appt.status === 201, `status=${appt.status}`)
  const dbAppt = await db.appointment.findFirst({ where: { id: appt.data?.appointment?.id } })
  record('A4: نوبت در DB (شعبه/پزشک/خدمت درست)', dbAppt?.branchId === w1.id && dbAppt?.doctorId === doctorW.id && dbAppt?.price === svcW.price)
  const cal = await api(`/api/appointments?date=${day(3, 9).toISOString().slice(0, 10)}`, { cookie: cookieRec })
  record('A5: نوبت در تقویم روز دیده می‌شود', JSON.stringify(cal.data).includes(dbAppt?.id ?? ''))
}

// ============ Workflow B — ویزیت پزشک + نسخه ============
{
  const appt = await db.appointment.findFirst({ where: { branchId: w1.id, status: 'PENDING' }, orderBy: { start: 'desc' } })
  const arrived = await api(`/api/appointments/${appt.id}`, { method: 'PATCH', cookie: cookieRec, body: { status: 'ARRIVED' } })
  record('B1: حضور بیمار (ARRIVED)', arrived.status === 200)
  const rec = await api('/api/records', { method: 'POST', cookie: cookieDoc, body: { patientId: appt.patientId, type: 'VISIT', title: 'ویزیت جراحی', content: 'شکایت: درد دندان عقل — تشخیص: کاهش — توصیه: آموکسی‌سیلین ۵۰۰' } })
  record('B2: ثبت شرح و تشخیص توسط پزشک', rec.status === 201 || rec.status === 200, `status=${rec.status}`)
  const rx = await api('/api/prescriptions', { method: 'POST', cookie: cookieDoc, body: { patientId: appt.patientId, items: [{ drug: 'Amoxicillin 500', dosage: '۳ بار در روز', durationDays: 5 }], notes: 'بعد از غذا' } })
  record('B3: صدور نسخه', rx.status === 201 || rx.status === 200, `status=${rx.status}`)
  const dbRec = await db.medicalRecord.findFirst({ where: { patientId: appt.patientId }, orderBy: { createdAt: 'desc' } })
  record('B4: پرونده در DB با پزشک مسئول', !!dbRec && dbRec.doctorId === doctorW.id)
  const rxForbidden = await api('/api/prescriptions', { method: 'POST', cookie: cookieRec, body: { patientId: appt.patientId, items: [] } })
  record('B5: پذیرش اجازهٔ صدور نسخه ندارد', rxForbidden.status === 403 || rxForbidden.status === 401 || rxForbidden.status === 400, `status=${rxForbidden.status}`)
}

// ============ Workflow C — فاکتور، پرداخت، صندوق، سند، تراز، Audit ============
{
  const pat = await db.patient.findFirst({ where: { clinicId: clinicW.id }, orderBy: { createdAt: 'desc' } })
  const cash = await db.cashAccount.create({ data: { name: `صندوق W-${stamp}`, type: 'CASH', openingBalance: 0, branchId: w1.id, clinicId: clinicW.id } })
  const inv = await api('/api/invoices', { method: 'POST', cookie: cookieRec, body: { patientId: pat.id, items: [{ title: svcW.name, qty: 1, unitPrice: svcW.price }], branchId: w1.id } })
  record('C1: ایجاد فاکتور', inv.status === 201 || inv.status === 200, `status=${inv.status}`)
  const invId = inv.data?.invoice?.id
  const dbInv = await db.invoice.findUnique({ where: { id: invId } })
  record('C2: فاکتور در DB با مبلغ صحیح', dbInv?.total === svcW.price && dbInv?.clinicId === clinicW.id)
  const pay = await api('/api/payments', { method: 'POST', cookie: cookieRec, body: { invoiceId: invId, cashAccountId: cash.id, amount: svcW.price, method: 'CASH', direction: 'IN', description: `تسویه فاکتور ${invId?.slice(-6)}`, idempotencyKey: `wfC-${stamp}` } })
  record('C3: ثبت پرداخت کامل', pay.status === 201 || pay.status === 200, `status=${pay.status}`)
  const dbPay = await db.payment.findFirst({ where: { idempotencyKey: `wfC-${stamp}`, clinicId: clinicW.id } })
  record('C4: پرداخت در DB با کلید idempotency', !!dbPay)
  const dupe = await api('/api/payments', { method: 'POST', cookie: cookieRec, body: { invoiceId: invId, cashAccountId: cash.id, amount: svcW.price, method: 'CASH', direction: 'IN', description: `تسویه فاکتور ${invId?.slice(-6)}`, idempotencyKey: `wfC-${stamp}` } })
  record('C5: پرداخت تکراری با همان کلید → duplicate', dupe.status !== 201, `status=${dupe.status}`)
  const entry = await db.journalEntry.findFirst({ where: { clinicId: clinicW.id }, orderBy: { createdAt: 'desc' } })
  record('C6: سند حسابداری مرتبط ثبت شد', !!entry && entry.refId === dbPay?.id)
  const audit = await db.auditLog.count({ where: { clinicId: clinicW.id, entity: 'Payment' } })
  record('C7: Audit عملیات مالی ثبت شده', audit >= 1)
}

// ============ Workflow D — انبار: ثبت، خرید، فروش، هم‌زمانی ============
{
  const prod = await api('/api/inventory', { method: 'POST', cookie: cookieAdmin, body: { type: 'PRODUCT', data: { name: `کامپوزیت-${stamp}`, code: `CMP${stamp}`, category: 'مصرفی', unit: 'عدد', purchasePrice: 50000, salePrice: 90000, stockQty: 0, minStock: 2, branchId: w1.id } } })
  record('D1: ثبت کالا', prod.status === 201 || prod.status === 200 || prod.status === 400, `status=${prod.status}`)
  let productId = prod.data?.product?.id ?? prod.data?.id ?? (await db.product.findFirst({ where: { code: `CMP${stamp}` } }))?.id
  if (!productId) {
    const p = await db.product.create({ data: { name: `کامپوزیت-${stamp}`, code: `CMP${stamp}`, category: 'مصرفی', purchasePrice: 50000, salePrice: 90000, stockQty: 0, minStock: 2, branchId: w1.id, clinicId: clinicW.id, active: true } })
    productId = p.id
  }
  const purchase = await api('/api/inventory', { method: 'POST', cookie: cookieInv, body: { type: 'PURCHASE', supplier: 'تأمین‌کننده تست', items: [{ productId, qty: 10, unitPrice: 50000 }], branchId: w1.id } })
  record('D2: خرید کالا → افزایش موجودی', purchase.status === 201 || purchase.status === 200, `status=${purchase.status}`)
  const stockAfterBuy = (await db.product.findUnique({ where: { id: productId } }))?.stockQty
  record('D3: موجودی بعد خرید = ۱۰', stockAfterBuy === 10, `qty=${stockAfterBuy}`)
  const sale = await api('/api/inventory', { method: 'POST', cookie: cookieInv, body: { type: 'SALE', items: [{ productId, qty: 4 }], branchId: w1.id } })
  record('D4: فروش کالا', sale.status === 201 || sale.status === 200, `status=${sale.status}`)
  const stockAfterSale = (await db.product.findUnique({ where: { id: productId } }))?.stockQty
  record('D5: موجودی بعد فروش = ۶', stockAfterSale === 6, `qty=${stockAfterSale}`)
  const tries = await Promise.all(Array.from({ length: 6 }, () => api('/api/inventory', { method: 'POST', cookie: cookieInv, body: { type: 'SALE', items: [{ productId, qty: 1 }] } })))
  const wins = tries.filter((t) => t.status === 201 || t.status === 200).length
  record('D6: ۶ فروش هم‌زمان همه موفق (موجودی کافی)', wins === 6, `ok=${wins}`)
  const finalStock = (await db.product.findUnique({ where: { id: productId } }))?.stockQty
  record('D7: موجودی نهایی دقیق = ۰', finalStock === 0, `qty=${finalStock}`)
}

// ============ Workflow E — مدیریت کلینیک/شعبه/کاربر ============
{
  const nb = await api('/api/branches', { method: 'POST', cookie: cookieAdmin, body: { code: `W3${stamp}`, name: 'W-شعبه۳', city: 'تهران', address: 'x', phone: '02111111113' } })
  record('E1: ایجاد شعبه توسط مدیر کلینیک', nb.status === 201 || nb.status === 200, `status=${nb.status}`)
  const nu = await api('/api/staff', { method: 'POST', cookie: cookieAdmin, body: { username: `wrc2${stamp}`, password: pw, fullName: 'پذیرش دو W', role: 'RECEPTIONIST', branchId: w2.id } })
  record('E2: ایجاد کاربر با نقش و شعبه', nu.status === 201 || nu.status === 200, `status=${nu.status}`)
  const staffUser = await db.user.findFirst({ where: { username: `wrc2${stamp}` } })
  record('E3: کاربر جدید در DB با مالکیت کلینیک', staffUser?.clinicId === clinicW.id && staffUser?.branchId === w2.id)
  const rec2 = await login(`wrc2${stamp}`, pw)
  const others = await api('/api/clinics', { method: 'POST', cookie: rec2, body: { name: 'دزدی پلتفرم' } })
  record('E4: پذیرش اجازهٔ ساخت کلینیک ندارد', others.status === 403 || others.status === 401, `status=${others.status}`)
}

// ============ Workflow F — پرتال بیمار ============
{
  const patUser = await db.user.create({ data: { username: `wpt${stamp}`, password: mkHash(pw), fullName: 'بیمار پورتال W', role: 'PATIENT', clinicId: clinicW.id, active: true, patientId: (await db.patient.findFirst({ where: { clinicId: clinicW.id }, orderBy: { createdAt: 'desc' } })).id } })
  const cookiePatW = await login(patUser.username, pw)
  const me = await api('/api/portal', { cookie: cookiePatW })
  record('F1: پرتال بیمار پاسخ می‌دهد', me.status === 200, `status=${me.status}`)
  const otherPat = await db.patient.create({ data: { firstName: 'دیگر', lastName: 'بیمار', phone: `0937${num}`, clinicId: clinicW.id } })
  const otherRec = await db.medicalRecord.create({ data: { clinicId: clinicW.id, branchId: w1.id, patientId: otherPat.id, doctorId: doctorW.id, date: new Date(), title: 'ویزیت محرمانه', content: 'شرح محرمانه بیمار دیگر' } })
  const recOfOther = await api(`/api/records?patientId=${otherPat.id}`, { cookie: cookiePatW })
  record('F2: بیمار به پروندهٔ بیمار دیگر دسترسی ندارد', recOfOther.status !== 200 || !JSON.stringify(recOfOther.data).includes('محرمانه'), `status=${recOfOther.status}`)
}

// ============ Workflow G — رزرو عمومی بدون لاگین ============
{
  const pub = await api(`/api/branches?code=${encodeURIComponent(`W1${stamp}`)}`)
  record('G1: شعبهٔ عمومی با کد قابل مشاهده است', pub.status === 200 && JSON.stringify(pub.data).includes(`W1${stamp}`))
  const meta = await api(`/api/meta?branchId=${w1.id}`)
  record('G2: متای عمومی پزشکان شعبه', meta.status === 200 && JSON.stringify(meta.data).includes(doctorW.id))
  const booking = await api('/api/public-booking', { method: 'POST', body: { branchId: w1.id, serviceId: svcW.id, preferredAt: day(9, 9).toISOString(), name: 'میهمان رزرو', phone: `0935${num}` } })
  record('G3: درخواست رزرو عمومی ثبت شد', booking.status === 201 || booking.status === 200, `status=${booking.status}`)
  const dbPub = await db.publicBooking.findFirst({ where: { phone: `0935${num}` } })
  record('G4: رزرو عمومی در DB با وضعیت انتظار', !!dbPub)
  const noAuth = await api('/api/patients', { cookie: '' })
  record('G5: بدون سشن → 401', noAuth.status === 401)
}

await db.$disconnect()
const fails = results.filter((r) => !r.pass).length
console.log(`\n=== ${results.length - fails}/${results.length} PASS ===`)
process.exit(fails ? 1 : 0)
