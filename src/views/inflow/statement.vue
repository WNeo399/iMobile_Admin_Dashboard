<template>
    <div class="stmt app-container">
        <div class="stmt-head">
            <div>
                <el-button v-if="adminCustomer" type="text" icon="el-icon-back" class="stmt-back" @click="$router.push('/inflow/customers')">Back to Customers</el-button>
                <div class="stmt-title">Statement</div>
                <div class="stmt-sub">{{ customerName || '—' }}</div>
            </div>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">Refresh</el-button>
        </div>

        <div class="stmt-body">
            <!-- Vendor tree (statement is per vendor) -->
            <div class="stmt-tree-panel" v-loading="loading">
                <div class="stmt-tree-head">Vendors</div>
                <el-tree ref="vendorTree" class="stmt-tree" :data="vendorTree" node-key="id"
                    :default-expand-all="true" :expand-on-click-node="false" highlight-current
                    :current-node-key="currentKey" @node-click="onVendorClick">
                    <span slot-scope="{ data }" class="vt-node" :class="{ 'vt-root': data.id === '__all__' }" :title="`${data.count} invoice${data.count === 1 ? '' : 's'}`">
                        <span class="vt-label">{{ data.label }}</span>
                        <span class="vt-amt" :class="outClass(data.outstanding)">{{ money(data.outstanding) }}</span>
                    </span>
                </el-tree>
            </div>

            <div class="stmt-main">
                <!-- Filters -->
                <div class="stmt-filters">
                    <el-date-picker v-model="dateRange" type="daterange" size="small" unlink-panels
                        range-separator="→" start-placeholder="From" end-placeholder="To"
                        value-format="yyyy-MM-dd" :picker-options="pickerOptions" class="stmt-range" />
                    <el-radio-group v-model="statusMode" size="small">
                        <el-radio-button label="all">All</el-radio-button>
                        <el-radio-button label="outstanding">Outstanding</el-radio-button>
                    </el-radio-group>
                    <span class="stmt-flex" />
                    <span class="stmt-count">{{ filteredOrders.length }} of {{ orders.length }} invoices</span>
                </div>

                <div class="stmt-kpis">
                    <div class="kpi"><div class="kpi-val">{{ money(filteredSummary.invoiced) }}</div><div class="kpi-lbl">Invoiced</div></div>
                    <div class="kpi"><div class="kpi-val neg">{{ money(filteredSummary.credits) }}</div><div class="kpi-lbl">Credits</div></div>
                    <div class="kpi"><div class="kpi-val">{{ money(filteredSummary.paid) }}</div><div class="kpi-lbl">Paid</div></div>
                    <div class="kpi"><div class="kpi-val" :class="outClass(filteredSummary.outstanding)">{{ money(filteredSummary.outstanding) }}</div><div class="kpi-lbl">Outstanding</div></div>
                </div>

                <!-- Grouped by vendor -->
                <div class="stmt-groups">
                    <el-collapse v-model="openVendors">
                        <el-collapse-item v-for="g in vendorGroups" :key="g.key" :name="g.key">
                            <template slot="title">
                                <div class="vg-title">
                                    <span class="vg-name">{{ g.label }}</span>
                                    <span class="vg-meta">
                                        <span class="vg-chip">{{ g.orderCount }} inv</span>
                                        <span v-if="g.credits < 0" class="vg-chip">Credits <span class="neg">{{ money(g.credits) }}</span></span>
                                        <span class="vg-chip">Paid {{ money(g.paid) }}</span>
                                        <span class="vg-chip vg-out">Outstanding <b :class="outClass(g.outstanding)">{{ money(g.outstanding) }}</b></span>
                                    </span>
                                </div>
                            </template>
                            <el-table :data="g.rows" border size="mini" class="stmt-table">
                                <el-table-column prop="invoiceNumber" label="Invoice #" min-width="190">
                                    <template slot-scope="s">
                                        <el-link type="primary" :underline="false" @click="openDetail(s.row)">{{ s.row.invoiceNumber }}</el-link>
                                        <el-tag v-if="s.row.isCreditNote" size="mini" type="info" class="stmt-cn">CN</el-tag>
                                    </template>
                                </el-table-column>
                                <el-table-column label="Date" width="110"><template slot-scope="s">{{ dateStr(s.row) }}</template></el-table-column>
                                <el-table-column prop="lineItemCount" label="Items" width="70" align="right"><template slot-scope="s">{{ s.row.lineItemCount == null ? '—' : s.row.lineItemCount }}</template></el-table-column>
                                <el-table-column label="Total" width="120" align="right"><template slot-scope="s"><span :class="{ neg: s.row.totalAmount < 0 }">{{ money(s.row.totalAmount) }}</span></template></el-table-column>
                                <el-table-column label="Paid" width="110" align="right"><template slot-scope="s">{{ money(s.row.paidAmount) }}</template></el-table-column>
                                <el-table-column label="Balance" width="120" align="right"><template slot-scope="s"><span :class="outClass(s.row.balance)">{{ money(s.row.balance) }}</span></template></el-table-column>
                                <el-table-column label="Status" width="100" align="center"><template slot-scope="s"><el-tag size="mini" :type="statusTag(s.row.status)">{{ statusLabel(s.row.status) }}</el-tag></template></el-table-column>
                                <el-table-column label="" width="160" align="right">
                                    <template slot-scope="s">
                                        <el-button size="mini" type="text" @click="openDetail(s.row)">View</el-button>
                                        <el-button v-if="s.row.invoicePdfUrl" size="mini" type="text" icon="el-icon-document" @click="openPdf(s.row)">Invoice</el-button>
                                    </template>
                                </el-table-column>
                            </el-table>
                        </el-collapse-item>
                    </el-collapse>
                    <div v-if="!vendorGroups.length && !loading" class="stmt-empty">
                        {{ orders.length ? 'No invoices match the current filters.' : 'No invoices on your account yet.' }}
                    </div>
                </div>
            </div>
        </div>

        <!-- Order detail -->
        <el-dialog :title="detail ? detail.invoiceNumber : 'Invoice'" :visible.sync="detailVisible" width="720px" top="6vh">
            <div v-loading="detailLoading">
                <template v-if="detail">
                    <el-descriptions :column="2" size="small" border class="stmt-desc">
                        <el-descriptions-item label="Vendor">{{ detail.vendor || '—' }}</el-descriptions-item>
                        <el-descriptions-item label="Invoice date">{{ dateStr(detail) }}</el-descriptions-item>
                        <el-descriptions-item label="Status"><el-tag size="mini" :type="statusTag(detail.status)">{{ statusLabel(detail.status) }}</el-tag></el-descriptions-item>
                        <el-descriptions-item label="Subtotal">{{ money(detail.subtotal) }}</el-descriptions-item>
                        <el-descriptions-item label="Tax">{{ money(detail.tax) }}</el-descriptions-item>
                        <el-descriptions-item label="Total"><b :class="{ neg: detail.totalAmount < 0 }">{{ money(detail.totalAmount) }}</b></el-descriptions-item>
                        <el-descriptions-item label="Paid / Balance">{{ money(detail.paidAmount) }} / <b :class="outClass(detail.balance)">{{ money(detail.balance) }}</b></el-descriptions-item>
                    </el-descriptions>
                    <div class="stmt-sec">Line items</div>
                    <el-table :data="detail.lineItems || []" size="mini" border>
                        <el-table-column prop="description" label="Description" min-width="240" show-overflow-tooltip />
                        <el-table-column prop="quantity" label="Qty" width="70" align="right" />
                        <el-table-column label="Unit price" width="110" align="right"><template slot-scope="s">{{ money(s.row.unitPrice) }}</template></el-table-column>
                        <el-table-column label="Subtotal" width="120" align="right"><template slot-scope="s">{{ money(s.row.subTotal) }}</template></el-table-column>
                    </el-table>
                </template>
            </div>
            <span slot="footer">
                <el-button v-if="detail && detail.invoicePdfUrl" size="small" icon="el-icon-document" @click="openPdf(detail)">View Invoice</el-button>
                <el-button size="small" @click="detailVisible = false">Close</el-button>
            </span>
        </el-dialog>

        <!-- Invoice PDF -->
        <el-dialog :title="(pdfTitle || 'Invoice') + ' — Invoice PDF'" :visible.sync="pdfVisible" width="60%" top="7vh">
            <div class="stmt-pdf-wrap"><iframe v-if="pdfUrl" :src="pdfUrl" class="stmt-pdf-frame" title="Invoice PDF" /></div>
            <span slot="footer">
                <el-link v-if="pdfUrl" type="primary" :href="pdfUrl" target="_blank" rel="noopener" :underline="false" class="stmt-pdf-open"><i class="el-icon-top-right" /> Open in new tab</el-link>
                <el-button size="small" @click="pdfVisible = false">Close</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import { getInflowStatement, getInflowStatementOrder, getInflowCustomerStatement, getInflowOrder } from '@/api/inflow'

