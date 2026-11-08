import crypto from 'node:crypto'
import { db, type Account } from './db'
import { decrypt, encrypt } from './crypto'

export function oauthConfig(name: string) {
  if (name === 'google') {
    return {
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: 'openid email https://mail.google.com/',
      params: { access_type: 'offline', prompt: 'consent' } as Record<string, string>,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }
  }
  if (name === 'microsoft') {
    return {
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scope: 'openid email offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send',
      params: { prompt: 'select_account' } as Record<string, string>,
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    }
  }
}

export function oauthReady(name: string) {
  const config = oauthConfig(name)
  return !!(config?.clientId && config.clientSecret)
}

export const redirectUri = (name: string, origin: string) => `${process.env.APP_URL ?? origin}/api/oauth/${name}/callback`

export function pkce() {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export async function tokenRequest(name: string, params: Record<string, string>) {
  const config = oauthConfig(name)!
  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId!, client_secret: config.clientSecret!, ...params }),
  })
  return { ok: res.ok, data: await res.json() }
}

export function emailFromIdToken(idToken: string) {
  const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'))
  return String(payload.email ?? payload.preferred_username ?? '').toLowerCase()
}

export async function accessToken(account: Account) {
  if (account.access_token && (account.access_expires ?? 0) > Date.now() + 120_000) return decrypt(account.access_token)

  const extra: Record<string, string> = account.provider === 'microsoft' ? { scope: oauthConfig('microsoft')!.scope } : {}
  const { ok, data } = await tokenRequest(account.provider, { grant_type: 'refresh_token', refresh_token: decrypt(account.secret), ...extra })
  if (!ok) {
    if (data.error === 'invalid_grant') db().prepare('update accounts set needs_reconnect = 1 where id = ?').run(account.id)
    throw new Error(data.error === 'invalid_grant' ? 'This account needs to be reconnected.' : `Sign-in refresh failed (${data.error}).`)
  }

  db()
    .prepare('update accounts set access_token = ?, access_expires = ?, secret = ? where id = ?')
    .run(encrypt(data.access_token), Date.now() + data.expires_in * 1000, data.refresh_token ? encrypt(data.refresh_token) : account.secret, account.id)
  return data.access_token as string
}
