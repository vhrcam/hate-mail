import type { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { db, getAccount, type Account } from './db'
import { unsubscribeLinkFromHtml, unsubscribeLinkFromText, unsubscribeLinks } from './headers'
import { mailFolders, openImap, sendMail } from './mail'
import { safePost } from './net'
import { listSenders, needsUnsubscribe, rowMethod, senderRows, type SenderRow } from './senders'

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items]
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!)
  }))
}

function setRow(id: number, column: 'done_at' | 'auto_failed', value: number) {
  db().prepare(`update senders set ${column} = ? where id = ?`).run(value, id)
}

function parseMailto(url: string) {
  const target = new URL(url)
  const to = decodeURIComponent(target.pathname).split(',')[0].trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return null
  return {
    to,
    subject: target.searchParams.get('subject') || 'Unsubscribe',
    text: target.searchParams.get('body') || 'Please unsubscribe me from this list.',
  }
}

async function automatic(account: Account, row: SenderRow) {
  const links = unsubscribeLinks(row.unsub_header, !!row.unsub_post)
  if (links.oneClick) {
    const status = await safePost(links.https!, 'List-Unsubscribe=One-Click').catch(() => 0)
    if (status >= 200 && status < 400) return true
  }
  const email = links.mailto ? parseMailto(links.mailto) : null
  if (email && account.smtp_host) {
    try {
      await sendMail(account, email)
      return true
    } catch {}
  }
  return false
}

export async function unsubscribe(accountId: number, ids: number[], opened: string[] = []) {
  const account = getAccount(accountId)!
  const rows = senderRows(accountId, ids).filter(needsUnsubscribe)
  const failed: number[] = []

  await pool(rows, 6, async (row) => {
    const method = rowMethod(row)
    if (method.kind === 'auto') {
      if (await automatic(account, row)) setRow(row.id, 'done_at', Date.now())
      else {
        setRow(row.id, 'auto_failed', 1)
        failed.push(row.id)
      }
    } else if (method.kind === 'link' && opened.includes(method.url)) {
      setRow(row.id, 'done_at', Date.now())
    }
  })

  return { senders: listSenders(accountId, ids), failed }
}

async function linkFromMessage(client: ImapFlow, folder: string, uid: number) {
  const lock = await client.getMailboxLock(folder, { readOnly: true })
  try {
    const message = await client.fetchOne(String(uid), { source: true }, { uid: true })
    if (!message || !message.source) return null
    const parsed = await simpleParser(message.source)
    return (parsed.html ? unsubscribeLinkFromHtml(parsed.html) : null) ?? unsubscribeLinkFromText(parsed.text ?? '')
  } finally {
    lock.release()
  }
}

async function newestFrom(client: ImapFlow, address: string) {
  const { scan } = await mailFolders(client)
  for (const folder of scan) {
    const lock = await client.getMailboxLock(folder, { readOnly: true })
    let newest = 0
    try {
      const uids = ((await client.search({ from: address }, { uid: true })) || []).sort((a, b) => b - a).slice(0, 50)
      if (uids.length) {
        for await (const m of client.fetch(uids.join(','), { uid: true, envelope: true }, { uid: true })) {
          if (m.envelope?.from?.[0]?.address?.toLowerCase() === address) newest = Math.max(newest, m.uid)
        }
      }
    } finally {
      lock.release()
    }
    if (newest) return { folder, uid: newest }
  }
}

export async function findLink(accountId: number, senderId: number) {
  const row = senderRows(accountId, [senderId]).find((r) => needsUnsubscribe(r) && rowMethod(r).kind === 'find')
  if (!row) return { error: 'There’s nothing left to unsubscribe from here.' }

  const client = await openImap(getAccount(accountId)!)
  let url: string | null = null
  try {
    url = await linkFromMessage(client, row.latest_folder, row.latest_uid).catch(() => null)
    if (!url) {
      const newest = await newestFrom(client, row.address)
      if (newest) url = await linkFromMessage(client, newest.folder, newest.uid)
    }
  } finally {
    await client.logout().catch(() => client.close())
  }

  if (!url) return { error: `Couldn’t find an unsubscribe link in ${row.name || row.address}’s latest email.` }
  setRow(row.id, 'done_at', Date.now())
  return { url, senders: listSenders(accountId, [senderId]) }
}
