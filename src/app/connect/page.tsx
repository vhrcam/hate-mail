import { Suspense } from 'react'
import { currentSession } from '@/lib/session'
import ConnectFlow from '@/components/ConnectFlow'

export default function ConnectPage({ searchParams }: PageProps<'/connect'>) {
  return (
    <Suspense>
      <Gate searchParams={searchParams} />
    </Suspense>
  )
}

async function Gate({ searchParams }: { searchParams: PageProps<'/connect'>['searchParams'] }) {
  const session = await currentSession()
  const query = await searchParams
  return (
    <ConnectFlow
      hasAccounts={!!session?.accountIds.length}
      initialEmail={typeof query.email === 'string' ? query.email : ''}
      error={typeof query.error === 'string' ? query.error : ''}
    />
  )
}
