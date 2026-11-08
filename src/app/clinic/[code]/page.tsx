import { PublicClinic } from '@/components/app/public-clinic'

/** صفحه عمومی کلینیک — بدون ورود؛ رزرو نوبت آنلاین */
export default async function ClinicPublicPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <PublicClinic branchCode={decodeURIComponent(code).toUpperCase()} />
}
