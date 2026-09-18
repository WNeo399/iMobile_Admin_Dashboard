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

            <el-table ref="table" :data="rows" v-loading="loading" size="mini" border
                :default-sort="{ prop: query.sort, order: query.order === 'asc' ? 'ascending' : 'descending' }"
                @sort-change="onSort" @row-click="openDetail"
                empty-text="Nothing matches these filters.">
                <!-- SKU, product and shelf in one column. The column's own
                     sort arrows would only cover one field, so the header
                     carries SKU / Shelf sort links instead. -->
                <el-table-column prop="name" label="Product" min-width="380">
                    <template #header>
                        <div class="sd-prod-head">
                            <span>Product</span>
                            <span v-for="k in HEAD_SORTS" :key="k.prop"
                                :class="['sd-hsort', { on: query.sort === k.prop }]"
                                @click.stop="sortBy(k.prop)">{{ k.label }}<i
                                    :class="query.sort !== k.prop ? 'el-icon-d-caret'
                                        : query.order === 'asc' ? 'el-icon-caret-top' : 'el-icon-caret-bottom'" /></span>
                        </div>
                    </template>
                    <template slot-scope="s">
                        <div class="sd-prod">
                            <!-- Clicking the image opens the viewer, not the detail drawer. -->
                            <product-thumb :src="s.row.imageUrl" :item-id="s.row.itemId" />
                            <div class="sd-prod-text">
                                <div class="sd-prod-name" :title="s.row.name">
                                    {{ s.row.name }}
                                    <el-tag v-if="s.row.stale && s.row.available > 0" size="mini" effect="plain">sitting still</el-tag>
                                </div>
                                <div class="sd-prod-meta">
                                    <span class="sd-sku">{{ s.row.sku || '—' }}</span>
                                    <span v-if="s.row.location" class="sd-mono"><i class="el-icon-location-outline" /> {{ s.row.location }}</span>
                                </div>
                            </div>
                        </div>
                    </template>
                </el-table-column>

                <el-table-column prop="available" label="Stock" width="86" align="right" sortable="custom">
                    <template slot-scope="s">
                        <span :class="['sd-num', stockTone(s.row)]">{{ s.row.available }}</span>
                    </template>
                </el-table-column>

                <el-table-column prop="units30" label="30-day" width="88" align="right" sortable="custom">
                    <template slot-scope="s"><span class="sd-num">{{ s.row.units30 }}</span></template>
                </el-table-column>

                <el-table-column prop="units90" label="90-day" width="88" align="right" sortable="custom">
                    <template slot-scope="s"><span class="sd-num">{{ s.row.units90 }}</span></template>
                </el-table-column>

                <el-table-column prop="daysOfCover" label="Cover" width="92" align="right" sortable="custom">
                    <template slot-scope="s">
                        <span :class="['sd-num', coverTone(s.row.daysOfCover)]">{{ coverText(s.row.daysOfCover) }}</span>
                    </template>
                </el-table-column>

                <!-- Accessory purchasing runs outside imb_purchase_order, so
                     an On order column there would read 0 for everything. -->
                <el-table-column v-if="scope === 'parts'" prop="openPoQty" label="On order" width="96"
                    align="right" sortable="custom">
                    <template slot-scope="s">
                        <span v-if="s.row.openPoQty > 0" class="sd-num sd-good">{{ s.row.openPoQty }}</span>
                        <span v-else class="sd-dim">—</span>
                    </template>
                </el-table-column>

                <el-table-column prop="daysSinceSale" label="Last sold" width="104" sortable="custom">
                    <template slot-scope="s">
                        <span class="sd-dim">{{ lastSold(s.row.daysSinceSale) }}</span>
                    </template>
                </el-table-column>

                <el-table-column label="" width="72" align="center">
                    <template slot-scope="s">
                        <!-- Add to / remove from the 海运 list (parts only). -->
                        <el-tooltip v-if="scope === 'parts'" :content="s.row.seaFreight ? 'Remove from 海运' : 'Add to 海运'"
                            placement="left">
                            <el-button type="text" size="mini" :loading="s.row.__seaBusy"
                                :class="['sd-sea-btn', { on: s.row.seaFreight }]" icon="el-icon-ship"
                                @click.stop="toggleSeaFreight(s.row)" />
                        </el-tooltip>
                        <!-- Move to / restore from the Archive bucket. -->
                        <el-tooltip :content="query.filter === 'archived' ? 'Restore from Archive' : 'Move to Archive'"
                            placement="left">
                            <el-button type="text" size="mini" :loading="s.row.__archivedBusy"
                                :icon="query.filter === 'archived' ? 'el-icon-refresh-left' : 'el-icon-box'"
                                @click.stop="toggleArchive(s.row)" />
                        </el-tooltip>
                    </template>
                </el-table-column>
            </el-table>

            <div class="sd-pager">
                <el-pagination background layout="total, sizes, prev, pager, next"
                    :current-page="query.page" :page-size="query.pageSize" :page-sizes="[20, 50, 100, 200]"
                    :total="total" @current-change="onPage" @size-change="onSize" />
            </div>
        </div>

        <!-- ── detail drawer ────────────────────────────────────────── -->
        <el-drawer :visible.sync="detailVisible" size="560px" :with-header="false" @closed="detail = null">
            <div v-if="detail" v-loading="detailLoading" class="sd-drawer">
                <div class="sd-dh">
                    <div class="sd-dh-main">
                        <div class="sd-dh-top">
                            <span class="sd-sku sd-dh-sku">{{ detail.item.sku || '—' }}</span>
                            <el-tag v-if="detail.item.outOfStock" size="mini" type="danger" effect="plain">Out of stock</el-tag>
                            <el-tag v-if="detail.item.classification" size="mini" effect="plain">
                                {{ detail.item.classification }}
                            </el-tag>
                        </div>
                        <div class="sd-dh-name">{{ detail.item.name }}</div>
                        <div class="sd-mono sd-dim">Shelf {{ detail.item.location || '—' }}</div>
                    </div>
                    <el-button type="text" icon="el-icon-close" @click="detailVisible = false" />
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

                    <div class="sd-splits">
                        <div><label>Sold on orders</label><b>{{ detail.item.onlineUnits }}</b></div>
                        <div><label>Used at the counter</label><b>{{ detail.item.offlineUnits }}</b></div>
                        <div><label>Unit cost</label><b>{{ money(detail.item.purchasePrice) }}</b></div>
                        <div><label>Preferred vendor</label><b>{{ detail.item.preferVendor || '—' }}</b></div>
                    </div>

                    <!-- Who bought it. Read live from Zoho, because invoice
                         numbers and customer names are not in the snapshot,
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
                            <span v-if="detail.item.offlineUnits > 0" class="sd-dim">
                                <br>{{ detail.item.offlineUnits }} units left as counter usage, which has no invoice.
                            </span>
                        </div>
                    </div>

                    <!-- Straight from Zoho Inventory, where POs are raised.
                         The supplier sheet synced out of Tencent Docs covers
                         one buying channel and disagrees with Zoho often
                         enough to be misleading here. -->
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
                                <span v-if="detail.item.units90 > 0" class="sd-dim">
                                    <br>{{ detail.item.units90 }} units sold in 90 days.
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

                    <div v-if="detail.history.length > 1" class="sd-section">
                        <div class="sd-section-head">
                            <span>Stock since {{ detail.history[0].snapshotDate }}</span>
                        </div>
                        <el-table :data="detail.history.slice().reverse()" size="mini" border max-height="200">
                            <el-table-column prop="snapshotDate" label="Day" width="110" />
                            <el-table-column prop="available" label="Stock" width="80" align="right" />
                            <el-table-column prop="units30" label="30-day" width="88" align="right" />
                            <el-table-column prop="openPoQty" label="On order" align="right" />
                        </el-table>
                    </div>
                </div>
            </div>
        </el-drawer>
    </div>
