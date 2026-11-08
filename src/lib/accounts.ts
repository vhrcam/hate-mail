import { db, removeOrphanSenders } from './db'
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

export function saveAccount(userId: number, a: NewAccount) {
  const existing = db().prepare('select id, imap_host from accounts where user_id = ? and email = ?').get(userId, a.email) as
    | { id: number; imap_host: string }
    | undefined

  if (existing) {
    if (existing.imap_host !== a.imapHost) {
      db().prepare('delete from sender_accounts where account_id = ?').run(existing.id)
      db().prepare('update accounts set scan_state = null, scanned_at = null where id = ?').run(existing.id)
      removeOrphanSenders(userId)
    }
    db()
      .prepare(
        `update accounts set provider = ?, auth = ?, imap_host = ?, imap_port = ?, smtp_host = ?, smtp_port = ?, login = ?, secret = ?,
         access_token = ?, access_expires = ?, needs_reconnect = 0 where id = ?`,
      )
      .run(a.provider, a.auth, a.imapHost, a.imapPort, a.smtpHost, a.smtpPort, a.login, a.secret, a.accessToken ?? null, a.accessExpires ?? null, existing.id)
    return existing.id
  }

  const { lastInsertRowid } = db()
    .prepare(
      `insert into accounts (user_id, email, provider, auth, imap_host, imap_port, smtp_host, smtp_port, login, secret, access_token, access_expires, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, a.email, a.provider, a.auth, a.imapHost, a.imapPort, a.smtpHost, a.smtpPort, a.login, a.secret, a.accessToken ?? null, a.accessExpires ?? null, Date.now())
  return Number(lastInsertRowid)
}

export function listAccounts(userId: number) {
  const rows = db()
    .prepare('select id, email, provider, auth, label, scanned_at, needs_reconnect from accounts where user_id = ? order by created_at')
    .all(userId) as { id: number; email: string; provider: string; auth: string; label: string | null; scanned_at: number | null; needs_reconnect: number }[]
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    provider: r.provider,
    providerName: providers[r.provider]?.name ?? 'Email',
    oauth: r.auth === 'oauth',
    label: r.label ?? r.email,
    customLabel: r.label ?? '',
    scannedAt: r.scanned_at,
    needsReconnect: !!r.needs_reconnect,
  }))
}

export function countAccounts(userId: number) {
  return (db().prepare('select count(*) as n from accounts where user_id = ?').get(userId) as { n: number }).n
}
