export interface Doctor {
  id: string
  name: string
  specialty: string
  color: string
  commissionRate: number
}

export interface Service {
  id: string
  name: string
  category: string
  price: number
  durationMin: number
}

export interface PatientLite {
  id: string
  firstName: string
  lastName: string
  phone: string
}

export interface Appointment {
  id: string
  patientId: string
  doctorId: string
  serviceId: string
  start: string
  status: string
  source: string
  price: number
  paid: boolean
  deposit: number
  note?: string | null
  createdAt: string
  patient: PatientLite
  doctor: Doctor
  service: Service
}

export interface TaskItem {
  id: string
  title: string
  description?: string | null
  assigneeRole: string
  assigneeName?: string | null
  dueAt: string
  priority: string
  status: string
  source: string
  patient?: { firstName: string; lastName: string } | null
  createdAt: string
}

export interface MonthRow {
  key: string
  label: string
  revenueServices: number
  revenueProducts: number
  revenue: number
  cogs: number
  commission: number
  expenses: number
  totalExpenses: number
  netProfit: number
  appointments: number
  noShow: number
  cancelled: number
}

export interface PatientRow {
  id: string
  firstName: string
  lastName: string
  phone: string
  nationalId?: string | null
  incompleteTreatment: boolean
  visitCount: number
  noShowCount: number
  lastVisit: string | null
  signalNoVisit: boolean
  signalNoShow: boolean
  signalIncomplete: boolean
  totalSpent: number
}

export interface Product {
  id: string
  name: string
  category: string
  unit: string
  purchasePrice: number
  salePrice: number
  stockQty: number
  minStock: number
  supplier?: string | null
}

export interface Purchase {
  id: string
  date: string
  supplier: string
  total: number
  items: { id: string; qty: number; unitPrice: number; product: { name: string } }[]
}

export interface ProductSale {
  id: string
  date: string
  total: number
  qty: number
  patient?: PatientLite | null
  product: { name: string; unit: string }
}

export interface Expense {
  id: string
  date: string
  category: string
  amount: number
  description: string
}

export interface TraceStep {
  key: string
  label: string
  state: 'done' | 'active' | 'pending'
}

export interface BotMessage {
  text: string
  kind?: 'info' | 'success' | 'warn'
}

export interface Chip {
  label: string
  payload: { action: string; [k: string]: unknown }
}

export interface AssistantResponse {
  messages: BotMessage[]
  chips?: Chip[]
  trace: TraceStep[]
  ctx: Record<string, unknown>
  result?: { appointmentId: string; taskId: string }
}

// ---------- نقش‌ها و سشن ----------

export interface SessionUser {
  id: string
  username: string
  fullName: string
  role: string // ADMIN | DOCTOR | RECEPTIONIST | PATIENT
  phone: string | null
  email: string | null
  branchId: string | null
  branch: { id: string; name: string; code: string; city: string } | null
  doctorId: string | null
  doctorName: string | null
  patientId: string | null
  patientName: string | null
}

export interface BranchInfo {
  id: string
  code: string
  name: string
  city: string
  address: string
  phone: string
  openHour: number
  closeHour: number
  thuCloseHour: number | null
  closedFri: boolean
  isActive: boolean
  doctorCount: number
  staffCount: number
  doctors: { id: string; name: string; specialty: string; color: string }[]
  appointmentsMonth: number
  revenueMonth: number
  revenueMonthFa: string
  expensesMonth: number
  todayPending: number
}

export interface StaffUser {
  id: string
  username: string
  fullName: string
  role: string
  roleFa: string
  phone: string | null
  email: string | null
  active: boolean
  lastLoginAt: string | null
  branch: { id: string; name: string } | null
  doctorName: string | null
  patientName: string | null
}

export interface AgentStepUI {
  title: string
  ok: boolean
  result: unknown
}

export interface AgentResponse {
  answer: string
  steps: AgentStepUI[]
  aiUsed: boolean
}

// ---------- پزشک ----------

export interface DoctorOverview {
  doctor: { name: string; specialty: string; branch: string | null; branchCity: string | null }
  today: Appointment[]
  upcoming: Appointment[]
  myPatients: {
    id: string
    name: string
    phone: string
    incompleteTreatment: boolean
    visits: number
    noShow: number
    spentFa: string
    lastVisit: string | null
  }[]
  series: { key: string; label: string; revenue: number; commission: number; done: number }[]
  thisMonth: { done: number; revenueFa: string; commissionFa: string; rate: number }
  tasks: TaskItem[]
}

// ---------- پرتال بیمار ----------

export interface PortalOverview {
  profile: {
    patientId: string
    firstName: string
    lastName: string
    phone: string
    nationalId: string | null
    birthYear: number | null
    incompleteTreatment: boolean
    email: string | null
    since: string
  }
  upcoming: Appointment[]
  past: Appointment[]
  sales: ProductSale[]
  totals: { paidFa: string; remainingFa: string; visits: number }
  branches: { id: string; name: string; city: string; address: string; phone: string; openHour: number; closeHour: number }[]
}
