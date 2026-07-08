<template>
    <div class="stmt app-container">
        <div class="stmt-head">
            <div>
                <el-button v-if="adminCustomer" type="text" icon="el-icon-back" class="stmt-back" @click="$router.push('/inflow/customers')">Back to Customers</el-button>
                <div class="stmt-title">Statement</div>
                <div class="stmt-sub">{{ customerName || '—' }}</div>
            </div>
            <div class="stmt-actions">
                <el-button size="small" icon="el-icon-download" :disabled="loading || !orders.length" @click="downloadExcel">Download</el-button>
                <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">Refresh</el-button>
            </div>
        </div>

        <div class="stmt-body">
            <!-- Vendor tree — a statement is per vendor; pick one (first is selected by default). -->
            <div class="stmt-tree-panel" v-loading="loading">
                <div class="stmt-tree-head">Vendors</div>
                <el-tree ref="vendorTree" class="stmt-tree" :data="vendorTree" node-key="id"
                    :expand-on-click-node="false" highlight-current
                    :current-node-key="vendorFilter" @node-click="onVendorClick">
                    <span slot-scope="{ data }" class="vt-node" :title="`${data.count} invoice${data.count === 1 ? '' : 's'}`">
                        <span class="vt-label">{{ data.label }}</span>
                        <span class="vt-amt" :class="outClass(data.outstanding)">{{ money(data.outstanding) }}</span>
                    </span>
                </el-tree>
                <div v-if="!vendorTree.length && !loading" class="stmt-tree-empty">No vendors</div>
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

                <div class="stmt-kpis" v-loading="loading">
                    <div class="kpi"><div class="kpi-val">{{ money(filteredSummary.invoiced) }}</div><div class="kpi-lbl">Invoiced</div></div>
                    <div class="kpi"><div class="kpi-val neg">{{ money(Math.abs(filteredSummary.credits)) }}</div><div class="kpi-lbl">Credits</div></div>
                    <div class="kpi"><div class="kpi-val">{{ money(filteredSummary.paid) }}</div><div class="kpi-lbl">Paid</div></div>
                    <div class="kpi"><div class="kpi-val" :class="outClass(filteredSummary.outstanding)">{{ money(filteredSummary.outstanding) }}</div><div class="kpi-lbl">Outstanding</div></div>
                </div>

                <div class="stmt-table-wrap" v-loading="loading">
                    <el-table :data="filteredOrders" border size="mini" class="stmt-table">
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
                        <el-table-column label="" width="100" align="right">
                            <template slot-scope="s">
                                <el-button v-if="s.row.invoicePdfUrl" size="mini" type="text" icon="el-icon-document" @click="openPdf(s.row)">Invoice</el-button>
                            </template>
                        </el-table-column>
                        <template slot="empty"><span class="stmt-empty">{{ orders.length ? 'No invoices match the current filters.' : 'No invoices on your account yet.' }}</span></template>
                    </el-table>
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
import * as XLSX from 'xlsx-js-style'

