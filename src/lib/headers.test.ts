import { describe, expect, it } from 'vitest'
import { isBulk, isOneClickPost, parseHeaders, unsubscribeLinkFromHtml, unsubscribeLinkFromText, unsubscribeLinks } from './headers'

describe('parseHeaders', () => {
  it('unfolds long headers and lowercases names', () => {
    const raw = Buffer.from('List-Unsubscribe: <mailto:a@b.com>,\r\n <https://b.com/u>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n\r\n')
    const h = parseHeaders(raw)
    expect(h['list-unsubscribe']).toBe('<mailto:a@b.com>, <https://b.com/u>')
    expect(isOneClickPost(h['list-unsubscribe-post'])).toBe(true)
  })
})

describe('isBulk', () => {
  it('spots mailing list mail', () => {
    expect(isBulk({ 'list-unsubscribe': '<https://x.com>' })).toBe(true)
    expect(isBulk({ 'list-id': 'News <news.x.com>' })).toBe(true)
    expect(isBulk({ precedence: 'bulk' })).toBe(true)
  })

  it('skips personal mail', () => {
    expect(isBulk({})).toBe(false)
    expect(isBulk({ precedence: 'first-class' })).toBe(false)
  })
})

describe('unsubscribeLinks', () => {
  it('finds both kinds of links', () => {
    const links = unsubscribeLinks('<mailto:u@x.com?subject=stop>, <https://x.com/u?a=1>', true)
    expect(links).toEqual({ https: 'https://x.com/u?a=1', mailto: 'mailto:u@x.com?subject=stop', oneClick: true })
  })

  it('only allows one-click over https', () => {
    expect(unsubscribeLinks('<http://x.com/u>', true).oneClick).toBe(false)
    expect(unsubscribeLinks('<https://x.com/u>', false).oneClick).toBe(false)
  })

  it('handles headers without brackets', () => {
    expect(unsubscribeLinks('https://x.com/u', false).https).toBe('https://x.com/u')
  })
})

describe('unsubscribe links in the email body', () => {
  it('prefers the link that says unsubscribe', () => {
    const html = '<a href="https://x.com/prefs">Manage preferences</a> <a href="https://x.com/u?id=1&amp;t=2"><span>Unsubscribe</span></a>'
    expect(unsubscribeLinkFromHtml(html)).toBe('https://x.com/u?id=1&t=2')
  })

  it('falls back to preference links', () => {
    expect(unsubscribeLinkFromHtml('<a href="https://x.com/p">Opt out</a>')).toBe('https://x.com/p')
  })

  it('ignores non-web links', () => {
    expect(unsubscribeLinkFromHtml('<a href="javascript:alert(1)">Unsubscribe</a>')).toBe(null)
  })

  it('reads plain text emails', () => {
    expect(unsubscribeLinkFromText('Bye: https://x.com/unsubscribe/abc thanks')).toBe('https://x.com/unsubscribe/abc')
  })
})
