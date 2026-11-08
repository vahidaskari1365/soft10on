import { PrismaClient } from '@prisma/client'
import { jMonthKey, monthKeyStart, monthKeyEnd } from '../src/lib/jalali'
import { hashPassword } from '../src/lib/password'

const db = new PrismaClient()

// ---------- deterministic RNG ----------
let seedState = 987654321
function rnd() {
  seedState = (seedState * 16807) % 2147483647
  return (seedState - 1) / 2147483646
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)]
}
function pickWeighted<T>(arr: T[], weight: number): T {
  // weight<1 → bias to earlier items
  const r = Math.pow(rnd(), weight)
  return arr[Math.floor(r * arr.length)]
}
function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function at(d: Date, h: number, m = 0) {
  const x = new Date(d)
  x.setHours(h, m, 0, 0)
  return x
}

async function main() {
  console.log(' seeding…')

  // wipe (ترتیب مهم: ابتدا جداول با رابطه)
  await db.user.deleteMany()
  await db.expense.deleteMany()
  await db.productSale.deleteMany()
  await db.purchaseItem.deleteMany()
  await db.purchase.deleteMany()
  await db.product.deleteMany()
  await db.task.deleteMany()
  await db.appointment.deleteMany()
  await db.patient.deleteMany()
  await db.service.deleteMany()
  await db.doctor.deleteMany()
  await db.branch.deleteMany()
  await db.systemMeta.deleteMany()

  // ---------- شعب ----------
  const brMain = await db.branch.create({
    data: {
      code: 'SAADAT',
      name: 'شعبه مرکزی (سعادت‌آباد)',
      city: 'تهران',
      address: 'سعادت‌آباد، بلوار دریا، پلاک ۴۲، طبقه دوم',
      phone: '۰۲۱-۲۲۳۳۴۴۵۵',
      openHour: 9,
      closeHour: 19,
      thuCloseHour: 13,
      closedFri: true,
    },
  })
  const brValiasr = await db.branch.create({
    data: {
      code: 'VALIASR',
      name: 'شعبه ولیعصر',
      city: 'تهران',
      address: 'میدان ونک، خیابان ولیعصر، برج آرمان، طبقه ۵',
      phone: '۰۲۱-۸۸۹۹۷۷۶۶',
      openHour: 10,
      closeHour: 20,
      thuCloseHour: 14,
      closedFri: true,
    },
  })
  const brKaraj = await db.branch.create({
    data: {
      code: 'KARAJ',
      name: 'شعبه کرج (مهرشهر)',
      city: 'کرج',
      address: 'عظیمیه، میدان مهرشهر، بلوار طالبی، پلاک ۱۸',
      phone: '۰۲۶-۳۴۴۴۵۵۶۶',
      openHour: 9,
      closeHour: 18,
      thuCloseHour: 13,
      closedFri: true,
    },
  })
  const branches = [brMain, brValiasr, brKaraj]

  // ---------- پزشکان (هر پزشک متعلق به یک شعبه) ----------
  const drSara = await db.doctor.create({ data: { name: 'دکتر سارا احمدی', specialty: 'ترمیم و زیبایی', commissionRate: 0.4, color: '#5B2A86', branchId: brValiasr.id } })
  const drAmir = await db.doctor.create({ data: { name: 'دکتر امیر رضایی', specialty: 'ایمپلنت و جراحی', commissionRate: 0.45, color: '#2A9D8F', branchId: brKaraj.id } })
  const drNegin = await db.doctor.create({ data: { name: 'دکتر نگین موسوی', specialty: 'دندان‌پزشکی عمومی و اطفال', commissionRate: 0.35, color: '#C9A227', branchId: brMain.id } })
  const doctors = [drSara, drAmir, drNegin]
  const doctorBranch = new Map([[drSara.id, brValiasr.id], [drAmir.id, brKaraj.id], [drNegin.id, brMain.id]])

  // ---------- خدمات ----------
  const svcData = [
    ['معاینه و مشاوره', 'تشخیص', 500_000, 20, 8],
    ['جرم‌گیری و بروساژ', 'پیشگیری', 1_800_000, 30, 7],
    ['فلوراید تراپی', 'پیشگیری', 800_000, 20, 6],
    ['ترمیم کامپوزیت', 'ترمیمی', 2_400_000, 45, 7],
    ['عصب‌کشی (درمان ریشه)', 'ترمیمی', 4_800_000, 60, 4],
    ['روکش زیرکونیا', 'ترمیمی', 9_000_000, 60, 2],
    ['کشیدن دندان ساده', 'جراحی', 1_500_000, 30, 5],
    ['جراحی دندان عقل', 'جراحی', 5_500_000, 60, 2],
    ['ایمپلنت استریومیت', 'جراحی', 28_000_000, 90, 1],
    ['بلیچینگ لیزری', 'زیبایی', 6_000_000, 45, 2],
    ['لمینت سرامیکی (هر واحد)', 'زیبایی', 12_000_000, 90, 1],
    ['رادیوگرافی پانوراما', 'تشخیص', 950_000, 15, 5],
    ['مشاوره ارتودنسی', 'ارتودنسی', 600_000, 30, 3],
  ] as const
  const services: { id: string; name: string; category: string; price: number; durationMin: number; w: number }[] = []
  for (const [name, category, price, durationMin, w] of svcData) {
    const s = await db.service.create({ data: { name, category, price, durationMin } })
    services.push({ id: s.id, name, category, price, durationMin, w })
  }
  // expanded array by weight for picking
  const svcPool: typeof services = []
  for (const s of services) for (let i = 0; i < s.w; i++) svcPool.push(s)

  // ---------- بیماران ----------
  const patientData: [string, string, string, number | null, boolean][] = [
    ['مینا', 'کریمی', '09121234567', 1372, false],
    ['حسین', 'محمدی', '09351112233', 1358, true],
    ['فاطمه', 'حسینی', '09197778899', 1379, false],
    ['رضا', 'کاظمی', '09121112244', 1365, false],
    ['مریم', 'صادقی', '09365556677', 1375, false],
    ['امیرحسین', 'توکلی', '09123334455', 1352, false],
    ['نگار', 'شریفی', '09399998877', 1381, true],
    ['کاوه', 'امینی', '09122223311', 1360, true],
    ['زهرا', 'مرادی', '09178889966', 1370, false],
    ['سامان', 'قاسمی', '09305554433', 1367, false],
    ['الهام', 'رستمی', '09114447788', 1373, false],
    ['بابک', 'نیک‌پور', '09125556699', 1355, false],
    ['شیوا', 'فرهادی', '09362221144', 1382, false],
    ['مهدی', 'جلالی', '09123334488', 1362, false],
    ['آیدا', 'سلطانی', '09191114477', 1377, false],
  ]
  const patients = []
  for (const [firstName, lastName, phone, birthYear, incompleteTreatment] of patientData) {
    const p = await db.patient.create({
      data: { firstName, lastName, phone, birthYear, incompleteTreatment, nationalId: String(1000000000 + Math.floor(rnd() * 8999999999)) },
    })
    patients.push(p)
  }

  const now = new Date()

  // ---------- نوبت‌های تاریخی (~۳۷۰ روز) ----------
  const statuses = ['DONE', 'DONE', 'DONE', 'DONE', 'DONE', 'DONE', 'DONE', 'DONE', 'DONE', 'DONE', 'DONE', 'CANCELLED', 'NO_SHOW']
  const sources = ['WHATSAPP', 'WHATSAPP', 'WHATSAPP', 'PHONE', 'PHONE', 'WALKIN', 'WALKIN', 'PANEL', 'ASSISTANT']
  let apptCount = 0
  const startHist = addDays(now, -370)
  for (let d = new Date(startHist); d < now; d = addDays(d, 1)) {
    const dow = d.getDay()
    if (dow === 5) continue // جمعه تعطیل
    if (dow === 4 && rnd() < 0.5) continue // پنجشنبه‌ها گاهی تعطیل
    const progress = (d.getTime() - startHist.getTime()) / (now.getTime() - startHist.getTime()) // 0→1 (قدیمی→جدید)
    const base = 5.5 + progress * 2.5 // رشد تدریجی
    const count = Math.max(3, Math.round(base + (rnd() - 0.5) * 2))
    for (let i = 0; i < count; i++) {
      const svc = pickWeighted(svcPool, 1.0)
      let pat = pick(patients)
      // دو بیمار «رهاشده»: سامان و بابک فقط در ۱۹۰ روز اول تاریخچه می‌آیند
      const daysAgo = (now.getTime() - d.getTime()) / 86400000
      if (daysAgo < 190 && (pat.firstName === 'سامان' || pat.firstName === 'بابک')) {
        pat = patients[Math.floor(rnd() * 9)]
      }
      // doctor by category
      const doctor = svc.category === 'جراحی' ? (rnd() < 0.8 ? drAmir : drSara)
        : svc.category === 'زیبایی' ? (rnd() < 0.75 ? drSara : drAmir)
        : svc.category === 'ارتودنسی' ? (rnd() < 0.6 ? drNegin : drSara)
        : pick(doctors)
      const hour = 9 + Math.floor(rnd() * 10)
      const minute = rnd() < 0.5 ? 0 : 30
      const status = pick(statuses)
      const paid = status === 'DONE' ? rnd() < 0.87 : rnd() < 0.15
      const isBig = svc.price >= 5_000_000
      await db.appointment.create({
        data: {
          branchId: doctorBranch.get(doctor.id) ?? null,
          patientId: pat.id,
          doctorId: doctor.id,
          serviceId: svc.id,
          start: at(d, hour, minute),
          status,
          source: pick(sources),
          price: svc.price,
          paid,
          deposit: isBig && paid ? Math.round(svc.price * 0.2) : 0,
          createdAt: addDays(at(d, hour, minute), -1 - Math.floor(rnd() * 6)),
        },
      })
      apptCount++
    }
  }

  // ---------- امروز و آینده ----------
  const upcoming: { dayOffset: number; hour: number; minute: number; svcIdx: number; patIdx: number; docIdx: number; status: string; source: string }[] = [
    { dayOffset: 0, hour: 9, minute: 0, svcIdx: 0, patIdx: 2, docIdx: 2, status: 'DONE', source: 'WALKIN' },
    { dayOffset: 0, hour: 10, minute: 30, svcIdx: 3, patIdx: 4, docIdx: 0, status: 'CONFIRMED', source: 'WHATSAPP' },
    { dayOffset: 0, hour: 12, minute: 0, svcIdx: 1, patIdx: 9, docIdx: 2, status: 'CONFIRMED', source: 'PHONE' },
    { dayOffset: 0, hour: 15, minute: 0, svcIdx: 8, patIdx: 3, docIdx: 1, status: 'CONFIRMED', source: 'PANEL' },
    { dayOffset: 0, hour: 17, minute: 30, svcIdx: 10, patIdx: 12, docIdx: 0, status: 'PENDING', source: 'ASSISTANT' },
    { dayOffset: 1, hour: 9, minute: 30, svcIdx: 4, patIdx: 1, docIdx: 0, status: 'CONFIRMED', source: 'PHONE' },
    { dayOffset: 1, hour: 11, minute: 0, svcIdx: 6, patIdx: 5, docIdx: 1, status: 'CONFIRMED', source: 'WALKIN' },
    { dayOffset: 1, hour: 16, minute: 0, svcIdx: 9, patIdx: 7, docIdx: 0, status: 'PENDING', source: 'WHATSAPP' },
    { dayOffset: 2, hour: 10, minute: 0, svcIdx: 8, patIdx: 3, docIdx: 1, status: 'CONFIRMED', source: 'PANEL' },
    { dayOffset: 2, hour: 14, minute: 30, svcIdx: 1, patIdx: 10, docIdx: 2, status: 'CONFIRMED', source: 'WHATSAPP' },
    { dayOffset: 3, hour: 9, minute: 0, svcIdx: 5, patIdx: 7, docIdx: 0, status: 'CONFIRMED', source: 'PHONE' },
    { dayOffset: 3, hour: 11, minute: 30, svcIdx: 11, patIdx: 6, docIdx: 2, status: 'PENDING', source: 'ASSISTANT' },
    { dayOffset: 4, hour: 10, minute: 0, svcIdx: 3, patIdx: 13, docIdx: 0, status: 'CONFIRMED', source: 'WHATSAPP' },
    { dayOffset: 4, hour: 17, minute: 0, svcIdx: 2, patIdx: 14, docIdx: 2, status: 'CONFIRMED', source: 'WALKIN' },
    { dayOffset: 5, hour: 9, minute: 30, svcIdx: 7, patIdx: 8, docIdx: 1, status: 'PENDING', source: 'ASSISTANT' },
    { dayOffset: 5, hour: 16, minute: 30, svcIdx: 4, patIdx: 2, docIdx: 0, status: 'CONFIRMED', source: 'PHONE' },
    { dayOffset: 6, hour: 10, minute: 0, svcIdx: 0, patIdx: 0, docIdx: 2, status: 'PENDING', source: 'WHATSAPP' },
    { dayOffset: 6, hour: 15, minute: 0, svcIdx: 9, patIdx: 5, docIdx: 0, status: 'CONFIRMED', source: 'PANEL' },
  ]
  for (const u of upcoming) {
    const day = addDays(now, u.dayOffset)
    if (day.getDay() === 5) continue
    const svc = services[u.svcIdx]
    const isBig = svc.price >= 5_000_000
    await db.appointment.create({
      data: {
        branchId: doctorBranch.get(doctors[u.docIdx].id) ?? null,
        patientId: patients[u.patIdx].id,
        doctorId: doctors[u.docIdx].id,
        serviceId: svc.id,
        start: at(day, u.hour, u.minute),
        status: u.status,
        source: u.source,
        price: svc.price,
        paid: false,
        deposit: isBig && u.status === 'CONFIRMED' ? Math.round(svc.price * 0.2) : 0,
        createdAt: addDays(now, -1),
      },
    })
    apptCount++
  }

  // ---------- کارتابل ----------
  const t = (title: string, role: string, assignee: string, dueOffsetH: number, priority: string, status: string, opts: { patientIdx?: number; source?: string; desc?: string; branchId?: string | null } = {}) =>
    db.task.create({
      data: {
        branchId: opts.branchId !== undefined ? opts.branchId : brMain.id,
        title,
        description: opts.desc,
        assigneeRole: role,
        assigneeName: assignee,
        patientId: opts.patientIdx != null ? patients[opts.patientIdx].id : null,
        dueAt: addDays(now, dueOffsetH / 24),
        priority,
        status,
        source: opts.source ?? 'MANUAL',
        doneAt: status === 'DONE' ? addDays(now, -1) : null,
      },
    })
  await Promise.all([
    t('یادآوری نوبت‌های فردا با پیامک', 'RECEPTIONIST', 'سمیرا (منشی)', 6, 'MEDIUM', 'OPEN', { source: 'SYSTEM', desc: 'ارسال خودکار یادآوری به ۷ بیمار فردا — شعبه مرکزی' }),
    t('تأیید نوبت درخواستی از دستیار بیمار', 'RECEPTIONIST', 'سمیرا (منشی)', 4, 'HIGH', 'OPEN', { patientIdx: 12, source: 'ASSISTANT', desc: 'نوبت لمینت ساعت ۱۷:۳۰ امروز — نیازمند تأیید ظرفیت' }),
    t('پیگیری پانورامای بیمار قبل از جراحی', 'DOCTOR', 'دکتر امیر رضایی', 26, 'HIGH', 'OPEN', { patientIdx: 3, source: 'DOCTOR', desc: 'رادیوگرافی ارسال نشده؛ تا فردا بررسی شود', branchId: brKaraj.id }),
    t('تماس با بیماران درمان نیمه‌کاره', 'RECEPTIONIST', 'سمیرا (منشی)', 50, 'HIGH', 'IN_PROGRESS', { source: 'ASSISTANT', desc: '۳ بیمار: حسین محمدی، نگار شریفی، کاوه امینی' }),
    t('رسیدگی به شکایت تأخیر نوبت صبحگاهی', 'MANAGER', 'مدیر کلینیک', -20, 'URGENT', 'OPEN', { source: 'MANAGER', desc: 'بیمار بابت ۴۵ دقیقه تأخیر ناراضی است', branchId: null }),
    t('سفارش کامپوزیت و ژل فلوراید', 'RECEPTIONIST', 'سمیرا (منشی)', 72, 'MEDIUM', 'OPEN', { source: 'SYSTEM', desc: 'موجودی زیر حد هشدار: ژل فلوراید و باندینگ' }),
    t('تسویه کارانه ماه جاری پزشکان هر ۳ شعبه', 'MANAGER', 'مدیر کلینیک', 200, 'MEDIUM', 'OPEN', { source: 'MANAGER', branchId: null }),
    t('پیگیری استعلام بیمه بیمار', 'RECEPTIONIST', 'سمیرا (منشی)', 30, 'MEDIUM', 'BLOCKED', { patientIdx: 8, source: 'MANUAL', desc: 'منتظر پاسخ بیمه تکمیلی' }),
    t('دیجیتال‌سازی پرونده‌های کاغذی (دسته ۳)', 'RECEPTIONIST', 'پذیرش شب', 120, 'LOW', 'IN_PROGRESS', { source: 'MANAGER' }),
    t('یادآوری ویزیت شش‌ماهه بیماران قدیمی', 'RECEPTIONIST', 'سمیرا (منشی)', 110, 'LOW', 'OPEN', { source: 'SYSTEM' }),
    t('تهیه گزارش مالی مهر برای حسابدار', 'MANAGER', 'مدیر کلینیک', -40, 'MEDIUM', 'DONE', { source: 'MANAGER', branchId: null }),
    t('جواب‌دهی نظرات اینستاگرام', 'RECEPTIONIST', 'سمیرا (منشی)', -10, 'LOW', 'DONE', { source: 'MANAGER' }),
    t('استریل ابزار اتاق ۲', 'RECEPTIONIST', 'پذیرش شب', 3, 'HIGH', 'DONE', { source: 'MANUAL' }),
    t('بررسی نوبت‌های بدون بیعانه ماه آینده', 'MANAGER', 'مدیر کلینیک', 96, 'MEDIUM', 'OPEN', { source: 'SYSTEM', branchId: null }),
    t('استقرار واحد جدید شعبه کرج — آموزش پرسنل', 'MANAGER', 'مدیر کلینیک', 240, 'LOW', 'OPEN', { source: 'MANUAL', branchId: brKaraj.id, desc: 'آموزش SOP پذیرش برای تیم کرج' }),
  ])

  // ---------- محصولات (هر شعبه انبار خودش) ----------
  const prodData: [string, string, number, number, number, number, string, string][] = [
    ['کامپوزیت 3M Filtek Z250', 'مصرفی ترمیمی', 2_800_000, 4_200_000, 14, 8, 'عدد', 'آریا دنت تجارت'],
    ['باندینگ سینگل باند', 'مصرفی ترمیمی', 1_900_000, 3_100_000, 4, 6, 'عدد', 'آریا دنت تجارت'],
    ['سوزن بی‌حسی ۲۷ گیج (بسته ۱۰۰)', 'مصرفی عمومی', 850_000, 1_400_000, 22, 10, 'بسته', 'پخش رازی دنت'],
    ['دستکش لاتکس (بسته ۵۰)', 'مصرفی عمومی', 180_000, 320_000, 40, 20, 'بسته', 'سینا مدیکال‌تک'],
    ['ماسک سه‌لایه (بسته ۵۰)', 'مصرفی عمومی', 95_000, 180_000, 55, 25, 'بسته', 'سینا مدیکال‌تک'],
    ['ویال بلیچینگ اوفیس', 'زیبایی', 1_200_000, 2_500_000, 9, 6, 'عدد', 'آریا دنت تجارت'],
    ['ژل فلوراید', 'پیشگیری', 750_000, 1_500_000, 3, 6, 'عدد', 'پخش رازی دنت'],
    ['کیت سفیدکننده خانگی', 'زیبایی', 900_000, 1_800_000, 12, 6, 'بسته', 'آریا دنت تجارت'],
    ['براکیت متالی ارتودنسی (ست)', 'ارتودنسی', 4_500_000, 7_800_000, 5, 3, 'ست', 'پخش رازی دنت'],
    ['سرنگ آبیاری (بسته ۲۰)', 'مصرفی عمومی', 320_000, 600_000, 30, 12, 'بسته', 'سینا مدیکال‌تک'],
  ]
  const products = []
  // توزیع بین شعب: ۰–۴ مرکزی، ۵–۷ ولیعصر، ۸–۹ کرج
  const prodBranch = [brMain, brMain, brMain, brMain, brMain, brValiasr, brValiasr, brValiasr, brKaraj, brKaraj]
  for (let i = 0; i < prodData.length; i++) {
    const [name, category, purchasePrice, salePrice, stockQty, minStock, unit, supplier] = prodData[i]
    const p = await db.product.create({ data: { branchId: prodBranch[i].id, name, category, purchasePrice, salePrice, stockQty, minStock, unit, supplier } })
    products.push(p)
  }

  // ---------- خریدها (۶ ماه اخیر) ----------
  const purchasePlan: { daysAgo: number; supplier: string; items: [number, number][] }[] = [
    { daysAgo: 165, supplier: 'آریا دنت تجارت', items: [[0, 10], [1, 6]] },
    { daysAgo: 140, supplier: 'سینا مدیکال‌تک', items: [[3, 40], [4, 50], [9, 20]] },
    { daysAgo: 118, supplier: 'پخش رازی دنت', items: [[2, 20], [6, 8]] },
    { daysAgo: 95, supplier: 'آریا دنت تجارت', items: [[0, 12], [5, 8], [7, 10]] },
    { daysAgo: 70, supplier: 'پخش رازی دنت', items: [[8, 5], [2, 20]] },
    { daysAgo: 48, supplier: 'سینا مدیکال‌تک', items: [[3, 40], [4, 50], [9, 25]] },
    { daysAgo: 26, supplier: 'آریا دنت تجارت', items: [[0, 10], [5, 10], [7, 8]] },
    { daysAgo: 9, supplier: 'پخش رازی دنت', items: [[6, 8], [2, 15], [8, 4]] },
  ]
  for (const pu of purchasePlan) {
    let total = 0
    const itemsData = pu.items.map(([idx, qty]) => {
      const unitPrice = products[idx].purchasePrice
      total += unitPrice * qty
      return { productId: products[idx].id, qty, unitPrice }
    })
    const firstBranch = prodBranch[pu.items[0][0]].id
    await db.purchase.create({ data: { branchId: firstBranch, date: addDays(now, -pu.daysAgo), supplier: pu.supplier, total, items: { create: itemsData } } })
  }

  // ---------- فروش محصولات ----------
  const saleProducts = [products[5], products[7], products[6]] // ویال بلیچینگ، کیت خانگی، ژل فلوراید
  for (let m = 11; m >= 0; m--) {
    const count = 2 + Math.floor(rnd() * 3)
    for (let i = 0; i < count; i++) {
      const prod = saleProducts[Math.floor(rnd() * saleProducts.length)]
      const qty = 1 + Math.floor(rnd() * 2)
      const day = addDays(now, -m * 30 - Math.floor(rnd() * 25))
      if (day > now) continue
      await db.productSale.create({
        data: {
          branchId: prod.branchId,
          date: day,
          patientId: pick(patients).id,
          productId: prod.id,
          qty,
          unitPrice: prod.salePrice,
          total: prod.salePrice * qty,
        },
      })
    }
  }

  // ---------- هزینه‌ها (۱۲ ماه اخیر — تقسیم بین شعب، جمع کل مثل قبل) ----------
  // پیش‌برآورد هزینه‌ی ماه جاری (شمسی) به نسبت روزهای گذشته
  const curKey = jMonthKey(now)
  const monthStart = monthKeyStart(curKey)
  const nextMonthStart = monthKeyEnd(curKey)
  const elapsedFrac = Math.min(1, (now.getTime() - monthStart.getTime()) / (nextMonthStart.getTime() - monthStart.getTime()))
  // سهم هر شعبه از هزینه‌ها: مرکزی ۵۰٪، ولیعصر ۳۰٪، کرج ۲۰٪
  const branchShare: [string, string, number][] = [
    [brMain.id, 'شعبه مرکزی', 0.5],
    [brValiasr.id, 'شعبه ولیعصر', 0.3],
    [brKaraj.id, 'شعبه کرج', 0.2],
  ]
  for (let m = 11; m >= 0; m--) {
    const dayBase = addDays(now, -m * 30 - 2)
    const growth = 1 + (11 - m) * 0.012
    const prorate = m === 0 ? elapsedFrac : 1
    const suffix = m === 0 ? ' (تا امروز)' : ''
    const rows: [string, number, string][] = [
      ['RENT', Math.round(35_000_000 * prorate), 'اجاره ملک' + suffix],
      ['SALARY', Math.round((70_000_000 + rnd() * 8_000_000) * prorate), 'حقوق و کارانه پرسنل اداری' + suffix],
      ['UTILITIES', Math.round((9_000_000 + rnd() * 4_000_000) * prorate), 'آب، برق، گاز و تلفن' + suffix],
      ['MARKETING', Math.round((8_000_000 + rnd() * 12_000_000) * prorate), 'تبلیغات اینستاگرام و گوگل' + suffix],
      ['EQUIPMENT', m % 3 === 0 ? Math.round((15_000_000 + rnd() * 20_000_000) * prorate) : 0, 'تعمیر و نگهداری تجهیزات' + suffix],
      ['OTHER', Math.round((4_000_000 + rnd() * 3_000_000) * prorate), 'هزینه‌های متفرقه' + suffix],
    ]
    for (const [category, amount, description] of rows) {
      if (amount <= 0) continue
      for (const [branchId, branchLabel, share] of branchShare) {
        const part = Math.round((amount * growth * share) / 100_000) * 100_000
        if (part <= 0) continue
        await db.expense.create({ data: { date: at(dayBase, 12), category, amount: part, description: `${description} — ${branchLabel}`, branchId } })
      }
    }
  }

  // ---------- کاربران (۴ نقش) ----------
  const pass = hashPassword('123456')
  await db.user.create({
    data: { username: 'manager', password: pass, fullName: 'رضا آریایی', role: 'ADMIN', phone: '09121110001', email: 'manager@labkhandmehr.ir', branchId: null },
  })
  await db.user.create({
    data: { username: 'reception', password: pass, fullName: 'سمیرا احمدی', role: 'RECEPTIONIST', phone: '09121110002', branchId: brMain.id },
  })
  await db.user.create({
    data: { username: 'reception2', password: pass, fullName: 'نگار مهدوی', role: 'RECEPTIONIST', phone: '09121110005', branchId: brValiasr.id },
  })
  await db.user.create({
    data: { username: 'doctor', password: pass, fullName: 'دکتر نگین موسوی', role: 'DOCTOR', phone: '09121110003', branchId: brMain.id, doctorId: drNegin.id },
  })
  await db.user.create({
    data: { username: 'patient', password: pass, fullName: 'سامان قاسمی', role: 'PATIENT', phone: '09305554433', patientId: patients[9].id },
  })

  // ---------- متا ----------
  await db.systemMeta.create({ data: { key: 'clinicName', value: 'کلینیک دندان‌پزشکی لبخند مهر' } })
  await db.systemMeta.create({ data: { key: 'branches', value: '3' } })
  await db.systemMeta.create({ data: { key: 'seededAt', value: now.toISOString() } })

  console.log(` done: ${apptCount} appointments, ${patients.length} patients, ${products.length} products, ${branches.length} branches, 5 users`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
