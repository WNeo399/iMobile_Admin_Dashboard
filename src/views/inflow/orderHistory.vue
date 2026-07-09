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
            <el-table-column label="" width="130" align="right">
                <template slot-scope="s">
                    <el-button size="mini" type="text" @click="openDetail(s.row)">View</el-button>
                    <el-button v-if="s.row.invoicePdfUrl" size="mini" type="text" icon="el-icon-document" @click="openPdf(s.row)">Invoice</el-button>
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
import { getInflowStatement, getInflowStatementOrder } from '@/api/inflow'

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
        statusTag(s) { return { unpaid: 'danger', partial: 'warning', paid: 'success', credit: 'info' }[s] || 'info' },
        statusLabel(s) { return { unpaid: 'Unpaid', partial: 'Partial', paid: 'Paid', credit: 'Credit' }[s] || s },
        outClass(v) { const n = Number(v); if (n > 0) return 'owing'; if (n < 0) return 'neg'; return '' },
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
.oh-li-desc { color: #303133; line-height: 1.3; }
.oh-li-sku { font-size: 12px; color: #909399; line-height: 1.3; margin-top: 1px; }
.oh-li-pager { margin-top: 8px; text-align: right; }
.oh-pdf-wrap { height: 72vh; background: #f2f3f5; }
.oh-pdf-frame { width: 100%; height: 100%; border: none; display: block; }
.oh-pdf-open { margin-right: 12px; }
</style>
