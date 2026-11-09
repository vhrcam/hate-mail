'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Setup = {
  id: string
  help: string[]
  helpUrl: string | null
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
}

type Detected = Setup & {
  email: string
  name: string
  oauth: 'google' | 'microsoft' | null
  oauthReady: boolean
  appPassword: boolean
  unsupported: string | null
}

const errors: Record<string, string> = {
  setup: 'That sign-in isn’t set up on this server yet. Use an app password for now.',
  denied: 'Sign-in was canceled.',
  expired: 'That sign-in took too long. Try again.',
  token: 'Couldn’t finish signing in. Try again.',
}

const choices = [
  { id: 'google', name: 'Google', domain: 'google.com' },
  { id: 'icloud', name: 'iCloud', domain: 'icloud.com' },
  { id: 'microsoft', name: 'Outlook', domain: 'outlook.com' },
  { id: 'yahoo', name: 'Yahoo', domain: 'yahoo.com' },
  { id: 'aol', name: 'AOL', domain: 'aol.com' },
  { id: 'other', name: 'Other email', domain: '' },
]

const placeholders: Record<string, string> = { google: 'you@gmail.com', icloud: 'you@icloud.com', yahoo: 'you@yahoo.com', aol: 'you@aol.com' }

export default function ConnectFlow({
  hasAccounts,
  initialEmail,
  error,
  ready,
  known,
}: {
  hasAccounts: boolean
  initialEmail: string
  error: string
  ready: { google: boolean; microsoft: boolean }
  known: Record<string, Setup>
}) {
  const router = useRouter()
  const [choice, setChoice] = useState(initialEmail ? 'other' : '')
  const [email, setEmail] = useState(initialEmail)
  const [detected, setDetected] = useState<Detected | null>(null)
  const [usePassword, setUsePassword] = useState(false)
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
    if (data) setDetected(data)
  }

  async function connect(form: Record<string, FormDataEntryValue>, setup: Setup) {
    const data = await post('/api/accounts', { ...form, provider: setup.id })
    if (data) {
      router.replace(`/?account=${data.id}`)
      router.refresh()
    }
  }

  function pick(id: string) {
    setMessage('')
    setDetected(null)
    setUsePassword(false)
    setChoice(id)
  }

  function back() {
    setMessage('')
    setUsePassword(false)
    if (detected) setDetected(null)
    else setChoice('')
  }

  const picked = choices.find((c) => c.id === choice)
  const setup = picked && known[picked.id]
  const detectedForm = !!detected && !detected.unsupported && (!detected.oauth || usePassword)
  const action = setup || detectedForm ? { form: 'connect-form', label: busy ? 'Signing In…' : 'Sign In' } : choice === 'other' && !detected ? { form: 'lookup-form', label: busy ? 'Checking…' : 'Next' } : null

  return (
    <div className="min-h-screen">
      <header className="px-5 py-4 text-lg font-semibold tracking-tight sm:px-6">Hate Mail</header>
      <main className="mx-auto max-w-md px-4 pb-16 pt-4 sm:pt-10">
      {(choice || hasAccounts) && (
        <div className="mb-4 flex items-center justify-between">
          {choice ? (
            <button onClick={back} className="text-accent-soft hover:brightness-110">
              ‹ Back
            </button>
          ) : (
            <Link href="/" className="text-accent-soft hover:brightness-110">
              ‹ Your senders
            </Link>
          )}
          {action && (
            <button type="submit" form={action.form} disabled={busy} className="font-medium text-accent-soft hover:brightness-110 disabled:opacity-50">
              {action.label}
            </button>
          )}
        </div>
      )}

      {picked && <h1 className="text-3xl font-semibold tracking-tight">{picked.name}</h1>}
      <p className={picked ? 'mt-2 text-muted' : 'text-muted'}>
        {picked
          ? 'Hate Mail looks at who your emails are from and never saves what they say.'
          : hasAccounts
            ? 'Connect another email to switch between them.'
            : 'Sign in with your email to see every mailing list you’re on.'}
      </p>

      {!choice && (
        <div className="mt-5 divide-y divide-line overflow-hidden rounded-2xl bg-card">
          {choices.map((c) => {
            const oauth = (c.id === 'google' && ready.google) || (c.id === 'microsoft' && ready.microsoft)
            const row = (
              <>
                <ProviderIcon domain={c.domain} />
                <span className="flex-1 font-medium">{c.name}</span>
                <span aria-hidden className="text-xl leading-none text-faint">
                  ›
                </span>
              </>
            )
            return oauth ? (
              <a key={c.id} href={`/api/oauth/${c.id}`} className="flex items-center gap-3.5 px-4 py-3.5 transition hover:bg-raised/60">
                {row}
              </a>
            ) : (
              <button key={c.id} onClick={() => pick(c.id)} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-raised/60">
                {row}
              </button>
            )
          })}
        </div>
      )}

      {choice === 'microsoft' && <p className="mt-8 rounded-2xl bg-card p-4 text-muted">Outlook sign-in isn’t set up on this server yet.</p>}

      {setup && (
        <>
          {choice === 'google' && <p className="mt-6 text-sm text-muted">Google sign-in isn’t set up on this server yet, so use an app password for now.</p>}
          <PasswordForm key={choice} setup={setup} email={email} placeholder={placeholders[choice]} onSubmit={(form) => connect(form, setup)} />
        </>
      )}

      {choice === 'other' && !detected && (
        <form id="lookup-form" onSubmit={lookup} className="mt-8">
          <div className="overflow-hidden rounded-2xl bg-card">
            <Field label="Email">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                autoFocus
                placeholder="you@example.com"
                className="min-w-0 flex-1 bg-transparent py-3.5 text-ink outline-none placeholder:text-faint"
              />
            </Field>
          </div>
        </form>
      )}

      {detected && <OtherAccount detected={detected} usePassword={usePassword} onUsePassword={() => setUsePassword(true)} onSubmit={(form, s) => connect(form, s)} />}

      {message && <p className="mt-4 text-sm text-amber">{message}</p>}
      </main>
    </div>
  )
}

