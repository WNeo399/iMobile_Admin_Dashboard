<template>
    <div class="rp app-container">
        <div class="rp-head">
            <div>
                <div class="rp-title">{{ $tp('Repair Tickets') }}</div>
                <div class="rp-sub">{{ me && me.group ? me.group.name : '—' }}</div>
            </div>
            <div class="rp-actions">
                <el-button v-if="linked && canCreate" type="primary" size="small" icon="el-icon-plus" @click="newVisible = true">{{ $tp('New ticket') }}</el-button>
                <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="init">{{ $tp('Refresh') }}</el-button>
            </div>
        </div>

        <!-- not linked to a shop group (also what staff see here) -->
        <div v-if="!loading && !linked" class="rp-unlinked">
            <i class="el-icon-s-tools" />
            <div class="rp-unlinked-title">{{ $tp('No shop on this login yet') }}</div>
            <div class="rp-unlinked-sub">{{ $tp('Your login is not linked to a shop — please ask iMobile to link it') }}</div>
        </div>

        <template v-else>
            <div class="rp-filters">
                <el-select v-if="shops.length > 1" v-model="shop" size="small" class="rp-shop" :placeholder="$tp('All shops')" clearable @change="loadTickets">
                    <el-option :label="$tp('All shops')" value="" />
                    <el-option v-for="s in shops" :key="s.id" :label="s.name" :value="s.id" />
                </el-select>
                <div class="rp-pills">
                    <!-- "Waiting for your reply" only when there is one (or it's picked) -->
                    <span v-for="k in KINDS" v-show="k.value !== 'reply' || counts.reply || kind === 'reply'" :key="k.value"
                        :class="['rp-pill', { on: kind === k.value, 'rp-pill-reply': k.value === 'reply' }]" @click="kind = k.value">
                        {{ $tp(k.label) }}<b>{{ counts[k.value] }}</b></span>
                </div>
                <span class="rp-flex" />
                <el-input v-model="search" size="small" clearable class="rp-search" prefix-icon="el-icon-search"
                    :placeholder="$tp('Search ticket / IMEI / model')" />
            </div>

            <!-- iMobile is waiting for the shop's answer on these -->
            <div v-if="counts.reply && kind !== 'reply'" class="rp-reply-bar" @click="kind = 'reply'">
                <i class="el-icon-chat-dot-round" /> {{ $tp('{n} ticket(s) waiting for your reply', { n: counts.reply }) }}
                <span class="rp-reply-go">{{ $tp('Show them') }} <i class="el-icon-arrow-right" /></span>
            </div>
            <!-- a shop with no phone or email in RepairDesk can't be searched -->
            <div v-if="notSearchable.length" class="rp-note"><i class="el-icon-info" />
                {{ $tp('Only the last 60 days are shown for: {shops}', { shops: notSearchable.join(', ') }) }}</div>

            <!-- phones: one card per ticket (the table's columns don't fit) -->
            <div v-if="narrow" v-loading="loading" class="rp-cards">
                <div v-for="t in paged" :key="t.id" :class="['rp-card', { 'rp-card-reply': kindOf(t) === 'reply' }]" @click="openTicket(t)">
                    <div class="rp-card-top">
                        <b class="rp-mono">{{ t.ticketNumber }}</b>
                        <span class="rp-dim">{{ day(t.created) }}</span>
                        <span :class="['rp-status', 'rp-card-status', labelClass(t.devices[0])]">{{ (t.devices[0] || {}).status || '—' }}</span>
                    </div>
                    <div v-for="d in t.devices" :key="d.id" class="rp-card-dev">
                        <div class="rp-dev-name">{{ d.name || '—' }}<span v-if="d.imei || d.serial" class="rp-dim rp-mono"> · {{ d.imei || d.serial }}</span></div>
                        <div v-if="d.services.length" class="rp-card-svc">{{ d.services.join(', ') }}</div>
                    </div>
                    <div class="rp-card-foot">
                        <span v-if="shops.length > 1" class="rp-dim">{{ t.shop }}</span>
                        <el-button size="mini" icon="el-icon-printer" class="rp-card-print" :loading="labelLoadingId === t.id"
                            :disabled="!!labelLoadingId && labelLoadingId !== t.id" @click.stop="printLabel(t.id)">{{ $tp('Print label') }}</el-button>
                    </div>
                </div>
                <div v-if="!loading && !shown.length" class="rp-cards-empty">{{ $tp('No tickets') }}</div>
            </div>
            <el-table v-else v-loading="loading" :data="paged" size="small" class="rp-table" row-key="id" :row-class-name="rowClass" :empty-text="$tp('No tickets')" @row-click="openTicket">
                <el-table-column :label="$tp('Ticket')" width="110">
                    <template slot-scope="s"><b class="rp-mono">{{ s.row.ticketNumber }}</b></template>
                </el-table-column>
                <el-table-column :label="$tp('Created')" width="110">
                    <template slot-scope="s">{{ day(s.row.created) }}</template>
                </el-table-column>
                <el-table-column v-if="shops.length > 1" :label="$tp('Shop')" min-width="150" show-overflow-tooltip prop="shop" />
                <el-table-column :label="$tp('Device')" min-width="190">
                    <template slot-scope="s">
                        <div v-for="d in s.row.devices" :key="d.id" class="rp-dev">
                            <div class="rp-dev-name">{{ d.name || '—' }}</div>
                            <div v-if="d.imei || d.serial" class="rp-dim rp-mono">{{ d.imei || d.serial }}</div>
                        </div>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Repair')" min-width="200">
                    <template slot-scope="s">
                        <div v-for="d in s.row.devices" :key="d.id" class="rp-dev">{{ d.services.join(', ') || '—' }}</div>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Status')" min-width="170">
                    <template slot-scope="s">
                        <div v-for="d in s.row.devices" :key="d.id" class="rp-dev"><span :class="['rp-status', labelClass(d)]">{{ d.status || '—' }}</span></div>
                    </template>
                </el-table-column>
                <!-- the 50×40 label, straight from the list (user 2026-11-13) -->
                <el-table-column :label="$tp('Label')" width="96" align="center">
                    <template slot-scope="s">
                        <el-button size="mini" icon="el-icon-printer" :loading="labelLoadingId === s.row.id" :disabled="!!labelLoadingId && labelLoadingId !== s.row.id"
                            @click.stop="printLabel(s.row.id)">{{ $tp('Print') }}</el-button>
                    </template>
                </el-table-column>
            </el-table>
            <!-- pages over the filtered tickets (user 2026-11-13) -->
            <div v-if="shown.length" class="rp-pager">
                <el-pagination :current-page.sync="pageNo" :page-size.sync="pageSize" :page-sizes="[20, 50, 100]" :total="shown.length"
                    :layout="narrow ? 'prev, pager, next' : 'total, sizes, prev, pager, next'" :pager-count="narrow ? 5 : 7" background />
            </div>
            <!-- a shop's search hit the cap: the oldest tickets aren't listed -->
            <div v-if="!complete" class="rp-note rp-note-end"><i class="el-icon-info" /> {{ $tp('Showing the newest tickets — older ones are not listed') }}</div>
        </template>

        <!-- one ticket -->
        <el-dialog :title="detail ? $tp('Ticket {no}', { no: detail.ticketNumber }) : ''" :visible.sync="detailVisible" :width="narrow ? '94%' : '640px'" top="8vh" append-to-body custom-class="rp-dialog">
            <div v-if="detail" v-loading="detailLoading">
                <div class="rp-d-facts">
                    <div><label>{{ $tp('Shop') }}</label>{{ detail.shop || '—' }}</div>
                    <div><label>{{ $tp('Created') }}</label>{{ day(detail.created) }}</div>
                </div>
                <div v-for="d in detail.devices" :key="d.id" class="rp-d-dev">
                    <div class="rp-d-top">
                        <b>{{ d.name || '—' }}</b>
                        <span :class="['rp-status', labelClass(d)]">{{ d.status || '—' }}</span>
                    </div>
                    <div v-if="d.imei || d.serial" class="rp-d-grid">
                        <div v-if="d.imei"><label>IMEI</label><span class="rp-mono">{{ d.imei }}</span></div>
                        <div v-if="d.serial"><label>{{ $tp('Serial') }}</label><span class="rp-mono">{{ d.serial }}</span></div>
                    </div>
                    <!-- one line, as the list: a free-text issue is stored split at its commas -->
                    <div v-if="d.services.length" class="rp-d-svcs"><label>{{ $tp('Repair') }}</label>{{ d.services.join(', ') }}</div>
                    <!-- its progress: each status and when (RepairDesk's status history) -->
                    <div v-if="d.timeline && d.timeline.length" class="rp-tl">
                        <div class="rp-tl-h">{{ $tp('Progress') }}</div>
                        <div v-for="(h, i) in d.timeline" :key="i" :class="['rp-tl-row', { last: i === d.timeline.length - 1 }]">
                            <i :class="['rp-tl-dot', dotClass({ status: h.status, statusType: h.type })]" />
                            <span class="rp-tl-status">{{ h.status }}</span>
                            <span class="rp-dim">{{ dayTime(h.at) }}</span>
                        </div>
                    </div>
                </div>
                <!-- notes shared with the shop (RepairDesk's diagnostic notes) + the shop's own -->
                <div class="rp-notes">
                    <div class="rp-tl-h">{{ $tp('Notes') }}</div>
                    <div v-if="!detailLoading && !(detail.notes || []).length" class="rp-dim">{{ $tp('No notes yet') }}</div>
                    <div v-for="n in detail.notes || []" :key="n.id" :class="['rp-msg', n.from === 'shop' ? 'rp-msg-mine' : '']">
                        <div class="rp-msg-meta">
                            <b>{{ n.from === 'shop' ? (n.shop || $tp('You')) : 'iMobile' }}</b>
                            <span v-if="n.device"> · {{ n.device }}</span>
                            <span class="rp-dim"> · {{ dayTime(n.at) }}</span>
                        </div>
                        <div class="rp-msg-text">{{ n.text }}</div>
                    </div>
                    <div v-if="canNote" class="rp-msg-form">
                        <div v-if="awaitingReply" class="rp-msg-ask"><i class="el-icon-chat-dot-round" /> {{ $tp('iMobile is waiting for your reply on this ticket') }}</div>
                        <el-input v-model="noteText" type="textarea" :rows="3" :maxlength="2000" show-word-limit
                            :placeholder="awaitingReply ? $tp('Write your reply') : $tp('Write a note to iMobile')" />
                        <div class="rp-msg-send">
                            <el-button type="primary" size="small" :loading="noteSending" :disabled="!noteText.trim()" @click="sendNote">
                                {{ awaitingReply ? $tp('Send reply') : $tp('Send note') }}</el-button>
                        </div>
                    </div>
                </div>
            </div>
            <span slot="footer">
                <el-button v-if="detail" size="small" icon="el-icon-printer" :loading="labelLoadingId === detail.id" @click="printLabel(detail.id)">{{ $tp('Print label') }}</el-button>
                <el-button size="small" @click="detailVisible = false">{{ $tp('Close') }}</el-button>
            </span>
        </el-dialog>

        <!-- the 50×40 ticket label (user 2026-11-13), as RepairDesk prints it -->
        <el-dialog :title="$tp('Label') + (labelNo ? ' — ' + labelNo : '')" :visible.sync="labelVisible" width="440px" append-to-body
            custom-class="rp-label-dialog" @closed="clearLabel">
            <iframe v-if="labelUrl" :src="labelUrl + '#toolbar=0&navpanes=0&view=Fit'" class="rp-label-frame" title="label" />
            <div class="rp-dim rp-label-size">50 × 40 mm</div>
            <span slot="footer">
                <el-button size="small" icon="el-icon-download" @click="downloadLabel">{{ $tp('Download') }}</el-button>
                <el-button size="small" type="primary" icon="el-icon-printer" @click="printLabelNow">{{ $tp('Print') }}</el-button>
            </span>
        </el-dialog>

        <new-ticket-dialog :visible.sync="newVisible" :shops="shops" :default-shop="shop" @created="onCreated" />
    </div>
</template>

<script>
// iMobile Repair shop portal (2026-11-13) — the Repair Customer role's
// page: its shop group's RepairDesk tickets (all of them, newest first, in
// pages of 20 / 50 / 100; no prices) and New ticket. The backend scopes
// every call to the login's group (routes/repairRoutes/portal.js).
import { getRepairPortalMe, listRepairPortalTickets, getRepairPortalTicket, addRepairPortalNote, getRepairPortalLabel } from '@/api/repair/portal'
import { buildRepairLabelsPdf, repairLabelFileName } from '@/utils/repairTicketLabelPdf'
import { hasPermission } from '@/utils/permission'
import NewTicketDialog from './NewTicketDialog'

// a RepairDesk status type → the colour / filter it goes with
const TONES = { open: 'open', 'on hold': 'hold', 'warranty repair': 'warranty', closed: 'ready', cancelled: 'cancel' }
// iMobile is waiting for the SHOP's answer (a quote, a go-ahead) — RepairDesk
// files "Awaiting reply" as Closed, so it's picked out by name
const NEEDS_REPLY = ['awaiting reply', 'waiting on customer']
// the device isn't at iMobile yet — its own filter, apart from In progress
const NOT_ARRIVED = ['pending', 'waiting for drop-off']
// A finished device (user 2026-11-13: "split the completed into Ready to Ship
// and Shipped"): back with the shop once Collected / Returned / Completed;
// Ready to Ship otherwise — Repaired, Unrepairable, No Problem Found,
// Unlocked and every "… Dispatching" (user: "Dispatching also means ready to
// ship"). An unknown finished status stays Ready to Ship (never claims shipped).
const SHIPPED_RE = /collected|returned/
// the filter pills: In progress = open + on hold + warranty still in repair
const KINDS = [
    { value: '', label: 'All' },
    { value: 'reply', label: 'Waiting for your reply' },
    // not at iMobile yet (user 2026-11-13: "separate Pending status from In Progress")
    { value: 'pending', label: 'Pending' },
    { value: 'active', label: 'In progress' },
    { value: 'ready', label: 'Ready to Ship' },
    { value: 'shipped', label: 'Shipped' },
    { value: 'cancel', label: 'Cancelled' }
]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default {
    name: 'RepairPortalTickets',
    components: { NewTicketDialog },
    data() {
        return {
            KINDS,
            loading: false,
            linked: true,
            me: null,
            shops: [],
            shop: '',
            tickets: [],
            // false = a shop's search hit the server's cap (the oldest are left out)
            complete: true,
            // the pager
            pageNo: 1,
            pageSize: 20,
            notSearchable: [],
            search: '',
            kind: '',
            detailVisible: false,
            detail: null,
            detailLoading: false,
            // the shop's note in the open ticket (2026-11-13)
            noteText: '',
            noteSending: false,
            // the 50×40 label preview (2026-11-13)
            // the ticket whose label is being fetched (the list's Print + the dialog's)
            labelLoadingId: null,
            labelVisible: false,
            labelUrl: '',
            labelNo: '',
            labelData: null,
            newVisible: false,
            // a phone-width window: cards instead of the table
            narrow: false
        }
    },
    computed: {
        canCreate() {
            return hasPermission(this.$store.getters.permissions, 'repair:portal:create')
        },
        canNote() {
            return hasPermission(this.$store.getters.permissions, 'repair:portal:note')
        },
        // the open ticket has a device waiting for the shop's answer
        awaitingReply() {
            return !!this.detail && (this.detail.devices || []).some(d => this.tone(d) === 'reply')
        },
        // the tickets through the search box
        searched() {
            const q = this.search.trim().toLowerCase()
            if (!q) return this.tickets
            const code = q.replace(/\s+/g, '')
            return this.tickets.filter(t => String(t.ticketNumber).toLowerCase().includes(q) ||
                t.devices.some(d => String(d.imei).toLowerCase().includes(code) || String(d.serial).toLowerCase().includes(code) ||
                    String(d.name).toLowerCase().includes(q) || d.services.some(x => x.toLowerCase().includes(q))))
        },
        shown() {
            return this.kind ? this.searched.filter(t => this.kindOf(t) === this.kind) : this.searched
        },
        counts() {
            const c = { '': this.searched.length, reply: 0, pending: 0, active: 0, ready: 0, shipped: 0, cancel: 0 }
            for (const t of this.searched) c[this.kindOf(t)] = (c[this.kindOf(t)] || 0) + 1
            return c
        },
        // the pager's page of the filtered tickets
        paged() {
            const start = (this.pageNo - 1) * this.pageSize
            return this.shown.slice(start, start + this.pageSize)
        }
    },
    watch: {
        // another filter / search / shop → back to the first page
        kind() { this.pageNo = 1 },
        search() { this.pageNo = 1 },
        shop() { this.pageNo = 1 },
        // a new page starts at the top
        pageNo() {
            const main = document.querySelector('.app-main')
            if (main) main.scrollTop = 0
        }
    },
    created() {
        this.measure()
        this.init()
    },
    mounted() {
        window.addEventListener('resize', this.measure)
    },
    beforeDestroy() {
        window.removeEventListener('resize', this.measure)
    },
    methods: {
        measure() {
            this.narrow = window.innerWidth < 768
        },
        async init() {
            this.loading = true
            try {
                const r = await getRepairPortalMe()
                this.linked = !!(r && r.linked)
                this.me = r || null
                this.shops = (r && r.shops) || []
                if (this.shop && !this.shops.some(s => s.id === this.shop)) this.shop = ''
            } catch (e) {
                this.linked = false
            } finally {
                this.loading = false
            }
            if (this.linked) {
                await this.loadTickets()
                // from the home page's "New ticket"
                if (this.$route.query.new && this.canCreate) this.newVisible = true
            }
        },
        async loadTickets() {
            this.loading = true
            try {
                const r = await listRepairPortalTickets({ shop: this.shop || undefined })
                this.tickets = (r && r.tickets) || []
                this.complete = !(r && r.complete === false)
                this.notSearchable = (r && r.notSearchable) || []
                this.pageNo = 1
            } catch (e) {
                // the request layer has said why
            } finally {
                this.loading = false
            }
        },
        // the row as listed at once, then the fresh one
        async openTicket(row) {
            if (!this.detail || this.detail.id !== row.id) this.noteText = ''
            this.detail = row
            this.detailVisible = true
            this.detailLoading = true
            try {
                const r = await getRepairPortalTicket(row.id)
                if (r && r.ticket && this.detail && this.detail.id === row.id) this.detail = r.ticket
            } catch (e) {
                // keep the listed one
            } finally {
                this.detailLoading = false
            }
        },
        // the shop's note (user 2026-11-13: "able to leave note"); on a ticket
        // waiting for their reply the server moves it to "Customer Replied" —
        // the dialog and the list row take the fresh ticket
        async sendNote() {
            const text = this.noteText.trim()
            if (!text || this.noteSending || !this.detail) return
            const id = this.detail.id
            this.noteSending = true
            try {
                const r = await addRepairPortalNote(id, text)
                this.noteText = ''
                if (r && r.ticket) {
                    if (this.detail && this.detail.id === id) this.detail = r.ticket
                    const i = this.tickets.findIndex(t => t.id === id)
                    if (i >= 0) this.$set(this.tickets, i, { ...this.tickets[i], devices: r.ticket.devices })
                }
                this.$message.success(r && r.replied ? this.$tp('Reply sent — iMobile will pick it up') : this.$tp('Note sent'))
            } catch (e) {
                // the request layer has said why; the text stays to try again
            } finally {
                this.noteSending = false
            }
        },
        // a new ticket: offer its label straight away (it goes on the device sent in)
        onCreated(r) {
            this.$confirm(this.$tp('Ticket {no} is created — iMobile will take it from here', { no: r.ticketNumber || '' }), this.$tp('New ticket'), {
                type: 'success', confirmButtonText: this.$tp('Print label'), cancelButtonText: this.$tp('Close')
            }).then(() => this.printLabel(r.id)).catch(() => {})
            this.loadTickets()
        },
        // ── the 50×40 label: fetched, drawn here, previewed with Print / Download ──
        async printLabel(id) {
            if (!id || this.labelLoadingId) return
            this.labelLoadingId = id
            try {
                const r = await getRepairPortalLabel(id)
                const labels = (r && r.labels) || []
                const doc = buildRepairLabelsPdf(labels)
                if (!doc) { this.$message.warning(this.$tp('This ticket has no device to label')); return }
                this.clearLabel()
                this.labelData = labels
                this.labelNo = labels[0].ticketNumber || ''
                this.labelUrl = doc.output('bloburl')
                this.labelVisible = true
            } catch (e) {
                // the request layer has said why
            } finally {
                this.labelLoadingId = null
            }
        },
        printLabelNow() {
            const doc = buildRepairLabelsPdf(this.labelData)
            if (!doc) return
            doc.autoPrint()
            const w = window.open(doc.output('bloburl'))
            if (!w) this.$message.warning(this.$tp('Pop-up blocked — use Download instead'))
        },
        downloadLabel() {
            const doc = buildRepairLabelsPdf(this.labelData)
            if (doc) doc.save(repairLabelFileName(this.labelData))
        },
        clearLabel() {
            if (this.labelUrl) { try { URL.revokeObjectURL(this.labelUrl) } catch (e) { /* ignore */ } }
            this.labelUrl = ''
        },
        // a device's colour: waiting for the shop's reply; finished = Ready to
        // Ship or Shipped (a warranty repair counts once repaired / dispatching)
        tone(d) {
            const name = String((d && d.status) || '').toLowerCase().trim()
            if (NEEDS_REPLY.includes(name)) return 'reply'
            if (NOT_ARRIVED.includes(name)) return 'pending'
            const type = String((d && d.statusType) || '').toLowerCase()
            if (type === 'closed' || type === 'warranty repair') {
                if (SHIPPED_RE.test(name) || name === 'completed') return 'shipped'
                if (type === 'warranty repair' && !/dispatching|repaired/.test(name)) return 'warranty'
                return 'ready'
            }
            return TONES[type] || 'open'
        },
        // the filter a ticket is under: waiting for a reply if any device is,
        // else in progress while any device still is, else ready to ship while
        // any device still is with iMobile, else shipped / cancelled
        kindOf(t) {
            const tones = (t.devices || []).map(d => this.tone(d))
            if (tones.includes('reply')) return 'reply'
            if (!tones.length || tones.some(x => x === 'open' || x === 'hold' || x === 'warranty')) return 'active'
            // every device still on its way to iMobile (one already in → in progress)
            if (tones.includes('pending')) return 'pending'
            if (tones.includes('ready')) return 'ready'
            return tones.includes('shipped') ? 'shipped' : 'cancel'
        },
        rowClass({ row }) {
            return this.kindOf(row) === 'reply' ? 'rp-row-reply' : ''
        },
        // A status label's colour (user 2026-11-13: "repaired and unrepairable
        // label need different color"): every Unrepairable status red, the
        // rest by tone (Repaired → teal ready to ship / green shipped).
        // Filtering still goes by tone.
        unrepairable(d) {
            return /unrepairable/i.test(String((d && d.status) || ''))
        },
        labelClass(d) {
            return this.unrepairable(d) ? 'rp-unrep' : 'rp-' + this.tone(d || {})
        },
        dotClass(d) {
            return this.unrepairable(d) ? 'rp-dot-unrep' : 'rp-dot-' + this.tone(d || {})
        },
        dayTime(ms) {
            if (!ms) return '—'
            const d = new Date(ms)
            const h = d.getHours()
            return `${this.day(ms)}, ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
        },
        day(ms) {
            if (!ms) return '—'
            const d = new Date(ms)
            return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
        }
    }
}
</script>

<style lang="scss" scoped>
.rp-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.rp-title { font-size: 20px; font-weight: 600; color: #303133; }
.rp-sub { margin-top: 2px; font-size: 13px; color: #909399; }
.rp-actions { display: flex; gap: 8px; .el-button + .el-button { margin-left: 0; } }
.rp-unlinked { padding: 60px 16px; text-align: center; color: #909399;
    i { font-size: 40px; color: #c0c4cc; }
    .rp-unlinked-title { margin-top: 10px; font-size: 16px; color: #606266; }
    .rp-unlinked-sub { margin-top: 6px; font-size: 13px; } }
.rp-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; margin-bottom: 10px; }
.rp-shop { width: 220px; }
.rp-pills { display: inline-flex; flex-wrap: wrap; gap: 8px; }
.rp-pill { display: inline-flex; align-items: center; gap: 8px; height: 30px; padding: 0 12px; border: 1px solid #dcdfe6; border-radius: 6px; background: #fff;
    font-size: 13px; color: #4b5563; cursor: pointer; user-select: none; white-space: nowrap;
    b { min-width: 20px; padding: 0 6px; border-radius: 10px; background: #f0f2f5; color: #606266; font-size: 12px; font-weight: 500; text-align: center; line-height: 18px; }
    &:hover { border-color: #b3d8ff; color: #409eff; }
    &.on { border-color: #409eff; background: #ecf5ff; color: #409eff; font-weight: 600; b { background: #d9ecff; color: #409eff; } } }
.rp-flex { flex: 1; }
.rp-search { width: 260px; }
.rp-note { margin-bottom: 10px; padding: 6px 10px; border-radius: 4px; background: #f4f4f5; font-size: 12px; color: #606266; }
.rp-table { width: 100%; ::v-deep .el-table__row { cursor: pointer; } }
.rp-mono { font-variant-numeric: tabular-nums; letter-spacing: .2px; }
.rp-dim { font-size: 12px; color: #909399; }
.rp-dev + .rp-dev { margin-top: 6px; padding-top: 6px; border-top: 1px dashed #ebeef5; }
.rp-dev-name { color: #303133; }
.rp-status { display: inline-block; padding: 0 8px; border-radius: 10px; font-size: 12px; line-height: 20px; white-space: nowrap; }
.rp-open { background: #ecf5ff; color: #409eff; }
.rp-hold { background: #fdf6ec; color: #e6a23c; }
.rp-warranty { background: #f3edff; color: #7c4dff; }
.rp-done { background: #f0f9eb; color: #67c23a; }
.rp-cancel { background: #f4f4f5; color: #909399; }
.rp-reply { background: #fdf6ec; color: #d97706; font-weight: 600; box-shadow: inset 0 0 0 1px #f5c78a; }
// not at iMobile yet: slate, apart from the blue of In progress
.rp-pending { background: #f1f5f9; color: #64748b; }
.rp-dot-pending { background: #94a3b8; }
// finished: still with iMobile / back with the shop (2026-11-13)
.rp-ready { background: #e6f7f5; color: #0d9488; }
.rp-shipped { background: #f0f9eb; color: #67c23a; }
.rp-dot-ready { background: #0d9488; }
.rp-dot-shipped { background: #67c23a; }
// Unrepairable (ready to ship or returned): red, apart from the repaired ones
.rp-unrep { background: #fef0f0; color: #e5484d; }
.rp-dot-unrep { background: #e5484d; }
.rp-pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.rp-note-end { margin: 10px 0 0; }
// waiting for the shop's reply (2026-11-13)
.rp-pill.rp-pill-reply { border-color: #f5c78a; color: #d97706; b { background: #fdf0dc; color: #d97706; }
    &.on { background: #fdf6ec; border-color: #e6a23c; } }
.rp-reply-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding: 8px 12px; border-radius: 6px; background: #fdf6ec;
    border: 1px solid #f5dab1; font-size: 13px; color: #b45309; cursor: pointer;
    .rp-reply-go { margin-left: auto; font-weight: 600; white-space: nowrap; } }
.rp-table ::v-deep .rp-row-reply > td { background: #fffaf2; }
// phone cards
.rp-cards { display: flex; flex-direction: column; gap: 10px; min-height: 80px; }
.rp-card { padding: 12px; border: 1px solid #e8ebf0; border-radius: 8px; background: #fff; cursor: pointer; }
.rp-card-reply { border-color: #f5c78a; background: #fffaf2; }
.rp-card-top { display: flex; align-items: center; gap: 8px; b { font-size: 14px; color: #303133; } }
.rp-card-dev { margin-top: 8px; font-size: 13px; }
.rp-card-svc { margin-top: 2px; font-size: 12px; color: #606266; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rp-card-foot { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.rp-card-print { margin-left: auto; }
.rp-card-status { margin-left: auto; }
.rp-cards-empty { padding: 30px 0; text-align: center; color: #909399; font-size: 13px; }
// a device's progress
.rp-tl { margin-top: 12px; padding-top: 10px; border-top: 1px dashed #ebeef5; }
.rp-tl-h { margin-bottom: 6px; font-size: 12px; font-weight: 600; color: #606266; }
.rp-tl-row { position: relative; display: flex; align-items: baseline; gap: 10px; padding: 0 0 10px 18px; font-size: 13px;
    &::before { content: ''; position: absolute; left: 4px; top: 12px; bottom: 0; width: 2px; background: #e4e7ed; }
    &.last { padding-bottom: 0; &::before { display: none; } } }
.rp-tl-dot { position: absolute; left: 0; top: 4px; width: 10px; height: 10px; border-radius: 50%; background: #409eff; }
.rp-dot-hold { background: #e6a23c; }
.rp-dot-warranty { background: #7c4dff; }
.rp-dot-done { background: #67c23a; }
.rp-dot-cancel { background: #c0c4cc; }
.rp-dot-reply { background: #d97706; }
.rp-tl-status { color: #303133; }
.rp-d-facts { display: flex; flex-wrap: wrap; gap: 8px 28px; margin-bottom: 12px; font-size: 13px; color: #303133;
    label { display: block; font-size: 12px; color: #909399; } }
.rp-d-dev { padding: 12px 14px; border: 1px solid #e8ebf0; border-radius: 8px; & + .rp-d-dev { margin-top: 10px; } }
.rp-d-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; b { font-size: 15px; color: #303133; } }
.rp-d-grid { display: flex; flex-wrap: wrap; gap: 6px 24px; margin-top: 8px; font-size: 13px; color: #303133;
    label { display: block; font-size: 12px; color: #909399; } }
.rp-d-svcs { margin-top: 10px; font-size: 13px; line-height: 1.5; color: #303133;
    label { display: block; font-size: 12px; color: #909399; } }
// the ticket's notes: iMobile's on the left (grey), the shop's on the right (blue)
.rp-notes { margin-top: 14px; padding-top: 12px; border-top: 1px solid #ebeef5; }
.rp-msg { max-width: 88%; margin-top: 8px; padding: 8px 10px; border-radius: 8px; background: #f4f4f5; font-size: 13px; }
.rp-msg-mine { margin-left: auto; background: #ecf5ff; }
.rp-msg-meta { font-size: 12px; color: #606266; b { color: #303133; } }
.rp-msg-text { margin-top: 3px; color: #303133; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.rp-msg-form { margin-top: 12px; }
.rp-msg-ask { margin-bottom: 8px; padding: 6px 10px; border: 1px solid #f5dab1; border-radius: 6px; background: #fdf6ec; font-size: 12px; color: #b45309; }
.rp-msg-send { display: flex; justify-content: flex-end; margin-top: 8px; }
// the label preview: the PDF at its 50:40 shape
.rp-label-frame { display: block; width: 100%; aspect-ratio: 50 / 40; border: 1px solid #e4e7ed; border-radius: 4px; background: #fff; }
.rp-label-size { margin-top: 6px; text-align: center; }
@media (max-width: 767px) {
    .rp-shop, .rp-search { width: 100%; }
    .rp-flex { display: none; }
}
</style>
