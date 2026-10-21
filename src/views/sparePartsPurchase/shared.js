// Shared bits of the Spare Parts Purchase pages: the status vocabulary,
// formatting helpers and the printable packing list.
//
// Labels are the English source text — the pages show them through $tp,
// so zh.js translates them under `page`.

export const STATUS_LIST = [
    { value: 'pending', label: 'Pending', icon: 'el-icon-time', color: '#E6A23C', bg: '#FDF6EC' },
    // 待确认: parked for a decision before it is placed or shipped
    { value: 'toConfirm', label: 'To Confirm', icon: 'el-icon-question', color: '#0EA5A5', bg: '#E6F7F7' },
    { value: 'ordered', label: 'Ordered', icon: 'el-icon-document-checked', color: '#409EFF', bg: '#ECF5FF' },
    { value: 'shipped', label: 'Shipped', icon: 'el-icon-truck', color: '#8B5CF6', bg: '#F3EFFF' },
    { value: 'received', label: 'Received', icon: 'el-icon-circle-check', color: '#67C23A', bg: '#F0F9EB' },
    { value: 'shortage', label: 'Shortage', icon: 'el-icon-remove-outline', color: '#F56C6C', bg: '#FEF0F0' },
    { value: 'cancelled', label: 'Cancelled', icon: 'el-icon-circle-close', color: '#909399', bg: '#F4F4F5' }
]
export const STATUS_META = STATUS_LIST.reduce((m, s) => ((m[s.value] = s), m), {})

// Where a line files: its item's register classification (set by the
// server on create) or one of two channels kept apart — sea-freight orders
// and customer special orders. The tree shows every one, even when empty.
// IC: chips split out of Small Parts › Connector & IC (user ask 2026-10-07)
export const CLASSIFICATIONS = ['Screen', 'MacBook Screen', 'Housing', 'Middle Frame', 'BackCover', 'Battery', 'Small Parts', 'IC', 'Tools', 'Other']
export const CHANNELS = ['海运', 'Special Order', 'New Product', 'Warranty']
export const CATEGORIES = [...CLASSIFICATIONS, ...CHANNELS]
export const isChannel = c => CHANNELS.includes(c)
// New Product and Special Order lines are quoted first: the quote parks them
// in To Confirm, and once confirmed they are ordered as usual. Until then
// they "await a quote" (the backend's awaitsQuote).
export const QUOTE_FIRST = ['New Product', 'Special Order']
// a Special Order raised without "Needs a quote first" (needsQuote: false) skips the quote step
export const awaitsQuote = r => !!r && QUOTE_FIRST.includes(r.category) && ['pending', 'shortage'].includes(r.status) && !r.confirmed && r.needsQuote !== false
// Who a Special Order is for — the usual names; another can be typed.
export const REQUESTED_FOR = ['Shen', 'JoJo', 'Prana', 'iMobile']
// Photos a line can carry (the backend's MAX_IMAGES).
export const MAX_IMAGES = 6

export const BATCH_STATUS = {
    draft: { label: 'Draft', type: 'warning' },
    shipped: { label: 'Shipped', type: 'primary' },
    received: { label: 'Received', type: 'success' },
    cancelled: { label: 'Cancelled', type: 'info' }
}

const pad = n => String(n).padStart(2, '0')

