<template>
    <!-- One item from the stock register: its numbers, who bought it, its
         Zoho purchase orders and weekly sales. Opened with open(row) from
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

                <!-- Who bought it. Read live from Zoho, because invoice
                     numbers and customer names are not in the register,
                     so it arrives after the rest of the drawer. -->
                <div class="sd-section">
                    <div class="sd-section-head">
                        <span>Sales history</span>
                        <span v-if="salesTruncated" class="sd-dim">most recent {{ sales.length }}</span>
                        <div class="sd-spacer" />
                        <span v-if="sales.length" class="sd-dim">
                            {{ salesUnits }} units to {{ salesCustomers }} customers
                        </span>
                    </div>

                    <el-table v-if="sales.length || salesLoading" :data="sales" v-loading="salesLoading"
                        size="mini" border max-height="300" empty-text="Loading…">
                        <el-table-column prop="date" label="Date" width="96" />
                        <el-table-column prop="invoiceNumber" label="Invoice" width="112">
                            <template slot-scope="s"><span class="sd-mono">{{ s.row.invoiceNumber || '—' }}</span></template>
                        </el-table-column>
                        <el-table-column prop="customerName" label="Customer" min-width="150" show-overflow-tooltip />
                        <el-table-column prop="quantity" label="Qty" width="62" align="right">
                            <template slot-scope="s"><span class="sd-num">{{ s.row.quantity == null ? '—' : s.row.quantity }}</span></template>
                        </el-table-column>
                        <el-table-column prop="price" label="Price" width="96" align="right">
                            <template slot-scope="s"><span class="sd-mono">{{ s.row.price || '—' }}</span></template>
                        </el-table-column>
                    </el-table>

                    <div v-else-if="salesError" class="sd-empty">
                        {{ salesError }}
                        <br><el-button type="text" size="mini" @click="loadSales(detail.item.itemId)">Try again</el-button>
                    </div>
                    <div v-else class="sd-empty">
                        No invoice has carried this item.
                        <span v-if="offline(detail.item.units90) > 0" class="sd-dim">
                            <br>{{ offline(detail.item.units90) }} units left through the counter, workshop, Neto or dispatch, which carry no invoice.
                        </span>
                    </div>
                </div>

                <!-- Straight from Zoho Inventory, where POs are raised
                     (one per shipped batch). What is still with the
                     supplier is the Spare Parts Purchase line below. -->
                <div class="sd-section">
                    <div class="sd-section-head">
                        <span>Purchase orders</span>
                        <span class="sd-dim">Zoho Inventory</span>
                        <div class="sd-spacer" />
                        <span v-if="poOnOrder > 0" class="sd-good sd-num">{{ poOnOrder }} still to arrive</span>
                    </div>

                    <!-- Ordering runs ahead of Zoho: the warehouse books
                         an order against the supplier first, and a Zoho
                         PO only exists once that supplier ships. Without
                         this line an item counted On order can show an
                         empty PO table and look like a mistake. -->
                    <div v-if="detail.item.openPoQty > 0" class="sd-ordered">
                        <i class="el-icon-shopping-cart-2" />
                        <span>
                            <b>{{ detail.item.openPoQty }}</b> on order with the supplier
                            <span class="sd-dim">
                                · {{ detail.item.openPoLines }}
                                {{ detail.item.openPoLines === 1 ? 'line' : 'lines' }}<template
                                    v-if="detail.item.earliestPoDate">, oldest {{ shortDate(detail.item.earliestPoDate) }}</template>.
                                A Zoho PO appears once they ship.
                            </span>
                        </span>
                    </div>

                    <el-table v-if="purchaseOrders.length || poLoading" :data="purchaseOrders"
                        v-loading="poLoading" size="mini" border max-height="260" empty-text="Loading…"
                        :row-class-name="({ row }) => (row.open ? 'sd-row-open' : '')">
                        <el-table-column prop="date" label="Ordered" width="96" />
                        <el-table-column prop="number" label="PO" width="104">
                            <template slot-scope="s"><span class="sd-mono">{{ s.row.number || '—' }}</span></template>
                        </el-table-column>
                        <el-table-column prop="vendor" label="Vendor" min-width="130" show-overflow-tooltip />
                        <el-table-column prop="quantity" label="Qty" width="60" align="right">
                            <template slot-scope="s"><span class="sd-num">{{ s.row.quantity == null ? '—' : s.row.quantity }}</span></template>
                        </el-table-column>
                        <el-table-column label="Status" width="118">
                            <template slot-scope="s">
                                <el-tag v-if="s.row.open" size="mini" type="warning" effect="plain">
                                    {{ s.row.outstanding != null ? s.row.outstanding + ' to come' : 'open' }}
                                </el-tag>
                                <span v-else class="sd-dim">{{ s.row.receivedStatus || s.row.status }}</span>
                            </template>
                        </el-table-column>
                    </el-table>

                    <div v-else-if="poError" class="sd-empty">
                        {{ poError }}
                        <br><el-button type="text" size="mini"
                            @click="loadPurchaseOrders(detail.item.itemId)">Try again</el-button>
                    </div>
                    <div v-else class="sd-empty">
                        <template v-if="detail.item.openPoQty > 0">
                            Nothing shipped yet — the supplier has the order but has not sent a batch.
                        </template>
                        <template v-else>
                            No purchase order has ever been raised for this item in Zoho.
                            <span v-if="u(detail.item.units90) > 0" class="sd-dim">
                                <br>{{ u(detail.item.units90) }} units sold in 90 days.
                            </span>
                        </template>
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
import {
    getStockItem, getStockItemSales, getStockItemPurchaseOrders, getStockItemSalesTrend
} from '@/api/stockMonitor'

