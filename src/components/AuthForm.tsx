'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const signup = mode === 'signup'

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await fetch(`/api/auth/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error)
      setBusy(false)
      return
    }
    window.location.assign(signup ? '/connect' : '/')
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-navy-700 bg-navy-900 p-7">
        <h1 className="text-2xl font-bold">Hate Mail</h1>
        <p className="mt-1 text-sm text-muted">
          {signup ? 'Create an account to start cleaning up your inbox.' : 'Log in to your account.'}
        </p>

        <label className="mt-6 block text-sm text-muted">
          Email
          <input name="email" type="email" required autoComplete="email" className="input mt-1" />
        </label>
        <label className="mt-4 block text-sm text-muted">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={signup ? 8 : undefined}
            autoComplete={signup ? 'new-password' : 'current-password'}
            className="input mt-1"
          />
        </label>

        {error && <p className="mt-4 text-sm text-coral-soft">{error}</p>}

        <button disabled={busy} className="btn-primary mt-6 w-full">
          {busy ? 'One sec…' : signup ? 'Create account' : 'Log in'}
        </button>

        <p className="mt-5 text-center text-sm text-muted">
          {signup ? 'Already have an account? ' : 'New here? '}
          <Link href={signup ? '/login' : '/signup'} className="text-ink underline underline-offset-2">
            {signup ? 'Log in' : 'Create an account'}
          </Link>
        </p>
      </form>
    </main>
  )
}
