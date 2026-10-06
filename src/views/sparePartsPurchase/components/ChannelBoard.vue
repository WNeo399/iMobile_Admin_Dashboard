<template>
    <!--
        New Product / Special Order as a stage board (user ask 2026-10-06):
        one column per step of their process — quote, confirm, order, ship,
        receive — each line a card (OrderCard) with its photo, price and the
        one action that moves it on. The page does the actions; the board
        emits them. Desktop: the columns share the width, an empty one
        shrinks. Phone: the steps become tabs and one step shows at a time.
    -->
    <div :class="['cb', { 'is-mobile': mobile }]">
        <div class="cb-bar">
            <el-input v-model="search" size="small" clearable prefix-icon="el-icon-search" class="cb-search"
                :placeholder="$tp('Product, order no, for, supplier…')" />
            <span v-if="urgentCount" class="cb-urgent-sum"><i class="el-icon-warning" /> {{ $tp('{n} urgent', { n: urgentCount }) }}</span>
            <template v-if="!mobile">
                <span class="cb-spacer" />
                <span class="cb-dim">{{ $tp('Received: the latest {n}', { n: receivedCap }) }}</span>
            </template>
        </div>
        <!-- phone: the steps as tabs (the count on each) -->
        <div v-if="mobile" ref="tabs" class="cb-tabs">
            <span v-for="col in columns" :key="col.key" :class="['cb-tab', { on: col.key === stage, empty: !col.cards.length }]" @click="pick(col.key)">
                <i class="cb-col-dot" :style="{ background: col.color }" />{{ $tp(col.title) }}<b>{{ col.cards.length }}</b>
            </span>
        </div>
        <div ref="cols" v-loading="loading" class="cb-cols">
            <div v-for="col in columns" v-show="!mobile || col.key === stage" :key="col.key"
                :class="['cb-col', 'cb-col-' + col.key, { 'is-empty': !col.cards.length, 'is-slim': slim && !col.cards.length }]">
                <!-- a tight screen: an empty step is a slim lane with its name upright -->
                <div v-if="slim && !col.cards.length" class="cb-slim" :title="$tp(col.title) + ' — ' + $tp(col.who)">
                    <span class="cb-col-dot" :style="{ background: col.color }" />
                    <span class="cb-slim-title">{{ $tp(col.title) }}</span>
                    <span class="cb-col-count">0</span>
                </div>
                <template v-else>
                <div class="cb-col-head">
                    <template v-if="!mobile">
                        <span class="cb-col-dot" :style="{ background: col.color }" />
                        <span class="cb-col-title">{{ $tp(col.title) }}</span>
                        <span class="cb-col-count">{{ col.cards.length }}</span>
                    </template>
                    <div class="cb-col-who">{{ $tp(col.who) }}<span v-if="mobile && col.key === 'received'"> · {{ $tp('the latest {n}', { n: receivedCap }) }}</span></div>
                </div>
                <div class="cb-col-body">
                    <div v-if="!col.cards.length" class="cb-empty">{{ $tp('Nothing here') }}</div>
                    <order-card v-for="r in col.cards" :key="r._id" :row="r" :can="can" :can-either="canEither"
                        @action="(k, row) => $emit('action', k, row)" />
                </div>
                </template>
            </div>
        </div>
    </div>
</template>

<script>
import OrderCard from './OrderCard'

// The steps, left to right. `who` is the side that moves a card on.
const COLUMNS = [
    { key: 'quote', title: 'Waiting for quote', who: 'Supplier quotes', color: '#e6a23c' },
    { key: 'confirm', title: 'To Confirm', who: 'iMobile confirms the price', color: '#0ea5a5' },
    { key: 'order', title: 'Ready to order', who: 'Supplier places the order', color: '#409eff' },
    { key: 'ordered', title: 'Ordered', who: 'Supplier ships it on a batch', color: '#7c3aed' },
    { key: 'shipped', title: 'Shipped', who: 'iMobile receives the batch', color: '#2563eb' },
    { key: 'received', title: 'Received', who: 'Done', color: '#67c23a' },
    { key: 'shortage', title: 'Shortage', who: 'Supplier cannot get it — reopen or cancel', color: '#f56c6c' }
]
// Desktop widths: a busy column at least, an empty one, the gap between.
const BUSY_W = 210
const EMPTY_W = 150
const GAP = 10
// Phone: the step opened first is the earliest one with something to do.
const FIRST_LOOK = ['quote', 'confirm', 'order', 'shortage', 'ordered', 'shipped', 'received']

