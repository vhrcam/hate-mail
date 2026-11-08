import type { NextRequest } from 'next/server'
import { apiUser, notSignedIn } from '@/lib/auth'
import { cleanSenders } from '@/lib/clean'

export async function POST(req: NextRequest) {
  const user = apiUser(req)
  if (!user) return notSignedIn()
  const body = await req.json()
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isInteger).slice(0, 1000)
  if (!ids.length) return Response.json({ error: 'Pick at least one sender.' }, { status: 400 })
  if (body.action !== 'trash' && body.action !== 'archive') return Response.json({ error: 'Unknown action.' }, { status: 400 })
  return Response.json(await cleanSenders(user.id, ids, body.action))
}
