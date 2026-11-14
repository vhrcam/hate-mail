import { createClient, type Client, type InValue, type ResultSet } from '@libsql/client'
import fs from 'node:fs'
import path from 'node:path'

const schema = `
create table if not exists sessions (
  token_hash text primary key,
  expires_at integer not null
);

create table if not exists accounts (
  id integer primary key,
  email text not null,
  provider text not null,
  auth text not null,
  imap_host text not null,
  imap_port integer not null,
  smtp_host text,
  smtp_port integer,
  login text not null,
  secret text not null,
  access_token text,
  access_expires integer,
  scan_state text,
  scanned_at integer,
  needs_reconnect integer not null default 0,
  created_at integer not null,
  unique (email, imap_host, imap_port)
);

create table if not exists session_accounts (
  token_hash text not null references sessions(token_hash) on delete cascade,
  account_id integer not null references accounts(id) on delete cascade,
  added_at integer not null,
  primary key (token_hash, account_id)
);

create table if not exists senders (
  id integer primary key,
  account_id integer not null references accounts(id) on delete cascade,
  address text not null,
  name text,
  domain text,
  total integer not null default 0,
  opened integer not null default 0,
  first_at integer not null,
  last_at integer not null,
  months text not null default '{}',
  latest_folder text,
  latest_uid integer,
  unsub_header text,
  unsub_post integer not null default 0,
  auto_failed integer not null default 0,
  done_at integer,
  unique (account_id, address)
);
`

const g = globalThis as unknown as { hateMailDb?: Promise<Client> }

async function open() {
  let url = process.env.TURSO_DATABASE_URL
  if (!url) {
    const dir = path.join(process.cwd(), 'data')
    fs.mkdirSync(dir, { recursive: true })
    url = `file:${path.join(dir, 'hate-mail.db')}`
  }
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  await client.executeMultiple(schema)
  return client
}

export function db() {
  g.hateMailDb ??= open().catch((e) => {
    g.hateMailDb = undefined
    throw e
  })
  return g.hateMailDb
}

const plain = (r: ResultSet) => r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])))

export const all = async <T>(sql: string, ...args: InValue[]) => plain(await (await db()).execute({ sql, args })) as T[]

export const get = async <T>(sql: string, ...args: InValue[]) => (await all<T>(sql, ...args))[0] as T | undefined

export const run = async (sql: string, ...args: InValue[]) => (await db()).execute({ sql, args })

export const batch = async (statements: [string, InValue[]?][]) => (await db()).batch(statements, 'write')

export type Account = {
  id: number
  email: string
  provider: string
  auth: 'oauth' | 'password'
  imap_host: string
  imap_port: number
  smtp_host: string | null
  smtp_port: number | null
  login: string
  secret: string
  access_token: string | null
  access_expires: number | null
  scan_state: string | null
  scanned_at: number | null
  needs_reconnect: number
}

export const getAccount = (id: number) => get<Account>('select * from accounts where id = ?', id)
