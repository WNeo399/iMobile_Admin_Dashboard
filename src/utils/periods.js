// Period presets shared by the My Fone totals and a shop's statement
// (iMobile Accountant). Dates are plain YYYY-MM-DD strings in local time.

export const PERIODS = [
    { key: 'thisMonth', label: 'This month' },
    { key: 'lastMonth', label: 'Last month' },
    { key: 'last3', label: 'Last 3 months' },
    { key: 'fy', label: 'This financial year' },
    { key: 'all', label: 'All time' }
]
export const PERIOD_KEYS = PERIODS.map(p => p.key)

const pad = (n) => String(n).padStart(2, '0')
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayYmd = () => ymd(new Date())

// { from, to } for a preset; 'custom' takes the picked range. 'All time'
// starts at allFrom (the first transaction), '' when that isn't known.
export function periodBounds(key, range, allFrom) {
    const t = new Date()
    const today = ymd(t)
    const y = t.getFullYear()
    const m = t.getMonth()
    switch (key) {
    case 'thisMonth': return { from: ymd(new Date(y, m, 1)), to: today }
    case 'lastMonth': return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) }
    case 'last3': return { from: ymd(new Date(y, m - 2, 1)), to: today }
    // the Australian financial year starts on 1 July
    case 'fy': return { from: ymd(new Date(m >= 6 ? y : y - 1, 6, 1)), to: today }
    case 'all': return { from: allFrom || '', to: today }
    default: return { from: (range && range[0]) || today, to: (range && range[1]) || today }
    }
}

// The period as route query, so a shop's statement opens on the same dates.
export function periodQuery(key, range) {
    if (PERIOD_KEYS.includes(key)) return { period: key }
    return range && range.length === 2 ? { period: 'custom', from: range[0], to: range[1] } : {}
}
