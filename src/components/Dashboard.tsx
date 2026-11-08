'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

type Sender = {
  id: number
  name: string
  address: string
  domain: string | null
  since: number
  last: number
  total: number
  perMonth: number
  lastYear: number
  notOpenedYear: boolean
  accounts: { id: number; label: string }[]
  status: 'subscribed' | 'partial' | 'unsubscribed' | 'still-sending'
  method: 'auto' | 'link' | 'find' | null
  link: string | null
}

type Account = {
  id: number
  email: string
  provider: string
  oauth: boolean
  label: string
  scannedAt: number | null
  needsReconnect: boolean
}

type Scan = { email: string; scanned: number; total: number; first: boolean }
type Confirm = { title: string; body: string; label: string; run: () => void }
type Filter = 'all' | 'unopened' | 'oneclick'

const sorts = { most: 'Most emails', oldest: 'Oldest first', newest: 'Newest first', az: 'A–Z' }
const chips: [Filter, string][] = [
  ['all', 'All'],
  ['unopened', 'Not opened in a year'],
  ['oneclick', 'One-click'],
]
const colors = ['#3b6fd8', '#7c5cd6', '#c2549a', '#d07a2d', '#2f9e75', '#2a94b8', '#c94a5a', '#5b67d8']

const monthYear = (time: number) => new Date(time).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const safeLink = (url: string | null | undefined) => !!url && /^(https?:|mailto:)/i.test(url)

function rate(s: Sender) {
  if (s.perMonth >= 1) return `${Math.round(s.perMonth).toLocaleString()} a month`
  if (s.lastYear > 0) return 'Less than 1 a month'
  return `Last email ${monthYear(s.last)}`
}

async function post(url: string, body: object) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { ok: res.ok, data: await res.json().catch(() => ({})) }
}

