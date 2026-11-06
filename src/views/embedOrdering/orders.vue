<template>
    <!--
        Embed Ordering → Orders (user ask 2026-11-06): orders placed by
        distributors' customers through the ordering widget. Demo scope: no
        prices, nothing goes to Zoho / InFlow — iMobile staff (Admin for now)
        move an order New → Processing → Completed (or Cancelled) and keep a
        note. Lines the stock couldn't cover when the order came in are red.
    -->
    <div class="app-container eo-page">
        <div class="eo-head">
            <div>
                <div class="eo-title">Orders</div>
                <div class="eo-sub">Placed by distributors' customers through the ordering widget. No prices yet — check stock and contact the customer, then move the order along.</div>
            </div>
            <div class="eo-spacer" />
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">Refresh</el-button>
        </div>

        <div class="eo-tabs">
            <button v-for="t in TABS" :key="t.key" type="button" class="eo-tab" :class="{ on: tab === t.key }" @click="pickTab(t.key)">
                {{ t.label }}<span class="eo-n">{{ tabCount(t) }}</span>
            </button>
        </div>

        <div class="eo-filters">
            <el-input v-model="q" size="small" clearable placeholder="EO no., customer, SKU, part" prefix-icon="el-icon-search"
                class="eo-q" @keyup.enter.native="search" @clear="search" />
            <el-select v-model="distributorId" size="small" clearable placeholder="All distributors" class="eo-sel" @change="search">
                <el-option v-for="d in distributors" :key="d._id" :label="d.name" :value="d._id" />
            </el-select>
            <el-date-picker v-model="range" type="daterange" size="small" value-format="yyyy-MM-dd" range-separator="–"
                start-placeholder="From" end-placeholder="To" class="eo-range" @change="search" />
            <el-button size="small" type="primary" icon="el-icon-search" @click="search">Search</el-button>
        </div>

        <el-table :data="rows" v-loading="loading" size="small" border class="eo-table" :row-class-name="rowClass"
            empty-text="No orders" @row-click="open">
            <el-table-column label="Order" width="118">
                <template slot-scope="s">
                    <b>{{ s.row.orderNo }}</b>
                    <el-tag v-if="s.row.source && s.row.source.preview" size="mini" type="info" class="eo-pv">Preview</el-tag>
                </template>
            </el-table-column>
            <el-table-column label="Placed" width="150">
                <template slot-scope="s">{{ when(s.row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="Distributor" prop="distributorName" min-width="150" show-overflow-tooltip />
            <el-table-column label="Customer" min-width="190">
                <template slot-scope="s">
                    <div>{{ s.row.customerName }}</div>
                    <div class="eo-dim">{{ s.row.customerEmail }}</div>
                </template>
            </el-table-column>
            <el-table-column label="Lines / units" width="120" align="right">
                <template slot-scope="s">
                    {{ s.row.lineCount }} / {{ s.row.units }}
                    <el-tooltip v-if="s.row.shortLines" :content="`${s.row.shortLines} line${s.row.shortLines === 1 ? '' : 's'} asked for more than the stock when ordered`" placement="top">
                        <i class="el-icon-warning eo-short-ic" />
                    </el-tooltip>
                </template>
            </el-table-column>
            <el-table-column label="Status" width="116">
                <template slot-scope="s"><el-tag size="small" :type="statusType(s.row.status)">{{ label(s.row.status) }}</el-tag></template>
            </el-table-column>
        </el-table>
        <el-pagination class="eo-pager" background layout="total, sizes, prev, pager, next" :total="total" :page-size="pageSize"
            :current-page="page" :page-sizes="[20, 50, 100]" @current-change="p => { page = p; load() }"
            @size-change="s => { pageSize = s; page = 1; load() }" />

        <el-drawer :visible.sync="drawer" :title="order ? order.orderNo : ''" size="640px" append-to-body custom-class="eo-drawer"
            @closed="order = null">
            <div v-if="order" v-loading="detailLoading" class="eo-d">
                <div class="eo-d-top">
                    <el-tag :type="statusType(order.status)">{{ label(order.status) }}</el-tag>
                    <el-tag v-if="order.source && order.source.preview" type="info">Placed from the preview</el-tag>
                    <span class="eo-dim">placed {{ when(order.createdAt) }}</span>
                    <div class="eo-spacer" />
                    <el-button v-for="n in next" :key="n" size="small" :type="n === 'cancelled' ? 'danger' : n === 'new' ? 'default' : 'primary'"
                        :plain="n === 'cancelled'" :loading="saving === n" @click="move(n)">{{ moveLabel(n) }}</el-button>
                </div>

                <div class="eo-grid">
                    <div class="eo-box">
                        <div class="eo-k">Customer</div>
                        <div><b>{{ order.customerName }}</b></div>
                        <div>{{ order.customerEmail }}</div>
                        <div v-if="order.customerPhone">{{ order.customerPhone }}</div>
                        <div class="eo-dim">of {{ order.distributorName }}</div>
                    </div>
                    <div class="eo-box">
                        <div class="eo-k">Deliver to</div>
                        <template v-if="addressLines(order.deliveryAddress).length">
                            <div v-for="(l, i) in addressLines(order.deliveryAddress)" :key="i">{{ l }}</div>
                        </template>
                        <div v-else class="eo-dim">No address given</div>
                    </div>
                </div>
                <div v-if="order.reference || order.note" class="eo-box eo-mt">
                    <div v-if="order.reference"><span class="eo-k">Their reference</span> {{ order.reference }}</div>
                    <div v-if="order.note" class="eo-note"><span class="eo-k">Their note</span> {{ order.note }}</div>
                </div>

                <div class="eo-sec">Parts <span class="eo-dim">{{ order.lines.length }} line{{ order.lines.length === 1 ? '' : 's' }} · {{ order.units }} unit{{ order.units === 1 ? '' : 's' }}</span></div>
                <el-table :data="order.lines" size="small" border :row-class-name="lineClass">
                    <el-table-column width="58">
                        <template slot-scope="s">
                            <img v-if="s.row.imageId && !badImg[s.row.itemId]" :src="img(s.row.imageId)" class="eo-img" alt="" @error="$set(badImg, s.row.itemId, true)">
                            <i v-else class="el-icon-box eo-noimg" />
                        </template>
                    </el-table-column>
                    <el-table-column label="Part" min-width="220">
                        <template slot-scope="s">
                            <div class="eo-pn">{{ s.row.name }}</div>
                            <div class="eo-dim">SKU {{ s.row.sku }}<span v-if="s.row.quality"> · {{ s.row.quality }}</span></div>
                        </template>
                    </el-table-column>
                    <el-table-column label="Qty" prop="qty" width="64" align="right" />
                    <el-table-column label="Stock when ordered" width="140" align="right">
                        <template slot-scope="s">
                            {{ s.row.availableAtOrder }}
                            <div v-if="s.row.shortAtOrder" class="eo-short">short {{ s.row.qty - s.row.availableAtOrder }}</div>
                        </template>
                    </el-table-column>
                </el-table>

                <div class="eo-sec">Staff note <span class="eo-dim">not shown to the customer</span></div>
                <el-input v-model="noteDraft" type="textarea" :rows="3" maxlength="1000" show-word-limit placeholder="e.g. called the customer, 2 left to come" />
                <div class="eo-note-bar">
                    <el-button size="small" :disabled="noteDraft === (order.staffNote || '')" :loading="saving === 'note'" @click="saveNote">Save note</el-button>
                </div>

                <div class="eo-sec">History</div>
                <el-timeline class="eo-tl">
                    <el-timeline-item v-for="(h, i) in [...(order.history || [])].reverse()" :key="i" :timestamp="when(h.at)" size="normal">
                        <b>{{ historyText(h) }}</b> <span class="eo-dim">by {{ h.by }}</span>
                        <div v-if="h.note && h.action === 'status'" class="eo-dim">{{ h.note }}</div>
                    </el-timeline-item>
                </el-timeline>
            </div>
        </el-drawer>
    </div>
</template>

<script>
import { getEmbedOrders, getEmbedOrder, setEmbedOrderStatus, setEmbedOrderStaffNote, getEmbedDistributors } from '@/api/embedOrdering'

const LABELS = { new: 'New', processing: 'Processing', completed: 'Completed', cancelled: 'Cancelled' }
const TABS = [
    { key: 'open', label: 'Open', statuses: ['new', 'processing'] },
    { key: 'new', label: 'New', statuses: ['new'] },
    { key: 'processing', label: 'Processing', statuses: ['processing'] },
    { key: 'completed', label: 'Completed', statuses: ['completed'] },
    { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
    { key: 'all', label: 'All', statuses: [] }
]
const IMG_BASE = 'https://www.imobilestore.com.au/product-images/image/'

export default {
    name: 'EmbedOrders',
    data() {
        return {
            TABS,
            tab: 'open',
            q: '',
            distributorId: '',
            range: null,
            rows: [],
            total: 0,
            counts: {},
            page: 1,
            pageSize: 20,
            loading: false,
            distributors: [],
            drawer: false,
            order: null,
            next: [],
            detailLoading: false,
            saving: '',
            noteDraft: '',
            badImg: {}
        }
    },
    created() {
        this.load()
        getEmbedDistributors({ pageSize: 200 })
            .then(r => { this.distributors = (r && (r.rows || r.data || r.distributors)) || [] })
            .catch(() => { this.distributors = [] })
    },
    methods: {
        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback
        },
        query() {
            const t = TABS.find(x => x.key === this.tab)
            const p = { page: this.page, pageSize: this.pageSize, status: t.statuses.join(',') }
            if (this.q.trim()) p.q = this.q.trim()
            if (this.distributorId) p.distributorId = this.distributorId
            if (this.range && this.range.length === 2) { p.from = this.range[0]; p.to = this.range[1] }
            return p
        },
        async load() {
            this.loading = true
            try {
                const r = await getEmbedOrders(this.query())
                this.rows = r.rows || []
                this.total = r.total || 0
                this.counts = r.counts || {}
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load the orders'))
            } finally {
                this.loading = false
            }
        },
        search() {
            this.page = 1
            this.load()
        },
        pickTab(k) {
            this.tab = k
            this.search()
        },
        tabCount(t) {
            const list = t.statuses.length ? t.statuses : Object.keys(LABELS)
            return list.reduce((s, k) => s + (this.counts[k] || 0), 0)
        },
        label(s) { return LABELS[s] || s },
        statusType(s) {
            return { new: '', processing: 'warning', completed: 'success', cancelled: 'info' }[s] || ''
        },
        moveLabel(n) {
            return { processing: 'Start processing', completed: 'Mark completed', cancelled: 'Cancel order', new: 'Reopen' }[n] || LABELS[n]
        },
        rowClass({ row }) {
            return row.status === 'cancelled' ? 'eo-row-off' : ''
        },
        lineClass({ row }) {
            return row.shortAtOrder ? 'eo-line-short' : ''
        },
        when(t) {
            if (!t) return ''
            const d = new Date(t)
            return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' +
                d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
        },
        img(id) { return IMG_BASE + encodeURIComponent(id) + '/400x400' },
        addressLines(a) {
            if (!a) return []
            const city = [a.city, a.state, a.postcode].filter(Boolean).join(' ')
            return [a.line1, a.line2, city].filter(Boolean)
        },
        historyText(h) {
            if (h.action === 'placed') return 'Order placed' + (h.note ? ` (${h.note})` : '')
            if (h.action === 'status') return `${LABELS[h.from] || h.from} → ${LABELS[h.to] || h.to}`
            if (h.action === 'note') return h.note || 'Staff note'
            return h.action
        },
        async open(row) {
            this.drawer = true
            this.order = { ...row, lines: row.lines || [], history: [] }
            this.next = []
            this.noteDraft = row.staffNote || ''
            this.detailLoading = true
            try {
                const r = await getEmbedOrder(row._id)
                this.setOrder(r)
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load the order'))
            } finally {
                this.detailLoading = false
            }
        },
        setOrder(r) {
            this.order = r.order
            this.next = r.next || []
            this.noteDraft = r.order.staffNote || ''
            const i = this.rows.findIndex(x => x._id === r.order._id)
            if (i >= 0) this.$set(this.rows, i, { ...this.rows[i], status: r.order.status, staffNote: r.order.staffNote })
        },
        async move(to) {
            let note = ''
            if (to === 'cancelled') {
                try {
                    const r = await this.$prompt(`Cancel ${this.order.orderNo}? The customer sees it as Cancelled in My orders.`, 'Cancel order', {
                        confirmButtonText: 'Cancel order', cancelButtonText: 'Keep it', inputPlaceholder: 'Reason (optional)', inputValue: ''
                    })
                    note = (r && r.value) || ''
                } catch (e) { return }
            }
            this.saving = to
            try {
                const r = await setEmbedOrderStatus(this.order._id, { status: to, note })
                this.setOrder(r)
                this.$message.success(`${this.order.orderNo}: ${LABELS[to]}`)
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to change the status'))
            } finally {
                this.saving = ''
            }
        },
        async saveNote() {
            this.saving = 'note'
            try {
                const r = await setEmbedOrderStaffNote(this.order._id, this.noteDraft)
                this.setOrder(r)
                this.$message.success('Note saved')
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to save the note'))
            } finally {
                this.saving = ''
            }
        }
    }
}
</script>

<style scoped>
.eo-head { display: flex; align-items: flex-end; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.eo-title { font-size: 18px; font-weight: 600; color: #303133; }
.eo-sub { font-size: 12px; color: #909399; margin-top: 2px; max-width: 820px; }
.eo-spacer { flex: 1; }
.eo-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.eo-tab { border: 1px solid #dcdfe6; background: #fff; border-radius: 16px; padding: 5px 12px; cursor: pointer; font-size: 13px; color: #606266; }
.eo-tab:hover { border-color: #409eff; color: #409eff; }
.eo-tab.on { background: #409eff; border-color: #409eff; color: #fff; }
.eo-n { margin-left: 6px; font-size: 12px; opacity: .8; }
.eo-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.eo-q { width: 280px; }
.eo-sel { width: 200px; }
.eo-range { width: 260px !important; }
.eo-table { cursor: pointer; }
.eo-pv { margin-left: 4px; }
.eo-dim { font-size: 12px; color: #909399; }
.eo-short-ic { color: #f56c6c; margin-left: 4px; }
.eo-pager { margin-top: 12px; text-align: right; }
::v-deep .el-table .eo-row-off > td { color: #a8abb2; }
::v-deep .el-table .eo-line-short > td { background: #fef0f0; }
.eo-d { padding: 0 20px 20px; }
.eo-d-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.eo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.eo-box { background: #f8f9fb; border: 1px solid #ebeef5; border-radius: 6px; padding: 10px 12px; font-size: 13px; color: #303133; line-height: 1.6; }
.eo-mt { margin-top: 10px; }
.eo-k { font-size: 12px; color: #909399; margin-right: 6px; }
.eo-box > .eo-k:first-child { display: block; }
.eo-note { white-space: pre-wrap; }
.eo-sec { font-size: 14px; font-weight: 600; color: #303133; margin: 18px 0 8px; }
.eo-img { width: 40px; height: 40px; object-fit: contain; display: block; background: #fff; }
.eo-noimg { font-size: 22px; color: #c0c4cc; }
.eo-pn { font-weight: 600; color: #303133; }
.eo-short { color: #f56c6c; font-weight: 600; font-size: 12px; }
.eo-note-bar { margin-top: 6px; text-align: right; }
.eo-tl { padding-left: 2px; }
</style>
