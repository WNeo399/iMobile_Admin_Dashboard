<template>
    <!-- One item from the stock register: its numbers, its Spare Parts
         Purchase lines and weekly sales. Opened with open(row) from
         the dashboard-style stock table (Stock Monitoring's Dashboard,
         海运, Browse and Collections lists). -->
    <el-drawer :visible.sync="visible" size="560px" :with-header="false" append-to-body @closed="detail = null">
        <div v-if="detail" v-loading="detailLoading" class="sd-drawer">
            <div class="sd-dh">
                <div class="sd-dh-main">
                    <div class="sd-dh-top">
                        <span class="sd-sku sd-dh-sku">{{ detail.item.sku || '—' }}</span>
                        <el-tag v-if="detail.item.outOfStock" size="mini" type="danger" effect="plain">Out of stock</el-tag>
                        <el-tag v-if="detail.item.classification" size="mini" effect="plain">
                            {{ detail.item.classification }}
                        </el-tag>
                        <a :href="zohoUrl(detail.item.itemId)" target="_blank" rel="noopener" class="sd-zoho"
                            title="Open the item in Zoho Inventory"><i class="el-icon-link" /> Zoho</a>
                    </div>
                    <div class="sd-dh-name">{{ detail.item.name }}</div>
                    <div class="sd-mono sd-dim">Shelf {{ detail.item.location || '—' }}</div>
                </div>
                <el-button type="text" icon="el-icon-close" @click="visible = false" />
            </div>

            <div class="sd-dbody">
                <div class="sd-stats">
                    <div><label>In stock</label>
                        <b :class="stockTone(detail.item)">{{ detail.item.available }}</b></div>
                    <div><label>On order</label>
                        <b :class="detail.item.openPoQty > 0 ? 'sd-good' : 'sd-bad'">{{ detail.item.openPoQty }}</b></div>
                    <div><label>Cover</label>
                        <b :class="coverTone(detail.item.daysOfCover)">{{ coverText(detail.item.daysOfCover) }}</b></div>
                    <div><label>Last sold</label>
                        <b>{{ lastSold(detail.item.daysSinceSale) }}</b></div>
                </div>

                <!-- The 90-day window by scope. -->
                <div class="sd-splits">
                    <div><label>On orders</label><b>{{ scopeUnits(detail.item.units90, 'online') }}</b></div>
                    <div><label>InFlow counter</label><b>{{ scopeUnits(detail.item.units90, 'inflow') }}</b></div>
                    <div><label>Repair team</label><b>{{ scopeUnits(detail.item.units90, 'repair') }}</b></div>
                    <div><label>Neto store</label><b>{{ scopeUnits(detail.item.units90, 'neto') }}</b></div>
                    <div><label>Dashboard dispatch</label><b>{{ scopeUnits(detail.item.units90, 'dashboard') }}</b></div>
                    <div><label>Unit cost</label><b>{{ money(detail.item.purchasePrice) }}</b></div>
                    <div><label>Preferred vendor</label><b>{{ detail.item.preferVendor || '—' }}</b></div>
                </div>

                <!-- Purchase orders = what we have raised for this item in
                     Spare Parts Purchase (our own records, newest first) —
                     not Zoho's POs (user ask 2026-09-29). The header adds up
                     what is still to arrive, 海运 / 空运 apart. -->
                <div class="sd-section">
                    <div class="sd-section-head">
                        <span>Purchase orders</span>
                        <span class="sd-dim">Spare Parts Purchase</span>
                        <span v-if="linesTotal > lines.length" class="sd-dim">· latest {{ lines.length }} of {{ linesTotal }}</span>
                        <div class="sd-spacer" />
                        <span v-if="toArrive.total > 0" class="sd-good sd-num sd-arrive">
                            {{ toArrive.total }} still to arrive
                            <template v-if="toArrive.sea && toArrive.air">
                                (<i class="el-icon-ship" />{{ toArrive.sea }} · <svg-icon icon-class="airplane" />{{ toArrive.air }})</template>
                        </span>
                    </div>

                    <el-table v-if="lines.length || linesLoading" :data="lines" v-loading="linesLoading"
                        size="mini" border max-height="300" empty-text="Loading…"
                        :row-class-name="({ row }) => (isOpen(row) ? 'sd-row-open' : '')">
                        <el-table-column label="Raised" width="88">
                            <template slot-scope="s">{{ fmtDay(s.row.createdAt) }}</template>
                        </el-table-column>
                        <el-table-column label="Qty" width="64" align="right">
                            <template slot-scope="s">
                                <i v-if="s.row.category === '海运'" class="el-icon-ship sd-sea" title="海运 — sea freight" />
                                <span class="sd-num">{{ s.row.orderQty }}</span>
                            </template>
                        </el-table-column>
                        <el-table-column label="Status" width="118">
                            <template slot-scope="s">
                                <span class="sd-status" :style="statusStyle(s.row.status)">{{ statusText(s.row) }}</span>
                            </template>
                        </el-table-column>
                        <el-table-column label="Supplier" min-width="80" show-overflow-tooltip>
                            <template slot-scope="s">{{ s.row.supplier || '—' }}</template>
                        </el-table-column>
                        <el-table-column label="Batch" width="86">
                            <template slot-scope="s">
                                <a v-if="s.row.batchNo && canBatches" class="sd-mono sd-link" title="Open the batch"
                                    @click="openBatch(s.row.batchNo)">{{ s.row.batchNo }}</a>
                                <span v-else class="sd-mono">{{ s.row.batchNo || '—' }}</span>
                            </template>
                        </el-table-column>
                    </el-table>

                    <div v-else-if="linesError" class="sd-empty">
                        {{ linesError }}
                        <br><el-button type="text" size="mini" @click="loadLines(detail.item.itemId)">Try again</el-button>
                    </div>
                    <div v-else class="sd-empty">
                        No purchase line has been raised for this item yet.
                        <span v-if="u(detail.item.units90) > 0" class="sd-dim">
                            <br>{{ u(detail.item.units90) }} units sold in 90 days.
                        </span>
                    </div>
                </div>

                <div v-if="coverageGaps.length" class="sd-section">
                    <div class="sd-section-head"><span>Coverage</span></div>
                    <div class="sd-gaps">
                        <div v-for="g in coverageGaps" :key="g">
                            <i class="el-icon-warning-outline" /> {{ g }}
                        </div>
                    </div>
                </div>

                <!-- Units sold per week, live from Zoho Analytics. Zoho
                     keeps no stock-on-a-past-date, so the trend is sales. -->
                <div class="sd-section">
                    <div class="sd-section-head">
                        <span>Sales by week · last {{ trendWeeks }} weeks</span>
                        <span v-if="trendLoading" class="sd-dim"><i class="el-icon-loading" /> reading Zoho…</span>
                        <span v-else-if="trendError" class="sd-bad">{{ trendError }}</span>
                        <span v-else class="sd-dim">{{ trendTotal }} units</span>
                    </div>
                    <div v-if="!trendLoading && !trendError && trend.length" class="sd-trend">
                        <div v-for="(w, i) in trend" :key="i" class="sd-trend-col" :title="trendTitle(w)">
                            <div class="sd-trend-val">{{ w.units || '' }}</div>
                            <div class="sd-trend-bar"><div class="sd-trend-fill" :style="{ height: trendHeight(w) }" /></div>
                            <div class="sd-trend-lbl">{{ weekLabel(w) }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </el-drawer>
</template>

<script>
import { getStockItem, getStockItemSalesTrend } from '@/api/stockMonitor'
// The item's purchase lines (our records) and their open totals.
import { listOrders, purchasesByItemIds } from '@/api/sparePartsPurchase'
import { STATUS_META, fmtDay } from '@/views/sparePartsPurchase/shared'
import { hasPermission } from '@/utils/permission'

const OPEN_STATUSES = ['pending', 'toConfirm', 'ordered', 'shipped', 'shortage']

const ZOHO_ORG = '746138234'

export default {
    name: 'StockItemDrawer',
    data() {
        return {
            visible: false,
            detailLoading: false,
            detail: null,

            // Sales by week, live from Zoho Analytics.
            trend: [],
            trendLoading: false,
            trendError: '',
            trendWeeks: 12,

            // The item's Spare Parts Purchase lines (newest first) and what is
            // still to arrive, 海运 / 空运 apart; they load behind the drawer.
            lines: [],
            linesTotal: 0,
            linesLoading: false,
            linesError: '',
            toArrive: { total: 0, sea: 0, air: 0 }
        }
    },
    computed: {
        // The batch number opens the batch on the Batches page.
        canBatches() {
            return hasPermission(this.$store.getters.permissions, 'spp:batch:view')
        },
        trendTotal() {
            return Math.round(this.trend.reduce((s, w) => s + (w.units || 0), 0) * 100) / 100
        },
        coverageGaps() {
            if (!this.detail) return []
            const i = this.detail.item
            const gaps = []
            if (!(i.collections || []).length) gaps.push('In no product collection')
            if (!i.inCatalogue) gaps.push('Not in the product catalogue — no brand, category or quality')
            return gaps
        }
    },
    methods: {
        // A table row → the drawer. Rows from the dashboard carry itemId and
        // available; Stock Monitoring's lists carry id and stock.
        async open(row) {
            // A click on a row the list is just replacing arrives without one.
            if (!row) return
            const itemId = String(row.itemId || row.id)
            this.visible = true
            this.detailLoading = true
            this.detail = null
            this.lines = []
            this.linesTotal = 0
            this.linesError = ''
            this.toArrive = { total: 0, sea: 0, air: 0 }
            try {
                this.detail = await getStockItem(itemId)
                // The row already carries live stock once the page overlay
                // has landed; the drawer shows that same figure.
                if (row.__stockLive) {
                    Object.assign(this.detail.item, {
                        available: row.available !== undefined ? row.available : row.stock,
                        ...(row.stockOnHand !== undefined ? { stockOnHand: row.stockOnHand } : {}),
                        ...(row.committed !== undefined ? { committed: row.committed } : {}),
                        __stockLive: true
                    })
                }
                // Not awaited: the register half of the drawer renders at
                // once and the Zoho half fills in behind it.
                this.trend = []
                this.loadTrend(itemId)
                this.loadLines(itemId)
            } catch (e) {
                this.visible = false
                this.$message.error(this.msg(e, 'Could not load that item'))
            } finally {
                this.detailLoading = false
            }
        },
        // The item's purchase lines (latest 15) and the open totals by
        // channel — the same figures as the Stock Monitoring On order column.
        async loadLines(itemId) {
            if (!hasPermission(this.$store.getters.permissions, 'spp:order:view')) {
                this.linesError = 'Your account cannot see Spare Parts Purchase.'
                return
            }
            this.linesLoading = true
            this.linesError = ''
            try {
                const [r, open] = await Promise.all([
                    listOrders({ itemId, page: 1, pageSize: 15 }),
                    purchasesByItemIds([itemId]).catch(() => null)
                ])
                if (!this.detail || this.detail.item.itemId !== itemId) return
                this.lines = r.rows || []
                this.linesTotal = r.total || 0
                const d = open && open.data ? open.data[itemId] : null
                const sum = o => (o ? OPEN_STATUSES.reduce((t, k) => t + (o[k] || 0), 0) : 0)
                this.toArrive = d ? { total: sum(d), sea: sum(d.sea), air: sum(d.air) } : { total: 0, sea: 0, air: 0 }
            } catch (e) {
                if (!this.detail || this.detail.item.itemId !== itemId) return
                this.lines = []
                this.linesError = this.msg(e, 'Could not read the purchase lines.')
            } finally {
                this.linesLoading = false
            }
        },
        isOpen(row) {
            return OPEN_STATUSES.includes(row.status)
        },
        statusStyle(status) {
            const m = STATUS_META[status]
            return m ? { color: m.color, background: m.bg } : {}
        },
        // "Shipped 5" / "Received 5" when that differs from what was ordered.
        statusText(row) {
            const m = STATUS_META[row.status]
            const label = m ? m.label : row.status
            const n = row.status === 'shipped' ? row.shippedQty : row.status === 'received' ? row.receivedQty : null
            return n != null && n !== row.orderQty ? `${label} ${n}` : label
        },
        fmtDay,
        // Close first: the drawer hangs off <body>, so it would stay over
        // the Batches page.
        openBatch(batchNo) {
            this.visible = false
            this.$router.push({ path: '/sparePartsPurchase/batches', query: { batch: batchNo } }).catch(() => {})
        },
        async loadTrend(itemId) {
            this.trendLoading = true
            this.trendError = ''
            try {
                const r = await getStockItemSalesTrend(itemId, this.trendWeeks)
                if (!this.detail || this.detail.item.itemId !== itemId) return
                this.trend = r.trend || []
            } catch (e) {
                if (!this.detail || this.detail.item.itemId !== itemId) return
                this.trend = []
                this.trendError = this.msg(e, 'Could not read the sales trend from Zoho.')
            } finally {
                this.trendLoading = false
            }
        },

        zohoUrl(itemId) {
            return `https://inventory.zoho.com/app/${ZOHO_ORG}#/inventory/items/${itemId}`
        },
        // A sales window as stored: { total, online, inflow, repair, neto,
        // dashboard } — or a plain number on a row not yet refreshed.
        u(w) {
            return w && typeof w === 'object' ? (w.total || 0) : (Number(w) || 0)
        },
        scopeUnits(w, key) {
            return w && typeof w === 'object' ? (w[key] || 0) : 0
        },
        trendHeight(w) {
            const max = Math.max(0, ...this.trend.map(x => x.units || 0))
            return max > 0 ? Math.round(((w.units || 0) / max) * 100) + '%' : '0%'
        },
        weekLabel(w) {
            return new Date(w.from).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
        },
        trendTitle(w) {
            const day = d => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
            return `${day(w.from)} – ${day(w.to)}: ${w.units} units (${w.online} on orders, ${w.offline} at the counter)`
        },
        stockTone(row) {
            if (row.available < 0) return 'sd-warn'
            if (row.available <= 0) return 'sd-bad'
            return ''
        },
        coverTone(d) {
            if (d == null) return 'sd-dim'
            if (d <= 3) return 'sd-bad'
            if (d <= 14) return 'sd-warn'
            return 'sd-good'
        },
        coverText(d) {
            if (d == null) return '—'
            // A near-zero sales rate produces absurd cover figures (41,850
            // days); past a year the number stops meaning anything.
            if (d > 365) return '1y+'
            return `${d.toFixed(1)}d`
        },
        lastSold(days) {
            if (days == null) return 'never'
            if (days <= 0) return 'today'
            if (days === 1) return 'yesterday'
            return `${days} days ago`
        },
        shortDate(v) {
            const d = new Date(v)
            if (isNaN(d.getTime())) return String(v || '')
            return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
        },
        money(v) {
            return v ? `AUD ${Number(v).toFixed(2)}` : '—'
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
.sd-good { color: #67c23a; }
.sd-warn { color: #e6a23c; }
.sd-bad { color: #ff4949; }
.sd-num { font-variant-numeric: tabular-nums; font-weight: 600; }
.sd-mono, .sd-sku { font-variant-numeric: tabular-nums; }
.sd-sku { font-weight: 600; color: #1890ff; }

.sd-drawer { display: flex; flex-direction: column; height: 100%; overflow-y: auto; }
.sd-dh { padding: 16px 20px; border-bottom: 1px solid #ebeef5; display: flex; align-items: flex-start; gap: 12px; }
.sd-dh-main { flex: 1; display: flex; flex-direction: column; gap: 5px; }
.sd-dh-top { display: flex; align-items: center; gap: 8px; }
.sd-dh-sku { font-size: 16px; color: #303133; }
.sd-dh-name { font-size: 13px; color: #606266; line-height: 1.45; }
.sd-zoho { font-size: 12px; color: #909399; text-decoration: none; &:hover { color: #409eff; } }
.sd-dbody { padding: 18px 20px; display: flex; flex-direction: column; gap: 20px; }

.sd-stats {
    display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px;
    background: #ebeef5; border: 1px solid #ebeef5; border-radius: 4px; overflow: hidden;
    > div { background: #fff; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
    label { font-size: 11px; color: #909399; }
    b { font-size: 20px; line-height: 1; font-variant-numeric: tabular-nums; }
}

/* Sales by week: one column per week, bar height relative to the best week */
.sd-trend { display: flex; align-items: flex-end; gap: 4px; height: 96px; padding: 0 2px; }
.sd-trend-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; min-width: 0; }
.sd-trend-val { font-size: 10px; color: #606266; font-variant-numeric: tabular-nums; line-height: 1; height: 12px; }
.sd-trend-bar { width: 100%; height: 56px; display: flex; align-items: flex-end; background: #f5f7fa; border-radius: 2px; margin-top: 2px; }
.sd-trend-fill { width: 100%; background: #409eff; border-radius: 2px; min-height: 0; }
.sd-trend-lbl { font-size: 10px; color: #909399; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }

.sd-section { display: flex; flex-direction: column; gap: 10px; }
.sd-section-head {
    display: flex; align-items: baseline; gap: 8px; font-size: 13px; font-weight: 600; color: #303133;
    .sd-dim { font-weight: 400; }
}
.sd-splits {
    display: flex; gap: 20px; flex-wrap: wrap;
    > div { display: flex; flex-direction: column; gap: 3px; }
    label { font-size: 11px; color: #909399; }
    b { font-size: 14px; color: #303133; font-variant-numeric: tabular-nums; }
}
.sd-empty {
    padding: 20px; text-align: center; border: 1px dashed #dcdfe6; border-radius: 4px;
    font-size: 12px; color: #606266; line-height: 1.6;
}
::v-deep .el-table .sd-row-open > td { background: #fdf6ec; }
.sd-status { display: inline-block; padding: 0 6px; border-radius: 3px; font-size: 11px; line-height: 18px; white-space: nowrap; }
.sd-sea { color: #909399; margin-right: 3px; }
.sd-link { color: #409eff; cursor: pointer; }
.sd-link:hover { text-decoration: underline; }
.sd-arrive i, .sd-arrive .svg-icon { color: #909399; font-size: 11px; width: 10px; height: 10px; margin: 0 1px; }
.sd-gaps {
    display: flex; flex-direction: column; gap: 1px; background: #ebeef5;
    border: 1px solid #ebeef5; border-radius: 4px; overflow: hidden;
    > div { background: #fff; padding: 10px 14px; font-size: 12px; color: #606266; }
    i { color: #e6a23c; margin-right: 6px; }
}
</style>
