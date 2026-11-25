<template>
    <!-- Chat Orders (2026-11-25): orders placed from the WhatsApp chat bot or
         the customer's Stock Chat web page, kept apart from Sales Orders. By model / storage / grade (+ colour)
         and quantity — staff confirm, make the sales order (picking the
         IMEIs there), then mark the chat order completed. -->
    <div class="cho app-container">
        <div class="cho-filters">
            <el-radio-group v-model="query.status" size="small" @change="reload">
                <el-radio-button v-for="t in TABS" :key="t.key" :label="t.key">
                    {{ $tp(t.label) }}<span v-if="tabCount(t.key)" class="cho-count">{{ tabCount(t.key) }}</span>
                </el-radio-button>
            </el-radio-group>
            <el-input v-model="query.q" size="small" clearable class="cho-search" prefix-icon="el-icon-search"
                :placeholder="$tp('Order no / customer / phone / model…')" @keyup.enter.native="reload" @clear="reload" />
            <span class="cho-spacer" />
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">{{ $tp('Refresh') }}</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini" height="calc(100vh - 210px)"
            :empty-text="$tp('No chat orders yet.')">
            <el-table-column :label="$tp('Order No')" width="100">
                <template slot-scope="s"><a class="cho-link" @click="openDetail(s.row)">{{ s.row.orderNo }}</a></template>
            </el-table-column>
            <el-table-column :label="$tp('Placed')" width="140">
                <template slot-scope="s">
                    <div>{{ when(s.row.createdAt) }}</div>
                    <el-tag size="mini" :type="s.row.channel === 'web' ? '' : 'success'" effect="plain">{{ channelText(s.row.channel) }}</el-tag>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Customer')" min-width="150">
                <template slot-scope="s">
                    <div class="cho-strong">{{ s.row.customerName || '—' }}</div>
                    <div class="cho-dim">+{{ s.row.phone }}</div>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Items')" min-width="300">
                <template slot-scope="s">
                    <div v-for="(l, i) in s.row.items" :key="i" class="cho-line">
                        <b>{{ l.qty }} ×</b> {{ lineName(l) }}
                        <span class="cho-dim">{{ l.color || $tp('any colour') }}</span>
                        <span v-if="l.unitPrice == null" class="cho-quote">{{ $tp('Contact us') }}</span>
                    </div>
                    <div v-if="s.row.note" class="cho-note" :title="s.row.note"><i class="el-icon-chat-line-square" /> {{ s.row.note }}</div>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Subtotal')" width="120" align="right">
                <template slot-scope="s">
                    <div>{{ s.row.subtotal != null ? money(s.row.subtotal, s.row.currency) : '—' }}</div>
                    <el-tag v-if="s.row.quoteNeeded" size="mini" type="warning" effect="plain">{{ $tp('Quote needed') }}</el-tag>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Status')" width="140" align="center">
                <template slot-scope="s">
                    <el-tag size="mini" :type="statusOf(s.row.status).tag">{{ $tp(statusOf(s.row.status).label) }}</el-tag>
                    <div v-if="s.row.status === 'pending'" class="cho-dim">{{ $tp('held until {t}', { t: when(s.row.holdUntil) }) }}</div>
                    <div v-else-if="s.row.status === 'completed' && s.row.salesOrderNo" class="cho-dim">{{ s.row.salesOrderNo }}</div>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Actions')" width="250" align="center">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-view" @click="openDetail(s.row)">{{ $tp('View') }}</el-button>
                    <template v-if="canManage">
                        <el-button v-if="['pending', 'expired'].includes(s.row.status)" size="mini" type="text" icon="el-icon-check"
                            :disabled="busy" @click="confirm(s.row)">{{ $tp('Confirm') }}</el-button>
                        <el-button v-if="s.row.status === 'confirmed'" size="mini" type="text" icon="el-icon-finished"
                            :disabled="busy" @click="complete(s.row)">{{ $tp('Mark completed') }}</el-button>
                        <el-button v-if="['pending', 'confirmed', 'expired'].includes(s.row.status)" size="mini" type="text"
                            class="cho-danger" :disabled="busy" @click="cancel(s.row)">{{ $tp('Cancel') }}</el-button>
                    </template>
                </template>
            </el-table-column>
        </el-table>

        <div class="cho-pager">
            <el-pagination background layout="total, sizes, prev, pager, next" :total="total" :page-size="query.pageSize"
                :page-sizes="[20, 50, 100]" :current-page="query.page" @current-change="onPage" @size-change="onSize" />
        </div>

        <!-- ── one order ─────────────────────────────────────────────── -->
        <el-dialog :title="detail ? detail.orderNo : ''" :visible.sync="detailVisible" width="760px" custom-class="cho-dlg" append-to-body top="6vh">
            <div v-if="detail" class="cho-detail">
                <div class="cho-head">
                    <div><label>{{ $tp('Status') }}</label>
                        <div><el-tag size="mini" :type="statusOf(detail.status).tag">{{ $tp(statusOf(detail.status).label) }}</el-tag>
                            <span v-if="detail.status === 'pending'" class="cho-dim"> {{ $tp('held until {t}', { t: when(detail.holdUntil) }) }}</span></div>
                    </div>
                    <div><label>{{ $tp('Customer') }}</label><div>{{ detail.customerName || '—' }} · +{{ detail.phone }}</div></div>
                    <div><label>{{ $tp('Placed') }}</label><div>{{ when(detail.createdAt) }} · {{ channelText(detail.channel) }}</div></div>
                    <div v-if="detail.salesOrderNo"><label>{{ $tp('Sales Order') }}</label><div>{{ detail.salesOrderNo }}</div></div>
                    <div v-if="detail.status === 'cancelled'"><label>{{ $tp('Cancelled') }}</label>
                        <div>{{ when(detail.cancelledAt) }} · {{ detail.cancelledBy === 'customer' ? $tp('by the customer') : (detail.cancelledByUser || $tp('staff')) }}<span v-if="detail.cancelReason"> — {{ detail.cancelReason }}</span></div>
                    </div>
                </div>
                <div v-if="detail.note" class="cho-cust-note"><label>{{ $tp('Customer note') }}</label><div>{{ detail.note }}</div></div>

                <el-table :data="detail.items" border size="mini" class="cho-items">
                    <el-table-column :label="$tp('Model')" min-width="200">
                        <template slot-scope="s">{{ lineName(s.row) }}</template>
                    </el-table-column>
                    <el-table-column :label="$tp('Colour')" min-width="150">
                        <template slot-scope="s">
                            <div>{{ s.row.color || $tp('any colour') }}</div>
                            <!-- where the hold sits — the colours to pick from -->
                            <div v-if="!s.row.color && (s.row.alloc || []).length" class="cho-dim">{{ allocText(s.row) }}</div>
                        </template>
                    </el-table-column>
                    <el-table-column :label="$tp('Qty')" width="60" align="center" prop="qty" />
                    <el-table-column :label="$tp('Unit Price')" width="110" align="right">
                        <template slot-scope="s"><span v-if="s.row.unitPrice != null">{{ money(s.row.unitPrice, s.row.currency) }}</span><span v-else class="cho-quote">{{ $tp('Contact us') }}</span></template>
                    </el-table-column>
                    <el-table-column :label="$tp('Total')" width="110" align="right">
                        <template slot-scope="s">{{ s.row.lineTotal != null ? money(s.row.lineTotal, s.row.currency) : '—' }}</template>
                    </el-table-column>
                </el-table>
                <div class="cho-total">
                    <span v-if="detail.quoteNeeded" class="cho-quote">{{ $tp('Contact-us lines need a price from us') }}</span>
                    <span>{{ $tp('Subtotal') }} <b>{{ detail.subtotal != null ? money(detail.subtotal, detail.currency) : '—' }}</b></span>
                    <span class="cho-dim">{{ detail.priceNote }}</span>
                </div>

                <!-- the devices scanned when it was confirmed — the IMEIs for its sales order -->
                <div v-if="(detail.picked || []).length" class="cho-picked">
                    <label>{{ $tp('Devices picked') }} ({{ detail.picked.length }})</label>
                    <el-table :data="detail.picked" border size="mini">
                        <el-table-column label="IMEI / Serial" min-width="150">
                            <template slot-scope="s"><span class="cho-mono">{{ s.row.imei || s.row.serialNumber }}</span></template>
                        </el-table-column>
                        <el-table-column :label="$tp('Model')" min-width="200">
                            <template slot-scope="s">{{ lineName(s.row) }}</template>
                        </el-table-column>
                        <el-table-column :label="$tp('Colour')" prop="color" width="110" />
                        <el-table-column :label="$tp('Location')" prop="location" width="130" />
                    </el-table>
                </div>

                <div class="cho-staff-note">
                    <label>{{ $tp('Staff note') }} <span class="cho-dim">{{ $tp('(not shown to the customer)') }}</span></label>
                    <el-input v-model="noteDraft" type="textarea" :rows="2" maxlength="1000" :disabled="!canManage" />
                    <el-button v-if="canManage" size="mini" :loading="noteSaving" :disabled="noteDraft === (detail.staffNote || '')" @click="saveNote">{{ $tp('Save note') }}</el-button>
                </div>

                <div class="cho-history">
                    <label>{{ $tp('History') }}</label>
                    <div v-for="(h, i) in detail.history || []" :key="i" class="cho-hist-row">
                        <span class="cho-dim">{{ when(h.at) }}</span>
                        <b>{{ $tp(historyLabel(h.action)) }}</b>
                        <span>{{ h.by === 'customer' ? $tp('customer') : h.by === 'system' ? $tp('automatic') : h.by }}</span>
                        <span v-if="h.note" class="cho-dim">— {{ h.note }}</span>
                    </div>
                </div>
            </div>
            <span slot="footer">
                <template v-if="detail && canManage">
                    <el-button v-if="['pending', 'confirmed', 'expired'].includes(detail.status)" size="small" class="cho-danger" :disabled="busy" @click="cancel(detail)">{{ $tp('Cancel order') }}</el-button>
                    <el-button v-if="detail.status === 'confirmed'" size="small" type="primary" plain :disabled="busy" @click="complete(detail)">{{ $tp('Mark completed') }}</el-button>
                    <el-button v-if="['pending', 'expired'].includes(detail.status)" size="small" type="primary" :disabled="busy" @click="confirm(detail)">{{ $tp('Scan & confirm') }}</el-button>
                </template>
                <el-button size="small" @click="detailVisible = false">{{ $tp('Close') }}</el-button>
            </span>
        </el-dialog>

        <!-- ── pick: scan every unit's IMEI, then confirm (user 2026-11-25) ── -->
        <el-dialog :title="pickOrder ? $tp('Scan devices for {no}', { no: pickOrder.orderNo }) : ''" :visible.sync="pickVisible"
            width="720px" custom-class="cho-dlg" append-to-body top="5vh" :close-on-click-modal="false" @opened="focusScan">
            <div v-if="pickOrder" class="cho-pick">
                <div class="cho-pick-who">{{ pickOrder.customerName || '—' }} · +{{ pickOrder.phone }}</div>
                <el-input ref="scan" v-model="scanCode" size="medium" clearable class="cho-scan" prefix-icon="el-icon-full-screen"
                    :placeholder="$tp('Scan or type an IMEI / serial, then Enter')" :disabled="scanning || confirming"
                    @keyup.enter.native="scan" />
                <div v-if="scanMsg" :class="['cho-scan-msg', scanMsg.ok ? 'cho-scan-ok' : 'cho-scan-bad']">
                    <i :class="scanMsg.ok ? 'el-icon-circle-check' : 'el-icon-warning'" /> {{ scanMsg.text }}
                </div>
                <div v-for="(l, i) in pickOrder.items" :key="i" :class="['cho-pline', { 'cho-pline-done': pickedOn(i).length === l.qty }]">
                    <div class="cho-pline-head">
                        <span><b>{{ lineName(l) }}</b> <span class="cho-dim">{{ l.color || $tp('any colour') }}</span></span>
                        <span class="cho-pcount">{{ pickedOn(i).length }} / {{ l.qty }}</span>
                    </div>
                    <div v-if="pickedOn(i).length" class="cho-pdevs">
                        <span v-for="p in pickedOn(i)" :key="p.deviceId" class="cho-pdev">
                            <span class="cho-mono">{{ p.imei || p.serialNumber }}</span>
                            <span class="cho-dim">{{ p.color }}{{ p.location && p.location !== 'iMobile' ? ' · ' + p.location : '' }}</span>
                            <i class="el-icon-close cho-prm" :title="$tp('Remove')" @click="unpick(p)" />
                        </span>
                    </div>
                </div>
                <el-input v-model="pickNote" type="textarea" :rows="2" maxlength="300" :placeholder="$tp('Note (optional)')" class="cho-pnote" />
            </div>
            <span slot="footer" class="cho-pfoot">
                <span class="cho-dim">{{ $tp('{n} of {t} scanned', { n: picks.length, t: pickTotal }) }}</span>
                <span>
                    <el-button size="small" @click="pickVisible = false">{{ $tp('Close') }}</el-button>
                    <el-button size="small" type="primary" :loading="confirming" :disabled="picks.length !== pickTotal || scanning" @click="confirmPicked">{{ $tp('Confirm order') }}</el-button>
                </span>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import { getChatOrders, getChatOrder, reopenChatOrder, scanChatOrderDevice, confirmChatOrder, completeChatOrder, cancelChatOrder, saveChatOrderNote } from '@/api/chatOrders'
