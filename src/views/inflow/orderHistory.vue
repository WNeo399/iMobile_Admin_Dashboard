<template>
    <div class="oh app-container">
        <div class="oh-head">
            <div>
                <div class="oh-title">Order History</div>
                <div class="oh-sub">{{ customerName || '—' }}</div>
            </div>
            <span class="oh-flex" />
            <el-input v-model="search" size="small" clearable class="oh-search"
                placeholder="Search invoice / vendor…" prefix-icon="el-icon-search" @input="page = 1" />
            <el-select v-model="statusFilter" size="small" clearable placeholder="All statuses" class="oh-status" @change="page = 1">
                <el-option label="Unpaid" value="unpaid" />
                <el-option label="Partial" value="partial" />
                <el-option label="Paid" value="paid" />
                <el-option label="Credit note" value="credit" />
            </el-select>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">Refresh</el-button>
        </div>

        <el-table v-loading="loading" :data="pagedOrders" border size="mini" class="oh-table">
            <el-table-column prop="invoiceNumber" label="Invoice #" min-width="180">
                <template slot-scope="s">
                    <el-link type="primary" :underline="false" @click="openDetail(s.row)">{{ s.row.invoiceNumber }}</el-link>
                    <el-tag v-if="s.row.isCreditNote" size="mini" type="info" class="oh-cn">CN</el-tag>
                </template>
            </el-table-column>
            <el-table-column label="Date" width="110"><template slot-scope="s">{{ dateStr(s.row) }}</template></el-table-column>
            <el-table-column label="Vendor" min-width="150" show-overflow-tooltip><template slot-scope="s">{{ s.row.vendor || '—' }}</template></el-table-column>
            <el-table-column prop="lineItemCount" label="Items" width="70" align="right"><template slot-scope="s">{{ s.row.lineItemCount == null ? '—' : s.row.lineItemCount }}</template></el-table-column>
            <el-table-column label="Total" width="120" align="right"><template slot-scope="s"><span :class="{ neg: s.row.totalAmount < 0 }">{{ money(s.row.totalAmount) }}</span></template></el-table-column>
            <el-table-column label="Paid" width="110" align="right"><template slot-scope="s">{{ money(s.row.paidAmount) }}</template></el-table-column>
            <el-table-column label="Balance" width="120" align="right"><template slot-scope="s"><span :class="outClass(s.row.balance)">{{ money(s.row.balance) }}</span></template></el-table-column>
            <el-table-column label="Status" width="100" align="center"><template slot-scope="s"><el-tag size="mini" :type="statusTag(s.row.status)">{{ statusLabel(s.row.status) }}</el-tag></template></el-table-column>
            <!-- Dispatch progress for orders we're shipping against -->
            <el-table-column label="Dispatch" width="140" align="center">
                <template slot-scope="s">
                    <template v-if="s.row.dispatchLinked">
                        <el-tag size="mini" :type="dispatchTag(s.row.dispatchStatus)" effect="plain">
                            {{ dispatchLabel(s.row.dispatchStatus) }}
                        </el-tag>
                        <div class="oh-disp-qty">{{ s.row.dispatchDispatchedQty }} / {{ s.row.dispatchOrderedQty }} units</div>
                    </template>
                    <span v-else class="oh-count">—</span>
                </template>
            </el-table-column>
            <el-table-column label="" width="220" align="right">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-view" @click="openDetail(s.row)">View Detail</el-button>
                    <el-button v-if="s.row.dispatchLinked" size="mini" type="text" icon="el-icon-box"
                        @click="openDispatchStatus(s.row)">Dispatch Status</el-button>
                </template>
            </el-table-column>
            <template slot="empty"><span class="oh-empty">{{ orders.length ? 'No orders match your search.' : 'No orders yet.' }}</span></template>
        </el-table>

        <el-pagination v-if="filteredOrders.length > pageSize" background small class="oh-pager"
            layout="total, prev, pager, next" :total="filteredOrders.length" :page-size="pageSize"
            :current-page="page" @current-change="p => page = p" />

        <!-- Order detail -->
        <el-dialog :title="detail ? detail.invoiceNumber : 'Order'" :visible.sync="detailVisible" width="720px" top="6vh">
            <div v-loading="detailLoading">
                <template v-if="detail">
                    <el-descriptions :column="2" size="small" border class="oh-desc">
                        <el-descriptions-item label="Vendor">{{ detail.vendor || '—' }}</el-descriptions-item>
                        <el-descriptions-item label="Invoice date">{{ dateStr(detail) }}</el-descriptions-item>
                        <el-descriptions-item label="Status"><el-tag size="mini" :type="statusTag(detail.status)">{{ statusLabel(detail.status) }}</el-tag></el-descriptions-item>
                        <el-descriptions-item label="Subtotal">{{ money(detail.subtotal) }}</el-descriptions-item>
                        <el-descriptions-item label="Tax">{{ money(detail.tax) }}</el-descriptions-item>
                        <el-descriptions-item label="Total"><b :class="{ neg: detail.totalAmount < 0 }">{{ money(detail.totalAmount) }}</b></el-descriptions-item>
                        <el-descriptions-item label="Paid / Balance">{{ money(detail.paidAmount) }} / <b :class="outClass(detail.balance)">{{ money(detail.balance) }}</b></el-descriptions-item>
                    </el-descriptions>
                    <div class="oh-sec">Line items <span v-if="detail.lineItems && detail.lineItems.length" class="oh-count">({{ detail.lineItems.length }})</span></div>
                    <el-table :data="pagedLineItems" size="mini" border>
                        <el-table-column label="Item" min-width="260">
                            <template slot-scope="s">
                                <div class="oh-li-desc">{{ s.row.description }}</div>
                                <div v-if="s.row.sku" class="oh-li-sku">SKU: {{ s.row.sku }}</div>
                            </template>
                        </el-table-column>
                        <el-table-column prop="quantity" label="Qty" width="70" align="right" />
                        <el-table-column v-if="detail.dispatchLinked" label="Dispatched" width="120" align="center">
                            <template slot-scope="s">
                                <el-tag size="mini" :type="dispatchTag(s.row.dispatchStatus)" effect="plain">
                                    {{ Number(s.row.dispatchedQty) || 0 }} / {{ s.row.quantity }}
                                </el-tag>
                            </template>
                        </el-table-column>
                        <el-table-column label="Unit price" width="110" align="right"><template slot-scope="s">{{ money(s.row.unitPrice) }}</template></el-table-column>
                        <el-table-column label="Subtotal" width="120" align="right"><template slot-scope="s">{{ money(s.row.subTotal) }}</template></el-table-column>
                    </el-table>
                    <el-pagination v-if="detail.lineItems && detail.lineItems.length > liPageSize"
                        small background layout="total, prev, pager, next"
                        :total="detail.lineItems.length" :page-size="liPageSize" :current-page="liPage"
                        @current-change="p => liPage = p" class="oh-li-pager" />
                </template>
            </div>
            <span slot="footer">
                <el-button v-if="detail && detail.invoicePdfUrl" size="small" icon="el-icon-document" @click="openPdf(detail)">View Invoice</el-button>
                <el-button size="small" @click="detailVisible = false">Close</el-button>
            </span>
        </el-dialog>

        <!-- Dispatch Status — what's been packed and shipped for this order -->
        <el-dialog :title="'Dispatch Status — ' + (dispatchOrder ? dispatchOrder.invoiceNumber : '')"
            :visible.sync="dispatchVisible" width="800px" top="6vh" append-to-body>
            <div v-loading="dispatchLoading">
                <template v-if="orderDispatch">
                    <div class="oh-ds-head">
                        <el-tag size="mini" :type="dispatchTag(orderDispatch.dispatchStatus)">{{ dispatchLabel(orderDispatch.dispatchStatus) }}</el-tag>
                        <span class="oh-ds-progress">{{ orderDispatch.dispatchedQty }} / {{ orderDispatch.orderedQty }} units dispatched</span>
                    </div>

                    <template v-if="(orderDispatch.batches || []).length">
                        <div class="oh-sec">Batches <span class="oh-count">— expand a batch to see what was in it</span></div>
                        <el-table :data="orderDispatch.batches" size="mini" border max-height="380">
                            <el-table-column type="expand">
                                <template slot-scope="b">
                                    <el-table :data="b.row.lines" size="mini" border class="oh-batch-lines">
                                        <el-table-column label="SKU" width="115" show-overflow-tooltip>
                                            <template slot-scope="l">{{ l.row.sku || '—' }}</template>
                                        </el-table-column>
                                        <el-table-column label="Description" min-width="240" show-overflow-tooltip>
                                            <template slot-scope="l">{{ l.row.description || '—' }}</template>
                                        </el-table-column>
                                        <el-table-column label="Qty" width="70" align="right">
                                            <template slot-scope="l">{{ l.row.qty }}</template>
                                        </el-table-column>
                                    </el-table>
                                </template>
                            </el-table-column>
                            <el-table-column label="Batch" width="70" align="center">
                                <template slot-scope="b">#{{ b.row.batchNo }}</template>
                            </el-table-column>
                            <el-table-column label="Date" min-width="140">
                                <template slot-scope="b">{{ dateOnly(b.row.at) }}</template>
                            </el-table-column>
                            <el-table-column label="Lines" width="70" align="right">
                                <template slot-scope="b">{{ (b.row.lines || []).length }}</template>
                            </el-table-column>
                            <el-table-column label="Units" width="70" align="right">
                                <template slot-scope="b">{{ b.row.units }}</template>
                            </el-table-column>
                            <el-table-column label="Tracking #" min-width="150" show-overflow-tooltip>
                                <template slot-scope="b">{{ b.row.tracking || '—' }}</template>
                            </el-table-column>
                        </el-table>
                    </template>
                    <div v-else class="oh-ds-empty">
                        <i class="el-icon-box oh-ds-empty-icon" />
                        <div class="oh-ds-empty-title">Nothing dispatched yet</div>
                        <div class="oh-ds-empty-sub">Your order is being prepared — shipments will appear here once they're packed.</div>
                    </div>
                </template>
                <div v-else-if="!dispatchLoading" class="oh-empty">No dispatch information for this order.</div>
            </div>
            <span slot="footer">
                <el-button size="small" @click="dispatchVisible = false">Close</el-button>
            </span>
        </el-dialog>

        <!-- Invoice PDF -->
        <el-dialog :title="(pdfTitle || 'Invoice') + ' — Invoice PDF'" :visible.sync="pdfVisible" width="60%" top="7vh">
            <div class="oh-pdf-wrap"><iframe v-if="pdfUrl" :src="pdfUrl" class="oh-pdf-frame" title="Invoice PDF" /></div>
            <span slot="footer">
                <el-link v-if="pdfUrl" type="primary" :href="pdfUrl" target="_blank" rel="noopener" :underline="false" class="oh-pdf-open"><i class="el-icon-top-right" /> Open in new tab</el-link>
                <el-button size="small" @click="pdfVisible = false">Close</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import { getInflowStatement, getInflowStatementOrder, getInflowStatementOrderDispatch } from '@/api/inflow'

