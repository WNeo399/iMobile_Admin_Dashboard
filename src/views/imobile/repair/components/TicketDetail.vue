<template>
    <!--
        Ticket detail (design 2026-10-30): a header with the ticket number and
        its status, Customer and Ticket Details cards side by side, the device
        lines, then RepairDesk's notes and change history as one timeline.
    -->
    <el-dialog
        :visible.sync="visible"
        width="900px"
        append-to-body
        :close-on-click-modal="false"
        custom-class="ticket-detail-dialog"
        @close="onClose"
    >
        <div slot="title" class="td-head">
            <span class="td-title">{{ ticket ? `Ticket ${ticket.summary.order_id}` : 'Ticket detail' }}</span>
            <span v-if="ticket && ticketStatus" class="td-pill" :class="`td-pill--${statusTone(ticketStatus)}`">{{ ticketStatus }}</span>
        </div>

        <div v-loading="loading" class="dialog-body">
            <div v-if="error" class="error-banner">
                <i class="el-icon-warning-outline" />
                {{ error }}
            </div>

            <template v-if="ticket && !error">
                <div class="td-two-col">
                    <section class="td-card">
                        <div class="td-card-title"><i class="el-icon-user-solid" />Customer</div>
                        <div class="kv">
                            <span class="kv-label">Name</span>
                            <span class="kv-value">{{ customerName }}</span>
                        </div>
                        <div class="kv">
                            <span class="kv-label">Contact</span>
                            <span class="kv-value">{{ ticket.summary.customer.mobile || '—' }}</span>
                        </div>
                        <div class="kv">
                            <span class="kv-label">Email</span>
                            <span class="kv-value">{{ ticket.summary.customer.email || '—' }}</span>
                        </div>
                    </section>
                    <section class="td-card">
                        <div class="td-card-title"><i class="el-icon-document" />Ticket Details</div>
                        <div class="kv">
                            <span class="kv-label">Ticket Number</span>
                            <span class="kv-value">{{ ticket.summary.order_id }}</span>
                        </div>
                        <div class="kv">
                            <span class="kv-label">Created</span>
                            <span class="kv-value">{{ formatDate(ticket.summary.created_date * 1000) }}</span>
                        </div>
                        <div class="kv kv--status">
                            <span class="kv-label">Status</span>
                            <span class="kv-value">
                                <!-- the whole ticket (every device line), changed in RepairDesk by the page -->
                                <status-menu
                                    v-if="statuses.length"
                                    appearance="pill"
                                    large
                                    :value="ticketStatus"
                                    :statuses="statuses"
                                    :mixed="mixedStatus"
                                    :busy="busyId === String(ticket.summary.id)"
                                    @pick="pickTicketStatus"
                                />
                                <span v-else class="td-pill" :class="`td-pill--${statusTone(ticketStatus)}`">{{ ticketStatus || '—' }}</span>
                            </span>
                        </div>
                    </section>
                </div>

                <section class="td-card">
                    <div class="td-card-title"><i class="el-icon-mobile-phone" />Devices</div>
                    <el-table
                        :data="ticket.devices || []"
                        size="small"
                        class="td-devices"
                        header-row-class-name="td-devices-head"
                    >
                        <el-table-column label="Device" min-width="110">
                            <template slot-scope="scope">{{ scope.row.device.name }}</template>
                        </el-table-column>
                        <el-table-column label="Problem" min-width="150">
                            <template slot-scope="scope">
                                <div
                                    v-for="(p, i) in scope.row.repairProdItems"
                                    :key="p.id || i"
                                    class="problem-line"
                                >{{ p.name }}</div>
                            </template>
                        </el-table-column>
                        <el-table-column label="Assigned" min-width="100">
                            <template slot-scope="scope">
                                <!-- one line's assignee, changed in RepairDesk by the page -->
                                <assign-menu
                                    v-if="employees.length"
                                    :value="scope.row.assigned_to.fullname || ''"
                                    :value-id="String(scope.row.assigned_to.id || '')"
                                    :employees="employees"
                                    :busy="assignBusyId === String(ticket.summary.id)"
                                    @pick="e => pickAssignee(scope.row, e)"
                                />
                                <span v-else :class="{ 'unassigned': !scope.row.assigned_to.fullname }">
                                    {{ scope.row.assigned_to.fullname || 'Unassigned' }}
                                </span>
                            </template>
                        </el-table-column>
                        <el-table-column label="Due" min-width="160">
                            <template slot-scope="scope">{{ formatDate(scope.row.due_on * 1000) }}</template>
                        </el-table-column>
                        <el-table-column label="Status" min-width="130">
                            <template slot-scope="scope">
                                <!-- one line's status, changed in RepairDesk by the page -->
                                <status-menu
                                    v-if="statuses.length"
                                    appearance="pill"
                                    :value="scope.row.status.name"
                                    :statuses="statuses"
                                    :busy="busyId === String(ticket.summary.id)"
                                    @pick="name => pickStatus(scope.row, name)"
                                />
                                <span v-else class="td-pill td-pill--small" :class="`td-pill--${statusTone(scope.row.status.name)}`">{{ scope.row.status.name }}</span>
                            </template>
                        </el-table-column>
                        <el-table-column label="Action" align="center" width="100">
                            <template slot-scope="scope">
                                <el-button
                                    size="mini"
                                    type="text"
                                    icon="el-icon-document"
                                    class="td-action"
                                    @click="onChecklist(scope.row)"
                                >Check In</el-button>
                            </template>
                        </el-table-column>
                    </el-table>
                </section>

                <section class="td-card td-card--last">
                    <div class="td-card-title td-card-title--action">
                        <span><i class="el-icon-s-comment" />Notes &amp; Updates</span>
                        <el-button
                            v-if="canAddNote"
                            size="mini"
                            type="text"
                            icon="el-icon-edit-outline"
                            class="td-add-note"
                            @click="$emit('add-note', { id: ticket.summary.id, ticketNumber: ticket.summary.order_id, devices: ticket.devices || [] })"
                        >Add note</el-button>
                    </div>
                    <ul class="td-timeline">
                        <li v-for="e in timeline" :key="e.key" class="td-tl-item">
                            <span class="td-tl-dot" />
                            <span class="td-tl-date">{{ formatDate(e.at * 1000) }}</span>
                            <div class="td-tl-body">
                                <span v-if="e.user" class="td-tl-user">{{ e.user }}</span>
                                <!--
                                    History descriptions are RepairDesk HTML (names
                                    and statuses in <b>) — sanitised, rendered as is
                                -->
                                <span v-if="e.html !== undefined" class="td-tl-text" v-html="e.html" />
                                <template v-else>
                                    <span class="td-tl-text">{{ e.text }}</span>
                                    <i v-if="e.flag" class="el-icon-s-flag td-tl-flag" title="Flagged" />
                                    <span v-if="e.device" class="td-tl-device">· {{ e.device }}</span>
                                    <div class="td-tl-note">{{ e.note }}</div>
                                </template>
                            </div>
                        </li>
                        <li v-if="timeline.length === 0" class="td-tl-empty">No notes or updates yet.</li>
                    </ul>
                </section>
            </template>
        </div>

        <div slot="footer">
            <el-button @click="visible = false">Close</el-button>
        </div>
    </el-dialog>
