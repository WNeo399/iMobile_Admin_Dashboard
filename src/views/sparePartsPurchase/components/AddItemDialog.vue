<template>
    <!--
        Add Item (user ask 2026-10-07): find Zoho items in the stock register
        by SKU or name (a scanned barcode works too), set the quantities, and
        each one becomes its own Pending purchase line — the same line Stock
        Monitoring's quick PO raises. 空运 (air) files a line under the item's
        own category, 海运 (sea) under 海运.
    -->
    <el-dialog :visible="visible" :width="mobile ? '94%' : '780px'" :top="mobile ? '3vh' : '8vh'" append-to-body
        :custom-class="'spp-add-dlg' + (mobile ? ' spp-dlg-m' : '')" :close-on-click-modal="false"
        @update:visible="v => $emit('update:visible', v)" @opened="focusSearch" @closed="reset">
        <div slot="title" class="spp-dlg-head"><i class="el-icon-plus" /> {{ $tp('Add Item') }}
            <span class="spp-dlg-no">{{ $tp('added as Pending') }}</span></div>

        <el-autocomplete ref="search" v-model="query" :fetch-suggestions="suggest" :trigger-on-focus="false" :debounce="250"
            highlight-first-item select-when-unmatched popper-class="spp-add-suggest" value-key="name" clearable
            prefix-icon="el-icon-search" class="ai-search" :placeholder="$tp('Search by SKU or product name, or scan a barcode')"
            @select="pick">
            <template slot-scope="{ item }">
                <div class="ai-sug">
                    <img v-if="item.imageUrl" :src="item.imageUrl" class="ai-sug-img" alt="" loading="lazy">
                    <div v-else class="ai-sug-img ai-img-none"><i class="el-icon-picture-outline" /></div>
                    <div class="ai-sug-main">
                        <div class="ai-sug-name">{{ item.name }}</div>
                        <div class="ai-sug-meta">SKU {{ item.sku || '—' }} · {{ $tp(item.suggestedCategory) }} ·
                            <span :class="{ 'ai-zero': !item.available }">{{ $tp('Stock') }} {{ item.available == null ? '—' : item.available }}</span>
                            <span v-if="taken(item)" class="ai-taken"> · {{ $tp('in the list') }}</span></div>
                    </div>
                </div>
            </template>
        </el-autocomplete>

        <div v-if="!lines.length" class="ai-empty">
            <i class="el-icon-box" />
            <div>{{ $tp('Search by SKU or product name, or scan a barcode') }}</div>
            <div class="ai-dim">{{ $tp('Each item becomes its own Pending line, ready to place with the supplier.') }}</div>
        </div>

        <div v-else class="ai-lines">
            <div v-for="(l, i) in lines" :key="l.itemId" class="ai-line">
                <img v-if="l.imageUrl" :src="l.imageUrl" class="ai-img" alt="" loading="lazy">
                <div v-else class="ai-img ai-img-none"><i class="el-icon-picture-outline" /></div>
                <div class="ai-main">
                    <div class="ai-name" :title="l.name">{{ l.name }}</div>
                    <div class="ai-meta">SKU {{ l.sku || '—' }} · {{ $tp(l.suggestedCategory) }} ·
                        <span :class="{ 'ai-zero': !l.available }">{{ $tp('Stock') }} {{ l.available == null ? '—' : l.available }}</span></div>
                    <!-- open lines for it already: easy to double-order otherwise -->
                    <div v-if="l.onOrder" class="ai-onorder"><i class="el-icon-warning-outline" /> {{ $tp('Already on order') }}: {{ l.onOrder }}</div>
                </div>
                <div class="ai-ctrls">
                    <el-input-number v-model="l.orderQty" :min="1" :max="99999" :precision="0" size="mini" controls-position="right" class="ai-qty" />
                    <el-radio-group v-model="l.sea" size="mini" class="ai-chan">
                        <el-radio-button :label="false" :title="$tp('Files under {c}', { c: $tp(l.suggestedCategory) })">空运</el-radio-button>
                        <el-radio-button :label="true">海运</el-radio-button>
                    </el-radio-group>
                    <el-button type="text" icon="el-icon-close" class="ai-remove" :title="$tp('Remove')" @click="lines.splice(i, 1)" />
                </div>
                <el-input v-model="l.note" size="mini" maxlength="200" :placeholder="$tp('Note (optional)')" class="ai-note" />
            </div>
        </div>

        <span slot="footer" class="spp-dlg-foot">
            <span v-if="lines.length" class="ai-total">{{ $tp('{n} item(s) · {q} units', { n: lines.length, q: totalUnits }) }}</span>
            <el-button size="small" @click="$emit('update:visible', false)">{{ $tp('Cancel') }}</el-button>
            <el-button type="primary" size="small" icon="el-icon-check" :loading="saving" :disabled="!lines.length"
                @click="submit">{{ $tp('Add {n} as Pending', { n: lines.length || '' }) }}</el-button>
        </span>
    </el-dialog>
