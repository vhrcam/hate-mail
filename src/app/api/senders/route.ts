import { NextResponse, type NextRequest } from 'next/server'
import { apiUser, extendSession, notSignedIn, SESSION_COOKIE, sessionCookie } from '@/lib/auth'
import { listAccounts } from '@/lib/accounts'
import { listSenders } from '@/lib/senders'

export async function GET(req: NextRequest) {
  const user = apiUser(req)
  if (!user) return notSignedIn()

  const res = NextResponse.json({ senders: listSenders(user.id), accounts: listAccounts(user.id) })
  const token = req.cookies.get(SESSION_COOKIE)!.value
  extendSession(token)
  res.cookies.set(sessionCookie(token))
  return res
}
