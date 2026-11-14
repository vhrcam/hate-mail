import { all, get, run } from './db'
import { providers } from './providers'

type NewAccount = {
  email: string
  provider: string
  auth: 'oauth' | 'password'
  imapHost: string
  imapPort: number
  smtpHost: string | null
  smtpPort: number | null
  login: string
  secret: string
  accessToken?: string
  accessExpires?: number
}

export async function saveAccount(a: NewAccount) {
  const existing = await get<{ id: number }>('select id from accounts where email = ? and imap_host = ? and imap_port = ?', a.email, a.imapHost, a.imapPort)

  if (existing) {
    await run(
      `update accounts set provider = ?, auth = ?, smtp_host = ?, smtp_port = ?, login = ?, secret = ?,
       access_token = ?, access_expires = ?, needs_reconnect = 0 where id = ?`,
      a.provider, a.auth, a.smtpHost, a.smtpPort, a.login, a.secret, a.accessToken ?? null, a.accessExpires ?? null, existing.id,
    )
    return existing.id
  }

  const { lastInsertRowid } = await run(
    `insert into accounts (email, provider, auth, imap_host, imap_port, smtp_host, smtp_port, login, secret, access_token, access_expires, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    a.email, a.provider, a.auth, a.imapHost, a.imapPort, a.smtpHost, a.smtpPort, a.login, a.secret, a.accessToken ?? null, a.accessExpires ?? null, Date.now(),
  )
  return Number(lastInsertRowid)
}

export async function listAccounts(ids: number[]) {
  const rows = await all<{ id: number; email: string; provider: string; auth: string; scanned_at: number | null; needs_reconnect: number }>(
    `select id, email, provider, auth, scanned_at, needs_reconnect from accounts where id in (${ids.map(() => '?').join(',') || 'null'})`,
    ...ids,
  )
  return ids
    .map((id) => rows.find((r) => r.id === id))
    .filter((r) => !!r)
    .map((r) => ({
      id: r.id,
      email: r.email,
      provider: r.provider,
      providerName: providers[r.provider]?.name ?? 'Email',
      oauth: r.auth === 'oauth',
      scannedAt: r.scanned_at,
      needsReconnect: !!r.needs_reconnect,
    }))
}