const ZOHO_ORG = '746138234'

export default {
    name: 'StockItemDrawer',
    data() {
        return {
            visible: false,
            detailLoading: false,
            detail: null,

            // Sales history arrives separately — it is a live Zoho read, so
            // the drawer must render without it.
            sales: [],
            salesLoading: false,
            salesTruncated: false,
            salesError: '',

            // Sales by week, live from Zoho Analytics.
            trend: [],
            trendLoading: false,
            trendError: '',
            trendWeeks: 12,

            // Purchase orders come from Zoho too, and load alongside the
            // sales history rather than blocking the drawer.
            purchaseOrders: [],
            poOnOrder: 0,
            poLoading: false,
            poError: ''
        }
    },
    computed: {
        trendTotal() {
            return Math.round(this.trend.reduce((s, w) => s + (w.units || 0), 0) * 100) / 100
        },
        salesUnits() {
            return this.sales.reduce((t, s) => t + (Number(s.quantity) || 0), 0)
        },
        salesCustomers() {
            return new Set(this.sales.map(s => s.customerName).filter(Boolean)).size
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
            const itemId = String(row.itemId || row.id)
            this.visible = true
            this.detailLoading = true
            this.detail = null
            this.sales = []
            this.salesTruncated = false
            this.salesError = ''
            this.purchaseOrders = []
            this.poOnOrder = 0
            this.poError = ''
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
                this.loadSales(itemId)
                this.loadPurchaseOrders(itemId)
            } catch (e) {
                this.visible = false
                this.$message.error(this.msg(e, 'Could not load that item'))
            } finally {
                this.detailLoading = false
            }
        },
        async loadPurchaseOrders(itemId) {
            this.poLoading = true
            this.poError = ''
            try {
                const r = await getStockItemPurchaseOrders(itemId, { limit: 8 })
                if (!this.detail || this.detail.item.itemId !== itemId) return
                this.purchaseOrders = r.purchaseOrders || []
                this.poOnOrder = r.onOrder || 0
            } catch (e) {
                if (!this.detail || this.detail.item.itemId !== itemId) return
                this.purchaseOrders = []
                this.poError = this.msg(e, 'Could not read purchase orders from Zoho.')
            } finally {
                this.poLoading = false
            }
        },
        async loadSales(itemId) {
            this.salesLoading = true
            this.salesError = ''
            try {
                const r = await getStockItemSales(itemId, { limit: 25 })
                // A slow Zoho read can land after the drawer has moved on
                // to another item; drop it rather than showing one item's
                // sales under another's name.
                if (!this.detail || this.detail.item.itemId !== itemId) return
                this.sales = r.sales || []
                this.salesTruncated = !!r.truncated
            } catch (e) {
                if (!this.detail || this.detail.item.itemId !== itemId) return
                this.sales = []
                this.salesError = this.msg(e, 'Could not read the sales history from Zoho.')
            } finally {
                this.salesLoading = false
            }
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
        offline(w) {
            return w && typeof w === 'object' ? Math.round(((w.total || 0) - (w.online || 0)) * 100) / 100 : 0
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
.sd-ordered {
    display: flex; align-items: flex-start; gap: 8px; padding: 9px 12px;
    background: #f0f9eb; border: 1px solid #e1f3d8; border-radius: 4px;
    font-size: 12px; color: #606266; line-height: 1.5;
    i { color: #67c23a; margin-top: 2px; }
    b { color: #67c23a; font-variant-numeric: tabular-nums; }
}
.sd-gaps {
    display: flex; flex-direction: column; gap: 1px; background: #ebeef5;
    border: 1px solid #ebeef5; border-radius: 4px; overflow: hidden;
    > div { background: #fff; padding: 10px 14px; font-size: 12px; color: #606266; }
    i { color: #e6a23c; margin-right: 6px; }
}
</style>
