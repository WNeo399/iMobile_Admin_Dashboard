<template>
    <!--
        Refurbished Device → Consignment → Invoices: invoices to the
        consignment shops for what they sold. The dashboard raises them since
        2026-10-01 (user ask — AirTable used to; those INV-A… invoices were
        imported with their paid status). No weekly cut-off: the top box
        (ConsignReadyToInvoice, shared with iMobile Accountant → Dashboard)
        shows every sold device that isn't on an invoice yet, per shop, and
        raises one invoice per shop — ticked shops in one go, or one row —
        Shop Price plus 10% GST. Below, every invoice with its paid status, a
        PDF to print or send, and void for one raised by mistake (its devices
        go back to the top box).
    -->
    <div class="ci-page">
        <div class="ci-header">
            <div>
                <div class="ci-title">{{ $tp('Consignment Invoices') }}</div>
                <div class="ci-sub">{{ $tp('Invoices to the consignment shops for the devices they sold — Shop Price plus 10% GST.') }}</div>
            </div>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="loadAll">{{ $tp('Refresh') }}</el-button>
        </div>

        <!-- sold, not on an invoice yet -->
        <div class="ci-box ci-box-ready">
            <consign-ready-to-invoice ref="ready" @raised="onRaised" />
        </div>

        <!-- the invoices -->
        <div class="ci-box">
            <div class="ci-box-head">
                <el-radio-group v-model="statusTab" size="small" @change="load">
                    <el-radio-button label="unpaid">{{ $tp('Unpaid') }} <span class="ci-count">{{ tabCount('unpaid') }}</span></el-radio-button>
                    <el-radio-button label="paid">{{ $tp('Paid') }} <span class="ci-count">{{ tabCount('paid') }}</span></el-radio-button>
                    <el-radio-button label="void">{{ $tp('Void') }} <span class="ci-count">{{ tabCount('void') }}</span></el-radio-button>
                    <el-radio-button label="all">{{ $tp('All') }}</el-radio-button>
                </el-radio-group>
                <span v-if="totals.unpaid && totals.unpaid.total" class="ci-owed">{{ $tp('{amount} unpaid', { amount: money(totals.unpaid.total) }) }}</span>
                <span class="ci-spacer" />
                <el-select v-model="shopFilter" size="small" clearable filterable :placeholder="$tp('All shops')" style="width: 180px" @change="load">
                    <el-option v-for="s in shops" :key="s._id" :label="s.name" :value="s._id" />
                </el-select>
            </div>
            <el-table v-loading="loading" :data="invoices" size="small" class="ci-table" :empty-text="$tp('No invoices')" @row-click="openDetail">
                <el-table-column :label="$tp('Invoice')" width="150">
                    <template slot-scope="s">
                        <div class="ci-mono ci-num">{{ s.row.number }}</div>
                        <span v-if="s.row.source === 'airtable'" class="ci-src">AirTable</span>
                        <span v-if="s.row.inflowRecordedAt" class="ci-inflow" :title="inflowTitle(s.row)" @click.stop="markInflow(s.row, false)"><i class="el-icon-check" /> inFlow</span>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Shop')" prop="shopName" min-width="110" />
                <el-table-column :label="$tp('Sold')" min-width="190">
                    <template slot-scope="s">{{ fmtPeriod(s.row.periodLabel) }}</template>
                </el-table-column>
                <el-table-column :label="$tp('Devices')" prop="deviceCount" width="80" align="center" />
                <el-table-column :label="$tp('Total')" width="120" align="right">
                    <template slot-scope="s">
                        <b>{{ money(s.row.total) }}</b>
                        <div v-if="s.row.gstRate" class="ci-dim">{{ $tp('inc GST') }}</div>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Status')" width="120" align="center">
                    <template slot-scope="s">
                        <span :class="['ci-pay', payKey(s.row)]">{{ payLabel(s.row) }}</span>
                        <div v-if="s.row.paidAt" class="ci-dim">{{ fmtDate(s.row.paidAt) }}</div>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Raised')" width="140">
                    <template slot-scope="s">
                        <div>{{ fmtDate(s.row.createdAt) }}</div>
                        <div class="ci-dim">{{ s.row.createdBy }}</div>
                    </template>
                </el-table-column>
                <el-table-column width="270" align="right">
                    <template slot-scope="s">
                        <div @click.stop>
                            <el-button type="text" size="mini" icon="el-icon-document" @click="openPdf(s.row)">PDF</el-button>
                            <el-button v-if="!s.row.inflowRecordedAt && payKey(s.row) !== 'void'" type="text" size="mini" class="ci-inflow-btn" @click="markInflow(s.row, true)">✓ inFlow</el-button>
                            <el-button v-if="payKey(s.row) === 'unpaid' && s.row.inflowRecordedAt" type="text" size="mini" class="ci-ok" @click="setPaid(s.row, true)">{{ $tp('Mark paid') }}</el-button>
                            <el-button v-else-if="payKey(s.row) === 'paid'" type="text" size="mini" @click="setPaid(s.row, false)">{{ $tp('Mark unpaid') }}</el-button>
                            <el-button v-if="s.row.source === 'dashboard' && payKey(s.row) === 'unpaid'" type="text" size="mini" class="ci-bad" @click="voidInvoice(s.row)">{{ $tp('Void') }}</el-button>
                        </div>
                    </template>
                </el-table-column>
            </el-table>
        </div>

        <!-- one invoice -->
        <el-dialog :visible.sync="detailVisible" width="760px" top="6vh" append-to-body>
            <div slot="title" class="ci-dlg-title">
                <i class="el-icon-tickets" /> {{ detail.invoice ? detail.invoice.number : '' }}
                <span v-if="detail.invoice" :class="['ci-pay', payKey(detail.invoice)]">{{ payLabel(detail.invoice) }}</span>
            </div>
            <div v-if="detail.invoice" class="ci-dlg-meta">
                <div><span class="ci-k">{{ $tp('Shop') }}</span> {{ detail.invoice.shopName }}</div>
                <div><span class="ci-k">{{ $tp('Sold') }}</span> {{ fmtPeriod(detail.invoice.periodLabel) }}</div>
                <div><span class="ci-k">{{ $tp('Raised') }}</span> {{ fmtDate(detail.invoice.createdAt) }} · {{ detail.invoice.createdBy }}</div>
                <div v-if="detail.invoice.paidAt"><span class="ci-k">{{ $tp('Paid') }}</span> {{ fmtDate(detail.invoice.paidAt) }}<template v-if="detail.invoice.paidBy"> · {{ detail.invoice.paidBy }}</template></div>
                <div><span class="ci-k">inFlow</span>
                    <template v-if="detail.invoice.inflowRecordedAt">{{ $tp('recorded') }} {{ fmtDate(detail.invoice.inflowRecordedAt) }}<template v-if="detail.invoice.inflowRecordedBy"> · {{ detail.invoice.inflowRecordedBy }}</template></template>
                    <span v-else class="ci-dim">{{ $tp('not recorded yet') }}</span>
                </div>
            </div>
            <el-table v-loading="detail.loading" :data="detail.lines" size="mini" border max-height="360">
                <el-table-column type="index" width="42" align="center" />
                <el-table-column :label="$tp('Sold')" width="110">
                    <template slot-scope="l">{{ fmtDate(l.row.soldAt) }}</template>
                </el-table-column>
                <el-table-column :label="$tp('Device')" min-width="230">
                    <template slot-scope="l">{{ l.row.productName }} <el-tag v-if="l.row.grade" size="mini" effect="plain">{{ l.row.grade }}</el-tag></template>
                </el-table-column>
                <el-table-column :label="$tp('IMEI / Serial')" width="150">
                    <template slot-scope="l"><span class="ci-mono">{{ l.row.imei }}</span></template>
                </el-table-column>
                <el-table-column :label="$tp('Shop Price')" width="100" align="right">
                    <template slot-scope="l">{{ money(l.row.shopPrice) }}</template>
                </el-table-column>
            </el-table>
            <div v-if="detail.invoice" class="ci-dlg-total">
                <template v-if="detail.invoice.gstRate">
                    <div>{{ $tp('Sub Total') }} <span>{{ money(detail.invoice.subTotal) }}</span></div>
                    <div>{{ $tp('GST ({p}%)', { p: Math.round(detail.invoice.gstRate * 100) }) }} <span>{{ money(detail.invoice.gstAmount) }}</span></div>
                </template>
                <div class="ci-dlg-grand">{{ $tp('Total') }} <b>{{ money(detail.invoice.total) }}</b></div>
            </div>
            <span slot="footer">
                <el-button size="small" icon="el-icon-document" :disabled="!detail.invoice || detail.loading" @click="openPdf(detail.invoice)">{{ $tp('View PDF') }}</el-button>
                <el-button v-if="detail.invoice && payKey(detail.invoice) !== 'void' && !detail.invoice.inflowRecordedAt" size="small" class="ci-inflow-solid"
                    @click="markDetailInflow">✓ {{ $tp('Recorded in inFlow') }}</el-button>
                <el-button v-if="detail.invoice && payKey(detail.invoice) === 'unpaid' && detail.invoice.inflowRecordedAt" size="small"
                    @click="markDetailInflow">{{ $tp('Not recorded in inFlow') }}</el-button>
                <el-button v-if="detail.invoice && payKey(detail.invoice) === 'unpaid' && detail.invoice.inflowRecordedAt" size="small" type="success" @click="setPaid(detail.invoice, true)">{{ $tp('Mark paid') }}</el-button>
                <el-button v-else-if="detail.invoice && payKey(detail.invoice) === 'paid'" size="small" @click="setPaid(detail.invoice, false)">{{ $tp('Mark unpaid') }}</el-button>
                <el-button size="small" type="primary" @click="detailVisible = false">{{ $tp('Close') }}</el-button>
            </span>
        </el-dialog>

        <consign-invoice-pdf ref="pdf" />
    </div>