const NO_VENDOR = 'Unspecified'
const ALL = '__all__'

export default {
    name: 'InflowStatement',
    data() {
        return {
            loading: false,
            customerName: '',
            orders: [],
            dateRange: null,
            statusMode: 'all',
            vendorFilter: '',
            openVendors: [],
            detailVisible: false, detail: null, detailLoading: false,
            pdfVisible: false, pdfUrl: '', pdfTitle: '',
            pickerOptions: {
                firstDayOfWeek: 1,
                shortcuts: [
                    { text: 'This month', onClick(p) { const n = new Date(); p.$emit('pick', [new Date(n.getFullYear(), n.getMonth(), 1), n]) } },
                    { text: 'Last month', onClick(p) { const n = new Date(); p.$emit('pick', [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0)]) } },
                    { text: 'Last 3 months', onClick(p) { const n = new Date(); p.$emit('pick', [new Date(n.getFullYear(), n.getMonth() - 3, n.getDate()), n]) } },
                    { text: 'This year', onClick(p) { const n = new Date(); p.$emit('pick', [new Date(n.getFullYear(), 0, 1), n]) } }
                ]
            }
        }
    },
    computed: {
        // Admin viewing a specific customer (via ?customer=); empty = portal (own).
        adminCustomer() { return this.$route.query.customer || '' },
        currentKey() { return this.vendorFilter || ALL },
        // Orders after date + status filters (but NOT vendor) — feeds the tree and,
        // once the selected vendor is applied, the KPIs + groups.
        scopedOrders() {
            let rows = this.orders
            const r = this.dateRange
            if (r && r[0]) { const f = this.startOfDay(r[0]); rows = rows.filter(o => { const d = this.orderDate(o); return d && d.getTime() >= f }) }
            if (r && r[1]) { const t = this.endOfDay(r[1]); rows = rows.filter(o => { const d = this.orderDate(o); return d && d.getTime() <= t }) }
            if (this.statusMode === 'outstanding') rows = rows.filter(o => Math.abs(Number(o.balance) || 0) > 0.005)
            return rows
        },
        vendorTree() {
            const map = new Map()
            let total = 0, paidAll = 0
            for (const o of this.scopedOrders) {
                const k = this.vendorLabel(o)
                const t = Number(o.totalAmount) || 0
                const p = Number(o.paidAmount) || 0
                if (!map.has(k)) map.set(k, { id: k, label: k, count: 0, total: 0, paid: 0 })
                const g = map.get(k)
                g.count++; g.total += t; g.paid += p
                total += t; paidAll += p
            }
            const children = [...map.values()]
                .map(g => ({ id: g.id, label: g.label, count: g.count, outstanding: g.total - g.paid }))
                .sort((a, b) => (b.outstanding - a.outstanding) || a.label.localeCompare(b.label))
            return [{ id: ALL, label: 'All vendors', count: this.scopedOrders.length, outstanding: total - paidAll, children }]
        },
        filteredOrders() {
            if (!this.vendorFilter) return this.scopedOrders
            return this.scopedOrders.filter(o => this.vendorLabel(o) === this.vendorFilter)
        },
        filteredSummary() {
            let invoiced = 0, credits = 0, paid = 0, total = 0
            for (const o of this.filteredOrders) {
                const t = Number(o.totalAmount) || 0
                total += t
                paid += Number(o.paidAmount) || 0
                if (t < 0) credits += t; else invoiced += t
            }
            return { orderCount: this.filteredOrders.length, invoiced, credits, paid, outstanding: total - paid }
        },
        vendorGroups() {
            const groups = new Map()
            for (const o of this.filteredOrders) {
                const key = this.vendorLabel(o)
                if (!groups.has(key)) groups.set(key, { key, label: key, rows: [], invoiced: 0, credits: 0, paid: 0, total: 0 })
                const g = groups.get(key)
                g.rows.push(o)
                const t = Number(o.totalAmount) || 0
                g.total += t
                g.paid += Number(o.paidAmount) || 0
                if (t < 0) g.credits += t; else g.invoiced += t
            }
            return [...groups.values()]
                .map(g => ({ ...g, orderCount: g.rows.length, outstanding: g.total - g.paid }))
                .sort((a, b) => (b.outstanding - a.outstanding) || a.label.localeCompare(b.label))
        }
    },
    watch: {
        adminCustomer() { this.load() },
        // Keep all vendor sections open by default whenever the grouping changes.
        vendorGroups(groups) { this.openVendors = groups.map(g => g.key) },
        // If the selected vendor no longer exists under the current date/status
        // filters, fall back to "All vendors" and re-sync the tree highlight.
        vendorTree(tree) {
            const children = (tree[0] && tree[0].children) || []
            if (this.vendorFilter && !children.some(c => c.id === this.vendorFilter)) {
                this.vendorFilter = ''
            }
            this.syncTreeHighlight()
        }
    },
    created() {
        this.load()
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = this.adminCustomer
                    ? await getInflowCustomerStatement(this.adminCustomer)
                    : await getInflowStatement()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.customerName = r.customerName
                this.orders = r.orders || []
                this.syncTreeHighlight()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load statement'))
            } finally {
                this.loading = false
            }
        },
        onVendorClick(data) {
            this.vendorFilter = data.id === ALL ? '' : data.id
        },
        syncTreeHighlight() {
            this.$nextTick(() => {
                const tree = this.$refs.vendorTree
                if (tree) tree.setCurrentKey(this.currentKey)
            })
        },
        async openDetail(row) {
            this.detailVisible = true
            this.detail = row
            this.detailLoading = true
            try {
                const r = this.adminCustomer
                    ? await getInflowOrder(row._id)
                    : await getInflowStatementOrder(row._id)
                if (r && r.success) this.detail = r.order
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load invoice'))
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
        vendorLabel(o) { return (o && o.vendor && String(o.vendor).trim()) || NO_VENDOR },
        orderDate(o) {
            if (!o) return null
            if (o.invoiceDate) { const d = new Date(o.invoiceDate); if (!isNaN(d)) return d }
            if (o.invoiceDateRaw) { const m = String(o.invoiceDateRaw).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) return new Date(+m[3], +m[2] - 1, +m[1]) }
            return null
        },
        startOfDay(v) { const d = new Date(v); d.setHours(0, 0, 0, 0); return d.getTime() },
        endOfDay(v) { const d = new Date(v); d.setHours(23, 59, 59, 999); return d.getTime() },
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
.stmt { padding: 14px 16px; }
.stmt-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 14px; }
.stmt-back { padding: 0 0 4px; }
.stmt-title { font-size: 17px; font-weight: 600; color: #303133; }
.stmt-sub { font-size: 13px; color: #909399; margin-top: 3px; }

.stmt-body { display: flex; align-items: flex-start; gap: 16px; }
.stmt-tree-panel { width: 250px; flex: none; background: #fff; border: 1px solid #ebeef5; border-radius: 6px; padding: 8px 4px; max-height: calc(100vh - 170px); overflow: auto; }
.stmt-tree-head { font-size: 12px; font-weight: 600; color: #909399; text-transform: uppercase; letter-spacing: .04em; padding: 4px 10px 8px; }
.stmt-tree { background: transparent; }
.vt-node { display: flex; align-items: center; justify-content: space-between; width: 100%; padding-right: 8px; gap: 8px; overflow: hidden; }
.vt-label { font-size: 13px; color: #303133; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vt-root .vt-label { font-weight: 600; }
.vt-amt { font-size: 12px; white-space: nowrap; color: #909399; }
.stmt-main { flex: 1; min-width: 0; }

.stmt-filters { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
.stmt-range { width: 260px; }
.stmt-flex { flex: 1; }
.stmt-count { font-size: 12px; color: #909399; white-space: nowrap; }
.stmt-kpis { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; }
.kpi { flex: 1; min-width: 140px; background: #fff; border: 1px solid #ebeef5; border-radius: 6px; padding: 14px 16px; }
.kpi-val { font-size: 22px; font-weight: 600; color: #303133; line-height: 1.2; }
.kpi-lbl { font-size: 12px; color: #909399; margin-top: 4px; }
.stmt-groups { min-height: 60px; }
.vg-title { display: flex; align-items: center; justify-content: space-between; width: 100%; padding-right: 12px; }
.vg-name { font-weight: 600; font-size: 14px; color: #303133; }
.vg-meta { display: flex; align-items: center; gap: 14px; }
.vg-chip { font-size: 12px; color: #606266; white-space: nowrap; }
.vg-out { font-size: 12px; }
.stmt-table { width: 100%; margin-bottom: 4px; }
.stmt-cn { margin-left: 6px; }
.stmt-empty { color: #909399; font-size: 13px; padding: 18px 4px; }
.neg { color: #F56C6C; }
.owing { color: #E6A23C; font-weight: 600; }
.stmt-desc { margin-bottom: 6px; }
.stmt-sec { font-weight: 600; font-size: 13px; color: #303133; margin: 14px 0 6px; }
.stmt-pdf-wrap { height: 72vh; background: #f2f3f5; }
.stmt-pdf-frame { width: 100%; height: 100%; border: none; display: block; }
.stmt-pdf-open { margin-right: 12px; }
::v-deep .el-tree-node__content { height: 32px; }
::v-deep .el-collapse-item__header { height: auto; line-height: 1.5; padding: 8px 0; }
::v-deep .el-collapse-item__content { padding-bottom: 12px; }
</style>
