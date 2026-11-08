import { NextResponse, type NextRequest } from 'next/server'
import { apiSession, notSignedIn, SESSION_COOKIE, signOut } from '@/lib/session'

export async function DELETE(req: NextRequest, ctx: RouteContext<'/api/accounts/[id]'>) {
  const session = apiSession(req)
  const id = Number((await ctx.params).id)
  if (!session || !session.accountIds.includes(id)) return notSignedIn()

  const left = signOut(session, id)
  const res = NextResponse.json({ left })
  if (!left) res.cookies.delete(SESSION_COOKIE)
  return res
}
