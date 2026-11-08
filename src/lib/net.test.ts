import { describe, expect, it } from 'vitest'
import { isPrivate, safePost } from './net'

describe('isPrivate', () => {
  it('blocks local and private addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1']) {
      expect(isPrivate(ip), ip).toBe(true)
    }
  })

  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '172.32.0.1', '2606:4700::1111']) expect(isPrivate(ip), ip).toBe(false)
  })
})

describe('safePost', () => {
  it('refuses plain http and private hosts', async () => {
    await expect(safePost('http://example.com/u', 'x')).rejects.toThrow('Blocked URL')
    await expect(safePost('https://127.0.0.1/u', 'x')).rejects.toThrow('Blocked URL')
    await expect(safePost('https://[::1]/u', 'x')).rejects.toThrow('Blocked URL')
    await expect(safePost('https://localhost/u', 'x')).rejects.toThrow('Blocked address')
  })
})
