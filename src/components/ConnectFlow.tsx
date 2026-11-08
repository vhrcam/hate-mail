'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Detected = {
  email: string
  id: string
  name: string
  oauth: 'google' | 'microsoft' | null
  oauthReady: boolean
  appPassword: boolean
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  help: string[]
  helpUrl: string | null
  unsupported: string | null
}

const errors: Record<string, string> = {
  setup: 'Sign-in with that provider isn’t set up on this server yet. Use an app password for now.',
  denied: 'Sign-in was canceled.',
  expired: 'That sign-in took too long. Try again.',
  token: 'Couldn’t finish signing in. Try again.',
}

export default function ConnectFlow({ hasAccounts, initialEmail, error }: { hasAccounts: boolean; initialEmail: string; error: string }) {
  const router = useRouter()
  const [email, setEmail] = useState(initialEmail)
  const [info, setInfo] = useState<Detected | null>(null)
  const [usePassword, setUsePassword] = useState(false)
  const [showServer, setShowServer] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(errors[error] ?? '')

  async function post(url: string, body: object) {
    setBusy(true)
    setMessage('')
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) setMessage(data.error)
    return res.ok ? data : null
  }

  async function lookup(e: React.FormEvent) {
    e.preventDefault()
    const data = await post('/api/detect', { email })
    if (data) {
      setInfo(data)
      setUsePassword(!data.oauth)
      setShowServer(data.id === 'other')
    }
  }

  async function connect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = Object.fromEntries(new FormData(e.currentTarget))
    const data = await post('/api/accounts', { ...form, email: info!.email, provider: info!.id })
    if (data) go('/')
  }

  function go(path: string) {
    router.replace(path)
    router.refresh()
  }

  function reset() {
    setInfo(null)
    setMessage('')
  }

  const providerLabel = info?.oauth === 'google' ? 'Google' : 'Microsoft'

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-navy-700 bg-navy-900 p-7">
        <h1 className="text-2xl font-bold">Connect your email</h1>
        <p className="mt-1 text-sm text-muted">Hate Mail looks at who your emails are from, never what they say.</p>

        {!info && (
          <form onSubmit={lookup} className="mt-6">
            <label className="block text-sm text-muted">
              Email address
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                autoFocus
                placeholder="you@example.com"
                className="input mt-1"
              />
            </label>
            <button disabled={busy} className="btn-primary mt-5 w-full">
              {busy ? 'Checking…' : 'Continue'}
            </button>
          </form>
        )}

        {info && (
          <div className="mt-6">
            <div className="flex items-center justify-between rounded-lg bg-navy-950 px-3 py-2.5 text-sm">
              <span className="truncate">{info.email}</span>
              <button onClick={reset} className="ml-3 shrink-0 text-muted underline underline-offset-2 hover:text-ink">
                Change
              </button>
            </div>

            {info.unsupported && <p className="mt-5 text-sm text-muted">{info.unsupported}</p>}

            {!info.unsupported && info.oauth && !usePassword && (
              <div className="mt-5">
                {info.oauthReady ? (
                  <a href={`/api/oauth/${info.oauth}?email=${encodeURIComponent(info.email)}`} className="btn-primary block w-full text-center">
                    Continue with {providerLabel}
                  </a>
                ) : (
                  <>
                    <button disabled className="btn-primary w-full">
                      Continue with {providerLabel}
                    </button>
                    <p className="mt-3 text-sm text-muted">{providerLabel} sign-in isn’t set up on this server yet.</p>
                  </>
                )}
                {info.appPassword && (
                  <button onClick={() => setUsePassword(true)} className="mt-4 w-full text-sm text-muted underline underline-offset-2 hover:text-ink">
                    Use an app password instead
                  </button>
                )}
              </div>
            )}

            {!info.unsupported && usePassword && (
              <form onSubmit={connect} className="mt-5">
                {info.help.length > 0 && (
                  <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
                    {info.help.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                )}
                {info.helpUrl && (
                  <a href={info.helpUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-ink underline underline-offset-2">
                    Open {info.name} settings ↗
                  </a>
                )}

                <label className="mt-5 block text-sm text-muted">
                  {info.id === 'other' ? 'Password' : 'App password'}
                  <input name="password" type="password" required autoComplete="off" className="input mt-1" />
                </label>

                <button type="button" onClick={() => setShowServer(!showServer)} className="mt-4 text-sm text-muted underline underline-offset-2 hover:text-ink">
                  {showServer ? 'Hide server settings' : 'Server settings'}
                </button>
                <div className={showServer ? 'mt-3 grid grid-cols-[1fr_6rem] gap-3' : 'hidden'}>
                  <label className="col-span-2 block text-xs text-muted">
                    Username (leave blank to use your email)
                    <input name="username" autoComplete="off" className="input mt-1" />
                  </label>
                  <label className="block text-xs text-muted">
                    Incoming (IMAP) server
                    <input name="imapHost" defaultValue={info.imapHost} required className="input mt-1" />
                  </label>
                  <label className="block text-xs text-muted">
                    Port
                    <input name="imapPort" defaultValue={info.imapPort} required inputMode="numeric" className="input mt-1" />
                  </label>
                  <label className="block text-xs text-muted">
                    Outgoing (SMTP) server
                    <input name="smtpHost" defaultValue={info.smtpHost} className="input mt-1" />
                  </label>
                  <label className="block text-xs text-muted">
                    Port
                    <input name="smtpPort" defaultValue={info.smtpPort} inputMode="numeric" className="input mt-1" />
                  </label>
                </div>

                <button disabled={busy} className="btn-primary mt-5 w-full">
                  {busy ? 'Connecting…' : 'Connect'}
                </button>
                {info.oauth && (
                  <button type="button" onClick={() => setUsePassword(false)} className="mt-4 w-full text-sm text-muted underline underline-offset-2 hover:text-ink">
                    Back to {providerLabel} sign-in
                  </button>
                )}
              </form>
            )}
          </div>
        )}

        {message && <p className="mt-4 text-sm text-coral-soft">{message}</p>}

        <div className="mt-6 flex justify-between text-sm text-muted">
          {hasAccounts ? (
            <Link href="/" className="underline underline-offset-2 hover:text-ink">
              Back to your senders
            </Link>
          ) : (
            <span />
          )}
          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' })
              go('/login')
            }}
            className="underline underline-offset-2 hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  )
}
