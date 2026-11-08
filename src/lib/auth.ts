import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { connection, type NextRequest } from 'next/server'
import { db } from './db'
import { randomToken, sha256 } from './crypto'

export const SESSION_COOKIE = 'hm_session'
const MAX_AGE = 400 * 24 * 60 * 60

export type User = { id: number; email: string }

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64)
  return `${salt.toString('base64')}:${hash.toString('base64')}`
}

export function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':').map((s) => Buffer.from(s, 'base64'))
  return crypto.timingSafeEqual(crypto.scryptSync(password, salt, 64), hash)
}

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

export function newSession(userId: number) {
  const token = randomToken()
  db().prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)').run(sha256(token), userId, Date.now() + MAX_AGE * 1000)
  return token
}

export function extendSession(token: string) {
  db().prepare('update sessions set expires_at = ? where token_hash = ?').run(Date.now() + MAX_AGE * 1000, sha256(token))
}

export function endSession(token?: string) {
  if (token) db().prepare('delete from sessions where token_hash = ?').run(sha256(token))
}

function userFromToken(token?: string) {
  if (!token) return null
  const row = db()
    .prepare('select u.id, u.email, s.expires_at from sessions s join users u on u.id = s.user_id where s.token_hash = ?')
    .get(sha256(token)) as (User & { expires_at: number }) | undefined
  if (!row || row.expires_at < Date.now()) return null
  return { id: row.id, email: row.email }
}

export async function currentUser() {
  await connection()
  return userFromToken((await cookies()).get(SESSION_COOKIE)?.value)
}

export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin')
  return !!origin && new URL(origin).host === req.headers.get('host')
}

export function apiUser(req: NextRequest) {
  if (req.method !== 'GET' && !sameOrigin(req)) return null
  return userFromToken(req.cookies.get(SESSION_COOKIE)?.value)
}

export const notSignedIn = () => Response.json({ error: 'You need to sign in again.' }, { status: 401 })
