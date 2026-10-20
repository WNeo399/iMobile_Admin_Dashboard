<template>
    <div class="xd app-container">
        <!-- layout after the user's mock-up (2026-10-20) -->
        <div class="xd-head">
            <div class="xd-head-text">
                <h1 class="xd-title">{{ $tp('Dispatch') }}</h1>
                <div class="xd-sub">{{ $tp('Orders ready for picking, grouped by SKU') }}</div>
            </div>
            <span class="xd-flex" />
            <!-- Ctrl K / ⌘K jumps here -->
            <div class="xd-search-box">
                <el-input ref="search" v-model="search" clearable class="xd-search" prefix-icon="el-icon-search"
                    :placeholder="$tp('Search order / SKU / product / customer')" @input="onSearch" />
                <kbd v-if="!search" class="xd-kbd">{{ shortcutLabel }}</kbd>
            </div>
            <div class="xd-stats">
                <div class="xd-stat"><b>{{ summary.orders }}</b><span>{{ $tp('orders') }}</span></div>
                <div class="xd-stat"><b>{{ summary.units }}</b><span>{{ $tp('units') }}</span></div>
            </div>
            <el-button class="xd-refresh" icon="el-icon-refresh" :loading="loading" @click="load">{{ $tp('Refresh') }}</el-button>
        </div>

        <!-- the three ways an order is processed -->
        <div class="xd-tabs">
            <span v-for="t in tabs" :key="t.key" :class="['xd-tab', { on: tab === t.key }]" @click="tab = t.key">
                <i :class="t.icon" />
                <span class="xd-tab-label">{{ $tp(t.label) }}</span>
                <b>{{ t.count }}</b>
                <small v-if="t.sub">{{ t.sub }}</small>
            </span>
        </div>

        <!-- Channel (JB Hi-Fi, BackMarket, the rest) and Envelope pills — counts:
             the current tab's orders the other row lets through; no Pick / New
             filter, the two are the same to the warehouse; then sort + view -->
        <div class="xd-filters">
            <div class="xd-fgroup">
                <span class="xd-filter-label">{{ $tp('Channel') }}</span>
                <div class="xd-pills">
                    <span :class="['xd-pill', { on: !channel }]" @click="channel = ''">{{ $tp('All') }}</span>
                    <span v-for="c in channelOptions" :key="c.value" :class="['xd-pill', { on: channel === c.value }]"
                        @click="channel = c.value">{{ $tp(c.label) }}<b>{{ c.n }}</b></span>
                </div>
            </div>
            <i class="xd-vsep" />
            <div class="xd-fgroup">
                <span class="xd-filter-label">{{ $tp('Envelope') }}</span>
                <div class="xd-pills">
                    <span :class="['xd-pill', { on: !envelope }]" @click="envelope = ''">{{ $tp('All') }}</span>
                    <span v-for="e in envelopeOptions" :key="e.value" :class="['xd-pill', { on: envelope === e.value }]"
                        @click="envelope = e.value">{{ $tp(e.label) }}<b>{{ e.n }}</b></span>
                </div>
            </div>
            <span class="xd-flex" />
            <el-button v-if="tab === 'onlist' && processedOnList.length" size="small" icon="el-icon-printer" :loading="labelLoading === 'all'"
                @click="printLabels(processedOnList.map(o => o.orderId))">{{ $tp('Print all labels') }} ({{ processedOnList.length }})</el-button>
            <el-button v-if="view === 'list' && tab === 'sku' && currentGroups.length" type="text" size="small" @click="toggleAll">
                {{ allCollapsed ? $tp('Expand all') : $tp('Collapse all') }}</el-button>
            <span class="xd-sort-label">{{ $tp('Sort by') }}</span>
            <el-select v-model="sort" class="xd-sort">
                <i slot="prefix" class="el-icon-sort xd-sort-ico" />
                <el-option v-for="s in sortOptions" :key="s.value" :label="$tp(s.label)" :value="s.value" />
            </el-select>
            <div class="xd-views">
                <el-tooltip :content="$tp('Grid')" placement="top">
                    <span :class="['xd-view', { on: view === 'grid' }]" @click="setView('grid')"><i class="el-icon-menu" /></span>
                </el-tooltip>
                <el-tooltip :content="$tp('List')" placement="top">
                    <span :class="['xd-view', { on: view === 'list' }]" @click="setView('list')"><i class="el-icon-s-unfold" /></span>
                </el-tooltip>
            </div>
        </div>

        <!-- orders Neto already dispatched are left out; when Neto didn't answer,
             only the ones it answered before are -->
        <div v-if="summary.netoChecked === false" class="xd-warnbar">
            <i class="el-icon-warning" /> {{ $tp('Neto did not answer — orders already dispatched there may still show. Refresh in a moment.') }}
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
                                <!-- the listing's SKU, then our Zoho SKU + the item's envelope
                                     (user: the same for an item) on a line of their own -->
                                <div class="xd-skus">
                                    <span class="xd-sku" :title="$tp('Neto SKU')"><em>SKU</em>{{ g.sku }}</span>
                                </div>
                                <div class="xd-skus">
                                    <span v-if="g.zohoSku" class="xd-sku xd-sku-zoho" :title="g.zohoName"><em>Zoho</em>{{ g.zohoSku }}</span>
                                    <span :class="['xd-env', 'xd-env-' + envSize(groupEnv(g))]" :title="envTitle(groupEnv(g))"><i class="el-icon-message" />{{ envLabel(groupEnv(g)) }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="xd-tile-stats">
                            <div class="xd-stat-pick"><b>{{ g.units }}</b><span>{{ $tp('units to pick') }}</span></div>
                            <div class="xd-stat-orders"><b>{{ g.orders.length }}</b><span>{{ $tp(g.orders.length === 1 ? 'order' : 'orders') }}</span></div>
                            <el-button v-if="canProcess" type="primary" class="xd-process-btn" @click="openProcess('sku', g)">
                                {{ $tp('Process') }}<i class="el-icon-right el-icon--right" /></el-button>
                        </div>
                        <div class="xd-olist">
                            <div v-for="o in shown(g)" :key="o.orderId" class="xd-o">
                                <div class="xd-o-main">
                                    <b class="xd-o-id">{{ o.orderId }}</b>
                                    <div class="xd-o-meta" :title="[o.customerName, o.channel].filter(Boolean).join(' · ')">{{ o.customerName || '—' }} · {{ when(o.datePlaced) }}</div>
                                </div>
                                <!-- only an order whose quantity takes another envelope than the item's -->
                                <span v-if="envSize(o) !== envSize(groupEnv(g))" :class="['xd-env', 'xd-env-' + envSize(o)]" :title="envTitle(o)"><i class="el-icon-message" />{{ envLabel(o) }}</span>
                                <span class="xd-o-qty">× {{ o.quantity }}</span>
                            </div>
                            <div v-if="g.orders.length > LIMIT" class="xd-more" @click="toggleMore(g.key)">
                                {{ more[g.key] ? $tp('Show less') : $tp('Show all {n} orders', { n: g.orders.length }) }}
                                <i :class="more[g.key] ? 'el-icon-arrow-up' : 'el-icon-arrow-down'" />
                            </div>
                        </div>
                    </div>
                </template>

                <!-- Multiple line items / On pick list: one tile per order -->
                <template v-else>
                    <div v-for="o in col" :key="o.orderId" class="xd-tile">
                        <div class="xd-tile-head">
                            <div class="xd-o-main">
                                <b class="xd-o-id xd-o-id-lg">{{ o.orderId }}</b>
                                <div class="xd-o-meta" :title="[o.customerName, o.channel].filter(Boolean).join(' · ')">{{ o.customerName || '—' }} · {{ when(o.datePlaced) }}</div>
                            </div>
                            <span :class="['xd-env', 'xd-env-' + envSize(o)]" :title="envTitle(o)"><i class="el-icon-message" />{{ envLabel(o) }}</span>
                        </div>
                        <div v-if="tab === 'onlist'" class="xd-tile-sub">
                            <span v-if="o.tracking" class="xd-tracked" :title="$tp('Tracking number')"><i class="el-icon-check" /> {{ o.tracking }}</span>
                            <span v-else class="xd-todo">{{ $tp('Not processed') }}</span>
                            <!-- held back at Confirm dispatch, or Neto refused the update -->
                            <span v-if="o.dispatch && o.dispatch.status === 'held'" class="xd-todo" :title="o.dispatch.note || ''">{{ $tp('Not dispatched') }}: {{ $tp(o.dispatch.reason) }}</span>
                            <span v-else-if="o.dispatch && o.dispatch.status === 'failed'" class="xd-failed" :title="o.dispatch.error || ''">{{ $tp('Neto update failed') }}</span>
                            <span class="xd-flex" />
                            <span class="xd-dim">{{ $tp('Pick list') }} {{ longDm(o.pickDay) }}</span>
                        </div>
                        <div class="xd-ilist">
                            <div v-for="it in o.items" :key="it.sku" class="xd-i">
                                <el-image v-if="it.image" :src="it.image" fit="contain" :preview-src-list="[it.image]" class="xd-thumb xd-thumb-sm" />
                                <div v-else class="xd-thumb xd-thumb-sm xd-thumb-none"><i class="el-icon-picture-outline" /></div>
                                <div class="xd-i-info">
                                    <div class="xd-i-name" :title="it.productName">{{ it.productName || '—' }}</div>
                                    <div class="xd-skus"><span class="xd-sku" :title="$tp('Neto SKU')"><em>SKU</em>{{ it.sku }}</span>
                                        <span v-if="it.zohoSku" class="xd-sku xd-sku-zoho" :title="it.zohoName"><em>Zoho</em>{{ it.zohoSku }}</span></div>
                                </div>
                                <b class="xd-i-qty">× {{ it.quantity }}</b>
                            </div>
                        </div>
                        <div class="xd-tile-foot">
                            <span class="xd-foot-n">{{ orderUnits(o) }} {{ $tp(orderUnits(o) === 1 ? 'unit' : 'units') }} · {{ o.items.length }} {{ $tp(o.items.length === 1 ? 'item' : 'items') }}</span>
                            <span class="xd-flex" />
                            <el-button v-if="canProcess && !o.tracking" type="primary" class="xd-process-btn" @click="openProcess('multi', o)">
                                {{ $tp('Process') }}<i class="el-icon-right el-icon--right" /></el-button>
                            <el-button v-if="o.tracking" plain icon="el-icon-printer" class="xd-process-btn" :loading="labelLoading === o.orderId" @click="printLabels([o.orderId], o.orderId)">{{ $tp('Label') }}</el-button>
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
                                <div class="xd-skus"><span class="xd-sku" :title="$tp('Neto SKU')"><em>SKU</em>{{ g.sku }}</span></div>
                                <div class="xd-skus"><span v-if="g.zohoSku" class="xd-sku xd-sku-zoho" :title="g.zohoName"><em>Zoho</em>{{ g.zohoSku }}</span>
                                    <span :class="['xd-env', 'xd-env-' + envSize(groupEnv(g))]" :title="envTitle(groupEnv(g))"><i class="el-icon-message" />{{ envLabel(groupEnv(g)) }}</span></div>
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
                                <span><span v-if="envSize(o) !== envSize(groupEnv(g))" :class="['xd-env', 'xd-env-' + envSize(o)]" :title="envTitle(o)"><i class="el-icon-message" />{{ envLabel(o) }}</span></span>
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
                            <span :class="['xd-env', 'xd-env-' + envSize(o)]" :title="envTitle(o)"><i class="el-icon-message" />{{ envLabel(o) }}</span>
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
                                    <div class="xd-skus"><span class="xd-sku" :title="$tp('Neto SKU')"><em>SKU</em>{{ it.sku }}</span>
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
                <div>{{ search || channel || envelope ? $tp('No orders match the filters') : $tp(currentTab.empty) }}</div>
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
                        <div class="xd-skus"><span class="xd-sku"><em>SKU</em>{{ it.sku }}</span>
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
                    <span :class="['xd-env', 'xd-env-' + envSize(r)]" :title="envTitle(r)"><i class="el-icon-message" />{{ envLabel(r) }}</span>
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
    { key: 'sku', label: 'Single line items', icon: 'el-icon-box', empty: 'No single-line orders to process' },
    { key: 'multi', label: 'Multiple line items', icon: 'el-icon-files', empty: 'No multi-line orders to process' },
    { key: 'onlist', label: 'On pick list', icon: 'el-icon-document', empty: 'No orders on a pick list' }
]
// Sort by — per tab (the first is the default)
const SORTS = {
    sku: [
        { value: 'units', label: 'Most units' },
        { value: 'orders', label: 'Most orders' },
        { value: 'oldest', label: 'Oldest first' },
        { value: 'name', label: 'Product A–Z' }
    ],
    multi: [
        { value: 'oldest', label: 'Oldest first' },
        { value: 'newest', label: 'Newest first' },
        { value: 'units', label: 'Most units' }
    ]
}
SORTS.onlist = SORTS.multi
const SIZE_RANK = { small: 0, medium: 1, large: 2, other: 3 }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const placedOf = o => String((o && o.datePlaced) || '')
// The envelope an order ships in (user 2026-10-20) — worked out by the
// backend (utils/exyonEnvelope.js) from its product names and quantities;
// "Other" = a product the rules don't recognise, the packer chooses.
const ENVELOPES = [
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' },
    { value: 'other', label: 'Other' }
]
// The channel tabs (user 2026-10-20): JB Hi-Fi and BackMarket on their own,
// every other channel (Reebelo, Kogan, BigW, Temu, eBay…) as Others.
const CHANNEL_GROUPS = [
    { value: 'jb', label: 'JB Hi-Fi' },
    { value: 'backmarket', label: 'BackMarket' },
    { value: 'others', label: 'Others' }
]
function channelGroupOf(channel) {
    const v = String(channel || '').toLowerCase().replace(/[\s-]+/g, '')
    if (v.includes('jbhifi')) return 'jb'
    if (v.includes('backmarket')) return 'backmarket'
    return 'others'
}
// a tile shows this many orders, the rest behind "Show all"
const LIMIT = 4
// the viewer's grid / list choice (a per-browser convenience)
const VIEW_KEY = 'exyonDispatchView'
// masonry: the narrowest a tile gets (single-SKU / several-SKU tiles), the gap
const TILE_MIN = { sku: 330, multi: 340, onlist: 340 }
const GAP = 16
// a tile's rough height (px) — enough to balance the columns
const linesOf = (text, perLine) => Math.min(2, Math.max(1, Math.ceil(String(text || '').length / perLine)))
function tileHeight(tab, t) {
    if (tab === 'sku') {
        const shown = Math.min(t.orders.length, LIMIT)
        return Math.max(56, linesOf(t.productName, 28) * 20 + 48) + 24 + 66 + shown * 50 + (t.orders.length > LIMIT ? 38 : 0)
    }
    return 60 + (tab === 'onlist' ? 28 : 0) + t.items.length * 56 + 58
}

