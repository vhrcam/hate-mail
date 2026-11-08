import { describe, expect, it } from 'vitest'
import { providerForDomain, providerForMx } from './providers'

describe('providerForDomain', () => {
  it('knows the big providers', () => {
    expect(providerForDomain('gmail.com')).toBe('google')
    expect(providerForDomain('hotmail.co.uk')).toBe('microsoft')
    expect(providerForDomain('me.com')).toBe('icloud')
    expect(providerForDomain('yahoo.co.jp')).toBe('yahoo')
    expect(providerForDomain('pm.me')).toBe('proton')
    expect(providerForDomain('school.edu')).toBeUndefined()
  })
})

describe('providerForMx', () => {
  it('spots custom domains hosted by big providers', () => {
    expect(providerForMx(['aspmx.l.google.com.'])).toBe('google')
    expect(providerForMx(['school-edu.mail.protection.outlook.com'])).toBe('microsoft')
    expect(providerForMx(['mx01.mail.icloud.com'])).toBe('icloud')
    expect(providerForMx(['mx.example.net'])).toBeUndefined()
  })
})
