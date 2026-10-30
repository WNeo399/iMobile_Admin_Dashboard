// v-zoho-img="itemId" on an <img> showing a store image URL
// (…/product-images/image/<document id>/…). The store only serves images of
// products it shows, so a product it hides — the dashboard's new ones until
// New Products → Approve (user 2026-10-30, SKU 22527) — comes back empty
// and the <img> fails. Then the same photo is fetched through the backend
// from Zoho (GET /zoho/items/:id/images/:docId) and shown instead. Shown
// products never ask: no Zoho call unless the store fails.
import { getItemPhoto } from '@/api/zoho/stockMonitoring'

const STORE_IMAGE = /\/product-images\/image\/(\d{6,25})\//
// "<item>:<doc>" → Promise<object URL | null>, kept for the page's life
const fetched = new Map()

function photoUrl(itemId, docId) {
    const key = `${itemId}:${docId}`
    if (!fetched.has(key)) {
        fetched.set(key, getItemPhoto(itemId, docId)
            .then(blob => (blob && blob.size && /^image\//i.test(blob.type) ? URL.createObjectURL(blob) : null))
            .catch(() => null))
    }
    return fetched.get(key)
}

function onError(e) {
    const img = e.currentTarget
    const itemId = img.__zohoItemId
    const src = img.getAttribute('src') || ''
    const m = STORE_IMAGE.exec(src)
    // once per image: a src set again (the row reused) gets its own try
    if (!itemId || !m || img.__zohoTried === src) return
    img.__zohoTried = src
    photoUrl(itemId, m[1]).then(url => {
        // still the same image (not re-pointed meanwhile)
        if (url && img.getAttribute('src') === src) img.src = url
    })
}

export default {
    bind(el, binding) {
        el.__zohoItemId = binding.value ? String(binding.value) : ''
        el.addEventListener('error', onError)
    },
    update(el, binding) {
        el.__zohoItemId = binding.value ? String(binding.value) : ''
    },
    unbind(el) {
        el.removeEventListener('error', onError)
    }
}
