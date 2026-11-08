import dns from 'node:dns'
import https from 'node:https'
import net from 'node:net'

export function isPrivate(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    )
  }
  const v6 = ip.toLowerCase()
  const mapped = v6.match(/^::ffff:(.+)$/)?.[1]
  if (mapped) {
    if (net.isIPv4(mapped)) return isPrivate(mapped)
    const [hi, lo] = mapped.split(':').map((h) => parseInt(h, 16))
    return isPrivate(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
  }
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith('ff')
}

function safeLookup(hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err)
    const list = addresses as dns.LookupAddress[]
    if (!list.length || list.some((a) => isPrivate(a.address))) return callback(new Error('Blocked address'))
    if (options.all) callback(null, list)
    else callback(null, list[0].address, list[0].family)
  })
}

export function safePost(url: string, body: string) {
  return new Promise<number>((resolve, reject) => {
    const target = new URL(url)
    const host = target.hostname.replace(/^\[|\]$/g, '')
    if (target.protocol !== 'https:' || (net.isIP(host) && isPrivate(host))) return reject(new Error('Blocked URL'))
    const req = https.request(
      target,
      {
        method: 'POST',
        lookup: safeLookup as unknown as net.LookupFunction,
        timeout: 15000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'HateMail/1.0',
        },
      },
      (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      },
    )
    req.on('timeout', () => req.destroy(new Error('Timed out')))
    req.on('error', reject)
    req.end(body)
  })
}

export async function publicHost(host: string) {
  if (process.env.NODE_ENV !== 'production') return true
  const list = net.isIP(host) ? [{ address: host }] : await dns.promises.lookup(host, { all: true }).catch(() => [])
  return list.length > 0 && !list.some((a) => isPrivate(a.address))
}
