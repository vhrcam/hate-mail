import type { NextRequest } from 'next/server'
import { apiUser, notSignedIn } from '@/lib/auth'
import { getAccount } from '@/lib/db'
import { errorText } from '@/lib/mail'
import { scanAccount } from '@/lib/scan'

export async function POST(req: NextRequest, ctx: RouteContext<'/api/accounts/[id]/scan'>) {
  const user = apiUser(req)
  if (!user) return notSignedIn()
  const id = Number((await ctx.params).id)
  const account = getAccount(user.id, id)
  if (!account) return Response.json({ error: 'Account not found.' }, { status: 404 })
  if (account.needs_reconnect) return Response.json({ error: 'Reconnect this account to keep scanning.', reconnect: true }, { status: 409 })

  try {
    return Response.json(await scanAccount(account))
  } catch (e) {
    const reconnect = !!getAccount(user.id, id)?.needs_reconnect
    return Response.json({ error: errorText(e), reconnect }, { status: 502 })
  }
}