import { hasPermission } from '@/utils/permission'

const STATUS = {
    pending: { label: 'Pending', tag: 'warning' },
    confirmed: { label: 'Confirmed', tag: '' },
    completed: { label: 'Completed', tag: 'success' },
    cancelled: { label: 'Cancelled', tag: 'info' },
    expired: { label: 'Expired', tag: 'danger' }
}
const TABS = [
    { key: 'open', label: 'Active orders' },
    { key: 'pending', label: 'Pending' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'completed', label: 'Completed' },
    { key: 'expired', label: 'Expired' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'all', label: 'All' }
]
const HISTORY = { placed: 'Placed', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', expired: 'Expired', reopened: 'Re-checked' }

export default {
    name: 'RefurbishedChatOrders',
    data() {
        return {
            TABS,
            query: { status: 'open', q: '', page: 1, pageSize: 20 },
            rows: [],
            total: 0,
            counts: {},
            loading: false,
            busy: false,
            detail: null,
            detailVisible: false,
            noteDraft: '',
            noteSaving: false,
            // picking (scan every unit before confirming)
            pickOrder: null,
            pickVisible: false,
            picks: [], // [{ deviceId, lineIndex, imei, serialNumber, color, location, … }]
            scanCode: '',
            scanning: false,
            scanMsg: null, // { ok, text }
            pickNote: '',
            confirming: false
        }
    },
    computed: {
        pickTotal() {
            return this.pickOrder ? (this.pickOrder.items || []).reduce((s, l) => s + (Number(l.qty) || 0), 0) : 0
        },
        canManage() {
            return hasPermission(this.$store.getters.permissions, 'refurb:sale:manage')
        }
    },
    created() {
        this.load()
    },
    methods: {
        statusOf(s) {
            return STATUS[s] || { label: s, tag: 'info' }
        },
        historyLabel(a) {
            return HISTORY[a] || a
        },
        // where the customer ordered: the WhatsApp bot or their Stock Chat page
        channelText(c) {
            return c === 'web' ? this.$tp('Web page') : 'WhatsApp'
        },
        tabCount(key) {
            const c = this.counts || {}
            if (key === 'open') return (c.pending || 0) + (c.confirmed || 0)
            if (key === 'pending' || key === 'confirmed') return c[key] || 0
            return 0
        },
        lineName(l) {
            return [l.model, l.storage, l.grade || 'Ungraded'].filter(Boolean).join(' · ')
        },
        allocText(l) {
            return (l.alloc || []).map(a => `${a.color || '—'} ×${a.qty}`).join(', ')
        },
        money(v, cur) {
            return `${cur || 'AUD'} ${(Number(v) || 0).toFixed(2)}`
        },
        when(v) {
            if (!v) return '—'
            const d = new Date(v)
            if (isNaN(d.getTime())) return '—'
            const p = x => String(x).padStart(2, '0')
            return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
        },
        async load() {
            this.loading = true
            try {
                const r = await getChatOrders(this.query)
                this.rows = r.rows || []
                this.total = r.total || 0
                this.counts = r.counts || {}
            } catch (e) {
                // the request layer has shown the error
            } finally {
                this.loading = false
            }
        },
        reload() {
            this.query.page = 1
            this.load()
        },
        onPage(p) {
            this.query.page = p
            this.load()
        },
        onSize(n) {
            this.query.pageSize = n
            this.reload()
        },
        async openDetail(row) {
            this.detail = row
            this.noteDraft = row.staffNote || ''
            this.detailVisible = true
            try {
                const r = await getChatOrder(row._id)
                if (r && r.order) { this.detail = r.order; this.noteDraft = r.order.staffNote || '' }
            } catch (e) { /* shown */ }
        },
        // after an action: the list and an open detail both show the new state
        async applied(order, msg) {
            if (this.detail && order && this.detail._id === order._id) { this.detail = order; this.noteDraft = order.staffNote || '' }
            this.$message.success(msg)
            await this.load()
        },
        // Confirm = scan every unit first. An expired order is re-checked
        // (stock + prices, a new hold) before its devices are scanned.
        async confirm(row) {
            let order = row
            if (row.status === 'expired') {
                try {
                    await this.$confirm(
                        this.$tp('{no} expired — re-checking takes its stock and prices again from today, then you scan its devices', { no: row.orderNo }),
                        this.$tp('Re-check'), { type: 'warning', confirmButtonText: this.$tp('Re-check'), cancelButtonText: this.$tp('Cancel') })
                } catch (e) { return }
                this.busy = true
                try {
                    const r = await reopenChatOrder(row._id)
                    order = r.order
                    await this.applied(order, this.$tp('{no} re-checked — scan its devices', { no: row.orderNo }))
                } catch (e) { return } finally { this.busy = false }
            }
            this.openPick(order)
        },
        openPick(order) {
            // the same order again keeps its scans (until the page is reloaded)
            if (!this.pickOrder || this.pickOrder._id !== order._id) { this.picks = []; this.pickNote = '' }
            this.pickOrder = order
            this.scanCode = ''
            this.scanMsg = null
            this.pickVisible = true
        },
        focusScan() {
            this.$nextTick(() => { if (this.$refs.scan) this.$refs.scan.focus() })
        },
        pickedOn(i) {
            return this.picks.filter(p => p.lineIndex === i)
        },
        async scan() {
            const code = String(this.scanCode || '').trim()
            if (!code || this.scanning || !this.pickOrder) return
            this.scanning = true
            try {
                const r = await scanChatOrderDevice(this.pickOrder._id, code, this.picks.map(p => ({ deviceId: p.deviceId, lineIndex: p.lineIndex })))
                if (r && r.success) {
                    this.picks.push({ ...r.device, lineIndex: r.lineIndex })
                    const l = this.pickOrder.items[r.lineIndex]
                    this.scanMsg = { ok: true, text: `${r.device.imei || r.device.serialNumber} → ${this.lineName(l)} (${this.pickedOn(r.lineIndex).length} / ${l.qty})` }
                } else {
                    this.scanMsg = { ok: false, text: (r && r.message) || this.$tp('Not added') }
                }
            } catch (e) {
                this.scanMsg = { ok: false, text: this.$tp('Not added') }
            } finally {
                this.scanning = false
                this.scanCode = ''
                this.focusScan()
            }
        },
        unpick(p) {
            this.picks = this.picks.filter(x => x.deviceId !== p.deviceId)
            this.scanMsg = null
            this.focusScan()
        },
        async confirmPicked() {
            if (!this.pickOrder || this.picks.length !== this.pickTotal) return
            this.confirming = true
            try {
                const r = await confirmChatOrder(this.pickOrder._id, this.picks.map(p => ({ deviceId: p.deviceId, lineIndex: p.lineIndex })), this.pickNote)
                const no = this.pickOrder.orderNo
                this.pickVisible = false
                this.pickOrder = null
                this.picks = []
                await this.applied(r.order, this.$tp('{no} confirmed', { no }))
            } catch (e) { /* shown */ } finally { this.confirming = false }
        },
        async complete(row) {
            let rso = ''
            try {
                const r = await this.$prompt(this.$tp('The sales order made for it, like RSO-10123 (optional) — completing ends the stock hold'),
                    this.$tp('Mark {no} completed', { no: row.orderNo }), {
                        confirmButtonText: this.$tp('Mark completed'), cancelButtonText: this.$tp('Cancel'),
                        inputPlaceholder: 'RSO-', inputPattern: /^\s*(RSO-\d+)?\s*$/i, inputErrorMessage: this.$tp('Looks like RSO-10123, or leave it empty')
                    })
                rso = String(r.value || '').trim()
            } catch (e) { return }
            this.busy = true
            try {
                const r = await completeChatOrder(row._id, rso || undefined)
                await this.applied(r.order, this.$tp('{no} completed', { no: row.orderNo }))
            } catch (e) { /* shown */ } finally { this.busy = false }
        },
        async cancel(row) {
            let reason = ''
            try {
                const r = await this.$prompt(this.$tp('Why is it cancelled? The customer sees this reason'), this.$tp('Cancel {no}', { no: row.orderNo }), {
                    confirmButtonText: this.$tp('Cancel order'), cancelButtonText: this.$tp('Back'), confirmButtonClass: 'el-button--danger',
                    inputValidator: v => (String(v || '').trim() ? true : this.$tp('A reason is required'))
                })
                reason = String(r.value || '').trim()
            } catch (e) { return }
            this.busy = true
            try {
                const r = await cancelChatOrder(row._id, reason)
                await this.applied(r.order, this.$tp('{no} cancelled', { no: row.orderNo }))
            } catch (e) { /* shown */ } finally { this.busy = false }
        },
        async saveNote() {
            if (!this.detail) return
            this.noteSaving = true
            try {
                const r = await saveChatOrderNote(this.detail._id, this.noteDraft)
                this.detail = r.order
                this.$message.success(this.$tp('Note saved'))
                const i = this.rows.findIndex(x => x._id === r.order._id)
                if (i >= 0) this.$set(this.rows, i, r.order)
            } catch (e) { /* shown */ } finally { this.noteSaving = false }
        }
    }
}
</script>

<style lang="scss" scoped>
.cho-filters {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
    .cho-search { width: 260px; }
    .cho-spacer { flex: 1; }
}
.cho-count {
    display: inline-block;
    margin-left: 5px;
    padding: 0 5px;
    border-radius: 8px;
    background: #f56c6c;
    color: #fff;
    font-size: 11px;
    line-height: 16px;
}
.cho-link { color: #409eff; cursor: pointer; font-weight: 600; }
.cho-strong { font-weight: 600; }
.cho-dim { color: #909399; font-size: 12px; }
.cho-line { line-height: 1.6; }
.cho-quote { color: #e6a23c; font-size: 12px; margin-left: 4px; }
.cho-note { color: #606266; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cho-danger { color: #f56c6c; }
.cho-pager { margin-top: 12px; text-align: right; }

.cho-detail {
    display: flex;
    flex-direction: column;
    gap: 12px;
    label { display: block; font-size: 12px; font-weight: 600; color: #606266; margin-bottom: 3px; }
}
.cho-head {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px 16px;
}
.cho-cust-note div { white-space: pre-wrap; background: #f8f9fb; border-radius: 4px; padding: 6px 8px; }
.cho-total {
    display: flex;
    justify-content: flex-end;
    align-items: baseline;
    gap: 14px;
    b { font-size: 15px; }
}
.cho-staff-note .el-button { margin-top: 6px; }
.cho-hist-row { display: flex; gap: 8px; flex-wrap: wrap; font-size: 13px; line-height: 1.8; }
.cho-mono { font-family: Menlo, Consolas, monospace; font-size: 12px; }
.cho-pick { display: flex; flex-direction: column; gap: 10px; }
.cho-pick-who { color: #606266; }
.cho-scan-msg { font-size: 13px; padding: 6px 10px; border-radius: 4px; }
.cho-scan-ok { background: #f0f9eb; color: #529b2e; }
.cho-scan-bad { background: #fef0f0; color: #c45656; }
.cho-pline { border: 1px solid #ebeef5; border-radius: 6px; padding: 8px 10px; }
.cho-pline-done { border-color: #b3e19d; background: #f7fcf4; }
.cho-pline-head { display: flex; justify-content: space-between; gap: 10px; }
.cho-pcount { font-weight: 700; white-space: nowrap; }
.cho-pdevs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.cho-pdev { display: inline-flex; align-items: center; gap: 6px; background: #f4f4f5; border-radius: 4px; padding: 2px 8px; }
.cho-prm { cursor: pointer; color: #909399; }
.cho-prm:hover { color: #f56c6c; }
.cho-pfoot { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.cho-picked .el-table { margin-top: 4px; }
</style>

<style lang="scss">
.cho-dlg { max-width: calc(100vw - 32px); }
</style>
