import { AppShell } from '@/components/app/app-shell'
import { getSessionUser } from '@/lib/auth'

export default async function Page() {
  const user = await getSessionUser()
  return <AppShell initialUser={user} />
}
