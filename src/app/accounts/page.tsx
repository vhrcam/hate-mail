import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { listAccounts } from '@/lib/accounts'
import AccountsManager from '@/components/AccountsManager'

export default function AccountsPage() {
  return (
    <Suspense>
      <Gate />
    </Suspense>
  )
}

async function Gate() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const accounts = listAccounts(user.id).map((a) => ({
    ...a,
    scanned: a.scannedAt ? new Date(a.scannedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null,
  }))
  return <AccountsManager initial={accounts} />
}
