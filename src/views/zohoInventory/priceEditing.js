// Price editing shared by Price Monitoring and Browse Items (user ask
// 2026-10-07 — "share the same component"). Moved out of priceMonitoring.vue
// unchanged in behaviour:
//   · a price cell is clicked, typed and ✓'d → the change waits in the
//     loading zone (one queue for both pages, kept in localStorage) and goes
//     to Zoho with "Push all" (PUT /stock-monitor/prices/bulk, in chunks);
//   · the purchase price is saved to Zoho straight away (one quick call);
//   · a row can edit all its prices at once (row edit), with advisory
//     tier-order / below-cost warnings and the pricing rule's reference
//     prices one click away.
// The host page provides `rows` (the rows on screen — they take the pushed
// rates) and renders <price-cell> for each price column and one
// <price-queue-zone>, both given `pm` (the host itself).
import auth from '@/plugins/auth'
import { pushStockItemPrices } from '@/api/stockMonitor'

export const PRICE_COLS = [
    { prop: 'pricePlatinum', label: 'Platinum', list: 'platinum' },
    { prop: 'priceVip', label: 'VIP', list: 'vip' },
    { prop: 'priceSvip', label: 'SVIP', list: 'svip' },
    { prop: 'priceWholesale', label: 'WholeSale', list: 'wholesale' }
]
// The purchase price (the Zoho item's purchase rate) is edited like the four
// price lists but saved straight away — one quick item call — instead of
// waiting in the loading zone with them (user asks 2026-09-24).
export const PURCHASE_COL = { prop: 'purchasePrice', label: 'Purchase', list: 'purchase' }
export const EDIT_COLS = [PURCHASE_COL, ...PRICE_COLS]
export const PLACEHOLDERS = new Set([9999.99, 9000, 8888, 7777, 7000, 6000])
// Changes per request when pushing: the server makes at most one Zoho call
// per price list for each, so the progress moves every few seconds.
const PUSH_CHUNK = 20
// One queue for every page that edits prices.
const QUEUE_KEY = 'pm-price-queue'

