export function parseHeaders(raw?: Buffer) {
  const text = (raw?.toString('utf8') ?? '').replace(/\r?\n[ \t]+/g, ' ')
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([\w-]+):\s*(.*)$/)
    if (match && !(match[1].toLowerCase() in out)) out[match[1].toLowerCase()] = match[2].trim()
  }
  return out
}

export function isBulk(headers: Record<string, string>) {
  return !!headers['list-unsubscribe'] || !!headers['list-id'] || /^(bulk|list|junk)$/i.test(headers['precedence'] ?? '')
}

export const isOneClickPost = (value?: string) => /List-Unsubscribe=One-Click/i.test(value ?? '')

const decodeEntities = (s: string) => s.replace(/&amp;|&#38;|&#x26;/gi, '&').replace(/&#61;|&#x3d;/gi, '=').replace(/&quot;/g, '"')

export function unsubscribeLinkFromHtml(html: string) {
  const anchors = [...html.matchAll(/<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ href: decodeEntities(m[2].trim()), text: m[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }))
    .filter((a) => /^https?:\/\//i.test(a.href))
  const best =
    anchors.find((a) => /unsubscribe/i.test(a.text)) ??
    anchors.find((a) => /unsubscribe/i.test(a.href)) ??
    anchors.find((a) => /opt[\s-]?out|email preferences|manage (your )?(email|subscription|preferences|notifications)/i.test(a.text))
  return best?.href ?? null
}

export function unsubscribeLinkFromText(text: string) {
  return text.match(/https?:\/\/[^\s<>"]*unsubscribe[^\s<>"]*/i)?.[0] ?? null
}

export function unsubscribeLinks(header: string | null, oneClickPost: boolean) {
  const bracketed = [...(header ?? '').matchAll(/<\s*([^>]+?)\s*>/g)].map((m) => m[1])
  const list = bracketed.length ? bracketed : (header ?? '').split(',').map((s) => s.trim())
  const https = list.find((u) => /^https?:\/\//i.test(u))
  const mailto = list.find((u) => /^mailto:/i.test(u))
  return { https, mailto, oneClick: !!https && /^https:/i.test(https) && oneClickPost }
}
