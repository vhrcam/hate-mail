import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/session'
import Dashboard from '@/components/Dashboard'

export default function Home({ searchParams }: PageProps<'/'>) {
  return (
    <Suspense>
      <Gate searchParams={searchParams} />
    </Suspense>
  )
}

async function Gate({ searchParams }: { searchParams: PageProps<'/'>['searchParams'] }) {
  const session = await currentSession()
  if (!session?.accountIds.length) redirect('/connect')
  const { account } = await searchParams
  return <Dashboard initialAccount={Number(account) || 0} />
}
