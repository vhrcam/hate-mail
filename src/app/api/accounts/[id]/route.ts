import type { NextRequest } from 'next/server'
import { apiUser, notSignedIn } from '@/lib/auth'
import { db, getAccount, removeOrphanSenders } from '@/lib/db'

export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/accounts/[id]'>) {
  const user = apiUser(req)
  if (!user) return notSignedIn()
  const account = getAccount(user.id, Number((await ctx.params).id))
  if (!account) return Response.json({ error: 'Account not found.' }, { status: 404 })
  const label = String((await req.json()).label ?? '').trim().slice(0, 40)
  db().prepare('update accounts set label = ? where id = ?').run(label || null, account.id)
  return Response.json({ ok: true })
}

export async function DELETE(req: NextRequest, ctx: RouteContext<'/api/accounts/[id]'>) {
  const user = apiUser(req)
  if (!user) return notSignedIn()
  const account = getAccount(user.id, Number((await ctx.params).id))
  if (!account) return Response.json({ error: 'Account not found.' }, { status: 404 })
  db().prepare('delete from accounts where id = ?').run(account.id)
  removeOrphanSenders(user.id)
  return Response.json({ ok: true })
}
