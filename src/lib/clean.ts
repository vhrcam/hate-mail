import type { ImapFlow } from 'imapflow'
import { db, getAccount, type Account } from './db'
import { errorText, mailFolders, openImap } from './mail'
import { senderRows } from './senders'

async function fromExactly(client: ImapFlow, address: string) {
  const uids = (await client.search({ from: address }, { uid: true })) || []
  const exact: number[] = []
  for (let i = 0; i < uids.length; i += 1000) {
    const chunk = uids.slice(i, i + 1000)
    for await (const m of client.fetch(chunk.join(','), { uid: true, envelope: true }, { uid: true })) {
      if (m.envelope?.from?.[0]?.address?.toLowerCase() === address) exact.push(m.uid)
    }
  }
  return exact
}

async function moveFrom(client: ImapFlow, folder: string, addresses: string[], target: string, landed: number[]) {
  if (folder === target) return 0
  const lock = await client.getMailboxLock(folder)
  let moved = 0
  try {
    for (const address of addresses) {
      const uids = await fromExactly(client, address)
      if (!uids.length) continue
      const result = await client.messageMove(uids, target, { uid: true })
      if (!result) continue
      moved += uids.length
      if (result.uidMap) landed.push(...result.uidMap.values())
    }
  } finally {
    lock.release()
  }
  return moved
}

function skipOnNextScan(account: Account, folder: string, uids: number[]) {
  const state = JSON.parse(getAccount(account.user_id, account.id)?.scan_state ?? 'null')
  if (!uids.length || !state?.folders?.[folder]) return
  state.folders[folder].skip = [...(state.folders[folder].skip ?? []), ...uids]
  db().prepare('update accounts set scan_state = ? where id = ?').run(JSON.stringify(state), account.id)
}

export async function cleanSenders(userId: number, ids: number[], action: 'trash' | 'archive') {
  const byAccount = new Map<number, string[]>()
  for (const row of senderRows(userId, ids)) byAccount.set(row.account_id, [...(byAccount.get(row.account_id) ?? []), row.address])

  let moved = 0
  const errors: string[] = []
  for (const [accountId, addresses] of byAccount) {
    const account = getAccount(userId, accountId)!
    let client: ImapFlow | undefined
    try {
      client = await openImap(account)
      const { all, trash, archive, scan } = await mailFolders(client)
      const target = action === 'trash' ? trash : (archive ?? all)
      if (!target) throw new Error(action === 'trash' ? 'No Trash folder found.' : 'No Archive folder found.')
      const sources = action === 'trash' ? (all ? [all] : scan) : ['INBOX']
      const landed: number[] = []
      for (const folder of sources) moved += await moveFrom(client, folder, addresses, target, landed)
      if (scan.includes(target)) skipOnNextScan(account, target, landed)
    } catch (e) {
      errors.push(`${account.email}: ${errorText(e)}`)
    } finally {
      await client?.logout().catch(() => client?.close())
    }
  }
  return { moved, errors }
}
