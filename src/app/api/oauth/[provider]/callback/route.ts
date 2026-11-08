import { NextResponse, type NextRequest } from 'next/server'
import { apiUser } from '@/lib/auth'
import { saveAccount } from '@/lib/accounts'
import { encrypt } from '@/lib/crypto'
import { emailFromIdToken, redirectUri, tokenRequest } from '@/lib/oauth'
import { providers } from '@/lib/providers'

export async function GET(req: NextRequest, ctx: RouteContext<'/api/oauth/[provider]/callback'>) {
  const { provider } = await ctx.params
  const user = apiUser(req)
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const done = (path: string) => {
    const res = NextResponse.redirect(new URL(path, req.url))
    res.cookies.delete('hm_oauth')
    return res
  }

  let saved: { state?: string; verifier?: string; provider?: string } = {}
  try {
    saved = JSON.parse(req.cookies.get('hm_oauth')?.value ?? '{}')
  } catch {}

  const query = req.nextUrl.searchParams
  if (query.get('error')) return done('/connect?error=denied')
  const code = query.get('code')
  if (!code || !saved.verifier || query.get('state') !== saved.state || saved.provider !== provider) return done('/connect?error=expired')

  const { ok, data } = await tokenRequest(provider, {
    grant_type: 'authorization_code',
    code,
    code_verifier: saved.verifier,
    redirect_uri: redirectUri(provider, req.nextUrl.origin),
  })
  if (!ok || !data.refresh_token || !data.id_token) return done('/connect?error=token')
  const email = emailFromIdToken(data.id_token)
  if (!email) return done('/connect?error=token')

  const p = providers[provider]
  const consumerOutlook = provider === 'microsoft' && /^(outlook|hotmail|live|msn|passport)\./.test(email.split('@')[1])
  saveAccount(user.id, {
    email,
    provider,
    auth: 'oauth',
    imapHost: p.imap![0],
    imapPort: p.imap![1],
    smtpHost: consumerOutlook ? 'smtp-mail.outlook.com' : p.smtp![0],
    smtpPort: p.smtp![1],
    login: email,
    secret: encrypt(data.refresh_token),
    accessToken: encrypt(data.access_token),
    accessExpires: Date.now() + data.expires_in * 1000,
  })
  return done('/')
}
