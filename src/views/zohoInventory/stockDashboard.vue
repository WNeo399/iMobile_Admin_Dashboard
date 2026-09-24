<template>
    <div :class="[embedded ? 'sd-embedded' : 'app-container', 'sd']">

        <!-- ── header: what this is, and how old it is ──────────────── -->
        <div class="sd-head">
            <div class="sd-title">
                <h2>{{ embedded ? 'Dashboard' : 'Stock Monitoring' }}</h2>
                <div v-if="snapshotDate" :class="['sd-asof', staleness.tone]">
                    <i :class="staleness.icon" />
                    {{ staleness.text }}
                </div>
            </div>
            <div class="sd-spacer" />

            <el-button size="small" plain type="success" icon="el-icon-download"
                :loading="exporting" @click="exportCsv">Export</el-button>
        </div>

        <!-- A failed or missing run is the one thing worth interrupting
             for: the numbers below would otherwise pass for today's. -->
        <el-alert v-if="runProblem" type="warning" show-icon :closable="false" class="sd-alert">
            <template slot="title">
                <span>{{ runProblem }}</span>
                <el-button type="text" size="mini" class="sd-alert-btn" :loading="snapshotRunning"
                    @click="runSnapshot">{{ snapshotRunning ? 'Updating…' : 'Update Now' }}</el-button>
            </template>
        </el-alert>

        <!-- ── filters ──────────────────────────────────────────────── -->
        <div class="sd-filters">
            <el-input v-model="query.search" size="small" clearable class="sd-search"
                placeholder="SKU or product name" prefix-icon="el-icon-search"
                @keyup.enter.native="reload" @clear="reload" />

            <el-select v-model="query.category" size="small" clearable filterable placeholder="Category"
                class="sd-sel" @change="reload">
                <el-option v-for="o in options.categories" :key="o.value"
                    :label="`${o.value} (${o.count})`" :value="o.value" />
            </el-select>

            <el-select v-model="query.collection" size="small" clearable filterable placeholder="Collection"
                class="sd-sel" @change="reload">
                <el-option v-for="o in options.collections" :key="o.value"
                    :label="`${o.value} (${o.count})`" :value="o.value" />
            </el-select>

            <el-select v-model="query.location" size="small" clearable filterable placeholder="Shelf"
                class="sd-sel-sm" @change="reload">
                <el-option v-for="o in shelves" :key="o.location"
                    :label="`${o.location} (${o.items})`" :value="o.location" />
            </el-select>

            <el-select v-model="query.vendor" size="small" clearable filterable placeholder="Vendor"
                class="sd-sel" @change="reload">
                <el-option v-for="o in options.vendors" :key="o.value"
                    :label="`${o.value} (${o.count})`" :value="o.value" />
            </el-select>

            <el-button size="mini" type="primary" icon="el-icon-search" @click="reload">Search</el-button>
            <el-button size="mini" icon="el-icon-refresh" @click="resetFilters">Reset</el-button>

            <div class="sd-spacer" />
            <!-- The Archive bucket: criteria matches + manual marks. -->
            <el-button v-if="counts.archived" type="text" size="mini" class="sd-archived-link"
                @click="pickTile('archived')">
                {{ counts.archived.toLocaleString() }} archived
                {{ query.filter === 'archived' ? '— hide' : '— view' }}
            </el-button>
        </div>

        <!-- ── the counts, each one a filter ────────────────────────── -->
        <div class="sd-tiles" v-loading="summaryLoading">
            <div v-for="t in tiles" :key="t.key"
                :class="['sd-tile', 'tone-' + t.tone, { on: query.filter === t.key }]"
                @click="pickTile(t.key)">
                <div class="sd-tile-label">{{ t.label }}</div>
                <div class="sd-tile-value">{{ (counts[t.key] || 0).toLocaleString() }}</div>
                <div class="sd-tile-note">{{ t.note }}</div>
            </div>
        </div>

        <!-- ── the working list ─────────────────────────────────────── -->
        <div class="sd-card">
            <div class="sd-card-head">
                <span class="sd-card-title">{{ activeTile.label }}</span>
                <el-tag size="mini" :type="activeTile.tag" effect="plain">
                    {{ total.toLocaleString() }} {{ scope === 'parts' ? 'parts' : 'accessories' }}
                </el-tag>
                <span class="sd-dim">sorted by {{ sortLabel }}</span>
                <div class="sd-spacer" />
                <el-button v-if="query.filter !== 'all'" type="text" size="mini"
                    @click="pickTile('all')">Clear filter</el-button>
            </div>

            <!-- The shared stock table: the inline On order cell (POs raised there),
                 海运 / Archive actions and the item drawer come with it. -->
            <stock-items-table :rows="rows" :loading="loading"
                :sort="{ prop: query.sort, order: query.order }" :sales-days.sync="salesDays"
                :archived-view="query.filter === 'archived'"
                @sort-change="onSort" @archived="onArchived" />

            <div class="sd-pager">
                <el-pagination background layout="total, sizes, prev, pager, next"
                    :current-page="query.page" :page-size="query.pageSize" :page-sizes="[20, 50, 100, 200]"
                    :total="total" @current-change="onPage" @size-change="onSize" />
            </div>
        </div>
    </div>
