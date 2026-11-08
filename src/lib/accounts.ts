import { db } from './db'
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

export function saveAccount(a: NewAccount) {
  const existing = db().prepare('select id from accounts where email = ? and imap_host = ? and imap_port = ?').get(a.email, a.imapHost, a.imapPort) as
    | { id: number }
    | undefined

  if (existing) {
    db()
      .prepare(
        `update accounts set provider = ?, auth = ?, smtp_host = ?, smtp_port = ?, login = ?, secret = ?,
         access_token = ?, access_expires = ?, needs_reconnect = 0 where id = ?`,
      )
      .run(a.provider, a.auth, a.smtpHost, a.smtpPort, a.login, a.secret, a.accessToken ?? null, a.accessExpires ?? null, existing.id)
    return existing.id
  }

  const { lastInsertRowid } = db()
    .prepare(
      `insert into accounts (email, provider, auth, imap_host, imap_port, smtp_host, smtp_port, login, secret, access_token, access_expires, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(a.email, a.provider, a.auth, a.imapHost, a.imapPort, a.smtpHost, a.smtpPort, a.login, a.secret, a.accessToken ?? null, a.accessExpires ?? null, Date.now())
  return Number(lastInsertRowid)
}

export function listAccounts(ids: number[]) {
  const rows = db()
    .prepare(`select id, email, provider, auth, scanned_at, needs_reconnect from accounts where id in (${ids.map(() => '?').join(',') || 'null'})`)
    .all(...ids) as { id: number; email: string; provider: string; auth: string; scanned_at: number | null; needs_reconnect: number }[]
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
