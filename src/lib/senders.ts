import { db } from './db'
import { unsubscribeLinks } from './headers'
import { mergeMonths, yearStats, type Months } from './stats'

const GRACE = 14 * 24 * 60 * 60 * 1000

export type SenderRow = {
  id: number
  address: string
  name: string | null
  domain: string | null
  unsubscribed_at: number | null
  sender_id: number
  account_id: number
  label: string | null
  account_email: string
  smtp_host: string | null
  total: number
  opened: number
  first_at: number
  last_at: number
  months: string
  latest_folder: string
  latest_uid: number
  unsub_header: string | null
  unsub_post: number
  auto_failed: number
  done_at: number | null
}

export const isStale = (row: SenderRow) => !!row.done_at && row.last_at > row.done_at + GRACE

export const needsUnsubscribe = (row: SenderRow) => !row.done_at || isStale(row)

export function rowMethod(row: SenderRow) {
  const links = unsubscribeLinks(row.unsub_header, !!row.unsub_post)
  const autoOk = !row.auto_failed && !isStale(row)
  if (autoOk && links.oneClick) return { kind: 'auto' as const }
  if (autoOk && links.mailto && row.smtp_host) return { kind: 'auto' as const }
  if (links.https) return { kind: 'link' as const, url: links.https }
  if (links.mailto) return { kind: 'link' as const, url: links.mailto }
  return { kind: 'find' as const }
}

export function senderRows(userId: number, ids?: number[]) {
  const rows = db()
    .prepare(
      `select s.id, s.address, s.name, s.domain, s.unsubscribed_at, sa.*, a.label, a.email as account_email, a.smtp_host
       from senders s
       join sender_accounts sa on sa.sender_id = s.id
       join accounts a on a.id = sa.account_id
       where s.user_id = ?`,
    )
    .all(userId) as SenderRow[]
  return ids ? rows.filter((r) => ids.includes(r.id)) : rows
}

export function listSenders(userId: number, ids?: number[]) {
  const groups = new Map<number, SenderRow[]>()
  for (const row of senderRows(userId, ids)) groups.set(row.id, [...(groups.get(row.id) ?? []), row])

  return [...groups.values()].map((rows) => {
    const s = rows[0]
    const first = Math.min(...rows.map((r) => r.first_at))
    const last = Math.max(...rows.map((r) => r.last_at))
    const months = rows.reduce<Months>((m, r) => mergeMonths(m, JSON.parse(r.months)), {})
    const year = yearStats(months, first)
    const open = rows.filter(needsUnsubscribe).map(rowMethod)
    const link = open.find((m) => m.kind === 'link')
    const stale = rows.some(isStale)

    return {
      id: s.id,
      name: s.name || s.address.split('@')[0],
      address: s.address,
      domain: s.domain,
      since: first,
      last,
      total: rows.reduce((n, r) => n + r.total, 0),
      perMonth: year.perMonth,
      lastYear: year.lastYear,
      notOpenedYear: year.lastYear > 0 && year.openedLastYear === 0,
      accounts: rows.map((r) => ({ id: r.account_id, label: r.label ?? r.account_email })),
      status: !open.length ? 'unsubscribed' : stale ? 'still-sending' : rows.some((r) => r.done_at) ? 'partial' : 'subscribed',
      method: !open.length ? null : open.some((m) => m.kind === 'auto') ? 'auto' : link ? 'link' : 'find',
      link: link?.url ?? null,
    }
  })
}

export type Sender = ReturnType<typeof listSenders>[number]
