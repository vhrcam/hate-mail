import type { NextRequest } from 'next/server'
import { errorText } from '@/lib/mail'
import { senderAccount } from '@/lib/senders'
import { apiSession, notSignedIn } from '@/lib/session'
import { findLink } from '@/lib/unsubscribe'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await apiSession(req)
  const id = Number((await req.json()).id)
  const account = await senderAccount(id)
  if (!session || !account || !session.accountIds.includes(account)) return notSignedIn()

  try {
    const result = await findLink(account, id)
    return Response.json(result, { status: result.error ? 404 : 200 })
  } catch (e) {
    return Response.json({ error: errorText(e) }, { status: 502 })
  }
}
