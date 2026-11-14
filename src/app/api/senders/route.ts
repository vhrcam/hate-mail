import { NextResponse, type NextRequest } from 'next/server'
import { listAccounts } from '@/lib/accounts'
import { listSenders } from '@/lib/senders'
import { apiSession, extendSession, notSignedIn, sessionCookie } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = await apiSession(req)
  if (!session || !session.accountIds.length) return notSignedIn()

  const requested = Number(req.nextUrl.searchParams.get('account'))
  const account = session.accountIds.includes(requested) ? requested : session.accountIds[session.accountIds.length - 1]
  const res = NextResponse.json({ account, accounts: await listAccounts(session.accountIds), senders: await listSenders(account) })
  await extendSession(session)
  res.cookies.set(sessionCookie(session.token))
  return res
}