</template>

<script>
import { getRepairTicketDetail } from '@/api/repair/tickets'
import StatusMenu from './StatusMenu.vue'
import AssignMenu from './AssignMenu.vue'

// RepairDesk status type → the pill's colour
const TONE_BY_TYPE = { open: 'blue', 'on hold': 'amber', 'warranty repair': 'purple', closed: 'green', cancelled: 'grey' }

export default {
    name: 'TicketDetail',
    components: { StatusMenu, AssignMenu },
    props: {
        // RepairDesk's statuses — empty when the user can't change them
        statuses: { type: Array, default: () => [] },
        // the ticket id whose status change the page is saving
        busyId: { type: String, default: '' },
        // RepairDesk's employees — empty when the user can't assign — and
        // the ticket id whose assignment the page is saving
        employees: { type: Array, default: () => [] },
        assignBusyId: { type: String, default: '' },
        // shows the Notes & Updates card's Add note (repair:ticket:note)
        canAddNote: { type: Boolean, default: false }
    },
    data() {
        return {
            visible: false,
            loading: false,
            error: '',
            ticket: null
        }
    },
    computed: {
        customerName() {
            if (!this.ticket) return ''
            const c = this.ticket.summary.customer || {}
            return c.first_name || c.fullName || c.email || '—'
        },
        // RepairDesk's payload spells it `hostory`. Defensive: support
        // both spellings in case the API ever fixes the typo.
        history() {
            if (!this.ticket) return []
            return this.ticket.hostory || this.ticket.history || []
        },
        // the ticket's status: its lines' (one name, or each name once)
        ticketStatus() {
            const names = [...new Set(((this.ticket && this.ticket.devices) || []).map(d => (d.status && d.status.name) || '').filter(Boolean))]
            return names.join(' / ')
        },
        mixedStatus() {
            return this.ticketStatus.includes(' / ')
        },
        // RepairDesk's notes and its change history, newest first. A history
        // line starts with who did it in <b>, shown apart like a note's user.
        timeline() {
            if (!this.ticket) return []
            const notes = (Array.isArray(this.ticket.notes) ? this.ticket.notes : []).map(n => ({
                key: 'n' + n.id,
                at: n.created_on || 0,
                user: n.user || '',
                text: n.tittle || (String(n.type) === '1' ? 'added a diagnostic note' : 'added an internal note'),
                note: n.msg_text || '',
                flag: String(n.is_flag) === '1',
                device: String(n.devicename || '').trim()
            }))
            const changes = this.history.map((h, i) => {
                const m = String(h.description || '').match(/^\s*<b>([^<]*)<\/b>\s*([\s\S]*)$/)
                return {
                    key: 'h' + i,
                    at: h.creationdate || 0,
                    user: m ? m[1].trim() : '',
                    html: this.sanitizeHtml(m ? m[2] : h.description)
                }
            })
            return notes.concat(changes).sort((a, b) => b.at - a.at)
        }
    },
    methods: {
        // Parent calls this to open the dialog for a given ticket id.
        async openDialog(id) {
            this.visible = true
            this.error = ''
            this.ticket = null
            if (!id) {
                this.error = 'Missing ticket id'
                return
            }
            this.loading = true
            try {
                const res = await getRepairTicketDetail(id)
                this.ticket = (res && res.data) || null
                if (!this.ticket) {
                    this.error = 'Ticket not found'
                }
            } catch (e) {
                console.error('Ticket detail load failed:', e)
                const status = e.response && e.response.status
                const msg = (e.response && e.response.data && e.response.data.message)
                    || 'Failed to load ticket'
                this.error = status === 404 ? 'Ticket not found' : msg
            } finally {
                this.loading = false
            }
        },
        // Re-read the open ticket after a status change or a new note (only
        // when it's ticket `id`, if given), keeping it on screen meanwhile
        async reload(id) {
            if (!this.visible || !this.ticket) return
            if (id && String(id) !== String(this.ticket.summary.id)) return
            try {
                const res = await getRepairTicketDetail(this.ticket.summary.id)
                if (res && res.data) this.ticket = res.data
            } catch (e) {
                console.warn('Ticket detail reload failed:', e)
            }
        },
        // The parent confirms and saves; RepairDesk keeps a status per line
        pickStatus(device, status) {
            this.$emit('change-status', {
                id: this.ticket.summary.id,
                ticketNumber: this.ticket.summary.order_id,
                deviceId: device.id,
                deviceName: (device.device && device.device.name) || device.name || '',
                status
            })
        },
        // the Ticket Details card's menu: every line of the ticket
        pickTicketStatus(status) {
            this.$emit('change-status', {
                id: this.ticket.summary.id,
                ticketNumber: this.ticket.summary.order_id,
                status
            })
        },
        // …and an assignee per line, the same way
        pickAssignee(device, employee) {
            this.$emit('change-assignee', {
                id: this.ticket.summary.id,
                ticketNumber: this.ticket.summary.order_id,
                deviceId: device.id,
                deviceName: (device.device && device.device.name) || device.name || '',
                employee
            })
        },
        // a status name's pill colour, by its RepairDesk type (blue when unknown)
        statusTone(name) {
            const first = String(name || '').split(' / ')[0]
            const s = this.statuses.find(x => x.name === first)
            return (s && TONE_BY_TYPE[String(s.type || '').trim().toLowerCase()]) || 'blue'
        },
        onClose() {
            // Drop the payload so a re-open doesn't briefly flash stale data.
            this.ticket = null
            this.error = ''
        },
        onChecklist(device) {
            // Bubble out — the parent listens via ref and opens the QC dialog
            // seeded with this device's info.
            this.$emit('checklist', device)
        },
        formatDate(ms) {
            if (!ms) return ''
            return new Date(ms).toLocaleString('en-AU', {
                timeZone: 'Australia/Melbourne'
            })
        },
        // Strip script/iframe/style tags so v-html on RepairDesk's note
        // descriptions can't execute. Lightweight — formatting tags pass
        // through.
        sanitizeHtml(html) {
            if (!html) return ''
            return String(html)
                .replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '')
                .replace(/\son\w+="[^"]*"/gi, '')
                .replace(/\son\w+='[^']*'/gi, '')
        }
    }
}
</script>

