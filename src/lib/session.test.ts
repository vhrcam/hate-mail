import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { NextRequest } from 'next/server'
import { expect, test } from 'vitest'
import { saveAccount } from './accounts'
import { sha256 } from './crypto'
import { get, run } from './db'
import { signIn, signOut } from './session'

process.env.TURSO_DATABASE_URL = `file:${path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hate-mail-')), 'test.db')}`

const DAY = 24 * 60 * 60 * 1000
const request = { cookies: { get: () => undefined } } as unknown as NextRequest

async function account(email: string, usedAt: number) {
  const { lastInsertRowid } = await run(
    `insert into accounts (email, provider, auth, imap_host, imap_port, login, secret, access_token, scanned_at, created_at)
     values (?, 'other', 'password', 'imap.example.com', 993, ?, 'saved-secret', 'saved-token', ?, ?)`,
    email, email, usedAt, usedAt,
  )
  const id = Number(lastInsertRowid)
  await run(`insert into senders (account_id, address, total, first_at, last_at) values (?, 'news@shop.com', 3, 1, 1)`, id)
  return id
}

const senderCount = async (id: number) => (await get<{ n: number }>('select count(*) as n from senders where account_id = ?', id))!.n

test('signing out forgets the password but keeps the senders', async () => {
  const id = await account('kept@example.com', Date.now())
  const token = await signIn(request, id)
  await signOut({ token, hash: sha256(token), accountIds: [id] }, id)

  const row = await get<{ secret: string; access_token: string | null }>('select secret, access_token from accounts where id = ?', id)
  expect(row).toEqual({ secret: '', access_token: null })
  expect(await senderCount(id)).toBe(1)
  expect(await get('select 1 from sessions where token_hash = ?', sha256(token))).toBeUndefined()
})

test('signing back in picks up the kept senders', async () => {
  const id = (await get<{ id: number }>(`select id from accounts where email = 'kept@example.com'`))!.id
  const again = await saveAccount({
    email: 'kept@example.com', provider: 'other', auth: 'password', imapHost: 'imap.example.com', imapPort: 993,
    smtpHost: null, smtpPort: null, login: 'kept@example.com', secret: 'new-secret',
  })
  expect(again).toBe(id)
  expect(await senderCount(id)).toBe(1)
})

test('accounts nobody has used in 90 days are deleted', async () => {
  const old = await account('old@example.com', Date.now() - 91 * DAY)
  const recent = await account('recent@example.com', Date.now() - 30 * DAY)
  await signIn(request, await account('someone@example.com', Date.now()))

  expect(await get('select 1 from accounts where id = ?', old)).toBeUndefined()
  expect(await senderCount(old)).toBe(0)
  expect(await get('select 1 from accounts where id = ?', recent)).toBeDefined()
  expect(await senderCount(recent)).toBe(1)
})