</template>

<script>
import {
    getStockSummary, getStockItems, getStockItem, getStockShelves,
    getStockItemSales, getStockItemPurchaseOrders, setStockItemArchived,
    runStockSnapshot, getStockSnapshotRun
} from '@/api/stockMonitor'
import { addSeaFreightItems, removeSeaFreightItem } from '@/api/zoho/stockMonitoring'
import ProductThumb from '@/components/ProductThumb'

// Tiles in the order a buyer reads them: how bad, what is covered, what
// needs ordering, what is about to, and what is dead weight.
const TILES = [
    { key: 'outOfStock', label: 'Out of stock', tone: 'plain', tag: 'danger', note: 'nothing on the shelf' },
    { key: 'uncovered', label: 'Nothing on order', tone: 'bad', tag: 'danger', note: 'the buy list' },
    { key: 'onOrder', label: 'On order', tone: 'good', tag: 'success', note: 'covered by a PO', partsOnly: true },
    { key: 'belowCover', label: "Under a month's cover", tone: 'warn', tag: 'warning', note: 'stock < 30-day sales' },
    { key: 'sittingStill', label: 'Sitting still', tone: 'plain', tag: 'info', note: 'holding stock, no 14-day sales' }
]
const SORT_LABELS = {
    units90: '90-day units', units30: '30-day units', available: 'stock',
    daysOfCover: 'days of cover', daysSinceSale: 'days since last sale',
    sku: 'SKU', name: 'product', location: 'shelf', openPoQty: 'quantity on order'
}
// Sort links in the merged Product column's header.
const HEAD_SORTS = [{ prop: 'sku', label: 'SKU' }, { prop: 'location', label: 'Shelf' }]