<style scoped>
.dialog-body {
    min-height: 200px;
}
.error-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: #fef0f0;
    border: 1px solid #fde2e2;
    color: #c45656;
    border-radius: 6px;
    margin-bottom: 12px;
}

/* header */
.td-head {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
}
.td-title {
    font-size: 22px;
    font-weight: 700;
    color: #111827;
    letter-spacing: -0.01em;
}
.td-pill {
    display: inline-block;
    padding: 4px 14px;
    border-radius: 999px;
    font-size: 14px;
    line-height: 20px;
    font-weight: 500;
    white-space: nowrap;
}
.td-pill--small {
    padding: 2px 10px;
    font-size: 12px;
    line-height: 18px;
}
.td-pill--blue { background: #e0edff; color: #1d4ed8; }
.td-pill--amber { background: #fdf3dc; color: #b45309; }
.td-pill--green { background: #e3f6e9; color: #15803d; }
.td-pill--purple { background: #efe7fd; color: #6d28d9; }
.td-pill--grey { background: #eef0f3; color: #606266; }

/* cards */
.td-two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-bottom: 14px;
}
.td-card {
    background: #fff;
    border: 1px solid #e8ebf0;
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 14px;
}
.td-two-col .td-card {
    margin-bottom: 0;
}
.td-card--last {
    margin-bottom: 0;
}
.td-card-title {
    display: flex;
    align-items: center;
    font-size: 17px;
    font-weight: 700;
    color: #111827;
    margin-bottom: 12px;
}
.td-card-title i {
    font-size: 20px;
    margin-right: 10px;
    color: #303133;
}
.td-card-title--action {
    justify-content: space-between;
}
.td-card-title--action > span {
    display: flex;
    align-items: center;
}
.td-add-note {
    padding: 0;
    font-size: 14px;
    font-weight: 400;
}
.kv {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    padding: 6px 0;
    line-height: 1.4;
}
.kv-label {
    color: #8a8f98;
    width: 120px;
    flex-shrink: 0;
}
.kv-value {
    color: #1f2329;
    min-width: 0;
    word-break: break-word;
}
.kv--status {
    padding-top: 4px;
}

/* devices */
.td-devices {
    font-size: 13px;
}
.td-devices::before {
    display: none;
}
.td-devices >>> .td-devices-head th {
    background: #f5f7fa;
    color: #303133;
    font-weight: 600;
    font-size: 13px;
}
.td-devices >>> .el-table__body td {
    border-bottom: none;
    padding: 12px 0;
    color: #1f2329;
}
.td-action {
    font-size: 13px;
}
.problem-line {
    line-height: 1.4;
}
.unassigned {
    color: #c0c4cc;
    font-style: italic;
}

/* notes & updates timeline */
.td-timeline {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    max-height: 320px;
    overflow-y: auto;
}
.td-tl-item {
    position: relative;
    display: grid;
    grid-template-columns: 24px 170px 1fr;
    align-items: baseline;
    padding: 9px 0;
    font-size: 14px;
    line-height: 1.5;
}
/* the line joining the dots */
.td-tl-item::before {
    content: '';
    position: absolute;
    left: 8px;
    top: 22px;
    bottom: -9px;
    width: 2px;
    background: #e4e7ed;
}
.td-tl-item:last-child::before {
    bottom: 8px;
}
.td-tl-dot {
    position: relative;
    z-index: 1;
    align-self: start;
    margin-top: 4px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 3px solid #d3d7de;
    background: #fff;
    box-sizing: border-box;
}
.td-tl-date {
    color: #8a8f98;
    font-size: 13px;
    white-space: nowrap;
}
.td-tl-body {
    color: #1f2329;
    min-width: 0;
    word-break: break-word;
}
.td-tl-user {
    font-weight: 700;
    margin-right: 6px;
}
/* RepairDesk bolds names and statuses in its history lines — the design
   keeps only who did it bold */
.td-tl-text >>> b {
    font-weight: inherit;
}
.td-tl-flag {
    color: #f56c6c;
    margin-left: 4px;
}
.td-tl-device {
    margin-left: 4px;
    color: #8a8f98;
}
.td-tl-note {
    margin-top: 4px;
    padding: 6px 10px;
    border-radius: 6px;
    background: #f5f7fa;
    white-space: pre-wrap;
}
.td-tl-empty {
    padding: 16px 0;
    color: #909399;
    font-size: 13px;
    text-align: center;
}

@media (max-width: 760px) {
    .td-two-col {
        grid-template-columns: 1fr;
    }
    .td-tl-item {
        grid-template-columns: 24px 1fr;
    }
    .td-tl-body {
        grid-column: 2;
    }
    .kv-label {
        width: 100px;
    }
}
</style>

<style>
.ticket-detail-dialog {
    max-width: 96vw;
    border-radius: 12px;
}
.ticket-detail-dialog .el-dialog__header {
    padding: 22px 24px 8px;
}
.ticket-detail-dialog .el-dialog__headerbtn {
    top: 24px;
    right: 22px;
    font-size: 20px;
}
.ticket-detail-dialog .el-dialog__body {
    padding: 12px 24px 8px;
}
.ticket-detail-dialog .el-dialog__footer {
    padding: 12px 24px 20px;
}
</style>