const NO_VENDOR = 'Unspecified'

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
        // Vendors the customer has, with overall outstanding — one is always
        // selected; each statement (view + download) is for that single vendor.
        vendorTree() {
            const map = new Map()
            for (const o of this.orders) {
                const k = this.vendorLabel(o)
                if (!map.has(k)) map.set(k, { id: k, label: k, count: 0, total: 0, paid: 0 })
                const g = map.get(k)
                g.count++; g.total += Number(o.totalAmount) || 0; g.paid += Number(o.paidAmount) || 0
            }
            return [...map.values()]
                .map(g => ({ id: g.id, label: g.label, count: g.count, outstanding: g.total - g.paid }))
                .sort((a, b) => (b.outstanding - a.outstanding) || a.label.localeCompare(b.label))
        },
        // Invoices for the selected vendor after the date-range + All/Outstanding filters.
        filteredOrders() {
            let rows = this.vendorFilter ? this.orders.filter(o => this.vendorLabel(o) === this.vendorFilter) : this.orders
            const r = this.dateRange
            if (r && r[0]) { const f = this.startOfDay(r[0]); rows = rows.filter(o => { const d = this.orderDate(o); return d && d.getTime() >= f }) }
            if (r && r[1]) { const t = this.endOfDay(r[1]); rows = rows.filter(o => { const d = this.orderDate(o); return d && d.getTime() <= t }) }
            if (this.statusMode === 'outstanding') rows = rows.filter(o => Math.abs(Number(o.balance) || 0) > 0.005)
            return rows
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
        }
    },
    watch: {
        adminCustomer() { this.load() }
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
                this.selectDefaultVendor()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load statement'))
            } finally {
                this.loading = false
            }
        },
        // Keep a valid vendor selected — default to the first one on load / when
        // the current selection is no longer present (e.g. after a customer switch).
        selectDefaultVendor() {
            const v = this.vendorTree
            if (!v.some(x => x.id === this.vendorFilter)) this.vendorFilter = v.length ? v[0].id : ''
            this.syncTreeHighlight()
        },
        onVendorClick(data) {
            this.vendorFilter = data.id
            this.syncTreeHighlight()
        },
        syncTreeHighlight() {
            this.$nextTick(() => {
                const tree = this.$refs.vendorTree
                if (tree) tree.setCurrentKey(this.vendorFilter || null)
            })
        },
        vendorLabel(o) { return (o && o.vendor && String(o.vendor).trim()) || NO_VENDOR },
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
        nowStr() {
            const d = new Date(); const p = n => String(n).padStart(2, '0')
            return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
        },
        fmtAU(d) {
            if (d == null || d === '') return ''
            const x = d instanceof Date ? d : new Date(d)
            if (isNaN(x)) return ''
            const p = n => String(n).padStart(2, '0')
            return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${p(x.getFullYear())}`
        },
        // Export a "Statement of Accounts" .xlsx — a chronological running-balance
        // ledger (Opening Balance → transactions → Balance Due) plus an account
        // summary, styled like a printed statement. Respects the vendor selection
        // and the date period; the All/Outstanding toggle does NOT apply (a running
        // statement must include every transaction to stay coherent).
        downloadExcel() {
            const money = n => Number(n) || 0
            // A statement is for the selected vendor only.
            const src = this.vendorFilter
                ? this.orders.filter(o => this.vendorLabel(o) === this.vendorFilter)
                : this.orders.slice()

            const times = src.map(o => this.orderDate(o)).filter(Boolean).map(d => d.getTime())
            const startMs = (this.dateRange && this.dateRange[0])
                ? this.startOfDay(this.dateRange[0])
                : (times.length ? Math.min(...times) : this.startOfDay(new Date()))
            const endMs = (this.dateRange && this.dateRange[1])
                ? this.endOfDay(this.dateRange[1])
                : (times.length ? Math.max(...times) : this.endOfDay(new Date()))

            // Opening balance = net of everything before the period; the rest is
            // the in-period ledger (orders with no date fall into the period).
            let opening = 0
            const period = []
            for (const o of src) {
                const d = this.orderDate(o)
                const dm = d ? d.getTime() : null
                if (dm != null && dm < startMs) opening += money(o.totalAmount) - money(o.paidAmount)
                else if (dm != null && dm > endMs) { /* after period — skip */ }
                else period.push(o)
            }
            period.sort((a, b) => {
                const da = this.orderDate(a), db = this.orderDate(b)
                if (!da && !db) return 0
                if (!da) return 1
                if (!db) return -1
                return da - db
            })

            let invoicedNet = 0, paidSum = 0, bal = opening
            const txns = period.map(o => {
                const t = money(o.totalAmount), p = money(o.paidAmount)
                invoicedNet += t; paidSum += p; bal += (t - p)
                return {
                    date: this.dateStr(o),
                    type: (o.isCreditNote || t < 0) ? 'Credit Note' : 'Invoice',
                    details: o.invoiceNumber || '',
                    pdf: o.invoicePdfUrl || '',
                    amount: t, payment: p, balance: bal
                }
            })
            const balanceDue = opening + invoicedNet - paidSum
            const startLabel = this.fmtAU(startMs)
            const endLabel = this.fmtAU(endMs)
            // A statement is for one vendor — show its name under the title.
            const vendors = [...new Set(src.map(o => (o.vendor && String(o.vendor).trim()) || '').filter(Boolean))]
            const vendorName = vendors.join(', ') || '—'

            // Number formats: Amount uses accounting parentheses for negatives;
            // Payments/Balance a plain 2dp; the summary a "$ 0.00 / $ -0.00" form.
            const AMT = '#,##0.00;(#,##0.00)'
            const NUM = '#,##0.00'
            const CUR = '"$" #,##0.00;"$" -#,##0.00'

            const titleStyle = { font: { bold: true, sz: 14 }, alignment: { horizontal: 'right' }, border: { bottom: { style: 'medium', color: { rgb: '000000' } } } }
            const rangeStyle = { alignment: { horizontal: 'right' }, border: { bottom: { style: 'thin', color: { rgb: 'BFBFBF' } } } }
            const vendorStyle = { font: { bold: true, sz: 11 }, alignment: { horizontal: 'right' } }
            const toStyle = { font: { sz: 9, color: { rgb: '888888' } } }
            const custStyle = { font: { bold: true, sz: 12 } }
            const sumHeadStyle = { font: { bold: true }, fill: { fgColor: { rgb: 'EDEDED' } } }
            const sumLabelStyle = { alignment: { horizontal: 'left' } }
            const sumValStyle = { alignment: { horizontal: 'right' } }
            const dueLabelStyle = { font: { bold: true }, border: { top: { style: 'thin', color: { rgb: 'BFBFBF' } } } }
            const dueValStyle = { font: { bold: true }, alignment: { horizontal: 'right' }, border: { top: { style: 'thin', color: { rgb: 'BFBFBF' } } } }
            const thStyle = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '333333' } }, alignment: { vertical: 'center' } }
            const rightBold = { font: { bold: true }, alignment: { horizontal: 'right' } }
            const linkStyle = { font: { color: { rgb: '0563C1' }, underline: true } }

            const aoa = []
            const merges = []
            const styles = []   // { r, c, s }
            const fmts = []     // { r, c, z }
            const links = []    // { r, c, target }
            const push = arr => { aoa.push(arr); return aoa.length - 1 }
            const sty = (r, c, s) => styles.push({ r, c, s })
            const fmt = (r, c, z) => fmts.push({ r, c, z })
            const lnk = (r, c, target) => links.push({ r, c, target })

            // Header — "To / customer" (left) + title / vendor / period (right, cols D–F)
            const r0 = push(['To', '', '', 'Statement of Accounts', '', ''])
            sty(r0, 0, toStyle);[3, 4, 5].forEach(c => sty(r0, c, titleStyle))
            merges.push({ s: { r: r0, c: 3 }, e: { r: r0, c: 5 } })
            const r1 = push([this.customerName || '—', '', '', vendorName, '', ''])
            sty(r1, 0, custStyle);[3, 4, 5].forEach(c => sty(r1, c, vendorStyle))
            merges.push({ s: { r: r1, c: 3 }, e: { r: r1, c: 5 } })
            const r2 = push(['', '', '', `${startLabel} To ${endLabel}`, '', '']);
            [3, 4, 5].forEach(c => sty(r2, c, rangeStyle))
            merges.push({ s: { r: r2, c: 3 }, e: { r: r2, c: 5 } })
            push([])

            // Account Summary block (right side, cols C–F)
            const rH = push(['', '', 'Account Summary', '', '', '']);
            [2, 3, 4, 5].forEach(c => sty(rH, c, sumHeadStyle))
            merges.push({ s: { r: rH, c: 2 }, e: { r: rH, c: 5 } })
            const sline = (label, val) => {
                const r = push(['', '', label, '', '', val])
                merges.push({ s: { r, c: 2 }, e: { r, c: 4 } })
                sty(r, 2, sumLabelStyle); sty(r, 5, sumValStyle); fmt(r, 5, CUR)
                return r
            }
            sline('Opening Balance', opening)
            sline('Invoiced Amount', invoicedNet)
            sline('Amount Paid', paidSum)
            const rDue = sline(`Balance Due (As of ${endLabel})`, balanceDue);
            [2, 3, 4].forEach(c => sty(rDue, c, dueLabelStyle)); sty(rDue, 5, dueValStyle)
            push([]); push([])

            // Transactions table
            const COLS = ['Date', 'Transactions', 'Details', 'Amount', 'Payments', 'Balance']
            const rTh = push([...COLS])
            for (let c = 0; c < COLS.length; c++) sty(rTh, c, thStyle)

            const rOpen = push([startLabel, '***Opening Balance***', '', 0, '', opening])
            sty(rOpen, 1, { font: { bold: true } }); fmt(rOpen, 3, AMT); fmt(rOpen, 5, NUM)

            txns.forEach(t => {
                const r = push([t.date, t.type, t.details, t.amount, t.payment, t.balance])
                fmt(r, 3, AMT); fmt(r, 4, NUM); fmt(r, 5, NUM)
                // Make the invoice number (Details) a link to its PDF, when there is one.
                if (t.pdf) { lnk(r, 2, t.pdf); sty(r, 2, linkStyle) }
            })

            // Balance Due footer (label right-aligned across C–E, value in F)
            const rFoot = push(['', '', `Balance Due (As of ${endLabel})`, '', '', balanceDue])
            merges.push({ s: { r: rFoot, c: 2 }, e: { r: rFoot, c: 4 } });
            [2, 3, 4].forEach(c => sty(rFoot, c, rightBold)); sty(rFoot, 5, rightBold); fmt(rFoot, 5, CUR)

            // Assemble
            const ws = XLSX.utils.aoa_to_sheet(aoa)
            ws['!cols'] = [{ wch: 13 }, { wch: 18 }, { wch: 34 }, { wch: 14 }, { wch: 13 }, { wch: 15 }]
            ws['!merges'] = merges
            const setS = (r, c, s) => { const a = XLSX.utils.encode_cell({ r, c }); if (ws[a]) ws[a].s = Object.assign({}, ws[a].s, s) }
            styles.forEach(({ r, c, s }) => setS(r, c, s))
            fmts.forEach(({ r, c, z }) => { const a = XLSX.utils.encode_cell({ r, c }); if (ws[a] && typeof ws[a].v === 'number') { ws[a].t = 'n'; ws[a].z = z } })
            links.forEach(({ r, c, target }) => { const a = XLSX.utils.encode_cell({ r, c }); if (ws[a]) ws[a].l = { Target: target, Tooltip: 'Open invoice PDF' } })

            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, 'Statement')
            const safe = (this.customerName || 'customer').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40)
            XLSX.writeFile(wb, `Statement_${safe}_${this.nowStr().slice(0, 10)}.xlsx`)
        },
        msg(e, fallback) { return (e.response && e.response.data && e.response.data.message) || e.message || fallback }
    }
}
</script>

<style lang="scss" scoped>
.stmt { padding: 14px 16px; }
.stmt-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 14px; }
.stmt-actions { display: flex; gap: 8px; flex: none; }
.stmt-back { padding: 0 0 4px; }
.stmt-title { font-size: 17px; font-weight: 600; color: #303133; }
.stmt-sub { font-size: 13px; color: #909399; margin-top: 3px; }

.stmt-body { display: flex; align-items: flex-start; gap: 16px; }
.stmt-tree-panel { width: 250px; flex: none; background: #fff; border: 1px solid #ebeef5; border-radius: 6px; padding: 8px 4px; max-height: calc(100vh - 170px); overflow: auto; }
.stmt-tree-head { font-size: 12px; font-weight: 600; color: #909399; text-transform: uppercase; letter-spacing: .04em; padding: 4px 10px 8px; }
.stmt-tree { background: transparent; }
.stmt-tree-empty { color: #909399; font-size: 13px; padding: 8px 10px; }
.vt-node { display: flex; align-items: center; justify-content: space-between; width: 100%; padding-right: 8px; gap: 8px; overflow: hidden; }
.vt-label { font-size: 13px; color: #303133; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
.stmt-table-wrap { min-height: 60px; }
.stmt-table { width: 100%; }
.stmt-cn { margin-left: 6px; }
.stmt-empty { color: #909399; font-size: 13px; }
.neg { color: #67C23A; }
.owing { color: #E6A23C; font-weight: 600; }
.stmt-desc { margin-bottom: 6px; }
.stmt-sec { font-weight: 600; font-size: 13px; color: #303133; margin: 14px 0 6px; }
.stmt-pdf-wrap { height: 72vh; background: #f2f3f5; }
.stmt-pdf-frame { width: 100%; height: 100%; border: none; display: block; }
.stmt-pdf-open { margin-right: 12px; }
::v-deep .el-tree-node__content { height: 32px; }
</style>
