export type Months = Record<string, [number, number]>

const MONTH = 30.44 * 24 * 60 * 60 * 1000

export const monthKey = (time: number) => new Date(time).toISOString().slice(0, 7)

export function mergeMonths(a: Months, b: Months) {
  const out = { ...a }
  for (const [key, [count, opened]] of Object.entries(b)) {
    const [c, o] = out[key] ?? [0, 0]
    out[key] = [c + count, o + opened]
  }
  return out
}

export function yearStats(months: Months, first: number, now = Date.now()) {
  const today = new Date(now)
  let count = 0
  let opened = 0
  for (let i = 0; i < 12; i++) {
    const [c, o] = months[monthKey(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1))] ?? [0, 0]
    count += c
    opened += o
  }
  const span = Math.min(12, Math.max(1, (now - first) / MONTH))
  return { perMonth: count / span, lastYear: count, openedLastYear: opened }
}
