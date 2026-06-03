<template>
    <el-dialog
        :title="ticket ? `Ticket ${ticket.summary.order_id}` : 'Ticket detail'"
        :visible.sync="visible"
        width="900px"
        append-to-body
        :close-on-click-modal="false"
        custom-class="ticket-detail-dialog"
        @close="onClose"
    >
        <div v-loading="loading" class="dialog-body">
            <div v-if="error" class="error-banner">
                <i class="el-icon-warning-outline" />
                {{ error }}
            </div>

            <template v-if="ticket && !error">
                <div class="two-col">
                    <section class="col">
                        <div class="col-title">Customer</div>
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
                    <section class="col">
                        <div class="col-title">Ticket</div>
                        <div class="kv">
                            <span class="kv-label">Number</span>
                            <span class="kv-value">{{ ticket.summary.order_id }}</span>
                        </div>
                        <div class="kv">
                            <span class="kv-label">Created</span>
                            <span class="kv-value">{{ formatDate(ticket.summary.created_date * 1000) }}</span>
                        </div>
                    </section>
                </div>

                <div class="section-title">Devices</div>
                <el-table
                    :data="ticket.devices || []"
                    size="small"
                    stripe
                    class="devices-table"
                >
                    <el-table-column label="Device" min-width="160">
                        <template slot-scope="scope">{{ scope.row.device.name }}</template>
                    </el-table-column>
                    <el-table-column label="Problem" min-width="200">
                        <template slot-scope="scope">
                            <div
                                v-for="(p, i) in scope.row.repairProdItems"
                                :key="p.id || i"
                                class="problem-line"
                            >{{ p.name }}</div>
                        </template>
                    </el-table-column>
                    <el-table-column label="Assigned" min-width="120">
                        <template slot-scope="scope">
                            <span :class="{ 'unassigned': !scope.row.assigned_to.fullname }">
                                {{ scope.row.assigned_to.fullname || 'Unassigned' }}
                            </span>
                        </template>
                    </el-table-column>
                    <el-table-column label="Due" min-width="170">
                        <template slot-scope="scope">{{ formatDate(scope.row.due_on * 1000) }}</template>
                    </el-table-column>
                    <el-table-column label="Status" min-width="130">
                        <template slot-scope="scope">
                            <el-tag size="mini" effect="plain">{{ scope.row.status.name }}</el-tag>
                        </template>
                    </el-table-column>
                    <el-table-column label="Action" align="center" width="120">
                        <template slot-scope="scope">
                            <el-button
                                size="mini"
                                type="text"
                                icon="el-icon-document"
                                @click="onChecklist(scope.row)"
                            >Checklist</el-button>
                        </template>
                    </el-table-column>
                </el-table>

                <div class="section-title">Message Record</div>
                <ul class="message-list">
                    <li
                        v-for="(record, i) in history"
                        :key="i"
                        class="message-item"
                    >
                        <div class="message-date">{{ formatDate(record.creationdate * 1000) }}</div>
                        <!--
                            History descriptions can be HTML (auto-generated
                            note links, formatting). Original page renders
                            with v-html — keep the parity but sandbox by
                            stripping <script>/<iframe> first.
                        -->
                        <div class="message-body" v-html="sanitizeHtml(record.description)" />
                    </li>
                    <li v-if="history.length === 0" class="message-empty">
                        No history entries.
                    </li>
                </ul>
            </template>
        </div>

        <div slot="footer">
            <el-button @click="visible = false">Close</el-button>
        </div>
    </el-dialog>
</template>

<script>
import { getRepairTicketDetail } from '@/api/repair/tickets'

export default {
    name: 'TicketDetail',
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
.two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 18px;
}
.col-title {
    font-size: 16px;
    font-weight: 600;
    color: #111827;
    margin-bottom: 8px;
}
.kv {
    display: flex;
    gap: 10px;
    font-size: 13px;
    padding: 4px 0;
    line-height: 1.4;
}
.kv-label {
    color: #909399;
    width: 80px;
    flex-shrink: 0;
}
.kv-value {
    color: #303133;
}
.section-title {
    font-size: 15px;
    font-weight: 600;
    color: #111827;
    margin: 18px 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #ebeef5;
}
.devices-table {
    border: 1px solid #ebeef5;
    border-radius: 6px;
}
.problem-line {
    line-height: 1.4;
}
.unassigned {
    color: #c0c4cc;
    font-style: italic;
}
.message-list {
    padding: 0;
    margin: 0;
    list-style: none;
    max-height: 280px;
    overflow-y: auto;
}
.message-item {
    padding: 8px 0;
    border-bottom: 1px solid #f0f2f5;
    font-size: 13px;
    line-height: 1.45;
}
.message-item:last-child {
    border-bottom: none;
}
.message-date {
    color: #909399;
    font-size: 12px;
    margin-bottom: 2px;
}
.message-body {
    color: #303133;
}
.message-empty {
    padding: 20px 0;
    text-align: center;
    color: #909399;
    font-size: 13px;
}
</style>

<style>
.ticket-detail-dialog .el-dialog__body {
    padding: 16px 24px;
}
</style>
