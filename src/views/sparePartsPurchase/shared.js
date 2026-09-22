// Shared bits of the Spare Parts Purchase pages: the status vocabulary,
// formatting helpers and the printable packing list.
//
// Labels are the English source text — the pages show them through $tp,
// so zh.js translates them under `page`.

export const STATUS_LIST = [
    { value: 'pending', label: 'Pending', icon: 'el-icon-time', color: '#E6A23C', bg: '#FDF6EC' },
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
export const CLASSIFICATIONS = ['Screen', 'Housing', 'BackCover', 'Battery', 'Small Parts', 'Tools', 'Other']
export const CHANNELS = ['海运', 'Special Order']
export const CATEGORIES = [...CLASSIFICATIONS, ...CHANNELS]
export const isChannel = c => CHANNELS.includes(c)

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
export const dhlLink = t => `https://www.dhl.com/au-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(t)}`
export const zohoLink = id => `https://inventory.zoho.com/app/746138234#/inventory/items/${id}`
export const zohoPoLink = id => `https://inventory.zoho.com/app/746138234#/purchaseorders/${id}`

// The packing list for a batch as a standalone HTML document — shown in a
// preview first, printed from there. `tp` is the page's $tp so the sheet
// follows the app language. Columns: product, unit price, ordered, shipped.
export function packingListHtml(batch, tp) {
    const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const lines = batch.lines || []
    const rowsHtml = lines.map((l, i) => `<tr>
        <td class="n">${i + 1}</td>
        <td>${esc(l.productName)}${l.sku ? `<div class="sub">SKU: ${esc(l.sku)}</div>` : ''}</td>
        <td class="r">${esc(yuan(l.unitPrice))}</td>
        <td class="c">${l.orderQty == null ? '—' : l.orderQty}</td>
        <td class="c"><b>${l.shippedQty}</b></td>
    </tr>`).join('')
    const totalQty = lines.reduce((t, l) => t + (Number(l.shippedQty) || 0), 0)
    const totalAmount = lines.reduce((t, l) => t + (Number(l.shippedQty) || 0) * (Number(l.unitPrice) || 0), 0)
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
            <th class="n">#</th><th>${esc(tp('Product'))}</th><th class="r">${esc(tp('Unit Price'))}</th>
            <th class="c">${esc(tp('Ordered Qty'))}</th><th class="c">${esc(tp('Shipped Qty'))}</th>
        </tr></thead><tbody>${rowsHtml}</tbody>
        <tfoot><tr><td></td><td>${esc(tp('Total'))}</td><td class="r">${esc(yuan(totalAmount))}</td><td></td><td class="c">${totalQty}</td></tr></tfoot></table>
        </body></html>`
}
