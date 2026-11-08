import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

let key: Buffer | undefined

function getKey() {
  if (key) return key
  if (process.env.ENCRYPTION_KEY) {
    key = Buffer.from(process.env.ENCRYPTION_KEY, 'base64')
    return key
  }
  const file = path.join(process.cwd(), 'data', 'secret.key')
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, crypto.randomBytes(32).toString('base64'), { mode: 0o600 })
  }
  key = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64')
  return key
}

export function encrypt(text: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.')
}

export function decrypt(value: string) {
  const [iv, tag, data] = value.split('.').map((s) => Buffer.from(s, 'base64'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

export const randomToken = () => crypto.randomBytes(32).toString('base64url')

export const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex')
