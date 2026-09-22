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
            <el-table-column :label="$tp('Batch')" width="110">
                <template slot-scope="s"><el-button type="text" class="spo-no" @click="openView(s.row)">{{ s.row.batchNo }}</el-button></template>
            </el-table-column>
            <el-table-column :label="$tp('Date')" width="104" align="center">
                <template slot-scope="s">{{ fmtDay(s.row.createdAt) }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Supplier')" width="140" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.supplier }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Lines')" width="70" align="center">
                <template slot-scope="s">{{ s.row.lineCount }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Pcs')" width="70" align="center">
                <template slot-scope="s">{{ s.row.totalQty }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Priced')" width="96" align="center">
                <template slot-scope="s">
                    <span :class="(s.row.pricedCount || 0) >= s.row.lineCount ? 'spo-ok' : 'spo-warn'">{{ s.row.pricedCount || 0 }} / {{ s.row.lineCount }}</span>
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
            <el-table-column :label="$tp('Actions')" width="220" align="center">
                <template slot-scope="s">
                    <el-button type="text" size="mini" icon="el-icon-view" @click="openView(s.row)">{{ $tp('View') }}</el-button>
                    <el-button type="text" size="mini" icon="el-icon-download" @click="download(s.row)">{{ $tp('List') }}</el-button>
                    <el-button v-if="can('spp:order:supply')" type="text" size="mini" icon="el-icon-price-tag" class="spo-price"
                        @click="openView(s.row, true)">{{ $tp('Prices') }}</el-button>
                </template>
            </el-table-column>
        </el-table>

        <div class="spo-pager">
            <el-pagination background layout="total, sizes, prev, pager, next" :total="total" :page-size="pageSize"
                :page-sizes="[10, 20, 50]" :current-page="page" @current-change="onPage" @size-change="onSize" />
        </div>

        <!-- ── Create: pick pending lines, pick a supplier ───────────── -->
        <el-dialog :visible.sync="createVisible" width="980px" append-to-body top="4vh" @closed="clearQuery">
            <div slot="title" class="spo-dlg-head"><i class="el-icon-document-checked" /> {{ $tp('Create Order Batch') }}</div>
            <div class="spo-head-fields">
                <div class="spo-field spo-field-supplier">
                    <label>{{ $tp('Supplier') }} *</label>
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
            <div class="spo-pick-bar">
                <el-select v-model="pick.category" size="small" clearable :placeholder="$tp('All categories')" style="width:170px" @change="loadPending">
                    <el-option v-for="c in CATEGORIES" :key="c" :label="$tp(c)" :value="c" />
                </el-select>
                <el-input v-model="pick.search" size="small" clearable prefix-icon="el-icon-search" style="width:260px"
                    :placeholder="$tp('Product, SKU…')" @keyup.enter.native="loadPending" @clear="loadPending" />
                <span class="spo-dim">{{ $tp('{n} pending line(s)', { n: pending.length }) }} · {{ $tp('{n} line(s) selected', { n: selection.length }) }}</span>
            </div>
            <el-table ref="pickTable" v-loading="pendingLoading" :data="pending" size="mini" border max-height="400"
                :empty-text="$tp('No pending lines')" @selection-change="v => selection = v">
                <el-table-column type="selection" width="44" />
                <el-table-column :label="$tp('Date')" width="100" align="center">
                    <template slot-scope="s">{{ fmtDay(s.row.createdAt) }}</template>
                </el-table-column>
                <el-table-column :label="$tp('Product')" min-width="300" show-overflow-tooltip>
                    <template slot-scope="s">
                        <div>{{ s.row.productName }}</div>
                        <div class="spo-dim">SKU: {{ s.row.sku || '—' }}<span v-if="s.row.category"> · {{ $tp(s.row.category) }}</span></div>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Qty')" width="70" align="center">
                    <template slot-scope="s">{{ s.row.orderQty }}</template>
                </el-table-column>
                <el-table-column :label="$tp('Status')" width="96" align="center">
                    <template slot-scope="s"><span class="spo-status" :style="statusStyle(s.row.status)">{{ statusLabel(s.row.status) }}</span></template>
                </el-table-column>
                <el-table-column :label="$tp('Note')" min-width="140" show-overflow-tooltip>
                    <template slot-scope="s">{{ s.row.note || '—' }}</template>
                </el-table-column>
            </el-table>
            <span slot="footer">
                <el-button size="small" @click="createVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button type="primary" size="small" icon="el-icon-download" :loading="creating" :disabled="!selection.length"
                    @click="submitCreate">{{ $tp('Place {n} line(s) & download list', { n: selection.length }) }}</el-button>
            </span>
        </el-dialog>

        <!-- ── View, and key the supplier's prices back in ──────────── -->
        <el-dialog :visible.sync="viewVisible" width="900px" append-to-body top="4vh" @closed="pricing = false">
            <div slot="title" class="spo-dlg-head"><i class="el-icon-tickets" /> {{ view ? view.batchNo : '' }}
                <span v-if="view" class="spo-dim spo-dlg-sub">{{ view.supplier }} · {{ fmtDay(view.createdAt) }}</span></div>
            <div v-if="view" v-loading="viewLoading">
                <div v-if="pricing" class="spo-hint"><i class="el-icon-price-tag" />
                    {{ $tp('Enter the supplier unit prices; Save writes them onto the order lines. Lines that already shipped keep their price.') }}</div>
                <el-table :data="view.lines" size="mini" border max-height="440">
                    <el-table-column label="#" type="index" width="40" align="center" />
                    <el-table-column :label="$tp('Product')" min-width="280" show-overflow-tooltip>
                        <template slot-scope="s">
                            <div>{{ s.row.productName }}</div>
                            <div class="spo-dim">SKU: {{ s.row.sku || '—' }}<span v-if="s.row.category"> · {{ $tp(s.row.category) }}</span></div>
                        </template>
                    </el-table-column>
                    <el-table-column :label="$tp('Qty')" width="70" align="center">
                        <template slot-scope="s">{{ s.row.orderQty }}</template>
                    </el-table-column>
                    <el-table-column :label="$tp('Status')" width="96" align="center">
                        <template slot-scope="s"><span class="spo-status" :style="statusStyle(s.row.status)">{{ statusLabel(s.row.status) }}</span></template>
                    </el-table-column>
                    <el-table-column :label="$tp('Unit Price')" width="130" align="center">
                        <template slot-scope="s">
                            <el-input-number v-if="pricing && priceEditable(s.row)" v-model="priceForm[String(s.row.orderId)]" size="mini"
                                :min="0" :precision="2" :controls="false" placeholder="¥" style="width:100px" />
                            <template v-else>{{ yuan(shownPrice(s.row)) }}</template>
                        </template>
                    </el-table-column>
                    <el-table-column :label="$tp('Line total')" width="110" align="right">
                        <template slot-scope="s">{{ yuan(lineTotal(s.row)) }}</template>
                    </el-table-column>
                </el-table>
                <div v-if="view.note" class="spo-dim spo-note">{{ $tp('Note') }}: {{ view.note }}</div>
            </div>
            <span slot="footer">
                <el-button size="small" icon="el-icon-download" @click="download(view)">{{ $tp('Download list') }}</el-button>
                <el-button v-if="!pricing && can('spp:order:supply')" size="small" icon="el-icon-price-tag" @click="startPricing">{{ $tp('Enter prices') }}</el-button>
                <el-button v-if="pricing" type="primary" size="small" icon="el-icon-check" :loading="savingPrices" @click="savePrices">{{ $tp('Save prices') }}</el-button>
                <el-button size="small" @click="viewVisible = false">{{ $tp('Close') }}</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import * as XLSX from 'xlsx-js-style'
import { hasPermission } from '@/utils/permission'
import { listOrderBatches, getOrderBatch, createOrderBatch, priceOrderBatch, listOrders, getMeta } from '@/api/sparePartsPurchase'
import { STATUS_META, CATEGORIES, fmtDay, fmtWhen, yuan } from './shared'

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
            // create
            createVisible: false,
            createForm: { supplier: '', note: '' },
            pick: { category: '', search: '' },
            pending: [],
            pendingLoading: false,
            selection: [],
            creating: false,
            // view / prices
            viewVisible: false,
            viewLoading: false,
            view: null,
            pricing: false,
            priceForm: {},
            savingPrices: false
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
        async openCreate() {
            this.createForm = { supplier: '', note: '' }
            this.pick = { category: '', search: '' }
            this.selection = []
            this.createVisible = true
            this.loadPending()
            if (!this.suppliers.length) {
                try {
                    const r = await getMeta()
                    this.suppliers = (r && r.suppliers) || []
                } catch (e) { /* the select still allows typing */ }
            }
        },
        // Every line still waiting to be placed (pending or shortage), oldest first.
        async loadPending() {
            this.pendingLoading = true
            try {
                const r = await listOrders({ status: 'pending,shortage', category: this.pick.category || undefined, search: this.pick.search || undefined, sort: 'oldest', page: 1, pageSize: 200 })
                this.pending = (r && r.rows) || []
            } catch (e) {
                this.pending = []
            } finally {
                this.pendingLoading = false
            }
        },
        async submitCreate() {
            if (!this.createForm.supplier) { this.$message.warning(this.$tp('Supplier is required')); return }
            if (!this.selection.length) return
            this.creating = true
            try {
                const r = await createOrderBatch({ supplier: this.createForm.supplier, note: this.createForm.note, orderIds: this.selection.map(x => x._id) })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('{no} created — {n} line(s) placed with {supplier}', { no: r.batch.batchNo, n: r.batch.lineCount, supplier: r.batch.supplier }))
                if (r.skipped && r.skipped.length) this.$message.info(this.$tp('{n} skipped (no longer pending)', { n: r.skipped.length }))
                this.download(r.batch)
                this.createVisible = false
                this.reload()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to create the order batch')))
            } finally {
                this.creating = false
            }
        },
        // ── View / prices ──────────────────────────────────────────
        async openView(row, pricing = false) {
            // a refresh of the batch already shown keeps it on screen meanwhile
            if (!this.view || this.view._id !== row._id) this.view = row
            this.pricing = false
            this.viewVisible = true
            this.viewLoading = true
            try {
                const r = await getOrderBatch(row._id)
                if (r && r.batch) this.view = r.batch
            } catch (e) { /* the list's copy stands */ } finally {
                this.viewLoading = false
            }
            if (pricing) this.startPricing()
        },
        priceEditable(l) {
            return ['pending', 'shortage', 'ordered'].includes(l.status)
        },
        shownPrice(l) {
            return l.currentPrice != null ? l.currentPrice : l.unitPrice
        },
        lineTotal(l) {
            const p = this.pricing && this.priceEditable(l) && this.priceForm[String(l.orderId)] != null ? this.priceForm[String(l.orderId)] : this.shownPrice(l)
            return p == null ? null : Math.round(p * (l.orderQty || 0) * 100) / 100
        },
        startPricing() {
            const f = {}
            for (const l of (this.view && this.view.lines) || []) {
                const p = this.shownPrice(l)
                f[String(l.orderId)] = p == null ? undefined : p
            }
            this.priceForm = f
            this.pricing = true
        },
        async savePrices() {
            const lines = Object.keys(this.priceForm)
                .filter(k => this.priceForm[k] != null && this.priceForm[k] !== '')
                .map(k => ({ orderId: k, unitPrice: this.priceForm[k] }))
            if (!lines.length) { this.$message.warning(this.$tp('Enter at least one price')); return }
            this.savingPrices = true
            try {
                const r = await priceOrderBatch(this.view._id, { lines })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('{n} price(s) saved', { n: r.updated }))
                if (r.skipped && r.skipped.length) this.$message.info(this.$tp('{n} line(s) kept their shipped price', { n: r.skipped.length }))
                this.pricing = false
                await this.openView(this.view)
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save the prices')))
            } finally {
                this.savingPrices = false
            }
        },
        // ── The order list for the supplier ────────────────────────
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
.spo-price { color: #e6a23c; }
.spo-pager { padding-top: 10px; text-align: right; }
.spo-dlg-head { font-size: 15px; font-weight: 600; color: #303133; i { color: #409eff; margin-right: 4px; } }
.spo-dlg-sub { margin-left: 8px; font-weight: 400; font-size: 13px; }
.spo-head-fields { display: flex; gap: 12px; margin-bottom: 10px; }
.spo-field { display: flex; flex-direction: column; gap: 3px; label { font-size: 12px; color: #909399; } }
.spo-field-supplier { min-width: 240px; }
.spo-field-grow { flex: 1; }
.spo-pick-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.spo-status { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; white-space: nowrap; }
.spo-hint { font-size: 12px; color: #909399; margin-bottom: 8px; i { margin-right: 3px; color: #e6a23c; } }
.spo-note { margin-top: 8px; font-size: 12px; }
</style>
