import type { NextRequest } from 'next/server'
import { apiUser, notSignedIn } from '@/lib/auth'
import { unsubscribe } from '@/lib/unsubscribe'

export async function POST(req: NextRequest) {
  const user = apiUser(req)
  if (!user) return notSignedIn()
  const body = await req.json()
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isInteger).slice(0, 1000)
  const opened = (Array.isArray(body.opened) ? body.opened : []).map(String)
  if (!ids.length) return Response.json({ error: 'Pick at least one sender.' }, { status: 400 })
  return Response.json(await unsubscribe(user.id, ids, opened))
}
