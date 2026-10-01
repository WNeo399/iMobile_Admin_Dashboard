<template>
    <!--
        iMobile Accountant → Dashboard (rebuilt 2026-10-01, user ask), two
        sections side by side (stacked when the window is too narrow):
          · Consignment — what the consignment shops have sold that isn't
            invoiced yet (raise invoices, one per shop, the ticked shops in
            one go: consignment/components/ConsignReadyToInvoice, shared with
            Consignment → Invoices) and the unpaid consignment invoices (newest
            first, PDF, Mark paid). More is to come in this section.
          · My Fone — the My Fone shops with an outstanding balance (from the
            same cached Zoho unpaid list as the My Fone page); a shop opens a
            drawer with its unpaid invoices.
    -->
    <div class="ad-page">
        <div class="ad-header">
            <div>
                <div class="ad-title">{{ $tp('Dashboard') }}</div>
                <div class="ad-sub">{{ $tp('What\'s waiting to be invoiced, and what the shops still owe.') }}</div>
            </div>
            <el-button size="small" icon="el-icon-refresh" :loading="unpaidLoading || mfLoading" @click="loadAll">{{ $tp('Refresh') }}</el-button>
        </div>

        <div class="ad-sections">
        <!-- ══ Consignment ══ -->
        <section class="ad-section">
            <div class="ad-section-head">
                <i class="el-icon-box" />
                <span class="ad-section-title">{{ $tp('Consignment') }}</span>
                <span class="ad-section-sub">{{ $tp('devices sold by the consignment shops, and their invoices') }}</span>
            </div>

            <div class="ad-tiles">
                <div class="ad-tile ad-tile-ready">
                    <div class="ad-tile-label">{{ $tp('Sold, not invoiced yet') }}</div>
                    <div class="ad-tile-value">{{ ready ? money(ready.total) : '—' }}</div>
                    <div class="ad-dim" v-if="ready">{{ $tp('{n} device(s)', { n: ready.count }) }} · {{ $tp('{n} shop(s)', { n: ready.shops }) }} · {{ $tp('inc GST') }}</div>
                </div>
                <div class="ad-tile ad-tile-unpaid">
                    <div class="ad-tile-label">{{ $tp('Unpaid invoices') }}</div>
                    <div class="ad-tile-value">{{ money(unpaidTotal) }}</div>
                    <div class="ad-dim">
                        {{ $tp('{n} invoice(s)', { n: unpaid.length }) }}<template v-if="oldest"> · {{ $tp('oldest raised {d}', { d: ageText(oldest.createdAt) }) }}</template>
                    </div>
                </div>
            </div>

            <div class="ad-box ad-box-ready">
                <consign-ready-to-invoice ref="ready" compact @loaded="r => (ready = r)" @raised="loadUnpaid" />
            </div>

            <div class="ad-box ad-box-unpaid">
                <div class="ad-box-head">
                    <span class="ad-box-title">{{ $tp('Unpaid consignment invoices') }}</span>
                    <span v-if="unpaid.length" class="ad-owed">{{ $tp('{n} invoice(s)', { n: unpaid.length }) }} · {{ money(unpaidTotal) }}</span>
                    <span class="ad-spacer" />
                    <el-select v-model="shopFilter" size="small" clearable filterable :placeholder="$tp('All shops')" style="width: 170px">
                        <el-option v-for="s in unpaidShops" :key="s" :label="s" :value="s" />
                    </el-select>
                </div>
                <el-table v-loading="unpaidLoading" :data="shownUnpaid" size="small" class="ad-table" :empty-text="$tp('No unpaid invoices')" @row-click="openPdf">
                    <el-table-column :label="$tp('Invoice')" width="135">
                        <template slot-scope="s">
                            <div class="ad-mono ad-num">{{ s.row.number }}</div>
                            <!-- the labels side by side, on one line -->
                            <div v-if="s.row.source === 'airtable' || s.row.inflowRecordedAt" class="ad-tags">
                                <span v-if="s.row.source === 'airtable'" class="ad-src">AirTable</span>
                                <span v-if="s.row.inflowRecordedAt" class="ad-inflow" :title="inflowTitle(s.row)" @click.stop="markInflow(s.row, false)"><i class="el-icon-check" /> inFlow</span>
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column :label="$tp('Shop')" width="125">
                        <template slot-scope="s">
                            <div>{{ s.row.shopName }}</div>
                            <div class="ad-dim">{{ $tp('sold') }} {{ fmtPeriod(s.row.periodLabel) }}</div>
                        </template>
                    </el-table-column>
                    <el-table-column :label="$tp('Total')" width="105" align="right">
                        <template slot-scope="s">
                            <b>{{ money(s.row.total) }}</b>
                            <div class="ad-dim">{{ $tp('{n} device(s)', { n: s.row.deviceCount }) }}</div>
                        </template>
                    </el-table-column>
                    <el-table-column :label="$tp('Raised')" min-width="100">
                        <template slot-scope="s">
                            <div>{{ fmtDate(s.row.createdAt) }}</div>
                            <div :class="['ad-age', ageTone(s.row.createdAt)]">{{ ageText(s.row.createdAt) }}</div>
                        </template>
                    </el-table-column>
                    <!-- the next step only: record it in inFlow, then (and only
                         then) mark it paid (user rule 2026-10-01) -->
                    <el-table-column width="120" align="right">
                        <template slot-scope="s">
                            <div class="ad-acts" @click.stop>
                                <el-button type="text" size="mini" icon="el-icon-document" :title="$tp('View PDF')" @click="openPdf(s.row)">PDF</el-button>
                                <el-button v-if="!s.row.inflowRecordedAt" type="text" size="mini" class="ad-inflow-btn" :title="$tp('Mark as recorded in inFlow')" @click="markInflow(s.row, true)">✓ inFlow</el-button>
                                <el-button v-else type="text" size="mini" class="ad-ok" icon="el-icon-check" :title="$tp('Mark paid')" @click="markPaid(s.row)">{{ $tp('Paid') }}</el-button>
                            </div>
                        </template>
                    </el-table-column>
                </el-table>
            </div>
        </section>

        <!-- ══ My Fone ══ -->
        <section class="ad-section">
            <div class="ad-section-head">
                <i class="el-icon-s-shop" />
                <span class="ad-section-title">{{ $tp('My Fone') }}</span>
                <span class="ad-section-sub">{{ $tp('shops with an outstanding balance — click one for its unpaid invoices') }}</span>
            </div>

            <div class="ad-tiles">
                <div class="ad-tile ad-tile-mf">
                    <div class="ad-tile-label">{{ $tp('Outstanding') }}</div>
                    <div class="ad-tile-value">{{ money(mfOwing) }}</div>
                    <div class="ad-dim">{{ $tp('{n} shop(s)', { n: owingShops.length }) }} · {{ $tp('{n} unpaid invoice(s)', { n: mfInvoices }) }}</div>
                </div>
                <div class="ad-tile ad-tile-unpaid">
                    <div class="ad-tile-label">{{ $tp('Overdue') }}</div>
                    <div class="ad-tile-value">{{ money(mfOverdue) }}</div>
                    <div class="ad-dim">{{ $tp('{n} shop(s)', { n: owingShops.filter(x => x.overdue > 0).length }) }}<template v-if="mfOldest"> · {{ $tp('oldest {n} days late', { n: daysSince(mfOldest).toLocaleString('en-AU') }) }}</template></div>
                </div>
            </div>

            <div class="ad-box ad-box-mf">
                <div class="ad-box-head">
                    <span class="ad-box-title">{{ $tp('Outstanding balances') }}</span>
                    <span class="ad-spacer" />
                    <span v-if="mfFetchedAt" class="ad-dim">{{ $tp('from Zoho Inventory, updated {t}', { t: agoText(mfFetchedAt) }) }}</span>
                    <span v-if="mfStale" class="ad-warn">{{ $tp('Zoho could not be read just now — showing the last figures') }}</span>
                </div>
                <el-table v-loading="mfLoading" :data="owingShops" size="small" class="ad-table" :empty-text="$tp('No My Fone shop owes anything')" @row-click="openShop">
                    <el-table-column :label="$tp('Shop')" min-width="170">
                        <template slot-scope="s">
                            <div class="ad-shop">{{ s.row.name }}</div>
                            <div v-if="s.row.email || s.row.phone" class="ad-dim ad-contact">{{ [s.row.email, s.row.phone].filter(Boolean).join(' · ') }}</div>
                        </template>
                    </el-table-column>
                    <el-table-column :label="$tp('Outstanding')" width="115" align="right">
                        <template slot-scope="s">
                            <b>{{ money(s.row.outstanding) }}</b>
                            <div class="ad-dim">{{ $tp('{n} unpaid', { n: s.row.invoices }) }}</div>
                        </template>
                    </el-table-column>
                    <el-table-column :label="$tp('Overdue')" width="100" align="right">
                        <template slot-scope="s">
                            <span v-if="s.row.overdue" class="ad-red">{{ money(s.row.overdue) }}</span>
                            <span v-else class="ad-dim">—</span>
                        </template>
                    </el-table-column>
                    <el-table-column :label="$tp('Oldest overdue')" width="125">
                        <template slot-scope="s">
                            <template v-if="s.row.oldestDue">
                                <span :class="['ad-late', lateTone(daysSince(s.row.oldestDue))]">{{ $tp('{n} days late', { n: daysSince(s.row.oldestDue).toLocaleString('en-AU') }) }}</span>
                                <div class="ad-dim">{{ $tp('due {d}', { d: fmtYmd(s.row.oldestDue) }) }}</div>
                            </template>
                            <span v-else class="ad-dim">—</span>
                        </template>
                    </el-table-column>
                    <el-table-column width="34" align="center">
                        <template><i class="el-icon-arrow-right ad-go" /></template>
                    </el-table-column>
                </el-table>
            </div>
        </section>
        </div>

        <consign-invoice-pdf ref="pdf" />

        <!-- a My Fone shop's unpaid invoices -->
        <el-drawer :visible.sync="drawer.visible" size="min(820px, 100vw)" :with-header="false" append-to-body>
            <div class="ad-drawer" v-loading="drawer.loading">
                <div class="ad-drawer-head">
                    <div class="ad-drawer-who">
                        <div class="ad-drawer-title">{{ drawer.shop ? drawer.shop.name : '' }}</div>
                        <div v-if="drawer.shop && (drawer.shop.email || drawer.shop.phone)" class="ad-dim">{{ [drawer.shop.email, drawer.shop.phone].filter(Boolean).join(' · ') }}</div>
                    </div>
                    <span class="ad-spacer" />
                    <el-button size="small" icon="el-icon-close" @click="drawer.visible = false" />
                </div>
                <div class="ad-drawer-sum">
                    <div class="ad-drawer-fig">
                        <div class="ad-tile-label">{{ $tp('Outstanding') }}</div>
                        <div class="ad-drawer-value">{{ money(drawerOwing) }}</div>
                        <div class="ad-dim">{{ $tp('{n} unpaid invoice(s)', { n: drawer.rows.length }) }}</div>
                    </div>
                    <div class="ad-drawer-fig">
                        <div class="ad-tile-label">{{ $tp('Overdue') }}</div>
                        <div :class="['ad-drawer-value', { 'ad-red': drawerOverdue }]">{{ money(drawerOverdue) }}</div>
                        <div class="ad-dim">{{ $tp('{n} invoice(s)', { n: drawer.rows.filter(r => r.daysOverdue > 0).length }) }}</div>
                    </div>
                </div>
                <el-table :data="drawer.rows" size="small" border class="ad-drawer-table" :empty-text="drawer.loading ? $tp('Loading…') : $tp('No unpaid invoices')">
                    <el-table-column :label="$tp('Invoice')" width="130">
                        <template slot-scope="s">
                            <a :href="zohoInvoice(s.row.invoiceId)" target="_blank" rel="noopener" class="ad-link ad-mono" :title="$tp('Open in Zoho')">{{ s.row.invoiceNumber }}</a>
                        </template>
                    </el-table-column>
                    <el-table-column :label="$tp('Order No.')" width="120">
                        <template slot-scope="s"><span class="ad-mono">{{ s.row.orderNumber || '—' }}</span></template>
                    </el-table-column>
                    <el-table-column :label="$tp('Date')" width="110">
                        <template slot-scope="s">{{ fmtYmd(s.row.date) }}</template>
                    </el-table-column>
                    <el-table-column :label="$tp('Due')" min-width="160">
                        <template slot-scope="s">
                            {{ fmtYmd(s.row.dueDate) }}
                            <span v-if="s.row.daysOverdue > 0" :class="['ad-late', lateTone(s.row.daysOverdue)]">{{ $tp('{n} days late', { n: s.row.daysOverdue.toLocaleString('en-AU') }) }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column :label="$tp('Total')" width="105" align="right">
                        <template slot-scope="s">{{ money(s.row.total) }}</template>
                    </el-table-column>
                    <el-table-column :label="$tp('Balance due')" width="115" align="right">
                        <template slot-scope="s"><b>{{ money(s.row.balance) }}</b></template>
                    </el-table-column>
                </el-table>
            </div>
        </el-drawer>
    </div>
</template>

<script>
import { getConsignInvoices, setConsignInvoicePaid } from '@/api/consignment'
import { myfoneShops, myfoneShopUnpaid } from '@/api/accountant'
import ConsignReadyToInvoice from '@/views/consignment/components/ConsignReadyToInvoice'
import ConsignInvoicePdf from '@/views/consignment/components/ConsignInvoicePdf'
import inflowMark from '@/views/consignment/components/inflowMark'

const DAY = 86400000

export default {
    name: 'AccountantDashboard',
    components: { ConsignReadyToInvoice, ConsignInvoicePdf },
    mixins: [inflowMark],
    data() {
        return {
            // consignment
            ready: null,
            unpaid: [],
            unpaidLoading: false,
            shopFilter: '',
            // My Fone
            mfShops: [],
            mfLoading: false,
            mfFetchedAt: null,
            mfStale: false,
            drawer: { visible: false, loading: false, shop: null, rows: [] },
            nowTick: Date.now()
        }
    },
    computed: {
        unpaidTotal() {
            return this.unpaid.reduce((t, i) => t + (Number(i.total) || 0), 0)
        },
        // newest first (user ask 2026-10-01)
        sortedUnpaid() {
            return [...this.unpaid].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        },
        shownUnpaid() {
            return this.shopFilter ? this.sortedUnpaid.filter(i => i.shopName === this.shopFilter) : this.sortedUnpaid
        },
        unpaidShops() {
            return [...new Set(this.unpaid.map(i => i.shopName))].sort()
        },
        // the one waiting longest, for the tile ("oldest raised …")
        oldest() {
            return this.sortedUnpaid[this.sortedUnpaid.length - 1] || null
        },
        owingShops() {
            return this.mfShops.filter(s => s.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding)
        },
        mfOwing() {
            return this.owingShops.reduce((t, s) => t + s.outstanding, 0)
        },
        mfOverdue() {
            return this.owingShops.reduce((t, s) => t + (s.overdue || 0), 0)
        },
        mfInvoices() {
            return this.owingShops.reduce((t, s) => t + (s.invoices || 0), 0)
        },
        mfOldest() {
            return this.owingShops.map(s => s.oldestDue).filter(Boolean).sort()[0] || null
        },
        drawerOwing() {
            return this.drawer.rows.reduce((t, r) => t + r.balance, 0)
        },
        drawerOverdue() {
            return this.drawer.rows.filter(r => r.daysOverdue > 0).reduce((t, r) => t + r.balance, 0)
        }
    },
    created() {
        this.loadUnpaid()
        this.loadMyFone()
        this.ticker = setInterval(() => { this.nowTick = Date.now() }, 30000)
    },
    activated() {
        this.loadAll()
    },
    beforeDestroy() {
        clearInterval(this.ticker)
    },
    methods: {
        loadAll() {
            if (this.$refs.ready) this.$refs.ready.load()
            this.loadUnpaid()
            this.loadMyFone()
        },
        // ── consignment ──
        async loadUnpaid() {
            this.unpaidLoading = true
            try {
                const r = await getConsignInvoices({ paymentStatus: 'unpaid' })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.unpaid = r.invoices || []
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load invoices')))
            } finally {
                this.unpaidLoading = false
            }
        },
        openPdf(row) {
            this.$refs.pdf.open(row)
        },
        async markPaid(row) {
            try {
                await this.$confirm(
                    this.$tp('Mark {number} ({shop}, {amount}) as paid?', { number: row.number, shop: row.shopName, amount: this.money(row.total) }),
                    this.$tp('Mark paid'), { confirmButtonText: this.$tp('Mark paid'), cancelButtonText: this.$tp('Cancel'), type: 'info' })
            } catch (e) { return }
            try {
                const r = await setConsignInvoicePaid(row._id, true)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('{number} marked paid', { number: row.number }))
                this.loadUnpaid()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to update the invoice')))
            }
        },
        // ── My Fone ──
        async loadMyFone() {
            this.mfLoading = true
            try {
                const r = await myfoneShops(false)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.mfShops = r.shops || []
                this.mfFetchedAt = r.fetchedAt
                this.mfStale = !!r.stale
                this.nowTick = Date.now()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Could not load the My Fone shops')))
            } finally {
                this.mfLoading = false
            }
        },
        async openShop(row) {
            this.drawer = { visible: true, loading: true, shop: { name: row.name, email: row.email, phone: row.phone }, rows: [] }
            try {
                const r = await myfoneShopUnpaid(row.contactId)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.drawer = { visible: true, loading: false, shop: r.shop, rows: r.rows || [] }
            } catch (e) {
                this.drawer.loading = false
                this.$message.error(this.msg(e, this.$tp('Could not load the unpaid invoices')))
            }
        },
        zohoInvoice(id) {
            return `https://inventory.zoho.com/app/746138234#/invoices/${id}`
        },
        // ── formatting ──
        days(d) {
            const day = x => { const t = new Date(x); return Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) }
            return Math.max(0, Math.round((day(new Date()) - day(d)) / DAY))
        },
        daysSince(ymd) {
            const [y, m, d] = String(ymd).split('-').map(Number)
            return this.days(new Date(y, m - 1, d))
        },
        ageText(d) {
            const n = this.days(d)
            return n === 0 ? this.$tp('today') : n === 1 ? this.$tp('1 day ago') : this.$tp('{n} days ago', { n: n.toLocaleString('en-AU') })
        },
        ageTone(d) {
            const n = this.days(d)
            return n > 60 ? 'bad' : n > 30 ? 'warn' : ''
        },
        lateTone(n) {
            return n > 90 ? 'bad' : n > 30 ? 'warn' : 'soft'
        },
        agoText(t) {
            const mins = Math.max(0, Math.round((this.nowTick - new Date(t).getTime()) / 60000))
            if (mins < 1) return this.$tp('just now')
            if (mins < 60) return this.$tp('{n} min ago', { n: mins })
            const h = Math.round(mins / 60)
            return this.$tp('{n} hour(s) ago', { n: h })
        },
        money(v) {
            return '$' + Number(v || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        },
        fmtDate(d) {
            if (!d) return '—'
            const x = new Date(d)
            return isNaN(x.getTime()) ? '—' : x.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
        },
        fmtYmd(ymd) {
            const [y, m, d] = String(ymd || '').split('-').map(Number)
            return y ? new Date(y, m - 1, d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
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
.ad-page { padding: 16px 20px; min-height: calc(100vh - 84px); background: #f6f8fb; }
.ad-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.ad-title { font-size: 20px; font-weight: 700; color: #1f2937; line-height: 1.2; }
.ad-sub { font-size: 13px; color: #909399; margin-top: 3px; }

/* the sections side by side; one column when there isn't room for two */
.ad-sections { display: grid; grid-template-columns: repeat(auto-fit, minmax(540px, 1fr)); gap: 20px; align-items: start; }
/* a section: a titled band holding its own tiles and boxes */
.ad-section { min-width: 0; margin-bottom: 8px; }
.ad-section-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; padding-bottom: 8px; margin-bottom: 12px; border-bottom: 2px solid #e4e7ed; }
.ad-section-head i { font-size: 17px; color: #409eff; align-self: center; }
.ad-section-title { font-size: 17px; font-weight: 700; color: #303133; }
.ad-section-sub { font-size: 12px; color: #909399; }

.ad-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
.ad-tile { background: #fff; border: 1px solid #ebeef5; border-radius: 8px; padding: 12px 16px; border-top: 3px solid #dcdfe6; }
.ad-tile-ready { border-top-color: #e6a23c; }
.ad-tile-unpaid { border-top-color: #f56c6c; }
.ad-tile-mf { border-top-color: #409eff; }
.ad-tile-label { font-size: 12px; color: #909399; }
.ad-tile-value { font-size: 24px; font-weight: 600; color: #303133; margin: 2px 0; font-variant-numeric: tabular-nums; }
.ad-dim { font-size: 12px; color: #909399; }
.ad-warn { font-size: 12px; color: #e6a23c; }
.ad-red { color: #f56c6c; }
.ad-box { background: #fff; border: 1px solid #ebeef5; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; }
.ad-box-ready { border-left: 4px solid #e6a23c; }
.ad-box-unpaid { border-left: 4px solid #f56c6c; }
.ad-box-mf { border-left: 4px solid #409eff; }
.ad-box-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.ad-box-title { font-size: 14px; font-weight: 600; color: #303133; }
.ad-owed { font-size: 13px; color: #f56c6c; font-weight: 600; }
.ad-spacer { flex: 1; }
.ad-table >>> .el-table__row { cursor: pointer; }
.ad-table >>> .el-table__row:hover .ad-shop { color: #409eff; }
.ad-mono { font-family: Consolas, Menlo, monospace; font-size: 12px; }
.ad-num { font-weight: 600; color: #303133; }
.ad-tags { display: flex; gap: 4px; flex-wrap: nowrap; white-space: nowrap; margin-top: 2px; }
.ad-src { display: inline-block; font-size: 10px; color: #909399; background: #f4f4f5; border-radius: 3px; padding: 0 5px; line-height: 16px; }
.ad-age { font-size: 12px; color: #909399; }
.ad-age.warn { color: #e6a23c; }
.ad-age.bad { color: #f56c6c; font-weight: 600; }
.ad-ok { color: #529b2e; }
.ad-acts { white-space: nowrap; }
/* entered in inFlow — click the label to take the mark off */
.ad-inflow { display: inline-block; font-size: 10px; color: #fff; background: #13a89e; border-radius: 3px; padding: 0 5px; line-height: 16px; cursor: pointer; }
.ad-inflow:hover { background: #0f8a82; }
.ad-inflow-btn { color: #13a89e; }
.ad-acts .el-button + .el-button { margin-left: 6px; }
.ad-shop { font-weight: 500; color: #303133; }
.ad-contact { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ad-go { color: #c0c4cc; }
.ad-late { display: inline-block; margin-left: 4px; font-size: 11px; padding: 0 6px; border-radius: 3px; line-height: 18px; white-space: nowrap; }
.ad-late.bad { color: #fff; background: #f56c6c; }
.ad-late.warn { color: #f56c6c; background: #fef0f0; }
.ad-late.soft { color: #e6a23c; background: #fdf6ec; }
.ad-link { color: #409eff; }
.ad-link:hover { text-decoration: underline; }

/* the shop drawer */
.ad-drawer { padding: 16px 20px 24px; min-height: 100%; box-sizing: border-box; background: #f6f8fb; }
.ad-drawer-head { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 14px; }
.ad-drawer-title { font-size: 18px; font-weight: 600; color: #303133; }
.ad-drawer-sum { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
.ad-drawer-fig { background: #fff; border: 1px solid #ebeef5; border-radius: 8px; padding: 10px 14px; }
.ad-drawer-value { font-size: 22px; font-weight: 600; color: #303133; margin: 2px 0; font-variant-numeric: tabular-nums; }
.ad-drawer-table { background: #fff; }
@media (max-width: 700px) { .ad-sections { grid-template-columns: 1fr; } .ad-tiles, .ad-drawer-sum { grid-template-columns: 1fr; } }
</style>
