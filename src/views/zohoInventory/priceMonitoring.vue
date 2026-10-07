<template>
    <div class="app-container sd">

        <!-- ── header ───────────────────────────────────────────────── -->
        <div class="sd-head">
            <div class="sd-title">
                <h2>Price Monitoring</h2>
                <div v-if="snapshotDate" :class="['sd-asof', staleness.tone]">
                    <i :class="staleness.icon" />
                    {{ staleness.text }}
                </div>
            </div>
            <div class="sd-spacer" />
            <el-button size="small" plain type="success" icon="el-icon-download"
                :loading="exporting" @click="exportCsv">Export</el-button>
        </div>

        <el-alert v-if="runProblem" :title="runProblem" type="warning" show-icon :closable="false"
            class="sd-alert" />

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
            <div v-for="t in TILES" :key="t.key"
                :class="['sd-tile', 'tone-' + t.tone, { on: query.filter === t.key }]"
                @click="pickTile(t.key)">
                <div class="sd-tile-label">{{ t.label }}</div>
                <div class="sd-tile-value">{{ ((t.key === 'all' ? counts.items : counts[t.key]) || 0).toLocaleString() }}</div>
                <div class="sd-tile-note">{{ t.note }}</div>
            </div>
        </div>

        <!-- ── the working list ─────────────────────────────────────── -->
        <div class="sd-card">
            <div class="sd-card-head">
                <span class="sd-card-title">{{ activeTile.label }}</span>
                <el-tag size="mini" :type="activeTile.tag" effect="plain">
                    {{ total.toLocaleString() }} items
                </el-tag>
                <span class="sd-dim">Expected: SVIP &amp; WholeSale ≤ VIP ≤ Platinum (SVIP vs WholeSale unordered)</span>
                <div class="sd-spacer" />
                <!-- Manual refresh (saves no longer auto-refresh the list);
                     clicking the active tile again still clears the filter. -->
                <el-button type="text" size="mini" icon="el-icon-refresh"
                    @click="refreshData">Refresh</el-button>
            </div>

            <el-table :data="rows" v-loading="loading" size="mini" border
                :default-sort="{ prop: query.sort, order: query.order === 'asc' ? 'ascending' : 'descending' }"
                @sort-change="onSort" empty-text="Nothing matches these filters.">
                <el-table-column prop="name" label="Item" min-width="320" sortable="custom">
                    <template slot-scope="s">
                        <div class="pm-item" :data-item="s.row.itemId">
                            <!-- Main Zoho image, URL built from the register's image id. -->
                            <product-thumb :src="s.row.imageUrl" :item-id="s.row.itemId" />
                            <div class="pm-item-text">
                                <!-- Straight into the item in Zoho Inventory. -->
                                <a class="pm-item-link"
                                    :href="`https://inventory.zoho.com/app/746138234#/inventory/items/${s.row.itemId}`"
                                    target="_blank" rel="noopener" :title="s.row.name">{{ s.row.name }}</a>
                                <div class="pm-item-meta">
                                    <span class="sd-sku">{{ s.row.sku || '—' }}</span>
                                    <el-tag v-if="s.row.__live" size="mini" type="success" effect="plain">live</el-tag>
                                </div>
                                <!-- Row edit: tier-order / below-cost checks on the
                                     prices as typed (advisory — pushing is allowed). -->
                                <template v-if="rowEdit.itemId === s.row.itemId">
                                    <div v-for="w in rowWarnings" :key="w" class="pm-row-warn">
                                        <i class="el-icon-warning-outline" /> {{ w }}
                                    </div>
                                </template>
                            </div>
                        </div>
                    </template>
                </el-table-column>

                <el-table-column prop="available" label="Stock" width="86" align="center" sortable="custom">
                    <template slot-scope="s">
                        <span :class="['sd-num', s.row.available <= 0 ? 'sd-bad' : '']">{{ s.row.available }}</span>
                    </template>
                </el-table-column>

                <!-- Purchase + the four price lists, all editable the same way
                     (the purchase price writes to the Zoho item's purchase
                     rate; the lists to their pricebooks). -->
                <el-table-column v-for="c in EDIT_COLS" :key="c.prop" :prop="c.prop" :label="c.label"
                    :width="c.list === 'purchase' ? 125 : 140" align="center" sortable="custom">
                    <!-- the shared editable cell (components/PriceCell.vue) -->
                    <template slot-scope="s">
                        <price-cell :row="s.row" :col="c" :pm="pm" />
                    </template>
                </el-table-column>

                <el-table-column label="" width="110" align="center">
                    <template slot-scope="s">
                        <!-- Row edit in progress: push / use formula / cancel.
                             Push is a click (runs after the input's blur commits
                             the last typed value); cancel is a mousedown. -->
                        <template v-if="rowEdit.itemId === s.row.itemId">
                            <el-tooltip placement="top"
                                :content="rowSubmitLabel">
                                <el-button type="text" size="mini" icon="el-icon-check" class="pm-save"
                                    :disabled="!rowChanges.length" @click="submitRowEdit">{{ rowChanges.length || '' }}</el-button>
                            </el-tooltip>
                            <el-tooltip v-if="PRICE_COLS.some(c => refPrice(s.row, c) != null)"
                                content="Use all formula prices" placement="top">
                                <el-button type="text" size="mini" icon="el-icon-document-copy" @click="rowUseAllRefs" />
                            </el-tooltip>
                            <el-tooltip content="Cancel" placement="top">
                                <el-button type="text" size="mini" icon="el-icon-close" class="pm-cancel"
                                    @mousedown.native.prevent="cancelRowEdit" />
                            </el-tooltip>
                        </template>
                        <template v-else>
                            <!-- All four price lists at once, right in the row. -->
                            <el-tooltip v-if="canEditPrices" content="Edit all prices" placement="top">
                                <el-button type="text" size="mini" icon="el-icon-edit-outline"
                                    @click="openRowEdit(s.row)" />
                            </el-tooltip>
                            <!-- Live check: re-reads this item's four rates from
                                 Zoho and swaps them into the row. -->
                            <el-tooltip content="Check live from Zoho" placement="top">
                                <el-button type="text" size="mini" :loading="s.row.__liveLoading"
                                    icon="el-icon-refresh" @click="checkLive(s.row)" />
                            </el-tooltip>
                            <!-- Move to / restore from the Archive bucket. -->
                            <el-tooltip :content="query.filter === 'archived' ? 'Restore from Archive' : 'Move to Archive'"
                                placement="top">
                                <el-button type="text" size="mini" :loading="s.row.__archivedBusy"
                                    :icon="query.filter === 'archived' ? 'el-icon-refresh-left' : 'el-icon-box'"
                                    @click="toggleArchive(s.row)" />
                            </el-tooltip>
                        </template>
                    </template>
                </el-table-column>
            </el-table>

            <div class="sd-pager">
                <el-pagination background layout="total, sizes, prev, pager, next"
                    :current-page="query.page" :page-size="query.pageSize" :page-sizes="[20, 50, 100, 200]"
                    :total="total" @current-change="onPage" @size-change="onSize" />
            </div>
        </div>

        <!-- ── The loading zone + review (components/PriceQueueZone.vue,
             shared with Browse Items — one queue for both) ───────────── -->
        <price-queue-zone :pm="pm" />
    </div>
