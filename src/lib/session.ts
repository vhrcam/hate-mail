import { cookies } from 'next/headers'
import { connection, type NextRequest } from 'next/server'
import { all, batch, get, run } from './db'
import { randomToken, sha256 } from './crypto'

export const SESSION_COOKIE = 'hm_session'
const MAX_AGE = 400 * 24 * 60 * 60
const KEEP = 90 * 24 * 60 * 60 * 1000

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

async function load(token?: string): Promise<Session | null> {
  if (!token) return null
  const hash = sha256(token)
  const row = await get<{ expires_at: number }>('select expires_at from sessions where token_hash = ?', hash)
  if (!row || row.expires_at < Date.now()) return null
  const rows = await all<{ account_id: number }>('select account_id from session_accounts where token_hash = ? order by added_at', hash)
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

export async function apiSession(req: NextRequest) {
  if (req.method !== 'GET' && !sameOrigin(req)) return null
  return load(req.cookies.get(SESSION_COOKIE)?.value)
}

const unused = 'select id from accounts where id not in (select account_id from session_accounts) and coalesce(scanned_at, created_at) < ?'

export async function signIn(req: NextRequest, accountId: number) {
  const now = Date.now()
  let token = (await load(req.cookies.get(SESSION_COOKIE)?.value))?.token
  const create: [string, (string | number)[]][] = []
  if (!token) {
    token = randomToken()
    create.push(['insert into sessions (token_hash, expires_at) values (?, ?)', [sha256(token), now + MAX_AGE * 1000]])
  }
  await batch([
    ...create,
    ['insert or ignore into session_accounts (token_hash, account_id, added_at) values (?, ?, ?)', [sha256(token), accountId, now]],
    ['delete from session_accounts where token_hash in (select token_hash from sessions where expires_at < ?)', [now]],
    ['delete from sessions where expires_at < ?', [now]],
    [`delete from senders where account_id in (${unused})`, [now - KEEP]],
    [`delete from accounts where id in (${unused})`, [now - KEEP]],
  ])
  return token
}

export async function extendSession(session: Session) {
  await run('update sessions set expires_at = ? where token_hash = ?', Date.now() + MAX_AGE * 1000, session.hash)
}

export async function signOut(session: Session, accountId: number) {
  await run('delete from session_accounts where token_hash = ? and account_id = ?', session.hash, accountId)
  if (!(await get('select 1 from session_accounts where account_id = ?', accountId))) {
    await run(`update accounts set secret = '', access_token = null, access_expires = null, needs_reconnect = 1 where id = ?`, accountId)
  }
  const left = session.accountIds.filter((id) => id !== accountId).length
  if (!left) await run('delete from sessions where token_hash = ?', session.hash)
  return left
}

export const notSignedIn = () => Response.json({ error: 'Connect your email again to keep going.' }, { status: 401 })
