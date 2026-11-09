import { Suspense } from 'react'
import { currentSession } from '@/lib/session'
import { oauthReady } from '@/lib/oauth'
import { providers } from '@/lib/providers'
import ConnectFlow from '@/components/ConnectFlow'

export default function ConnectPage({ searchParams }: PageProps<'/connect'>) {
  return (
    <Suspense>
      <Gate searchParams={searchParams} />
    </Suspense>
  )
}

const known = Object.fromEntries(
  ['google', 'icloud', 'yahoo', 'aol'].map((id) => {
    const p = providers[id]
    return [id, { id, help: p.help ?? [], helpUrl: p.helpUrl ?? null, imapHost: p.imap![0], imapPort: p.imap![1], smtpHost: p.smtp![0], smtpPort: p.smtp![1] }]
  }),
)

async function Gate({ searchParams }: { searchParams: PageProps<'/connect'>['searchParams'] }) {
  const session = await currentSession()
  const query = await searchParams
  return (
    <ConnectFlow
      hasAccounts={!!session?.accountIds.length}
      initialEmail={typeof query.email === 'string' ? query.email : ''}
      error={typeof query.error === 'string' ? query.error : ''}
      ready={{ google: oauthReady('google'), microsoft: oauthReady('microsoft') }}
      known={known}
    />
  )
}
