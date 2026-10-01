<template>
    <!--
        One My Fone shop's statement, shown in a drawer on the My Fone page
        (myfone.vue): every invoice, payment, credit note and refund on the
        shop's Zoho account with a running balance, for the period picked (the
        whole history comes down once, so changing the dates costs no Zoho
        calls), plus the invoices still unpaid. Download as a PDF statement or
        Excel. Laid out like the My Fone page: Total Balance (today), then
        Activity for the dates, then the transactions.
    -->
    <div class="ms">
        <div class="ms-head">
            <div class="ms-who">
                <div class="ms-title">{{ contact.name || name || 'Statement' }}</div>
                <div class="ms-sub">
                    <span v-if="contact.email">{{ contact.email }}</span>
                    <span v-if="contact.phone"> · {{ contact.phone }}</span>
                    <span v-if="contact.paymentTerms"> · {{ contact.paymentTerms }}</span>
                    <span v-if="contact.address && contact.address.length"> · {{ contact.address.join(', ') }}</span>
                </div>
                <div class="ms-sub">
                    <a v-if="contactId" :href="zohoLink('contacts', contactId)" target="_blank" rel="noopener" class="ms-link">Open in Zoho</a>
                    <span v-if="fetchedAt"> · updated {{ updatedText }}</span>
                    <span v-if="stale" class="ms-warn"> · Zoho could not be read just now — showing the last copy</span>
                </div>
            </div>
            <div class="ms-spacer" />
            <el-button size="small" icon="el-icon-document" :disabled="!loaded" @click="downloadPdf">PDF statement</el-button>
            <el-button size="small" icon="el-icon-download" :disabled="!loaded" @click="exportXlsx">Excel</el-button>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load(true)">Refresh</el-button>
            <el-button size="small" icon="el-icon-close" title="Close" class="ms-close" @click="$emit('close')" />
        </div>

        <el-alert v-if="loaded && check && !check.matches" type="warning" :closable="false" show-icon class="ms-alert"
            :title="`This statement comes to ${money(check.ledger)} but Zoho shows ${money(check.zoho)} for this shop — a transaction Zoho doesn't list with the others. Check the account in Zoho.`" />

        <!-- what the shop owes today — the dates below don't change it -->
        <section class="ms-box ms-box-now" v-loading="loading && !loaded">
            <div class="ms-box-head">
                <span class="ms-box-title">Total Balance</span>
                <span class="ms-dim">unpaid invoices today, by how late they are</span>
            </div>
            <div class="ms-owing">
                <div class="ms-owing-main">
                    <div :class="['ms-big', { zero: loaded && !owingNow }]">{{ money(owingNow) }}</div>
                    <div class="ms-dim">{{ unpaid.length }} unpaid invoice{{ unpaid.length === 1 ? '' : 's' }}</div>
                    <div v-if="overdueNow" class="ms-dim">
                        <b class="ms-red">{{ overdueNow >= owingNow - 0.005 ? 'All overdue' : money(overdueNow) + ' overdue' }}</b>
                    </div>
                </div>
                <div class="ms-owing-aging">
                    <div class="ms-agebar">
                        <div v-for="a in agingSegments" :key="a.key" :class="['ms-agebar-seg', 'age-' + a.key]"
                            :style="{ flexGrow: a.amount }" :title="`${a.label}: ${money(a.amount)}`" />
                    </div>
                    <div class="ms-agelegend">
                        <div v-for="a in agingParts" :key="a.key" :class="['ms-agekey', { empty: !a.amount }]">
                            <div class="ms-agekey-label"><i :class="['ms-dot', 'age-' + a.key]" />{{ a.label }}</div>
                            <div class="ms-agekey-value">{{ money(a.amount) }}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div v-if="contact.unusedCredits" class="ms-note">
                <i class="el-icon-info" />
                The shop also holds <b class="ms-green">{{ money(contact.unusedCredits) }}</b> unused credit (payments or credit notes not yet applied to an invoice).
                Net of that credit it owes <b>{{ money(owingNow - contact.unusedCredits) }}</b>.
            </div>
        </section>

        <!-- what happened between two dates -->
        <section class="ms-box ms-box-period">
            <div class="ms-box-head">
                <span class="ms-box-title">Activity</span>
                <el-radio-group v-model="period" size="mini" @change="onPreset">
                    <el-radio-button v-for="p in PERIODS" :key="p.key" :label="p.key">{{ p.label }}</el-radio-button>
                </el-radio-group>
                <el-date-picker v-model="range" type="daterange" size="mini" unlink-panels range-separator="to"
                    start-placeholder="From" end-placeholder="To" value-format="yyyy-MM-dd" format="dd MMM yyyy"
                    :clearable="false" class="ms-range" @change="onRange" />
            </div>
            <div class="ms-flow">
                <div class="ms-step">
                    <div class="ms-step-label">Opening balance</div>
                    <div class="ms-step-value">{{ money(sums.opening) }}</div>
                    <div class="ms-dim">owed at the start of {{ fmtDate(bounds.from) }}</div>
                </div>
                <div class="ms-op">+</div>
                <div class="ms-step">
                    <div class="ms-step-label">Invoiced</div>
                    <div class="ms-step-value">{{ money(sums.invoiced) }}</div>
                    <div class="ms-dim">{{ sums.invoiceCount }} invoice{{ sums.invoiceCount === 1 ? '' : 's' }}</div>
                </div>
                <div class="ms-op">−</div>
                <div class="ms-step">
                    <div class="ms-step-label">Payments &amp; credits</div>
                    <div class="ms-step-value ms-green">{{ money(sums.received) }}</div>
                    <div class="ms-dim">{{ sums.paymentCount }} payment{{ sums.paymentCount === 1 ? '' : 's' }}<span v-if="sums.creditCount"> · {{ sums.creditCount }} credit note{{ sums.creditCount === 1 ? '' : 's' }}</span></div>
                </div>
                <div class="ms-op">=</div>
                <div class="ms-step ms-step-end">
                    <div class="ms-step-label">Closing balance</div>
                    <div class="ms-step-value">{{ money(sums.closing) }}</div>
                    <div class="ms-dim">owed at the end of {{ fmtDate(bounds.to) }}</div>
                </div>
            </div>
            <div v-if="closingNote" class="ms-note"><i class="el-icon-info" /> {{ closingNote }}</div>
        </section>

        <section class="ms-box ms-card">
            <div class="ms-card-head">
                <el-radio-group v-model="view" size="small">
                    <el-radio-button label="activity">Invoices &amp; credits ({{ periodEntries.length }})</el-radio-button>
                    <el-radio-button label="unpaid">Unpaid now ({{ unpaid.length }})</el-radio-button>
                </el-radio-group>
                <span class="ms-dim">{{ view === 'activity' ? `everything from ${fmtDate(bounds.from)} to ${fmtDate(bounds.to)}, paid or not — newest first` : 'every invoice with money still owing, whatever its date — oldest due first' }}</span>
            </div>
            <template v-if="view === 'activity'">
                <div class="ms-types">
                    <span v-for="t in typeTabs" :key="t.key" :class="['ms-type', { on: typeFilter === t.key, empty: !t.count }]" @click="typeFilter = t.key">
                        {{ t.label }} <span class="ms-type-n">{{ t.count }}</span>
                    </span>
                </div>
                <el-table v-loading="loading" :data="ledgerPage" size="small" border :row-class-name="ledgerRowClass"
                    :empty-text="typeFilter === 'all' ? 'Nothing in this period' : 'None in this period'">
                    <el-table-column label="Date" width="108">
                        <template slot-scope="s"><span class="ms-mono">{{ fmtDate(s.row.date) }}</span></template>
                    </el-table-column>
                    <el-table-column label="Type" width="122">
                        <template slot-scope="s">
                            <b v-if="s.row.kind === 'opening' || s.row.kind === 'closing'">{{ s.row.kind === 'opening' ? 'Opening balance' : 'Closing balance' }}</b>
                            <span v-else :class="['ms-kind', 'k-' + s.row.kind]">{{ KIND[s.row.kind] }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="Number" width="112">
                        <template slot-scope="s">
                            <a v-if="linkOf(s.row)" :href="linkOf(s.row)" target="_blank" rel="noopener" class="ms-link ms-mono" title="Open in Zoho">{{ s.row.number }}</a>
                            <span v-else class="ms-mono">{{ s.row.number }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="Details" min-width="140" show-overflow-tooltip>
                        <template slot-scope="s">{{ detailsOf(s.row, true) }}</template>
                    </el-table-column>
                    <el-table-column label="Due date" width="108">
                        <template slot-scope="s"><span class="ms-mono ms-dimtext">{{ s.row.kind === 'invoice' ? fmtDate(s.row.dueDate) : '' }}</span></template>
                    </el-table-column>
                    <el-table-column label="Status" width="146">
                        <template slot-scope="s">
                            <span v-if="statusOf(s.row)" :class="['ms-status', statusOf(s.row).tone]">{{ statusOf(s.row).text }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="Amount" width="110" align="right">
                        <template slot-scope="s"><span class="ms-mono">{{ s.row.debit || s.row.kind === 'invoice' ? money(s.row.debit) : '' }}</span></template>
                    </el-table-column>
                    <el-table-column label="Payments & credits" width="140" align="right">
                        <template slot-scope="s"><span class="ms-mono ms-green">{{ s.row.credit ? money(s.row.credit) : '' }}</span></template>
                    </el-table-column>
                    <!-- a running balance only reads right with every transaction listed -->
                    <el-table-column v-if="typeFilter === 'all'" key="balance" label="Balance" width="120" align="right">
                        <template slot-scope="s"><span class="ms-mono ms-bal">{{ money(s.row.running) }}</span></template>
                    </el-table-column>
                </el-table>
                <div v-if="displayRows.length > pageSize" class="ms-pager">
                    <el-pagination background layout="total, prev, pager, next" :total="displayRows.length" :page-size="pageSize"
                        :current-page="page" @current-change="p => (page = p)" />
                </div>
            </template>

            <el-table v-else v-loading="loading" :data="unpaid" size="small" border empty-text="Nothing owing">
                <el-table-column label="Invoice Number" width="140">
                    <template slot-scope="s">
                        <a :href="zohoLink('invoices', s.row.id)" target="_blank" rel="noopener" class="ms-link ms-mono" title="Open in Zoho">{{ s.row.number }}</a>
                    </template>
                </el-table-column>
                <el-table-column label="Order Number" width="130">
                    <template slot-scope="s"><span class="ms-mono">{{ s.row.reference || '—' }}</span></template>
                </el-table-column>
                <el-table-column label="Invoice Date" width="130">
                    <template slot-scope="s"><span class="ms-mono">{{ fmtDate(s.row.date) }}</span></template>
                </el-table-column>
                <el-table-column label="Due Date" min-width="200">
                    <template slot-scope="s">
                        <span class="ms-mono">{{ fmtDate(s.row.dueDate) }}</span>
                        <span v-if="lateDays(s.row) > 0" :class="['ms-late', lateDays(s.row) > 90 ? 'bad' : lateDays(s.row) > 30 ? 'warn' : 'soft']">{{ lateDays(s.row) }} day{{ lateDays(s.row) === 1 ? '' : 's' }} overdue</span>
                    </template>
                </el-table-column>
                <el-table-column label="Total" width="130" align="right">
                    <template slot-scope="s"><span class="ms-mono">{{ money(s.row.debit) }}</span></template>
                </el-table-column>
                <el-table-column label="Amount Due" width="140" align="right">
                    <template slot-scope="s"><b class="ms-mono">{{ money(s.row.balance) }}</b></template>
                </el-table-column>
            </el-table>
        </section>
    </div>
</template>

<script>
import * as XLSX from 'xlsx-js-style'
import { myfoneStatement } from '@/api/accountant'
import { buildMyfoneStatementPdf } from '@/utils/myfoneStatementPdf'
import { PERIODS, PERIOD_KEYS, periodBounds } from '@/utils/periods'

const DAY = 86400000
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
function ymdToDate(s) {
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
    return new Date(y, m - 1, d)
}
function todayDate() {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
const r2 = (n) => Math.round(n * 100) / 100
const YMD = /^\d{4}-\d{2}-\d{2}$/
const KIND = {
    invoice: 'Invoice',
    payment: 'Payment',
    credit: 'Credit note',
    cnrefund: 'Credit refund',
    refund: 'Payment refund',
    writeoff: 'Write-off'
}
// the filter over the period's list (refunds and write-offs show under All)
const TYPES = [
    { key: 'all', label: 'All' },
    { key: 'invoice', label: 'Invoices' },
    { key: 'payment', label: 'Payments' },
    { key: 'credit', label: 'Credit notes' }
]
const AGING = [
    { key: 'current', label: 'Not yet due' },
    { key: 'd30', label: '1–30 days' },
    { key: 'd60', label: '31–60 days' },
    { key: 'd90', label: '61–90 days' },
    { key: 'older', label: 'Over 90 days' }
]

// Statements already read this visit, by shop — opening a shop again is instant.
const loadedStatements = new Map()

export default {
    name: 'MyFoneStatement',
    props: {
        contactId: { type: String, required: true },
        // the shop's name from the list, shown until the statement arrives
        name: { type: String, default: '' },
        // opened on the My Fone page's dates: a PERIODS key or 'custom' + range
        initialPeriod: { type: String, default: 'last3' },
        initialRange: { type: Array, default: () => [] }
    },
    data() {
        return {
            PERIODS,
            KIND,
            loading: false,
            loaded: false,
            loadedId: null,
            contact: {},
            entries: [],
            check: null,
            fetchedAt: null,
            stale: false,
            period: 'last3',
            range: [],
            view: 'activity',
            typeFilter: 'all',
            page: 1,
            pageSize: 100,
            nowTick: Date.now()
        }
    },
    computed: {
        bounds() {
            return periodBounds(this.period, this.range, (this.entries[0] && this.entries[0].date) || ymd(todayDate()))
        },
        periodEntries() {
            const { from, to } = this.bounds
            return this.entries.filter(e => e.date >= from && e.date <= to)
        },
        sums() {
            const { from } = this.bounds
            const opening = r2(this.entries.filter(e => e.date < from).reduce((t, e) => t + e.debit - e.credit, 0))
            let invoiced = 0; let refunds = 0; let credits = 0
            let invoiceCount = 0; let paymentCount = 0; let creditCount = 0
            for (const e of this.periodEntries) {
                if (e.kind === 'invoice') { invoiced += e.debit; invoiceCount++ } else refunds += e.debit
                credits += e.credit
                if (e.kind === 'payment') paymentCount++
                if (e.kind === 'credit') creditCount++
            }
            const received = r2(credits - refunds) // refunds give money back
            return { opening, invoiced: r2(invoiced), received, closing: r2(opening + invoiced - received), invoiceCount, paymentCount, creditCount }
        },
        ledgerRows() {
            let run = this.sums.opening
            const rows = [{ kind: 'opening', id: 'opening', date: this.bounds.from, debit: 0, credit: 0, running: run }]
            for (const e of this.periodEntries) {
                run = r2(run + e.debit - e.credit)
                rows.push({ ...e, running: run })
            }
            rows.push({ kind: 'closing', id: 'closing', date: this.bounds.to, debit: 0, credit: 0, running: run })
            return rows
        },
        // On screen the newest comes first: the closing balance on top, the
        // opening balance last. (ledgerRows stays oldest-first for the PDF
        // and Excel statements.)
        displayRows() {
            const rows = [...this.ledgerRows].reverse()
            return this.typeFilter === 'all' ? rows : rows.filter(r => r.kind === this.typeFilter)
        },
        typeTabs() {
            return TYPES.map(t => ({ ...t, count: t.key === 'all' ? this.periodEntries.length : this.periodEntries.filter(e => e.kind === t.key).length }))
        },
        ledgerPage() {
            const start = (this.page - 1) * this.pageSize
            return this.displayRows.slice(start, start + this.pageSize)
        },
        unpaid() {
            return this.entries
                .filter(e => e.kind === 'invoice' && e.balance > 0)
                .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')) || String(a.date).localeCompare(String(b.date)))
        },
        owingNow() {
            return r2(this.unpaid.reduce((t, e) => t + e.balance, 0))
        },
        overdueNow() {
            return r2(this.unpaid.filter(e => this.lateDays(e) > 0).reduce((t, e) => t + e.balance, 0))
        },
        aging() {
            const a = { current: 0, d30: 0, d60: 0, d90: 0, older: 0 }
            for (const e of this.unpaid) {
                const d = this.lateDays(e)
                a[d <= 0 ? 'current' : d <= 30 ? 'd30' : d <= 60 ? 'd60' : d <= 90 ? 'd90' : 'older'] += e.balance
            }
            Object.keys(a).forEach(k => { a[k] = r2(a[k]) })
            return a
        },
        agingParts() {
            return AGING.map(a => ({ ...a, amount: this.aging[a.key] }))
        },
        agingSegments() {
            return this.agingParts.filter(a => a.amount > 0)
        },
        // when the period runs to today, say why the closing balance isn't
        // the Total Balance: it's after the unused credit
        closingNote() {
            const credit = Number(this.contact.unusedCredits || 0)
            if (!this.loaded || !credit || this.bounds.to !== ymd(todayDate())) return ''
            if (Math.abs(this.sums.closing - (this.owingNow - credit)) >= 0.01) return ''
            return `The closing balance is the ${this.money(this.owingNow)} total balance less the ${this.money(credit)} unused credit.`
        },
        updatedText() {
            const mins = Math.max(0, Math.round((this.nowTick - new Date(this.fetchedAt).getTime()) / 60000))
            return mins < 1 ? 'just now' : mins === 1 ? '1 min ago' : `${mins} min ago`
        }
    },
    watch: {
        bounds() {
            this.page = 1
        },
        typeFilter() {
            this.page = 1
        }
    },
    created() {
        if (!this.applyInitial()) this.onPreset(this.period)
        this.load(false)
        this.ticker = setInterval(() => { this.nowTick = Date.now() }, 30000)
    },
    beforeDestroy() {
        clearInterval(this.ticker)
    },
    methods: {
        async load(refresh) {
            const id = this.contactId
            if (!id) return
            const cached = !refresh && loadedStatements.get(id)
            if (cached) return this.apply(id, cached)
            this.loading = true
            if (id !== this.loadedId) this.loaded = false
            try {
                const r = await myfoneStatement(id, refresh)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                loadedStatements.set(id, r)
                if (id === this.contactId) this.apply(id, r)
            } catch (e) {
                const m = (e && e.response && e.response.data && e.response.data.message) || (e && e.message)
                this.$message.error(m || 'Could not load the statement')
            } finally {
                this.loading = false
            }
        },
        apply(id, r) {
            this.loadedId = id
            this.contact = r.contact || {}
            this.entries = r.entries || []
            this.check = r.check || null
            this.fetchedAt = r.fetchedAt
            this.stale = !!r.stale
            this.loaded = true
            this.nowTick = Date.now()
            if (this.period === 'all') this.onPreset('all')
            this.page = 1
        },
        // The dates the My Fone page is showing (a preset, or a custom range).
        applyInitial() {
            const [from, to] = this.initialRange || []
            if (this.initialPeriod === 'custom' && YMD.test(from) && YMD.test(to) && from <= to) {
                this.period = 'custom'
                this.range = [from, to]
                return true
            }
            if (PERIOD_KEYS.includes(this.initialPeriod)) {
                this.period = this.initialPeriod
                this.onPreset(this.initialPeriod)
                return true
            }
            return false
        },
        onPreset(key) {
            this.$nextTick(() => {
                if (this.period === key) this.range = [this.bounds.from, this.bounds.to]
            })
        },
        onRange(v) {
            if (v && v.length === 2) this.period = 'custom'
        },
        lateDays(e) {
            return e.dueDate ? Math.round((todayDate() - ymdToDate(e.dueDate)) / DAY) : 0
        },
        ledgerRowClass({ row }) {
            return row.kind === 'opening' || row.kind === 'closing' ? 'ms-edge-row' : ''
        },
        // onScreen: the unused part of a payment is in the Status column there
        detailsOf(e, onScreen) {
            if (e.kind === 'invoice') return e.reference || ''
            // the paid invoices say more than a card processor's charge id
            if (e.kind === 'payment') return [e.reference, e.detail ? `for ${e.detail}` : e.ref].filter(Boolean).join(' · ') + (e.unused && !onScreen ? ` · ${this.money(e.unused)} unused` : '')
            return e.reference || ''
        },
        // where each invoice / credit note / payment stands today
        statusOf(e) {
            if (e.kind === 'invoice') {
                if (!(e.balance > 0)) return { text: 'Paid', tone: 'ok' }
                if (e.balance < e.debit) return { text: `Part paid · ${this.money(e.balance)} due`, tone: 'part' }
                const d = this.lateDays(e)
                return d > 0 ? { text: `Unpaid · ${d.toLocaleString('en-AU')} day${d === 1 ? '' : 's'} late`, tone: 'bad' } : { text: 'Unpaid · not due yet', tone: 'due' }
            }
            if (e.kind === 'credit') return e.balance > 0 ? { text: `${this.money(e.balance)} not used yet`, tone: 'credit' } : { text: 'Fully applied', tone: 'muted' }
            if (e.kind === 'payment' && e.unused > 0) return { text: `${this.money(e.unused)} not used yet`, tone: 'credit' }
            return null
        },
        linkOf(e) {
            if (e.kind === 'invoice') return this.zohoLink('invoices', e.id)
            if (e.kind === 'payment') return this.zohoLink('paymentsreceived', e.id)
            if (e.kind === 'credit') return this.zohoLink('creditnotes', e.id)
            return null
        },
        zohoLink(module, id) {
            return `https://inventory.zoho.com/app/746138234#/${module}/${id}`
        },
        fmtDate(s) {
            if (!s) return ''
            return ymdToDate(s).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
        },
        money(v) {
            const n = r2(Number(v || 0))
            const s = '$' + Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            return n < 0 ? '-' + s : s
        },
        fileBase() {
            const name = String(this.contact.name || 'Shop').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
            return `Statement ${name} ${this.bounds.from} to ${this.bounds.to}`
        },

        downloadPdf() {
            const doc = buildMyfoneStatementPdf({
                shop: { name: this.contact.name, address: this.contact.address || [], email: this.contact.email, phone: this.contact.phone },
                from: this.bounds.from,
                to: this.bounds.to,
                opening: this.sums.opening,
                invoiced: this.sums.invoiced,
                received: this.sums.received,
                closing: this.sums.closing,
                rows: this.ledgerRows.filter(r => r.kind !== 'opening' && r.kind !== 'closing').map(r => ({
                    date: r.date,
                    type: KIND[r.kind],
                    number: r.number,
                    details: this.detailsOf(r).replace(/ · /g, ', ') + (r.kind === 'invoice' && r.dueDate ? `${r.reference ? ', ' : ''}due ${this.fmtDate(r.dueDate)}` : ''),
                    debit: r.debit,
                    credit: r.credit,
                    showZero: r.kind === 'invoice',
                    balance: r.running
                })),
                // the aging is as of today, so only when the period runs to today
                aging: this.bounds.to === ymd(todayDate()) ? this.aging : null
            })
            doc.save(`${this.fileBase()}.pdf`)
        },

        exportXlsx() {
            const MONEY = '$#,##0.00'
            const font = (o = {}) => ({ name: 'Arial', sz: 10, ...o })
            const line = { style: 'thin', color: { rgb: 'BFBFBF' } }
            const border = { top: line, bottom: line, left: line, right: line }
            const head = { font: font({ bold: true, color: { rgb: 'FFFFFF' } }), fill: { fgColor: { rgb: '305496' } }, alignment: { horizontal: 'center' }, border }
            const cell = (align) => ({ font: font(), border, ...(align ? { alignment: { horizontal: align } } : {}) })
            const bold = (align) => ({ font: font({ bold: true }), border, ...(align ? { alignment: { horizontal: align } } : {}) })
            const moneyCell = (v, f, isBold) => ({ t: 'n', v: r2(v), ...(f ? { f } : {}), z: MONEY, s: { ...(isBold ? bold('right') : cell('right')), numFmt: MONEY } })
            const A = (c, r) => XLSX.utils.encode_cell({ c, r })
            const sub = { font: font({ sz: 9, italic: true, color: { rgb: '666666' } }) }

            // ── Statement: opening row, transactions, closing row; the balance column is a running formula
            const ws = {}
            ws.A1 = { t: 's', v: `Statement — ${this.contact.name}`, s: { font: font({ sz: 13, bold: true }) } }
            ws.A2 = { t: 's', v: `${this.fmtDate(this.bounds.from)} to ${this.fmtDate(this.bounds.to)} · from Zoho Inventory, ${new Date().toLocaleString('en-AU')}`, s: sub }
            const headers = ['Date', 'Transaction', 'Number', 'Details', 'Due Date', 'Amount', 'Payments', 'Balance']
            const HR = 3
            headers.forEach((h, c) => { ws[A(c, HR)] = { t: 's', v: h, s: head } })
            let r = HR + 1
            ws[A(0, r)] = { t: 's', v: this.bounds.from, s: bold('center') }
            ws[A(1, r)] = { t: 's', v: 'Opening balance', s: bold() }
            ;[2, 3, 4, 5, 6].forEach(c => { ws[A(c, r)] = { t: 's', v: '', s: cell() } })
            ws[A(7, r)] = moneyCell(this.sums.opening, null, true)
            const firstTx = r + 2 // Excel row of the first transaction
            for (const e of this.periodEntries) {
                r++
                const x = r + 1 // this row, Excel numbering
                ws[A(0, r)] = { t: 's', v: e.date, s: cell('center') }
                ws[A(1, r)] = { t: 's', v: KIND[e.kind], s: cell() }
                ws[A(2, r)] = { t: 's', v: e.number || '', s: cell() }
                ws[A(3, r)] = { t: 's', v: this.detailsOf(e), s: cell() }
                ws[A(4, r)] = { t: 's', v: e.kind === 'invoice' ? (e.dueDate || '') : '', s: cell('center') }
                ws[A(5, r)] = e.debit ? moneyCell(e.debit) : { t: 's', v: '', s: cell() }
                ws[A(6, r)] = e.credit ? moneyCell(e.credit) : { t: 's', v: '', s: cell() }
                ws[A(7, r)] = moneyCell(this.ledgerRows[r - HR - 1].running, `H${x - 1}+N(F${x})-N(G${x})`)
            }
            const lastTx = r + 1
            r++
            ws[A(0, r)] = { t: 's', v: this.bounds.to, s: bold('center') }
            ws[A(1, r)] = { t: 's', v: 'Closing balance', s: bold() }
            ;[2, 3, 4].forEach(c => { ws[A(c, r)] = { t: 's', v: '', s: cell() } })
            const hasTx = this.periodEntries.length > 0
            ws[A(5, r)] = moneyCell(this.periodEntries.reduce((t, e) => t + e.debit, 0), hasTx ? `SUM(F${firstTx}:F${lastTx})` : null, true)
            ws[A(6, r)] = moneyCell(this.periodEntries.reduce((t, e) => t + e.credit, 0), hasTx ? `SUM(G${firstTx}:G${lastTx})` : null, true)
            ws[A(7, r)] = moneyCell(this.sums.closing, `H${HR + 2}+F${r + 1}-G${r + 1}`, true)
            ws['!ref'] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: 7, r } })
            ws['!cols'] = [12, 15, 13, 50, 12, 13, 13, 14].map(w => ({ wch: w }))

            // ── Unpaid invoices (as of today)
            const wu = {}
            wu.A1 = { t: 's', v: `Unpaid invoices — ${this.contact.name}`, s: { font: font({ sz: 13, bold: true }) } }
            wu.A2 = { t: 's', v: `As of ${this.fmtDate(ymd(todayDate()))}`, s: sub }
            const uh = ['Invoice Number', 'Order Number', 'Invoice Date', 'Due Date', 'Days Overdue', 'Total', 'Amount Due']
            uh.forEach((h, c) => { wu[A(c, HR)] = { t: 's', v: h, s: head } })
            this.unpaid.forEach((e, i) => {
                const rr = HR + 1 + i
                wu[A(0, rr)] = { t: 's', v: e.number, s: cell() }
                wu[A(1, rr)] = { t: 's', v: e.reference || '', s: cell() }
                wu[A(2, rr)] = { t: 's', v: e.date || '', s: cell('center') }
                wu[A(3, rr)] = { t: 's', v: e.dueDate || '', s: cell('center') }
                wu[A(4, rr)] = { t: 'n', v: Math.max(0, this.lateDays(e)), s: cell('center') }
                wu[A(5, rr)] = moneyCell(e.debit)
                wu[A(6, rr)] = moneyCell(e.balance)
            })
            const ur = HR + 1 + this.unpaid.length
            wu[A(0, ur)] = { t: 's', v: `Total: ${this.unpaid.length} invoices`, s: bold() }
            wu[A(6, ur)] = moneyCell(this.owingNow, this.unpaid.length ? `SUM(G${HR + 2}:G${ur})` : null, true)
            wu['!ref'] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: 6, r: ur } })
            wu['!cols'] = [15, 14, 12, 12, 12, 13, 13].map(w => ({ wch: w }))

            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, 'Statement')
            XLSX.utils.book_append_sheet(wb, wu, 'Unpaid invoices')
            XLSX.writeFile(wb, `${this.fileBase()}.xlsx`)
        }
    }
}
</script>

