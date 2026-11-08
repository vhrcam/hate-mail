import { describe, expect, it } from 'vitest'
import { mergeMonths, monthKey, yearStats } from './stats'

const now = Date.UTC(2026, 10, 8)

describe('mergeMonths', () => {
  it('adds counts per month', () => {
    expect(mergeMonths({ '2026-01': [2, 1] }, { '2026-01': [3, 0], '2026-02': [1, 1] })).toEqual({ '2026-01': [5, 1], '2026-02': [1, 1] })
  })
})

describe('yearStats', () => {
  it('averages the last 12 months', () => {
    const months = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [monthKey(Date.UTC(2026, 10 - i, 1)), [10, 0] as [number, number]]))
    expect(yearStats(months, Date.UTC(2024, 0, 1), now)).toEqual({ perMonth: 10, lastYear: 120, openedLastYear: 0 })
  })

  it('does not underestimate new senders', () => {
    const stats = yearStats({ '2026-11': [6, 1] }, Date.UTC(2026, 10, 1), now)
    expect(stats.perMonth).toBe(6)
    expect(stats.openedLastYear).toBe(1)
  })

  it('shows zero for senders that stopped', () => {
    expect(yearStats({ '2019-05': [4, 4] }, Date.UTC(2015, 0, 1), now).perMonth).toBe(0)
  })
})
