import type { FetchMessageObject } from 'imapflow'
import { getDomain } from 'tldts'
import { db, removeOrphanSenders, type Account } from './db'
import { mailFolders, openImap } from './mail'
import { isBulk, isOneClickPost, parseHeaders } from './headers'
import { mergeMonths, monthKey, type Months } from './stats'

const HEADERS = ['list-unsubscribe', 'list-unsubscribe-post', 'list-id', 'precedence']
const BATCH = 500

type State = { folders: Record<string, { v: string; uid: number }>; scanned: number }

type Found = {
  name: string
  total: number
  opened: number
  first: number
  last: number
  months: Months
  folder: string
  uid: number
  unsub: string | null
  post: boolean
}

type Row = { total: number; opened: number; first_at: number; last_at: number; months: string; unsub_header: string | null }

const running = new Set<number>()

export async function scanAccount(account: Account, budgetMs = 20000) {
  if (running.has(account.id)) return { busy: true }
  running.add(account.id)
  try {
    return await scan(account, Date.now() + budgetMs)
  } finally {
    running.delete(account.id)
  }
}

async function scan(account: Account, deadline: number): Promise<{ done: boolean; scanned: number; total: number }> {
  const state: State = account.scan_state ? JSON.parse(account.scan_state) : { folders: {}, scanned: 0 }
  const own = new Set((db().prepare('select email from accounts where user_id = ?').all(account.user_id) as { email: string }[]).map((r) => r.email))
  own.add(account.login.toLowerCase())

  let remaining = 0
  let reset = false
  let progressed = false
  const client = await openImap(account)
  try {
    const { scan: folders } = await mailFolders(client)
    for (const path of folders) {
      const lock = await client.getMailboxLock(path, { readOnly: true })
      try {
        const box = client.mailbox
        if (!box || !box.exists) continue
        const validity = String(box.uidValidity)
        if (state.folders[path] && state.folders[path].v !== validity) {
          reset = true
          break
        }
        const folder = (state.folders[path] ??= { v: validity, uid: 0 })
        const uids = ((await client.search({ uid: `${folder.uid + 1}:*` }, { uid: true })) || []).filter((u) => u > folder.uid).sort((a, b) => a - b)

        let i = 0
        while (i < uids.length && (Date.now() < deadline || !progressed)) {
          progressed = true
          const batch = uids.slice(i, i + BATCH)
          const found = new Map<string, Found>()
          const range = `${batch[0]}:${batch[batch.length - 1]}`
          for await (const message of client.fetch(range, { uid: true, flags: true, internalDate: true, envelope: true, headers: HEADERS }, { uid: true })) {
            collect(found, message, path, own)
          }
          folder.uid = batch[batch.length - 1]
          state.scanned += batch.length
          save(account, found, state)
          i += batch.length
        }
        remaining += uids.length - i
      } finally {
        lock.release()
      }
    }
  } finally {
    await client.logout().catch(() => client.close())
  }

  if (reset) {
    db().prepare('delete from sender_accounts where account_id = ?').run(account.id)
    db().prepare('update accounts set scan_state = null where id = ?').run(account.id)
    return scan({ ...account, scan_state: null }, deadline)
  }

  const done = remaining === 0
  if (done) {
    db().prepare('update accounts set scan_state = ?, scanned_at = ? where id = ?').run(JSON.stringify({ ...state, scanned: 0 }), Date.now(), account.id)
    removeOrphanSenders(account.user_id)
  }
  return { done, scanned: state.scanned, total: state.scanned + remaining }
}

function collect(found: Map<string, Found>, message: FetchMessageObject, folder: string, own: Set<string>) {
  const from = message.envelope?.from?.[0]
  const address = from?.address?.toLowerCase()
  if (!address || own.has(address)) return
  const headers = parseHeaders(message.headers)
  if (!isBulk(headers)) return
  const time = new Date(message.internalDate ?? message.envelope?.date ?? NaN).getTime()
  if (!time) return

  const seen = message.flags?.has('\\Seen') ? 1 : 0
  let s = found.get(address)
  if (!s) {
    s = { name: '', total: 0, opened: 0, first: time, last: 0, months: {}, folder, uid: message.uid, unsub: null, post: false }
    found.set(address, s)
  }
  s.total++
  s.opened += seen
  const key = monthKey(time)
  const [count, opened] = s.months[key] ?? [0, 0]
  s.months[key] = [count + 1, opened + seen]
  s.first = Math.min(s.first, time)
  if (time >= s.last) {
    s.last = time
    s.folder = folder
    s.uid = message.uid
    s.unsub = headers['list-unsubscribe'] || null
    s.post = isOneClickPost(headers['list-unsubscribe-post'])
    if (from?.name) s.name = from.name
  }
}

function save(account: Account, found: Map<string, Found>, state: State) {
  const conn = db()
  conn.transaction(() => {
    for (const [address, s] of found) {
      const domain = address.split('@')[1]
      let sender = conn.prepare('select id from senders where user_id = ? and address = ?').get(account.user_id, address) as { id: number } | undefined
      if (!sender) {
        const { lastInsertRowid } = conn
          .prepare('insert into senders (user_id, address, name, domain) values (?, ?, ?, ?)')
          .run(account.user_id, address, s.name || null, getDomain(domain) ?? domain)
        sender = { id: Number(lastInsertRowid) }
      }

      const row = conn.prepare('select * from sender_accounts where sender_id = ? and account_id = ?').get(sender.id, account.id) as Row | undefined
      const newer = !row || s.last >= row.last_at
      if (newer && s.name) conn.prepare('update senders set name = ? where id = ?').run(s.name, sender.id)

      if (!row) {
        conn
          .prepare(
            `insert into sender_accounts (sender_id, account_id, total, opened, first_at, last_at, months, latest_folder, latest_uid, unsub_header, unsub_post)
             values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(sender.id, account.id, s.total, s.opened, s.first, s.last, JSON.stringify(s.months), s.folder, s.uid, s.unsub, s.post ? 1 : 0)
        continue
      }

      const months = JSON.stringify(mergeMonths(JSON.parse(row.months), s.months))
      conn
        .prepare('update sender_accounts set total = ?, opened = ?, first_at = ?, last_at = ?, months = ? where sender_id = ? and account_id = ?')
        .run(row.total + s.total, row.opened + s.opened, Math.min(row.first_at, s.first), Math.max(row.last_at, s.last), months, sender.id, account.id)
      if (newer) {
        conn
          .prepare(
            `update sender_accounts set latest_folder = ?, latest_uid = ?, unsub_header = ?, unsub_post = ?,
             auto_failed = case when coalesce(unsub_header, '') = coalesce(?, '') then auto_failed else 0 end
             where sender_id = ? and account_id = ?`,
          )
          .run(s.folder, s.uid, s.unsub, s.post ? 1 : 0, s.unsub, sender.id, account.id)
      }
    }
    conn.prepare('update accounts set scan_state = ? where id = ?').run(JSON.stringify(state), account.id)
  })()
}