export default {
    name: 'InflowOrderHistory',
    data() {
        return {
            loading: false,
            customerName: '',
            orders: [],
            search: '',
            statusFilter: '',
            page: 1,
            pageSize: 20,
            detailVisible: false, detail: null, detailLoading: false,
            liPage: 1, liPageSize: 10,
            // Dispatch Status dialog (what's been packed for this order)
            dispatchVisible: false, dispatchOrder: null, orderDispatch: null, dispatchLoading: false,
            pdfVisible: false, pdfUrl: '', pdfTitle: ''
        }
    },
    computed: {
        filteredOrders() {
            const q = (this.search || '').trim().toLowerCase()
            return this.orders.filter(o => {
                if (this.statusFilter && o.status !== this.statusFilter) return false
                if (q) {
                    const hay = `${o.invoiceNumber || ''} ${o.vendor || ''}`.toLowerCase()
                    if (hay.indexOf(q) === -1) return false
                }
                return true
            })
        },
        pagedOrders() {
            const start = (this.page - 1) * this.pageSize
            return this.filteredOrders.slice(start, start + this.pageSize)
        },
        pagedLineItems() {
            const items = (this.detail && this.detail.lineItems) || []
            const start = (this.liPage - 1) * this.liPageSize
            return items.slice(start, start + this.liPageSize)
        }
    },
    created() {
        this.load()
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await getInflowStatement()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.customerName = r.customerName
                this.orders = r.orders || []
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load orders'))
            } finally {
                this.loading = false
            }
        },
        async openDetail(row) {
            this.detailVisible = true
            this.detail = row
            this.liPage = 1
            this.detailLoading = true
            try {
                const r = await getInflowStatementOrder(row._id)
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
        async openDispatchStatus(row) {
            this.dispatchOrder = row
            this.orderDispatch = null
            this.dispatchVisible = true
            this.dispatchLoading = true
            try {
                const r = await getInflowStatementOrderDispatch(row._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.orderDispatch = r.dispatch || null
            } catch (e) {
                this.$message.error((e.response && e.response.data && e.response.data.message) || e.message || 'Failed to load dispatch status')
            } finally {
                this.dispatchLoading = false
            }
        },
        statusTag(s) { return { unpaid: 'danger', partial: 'warning', paid: 'success', credit: 'info' }[s] || 'info' },
        statusLabel(s) { return { unpaid: 'Unpaid', partial: 'Partial', paid: 'Paid', credit: 'Credit' }[s] || s },
        // Dispatch wording is customer-facing: "Preparing" reads better than
        // "Pending" for stock that hasn't been packed yet (matches the
        // Dispatch Status page).
        dispatchTag(s) { return { pending: 'info', partial: 'warning', dispatched: 'success' }[s] || 'info' },
        dispatchLabel(s) { return { pending: 'Preparing', partial: 'Partially Dispatched', dispatched: 'Dispatched' }[s] || s },
        outClass(v) { const n = Number(v); if (n > 0) return 'owing'; if (n < 0) return 'neg'; return '' },
        dateOnly(v) {
            if (!v) return '—'
            const d = new Date(v)
            return isNaN(d) ? '—' : d.toLocaleDateString('en-AU')
        },
        dateStr(o) {
            if (o && o.invoiceDateRaw) return o.invoiceDateRaw
            if (o && o.invoiceDate) { const d = new Date(o.invoiceDate); if (!isNaN(d)) return d.toLocaleDateString('en-AU') }
            return '—'
        },
        money(v) {
            const n = Number(v)
            if (!isFinite(n)) return '—'
            return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        },
        msg(e, fallback) { return (e.response && e.response.data && e.response.data.message) || e.message || fallback }
    }
}
</script>

<style lang="scss" scoped>
.oh { padding: 14px 16px; }
.oh-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.oh-title { font-size: 17px; font-weight: 600; color: #303133; }
.oh-sub { font-size: 13px; color: #909399; margin-top: 3px; }
.oh-flex { flex: 1; }
.oh-search { width: 240px; }
.oh-status { width: 150px; }
.oh-table { width: 100%; }
.oh-cn { margin-left: 6px; }
.oh-empty { color: #909399; font-size: 13px; }
.oh-pager { margin-top: 10px; text-align: right; }
.neg { color: #67C23A; }
.owing { color: #E6A23C; font-weight: 600; }
.oh-desc { margin-bottom: 6px; }
.oh-sec { font-weight: 600; font-size: 13px; color: #303133; margin: 14px 0 6px; }
.oh-count { color: #909399; font-weight: normal; }
.oh-disp-qty { font-size: 11px; color: #909399; line-height: 1.4; margin-top: 2px; }
.oh-ds-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.oh-ds-progress { font-size: 12px; color: #909399; }
.oh-batch-lines { margin: 4px 12px; width: calc(100% - 24px); }
.oh-ds-empty {
    margin-top: 14px; padding: 26px 16px;
    border: 1px dashed #dcdfe6; border-radius: 8px;
    background: #fafbfc; text-align: center;
}
.oh-ds-empty-icon { font-size: 30px; color: #c0c4cc; }
.oh-ds-empty-title { margin-top: 8px; font-size: 14px; color: #606266; font-weight: 500; }
.oh-ds-empty-sub { margin-top: 4px; font-size: 12px; color: #909399; line-height: 1.6; }
.oh-li-desc { color: #303133; line-height: 1.3; }
.oh-li-sku { font-size: 12px; color: #909399; line-height: 1.3; margin-top: 1px; }
.oh-li-pager { margin-top: 8px; text-align: right; }
.oh-pdf-wrap { height: 72vh; background: #f2f3f5; }
.oh-pdf-frame { width: 100%; height: 100%; border: none; display: block; }
.oh-pdf-open { margin-right: 12px; }
</style>