export default {
    data() {
        return {
            PRICE_COLS,
            EDIT_COLS,
            // Inline price edit — one cell being typed into at a time.
            pEdit: { itemId: null, list: '', prop: '', value: 0 },
            // Cells locked while a push is running, keyed `${itemId}|${list}` → { rate }.
            pushing: {},
            // The loading zone: edits waiting to go to Zoho together, keyed
            // `${itemId}|${list}` → { key, itemId, sku, name, list, prop, label,
            // rate, from, error }. Kept in localStorage so a reload keeps them.
            queue: {},
            pushingAll: false,
            // How far the chunked push has got (drives the progress bar).
            pushProgress: { done: 0, total: 0, failed: 0 },
            // The review dialog (the queued changes, product by product).
            reviewVisible: false,
            // Row edit: one product's prices edited in its table row.
            rowEdit: { itemId: null, row: null, values: {} }
        }
    },
    computed: {
        // the host, for <price-cell> / <price-queue-zone>
        pm() { return this },
        canEditPrices() {
            return auth.hasPermi('zoho:stock:edit')
        },
        // The zone's list: one row per product, its changes in tier order.
        queueGroups() {
            const order = EDIT_COLS.map(c => c.list)
            const groups = new Map()
            for (const q of Object.values(this.queue)) {
                let g = groups.get(q.itemId)
                if (!g) { g = { itemId: q.itemId, name: q.name, sku: q.sku, changes: [] }; groups.set(q.itemId, g) }
                g.changes.push(q)
            }
            for (const g of groups.values()) g.changes.sort((a, b) => order.indexOf(a.list) - order.indexOf(b.list))
            return [...groups.values()]
        },
        pushPercent() {
            return this.pushProgress.total ? Math.round((this.pushProgress.done / this.pushProgress.total) * 100) : 0
        },
        queueCount() { return Object.keys(this.queue).length },
        queueErrors() { return Object.values(this.queue).filter(q => q.error).length },
        // Price lists whose new value differs from the current one (and that
        // aren't already mid-push) — what ✓ will send.
        rowChanges() {
            const row = this.rowEdit.row
            if (!row) return []
            return EDIT_COLS
                .filter(c => this.rowChanged(c) && !this.pushing[this.pushKey(row, c)])
                .map(c => ({ col: c, rate: Math.round(Number(this.rowEdit.values[c.list]) * 100) / 100 }))
        },
        // Advisory checks on the prices as they would stand after the push:
        // the tier order (SVIP & WholeSale ≤ VIP ≤ Platinum; SVIP vs WholeSale
        // unordered) and nothing below cost. Placeholders are skipped.
        rowWarnings() {
            const row = this.rowEdit.row
            if (!row) return []
            const next = {}
            for (const c of PRICE_COLS) {
                const v = this.rowEdit.values[c.list]
                next[c.list] = v != null && Number.isFinite(Number(v)) ? Number(v) : row[c.prop]
            }
            const real = v => (v == null || PLACEHOLDERS.has(Number(v)) ? null : Number(v))
            const label = { platinum: 'Platinum', vip: 'VIP', svip: 'SVIP', wholesale: 'WholeSale' }
            const out = []
            for (const [lo, hi] of [['svip', 'vip'], ['wholesale', 'vip'], ['vip', 'platinum'], ['svip', 'platinum'], ['wholesale', 'platinum']]) {
                const a = real(next[lo]), b = real(next[hi])
                if (a != null && b != null && a > b + 1e-9) out.push(`${label[lo]} ${this.money(a)} is above ${label[hi]} ${this.money(b)}`)
            }
            // the purchase price as typed, when it is being edited too
            const typedCost = this.rowEdit.values.purchase
            const cost = typedCost != null && Number.isFinite(Number(typedCost)) ? Number(typedCost) : Number(row.purchasePrice)
            if (cost > 0) {
                for (const c of PRICE_COLS) {
                    const v = real(next[c.list])
                    if (v != null && v < cost) out.push(`${c.label} ${this.money(v)} is below the purchase price ${this.money(cost)}`)
                }
            }
            return out
        },
        // What the row edit's ✓ will do: the purchase price is saved now,
        // the price lists join the loading zone.
        rowSubmitLabel() {
            const ch = this.rowChanges
            if (!ch.length) return 'No changes yet'
            const cost = ch.some(c => c.col.list === 'purchase')
            const lists = ch.length - (cost ? 1 : 0)
            return [
                cost ? 'Save the purchase price to Zoho now' : '',
                lists ? `queue ${lists} ${lists === 1 ? 'price' : 'prices'} for Zoho` : ''
            ].filter(Boolean).join(', ')
        }
    },
    created() {
        this.restoreQueue()
    },
    // Another page may have changed the shared queue meanwhile: read it again
    // when this page comes back (kept-alive tab) or another window writes it.
    activated() {
        if (!this.pushingAll) this.restoreQueue()
    },
    mounted() {
        this.onQueueStorage = (e) => { if (e.key === QUEUE_KEY && !this.pushingAll) this.restoreQueue() }
        window.addEventListener('storage', this.onQueueStorage)
    },
    beforeDestroy() {
        window.removeEventListener('storage', this.onQueueStorage)
    },
    methods: {
        // rows come as { name } (Price Monitoring) or { productName } (Browse Items)
        pmName(row) { return (row && (row.name || row.productName)) || '' },
        pmMsg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback
        },
        pushKey(row, col) {
            return `${row.itemId}|${col.list}`
        },
        // `prefill` opens the editor with that value instead of the current rate.
        startPriceEdit(row, col, prefill) {
            if (this.pushing[this.pushKey(row, col)]) return
            this.pEdit = {
                itemId: row.itemId, list: col.list, prop: col.prop,
                value: prefill != null ? prefill : row[col.prop] == null ? 0 : Number(row[col.prop])
            }
        },
        useRefPrice(row, col) {
            const ref = this.refPrice(row, col)
            if (ref == null) return
            this.pEdit.value = ref
            // Back into the input so Enter still saves.
            this.$nextTick(() => {
                const input = document.querySelector('.pm-edit-wrap .pm-input input')
                if (input) input.focus()
            })
        },
        cancelPriceEdit() {
            this.pEdit = { itemId: null, list: '', prop: '', value: 0 }
        },
        // Enter: blur first so el-input-number commits, then save.
        priceEnter(evt, row) {
            if (evt && evt.target) evt.target.blur()
            this.$nextTick(() => this.savePriceEdit(row))
        },
        savePriceEdit(row) {
            if (this.pEdit.itemId !== row.itemId) return
            const { list, value } = this.pEdit
            const rate = Math.round(Number(value) * 100) / 100
            if (!Number.isFinite(rate) || rate < 0) {
                this.$message.error('Enter a valid price')
                return
            }
            this.cancelPriceEdit()
            // The purchase price goes to Zoho now; a price list joins the
            // loading zone and leaves with the next "Push all".
            if (list === 'purchase') { this.savePurchase(row, rate); return }
            const col = EDIT_COLS.find(c => c.list === list)
            this.enqueue(row, col, rate)
        },
        // One purchase price straight to Zoho (the item's purchase rate — a
        // single quick call, so no queue). The cell locks while it is on its
        // way; the row then takes the new cost and everything computed from
        // it (below-cost flag, formula rule and reference prices).
        async savePurchase(row, rate) {
            const key = this.pushKey(row, PURCHASE_COL)
            if (this.pushing[key]) return
            const from = row.purchasePrice == null ? null : Number(row.purchasePrice)
            if (from != null && Math.round(from * 100) === Math.round(rate * 100)) return
            // A purchase change left queued by an earlier version goes now.
            if (this.queue[key]) this.dequeue(key)
            this.$set(this.pushing, key, { rate })
            try {
                const r = await pushStockItemPrices([{ itemId: row.itemId, list: 'purchase', rate }])
                const res = r && Array.isArray(r.results) ? r.results[0] : null
                if (!r || r.success === false || !res) throw new Error((r && r.message) || 'No answer from the server')
                if (!res.ok) throw new Error(res.message || 'Zoho refused the purchase price')
                this.$set(row, 'purchasePrice', res.rate)
                if (res.flags && !(res.flagsSeq < (row.__flagsSeq || 0))) {
                    for (const k of Object.keys(res.flags)) this.$set(row, k, res.flags[k])
                    row.__flagsSeq = res.flagsSeq || 0
                }
                this.$message.success(`${row.sku || this.pmName(row)}: purchase price ${this.money(res.rate)} saved to Zoho`)
            } catch (e) {
                this.$message.error(`${row.sku || this.pmName(row)}: ${this.pmMsg(e, 'could not save the purchase price')}`)
            } finally {
                this.$delete(this.pushing, key)
            }
        },
        // ── The loading zone ──
        // Same product + price list replaces the earlier entry. A change back
        // to the current rate simply drops the entry.
        enqueue(row, col, rate) {
            const key = this.pushKey(row, col)
            if (this.pushing[key]) { this.$message.warning('That price is being pushed right now — try again in a moment'); return }
            const from = row[col.prop] == null ? null : Number(row[col.prop])
            if (from != null && Math.round(from * 100) === Math.round(rate * 100)) { this.dequeue(key); return }
            this.$set(this.queue, key, {
                key, itemId: row.itemId, sku: row.sku || '', name: this.pmName(row),
                list: col.list, prop: col.prop, label: col.label, rate, from, error: ''
            })
            this.saveQueue()
        },
        // Drop every change of one product.
        dequeueItem(itemId) {
            for (const k of Object.keys(this.queue)) if (this.queue[k].itemId === itemId) this.$delete(this.queue, k)
            this.saveQueue()
            if (!this.queueCount) this.reviewVisible = false
        },
        // A chip opens the cell's editor when the row is on this page.
        editQueued(q) {
            const row = (this.rows || []).find(r => r.itemId === q.itemId)
            const col = EDIT_COLS.find(c => c.list === q.list)
            if (!row || !col) { this.$message.info('That product is not on this page — search for it to change the price'); return }
            this.reviewVisible = false
            this.startPriceEdit(row, col, q.rate)
            const el = this.$el.querySelector(`[data-item="${q.itemId}"]`)
            if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        },
        // The change as a percentage of the current rate ("+2.4%").
        deltaText(q) {
            if (q.from == null || !(Number(q.from) > 0)) return ''
            const pct = ((Number(q.rate) - Number(q.from)) / Number(q.from)) * 100
            if (Math.abs(pct) < 0.05) return ''
            return `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`
        },
        deltaClass(q) {
            return q.from != null && Number(q.rate) < Number(q.from) ? 'down' : 'up'
        },
        confirmClear() {
            const n = this.queueCount
            this.$confirm(`Discard ${n === 1 ? 'the queued price change' : `all ${n} queued price changes`}? Nothing has been sent to Zoho.`,
                'Discard changes', { type: 'warning', confirmButtonText: 'Discard', cancelButtonText: 'Keep' })
                .then(() => { this.clearQueue(); this.reviewVisible = false })
                .catch(() => {})
        },
        dequeue(key) {
            this.$delete(this.queue, key)
            this.saveQueue()
            if (!this.queueCount) this.reviewVisible = false
        },
        clearQueue() {
            this.queue = {}
            this.saveQueue()
        },
        saveQueue() {
            try { localStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue)) } catch (e) { /* storage unavailable — the queue still works for this page */ }
        },
        restoreQueue() {
            try {
                const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '{}')
                this.queue = q && typeof q === 'object' && !Array.isArray(q) ? q : {}
            } catch (e) { this.queue = {} }
        },
        // Everything queued goes to Zoho in requests of PUSH_CHUNK changes,
        // one after the other; the server writes each request one Zoho call
        // at a time. Rows on screen take the new rates and flags as each
        // request comes back; whatever Zoho refused stays queued with its
        // reason, and the review dialog opens on it.
        async pushAll() {
            const items = Object.values(this.queue)
            if (!items.length || this.pushingAll) return
            this.pushingAll = true
            this.reviewVisible = false
            this.pushProgress = { done: 0, total: items.length, failed: 0 }
            for (const q of items) this.$set(this.pushing, q.key, { rate: q.rate })
            let pushed = 0
            let failed = 0
            let interrupted = ''
            try {
                for (let i = 0; i < items.length; i += PUSH_CHUNK) {
                    const chunk = items.slice(i, i + PUSH_CHUNK)
                    const r = await pushStockItemPrices(chunk.map(q => ({ itemId: q.itemId, list: q.list, rate: q.rate })))
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    const answered = new Set()
                    for (const res of r.results || []) {
                        const key = `${res.itemId}|${res.list}`
                        answered.add(key)
                        const q = this.queue[key]
                        if (res.ok) {
                            const target = (this.rows || []).find(x => x.itemId === res.itemId)
                            if (target) {
                                const col = EDIT_COLS.find(c => c.list === res.list)
                                if (col) this.$set(target, col.prop, res.rate)
                                if (res.flags && !(res.flagsSeq < (target.__flagsSeq || 0))) {
                                    for (const k of Object.keys(res.flags)) this.$set(target, k, res.flags[k])
                                    target.__flagsSeq = res.flagsSeq || 0
                                }
                            }
                            this.$delete(this.queue, key)
                            pushed++
                        } else if (q) {
                            this.$set(q, 'error', res.message || 'not saved')
                            failed++
                        }
                    }
                    // A change the server did not answer for stays queued, flagged.
                    for (const q of chunk) {
                        if (!answered.has(q.key) && this.queue[q.key]) { this.$set(this.queue[q.key], 'error', 'no answer from the server'); failed++ }
                        this.$delete(this.pushing, q.key)
                    }
                    this.pushProgress = { done: Math.min(i + chunk.length, items.length), total: items.length, failed }
                    this.saveQueue()
                }
            } catch (e) {
                interrupted = this.pmMsg(e, 'Push interrupted')
            } finally {
                for (const q of items) this.$delete(this.pushing, q.key)
                this.pushingAll = false
            }
            if (interrupted) {
                this.$message.error(`${interrupted} — ${this.queueCount} ${this.queueCount === 1 ? 'change is' : 'changes are'} still queued`)
            } else if (failed) {
                this.reviewVisible = true
                this.$message.warning(`${pushed} pushed to Zoho, ${failed} refused — still queued, with the reason`)
            } else {
                this.$message.success(`${pushed} price ${pushed === 1 ? 'change' : 'changes'} pushed to Zoho`)
            }
        },
        // ── All the prices of one product, in its row ──
        openRowEdit(row) {
            if (this.pEdit.itemId === row.itemId) this.cancelPriceEdit()
            const values = {}
            for (const c of EDIT_COLS) values[c.list] = row[c.prop] == null ? undefined : Number(row[c.prop])
            this.rowEdit = { itemId: row.itemId, row, values }
        },
        cancelRowEdit() {
            this.rowEdit = { itemId: null, row: null, values: {} }
        },
        rowChanged(col) {
            const v = this.rowEdit.values[col.list]
            if (v == null || !Number.isFinite(Number(v))) return false
            const cur = this.rowEdit.row[col.prop]
            return cur == null || Math.round(Number(v) * 100) !== Math.round(Number(cur) * 100)
        },
        rowUseRef(col) {
            const ref = this.refPrice(this.rowEdit.row, col)
            if (ref != null && !this.pushing[this.pushKey(this.rowEdit.row, col)]) this.rowEdit.values[col.list] = ref
        },
        rowUseAllRefs() {
            for (const c of PRICE_COLS) this.rowUseRef(c)
        },
        // Enter in any of the row's inputs: blur first so el-input-number
        // commits the typed value, then push.
        rowEnter(evt) {
            if (evt && evt.target) evt.target.blur()
            this.$nextTick(() => this.submitRowEdit())
        },
        submitRowEdit() {
            const row = this.rowEdit.row
            const changes = this.rowChanges
            if (!row || !changes.length) return
            this.cancelRowEdit()
            if (this.pEdit.itemId === row.itemId) this.cancelPriceEdit()
            // The purchase price is saved now; the price lists go into the
            // loading zone and leave with the next "Push all".
            const cost = changes.find(c => c.col.list === 'purchase')
            const lists = changes.filter(c => c.col.list !== 'purchase')
            for (const { col, rate } of lists) this.enqueue(row, col, rate)
            if (lists.length) {
                this.$message.success(`${row.sku || this.pmName(row)}: ${lists.length} ${lists.length === 1 ? 'price' : 'prices'} queued in the loading zone`)
            }
            if (cost) this.savePurchase(row, cost.rate)
        },
        // The formula's reference rate for a cell (null when the item has
        // no cost price).
        refPrice(row, col) {
            return row && row.priceExpected && row.priceExpected[col.list] != null
                ? row.priceExpected[col.list]
                : null
        },
        // Signed deviation of the actual rate from the reference; null when
        // either side is unusable (missing / placeholder).
        refDev(row, col) {
            const ref = this.refPrice(row, col)
            const a = Number(row[col.prop])
            if (ref == null || !(ref > 0) || !Number.isFinite(a)) return null
            if (PLACEHOLDERS.has(a)) return null
            return (a - ref) / ref
        },
        refDevClass(row, col) {
            const d = this.refDev(row, col)
            if (d == null || Math.abs(d) <= 0.05) return ''
            return d > 0 ? 'pm-ref-high' : 'pm-ref-low'
        },
        refDevText(row, col) {
            const d = this.refDev(row, col)
            if (d == null || Math.abs(d) <= 0.05) return ''
            return (d > 0 ? '↑' : '↓') + Math.round(Math.abs(d) * 100) + '%'
        },
        // Tooltip on a price cell: the formula's expected value when the
        // item has a cost price, plus the edit hint.
        cellTitle(row, col) {
            const parts = []
            if (row.priceExpected && row.priceExpected[col.list] != null) {
                parts.push(`Formula (${row.priceRule}): $${Number(row.priceExpected[col.list]).toFixed(2)} ±5%`)
            }
            if (this.canEditPrices) parts.push(col.list === 'purchase' ? 'Click to edit the purchase price — saved to Zoho straight away' : 'Click to edit — queued for Zoho')
            return parts.join(' · ')
        },
        priceClass(row, v) {
            if (v == null) return 'sd-dim'
            if (PLACEHOLDERS.has(Number(v))) return 'sd-mono sd-warn'
            if (row.purchasePrice > 0 && Number(v) < row.purchasePrice) return 'sd-mono sd-bad'
            return 'sd-mono'
        },
        money(v) {
            if (v == null || v === '') return '—'
            return '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        }
    }
}
