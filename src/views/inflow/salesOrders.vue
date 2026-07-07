<template>
    <div class="inflow-orders app-container">
        <div class="io-filters">
            <el-input v-model="query.search" size="small" clearable class="f-search"
                placeholder="Search invoice / customer / vendor…" prefix-icon="el-icon-search"
                @keyup.enter.native="reload" @clear="reload" />
            <el-select v-model="query.customer" size="small" clearable filterable placeholder="Customer" class="f-sel-w" @change="reload">
                <el-option v-for="c in filters.customers" :key="c" :label="c" :value="c" />
            </el-select>
            <el-select v-model="query.vendor" size="small" clearable filterable placeholder="Vendor" class="f-sel-w" @change="reload">
                <el-option v-for="v in filters.vendors" :key="v" :label="v" :value="v" />
            </el-select>
            <el-select v-model="query.status" size="small" clearable placeholder="Status" class="f-sel" @change="reload">
                <el-option label="Unpaid" value="unpaid" />
                <el-option label="Partial" value="partial" />
                <el-option label="Paid" value="paid" />
                <el-option label="Credit note" value="credit" />
            </el-select>
            <el-date-picker v-model="dateRange" size="small" type="daterange" value-format="yyyy-MM-dd"
                start-placeholder="From" end-placeholder="To" class="f-date" @change="onDateRange" />
            <span class="io-spacer" />
            <span class="io-meta">{{ total.toLocaleString() }} orders</span>
            <el-button size="small" @click="resetFilters">Reset</el-button>
            <el-button size="small" type="primary" icon="el-icon-search" @click="reload">Search</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini" height="calc(100vh - 210px)" @sort-change="onSort">
            <el-table-column prop="invoiceNumber" label="Invoice #" min-width="200" sortable="custom">
                <template slot-scope="s">
                    <div class="io-inv">
                        <el-link type="primary" :underline="false" @click="openDetail(s.row)">{{ s.row.invoiceNumber }}</el-link>
                        <el-tag v-if="s.row.isCreditNote" size="mini" type="info" class="io-cn">CN</el-tag>
                    </div>
                    <div v-if="s.row.vendor" class="io-vendor" :title="s.row.vendor">{{ s.row.vendor }}</div>
                </template>
            </el-table-column>
            <el-table-column prop="customerName" label="Customer" min-width="180" sortable="custom" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.customerName || '—' }}</template>
            </el-table-column>
            <el-table-column prop="invoiceDate" label="Date" width="110" sortable="custom">
                <template slot-scope="s">{{ dateStr(s.row) }}</template>
            </el-table-column>
            <el-table-column prop="lineItemCount" label="Items" width="80" align="right">
                <template slot-scope="s">{{ s.row.lineItemCount == null ? '—' : s.row.lineItemCount }}</template>
            </el-table-column>
            <el-table-column prop="totalAmount" label="Total" width="120" align="right" sortable="custom">
                <template slot-scope="s"><span :class="{ neg: s.row.totalAmount < 0 }">{{ money(s.row.totalAmount) }}</span></template>
            </el-table-column>
            <el-table-column prop="paidAmount" label="Paid" width="110" align="right" sortable="custom">
                <template slot-scope="s">{{ money(s.row.paidAmount) }}</template>
            </el-table-column>
            <el-table-column prop="balance" label="Balance" width="120" align="right" sortable="custom">
                <template slot-scope="s"><span :class="{ neg: s.row.balance < 0, owing: s.row.balance > 0 }">{{ money(s.row.balance) }}</span></template>
            </el-table-column>
            <el-table-column prop="status" label="Status" width="100" align="center">
                <template slot-scope="s"><el-tag size="mini" :type="statusTag(s.row.status)">{{ statusLabel(s.row.status) }}</el-tag></template>
            </el-table-column>
            <el-table-column label="" width="200" align="right">
                <template slot-scope="s">
                    <el-button v-if="s.row.invoicePdfUrl" size="mini" type="text" icon="el-icon-document" @click="openPdf(s.row)">Invoice</el-button>
                    <el-button v-if="s.row.status !== 'credit'" v-hasPermi="['inflow:order:payment']" size="mini" type="text" @click="openPayment(s.row)">Record Payment</el-button>
                </template>
            </el-table-column>
        </el-table>

        <div class="io-pager">
            <el-pagination background layout="total, sizes, prev, pager, next, jumper"
                :total="total" :page-size="query.pageSize" :page-sizes="[25, 50, 100, 200]"
                :current-page="query.page" @current-change="onPage" @size-change="onSize" />
        </div>

        <!-- Detail dialog -->
        <el-dialog :title="detail ? detail.invoiceNumber : 'Order'" :visible.sync="detailVisible" width="740px" top="6vh">
            <div v-loading="detailLoading">
                <template v-if="detail">
                    <el-descriptions :column="2" size="small" border class="io-desc">
                        <el-descriptions-item label="Customer">{{ detail.customerName || '—' }}</el-descriptions-item>
                        <el-descriptions-item label="Vendor">{{ detail.vendor || '—' }}</el-descriptions-item>
                        <el-descriptions-item label="Invoice date">{{ dateStr(detail) }}</el-descriptions-item>
                        <el-descriptions-item label="Status"><el-tag size="mini" :type="statusTag(detail.status)">{{ statusLabel(detail.status) }}</el-tag></el-descriptions-item>
                        <el-descriptions-item label="Subtotal">{{ money(detail.subtotal) }}</el-descriptions-item>
                        <el-descriptions-item label="Tax">{{ money(detail.tax) }}</el-descriptions-item>
                        <el-descriptions-item label="Total"><b :class="{ neg: detail.totalAmount < 0 }">{{ money(detail.totalAmount) }}</b></el-descriptions-item>
                        <el-descriptions-item label="Paid / Balance">{{ money(detail.paidAmount) }} / <b :class="{ owing: detail.balance > 0 }">{{ money(detail.balance) }}</b></el-descriptions-item>
                    </el-descriptions>

                    <div class="io-sub">Line items</div>
                    <el-table :data="detail.lineItems || []" size="mini" border>
                        <el-table-column prop="description" label="Description" min-width="240" show-overflow-tooltip />
                        <el-table-column prop="quantity" label="Qty" width="70" align="right" />
                        <el-table-column label="Unit price" width="110" align="right"><template slot-scope="s">{{ money(s.row.unitPrice) }}</template></el-table-column>
                        <el-table-column label="Subtotal" width="120" align="right"><template slot-scope="s">{{ money(s.row.subTotal) }}</template></el-table-column>
                    </el-table>

                    <div class="io-sub">Payments <span v-if="detail.payments && detail.payments.length" class="io-count">({{ detail.payments.length }})</span></div>
                    <el-table v-if="detail.payments && detail.payments.length" :data="detail.payments" size="mini" border>
                        <el-table-column label="Date" width="130"><template slot-scope="s">{{ dateOnly(s.row.date) }}</template></el-table-column>
                        <el-table-column label="Amount" width="130" align="right"><template slot-scope="s">{{ money(s.row.amount) }}</template></el-table-column>
                        <el-table-column prop="note" label="Note" min-width="200" show-overflow-tooltip />
                        <el-table-column label="" width="50" align="center">
                            <template slot-scope="s">
                                <el-button v-hasPermi="['inflow:order:payment']" size="mini" type="text" class="io-del" icon="el-icon-delete" @click="deletePayment(s.row)" />
                            </template>
                        </el-table-column>
                    </el-table>
                    <div v-else class="io-empty">No payments recorded.</div>
                </template>
            </div>
            <span slot="footer">
                <el-button v-if="detail && detail.invoicePdfUrl" size="small" icon="el-icon-document" @click="openPdf(detail)">View Invoice</el-button>
                <el-button v-if="detail && detail.status !== 'credit'" v-hasPermi="['inflow:order:payment']" type="primary" size="small" @click="openPayment(detail)">Record Payment</el-button>
                <el-button size="small" @click="detailVisible = false">Close</el-button>
            </span>
        </el-dialog>

        <!-- Payment dialog -->
        <el-dialog title="Record Payment" :visible.sync="payVisible" width="420px">
            <div v-if="payOrder" class="io-payinfo">
                {{ payOrder.invoiceNumber }} · balance <b :class="{ owing: (payOrder.balance) > 0 }">{{ money(payOrder.balance) }}</b>
            </div>
            <el-form label-width="90px" size="small">
                <el-form-item label="Amount">
                    <el-input-number v-model="payForm.amount" :precision="2" :step="100" :controls="false" style="width:100%" placeholder="0.00" />
                    <el-button v-if="payOrder && payOrder.balance > 0" type="text" size="mini" @click="payForm.amount = round2(payOrder.balance)">Pay full balance</el-button>
                </el-form-item>
                <el-form-item label="Date">
                    <el-date-picker v-model="payForm.date" type="date" value-format="yyyy-MM-dd" style="width:100%" />
                </el-form-item>
                <el-form-item label="Note">
                    <el-input v-model="payForm.note" type="textarea" :rows="2" resize="none" placeholder="Optional" />
                </el-form-item>
            </el-form>
            <span slot="footer">
                <el-button size="small" @click="payVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" :loading="paying" @click="submitPayment">Record</el-button>
            </span>
        </el-dialog>

        <!-- Invoice PDF preview -->
        <el-dialog :title="(pdfTitle || 'Invoice') + ' — Invoice PDF'" :visible.sync="pdfVisible" width="60%" top="7vh">
            <div class="io-pdf-wrap">
                <iframe v-if="pdfUrl" :src="pdfUrl" class="io-pdf-frame" title="Invoice PDF" />
            </div>
            <span slot="footer">
                <el-link v-if="pdfUrl" type="primary" :href="pdfUrl" target="_blank" rel="noopener" :underline="false" class="io-pdf-open"><i class="el-icon-top-right" /> Open in new tab</el-link>
                <el-button size="small" @click="pdfVisible = false">Close</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import { getInflowOrders, getInflowOrder, recordInflowPayment, deleteInflowPayment, getInflowFilters } from '@/api/inflow'

