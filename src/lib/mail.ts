import { AuthenticationFailure, ImapFlow } from 'imapflow'
import nodemailer from 'nodemailer'
import { db, type Account } from './db'
import { decrypt } from './crypto'
import { accessToken } from './oauth'

type ImapAuth = { user: string; pass?: string; accessToken?: string }

export function imapClient(host: string, port: number, auth: ImapAuth) {
  const client = new ImapFlow({ host, port, secure: port === 993, auth, logger: false, disableAutoIdle: true })
  client.on('error', () => {})
  return client
}

export async function openImap(account: Account) {
  const auth = account.auth === 'oauth' ? { user: account.login, accessToken: await accessToken(account) } : { user: account.login, pass: decrypt(account.secret) }
  const client = imapClient(account.imap_host, account.imap_port, auth)
  try {
    await client.connect()
  } catch (e) {
    if (e instanceof AuthenticationFailure) {
      db().prepare('update accounts set needs_reconnect = 1 where id = ?').run(account.id)
      throw new Error('This account needs to be reconnected.')
    }
    throw e
  }
  return client
}

export function errorText(e: unknown) {
  const err = e as { responseText?: string; message?: string }
  return err.responseText || err.message || 'Something went wrong.'
}

const skipNames = /^(sent|sent items|sent mail|sent messages|drafts?|trash|bin|deleted|deleted items|deleted messages|junk|junk e-?mail|spam|bulk|bulk mail|outbox|notes|conversation history|sync issues|scheduled)$/i

export async function mailFolders(client: ImapFlow) {
  const list = await client.list()
  const all = list.find((f) => f.specialUse === '\\All')
  const scan = all
    ? [all.path]
    : list
        .filter((f) => !f.flags.has('\\Noselect') && !f.flags.has('\\NonExistent'))
        .filter((f) => !f.specialUse || f.specialUse === '\\Inbox' || f.specialUse === '\\Archive')
        .filter((f) => !skipNames.test(f.name))
        .map((f) => f.path)
  return { scan }
}

export async function sendMail(account: Account, message: { to: string; subject: string; text: string }) {
  if (!account.smtp_host || !account.smtp_port) throw new Error('No outgoing mail server for this account.')
  const auth =
    account.auth === 'oauth'
      ? { type: 'OAuth2' as const, user: account.login, accessToken: await accessToken(account) }
      : { user: account.login, pass: decrypt(account.secret) }
  const transport = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_port === 465,
    auth,
    connectionTimeout: 15000,
  })
  try {
    await transport.sendMail({ from: account.email, ...message })
  } finally {
    transport.close()
  }
}
