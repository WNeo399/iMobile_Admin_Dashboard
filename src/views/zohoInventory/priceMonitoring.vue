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
                    <template slot-scope="s">
                        <!-- Row edit: all four prices of this product at once
                             (✓ in the action column pushes the changed ones). -->
                        <div v-if="rowEdit.itemId === s.row.itemId && !pushing[pushKey(s.row, c)]"
                            class="pm-edit-wrap" @click.stop>
                            <el-input-number v-model="rowEdit.values[c.list]" size="mini" :min="0" :precision="2"
                                :controls="false" :class="['pm-input', { changed: rowChanged(c) }]"
                                @keyup.enter.native="rowEnter" @keyup.esc.native="cancelRowEdit" />
                            <div v-if="refPrice(s.row, c) != null" class="pm-ref pm-ref-use"
                                title="Use the formula price" @click="rowUseRef(c)">
                                ref {{ money(refPrice(s.row, c)) }} <i class="el-icon-document-copy" />
                            </div>
                        </div>
                        <div v-else-if="pEdit.itemId === s.row.itemId && pEdit.list === c.list" class="pm-edit-wrap" @click.stop>
                            <div class="pm-edit">
                                <el-input-number v-model="pEdit.value" size="mini" :min="0" :precision="2"
                                    :controls="false" class="pm-input"
                                    @keyup.enter.native="priceEnter($event, s.row)" />
                                <!-- Timing matters (same as the reorder editor):
                                     the number input commits on blur/enter, so
                                     SAVE runs on click (after the blur) and
                                     CANCEL on mousedown (before a re-render can
                                     swallow the click). -->
                                <el-button type="text" size="mini" icon="el-icon-check" class="pm-save"
                                    @click="savePriceEdit(s.row)" />
                                <el-button type="text" size="mini" icon="el-icon-close" class="pm-cancel"
                                    @mousedown.native.prevent="cancelPriceEdit" />
                            </div>
                            <!-- The formula's target, right where the
                                 correction is being typed — click to copy it
                                 into the input. A click (not mousedown), so
                                 the input's blur commits first and can't
                                 overwrite the copied value. -->
                            <div v-if="refPrice(s.row, c) != null" class="pm-ref pm-ref-use"
                                title="Use the formula price" @click="useRefPrice(s.row, c)">
                                ref {{ money(refPrice(s.row, c)) }} <i class="el-icon-document-copy" />
                            </div>
                        </div>
                        <!-- Being pushed (Push all in progress): the cell locks. -->
                        <div v-else-if="pushing[pushKey(s.row, c)]" class="pm-view">
                            <div class="pm-val">
                                <span>{{ money(pushing[pushKey(s.row, c)].rate) }}</span>
                            </div>
                            <div class="pm-pushing">
                                <i class="el-icon-loading" /> pushing to Zoho…
                            </div>
                        </div>
                        <!-- Queued: the new rate waits in the loading zone until
                             it is pushed. Click to change it, × to drop it. -->
                        <!-- mousedown, not click: the ✓ that queued the value re-renders
                             this cell before its click finishes bubbling, and a click
                             handler here would reopen the editor at once. -->
                        <div v-else-if="queue[pushKey(s.row, c)]" :class="['pm-view', canEditPrices ? 'pm-editable' : '']"
                            title="Queued for Zoho — click to change"
                            @mousedown="canEditPrices && startPriceEdit(s.row, c, queue[pushKey(s.row, c)].rate)">
                            <div class="pm-val">
                                <span class="pm-queued-val">{{ money(queue[pushKey(s.row, c)].rate) }}</span>
                                <i v-if="canEditPrices" class="el-icon-close pm-queued-x" title="Remove from the queue"
                                    @mousedown.stop @click.stop="dequeue(pushKey(s.row, c))" />
                            </div>
                            <div class="pm-queued">
                                <span v-if="queue[pushKey(s.row, c)].error" class="pm-queued-err">
                                    <i class="el-icon-warning" /> {{ queue[pushKey(s.row, c)].error }}</span>
                                <template v-else><i class="el-icon-upload2" /> was {{ money(queue[pushKey(s.row, c)].from) }}</template>
                            </div>
                        </div>
                        <div v-else :class="['pm-view', canEditPrices ? 'pm-editable' : '']"
                            :title="cellTitle(s.row, c)"
                            @click="canEditPrices && startPriceEdit(s.row, c)">
                            <div class="pm-val">
                                <span :class="priceClass(s.row, s.row[c.prop])">{{ money(s.row[c.prop]) }}</span>
                                <i v-if="canEditPrices" class="el-icon-edit pm-pencil" />
                            </div>
                            <!-- Off-formula rows carry the formula's reference
                                 under each rate, with the signed deviation on
                                 the cells that breach the ±5% band: red =
                                 under formula (margin lost), amber = over. -->
                            <div v-if="s.row.priceRuleBroken && refPrice(s.row, c) != null"
                                :class="['pm-ref', refDevClass(s.row, c), { 'pm-ref-click': canEditPrices }]"
                                :title="canEditPrices ? 'Edit with the formula price filled in' : ''"
                                @click.stop="canEditPrices && startPriceEdit(s.row, c, refPrice(s.row, c))">
                                ref {{ money(refPrice(s.row, c)) }}<span v-if="refDevText(s.row, c)"
                                    class="pm-ref-dev">&nbsp;{{ refDevText(s.row, c) }}</span>
                            </div>
                        </div>
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

        <!-- ── The loading zone ─────────────────────────────────────
             Price edits wait here and go to Zoho together: the server
             writes them one call at a time, because Zoho refuses more
             than a handful of simultaneous pricebook writes. Sticks to
             the bottom of the window, so the push is always in reach;
             "Review changes" opens the list. -->
        <div v-if="queueCount || pushingAll" :class="['pm-zone', { pushing: pushingAll }]">
            <div class="pm-zone-bar">
                <template v-if="pushingAll">
                    <i class="el-icon-loading pm-zone-icon" />
                    <span class="pm-zone-text">Pushing to Zoho… <b>{{ pushProgress.done }}</b> of {{ pushProgress.total }}
                        <span v-if="pushProgress.failed" class="pm-zone-bad">· {{ pushProgress.failed }} refused</span></span>
                    <el-progress :percentage="pushPercent" :show-text="false" :stroke-width="6" class="pm-zone-progress"
                        :status="pushProgress.failed ? 'exception' : undefined" />
                    <div class="sd-spacer" />
                    <span class="sd-dim">the cells being written are locked meanwhile</span>
                </template>
                <template v-else>
                    <i class="el-icon-upload2 pm-zone-icon" />
                    <span class="pm-zone-text"><b>{{ queueCount }}</b> price {{ queueCount === 1 ? 'change' : 'changes' }}
                        on <b>{{ queueGroups.length }}</b> {{ queueGroups.length === 1 ? 'product' : 'products' }} waiting for Zoho
                        <span v-if="queueErrors" class="pm-zone-bad">· {{ queueErrors }} refused on the last push</span></span>
                    <div class="sd-spacer" />
                    <el-button size="small" plain icon="el-icon-tickets" @click="reviewVisible = true">Review changes</el-button>
                    <el-button size="small" plain @click="confirmClear">Discard all</el-button>
                    <el-button size="small" type="primary" icon="el-icon-upload2" @click="pushAll">
                        {{ queueCount === 1 ? 'Push it to Zoho' : `Push all ${queueCount} to Zoho` }}
                    </el-button>
                </template>
            </div>
        </div>

        <!-- Review: everything queued, one row per product, a chip per price
             list (old → new, the change in %). A chip's × drops that change,
             the bin the product's; clicking a chip reopens the cell. -->
        <el-dialog title="Price changes waiting for Zoho" :visible.sync="reviewVisible" width="860px" append-to-body top="6vh">
            <div class="pm-review-list">
                <div v-for="g in queueGroups" :key="g.itemId" class="pm-zone-row">
                    <div class="pm-zone-item">
                        <div class="pm-zone-name" :title="g.name">{{ g.name }}</div>
                        <div class="sd-dim">{{ g.sku || '—' }}</div>
                    </div>
                    <div class="pm-zone-chips">
                        <div v-for="q in g.changes" :key="q.key" :class="['pm-chip', { err: q.error }]"
                            :title="q.error ? q.error : 'Click to change'" @click="editQueued(q)">
                            <span class="pm-chip-list">{{ q.label }}</span>
                            <span class="pm-chip-from">{{ money(q.from) }}</span>
                            <i class="el-icon-right" />
                            <b class="pm-chip-to">{{ money(q.rate) }}</b>
                            <span v-if="deltaText(q)" :class="['pm-chip-delta', deltaClass(q)]">{{ deltaText(q) }}</span>
                            <i class="el-icon-close pm-chip-x" title="Remove this change" @click.stop="dequeue(q.key)" />
                        </div>
                        <div v-for="q in g.changes.filter(x => x.error)" :key="q.key + ':err'" class="pm-zone-err">
                            <i class="el-icon-warning" /> {{ q.label }}: {{ q.error }}
                        </div>
                    </div>
                    <el-tooltip content="Remove this product's changes" placement="top">
                        <el-button type="text" size="mini" icon="el-icon-delete" class="pm-zone-drop"
                            @click="dequeueItem(g.itemId)" />
                    </el-tooltip>
                </div>
                <div v-if="!queueGroups.length" class="pm-review-empty">Nothing queued.</div>
            </div>
            <span slot="footer">
                <span class="pm-review-sum">{{ queueCount }} {{ queueCount === 1 ? 'change' : 'changes' }} on
                    {{ queueGroups.length }} {{ queueGroups.length === 1 ? 'product' : 'products' }}</span>
                <el-button size="small" plain :disabled="!queueCount" @click="confirmClear">Discard all</el-button>
                <el-button size="small" @click="reviewVisible = false">Close</el-button>
                <el-button size="small" type="primary" icon="el-icon-upload2" :disabled="!queueCount" @click="pushAll">
                    {{ queueCount === 1 ? 'Push it to Zoho' : `Push all ${queueCount} to Zoho` }}
                </el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import auth from '@/plugins/auth'
