import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { countAccounts } from '@/lib/accounts'
import Dashboard from '@/components/Dashboard'

export default function Home() {
  return (
    <Suspense>
      <Gate />
    </Suspense>
  )
}

async function Gate() {
  const user = await currentUser()
  if (!user) redirect('/login')
  if (!countAccounts(user.id)) redirect('/connect')
  return <Dashboard />
}