export default {
    name: 'StockDashboard',
    components: { ProductThumb },
    props: {
        // Rendered inside the Stock Monitoring page (Dashboard tab) rather
        // than as its own route: drop the app-container chrome and retitle,
        // everything else behaves identically.
        embedded: { type: Boolean, default: false }
    },
    data() {
        return {
            HEAD_SORTS,
            // Fixed: the dashboard lives under iMobile Spare Parts now, so
            // the accessory scope (and its toggle) is gone.
            scope: 'parts',
            loading: false,
            summaryLoading: false,
            exporting: false,

            snapshotDate: null,
            run: null,
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
                sort: 'units90', order: 'desc', page: 1, pageSize: 20
            },

            detailVisible: false,
            detailLoading: false,
            detail: null,

            // Sales history arrives separately — it is the one live Zoho
            // read on this page, so the drawer must render without it.
            sales: [],
            salesLoading: false,
            salesTruncated: false,
            salesError: '',

            // Purchase orders come from Zoho too, and load alongside
            // the sales history rather than blocking the drawer.
            purchaseOrders: [],
            poOnOrder: 0,
            poLoading: false,
            poError: ''
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
        // How old the numbers are, said plainly. A snapshot older than a
        // day is a broken cron, not a rounding detail.
        staleness() {
            if (!this.snapshotDate) return { tone: 'bad', icon: 'el-icon-warning-outline', text: 'No snapshot yet' }
            const days = Math.floor((Date.now() - new Date(this.snapshotDate + 'T00:00:00').getTime()) / 86400000)
            const win = this.run && this.run.salesWindowDays ? ` · ${this.run.salesWindowDays}-day sales` : ''
            const items = this.counts.all ? ` · ${this.counts.all.toLocaleString()} items` : ''
            if (days <= 0) return { tone: 'ok', icon: 'el-icon-time', text: `Counted today${items}${win}` }
            if (days === 1) return { tone: 'ok', icon: 'el-icon-time', text: `Counted yesterday${items}${win}` }
            return { tone: 'warn', icon: 'el-icon-warning-outline', text: `Counted ${days} days ago${items}${win}` }
        },
        runProblem() {
            if (!this.snapshotDate) return 'No stock snapshot has been taken yet — run the daily job to populate this page.'
            if (this.run && this.run.ok === false) {
                return `The last snapshot failed${this.run.error ? ': ' + this.run.error : ''}. The numbers below are from the last good run.`
            }
            if (this.staleness.tone === 'warn') {
                return 'The snapshot is more than a day old.'
            }
            return ''
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
    created() {
        this.reload()
        this.loadShelves()
        // A snapshot someone else started (or one surviving a page reload)
        // should show as in-progress here too.
        this.checkSnapshotRunning()
    },
    beforeDestroy() {
        if (this.snapshotPollTimer) clearTimeout(this.snapshotPollTimer)
    },
    methods: {
        // ── on-demand snapshot ───────────────────────────────────────
        // Kicks off bin/stockSnapshot.js on the server and polls until it
        // finishes (a run takes a minute or two — longer when Zoho
        // throttles), then reloads everything from the fresh snapshot.
        async runSnapshot() {
            if (this.snapshotRunning) return
            this.snapshotRunning = true
            try {
                const r = await runStockSnapshot()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.info(r.alreadyRunning
                    ? 'A snapshot is already running — waiting for it to finish.'
                    : 'Snapshot started — this takes a minute or two.')
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
                    this.$message.success('Snapshot updated.')
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
        // Add a row to (or remove it from) the 海运 list — the pinned
        // collection the Stock Monitoring page shows as a tab. The badge
        // flips immediately; the snapshot's collections tag follows at the
        // next run.
        async toggleSeaFreight(row) {
            if (row.__seaBusy) return
            this.$set(row, '__seaBusy', true)
            try {
                const r = row.seaFreight
                    ? await removeSeaFreightItem(row.itemId)
                    : await addSeaFreightItems([{ id: row.itemId, name: row.name, sku: row.sku }])
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$set(row, 'seaFreight', !row.seaFreight)
                this.$message.success(row.seaFreight
                    ? `${row.sku || row.name} added to 海运`
                    : `${row.sku || row.name} removed from 海运`)
            } catch (e) {
                this.$message.error((e && e.message) || 'Failed to update 海运')
            } finally {
                this.$set(row, '__seaBusy', false)
            }
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
                filter: 'all', search: '', category: '', collection: '', location: '', vendor: '',
                sort: 'units90', order: 'desc', page: 1
            })
            this.loadItems()
            // The tiles were narrowed by the filters — widen them back too.
            this.loadSummary()
        },
        // Header sort link: first click sorts A→Z, again flips. The table's
        // own arrows are cleared so only one sort shows as active.
        sortBy(prop) {
            this.query.order = this.query.sort === prop && this.query.order === 'asc' ? 'desc' : 'asc'
            this.query.sort = prop
            this.query.page = 1
            if (this.$refs.table) this.$refs.table.clearSort()
            this.loadItems()
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

        async openDetail(row) {
            this.detailVisible = true
            this.detailLoading = true
            this.detail = null
            this.sales = []
            this.salesTruncated = false
            this.salesError = ''
            this.purchaseOrders = []
            this.poOnOrder = 0
            this.poError = ''
            try {
                this.detail = await getStockItem(row.itemId)
                // Not awaited: the snapshot half of the drawer renders at
                // once and the Zoho half fills in behind it.
                this.loadSales(row.itemId)
                this.loadPurchaseOrders(row.itemId)
            } catch (e) {
                this.detailVisible = false
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

        // Export what is on screen, not the whole snapshot — the filters
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
                    lines.push([x.sku, x.name, x.location, x.available, x.units7, x.units30, x.units90,
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

/* Merged Product column: thumbnail, name, then SKU + shelf */
.sd-prod { display: flex; align-items: center; gap: 8px; line-height: 1.35; }
.sd-prod-text { min-width: 0; }
.sd-prod-name { color: #303133; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sd-prod-meta { display: flex; align-items: center; gap: 10px; font-size: 12px; color: #909399; margin-top: 1px; }
.sd-prod-head { display: inline-flex; align-items: center; gap: 12px; }
.sd-hsort {
    font-weight: normal; font-size: 12px; color: #909399; cursor: pointer; user-select: none;
    i { margin-left: 2px; font-size: 11px; }
    &:hover { color: #409eff; }
    &.on { color: #409eff; font-weight: 600; }
}

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
/* Membership reads off the button itself: green = in 海运, grey = not. */
.sd-sea-btn { color: #c0c4cc; padding: 2px; &.on { color: #67C23A; } }
.sd-search { width: 260px; }
.sd-sel { width: 150px; }
.sd-sel-sm { width: 120px; }

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
.sd-tile.tone-good .sd-tile-value { color: #67c23a; }

.sd-card { background: #fff; border: 1px solid #e6ebf5; border-radius: 4px; overflow: hidden; }
.sd-card-head {
    display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-bottom: 1px solid #ebeef5;
}
.sd-card-title { font-size: 13px; font-weight: 600; color: #303133; }
.sd-pager { padding: 12px 14px; text-align: right; }
::v-deep .el-table__row { cursor: pointer; }

.sd-drawer { display: flex; flex-direction: column; height: 100%; overflow-y: auto; }
.sd-dh { padding: 16px 20px; border-bottom: 1px solid #ebeef5; display: flex; align-items: flex-start; gap: 12px; }
.sd-dh-main { flex: 1; display: flex; flex-direction: column; gap: 5px; }
.sd-dh-top { display: flex; align-items: center; gap: 8px; }
.sd-dh-sku { font-size: 16px; color: #303133; }
.sd-dh-name { font-size: 13px; color: #606266; line-height: 1.45; }
.sd-dbody { padding: 18px 20px; display: flex; flex-direction: column; gap: 20px; }

.sd-stats {
    display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px;
    background: #ebeef5; border: 1px solid #ebeef5; border-radius: 4px; overflow: hidden;
    > div { background: #fff; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
    label { font-size: 11px; color: #909399; }
    b { font-size: 20px; line-height: 1; font-variant-numeric: tabular-nums; }
}
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
