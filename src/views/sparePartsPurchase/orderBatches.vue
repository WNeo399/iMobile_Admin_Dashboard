<template>
    <div class="spo-page app-container">
        <div class="spo-bar">
            <span class="spo-title">{{ $tt('Order Batches') }}</span>
            <span class="spo-spacer" />
            <el-input v-model="search" size="small" clearable prefix-icon="el-icon-search" class="spo-search"
                :placeholder="$tp('Batch no, supplier, SKU, product…')" @keyup.enter.native="reload" @clear="reload" />
            <el-button v-if="can('spp:order:supply')" type="primary" size="small" icon="el-icon-document-checked" @click="openCreate">{{ $tp('Create Order Batch') }}</el-button>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">{{ $tp('Refresh') }}</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" size="mini" border :empty-text="$tp('No order batches yet')">
            <!-- A new draft has no number until it is confirmed; a batch put
                 back to draft keeps its number beside the tag. -->
            <el-table-column :label="$tp('Batch')" width="130">
                <template slot-scope="s">
                    <el-button v-if="s.row.batchNo" type="text" class="spo-no" @click="openView(s.row)">{{ s.row.batchNo }}</el-button>
                    <el-tag v-if="isDraft(s.row)" size="mini" type="warning" class="spo-draft-tag" @click="openView(s.row)">{{ $tp('Draft') }}</el-tag>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Date')" width="104" align="center">
                <template slot-scope="s">{{ fmtDay(s.row.confirmedAt || s.row.createdAt) }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Supplier')" width="140" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.supplier || '—' }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Lines')" width="70" align="center">
                <template slot-scope="s">{{ s.row.lineCount }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Pcs')" width="70" align="center">
                <template slot-scope="s">{{ s.row.totalQty }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Priced')" width="96" align="center">
                <template slot-scope="s">
                    <span v-if="isDraft(s.row)" class="spo-dim">—</span>
                    <span v-else :class="(s.row.pricedCount || 0) >= s.row.lineCount ? 'spo-ok' : 'spo-warn'">{{ s.row.pricedCount || 0 }} / {{ s.row.lineCount }}</span>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Created by')" width="150">
                <template slot-scope="s">
                    <div>{{ s.row.createdBy || '—' }}</div>
                    <div class="spo-dim">{{ fmtWhen(s.row.createdAt) }}</div>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Note')" min-width="140" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.note || '—' }}</template>
            </el-table-column>
            <!-- Preview / download of the order list live in the view dialog. -->
            <!-- a draft: edit or delete it right from the row -->
            <el-table-column :label="$tp('Actions')" width="190" align="center">
                <template slot-scope="s">
                    <template v-if="isDraft(s.row) && can('spp:order:supply')">
                        <el-button type="text" size="mini" icon="el-icon-edit" @click="openEdit(s.row)">{{ $tp('Edit') }}</el-button>
                        <el-button type="text" size="mini" icon="el-icon-delete" class="spo-del-row" @click="discard(s.row._id)">{{ $tp('Delete') }}</el-button>
                    </template>
                    <el-button type="text" size="mini" icon="el-icon-view" @click="openView(s.row)">{{ $tp('View') }}</el-button>
                </template>
            </el-table-column>
        </el-table>

        <div class="spo-pager">
            <el-pagination background layout="total, sizes, prev, pager, next" :total="total" :page-size="pageSize"
                :page-sizes="[10, 20, 50]" :current-page="page" @current-change="onPage" @size-change="onSize" />
        </div>

        <!-- ── Create / edit a draft: a category on the left, its pending
             lines on the right, a click picks a line; the picks add up
             across categories and go to one supplier. Saved as a draft
             (the lines stay pending); Confirm order places them. ─────── -->
        <el-dialog :visible.sync="createVisible" width="960px" append-to-body top="4vh" @closed="clearQuery">
            <div slot="title" class="spo-dlg-head"><i class="el-icon-document-checked" /> {{ draftId ? $tp('Order batch draft') : $tp('Create Order Batch') }}
                <span class="spo-dim spo-dlg-sub">{{ $tp('saved as a draft — the lines stay pending until you confirm') }}</span></div>
            <div class="spo-head-fields">
                <div class="spo-field spo-field-supplier">
                    <label>{{ $tp('Supplier') }}</label>
                    <el-select v-model="createForm.supplier" size="small" :placeholder="$tp('Select or type')" filterable allow-create
                        default-first-option clearable style="width:100%">
                        <el-option v-for="s in suppliers" :key="s" :label="s" :value="s" />
                    </el-select>
                </div>
                <div class="spo-field spo-field-grow">
                    <label>{{ $tp('Note') }}</label>
                    <el-input v-model="createForm.note" size="small" maxlength="200" :placeholder="$tp('Optional')" clearable />
                </div>
            </div>
            <div v-loading="pendingLoading" class="spo-picker">
                <!-- Every category: its pending count (red), and how many are picked in it. -->
                <div class="spo-cats">
                    <div v-for="c in CATEGORIES" :key="c" :class="['spo-cat', { on: pick.category === c, empty: !catCount(c) }]"
                        @click="pick.category = c">
                        <span class="spo-cat-name">{{ $tp(c) }}</span>
                        <span v-if="selectedInCat(c)" class="spo-cat-sel"><i class="el-icon-check" />{{ selectedInCat(c) }}</span>
                        <span :class="['spo-cat-n', { 'is-zero': !catCount(c) }]">{{ catCount(c) }}</span>
                    </div>
                </div>
                <!-- The category's pending lines, by item name. -->
                <div class="spo-lines">
                    <div v-if="!catLines.length" class="spo-lines-empty">
                        <i class="el-icon-folder-opened" />
                        <div>{{ $tp('No pending lines in this category') }}</div>
                    </div>
                    <!-- a line in someone else's draft can't be picked twice -->
                    <div v-for="r in catLines" :key="r._id" :class="['spo-line', { on: selected[r._id], taken: takenBy(r) }]" @click="toggleLine(r)">
                        <i :class="selected[r._id] ? 'el-icon-success spo-line-check' : takenBy(r) ? 'el-icon-lock spo-line-lock' : 'el-icon-circle-plus-outline spo-line-plus'" />
                        <div class="spo-line-main">
                            <div class="spo-line-name">{{ r.productName }}</div>
                            <div class="spo-dim">SKU: {{ r.sku || '—' }} · {{ fmtDay(r.createdAt) }}<span v-if="r.status === 'shortage'"
                                    class="spo-line-short"> · {{ statusLabel(r.status) }}</span><span v-if="r.note"> · {{ r.note }}</span><span v-if="takenBy(r)"
                                    class="spo-line-taken"> · {{ $tp('In another draft ({by})', { by: takenBy(r) }) }}</span></div>
                        </div>
                        <div class="spo-line-qty">× {{ r.orderQty }}</div>
                    </div>
                </div>
            </div>
            <span slot="footer">
                <span class="spo-foot-sum">{{ $tp('{n} line(s) selected', { n: selectedCount }) }}<span v-if="selectedCount"> · {{ selectedQty }} {{ $tp('Pcs') }}</span></span>
                <el-button v-if="draftId" type="text" size="small" icon="el-icon-delete" class="spo-del" :loading="discarding"
                    @click="discard(draftId)">{{ $tp('Delete draft') }}</el-button>
                <el-button size="small" @click="createVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button :type="draftId ? 'default' : 'primary'" size="small" icon="el-icon-document" :loading="creating" :disabled="!selectedCount"
                    @click="saveDraft">{{ $tp('Save draft') }}</el-button>
                <el-button v-if="draftId" type="primary" size="small" icon="el-icon-check" :loading="confirming" :disabled="!selectedCount"
                    @click="confirmForm">{{ $tp('Confirm order') }}</el-button>
            </span>
        </el-dialog>

        <!-- ── View, and key the supplier's prices back in ──────────── -->
        <el-dialog :visible.sync="viewVisible" width="900px" append-to-body top="4vh" @closed="cancelPriceEdit">
            <div slot="title" class="spo-dlg-head"><i class="el-icon-tickets" />
                <template v-if="view && isDraft(view)">{{ view.batchNo }} <el-tag size="mini" type="warning">{{ $tp('Draft') }}</el-tag>
                    <span class="spo-dim spo-dlg-sub">{{ view.supplier || $tp('no supplier yet') }} · {{ $tp('not placed yet') }}</span></template>
                <template v-else-if="view">{{ view.batchNo }}
                    <span class="spo-dim spo-dlg-sub">{{ view.supplier }} · {{ fmtDay(view.confirmedAt || view.createdAt) }}</span></template></div>
            <div v-if="view" v-loading="viewLoading">
                <el-table :data="view.lines" size="mini" border max-height="440">
                    <el-table-column label="#" type="index" width="40" align="center" />
                    <!-- the name wraps to at most 2 lines (user ask 2026-10-05); hover for all of it -->
                    <el-table-column :label="$tp('Product')" min-width="280">
                        <template slot-scope="s">
                            <div class="spo-pname" :title="s.row.productName">{{ s.row.productName }}</div>
                            <div class="spo-dim spo-psku">SKU: {{ s.row.sku || '—' }}<span v-if="s.row.category"> · {{ $tp(s.row.category) }}</span></div>
                        </template>
                    </el-table-column>
                    <el-table-column :label="$tp('Qty')" width="70" align="center">
                        <template slot-scope="s">{{ s.row.orderQty }}</template>
                    </el-table-column>
                    <el-table-column :label="$tp('Status')" width="96" align="center">
                        <template slot-scope="s"><span class="spo-status" :style="statusStyle(s.row.status)">{{ statusLabel(s.row.status) }}</span></template>
                    </el-table-column>
                    <!-- The supplier's price, keyed in per line: click the price,
                         type, ✓ saves that line (Enter too), ✗ drops the edit.
                         Save runs on click (after the input's blur commits),
                         cancel on mousedown (before a re-render swallows it). -->
                    <el-table-column :label="$tp('Unit Price')" width="150" align="center">
                        <template slot-scope="s">
                            <div v-if="priceEdit.orderId === String(s.row.orderId)" class="spo-pedit" @click.stop>
                                <el-input-number v-model="priceEdit.value" size="mini" :min="0" :precision="2" :controls="false"
                                    class="spo-pinput" placeholder="¥" @keyup.enter.native="priceEnter($event, s.row)" @keyup.esc.native="cancelPriceEdit" />
                                <el-button type="text" size="mini" icon="el-icon-check" class="spo-psave" :loading="priceSaving" @click="savePriceEdit(s.row)" />
                                <el-button type="text" size="mini" icon="el-icon-close" class="spo-pcancel" @mousedown.native.prevent="cancelPriceEdit" />
                            </div>
                            <div v-else-if="canPrice(s.row)" class="spo-pview" :title="$tp('Click to enter the price')" @click="startPriceEdit(s.row)">
                                <span :class="{ 'spo-dim': shownPrice(s.row) == null }">{{ yuan(shownPrice(s.row)) }}</span><i class="el-icon-edit spo-pencil" />
                            </div>
                            <template v-else>{{ yuan(shownPrice(s.row)) }}</template>
                        </template>
                    </el-table-column>
                    <el-table-column :label="$tp('Line total')" width="110" align="right">
                        <template slot-scope="s">{{ yuan(lineTotal(s.row)) }}</template>
                    </el-table-column>
                    <!-- 50×40 part labels: one per ordered unit of the line. -->
                    <el-table-column :label="$tp('Label')" width="60" align="center">
                        <template slot-scope="s">
                            <el-tooltip :content="$tp('Print {n} label(s)', { n: Math.max(1, Math.floor(Number(s.row.orderQty)) || 0) })" placement="top">
                                <el-button type="text" size="mini" icon="el-icon-printer" @click="printLineLabels(s.row)" />
                            </el-tooltip>
                        </template>
                    </el-table-column>
                </el-table>
                <div v-if="view.note" class="spo-dim spo-note">{{ $tp('Note') }}: {{ view.note }}</div>
            </div>
            <span slot="footer">
                <!-- a draft: change it, drop it, or confirm it -->
                <template v-if="view && isDraft(view) && can('spp:order:supply')">
                    <el-button type="text" size="small" icon="el-icon-delete" class="spo-del spo-foot-left" :loading="discarding"
                        @click="discard(view._id)">{{ $tp('Delete draft') }}</el-button>
                    <el-button size="small" icon="el-icon-edit" @click="openEdit(view)">{{ $tp('Edit') }}</el-button>
                    <el-button type="primary" size="small" icon="el-icon-check" :loading="confirming" @click="confirmView">{{ $tp('Confirm order') }}</el-button>
                </template>
                <el-button size="small" icon="el-icon-printer" @click="preview(view)">{{ $tp('Preview') }}</el-button>
                <el-button size="small" icon="el-icon-collection-tag" :disabled="!labelCount(view)" @click="printAllLabels(view)">
                    {{ $tp('Print labels ({n})', { n: labelCount(view) }) }}</el-button>
                <el-button size="small" icon="el-icon-download" @click="download(view)">{{ $tp('Download list') }}</el-button>
                <el-button size="small" @click="viewVisible = false">{{ $tp('Close') }}</el-button>
            </span>
        </el-dialog>

        <!-- ── Order list preview: print it, or save it as a PDF from the
             browser's print dialog. ─────────────────────────────────── -->
        <el-dialog :title="$tp('Print preview')" :visible.sync="printVisible" width="860px" append-to-body top="4vh">
            <iframe ref="printFrame" class="spo-print-frame" :srcdoc="printHtml" title="order list" />
            <span slot="footer">
                <el-button size="small" @click="printVisible = false">{{ $tp('Close') }}</el-button>
                <el-button type="primary" size="small" icon="el-icon-printer" @click="doPrint">{{ $tp('Print') }}</el-button>
            </span>
        </el-dialog>

        <!-- ── Label preview: the PDF, printed or saved from here ───── -->
        <el-dialog :title="labelTitle" :visible.sync="labelVisible" width="560px" append-to-body top="5vh" @closed="cleanupLabels">
            <!-- Portrait = the same label turned 90° on a 40 × 50 page, for a
                 printer whose label stock runs the other way; remembered. -->
            <div class="label-orient">
                <span>{{ $tp('Orientation') }}</span>
                <el-radio-group v-model="labelOrientation" size="mini" @change="onLabelOrientation">
                    <el-radio-button label="portrait">{{ $tp('Portrait') }}</el-radio-button>
                    <el-radio-button label="landscape">{{ $tp('Landscape') }}</el-radio-button>
                </el-radio-group>
                <span class="label-orient-gap">{{ $tp('Size') }}</span>
                <el-radio-group v-model="labelSize" size="mini" @change="onLabelSize">
                    <el-radio-button v-for="z in LABEL_SIZES" :key="z.key" :label="z.key">{{ $tp(z.label) }}</el-radio-button>
                </el-radio-group>
                <span v-if="labelSize === '40x30x2'">{{ $tp('2 labels per page, side by side') }}</span>
            </div>
            <iframe v-if="labelUrl" :src="labelUrl" class="spo-label-frame" title="labels" />
            <span slot="footer">
                <el-button size="small" icon="el-icon-download" @click="downloadLabels">{{ $tp('Download') }}</el-button>
                <el-button size="small" @click="labelVisible = false">{{ $tp('Close') }}</el-button>
                <el-button type="primary" size="small" icon="el-icon-printer" @click="printLabels">{{ $tp('Print') }}</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import * as XLSX from 'xlsx-js-style'
import { hasPermission } from '@/utils/permission'
import {
    listOrderBatches, getOrderBatch, createOrderBatch, updateOrderBatch, confirmOrderBatch, discardOrderBatch,
    priceOrderBatch, listOrders, getMeta
} from '@/api/sparePartsPurchase'
import { STATUS_META, CATEGORIES, QUOTE_FIRST, fmtDay, fmtWhen, yuan, orderListHtml } from './shared'
import { buildSppLineLabelsPdf, buildSppBatchLabelsPdf, sppLabelCount, sppLabelFileName, withLabelNames, getLabelOrientation, setLabelOrientation, getLabelSize, setLabelSize, LABEL_SIZES } from '@/utils/sppLabelPdf'

export default {
    name: 'SppOrderBatches',
    data() {
        return {
            CATEGORIES,
            rows: [],
            total: 0,
            page: 1,
            pageSize: 20,
            loading: false,
            search: '',
            suppliers: [],
            // create / edit a draft (draftId set when editing)
            createVisible: false,
            draftId: null,
            // order line id → who drafted it, for lines in OTHER drafts
            taken: {},
            confirming: false,
            discarding: false,
            createForm: { supplier: '', note: '' },
            pick: { category: '' },
            // every pending / shortage line, and the ones picked (by id)
            pending: [],
            pendingLoading: false,
            selected: {},
            creating: false,
            // view / prices
            viewVisible: false,
            viewLoading: false,
            view: null,
            // one line's price being typed: { orderId, value }
            priceEdit: { orderId: null, value: undefined },
            priceSaving: false,
            // part labels (PDF preview)
            labelVisible: false,
            labelTitle: '',
            labelUrl: '',
            labelBuild: null,
            labelFileName: '',
            labelOrientation: getLabelOrientation(),
            labelSize: getLabelSize(),
            LABEL_SIZES,
            // order list preview
            printVisible: false,
            printHtml: ''
        }
    },
    created() {
        this.load().then(() => {
            if (this.$route.query.create) this.openCreate()
        })
    },
    // Coming back to the tab (kept alive by the tags bar): fresh data.
    activated() {
        this.load()
    },
    computed: {
        // The side menu's buckets: pending lines per category.
        pendingByCat() {
            const by = {}
            for (const r of this.pending) (by[this.catOf(r)] = by[this.catOf(r)] || []).push(r)
            return by
        },
        // A category's pending lines by item name (user ask 2026-10-05) —
        // A→Z, numbers in order ("iPhone 9" before "iPhone 11"); the same
        // item twice keeps the older line first.
        catLines() {
            const lines = this.pendingByCat[this.pick.category] || []
            return [...lines].sort((a, b) =>
                String(a.productName || '').localeCompare(String(b.productName || ''), 'en', { numeric: true, sensitivity: 'base' }) ||
                new Date(a.createdAt) - new Date(b.createdAt))
        },
        selectedCount() {
            return Object.keys(this.selected).length
        },
        selectedQty() {
            return Object.values(this.selected).reduce((t, r) => t + (r.orderQty || 0), 0)
        }
    },
    methods: {
        fmtDay, fmtWhen, yuan,
        can(p) {
            return hasPermission(this.$store.getters.permissions, p)
        },
        statusLabel(v) {
            const m = STATUS_META[v]
            return m ? this.$tp(m.label) : v
        },
        statusStyle(v) {
            const m = STATUS_META[v]
            return m ? { color: m.color, background: m.bg } : {}
        },
        msg(e, fallback) {
            return (e && (e.message || (e.response && e.response.data && e.response.data.message))) || fallback
        },
        clearQuery() {
            if (Object.keys(this.$route.query || {}).length) this.$router.replace({ query: {} }).catch(() => {})
        },
        // ── List ───────────────────────────────────────────────────
        async load() {
            this.loading = true
            try {
                const r = await listOrderBatches({ page: this.page, pageSize: this.pageSize, search: this.search || undefined })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.rows || []
                this.total = r.total || 0
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load the order batches')))
            } finally {
                this.loading = false
            }
        },
        reload() { this.page = 1; this.load() },
        onPage(p) { this.page = p; this.load() },
        onSize(s) { this.pageSize = s; this.reload() },
        // ── Create ─────────────────────────────────────────────────
        // Saved before drafts existed = no status = confirmed.
        isDraft(b) {
            return !!b && (b.status === 'draft' || b.status === 'confirming')
        },
        async openCreate() {
            this.draftId = null
            this.createForm = { supplier: '', note: '' }
            this.pick = { category: '' }
            this.selected = {}
            this.createVisible = true
            this.loadPending()
            this.loadSuppliers()
        },
        // A draft back into the picker: its lines come preselected.
        async openEdit(batch) {
            this.draftId = batch._id
            this.createForm = { supplier: batch.supplier || '', note: batch.note || '' }
            this.pick = { category: '' }
            this.selected = {}
            this.viewVisible = false
            this.createVisible = true
            this.loadSuppliers()
            await this.loadPending()
            const byId = new Map(this.pending.map(r => [String(r._id), r]))
            let gone = 0
            for (const l of batch.lines || []) {
                const r = byId.get(String(l.orderId))
                if (r) this.$set(this.selected, r._id, r)
                else gone++
            }
            if (gone) this.$message.info(this.$tp('{n} line(s) in this draft are no longer pending and were left out', { n: gone }))
            const firstPicked = Object.values(this.selected)[0]
            if (firstPicked) this.pick.category = this.catOf(firstPicked)
        },
        async loadSuppliers() {
            if (this.suppliers.length) return
            try {
                const r = await getMeta()
                this.suppliers = (r && r.suppliers) || []
            } catch (e) { /* the select still allows typing */ }
        },
        // Every line still waiting to be placed (pending or shortage), oldest
        // first, all pages — the side menu counts them per category.
        async loadPending() {
            this.pendingLoading = true
            this.loadTaken()
            try {
                const rows = []
                for (let page = 1; page <= 10; page++) {
                    const r = await listOrders({ status: 'pending,shortage', sort: 'oldest', page, pageSize: 200 })
                    rows.push(...((r && r.rows) || []))
                    if (!r || rows.length >= (r.total || 0) || !(r.rows || []).length) break
                }
                // a New Product / Special Order still waiting for its quote / confirmation
                // cannot be placed yet (the backend refuses it too)
                this.pending = rows.filter(r => !(QUOTE_FIRST.includes(r.category) && !r.confirmed))
                // land on the first category that has something to pick
                if (!this.pick.category || !this.catCount(this.pick.category)) {
                    this.pick.category = CATEGORIES.find(c => this.catCount(c)) || CATEGORIES[0]
                }
            } catch (e) {
                this.pending = []
            } finally {
                this.pendingLoading = false
            }
        },
        // Lines already in another draft (not the one being edited).
        async loadTaken() {
            const taken = {}
            try {
                const r = await listOrderBatches({ status: 'draft', pageSize: 100 })
                for (const d of (r && r.rows) || []) {
                    if (d._id === this.draftId) continue
                    for (const l of d.lines || []) taken[String(l.orderId)] = d.createdBy || '—'
                }
            } catch (e) { /* the save still refuses a clash */ }
            this.taken = taken
        },
        takenBy(r) {
            return this.taken[String(r._id)] || ''
        },
        // A line's category in the side menu (an unknown value files under Other).
        catOf(r) {
            return CATEGORIES.includes(r.category) ? r.category : 'Other'
        },
        catCount(c) {
            return (this.pendingByCat[c] || []).length
        },
        selectedInCat(c) {
            let n = 0
            for (const r of Object.values(this.selected)) if (this.catOf(r) === c) n++
            return n
        },
        toggleLine(r) {
            if (this.selected[r._id]) this.$delete(this.selected, r._id)
            else if (!this.takenBy(r)) this.$set(this.selected, r._id, r)
        },
        formPayload() {
            return { supplier: this.createForm.supplier || '', note: this.createForm.note || '', orderIds: Object.values(this.selected).map(x => x._id) }
        },
        // New or edited, it stays a draft: nothing is placed yet.
        async saveDraft() {
            const data = this.formPayload()
            if (!data.orderIds.length) return
            this.creating = true
            try {
                const r = this.draftId ? await updateOrderBatch(this.draftId, data) : await createOrderBatch(data)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('Draft saved'))
                if (r.skipped && r.skipped.length) this.$message.info(this.$tp('{n} skipped (no longer pending)', { n: r.skipped.length }))
                this.createVisible = false
                this.reload()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save the draft')))
            } finally {
                this.creating = false
            }
        },
        // Confirm: the lines become Ordered with the supplier and the batch
        // gets its number. From the edit form the latest picks go along.
        async askConfirm(n, supplier) {
            if (!supplier) { this.$message.warning(this.$tp('Pick a supplier before confirming')); return false }
            try {
                await this.$confirm(this.$tp('Place {n} line(s) with {supplier}? They become Ordered and the batch gets its number', { n, supplier }),
                    this.$tp('Confirm order'), { type: 'warning', confirmButtonText: this.$tp('Confirm order'), cancelButtonText: this.$tp('Cancel') })
                return true
            } catch (e) {
                return false
            }
        },
        confirmed(r) {
            this.$message.success(this.$tp('{no} confirmed — {n} line(s) placed with {supplier}', { no: r.batch.batchNo, n: r.batch.lineCount, supplier: r.batch.supplier }))
            if (r.skipped && r.skipped.length) this.$message.info(this.$tp('{n} line(s) left out — no longer pending', { n: r.skipped.length }))
        },
        async confirmForm() {
            const data = this.formPayload()
            if (!data.orderIds.length || !(await this.askConfirm(data.orderIds.length, data.supplier))) return
            this.confirming = true
            try {
                const r = await confirmOrderBatch(this.draftId, data)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.confirmed(r)
                this.createVisible = false
                this.reload()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to confirm the order batch')))
            } finally {
                this.confirming = false
            }
        },
        async confirmView() {
            const v = this.view
            if (!v || !(await this.askConfirm(v.lineCount || (v.lines || []).length, v.supplier))) return
            this.confirming = true
            try {
                const r = await confirmOrderBatch(v._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.confirmed(r)
                this.reload()
                this.openView(r.batch) // now with its number, open for the prices
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to confirm the order batch')))
            } finally {
                this.confirming = false
            }
        },
        async discard(id) {
            try {
                await this.$confirm(this.$tp('Delete this draft? Nothing has been ordered'), this.$tp('Delete draft'),
                    { type: 'warning', confirmButtonText: this.$tp('Delete'), cancelButtonText: this.$tp('Keep') })
            } catch (e) { return }
            this.discarding = true
            try {
                const r = await discardOrderBatch(id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('Draft deleted'))
                this.createVisible = false
                this.viewVisible = false
                this.reload()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to delete the draft')))
            } finally {
                this.discarding = false
            }
        },
        // ── View / prices ──────────────────────────────────────────
        async openView(row) {
            // a refresh of the batch already shown keeps it on screen meanwhile
            if (!this.view || this.view._id !== row._id) this.view = row
            this.cancelPriceEdit()
            this.viewVisible = true
            this.viewLoading = true
            try {
                const r = await getOrderBatch(row._id)
                if (r && r.batch) this.view = r.batch
            } catch (e) { /* the list's copy stands */ } finally {
                this.viewLoading = false
            }
        },
        // Lines already shipped keep the price they shipped with; a draft
        // hasn't gone to the supplier yet, so no prices on it.
        canPrice(l) {
            return this.can('spp:order:supply') && !this.isDraft(this.view) && ['pending', 'shortage', 'ordered'].includes(l.status)
        },
        shownPrice(l) {
            return l.currentPrice != null ? l.currentPrice : l.unitPrice
        },
        // The line total follows the price being typed.
        lineTotal(l) {
            const editing = this.priceEdit.orderId === String(l.orderId) && this.priceEdit.value != null
            const p = editing ? this.priceEdit.value : this.shownPrice(l)
            return p == null ? null : Math.round(p * (l.orderQty || 0) * 100) / 100
        },
        // ── Inline price editor ────────────────────────────────────
        startPriceEdit(l) {
            const p = this.shownPrice(l)
            this.priceEdit = { orderId: String(l.orderId), value: p == null ? undefined : p }
        },
        cancelPriceEdit() {
            this.priceEdit = { orderId: null, value: undefined }
        },
        // Enter: blur first so el-input-number commits, then save.
        priceEnter(evt, l) {
            if (evt && evt.target) evt.target.blur()
            this.$nextTick(() => this.savePriceEdit(l))
        },
        async savePriceEdit(l) {
            if (this.priceEdit.orderId !== String(l.orderId)) return
            const v = Number(this.priceEdit.value)
            if (this.priceEdit.value == null || this.priceEdit.value === '' || isNaN(v) || v < 0) {
                this.$message.warning(this.$tp('Enter a unit price of 0 or more')); return
            }
            const price = Math.round(v * 100) / 100
            this.priceSaving = true
            try {
                const r = await priceOrderBatch(this.view._id, { lines: [{ orderId: l.orderId, unitPrice: price }] })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                if (r.skipped && r.skipped.length) {
                    this.$message.info(this.$tp('{n} line(s) kept their shipped price', { n: r.skipped.length }))
                } else {
                    // the row and the list's Priced count follow without a reload
                    const line = (this.view.lines || []).find(x => String(x.orderId) === String(l.orderId))
                    if (line) { this.$set(line, 'unitPrice', price); this.$set(line, 'currentPrice', price) }
                    if (r.pricedCount != null) this.$set(this.view, 'pricedCount', r.pricedCount)
                    this.$message.success(this.$tp('Price saved'))
                }
                this.cancelPriceEdit()
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save the prices')))
            } finally {
                this.priceSaving = false
            }
        },
        // ── Part labels (50×40: product name + SKU barcode) ────────
        labelCount(batch) {
            return sppLabelCount(batch)
        },
        showLabels(build, fileName, title) {
            this.cleanupLabels()
            try {
                const doc = build()
                if (!doc) { this.$message.info(this.$tp('Nothing to print')); return }
                this.labelBuild = build
                this.labelFileName = fileName
                this.labelUrl = doc.output('bloburl') + '#toolbar=0'
                this.labelTitle = title
                this.labelVisible = true
            } catch (e) {
                this.$message.error(this.$tp('Could not build the labels'))
            }
        },
        // Label names without Device Brand / Series, looked up first.
        async printLineLabels(line) {
            const [named] = await withLabelNames([line])
            this.showLabels(() => buildSppLineLabelsPdf(named), sppLabelFileName(this.view, line), this.$tp('Labels') + ' — ' + (line.sku || line.productName))
        },
        async printAllLabels(batch) {
            const n = sppLabelCount(batch)
            if (!n) return
            const named = { ...batch, lines: await withLabelNames(batch.lines) }
            this.showLabels(() => buildSppBatchLabelsPdf(named), sppLabelFileName(batch), this.$tp('Labels') + ' — ' + (batch.batchNo || this.$tp('Draft')) + ' (' + n + ')')
        },
        // Portrait / landscape and 60 × 40 / 50 × 40: remembered for next
        // time, preview redrawn.
        onLabelOrientation(v) {
            setLabelOrientation(v)
            this.redrawLabels()
        },
        onLabelSize(v) {
            setLabelSize(v)
            this.redrawLabels()
        },
        redrawLabels() {
            if (!this.labelBuild) return
            try {
                const doc = this.labelBuild()
                if (!doc) return
                this.cleanupLabels()
                this.labelUrl = doc.output('bloburl') + '#toolbar=0'
            } catch (e) {
                this.$message.error(this.$tp('Could not build the labels'))
            }
        },
        printLabels() {
            if (!this.labelBuild) return
            const doc = this.labelBuild()
            doc.autoPrint()
            const w = window.open(doc.output('bloburl'))
            if (!w) this.$message.warning(this.$tp('Pop-up blocked — use Download instead'))
        },
        downloadLabels() {
            if (this.labelBuild) this.labelBuild().save(this.labelFileName)
        },
        cleanupLabels() {
            if (this.labelUrl) { try { URL.revokeObjectURL(this.labelUrl.replace('#toolbar=0', '')) } catch (e) { /* ignore */ } }
            this.labelUrl = ''
        },
        // ── The order list for the supplier ────────────────────────
        // Preview first; Print prints (or saves as PDF) the previewed document.
        preview(batch) {
            try {
                this.printHtml = orderListHtml(batch, (t, p) => this.$tp(t, p))
                this.printVisible = true
            } catch (e) {
                this.$message.error(this.$tp('Could not build the print list'))
            }
        },
        doPrint() {
            const f = this.$refs.printFrame
            try { f.contentWindow.focus(); f.contentWindow.print() } catch (e) { this.$message.error(this.$tp('Could not build the print list')) }
        },
        // SKU, product, quantity, price (blank until quoted), note.
        download(batch) {
            try {
                const t = k => this.$tp(k)
                const lines = batch.lines || []
                const data = lines.map((l, i) => ({
                    '#': i + 1,
                    ['SKU']: l.sku || '',
                    [t('Product')]: l.productName || '',
                    [t('Qty')]: l.orderQty,
                    [t('Unit Price')]: l.unitPrice != null ? l.unitPrice : (l.currentPrice != null ? l.currentPrice : ''),
                    [t('Note')]: l.note || ''
                }))
                const ws = XLSX.utils.json_to_sheet(data, { origin: 'A3' })
                XLSX.utils.sheet_add_aoa(ws, [[`${t('Order list')} ${batch.batchNo} — ${batch.supplier} — ${fmtDay(batch.createdAt)}`], []], { origin: 'A1' })
                ws['!cols'] = [4, 12, 70, 8, 12, 30].map(w => ({ wch: w }))
                const wb = XLSX.utils.book_new()
                XLSX.utils.book_append_sheet(wb, ws, String(batch.supplier || 'Order').replace(/[\\/?*[\]:]/g, ' ').slice(0, 30))
                XLSX.writeFile(wb, `${t('Order list')} ${batch.batchNo} - ${batch.supplier} - ${fmtDay(batch.createdAt)}.xlsx`)
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Export failed')))
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.spo-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.spo-title { font-size: 18px; font-weight: 600; color: #303133; }
.spo-spacer { flex: 1; }
.spo-search { width: 280px; }
.spo-no { font-weight: 600; padding: 0; }
.spo-dim { font-size: 11px; color: #909399; }
.spo-ok { color: #67c23a; font-weight: 600; }
.spo-warn { color: #e6a23c; font-weight: 600; }
.spo-pager { padding-top: 10px; text-align: right; }
.spo-dlg-head { font-size: 15px; font-weight: 600; color: #303133; i { color: #409eff; margin-right: 4px; } }
.spo-dlg-sub { margin-left: 8px; font-weight: 400; font-size: 13px; }
.spo-head-fields { display: flex; gap: 12px; margin-bottom: 10px; }
.spo-field { display: flex; flex-direction: column; gap: 3px; label { font-size: 12px; color: #909399; } }
.spo-field-supplier { min-width: 240px; }
.spo-field-grow { flex: 1; }
.spo-status { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; white-space: nowrap; }
.spo-hint { font-size: 12px; color: #909399; margin-bottom: 8px; i { margin-right: 3px; color: #e6a23c; } }
/* inline price editor */
.spo-pview { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; padding: 2px 4px; border-radius: 4px; &:hover { background: #f5f7fa; .spo-pencil { opacity: 1; } } }
.spo-pencil { font-size: 11px; color: #409eff; opacity: 0; transition: opacity .15s; }
.spo-pedit { display: inline-flex; align-items: center; gap: 2px; }
.spo-pinput { width: 90px; ::v-deep .el-input__inner { padding: 0 6px; text-align: right; } }
.spo-psave { color: #67c23a; padding: 2px; }
.spo-pcancel { color: #909399; padding: 2px; }
.spo-note { margin-top: 8px; font-size: 12px; }
.label-orient { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; color: #909399; flex-wrap: wrap; }
.label-orient-gap { margin-left: 12px; }
.spo-label-frame { width: 100%; height: 56vh; border: 1px solid #ebeef5; background: #fff; }
.spo-print-frame { width: 100%; height: 62vh; border: 1px solid #ebeef5; background: #fff; }
/* Create: category side menu + the category's lines */
.spo-picker { display: flex; height: 440px; border: 1px solid #ebeef5; border-radius: 6px; overflow: hidden; }
.spo-cats { flex: 0 0 200px; border-right: 1px solid #ebeef5; background: #fafafa; overflow: auto; }
.spo-cat {
    display: flex; align-items: center; gap: 6px; padding: 10px 12px; cursor: pointer; font-size: 13px; color: #303133;
    border-left: 3px solid transparent; user-select: none;
    &:hover { background: #f0f2f5; }
    &.on { background: #fff; border-left-color: #409eff; font-weight: 600; }
    &.empty { color: #909399; }
}
.spo-cat-name { flex: 1; }
.spo-cat-sel { font-size: 11px; color: #67c23a; font-weight: 600; i { margin-right: 1px; } }
.spo-cat-n {
    min-width: 22px; text-align: center; font-size: 11px; font-weight: 600; color: #f56c6c; background: #fef0f0;
    border-radius: 10px; padding: 1px 6px;
    &.is-zero { color: #c0c4cc; background: #f4f4f5; font-weight: 400; }
}
.spo-lines { flex: 1; overflow: auto; }
.spo-lines-empty { padding: 60px 20px; text-align: center; color: #909399; font-size: 13px; i { font-size: 28px; color: #dcdfe6; display: block; margin-bottom: 8px; } }
.spo-line {
    display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-bottom: 1px solid #f2f6fc; cursor: pointer; user-select: none;
    &:hover { background: #f5f7fa; }
    &.on { background: #ecf5ff; }
    &:last-child { border-bottom: 0; }
}
.spo-line-plus { color: #c0c4cc; font-size: 18px; }
.spo-line:hover .spo-line-plus { color: #409eff; }
.spo-line-check { color: #409eff; font-size: 18px; }
.spo-line-main { flex: 1; min-width: 0; line-height: 1.35; }
.spo-line-name { font-size: 13px; color: #303133; }
/* batch view: product name up to 2 lines, then "…" */
.spo-pname { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; word-break: break-word; line-height: 1.35; }
.spo-psku { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spo-line-short { color: #e6a23c; }
.spo-line-qty { font-size: 13px; font-weight: 600; color: #303133; white-space: nowrap; font-variant-numeric: tabular-nums; }
.spo-foot-sum { float: left; line-height: 32px; font-size: 12px; color: #909399; }
.spo-draft-tag { cursor: pointer; }
.spo-del { color: #f56c6c; margin-right: 8px; }
.spo-del-row { color: #f56c6c; }
.spo-foot-left { float: left; }
.spo-line.taken { cursor: not-allowed; opacity: .55; &:hover { background: transparent; } }
.spo-line-lock { color: #c0c4cc; font-size: 16px; }
.spo-line-taken { color: #e6a23c; }
</style>