<style scoped>
.ms { padding: 16px 20px 24px; background: #f5f7fa; min-height: 100%; box-sizing: border-box; }
.ms-head { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.ms-who { min-width: 0; }
.ms-title { font-size: 18px; font-weight: 600; color: #303133; }
.ms-sub { font-size: 12px; color: #909399; margin-top: 2px; }
.ms-warn { color: #e6a23c; }
.ms-spacer { flex: 1; }
.ms-link { color: #409eff; }
.ms-link:hover { text-decoration: underline; }
.ms-alert { margin-bottom: 12px; }
.ms-dim { font-size: 12px; color: #909399; }
.ms-green { color: #529b2e; }
.ms-red { color: #f56c6c; }

/* same card language as the My Fone page: amber = today, blue = the period */
.ms-box { background: #fff; border: 1px solid #ebeef5; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; }
.ms-box-now { border-left: 4px solid #e6a23c; }
.ms-box-period { border-left: 4px solid #409eff; }
.ms-box-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.ms-box-title { font-size: 14px; font-weight: 600; color: #303133; margin-right: 4px; }
.ms-note { margin-top: 10px; padding: 6px 10px; border-radius: 4px; background: #f7f8fa; font-size: 12px; color: #606266; line-height: 1.5; }
.ms-note i { color: #909399; margin-right: 2px; }

.ms-owing { display: flex; gap: 28px; align-items: center; flex-wrap: wrap; }
.ms-owing-main { min-width: 190px; }
.ms-big { font-size: 26px; font-weight: 600; color: #303133; line-height: 1.2; font-variant-numeric: tabular-nums; }
.ms-big.zero { color: #67c23a; }
.ms-owing-aging { flex: 1; min-width: 300px; }
.ms-agebar { display: flex; height: 10px; border-radius: 5px; overflow: hidden; background: #f2f3f5; gap: 2px; margin-bottom: 10px; }
.ms-agebar-seg { min-width: 4px; }
.ms-agelegend { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.ms-agekey.empty { opacity: .45; }
.ms-agekey-label { font-size: 11px; color: #909399; white-space: nowrap; }
.ms-agekey-value { font-size: 14px; font-weight: 600; color: #303133; margin-top: 1px; font-variant-numeric: tabular-nums; }
.ms-dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; }
.age-current { background: #67c23a; }
.age-d30 { background: #e6a23c; }
.age-d60 { background: #f0883e; }
.age-d90 { background: #f56c6c; }
.age-older { background: #c03639; }

.ms-range { width: 250px !important; }
.ms-flow { display: flex; align-items: stretch; gap: 6px; }
.ms-step { flex: 1; min-width: 0; padding: 8px 12px; border-radius: 6px; background: #fafbfc; }
.ms-step-end { background: #ecf5ff; }
.ms-step-label { font-size: 12px; color: #909399; }
.ms-step-value { font-size: 20px; font-weight: 600; color: #303133; margin: 2px 0; font-variant-numeric: tabular-nums; }
.ms-step-value.ms-green { color: #529b2e; }
.ms-op { display: flex; align-items: center; font-size: 20px; color: #c0c4cc; padding: 0 2px; }

.ms-card { padding: 12px; margin-bottom: 0; }
.ms-card-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.ms-card >>> .ms-edge-row td { background: #f5f7fa !important; }
.ms-kind { display: inline-block; font-size: 12px; padding: 0 7px; border-radius: 3px; line-height: 20px; }
.k-invoice { color: #409eff; background: #ecf5ff; }
.k-payment { color: #529b2e; background: #f0f9eb; }
.k-credit { color: #b88230; background: #fdf6ec; }
.k-cnrefund, .k-refund, .k-writeoff { color: #73767a; background: #f4f4f5; }
.ms-types { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.ms-type { font-size: 12px; color: #606266; padding: 2px 10px; border: 1px solid #dcdfe6; border-radius: 12px; cursor: pointer; user-select: none; }
.ms-type:hover { color: #409eff; border-color: #c6e2ff; }
.ms-type.on { color: #fff; background: #409eff; border-color: #409eff; }
.ms-type.empty:not(.on) { color: #c0c4cc; }
.ms-type-n { margin-left: 2px; opacity: .75; }
.ms-status { display: inline-block; font-size: 11px; padding: 0 7px; border-radius: 3px; line-height: 20px; white-space: nowrap; }
.ms-status.ok { color: #529b2e; background: #f0f9eb; }
.ms-status.part { color: #b88230; background: #fdf6ec; }
.ms-status.bad { color: #f56c6c; background: #fef0f0; }
.ms-status.due { color: #409eff; background: #ecf5ff; }
.ms-status.credit { color: #529b2e; background: #fff; border: 1px dashed #b3e19d; line-height: 18px; }
.ms-status.muted { color: #909399; background: #f4f4f5; }
.ms-late { display: inline-block; margin-left: 6px; font-size: 11px; padding: 0 6px; border-radius: 3px; line-height: 18px; }
.ms-late.bad { color: #fff; background: #f56c6c; }
.ms-late.warn { color: #f56c6c; background: #fef0f0; }
.ms-late.soft { color: #e6a23c; background: #fdf6ec; }
.ms-mono { font-variant-numeric: tabular-nums; }
.ms-dimtext { color: #909399; }
.ms-bal { font-weight: 600; color: #303133; }
.ms-pager { padding-top: 10px; display: flex; justify-content: flex-end; }

@media (max-width: 1000px) {
    .ms-flow { display: grid; grid-template-columns: 1fr 1fr; }
    .ms-op { display: none; }
    .ms-agelegend { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
    .ms { padding: 12px; }
    .ms-head { position: relative; padding-right: 44px; }
    .ms-close { position: absolute; top: 0; right: 0; }
    .ms-owing { flex-direction: column; align-items: stretch; gap: 12px; }
    .ms-owing-aging { min-width: 0; }
    .ms-agelegend { grid-template-columns: 1fr 1fr; }
    .ms-range { width: 100% !important; }
}
</style>
