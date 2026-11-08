'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { StatCard, SectionHeader, Pill, LoadingBlock, EmptyState } from './bits'
import type { MonthRow, Product, Expense } from './types'
import { EXPENSE_CATEGORY_LABEL, formatToman, millionsShort } from '@/lib/format'
import { formatJDate, keyToLabel, lastNMonthKeys, faDigits } from '@/lib/jalali'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from 'recharts'
import {
  Plus, Package, Wallet, TrendingUp, AlertTriangle, FileText, Banknote, Landmark, Receipt,
  Printer, Download, ArrowLeftRight, XCircle, CalendarClock,
} from 'lucide-react'

const PIE_COLORS = ['#0284C7', '#B08D57', '#0D9488', '#EA580C', '#71757A', '#075985', '#DC2626']
import { useToast } from '@/hooks/use-toast'

const INVOICE_STATUS_FA: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'پیش‌نویس', color: 'bg-stone-100 text-stone-600 border-stone-200' },
  ISSUED: { label: 'صادرشده', color: 'bg-sky-100 text-sky-800 border-sky-200' },
  PARTIAL: { label: 'پرداخت جزئی', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  PAID: { label: 'تسویه‌شده', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  CANCELLED: { label: 'ابطال‌شده', color: 'bg-rose-100 text-rose-700 border-rose-200' },
}

const CHECK_STATUS_FA: Record<string, { label: string; color: string }> = {
  IN_HAND: { label: 'در جریان', color: 'bg-sky-100 text-sky-800 border-sky-200' },
  DEPOSITED: { label: 'خرج به بانک', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  CLEARED: { label: 'وصول‌شده', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  BOUNCED: { label: 'برگشتی', color: 'bg-rose-100 text-rose-700 border-rose-200' },
  CANCELLED: { label: 'ابطال‌شده', color: 'bg-stone-100 text-stone-600 border-stone-200' },
}

const METHOD_FA: Record<string, string> = {
  CASH: 'نقدی', CARD: 'کارت به کارت', POS: 'کارت‌خوان', ONLINE: 'درگاه', TRANSFER: 'انتقال', CHECK: 'چک',
}

const MONTH_KEYS = lastNMonthKeys(12)

type Meta = { doctors: { id: string; name: string }[]; services: { id: string; name: string; price: number; category: string }[] }
type BranchLite = { id: string; name: string }
type CashAccountUI = { id: string; name: string; type: string; bankName?: string | null; accountNo?: string | null; balance: number; opening: number }
type InvoiceUI = {
  id: string; number: number; date: string; status: string; subtotal: number; discount: number; total: number; paid: number
  patient: { firstName: string; lastName: string; phone: string } | null
  items: { id: string; title: string; qty: number; unitPrice: number; total: number; kind: string }[]
}
type PaymentUI = {
  id: string; date: string; direction: string; method: string; methodFa: string; amount: number; description: string; refType: string
  patient?: { firstName: string; lastName: string } | null
  cashAccount?: { name: string } | null
}
type CheckUI = {
  id: string; direction: string; number: string; bank: string; dueDate: string; amount: number; status: string; statusFa: string
  patient?: { firstName: string; lastName: string } | null; supplierName?: string | null; dueInDays: number; note?: string | null
}
type PayrollRowUI = {
  key: string; staffName: string; role: string; roleFa: string; baseSalary: number; commission: number; overtime: number
  bonus: number; deductions: number; total: number; saved: boolean; status?: string
}
type SupplierUI = { id: string; name: string; phone?: string | null; note?: string | null; purchaseCount: number; totalPurchased: number }

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'خطای شبکه')
  return data as T
}

// ==================================================================
// زیربخش‌ها
// ==================================================================

function ReportTab({ monthKey, branch, onReload, reloadKey = 0 }: { monthKey: string; branch: string; onReload?: () => void; reloadKey?: number }) {
  const [data, setData] = useState<{
    pnl: { revenueServices: number; revenueProducts: number; revenue: number; cogs: number; commission: number; operationalExpenses: number; totalExpenses: number; netProfit: number; margin: number }
    expenseRows: { label: string; amount: number }[]
    topServices: { name: string; value: number; count: number }[]
    doctors: { name: string; revenue: number; commission: number }[]
    series: MonthRow[]
    accounting: { totalCash: number; checksReceivedPending: number; checksIssuedPending: number; openInvoices: number; openInvoicesAmount: number }
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    jsonFetch<typeof data>(`/api/finance?month=${monthKey}${branch ? `&branch=${branch}` : ''}`)
      .then((d) => { if (alive) setData(d) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [monthKey, branch, reloadKey])

  if (loading || !data) return <LoadingBlock rows={5} />
  const { pnl, accounting } = data
  void onReload

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="درآمد کل ماه" value={formatToman(pnl.revenue)} tone="purple" icon={<TrendingUp className="h-5 w-5" />} hint={`خدمات ${formatToman(pnl.revenueServices)} + کالا ${formatToman(pnl.revenueProducts)}`} />
        <StatCard title="هزینه‌های کل" value={formatToman(pnl.totalExpenses)} tone="gold" icon={<Wallet className="h-5 w-5" />} hint={`کارانه ${formatToman(pnl.commission)}`} />
        <StatCard title="سود خالص" value={formatToman(pnl.netProfit)} tone="green" icon={<Banknote className="h-5 w-5" />} hint={`حاشیه ${faDigits(pnl.margin.toFixed(0))}٪`} />
        <StatCard title="موجودی صندوق و بانک" value={formatToman(accounting.totalCash)} icon={<Landmark className="h-5 w-5" />} hint={`فاکتور بازی: ${formatToman(accounting.openInvoicesAmount)}`} />
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <Card className="rounded-2xl border"><CardContent className="p-4 flex items-center justify-between"><div><div className="text-xs text-muted-foreground">چک‌های دریافتی در جریان</div><div className="font-bold mt-1">{formatToman(accounting.checksReceivedPending)}</div></div><Receipt className="h-8 w-8 text-sky-500" /></CardContent></Card>
        <Card className="rounded-2xl border"><CardContent className="p-4 flex items-center justify-between"><div><div className="text-xs text-muted-foreground">چک‌های صادره در جریان</div><div className="font-bold mt-1">{formatToman(accounting.checksIssuedPending)}</div></div><CalendarClock className="h-8 w-8 text-amber-500" /></CardContent></Card>
        <Card className="rounded-2xl border"><CardContent className="p-4 flex items-center justify-between"><div><div className="text-xs text-muted-foreground">فاکتورهای تسویه‌نشده</div><div className="font-bold mt-1">{faDigits(accounting.openInvoices)} فاکتور · {formatToman(accounting.openInvoicesAmount)}</div></div><FileText className="h-8 w-8 text-rose-500" /></CardContent></Card>
      </div>

      <Card className="rounded-2xl border">
        <CardContent className="p-4 md:p-6">
          <h3 className="font-bold mb-4">روند ۱۲ ماه اخیر (درآمد، هزینه و سود خالص)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={data.series}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={millionsShort} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => formatToman(v)} />
              <Legend />
              <Bar dataKey="revenue" name="درآمد" fill="#0284C7" radius={[6, 6, 0, 0]} />
              <Bar dataKey="totalExpenses" name="هزینه" fill="#B08D57" radius={[6, 6, 0, 0]} />
              <Line dataKey="netProfit" name="سود خالص" stroke="#0D9488" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="rounded-2xl border">
          <CardContent className="p-4">
            <h3 className="font-bold mb-3">ترکیب هزینه‌های ماه</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={data.expenseRows} dataKey="amount" nameKey="label" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {data.expenseRows.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatToman(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border">
          <CardContent className="p-4">
            <h3 className="font-bold mb-3">کارنامه پزشکان این ماه</h3>
            <div className="space-y-2.5">
              {data.doctors.length === 0 && <EmptyState text="ویزیت انجام‌شده‌ای در این ماه ثبت نشده است" />}
              {data.doctors.map((d) => (
                <div key={d.name} className="flex items-center justify-between rounded-xl border px-3 py-2.5">
                  <span className="text-sm font-medium">{d.name}</span>
                  <span className="text-xs text-muted-foreground">
                    درآمد <span className="font-bold text-foreground">{formatToman(d.revenue)}</span> · کارانه {formatToman(d.commission)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------- فاکتورها ----------

function InvoicesTab({ meta, branches, toast }: { meta: Meta | null; branches: BranchLite[]; toast: ReturnType<typeof useToast>['toast'] }) {
  const [monthKey, setMonthKey] = useState(lastNMonthKeys(1)[0])
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [items, setItems] = useState<InvoiceUI[]>([])
  const [stats, setStats] = useState<{ count: number; total: number; paidSum: number; remaining: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [payTarget, setPayTarget] = useState<InvoiceUI | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    jsonFetch<{ items: InvoiceUI[]; stats: { count: number; total: number; paidSum: number; remaining: number } }>(
      `/api/invoices?month=${monthKey}&status=${status}&q=${encodeURIComponent(q)}`,
    ).then((d) => { setItems(d.items); setStats(d.stats) }).finally(() => setLoading(false))
  }, [monthKey, status, q])

  useEffect(() => { load() }, [load, reload])

  async function payInvoice(inv: InvoiceUI, method: string, cashAccountId: string, amount?: number) {
    try {
      await jsonFetch(`/api/invoices/${inv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pay', method, cashAccountId: cashAccountId || undefined, amount }),
      })
      toast({ title: 'پرداخت ثبت شد ✓', description: `فاکتور ${faDigits(inv.number)} تسویه/به‌روزرسانی شد` })
      setPayTarget(null)
      setReload((x) => x + 1)
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'ثبت پرداخت ناموفق بود', variant: 'destructive' })
    }
  }

  function printInvoice(inv: InvoiceUI) {
    const w = window.open('', '_blank', 'width=720,height=900')
    if (!w) return
    const rows = inv.items.map((it) => `<tr><td>${it.title}</td><td>${faDigits(it.qty)}</td><td>${faDigits(new Intl.NumberFormat('en-US').format(it.unitPrice))}</td><td>${faDigits(new Intl.NumberFormat('en-US').format(it.total))}</td></tr>`).join('')
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>فاکتور ${faDigits(inv.number)}</title>
    <style>body{font-family:Vazirmatn,Tahoma,sans-serif;padding:32px;color:#111}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border:1px solid #ddd;padding:8px;font-size:13px;text-align:right}th{background:#f1f5f9}.muted{color:#666;font-size:12px}.total{font-weight:bold;font-size:15px}</style></head><body>
    <h1>فاکتور شماره ${faDigits(inv.number)} — کلینیک لبخند مهر (10on)</h1>
    <div class="muted">تاریخ: ${formatJDate(new Date(inv.date))} ${inv.patient ? `— بیمار: ${inv.patient.firstName} ${inv.patient.lastName} (${inv.patient.phone})` : ''}</div>
    <table><thead><tr><th>شرح</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted">جمع: ${faDigits(new Intl.NumberFormat('en-US').format(inv.subtotal))} تومان ${inv.discount ? `— تخفیف: ${faDigits(new Intl.NumberFormat('en-US').format(inv.discount))}` : ''}</p>
    <p class="total">قابل پرداخت: ${faDigits(new Intl.NumberFormat('en-US').format(inv.total))} تومان</p>
    <p class="muted">سامانه مدیریت هوشمند 10on · لبخند شما، سرمایه ماست</p></body></html>`)
    w.document.close()
    w.print()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={monthKey} onValueChange={setMonthKey}>
          <SelectTrigger className="w-40 rounded-xl text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTH_KEYS.map((k) => <SelectItem key={k} value={k}>{keyToLabel(k)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-36 rounded-xl text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه وضعیت‌ها</SelectItem>
            {Object.entries(INVOICE_STATUS_FA).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="جست‌وجوی بیمار یا شماره…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56 rounded-xl text-sm" />
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button className="rounded-xl"><Plus className="h-4 w-4" /> صدور فاکتور</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>صدور فاکتور جدید</DialogTitle></DialogHeader>
            <InvoiceCreateForm meta={meta} branches={branches} onDone={() => { setCreateOpen(false); setReload((x) => x + 1) }} toast={toast} />
          </DialogContent>
        </Dialog>
        <a href={`/api/finance/export?type=invoices&month=${monthKey}`} download className="text-sm inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 hover:bg-muted">
          <Download className="h-4 w-4" /> CSV
        </a>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard title="تعداد فاکتور" value={faDigits(stats.count)} />
          <StatCard title="جمع فاکتورها" value={formatToman(stats.total)} />
          <StatCard title="تسویه‌شده" value={formatToman(stats.paidSum)} tone="green" />
          <StatCard title="مانده" value={formatToman(stats.remaining)} tone="red" />
        </div>
      )}

      {loading ? <LoadingBlock rows={4} /> : items.length === 0 ? <EmptyState text="فاکتوری برای این ماه پیدا نشد" /> : (
        <div className="space-y-2.5">
          {items.map((inv) => {
            const st = INVOICE_STATUS_FA[inv.status] ?? INVOICE_STATUS_FA.ISSUED
            return (
              <Card key={inv.id} className="rounded-2xl border">
                <CardContent className="p-4 flex flex-wrap items-center gap-3 justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">فاکتور {faDigits(inv.number)}</span>
                      <Pill label={st.label} color={st.color} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatJDate(new Date(inv.date))} · {inv.patient ? `${inv.patient.firstName} ${inv.patient.lastName}` : 'بدون بیمار'}
                      {' · '}{faDigits(inv.items.length)} قلم
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-left">
                      <div className="text-sm font-bold">{formatToman(inv.total)}</div>
                      {inv.paid < inv.total && inv.status !== 'CANCELLED' && <div className="text-[11px] text-amber-700">مانده {formatToman(inv.total - inv.paid)}</div>}
                    </div>
                    {inv.status !== 'CANCELLED' && inv.paid < inv.total && (
                      <Button size="sm" className="rounded-xl" onClick={() => setPayTarget(inv)}><Banknote className="h-4 w-4" /> ثبت پرداخت</Button>
                    )}
                    <Button size="sm" variant="outline" className="rounded-xl" onClick={() => printInvoice(inv)}><Printer className="h-4 w-4" /> چاپ</Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <PayInvoiceDialog invoice={payTarget} onClose={() => setPayTarget(null)} onSubmit={payInvoice} />
    </div>
  )
}

function InvoiceCreateForm({ meta, branches, onDone, toast }: { meta: Meta | null; branches: BranchLite[]; onDone: () => void; toast: ReturnType<typeof useToast>['toast'] }) {
  const [patientId, setPatientId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [discount, setDiscount] = useState(0)
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<{ kind: string; refId: string; title: string; qty: number; unitPrice: number }[]>([
    { kind: 'SERVICE', refId: '', title: '', qty: 1, unitPrice: 0 },
  ])
  const [busy, setBusy] = useState(false)
  const subtotal = rows.reduce((s, r) => s + r.qty * r.unitPrice, 0)
  const total = Math.max(0, subtotal - discount)

  function pickService(index: number, refId: string) {
    const svc = meta?.services.find((s) => s.id === refId)
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, refId, title: svc?.name ?? r.title, unitPrice: svc?.price ?? r.unitPrice, kind: 'SERVICE' } : r)))
  }
  function pickProduct(index: number, refId: string, products: Product[]) {
    const p = products.find((x) => x.id === refId)
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, refId, title: p?.name ?? r.title, unitPrice: p?.salePrice ?? r.unitPrice, kind: 'PRODUCT' } : r)))
  }

  const [products, setProducts] = useState<Product[]>([])
  useEffect(() => { jsonFetch<{ products: Product[] }>('/api/inventory').then((d) => setProducts(d.products)).catch(() => {}) }, [])

  async function submit() {
    const valid = rows.filter((r) => r.title.trim() && r.unitPrice >= 0 && r.qty > 0)
    if (!valid.length) { toast({ title: 'خطا', description: 'حداقل یک ردیف معتبر لازم است', variant: 'destructive' }); return }
    setBusy(true)
    try {
      await jsonFetch('/api/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: patientId || undefined, branchId: branchId || undefined, discount, note, items: valid.map((r) => ({ kind: r.kind, refId: r.refId || undefined, title: r.title, qty: r.qty, unitPrice: r.unitPrice })) }),
      })
      toast({ title: 'فاکتور صادر شد ✓' })
      onDone()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'صدور ناموفق بود', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        <div><Label>بیمار (اختیاری)</Label><PatientSelect value={patientId} onChange={setPatientId} /></div>
        <div><Label>شعبه</Label>
          <Select value={branchId || 'none'} onValueChange={(v) => setBranchId(v === 'none' ? '' : v)}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">بدون شعبه</SelectItem>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>اقلام فاکتور</Label>
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap gap-2 items-center rounded-xl border p-2.5">
            <Select value={r.kind} onValueChange={(v) => setRows((rs) => rs.map((x, xi) => (xi === i ? { ...x, kind: v, refId: '', title: '' } : x)))}>
              <SelectTrigger className="w-28 rounded-lg text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SERVICE">خدمت</SelectItem>
                <SelectItem value="PRODUCT">محصول</SelectItem>
                <SelectItem value="CUSTOM">سفارشی</SelectItem>
              </SelectContent>
            </Select>
            {r.kind === 'SERVICE' ? (
              <Select value={r.refId || 'none'} onValueChange={(v) => pickService(i, v)}>
                <SelectTrigger className="flex-1 min-w-40 rounded-lg text-xs"><SelectValue placeholder="انتخاب خدمت" /></SelectTrigger>
                <SelectContent><SelectItem value="none">— انتخاب کنید —</SelectItem>{meta?.services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({formatToman(s.price)})</SelectItem>)}</SelectContent>
              </Select>
            ) : r.kind === 'PRODUCT' ? (
              <Select value={r.refId || 'none'} onValueChange={(v) => pickProduct(i, v, products)}>
                <SelectTrigger className="flex-1 min-w-40 rounded-lg text-xs"><SelectValue placeholder="انتخاب محصول" /></SelectTrigger>
                <SelectContent><SelectItem value="none">— انتخاب کنید —</SelectItem>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({formatToman(p.salePrice)})</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <Input placeholder="عنوان سفارشی" value={r.title} onChange={(e) => setRows((rs) => rs.map((x, xi) => (xi === i ? { ...x, title: e.target.value } : x)))} className="flex-1 rounded-lg text-xs" />
            )}
            <Input type="number" min={1} value={r.qty} onChange={(e) => setRows((rs) => rs.map((x, xi) => (xi === i ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)))} className="w-16 rounded-lg text-xs" title="تعداد" />
            <Input type="number" min={0} value={r.unitPrice} onChange={(e) => setRows((rs) => rs.map((x, xi) => (xi === i ? { ...x, unitPrice: Math.max(0, Number(e.target.value) || 0) } : x)))} className="w-28 rounded-lg text-xs" title="قیمت واحد" />
            <span className="text-xs text-muted-foreground w-24">{formatToman(r.qty * r.unitPrice)}</span>
            {rows.length > 1 && <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => setRows((rs) => rs.filter((_, xi) => xi !== i))}><XCircle className="h-4 w-4" /></Button>}
          </div>
        ))}
        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setRows((rs) => [...rs, { kind: 'SERVICE', refId: '', title: '', qty: 1, unitPrice: 0 }])}><Plus className="h-4 w-4" /> افزودن ردیف</Button>
      </div>
      <div className="grid md:grid-cols-3 gap-3 items-end">
        <div><Label>تخفیف (تومان)</Label><Input type="number" min={0} value={discount} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))} className="rounded-xl" /></div>
        <div className="text-sm"><span className="text-muted-foreground">جمع کل: </span><span className="font-bold">{formatToman(total)}</span></div>
        <div><Label>یادداشت</Label><Input value={note} onChange={(e) => setNote(e.target.value)} className="rounded-xl" placeholder="اختیاری" /></div>
      </div>
      <Button className="w-full rounded-xl" onClick={submit} disabled={busy}>{busy ? 'در حال ثبت…' : 'صدور فاکتور'}</Button>
    </div>
  )
}

function PatientSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [patients, setPatients] = useState<{ id: string; firstName: string; lastName: string; phone: string }[]>([])
  const [q, setQ] = useState('')
  useEffect(() => {
    const t = setTimeout(() => {
      jsonFetch<{ patients: { id: string; firstName: string; lastName: string; phone: string }[] }>(`/api/patients?q=${encodeURIComponent(q)}`)
        .then((d) => setPatients(d.patients ?? (d as unknown as { patients: never[] }).patients)).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [q])
  // patients API شکل متفاوتی دارد؛ امن‌ترین: fetch با فیلتر
  useEffect(() => {
    jsonFetch<unknown>('/api/patients').then((d) => {
      const arr = (d as { patients?: unknown[] }).patients ?? (d as { items?: unknown[] }).items ?? []
      setPatients(arr as { id: string; firstName: string; lastName: string; phone: string }[])
    }).catch(() => {})
  }, [])
  void patients
  return (
    <div>
      <Input placeholder="نام یا شماره بیمار…" value={q} onChange={(e) => setQ(e.target.value)} className="rounded-xl text-sm" />
      <PatientPickList q={q} value={value} onChange={onChange} />
    </div>
  )
}

function PatientPickList({ q, value, onChange }: { q: string; value: string; onChange: (v: string) => void }) {
  const [list, setList] = useState<{ id: string; firstName: string; lastName: string; phone: string }[]>([])
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      fetch(`/api/patients?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((d: unknown) => {
        if (!alive) return
        const arr = ((d as { patients?: unknown }).patients ?? (d as { items?: unknown }).items ?? (d as unknown as unknown[])) as { id: string; firstName: string; lastName: string; phone: string }[]
        setList(Array.isArray(arr) ? arr.slice(0, 8) : [])
      }).catch(() => {})
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [q])
  if (!list.length) return null
  return (
    <div className="mt-2 rounded-xl border max-h-40 overflow-y-auto divide-y">
      {list.map((p) => (
        <button key={p.id} type="button" onClick={() => { onChange(p.id); }} className={`w-full text-right px-3 py-2 text-xs hover:bg-muted ${value === p.id ? 'bg-sky-50 font-bold' : ''}`}>
          {p.firstName} {p.lastName} — {faDigits(p.phone)}
          {value === p.id ? ' ✓' : ''}
        </button>
      ))}
    </div>
  )
}

function PayInvoiceDialog({ invoice, onClose, onSubmit }: { invoice: InvoiceUI | null; onClose: () => void; onSubmit: (inv: InvoiceUI, method: string, cashAccountId: string, amount?: number) => Promise<void> }) {
  const [method, setMethod] = useState('CASH')
  const [cashAccountId, setCashAccountId] = useState('')
  const [amount, setAmount] = useState<number | ''>('')
  const [accounts, setAccounts] = useState<CashAccountUI[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (invoice) {
      setMethod('CASH'); setAmount(''); setCashAccountId('')
      jsonFetch<{ accounts: CashAccountUI[] }>('/api/cash').then((d) => setAccounts(d.accounts)).catch(() => {})
    }
  }, [invoice])

  if (!invoice) return null
  const remaining = invoice.total - invoice.paid

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>ثبت پرداخت — فاکتور {faDigits(invoice.number)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-xl bg-muted/60 p-3 text-sm flex justify-between"><span>مانده</span><span className="font-bold">{formatToman(remaining)}</span></div>
          <div><Label>روش پرداخت</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(METHOD_FA).filter(([k]) => k !== 'TRANSFER').map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>واریز به حساب</Label>
            <Select value={cashAccountId || 'none'} onValueChange={(v) => setCashAccountId(v === 'none' ? '' : v)}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">بدون ثبت در صندوق</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} ({formatToman(a.balance)})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>مبلغ (خالی = تسویه کامل {formatToman(remaining)})</Label>
            <Input type="number" min={1} max={remaining} value={amount} onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))} className="rounded-xl" placeholder={String(remaining)} />
          </div>
          <Button className="w-full rounded-xl" disabled={busy} onClick={async () => { setBusy(true); await onSubmit(invoice, method, cashAccountId, amount === '' ? undefined : amount); setBusy(false) }}>
            {busy ? 'در حال ثبت…' : 'ثبت پرداخت'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------- دفتر روزنه ----------

function LedgerTab({ toast }: { toast: ReturnType<typeof useToast>['toast'] }) {
  const [monthKey, setMonthKey] = useState(lastNMonthKeys(1)[0])
  const [direction, setDirection] = useState('')
  const [items, setItems] = useState<PaymentUI[]>([])
  const [stats, setStats] = useState<{ inSum: number; outSum: number; count: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    jsonFetch<{ items: PaymentUI[]; stats: { inSum: number; outSum: number; count: number } }>(`/api/payments?month=${monthKey}&direction=${direction}`)
      .then((d) => { setItems(d.items); setStats(d.stats) }).finally(() => setLoading(false))
  }, [monthKey, direction])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={monthKey} onValueChange={setMonthKey}>
          <SelectTrigger className="w-40 rounded-xl text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTH_KEYS.map((k) => <SelectItem key={k} value={k}>{keyToLabel(k)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={direction || 'all'} onValueChange={(v) => setDirection(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-36 rounded-xl text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">دریافت و پرداخت</SelectItem>
            <SelectItem value="IN">فقط دریافت</SelectItem>
            <SelectItem value="OUT">فقط پرداخت</SelectItem>
          </SelectContent>
        </Select>
        <Button className="rounded-xl" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> ثبت دستی</Button>
        <a href={`/api/finance/export?type=ledger&month=${monthKey}`} download className="text-sm inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 hover:bg-muted"><Download className="h-4 w-4" /> CSV</a>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard title="جمع دریافت‌ها" value={formatToman(stats.inSum)} tone="green" />
          <StatCard title="جمع پرداخت‌ها" value={formatToman(stats.outSum)} tone="gold" />
          <StatCard title="تراکنش‌ها" value={faDigits(stats.count)} />
        </div>
      )}

      {loading ? <LoadingBlock rows={5} /> : items.length === 0 ? <EmptyState text="تراکنشی ثبت نشده است" /> : (
        <div className="rounded-2xl border divide-y">
          {items.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-3 gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${p.direction === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                  {p.direction === 'IN' ? <TrendingUp className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{p.description}</div>
                  <div className="text-[11px] text-muted-foreground">{formatJDate(new Date(p.date))} · {p.methodFa}{p.patient ? ` · ${p.patient.firstName} ${p.patient.lastName}` : ''}{p.cashAccount ? ` · ${p.cashAccount.name}` : ''}</div>
                </div>
              </div>
              <span className={`text-sm font-bold ${p.direction === 'IN' ? 'text-emerald-600' : 'text-rose-600'}`}>
                {p.direction === 'IN' ? '+' : '−'}{formatToman(p.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>ثبت دستی دریافت/پرداخت</DialogTitle></DialogHeader>
          <ManualPaymentForm onDone={() => { setAddOpen(false); load() }} toast={toast} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ManualPaymentForm({ onDone, toast }: { onDone: () => void; toast: ReturnType<typeof useToast>['toast'] }) {
  const [direction, setDirection] = useState('IN')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('CASH')
  const [description, setDescription] = useState('')
  const [cashAccountId, setCashAccountId] = useState('')
  const [accounts, setAccounts] = useState<CashAccountUI[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => { jsonFetch<{ accounts: CashAccountUI[] }>('/api/cash').then((d) => setAccounts(d.accounts)).catch(() => {}) }, [])

  async function submit() {
    if (!description.trim() || !amount) { toast({ title: 'خطا', description: 'شرح و مبلغ الزامی است', variant: 'destructive' }); return }
    setBusy(true)
    try {
      await jsonFetch('/api/payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction, amount: Number(amount), method, description, cashAccountId: cashAccountId || undefined }),
      })
      toast({ title: 'ثبت شد ✓' })
      onDone()
    } catch (e) { toast({ title: 'خطا', description: e instanceof Error ? e.message : 'خطا', variant: 'destructive' }) }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>نوع</Label>
          <Select value={direction} onValueChange={setDirection}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="IN">دریافت (ورود پول)</SelectItem><SelectItem value="OUT">پرداخت (خروج پول)</SelectItem></SelectContent></Select>
        </div>
        <div><Label>مبلغ (تومان)</Label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-xl" /></div>
        <div><Label>روش</Label>
          <Select value={method} onValueChange={setMethod}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(METHOD_FA).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
        </div>
        <div><Label>حساب</Label>
          <Select value={cashAccountId || 'none'} onValueChange={(v) => setCashAccountId(v === 'none' ? '' : v)}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">بدون حساب</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
        </div>
      </div>
      <div><Label>شرح</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-xl" placeholder="مثلاً اجاره آبان" /></div>
      <Button className="w-full rounded-xl" onClick={submit} disabled={busy}>{busy ? '…' : 'ثبت'}</Button>
    </div>
  )
}

// ---------- صندوق و بانک ----------

function CashTab({ toast }: { toast: ReturnType<typeof useToast>['toast'] }) {
  const [accounts, setAccounts] = useState<CashAccountUI[]>([])
  const [total, setTotal] = useState(0)
  const [recent, setRecent] = useState<PaymentUI[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    jsonFetch<{ accounts: CashAccountUI[]; totalBalance: number; recent: PaymentUI[] }>('/api/cash')
      .then((d) => { setAccounts(d.accounts); setTotal(d.totalBalance); setRecent(d.recent) }).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="grid grid-cols-2 gap-3 flex-1 min-w-0">
          <StatCard title="جمع موجودی" value={formatToman(total)} tone="purple" icon={<Landmark className="h-5 w-5" />} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> حساب جدید</Button>
          <Button className="rounded-xl" onClick={() => setTransferOpen(true)}><ArrowLeftRight className="h-4 w-4" /> انتقال بین حساب</Button>
        </div>
      </div>

      {loading ? <LoadingBlock rows={3} /> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
          {accounts.map((a) => (
            <Card key={a.id} className="rounded-2xl border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{a.name}</span>
                  <Pill label={a.type === 'BANK' ? 'بانک' : 'صندوق'} color={a.type === 'BANK' ? 'bg-sky-100 text-sky-800 border-sky-200' : 'bg-amber-100 text-amber-800 border-amber-200'} />
                </div>
                {a.bankName && <div className="text-[11px] text-muted-foreground mt-0.5">{a.bankName} {a.accountNo ? `· ${faDigits(a.accountNo)}` : ''}</div>}
                <div className={`mt-2 text-lg font-extrabold ${a.balance < 0 ? 'text-red-600' : 'text-foreground'}`}>{formatToman(a.balance)}</div>
                <div className="text-[11px] text-muted-foreground">موجودی افتتاحیه: {formatToman(a.opening)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="rounded-2xl border">
        <CardContent className="p-4">
          <h3 className="font-bold mb-3">آخرین تراکنش‌های حساب‌ها</h3>
          <div className="divide-y rounded-xl border">
            {recent.length === 0 && <EmptyState text="تراکنشی نیست" />}
            {recent.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                <div className="min-w-0"><div className="truncate">{p.description}</div><div className="text-[11px] text-muted-foreground">{formatJDate(new Date(p.date))} {p.cashAccount ? `· ${p.cashAccount.name}` : ''}</div></div>
                <span className={`font-bold ${p.direction === 'IN' ? 'text-emerald-600' : 'text-rose-600'}`}>{p.direction === 'IN' ? '+' : '−'}{formatToman(p.amount)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>حساب جدید</DialogTitle></DialogHeader>
          <CashAccountForm onDone={() => { setCreateOpen(false); load() }} toast={toast} />
        </DialogContent>
      </Dialog>
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>انتقال بین حساب‌ها</DialogTitle></DialogHeader>
          <TransferForm accounts={accounts} onDone={() => { setTransferOpen(false); load() }} toast={toast} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CashAccountForm({ onDone, toast }: { onDone: () => void; toast: ReturnType<typeof useToast>['toast'] }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('CASH')
  const [bankName, setBankName] = useState('')
  const [openingBalance, setOpeningBalance] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (!name.trim()) { toast({ title: 'خطا', description: 'نام حساب لازم است', variant: 'destructive' }); return }
    setBusy(true)
    try {
      await jsonFetch('/api/cash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, type, bankName: bankName || undefined, openingBalance: Number(openingBalance) || 0 }) })
      toast({ title: 'حساب اضافه شد ✓' })
      onDone()
    } catch (e) { toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' }) }
    finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <div><Label>نام</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl" placeholder="صندوق شعبه کرج" /></div>
      <div><Label>نوع</Label>
        <Select value={type} onValueChange={setType}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CASH">صندوق نقدی</SelectItem><SelectItem value="BANK">حساب بانکی</SelectItem></SelectContent></Select>
      </div>
      {type === 'BANK' && <div><Label>نام بانک</Label><Input value={bankName} onChange={(e) => setBankName(e.target.value)} className="rounded-xl" /></div>}
      <div><Label>موجودی افتتاحیه</Label><Input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} className="rounded-xl" /></div>
      <Button className="w-full rounded-xl" onClick={submit} disabled={busy}>ثبت حساب</Button>
    </div>
  )
}

function TransferForm({ accounts, onDone, toast }: { accounts: CashAccountUI[]; onDone: () => void; toast: ReturnType<typeof useToast>['toast'] }) {
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (!fromId || !toId || !amount) { toast({ title: 'خطا', description: 'حساب‌ها و مبلغ را کامل کنید', variant: 'destructive' }); return }
    setBusy(true)
    try {
      await jsonFetch('/api/cash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'transfer', fromId, toId, amount: Number(amount) }) })
      toast({ title: 'انتقال انجام شد ✓' })
      onDone()
    } catch (e) { toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' }) }
    finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <div><Label>از حساب</Label>
        <Select value={fromId || 'none'} onValueChange={(v) => setFromId(v === 'none' ? '' : v)}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">— انتخاب —</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
      </div>
      <div><Label>به حساب</Label>
        <Select value={toId || 'none'} onValueChange={(v) => setToId(v === 'none' ? '' : v)}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">— انتخاب —</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
      </div>
      <div><Label>مبلغ (تومان)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-xl" /></div>
      <Button className="w-full rounded-xl" onClick={submit} disabled={busy}>انتقال</Button>
    </div>
  )
}

// ---------- چک‌ها ----------

function ChecksTab({ toast }: { toast: ReturnType<typeof useToast>['toast'] }) {
  const [items, setItems] = useState<CheckUI[]>([])
  const [stats, setStats] = useState<{ receivedPending: number; issuedPending: number; bounced: number; dueSoon: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    jsonFetch<{ items: CheckUI[]; stats: { receivedPending: number; issuedPending: number; bounced: number; dueSoon: number } }>('/api/checks')
      .then((d) => { setItems(d.items); setStats(d.stats) }).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  async function setStatus(id: string, action: string) {
    try {
      await jsonFetch(`/api/checks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: action }) })
      toast({ title: 'وضعیت چک به‌روزرسانی شد ✓' })
      load()
    } catch (e) { toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' }) }
  }

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard title="چک دریافتی در جریان" value={formatToman(stats.receivedPending)} tone="green" />
          <StatCard title="چک صادره در جریان" value={formatToman(stats.issuedPending)} tone="gold" />
          <StatCard title="سررسید ≤ هفت روز" value={faDigits(stats.dueSoon)} tone="red" hint="نیازمند پیگیری" />
          <StatCard title="برگشتی" value={faDigits(stats.bounced)} />
        </div>
      )}
      <div className="flex justify-end">
        <Button className="rounded-xl" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> ثبت چک</Button>
      </div>

      {loading ? <LoadingBlock rows={4} /> : items.length === 0 ? <EmptyState text="چکی ثبت نشده است" /> : (
        <div className="space-y-2.5">
          {items.map((c) => {
            const st = CHECK_STATUS_FA[c.status] ?? CHECK_STATUS_FA.IN_HAND
            const urgent = (c.status === 'IN_HAND' || c.status === 'DEPOSITED') && c.dueInDays <= 7
            return (
              <Card key={c.id} className={`rounded-2xl border ${urgent ? 'border-amber-300 bg-amber-50/40' : ''}`}>
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Pill label={c.direction === 'RECEIVED' ? 'دریافتی' : 'صادره'} color={c.direction === 'RECEIVED' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-rose-100 text-rose-700 border-rose-200'} />
                      <Pill label={st.label} color={st.color} />
                      {urgent && <Pill label={`سررسید ${faDigits(Math.max(0, c.dueInDays))} روز`} color="bg-amber-100 text-amber-900 border-amber-300" />}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      چک {faDigits(c.number)} — {c.bank} · سررسید {formatJDate(new Date(c.dueDate))}
                      {c.patient ? ` · ${c.patient.firstName} ${c.patient.lastName}` : ''}{c.supplierName ? ` · ${c.supplierName}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold">{formatToman(c.amount)}</span>
                    {(c.status === 'IN_HAND' || c.status === 'DEPOSITED') && (
                      <>
                        <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setStatus(c.id, c.status === 'IN_HAND' ? 'deposit' : 'clear')}>
                          {c.status === 'IN_HAND' ? 'خرج به بانک' : 'ثبت وصول'}
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-lg text-red-600" onClick={() => setStatus(c.id, 'bounce')}>برگشت</Button>
                      </>
                    )}
                    {c.status === 'BOUNCED' && <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setStatus(c.id, 'cancel')}>ابطال</Button>}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>ثبت چک جدید</DialogTitle></DialogHeader>
          <CheckForm onDone={() => { setCreateOpen(false); load() }} toast={toast} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CheckForm({ onDone, toast }: { onDone: () => void; toast: ReturnType<typeof useToast>['toast'] }) {
  const [direction, setDirection] = useState('RECEIVED')
  const [number, setNumber] = useState('')
  const [bank, setBank] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [amount, setAmount] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [patientId, setPatientId] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (!number.trim() || !bank.trim() || !dueDate || !amount) { toast({ title: 'خطا', description: 'همه فیلدها لازم است', variant: 'destructive' }); return }
    setBusy(true)
    try {
      await jsonFetch('/api/checks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction, number, bank, dueDate, amount: Number(amount), supplierName: direction === 'ISSUED' ? supplierName : undefined, patientId: direction === 'RECEIVED' && patientId ? patientId : undefined }),
      })
      toast({ title: 'چک ثبت شد ✓' })
      onDone()
    } catch (e) { toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' }) }
    finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <div><Label>نوع</Label>
        <Select value={direction} onValueChange={setDirection}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="RECEIVED">چک دریافتی (از بیمار)</SelectItem><SelectItem value="ISSUED">چک صادره (به تامین‌کننده)</SelectItem></SelectContent></Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>شماره چک</Label><Input value={number} onChange={(e) => setNumber(e.target.value)} className="rounded-xl" /></div>
        <div><Label>بانک</Label><Input value={bank} onChange={(e) => setBank(e.target.value)} className="rounded-xl" /></div>
        <div><Label>سررسید</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-xl" /></div>
        <div><Label>مبلغ</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-xl" /></div>
      </div>
      {direction === 'ISSUED' ? (
        <div><Label>طرف حساب (تامین‌کننده)</Label><Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="rounded-xl" /></div>
      ) : (
        <div><Label>بیمار (اختیاری)</Label><PatientPickList q="" value={patientId} onChange={setPatientId} /><Input placeholder="جست‌وجوی بیمار با تایپ در لیست بالا" disabled className="rounded-xl text-[11px] text-muted-foreground" /></div>
      )}
      <Button className="w-full rounded-xl" onClick={submit} disabled={busy}>ثبت چک</Button>
    </div>
  )
}

// ---------- حقوق و کارانه ----------

function PayrollTab({ toast }: { toast: ReturnType<typeof useToast>['toast'] }) {
  const [monthKey, setMonthKey] = useState(lastNMonthKeys(1)[0])
  const [rows, setRows] = useState<PayrollRowUI[]>([])
  const [totalDue, setTotalDue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<PayrollRowUI | null>(null)
  const [paying, setPaying] = useState<PayrollRowUI | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    jsonFetch<{ month: string; rows: PayrollRowUI[]; totalDue: number }>(`/api/payroll?month=${monthKey}`)
      .then((d) => { setRows(d.rows); setTotalDue(d.totalDue) }).finally(() => setLoading(false))
  }, [monthKey])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Select value={monthKey} onValueChange={setMonthKey}>
            <SelectTrigger className="w-40 rounded-xl text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTH_KEYS.map((k) => <SelectItem key={k} value={k}>{keyToLabel(k)}</SelectItem>)}</SelectContent>
          </Select>
          <StatCard title="جمع پرداختنی این ماه" value={formatToman(totalDue)} tone="gold" />
        </div>
      </div>

      {loading ? <LoadingBlock rows={4} /> : rows.length === 0 ? <EmptyState text="پرسنلی برای این ماه یافت نشد" /> : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <Card key={r.key} className="rounded-2xl border">
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{r.staffName}</span>
                    <Pill label={r.roleFa} color="bg-sky-100 text-sky-800 border-sky-200" />
                    {r.saved && r.status === 'PAID' ? <Pill label="پرداخت‌شده" color="bg-emerald-100 text-emerald-800 border-emerald-200" /> : r.saved ? <Pill label="ثبت‌شده (پرداخت‌نشده)" color="bg-amber-100 text-amber-800 border-amber-200" /> : <Pill label="پیش‌نویس" color="bg-stone-100 text-stone-600 border-stone-200" />}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {r.role === 'DOCTOR'
                      ? `کارانه ${formatToman(r.commission)}`
                      : `حقوق پایه ${formatToman(r.baseSalary)}${r.overtime ? ` + اضافه‌کار ${formatToman(r.overtime)}` : ''}${r.bonus ? ` + پاداش ${formatToman(r.bonus)}` : ''}${r.deductions ? ` − کسورات ${formatToman(r.deductions)}` : ''}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{formatToman(r.total)}</span>
                  {r.status !== 'PAID' && (
                    <>
                      <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setEditing(r)}>ویرایش</Button>
                      <Button size="sm" className="rounded-lg" onClick={() => setPaying(r)}>ثبت و پرداخت</Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(o) => { if (!o) setEditing(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>ویرایش حقوق — {editing?.staffName}</DialogTitle></DialogHeader>
          {editing && <PayrollEditForm row={editing} monthKey={monthKey} onDone={() => { setEditing(null); load() }} toast={toast} />}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(paying)} onOpenChange={(o) => { if (!o) setPaying(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>پرداخت حقوق — {paying?.staffName}</DialogTitle></DialogHeader>
          {paying && <PayrollPayForm row={paying} monthKey={monthKey} onDone={() => { setPaying(null); load() }} toast={toast} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PayrollEditForm({ row, monthKey, onDone, toast }: { row: PayrollRowUI; monthKey: string; onDone: () => void; toast: ReturnType<typeof useToast>['toast'] }) {
  const [overtime, setOvertime] = useState(String(row.overtime))
  const [bonus, setBonus] = useState(String(row.bonus))
  const [deductions, setDeductions] = useState(String(row.deductions))
  const [commission, setCommission] = useState(String(row.commission))
  const [baseSalary, setBaseSalary] = useState(String(row.baseSalary))
  const [busy, setBusy] = useState(false)
  async function submit() {
    setBusy(true)
    try {
      await jsonFetch('/api/payroll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', month: monthKey, staffName: row.staffName, role: row.role, baseSalary: Number(baseSalary), overtime: Number(overtime), bonus: Number(bonus), deductions: Number(deductions), commission: Number(commission) }),
      })
      toast({ title: 'ذخیره شد ✓' })
      onDone()
    } catch (e) { toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' }) }
    finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>حقوق پایه</Label><Input type="number" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} className="rounded-xl" disabled={row.role === 'DOCTOR'} /></div>
        <div><Label>کارانه</Label><Input type="number" value={commission} onChange={(e) => setCommission(e.target.value)} className="rounded-xl" /></div>
        <div><Label>اضافه‌کار</Label><Input type="number" value={overtime} onChange={(e) => setOvertime(e.target.value)} className="rounded-xl" /></div>
        <div><Label>پاداش</Label><Input type="number" value={bonus} onChange={(e) => setBonus(e.target.value)} className="rounded-xl" /></div>
        <div><Label>کسورات</Label><Input type="number" value={deductions} onChange={(e) => setDeductions(e.target.value)} className="rounded-xl" /></div>
      </div>
      <Button className="w-full rounded-xl" onClick={submit} disabled={busy}>ذخیره</Button>
    </div>
  )
}

function PayrollPayForm({ row, monthKey, onDone, toast }: { row: PayrollRowUI; monthKey: string; onDone: () => void; toast: ReturnType<typeof useToast>['toast'] }) {
  const [method, setMethod] = useState('TRANSFER')
  const [cashAccountId, setCashAccountId] = useState('')
  const [accounts, setAccounts] = useState<CashAccountUI[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => { jsonFetch<{ accounts: CashAccountUI[] }>('/api/cash').then((d) => setAccounts(d.accounts)).catch(() => {}) }, [])
  async function submit() {
    setBusy(true)
    try {
      await jsonFetch('/api/payroll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pay', month: monthKey, staffName: row.staffName, role: row.role, baseSalary: row.baseSalary, overtime: row.overtime, bonus: row.bonus, deductions: row.deductions, commission: row.commission, method, cashAccountId: cashAccountId || undefined }),
      })
      toast({ title: 'پرداخت ثبت شد ✓', description: 'هزینه حقوق + خروج از حساب ثبت شد' })
      onDone()
    } catch (e) { toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' }) }
    finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-muted/60 p-3 text-sm flex justify-between"><span>مبلغ پرداخت</span><span className="font-bold">{formatToman(row.total)}</span></div>
      <div><Label>روش پرداخت</Label>
        <Select value={method} onValueChange={setMethod}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TRANSFER">انتقال بانکی</SelectItem><SelectItem value="CASH">نقدی</SelectItem><SelectItem value="CHECK">چک</SelectItem></SelectContent></Select>
      </div>
      <div><Label>از حساب</Label>
        <Select value={cashAccountId || 'none'} onValueChange={(v) => setCashAccountId(v === 'none' ? '' : v)}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">بدون حساب</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
      </div>
      <Button className="w-full rounded-xl" onClick={submit} disabled={busy}>ثبت پرداخت</Button>
    </div>
  )
}

// ---------- تامین‌کنندگان ----------

function SuppliersTab() {
  const [items, setItems] = useState<SupplierUI[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  useEffect(() => {
    jsonFetch<{ items: SupplierUI[] }>('/api/suppliers').then((d) => setItems(d.items)).finally(() => setLoading(false))
  }, [])
  async function add() {
    if (!name.trim()) return
    await jsonFetch('/api/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone }) })
    setName(''); setPhone('')
    jsonFetch<{ items: SupplierUI[] }>('/api/suppliers').then((d) => setItems(d.items))
  }
  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border"><CardContent className="p-4 flex gap-2 flex-wrap items-end">
        <div className="flex-1 min-w-40"><Label>نام تامین‌کننده</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl" /></div>
        <div className="w-40"><Label>تلفن</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-xl" /></div>
        <Button className="rounded-xl" onClick={add}><Plus className="h-4 w-4" /> افزودن</Button>
      </CardContent></Card>
      {loading ? <LoadingBlock rows={3} /> : (
        <div className="rounded-2xl border divide-y">
          {items.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3 gap-2 flex-wrap">
              <div><div className="font-medium text-sm">{s.name}</div><div className="text-[11px] text-muted-foreground">{s.phone ? faDigits(s.phone) : '—'} · {s.note ?? ''}</div></div>
              <div className="text-xs text-muted-foreground">{faDigits(s.purchaseCount)} خرید · مجموع <span className="font-bold text-foreground">{formatToman(s.totalPurchased)}</span></div>
            </div>
          ))}
          {items.length === 0 && <EmptyState text="تامین‌کننده‌ای ثبت نشده" />}
        </div>
      )}
    </div>
  )
}

// ---------- انبار ----------

function InventoryTab({ toast }: { toast: ReturnType<typeof useToast>['toast'] }) {
  const [products, setProducts] = useState<Product[]>([])
  const [purchases, setPurchases] = useState<{ id: string; date: string; supplier: string; total: number }[]>([])
  const [inventoryValue, setInventoryValue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [purchaseOpen, setPurchaseOpen] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    jsonFetch<{ products: Product[]; purchases: { id: string; date: string; supplier: string; total: number }[]; inventoryValue: number }>('/api/inventory')
      .then((d) => { setProducts(d.products); setPurchases(d.purchases ?? []); setInventoryValue(d.inventoryValue) }).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const low = products.filter((p) => p.stockQty <= p.minStock)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="ارزش موجودی انبار" value={formatToman(inventoryValue)} tone="purple" icon={<Package className="h-5 w-5" />} />
        <StatCard title="تعداد اقلام" value={faDigits(products.length)} />
        <StatCard title="هشدار موجودی" value={faDigits(low.length)} tone={low.length ? 'red' : 'default'} icon={<AlertTriangle className="h-5 w-5" />} />
        <div className="flex items-end"><Button className="rounded-xl w-full" onClick={() => setPurchaseOpen(true)}><Plus className="h-4 w-4" /> ثبت خرید</Button></div>
      </div>

      {loading ? <LoadingBlock rows={4} /> : (
        <>
          <div className="rounded-2xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/50 text-xs text-muted-foreground"><th className="text-right px-3 py-2.5 font-medium">کالا</th><th className="text-right px-3 py-2.5 font-medium">دسته</th><th className="text-right px-3 py-2.5 font-medium">موجودی</th><th className="text-right px-3 py-2.5 font-medium">خرید</th><th className="text-right px-3 py-2.5 font-medium">فروش</th></tr></thead>
              <tbody className="divide-y">
                {products.map((p) => (
                  <tr key={p.id} className={p.stockQty <= p.minStock ? 'bg-amber-50/60' : ''}>
                    <td className="px-3 py-2.5 font-medium">{p.name} {p.stockQty <= p.minStock && <AlertTriangle className="inline h-3.5 w-3.5 text-amber-500" />}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{p.category}</td>
                    <td className="px-3 py-2.5">{faDigits(p.stockQty)} {p.unit}</td>
                    <td className="px-3 py-2.5 text-xs">{formatToman(p.purchasePrice)}</td>
                    <td className="px-3 py-2.5 text-xs">{formatToman(p.salePrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Card className="rounded-2xl border"><CardContent className="p-4">
            <h3 className="font-bold mb-3">خریدهای اخیر</h3>
            <div className="divide-y rounded-xl border">
              {purchases.slice(-8).reverse().map((pu) => (
                <div key={pu.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <div><span className="font-medium">{pu.supplier}</span> <span className="text-[11px] text-muted-foreground">— {formatJDate(new Date(pu.date))}</span></div>
                  <span className="font-bold">{formatToman(pu.total)}</span>
                </div>
              ))}
              {purchases.length === 0 && <EmptyState text="خریدی ثبت نشده" />}
            </div>
          </CardContent></Card>
        </>
      )}

      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>ثبت خرید از تامین‌کننده</DialogTitle></DialogHeader>
          <PurchaseForm products={products} onDone={() => { setPurchaseOpen(false); load() }} toast={toast} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PurchaseForm({ products, onDone, toast }: { products: Product[]; onDone: () => void; toast: ReturnType<typeof useToast>['toast'] }) {
  const [supplier, setSupplier] = useState('')
  const [rows, setRows] = useState<{ productId: string; qty: number; unitPrice: number }[]>([{ productId: '', qty: 1, unitPrice: 0 }])
  const [busy, setBusy] = useState(false)
  async function submit() {
    const valid = rows.filter((r) => r.productId)
    if (!supplier.trim() || !valid.length) { toast({ title: 'خطا', description: 'تامین‌کننده و حداقل یک قلم لازم است', variant: 'destructive' }); return }
    setBusy(true)
    try {
      await jsonFetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supplier, items: valid.map((r) => ({ productId: r.productId, qty: r.qty, unitPrice: r.unitPrice || undefined })) }) })
      toast({ title: 'خرید ثبت شد ✓', description: 'موجودی انبار به‌روزرسانی شد' })
      onDone()
    } catch (e) { toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' }) }
    finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <div><Label>تامین‌کننده</Label><Input value={supplier} onChange={(e) => setSupplier(e.target.value)} className="rounded-xl" /></div>
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2 items-center rounded-xl border p-2">
          <Select value={r.productId || 'none'} onValueChange={(v) => {
            const p = products.find((x) => x.id === v)
            setRows((rs) => rs.map((x, xi) => (xi === i ? { ...x, productId: v, unitPrice: p?.purchasePrice ?? x.unitPrice } : x)))
          }}>
            <SelectTrigger className="flex-1 rounded-lg text-xs"><SelectValue placeholder="کالا" /></SelectTrigger>
            <SelectContent><SelectItem value="none">— انتخاب —</SelectItem>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="number" min={1} value={r.qty} onChange={(e) => setRows((rs) => rs.map((x, xi) => (xi === i ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)))} className="w-16 rounded-lg text-xs" />
          <Input type="number" min={0} value={r.unitPrice} onChange={(e) => setRows((rs) => rs.map((x, xi) => (xi === i ? { ...x, unitPrice: Math.max(0, Number(e.target.value) || 0) } : x)))} className="w-28 rounded-lg text-xs" />
          {rows.length > 1 && <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => setRows((rs) => rs.filter((_, xi) => xi !== i))}><XCircle className="h-4 w-4" /></Button>}
        </div>
      ))}
      <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setRows((rs) => [...rs, { productId: '', qty: 1, unitPrice: 0 }])}><Plus className="h-4 w-4" /> افزودن قلم</Button>
      <Button className="w-full rounded-xl" onClick={submit} disabled={busy}>ثبت خرید</Button>
    </div>
  )
}

// ---------- هزینه‌ها ----------

function ExpensesTab({ toast }: { toast: ReturnType<typeof useToast>['toast'] }) {
  const [items, setItems] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('UTILITIES')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const load = useCallback(() => {
    setLoading(true)
    jsonFetch<{ expenses: Expense[] }>('/api/expenses').then((d) => setItems(d.expenses)).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])
  async function add() {
    if (!amount || !description.trim()) { toast({ title: 'خطا', description: 'مبلغ و شرح لازم است', variant: 'destructive' }); return }
    try {
      await jsonFetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, amount: Number(amount), description }) })
      toast({ title: 'هزینه ثبت شد ✓' })
      setAmount(''); setDescription('')
      load()
    } catch (e) { toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' }) }
  }
  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border"><CardContent className="p-4 flex flex-wrap gap-2 items-end">
        <div className="w-44"><Label>دسته</Label>
          <Select value={category} onValueChange={setCategory}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(EXPENSE_CATEGORY_LABEL).filter(([k]) => k !== 'COMMISSION' && k !== 'COGS').map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="w-36"><Label>مبلغ</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-xl" /></div>
        <div className="flex-1 min-w-40"><Label>شرح</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-xl" /></div>
        <Button className="rounded-xl" onClick={add}><Plus className="h-4 w-4" /> ثبت</Button>
      </CardContent></Card>
      {loading ? <LoadingBlock rows={4} /> : (
        <div className="rounded-2xl border divide-y max-h-[420px] overflow-y-auto scroll-thin">
          {items.slice(-30).reverse().map((e) => (
            <div key={e.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div><span className="font-medium">{EXPENSE_CATEGORY_LABEL[e.category] ?? e.category}</span> <span className="text-xs text-muted-foreground">— {e.description}</span></div>
              <div className="text-xs text-muted-foreground">{formatJDate(new Date(e.date))} · <span className="font-bold text-foreground">{formatToman(e.amount)}</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- گزارش تفکیکی ----------

function AnalysisTab({ monthKey, branch }: { monthKey: string; branch: string }) {
  const [top, setTop] = useState<{ name: string; value: number; count: number }[]>([])
  const [doctors, setDoctors] = useState<{ name: string; revenue: number; commission: number }[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    jsonFetch<{ topServices: { name: string; value: number; count: number }[]; doctors: { name: string; revenue: number; commission: number }[] }>(`/api/finance?month=${monthKey}${branch ? `&branch=${branch}` : ''}`)
      .then((d) => { setTop(d.topServices); setDoctors(d.doctors) }).finally(() => setLoading(false))
  }, [monthKey, branch])
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <a href={`/api/finance/export?type=ledger&month=${monthKey}`} download className="text-sm inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 hover:bg-muted"><Download className="h-4 w-4" /> خروجی دفتر روزنه</a>
        <a href={`/api/finance/export?type=invoices&month=${monthKey}`} download className="text-sm inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 hover:bg-muted"><Download className="h-4 w-4" /> خروجی فاکتورها</a>
        <a href={`/api/finance/export?type=expenses&month=${monthKey}`} download className="text-sm inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 hover:bg-muted"><Download className="h-4 w-4" /> خروجی هزینه‌ها</a>
      </div>
      <Card className="rounded-2xl border"><CardContent className="p-4">
        <h3 className="font-bold mb-3">درآمد به تفکیک خدمت (این ماه)</h3>
        {loading ? <LoadingBlock rows={3} /> : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={top} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" tickFormatter={millionsShort} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => formatToman(v)} />
              <Bar dataKey="value" name="درآمد" fill="#0284C7" radius={[0, 6, 6, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent></Card>
      <Card className="rounded-2xl border"><CardContent className="p-4">
        <h3 className="font-bold mb-3">درآمد و کارانه پزشکان (این ماه)</h3>
        <div className="space-y-2">
          {doctors.map((d) => (
            <div key={d.name} className="flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm">
              <span className="font-medium">{d.name}</span>
              <span className="text-xs text-muted-foreground">درآمد <b className="text-foreground">{formatToman(d.revenue)}</b> · کارانه {formatToman(d.commission)}</span>
            </div>
          ))}
          {doctors.length === 0 && <EmptyState text="داده‌ای برای این ماه نیست" />}
        </div>
      </CardContent></Card>
    </div>
  )
}

// ==================================================================
// بخش اصلی مالی و انبار
// ==================================================================

export function FinanceSection() {
  const { toast } = useToast()
  const [meta, setMeta] = useState<Meta | null>(null)
  const [branches, setBranches] = useState<BranchLite[]>([])
  const [monthKey, setMonthKey] = useState(lastNMonthKeys(1)[0])
  const [branch, setBranch] = useState('')

  useEffect(() => {
    jsonFetch<Meta>('/api/meta').then(setMeta).catch(() => {})
    jsonFetch<{ branches: BranchLite[] }>('/api/branches').then((d) => setBranches(d.branches ?? (d as unknown as { branches: never[] }).branches)).catch(() => {})
  }, [])

  const monthOptions = useMemo(() => MONTH_KEYS, [])

  return (
    <div className="space-y-4">
      <SectionHeader title="حسابداری و انبار" subtitle="فاکتور، پرداخت، صندوق، چک، حقوق، انبار و گزارش‌های تفکیکی با تقویم شمسی">
        <Select value={monthKey} onValueChange={setMonthKey}>
          <SelectTrigger className="w-36 rounded-xl text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{monthOptions.map((k) => <SelectItem key={k} value={k}>{keyToLabel(k)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={branch || 'all'} onValueChange={(v) => setBranch(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-44 rounded-xl text-sm"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">همه شعب</SelectItem>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
        </Select>
      </SectionHeader>

      <Tabs defaultValue="report" dir="rtl">
        <TabsList className="rounded-xl bg-muted flex-wrap h-auto">
          <TabsTrigger value="report" className="rounded-lg text-xs md:text-sm">داشبورد مالی</TabsTrigger>
          <TabsTrigger value="invoices" className="rounded-lg text-xs md:text-sm">فاکتورها</TabsTrigger>
          <TabsTrigger value="ledger" className="rounded-lg text-xs md:text-sm">دفتر روزنه</TabsTrigger>
          <TabsTrigger value="cash" className="rounded-lg text-xs md:text-sm">صندوق و بانک</TabsTrigger>
          <TabsTrigger value="checks" className="rounded-lg text-xs md:text-sm">چک‌ها</TabsTrigger>
          <TabsTrigger value="payroll" className="rounded-lg text-xs md:text-sm">حقوق و کارانه</TabsTrigger>
          <TabsTrigger value="suppliers" className="rounded-lg text-xs md:text-sm">تامین‌کنندگان</TabsTrigger>
          <TabsTrigger value="inventory" className="rounded-lg text-xs md:text-sm">انبار</TabsTrigger>
          <TabsTrigger value="expenses" className="rounded-lg text-xs md:text-sm">هزینه‌ها</TabsTrigger>
          <TabsTrigger value="analysis" className="rounded-lg text-xs md:text-sm">گزارش تفکیکی</TabsTrigger>
        </TabsList>

        <TabsContent value="report" className="mt-4"><ReportTab monthKey={monthKey} branch={branch} /></TabsContent>
        <TabsContent value="invoices" className="mt-4"><InvoicesTab meta={meta} branches={branches} toast={toast} /></TabsContent>
        <TabsContent value="ledger" className="mt-4"><LedgerTab toast={toast} /></TabsContent>
        <TabsContent value="cash" className="mt-4"><CashTab toast={toast} /></TabsContent>
        <TabsContent value="checks" className="mt-4"><ChecksTab toast={toast} /></TabsContent>
        <TabsContent value="payroll" className="mt-4"><PayrollTab toast={toast} /></TabsContent>
        <TabsContent value="suppliers" className="mt-4"><SuppliersTab /></TabsContent>
        <TabsContent value="inventory" className="mt-4"><InventoryTab toast={toast} /></TabsContent>
        <TabsContent value="expenses" className="mt-4"><ExpensesTab toast={toast} /></TabsContent>
        <TabsContent value="analysis" className="mt-4"><AnalysisTab monthKey={monthKey} branch={branch} /></TabsContent>
      </Tabs>
    </div>
  )
}