</template>

<script>
import ProductThumb from '@/components/ProductThumb'
import liveStockMixin from './liveStockMixin'
import priceEditMixin from './priceEditing'
import PriceCell from './components/PriceCell'
import PriceQueueZone from './components/PriceQueueZone'
import { getStockSummary, getStockItems, getStockItemPrices, setStockItemArchived } from '@/api/stockMonitor'

const TILES = [
    { key: 'all', label: 'All Items', tone: 'ok', tag: 'info', note: 'matching the filters' },
    // Missing + placeholder merged: both mean "not really priced". The
    // list shows truly-missing rows first, placeholder rows below.
    { key: 'priceUnpriced', label: 'Missing Price', tone: 'bad', tag: 'danger', note: 'no rate, or a placeholder rate' },
    { key: 'priceBelowCost', label: 'Below Cost', tone: 'bad', tag: 'danger', note: 'a sell rate under the purchase price' },
    { key: 'priceOrderBroken', label: 'Wrong Order', tone: 'warn', tag: 'warning', note: 'tiers out of order' },
    { key: 'priceRuleBroken', label: 'Off Formula', tone: 'warn', tag: 'warning', note: 'cost-priced, >5% off the pricing rule' }
]
// The price columns, the queue, the push and the row edit: priceEditing.js
// (shared with Browse Items since 2026-10-07).

