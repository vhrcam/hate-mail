import dns from 'node:dns/promises'

export type Provider = {
  id: string
  name: string
  imap?: [string, number]
  smtp?: [string, number]
  oauth?: 'google' | 'microsoft'
  help?: string[]
  helpUrl?: string
  unsupported?: string
}

export const providers: Record<string, Provider> = {
  google: {
    id: 'google',
    name: 'Gmail',
    imap: ['imap.gmail.com', 993],
    smtp: ['smtp.gmail.com', 465],
    oauth: 'google',
    help: [
      'Turn on 2-Step Verification in your Google Account if it is not on already.',
      'Open the App passwords page in your Google Account.',
      'Create one named Hate Mail and paste the 16-letter password here.',
    ],
    helpUrl: 'https://myaccount.google.com/apppasswords',
  },
  microsoft: {
    id: 'microsoft',
    name: 'Outlook',
    imap: ['outlook.office365.com', 993],
    smtp: ['smtp.office365.com', 587],
    oauth: 'microsoft',
  },
  icloud: {
    id: 'icloud',
    name: 'iCloud Mail',
    imap: ['imap.mail.me.com', 993],
    smtp: ['smtp.mail.me.com', 587],
    help: [
      'Sign in at account.apple.com.',
      'Open Sign-In and Security, then App-Specific Passwords.',
      'Create one named Hate Mail and paste it here.',
    ],
    helpUrl: 'https://account.apple.com/account/manage',
  },
  yahoo: {
    id: 'yahoo',
    name: 'Yahoo Mail',
    imap: ['imap.mail.yahoo.com', 993],
    smtp: ['smtp.mail.yahoo.com', 465],
    help: [
      'Open your Yahoo Account Security page.',
      'Choose Generate app password.',
      'Name it Hate Mail and paste the password here.',
    ],
    helpUrl: 'https://login.yahoo.com/account/security',
  },
  aol: {
    id: 'aol',
    name: 'AOL Mail',
    imap: ['imap.aol.com', 993],
    smtp: ['smtp.aol.com', 465],
    help: [
      'Open your AOL Account Security page.',
      'Choose Generate app password.',
      'Name it Hate Mail and paste the password here.',
    ],
    helpUrl: 'https://login.aol.com/account/security',
  },
  zoho: {
    id: 'zoho',
    name: 'Zoho Mail',
    imap: ['imap.zoho.com', 993],
    smtp: ['smtp.zoho.com', 465],
    help: [
      'In Zoho Mail settings, make sure IMAP access is on.',
      'If you use two-factor sign-in, create an app password in Zoho Accounts under Security.',
    ],
    helpUrl: 'https://accounts.zoho.com/home#security/app_password',
  },
  fastmail: {
    id: 'fastmail',
    name: 'Fastmail',
    imap: ['imap.fastmail.com', 993],
    smtp: ['smtp.fastmail.com', 465],
    help: [
      'In Fastmail, open Settings, then Privacy & Security, then Manage app passwords.',
      'Create one with IMAP and SMTP access and paste it here.',
    ],
    helpUrl: 'https://app.fastmail.com/settings/security/apps',
  },
  proton: {
    id: 'proton',
    name: 'Proton Mail',
    unsupported: 'Proton Mail only lets other apps in through Proton Bridge, a desktop app, so Hate Mail can’t connect to it from the web.',
  },
}

const byDomain: [RegExp, string][] = [
  [/^(gmail|googlemail)\.com$/, 'google'],
  [/^(outlook|hotmail|live|msn|passport)\.[a-z.]+$/, 'microsoft'],
  [/^(icloud|me|mac)\.com$/, 'icloud'],
  [/^(yahoo|ymail|rocketmail)\.[a-z.]+$/, 'yahoo'],
  [/^(aol|aim)\.com$/, 'aol'],
  [/^(zoho|zohomail)\.com$/, 'zoho'],
  [/^fastmail\.(com|fm)$/, 'fastmail'],
  [/^(proton\.me|protonmail\.com|protonmail\.ch|pm\.me)$/, 'proton'],
]

const byMx: [RegExp, string][] = [
  [/(^|\.)(google|googlemail)\.com$/, 'google'],
  [/(^|\.)(outlook|office365)\.com$/, 'microsoft'],
  [/(^|\.)icloud\.com$/, 'icloud'],
  [/(^|\.)yahoodns\.net$/, 'yahoo'],
  [/(^|\.)zoho\.com$/, 'zoho'],
  [/(^|\.)messagingengine\.com$/, 'fastmail'],
  [/(^|\.)protonmail\.ch$/, 'proton'],
]

export function providerForDomain(domain: string) {
  return byDomain.find(([re]) => re.test(domain))?.[1]
}

export function providerForMx(hosts: string[]) {
  for (const host of hosts) {
    const match = byMx.find(([re]) => re.test(host.toLowerCase().replace(/\.$/, '')))
    if (match) return match[1]
  }
}

async function autoconfig(domain: string) {
  try {
    const res = await fetch(`https://autoconfig.thunderbird.net/v1.1/${domain}`, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const xml = await res.text()
    const server = (type: string) => {
      const block = xml.match(new RegExp(`<(?:incoming|outgoing)Server type="${type}">([\\s\\S]*?)</(?:incoming|outgoing)Server>`))?.[1]
      const host = block?.match(/<hostname>([^<]+)<\/hostname>/)?.[1].replace('%EMAILDOMAIN%', domain)
      const port = Number(block?.match(/<port>(\d+)<\/port>/)?.[1])
      return host && port ? ([host, port] as [string, number]) : undefined
    }
    return { imap: server('imap'), smtp: server('smtp') }
  } catch {
    return null
  }
}

export async function detect(email: string) {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  let id = providerForDomain(domain)
  if (!id) {
    const mx = await dns.resolveMx(domain).catch(() => [])
    id = providerForMx(mx.map((m) => m.exchange))
  }
  if (id) return providers[id]

  const found = await autoconfig(domain)
  return {
    id: 'other',
    name: domain,
    imap: found?.imap ?? [`imap.${domain}`, 993],
    smtp: found?.smtp ?? [`smtp.${domain}`, 465],
    help: ['Use your email password, or an app password if your provider requires one.', 'Check the server settings below if sign-in fails.'],
  } as Provider
}
