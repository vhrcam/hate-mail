import { cookies } from 'next/headers'
import { connection, type NextRequest } from 'next/server'
import { db } from './db'
import { randomToken, sha256 } from './crypto'

export const SESSION_COOKIE = 'hm_session'
const MAX_AGE = 400 * 24 * 60 * 60

export type Session = { token: string; hash: string; accountIds: number[] }

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  }
}

function load(token?: string): Session | null {
  if (!token) return null
  const hash = sha256(token)
  const row = db().prepare('select expires_at from sessions where token_hash = ?').get(hash) as { expires_at: number } | undefined
  if (!row || row.expires_at < Date.now()) return null
  const rows = db().prepare('select account_id from session_accounts where token_hash = ? order by added_at').all(hash) as { account_id: number }[]
  return { token, hash, accountIds: rows.map((r) => r.account_id) }
}

export async function currentSession() {
  await connection()
  return load((await cookies()).get(SESSION_COOKIE)?.value)
}

export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin')
  return !!origin && new URL(origin).host === req.headers.get('host')
}

export function apiSession(req: NextRequest) {
  if (req.method !== 'GET' && !sameOrigin(req)) return null
  return load(req.cookies.get(SESSION_COOKIE)?.value)
}

export function signIn(req: NextRequest, accountId: number) {
  let token = load(req.cookies.get(SESSION_COOKIE)?.value)?.token
  if (!token) {
    token = randomToken()
    db().prepare('insert into sessions (token_hash, expires_at) values (?, ?)').run(sha256(token), Date.now() + MAX_AGE * 1000)
  }
  db().prepare('insert or ignore into session_accounts (token_hash, account_id, added_at) values (?, ?, ?)').run(sha256(token), accountId, Date.now())
  const now = Date.now()
  db().prepare('delete from session_accounts where token_hash in (select token_hash from sessions where expires_at < ?)').run(now)
  db().prepare('delete from sessions where expires_at < ?').run(now)
  db().prepare('delete from senders where account_id not in (select account_id from session_accounts)').run()
  db().prepare('delete from accounts where id not in (select account_id from session_accounts)').run()
  return token
}

export function extendSession(session: Session) {
  db().prepare('update sessions set expires_at = ? where token_hash = ?').run(Date.now() + MAX_AGE * 1000, session.hash)
}

export function signOut(session: Session, accountId: number) {
  const conn = db()
  conn.prepare('delete from session_accounts where token_hash = ? and account_id = ?').run(session.hash, accountId)
  if (!conn.prepare('select 1 from session_accounts where account_id = ?').get(accountId)) {
    conn.prepare('delete from senders where account_id = ?').run(accountId)
    conn.prepare('delete from accounts where id = ?').run(accountId)
  }
  const left = session.accountIds.filter((id) => id !== accountId).length
  if (!left) conn.prepare('delete from sessions where token_hash = ?').run(session.hash)
  return left
}

export const notSignedIn = () => Response.json({ error: 'Connect your email again to keep going.' }, { status: 401 })
