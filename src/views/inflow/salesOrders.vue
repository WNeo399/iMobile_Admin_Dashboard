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
            <el-table-column label="" width="220" align="center">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-view" @click="openDetail(s.row)">View Detail</el-button>
                    <el-button size="mini" type="text" icon="el-icon-connection" @click="openLinkDispatch(s.row)">Link Dispatch</el-button>
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

                    <div class="io-sub">Line items <span v-if="detail.lineItems && detail.lineItems.length" class="io-count">({{ detail.lineItems.length }})</span></div>
                    <el-table :data="pagedLineItems" size="mini" border>
                        <el-table-column label="Item" min-width="260">
                            <template slot-scope="s">
                                <div class="io-li-desc">{{ s.row.description }}</div>
                                <div v-if="s.row.sku" class="io-li-sku">SKU: {{ s.row.sku }}</div>
                            </template>
                        </el-table-column>
                        <el-table-column prop="quantity" label="Qty" width="70" align="right" />
                        <el-table-column label="Unit price" width="110" align="right"><template slot-scope="s">{{ money(s.row.unitPrice) }}</template></el-table-column>
                        <el-table-column label="Subtotal" width="120" align="right"><template slot-scope="s">{{ money(s.row.subTotal) }}</template></el-table-column>
                    </el-table>
                    <el-pagination v-if="detail.lineItems && detail.lineItems.length > liPageSize"
                        small background layout="total, prev, pager, next"
                        :total="detail.lineItems.length" :page-size="liPageSize" :current-page="liPage"
                        @current-change="p => liPage = p" class="io-li-pager" />

                    <div class="io-sub">Payments <span v-if="detail.payments && detail.payments.length" class="io-count">({{ detail.payments.length }})</span></div>
                    <el-table v-if="detail.payments && detail.payments.length" :data="detail.payments" size="mini" border>
                        <el-table-column label="Date" width="130"><template slot-scope="s">{{ dateOnly(s.row.date) }}</template></el-table-column>
                        <el-table-column label="Amount" width="130" align="right"><template slot-scope="s">{{ money(s.row.amount) }}</template></el-table-column>
                        <el-table-column label="Note" min-width="200" show-overflow-tooltip>
                            <template slot-scope="s">
                                <el-tag v-if="s.row.method === 'credit'" size="mini" type="warning" effect="plain">Credit · {{ s.row.creditNoteNumber }}</el-tag>
                                <span v-else>{{ s.row.note }}</span>
                            </template>
                        </el-table-column>
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
                <el-button v-if="detail && detail.status !== 'credit' && detail.balance > 0" v-hasPermi="['inflow:order:payment']" size="small" @click="openApplyCredit(detail)">Apply Credit</el-button>
                <el-button v-if="detail && detail.status !== 'credit'" v-hasPermi="['inflow:order:payment']" type="primary" size="small" @click="openPayment(detail)">Record Payment</el-button>
                <el-button size="small" @click="detailVisible = false">Close</el-button>
            </span>
        </el-dialog>

        <!-- Record Payment dialog (cash only) -->
        <el-dialog title="Record Payment" :visible.sync="payVisible" width="440px">
            <div v-if="payOrder" class="io-payinfo">
                {{ payOrder.invoiceNumber }} · balance <b :class="{ owing: (payOrder.balance) > 0 }">{{ money(payOrder.balance) }}</b>
            </div>
            <el-form label-width="90px" size="small">
                <el-form-item label="Amount">
                    <el-input-number v-model="payForm.amount" :precision="2" :step="100" :min="0" :max="payOrder && payOrder.balance > 0 ? round2(payOrder.balance) : undefined" :controls="false" style="width:100%" placeholder="0.00" />
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

        <!-- Apply Credit dialog -->
        <el-dialog title="Apply Credit" :visible.sync="creditVisible" width="860px" top="6vh">
            <div v-if="creditOrder" class="io-payinfo">
                {{ creditOrder.invoiceNumber }} · balance <b :class="{ owing: creditOrder.balance > 0 }">{{ money(creditOrder.balance) }}</b>
            </div>
            <el-form :inline="true" label-width="120px" size="small">
                <el-form-item label="Applied on Date">
                    <el-date-picker v-model="creditDate" type="date" value-format="yyyy-MM-dd" style="width:200px" />
                </el-form-item>
            </el-form>
            <div v-loading="creditsLoading">
                <template v-if="credits.length">
                    <el-table :data="credits" size="mini" border>
                        <el-table-column label="Transaction #" min-width="130"><template slot-scope="s">{{ s.row.invoiceNumber }}</template></el-table-column>
                        <el-table-column label="Date" width="110"><template slot-scope="s">{{ dateStr(s.row) }}</template></el-table-column>
                        <el-table-column label="Vendor" min-width="140" show-overflow-tooltip><template slot-scope="s">{{ s.row.vendor || '—' }}</template></el-table-column>
                        <el-table-column label="Credit Amount" width="120" align="right"><template slot-scope="s"><span class="io-credit">{{ money(s.row.creditAmount) }}</span></template></el-table-column>
                        <el-table-column label="Available" width="120" align="right"><template slot-scope="s">{{ money(s.row.available) }}</template></el-table-column>
                        <el-table-column label="Credits to Apply" width="160" align="right">
                            <template slot-scope="s">
                                <el-input-number v-model="creditApply[s.row._id]" :precision="2" :step="10" :min="0" :max="maxApply(s.row)" :controls="false" size="mini" style="width:130px" placeholder="0.00" />
                            </template>
                        </el-table-column>
                    </el-table>
                </template>
                <div v-else-if="!creditsLoading" class="io-empty io-nocredits">No credit notes available for this customer.</div>
            </div>

            <div class="io-paysum">
                <div class="io-paysum-row"><span>Amount to Credit</span><b class="io-credit">{{ money(creditsTotal) }}</b></div>
                <div class="io-paysum-row io-paysum-total"><span>Balance Due after</span><b :class="{ owing: creditRemaining > 0, neg: creditRemaining < 0 }">{{ money(creditRemaining) }}</b></div>
            </div>

            <span slot="footer">
                <el-button size="small" @click="creditVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" :loading="applying" :disabled="!credits.length || creditRemaining < -0.005" @click="submitApplyCredit">Apply</el-button>
            </span>
        </el-dialog>

        <!-- Link a manual dispatch record to this sales order -->
        <el-dialog :title="'Link Dispatch — ' + (linkDispatchOrder ? linkDispatchOrder.invoiceNumber : '')"
            :visible.sync="linkDispatchVisible" width="680px">
            <div class="io-skumap-hint">
                Pick an uploaded dispatch record to link to this sales order. The link just records
                which order the dispatch list belongs to — the record stays on the Order Dispatch
                page where the warehouse keeps working from it.
            </div>
            <div class="io-linkdisp-search">
                <el-input v-model="linkDispatchSearch" size="small" clearable
                    placeholder="Search dispatch records by invoice # / SKU…" prefix-icon="el-icon-search"
                    @keyup.enter.native="searchDispatchUploads" />
                <el-button size="small" type="primary" :loading="linkDispatchLoading" @click="searchDispatchUploads">Search</el-button>
            </div>
            <el-table v-loading="linkDispatchLoading" :data="linkDispatchRows" size="mini" border
                empty-text="No unlinked dispatch records found">
                <el-table-column prop="invoiceNumber" label="Invoice #" min-width="150" show-overflow-tooltip />
                <el-table-column label="Uploaded" min-width="150">
                    <template slot-scope="s">
                        {{ dateOnly(s.row.createdAt) }}<span v-if="s.row.createdBy" class="io-count"> · {{ s.row.createdBy }}</span>
                    </template>
                </el-table-column>
                <el-table-column label="Lines" width="70" align="right">
                    <template slot-scope="s">{{ s.row.lineCount }}</template>
                </el-table-column>
                <el-table-column label="Dispatched" width="110" align="center">
                    <template slot-scope="s">{{ s.row.dispatchedUnits }} / {{ s.row.units }}</template>
                </el-table-column>
                <el-table-column label="" width="90" align="center">
                    <template slot-scope="s">
                        <el-button size="mini" type="primary" plain :loading="linkDispatchSavingId === s.row._id"
                            @click="doLinkDispatch(s.row)">Link</el-button>
                    </template>
                </el-table-column>
            </el-table>
            <span slot="footer">
                <el-button size="small" @click="linkDispatchVisible = false">Close</el-button>
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
import { getInflowOrders, getInflowOrder, recordInflowPayment, deleteInflowPayment, getInflowFilters, getInflowOrderCredits, getInflowDispatchUploads, linkInflowDispatchUpload } from '@/api/inflow'

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
            liPage: 1, liPageSize: 10,
            payVisible: false, payOrder: null, paying: false,
            payForm: { amount: null, date: this.today(), note: '' },
            creditVisible: false, creditOrder: null, applying: false,
            credits: [], creditsLoading: false, creditApply: {}, creditDate: this.today(),
            pdfVisible: false, pdfUrl: '', pdfTitle: '',
            linkDispatchVisible: false, linkDispatchOrder: null, linkDispatchSearch: '',
            linkDispatchRows: [], linkDispatchLoading: false, linkDispatchSavingId: null
        }
    },
    computed: {
        // Total credit being applied across all credit notes in the Apply Credit dialog.
        creditsTotal() {
            return this.round2(this.credits.reduce((s, c) => s + (Number(this.creditApply[c._id]) || 0), 0))
        },
        creditRemaining() {
            return this.creditOrder ? this.round2((Number(this.creditOrder.balance) || 0) - this.creditsTotal) : 0
        },
        pagedLineItems() {
            const items = (this.detail && this.detail.lineItems) || []
            const start = (this.liPage - 1) * this.liPageSize
            return items.slice(start, start + this.liPageSize)
        }
    },
    created() {
        if (this.$route.query.customer) this.query.customer = String(this.$route.query.customer)
        this.loadFilters()
        this.load()
        this.maybeOpenFromQuery()
    },
    // Keep-alive: deep links (?open=<orderId>, e.g. from the Order Dispatch
    // page) must also work when the page is revisited, not just on first load.
    activated() {
        this.maybeOpenFromQuery()
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
        // ?open=<orderId> opens that order's detail dialog directly (used by
        // the Order Dispatch page's invoice links). Applied once, then
        // stripped from the URL.
        maybeOpenFromQuery() {
            const id = this.$route.query && this.$route.query.open
            if (!id) return
            this.$router.replace({ query: {} })
            this.openDetail({ _id: String(id) })
        },
        async openDetail(row) {
            this.detailVisible = true
            this.detail = row
            this.liPage = 1
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
        // Record Payment — cash only.
        openPayment(row) {
            this.payOrder = row
            this.payForm = { amount: row.balance > 0 ? this.round2(row.balance) : null, date: this.today(), note: '' }
            this.payVisible = true
        },
        async submitPayment() {
            const amount = Number(this.payForm.amount)
            if (!isFinite(amount) || amount <= 0) { this.$message.warning('Enter a positive amount.'); return }
            const bal = this.round2(Number(this.payOrder.balance) || 0)
            if (amount > bal + 0.005) {
                this.$message.warning(`Amount can't exceed the balance due of ${this.money(bal)}.`)
                return
            }
            this.paying = true
            try {
                const r = await recordInflowPayment(this.payOrder._id, { amount, date: this.payForm.date, note: this.payForm.note })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success('Payment recorded')
                this.payVisible = false
                if (this.detail && this.detail._id === r.order._id) this.detail = r.order
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to record payment'))
            } finally {
                this.paying = false
            }
        },
        // Apply Credit — apply available credit notes against the balance (no cash).
        async openApplyCredit(row) {
            this.creditOrder = row
            this.creditDate = this.today()
            this.credits = []
            this.creditApply = {}
            this.creditVisible = true
            this.creditsLoading = true
            try {
                const r = await getInflowOrderCredits(row._id)
                if (r && r.success) {
                    this.credits = r.credits || []
                    const map = {}
                    this.credits.forEach(c => { map[c._id] = null })
                    this.creditApply = map
                }
            } catch (e) { this.$message.error(this.msg(e, 'Failed to load credits')) }
            finally { this.creditsLoading = false }
        },
        // Max credit that can go on one row: capped by both its available credit
        // and the balance left after the other rows' amounts.
        maxApply(row) {
            const other = this.round2(this.creditsTotal - (Number(this.creditApply[row._id]) || 0))
            const room = this.round2((Number(this.creditOrder && this.creditOrder.balance) || 0) - other)
            return Math.max(0, Math.min(Number(row.available) || 0, room))
        },
        async submitApplyCredit() {
            const creditsPayload = this.credits
                .map(c => ({ creditNoteId: c._id, amount: this.round2(Number(this.creditApply[c._id]) || 0), available: c.available, invoiceNumber: c.invoiceNumber }))
                .filter(c => c.amount > 0)
            if (!creditsPayload.length) { this.$message.warning('Enter a credit amount to apply.'); return }
            for (const c of creditsPayload) {
                if (c.amount > c.available + 0.005) {
                    this.$message.warning(`Only ${this.money(c.available)} available on ${c.invoiceNumber}.`)
                    return
                }
            }
            const bal = this.round2(Number(this.creditOrder.balance) || 0)
            if (this.creditsTotal > bal + 0.005) {
                this.$message.warning(`Credit applied can't exceed the balance due of ${this.money(bal)}.`)
                return
            }
            this.applying = true
            try {
                const r = await recordInflowPayment(this.creditOrder._id, {
                    amount: 0,
                    date: this.creditDate,
                    credits: creditsPayload.map(c => ({ creditNoteId: c.creditNoteId, amount: c.amount }))
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success('Credit applied')
                this.creditVisible = false
                if (this.detail && this.detail._id === r.order._id) this.detail = r.order
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to apply credit'))
            } finally {
                this.applying = false
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
        // Link Dispatch — attach an uploaded dispatch record to this order
        // (reverse direction of the Order Dispatch page's Link action).
        // Purely a relationship; the record stays on the dispatch page.
        openLinkDispatch(row) {
            this.linkDispatchOrder = row
            this.linkDispatchSearch = ''
            this.linkDispatchRows = []
            this.linkDispatchVisible = true
            this.searchDispatchUploads()
        },
        async searchDispatchUploads() {
            this.linkDispatchLoading = true
            try {
                const r = await getInflowDispatchUploads({ search: this.linkDispatchSearch.trim() })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.linkDispatchRows = r.rows || []
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load dispatch records'))
            } finally {
                this.linkDispatchLoading = false
            }
        },
        async doLinkDispatch(record) {
            if (!this.linkDispatchOrder) return
            this.linkDispatchSavingId = record._id
            try {
                const r = await linkInflowDispatchUpload(record._id, { orderId: this.linkDispatchOrder._id })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(`Linked dispatch record ${record.invoiceNumber} to ${this.linkDispatchOrder.invoiceNumber}`)
                this.linkDispatchVisible = false
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to link'))
            } finally {
                this.linkDispatchSavingId = null
            }
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
.neg { color: #67C23A; }
.owing { color: #E6A23C; font-weight: 600; }
.io-desc { margin-bottom: 6px; }
.io-sub { font-weight: 600; font-size: 13px; color: #303133; margin: 14px 0 6px; }
.io-count { color: #909399; font-weight: normal; }
.io-empty { color: #909399; font-size: 12px; }
.io-payinfo { font-size: 13px; color: #606266; margin-bottom: 12px; }
.io-credit { color: #67C23A; font-weight: 600; }
.io-li-desc { color: #303133; line-height: 1.3; }
.io-li-sku { font-size: 12px; color: #909399; line-height: 1.3; margin-top: 1px; }
.io-li-pager { margin-top: 8px; text-align: right; }
.io-nocredits { margin: 10px 0; }
.io-paysum { margin-top: 16px; margin-left: auto; width: 320px; border-top: 1px solid #ebeef5; padding-top: 10px; }
.io-paysum-row { display: flex; justify-content: space-between; font-size: 13px; color: #606266; padding: 3px 0; }
.io-paysum-total { border-top: 1px solid #ebeef5; margin-top: 4px; padding-top: 8px; font-size: 14px; color: #303133; }
.io-paysum-total b { font-size: 15px; }
.io-pdf-wrap { height: 72vh; background: #f2f3f5; }
.io-pdf-frame { width: 100%; height: 100%; border: none; display: block; }
.io-pdf-open { margin-right: 12px; }
.io-del { color: #F56C6C; }
.io-skumap-hint { font-size: 13px; color: #606266; line-height: 1.6; margin-bottom: 12px; }
.io-linkdisp-search { display: flex; gap: 8px; margin-bottom: 10px; }
</style>
