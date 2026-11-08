import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { countAccounts } from '@/lib/accounts'
import ConnectFlow from '@/components/ConnectFlow'

export default function ConnectPage({ searchParams }: PageProps<'/connect'>) {
  return (
    <Suspense>
      <Gate searchParams={searchParams} />
    </Suspense>
  )
}

async function Gate({ searchParams }: { searchParams: PageProps<'/connect'>['searchParams'] }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const query = await searchParams
  return (
    <ConnectFlow
      hasAccounts={countAccounts(user.id) > 0}
      initialEmail={typeof query.email === 'string' ? query.email : ''}
      error={typeof query.error === 'string' ? query.error : ''}
    />
  )
}