export default {
    name: 'InflowSalesOrders',
    data() {
        return {
            loading: false,
            rows: [],
            total: 0,
            filters: { customers: [], vendors: [] },
            dateRange: [],
            query: {
                page: 1, pageSize: 25,
                search: '', customer: '', vendor: '', status: '', type: '',
                dateFrom: '', dateTo: '', sort: 'invoiceDate', order: 'desc'
            },
            detailVisible: false, detail: null, detailLoading: false,
            payVisible: false, payOrder: null, paying: false,
            payForm: { amount: null, date: this.today(), note: '' },
            pdfVisible: false, pdfUrl: '', pdfTitle: ''
        }
    },
    created() {
        if (this.$route.query.customer) this.query.customer = String(this.$route.query.customer)
        this.loadFilters()
        this.load()
    },
    methods: {
        async loadFilters() {
            try {
                const r = await getInflowFilters()
                if (r && r.success) this.filters = { customers: r.customers || [], vendors: r.vendors || [] }
            } catch (e) { /* non-fatal */ }
        },
        async load() {
            this.loading = true
            try {
                const r = await getInflowOrders(this.query)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.rows || []
                this.total = r.total || 0
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load sales orders'))
            } finally {
                this.loading = false
            }
        },
        reload() { this.query.page = 1; this.load() },
        onPage(p) { this.query.page = p; this.load() },
        onSize(s) { this.query.pageSize = s; this.query.page = 1; this.load() },
        onSort({ prop, order }) {
            const map = { invoiceNumber: 'invoiceNumber', customerName: 'customerName', invoiceDate: 'invoiceDate', totalAmount: 'totalAmount', paidAmount: 'paidAmount', balance: 'balance' }
            if (order) { this.query.sort = map[prop] || 'invoiceDate'; this.query.order = order === 'ascending' ? 'asc' : 'desc' }
            else { this.query.sort = 'invoiceDate'; this.query.order = 'desc' }
            this.query.page = 1
            this.load()
        },
        onDateRange(v) {
            this.query.dateFrom = v && v[0] ? v[0] : ''
            this.query.dateTo = v && v[1] ? v[1] : ''
            this.reload()
        },
        resetFilters() {
            this.dateRange = []
            Object.assign(this.query, { search: '', customer: '', vendor: '', status: '', type: '', dateFrom: '', dateTo: '', page: 1 })
            this.load()
        },
        async openDetail(row) {
            this.detailVisible = true
            this.detail = row
            this.detailLoading = true
            try {
                const r = await getInflowOrder(row._id)
                if (r && r.success) this.detail = r.order
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load order'))
            } finally {
                this.detailLoading = false
            }
        },
        openPdf(row) {
            if (!row || !row.invoicePdfUrl) { this.$message.warning('No invoice PDF for this order.'); return }
            this.pdfUrl = row.invoicePdfUrl
            this.pdfTitle = row.invoiceNumber || ''
            this.pdfVisible = true
        },
        openPayment(row) {
            this.payOrder = row
            this.payForm = { amount: row.balance > 0 ? this.round2(row.balance) : null, date: this.today(), note: '' }
            this.payVisible = true
        },
        async submitPayment() {
            const amount = Number(this.payForm.amount)
            if (!isFinite(amount) || amount === 0) { this.$message.warning('Enter a non-zero amount.'); return }
            this.paying = true
            try {
                const r = await recordInflowPayment(this.payOrder._id, { amount, date: this.payForm.date, note: this.payForm.note })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success('Payment recorded')
                this.payVisible = false
                // reflect in the open detail + the row
                if (this.detail && this.detail._id === r.order._id) this.detail = r.order
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to record payment'))
            } finally {
                this.paying = false
            }
        },
        deletePayment(payment) {
            this.$confirm(`Delete this payment of ${this.money(payment.amount)}?`, 'Delete payment', {
                type: 'warning', confirmButtonText: 'Delete', cancelButtonText: 'Cancel'
            }).then(async () => {
                try {
                    const r = await deleteInflowPayment(this.detail._id, payment._id)
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    this.$message.success('Payment deleted')
                    this.detail = r.order
                    this.load()
                } catch (e) {
                    this.$message.error(this.msg(e, 'Failed to delete payment'))
                }
            }).catch(() => {})
        },
        statusTag(s) { return { unpaid: 'danger', partial: 'warning', paid: 'success', credit: 'info' }[s] || 'info' },
        statusLabel(s) { return { unpaid: 'Unpaid', partial: 'Partial', paid: 'Paid', credit: 'Credit' }[s] || s },
        dateStr(o) {
            if (o && o.invoiceDateRaw) return o.invoiceDateRaw
            if (o && o.invoiceDate) { const d = new Date(o.invoiceDate); if (!isNaN(d)) return d.toLocaleDateString('en-AU') }
            return '—'
        },
        dateOnly(v) { if (!v) return '—'; const d = new Date(v); return isNaN(d) ? '—' : d.toLocaleDateString('en-AU') },
        money(v) {
            const n = Number(v)
            if (!isFinite(n)) return '—'
            return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        },
        round2(v) { return Math.round(Number(v) * 100) / 100 },
        today() { const d = new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` },
        msg(e, fallback) { return (e.response && e.response.data && e.response.data.message) || e.message || fallback }
    }
}
</script>

<style lang="scss" scoped>
.inflow-orders { padding: 12px 16px; }
.io-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.f-search { width: 240px; }
.f-sel { width: 120px; }
.f-sel-w { width: 170px; }
.f-date { width: 240px; }
.io-spacer { flex: 1; }
.io-meta { font-size: 12px; color: #909399; margin-right: 6px; white-space: nowrap; }
.io-pager { margin-top: 10px; text-align: right; }
.io-cn { margin-left: 6px; }
.io-inv { line-height: 1.3; }
.io-vendor { font-size: 11px; color: #909399; line-height: 1.3; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.neg { color: #F56C6C; }
.owing { color: #E6A23C; font-weight: 600; }
.io-desc { margin-bottom: 6px; }
.io-sub { font-weight: 600; font-size: 13px; color: #303133; margin: 14px 0 6px; }
.io-count { color: #909399; font-weight: normal; }
.io-empty { color: #909399; font-size: 12px; }
.io-payinfo { font-size: 13px; color: #606266; margin-bottom: 12px; }
.io-pdf-wrap { height: 72vh; background: #f2f3f5; }
.io-pdf-frame { width: 100%; height: 100%; border: none; display: block; }
.io-pdf-open { margin-right: 12px; }
.io-del { color: #F56C6C; }
</style>