</template>

<script>
import { searchProducts, purchasesByItemIds, createOrders } from '@/api/sparePartsPurchase'

const MAX_LINES = 100
const STAGES = [['pending', 'pending'], ['toConfirm', 'to confirm'], ['ordered', 'ordered'], ['shipped', 'shipped'], ['shortage', 'shortage']]

export default {
    name: 'AddItemDialog',
    props: {
        visible: { type: Boolean, default: false },
        // the page is on 海运: new lines start as sea freight
        defaultSea: { type: Boolean, default: false },
        mobile: { type: Boolean, default: false }
    },
    data() {
        // last: the newest search answered, { q, rows }; seq orders the requests
        return { query: '', lines: [], saving: false, last: { q: '', rows: [] }, seq: 0 }
    },
    computed: {
        totalUnits() {
            return this.lines.reduce((s, l) => s + (Number(l.orderQty) || 0), 0)
        }
    },
    methods: {
        focusSearch() {
            const r = this.$refs.search
            if (r && r.focus) r.focus()
        },
        reset() {
            this.query = ''
            this.lines = []
            this.last = { q: '', rows: [] }
        },
        taken(item) {
            return this.lines.some(l => l.itemId === item.itemId)
        },
        async find(q) {
            const r = await searchProducts(q)
            if (!r || r.success === false) throw new Error((r && r.message) || 'Search failed')
            return r.products || []
        },
        async suggest(q, cb) {
            const text = (q || '').trim()
            if (!text) { cb([]); return }
            const seq = ++this.seq
            try {
                const rows = await this.find(text)
                if (seq === this.seq) { this.last = { q: text, rows }; cb(rows); return }
                // an older answer arriving late: keep what the newest one showed
                cb((this.query || '').trim() ? this.last.rows : [])
            } catch (e) {
                cb(seq === this.seq ? [] : this.last.rows)
            }
        },
        // A suggestion picked — or Enter on text with none highlighted (a
        // scanner): then the exact SKU is looked up straight away.
        async pick(item) {
            if (item && item.itemId) { this.add(item); return }
            const text = (this.query || '').trim()
            if (!text) return
            try {
                const rows = this.last.q === text ? this.last.rows : await this.find(text)
                const exact = rows.find(r => String(r.sku).toLowerCase() === text.toLowerCase())
                if (exact) this.add(exact)
                else this.$message.warning(this.$tp('No item with SKU {sku}', { sku: text }))
            } catch (e) {
                this.$message.error((e && e.message) || this.$tp('Search failed'))
            }
        },
        async add(item) {
            this.query = ''
            this.last = { q: '', rows: [] }
            // a search still in flight (a scanner's Enter beats the debounce) must not reopen the list
            this.seq++
            this.$nextTick(() => { this.focusSearch(); const r = this.$refs.search; if (r) r.suggestions = [] })
            const have = this.lines.find(l => l.itemId === item.itemId)
            if (have) {
                have.orderQty = (Number(have.orderQty) || 0) + 1
                this.$message.info(this.$tp('{sku} is already in the list — quantity now {n}', { sku: item.sku || item.name, n: have.orderQty }))
                return
            }
            if (this.lines.length >= MAX_LINES) { this.$message.warning(this.$tp('At most {n} items at a time', { n: MAX_LINES })); return }
            const line = { ...item, orderQty: 1, sea: this.defaultSea, note: '', onOrder: '' }
            this.lines.push(line)
            // what is already on order for it (best effort)
            try {
                const r = await purchasesByItemIds([item.itemId])
                const o = r && r.data && r.data[item.itemId]
                if (o) {
                    const parts = STAGES.filter(([k]) => o[k]).map(([k, label]) => `${o[k]} ${this.$tp(label)}`)
                    const target = this.lines.find(l => l.itemId === item.itemId)
                    if (target && parts.length) target.onOrder = parts.join(' · ')
                }
            } catch (e) { /* the warning is a nicety */ }
        },
        async submit() {
            if (!this.lines.length || this.saving) return
            const bad = this.lines.find(l => !Number.isInteger(Number(l.orderQty)) || Number(l.orderQty) < 1)
            if (bad) { this.$message.warning(this.$tp('Quantity must be a positive number')); return }
            this.saving = true
            try {
                const payload = this.lines.map(l => ({
                    itemId: l.itemId, sku: l.sku, productName: l.name, imageId: l.imageId,
                    // 海运, or the item's own category (the server derives it from the register)
                    category: l.sea ? '海运' : l.suggestedCategory,
                    orderQty: Number(l.orderQty), note: (l.note || '').trim()
                }))
                const r = await createOrders(payload)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                const n = r.created || payload.length
                this.$message.success(this.$tp('{n} line(s) added as Pending', { n }))
                this.$emit('added', { count: n, orderNos: r.orderNos || [], sea: payload.some(p => p.category === '海运') })
                this.$emit('update:visible', false)
            } catch (e) {
                this.$message.error((e && (e.message || (e.response && e.response.data && e.response.data.message))) || this.$tp('Failed to create the order'))
            } finally {
                this.saving = false
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.spp-dlg-head { font-size: 15px; font-weight: 600; color: #303133; i { color: #409eff; margin-right: 4px; } }
.spp-dlg-no { margin-left: 8px; font-weight: 400; color: #909399; font-size: 13px; }
.ai-search { width: 100%; margin-bottom: 12px; }
.ai-empty { text-align: center; color: #909399; font-size: 13px; padding: 34px 0 26px; border: 1px dashed #e4e7ed; border-radius: 8px;
    i { font-size: 30px; color: #c0c4cc; display: block; margin-bottom: 8px; } }
.ai-dim { font-size: 12px; color: #c0c4cc; margin-top: 4px; }
.ai-lines { max-height: 52vh; overflow-y: auto; border: 1px solid #ebeef5; border-radius: 8px; }
.ai-line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 8px 10px; border-bottom: 1px solid #f0f2f5;
    &:last-child { border-bottom: 0; } }
.ai-img { flex: 0 0 40px; width: 40px; height: 40px; border-radius: 4px; object-fit: cover; background: #f5f7fa; }
.ai-img-none { display: flex; align-items: center; justify-content: center; color: #c0c4cc; font-size: 16px; }
.ai-main { flex: 1 1 220px; min-width: 0; }
.ai-name { font-size: 13px; color: #303133; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ai-meta { font-size: 11px; color: #909399; margin-top: 2px; }
.ai-zero { color: #f56c6c; }
.ai-onorder { font-size: 11px; color: #e6a23c; margin-top: 2px; }
.ai-ctrls { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.ai-qty { width: 96px; }
.ai-chan { flex-shrink: 0; display: inline-flex; white-space: nowrap; }
.ai-remove { color: #c0c4cc; padding: 4px; &:hover { color: #f56c6c; } }
.ai-note { flex: 0 0 100%; padding-left: 50px; box-sizing: border-box; }
.ai-total { margin-right: auto; font-size: 12px; color: #606266; align-self: center; }
.spp-dlg-foot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; .el-button + .el-button { margin-left: 0; } }
/* phone: the name on its own line, the controls under it */
@media (max-width: 767px) {
    .ai-main { flex-basis: calc(100% - 50px); }
    .ai-ctrls { width: 100%; padding-left: 50px; box-sizing: border-box; }
    .ai-qty { flex: 1; width: auto; }
    .ai-total { flex-basis: 100%; }
}
</style>

<style lang="scss">
/* the suggestions list (appended to body) */
.spp-add-suggest { min-width: 520px !important; max-width: calc(100vw - 24px);
    li { line-height: 1.3 !important; padding: 6px 12px !important; }
    .ai-sug { display: flex; align-items: center; gap: 10px; }
    .ai-sug-img { flex: 0 0 34px; width: 34px; height: 34px; border-radius: 4px; object-fit: cover; background: #f5f7fa; }
    .ai-img-none { display: flex; align-items: center; justify-content: center; color: #c0c4cc; }
    .ai-sug-main { flex: 1; min-width: 0; }
    .ai-sug-name { font-size: 13px; color: #303133; white-space: normal; }
    .ai-sug-meta { font-size: 11px; color: #909399; margin-top: 2px; }
    .ai-zero { color: #f56c6c; }
    .ai-taken { color: #409eff; } }
@media (max-width: 767px) { .spp-add-suggest { min-width: 0 !important; } }
</style>