</template>

<script>
import { getConsignInvoices, getConsignInvoiceDetail, setConsignInvoicePaid, voidConsignInvoice } from '@/api/consignment'
import ConsignReadyToInvoice from './components/ConsignReadyToInvoice'
import ConsignInvoicePdf from './components/ConsignInvoicePdf'
import inflowMark from './components/inflowMark'

export default {
    name: 'ConsignmentInvoices',
    components: { ConsignReadyToInvoice, ConsignInvoicePdf },
    mixins: [inflowMark],
    data() {
        return {
            loading: false,
            invoices: [],
            totals: {},
            shops: [],
            shopFilter: '',
            statusTab: 'unpaid',
            detailVisible: false,
            detail: { invoice: null, lines: [], loading: false }
        }
    },
    created() {
        this.load()
    },
    activated() {
        this.loadAll()
    },
    methods: {
        loadAll() {
            if (this.$refs.ready) this.$refs.ready.load()
            this.load()
        },
        onRaised() {
            this.statusTab = 'unpaid'
            this.load()
        },
        async load() {
            this.loading = true
            try {
                const r = await getConsignInvoices({
                    shopId: this.shopFilter || undefined,
                    paymentStatus: this.statusTab === 'all' ? undefined : this.statusTab
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.invoices = r.invoices || []
                this.totals = r.totals || {}
                if (r.shops) this.shops = r.shops
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load invoices')))
            } finally {
                this.loading = false
            }
        },
        tabCount(k) {
            return (this.totals[k] && this.totals[k].count) || 0
        },
        async openDetail(row) {
            this.detail = { invoice: row, lines: [], loading: true }
            this.detailVisible = true
            try {
                const r = await getConsignInvoiceDetail(row._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.detail = { invoice: r.invoice, lines: r.lines || [], loading: false }
            } catch (e) {
                this.detail.loading = false
                this.$message.error(this.msg(e, this.$tp('Failed to load the invoice')))
            }
        },
        openPdf(row) {
            const loaded = this.detail.invoice && this.detail.invoice._id === row._id && this.detail.lines.length
                ? { invoice: this.detail.invoice, lines: this.detail.lines }
                : null
            this.$refs.pdf.open(row, loaded)
        },
        async markDetailInflow() {
            const inv = this.detail.invoice
            await this.markInflow(inv, !inv.inflowRecordedAt)
            const row = this.invoices.find(i => i._id === inv._id)
            if (row && row !== inv) {
                this.$set(row, 'inflowRecordedAt', inv.inflowRecordedAt)
                this.$set(row, 'inflowRecordedBy', inv.inflowRecordedBy)
            }
        },
        async setPaid(row, paid) {
            try {
                const r = await setConsignInvoicePaid(row._id, paid)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(paid ? this.$tp('{number} marked paid', { number: row.number }) : this.$tp('{number} marked unpaid', { number: row.number }))
                if (this.detail.invoice && this.detail.invoice._id === row._id) {
                    this.detail.invoice = { ...this.detail.invoice, paymentStatus: r.paymentStatus, paidAt: r.paidAt }
                }
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to update the invoice')))
            }
        },
        async voidInvoice(row) {
            try {
                await this.$confirm(
                    this.$tp('Void {number}? Its {n} device(s) go back to "Sold, not invoiced yet".', { number: row.number, n: row.deviceCount }),
                    this.$tp('Void invoice'), { confirmButtonText: this.$tp('Void'), cancelButtonText: this.$tp('Cancel'), type: 'warning' })
            } catch (e) { return }
            try {
                const r = await voidConsignInvoice(row._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('{number} voided', { number: row.number }))
                this.loadAll()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to void the invoice')))
            }
        },
        payKey(inv) {
            return inv.paymentStatus === 'paid' ? 'paid' : inv.paymentStatus === 'void' ? 'void' : 'unpaid'
        },
        payLabel(inv) {
            return { paid: this.$tp('Paid'), unpaid: this.$tp('Unpaid'), void: this.$tp('Void') }[this.payKey(inv)]
        },
        money(v) {
            if (v == null || v === '') return '—'
            return '$' + Number(v).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        },
        fmtDate(d) {
            if (!d) return '—'
            const x = new Date(d)
            if (isNaN(x.getTime())) return '—'
            return x.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
        },
        fmtYmd(ymd) {
            if (!ymd) return ''
            const [y, m, d] = String(ymd).split('-').map(Number)
            return new Date(y, m - 1, d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
        },
        fmtPeriod(label) {
            const parts = String(label || '').split(/\s+[–-]\s+/)
            if (parts.length !== 2) return String(label || '') || '—'
            return parts[0] === parts[1] ? this.fmtYmd(parts[0]) : `${this.fmtYmd(parts[0])} – ${this.fmtYmd(parts[1])}`
        },
        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback
        }
    }
}
</script>

<style scoped>
.ci-page { padding: 16px 20px; min-height: calc(100vh - 84px); background: #f6f8fb; }
.ci-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.ci-title { font-size: 20px; font-weight: 700; color: #1f2937; line-height: 1.2; }
.ci-sub { font-size: 13px; color: #909399; margin-top: 3px; }
.ci-box { background: #fff; border: 1px solid #ebeef5; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
.ci-box-ready { border-left: 4px solid #e6a23c; }
.ci-box-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.ci-spacer { flex: 1; }
.ci-dim { font-size: 12px; color: #909399; }
.ci-count { display: inline-block; min-width: 16px; margin-left: 4px; padding: 0 5px; border-radius: 9px; background: rgba(0, 0, 0, .06); font-size: 11px; line-height: 16px; }
.ci-owed { font-size: 13px; color: #f56c6c; font-weight: 600; }
.ci-table >>> .el-table__row { cursor: pointer; }
.ci-mono { font-family: Consolas, Menlo, monospace; font-size: 12px; }
.ci-num { font-weight: 600; color: #303133; }
.ci-src { display: inline-block; font-size: 10px; color: #909399; background: #f4f4f5; border-radius: 3px; padding: 0 5px; line-height: 16px; margin-top: 2px; }
.ci-pay { display: inline-block; font-size: 12px; padding: 1px 9px; border-radius: 10px; font-weight: 500; }
.ci-pay.paid { color: #529b2e; background: #f0f9eb; }
.ci-pay.unpaid { color: #f56c6c; background: #fef0f0; }
.ci-pay.void { color: #909399; background: #f4f4f5; text-decoration: line-through; }
.ci-ok { color: #529b2e; }
/* entered in inFlow — click the label to take the mark off */
.ci-inflow { display: inline-block; font-size: 10px; color: #fff; background: #13a89e; border-radius: 3px; padding: 0 5px; line-height: 16px; margin: 2px 0 0 3px; cursor: pointer; }
.ci-inflow:hover { background: #0f8a82; }
.ci-inflow-btn { color: #13a89e; }
.ci-inflow-solid { color: #fff; background: #13a89e; border-color: #13a89e; }
.ci-inflow-solid:hover, .ci-inflow-solid:focus { color: #fff; background: #0f8a82; border-color: #0f8a82; }
.ci-bad { color: #f56c6c; }
.ci-dlg-title { font-size: 15px; font-weight: 600; color: #303133; display: flex; align-items: center; gap: 8px; }
.ci-dlg-title i { color: #409eff; }
.ci-dlg-meta { display: grid; gap: 3px; font-size: 13px; color: #606266; margin-bottom: 10px; }
.ci-k { display: inline-block; width: 90px; color: #909399; }
.ci-dlg-total { margin-top: 10px; margin-left: auto; width: 240px; font-size: 13px; color: #606266; }
.ci-dlg-total > div { display: flex; justify-content: space-between; padding: 2px 0; }
.ci-dlg-grand { border-top: 1px solid #ebeef5; margin-top: 4px; padding-top: 6px !important; font-size: 14px; }
.ci-dlg-grand b { color: #303133; font-size: 16px; }
</style>
