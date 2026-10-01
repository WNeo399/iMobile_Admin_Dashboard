<template>
    <!--
        iMobile Accountant → My Fone: the My Fone shops (a curated list of
        Zoho customers), in three parts that are kept visibly apart:
          1. Total Balance: today's unpaid invoices and their aging, from the
             server's cached list of unpaid Zoho invoices. The dates don't touch it.
          2. Activity: opening balance + invoiced − payments & credits =
             closing balance for the picked dates, from each shop's stored
             account history, so picking dates costs no Zoho calls.
          3. The shops, with the columns grouped under the same two headings.
        Click a shop for its statement, in a drawer over the list
        (components/MyFoneStatement.vue), opened on the same dates.
    -->
    <div class="app-container mf-page">
        <div class="mf-head">
            <div>
                <div class="mf-title">My Fone</div>
                <div class="mf-sub">
                    <template v-if="loading && !shops.length">Reading Zoho Inventory…</template>
                    <template v-else>{{ shops.length }} shop{{ shops.length === 1 ? '' : 's' }} · from Zoho Inventory</template><span v-if="fetchedAt"> · updated {{ ago(fetchedAt) }}</span>
                    <span v-if="stale" class="mf-warn"> · Zoho could not be read just now — showing the last figures</span>
                    <span v-if="unavailable" class="mf-warn"> · Zoho could not be read — amounts owing are missing</span>
                </div>
            </div>
            <div class="mf-spacer" />
            <el-button v-if="canEdit" size="small" icon="el-icon-setting" @click="openManage">Manage shops</el-button>
            <el-button size="small" icon="el-icon-download" :disabled="!filtered.length" @click="exportXlsx">Export</el-button>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load(true)">Refresh</el-button>
        </div>

        <!-- 1 · what the shops owe today — the dates below don't change it -->
        <section class="mf-box mf-box-now" v-loading="loading && !shops.length">
            <div class="mf-box-head">
                <span class="mf-box-title">Total Balance</span>
                <span class="mf-dim">unpaid invoices today, by how late they are</span>
            </div>
            <div class="mf-owing">
                <div class="mf-owing-main">
                    <div class="mf-big">{{ money(totals.outstanding) }}</div>
                    <div class="mf-dim">
                        {{ owingShops.length }} of {{ shops.length }} shops · {{ totals.invoices }} unpaid invoice{{ totals.invoices === 1 ? '' : 's' }}
                    </div>
                    <div v-if="totals.overdue" class="mf-dim">
                        <b class="mf-red">{{ totals.overdue >= totals.outstanding - 0.005 ? 'All overdue' : money(totals.overdue) + ' overdue' }}</b>
                    </div>
                </div>
                <div class="mf-owing-aging">
                    <div class="mf-agebar">
                        <div v-for="a in agingSegments" :key="a.key" :class="['mf-agebar-seg', 'age-' + a.key]"
                            :style="{ flexGrow: a.amount }" :title="`${a.label}: ${money(a.amount)}`" />
                    </div>
                    <div class="mf-agelegend">
                        <div v-for="a in agingParts" :key="a.key" :class="['mf-agekey', { empty: !a.amount }]">
                            <div class="mf-agekey-label"><i :class="['mf-dot', 'age-' + a.key]" />{{ a.label }}</div>
                            <div class="mf-agekey-value">{{ money(a.amount) }}</div>
                            <div class="mf-dim">{{ pctText(a.pct) }}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div v-if="creditTotals.amount" class="mf-note">
                <i class="el-icon-info" />
                {{ creditTotals.shops }} shop{{ creditTotals.shops === 1 ? '' : 's' }} also hold{{ creditTotals.shops === 1 ? 's' : '' }}
                <b class="mf-green">{{ money(creditTotals.amount) }}</b> unused credit (payments or credit notes not yet applied to an invoice).
                Net of that credit the shops owe <b>{{ money(totals.outstanding - creditTotals.amount) }}</b>.
            </div>
        </section>

        <!-- 2 · what happened between two dates -->
        <section class="mf-box mf-box-period">
            <div class="mf-box-head">
                <span class="mf-box-title">Activity</span>
                <el-radio-group v-model="period" size="mini" @change="onPreset">
                    <el-radio-button v-for="p in PERIODS" :key="p.key" :label="p.key">{{ p.label }}</el-radio-button>
                </el-radio-group>
                <el-date-picker v-model="range" type="daterange" size="mini" unlink-panels range-separator="to"
                    start-placeholder="From" end-placeholder="To" value-format="yyyy-MM-dd" format="dd MMM yyyy"
                    :clearable="false" class="mf-range" @change="onRange" />
                <div class="mf-spacer" />
                <div class="mf-history">
                    <template v-if="sync && sync.running">
                        <i class="el-icon-loading" /> Reading each shop's account from Zoho… {{ sync.done }} of {{ sync.total }}
                        <el-progress :percentage="sync.total ? Math.round((sync.done / sync.total) * 100) : 0" :show-text="false" :stroke-width="4" class="mf-progress" />
                    </template>
                    <template v-else-if="history && history.oldest">
                        Synced {{ ago(history.oldest) }}
                        <span v-if="history.missing" class="mf-warn"> · {{ history.missing }} not read yet</span>
                        <span v-if="sync && sync.failed && sync.failed.length" class="mf-warn" :title="sync.failed.join(', ')"> · {{ sync.failed.length }} could not be read</span>
                        · <el-button type="text" size="mini" class="mf-sync" :loading="syncStarting" @click="syncNow">Sync now</el-button>
                    </template>
                </div>
            </div>
            <div class="mf-flow" v-loading="activityLoading && !activity">
                <div class="mf-step">
                    <div class="mf-step-label">Opening balance</div>
                    <div class="mf-step-value">{{ activity ? money(activity.totals.opening) : '—' }}</div>
                    <div class="mf-dim">{{ activity ? 'owed at the start of ' + fmtDate(activity.from) : '' }}</div>
                </div>
                <div class="mf-op">+</div>
                <div class="mf-step">
                    <div class="mf-step-label">Invoiced</div>
                    <div class="mf-step-value">{{ activity ? money(activity.totals.invoiced) : '—' }}</div>
                    <div class="mf-dim" v-if="activity">{{ activity.totals.invoices }} invoice{{ activity.totals.invoices === 1 ? '' : 's' }} to {{ activity.totals.shopsInvoiced }} shop{{ activity.totals.shopsInvoiced === 1 ? '' : 's' }}</div>
                </div>
                <div class="mf-op">−</div>
                <div class="mf-step">
                    <div class="mf-step-label">Payments &amp; credits</div>
                    <div class="mf-step-value mf-green">{{ activity ? money(activity.totals.received) : '—' }}</div>
                    <div class="mf-dim" v-if="activity">{{ activity.totals.payments }} payment{{ activity.totals.payments === 1 ? '' : 's' }}<span v-if="activity.totals.credits"> · {{ activity.totals.credits }} credit note{{ activity.totals.credits === 1 ? '' : 's' }}</span></div>
                </div>
                <div class="mf-op">=</div>
                <div class="mf-step mf-step-end">
                    <div class="mf-step-label">Closing balance</div>
                    <div class="mf-step-value">{{ activity ? money(activity.totals.closing) : '—' }}</div>
                    <div class="mf-dim">{{ activity ? 'owed at the end of ' + fmtDate(activity.to) : '' }}</div>
                </div>
            </div>
            <div v-if="closingNote" class="mf-note"><i class="el-icon-info" /> {{ closingNote }}</div>
        </section>

        <!-- 3 · the shops -->
        <section class="mf-box mf-list">
            <div class="mf-list-head">
                <el-radio-group v-model="bucket" size="small">
                    <el-radio-button v-for="b in buckets" :key="b.key" :label="b.key">{{ b.label }} <span class="mf-count">{{ b.count }}</span></el-radio-button>
                </el-radio-group>
                <div class="mf-spacer" />
                <el-input v-model="search" size="small" clearable prefix-icon="el-icon-search" class="mf-search" placeholder="Find a shop, email, phone…" />
            </div>
            <el-table v-loading="loading" :data="filtered" size="small" border class="mf-table" row-class-name="mf-row"
                :default-sort="{ prop: 'outstanding', order: 'descending' }" empty-text="No shops" @sort-change="onSort" @row-click="openShop">
                <el-table-column label="Shop" prop="name" min-width="260" sortable="custom">
                    <template slot-scope="s">
                        <div class="mf-name">{{ s.row.name }}</div>
                        <div v-if="s.row.email || s.row.phone" class="mf-dim mf-contact">{{ [s.row.email, s.row.phone].filter(Boolean).join(' · ') }}</div>
                    </template>
                </el-table-column>
                <el-table-column label="Total Balance" align="center" label-class-name="mf-grp mf-grp-now">
                    <el-table-column label="Amount" prop="outstanding" width="160" align="right" sortable="custom" label-class-name="mf-sub-now">
                        <template slot-scope="s">
                            <div :class="['mf-amount', { zero: !s.row.outstanding }]">{{ s.row.outstanding ? money(s.row.outstanding) : 'Nothing owing' }}</div>
                            <div v-if="s.row.invoices" class="mf-dim">{{ s.row.invoices }} unpaid · <span :class="{ 'mf-red': s.row.overdue }">{{ overdueText(s.row) }}</span></div>
                            <div v-if="s.row.credit" class="mf-dim mf-green" title="Unused credit: a payment not yet used against an invoice, or an open credit note">{{ money(s.row.credit) }} unused credit</div>
                        </template>
                    </el-table-column>
                    <el-table-column label="Oldest overdue" prop="oldestDue" width="150" sortable="custom" label-class-name="mf-sub-now">
                        <template slot-scope="s">
                            <template v-if="s.row.oldestDue">
                                <span :class="['mf-late', lateTone(s.row.oldestDue)]">{{ lateText(s.row.oldestDue) }}</span>
                                <div class="mf-dim">due {{ fmtDate(s.row.oldestDue) }}</div>
                            </template>
                            <span v-else class="mf-dim">—</span>
                        </template>
                    </el-table-column>
                </el-table-column>
                <el-table-column :label="periodLabel" align="center" label-class-name="mf-grp mf-grp-period">
                    <el-table-column label="Invoiced" prop="invoiced" width="150" align="right" sortable="custom" label-class-name="mf-sub-period">
                        <template slot-scope="s">
                            <template v-if="s.row.p">
                                <div :class="['mf-amount', { zero: !s.row.p.invoiced }]">{{ s.row.p.invoiced ? money(s.row.p.invoiced) : '—' }}</div>
                                <div class="mf-dim">{{ s.row.p.invoices ? `${s.row.p.invoices} invoice${s.row.p.invoices === 1 ? '' : 's'}` : lastText('last invoice', s.row.p.lastInvoice) }}</div>
                            </template>
                            <span v-else class="mf-dim">{{ sync && sync.running ? 'reading…' : '—' }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="Payments & credits" prop="received" width="160" align="right" sortable="custom" label-class-name="mf-sub-period">
                        <template slot-scope="s">
                            <template v-if="s.row.p">
                                <div :class="['mf-amount', 'mf-green', { zero: !s.row.p.received }]">{{ s.row.p.received ? money(s.row.p.received) : '—' }}</div>
                                <div class="mf-dim">{{ s.row.p.payments ? `${s.row.p.payments} payment${s.row.p.payments === 1 ? '' : 's'}` : lastText('last paid', s.row.p.lastPayment) }}</div>
                            </template>
                            <span v-else class="mf-dim">{{ sync && sync.running ? 'reading…' : '—' }}</span>
                        </template>
                    </el-table-column>
                </el-table-column>
                <el-table-column width="100" align="center">
                    <template>
                        <span class="mf-open">Statement <i class="el-icon-arrow-right" /></span>
                    </template>
                </el-table-column>
            </el-table>
            <div class="mf-foot">
                <span class="mf-dim">
                    {{ filtered.length }} of {{ shops.length }} shops · <b>{{ money(filteredOwing) }}</b> total balance<template v-if="activity"> · <b>{{ money(filteredInvoiced) }}</b> invoiced and <b>{{ money(filteredReceived) }}</b> paid or credited, {{ periodLabel }}</template>
                </span>
            </div>
        </section>

        <!-- a shop's statement, over the list -->
        <el-drawer :visible.sync="statementOpen" size="min(1200px, 100vw)" :with-header="false" append-to-body @closed="statementShop = null">
            <my-fone-statement v-if="statementShop" :key="statementKey" :contact-id="statementShop.contactId" :name="statementShop.name"
                :initial-period="period" :initial-range="range" @close="statementOpen = false" />
        </el-drawer>

        <!-- Manage shops: add from Zoho customers, remove from the list -->
        <el-dialog title="Manage My Fone shops" :visible.sync="manageOpen" width="760px" top="6vh" append-to-body>
            <div class="mf-add">
                <el-input v-model="contactQuery" size="small" clearable placeholder="Search Zoho customers by name, email or phone"
                    prefix-icon="el-icon-search" @keyup.enter.native="searchContacts" />
                <el-button size="small" type="primary" :loading="contactLoading" :disabled="contactQuery.trim().length < 2" @click="searchContacts">Search</el-button>
            </div>
            <el-table v-if="contactSearched" v-loading="contactLoading" :data="contactRows" size="mini" border max-height="260" class="mf-results"
                empty-text="No Zoho customers match">
                <el-table-column label="Zoho customer" min-width="260">
                    <template slot-scope="s">
                        <div>{{ s.row.name }} <el-tag v-if="s.row.status === 'inactive'" size="mini" type="info">inactive</el-tag></div>
                        <div class="mf-dim">{{ [s.row.company, s.row.email, s.row.phone].filter(Boolean).join(' · ') }}</div>
                    </template>
                </el-table-column>
                <el-table-column label="Owing" width="110" align="right">
                    <template slot-scope="s">{{ s.row.outstanding ? money(s.row.outstanding) : '—' }}</template>
                </el-table-column>
                <el-table-column width="96" align="center">
                    <template slot-scope="s">
                        <span v-if="s.row.inList" class="mf-dim">In the list</span>
                        <el-button v-else size="mini" type="primary" plain :loading="adding === s.row.contactId" @click="addShop(s.row)">Add</el-button>
                    </template>
                </el-table-column>
            </el-table>

            <div class="mf-manage-head">In the list ({{ shops.length }})</div>
            <div class="mf-manage-list">
                <div v-for="s in shopsByName" :key="s.contactId" class="mf-manage-row">
                    <span class="mf-manage-name">{{ s.name }}</span>
                    <span v-if="s.outstanding" class="mf-dim">{{ money(s.outstanding) }} owing</span>
                    <el-button size="mini" type="text" class="mf-remove" :loading="removing === s.contactId" @click="removeShop(s)">Remove</el-button>
                </div>
            </div>
            <div class="mf-dim mf-manage-note">Removing a shop only takes it off this page — nothing changes in Zoho.</div>
            <span slot="footer"><el-button size="small" @click="manageOpen = false">Done</el-button></span>
        </el-dialog>
    </div>
</template>

<script>
import * as XLSX from 'xlsx-js-style'
import { hasPermission } from '@/utils/permission'
import { PERIODS, periodBounds, todayYmd } from '@/utils/periods'
import {
    myfoneShops, myfoneActivity, myfoneSyncStatus, myfoneSyncNow,
    myfoneSearchContacts, myfoneAddShop, myfoneRemoveShop
} from '@/api/accountant'
import MyFoneStatement from './components/MyFoneStatement'

const DAY = 86400000
function ymdToDate(ymd) {
    const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number)
    return new Date(y, m - 1, d)
}
function today() {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function daysLate(ymd) {
    return ymd ? Math.round((today() - ymdToDate(ymd)) / DAY) : 0
}
const AGING = [
    { key: 'current', label: 'Not yet due' },
    { key: 'd30', label: '1–30 days' },
    { key: 'd60', label: '31–60 days' },
    { key: 'd90', label: '61–90 days' },
    { key: 'older', label: 'Over 90 days' }
]

export default {
    name: 'AccountantMyFone',
    components: { MyFoneStatement },
    data() {
        return {
            PERIODS,
            loading: false,
            shops: [],
            fetchedAt: null,
            stale: false,
            unavailable: false,
            period: 'last3',
            range: [],
            activity: null, // { from, to, byShop, totals }
            activityLoading: false,
            history: null,
            sync: null,
            syncStarting: false,
            search: '',
            bucket: 'all', // all | owing | over90 | clear | invoiced
            sort: { prop: 'outstanding', order: 'descending' },
            nowTick: Date.now(),
            statementOpen: false,
            statementShop: null,
            statementKey: 0,
            manageOpen: false,
            contactQuery: '',
            contactRows: [],
            contactLoading: false,
            contactSearched: false,
            adding: null,
            removing: null
        }
    },
    computed: {
        canEdit() {
            return hasPermission(this.$store.getters.permissions, 'acct:myfone:edit')
        },
        bounds() {
            return periodBounds(this.period, this.range, '')
        },
        // the shops with this period's figures alongside
        rows() {
            const by = (this.activity && this.activity.byShop) || {}
            return this.shops.map(s => {
                const p = by[s.contactId] || null
                return { ...s, p, invoiced: p ? p.invoiced : -1, received: p ? p.received : -1, credit: p ? p.unusedCredits : 0 }
            })
        },
        creditTotals() {
            const held = this.rows.filter(s => s.credit > 0)
            return { shops: held.length, amount: held.reduce((t, s) => t + s.credit, 0) }
        },
        owingShops() {
            return this.shops.filter(s => s.outstanding > 0)
        },
        totals() {
            const t = { outstanding: 0, overdue: 0, invoices: 0, aging: {} }
            AGING.forEach(a => { t.aging[a.key] = 0 })
            for (const s of this.shops) {
                t.outstanding += s.outstanding
                t.overdue += s.overdue
                t.invoices += s.invoices
                AGING.forEach(a => { t.aging[a.key] += (s.aging && s.aging[a.key]) || 0 })
            }
            return t
        },
        agingParts() {
            const total = this.totals.outstanding || 1
            return AGING.map(a => ({ ...a, amount: this.totals.aging[a.key] || 0, pct: ((this.totals.aging[a.key] || 0) / total) * 100 }))
        },
        agingSegments() {
            return this.agingParts.filter(a => a.amount > 0)
        },
        // heading over the period columns, e.g. "1 Aug – 1 Oct 2026"
        periodLabel() {
            const a = this.activity
            if (!a) return 'In the period'
            const [fy, fm] = a.from.split('-')
            const [ty, tm] = a.to.split('-')
            const day = (ymd, withYear) => ymdToDate(ymd).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
            if (a.from === a.to) return day(a.to, true)
            if (fy === ty && fm === tm) return `${Number(a.from.slice(8))} – ${day(a.to, true)}`
            return `${day(a.from, fy !== ty)} – ${day(a.to, true)}`
        },
        // The closing balance (account history, after unused credit) and
        // the Total Balance (unpaid invoices) look like they should agree — say why
        // they differ when the period runs to today.
        closingNote() {
            const a = this.activity
            if (!a || a.to !== todayYmd() || !this.shops.length) return ''
            const net = this.totals.outstanding - this.creditTotals.amount
            const gap = Math.round((a.totals.closing - net) * 100) / 100
            if (Math.abs(gap) < 0.01) {
                return this.creditTotals.amount
                    ? `The closing balance is the ${this.money(this.totals.outstanding)} total balance less the ${this.money(this.creditTotals.amount)} unused credit.`
                    : ''
            }
            return `The closing balance is ${this.money(Math.abs(gap))} ${gap > 0 ? 'more' : 'less'} than the total balance net of unused credit (${this.money(net)}) — the account histories were synced ${this.history && this.history.oldest ? this.ago(this.history.oldest) : 'earlier'}; Sync now brings them up to date.`
        },
        buckets() {
            const n = (fn) => this.rows.filter(fn).length
            return [
                { key: 'all', label: 'All shops', count: this.rows.length },
                { key: 'owing', label: 'Owing', count: n(s => s.outstanding > 0) },
                { key: 'over90', label: 'Over 90 days late', count: n(s => daysLate(s.oldestDue) > 90) },
                { key: 'clear', label: 'Nothing owing', count: n(s => !s.outstanding) },
                { key: 'invoiced', label: 'Invoiced in period', count: n(s => s.p && s.p.invoices > 0) }
            ]
        },
        filtered() {
            const q = this.search.trim().toLowerCase()
            let list = this.rows
            if (this.bucket === 'owing') list = list.filter(s => s.outstanding > 0)
            else if (this.bucket === 'over90') list = list.filter(s => daysLate(s.oldestDue) > 90)
            else if (this.bucket === 'clear') list = list.filter(s => !s.outstanding)
            else if (this.bucket === 'invoiced') list = list.filter(s => s.p && s.p.invoices > 0)
            if (q) list = list.filter(s => [s.name, s.email, s.phone].some(v => String(v || '').toLowerCase().includes(q)))
            const { prop, order } = this.sort
            if (prop && order) {
                const dir = order === 'ascending' ? 1 : -1
                list = [...list].sort((a, b) => {
                    const x = a[prop]; const y = b[prop]
                    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir || a.sort - b.sort
                    // empty values (no overdue date) always last
                    if (!x && y) return 1
                    if (x && !y) return -1
                    return String(x || '').localeCompare(String(y || ''), undefined, { numeric: true, sensitivity: 'base' }) * dir
                })
            }
            return list
        },
        filteredOwing() {
            return this.filtered.reduce((t, s) => t + s.outstanding, 0)
        },
        filteredInvoiced() {
            return this.filtered.reduce((t, s) => t + (s.p ? s.p.invoiced : 0), 0)
        },
        filteredReceived() {
            return this.filtered.reduce((t, s) => t + (s.p ? s.p.received : 0), 0)
        },
        shopsByName() {
            return [...this.shops].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
        }
    },
    watch: {
        bounds(b, old) {
            if (!old || b.from !== old.from || b.to !== old.to) this.loadActivity()
        }
    },
    created() {
        this.onPreset(this.period)
        this.load(false)
        this.loadActivity()
        this.ticker = setInterval(() => { this.nowTick = Date.now() }, 30000)
    },
    beforeDestroy() {
        clearInterval(this.ticker)
        clearTimeout(this.pollTimer)
    },
    methods: {
        async load(refresh) {
            this.loading = true
            try {
                const r = await myfoneShops(refresh)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.shops = r.shops || []
                this.fetchedAt = r.fetchedAt
                this.stale = !!r.stale
                this.unavailable = !!r.unavailable
                this.nowTick = Date.now()
            } catch (e) {
                this.$message.error(this.errText(e, 'Could not load the My Fone shops'))
            } finally {
                this.loading = false
            }
        },
        async loadActivity() {
            const { from, to } = this.bounds
            this.activityLoading = true
            try {
                const r = await myfoneActivity(from, to)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                // a slower answer for dates since changed is dropped
                if (from !== this.bounds.from || to !== this.bounds.to) return
                this.activity = { from: r.from, to: r.to, byShop: r.byShop || {}, totals: r.totals }
                if (this.period === 'all') this.range = [r.from, r.to]
                this.history = r.history
                this.setSync(r.sync)
            } catch (e) {
                this.$message.error(this.errText(e, 'Could not work out the period'))
            } finally {
                this.activityLoading = false
            }
        },
        // While a history sync runs, check on it; when it ends, redo the period.
        setSync(sync) {
            const wasRunning = this.sync && this.sync.running
            this.sync = sync || null
            clearTimeout(this.pollTimer)
            if (this.sync && this.sync.running) {
                this.pollTimer = setTimeout(() => this.pollSync(), 4000)
            } else if (wasRunning) {
                this.loadActivity()
            }
        },
        async pollSync() {
            try {
                const r = await myfoneSyncStatus()
                this.setSync(r && r.sync)
            } catch (e) {
                this.pollTimer = setTimeout(() => this.pollSync(), 10000)
            }
        },
        async syncNow() {
            this.syncStarting = true
            try {
                const r = await myfoneSyncNow()
                this.setSync(r && r.sync)
            } catch (e) {
                this.$message.warning(this.errText(e, 'Could not start the sync'))
            } finally {
                this.syncStarting = false
            }
        },
        onPreset(key) {
            this.$nextTick(() => {
                if (this.period !== key) return
                // "All time" shows from the first transaction once it's known
                const b = this.bounds
                this.range = [b.from || (this.activity && this.activity.from) || '2020-01-01', b.to]
            })
        },
        onRange(v) {
            if (v && v.length === 2) this.period = 'custom'
        },
        errText(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback
        },
        onSort({ prop, order }) {
            this.sort = { prop, order }
        },
        openShop(row) {
            this.statementShop = { contactId: row.contactId, name: row.name }
            this.statementKey++
            this.statementOpen = true
        },
        ago(t) {
            const mins = Math.max(0, Math.round((this.nowTick - new Date(t).getTime()) / 60000))
            if (mins < 1) return 'just now'
            if (mins < 60) return `${mins} min ago`
            const h = Math.round(mins / 60)
            return `${h} hour${h === 1 ? '' : 's'} ago`
        },
        lastText(what, ymd) {
            return ymd ? `${what} ${this.fmtDate(ymd)}` : ''
        },
        lateText(ymd) {
            const d = daysLate(ymd)
            return d > 0 ? `${d.toLocaleString('en-AU')} day${d === 1 ? '' : 's'} late` : ''
        },
        overdueText(row) {
            if (!row.overdue) return 'not due yet'
            if (row.overdue >= row.outstanding - 0.005) return 'all overdue'
            return `${this.money(row.overdue)} overdue`
        },
        pctText(pct) {
            if (!pct) return '0%'
            return pct < 1 ? '<1%' : `${Math.round(pct)}%`
        },
        lateTone(ymd) {
            const d = daysLate(ymd)
            return d > 90 ? 'bad' : d > 30 ? 'warn' : 'soft'
        },
        fmtDate(ymd) {
            if (!ymd) return '—'
            return ymdToDate(ymd).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
        },
        money(v) {
            const n = Math.round(Number(v || 0) * 100) / 100
            const s = '$' + Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            return n < 0 ? '-' + s : s
        },

        // ── manage the list ──
        openManage() {
            this.manageOpen = true
        },
        async searchContacts() {
            const q = this.contactQuery.trim()
            if (q.length < 2) return
            this.contactLoading = true
            try {
                const r = await myfoneSearchContacts(q)
                this.contactRows = (r && r.rows) || []
                this.contactSearched = true
            } catch (e) {
                this.$message.error(this.errText(e, 'Could not search Zoho customers'))
            } finally {
                this.contactLoading = false
            }
        },
        async addShop(row) {
            this.adding = row.contactId
            try {
                await myfoneAddShop(row.contactId)
                row.inList = true
                this.$message.success(`${row.name} added`)
                await this.load(false)
                // its history is read in the background — pick it up shortly
                setTimeout(() => this.loadActivity(), 8000)
            } catch (e) {
                this.$message.error(this.errText(e, 'Could not add the shop'))
            } finally {
                this.adding = null
            }
        },
        async removeShop(shop) {
            try {
                await this.$confirm(`Take ${shop.name} off the My Fone list? Nothing changes in Zoho.`, 'Remove shop', {
                    type: 'warning', confirmButtonText: 'Remove', cancelButtonText: 'Cancel'
                })
            } catch (e) {
                return
            }
            this.removing = shop.contactId
            try {
                await myfoneRemoveShop(shop.contactId)
                this.shops = this.shops.filter(s => s.contactId !== shop.contactId)
                const hit = this.contactRows.find(c => c.contactId === shop.contactId)
                if (hit) hit.inList = false
                this.$message.success(`${shop.name} removed`)
                this.loadActivity()
            } catch (e) {
                this.$message.error(this.errText(e, 'Could not remove the shop'))
            } finally {
                this.removing = null
            }
        },

        exportXlsx() {
            const MONEY = '$#,##0.00'
            const font = (o = {}) => ({ name: 'Arial', sz: 10, ...o })
            const line = { style: 'thin', color: { rgb: 'BFBFBF' } }
            const border = { top: line, bottom: line, left: line, right: line }
            const head = { font: font({ bold: true, color: { rgb: 'FFFFFF' } }), fill: { fgColor: { rgb: '305496' } }, alignment: { horizontal: 'center', wrapText: true }, border }
            const cell = (align) => ({ font: font(), border, ...(align ? { alignment: { horizontal: align } } : {}) })
            const bold = (align) => ({ font: font({ bold: true }), border, ...(align ? { alignment: { horizontal: align } } : {}) })
            const A = (c, r) => XLSX.utils.encode_cell({ c, r })
            const act = this.activity
            const period = act ? `${this.fmtDate(act.from)} to ${this.fmtDate(act.to)}` : ''
            //   value getter per column; money columns are summed in the total row
            const cols = [
                { h: '#', v: s => s.sort, kind: 'int' },
                { h: 'Shop', v: s => s.name },
                { h: 'Email', v: s => s.email },
                { h: 'Phone', v: s => s.phone },
                { h: 'Opening Balance', v: s => (s.p ? s.p.opening : null), kind: 'money' },
                { h: 'Invoiced', v: s => (s.p ? s.p.invoiced : null), kind: 'money' },
                { h: 'Invoices', v: s => (s.p ? s.p.invoices : null), kind: 'count' },
                { h: 'Payments & Credits', v: s => (s.p ? s.p.received : null), kind: 'money' },
                { h: 'Closing Balance', v: s => (s.p ? s.p.closing : null), kind: 'money' },
                { h: 'Total Balance', v: s => s.outstanding, kind: 'money' },
                { h: 'Overdue Now', v: s => s.overdue, kind: 'money' },
                { h: 'Unused Credit', v: s => (s.p ? s.p.unusedCredits : null), kind: 'money' },
                { h: 'Unpaid Invoices', v: s => s.invoices, kind: 'count' },
                { h: 'Oldest Overdue Due Date', v: s => s.oldestDue || '' },
                ...AGING.map(a => ({ h: a.key === 'current' ? 'Not Yet Due (aging)' : a.label.replace('–', '-'), v: s => s.aging[a.key], kind: 'money' }))
            ]
            const ws = {}
            const d = new Date()
            ws.A1 = { t: 's', v: 'My Fone shops', s: { font: font({ sz: 13, bold: true }) } }
            ws.A2 = { t: 's', v: `Period ${period} (opening balance, invoiced, payments & credits, closing balance) · total balance and aging as of ${d.toLocaleString('en-AU')} · from Zoho Inventory`, s: { font: font({ sz: 9, italic: true, color: { rgb: '666666' } }) } }
            const HR = 3
            cols.forEach((c, i) => { ws[A(i, HR)] = { t: 's', v: c.h, s: head } })
            this.filtered.forEach((s, r0) => {
                const r = HR + 1 + r0
                cols.forEach((c, i) => {
                    const v = c.v(s)
                    if (c.kind === 'money') ws[A(i, r)] = v == null ? { t: 's', v: '', s: cell() } : { t: 'n', v: Number(v), z: MONEY, s: { ...cell('right'), numFmt: MONEY } }
                    else if (c.kind) ws[A(i, r)] = v == null ? { t: 's', v: '', s: cell() } : { t: 'n', v: Number(v), s: cell('center') }
                    else ws[A(i, r)] = { t: 's', v: v || '', s: cell() }
                })
            })
            const first = HR + 2
            const last = HR + 1 + this.filtered.length
            const tr = HR + 1 + this.filtered.length
            ws[A(1, tr)] = { t: 's', v: `Total: ${this.filtered.length} shops`, s: bold() }
            cols.forEach((c, i) => {
                if (c.kind !== 'money' && c.kind !== 'count') return
                const col = XLSX.utils.encode_col(i)
                const sum = this.filtered.reduce((t, s) => t + Number(c.v(s) || 0), 0)
                const isMoney = c.kind === 'money'
                ws[A(i, tr)] = { t: 'n', v: Math.round(sum * 100) / 100, f: `SUM(${col}${first}:${col}${last})`, ...(isMoney ? { z: MONEY } : {}), s: { ...bold(isMoney ? 'right' : 'center'), ...(isMoney ? { numFmt: MONEY } : {}) } }
            })
            ws['!ref'] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: cols.length - 1, r: tr } })
            ws['!cols'] = [5, 44, 30, 15, 14, 14, 9, 14, 14, 14, 14, 13, 9, 13, 13, 12, 12, 12, 13].map(w => ({ wch: w }))
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, 'My Fone shops')
            const p = n => String(n).padStart(2, '0')
            const span = act ? ` ${act.from} to ${act.to}` : ''
            XLSX.writeFile(wb, `My Fone shops${span} (${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}).xlsx`)
        }
    }
}
</script>

