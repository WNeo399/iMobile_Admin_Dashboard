<template>
    <!-- The spare-parts stock table — one look for Stock Monitoring's
         Dashboard and its 海运, Browse and Collections lists (user ask
         2026-09-24): product, stock, units sold in a picked window, open
         purchase lines by stage (a PO raised or changed in the cell), last
         sold, and the row actions. Rows come in two shapes — the
         dashboard's (itemId / name / available / units30 …) and the lists'
         (id / productName / stock / sales[30] …); the accessors below read
         either. Sorting is the parent's job: the table says what was asked
         for (sort-change { prop, order: 'asc' | 'desc' }). -->
    <div class="sit">
        <el-table ref="table" :data="rows" v-loading="loading" size="mini" border :row-key="idOf"
            :empty-text="emptyText"
            @sort-change="onTableSort" @selection-change="sel => $emit('selection-change', sel)">
            <el-table-column v-if="selectable" type="selection" width="40" align="center" :reserve-selection="true" />

            <!-- SKU, product and shelf in one column. The column's own
                 sort arrows would only cover one field, so the header
                 carries SKU / Shelf sort links instead. -->
            <el-table-column prop="name" label="Product" min-width="380">
                <template #header>
                    <div class="sd-prod-head">
                        <span>Product</span>
                        <span v-for="k in HEAD_SORTS" :key="k.prop"
                            :class="['sd-hsort', { on: sort.prop === k.prop }]"
                            @click.stop="sortBy(k.prop)">{{ k.label }}<i
                                :class="sort.prop !== k.prop ? 'el-icon-d-caret'
                                    : sort.order === 'asc' ? 'el-icon-caret-top' : 'el-icon-caret-bottom'" /></span>
                    </div>
                </template>
                <template slot-scope="s">
                    <div class="sd-prod">
                        <!-- Clicking the image opens the viewer, not the detail drawer. -->
                        <product-thumb :src="s.row.imageUrl" :item-id="idOf(s.row)" />
                        <div class="sd-prod-text">
                            <div class="sd-prod-name" :title="nameOf(s.row)">
                                {{ nameOf(s.row) }}
                                <el-tag v-if="s.row.stale && availOf(s.row) > 0" size="mini" effect="plain">sitting still</el-tag>
                            </div>
                            <div class="sd-prod-meta">
                                <span class="sd-sku" :title="s.row.sku ? 'Click to copy the SKU' : ''"
                                    @click.stop="copySku(s.row.sku)">{{ s.row.sku || '—' }}</span>
                                <span v-if="s.row.location" class="sd-mono"><i class="el-icon-location-outline" /> {{ s.row.location }}</span>
                                <!-- Add to / remove from the 海运 list: green = in
                                     海运, grey = not; click toggles membership. -->
                                <el-tooltip placement="top" :content="s.row.seaFreight ? 'Remove from 海运' : 'Add to 海运'">
                                    <span :class="['sd-sea-btn', { on: s.row.seaFreight }]" @click.stop="toggleSeaFreight(s.row)"><i
                                            :class="s.row.__seaBusy ? 'el-icon-loading' : 'el-icon-ship'" /> 海运</span>
                                </el-tooltip>
                            </div>
                        </div>
                    </div>
                </template>
            </el-table-column>

            <el-table-column prop="available" label="Stock" width="86" align="right" sortable="custom">
                <template slot-scope="s">
                    <span :class="['sd-num', stockTone(s.row)]">{{ availOf(s.row) }}</span>
                </template>
            </el-table-column>

            <!-- Units sold in one window — the register keeps 7, 14, 30 and
                 90 days; the header picks which and the column sorts on it
                 (by the total). Under the total, the units by reason (user ask
                 2026-09-24): Zoho invoices and each Zoho adjustment reason. -->
            <el-table-column :prop="'units' + salesDays" width="126" align="right" sortable="custom" class-name="sd-sales-col">
                <template #header>
                    <span class="sd-sales-head">
                        Sold
                        <el-select v-model="days" size="mini" class="sd-sales-days" @click.native.stop>
                            <el-option v-for="d in SALES_DAYS" :key="d" :label="d + 'd'" :value="d" />
                        </el-select>
                    </span>
                </template>
                <template slot-scope="s">
                    <div class="sd-sold">
                        <span class="sd-num">{{ unitsOf(s.row, salesDays) }}</span>
                        <div v-for="r in reasonsOf(s.row, salesDays)" :key="r.key" class="sd-sold-r" :title="r.title">
                            <span>{{ r.label }}</span><b>{{ r.qty }}</b></div>
                    </div>
                </template>
            </el-table-column>

            <!-- Open purchases in Spare Parts Purchase by stage — pending
                 (待处理), ordered (已下单), shipped (已发货) … — read live; the
                 register's figure (the same lines, as of the last sync)
                 stands in only until the live read comes in. Each stage
                 splits by channel on one line (user ask 2026-09-24): 海运
                 (ship icon — lines filed under 海运) and 空运 (plane — every
                 other line). Inline too: a click on the cell takes a
                 quantity and raises a PO in this list's channel (海运 in the
                 海运 list, 空运 elsewhere) unless that channel already has a
                 pending line; a channel's lone pending quantity can be
                 changed in place by clicking it (0 cancels it). -->
            <el-table-column prop="openPoQty" label="On order" width="170" align="right" sortable="custom">
                <template slot-scope="s">
                    <div :class="['sd-oo-cell', { 'can-add': canAddPo(s.row) && !s.row.__edit }]" @click.stop="onOoCellClick(s.row)">
                        <div v-if="s.row.__edit" class="sd-oo sd-oo-editing">
                            <span class="sd-oo-q" :title="chanOf(s.row.__edit.ch).title">
                                <i v-if="s.row.__edit.ch === 'sea'" class="el-icon-ship" /><svg-icon v-else-if="s.row.__edit.ch === 'air'" icon-class="airplane" />
                                {{ s.row.__edit.kind === 'new' ? 'PO' : 'Pending' }}</span>
                            <input v-focus v-model.number="s.row.__edit.value" type="number" min="0" class="sd-oo-input"
                                @keyup.enter="commitQty(s.row)" @keyup.esc="cancelQty(s.row)" />
                            <i class="el-icon-check sd-oo-ok" title="Save (Enter)" @click.stop="commitQty(s.row)" />
                            <i class="el-icon-close sd-oo-no" title="Cancel (Esc)" @click.stop="cancelQty(s.row)" />
                        </div>
                        <template v-else>
                            <template v-if="sppOpen(s.row) > 0">
                                <!-- Nothing pending in this list's channel: another PO
                                     can be raised; the tag shows on hover. -->
                                <span v-if="canAddPo(s.row)" class="sd-oo-newtag"
                                    :title="`Click, type a quantity and press Enter to create another ${chanOf(channel).label} PO`">+
                                    <i v-if="channel === 'sea'" class="el-icon-ship" /><svg-icon v-else icon-class="airplane" /> PO</span>
                                <template v-for="st in STAGES">
                                    <div v-if="spp(s.row)[st.key]" :key="st.key" :class="['sd-oo', st.cls]" :title="st.title">
                                        <span>{{ st.label }}</span>
                                        <!-- by channel: ship = 海运, plane = 空运 -->
                                        <template v-if="split(s.row)">
                                            <template v-for="ch in CHANNELS">
                                                <b v-if="chanQty(s.row, ch.key, st.key)" :key="ch.key"
                                                    :class="['sd-oo-q', { editable: st.key === 'pending' && canEditPending(s.row, ch.key) }]"
                                                    :title="st.key === 'pending' && canEditPending(s.row, ch.key)
                                                        ? `${ch.title} — click to change the pending quantity (0 cancels it)` : ch.title"
                                                    @click.stop="st.key === 'pending' && canEditPending(s.row, ch.key) ? startQty(s.row, 'pending', ch.key) : null"><i
                                                        v-if="ch.key === 'sea'" class="el-icon-ship" /><svg-icon v-else icon-class="airplane" />{{ chanQty(s.row, ch.key, st.key) }}</b>
                                            </template>
                                        </template>
                                        <!-- (a backend without the split: the stage total) -->
                                        <b v-else :class="{ 'sd-oo-q': true, editable: st.key === 'pending' && canEditPending(s.row) }"
                                            @click.stop="st.key === 'pending' && canEditPending(s.row) ? startQty(s.row, 'pending') : null">{{ spp(s.row)[st.key] }}</b>
                                    </div>
                                </template>
                            </template>
                            <div v-if="registerOnOrder(s.row) > 0" class="sd-num sd-good"
                                title="Open purchase lines, as of the last stock sync">{{ registerOnOrder(s.row) }}</div>
                            <div v-if="!(sppOpen(s.row) > 0)" :class="['sd-dim', { 'sd-oo-add': canCreatePo }]"
                                :title="canCreatePo ? `Click, type a quantity and press Enter to create a ${chanOf(channel).label} PO` : ''">
                                {{ registerOnOrder(s.row) > 0 ? '' : '—' }}<span v-if="canCreatePo" class="sd-oo-plus">+
                                    <i v-if="channel === 'sea'" class="el-icon-ship" /><svg-icon v-else icon-class="airplane" /> PO</span></div>
                        </template>
                    </div>
                </template>
            </el-table-column>

            <el-table-column prop="daysSinceSale" label="Last sold" width="104" sortable="custom">
                <template slot-scope="s">
                    <span class="sd-dim">{{ lastSold(s.row.daysSinceSale) }}</span>
                </template>
            </el-table-column>

            <!-- (No Create PO button: a PO is raised in the On order cell —
                 user ask 2026-09-24.) -->
            <el-table-column label="" :width="hideMode ? 100 : 76" align="center">
                <template slot-scope="s">
                    <!-- The item drawer (rows do not open it on click). -->
                    <el-tooltip content="Detail" placement="left">
                        <el-button type="text" size="mini" icon="el-icon-view" @click.stop="openDetail(s.row)" />
                    </el-tooltip>
                    <!-- Off this list only (Stock Monitoring's hidden list);
                         everything else still sees the item. -->
                    <el-tooltip v-if="hideMode" :content="hideMode === 'unhide' ? 'Back on the list' : 'Hide from this list'"
                        placement="left">
                        <el-button type="text" size="mini" :loading="s.row.__hideBusy"
                            :icon="hideMode === 'unhide' ? 'el-icon-view' : 'el-icon-remove-outline'"
                            @click.stop="$emit(hideMode, s.row)" />
                    </el-tooltip>
                    <!-- Move to / restore from the Archive bucket. -->
                    <el-tooltip :content="isArchived(s.row) ? 'Restore from Archive' : 'Move to Archive'" placement="left">
                        <el-button type="text" size="mini" :loading="s.row.__archivedBusy"
                            :icon="isArchived(s.row) ? 'el-icon-refresh-left' : 'el-icon-box'"
                            @click.stop="toggleArchive(s.row)" />
                    </el-tooltip>
                </template>
            </el-table-column>
        </el-table>

        <stock-item-drawer ref="drawer" />
    </div>
</template>

<script>
import ProductThumb from '@/components/ProductThumb'
import StockItemDrawer from './StockItemDrawer'
import { setStockItemArchived } from '@/api/stockMonitor'
import { addSeaFreightItems, removeSeaFreightItem } from '@/api/zoho/stockMonitoring'
import { createOrders, updateOrder, cancelOrder, purchasesByItemIds } from '@/api/sparePartsPurchase'
import { CATEGORIES as PO_CATEGORIES } from '../../sparePartsPurchase/shared'
import { hasPermission } from '@/utils/permission'

// The sales windows the register stores (see utils/stockItems.js).
const SALES_DAYS = [7, 14, 30, 90]
// Sort links in the merged Product column's header.
const HEAD_SORTS = [{ prop: 'sku', label: 'SKU' }, { prop: 'location', label: 'Shelf' }]
// The On order cell's stages (the Purchase Order page's status colours) and
// channels: 海运 = lines filed under the 海运 channel, 空运 = every other line.
const STAGES = [
    { key: 'pending', label: 'Pending', cls: 'sd-oo-pending', title: '待处理 — asked for, not yet placed' },
    { key: 'toConfirm', label: 'To confirm', cls: 'sd-oo-confirm', title: '待确认 — waiting for a decision before it is placed or shipped' },
    { key: 'ordered', label: 'Ordered', cls: 'sd-oo-ordered', title: '已下单 — placed with the supplier' },
    { key: 'shipped', label: 'Shipped', cls: 'sd-oo-shipped', title: '已发货 — on its way in a batch' },
    { key: 'shortage', label: 'Shortage', cls: 'sd-oo-shortage', title: '缺货 — the supplier cannot get it' }
]
// Why stock left, as the register splits each sales window (utils/stockItems
// SALE_SCOPES): online = Zoho invoices, the rest = Zoho adjustment reasons.
const SALE_REASONS = [
    { key: 'online', label: 'Zoho', title: 'Zoho — sales invoices' },
    { key: 'inflow', label: 'Inflow', title: 'Inflow — adjustment reason "Inflow Recurring Adjustment"' },
    { key: 'dashboard', label: 'Dashboard', title: 'Dashboard — adjustment reason "Dispatch on Dashboard" (Order Dispatch page)' },
    { key: 'repair', label: 'Repair', title: 'Repair team — adjustment reason "iMobile Repair Team"' },
    { key: 'neto', label: 'Neto', title: 'Neto store — adjustment reason "Neto Accessories Sold"' }
]
const CHANNELS = [
    { key: 'sea', label: '海运', title: '海运 — sea freight' },
    { key: 'air', label: '空运', title: '空运 — air freight' }
]

export default {
    name: 'StockItemsTable',
    components: { ProductThumb, StockItemDrawer },
    directives: {
        // the inline quantity box takes the cursor as soon as it appears
        focus: { inserted(el) { el.focus(); if (el.select) el.select() } }
    },
    props: {
        rows: { type: Array, default: () => [] },
        loading: { type: Boolean, default: false },
        // What the list is sorted by, in the table's words: sku, location,
        // available, units7…units90, openPoQty, daysSinceSale.
        sort: { type: Object, default: () => ({ prop: '', order: '' }) },
        salesDays: { type: Number, default: 30 },
        // The rows are the Archive bucket: the action restores.
        archivedView: { type: Boolean, default: false },
        selectable: { type: Boolean, default: false },
        // Stock Monitoring's own hidden list: 'hide' on the list, 'unhide'
        // on the hidden-items review; '' = no such action.
        hideMode: { type: String, default: '' },
        // The 海运 list: a PO raised here files under 海运 (anywhere else it
        // files under the item's classification — 空运).
        seaView: { type: Boolean, default: false },
        // Read the open purchase lines for the rows whenever they change.
        // Off when the parent already brings them (row.purchase).
        autoSpp: { type: Boolean, default: true },
        emptyText: { type: String, default: 'Nothing matches these filters.' }
    },
    data() {
        return {
            HEAD_SORTS,
            SALES_DAYS,
            STAGES,
            CHANNELS,
            sppSeq: 0
        }
    },
    computed: {
        canCreatePo() {
            return hasPermission(this.$store.getters.permissions, 'spp:order:create')
        },
        // The channel a PO raised in this list goes to.
        channel() {
            return this.seaView ? 'sea' : 'air'
        },
        days: {
            get() { return this.salesDays },
            set(d) { this.$emit('update:salesDays', d) }
        }
    },
    watch: {
        // A NEW list only: Vue also runs this when a row gains a property
        // (the live-stock overlay, __spp itself) — same array, skip.
        rows: {
            handler(rows, old) { if (this.autoSpp && rows !== old) this.overlaySpp(rows) },
            immediate: true
        },
        // The column arrow shows what the list is sorted by — also when the
        // parent resets the sort (a new list) or the Sold window changes.
        sort: { handler() { this.$nextTick(this.syncSortArrow) }, deep: true },
        salesDays() { this.$nextTick(this.syncSortArrow) }
    },
    mounted() {
        this.$nextTick(this.syncSortArrow)
    },
    methods: {
        // ── the two row shapes ────────────────────────────────────
        idOf(row) { return String(row.itemId || row.id || '') },
        nameOf(row) { return row.name || row.productName || '' },
        availOf(row) { return row.available !== undefined ? row.available : row.stock },
        // A sales window as stored: { total, online, … } — or a plain number.
        windowOf(row, d) {
            return row['units' + d] !== undefined ? row['units' + d] : row.sales && row.sales[d]
        },
        unitsOf(row, d) {
            const w = this.windowOf(row, d)
            return w && typeof w === 'object' ? (w.total || 0) : (Number(w) || 0)
        },
        // The window's units by reason, biggest first; anything the reasons
        // do not account for shows as Other.
        reasonsOf(row, d) {
            const w = this.windowOf(row, d)
            if (!w || typeof w !== 'object' || !(w.total > 0)) return []
            const round = n => Math.round(n * 100) / 100
            const out = SALE_REASONS.filter(r => w[r.key] > 0).map(r => ({ ...r, qty: round(w[r.key]) }))
            const rest = round(w.total - out.reduce((t, r) => t + r.qty, 0))
            if (rest > 0) out.push({ key: 'other', label: 'Other', title: 'Not split by reason', qty: rest })
            return out.sort((a, b) => b.qty - a.qty)
        },
        // Open purchase lines: this table's own live read, else what the
        // parent brought (row.purchase); undefined until either is in.
        spp(row) {
            if (!row) return undefined
            return row.__spp !== undefined ? row.__spp : row.purchase
        },
        isArchived(row) { return this.archivedView || row.archived === true },

        // ── parent-facing ─────────────────────────────────────────
        clearSort() { if (this.$refs.table) this.$refs.table.clearSort() },
        // Element keeps the arrow on the column object and its clearSort()
        // gives up once it has lost track of which column that was (the
        // Sold column changes prop with the window), so set it directly.
        syncSortArrow() {
            const t = this.$refs.table
            if (!t || !t.store) return
            const st = t.store.states
            const { prop, order } = this.sort
            const own = prop && !HEAD_SORTS.some(k => k.prop === prop)
            const want = own ? (order === 'asc' ? 'ascending' : 'descending') : null
            const col = own ? st.columns.find(c => c.property === prop) : null
            if (col ? st.sortingColumn === col && col.order === want : !st.sortingColumn && st.columns.every(c => !c.order)) return
            for (const c of st.columns) c.order = null
            st.sortingColumn = col || null
            st.sortProp = col ? prop : null
            st.sortOrder = col ? want : null
            if (col) col.order = want
        },
        clearSelection() { if (this.$refs.table) this.$refs.table.clearSelection() },
        openDetail(row) { this.$refs.drawer.open(row) },

        // ── sorting ───────────────────────────────────────────────
        // Header sort link: first click sorts A→Z, again flips. The table's
        // own arrows are cleared so only one sort shows as active.
        sortBy(prop) {
            const order = this.sort.prop === prop && this.sort.order === 'asc' ? 'desc' : 'asc'
            this.clearSort()
            this.$emit('sort-change', { prop, order })
        },
        onTableSort({ prop, order }) {
            if (!prop || !order) return
            this.$emit('sort-change', { prop, order: order === 'ascending' ? 'asc' : 'desc' })
        },

        // ── Spare Parts Purchase ──────────────────────────────────
        async overlaySpp(rows) {
            const ids = (rows || []).map(r => this.idOf(r)).filter(Boolean)
            if (!ids.length || !hasPermission(this.$store.getters.permissions, 'spp:order:view')) return
            const seq = ++this.sppSeq
            try {
                const r = await purchasesByItemIds(ids)
                if (seq !== this.sppSeq || !r || !r.data) return
                for (const row of rows) this.$set(row, '__spp', r.data[this.idOf(row)] || null)
            } catch (e) { /* the column shows the register's figure */ }
        },
        // One row's lines again, after it was changed here (not tied to the
        // page-wide read's sequence).
        async refreshSpp(row) {
            try {
                const r = await purchasesByItemIds([this.idOf(row)])
                if (r && r.data) this.$set(row, '__spp', r.data[this.idOf(row)] || null)
            } catch (e) { /* the old figure stands */ }
            this.$emit('po-changed', row)
        },
        // The register's on-order figure, shown only while no live read has
        // come in — once one has, the stages rule.
        registerOnOrder(row) {
            return row && this.spp(row) === undefined ? Number(row.openPoQty) || 0 : 0
        },
        // Everything still to arrive: waiting, placed, in transit, short.
        sppOpen(row) {
            const s = this.spp(row)
            return s ? (s.pending || 0) + (s.toConfirm || 0) + (s.ordered || 0) + (s.shipped || 0) + (s.shortage || 0) : 0
        },
        // ── by channel: 海运 (sea) / 空运 (air) ──
        chanOf(key) { return CHANNELS.find(c => c.key === key) || CHANNELS[1] },
        // The read carries the split (sea / air per stage).
        split(row) {
            const s = this.spp(row)
            return !!(s && s.sea && s.air)
        },
        chanQty(row, ch, stage) {
            const s = this.spp(row)
            return (s && s[ch] && s[ch][stage]) || 0
        },
        // The pending lines of one channel (both without one).
        pendingLinesOf(row, ch) {
            const s = this.spp(row)
            const lines = (s && Array.isArray(s.pendingLines)) ? s.pendingLines : []
            return ch ? lines.filter(l => (ch === 'sea') === (l.sea === true)) : lines
        },
        // A channel's pending quantity can be changed in place when it is
        // ONE line; several are left to the Purchase Order page.
        canEditPending(row, ch) {
            return this.canCreatePo && this.pendingLinesOf(row, ch).length === 1
        },
        poCategoryFor(row) {
            return this.seaView ? '海运' : (PO_CATEGORIES.includes(row.classification) ? row.classification : 'Other')
        },
        // A new PO from the cell whenever the item has no pending line in
        // this list's channel — with nothing on order, or with only ordered /
        // shipped / … quantity, or pending only in the other channel.
        canAddPo(row) {
            if (!this.canCreatePo) return false
            const s = this.spp(row)
            if (!s) return true
            return this.split(row) ? !(this.chanQty(row, this.channel, 'pending') > 0) : !(s.pending > 0)
        },
        onOoCellClick(row) {
            if (row.__edit) return
            if (this.canAddPo(row)) this.startQty(row, 'new', this.channel)
        },
        startQty(row, kind, ch) {
            const value = kind !== 'pending' ? '' : ch ? this.chanQty(row, ch, 'pending') : this.spp(row).pending
            this.$set(row, '__edit', { kind, ch: ch || '', value, busy: false })
        },
        cancelQty(row) {
            this.$set(row, '__edit', null)
        },
        // Enter commits: a new PO for the typed quantity, or the pending
        // line's new quantity (0 cancels that line).
        async commitQty(row) {
            const e = row.__edit
            if (!e || e.busy) return
            const qty = Math.round(Number(e.value))
            if (e.kind === 'new') {
                if (!Number.isFinite(qty) || qty < 1) { this.cancelQty(row); return }
                e.busy = true
                try {
                    const r = await createOrders([{
                        itemId: this.idOf(row), sku: row.sku, productName: this.nameOf(row), imageId: row.imageId,
                        category: this.poCategoryFor(row), orderQty: qty, note: ''
                    }])
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    this.$message.success(`${this.chanOf(e.ch).label} PO created: ${row.sku || this.nameOf(row)} × ${qty}`)
                    this.$set(row, '__edit', null)
                    this.refreshSpp(row)
                } catch (err) {
                    this.$message.error(this.msg(err, 'Could not create the purchase order'))
                    e.busy = false
                }
                return
            }
            const line = this.pendingLinesOf(row, e.ch)[0]
            if (!Number.isFinite(qty) || qty < 0 || qty === line.orderQty) { this.cancelQty(row); return }
            e.busy = true
            try {
                if (qty === 0) {
                    await this.$confirm(`Cancel the pending purchase order for ${row.sku || this.nameOf(row)}?`, 'Cancel PO',
                        { type: 'warning', confirmButtonText: 'Cancel PO', cancelButtonText: 'Keep' })
                    const r = await cancelOrder(line.id)
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    this.$message.success(`Pending PO for ${row.sku || this.nameOf(row)} cancelled`)
                } else {
                    const r = await updateOrder(line.id, { orderQty: qty })
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    this.$message.success(`Pending quantity for ${row.sku || this.nameOf(row)} is now ${qty}`)
                }
                this.$set(row, '__edit', null)
                this.refreshSpp(row)
            } catch (err) {
                if (err !== 'cancel' && err !== 'close') this.$message.error(this.msg(err, 'Could not update the purchase order'))
                this.$set(row, '__edit', null)
            }
        },
        // ── row actions ───────────────────────────────────────────
        // Add a row to (or remove it from) the 海运 list — the pinned
        // collection Stock Monitoring shows as a tab. The mark flips at once;
        // the parent hears about it (the 海运 list itself drops the row).
        async toggleSeaFreight(row) {
            if (row.__seaBusy) return
            this.$set(row, '__seaBusy', true)
            try {
                const r = row.seaFreight
                    ? await removeSeaFreightItem(this.idOf(row))
                    : await addSeaFreightItems([{ id: this.idOf(row), name: this.nameOf(row), sku: row.sku }])
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$set(row, 'seaFreight', !row.seaFreight)
                this.$message.success(row.seaFreight
                    ? `${row.sku || this.nameOf(row)} added to 海运`
                    : `${row.sku || this.nameOf(row)} removed from 海运`)
                this.$emit('sea-changed', row)
            } catch (e) {
                this.$message.error((e && e.message) || 'Failed to update 海运')
            } finally {
                this.$set(row, '__seaBusy', false)
            }
        },
        // Move a row to the Archive bucket, or restore it. Restoring a
        // criteria-matched name pins it as never-archived.
        async toggleArchive(row) {
            if (row.__archivedBusy) return
            const restoring = this.isArchived(row)
            this.$set(row, '__archivedBusy', true)
            try {
                const r = await setStockItemArchived(this.idOf(row), restoring)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(`${row.sku || this.nameOf(row)} ${restoring ? 'restored' : 'moved to Archive'}`)
                this.$set(row, 'archived', !restoring)
                this.$emit('archived', row, !restoring)
            } catch (e) {
                this.$message.error(this.msg(e, 'Update failed'))
            } finally {
                this.$set(row, '__archivedBusy', false)
            }
        },
        // Same textarea + execCommand pattern the rest of the app uses —
        // works regardless of the clipboard API's secure-context rules.
        copySku(sku) {
            if (!sku) return
            const ta = document.createElement('textarea')
            ta.value = sku
            ta.style.position = 'fixed'
            ta.style.opacity = '0'
            document.body.appendChild(ta)
            ta.select()
            try {
                document.execCommand('copy')
                this.$message.success(`SKU ${sku} copied`)
            } catch (e) {
                this.$message.warning('Copy failed — select the text manually.')
            }
            document.body.removeChild(ta)
        },

        stockTone(row) {
            const a = this.availOf(row)
            if (a < 0) return 'sd-warn'
            if (a <= 0) return 'sd-bad'
            return ''
        },
        lastSold(days) {
            if (days == null) return 'never'
            if (days <= 0) return 'today'
            if (days === 1) return 'yesterday'
            return `${days} days ago`
        },
        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback
        }
    }
}
</script>