export default {
    name: 'ExyonAccessoryDispatch',
    data() {
        let view = 'grid'
        try { if (localStorage.getItem(VIEW_KEY) === 'list') view = 'list' } catch (e) { /* storage blocked */ }
        return {
            LIMIT,
            // Sort by, per tab
            sortBy: { sku: SORTS.sku[0].value, multi: SORTS.multi[0].value, onlist: SORTS.onlist[0].value },
            loading: false,
            // as loaded — the tabs show them through the Envelope filter
            rawBySku: [],
            rawMultiLine: [],
            rawOnPickList: [],
            // Envelope filter: '' (all) or small / medium / large / other
            envelope: '',
            summary: { orders: 0, units: 0, skuGroups: 0, skuOrders: 0, multiLine: 0, onPickList: 0, processed: 0 },
            search: '',
            // Channel tab: '' (all) or jb / backmarket / others
            channel: '',
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
        // The three tabs through the Channel and Envelope tabs: a SKU tile
        // keeps only its orders that pass (units counted again), and goes
        // when none do.
        // …and in the chosen Sort by order.
        bySku() {
            const groups = (!this.envelope && !this.channel) ? this.rawBySku.slice() : this.rawBySku
                .map(g => {
                    const orders = g.orders.filter(o => this.passes(o))
                    return { ...g, orders, units: orders.reduce((t, o) => t + (Number(o.quantity) || 0), 0) }
                })
                .filter(g => g.orders.length)
            const oldest = g => g.orders.reduce((m, o) => (!m || placedOf(o) < m ? placedOf(o) : m), '')
            const by = {
                units: (a, b) => b.units - a.units || b.orders.length - a.orders.length,
                orders: (a, b) => b.orders.length - a.orders.length || b.units - a.units,
                oldest: (a, b) => oldest(a).localeCompare(oldest(b)),
                name: (a, b) => String(a.productName || '').localeCompare(String(b.productName || ''))
            }[this.sortBy.sku] || (() => 0)
            return groups.sort((a, b) => by(a, b) || String(a.sku).localeCompare(String(b.sku)))
        },
        multiLine() {
            return this.sortOrders(this.rawMultiLine.filter(o => this.passes(o)), this.sortBy.multi)
        },
        // still to process (no tracking number) first, whatever the sort
        onPickList() {
            const by = this.sortBy.onlist
            const todo = this.rawOnPickList.filter(o => this.passes(o) && !o.tracking)
            const done = this.rawOnPickList.filter(o => this.passes(o) && o.tracking)
            return [...this.sortOrders(todo, by), ...this.sortOrders(done, by)]
        },
        sortOptions() {
            return SORTS[this.tab] || SORTS.sku
        },
        sort: {
            get() { return this.sortBy[this.tab] },
            set(v) { this.$set(this.sortBy, this.tab, v) }
        },
        shortcutLabel() {
            return /mac/i.test(navigator.platform || '') ? '⌘K' : 'Ctrl K'
        },
        // the current tab's orders, before the Channel / Envelope tabs
        tabOrders() {
            return this.tab === 'sku' ? this.rawBySku.flatMap(g => g.orders)
                : this.tab === 'onlist' ? this.rawOnPickList : this.rawMultiLine
        },
        // each Channel / Envelope tab's count: the current tab's orders of
        // that kind which the OTHER bar lets through
        channelOptions() {
            const orders = this.tabOrders.filter(o => this.passes(o, 'channel'))
            return CHANNEL_GROUPS.map(c => ({ ...c, n: orders.filter(o => channelGroupOf(o.channel) === c.value).length }))
        },
        envelopeOptions() {
            const orders = this.tabOrders.filter(o => this.passes(o, 'envelope'))
            return ENVELOPES.map(e => ({ ...e, n: orders.filter(o => this.envSize(o) === e.value).length }))
        },
        tabs() {
            const sub = {
                sku: '',
                multi: '',
                onlist: this.onPickList.length ? `${this.processedOnList.length} ${this.$tp('processed')}` : ''
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
        window.addEventListener('keydown', this.onShortcut)
        // the menu folding / unfolding changes the width without a window resize
        if (window.ResizeObserver && this.$refs.body) {
            this.resizeObs = new ResizeObserver(() => this.measure())
            this.resizeObs.observe(this.$refs.body)
        }
    },
    // a page kept alive behind another tab must not take that page's Ctrl K
    activated() {
        window.addEventListener('keydown', this.onShortcut)
    },
    deactivated() {
        window.removeEventListener('keydown', this.onShortcut)
    },
    beforeDestroy() {
        this.cleanupLabel()
        clearTimeout(this.searchTimer)
        window.removeEventListener('resize', this.measure)
        window.removeEventListener('keydown', this.onShortcut)
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
                    q: this.search.trim() || undefined
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rawBySku = r.bySku || []
                this.rawMultiLine = r.multiLine || []
                this.rawOnPickList = r.onPickList || []
                this.summary = r.summary || this.summary
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
            return { orderId: o.orderId, channel: o.channel, customerName: o.customerName, datePlaced: o.datePlaced, quantity, envelope: o.envelope || null, tracking: o.tracking || '', had: o.tracking || '' }
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
        // one-order tiles in Sort by order: oldest / newest placed, most units
        sortOrders(list, by) {
            const units = o => this.orderUnits(o)
            const cmp = {
                oldest: (a, b) => placedOf(a).localeCompare(placedOf(b)),
                newest: (a, b) => placedOf(b).localeCompare(placedOf(a)),
                units: (a, b) => units(b) - units(a) || placedOf(a).localeCompare(placedOf(b))
            }[by] || (() => 0)
            return list.slice().sort((a, b) => cmp(a, b) || String(a.orderId).localeCompare(String(b.orderId)))
        },
        orderUnits(o) {
            return (o.items || []).reduce((t, it) => t + (Number(it.quantity) || 0), 0)
        },
        // A SKU tile's envelope (user: the same for an item) — the size most
        // of its orders take (the smaller on a tie), as one of those orders,
        // so its reasons come along. An order whose quantity takes another
        // size still shows its own.
        groupEnv(g) {
            const tally = {}
            for (const o of g.orders) tally[this.envSize(o)] = (tally[this.envSize(o)] || 0) + 1
            const size = Object.keys(tally).sort((a, b) => tally[b] - tally[a] || SIZE_RANK[a] - SIZE_RANK[b])[0]
            return g.orders.find(o => this.envSize(o) === size) || g.orders[0]
        },
        // Ctrl K / ⌘K: into the search box
        onShortcut(e) {
            if ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key).toLowerCase() === 'k') {
                e.preventDefault()
                const s = this.$refs.search
                if (s && s.focus) s.focus()
            }
        },
        // Does an order pass the Channel and Envelope tabs? `skip` leaves one
        // of them out (for that bar's own counts).
        passes(o, skip) {
            if (this.channel && skip !== 'channel' && channelGroupOf(o.channel) !== this.channel) return false
            if (this.envelope && skip !== 'envelope' && this.envSize(o) !== this.envelope) return false
            return true
        },
        // ── envelope ──
        envSize(o) {
            return (o && o.envelope && o.envelope.size) || 'small'
        },
        envLabel(o) {
            const e = ENVELOPES.find(x => x.value === this.envSize(o))
            return this.$tp(e ? e.label : 'Small')
        },
        // the badge's hover text: why this size
        envTitle(o) {
            const reasons = ((o && o.envelope && o.envelope.reasons) || []).map(r => {
                if (r.code === 'ipad') return this.$tp('iPad / tablet accessory')
                if (r.code === 'largeItem') return this.$tp('Large item (car mount, holder, speaker, tripod)')
                if (r.code === 'cases') return this.$tp('{n} phone case(s)', { n: r.n })
                if (r.code === 'screenProtectors') return this.$tp('{n} screen protector(s)', { n: r.n })
                if (r.code === 'unknown') return this.$tp('Not recognised — choose the envelope: {names}', { names: (r.names || []).join(' + ') })
                return ''
            }).filter(Boolean)
            return this.$tp('{size} envelope', { size: this.envLabel(o) }) + (reasons.length ? ' — ' + reasons.join(' · ') : '')
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
        // "2026-10-08 00:09:54" (as written in Exyon's table) → "08 Oct 00:09"
        when(v) {
            const m = /^\d{4}-(\d{2})-(\d{2})\s(\d{2}:\d{2})/.exec(v || '')
            return m ? `${m[2]} ${MONTHS[+m[1] - 1] || m[1]} ${m[3]}` : '—'
        },
        msg(e, fallback) { return (e.response && e.response.data && e.response.data.message) || e.message || fallback }
    }
}
</script>

<style lang="scss" scoped>
.xd { padding: 20px 24px; }
.xd-flex { flex: 1; }

/* header: title · search · totals · Refresh */
.xd-head { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-bottom: 18px; }
.xd-head-text { min-width: 0; }
.xd-title { margin: 0; font-size: 26px; font-weight: 700; color: #1f2329; line-height: 1.2; }
.xd-sub { margin-top: 4px; font-size: 14px; color: #8a8f99; }
.xd-search-box { position: relative; flex: 0 1 380px; min-width: 200px; }
.xd-search { width: 100%;
    ::v-deep .el-input__inner { height: 40px; line-height: 40px; border-radius: 8px; padding-right: 56px; }
    ::v-deep .el-input__icon { line-height: 40px; } }
.xd-kbd { position: absolute; top: 50%; right: 10px; transform: translateY(-50%); pointer-events: none;
    padding: 1px 6px; border: 1px solid #dcdfe6; border-radius: 4px; background: #f5f7fa;
    font: 11px/16px -apple-system, 'Segoe UI', sans-serif; color: #909399; }
.xd-stats { display: flex; align-items: center; }
.xd-stat { display: flex; flex-direction: column; align-items: center; padding: 0 18px;
    & + & { border-left: 1px solid #ebeef5; }
    b { font-size: 22px; font-weight: 700; color: #1f2329; line-height: 1.15; }
    span { font-size: 12px; color: #8a8f99; } }
.xd-refresh { height: 40px; padding: 0 18px; border-radius: 8px; color: #409eff; font-weight: 600; }

/* the three order tabs */
.xd-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.xd-tab { display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border: 1px solid #dcdfe6; border-radius: 8px;
    font-size: 14px; color: #4b5563; cursor: pointer; white-space: nowrap; background: #fff; transition: border-color .15s, background .15s;
    i { font-size: 16px; }
    b { min-width: 22px; padding: 0 7px; border-radius: 10px; background: #f0f2f5; color: #606266; font-size: 12px; font-weight: 600; text-align: center; line-height: 20px; }
    small { color: #8a8f99; font-size: 12px; }
    &:hover { border-color: #b3d8ff; color: #409eff; }
    &.on { border-color: #409eff; background: #ecf5ff; color: #409eff; font-weight: 600;
        b { background: #409eff; color: #fff; } small { color: #66b1ff; } } }

/* Channel / Envelope pills, then Sort by + the view switch */
.xd-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; margin-bottom: 16px; }
/* a label and its pills wrap as one */
.xd-fgroup { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.xd-filter-label { font-size: 14px; font-weight: 600; color: #303133; }
.xd-pills { display: inline-flex; flex-wrap: wrap; gap: 8px; }
.xd-pill { display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 14px; border: 1px solid #dcdfe6; border-radius: 6px;
    background: #fff; font-size: 13px; color: #4b5563; cursor: pointer; white-space: nowrap; user-select: none; transition: border-color .15s, background .15s;
    b { min-width: 22px; padding: 0 6px; border-radius: 10px; background: #f0f2f5; color: #606266; font-size: 12px; font-weight: 500; text-align: center; line-height: 20px; }
    &:hover { border-color: #b3d8ff; color: #409eff; }
    &.on { border-color: #409eff; background: #ecf5ff; color: #409eff; font-weight: 600;
        b { background: #d9ecff; color: #409eff; } } }
.xd-vsep { width: 1px; height: 24px; margin: 0 6px; background: #dcdfe6; }
.xd-sort-label { font-size: 13px; color: #606266; white-space: nowrap; }
.xd-sort { width: 170px;
    ::v-deep .el-input__inner { height: 36px; line-height: 36px; border-radius: 8px; } }
.xd-sort-ico { line-height: 36px; margin-left: 4px; color: #606266; }
.xd-views { display: inline-flex; border: 1px solid #dcdfe6; border-radius: 8px; overflow: hidden; background: #fff; }
.xd-view { padding: 9px 11px; font-size: 15px; color: #909399; cursor: pointer; line-height: 1;
    & + & { border-left: 1px solid #dcdfe6; }
    &:hover { color: #409eff; }
    &.on { background: #409eff; color: #fff; } }
.xd-body { min-height: 140px; }
.xd-warnbar { margin-bottom: 12px; padding: 8px 12px; border-radius: 6px; background: #fdf6ec; color: #b88200; font-size: 13px; }

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
/* the listing's own SKU reads as plain text beside the Zoho chip */
.xd-sku:not(.xd-sku-zoho) { padding-left: 0; background: transparent; color: #4b5563; }
.xd-count { padding: 0 8px; border-radius: 10px; background: #409eff; color: #fff; font-size: 12px; line-height: 20px; white-space: nowrap; }
.xd-units { font-size: 12px; color: #606266; white-space: nowrap; }
.xd-dim { font-size: 12px; color: #909399; }
.xd-process { padding: 5px 10px; }
/* processed: the tracking number scanned for the order */
.xd-tracked { padding: 0 6px; border-radius: 3px; font-size: 11px; line-height: 17px; color: #fff; background: #67c23a; white-space: nowrap; }
/* on a pick list, no tracking number yet */
.xd-todo { padding: 0 6px; border-radius: 3px; font-size: 11px; line-height: 17px; color: #b88200; background: #fdf6ec; white-space: nowrap; }
.xd-loc { font-size: 11px; color: #606266; white-space: nowrap; }
/* Neto refused the Confirm dispatch update */
.xd-failed { padding: 0 6px; border-radius: 3px; font-size: 11px; line-height: 17px; color: #f56c6c; background: #fef0f0; white-space: nowrap; }
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
/* the Process popup's order line: channel · customer · placed */
.xd-o-2 { display: flex; align-items: center; gap: 6px; margin-top: 2px; font-size: 12px; }
/* the envelope an order ships in — the reasons on hover */
.xd-env { display: inline-flex; align-items: center; gap: 3px; padding: 0 6px; border-radius: 3px; border: 1px solid transparent;
    font-size: 11px; font-weight: 600; line-height: 17px; white-space: nowrap; cursor: default;
    i { font-size: 12px; }
    &.xd-env-small { color: #529b2e; background: #f0f9eb; border-color: #e1f3d8; }
    &.xd-env-medium { color: #b88200; background: #fdf6ec; border-color: #faecd8; }
    &.xd-env-large { color: #c45656; background: #fef0f0; border-color: #fde2e2; }
    &.xd-env-other { color: #6b4fbb; background: #f4f0ff; border-color: #e4dcfb; } }
.xd-o-cust { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #606266; }
.xd-o-when { font-size: 12px; color: #909399; white-space: nowrap; }
.xd-o-qty { font-weight: 600; color: #303133; white-space: nowrap; }

/* ───────── Grid ───────── */
.xd-masonry { display: flex; align-items: flex-start; gap: 16px; }
.xd-mcol { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.xd-tile { display: flex; flex-direction: column; border: 1px solid #ebeef5; border-radius: 12px; background: #fff; overflow: hidden;
    box-shadow: 0 1px 2px rgba(16, 24, 40, .04); transition: box-shadow .15s, border-color .15s;
    &:hover { border-color: #d9ecff; box-shadow: 0 4px 14px rgba(16, 24, 40, .08); } }
.xd-tile .xd-thumb { width: 56px; height: 56px; border-radius: 8px; }
.xd-tile .xd-thumb-sm { width: 40px; height: 40px; border-radius: 6px; }
.xd-tile-top { display: flex; align-items: flex-start; gap: 12px; padding: 14px 14px 12px; }
.xd-tile-info { flex: 1; min-width: 0; }
.xd-tile-name { font-size: 14px; font-weight: 600; color: #1f2329; line-height: 1.4; word-break: normal;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
/* units to pick · orders · Process */
.xd-tile-stats { display: flex; align-items: stretch; gap: 12px; padding: 0 14px 14px; }
.xd-stat-pick { display: flex; flex-direction: column; justify-content: center; min-width: 96px; padding: 6px 12px; border-radius: 8px; background: #f0f9eb;
    b { font-size: 24px; font-weight: 700; color: #3e8e1f; line-height: 1.1; }
    span { font-size: 12px; color: #606266; white-space: nowrap; } }
.xd-stat-orders { display: flex; flex-direction: column; justify-content: center; padding: 0 4px;
    b { font-size: 18px; font-weight: 700; color: #1f2329; line-height: 1.2; }
    span { font-size: 12px; color: #8a8f99; } }
.xd-process-btn { margin-left: auto; align-self: center; padding: 10px 16px; border-radius: 8px; font-weight: 600; }
.xd-olist { border-top: 1px solid #f2f3f5; }
.xd-o { display: flex; align-items: center; gap: 8px; padding: 8px 14px; font-size: 13px;
    & + & { border-top: 1px solid #f2f3f5; } }
.xd-o-main { flex: 1; min-width: 0; }
.xd-o-id { font-size: 13px; font-weight: 600; color: #1f2329; }
.xd-o-id-lg { font-size: 15px; }
.xd-o-meta { margin-top: 2px; font-size: 12px; color: #8a8f99; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.xd-o .xd-o-qty { min-width: 28px; text-align: right; }
.xd-more { padding: 10px 14px; border-top: 1px solid #f2f3f5; font-size: 13px; color: #409eff; text-align: center; cursor: pointer;
    &:hover { background: #f5f7fa; } }
/* one-order tiles */
.xd-tile-head { display: flex; align-items: flex-start; gap: 8px; padding: 14px 14px 10px; }
.xd-tile-sub { display: flex; align-items: center; gap: 6px; padding: 0 14px 10px; }
.xd-tile-foot { display: flex; align-items: center; gap: 8px; padding: 10px 14px 12px; border-top: 1px solid #f2f3f5; }
.xd-foot-n { font-size: 12px; color: #8a8f99; }
.xd-ilist { padding: 2px 14px 8px; border-top: 1px solid #f2f3f5; }
.xd-i { display: flex; align-items: center; gap: 10px; padding: 6px 0;
    & + & { border-top: 1px solid #f2f3f5; } }
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
.xd-row { display: grid; grid-template-columns: 150px 120px minmax(0, 1fr) 60px 82px 90px 90px; align-items: center; gap: 8px;
    padding: 6px 12px 6px 34px; font-size: 13px; color: #303133;
    & + & { border-top: 1px dashed #f0f2f5; } }
.xd-row-noqty { grid-template-columns: 150px 120px minmax(0, 1fr) 90px 90px; }
.xd-row .xd-o-qty { text-align: right; }
.xd-st { text-align: right; }
.xd-ilist-list { padding-left: 34px; border-top: 1px solid #ebeef5; }

.xd-empty { padding: 50px 0; text-align: center; color: #909399; font-size: 13px;
    i { display: block; font-size: 36px; color: #c0c4cc; margin-bottom: 8px; } }

@media (max-width: 600px) {
    .xd { padding: 14px 16px; }
    .xd-title { font-size: 22px; }
    .xd-search-box { flex: 1 1 100%; }
    .xd-kbd { display: none; }
    .xd-vsep { display: none; }
    .xd-filter-label { width: 100%; }
    .xd-tab-label { max-width: 110px; overflow: hidden; text-overflow: ellipsis; }
    .xd-row, .xd-row-noqty { grid-template-columns: minmax(0, 1fr) auto; padding-left: 12px; row-gap: 2px; }
    .xd-ilist-list { padding-left: 12px; }
    .xd-pr { flex-wrap: wrap; }
    .xd-pr-input { width: 100%; }
}
</style>