export default {
    name: 'PriceMonitoring',
    components: { ProductThumb, PriceCell, PriceQueueZone },
    mixins: [liveStockMixin, priceEditMixin],
    data() {
        return {
            TILES,
            loading: false,
            summaryLoading: false,
            exporting: false,

            snapshotDate: null,
            run: null,
            counts: {},
            options: { categories: [], collections: [], vendors: [] },

            rows: [],
            total: 0,
            query: {
                filter: 'all',
                search: '', category: '', collection: '', vendor: '',
                sort: 'units90', order: 'desc', page: 1, pageSize: 50
            }
        }
    },
    computed: {
        activeTile() {
            if (this.query.filter === 'archived') {
                return { key: 'archived', label: 'Archive — excluded items (criteria + manual)', tag: 'info' }
            }
            return TILES.find(t => t.key === this.query.filter) || TILES[0]
        },
        staleness() {
            if (!this.snapshotDate) return { tone: 'bad', icon: 'el-icon-warning-outline', text: 'No snapshot yet' }
            const days = Math.floor((Date.now() - new Date(this.snapshotDate + 'T00:00:00').getTime()) / 86400000)
            const items = this.counts.all ? ` · ${this.counts.all.toLocaleString()} items` : ''
            if (days <= 0) return { tone: 'ok', icon: 'el-icon-time', text: `Prices as counted today${items}` }
            if (days === 1) return { tone: 'ok', icon: 'el-icon-time', text: `Prices as counted yesterday${items}` }
            return { tone: 'warn', icon: 'el-icon-warning-outline', text: `Counted ${days} days ago${items}` }
        },
        runProblem() {
            if (!this.snapshotDate) return 'No stock snapshot has been taken yet — run the daily job to populate this page.'
            if (this.run && this.run.ok === false) {
                return `The last stock refresh failed${this.run.error ? ': ' + this.run.error : ''}. The numbers below are from the last good run.`
            }
            if (this.staleness.tone === 'warn') {
                return 'The numbers are more than a day old — the daily refresh may not be running.'
            }
            return ''
        }
    },
    created() {
        this.reload()
    },
    methods: {
        async reload() {
            this.query.page = 1
            await Promise.all([this.loadItems(), this.loadSummary()])
        },
        async loadSummary() {
            this.summaryLoading = true
            try {
                // Filters ride along so the tiles count what the table shows.
                const r = await getStockSummary({
                    scope: 'parts',
                    search: this.query.search,
                    category: this.query.category,
                    collection: this.query.collection,
                    vendor: this.query.vendor
                })
                this.snapshotDate = r.snapshotDate
                this.run = r.run
                this.counts = r.counts || {}
                if (r.options) this.options = r.options
            } catch (e) {
                this.$message.error(this.msg(e, 'Could not load the price summary'))
            } finally {
                this.summaryLoading = false
            }
        },
        async loadItems() {
            this.loading = true
            try {
                const r = await getStockItems({ scope: 'parts', ...this.query })
                this.rows = r.rows || []
                this.total = r.total || 0
                this.snapshotDate = r.snapshotDate || this.snapshotDate
                this.overlayLiveStock(this.rows)
            } catch (e) {
                this.$message.error(this.msg(e, 'Could not load the price list'))
            } finally {
                this.loading = false
            }
        },
        pickTile(key) {
            this.query.filter = this.query.filter === key ? 'all' : key
            this.query.page = 1
            this.loadItems()
        },
        // Re-count the tiles and refetch the list, keeping every filter
        // and the current page as they are.
        refreshData() {
            this.loadItems()
            this.loadSummary()
        },
        // Move a row to the Archive bucket, or restore it from the archived
        // view. Restoring a criteria-matched name pins it as never-archived.
        async toggleArchive(row) {
            if (row.__archivedBusy) return
            const restoring = this.query.filter === 'archived'
            this.$set(row, '__archivedBusy', true)
            try {
                const r = await setStockItemArchived(row.itemId, restoring)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(`${row.sku || row.name} ${restoring ? 'restored' : 'moved to Archive'}`)
                this.loadItems()
                this.loadSummary()
            } catch (e) {
                this.$message.error(this.msg(e, 'Update failed'))
            } finally {
                this.$set(row, '__archivedBusy', false)
            }
        },
        resetFilters() {
            Object.assign(this.query, {
                filter: 'all', search: '', category: '', collection: '', vendor: '',
                sort: 'units90', order: 'desc', page: 1
            })
            this.loadItems()
            this.loadSummary()
        },
        onSort({ prop, order }) {
            if (!prop || !order) return
            this.query.sort = prop
            this.query.order = order === 'ascending' ? 'asc' : 'desc'
            this.query.page = 1
            this.loadItems()
        },
        onPage(p) { this.query.page = p; this.loadItems() },
        onSize(s) { this.query.pageSize = s; this.query.page = 1; this.loadItems() },

        // Re-read this item's four rates and its cost live from Zoho Inventory
        // and swap them into the row with the recomputed flags — the server
        // corrects the register row too (a green "live" tag marks refreshed rows).
        async checkLive(row) {
            if (row.__liveLoading) return
            this.$set(row, '__liveLoading', true)
            try {
                const r = await getStockItemPrices(row.itemId)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                const p = r.prices || {}
                this.$set(row, 'pricePlatinum', p.platinum)
                this.$set(row, 'priceVip', p.vip)
                this.$set(row, 'priceSvip', p.svip)
                this.$set(row, 'priceWholesale', p.wholesale)
                if (r.purchasePrice != null) this.$set(row, 'purchasePrice', r.purchasePrice)
                if (r.flags && !(r.flagsSeq < (row.__flagsSeq || 0))) {
                    for (const k of Object.keys(r.flags)) this.$set(row, k, r.flags[k])
                    row.__flagsSeq = r.flagsSeq || 0
                }
                this.$set(row, '__live', true)
            } catch (e) {
                this.$message.error(this.msg(e, 'Could not read the live prices'))
            } finally {
                this.$set(row, '__liveLoading', false)
            }
        },

        async exportCsv() {
            this.exporting = true
            try {
                const r = await getStockItems({ scope: 'parts', ...this.query, page: 1, pageSize: 200 })
                const head = ['SKU', 'Item Name', 'Stock', 'Purchase Price', 'Platinum', 'VIP', 'SVIP', 'WholeSale']
                const cell = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`
                const lines = [head.map(cell).join(',')]
                for (const x of r.rows || []) {
                    lines.push([x.sku, x.name, x.available, x.purchasePrice,
                        x.pricePlatinum, x.priceVip, x.priceSvip, x.priceWholesale].map(cell).join(','))
                }
                const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = `prices_${this.query.filter}_${this.snapshotDate}.csv`
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
.sd-warn { color: #e6a23c; }
.sd-bad { color: #ff4949; }
.sd-num { font-variant-numeric: tabular-nums; font-weight: 600; }
.sd-mono, .sd-sku { font-variant-numeric: tabular-nums; }
.sd-sku { font-weight: 600; color: #1890ff; margin-right: 5px; }

.sd-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.sd-title h2 { margin: 0; font-size: 20px; font-weight: 600; color: #303133; line-height: 1.2; }
.sd-asof {
    margin-top: 4px; font-size: 12px; display: flex; align-items: center; gap: 5px;
    &.ok { color: #909399; i { color: #67c23a; } }
    &.warn { color: #e6a23c; }
    &.bad { color: #ff4949; }
}
.sd-alert { margin-bottom: 14px; }

.sd-filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.sd-archived-link { padding: 0; font-size: 12px; color: #909399; &:hover { color: #409eff; } }
.sd-search { width: 260px; }
.sd-sel { width: 160px; }

.sd-tiles { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
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

/* Merged Item column: thumbnail, name links to Zoho, SKU underneath */
.pm-item { display: flex; align-items: center; gap: 8px; line-height: 1.35; }
.pm-item-text { min-width: 0; }
.pm-item-link {
    color: #303133; text-decoration: none;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    &:hover { color: #1890ff; text-decoration: underline; }
}
.pm-item-meta { display: flex; align-items: center; gap: 6px; margin-top: 1px; font-size: 12px; }

/* Row edit's advisory warnings (the cells themselves: components/PriceCell.vue) */
.pm-row-warn { font-size: 11px; color: #e6a23c; line-height: 1.4; margin-top: 2px; }

/* Stock read live from Zoho for the rows on screen */
.sd-card { background: #fff; border: 1px solid #e6ebf5; border-radius: 4px; overflow: hidden; }
.sd-card-head {
    display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-bottom: 1px solid #ebeef5;
}
.sd-card-title { font-size: 13px; font-weight: 600; color: #303133; }
.sd-pager { padding: 12px 14px; text-align: right; }

</style>