<style scoped>
.mf-head { display: flex; align-items: flex-end; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.mf-title { font-size: 18px; font-weight: 600; color: #303133; }
.mf-sub { font-size: 12px; color: #909399; margin-top: 2px; }
.mf-warn { color: #e6a23c; }
.mf-red { color: #f56c6c; }
.mf-green { color: #529b2e; }
.mf-spacer { flex: 1; }
.mf-dim { font-size: 11px; color: #909399; }

/* the three parts share one card style; a coloured edge ties each summary
   to its columns in the table (amber = total balance, blue = the period) */
.mf-box { background: #fff; border: 1px solid #ebeef5; border-radius: 8px; padding: 12px 16px; margin-bottom: 14px; }
.mf-box-now { border-left: 4px solid #e6a23c; }
.mf-box-period { border-left: 4px solid #409eff; }
.mf-box-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.mf-box-title { font-size: 14px; font-weight: 600; color: #303133; margin-right: 4px; }
.mf-note { margin-top: 10px; padding: 6px 10px; border-radius: 4px; background: #f7f8fa; font-size: 12px; color: #606266; line-height: 1.5; }
.mf-note i { color: #909399; margin-right: 2px; }

/* 1 · total balance */
.mf-owing { display: flex; gap: 28px; align-items: center; flex-wrap: wrap; }
.mf-owing-main { min-width: 210px; }
.mf-big { font-size: 28px; font-weight: 600; color: #303133; line-height: 1.2; font-variant-numeric: tabular-nums; }
.mf-owing-aging { flex: 1; min-width: 320px; }
.mf-agebar { display: flex; height: 10px; border-radius: 5px; overflow: hidden; background: #f2f3f5; gap: 2px; margin-bottom: 10px; }
.mf-agebar-seg { min-width: 4px; }
.mf-agelegend { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.mf-agekey.empty { opacity: .45; }
.mf-agekey-label { font-size: 11px; color: #909399; white-space: nowrap; }
.mf-agekey-value { font-size: 14px; font-weight: 600; color: #303133; margin-top: 1px; font-variant-numeric: tabular-nums; }
.mf-dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; vertical-align: 0; }
.age-current { background: #67c23a; }
.age-d30 { background: #e6a23c; }
.age-d60 { background: #f0883e; }
.age-d90 { background: #f56c6c; }
.age-older { background: #c03639; }

/* 2 · activity: opening + invoiced − received = closing */
.mf-range { width: 250px !important; }
.mf-history { font-size: 12px; color: #909399; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.mf-sync { padding: 0; font-size: 12px; }
.mf-progress { width: 120px; margin-left: 6px; }
.mf-flow { display: flex; align-items: stretch; gap: 6px; }
.mf-step { flex: 1; min-width: 0; padding: 8px 12px; border-radius: 6px; background: #fafbfc; }
.mf-step-end { background: #ecf5ff; }
.mf-step-label { font-size: 12px; color: #909399; }
.mf-step-value { font-size: 20px; font-weight: 600; color: #303133; margin: 2px 0; font-variant-numeric: tabular-nums; }
.mf-step-value.mf-green { color: #529b2e; }
.mf-op { display: flex; align-items: center; font-size: 20px; color: #c0c4cc; padding: 0 2px; }

/* 3 · the shops */
.mf-list { padding: 12px; }
.mf-list-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.mf-count { display: inline-block; min-width: 18px; margin-left: 4px; padding: 0 5px; border-radius: 9px; background: rgba(0, 0, 0, .06); font-size: 11px; line-height: 16px; }
.mf-search { width: 240px; }
.mf-table >>> .mf-row { cursor: pointer; }
.mf-table >>> .mf-row:hover .mf-name { color: #409eff; }
.mf-table >>> th.mf-grp-now { background: #fdf6ec !important; color: #b88230; }
.mf-table >>> th.mf-grp-period { background: #ecf5ff !important; color: #337ecc; }
.mf-table >>> th.mf-sub-now { background: #fffbf5 !important; }
.mf-table >>> th.mf-sub-period { background: #f7fbff !important; }
.mf-name { color: #303133; font-weight: 500; }
.mf-contact { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mf-amount { font-weight: 600; color: #303133; font-variant-numeric: tabular-nums; }
.mf-amount.mf-green { color: #529b2e; }
.mf-amount.zero { color: #c0c4cc; font-weight: 400; }
.mf-late { display: inline-block; font-size: 11px; padding: 0 6px; border-radius: 3px; line-height: 18px; white-space: nowrap; }
.mf-late.bad { color: #fff; background: #f56c6c; }
.mf-late.warn { color: #f56c6c; background: #fef0f0; }
.mf-late.soft { color: #e6a23c; background: #fdf6ec; }
.mf-open { font-size: 12px; color: #409eff; white-space: nowrap; }
.mf-foot { padding-top: 10px; }
.mf-foot b { color: #606266; font-weight: 600; }

/* manage shops dialog */
.mf-add { display: flex; gap: 8px; margin-bottom: 10px; }
.mf-results { margin-bottom: 14px; }
.mf-manage-head { font-size: 13px; font-weight: 600; color: #303133; margin: 6px 0 6px; }
.mf-manage-list { max-height: 300px; overflow-y: auto; border: 1px solid #ebeef5; border-radius: 4px; }
.mf-manage-row { display: flex; align-items: center; gap: 10px; padding: 4px 10px; border-bottom: 1px solid #f2f3f5; font-size: 13px; }
.mf-manage-row:last-child { border-bottom: 0; }
.mf-manage-name { flex: 1; color: #303133; }
.mf-remove { color: #f56c6c; }
.mf-manage-note { margin-top: 8px; }

@media (max-width: 1100px) {
    .mf-flow { display: grid; grid-template-columns: 1fr 1fr; }
    .mf-op { display: none; }
    .mf-agelegend { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
    .mf-agelegend { grid-template-columns: 1fr 1fr; }
    .mf-owing { flex-direction: column; align-items: stretch; gap: 12px; }
    .mf-owing-aging { min-width: 0; }
    .mf-search, .mf-range { width: 100% !important; }
}
</style>
