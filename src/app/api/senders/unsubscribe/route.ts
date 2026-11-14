import type { NextRequest } from 'next/server'
import { apiSession, notSignedIn } from '@/lib/session'
import { unsubscribe } from '@/lib/unsubscribe'

export async function POST(req: NextRequest) {
  const session = await apiSession(req)
  const body = await req.json()
  const account = Number(body.account)
  if (!session || !session.accountIds.includes(account)) return notSignedIn()

  const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isInteger).slice(0, 1000)
  const opened = (Array.isArray(body.opened) ? body.opened : []).map(String)
  if (!ids.length) return Response.json({ error: 'Pick at least one sender.' }, { status: 400 })
  return Response.json(await unsubscribe(account, ids, opened))
}
