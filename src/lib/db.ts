import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const VERSION = 2

const schema = `
create table sessions (
  token_hash text primary key,
  expires_at integer not null
);

create table accounts (
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

create table session_accounts (
  token_hash text not null references sessions(token_hash) on delete cascade,
  account_id integer not null references accounts(id) on delete cascade,
  added_at integer not null,
  primary key (token_hash, account_id)
);

create table senders (
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

const g = globalThis as unknown as { hateMailDb?: Database.Database }

export function db() {
  if (!g.hateMailDb) {
    const dir = path.join(process.cwd(), 'data')
    fs.mkdirSync(dir, { recursive: true })
    const conn = new Database(path.join(dir, 'hate-mail.db'))
    conn.pragma('journal_mode = WAL')
    conn.pragma('foreign_keys = ON')
    if (conn.pragma('user_version', { simple: true }) !== VERSION) {
      for (const table of ['sender_accounts', 'senders', 'session_accounts', 'sessions', 'accounts', 'users']) conn.exec(`drop table if exists ${table}`)
      conn.exec(schema)
      conn.pragma(`user_version = ${VERSION}`)
    }
    g.hateMailDb = conn
  }
  return g.hateMailDb
}

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

export function getAccount(id: number) {
  return db().prepare('select * from accounts where id = ?').get(id) as Account | undefined
}
