<template>
    <div class="xd app-container">
        <div class="xd-head">
            <div class="xd-head-text">
                <div class="xd-title">{{ $tp('Dispatch') }}</div>
                <div class="xd-sub">{{ $tp('Orders at Pick or New, grouped so the same items are processed together') }}</div>
            </div>
            <span class="xd-flex" />
            <div class="xd-total"><b>{{ summary.orders }}</b> {{ $tp('orders') }}<i /><b>{{ summary.units }}</b> {{ $tp('units') }}</div>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">{{ $tp('Refresh') }}</el-button>
        </div>

        <!-- the three ways an order is processed, and how to look at them -->
        <div class="xd-bar">
            <div class="xd-tabs">
                <span v-for="t in tabs" :key="t.key" :class="['xd-tab', { on: tab === t.key }]" @click="tab = t.key">
                    <i :class="t.icon" />
                    <span class="xd-tab-label">{{ $tp(t.label) }}</span>
                    <b>{{ t.count }}</b>
                    <small v-if="t.sub">{{ t.sub }}</small>
                </span>
            </div>
            <span class="xd-flex" />
            <el-button v-if="tab === 'onlist' && processedOnList.length" size="small" icon="el-icon-printer" :loading="labelLoading === 'all'"
                @click="printLabels(processedOnList.map(o => o.orderId))">{{ $tp('Print all labels') }} ({{ processedOnList.length }})</el-button>
            <el-button v-if="view === 'list' && tab === 'sku' && currentGroups.length" type="text" size="small" @click="toggleAll">
                {{ allCollapsed ? $tp('Expand all') : $tp('Collapse all') }}</el-button>
            <div class="xd-views">
                <el-tooltip :content="$tp('Grid')" placement="top">
                    <span :class="['xd-view', { on: view === 'grid' }]" @click="setView('grid')"><i class="el-icon-menu" /></span>
                </el-tooltip>
                <el-tooltip :content="$tp('List')" placement="top">
                    <span :class="['xd-view', { on: view === 'list' }]" @click="setView('list')"><i class="el-icon-s-unfold" /></span>
                </el-tooltip>
            </div>
        </div>

        <div class="xd-filters">
            <el-input v-model="search" size="small" clearable class="xd-search" prefix-icon="el-icon-search"
                :placeholder="$tp('Search order / SKU / product / customer')" @input="onSearch" />
            <el-select v-model="channel" size="small" clearable class="xd-select" :placeholder="$tp('All channels')" @change="load">
                <el-option v-for="c in channels" :key="c.value" :label="c.value" :value="c.value">
                    <span>{{ c.value }}</span><span class="xd-opt-n">{{ c.n }}</span>
                </el-option>
            </el-select>
            <el-select v-model="status" size="small" clearable class="xd-select" :placeholder="$tp('Pick and New')" @change="load">
                <el-option v-for="s in statuses" :key="s.value" :label="s.value" :value="s.value">
                    <span>{{ s.value }}</span><span class="xd-opt-n">{{ s.n }}</span>
                </el-option>
            </el-select>
            <span class="xd-hint">{{ $tp(currentTab.hint) }}</span>
        </div>

        <div ref="body" v-loading="loading" class="xd-body">
            <!-- ───────── Grid ───────── -->
            <!-- masonry: tiles packed into columns, the shortest column takes the next -->
            <div v-if="view === 'grid'" class="xd-masonry">
              <div v-for="(col, ci) in masonry" :key="ci" class="xd-mcol">
                <!-- By SKU: one tile per SKU, its orders under it -->
                <template v-if="tab === 'sku'">
                    <div v-for="g in col" :key="g.key" class="xd-tile">
                        <div class="xd-tile-top">
                            <el-image v-if="g.image" :src="g.image" fit="contain" :preview-src-list="[g.image]" class="xd-thumb" />
                            <div v-else class="xd-thumb xd-thumb-none"><i class="el-icon-picture-outline" /></div>
                            <div class="xd-tile-info">
                                <div class="xd-tile-name" :title="g.productName">{{ g.productName || '—' }}</div>
                                <div class="xd-skus">
                                    <span class="xd-sku" :title="$tp('Neto SKU')"><em>Neto</em>{{ g.sku }}</span>
                                    <span v-if="g.zohoSku" class="xd-sku xd-sku-zoho" :title="g.zohoName"><em>Zoho</em>{{ g.zohoSku }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="xd-tile-bar">
                            <span class="xd-pick"><b>{{ g.units }}</b> {{ $tp(g.units === 1 ? 'unit' : 'units') }}</span>
                            <span class="xd-count">{{ g.orders.length }} {{ $tp(g.orders.length === 1 ? 'order' : 'orders') }}</span>
                            <span class="xd-flex" />
                            <el-button v-if="canProcess" size="mini" type="primary" plain icon="el-icon-finished" class="xd-process" @click="openProcess('sku', g)">{{ $tp('Process') }}</el-button>
                        </div>
                        <div class="xd-olist">
                            <div v-for="o in shown(g)" :key="o.orderId" class="xd-o">
                                <div class="xd-o-1"><b>{{ o.orderId }}</b><span class="xd-flex" /><span class="xd-o-qty">× {{ o.quantity }}</span></div>
                                <div class="xd-o-2">
                                    <span :class="['xd-ch', chClass(o.channel)]">{{ o.channel || '—' }}</span>
                                    <span class="xd-o-cust" :title="o.customerName">{{ o.customerName || '—' }}</span>
                                    <span class="xd-o-when">{{ when(o.datePlaced) }}</span>
                                    <span v-if="isNew(o.status)" class="xd-new">{{ o.status }}</span>
                                </div>
                            </div>
                            <div v-if="g.orders.length > LIMIT" class="xd-more" @click="toggleMore(g.key)">
                                {{ more[g.key] ? $tp('Show less') : $tp('Show all {n}', { n: g.orders.length }) }}
                                <i :class="more[g.key] ? 'el-icon-arrow-up' : 'el-icon-arrow-down'" />
                            </div>
                        </div>
                    </div>
                </template>

                <!-- Multiple line items / On pick list: one tile per order -->
                <template v-else>
                    <div v-for="o in col" :key="o.orderId" class="xd-tile">
                        <div class="xd-tile-bar xd-tile-bar-top">
                            <b class="xd-order">{{ o.orderId }}</b>
                            <span v-if="isNew(o.status)" class="xd-new">{{ o.status }}</span>
                            <span class="xd-flex" />
                            <span class="xd-o-when">{{ when(o.datePlaced) }}</span>
                            <el-button v-if="canProcess && !o.tracking" size="mini" type="primary" plain icon="el-icon-finished" class="xd-process" @click="openProcess('multi', o)">{{ $tp('Process') }}</el-button>
                            <el-button v-if="o.tracking" size="mini" plain icon="el-icon-printer" class="xd-process" :loading="labelLoading === o.orderId" @click="printLabels([o.orderId], o.orderId)">{{ $tp('Label') }}</el-button>
                        </div>
                        <div class="xd-o-2 xd-o-2-pad">
                            <span :class="['xd-ch', chClass(o.channel)]">{{ o.channel || '—' }}</span>
                            <span class="xd-o-cust" :title="o.customerName">{{ o.customerName || '—' }}</span>
                            <span class="xd-flex" />
                            <span class="xd-units">{{ o.items.length }} {{ $tp(o.items.length === 1 ? 'item' : 'items') }}</span>
                        </div>
                        <div v-if="tab === 'onlist'" class="xd-o-2 xd-o-2-pad">
                            <span v-if="o.tracking" class="xd-tracked" :title="$tp('Tracking number')"><i class="el-icon-check" /> {{ o.tracking }}</span>
                            <span v-else class="xd-todo">{{ $tp('Not processed') }}</span>
                            <span class="xd-flex" />
                            <span class="xd-dim">{{ $tp('Pick list') }} {{ longDm(o.pickDay) }}</span>
                        </div>
                        <div class="xd-ilist">
                            <div v-for="it in o.items" :key="it.sku" class="xd-i">
                                <el-image v-if="it.image" :src="it.image" fit="contain" :preview-src-list="[it.image]" class="xd-thumb xd-thumb-sm" />
                                <div v-else class="xd-thumb xd-thumb-sm xd-thumb-none"><i class="el-icon-picture-outline" /></div>
                                <div class="xd-i-info">
                                    <div class="xd-i-name" :title="it.productName">{{ it.productName || '—' }}</div>
                                    <div class="xd-skus"><span class="xd-sku" :title="$tp('Neto SKU')"><em>Neto</em>{{ it.sku }}</span>
                                        <span v-if="it.zohoSku" class="xd-sku xd-sku-zoho" :title="it.zohoName"><em>Zoho</em>{{ it.zohoSku }}</span></div>
                                </div>
                                <b class="xd-i-qty">× {{ it.quantity }}</b>
                            </div>
                        </div>
                    </div>
                </template>
              </div>
            </div>

            <!-- ───────── List ───────── -->
            <template v-else>
                <template v-if="tab === 'sku'">
                    <div v-for="g in bySku" :key="g.key" class="xd-card">
                        <div class="xd-card-head" @click="toggle(g.key)">
                            <i :class="['xd-caret', collapsed[g.key] ? 'el-icon-arrow-right' : 'el-icon-arrow-down']" />
                            <el-image v-if="g.image" :src="g.image" fit="contain" :preview-src-list="[g.image]" class="xd-thumb xd-thumb-sm" @click.native.stop />
                            <div v-else class="xd-thumb xd-thumb-sm xd-thumb-none"><i class="el-icon-picture-outline" /></div>
                            <div class="xd-card-info">
                                <div class="xd-name">{{ g.productName || '—' }}</div>
                                <div class="xd-skus"><span class="xd-sku" :title="$tp('Neto SKU')"><em>Neto</em>{{ g.sku }}</span>
                                    <span v-if="g.zohoSku" class="xd-sku xd-sku-zoho" :title="g.zohoName"><em>Zoho</em>{{ g.zohoSku }}</span></div>
                            </div>
                            <span class="xd-flex" />
                            <span class="xd-count">{{ g.orders.length }} {{ $tp(g.orders.length === 1 ? 'order' : 'orders') }}</span>
                            <span class="xd-units">{{ g.units }} {{ $tp(g.units === 1 ? 'unit' : 'units') }}</span>
                            <el-button v-if="canProcess" size="mini" type="primary" plain icon="el-icon-finished" class="xd-process" @click.stop="openProcess('sku', g)">{{ $tp('Process') }}</el-button>
                        </div>
                        <div v-show="!collapsed[g.key]" class="xd-rows">
                            <div v-for="o in g.orders" :key="o.orderId" class="xd-row">
                                <span class="xd-order">{{ o.orderId }}</span>
                                <span><span :class="['xd-ch', chClass(o.channel)]">{{ o.channel || '—' }}</span></span>
                                <span class="xd-o-cust" :title="o.customerName">{{ o.customerName || '—' }}</span>
                                <span class="xd-o-qty">× {{ o.quantity }}</span>
                                <span class="xd-o-when">{{ when(o.datePlaced) }}</span>
                                <span class="xd-st"><el-tag size="mini" :type="statusTag(o.status)">{{ o.status }}</el-tag></span>
                            </div>
                        </div>
                    </div>
                </template>

                <template v-else>
                    <div v-for="o in (tab === 'onlist' ? onPickList : multiLine)" :key="o.orderId" class="xd-card">
                        <div class="xd-card-head xd-card-head-static">
                            <span class="xd-order">{{ o.orderId }}</span>
                            <template v-if="tab === 'onlist'">
                                <span v-if="o.tracking" class="xd-tracked" :title="$tp('Tracking number')"><i class="el-icon-check" /> {{ o.tracking }}</span>
                                <span v-else class="xd-todo">{{ $tp('Not processed') }}</span>
                            </template>
                            <span :class="['xd-ch', chClass(o.channel)]">{{ o.channel || '—' }}</span>
                            <span class="xd-o-cust" :title="o.customerName">{{ o.customerName || '—' }}</span>
                            <span class="xd-flex" />
                            <span class="xd-o-when">{{ when(o.datePlaced) }}</span>
                            <el-tag size="mini" :type="statusTag(o.status)">{{ o.status }}</el-tag>
                            <el-button v-if="canProcess && !o.tracking" size="mini" type="primary" plain icon="el-icon-finished" class="xd-process" @click="openProcess('multi', o)">{{ $tp('Process') }}</el-button>
                            <el-button v-if="o.tracking" size="mini" plain icon="el-icon-printer" class="xd-process" :loading="labelLoading === o.orderId" @click="printLabels([o.orderId], o.orderId)">{{ $tp('Label') }}</el-button>
                        </div>
                        <div class="xd-ilist xd-ilist-list">
                            <div v-for="it in o.items" :key="it.sku" class="xd-i">
                                <el-image v-if="it.image" :src="it.image" fit="contain" :preview-src-list="[it.image]" class="xd-thumb xd-thumb-sm" />
                                <div v-else class="xd-thumb xd-thumb-sm xd-thumb-none"><i class="el-icon-picture-outline" /></div>
                                <div class="xd-i-info">
                                    <div class="xd-i-name">{{ it.productName || '—' }}</div>
                                    <div class="xd-skus"><span class="xd-sku" :title="$tp('Neto SKU')"><em>Neto</em>{{ it.sku }}</span>
                                        <span v-if="it.zohoSku" class="xd-sku xd-sku-zoho" :title="it.zohoName"><em>Zoho</em>{{ it.zohoSku }}</span></div>
                                </div>
                                <b class="xd-i-qty">× {{ it.quantity }}</b>
                            </div>
                        </div>
                    </div>
                </template>
            </template>

            <div v-if="!loading && !currentCount" class="xd-empty">
                <i class="el-icon-box" />
                <div>{{ search || channel || status ? $tp('No orders match the filters') : $tp(currentTab.empty) }}</div>
            </div>
        </div>

        <!-- Process orders: scan each order's tracking label; the scanner's
             Enter moves the cursor to the next order. Submit puts them on
             today's pick list (Exyon / Neto untouched for now). -->
        <el-dialog :title="$tp('Process orders')" :visible.sync="processVisible" width="720px" top="6vh" append-to-body
            custom-class="xd-process-dialog" @opened="focusScan(0)">
            <div v-if="processItems.length" class="xd-ph">
                <div v-for="it in processItems" :key="it.sku" class="xd-i">
                    <el-image v-if="it.image" :src="it.image" fit="contain" :preview-src-list="[it.image]" class="xd-thumb xd-thumb-sm" />
                    <div v-else class="xd-thumb xd-thumb-sm xd-thumb-none"><i class="el-icon-picture-outline" /></div>
                    <div class="xd-i-info">
                        <div class="xd-i-name">{{ it.productName || '—' }}</div>
                        <div class="xd-skus"><span class="xd-sku"><em>Neto</em>{{ it.sku }}</span>
                            <span v-if="it.zohoSku" class="xd-sku xd-sku-zoho" :title="it.zohoName"><em>Zoho</em>{{ it.zohoSku }}</span>
                            <span v-if="it.location" class="xd-loc"><i class="el-icon-location-outline" /> {{ it.location }}</span></div>
                    </div>
                    <b v-if="it.quantity" class="xd-i-qty">× {{ it.quantity }}</b>
                </div>
            </div>
            <div class="xd-pr-hint"><i class="el-icon-full-screen" /> {{ $tp('Scan the tracking label of each order — the cursor moves to the next order by itself') }}</div>
            <div class="xd-pr-list">
                <div v-for="(r, i) in processRows" :key="r.orderId" :class="['xd-pr', { done: !!clean(r.tracking), dup: isDup(r) }]">
                    <span class="xd-pr-n">{{ i + 1 }}</span>
                    <div class="xd-pr-order">
                        <b>{{ r.orderId }}</b>
                        <div class="xd-o-2">
                            <span :class="['xd-ch', chClass(r.channel)]">{{ r.channel || '—' }}</span>
                            <span class="xd-o-cust" :title="r.customerName">{{ r.customerName || '—' }}</span>
                            <span class="xd-o-when">{{ when(r.datePlaced) }}</span>
                        </div>
                    </div>
                    <span v-if="r.quantity" class="xd-pr-qty">× {{ r.quantity }}</span>
                    <el-input :ref="'scan' + i" v-model="r.tracking" size="small" clearable class="xd-pr-input"
                        :placeholder="$tp('Scan tracking number')" prefix-icon="el-icon-full-screen"
                        @keydown.native.enter.prevent="nextScan(i, $event)" @focus="selectAll" />
                    <i :class="['xd-pr-ok', clean(r.tracking) ? 'el-icon-success' : 'el-icon-time']" />
                </div>
            </div>
            <div v-if="dupTracking" class="xd-pr-warn"><i class="el-icon-warning" /> {{ $tp('The same tracking number is scanned twice: {t}', { t: dupTracking }) }}</div>
            <span slot="footer" class="xd-pr-foot">
                <span class="xd-pr-count">{{ $tp('{n} of {m} scanned', { n: scannedCount, m: processRows.length }) }}</span>
                <span class="xd-flex" />
                <el-button size="small" @click="processVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button ref="processSubmit" size="small" type="primary" icon="el-icon-check" :disabled="!scannedCount || !!dupTracking"
                    :loading="processing" @click="submitProcess">{{ $tp('Add to pick list') }}</el-button>
            </span>
        </el-dialog>

        <!-- shipping labels (100 × 150 mm), one page per order -->
        <el-dialog :title="labelTitle" :visible.sync="labelVisible" width="560px" top="4vh" append-to-body @close="cleanupLabel">
            <div class="xd-label-wrap"><iframe v-if="labelUrl" :src="labelUrl" class="xd-label-frame" title="Shipping labels" /></div>
            <span slot="footer">
                <el-button size="small" type="primary" icon="el-icon-printer" @click="labelPrintNow">{{ $tp('Print') }}</el-button>
                <el-button size="small" icon="el-icon-download" @click="labelDownload">{{ $tp('Download') }}</el-button>
                <el-button size="small" @click="labelVisible = false">{{ $tp('Close') }}</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import { getExyonAccessoryDispatch, processExyonOrders, getExyonLabels } from '@/api/exyonAccessories'
import { buildShippingLabelsPdf, shippingLabelsFileName } from '@/utils/exyonShippingLabelPdf'
import { hasPermission } from '@/utils/permission'

const TABS = [
    { key: 'sku', label: 'Single line items', icon: 'el-icon-goods', hint: 'Orders of a single SKU, grouped by that SKU', empty: 'No single-line orders to process' },
    { key: 'multi', label: 'Multiple line items', icon: 'el-icon-tickets', hint: 'Orders of several SKUs, one by one', empty: 'No multi-line orders to process' },
    { key: 'onlist', label: 'On pick list', icon: 'el-icon-printer', hint: 'Orders already on a pick list — the ones still without a tracking number first', empty: 'No orders on a pick list' }
]
// a tile shows this many orders, the rest behind "Show all"
const LIMIT = 5
// the viewer's grid / list choice (a per-browser convenience)
const VIEW_KEY = 'exyonDispatchView'
// masonry: the narrowest a tile gets (single-SKU / several-SKU tiles), the gap
const TILE_MIN = { sku: 290, multi: 340, onlist: 340 }
const GAP = 12
// a tile's rough height (px) — enough to balance the columns
const linesOf = (text, perLine) => Math.min(3, Math.max(1, Math.ceil(String(text || '').length / perLine)))
function tileHeight(tab, t) {
    if (tab === 'sku') {
        const shown = Math.min(t.orders.length, LIMIT)
        return Math.max(64, linesOf(t.productName, 30) * 18 + 26) + 24 + 30 + shown * 46 + (t.orders.length > LIMIT ? 30 : 0)
    }
    return 40 + 26 + t.items.length * 56 + (tab === 'onlist' ? 26 : 0)
}

export default {
    name: 'ExyonAccessoryDispatch',
    data() {
        let view = 'grid'
        try { if (localStorage.getItem(VIEW_KEY) === 'list') view = 'list' } catch (e) { /* storage blocked */ }
        return {
            LIMIT,
            loading: false,
            bySku: [],
            multiLine: [],
            onPickList: [],
            summary: { orders: 0, units: 0, skuGroups: 0, skuOrders: 0, multiLine: 0, onPickList: 0, processed: 0 },
            channels: [],
            statuses: [],
            search: '',
            channel: '',
            status: '',
            tab: 'sku',
            view,
            collapsed: {},
            more: {},
            searchTimer: null,
            width: 0,
            // the Process popup
            processVisible: false,
            processItems: [],
            processRows: [],
            processing: false,
            // the shipping-label preview
            labelVisible: false,
            labelUrl: '',
            labelTitle: '',
            labelData: [],
            labelLoading: ''
        }
    },
    computed: {
        tabs() {
            const s = this.summary
            const sub = {
                sku: s.skuGroups ? `${s.skuOrders} ${this.$tp('orders')}` : '',
                multi: '',
                onlist: s.onPickList ? `${s.processed} ${this.$tp('processed')}` : ''
            }
            const n = { sku: this.bySku.length, multi: this.multiLine.length, onlist: this.onPickList.length }
            return TABS.map(t => ({ ...t, count: n[t.key], sub: sub[t.key] }))
        },
        currentTab() {
            return TABS.find(t => t.key === this.tab)
        },
        currentGroups() {
            return this.tab === 'sku' ? this.bySku : []
        },
        currentCount() {
            return this.tab === 'multi' ? this.multiLine.length : this.tab === 'onlist' ? this.onPickList.length : this.bySku.length
        },
        allCollapsed() {
            return this.currentGroups.length > 0 && this.currentGroups.every(g => this.collapsed[g.key])
        },
        // On pick list: the orders with a tracking number (their labels can print)
        processedOnList() {
            return this.onPickList.filter(o => o.tracking)
        },
        canProcess() {
            return hasPermission(this.$store.getters.permissions, 'exyon:accessory:picklist')
        },
        scannedCount() {
            return this.processRows.filter(r => this.clean(r.tracking)).length
        },
        // a tracking number scanned for two orders in the popup
        dupTracking() {
            const seen = new Set()
            for (const r of this.processRows) {
                const t = this.clean(r.tracking)
                if (!t) continue
                if (seen.has(t)) return t
                seen.add(t)
            }
            return ''
        },
        // how many masonry columns fit
        columnCount() {
            const min = TILE_MIN[this.tab] || 300
            return Math.max(1, Math.floor((this.width + GAP) / (min + GAP)))
        },
        // the current tab's tiles in columns: each next tile into the
        // shortest column so far (the leftmost on a tie)
        masonry() {
            const tiles = this.tab === 'sku' ? this.bySku : this.tab === 'onlist' ? this.onPickList : this.multiLine
            const cols = Array.from({ length: this.columnCount }, () => ({ h: 0, tiles: [] }))
            for (const t of tiles) {
                let c = cols[0]
                for (const x of cols) if (x.h < c.h) c = x
                c.tiles.push(t)
                c.h += tileHeight(this.tab, t) + GAP
            }
            return cols.map(c => c.tiles)
        }
    },
    created() {
        this.load()
    },
    mounted() {
        this.measure()
        window.addEventListener('resize', this.measure)
        // the menu folding / unfolding changes the width without a window resize
        if (window.ResizeObserver && this.$refs.body) {
            this.resizeObs = new ResizeObserver(() => this.measure())
            this.resizeObs.observe(this.$refs.body)
        }
    },
    beforeDestroy() {
        this.cleanupLabel()
        clearTimeout(this.searchTimer)
        window.removeEventListener('resize', this.measure)
        if (this.resizeObs) this.resizeObs.disconnect()
    },
    methods: {
        measure() {
            const el = this.$refs.body
            if (el && el.clientWidth) this.width = el.clientWidth
        },
        async load() {
            this.loading = true
            try {
                const r = await getExyonAccessoryDispatch({
                    q: this.search.trim() || undefined,
                    channel: this.channel || undefined,
                    status: this.status || undefined
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.bySku = r.bySku || []
                this.multiLine = r.multiLine || []
                this.onPickList = r.onPickList || []
                this.summary = r.summary || this.summary
                this.channels = r.channels || []
                this.statuses = r.statuses || []
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load the orders to dispatch')))
            } finally {
                this.loading = false
            }
        },
        onSearch() {
            clearTimeout(this.searchTimer)
            this.searchTimer = setTimeout(this.load, 350)
        },
        setView(v) {
            this.view = v
            try { localStorage.setItem(VIEW_KEY, v) } catch (e) { /* storage blocked */ }
        },
        // a tile's orders: the first few, or all of them once opened
        shown(g) {
            return this.more[g.key] ? g.orders : g.orders.slice(0, LIMIT)
        },
        toggleMore(key) {
            this.$set(this.more, key, !this.more[key])
        },
        toggle(key) {
            this.$set(this.collapsed, key, !this.collapsed[key])
        },
        toggleAll() {
            const to = !this.allCollapsed
            this.currentGroups.forEach(g => this.$set(this.collapsed, g.key, to))
        },
        // ── Process orders (scan tracking numbers) ──
        // kind: 'sku' (a SKU tile) or 'multi' (one order)
        openProcess(kind, g) {
            // a scanner's Enter must not land on the Process button behind the popup
            if (this.processVisible) return
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
            const pick =({ sku, productName, image, zohoSku, zohoName, location, quantity }) => ({ sku, productName, image, zohoSku, zohoName, location, quantity })
            if (kind === 'sku') {
                this.processItems = [pick({ ...g, quantity: null })]
                this.processRows = g.orders.map(o => this.processRow(o, o.quantity))
            } else {
                this.processItems = g.items.map(pick)
                this.processRows = [this.processRow(g, null)]
            }
            this.processVisible = true
            // straight into the first box (again once the popup has opened)
            this.focusScan(0)
        },
        processRow(o, quantity) {
            return { orderId: o.orderId, channel: o.channel, customerName: o.customerName, datePlaced: o.datePlaced, quantity, tracking: o.tracking || '', had: o.tracking || '' }
        },
        // a scanned value as it will be saved (scanners may add spaces)
        clean(v) {
            return String(v || '').replace(/\s+/g, '')
        },
        isDup(r) {
            const t = this.clean(r.tracking)
            return !!t && this.processRows.filter(x => this.clean(x.tracking) === t).length > 1
        },
        // the cursor to the first order from `from` with nothing scanned yet —
        // or to the submit button once every order has its number
        focusScan(from) {
            this.$nextTick(() => {
                const i = this.processRows.findIndex((r, k) => k >= from && !this.clean(r.tracking))
                if (i === -1) {
                    const b = this.$refs.processSubmit
                    if (b && b.$el) b.$el.focus()
                    return
                }
                const ref = this.$refs['scan' + i]
                const input = Array.isArray(ref) ? ref[0] : ref
                if (input) input.focus()
            })
        },
        // the scanner's Enter: on to the next order — unless that number was
        // already scanned for another order (stay, ready for a re-scan)
        nextScan(i, e) {
            const r = this.processRows[i]
            if (!this.clean(r.tracking)) return
            this.lastScanAt = Date.now()
            if (this.isDup(r)) {
                if (e && e.target && e.target.select) e.target.select()
                return
            }
            this.focusScan(i + 1)
        },
        selectAll(e) {
            if (e && e.target && e.target.select) e.target.select()
        },
        async submitProcess() {
            // a scanner that ends with two Enters must not submit: after the last
            // scan the cursor rests on this button, so a "click" right after a
            // scan is that second Enter
            if (Date.now() - (this.lastScanAt || 0) < 500) return
            const orders = this.processRows
                .filter(r => this.clean(r.tracking) && this.clean(r.tracking) !== r.had)
                .map(r => ({ orderId: r.orderId, tracking: this.clean(r.tracking) }))
            if (!orders.length) { this.$message.info(this.$tp('Nothing new to add')); return }
            this.processing = true
            try {
                const r = await processExyonOrders(orders)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('{n} orders added to the pick list', { n: orders.length }))
                if (r.warnings && r.warnings.length) {
                    this.$notify({ type: 'warning', title: this.$tp('Check these tracking numbers'), message: r.warnings.join('\n'), duration: 0 })
                }
                this.processVisible = false
                this.load()
                this.printLabels(orders.map(o => o.orderId))
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to process the orders')))
            } finally {
                this.processing = false
            }
        },
        // ── shipping labels ──
        async printLabels(orderIds, busyKey) {
            this.labelLoading = busyKey || 'all'
            try {
                const r = await getExyonLabels(orderIds)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                if (r.missing && r.missing.length) {
                    this.$message.warning(this.$tp('No address in Neto for {ids}', { ids: r.missing.join(', ') }))
                }
                this.labelData = r.labels || []
                this.cleanupLabel()
                this.labelUrl = buildShippingLabelsPdf(this.labelData).output('bloburl') + '#toolbar=0'
                this.labelTitle = this.$tp('Shipping labels') + ' — ' + (this.labelData.length === 1 ? this.labelData[0].orderId : this.$tp('{n} orders', { n: this.labelData.length }))
                this.labelVisible = true
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load the labels')))
            } finally {
                this.labelLoading = ''
            }
        },
        labelPrintNow() {
            const doc = buildShippingLabelsPdf(this.labelData)
            doc.autoPrint()
            const w = window.open(doc.output('bloburl'))
            if (!w) this.$message.warning(this.$tp('Pop-up blocked — use Download instead'))
        },
        labelDownload() {
            buildShippingLabelsPdf(this.labelData).save(shippingLabelsFileName(this.labelData))
        },
        cleanupLabel() {
            if (this.labelUrl) {
                try { URL.revokeObjectURL(this.labelUrl.replace('#toolbar=0', '')) } catch (e) { /* ignore */ }
            }
            this.labelUrl = ''
        },
        chClass(c) {
            const v = String(c || '').toLowerCase()
            if (v.includes('reebelo')) return 'ch-reebelo'
            if (v.includes('backmarket') || v.includes('back market')) return 'ch-backmarket'
            if (v.includes('jb hi-fi')) return 'ch-jb'
            if (v.includes('kogan')) return 'ch-kogan'
            return ''
        },
        isNew(s) {
            return String(s || '').toLowerCase() === 'new'
        },
        statusTag(s) {
            return this.isNew(s) ? '' : 'warning'
        },
        // a pick list's day "2026-10-08" → "Thu 8 Oct"
        longDm(day) {
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '')
            if (!m) return day || ''
            return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
        },
        // "2026-10-08 00:09:54" (as written in Exyon's table) → "08/10 00:09"
        when(v) {
            const m = /^\d{4}-(\d{2})-(\d{2})\s(\d{2}:\d{2})/.exec(v || '')
            return m ? `${m[2]}/${m[1]} ${m[3]}` : '—'
        },
        msg(e, fallback) { return (e.response && e.response.data && e.response.data.message) || e.message || fallback }
    }
}
</script>

<style lang="scss" scoped>
.xd { padding: 14px 16px; }
.xd-flex { flex: 1; }
.xd-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; }
.xd-head-text { min-width: 0; }
.xd-title { font-size: 17px; font-weight: 600; color: #303133; }
.xd-sub { font-size: 13px; color: #909399; margin-top: 3px; }
.xd-total { display: flex; align-items: baseline; gap: 4px; font-size: 13px; color: #909399; white-space: nowrap;
    b { font-size: 20px; font-weight: 600; color: #303133; }
    i { width: 1px; height: 14px; margin: 0 8px; background: #dcdfe6; align-self: center; } }

/* tabs + view switch */
.xd-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
.xd-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.xd-tab { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid #dcdfe6; border-radius: 6px;
    font-size: 13px; color: #606266; cursor: pointer; white-space: nowrap; background: #fff; transition: border-color .15s, background .15s;
    b { min-width: 18px; padding: 0 5px; border-radius: 9px; background: #f0f2f5; color: #606266; font-size: 12px; text-align: center; line-height: 18px; }
    small { color: #909399; font-size: 11px; }
    &:hover { border-color: #b3d8ff; color: #409eff; }
    &.on { border-color: #409eff; background: #ecf5ff; color: #409eff; font-weight: 500;
        b { background: #409eff; color: #fff; } small { color: #66b1ff; } } }
.xd-views { display: inline-flex; border: 1px solid #dcdfe6; border-radius: 6px; overflow: hidden; background: #fff; }
.xd-view { padding: 5px 10px; font-size: 15px; color: #909399; cursor: pointer; line-height: 1;
    & + & { border-left: 1px solid #dcdfe6; }
    &:hover { color: #409eff; }
    &.on { background: #409eff; color: #fff; } }

.xd-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.xd-search { width: 280px; max-width: 100%; }
.xd-select { width: 160px; }
.xd-opt-n { float: right; margin-left: 12px; color: #c0c4cc; font-size: 12px; }
.xd-hint { font-size: 12px; color: #909399; }
.xd-body { min-height: 140px; }

/* shared bits */
.xd-thumb { flex-shrink: 0; width: 64px; height: 64px; border-radius: 6px; border: 1px solid #ebeef5; background: #fff; overflow: hidden; cursor: zoom-in; }
.xd-thumb-sm { width: 40px; height: 40px; border-radius: 4px; }
.xd-thumb-none { display: flex; align-items: center; justify-content: center; background: #f5f7fa; color: #c0c4cc; font-size: 20px; cursor: default; }
.xd-thumb-sm.xd-thumb-none { font-size: 16px; }
.xd-skus { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; margin-top: 4px; }
.xd-sku { padding: 0 6px; border-radius: 4px; background: #f0f2f5; color: #303133; font-family: Menlo, Consolas, monospace; font-size: 11px; line-height: 18px; white-space: nowrap; }
/* Neto SKU (Exyon's listing) / Zoho SKU (our item) */
.xd-sku em { margin-right: 4px; font-style: normal; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 10px; color: #909399; }
.xd-sku-zoho { background: #ecf5ff; color: #1f6fd1; em { color: #79a8e0; } }
.xd-count { padding: 0 8px; border-radius: 10px; background: #409eff; color: #fff; font-size: 12px; line-height: 20px; white-space: nowrap; }
.xd-units { font-size: 12px; color: #606266; white-space: nowrap; }
.xd-dim { font-size: 12px; color: #909399; }
.xd-process { padding: 5px 10px; }
/* processed: the tracking number scanned for the order */
.xd-tracked { padding: 0 6px; border-radius: 3px; font-size: 11px; line-height: 17px; color: #fff; background: #67c23a; white-space: nowrap; }
/* on a pick list, no tracking number yet */
.xd-todo { padding: 0 6px; border-radius: 3px; font-size: 11px; line-height: 17px; color: #b88200; background: #fdf6ec; white-space: nowrap; }
.xd-loc { font-size: 11px; color: #606266; white-space: nowrap; }
/* the Process popup */
.xd-ph { padding: 4px 12px; margin-bottom: 10px; border: 1px solid #ebeef5; border-radius: 6px; background: #fafbfc; }
.xd-pr-hint { margin-bottom: 8px; font-size: 12px; color: #909399; }
.xd-pr-list { max-height: 52vh; overflow-y: auto; border: 1px solid #ebeef5; border-radius: 6px; }
.xd-pr { display: flex; align-items: center; gap: 10px; padding: 8px 12px; transition: background .15s;
    & + & { border-top: 1px solid #f0f2f5; }
    &.done { background: #f0f9eb; }
    &.dup { background: #fef0f0; } }
.xd-pr-n { width: 20px; flex-shrink: 0; font-size: 12px; color: #c0c4cc; text-align: right; }
.xd-pr-order { flex: 1; min-width: 0; b { font-size: 13px; color: #303133; } }
.xd-pr-qty { flex-shrink: 0; font-weight: 600; color: #303133; }
.xd-pr-input { width: 240px; flex-shrink: 0; ::v-deep input { font-family: Menlo, Consolas, monospace; } }
.xd-pr-ok { flex-shrink: 0; font-size: 18px; color: #c0c4cc;
    &.el-icon-success { color: #67c23a; } }
.xd-pr-warn { margin-top: 8px; font-size: 12px; color: #f56c6c; }
.xd-pr-foot { display: flex; align-items: center; gap: 8px; }
.xd-pr-count { font-size: 13px; color: #606266; }
/* the label preview: a 100 × 150 page */
.xd-label-wrap { height: 74vh; background: #f2f3f5; }
.xd-label-frame { width: 100%; height: 100%; border: none; display: block; }
.xd-order { font-weight: 600; color: #303133; white-space: nowrap; }
.xd-ch { display: inline-block; padding: 0 6px; border-radius: 3px; font-size: 11px; line-height: 17px; white-space: nowrap;
    color: #606266; background: #f4f4f5;
    &.ch-reebelo { color: #409eff; background: #ecf5ff; }
    &.ch-backmarket { color: #67c23a; background: #f0f9eb; }
    &.ch-jb { color: #b88200; background: #fdf6ec; }
    &.ch-kogan { color: #c45656; background: #fef0f0; } }
.xd-new { padding: 0 6px; border-radius: 3px; font-size: 11px; line-height: 17px; color: #fff; background: #409eff; }
.xd-o-cust { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #606266; }
.xd-o-when { font-size: 12px; color: #909399; white-space: nowrap; }
.xd-o-qty { font-weight: 600; color: #303133; white-space: nowrap; }

/* ───────── Grid ───────── */
.xd-masonry { display: flex; align-items: flex-start; gap: 12px; }
.xd-mcol { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.xd-tile { display: flex; flex-direction: column; border: 1px solid #ebeef5; border-radius: 8px; background: #fff; overflow: hidden;
    transition: box-shadow .15s, border-color .15s;
    &:hover { border-color: #d9ecff; box-shadow: 0 2px 10px rgba(0, 0, 0, .06); } }
.xd-tile-top { display: flex; align-items: flex-start; gap: 10px; padding: 12px 12px 8px; }
.xd-tile-info { flex: 1; min-width: 0; }
.xd-tile-name { font-size: 13px; font-weight: 600; color: #303133; line-height: 1.35; word-break: normal;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
/* how many to pick — the tile's headline number */
.xd-pick { padding: 1px 9px; border-radius: 10px; background: #f0f9eb; color: #67c23a; font-size: 12px; line-height: 20px; white-space: nowrap;
    b { font-size: 15px; color: #529b2e; } }
.xd-tile-bar { display: flex; align-items: center; gap: 8px; padding: 0 12px 8px; }
.xd-tile-bar-top { padding: 10px 12px 6px; }
.xd-olist { border-top: 1px solid #f0f2f5; }
.xd-o { padding: 6px 12px; font-size: 13px;
    & + & { border-top: 1px dashed #f0f2f5; } }
.xd-o-1 { display: flex; align-items: center; gap: 6px; b { color: #303133; } }
.xd-o-2 { display: flex; align-items: center; gap: 6px; margin-top: 2px; font-size: 12px; }
.xd-o-2-pad { padding: 0 12px 8px; }
.xd-more { padding: 6px 12px; border-top: 1px solid #f0f2f5; font-size: 12px; color: #409eff; text-align: center; cursor: pointer;
    &:hover { background: #f5f7fa; } }
.xd-ilist { padding: 4px 12px 8px; }
.xd-i { display: flex; align-items: center; gap: 8px; padding: 4px 0;
    & + & { border-top: 1px dashed #f0f2f5; } }
.xd-i-info { flex: 1; min-width: 0; }
.xd-i-name { font-size: 12px; color: #303133; line-height: 1.35; word-break: normal;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.xd-i-qty { flex-shrink: 0; font-size: 13px; color: #303133; }

/* ───────── List ───────── */
.xd-card { border: 1px solid #ebeef5; border-radius: 6px; background: #fff; margin-bottom: 10px; overflow: hidden; }
.xd-card-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 12px; background: #fafbfc; font-size: 13px; cursor: pointer; user-select: none;
    &:hover { background: #f5f7fa; } }
.xd-card-head-static { cursor: default; &:hover { background: #fafbfc; } }
.xd-card-info { min-width: 0; }
.xd-caret { color: #909399; }
.xd-name { min-width: 0; font-weight: 600; color: #303133; font-size: 13px; line-height: 1.4; word-break: normal; }
.xd-rows { border-top: 1px solid #ebeef5; }
.xd-row { display: grid; grid-template-columns: 150px 120px minmax(0, 1fr) 60px 90px 90px; align-items: center; gap: 8px;
    padding: 6px 12px 6px 34px; font-size: 13px; color: #303133;
    & + & { border-top: 1px dashed #f0f2f5; } }
.xd-row-noqty { grid-template-columns: 150px 120px minmax(0, 1fr) 90px 90px; }
.xd-row .xd-o-qty { text-align: right; }
.xd-st { text-align: right; }
.xd-ilist-list { padding-left: 34px; border-top: 1px solid #ebeef5; }

.xd-empty { padding: 50px 0; text-align: center; color: #909399; font-size: 13px;
    i { display: block; font-size: 36px; color: #c0c4cc; margin-bottom: 8px; } }

@media (max-width: 600px) {
    .xd-search, .xd-select { width: 100%; }
    .xd-hint { width: 100%; }
    .xd-tab-label { max-width: 110px; overflow: hidden; text-overflow: ellipsis; }
    .xd-row, .xd-row-noqty { grid-template-columns: minmax(0, 1fr) auto; padding-left: 12px; row-gap: 2px; }
    .xd-ilist-list { padding-left: 12px; }
    .xd-pr { flex-wrap: wrap; }
    .xd-pr-input { width: 100%; }
}
</style>