import ProductThumb from '@/components/ProductThumb'
import liveStockMixin from './liveStockMixin'
import { getStockSummary, getStockItems, getStockItemPrices, setStockItemArchived, pushStockItemPrices } from '@/api/stockMonitor'

const TILES = [
    { key: 'all', label: 'All Items', tone: 'ok', tag: 'info', note: 'matching the filters' },
    // Missing + placeholder merged: both mean "not really priced". The
    // list shows truly-missing rows first, placeholder rows below.
    { key: 'priceUnpriced', label: 'Missing Price', tone: 'bad', tag: 'danger', note: 'no rate, or a placeholder rate' },
    { key: 'priceBelowCost', label: 'Below Cost', tone: 'bad', tag: 'danger', note: 'a sell rate under the purchase price' },
    { key: 'priceOrderBroken', label: 'Wrong Order', tone: 'warn', tag: 'warning', note: 'tiers out of order' },
    { key: 'priceRuleBroken', label: 'Off Formula', tone: 'warn', tag: 'warning', note: 'cost-priced, >5% off the pricing rule' }
]
const PRICE_COLS = [
    { prop: 'pricePlatinum', label: 'Platinum', list: 'platinum' },
    { prop: 'priceVip', label: 'VIP', list: 'vip' },
    { prop: 'priceSvip', label: 'SVIP', list: 'svip' },
    { prop: 'priceWholesale', label: 'WholeSale', list: 'wholesale' }
]
// The purchase price (the Zoho item's purchase rate) is edited like the four
// price lists but saved straight away — one quick item call — instead of
// waiting in the loading zone with them (user asks 2026-09-24).
const PURCHASE_COL = { prop: 'purchasePrice', label: 'Purchase', list: 'purchase' }
const EDIT_COLS = [PURCHASE_COL, ...PRICE_COLS]
const PLACEHOLDERS = new Set([9999.99, 9000, 8888, 7777, 7000, 6000])
// Changes per request when pushing: the server makes at most one Zoho call
// per price list for each, so the progress moves every few seconds.
const PUSH_CHUNK = 20

