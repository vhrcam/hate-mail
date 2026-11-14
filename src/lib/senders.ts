import { all, get } from './db'
import { unsubscribeLinks } from './headers'
import { yearStats } from './stats'

const GRACE = 14 * 24 * 60 * 60 * 1000

export type SenderRow = {
  id: number
  account_id: number
  address: string
  name: string | null
  domain: string | null
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
  smtp_host: string | null
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

export async function senderRows(accountId: number, ids?: number[]) {
  const rows = await all<SenderRow>('select s.*, a.smtp_host from senders s join accounts a on a.id = s.account_id where s.account_id = ? and s.total > 0', accountId)
  return ids ? rows.filter((r) => ids.includes(r.id)) : rows
}

export const senderAccount = async (id: number) => (await get<{ account_id: number }>('select account_id from senders where id = ?', id))?.account_id

function summarize(row: SenderRow) {
  const year = yearStats(JSON.parse(row.months), row.first_at)
  const method = needsUnsubscribe(row) ? rowMethod(row) : null
  return {
    id: row.id,
    name: row.name || row.address.split('@')[0],
    address: row.address,
    domain: row.domain,
    since: row.first_at,
    last: row.last_at,
    total: row.total,
    perMonth: year.perMonth,
    lastYear: year.lastYear,
    notOpenedYear: year.lastYear > 0 && year.openedLastYear === 0,
    status: !method ? 'unsubscribed' : isStale(row) ? 'still-sending' : 'subscribed',
    method: method?.kind ?? null,
    link: method?.kind === 'link' ? method.url : null,
  }
}

export const listSenders = async (accountId: number, ids?: number[]) => (await senderRows(accountId, ids)).map(summarize)
