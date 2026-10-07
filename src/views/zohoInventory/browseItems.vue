<template>
    <!--
        Browse Items (user ask 2026-10-07): every spare part by Device Brand →
        Series → Model (Zoho's catalogue fields, from the stock register),
        narrowed by part type chips (Small Parts opens its sub types), quality,
        stock and a search; shown as the Stock Monitoring table with a Type
        column and the four price lists, or as a photo grid. A PO is raised in
        the On order cell, as on Stock Monitoring. Admin and iMobile Warehouse
        only (parts:browse:view).
    -->
    <div class="bi-page">
        <tree-panel ref="treeRef" :tree-data="tree" title="Device Model" title-icon-class="el-icon-mobile-phone"
            node-key="id" :show-search="true" search-placeholder="Find a brand, series or model" storage-key="browse-items-tree-width"
            :default-expanded-keys="expandedKeys" :default-width="250" :accordion="true" @node-click="onNode" @collapsed-change="relayout">
            <!-- one branch open at a time; a brand shows its mark -->
            <template #node="{ data }">
                <span :class="['bi-node', { 'is-brand': isBrand(data) }]">
                    <brand-icon v-if="isBrand(data)" :brand="data.sel.brand" :label="data.label" :size="16" class="bi-node-icon" />
                    <span class="bi-node-label" :title="data.label">{{ data.label }}</span>
                    <span class="bi-node-count">{{ data.count }}</span>
                </span>
            </template>
        </tree-panel>

        <div class="bi-main">
            <!-- one row: where you are, the search, list / grid -->
            <div class="bi-head">
                <brand-icon v-if="nodeBrand" :brand="nodeBrand" :size="22" class="bi-head-icon" />
                <div class="bi-head-text">
                    <div class="bi-title">{{ node ? node.label : 'All parts' }}<span class="bi-count">{{ total.toLocaleString() }} items</span></div>
                    <div class="bi-sub">
                        <span v-if="nodePath.length > 1">{{ nodePath.join(' › ') }}</span><span v-else>Every live part</span>
                        <span v-if="asOf"> · counted {{ asOf }}</span>
                    </div>
                </div>
                <el-input v-model="search" size="small" clearable prefix-icon="el-icon-search" class="bi-search"
                    placeholder="Search SKU or product name in this list" @input="onSearchInput" @clear="reload" />
                <el-radio-group v-model="view" size="small" class="bi-view">
                    <el-radio-button label="list" title="List"><i class="el-icon-s-unfold" /><span class="bi-view-t"> List</span></el-radio-button>
                    <el-radio-button label="grid" title="Grid"><i class="el-icon-menu" /><span class="bi-view-t"> Grid</span></el-radio-button>
                </el-radio-group>
                <el-button size="small" icon="el-icon-refresh" :loading="loading" title="Refresh" @click="refreshAll" />
            </div>

            <!-- part type chips: the classification, plain; the counts follow
                 the quality / stock filters -->
            <div class="bi-chips">
                <span :class="['bi-chip', { on: !cls }]" @click="pickClass('')">All <b>{{ allCount }}</b></span>
                <span v-for="c in classes" :key="c.value" :class="['bi-chip', { on: cls === c.value }]" @click="pickClass(c.value)">
                    {{ classLabel(c.value) }} <b>{{ c.count }}</b></span>
            </div>
            <!-- a picked type with sub types (Small Parts: Rear Camera, SIM Tray …) -->
            <div v-if="subChips.length" class="bi-chips bi-subchips">
                <i class="el-icon-arrow-right bi-sub-arrow" />
                <span :class="['bi-chip', 'bi-chip-sm', { on: !sub }]" @click="pickSub('')">All {{ classLabel(cls) }} <b>{{ pickedClass.count }}</b></span>
                <span v-for="u in subChips" :key="u.value" :class="['bi-chip', 'bi-chip-sm', { on: sub === u.value }]" @click="pickSub(u.value)">
                    {{ u.value }} <b>{{ u.count }}</b></span>
            </div>

            <div class="bi-filters">
                <div class="bi-f">
                    <label>Quality</label>
                    <el-select v-model="quality" size="small" clearable placeholder="All" style="width:190px" @change="reload">
                        <el-option v-for="q in qualities" :key="q.value || '__none__'" :label="`${q.value || 'Not set'} (${q.count})`"
                            :value="q.value || '__none__'" />
                    </el-select>
                </div>
                <div class="bi-f">
                    <label>Stock</label>
                    <el-select v-model="stock" size="small" clearable placeholder="All" style="width:210px" @change="reload">
                        <el-option v-for="o in STOCK_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
                    </el-select>
                </div>
                <el-button v-if="filtered" type="text" size="small" icon="el-icon-close" class="bi-clear" @click="clearFilters">Clear all</el-button>
                <span class="bi-spacer" />
                <span class="bi-hint"><i class="el-icon-info" /> Click a part's On order cell to raise a PO</span>
            </div>

            <div ref="body" :class="['bi-body', 'is-' + view]">
                <stock-items-table v-if="view === 'list'" ref="table" :rows="rows" :loading="loading" :sort="sort" :sales-days.sync="salesDays"
                    show-type show-prices :show-last-sold="false" :height="tableHeight" :price-editor="canEditPrices ? pm : null"
                    empty-text="No parts match" @sort-change="onSort" />

                <div v-else v-loading="loading" class="bi-grid">
                    <div v-for="r in rows" :key="r.itemId" class="bi-card" @click="$refs.drawer.open(r)">
                        <div class="bi-card-img">
                            <img v-if="r.imageUrl" :src="r.imageUrl" alt="" loading="lazy">
                            <i v-else class="el-icon-picture-outline" />
                        </div>
                        <div class="bi-card-name" :title="r.productName">{{ r.productName }}</div>
                        <div class="bi-card-meta"><span class="bi-card-sku">{{ r.sku || '—' }}</span>
                            <span v-if="r.classification" class="bi-type">{{ typeOf(r) }}</span></div>
                        <div class="bi-card-nums">
                            <span><em>Stock</em><b :class="stockTone(r)">{{ availOf(r) }}</b></span>
                            <span><em>Sold {{ salesDays }}d</em><b>{{ soldOf(r) }}</b></span>
                            <span><em>On order</em><b :class="{ 'bi-good': r.openPoQty > 0 }">{{ r.openPoQty || 0 }}</b></span>
                        </div>
                        <div class="bi-card-price">
                            <span v-for="p in GRID_PRICES" :key="p.prop"><em>{{ p.label }}</em>{{ money(r[p.prop]) }}</span>
                        </div>
                    </div>
                    <div v-if="!rows.length && !loading" class="bi-empty">No parts match</div>
                </div>
            </div>

            <!-- price changes waiting for Zoho — the same queue as Price Monitoring -->
            <price-queue-zone :pm="pm" class="bi-zone" />

            <div class="bi-pager">
                <el-pagination background :layout="narrow ? 'total, prev, pager, next' : 'total, sizes, prev, pager, next, jumper'"
                    :total="total" :page-size="pageSize" :page-sizes="[20, 50, 100]" :current-page="page" :pager-count="narrow ? 5 : 7"
                    @current-change="onPage" @size-change="onSize" />
            </div>
        </div>

        <stock-item-drawer ref="drawer" />
    </div>
</template>

<script>
import TreePanel from '@/components/TreePanel'
import StockItemsTable from './components/StockItemsTable'
import StockItemDrawer from './components/StockItemDrawer'
import BrandIcon from './components/BrandIcon'
import liveStockMixin from './liveStockMixin'
import priceEditMixin from './priceEditing'
import PriceQueueZone from './components/PriceQueueZone'
import { getModelTree, getBrowseItems } from '@/api/stockMonitor'

const NONE = '__none__'
const CLASS_LABELS = { BackCover: 'Back Cover', [NONE]: 'Unclassified' }
const STOCK_OPTIONS = [
    { value: 'inStock', label: 'In stock' },
    { value: 'zero', label: 'Out of stock' },
    { value: 'noOnOrder', label: 'Out of stock, nothing on order' },
    { value: 'onOrder', label: 'On order' }
]
const GRID_PRICES = [
    { prop: 'pricePlatinum', label: 'Platinum' },
    { prop: 'priceVip', label: 'VIP' },
    { prop: 'priceSvip', label: 'SVIP' },
    { prop: 'priceWholesale', label: 'Wholesale' }
]
// the table's sort props → /browse-items sort keys
const SORT_KEYS = { sku: 'sku', location: 'location', available: 'stock', openPoQty: 'onOrder', pricePlatinum: 'pricePlatinum', priceVip: 'priceVip', priceSvip: 'priceSvip', priceWholesale: 'priceWholesale' }
const VIEW_KEY = 'browse-items.view'

export default {
    name: 'BrowseItems',
    components: { TreePanel, StockItemsTable, StockItemDrawer, BrandIcon, PriceQueueZone },
    // prices are edited with Price Monitoring's editor (priceEditing.js)
    mixins: [liveStockMixin, priceEditMixin],
    data() {
        let view = 'list'
        try { if (localStorage.getItem(VIEW_KEY) === 'grid') view = 'grid' } catch (e) { /* default */ }
        return {
            STOCK_OPTIONS,
            GRID_PRICES,
            tree: [],
            parentOf: {},
            expandedKeys: [],
            node: null,
            // the filters
            cls: '',
            sub: '',
            quality: '',
            stock: '',
            search: '',
            // the list
            rows: [],
            total: 0,
            classes: [],
            qualities: [],
            page: 1,
            pageSize: 20,
            sort: { prop: '', order: '' },
            salesDays: 30,
            loading: false,
            metricsAt: null,
            view,
            narrow: false,
            // the list's height: what is left under the header rows
            tableHeight: 400,
            seq: 0
        }
    },
    computed: {
        nodePath() {
            const out = []
            let id = this.node && this.node.id
            const byId = this.nodeById
            while (id && byId[id]) { out.unshift(byId[id].label); id = this.parentOf[id] }
            return out
        },
        nodeById() {
            const map = {}
            const walk = list => (list || []).forEach(n => { map[n.id] = n; walk(n.children) })
            walk(this.tree)
            return map
        },
        allCount() {
            return this.classes.reduce((t, c) => t + c.count, 0)
        },
        pickedClass() {
            return this.classes.find(c => c.value === this.cls) || { count: 0, subs: [] }
        },
        // sub types once a type with more than one is picked
        subChips() {
            const subs = this.pickedClass.subs || []
            return this.cls && subs.length > 1 ? subs : []
        },
        // the brand of the picked node, for the header's icon
        nodeBrand() {
            const b = this.node && this.node.sel && this.node.sel.brand
            return b || ''
        },
        filtered() {
            return !!(this.cls || this.quality || this.stock || this.search)
        },
        asOf() {
            if (!this.metricsAt) return ''
            const d = new Date(this.metricsAt)
            return d.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
        }
    },
    watch: {
        view(v) {
            try { localStorage.setItem(VIEW_KEY, v) } catch (e) { /* not remembered */ }
            this.$nextTick(this.fitTable)
        },
        // a sub-type row coming or going moves the table
        subChips() { this.$nextTick(this.fitTable) },
        // a sales-sorted list follows the Sold window
        salesDays() {
            if (/^units\d+$/.test(this.sort.prop)) this.load()
        }
    },
    created() {
        this.loadTree()
        this.load()
    },
    mounted() {
        this.onResize()
        window.addEventListener('resize', this.onResize)
        // the header rows wrap on narrow screens: follow the body's own size
        if (typeof ResizeObserver !== 'undefined' && this.$refs.body) {
            this.ro = new ResizeObserver(() => this.fitTable())
            this.ro.observe(this.$refs.body)
        }
    },
    beforeDestroy() {
        window.removeEventListener('resize', this.onResize)
        if (this.ro) this.ro.disconnect()
        clearTimeout(this.searchTimer)
    },
    activated() {
        this.$nextTick(this.fitTable)
    },
    methods: {
        onResize() {
            this.narrow = window.innerWidth < 768
            this.$nextTick(this.fitTable)
        },
        // the table fills the body; its header stays, the rows scroll
        fitTable() {
            const el = this.$refs.body
            if (!el) return
            const h = Math.max(240, Math.floor(el.clientHeight))
            if (h !== this.tableHeight) this.tableHeight = h
        },
        relayout() {
            setTimeout(() => { this.fitTable(); const t = this.$refs.table && this.$refs.table.$refs.table; if (t) t.doLayout() }, 300)
        },
        // a top-level node: a brand (or the Tool / No device buckets)
        isBrand(data) {
            return !!data && typeof data.id === 'string' && data.id.indexOf('|') < 0
        },
        classLabel(c) { return CLASS_LABELS[c] || c },
        typeOf(r) {
            if (r.classification === 'Small Parts' && r.subClassification) return r.subClassification
            return CLASS_LABELS[r.classification] || r.classification
        },
        availOf(r) { return r.available !== undefined ? r.available : r.stock },
        stockTone(r) { const a = Number(this.availOf(r)) || 0; return a <= 0 ? 'bi-bad' : a < 3 ? 'bi-warn' : 'bi-good' },
        soldOf(r) { const w = r.sales && r.sales[this.salesDays]; return w ? Math.round((w.total || 0) * 100) / 100 : 0 },
        money(v) { return v == null || v === '' ? '—' : '$' + Number(v).toFixed(2) },
        // ── the tree ───────────────────────────────────────────────
        async loadTree() {
            try {
                const r = await getModelTree()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.tree = r.tree || []
                const parents = {}
                const walk = (list, parent) => (list || []).forEach(n => { if (parent) parents[n.id] = parent; walk(n.children, n.id) })
                walk(this.tree, null)
                this.parentOf = parents
                // the biggest brand open to start with
                if (!this.expandedKeys.length && this.tree[0]) this.expandedKeys = [this.tree[0].id]
            } catch (e) {
                this.$message.error((e && e.message) || 'Could not load the model tree')
            }
        },
        onNode(data) {
            this.node = data
            // a new place: the type chips start again, the other filters stay
            this.cls = ''
            this.sub = ''
            this.reload()
        },
        // ── the list ───────────────────────────────────────────────
        params() {
            const sel = (this.node && this.node.sel) || {}
            const p = {
                page: this.page,
                pageSize: this.pageSize,
                days: this.salesDays,
                prices: 1,
                classCounts: 1,
                includeHidden: 1
            }
            if (sel.brand !== undefined) p.brand = sel.brand
            if (sel.series !== undefined) p.series = sel.series
            if (sel.model) p.models = [sel.model]
            if (this.cls) p.classification = this.cls
            if (this.sub) p.sub = this.sub
            if (this.quality) p.quality = this.quality
            if (this.stock) p.tile = this.stock
            if (this.search.trim()) p.search = this.search.trim()
            const { prop, order } = this.sort
            if (prop) {
                p.sort = /^units\d+$/.test(prop) ? 'sales' : SORT_KEYS[prop] || ''
                p.order = order
            }
            return p
        },
        async load() {
            const seq = ++this.seq
            this.loading = true
            try {
                const r = await getBrowseItems(this.params())
                if (seq !== this.seq) return
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.rows || []
                this.total = r.total || 0
                this.classes = r.classes || []
                this.qualities = r.qualities || []
                this.metricsAt = r.metricsAt || null
                // the stock on screen, live from Zoho (one call per page)
                this.overlayLiveStock(this.rows)
                this.$nextTick(this.fitTable)
            } catch (e) {
                if (seq === this.seq) this.$message.error((e && e.message) || 'Could not load the parts')
            } finally {
                if (seq === this.seq) this.loading = false
            }
        },
        reload() {
            this.page = 1
            this.load()
        },
        refreshAll() {
            this.loadTree()
            this.load()
        },
        onSearchInput() {
            clearTimeout(this.searchTimer)
            this.searchTimer = setTimeout(this.reload, 350)
        },
        pickClass(c) {
            this.cls = c
            this.sub = ''
            this.reload()
        },
        pickSub(u) {
            this.sub = u
            this.reload()
        },
        clearFilters() {
            this.cls = ''
            this.sub = ''
            this.quality = ''
            this.stock = ''
            this.search = ''
            this.reload()
        },
        onSort({ prop, order }) {
            this.sort = { prop, order }
            this.reload()
        },
        onPage(p) {
            this.page = p
            this.load()
        },
        onSize(s) {
            this.pageSize = s
            this.reload()
        }
    }
}
</script>

<style lang="scss" scoped>
.bi-page { display: flex; height: calc(100vh - 84px); overflow: hidden; }
.bi-main { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 12px 16px 8px; background: #fff; }
.bi-node { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; }
.bi-node.is-brand .bi-node-label { font-weight: 600; color: #303133; }
.bi-node-icon { flex-shrink: 0; }
.bi-node-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bi-node-count { flex-shrink: 0; margin-left: 8px; font-size: 11px; color: #909399; font-variant-numeric: tabular-nums; }
.bi-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.bi-head-icon { flex-shrink: 0; }
.bi-head-text { flex: 1; min-width: 0; }
.bi-title { font-size: 18px; font-weight: 600; color: #303133; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bi-count { margin-left: 10px; font-size: 12px; font-weight: 400; color: #909399; }
.bi-sub { font-size: 12px; color: #909399; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bi-search { flex: 0 1 340px; min-width: 180px; }
.bi-view { flex-shrink: 0; display: inline-flex; white-space: nowrap; }
/* type chips — plain, like the dashboard's other chips */
.bi-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 8px; }
.bi-chip { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px; border: 1px solid #dcdfe6; border-radius: 14px;
    font-size: 12px; color: #606266; background: #fff; cursor: pointer; white-space: nowrap; transition: all .15s;
    b { font-weight: 600; color: #909399; font-variant-numeric: tabular-nums; }
    &:hover { border-color: #b3d8ff; color: #409eff; }
    &.on { border-color: #409eff; background: #ecf5ff; color: #409eff; b { color: #409eff; } } }
.bi-chip-sm { height: 24px; padding: 0 10px; font-size: 11px; }
.bi-subchips { padding-left: 4px; }
.bi-sub-arrow { color: #c0c4cc; font-size: 12px; }
.bi-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; margin: 2px 0 10px; }
.bi-f { display: flex; align-items: center; gap: 8px; label { font-size: 12px; color: #606266; white-space: nowrap; } }
.bi-clear { padding: 0; }
.bi-spacer { flex: 1; }
.bi-hint { font-size: 12px; color: #909399; i { margin-right: 3px; } }
/* list: the table takes the body's height (header fixed, rows scroll); grid: the body scrolls */
.bi-body { flex: 1; min-height: 0; }
.bi-body.is-list { overflow: hidden; }
.bi-body.is-grid { overflow: auto; }
.bi-pager { padding-top: 8px; text-align: right; }
.bi-zone { flex-shrink: 0; }
/* grid */
.bi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; padding: 2px 2px 8px; min-height: 200px; }
.bi-card { border: 1px solid #ebeef5; border-radius: 8px; padding: 10px; cursor: pointer; background: #fff; display: flex; flex-direction: column; gap: 6px;
    transition: box-shadow .15s, border-color .15s; &:hover { border-color: #c6e2ff; box-shadow: 0 2px 10px rgba(0, 0, 0, .07); } }
.bi-card-img { height: 140px; border-radius: 6px; background: #f5f7fa; display: flex; align-items: center; justify-content: center; overflow: hidden;
    img { max-width: 100%; max-height: 100%; object-fit: contain; } i { font-size: 28px; color: #c0c4cc; } }
.bi-card-name { font-size: 12px; font-weight: 600; color: #303133; line-height: 1.35; height: 32px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.bi-card-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; min-width: 0; }
.bi-card-sku { color: #1890ff; font-weight: 600; font-variant-numeric: tabular-nums; }
.bi-type { padding: 0 7px; border-radius: 10px; color: #606266; background: #f4f4f5; border: 1px solid #e9e9eb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.bi-card-nums { display: flex; justify-content: space-between; font-size: 11px;
    span { display: flex; flex-direction: column; } em { font-style: normal; color: #909399; } b { font-size: 13px; font-variant-numeric: tabular-nums; } }
.bi-card-price { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; font-size: 11px; color: #303133; font-variant-numeric: tabular-nums;
    padding-top: 6px; border-top: 1px dashed #ebeef5; em { font-style: normal; color: #909399; margin-right: 4px; } }
.bi-empty { grid-column: 1 / -1; text-align: center; color: #909399; padding: 40px 0; }
.bi-good { color: #67c23a; }
.bi-warn { color: #e6a23c; }
.bi-bad { color: #ff4949; }
@media (max-width: 1100px) {
    .bi-view-t { display: none; }
}
@media (max-width: 767px) {
    .bi-main { padding: 8px 10px 4px; }
    .bi-head { flex-wrap: wrap; }
    .bi-search { flex: 1 1 100%; order: 3; }
    .bi-hint { display: none; }
    .bi-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
    .bi-card-img { height: 110px; }
    .bi-pager { text-align: center; }
}
</style>
