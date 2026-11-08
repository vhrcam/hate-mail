import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { checkPassword, newSession, sameOrigin, sessionCookie } from '@/lib/auth'

const attempts = new Map<string, { count: number; until: number }>()

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Bad request.' }, { status: 403 })
  const body = await req.json()
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')

  const tries = attempts.get(email)
  const recent = tries && tries.until > Date.now() ? tries.count : 0
  if (recent >= 10) return NextResponse.json({ error: 'Too many tries. Wait 15 minutes and try again.' }, { status: 429 })

  const user = db().prepare('select id, password_hash from users where email = ?').get(email) as { id: number; password_hash: string } | undefined
  if (!user || !checkPassword(password, user.password_hash)) {
    attempts.set(email, { count: recent + 1, until: Date.now() + 15 * 60 * 1000 })
    return NextResponse.json({ error: 'Wrong email or password.' }, { status: 400 })
  }

  attempts.delete(email)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(sessionCookie(newSession(user.id)))
  return res
}
