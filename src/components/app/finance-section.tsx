'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { StatCard, SectionHeader, Pill, LoadingBlock, EmptyState } from './bits'
import type { Expense, MonthRow, Product, ProductSale, Purchase } from './types'
import { EXPENSE_CATEGORY_LABEL, formatToman, millionsShort } from '@/lib/format'
import { formatJDate, keyToLabel, lastNMonthKeys, shiftJMonth, faDigits, jMonthKey } from '@/lib/jalali'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from 'recharts'
import { Plus, Package, Wallet, TrendingUp, AlertTriangle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const PIE_COLORS = ['#0284C7', '#B08D57', '#0D9488', '#EA580C', '#71757A', '#075985', '#DC2626']

export function FinanceSection() {
  return (
    <div className="space-y-4">
      <SectionHeader title="مالی و انبار" subtitle="حسابداری سبک با تقویم شمسی — درآمد، هزینه، سود خالص و موجودی کالا" />
      <Tabs defaultValue="report" dir="rtl">
        <TabsList className="rounded-xl bg-muted">
          <TabsTrigger value="report" className="rounded-lg text-xs md:text-sm">گزارش ماهانه</TabsTrigger>
          <TabsTrigger value="inventory" className="rounded-lg text-xs md:text-sm">انبار</TabsTrigger>
          <TabsTrigger value="expenses" className="rounded-lg text-xs md:text-sm">هزینه‌ها</TabsTrigger>
        </TabsList>
        <TabsContent value="report" className="mt-4"><ReportTab /></TabsContent>
        <TabsContent value="inventory" className="mt-4"><InventoryTab /></TabsContent>
        <TabsContent value="expenses" className="mt-4"><ExpensesTab /></TabsContent>
      </Tabs>
    </div>
  )
}

/* ---------------- گزارش ماهانه ---------------- */

interface FinanceData {
  monthKey: string
  pnl: {
    revenueServices: number
    revenueProducts: number
    revenue: number
    cogs: number
    commission: number
    operationalExpenses: number
    totalExpenses: number
    netProfit: number
    margin: number
  }
  expenseRows: { category: string; label: string; amount: number }[]
  topServices: { name: string; value: number; count: number }[]
  doctors: { name: string; revenue: number; commission: number }[]
  series: MonthRow[]
  appointmentCount: number
}

function ReportTab() {
  const [month, setMonth] = useState<string>(jMonthKey(new Date()))
  const [branch, setBranch] = useState<string>('all')
  const [branchList, setBranchList] = useState<{ id: string; name: string }[]>([])
  const [data, setData] = useState<FinanceData | null>(null)

  useEffect(() => {
    fetch('/api/branches').then((r) => r.json()).then((d) => setBranchList(d.branches ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    setData(null)
    const b = branch === 'all' ? '' : `&branch=${branch}`
    fetch(`/api/finance?month=${month}${b}`).then((r) => r.json()).then(setData).catch(() => {})
  }, [month, branch])

  const months = lastNMonthKeys(12).reverse()

  if (!data) return <LoadingBlock rows={5} />

  const { pnl } = data
  const pnlRows: { label: string; value: number; bold?: boolean; negative?: boolean; indent?: boolean }[] = [
    { label: 'درآمد خدمات درمانی', value: pnl.revenueServices, indent: true },
    { label: 'درآمد فروش کالا', value: pnl.revenueProducts, indent: true },
    { label: 'جمع درآمد ماه', value: pnl.revenue, bold: true },
    { label: 'بهای کالای فروخته‌شده', value: -pnl.cogs, indent: true },
    { label: 'کارانه پزشکان', value: -pnl.commission, indent: true },
    { label: 'هزینه‌های عملیاتی (اجاره، حقوق، …)', value: -pnl.operationalExpenses, indent: true },
    { label: 'جمع هزینه‌های ماه', value: -pnl.totalExpenses, bold: true },
    { label: 'سود خالص ماه', value: pnl.netProfit, bold: true, negative: pnl.netProfit < 0 },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">ماه مورد نظر:</span>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-44 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m} value={m}>{keyToLabel(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">شعبه:</span>
        <Select value={branch} onValueChange={setBranch}>
          <SelectTrigger className="w-52 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه‌ی شعب</SelectItem>
            {branchList.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Pill label={`${faDigits(data.appointmentCount)} ویزیت انجام‌شده در این ماه`} color="bg-secondary text-secondary-foreground border-transparent" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="درآمد ماه" value={formatToman(pnl.revenue)} tone="purple" icon={<Wallet className="h-5 w-5" />} />
        <StatCard title="جمع هزینه‌ها" value={formatToman(pnl.totalExpenses)} tone="gold" icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard
          title="سود خالص ماه"
          value={formatToman(pnl.netProfit)}
          tone={pnl.netProfit >= 0 ? 'green' : 'red'}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard title="حاشیه سود" value={`${faDigits(pnl.margin.toFixed(0))}٪`} hint="سود خالص ÷ درآمد" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="rounded-2xl lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">روند ۱۲ ماهه (تومان)</CardTitle>
          </CardHeader>
          <CardContent>
            <div dir="ltr" className="h-[290px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ECECF0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-35} textAnchor="end" height={50} />
                  <YAxis tickFormatter={millionsShort} tick={{ fontSize: 11 }} width={44} />
                  <Tooltip
                    formatter={(v: number, name: string) => [formatToman(v), name]}
                    contentStyle={{ fontFamily: 'inherit', borderRadius: 12, border: '1px solid #E6E8EC', direction: 'rtl' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" name="درآمد" fill="#0284C7" radius={[6, 6, 0, 0]} maxBarSize={24} />
                  <Bar dataKey="totalExpenses" name="هزینه‌ها" fill="#B08D57" radius={[6, 6, 0, 0]} maxBarSize={24} />
                  <Line type="monotone" dataKey="netProfit" name="سود خالص" stroke="#0D9488" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ترکیب درآمد {keyToLabel(data.monthKey)}</CardTitle>
          </CardHeader>
          <CardContent>
            <TopServicesMini services={data.topServices} />
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="rounded-2xl lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">صورت سود و زیان ساده — {keyToLabel(data.monthKey)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {pnlRows.map((r) => (
                <div key={r.label} className={`flex items-center justify-between py-2.5 ${r.bold ? 'font-bold' : ''}`}>
                  <span className={`text-sm ${r.indent ? 'text-muted-foreground pr-4' : ''} ${r.label.includes('سود خالص') ? 'text-emerald-700' : ''}`}>
                    {r.label}
                  </span>
                  <span className={`text-sm tabular-nums ${r.value < 0 ? 'text-rose-600' : r.label.includes('سود خالص') ? 'text-emerald-700' : ''}`}>
                    {formatToman(r.value)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">تفکیک هزینه‌ها</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.expenseRows.slice(0, 6).map((e) => (
                <div key={e.category} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{e.label}</span>
                  <span className="font-semibold">{formatToman(e.amount)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">درآمد و کارانه پزشکان</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.doctors.map((d) => (
                <div key={d.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium">{d.name}</span>
                    <span className="text-muted-foreground">کارانه: {formatToman(d.commission)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#0284C7]"
                      style={{ width: `${Math.min(100, (d.revenue / Math.max(...data.doctors.map((x) => x.revenue))) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function TopServicesMini({ services }: { services: { name: string; value: number; count: number }[] }) {
  return (
    <div dir="ltr" className="h-[190px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={services} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
            {services.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: number, name: string) => [formatToman(v), name]}
            contentStyle={{ fontFamily: 'inherit', borderRadius: 12, border: '1px solid #E6E8EC', direction: 'rtl', fontSize: 12 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ---------------- انبار ---------------- */

function InventoryTab() {
  const [data, setData] = useState<{ products: Product[]; purchases: Purchase[]; sales: ProductSale[]; inventoryValue: number } | null>(null)
  const [open, setOpen] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    const j = await fetch('/api/inventory').then((r) => r.json())
    setData(j)
  }, [])
  useEffect(() => {
    load()
  }, [load])

  if (!data) return <LoadingBlock rows={5} />

  const lowStock = data.products.filter((p) => p.stockQty <= p.minStock)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="ارزش موجودی انبار" value={formatToman(data.inventoryValue)} tone="purple" icon={<Package className="h-5 w-5" />} />
        <StatCard title="اقلام زیر حد هشدار" value={`${faDigits(lowStock.length)} قلم`} tone={lowStock.length ? 'red' : 'green'} icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard title="تعداد اقلام" value={`${faDigits(data.products.length)} قلم`} />
        <StatCard
          title="خریدهای اخیر"
          value={`${faDigits(data.purchases.length)} فقره`}
          hint={data.purchases[0] ? `آخرین: ${formatJDate(new Date(data.purchases[0].date), false)}` : undefined}
        />
      </div>

      <div className="flex justify-end">
        <PurchaseDialog
          products={data.products}
          onDone={() => {
            toast({ title: 'خرید ثبت شد', description: 'موجودی انبار به‌روزرسانی شد' })
            load()
          }}
          open={open}
          setOpen={setOpen}
        />
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">موجودی کالا</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto scroll-thin">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-[11px] text-muted-foreground border-b">
                <th className="text-right py-2 font-medium">کالا</th>
                <th className="text-right py-2 font-medium">دسته</th>
                <th className="text-center py-2 font-medium">موجودی</th>
                <th className="text-center py-2 font-medium">قیمت خرید</th>
                <th className="text-center py-2 font-medium">قیمت فروش</th>
                <th className="text-center py-2 font-medium">تأمین‌کننده</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((p) => {
                const low = p.stockQty <= p.minStock
                return (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2.5 font-medium">{p.name}</td>
                    <td className="py-2.5 text-xs text-muted-foreground">{p.category}</td>
                    <td className="py-2.5 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${low ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'}`}>
                        {faDigits(p.stockQty)} {p.unit}
                      </span>
                      {low ? <div className="text-[9px] text-rose-600 mt-0.5">زیر حد هشدار ({faDigits(p.minStock)})</div> : null}
                    </td>
                    <td className="py-2.5 text-center text-xs">{formatToman(p.purchasePrice)}</td>
                    <td className="py-2.5 text-center text-xs">{formatToman(p.salePrice)}</td>
                    <td className="py-2.5 text-center text-xs text-muted-foreground">{p.supplier}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">خریدهای اخیر</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-y-auto scroll-thin">
            {data.purchases.map((pu) => (
              <div key={pu.id} className="rounded-xl border px-3 py-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{pu.supplier}</span>
                  <span className="font-bold">{formatToman(pu.total)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {formatJDate(new Date(pu.date))} — {pu.items.map((i) => `${i.product.name} ×${faDigits(i.qty)}`).join('، ')}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">فروش کالا به بیماران</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-y-auto scroll-thin">
            {data.sales.length === 0 ? <EmptyState text="فروشی ثبت نشده." /> : null}
            {data.sales.map((s) => (
              <div key={s.id} className="rounded-xl border px-3 py-2.5 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{s.product.name} × {faDigits(s.qty)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {s.patient ? `${s.patient.firstName} ${s.patient.lastName} · ` : ''}{formatJDate(new Date(s.date))}
                  </div>
                </div>
                <span className="text-sm font-bold">{formatToman(s.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function PurchaseDialog({
  products, onDone, open, setOpen,
}: {
  products: Product[]
  onDone: () => void
  open: boolean
  setOpen: (v: boolean) => void
}) {
  const [supplier, setSupplier] = useState('')
  const [items, setItems] = useState<{ productId: string; qty: string }[]>([{ productId: '', qty: '1' }])
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const rows = items.filter((i) => i.productId && Number(i.qty) > 0).map((i) => ({ productId: i.productId, qty: Number(i.qty) }))
    if (!supplier.trim() || rows.length === 0) return
    setSaving(true)
    const r = await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplier, items: rows }),
    })
    setSaving(false)
    if (r.ok) {
      setOpen(false)
      setSupplier('')
      setItems([{ productId: '', qty: '1' }])
      onDone()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-xl">
          <Plus className="h-4 w-4 ml-1" /> ثبت خرید
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right">ثبت خرید انبار</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">تأمین‌کننده</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="مثلاً: آریا دنت تجارت" className="rounded-xl mt-1" />
          </div>
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_100px] gap-2">
              <Select value={it.productId} onValueChange={(v) => setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, productId: v } : x)))}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="انتخاب کالا" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={1}
                value={it.qty}
                onChange={(e) => setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))}
                className="rounded-xl"
                placeholder="تعداد"
              />
            </div>
          ))}
          <div className="flex justify-between">
            <Button size="sm" variant="outline" className="rounded-xl text-xs" onClick={() => setItems((a) => [...a, { productId: '', qty: '1' }])}>
              <Plus className="h-3.5 w-3.5 ml-1" /> افزودن قلم
            </Button>
            <Button size="sm" variant="ghost" className="rounded-xl text-xs" onClick={() => setItems((a) => a.slice(0, -1))} disabled={items.length <= 1}>
              حذف قلم آخر
            </Button>
          </div>
          <Button className="w-full rounded-xl" onClick={submit} disabled={saving}>
            {saving ? 'در حال ثبت…' : 'ثبت خرید و افزایش موجودی'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- هزینه‌ها ---------------- */

function ExpensesTab() {
  const [expenses, setExpenses] = useState<Expense[] | null>(null)
  const [open, setOpen] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    const j = await fetch('/api/expenses').then((r) => r.json())
    setExpenses(j.expenses ?? [])
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const total = (expenses ?? []).reduce((s, e) => s + e.amount, 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard title="جمع ۴۰ هزینه‌ی اخیر" value={formatToman(total)} tone="gold" icon={<Wallet className="h-5 w-5" />} />
        <StatCard title="تعداد رکوردها" value={faDigits(expenses?.length ?? 0)} />
      </div>

      <div className="flex justify-end">
        <AddExpenseDialog
          onDone={() => {
            toast({ title: 'هزینه ثبت شد' })
            load()
          }}
          open={open}
          setOpen={setOpen}
        />
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-0">
          {!expenses ? (
            <div className="p-4"><LoadingBlock rows={5} /></div>
          ) : (
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-[11px] text-muted-foreground border-b">
                    <th className="text-right py-2.5 px-4 font-medium">تاریخ</th>
                    <th className="text-right py-2.5 font-medium">دسته</th>
                    <th className="text-right py-2.5 font-medium">شرح</th>
                    <th className="text-left py-2.5 px-4 font-medium">مبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-2.5 px-4 text-xs text-muted-foreground whitespace-nowrap">{formatJDate(new Date(e.date))}</td>
                      <td className="py-2.5 text-xs">
                        <Pill label={EXPENSE_CATEGORY_LABEL[e.category] ?? e.category} color="bg-secondary text-secondary-foreground border-transparent" />
                      </td>
                      <td className="py-2.5 text-xs text-muted-foreground">{e.description}</td>
                      <td className="py-2.5 px-4 text-xs font-bold text-left whitespace-nowrap">{formatToman(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AddExpenseDialog({
  onDone, open, setOpen,
}: {
  onDone: () => void
  open: boolean
  setOpen: (v: boolean) => void
}) {
  const [category, setCategory] = useState('RENT')
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!amount || Number(amount) <= 0) return
    setSaving(true)
    const r = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, amount: Number(amount), description: desc || 'ثبت دستی' }),
    })
    setSaving(false)
    if (r.ok) {
      setOpen(false)
      setAmount('')
      setDesc('')
      onDone()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-xl">
          <Plus className="h-4 w-4 ml-1" /> ثبت هزینه
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">ثبت هزینه</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">دسته‌بندی</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="rounded-xl mt-1 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['RENT', 'SALARY', 'UTILITIES', 'MARKETING', 'EQUIPMENT', 'OTHER'].map((c) => (
                  <SelectItem key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">مبلغ (تومان)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-xl mt-1" placeholder="مثلاً 45000000" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">شرح</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} className="rounded-xl mt-1" placeholder="اختیاری" />
          </div>
          <Button className="w-full rounded-xl" onClick={submit} disabled={saving}>
            {saving ? 'در حال ثبت…' : 'ثبت هزینه'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