export default function Dashboard() {
  const router = useRouter()
  const [senders, setSenders] = useState<Sender[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loaded, setLoaded] = useState(false)
  const [bottom, setBottom] = useState<Set<number>>(new Set())
  const [sort, setSort] = useState<keyof typeof sorts>('most')
  const [filter, setFilter] = useState<Filter>('all')
  const [account, setAccount] = useState(0)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState<Set<number>>(new Set())
  const [scan, setScan] = useState<Scan | null>(null)
  const [toast, setToast] = useState('')
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [menu, setMenu] = useState<number | null>(null)

  const load = useCallback(
    async (resetBottom: boolean) => {
      const res = await fetch('/api/senders')
      if (res.status === 401) {
        router.replace('/login')
        return null
      }
      const data = await res.json()
      if (!data.accounts.length) router.replace('/connect')
      setSenders(data.senders)
      setAccounts(data.accounts)
      setLoaded(true)
      if (resetBottom) setBottom(new Set(data.senders.filter((s: Sender) => s.status === 'unsubscribed').map((s: Sender) => s.id)))
      return data as { senders: Sender[]; accounts: Account[] }
    },
    [router],
  )

  const runScan = useCallback(
    async (a: Account, first: boolean, cancelled: () => boolean) => {
      setScan({ email: a.email, scanned: 0, total: 0, first })
      try {
        while (!cancelled()) {
          const { ok, data } = await post(`/api/accounts/${a.id}/scan`, {})
          if (!ok) {
            setToast(data.reconnect ? `${a.email} needs to be reconnected.` : `Couldn’t scan ${a.email}. ${data.error ?? ''}`)
            break
          }
          if (data.busy) {
            await sleep(2000)
            continue
          }
          setScan({ email: a.email, scanned: data.scanned, total: data.total, first })
          if (data.done) break
          if (first) await load(false)
        }
      } finally {
        setScan(null)
        await load(false)
      }
    },
    [load],
  )

  useEffect(() => {
    let cancelled = false
    async function start() {
      const data = await load(true)
      for (const a of data?.accounts ?? []) {
        if (cancelled) return
        if (a.needsReconnect) continue
        const first = !a.scannedAt
        if (!first && Date.now() - a.scannedAt! < 15 * 60 * 1000) continue
        await runScan(a, first, () => cancelled)
      }
    }
    start()
    return () => {
      cancelled = true
    }
  }, [load, runScan])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 7000)
    return () => clearTimeout(timer)
  }, [toast])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const order: Record<keyof typeof sorts, (a: Sender, b: Sender) => number> = {
      most: (a, b) => b.perMonth - a.perMonth || b.total - a.total,
      oldest: (a, b) => a.since - b.since,
      newest: (a, b) => b.since - a.since,
      az: (a, b) => a.name.localeCompare(b.name),
    }
    return senders
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.address.includes(q))
      .filter((s) => filter !== 'unopened' || s.notOpenedYear)
      .filter((s) => filter !== 'oneclick' || s.method === 'auto')
      .filter((s) => !account || s.accounts.some((a) => a.id === account))
      .sort((a, b) => Number(bottom.has(a.id)) - Number(bottom.has(b.id)) || order[sort](a, b))
  }, [senders, query, filter, account, sort, bottom])

  const selectable = visible.filter((s) => s.status !== 'unsubscribed')
  const allSelected = selectable.length > 0 && selectable.every((s) => selected.has(s.id))
  const multi = accounts.length > 1

  function merge(updated: Sender[]) {
    const byId = new Map(updated.map((s) => [s.id, s]))
    setSenders((list) => list.map((s) => byId.get(s.id) ?? s))
  }

  function track(ids: number[], on: boolean) {
    setBusy((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function unsubscribe(s: Sender) {
    const opened: string[] = []
    let tab: Window | null = null
    if (s.method === 'link' && safeLink(s.link)) {
      if (s.link!.startsWith('mailto:')) window.location.href = s.link!
      else window.open(s.link!, '_blank', 'noopener,noreferrer')
      opened.push(s.link!)
    }
    if (s.method === 'find') tab = window.open('', '_blank')

    track([s.id], true)
    try {
      if (s.method === 'find') {
        const { ok, data } = await post('/api/senders/find-link', { id: s.id })
        if (ok && tab && safeLink(data.url)) {
          tab.opener = null
          tab.location.href = data.url
        } else {
          tab?.close()
          setToast(data.error ?? 'Couldn’t find an unsubscribe link.')
        }
        if (data.senders) merge(data.senders)
        return
      }
      const { ok, data } = await post('/api/senders/unsubscribe', { ids: [s.id], opened })
      if (!ok) return setToast(data.error ?? 'Something went wrong.')
      merge(data.senders)
      if (data.failed?.length) setToast(`${s.name}’s one-click unsubscribe didn’t go through. Click Unsubscribe ↗ to finish on their site.`)
    } finally {
      track([s.id], false)
    }
  }

  async function unsubscribeSelected() {
    const ids = [...selected]
    track(ids, true)
    try {
      const { ok, data } = await post('/api/senders/unsubscribe', { ids })
      if (!ok) return setToast(data.error ?? 'Something went wrong.')
      merge(data.senders)
      const left = (data.senders as Sender[]).filter((s) => s.status !== 'unsubscribed').length
      const done = data.senders.length - left
      setToast(
        left
          ? `Unsubscribed from ${done}. ${left} need${left === 1 ? 's' : ''} you to finish on their website (marked with ↗).`
          : `Unsubscribed from ${done} sender${done === 1 ? '' : 's'}.`,
      )
      setSelected(new Set())
    } finally {
      track(ids, false)
    }
  }

  function askClean(ids: number[], action: 'trash' | 'archive') {
    setMenu(null)
    const picked = senders.filter((s) => ids.includes(s.id))
    const who = picked.length === 1 ? picked[0].name : `${picked.length} senders`
    setConfirm({
      title: action === 'trash' ? `Move all emails from ${who} to Trash?` : `Archive all emails from ${who}?`,
      body:
        action === 'trash'
          ? 'They go to your Trash folder. Most providers delete Trash for good after 30 days.'
          : 'They leave your inbox but stay in your account.',
      label: action === 'trash' ? 'Move to Trash' : 'Archive',
      run: () => clean(ids, action),
    })
  }

  async function clean(ids: number[], action: 'trash' | 'archive') {
    setConfirm(null)
    track(ids, true)
    try {
      const { ok, data } = await post('/api/senders/clean', { ids, action })
      if (!ok) return setToast(data.error ?? 'Something went wrong.')
      const verb = action === 'trash' ? 'Moved' : 'Archived'
      const count = `${data.moved.toLocaleString()} email${data.moved === 1 ? '' : 's'}`
      setToast(data.errors.length ? `${verb} ${count}. Some didn’t work: ${data.errors.join('; ')}` : `${verb} ${count}${action === 'trash' ? ' to Trash' : ''}.`)
      setSelected(new Set())
    } finally {
      track(ids, false)
    }
  }

  async function refresh() {
    for (const a of accounts) {
      if (!a.needsReconnect) await runScan(a, !a.scannedAt, () => false)
    }
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-navy-700">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold tracking-tight">Hate Mail</h1>
            <nav className="flex items-center gap-2">
              <button onClick={refresh} disabled={!!scan} className="btn-quiet">
                Refresh
              </button>
              <Link href="/accounts" className="btn-quiet">
                Accounts
              </Link>
              <button onClick={signOut} className="btn-quiet">
                Sign out
              </button>
            </nav>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search senders"
              aria-label="Search senders"
              className="input w-full py-2 sm:w-auto sm:max-w-xs sm:flex-1"
            />
            <select value={sort} onChange={(e) => setSort(e.target.value as keyof typeof sorts)} aria-label="Sort" className="input w-auto py-2">
              {Object.entries(sorts).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            {multi && (
              <select value={account} onChange={(e) => setAccount(Number(e.target.value))} aria-label="Account" className="input w-auto max-w-48 py-2">
                <option value={0}>All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {chips.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  filter === key ? 'border-ink bg-ink text-navy-900' : 'border-navy-700 text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-36 pt-4">
        {accounts
          .filter((a) => a.needsReconnect)
          .map((a) => (
            <div key={a.id} className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm">
              <span className="min-w-0 truncate">{a.email} needs to be reconnected.</span>
              <a
                href={a.oauth ? `/api/oauth/${a.provider}?email=${encodeURIComponent(a.email)}` : `/connect?email=${encodeURIComponent(a.email)}`}
                className="shrink-0 font-medium underline underline-offset-2"
              >
                Reconnect
              </a>
            </div>
          ))}

        {scan?.first && (
          <div className="mb-4 rounded-xl border border-navy-700 bg-navy-900 p-4">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <p className="min-w-0 truncate">
                Scanning <span className="font-semibold">{scan.email}</span>
              </p>
              <p className="shrink-0 text-muted">
                {scan.total ? `${scan.scanned.toLocaleString()} of ${scan.total.toLocaleString()} emails` : 'Starting…'}
              </p>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-navy-700">
              <div className="h-full rounded-full bg-coral transition-all" style={{ width: `${scan.total ? Math.max(3, (scan.scanned / scan.total) * 100) : 3}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">Only senders and dates are read. Big inboxes can take a few minutes.</p>
          </div>
        )}

        {senders.length > 0 && (
          <div className="mb-2 flex items-center justify-between gap-3 px-1 text-sm text-muted">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((s) => s.id)))} className="h-4 w-4 accent-coral" />
              Select all
            </label>
            <span className="text-right">
              {visible.length === senders.length ? senders.length.toLocaleString() : `${visible.length.toLocaleString()} of ${senders.length.toLocaleString()}`} senders
              {scan && !scan.first ? ' · Checking for new mail…' : ''}
            </span>
          </div>
        )}

        <ul className="space-y-2">
          {visible.map((s) => {
            const done = s.status === 'unsubscribed'
            const working = busy.has(s.id)
            return (
              <li
                key={s.id}
                className={`flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border border-navy-700 bg-navy-900 px-3 py-3 transition sm:px-4 md:flex-nowrap md:items-center ${done ? 'opacity-50' : ''}`}
              >
                <input
                  type="checkbox"
                  disabled={done}
                  checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)}
                  aria-label={`Select ${s.name}`}
                  className="mt-3 h-4 w-4 shrink-0 accent-coral md:mt-0"
                />
                <Logo domain={s.domain} name={s.name} />

                <div className="min-w-0 flex-1 md:flex md:items-center md:gap-6">
                  <div className="min-w-0 md:flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{s.name}</p>
                      {s.status === 'still-sending' && (
                        <span className="shrink-0 rounded-full bg-amber/15 px-2 py-0.5 text-xs font-medium text-amber">Still sending</span>
                      )}
                    </div>
                    <p className="truncate text-sm text-muted">{s.address}</p>
                  </div>
                  <div className="mt-1 text-sm text-muted md:mt-0 md:w-72 md:shrink-0">
                    <p className="md:whitespace-nowrap">
                      {rate(s)} · Since {monthYear(s.since)}
                    </p>
                    {multi && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {s.accounts.map((a) => (
                          <span key={a.id} className="max-w-40 truncate rounded bg-navy-700 px-1.5 py-0.5 text-xs text-ink/80">
                            {a.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="order-last w-full pl-20 md:order-none md:w-44 md:shrink-0 md:pl-0 md:text-right">
                  {done ? (
                    <span className="px-1 text-sm text-muted">✓ Unsubscribed</span>
                  ) : (
                    <button
                      disabled={working}
                      onClick={() => unsubscribe(s)}
                      className="rounded-full border border-coral/70 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-coral-soft transition hover:bg-coral hover:text-white disabled:opacity-50"
                    >
                      {working ? 'Working…' : s.status === 'still-sending' ? 'Unsubscribe again' : s.status === 'partial' ? 'Finish' : 'Unsubscribe'}
                      {!working && s.method !== 'auto' ? ' ↗' : ''}
                    </button>
                  )}
                </div>

                <div className="relative shrink-0">
                  <button
                    onClick={() => setMenu(menu === s.id ? null : s.id)}
                    aria-label={`More actions for ${s.name}`}
                    className="rounded-lg px-2 py-1 text-lg leading-none text-muted hover:bg-navy-700 hover:text-ink"
                  >
                    ⋯
                  </button>
                  {menu === s.id && (
                    <div className="absolute right-0 top-full z-30 mt-1 w-60 overflow-hidden rounded-lg border border-navy-700 bg-navy-950 py-1 text-sm shadow-xl">
                      <button onClick={() => askClean([s.id], 'archive')} className="block w-full px-3 py-2 text-left hover:bg-navy-700">
                        Archive all their emails
                      </button>
                      <button onClick={() => askClean([s.id], 'trash')} className="block w-full px-3 py-2 text-left text-coral-soft hover:bg-navy-700">
                        Move all their emails to Trash
                      </button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        {!loaded && <p className="py-16 text-center text-muted">Loading…</p>}
        {loaded && !senders.length && !scan && (
          <p className="py-16 text-center text-muted">No mailing lists found. New ones will show up here after the next scan.</p>
        )}
        {senders.length > 0 && !visible.length && <p className="py-16 text-center text-muted">Nothing matches.</p>}
      </main>

      {menu !== null && <div className="fixed inset-0 z-20" onClick={() => setMenu(null)} />}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-30 px-4">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-navy-600 bg-navy-950/95 px-4 py-3 shadow-2xl backdrop-blur">
            <span className="mr-auto text-sm font-medium">{selected.size} selected</span>
            <button onClick={unsubscribeSelected} className="rounded-full bg-coral px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-coral-soft">
              Unsubscribe
            </button>
            <button onClick={() => askClean([...selected], 'archive')} className="btn-quiet rounded-full py-1.5">
              Archive emails
            </button>
            <button onClick={() => askClean([...selected], 'trash')} className="btn-quiet rounded-full py-1.5">
              Trash emails
            </button>
            <button onClick={() => setSelected(new Set())} className="px-2 text-sm text-muted hover:text-ink">
              Clear
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed inset-x-0 z-40 flex justify-center px-4 ${selected.size ? 'bottom-24' : 'bottom-6'}`}>
          <p role="status" className="max-w-xl rounded-xl border border-navy-600 bg-navy-950 px-4 py-3 text-sm shadow-2xl">
            {toast}
          </p>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setConfirm(null)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl border border-navy-700 bg-navy-900 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">{confirm.title}</h2>
            <p className="mt-2 text-sm text-muted">{confirm.body}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="btn-quiet">
                Cancel
              </button>
              <button onClick={confirm.run} autoFocus className="btn-primary py-2 text-sm">
                {confirm.label}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Logo({ domain, name }: { domain: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  if (!domain || failed) {
    const color = colors[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % colors.length]
    return (
      <div aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white" style={{ background: color }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/logo?d=${encodeURIComponent(domain)}`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-10 w-10 shrink-0 rounded-full bg-white object-contain p-1.5"
    />
  )
}
