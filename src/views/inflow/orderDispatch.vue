<template>
    <div class="inflow-dispatch app-container">
        <div class="od-filters">
            <el-input v-model="query.search" size="small" clearable class="f-search"
                placeholder="Search invoice / customer / SKU…" prefix-icon="el-icon-search"
                @keyup.enter.native="reload" @clear="reload" />
            <span class="od-spacer" />
            <span class="od-meta">{{ total.toLocaleString() }} orders</span>
            <el-button size="small" icon="el-icon-refresh" @click="load">Refresh</el-button>
            <el-button size="small" type="primary" icon="el-icon-search" @click="reload">Search</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini" row-key="_id" height="calc(100vh - 210px)">
            <el-table-column type="expand">
                <template slot-scope="s">
                    <el-table :data="s.row.lineItems" size="mini" border class="od-lines">
                        <el-table-column label="iMobile SKU" min-width="150">
                            <template slot-scope="li">
                                <b v-if="li.row.imbSku">{{ li.row.imbSku }}</b>
                                <span v-else class="od-dim">— not mapped</span>
                            </template>
                        </el-table-column>
                        <el-table-column label="Barcode" min-width="140" show-overflow-tooltip>
                            <template slot-scope="li">{{ li.row.sku || '—' }}</template>
                        </el-table-column>
                        <el-table-column label="Description" min-width="240" show-overflow-tooltip>
                            <template slot-scope="li">{{ li.row.description || '—' }}</template>
                        </el-table-column>
                        <el-table-column label="Ordered" width="90" align="right">
                            <template slot-scope="li">{{ li.row.quantity }}</template>
                        </el-table-column>
                        <el-table-column label="Dispatched QTY" width="160" align="center">
                            <template slot-scope="li">
                                <el-input-number
                                    :value="li.row.dispatchedQty == null ? 0 : li.row.dispatchedQty"
                                    :min="0" :max="Number(li.row.quantity) || undefined"
                                    :disabled="savingKey === lineKey(s.row, li.$index)"
                                    size="mini" class="od-qty"
                                    @change="v => saveQty(s.row, li.$index, v)" />
                            </template>
                        </el-table-column>
                        <el-table-column label="" width="80" align="center">
                            <template slot-scope="li">
                                <i v-if="savingKey === lineKey(s.row, li.$index)" class="el-icon-loading" />
                                <el-tag v-else-if="lineDone(li.row)" size="mini" type="success">Done</el-tag>
                                <el-tag v-else-if="Number(li.row.dispatchedQty) > 0" size="mini" type="warning">Partial</el-tag>
                            </template>
                        </el-table-column>
                    </el-table>
                </template>
            </el-table-column>
            <el-table-column prop="invoiceNumber" label="Invoice #" min-width="180">
                <template slot-scope="s">
                    <div class="od-inv">{{ s.row.invoiceNumber }}</div>
                    <div v-if="s.row.vendor" class="od-vendor" :title="s.row.vendor">{{ s.row.vendor }}</div>
                </template>
            </el-table-column>
            <el-table-column prop="customerName" label="Customer" min-width="170" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.customerName || '—' }}</template>
            </el-table-column>
            <el-table-column label="Date" width="110">
                <template slot-scope="s">{{ dateStr(s.row) }}</template>
            </el-table-column>
            <el-table-column label="Items" width="90" align="right">
                <template slot-scope="s">{{ (s.row.lineItems || []).length }}</template>
            </el-table-column>
            <el-table-column label="Dispatched" width="140" align="center">
                <template slot-scope="s">
                    <span :class="{ 'od-done': s.row.dispatchStatus === 'dispatched' }">
                        {{ s.row.dispatchedQty }} / {{ s.row.orderedQty }} units
                    </span>
                </template>
            </el-table-column>
            <el-table-column label="Status" width="110" align="center">
                <template slot-scope="s">
                    <el-tag size="mini" :type="dispatchTag(s.row.dispatchStatus)">{{ dispatchLabel(s.row.dispatchStatus) }}</el-tag>
                </template>
            </el-table-column>
        </el-table>

        <div class="od-pager">
            <el-pagination background layout="total, sizes, prev, pager, next, jumper"
                :total="total" :page-size="query.pageSize" :page-sizes="[25, 50, 100, 200]"
                :current-page="query.page" @current-change="onPage" @size-change="onSize" />
        </div>
    </div>
