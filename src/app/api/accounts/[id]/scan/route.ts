import type { NextRequest } from 'next/server'
import { getAccount } from '@/lib/db'
import { errorText } from '@/lib/mail'
import { scanAccount } from '@/lib/scan'
import { apiSession, notSignedIn } from '@/lib/session'

export const maxDuration = 60

export async function POST(req: NextRequest, ctx: RouteContext<'/api/accounts/[id]/scan'>) {
  const session = await apiSession(req)
  const id = Number((await ctx.params).id)
  if (!session || !session.accountIds.includes(id)) return notSignedIn()
  const account = await getAccount(id)
  if (!account) return notSignedIn()
  if (account.needs_reconnect) return Response.json({ error: 'Reconnect this account to keep scanning.', reconnect: true }, { status: 409 })

  try {
    return Response.json(await scanAccount(account))
  } catch (e) {
    return Response.json({ error: errorText(e), reconnect: !!(await getAccount(id))?.needs_reconnect }, { status: 502 })
  }
}
