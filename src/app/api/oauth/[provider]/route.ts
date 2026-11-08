import { NextResponse, type NextRequest } from 'next/server'
import { randomToken } from '@/lib/crypto'
import { oauthConfig, oauthReady, pkce, redirectUri } from '@/lib/oauth'

export async function GET(req: NextRequest, ctx: RouteContext<'/api/oauth/[provider]'>) {
  const { provider } = await ctx.params
  const config = oauthConfig(provider)
  if (!config || !oauthReady(provider)) return NextResponse.redirect(new URL('/connect?error=setup', req.url))

  const state = randomToken()
  const { verifier, challenge } = pkce()
  const url = new URL(config.authUrl)
  const params: Record<string, string> = {
    client_id: config.clientId!,
    redirect_uri: redirectUri(provider, req.nextUrl.origin),
    response_type: 'code',
    scope: config.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...config.params,
  }
  const hint = req.nextUrl.searchParams.get('email')
  if (hint) params.login_hint = hint
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

  const res = NextResponse.redirect(url)
  res.cookies.set({
    name: 'hm_oauth',
    value: JSON.stringify({ state, verifier, provider }),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  })
  return res
}
