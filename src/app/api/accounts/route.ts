import { NextResponse, type NextRequest } from 'next/server'
import { saveAccount } from '@/lib/accounts'
import { encrypt } from '@/lib/crypto'
import { errorText, imapClient } from '@/lib/mail'
import { publicHost } from '@/lib/net'
import { providers } from '@/lib/providers'
import { sameOrigin, sessionCookie, signIn } from '@/lib/session'

const hostPattern = /^[a-z0-9.-]+\.[a-z]{2,}$|^localhost$/
const validPort = (n: number) => Number.isInteger(n) && n > 0 && n < 65536
const failures = new Map<string, { count: number; until: number }>()

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Bad request.' }, { status: 403 })
  const b = await req.json()
  const email = String(b.email ?? '').trim().toLowerCase()
  const provider = providers[b.provider] ? String(b.provider) : 'other'
  const password = provider === 'google' ? String(b.password ?? '').replace(/\s+/g, '') : String(b.password ?? '').trim()
  const imapHost = String(b.imapHost ?? '').trim().toLowerCase()
  const imapPort = Number(b.imapPort)
  const smtpHost = String(b.smtpHost ?? '').trim().toLowerCase()
  const smtpPort = Number(b.smtpPort)
  const username = String(b.username ?? '').trim()

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  if (!password) return NextResponse.json({ error: 'Enter the password.' }, { status: 400 })
  if (!hostPattern.test(imapHost) || !validPort(imapPort)) return NextResponse.json({ error: 'Check the incoming server settings.' }, { status: 400 })
  if (smtpHost && (!hostPattern.test(smtpHost) || !validPort(smtpPort))) return NextResponse.json({ error: 'Check the outgoing server settings.' }, { status: 400 })
  if (!(await publicHost(imapHost)) || (smtpHost && !(await publicHost(smtpHost)))) {
    return NextResponse.json({ error: 'That server address isn’t allowed.' }, { status: 400 })
  }

  const tries = failures.get(email)
  const recent = tries && tries.until > Date.now() ? tries.count : 0
  if (recent >= 10) return NextResponse.json({ error: 'Too many tries. Wait 15 minutes and try again.' }, { status: 429 })

  const logins = username ? [username] : provider === 'icloud' ? [email, email.split('@')[0]] : [email]
  let login = ''
  let failure = ''
  for (const candidate of logins) {
    const client = imapClient(imapHost, imapPort, { user: candidate, pass: password })
    try {
      await client.connect()
      await client.logout()
      login = candidate
      break
    } catch (e) {
      failure = errorText(e)
      client.close()
    }
  }
  if (!login) {
    failures.set(email, { count: recent + 1, until: Date.now() + 15 * 60 * 1000 })
    const hint = provider === 'other' ? 'Check the password and server settings.' : 'Check that you pasted an app password, not your normal password.'
    return NextResponse.json({ error: `Couldn’t sign in. ${hint} (${failure})` }, { status: 400 })
  }
  failures.delete(email)

  const id = await saveAccount({
    email,
    provider,
    auth: 'password',
    imapHost,
    imapPort,
    smtpHost: smtpHost || null,
    smtpPort: smtpHost ? smtpPort : null,
    login,
    secret: encrypt(password),
  })
  const res = NextResponse.json({ id })
  res.cookies.set(sessionCookie(await signIn(req, id)))
  return res
}