export default {
    name: 'PriceMonitoring',
    components: { ProductThumb },
    mixins: [liveStockMixin],
    data() {
        return {
            TILES,
            PRICE_COLS,
            EDIT_COLS,
            loading: false,
            summaryLoading: false,
            exporting: false,

            snapshotDate: null,
            run: null,
            counts: {},
            options: { categories: [], collections: [], vendors: [] },

            rows: [],
            total: 0,
            // Inline price edit — one cell being typed into at a time.
            pEdit: { itemId: null, list: '', prop: '', value: 0 },
            // Cells locked while "Push all" is running, keyed `${itemId}|${list}` → { rate }.
            pushing: {},
            // The loading zone: edits waiting to go to Zoho together, keyed
            // `${itemId}|${list}` → { key, itemId, sku, name, list, prop, label,
            // rate, from, error }. Kept in localStorage so a reload keeps them.
            queue: {},
            pushingAll: false,
            // How far the chunked push has got (drives the progress bar).
            pushProgress: { done: 0, total: 0, failed: 0 },
            // The review dialog (the queued changes, product by product).
            reviewVisible: false,
            // Row edit: one product's four prices edited in its table row.
            rowEdit: { itemId: null, row: null, values: {} },
            query: {
                filter: 'all',
                search: '', category: '', collection: '', vendor: '',
                sort: 'units90', order: 'desc', page: 1, pageSize: 50
            }
        }
    },
    computed: {
        canEditPrices() {
            return auth.hasPermi('zoho:stock:edit')
        },
        // The zone's list: one row per product, its changes in tier order.
        queueGroups() {
            const order = EDIT_COLS.map(c => c.list)
            const groups = new Map()
            for (const q of Object.values(this.queue)) {
                let g = groups.get(q.itemId)
                if (!g) { g = { itemId: q.itemId, name: q.name, sku: q.sku, changes: [] }; groups.set(q.itemId, g) }
                g.changes.push(q)
            }
            for (const g of groups.values()) g.changes.sort((a, b) => order.indexOf(a.list) - order.indexOf(b.list))
            return [...groups.values()]
        },
        pushPercent() {
            return this.pushProgress.total ? Math.round((this.pushProgress.done / this.pushProgress.total) * 100) : 0
        },
        queueCount() { return Object.keys(this.queue).length },
        queueErrors() { return Object.values(this.queue).filter(q => q.error).length },
        // Price lists whose new value differs from the current one (and that
        // aren't already mid-push) — what ✓ will send.
        rowChanges() {
            const row = this.rowEdit.row
            if (!row) return []
            return EDIT_COLS
                .filter(c => this.rowChanged(c) && !this.pushing[this.pushKey(row, c)])
                .map(c => ({ col: c, rate: Math.round(Number(this.rowEdit.values[c.list]) * 100) / 100 }))
        },
        // Advisory checks on the prices as they would stand after the push:
        // the tier order (SVIP & WholeSale ≤ VIP ≤ Platinum; SVIP vs WholeSale
        // unordered) and nothing below cost. Placeholders are skipped.
        rowWarnings() {
            const row = this.rowEdit.row
            if (!row) return []
            const next = {}
            for (const c of PRICE_COLS) {
                const v = this.rowEdit.values[c.list]
                next[c.list] = v != null && Number.isFinite(Number(v)) ? Number(v) : row[c.prop]
            }
            const real = v => (v == null || PLACEHOLDERS.has(Number(v)) ? null : Number(v))
            const label = { platinum: 'Platinum', vip: 'VIP', svip: 'SVIP', wholesale: 'WholeSale' }
            const out = []
            for (const [lo, hi] of [['svip', 'vip'], ['wholesale', 'vip'], ['vip', 'platinum'], ['svip', 'platinum'], ['wholesale', 'platinum']]) {
                const a = real(next[lo]), b = real(next[hi])
                if (a != null && b != null && a > b + 1e-9) out.push(`${label[lo]} ${this.money(a)} is above ${label[hi]} ${this.money(b)}`)
            }
            // the purchase price as typed, when it is being edited too
            const typedCost = this.rowEdit.values.purchase
            const cost = typedCost != null && Number.isFinite(Number(typedCost)) ? Number(typedCost) : Number(row.purchasePrice)
            if (cost > 0) {
                for (const c of PRICE_COLS) {
                    const v = real(next[c.list])
                    if (v != null && v < cost) out.push(`${c.label} ${this.money(v)} is below the purchase price ${this.money(cost)}`)
                }
            }
            return out
        },
        // What the row edit's ✓ will do: the purchase price is saved now,
        // the price lists join the loading zone.
        rowSubmitLabel() {
            const ch = this.rowChanges
            if (!ch.length) return 'No changes yet'
            const cost = ch.some(c => c.col.list === 'purchase')
            const lists = ch.length - (cost ? 1 : 0)
            return [
                cost ? 'Save the purchase price to Zoho now' : '',
                lists ? `queue ${lists} ${lists === 1 ? 'price' : 'prices'} for Zoho` : ''
            ].filter(Boolean).join(', ')
        },
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
        this.restoreQueue()
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

        // Re-read this item's four rates live from Zoho and swap them into
        // the row (a green "live" tag marks refreshed rows).
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
                this.$set(row, '__live', true)
            } catch (e) {
                this.$message.error(this.msg(e, 'Could not read the live prices'))
            } finally {
                this.$set(row, '__liveLoading', false)
            }
        },

        // ── Inline price edit → push to Zoho ──
        pushKey(row, col) {
            return `${row.itemId}|${col.list}`
        },
        // `prefill` opens the editor with that value instead of the current rate.
        startPriceEdit(row, col, prefill) {
            if (this.pushing[this.pushKey(row, col)]) return
            this.pEdit = {
                itemId: row.itemId, list: col.list, prop: col.prop,
                value: prefill != null ? prefill : row[col.prop] == null ? 0 : Number(row[col.prop])
            }
        },
        useRefPrice(row, col) {
            const ref = this.refPrice(row, col)
            if (ref == null) return
            this.pEdit.value = ref
            // Back into the input so Enter still saves.
            this.$nextTick(() => {
                const input = document.querySelector('.pm-edit-wrap .pm-input input')
                if (input) input.focus()
            })
        },
        cancelPriceEdit() {
            this.pEdit = { itemId: null, list: '', prop: '', value: 0 }
        },
        // Enter: blur first so el-input-number commits, then save.
        priceEnter(evt, row) {
            if (evt && evt.target) evt.target.blur()
            this.$nextTick(() => this.savePriceEdit(row))
        },
        savePriceEdit(row) {
            if (this.pEdit.itemId !== row.itemId) return
            const { list, value } = this.pEdit
            const rate = Math.round(Number(value) * 100) / 100
            if (!Number.isFinite(rate) || rate < 0) {
                this.$message.error('Enter a valid price')
                return
            }
            this.cancelPriceEdit()
            // The purchase price goes to Zoho now; a price list joins the
            // loading zone and leaves with the next "Push all".
            if (list === 'purchase') { this.savePurchase(row, rate); return }
            const col = EDIT_COLS.find(c => c.list === list)
            this.enqueue(row, col, rate)
        },
        // One purchase price straight to Zoho (the item's purchase rate — a
        // single quick call, so no queue). The cell locks while it is on its
        // way; the row then takes the new cost and everything computed from
        // it (below-cost flag, formula rule and reference prices).
        async savePurchase(row, rate) {
            const key = this.pushKey(row, PURCHASE_COL)
            if (this.pushing[key]) return
            const from = row.purchasePrice == null ? null : Number(row.purchasePrice)
            if (from != null && Math.round(from * 100) === Math.round(rate * 100)) return
            // A purchase change left queued by an earlier version goes now.
            if (this.queue[key]) this.dequeue(key)
            this.$set(this.pushing, key, { rate })
            try {
                const r = await pushStockItemPrices([{ itemId: row.itemId, list: 'purchase', rate }])
                const res = r && Array.isArray(r.results) ? r.results[0] : null
                if (!r || r.success === false || !res) throw new Error((r && r.message) || 'No answer from the server')
                if (!res.ok) throw new Error(res.message || 'Zoho refused the purchase price')
                this.$set(row, 'purchasePrice', res.rate)
                if (res.flags && !(res.flagsSeq < (row.__flagsSeq || 0))) {
                    for (const k of Object.keys(res.flags)) this.$set(row, k, res.flags[k])
                    row.__flagsSeq = res.flagsSeq || 0
                }
                this.$message.success(`${row.sku || row.name}: purchase price ${this.money(res.rate)} saved to Zoho`)
            } catch (e) {
                this.$message.error(`${row.sku || row.name}: ${this.msg(e, 'could not save the purchase price')}`)
            } finally {
                this.$delete(this.pushing, key)
            }
        },
        // ── The loading zone ──
        // Same product + price list replaces the earlier entry. A change back
        // to the current rate simply drops the entry.
        enqueue(row, col, rate) {
            const key = this.pushKey(row, col)
            if (this.pushing[key]) { this.$message.warning('That price is being pushed right now — try again in a moment'); return }
            const from = row[col.prop] == null ? null : Number(row[col.prop])
            if (from != null && Math.round(from * 100) === Math.round(rate * 100)) { this.dequeue(key); return }
            this.$set(this.queue, key, {
                key, itemId: row.itemId, sku: row.sku || '', name: row.name || '',
                list: col.list, prop: col.prop, label: col.label, rate, from, error: ''
            })
            this.saveQueue()
        },
        // Drop every change of one product.
        dequeueItem(itemId) {
            for (const k of Object.keys(this.queue)) if (this.queue[k].itemId === itemId) this.$delete(this.queue, k)
            this.saveQueue()
            if (!this.queueCount) this.reviewVisible = false
        },
        // A chip opens the cell's editor when the row is on this page.
        editQueued(q) {
            const row = this.rows.find(r => r.itemId === q.itemId)
            const col = EDIT_COLS.find(c => c.list === q.list)
            if (!row || !col) { this.$message.info('That product is not on this page — search for it to change the price'); return }
            this.reviewVisible = false
            this.startPriceEdit(row, col, q.rate)
            const el = this.$el.querySelector(`[data-item="${q.itemId}"]`)
            if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        },
        // The change as a percentage of the current rate ("+2.4%").
        deltaText(q) {
            if (q.from == null || !(Number(q.from) > 0)) return ''
            const pct = ((Number(q.rate) - Number(q.from)) / Number(q.from)) * 100
            if (Math.abs(pct) < 0.05) return ''
            return `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`
        },
        deltaClass(q) {
            return q.from != null && Number(q.rate) < Number(q.from) ? 'down' : 'up'
        },
        confirmClear() {
            const n = this.queueCount
            this.$confirm(`Discard ${n === 1 ? 'the queued price change' : `all ${n} queued price changes`}? Nothing has been sent to Zoho.`,
                'Discard changes', { type: 'warning', confirmButtonText: 'Discard', cancelButtonText: 'Keep' })
                .then(() => { this.clearQueue(); this.reviewVisible = false })
                .catch(() => {})
        },
        dequeue(key) {
            this.$delete(this.queue, key)
            this.saveQueue()
            if (!this.queueCount) this.reviewVisible = false
        },
        clearQueue() {
            this.queue = {}
            this.saveQueue()
        },
        saveQueue() {
            try { localStorage.setItem('pm-price-queue', JSON.stringify(this.queue)) } catch (e) { /* storage unavailable — the queue still works for this page */ }
        },
        restoreQueue() {
            try {
                const q = JSON.parse(localStorage.getItem('pm-price-queue') || '{}')
                if (q && typeof q === 'object' && !Array.isArray(q)) this.queue = q
            } catch (e) { this.queue = {} }
        },
        // Everything queued goes to Zoho in requests of PUSH_CHUNK changes,
        // one after the other; the server writes each request one Zoho call
        // at a time. Rows on screen take the new rates and flags as each
        // request comes back; whatever Zoho refused stays queued with its
        // reason, and the review dialog opens on it.
        async pushAll() {
            const items = Object.values(this.queue)
            if (!items.length || this.pushingAll) return
            this.pushingAll = true
            this.reviewVisible = false
            this.pushProgress = { done: 0, total: items.length, failed: 0 }
            for (const q of items) this.$set(this.pushing, q.key, { rate: q.rate })
            let pushed = 0
            let failed = 0
            let interrupted = ''
            try {
                for (let i = 0; i < items.length; i += PUSH_CHUNK) {
                    const chunk = items.slice(i, i + PUSH_CHUNK)
                    const r = await pushStockItemPrices(chunk.map(q => ({ itemId: q.itemId, list: q.list, rate: q.rate })))
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    const answered = new Set()
                    for (const res of r.results || []) {
                        const key = `${res.itemId}|${res.list}`
                        answered.add(key)
                        const q = this.queue[key]
                        if (res.ok) {
                            const target = this.rows.find(x => x.itemId === res.itemId)
                            if (target) {
                                const col = EDIT_COLS.find(c => c.list === res.list)
                                if (col) this.$set(target, col.prop, res.rate)
                                if (res.flags && !(res.flagsSeq < (target.__flagsSeq || 0))) {
                                    for (const k of Object.keys(res.flags)) this.$set(target, k, res.flags[k])
                                    target.__flagsSeq = res.flagsSeq || 0
                                }
                            }
                            this.$delete(this.queue, key)
                            pushed++
                        } else if (q) {
                            this.$set(q, 'error', res.message || 'not saved')
                            failed++
                        }
                    }
                    // A change the server did not answer for stays queued, flagged.
                    for (const q of chunk) {
                        if (!answered.has(q.key) && this.queue[q.key]) { this.$set(this.queue[q.key], 'error', 'no answer from the server'); failed++ }
                        this.$delete(this.pushing, q.key)
                    }
                    this.pushProgress = { done: Math.min(i + chunk.length, items.length), total: items.length, failed }
                    this.saveQueue()
                }
            } catch (e) {
                interrupted = this.msg(e, 'Push interrupted')
            } finally {
                for (const q of items) this.$delete(this.pushing, q.key)
                this.pushingAll = false
            }
            if (interrupted) {
                this.$message.error(`${interrupted} — ${this.queueCount} ${this.queueCount === 1 ? 'change is' : 'changes are'} still queued`)
            } else if (failed) {
                this.reviewVisible = true
                this.$message.warning(`${pushed} pushed to Zoho, ${failed} refused — still queued, with the reason`)
            } else {
                this.$message.success(`${pushed} price ${pushed === 1 ? 'change' : 'changes'} pushed to Zoho`)
            }
        },
        // ── All four price lists for one product, in its row ──
        openRowEdit(row) {
            if (this.pEdit.itemId === row.itemId) this.cancelPriceEdit()
            const values = {}
            for (const c of EDIT_COLS) values[c.list] = row[c.prop] == null ? undefined : Number(row[c.prop])
            this.rowEdit = { itemId: row.itemId, row, values }
        },
        cancelRowEdit() {
            this.rowEdit = { itemId: null, row: null, values: {} }
        },
        rowChanged(col) {
            const v = this.rowEdit.values[col.list]
            if (v == null || !Number.isFinite(Number(v))) return false
            const cur = this.rowEdit.row[col.prop]
            return cur == null || Math.round(Number(v) * 100) !== Math.round(Number(cur) * 100)
        },
        rowUseRef(col) {
            const ref = this.refPrice(this.rowEdit.row, col)
            if (ref != null && !this.pushing[this.pushKey(this.rowEdit.row, col)]) this.rowEdit.values[col.list] = ref
        },
        rowUseAllRefs() {
            for (const c of PRICE_COLS) this.rowUseRef(c)
        },
        // Enter in any of the row's inputs: blur first so el-input-number
        // commits the typed value, then push.
        rowEnter(evt) {
            if (evt && evt.target) evt.target.blur()
            this.$nextTick(() => this.submitRowEdit())
        },
        submitRowEdit() {
            const row = this.rowEdit.row
            const changes = this.rowChanges
            if (!row || !changes.length) return
            this.cancelRowEdit()
            if (this.pEdit.itemId === row.itemId) this.cancelPriceEdit()
            // The purchase price is saved now; the price lists go into the
            // loading zone and leave with the next "Push all".
            const cost = changes.find(c => c.col.list === 'purchase')
            const lists = changes.filter(c => c.col.list !== 'purchase')
            for (const { col, rate } of lists) this.enqueue(row, col, rate)
            if (lists.length) {
                this.$message.success(`${row.sku || row.name}: ${lists.length} ${lists.length === 1 ? 'price' : 'prices'} queued in the loading zone`)
            }
            if (cost) this.savePurchase(row, cost.rate)
        },
        // The formula's reference rate for a cell (null when the item has
        // no cost price).
        refPrice(row, col) {
            return row.priceExpected && row.priceExpected[col.list] != null
                ? row.priceExpected[col.list]
                : null
        },
        // Signed deviation of the actual rate from the reference; null when
        // either side is unusable (missing / placeholder).
        refDev(row, col) {
            const ref = this.refPrice(row, col)
            const a = Number(row[col.prop])
            if (ref == null || !(ref > 0) || !Number.isFinite(a)) return null
            if (PLACEHOLDERS.has(a)) return null
            return (a - ref) / ref
        },
        refDevClass(row, col) {
            const d = this.refDev(row, col)
            if (d == null || Math.abs(d) <= 0.05) return ''
            return d > 0 ? 'pm-ref-high' : 'pm-ref-low'
        },
        refDevText(row, col) {
            const d = this.refDev(row, col)
            if (d == null || Math.abs(d) <= 0.05) return ''
            return (d > 0 ? '↑' : '↓') + Math.round(Math.abs(d) * 100) + '%'
        },
        // Tooltip on a price cell: the formula's expected value when the
        // item has a cost price, plus the edit hint.
        cellTitle(row, col) {
            const parts = []
            if (row.priceExpected && row.priceExpected[col.list] != null) {
                parts.push(`Formula (${row.priceRule}): $${Number(row.priceExpected[col.list]).toFixed(2)} ±5%`)
            }
            if (this.canEditPrices) parts.push(col.list === 'purchase' ? 'Click to edit the purchase price — saved to Zoho straight away' : 'Click to edit — queued for Zoho')
            return parts.join(' · ')
        },
        priceClass(row, v) {
            if (v == null) return 'sd-dim'
            if (PLACEHOLDERS.has(Number(v))) return 'sd-mono sd-warn'
            if (row.purchasePrice > 0 && Number(v) < row.purchasePrice) return 'sd-mono sd-bad'
            return 'sd-mono'
        },
        money(v) {
            if (v == null || v === '') return '—'
            return '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

/* Inline price editor */
.pm-view { display: flex; flex-direction: column; align-items: center; line-height: 1.4; }
/* The hover pencil floats beside the value instead of occupying layout
   space, so the price text itself sits dead centre. */
.pm-val { position: relative; display: inline-flex; align-items: center; }
.pm-ref {
    font-size: 11px; color: #c0c4cc; white-space: nowrap;
    font-variant-numeric: tabular-nums;
    &.pm-ref-high { color: #e6a23c; }
    &.pm-ref-low { color: #f56c6c; }
    .pm-ref-dev { font-weight: 600; }
}
.pm-editable { cursor: pointer; }
.pm-pencil {
    position: absolute; right: -16px; top: 50%; transform: translateY(-50%);
    font-size: 11px; color: #c0c4cc; opacity: 0; transition: opacity .15s;
}
.pm-editable:hover .pm-pencil { opacity: 1; color: #409eff; }
.pm-edit-wrap { display: flex; flex-direction: column; align-items: center; gap: 2px; }
/* Clickable reference price: in the editor it copies into the input; on an
   off-formula cell it opens the editor pre-filled. */
.pm-ref-use { cursor: pointer; color: #409eff; &:hover { text-decoration: underline; } }

/* Row edit: a value that will be pushed, and the row's advisory warnings. */
.pm-input.changed ::v-deep .el-input__inner { border-color: #409eff; background: #ecf5ff; }
.pm-row-warn { font-size: 11px; color: #e6a23c; line-height: 1.4; margin-top: 2px; }
.pm-ref-click { cursor: pointer; &:hover { text-decoration: underline; } }
.pm-edit { display: inline-flex; align-items: center; gap: 2px; }
.pm-pushing { font-size: 11px; color: #e6a23c; white-space: nowrap; }
/* Queued cells */
.pm-queued { font-size: 11px; color: #e6a23c; white-space: nowrap; }
.pm-queued-val { color: #e6a23c; font-weight: 600; }
.pm-queued-x { margin-left: 4px; color: #c0c4cc; cursor: pointer; }
.pm-queued-x:hover { color: #f56c6c; }
.pm-queued-err { color: #f56c6c; }
.pm-input { width: 90px; }
.pm-input ::v-deep .el-input__inner { padding: 0 6px; text-align: right; }
.pm-save { color: #67c23a; padding: 2px; }
.pm-cancel { color: #909399; padding: 2px; }

/* Stock read live from Zoho for the rows on screen */
.sd-card { background: #fff; border: 1px solid #e6ebf5; border-radius: 4px; overflow: hidden; }
.sd-card-head {
    display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-bottom: 1px solid #ebeef5;
}
.sd-card-title { font-size: 13px; font-weight: 600; color: #303133; }
.sd-pager { padding: 12px 14px; text-align: right; }

/* The loading zone: sticks to the bottom of the window while the list
   scrolls, in its normal place once the page end is reached. */
.pm-zone {
    /* the right margin keeps the Push button clear of the floating AI Agent button */
    position: sticky; bottom: 12px; z-index: 5; margin: 12px 72px 0 0;
    background: #fff; border: 1px solid #f5dab1; border-radius: 8px; overflow: hidden;
    box-shadow: 0 6px 24px rgba(0, 0, 0, .12);
    &.pushing { border-color: #b3d8ff; }
}
.pm-zone-bar {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px;
    background: #fdf6ec; font-size: 13px; color: #606266;
    .pm-zone.pushing & { background: #ecf5ff; }
}
.pm-zone-icon { font-size: 18px; color: #e6a23c; .pm-zone.pushing & { color: #409eff; } }
.pm-zone-text b { color: #303133; }
.pm-zone-bad { color: #f56c6c; }
.pm-zone-progress { width: 320px; margin-left: 6px; }
.pm-review-list { max-height: 60vh; overflow: auto; margin: -10px 0; }
.pm-review-empty { padding: 24px; text-align: center; color: #909399; font-size: 13px; }
.pm-review-sum { float: left; line-height: 32px; font-size: 13px; color: #909399; }
.pm-zone-row {
    display: flex; align-items: flex-start; gap: 12px; padding: 8px 4px; border-bottom: 1px solid #f2f6fc;
    &:last-child { border-bottom: 0; }
    &:hover { background: #fafafa; }
}
.pm-zone-item { flex: 0 0 300px; min-width: 0; line-height: 1.35; }
.pm-zone-name { font-size: 12px; color: #303133; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pm-zone-chips { flex: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.pm-chip {
    display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 14px;
    border: 1px solid #f5dab1; background: #fdf6ec; font-size: 12px; cursor: pointer;
    font-variant-numeric: tabular-nums; line-height: 1.4;
    &:hover { border-color: #e6a23c; }
    &.err { border-color: #fbc4c4; background: #fef0f0; }
    .el-icon-right { color: #c0c4cc; font-size: 11px; }
}
.pm-chip-list { color: #909399; font-size: 11px; font-weight: 600; }
.pm-chip-from { color: #909399; text-decoration: line-through; }
.pm-chip-to { color: #303133; }
.pm-chip-delta { font-size: 11px; &.up { color: #67c23a; } &.down { color: #e6a23c; } }
.pm-chip-x { color: #c0c4cc; margin-left: 2px; &:hover { color: #f56c6c; } }
.pm-zone-err { flex-basis: 100%; font-size: 11px; color: #f56c6c; }
.pm-zone-drop { color: #c0c4cc; padding: 4px; margin-top: 2px; &:hover { color: #f56c6c; } }
</style>
