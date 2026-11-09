import type { NextRequest } from 'next/server'
import { apiSession } from '@/lib/session'

type Logo = { body: ArrayBuffer; type: string } | null

const cache = new Map<string, Logo>()

async function fetchLogo(domain: string): Promise<Logo> {
  try {
    const res = await fetch(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`, { signal: AbortSignal.timeout(5000) })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !type.startsWith('image/')) return null
    const body = await res.arrayBuffer()
    const png = new Uint8Array(body, 0, 4).join() === '137,80,78,71'
    if (png && new DataView(body).getUint32(16) < 32) return null
    return { body, type }
  } catch {
    return null
  }
}

const signInLogos = new Set(['google.com', 'icloud.com', 'outlook.com', 'yahoo.com', 'aol.com'])

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get('d')?.toLowerCase() ?? ''
  if (!signInLogos.has(domain) && !apiSession(req)) return new Response(null, { status: 401 })
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return new Response(null, { status: 400 })

  if (!cache.has(domain)) {
    if (cache.size > 2000) cache.delete(cache.keys().next().value!)
    cache.set(domain, await fetchLogo(domain))
  }
  const logo = cache.get(domain)
  if (!logo) return new Response(null, { status: 404, headers: { 'Cache-Control': 'private, max-age=86400' } })
  return new Response(logo.body, { headers: { 'Content-Type': logo.type, 'Cache-Control': 'private, max-age=604800' } })
}