// Day-only fields are stored as that day at 00:00 UTC — the first ten
// characters of the ISO string are the day, in every timezone.
export function fmtDay(v) {
    if (!v) return '—'
    const s = String(v)
    return s.length >= 10 ? s.slice(0, 10) : s
}
// Timestamps show in the viewer's local time.
export function fmtWhen(v) {
    if (!v) return '—'
    const d = new Date(v)
    if (isNaN(d.getTime())) return String(v)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function todayYmd() {
    const d = new Date()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
// Purchase prices are in CNY.
export function yuan(v) {
    if (v == null || v === '') return '—'
    const n = Number(v)
    return isNaN(n) ? String(v) : '¥' + n.toFixed(2)
}
// What a batch costs: shipped qty × unit price over the lines that carry a
// price, plus the shipping cost. `qtyOf` picks the quantity field — the
// Create Batch form has `qty`, a shipped batch `shippedQty`. `unpriced`
// counts the lines left out for having no price.
export function batchAmount(lines, shippingCost, qtyOf = l => l.shippedQty) {
    let goods = 0
    let unpriced = 0
    for (const l of lines || []) {
        if (l.unitPrice == null || l.unitPrice === '') { unpriced++; continue }
        goods += (Number(qtyOf(l)) || 0) * (Number(l.unitPrice) || 0)
    }
    const shipping = Number(shippingCost) > 0 ? Number(shippingCost) : 0
    const r2 = n => Math.round(n * 100) / 100
    return { goods: r2(goods), shipping: r2(shipping), total: r2(goods + shipping), unpriced }
}

// ── Creating a Zoho item (New Products, and "Create in Zoho" on the Purchase
// Order page) — 2026-10-16 ──
// The pricing formula comes from the server (utils/priceRules PRICE_FORMULAS):
// per family, per list, [added to the cost, multiplier].
// The four lists for a cost (null without a cost or a formula).
export function formulaPricesFor(cost, f) {
    const c = Number(cost)
    if (!(c > 0) || !f) return null
    const at = ([add, times]) => Math.round((c + add) * times * 100) / 100
    return { platinum: at(f.platinum), vip: at(f.vip), svip: at(f.svip), wholesale: at(f.wholesale) }
}
// Which formula prices an item — the server's priceRuleFamily: "Service Pack"
// in the quality or name; else the classification's family; a part the
// classification calls "other" (or "accessory", 2026-10-20) is still a
// major part when its name says screen / LCD / digitizer / housing / back
// cover / battery.
export function priceFamilyOf({ quality, name, family }) {
    const sp = /service pack/i
    if (sp.test(quality || '') || sp.test(name || '')) return 'service-pack'
    if (family && family !== 'other' && family !== 'accessory') return family
    if (/housing|back ?cover|backcover|lcd|digitizer|\bscreen\b|battery/i.test(name || '')) return 'major-part'
    return family || 'other'
}
// The store categories (Zoho Commerce, flat from the server) as the pickers
// show them: hidden ones left out with everything under them, as a tree in
// the store's own order for an el-cascader (CATEGORY_PROPS).
export const CATEGORY_PROPS = { checkStrictly: true, emitPath: false, value: 'id', label: 'label', children: 'children' }
export function categoryIndex(list) {
    const map = {}
    for (const c of list || []) map[c.id] = c
    return map
}
export function pickableCategories(list, byId = categoryIndex(list)) {
    return (list || []).filter(c => {
        for (let x = c, n = 0; x && n < 20; x = byId[x.parentId], n++) if (!x.visible) return false
        return true
    })
}
export function categoryTreeOf(pickable) {
    const kids = {}
    for (const c of [...pickable].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))) (kids[c.parentId] = kids[c.parentId] || []).push(c)
    const build = (parentId, seen) => (kids[parentId] || []).filter(c => !seen.has(c.id)).map(c => {
        const node = { id: c.id, label: c.name }
        const below = build(c.id, new Set([...seen, c.id]))
        if (below.length) node.children = below
        return node
    })
    return build('-1', new Set())
}
// "MORE › MOTO › MOTO G Series › MOTO G96"
export function categoryPathIn(byId, id) {
    const names = []
    for (let c = byId[id], n = 0; c && n < 12; c = byId[c.parentId], n++) names.unshift(c.name)
    return names.join(' › ')
}
// typing in a category picker searches the whole path, any case
export const categoryFilter = (node, keyword) => String(node.text || '').toLowerCase().includes(String(keyword || '').toLowerCase())