</template>

<script>
import { getInflowDispatch, setInflowDispatchQty } from '@/api/inflow'

export default {
    name: 'InflowOrderDispatch',
    data() {
        return {
            loading: false,
            rows: [],
            total: 0,
            query: { page: 1, pageSize: 25, search: '' },
            savingKey: ''
        }
    },
    created() {
        this.load()
    },
    // Page is kept alive — refresh when the user navigates back (new SKU
    // mappings uploaded on the Sales Orders page should show up here).
    activated() {
        this.load()
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await getInflowDispatch(this.query)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.rows || []
                this.total = r.total || 0
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load dispatch orders'))
            } finally {
                this.loading = false
            }
        },
        reload() { this.query.page = 1; this.load() },
        onPage(p) { this.query.page = p; this.load() },
        onSize(s) { this.query.pageSize = s; this.query.page = 1; this.load() },
        lineKey(order, index) { return `${order._id}:${index}` },
        lineDone(li) { return Number(li.dispatchedQty) >= (Number(li.quantity) || 0) && Number(li.quantity) > 0 },
        async saveQty(order, lineIndex, qty) {
            const line = order.lineItems[lineIndex]
            const prev = line.dispatchedQty == null ? 0 : line.dispatchedQty
            const next = Number(qty)
            if (!isFinite(next) || next === prev) return
            this.savingKey = this.lineKey(order, lineIndex)
            try {
                const r = await setInflowDispatchQty(order._id, { lineIndex, qty: next })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$set(line, 'dispatchedQty', next)
                this.refreshOrderTotals(order)
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to save dispatched qty'))
                this.$set(line, 'dispatchedQty', prev)
            } finally {
                this.savingKey = ''
            }
        },
        // Keep the order row's summary + status tag in sync without a reload.
        refreshOrderTotals(order) {
            const items = order.lineItems || []
            const ordered = items.reduce((s, li) => s + (Number(li.quantity) || 0), 0)
            const dispatched = items.reduce((s, li) => s + (Number(li.dispatchedQty) || 0), 0)
            this.$set(order, 'orderedQty', ordered)
            this.$set(order, 'dispatchedQty', dispatched)
            this.$set(order, 'dispatchStatus', dispatched <= 0 ? 'pending' : dispatched < ordered ? 'partial' : 'dispatched')
        },
        dispatchTag(s) { return { pending: 'danger', partial: 'warning', dispatched: 'success' }[s] || 'info' },
        dispatchLabel(s) { return { pending: 'Pending', partial: 'Partial', dispatched: 'Dispatched' }[s] || s },
        dateStr(o) {
            if (o && o.invoiceDateRaw) return o.invoiceDateRaw
            if (o && o.invoiceDate) { const d = new Date(o.invoiceDate); if (!isNaN(d)) return d.toLocaleDateString('en-AU') }
            return '—'
        },
        msg(e, fallback) { return (e.response && e.response.data && e.response.data.message) || e.message || fallback }
    }
}
</script>

<style lang="scss" scoped>
.inflow-dispatch { padding: 12px 16px; }
.od-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.f-search { width: 260px; }
.od-spacer { flex: 1; }
.od-meta { font-size: 12px; color: #909399; margin-right: 6px; white-space: nowrap; }
.od-pager { margin-top: 10px; text-align: right; }
.od-inv { line-height: 1.3; font-weight: 600; }
.od-vendor { font-size: 11px; color: #909399; line-height: 1.3; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.od-lines { margin: 4px 12px; width: calc(100% - 24px); }
.od-dim { color: #C0C4CC; }
.od-qty { width: 120px; }
.od-done { color: #67C23A; font-weight: 600; }
</style>
