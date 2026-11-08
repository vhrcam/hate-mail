import type { NextRequest } from 'next/server'
import { apiUser, notSignedIn } from '@/lib/auth'
import { errorText } from '@/lib/mail'
import { findLink } from '@/lib/unsubscribe'

export async function POST(req: NextRequest) {
  const user = apiUser(req)
  if (!user) return notSignedIn()
  const id = Number((await req.json()).id)
  try {
    const result = await findLink(user.id, id)
    return Response.json(result, { status: result.error ? 404 : 200 })
  } catch (e) {
    return Response.json({ error: errorText(e) }, { status: 502 })
  }
}
