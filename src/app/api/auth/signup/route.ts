import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, newSession, sameOrigin, sessionCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Bad request.' }, { status: 403 })
  const body = await req.json()
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Use at least 8 characters for your password.' }, { status: 400 })
  if (db().prepare('select 1 from users where email = ?').get(email)) {
    return NextResponse.json({ error: 'There is already an account with that email. Log in instead.' }, { status: 400 })
  }

  const { lastInsertRowid } = db().prepare('insert into users (email, password_hash, created_at) values (?, ?, ?)').run(email, hashPassword(password), Date.now())
  const res = NextResponse.json({ ok: true })
  res.cookies.set(sessionCookie(newSession(Number(lastInsertRowid))))
  return res
}