</template>

<script>
import {
    getStockSummary, getStockItems, getStockShelves,
    runStockSnapshot, getStockSnapshotRun
} from '@/api/stockMonitor'
import liveStockMixin from './liveStockMixin'
// The table (with its inline PO cell and the item drawer) is shared with
// Stock Monitoring's 海运, Browse and Collections lists.
import StockItemsTable from './components/StockItemsTable'

// Tiles in the order a buyer reads them: how bad, what needs ordering, what
// is covered. (The cover and sitting-still tiles went at the user's ask.)
const TILES = [
    { key: 'outOfStock', label: 'Out of stock', tone: 'plain', tag: 'danger', note: 'nothing on the shelf' },
    { key: 'uncovered', label: 'Nothing on order', tone: 'bad', tag: 'danger', note: 'the buy list' },
    { key: 'onOrder', label: 'On order', tone: 'good', tag: 'success', note: 'covered by a PO', partsOnly: true }
]
const SORT_LABELS = {
    units90: '90-day units', units30: '30-day units', units14: '14-day units', units7: '7-day units', available: 'stock',
    daysOfCover: 'days of cover', daysSinceSale: 'days since last sale',
    sku: 'SKU', name: 'product', location: 'shelf', openPoQty: 'quantity on order'
}

export default {
    name: 'StockDashboard',
    components: { StockItemsTable },
    mixins: [liveStockMixin],
    props: {
        // Rendered inside the Stock Monitoring page (Dashboard tab) rather
        // than as its own route: drop the app-container chrome and retitle,
        // everything else behaves identically.
        embedded: { type: Boolean, default: false }
    },
    data() {
        return {
            // Fixed: the dashboard lives under iMobile Spare Parts now, so
            // the accessory scope (and its toggle) is gone.
            scope: 'parts',
            loading: false,
            summaryLoading: false,
            exporting: false,

            snapshotDate: null,
            run: null,
            // The hourly Zoho sync's last pass (from /summary).
            sync: null,
            snapshotRunning: false,
            snapshotPollTimer: null,
            counts: {},
            options: { categories: [], collections: [], vendors: [], qualities: [] },
            // Over a thousand shelves, so they come from their own endpoint
            // rather than riding along with the summary and being capped.
            shelves: [],

            rows: [],
            total: 0,
            query: {
                filter: 'uncovered',
                search: '', category: '', collection: '', location: '', vendor: '',
                sort: 'units30', order: 'desc', page: 1, pageSize: 20
            },

            // The sales window the Sold column shows (and sorts on).
            salesDays: 30
        }
    },
    computed: {
        tiles() {
            return TILES.filter(t => !t.partsOnly || this.scope === 'parts')
        },
        activeTile() {
            if (this.query.filter === 'archived') {
                return { key: 'archived', label: 'Archive — excluded items (criteria + manual)', tag: 'info' }
            }
            return TILES.find(t => t.key === this.query.filter) ||
                { key: 'all', label: 'All items', tag: 'info' }
        },
        sortLabel() { return SORT_LABELS[this.query.sort] || this.query.sort },
        // The hourly sync: "synced 12 min ago", or its last error.
        syncText() {
            const s = this.sync
            if (!s || !s.lastRunAt) return ''
            if (s.lastError && (!s.lastResult || new Date(s.lastError.at) > new Date(s.lastRunAt))) {
                return 'catalogue sync failed'
            }
            const mins = Math.max(0, Math.round((Date.now() - new Date(s.lastRunAt).getTime()) / 60000))
            return mins < 1 ? 'synced just now' : mins < 120 ? `synced ${mins} min ago` : `synced ${Math.round(mins / 60)} h ago`
        },
        // How old the numbers are, said plainly. A refresh older than a
        // day is a broken cron, not a rounding detail.
        staleness() {
            if (!this.snapshotDate) return { tone: 'bad', icon: 'el-icon-warning-outline', text: 'No snapshot yet' }
            const days = Math.floor((Date.now() - new Date(this.snapshotDate + 'T00:00:00').getTime()) / 86400000)
            const win = this.run && this.run.salesWindowDays ? ` · ${this.run.salesWindowDays}-day sales` : ''
            const items = this.counts.all ? ` · ${this.counts.all.toLocaleString()} items` : ''
            const sync = this.syncText ? ` · ${this.syncText}` : ''
            if (days <= 0) return { tone: 'ok', icon: 'el-icon-time', text: `Counted today${items}${win}${sync}` }
            if (days === 1) return { tone: 'ok', icon: 'el-icon-time', text: `Counted yesterday${items}${win}${sync}` }
            return { tone: 'warn', icon: 'el-icon-warning-outline', text: `Counted ${days} days ago${items}${win}${sync}` }
        },
        runProblem() {
            if (!this.snapshotDate) return 'No stock snapshot has been taken yet — run the daily job to populate this page.'
            if (this.run && this.run.ok === false) {
                return `The last stock refresh failed${this.run.error ? ': ' + this.run.error : ''}. The numbers below are from the last good run.`
            }
            if (this.staleness.tone === 'warn') {
                return 'The stock numbers are more than a day old.'
            }
            return ''
        }
    },
    watch: {
        // A different window: the rows already carry every window, so only
        // a list sorted by sales needs to come back in the new order.
        salesDays(d) {
            if (/^units\d+$/.test(this.query.sort)) {
                this.query.sort = 'units' + d
                this.query.page = 1
                this.loadItems()
            }
        }
    },
    created() {
        this.reload()
        this.loadShelves()
        // A refresh someone else started (or one surviving a page reload)
        // should show as in-progress here too.
        this.checkSnapshotRunning()
    },
    beforeDestroy() {
        if (this.snapshotPollTimer) clearTimeout(this.snapshotPollTimer)
    },
    methods: {
        // ── on-demand refresh ────────────────────────────────────────
        // Kicks off bin/stockSnapshot.js on the server and polls until it
        // finishes (a run takes a minute or two — longer when Zoho
        // throttles), then reloads everything from the fresh register.
        async runSnapshot() {
            if (this.snapshotRunning) return
            this.snapshotRunning = true
            try {
                const r = await runStockSnapshot()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.info(r.alreadyRunning
                    ? 'A refresh is already running — waiting for it to finish.'
                    : 'Refresh started — this takes a couple of minutes.')
                this.pollSnapshot()
            } catch (e) {
                this.snapshotRunning = false
                this.$message.error((e && e.message) || 'Failed to start the snapshot')
            }
        },
        pollSnapshot() {
            if (this.snapshotPollTimer) clearTimeout(this.snapshotPollTimer)
            this.snapshotPollTimer = setTimeout(async () => {
                let running = true
                try {
                    const r = await getStockSnapshotRun()
                    running = !r || r.running !== false
                } catch (e) { /* transient — keep polling */ }
                if (running) { this.pollSnapshot(); return }
                this.snapshotRunning = false
                this.snapshotPollTimer = null
                await Promise.all([this.reload(), this.loadShelves()])
                // reload() refreshed run/snapshotDate; runProblem reports a
                // failed run on its own, so only success needs a toast.
                if (!this.run || this.run.ok !== false) {
                    this.$message.success('Stock numbers updated.')
                }
            }, 10000)
        },
        async checkSnapshotRunning() {
            try {
                const r = await getStockSnapshotRun()
                if (r && r.running) {
                    this.snapshotRunning = true
                    this.pollSnapshot()
                }
            } catch (e) { /* status is best-effort */ }
        },
        async loadShelves() {
            try {
                const r = await getStockShelves({ scope: this.scope })
                this.shelves = r.shelves || []
            } catch (e) {
                // A missing shelf list costs one filter; it must not take
                // the rest of the page down with it.
                this.shelves = []
            }
        },
        async reload() {
            this.query.page = 1
            await Promise.all([this.loadItems(), this.loadSummary()])
        },
        async loadSummary() {
            this.summaryLoading = true
            try {
                // The filters ride along so the tiles count the same rows
                // the table below them shows (the tile filter itself does
                // not — clicking a tile must not zero out its siblings).
                const r = await getStockSummary({
                    scope: this.scope,
                    search: this.query.search,
                    category: this.query.category,
                    collection: this.query.collection,
                    location: this.query.location,
                    vendor: this.query.vendor
                })
                this.snapshotDate = r.snapshotDate
                this.run = r.run
                this.counts = r.counts || {}
                this.sync = r.sync || null
                if (r.options) this.options = r.options
            } catch (e) {
                this.$message.error(this.msg(e, 'Could not load the stock summary'))
            } finally {
                this.summaryLoading = false
            }
        },
        async loadItems() {
            this.loading = true
            try {
                const r = await getStockItems({ scope: this.scope, ...this.query })
                this.rows = r.rows || []
                this.total = r.total || 0
                this.snapshotDate = r.snapshotDate || this.snapshotDate
                // Not awaited: the list paints from the register and the
                // live figures land on it a moment later (the table reads
                // the open purchase lines itself).
                this.overlayLiveStock(this.rows)
            } catch (e) {
                this.$message.error(this.msg(e, 'Could not load the stock list'))
            } finally {
                this.loading = false
            }
        },
        pickTile(key) {
            this.query.filter = this.query.filter === key ? 'all' : key
            this.query.page = 1
            this.loadItems()
        },
        // A row moved to (or back from) the Archive: the list and its
        // counts change.
        onArchived() {
            this.loadItems()
            this.loadSummary()
        },
        resetFilters() {
            Object.assign(this.query, {
                filter: 'all', search: '', category: '', collection: '', location: '', vendor: '',
                sort: 'units30', order: 'desc', page: 1
            })
            this.loadItems()
            // The tiles were narrowed by the filters — widen them back too.
            this.loadSummary()
        },
        // The table's header links and arrows: { prop, order: 'asc' | 'desc' }.
        onSort({ prop, order }) {
            this.query.sort = prop
            this.query.order = order
            this.query.page = 1
            this.loadItems()
        },
        onPage(p) { this.query.page = p; this.loadItems() },
        onSize(s) { this.query.pageSize = s; this.query.page = 1; this.loadItems() },

        // A sales window as stored: { total, online, inflow, repair, neto,
        // dashboard } — or a plain number on a row not yet refreshed.
        u(w) {
            return w && typeof w === 'object' ? (w.total || 0) : (Number(w) || 0)
        },

        // Export what is on screen, not the whole register — the filters
        // are how someone says which list they want.
        async exportCsv() {
            this.exporting = true
            try {
                const r = await getStockItems({
                    scope: this.scope, ...this.query, page: 1, pageSize: 200
                })
                const head = ['SKU', 'Product', 'Shelf', 'Stock', '7-day', '30-day', '90-day',
                    'Cover (days)', 'On order', 'Days since sale', 'Vendor', 'Category', 'Collections']
                const cell = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`
                const lines = [head.map(cell).join(',')]
                for (const x of r.rows || []) {
                    lines.push([x.sku, x.name, x.location, x.available, this.u(x.units7), this.u(x.units30), this.u(x.units90),
                        x.daysOfCover, x.openPoQty, x.daysSinceSale, x.preferVendor, x.category,
                        (x.collections || []).join(' / ')].map(cell).join(','))
                }
                const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = `stock_${this.scope}_${this.query.filter}_${this.snapshotDate}.csv`
                a.click()
                URL.revokeObjectURL(a.href)
                if (r.total > (r.rows || []).length) {
                    this.$message.warning(`Exported the first ${(r.rows || []).length} of ${r.total} rows.`)
                }
            } catch (e) {
                this.$message.error(this.msg(e, 'Export failed'))
            } finally {
                this.exporting = false
            }
        },

        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback
        }
    }
}
</script>

<style lang="scss" scoped>
.sd-spacer { flex: 1; }
.sd-dim { color: #909399; font-size: 12px; }

.sd-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.sd-title h2 { margin: 0; font-size: 20px; font-weight: 600; color: #303133; line-height: 1.2; }
.sd-asof {
    margin-top: 4px; font-size: 12px; display: flex; align-items: center; gap: 5px;
    &.ok { color: #909399; i { color: #67c23a; } }
    &.warn { color: #e6a23c; }
    &.bad { color: #ff4949; }
}
.sd-alert { margin-bottom: 14px; }
.sd-alert-btn { margin-left: 10px; padding: 0; font-weight: 600; }

.sd-filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.sd-archived-link { padding: 0; font-size: 12px; color: #909399; &:hover { color: #409eff; } }
.sd-search { width: 260px; }
.sd-sel { width: 150px; }
.sd-sel-sm { width: 120px; }

.sd-tiles { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; }
.sd-tiles > .sd-tile { flex: 1 1 200px; max-width: 340px; }
.sd-tile {
    background: #fff; border: 1px solid #e6ebf5; border-radius: 4px; padding: 14px 16px;
    display: flex; flex-direction: column; gap: 6px; cursor: pointer;
    transition: border-color .15s, box-shadow .15s;
    &:hover { border-color: #b3d8ff; }
    &.on { box-shadow: 0 0 0 1px #1890ff inset; border-color: #1890ff; }
}
.sd-tile-label { font-size: 12px; color: #909399; }
.sd-tile-value { font-size: 26px; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; color: #303133; }
.sd-tile-note { font-size: 11px; color: #c0c4cc; }
.sd-tile.tone-bad {
    background: #fef0f0; border-color: #fbc4c4;
    .sd-tile-label { color: #ff4949; font-weight: 600; }
    .sd-tile-value { color: #ff4949; }
    .sd-tile-note { color: #f89898; }
    &.on { border-color: #ff4949; box-shadow: 0 0 0 1px #ff4949 inset; }
}
.sd-tile.tone-warn .sd-tile-value { color: #e6a23c; }
.sd-tile.tone-good .sd-tile-value { color: #67c23a; }

.sd-card { background: #fff; border: 1px solid #e6ebf5; border-radius: 4px; overflow: hidden; }
.sd-card-head {
    display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-bottom: 1px solid #ebeef5;
}
.sd-card-title { font-size: 13px; font-weight: 600; color: #303133; }
.sd-pager { padding: 12px 14px; text-align: right; }
</style>
