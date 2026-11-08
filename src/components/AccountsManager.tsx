'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Account = {
  id: number
  email: string
  provider: string
  providerName: string
  oauth: boolean
  label: string
  customLabel: string
  scanned: string | null
  needsReconnect: boolean
}

export default function AccountsManager({ initial }: { initial: Account[] }) {
  const router = useRouter()
  const [accounts, setAccounts] = useState(initial)
  const [removing, setRemoving] = useState<Account | null>(null)
  const [message, setMessage] = useState('')

  async function rename(a: Account, label: string) {
    label = label.trim()
    if (label === a.customLabel) return
    const res = await fetch(`/api/accounts/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    })
    if (!res.ok) return setMessage('Couldn’t save that tag.')
    setAccounts((list) => list.map((x) => (x.id === a.id ? { ...x, customLabel: label, label: label || x.email } : x)))
    setMessage(`Saved the tag for ${a.email}.`)
  }

  async function remove(a: Account) {
    setRemoving(null)
    const res = await fetch(`/api/accounts/${a.id}`, { method: 'DELETE' })
    if (!res.ok) return setMessage('Couldn’t remove that account.')
    const left = accounts.filter((x) => x.id !== a.id)
    setAccounts(left)
    setMessage(`Removed ${a.email}.`)
    if (!left.length) {
      router.replace('/connect')
      router.refresh()
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Accounts</h1>
        <Link href="/" className="btn-quiet">
          Back to senders
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">Tags show on each sender so you can tell your accounts apart.</p>

      <ul className="mt-6 space-y-3">
        {accounts.map((a) => (
          <li key={a.id} className="rounded-xl border border-navy-700 bg-navy-900 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{a.email}</p>
                <p className="text-sm text-muted">
                  {a.providerName}
                  {a.needsReconnect ? ' · Needs to be reconnected' : a.scanned ? ` · Last scanned ${a.scanned}` : ' · Not scanned yet'}
                </p>
              </div>
              <div className="flex gap-2">
                {a.needsReconnect && (
                  <a
                    href={a.oauth ? `/api/oauth/${a.provider}?email=${encodeURIComponent(a.email)}` : `/connect?email=${encodeURIComponent(a.email)}`}
                    className="btn-quiet border-amber/50 text-amber"
                  >
                    Reconnect
                  </a>
                )}
                <button onClick={() => setRemoving(a)} className="btn-quiet text-coral-soft">
                  Remove
                </button>
              </div>
            </div>
            <label className="mt-3 block max-w-xs text-xs text-muted">
              Tag
              <input
                defaultValue={a.customLabel}
                placeholder={a.email}
                maxLength={40}
                onBlur={(e) => rename(a, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="input mt-1 py-2 text-sm"
              />
            </label>
          </li>
        ))}
      </ul>

      <Link href="/connect" className="btn-primary mt-5 inline-block">
        Connect another account
      </Link>

      {message && <p className="mt-4 text-sm text-muted">{message}</p>}

      {removing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setRemoving(null)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl border border-navy-700 bg-navy-900 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Remove {removing.email}?</h2>
            <p className="mt-2 text-sm text-muted">Hate Mail forgets this account and its senders. Nothing in your mailbox changes.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setRemoving(null)} className="btn-quiet">
                Cancel
              </button>
              <button onClick={() => remove(removing)} autoFocus className="btn-primary py-2 text-sm">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