export default {
    name: 'ChannelBoard',
    components: { OrderCard },
    props: {
        rows: { type: Array, default: () => [] },
        category: { type: String, default: '' },
        loading: { type: Boolean, default: false },
        receivedCap: { type: Number, default: 30 },
        can: { type: Function, required: true },
        canEither: { type: Boolean, default: false },
        mobile: { type: Boolean, default: false }
    },
    data() {
        return { search: '', picked: '', width: 0 }
    },
    computed: {
        shown() {
            const q = this.search.trim().toLowerCase()
            if (!q) return this.rows
            return this.rows.filter(r => [r.productName, r.orderNo, r.sku, r.requestedFor, r.supplier, r.note, r.batchNo].join(' ').toLowerCase().includes(q))
        },
        urgentCount() {
            return this.shown.filter(r => r.urgent && !['received', 'cancelled'].includes(r.status)).length
        },
        columns() {
            const by = {}
            for (const c of COLUMNS) by[c.key] = []
            for (const r of this.shown) {
                const k = this.stageOf(r)
                if (k && by[k]) by[k].push(r)
            }
            // urgent first, then the oldest; received newest first
            const byAge = (a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || new Date(a.createdAt) - new Date(b.createdAt)
            for (const k of Object.keys(by)) by[k].sort(k === 'received' ? (a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0) : byAge)
            // the Shortage column only when something is in it
            return COLUMNS.filter(c => c.key !== 'shortage' || by.shortage.length).map(c => ({ ...c, cards: by[c.key] }))
        },
        // the stages don't fit side by side: empty ones fold into slim lanes
        slim() {
            if (this.mobile || !this.width) return false
            const busy = this.columns.filter(c => c.cards.length).length
            const need = busy * BUSY_W + (this.columns.length - busy) * EMPTY_W + (this.columns.length - 1) * GAP
            return need > this.width
        },
        // phone: the open tab — the one picked, else the first with cards
        stage() {
            const keys = this.columns.map(c => c.key)
            if (this.picked && keys.includes(this.picked)) return this.picked
            const busy = FIRST_LOOK.find(k => this.columns.some(c => c.key === k && c.cards.length))
            return busy || 'quote'
        }
    },
    watch: {
        // another list: start again from its first busy step
        category() { this.picked = ''; this.search = '' },
        stage() { this.$nextTick(this.showTab) }
    },
    mounted() {
        // the board's own width (the tree folds / the window resizes)
        // (measured now, on window resizes, and whenever the box itself changes)
        this.measure()
        window.addEventListener('resize', this.measure)
        const el = this.$refs.cols
        if (el && typeof ResizeObserver !== 'undefined') {
            this.ro = new ResizeObserver(this.measure)
            this.ro.observe(el)
        }
    },
    beforeDestroy() {
        if (this.ro) this.ro.disconnect()
        window.removeEventListener('resize', this.measure)
    },
    methods: {
        measure() {
            this.width = this.$refs.cols ? this.$refs.cols.clientWidth : 0
        },
        // the step a line is at
        stageOf(r) {
            switch (r.status) {
                case 'pending': return r.confirmed ? 'order' : 'quote'
                case 'toConfirm': return 'confirm'
                case 'ordered': return 'ordered'
                case 'shipped': return 'shipped'
                case 'received': return 'received'
                case 'shortage': return 'shortage'
                default: return null
            }
        },
        pick(key) {
            this.picked = key
        },
        // keep the open tab in view on a narrow strip
        showTab() {
            const el = this.$refs.tabs && this.$refs.tabs.querySelector('.cb-tab.on')
            if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'center' })
        }
    }
}
</script>

<style lang="scss" scoped>
.cb { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.cb-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.cb-search { width: 260px; }
.cb-spacer { flex: 1; }
.cb-dim { font-size: 11px; color: #909399; }
.cb-urgent-sum { font-size: 12px; color: #f56c6c; font-weight: 600; white-space: nowrap; }
.cb-cols { flex: 1; min-height: 0; display: flex; gap: 10px; overflow-x: auto; padding-bottom: 6px; }
/* the columns share the width; an empty one shrinks so the busy ones get room */
.cb-col { flex: 1 1 0; min-width: 210px; display: flex; flex-direction: column; min-height: 0; background: #f7f8fa; border: 1px solid #ebeef5; border-radius: 8px;
    &.is-empty { flex: 0 0 150px; min-width: 150px; }
    &.is-slim { flex: 0 0 40px; min-width: 40px; } }
.cb-slim { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 10px 0; cursor: default; }
.cb-slim-title { writing-mode: vertical-rl; font-size: 12px; font-weight: 600; color: #909399; white-space: nowrap; }
.cb-slim .cb-col-count { margin-left: 0; }
.cb-col-head { padding: 8px 10px 6px; border-bottom: 1px solid #ebeef5; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.cb-col-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.cb-col-title { font-size: 13px; font-weight: 600; color: #303133; }
.cb-col-count { margin-left: auto; font-size: 11px; font-weight: 600; color: #606266; background: #fff; border: 1px solid #e4e7ed; border-radius: 10px; padding: 0 7px; }
.cb-col-who { flex-basis: 100%; font-size: 11px; color: #909399; }
.cb-col-body { flex: 1; min-height: 0; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
.cb-empty { text-align: center; color: #c0c4cc; font-size: 12px; padding: 18px 0; }

/* ── phone ── */
.cb-tabs { display: flex; gap: 6px; overflow-x: auto; padding: 0 0 8px; margin-bottom: 2px; scrollbar-width: none; -webkit-overflow-scrolling: touch;
    &::-webkit-scrollbar { display: none; } }
.cb-tab { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 1px solid #e4e7ed; border-radius: 15px;
    font-size: 12px; color: #606266; background: #fff; white-space: nowrap; cursor: pointer;
    b { font-weight: 600; color: #303133; }
    &.empty { color: #a8abb2; b { color: #c0c4cc; font-weight: 400; } }
    &.on { color: #409eff; border-color: #409eff; background: #ecf5ff; b { color: #409eff; } } }
.cb.is-mobile {
    .cb-bar { margin-bottom: 8px; }
    .cb-search { flex: 1; width: auto; }
    .cb-cols { overflow-x: hidden; padding-bottom: 0; }
    .cb-col { flex: 1 1 auto; min-width: 0; max-width: none; background: transparent; border: 0; }
    .cb-col-head { padding: 0 2px 6px; border-bottom: 0; }
    .cb-col-body { padding: 0 0 12px; gap: 10px; }
}
</style>
