import type { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { db, getAccount } from './db'
import { unsubscribeLinkFromHtml, unsubscribeLinkFromText, unsubscribeLinks } from './headers'
import { mailFolders, openImap, sendMail } from './mail'
import { safePost } from './net'
import { isStale, listSenders, needsUnsubscribe, rowMethod, senderRows, type SenderRow } from './senders'

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items]
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!)
  }))
}

function setRow(row: SenderRow, column: 'done_at' | 'auto_failed', value: number) {
  db().prepare(`update sender_accounts set ${column} = ? where sender_id = ? and account_id = ?`).run(value, row.sender_id, row.account_id)
}

function refreshSender(userId: number, senderId: number) {
  const rows = senderRows(userId, [senderId])
  const allDone = rows.length > 0 && rows.every((r) => r.done_at && !isStale(r))
  db().prepare('update senders set unsubscribed_at = ? where id = ?').run(allDone ? (rows[0].unsubscribed_at ?? Date.now()) : null, senderId)
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

async function automatic(userId: number, row: SenderRow) {
  const links = unsubscribeLinks(row.unsub_header, !!row.unsub_post)
  if (links.oneClick) {
    const status = await safePost(links.https!, 'List-Unsubscribe=One-Click').catch(() => 0)
    if (status >= 200 && status < 400) return true
  }
  const email = links.mailto ? parseMailto(links.mailto) : null
  const account = getAccount(userId, row.account_id)
  if (email && account?.smtp_host) {
    try {
      await sendMail(account, email)
      return true
    } catch {}
  }
  return false
}

export async function unsubscribe(userId: number, ids: number[], opened: string[] = []) {
  const rows = senderRows(userId, ids).filter(needsUnsubscribe)
  const failed = new Set<number>()

  await pool(rows, 6, async (row) => {
    const method = rowMethod(row)
    if (method.kind === 'auto') {
      if (await automatic(userId, row)) setRow(row, 'done_at', Date.now())
      else {
        setRow(row, 'auto_failed', 1)
        failed.add(row.id)
      }
    } else if (method.kind === 'link' && opened.includes(method.url)) {
      setRow(row, 'done_at', Date.now())
    }
  })

  for (const id of new Set(rows.map((r) => r.id))) refreshSender(userId, id)
  return { senders: listSenders(userId, ids), failed: [...failed] }
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

export async function findLink(userId: number, senderId: number) {
  const row = senderRows(userId, [senderId]).filter(needsUnsubscribe).find((r) => rowMethod(r).kind === 'find')
  if (!row) return { error: 'There’s nothing left to unsubscribe from here.' }

  const client = await openImap(getAccount(userId, row.account_id)!)
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
  setRow(row, 'done_at', Date.now())
  refreshSender(userId, senderId)
  return { url, senders: listSenders(userId, [senderId]) }
}