// ── Listing's tree order (user 2026-10-21: models newest first) ──
// A model name read for sorting: its line (the name up to its number —
// "iPhone", "Galaxy A", "Moto G", "MacBook Air"), the number (18 in "iPhone
// 18 Pro Max", 56 in "A56", 13 in 'MacBook Air 13" A2681'), every number in
// it, a year in brackets ("iPad 10 (2022)") and the rest ("Pro Max"). "5G" /
// "4G" are not model numbers; iPhone X / XR / XS count as 10.
function modelSortKey(name) {
    const full = String(name || '').trim()
    const year = (full.match(/\((?:[^)]*?\b)?((?:19|20)\d{2})\b[^)]*\)/) || [])[1]
    let body = full.replace(/\([^)]*\)/g, ' ').replace(/\b[45]G\b/gi, ' ')
    body = body.replace(/\biPhone X([RS]?)\b/i, (m, s) => `iPhone 10${s}`).replace(/\s+/g, ' ').trim()
    const m = body.match(/^(.*?)(\d+(?:\.\d+)?)(.*)$/)
    return {
        line: (m ? m[1] : body).replace(/["\s]+$/, '').trim().toLowerCase(),
        num: m ? parseFloat(m[2]) : -1,
        nums: (body.match(/\d+(?:\.\d+)?/g) || []).map(Number),
        year: year ? Number(year) : 0,
        rest: (m ? m[3] : '').replace(/^["\s]+/, '').trim().toLowerCase(),
        full: full.toLowerCase()
    }
}
// Newest first: line A–Z (iPad, iPad Air, iPad Pro …), then the number, the
// year and the other numbers highest first, then the variants of one model
// together — the plain one first (Pixel 11, 11 Pro, 11 Pro XL).
export function newestModelFirst(a, b) {
    const x = modelSortKey(a)
    const y = modelSortKey(b)
    if (x.line !== y.line) return x.line.localeCompare(y.line, undefined, { numeric: true })
    if (x.num !== y.num) return y.num - x.num
    if (x.year !== y.year) return y.year - x.year
    for (let i = 1; i < Math.max(x.nums.length, y.nums.length); i++) {
        const p = x.nums[i] == null ? -1 : x.nums[i]
        const q = y.nums[i] == null ? -1 : y.nums[i]
        if (p !== q) return q - p
    }
    if (x.rest !== y.rest) return !x.rest ? -1 : !y.rest ? 1 : x.rest.localeCompare(y.rest, undefined, { numeric: true })
    return x.full.localeCompare(y.full, undefined, { numeric: true })
}

// ── An item's details (Listing's Create, and the product dialog shared by
// Listing and New Products — 2026-10-21) ──
// a model name reduced to what identifies the phone — the server's modelKey
export const fitKey = s => String(s || '').toLowerCase()
    .replace(/\b(xt|pb|pa)[-\w]*\d[\w-]*/g, ' ')
    .replace(/\b(motorola|moto|samsung|galaxy|google|apple|oppo|xiaomi|huawei|sony|nokia|5g|4g|us)\b/g, ' ')
    .replace(/[^a-z0-9()]+/g, '')
// the four price lists, as Price Monitoring names them
export const PRICE_LISTS = [
    { list: 'platinum', label: 'Platinum' },
    { list: 'vip', label: 'VIP' },
    { list: 'svip', label: 'SVIP' },
    { list: 'wholesale', label: 'Wholesale' }
]
export const blankPrices = () => ({ platinum: undefined, vip: undefined, svip: undefined, wholesale: undefined })
// two prices the same (blank = blank)
export const samePrice = (a, b) => (a == null || a === '') ? (b == null || b === '') : (b != null && b !== '' && Math.abs(Number(a) - Number(b)) < 0.005)
// The models in an item name (2026-10-20, "editing compatible models
// reflects in the product name"): the team's names read "<models> Compatible
// <part>", so what comes before "Compatible" is swapped for the new list; a
// name without it follows only while it still starts with the models last put
// there. null = left as it is (changed by hand).
export const swapModelsInName = (name, lastPart, part) => {
    const n = String(name || '')
    if (!part) return null
    const m = n.match(/\s+compatible\b/i)
    if (m && m.index > 0) return part + n.slice(m.index)
    if (lastPart && n.toLowerCase().startsWith(lastPart.toLowerCase())) return part + n.slice(lastPart.length)
    return null
}
// per dialog: the model part last put in the name, the name before (Undo), the note shown
export const blankFollow = () => ({ part: '', undo: null, note: '' })
// The model part of a name for a Compatible Model list, from Listing's brands
// and models (GET /new-products, or /new-products/edit-context): each model the
// way the page names it — the first in full ("Samsung Galaxy S24 (S921)"), the
// rest short ("S24 Plus (S926)"), " / " between. A model not on the page: its
// Compatible Model without the brand's words, the brand's lead before the
// first ("MOTO", "Samsung Galaxy").
export function modelsNamePartFor(brands, rows, brand, models) {
    const b = (brands || []).find(x => x.value === brand) || {}
    const own = (rows || []).filter(r => r.brand === brand && r.nameModel)
    const words = (b.words || []).map(w => String(w).toLowerCase())
    return (models || []).map((cm, i) => {
        let row = own.find(r => r.compatibleModel === cm)
        if (!row) {
            const k = fitKey(cm)
            const hits = k ? own.filter(r => [r.compatibleModel, r.model, ...(r.aliases || [])].some(x => fitKey(x) === k)) : []
            if (hits.length === 1) row = hits[0]
        }
        if (row) return i === 0 ? row.nameModel.full : row.nameModel.short
        let short = String(cm || '').trim()
        for (let again = true; again;) {
            again = false
            for (const w of words) {
                const rx = new RegExp('^' + w + '\\s+', 'i')
                if (rx.test(short)) { short = short.replace(rx, ''); again = true }
            }
        }
        if (i > 0 || !b.nameLead || /^(realme|oneplus)\b/i.test(short)) return short
        return `${b.nameLead} ${short}`
    }).filter(Boolean).join(' / ')
}
// The quality goes at the end of the name in brackets, the way the team's
// items read ("… Compatible Battery [Original]"); picking another one swaps
// it, clearing it takes it off. Only a trailing tag that IS a quality (one of
// `qualities`, or the one put on last) is replaced, so typed wording stays.
export function withQualityTag(name, quality, applied, qualities) {
    const known = [...(qualities || []).filter(Boolean), applied].filter(Boolean)
    let base = String(name || '').trim()
    for (let m = base.match(/\s*\[([^\]]+)\]$/); m && known.includes(m[1]); m = base.match(/\s*\[([^\]]+)\]$/)) {
        base = base.slice(0, m.index).trim()
    }
    return quality ? `${base} [${quality}]` : base
}
// The typed price lists against the tier order (advisory, as on Price
// Monitoring: SVIP & Wholesale ≤ VIP ≤ Platinum; SVIP vs Wholesale free), and
// a list under the cost. `tp` = the page's $tp.
export function priceWarningsFor(prices, costValue, tp) {
    const p = prices || {}
    const has = k => p[k] != null && p[k] !== ''
    const out = []
    const rule = (low, high, a, b) => { if (has(low) && has(high) && Number(p[low]) > Number(p[high])) out.push(tp('{a} is above {b}', { a, b })) }
    rule('vip', 'platinum', 'VIP', 'Platinum')
    rule('svip', 'vip', 'SVIP', 'VIP')
    rule('wholesale', 'vip', 'Wholesale', 'VIP')
    if (!has('vip')) { rule('svip', 'platinum', 'SVIP', 'Platinum'); rule('wholesale', 'platinum', 'Wholesale', 'Platinum') }
    const cost = Number(costValue)
    if (cost > 0) for (const { list, label } of PRICE_LISTS) if (has(list) && Number(p[list]) < cost) out.push(tp('{a} is below the cost', { a: label }))
    return out
}

export const dhlLink = t =>`https://www.dhl.com/au-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(t)}`
export const zohoLink = id => `https://inventory.zoho.com/app/746138234#/inventory/items/${id}`
export const zohoPoLink = id => `https://inventory.zoho.com/app/746138234#/purchaseorders/${id}`

// The packing list for a batch as a standalone HTML document — shown in a
// preview first, printed from there. `tp` is the page's $tp so the sheet
// follows the app language. Columns: product, unit price, ordered, shipped.
// A shipping cost on the batch adds two foot rows: the cost, and the total
// with it.
export function packingListHtml(batch, tp) {
    const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const lines = batch.lines || []
    const rowsHtml = lines.map((l, i) => `<tr>
        <td class="n">${i + 1}</td>
        <td>${esc(l.productName)}${l.sku ? `<div class="sub">SKU: ${esc(l.sku)}</div>` : ''}</td>
        <td class="c">${l.orderQty == null ? '—' : l.orderQty}</td>
        <td class="c"><b>${l.shippedQty}</b></td>
        <td class="r">${esc(yuan(l.unitPrice))}</td>
        <td class="r">${l.unitPrice == null ? '' : esc(yuan(Math.round((Number(l.shippedQty) || 0) * Number(l.unitPrice) * 100) / 100))}</td>
    </tr>`).join('')
    const totalQty = lines.reduce((t, l) => t + (Number(l.shippedQty) || 0), 0)
    const priced = lines.some(l => l.unitPrice != null)
    const totalAmount = lines.reduce((t, l) => t + (Number(l.shippedQty) || 0) * (Number(l.unitPrice) || 0), 0)
    const shipping = Number(batch.shippingCost) > 0 ? Number(batch.shippingCost) : 0
    const shippingRows = shipping ? `
            <tr><td></td><td>${esc(tp('Shipping cost'))}</td><td></td><td></td><td></td><td class="r">${esc(yuan(shipping))}</td></tr>
            <tr><td></td><td>${esc(tp('Total with shipping'))}</td><td></td><td></td><td></td>
                <td class="r">${priced ? esc(yuan(Math.round((totalAmount + shipping) * 100) / 100)) : ''}</td></tr>` : ''
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>${esc(batch.batchNo)} ${esc(tp('Packing List'))}</title>
        <style>
            body { font: 12px/1.5 Arial, "Microsoft YaHei", sans-serif; color: #111; margin: 28px; }
            h1 { font-size: 18px; margin: 0 0 2px; }
            .meta { color: #555; margin-bottom: 14px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #999; padding: 5px 8px; text-align: left; vertical-align: top; }
            th { background: #f0f0f0; }
            .n { width: 30px; text-align: right; color: #555; }
            .c { text-align: center; white-space: nowrap; }
            .r { text-align: right; white-space: nowrap; }
            .sub { color: #777; font-size: 11px; }
            tfoot td { font-weight: bold; }
            @page { margin: 0; }
            @media print { body { margin: 14mm 12mm; } }
        </style></head><body>
        <h1>${esc(tp('Packing List'))} — ${esc(batch.batchNo)}</h1>
        <div class="meta">
            ${esc(tp('Tracking'))} ${esc(batch.tracking || '—')} · ${esc(tp('Shipped'))} ${esc(fmtDay(batch.shippedAt))}
            ${batch.zohoVendorName ? ' · ' + esc(tp('Vendor')) + ' ' + esc(batch.zohoVendorName) : ''}
            · ${esc(tp('{n} line(s)', { n: lines.length }))} · ${esc(tp('{n} pcs', { n: totalQty }))}${batch.createdBy ? ' · ' + esc(batch.createdBy) : ''}
            ${batch.note ? '<div>' + esc(batch.note) + '</div>' : ''}
        </div>
        <table><thead><tr>
            <th class="n">#</th><th>${esc(tp('Product'))}</th>
            <th class="c">${esc(tp('Ordered Qty'))}</th><th class="c">${esc(tp('Shipped Qty'))}</th>
            <th class="r">${esc(tp('Unit Price'))}</th><th class="r">${esc(tp('Line total'))}</th>
        </tr></thead><tbody>${rowsHtml}</tbody>
        <tfoot><tr><td></td><td>${esc(tp('Total'))}</td><td></td><td class="c">${totalQty}</td><td></td>
            <td class="r">${priced ? esc(yuan(totalAmount)) : ''}</td></tr>${shippingRows}</tfoot></table>
        </body></html>`
}

// The order list for a supplier (下单批次), previewed and printed / saved as
// PDF from the browser: SKU, product, quantity, the unit price once quoted.
export function orderListHtml(batch, tp) {
    const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // no prices on the order list (2026-10-14): they are filled on the Batches page when the parcel ships
    const lines = batch.lines || []
    const rowsHtml = lines.map((l, i) => `<tr>
        <td class="n">${i + 1}</td>
        <td class="c">${esc(l.sku || '—')}</td>
        <td>${esc(l.productName)}${l.note ? `<div class="sub">${esc(l.note)}</div>` : ''}</td>
        <td class="c"><b>${l.orderQty == null ? '—' : l.orderQty}</b></td>
    </tr>`).join('')
    const totalQty = lines.reduce((t, l) => t + (Number(l.orderQty) || 0), 0)
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>${esc(tp('Order list'))} ${esc(batch.batchNo)}</title>
        <style>
            body { font: 12px/1.5 Arial, "Microsoft YaHei", sans-serif; color: #111; margin: 28px; }
            h1 { font-size: 18px; margin: 0 0 2px; }
            .meta { color: #555; margin-bottom: 14px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #999; padding: 5px 8px; text-align: left; vertical-align: top; }
            th { background: #f0f0f0; }
            .n { width: 30px; text-align: right; color: #555; }
            .c { text-align: center; white-space: nowrap; }
            .r { text-align: right; white-space: nowrap; }
            .sub { color: #777; font-size: 11px; }
            tfoot td { font-weight: bold; }
            @page { margin: 0; }
            @media print { body { margin: 14mm 12mm; } }
        </style></head><body>
        <h1>${esc(tp('Order list'))} — ${esc(batch.batchNo)}</h1>
        <div class="meta">
            ${esc(tp('Supplier'))} ${esc(batch.supplier || '—')} · ${esc(tp('Date'))} ${esc(fmtDay(batch.createdAt))}
            · ${esc(tp('{n} line(s)', { n: lines.length }))} · ${esc(tp('{n} pcs', { n: totalQty }))}${batch.createdBy ? ' · ' + esc(batch.createdBy) : ''}
            ${batch.note ? '<div>' + esc(batch.note) + '</div>' : ''}
        </div>
        <table><thead><tr>
            <th class="n">#</th><th class="c">SKU</th><th>${esc(tp('Product'))}</th>
            <th class="c">${esc(tp('Qty'))}</th>
        </tr></thead><tbody>${rowsHtml}</tbody>
        <tfoot><tr><td></td><td></td><td>${esc(tp('Total'))}</td><td class="c">${totalQty}</td></tr></tfoot></table>
        </body></html>`
}
