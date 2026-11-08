import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const schema = `
create table if not exists users (
  id integer primary key,
  email text not null unique,
  password_hash text not null,
  created_at integer not null
);

create table if not exists sessions (
  token_hash text primary key,
  user_id integer not null references users(id) on delete cascade,
  expires_at integer not null
);

create table if not exists accounts (
  id integer primary key,
  user_id integer not null references users(id) on delete cascade,
  email text not null,
  provider text not null,
  auth text not null,
  label text,
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
  unique (user_id, email)
);

create table if not exists senders (
  id integer primary key,
  user_id integer not null references users(id) on delete cascade,
  address text not null,
  name text,
  domain text,
  unsubscribed_at integer,
  unique (user_id, address)
);

create table if not exists sender_accounts (
  sender_id integer not null references senders(id) on delete cascade,
  account_id integer not null references accounts(id) on delete cascade,
  total integer not null default 0,
  opened integer not null default 0,
  first_at integer,
  last_at integer,
  months text not null default '{}',
  latest_folder text,
  latest_uid integer,
  unsub_header text,
  unsub_post integer not null default 0,
  auto_failed integer not null default 0,
  done_at integer,
  primary key (sender_id, account_id)
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
    conn.exec(schema)
    g.hateMailDb = conn
  }
  return g.hateMailDb
}

export type Account = {
  id: number
  user_id: number
  email: string
  provider: string
  auth: 'oauth' | 'password'
  label: string | null
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

export function getAccount(userId: number, id: number) {
  return db().prepare('select * from accounts where id = ? and user_id = ?').get(id, userId) as Account | undefined
}

export function removeOrphanSenders(userId: number) {
  db().prepare('delete from senders where user_id = ? and id not in (select sender_id from sender_accounts)').run(userId)
}
