// Default prices (user ask 2026-11-05): a phone supplier's usual price per
// Model + Storage + Grade, kept per stock source on the server. Offered when
// a device Blackbelt has a report on is added (Stock: Add Device / Bulk Add,
// Pending Stock: Add to Stock, Supply Batches: a scanned new device).
//
// One request per model + storage (every grade comes back), shared by every
// row asking; reset when a dialog opens so another user's change shows up.
import { lookupRefurbDefaultPrices, saveRefurbDefaultPrice } from '@/api/refurbished'

// the same match keys as the server
const modelKey = v => String(v || '').trim().replace(/\s+/g, ' ').toLowerCase()
const storageKey = v => String(v || '').replace(/\s+/g, '').toUpperCase()
export const gradeKey = v => String(v || '').trim().toUpperCase()
const pairKey = (model, storage) => modelKey(model) + '|' + storageKey(storage)

let cache = new Map() // pairKey → Promise<{ [grade]: { price, currency } }>
const listeners = new Set() // told when a default is saved: (pairKey, grade)

export function resetDefaultPrices() {
    cache = new Map()
}

// Every grade's default for one model + storage.
export function defaultsFor(model, storage) {
    if (!modelKey(model) || !storageKey(storage)) return Promise.resolve({})
    const k = pairKey(model, storage)
    if (!cache.has(k)) {
        cache.set(k, lookupRefurbDefaultPrices([{ model, storage }]).then(r => {
            if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
            const out = {}
            for (const p of r.prices || []) out[gradeKey(p.grade)] = { price: p.price, currency: p.currency }
            return out
        }).catch(() => {
            cache.delete(k) // asked again next time
            return {}
        }))
    }
    return cache.get(k)
}

// The default for one combination, or null.
export async function defaultPriceFor(model, storage, grade) {
    if (!gradeKey(grade)) return null
    const all = await defaultsFor(model, storage)
    return all[gradeKey(grade)] || null
}

// Saves the price as the default; every row showing the same combination is told.
export async function setDefaultPrice({ model, storage, grade, price, currency }) {
    const r = await saveRefurbDefaultPrice({ model, storage, grade, price, currency })
    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
    const k = pairKey(model, storage)
    const saved = { price: r.price.price, currency: r.price.currency }
    const before = await (cache.get(k) || Promise.resolve({}))
    cache.set(k, Promise.resolve({ ...before, [gradeKey(grade)]: saved }))
    listeners.forEach(fn => { try { fn(k, gradeKey(grade)) } catch (e) { /* ignore */ } })
    return saved
}

export function onDefaultPriceSaved(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
}

export { pairKey }