function OtherAccount({
  detected,
  usePassword,
  onUsePassword,
  onSubmit,
}: {
  detected: Detected
  usePassword: boolean
  onUsePassword: () => void
  onSubmit: (form: Record<string, FormDataEntryValue>, setup: Setup) => void
}) {
  const label = detected.oauth === 'google' ? 'Google' : 'Microsoft'

  if (detected.unsupported) return <p className="mt-8 rounded-2xl bg-card p-4 text-muted">{detected.unsupported}</p>

  if (detected.oauth && !usePassword) {
    return (
      <div className="mt-8">
        <p className="text-muted">
          {detected.email} uses {label} for email.
        </p>
        {detected.oauthReady ? (
          <a href={`/api/oauth/${detected.oauth}?email=${encodeURIComponent(detected.email)}`} className="btn-primary mt-5 inline-block text-sm">
            Continue with {label}
          </a>
        ) : (
          <p className="mt-5 rounded-2xl bg-card p-4 text-muted">{label} sign-in isn’t set up on this server yet.</p>
        )}
        {detected.appPassword && (
          <button onClick={onUsePassword} className="mt-4 block text-accent-soft hover:brightness-110">
            Use an app password instead
          </button>
        )}
      </div>
    )
  }

  return <PasswordForm setup={detected} email={detected.email} lockEmail onSubmit={(form) => onSubmit(form, detected)} />
}

function PasswordForm({
  setup,
  email,
  placeholder,
  lockEmail,
  onSubmit,
}: {
  setup: Setup
  email: string
  placeholder?: string
  lockEmail?: boolean
  onSubmit: (form: Record<string, FormDataEntryValue>) => void
}) {
  const [showServer, setShowServer] = useState(setup.id === 'other')
  const field = 'min-w-0 flex-1 bg-transparent py-3.5 text-ink outline-none placeholder:text-faint read-only:text-muted'

  return (
    <form
      id="connect-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(Object.fromEntries(new FormData(e.currentTarget)))
      }}
      className="mt-6"
    >
      <div className="divide-y divide-line overflow-hidden rounded-2xl bg-card">
        <Field label="Email">
          <input name="email" type="email" required defaultValue={email} readOnly={lockEmail} placeholder={placeholder ?? 'you@example.com'} className={field} />
        </Field>
        <Field label={setup.id === 'other' ? 'Password' : 'App password'}>
          <input name="password" type="password" required autoComplete="off" placeholder="Required" className={field} />
        </Field>
      </div>

      {setup.help.length > 0 && (
        <ol className="mt-5 list-decimal space-y-1.5 pl-5 text-sm text-muted">
          {setup.help.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      {setup.helpUrl && (
        <a href={setup.helpUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-accent-soft hover:brightness-110">
          Get an app password ↗
        </a>
      )}

      <button type="button" onClick={() => setShowServer(!showServer)} className="mt-5 block text-sm text-muted hover:text-ink">
        {showServer ? 'Hide server settings' : 'Server settings'}
      </button>
      <div className={showServer ? 'mt-3 divide-y divide-line overflow-hidden rounded-2xl bg-card' : 'hidden'}>
        <Field label="Username">
          <input name="username" autoComplete="off" placeholder="Same as email" className={field} />
        </Field>
        <Field label="IMAP server">
          <input name="imapHost" defaultValue={setup.imapHost} required className={field} />
        </Field>
        <Field label="IMAP port">
          <input name="imapPort" defaultValue={setup.imapPort} required inputMode="numeric" className={field} />
        </Field>
        <Field label="SMTP server">
          <input name="smtpHost" defaultValue={setup.smtpHost} className={field} />
        </Field>
        <Field label="SMTP port">
          <input name="smtpPort" defaultValue={setup.smtpPort} inputMode="numeric" className={field} />
        </Field>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-3 px-4">
      <span className="w-28 shrink-0 text-sm">{label}</span>
      {children}
    </label>
  )
}

function ProviderIcon({ domain }: { domain: string }) {
  if (!domain) {
    return (
      <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-muted">
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/logo?d=${domain}`} alt="" className="h-8 w-8 shrink-0 rounded-lg bg-white object-contain p-1" />
  )
}
