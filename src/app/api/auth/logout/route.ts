import { NextResponse, type NextRequest } from 'next/server'
import { endSession, sameOrigin, SESSION_COOKIE } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Bad request.' }, { status: 403 })
  endSession(req.cookies.get(SESSION_COOKIE)?.value)
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(SESSION_COOKIE)
  return res
}
