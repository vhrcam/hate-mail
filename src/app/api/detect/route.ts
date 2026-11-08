import type { NextRequest } from 'next/server'
import { detect } from '@/lib/providers'
import { oauthReady } from '@/lib/oauth'
import { sameOrigin } from '@/lib/session'

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return Response.json({ error: 'Bad request.' }, { status: 403 })
  const email = String((await req.json()).email ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(email)) return Response.json({ error: 'Enter a valid email address.' }, { status: 400 })

  const p = await detect(email)
  return Response.json({
    email,
    id: p.id,
    name: p.name,
    oauth: p.oauth ?? null,
    oauthReady: p.oauth ? oauthReady(p.oauth) : false,
    appPassword: !p.unsupported && p.id !== 'microsoft',
    imapHost: p.imap?.[0] ?? '',
    imapPort: p.imap?.[1] ?? 993,
    smtpHost: p.smtp?.[0] ?? '',
    smtpPort: p.smtp?.[1] ?? 465,
    help: p.help ?? [],
    helpUrl: p.helpUrl ?? null,
    unsupported: p.unsupported ?? null,
  })
}