<style lang="scss" scoped>
.sd-dim { color: #909399; font-size: 12px; }
.sd-good { color: #67c23a; }
.sd-warn { color: #e6a23c; }
.sd-bad { color: #ff4949; }
.sd-num { font-variant-numeric: tabular-nums; font-weight: 600; }
.sd-mono, .sd-sku { font-variant-numeric: tabular-nums; }
.sd-sku { font-weight: 600; color: #1890ff; cursor: pointer; }
/* Sold: the total, then one small line per reason (label + units). */
.sd-sold { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.35; }
.sd-sold-r { display: flex; justify-content: flex-end; gap: 6px; font-size: 11px; white-space: nowrap; }
.sd-sold-r span { color: #909399; }
.sd-sold-r b { font-weight: 500; color: #606266; font-variant-numeric: tabular-nums; min-width: 14px; text-align: right; }
/* "Sold [30d] ⇅" on one line: tight select, no wrapping, slim cell padding. */
.sd-sales-head { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.sd-sales-days { width: 58px; }
.sd-sales-days ::v-deep .el-input__inner { height: 22px; line-height: 22px; padding: 0 18px 0 5px; font-size: 12px; }
.sd-sales-days ::v-deep .el-input__icon { line-height: 22px; width: 18px; }
::v-deep th.sd-sales-col .cell { white-space: nowrap; padding-left: 6px; padding-right: 4px; display: inline-flex; align-items: center; }
.sd-oo-ok, .sd-oo-no { cursor: pointer; font-size: 13px; padding: 2px; border-radius: 3px; }
.sd-oo-ok { color: #67c23a; }
.sd-oo-no { color: #909399; }
.sd-oo-ok:hover, .sd-oo-no:hover { background: #f2f6fc; }
/* On order by stage — the PO page's status colours. */
.sd-oo { display: flex; justify-content: flex-end; gap: 6px; font-size: 11px; line-height: 1.35; white-space: nowrap; }
.sd-oo span { color: #909399; }
.sd-oo b { font-variant-numeric: tabular-nums; min-width: 14px; text-align: right; }
/* One quantity per channel, each labelled by its icon (ship = 海运,
   plane = 空运); the icon stays grey, the number takes the stage colour. */
.sd-oo-q { display: inline-flex; align-items: center; gap: 2px; }
.sd-oo-q i, .sd-oo-q .svg-icon { color: #909399; font-size: 12px; font-weight: normal; }
.sd-oo-q .svg-icon { width: 11px; height: 11px; }
.sd-oo-q.editable { cursor: pointer; }
.sd-oo-q.editable:hover { text-decoration: underline; }
.sd-oo-newtag i, .sd-oo-newtag .svg-icon, .sd-oo-plus i, .sd-oo-plus .svg-icon { font-size: 11px; width: 10px; height: 10px; }
.sd-oo-pending b { color: #e6a23c; }
.sd-oo-confirm b { color: #0ea5a5; }
.sd-oo-ordered b { color: #409eff; }
.sd-oo-shipped b { color: #8b5cf6; }
.sd-oo-shortage b { color: #f56c6c; }
.sd-oo-cell { min-height: 18px; position: relative; }
.sd-oo-cell.can-add { cursor: pointer; }
/* "+ PO" on a cell that already shows stages: top-left, on hover, so the
   row keeps its height. */
.sd-oo-newtag { position: absolute; left: 0; top: 0; display: none; font-size: 11px; line-height: 1.35; color: #409eff; }
.sd-oo-cell.can-add:hover .sd-oo-newtag { display: inline; }
.sd-oo-add { cursor: pointer; }
.sd-oo-plus { display: none; margin-left: 4px; font-size: 11px; color: #409eff; }
.sd-oo-add:hover .sd-oo-plus { display: inline; }
.sd-oo-input { width: 58px; height: 20px; font-size: 12px; text-align: right; border: 1px solid #409eff; border-radius: 3px; padding: 0 4px; outline: none; color: #303133; }
.sd-oo-input::-webkit-outer-spin-button, .sd-oo-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

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
/* Membership reads off the button itself: green = in 海运, grey = not. */
.sd-sea-btn {
    color: #c0c4cc; cursor: pointer; white-space: nowrap;
    &:hover { color: #909399; }
    &.on { color: #67C23A; &:hover { color: #529b2e; } }
}
::v-deep .el-table__row { cursor: default; }
</style>
