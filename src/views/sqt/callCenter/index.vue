<template>
    <!-- SQT → Call Center (user ask 2026-10-13): every new case gets a phone
         call explaining the repair process. The queue of cases still to
         call (longest waiting first), the customer's details to hand, mark
         as contacted, and notes. The SQT Call Center role sees only this. -->
    <div class="cc-page app-container">
        <div class="cc-bar">
            <div class="cc-head">
                <div class="cc-title">{{ $tt('Call Center') }}</div>
                <div class="cc-sub">{{ $tp('Phone every new case to explain the repair process, then mark the customer as contacted') }}</div>
            </div>
            <span class="cc-spacer" />
            <el-radio-group v-model="tab" size="small" @change="page = 1; load()">
                <el-radio-button label="todo">{{ $tp('To call') }} <b class="cc-n">{{ counts.todo }}</b></el-radio-button>
                <el-radio-button label="contacted">{{ $tp('Contacted') }} <b class="cc-n">{{ counts.contacted }}</b></el-radio-button>
                <el-radio-button label="all">{{ $tp('All cases') }}</el-radio-button>
            </el-radio-group>
            <el-input v-model="q" size="small" clearable class="cc-search" prefix-icon="el-icon-search"
                :placeholder="$tp('Name, phone, email, case or IMEI')" @input="onSearch" />
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load" />
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini" class="cc-table"
            :empty-text="tab === 'todo' && !q ? $tp('No cases to call') : $tp('Nothing matches')" @row-click="open">
            <el-table-column :label="$tp('Case')" width="150">
                <template slot-scope="s">
                    <b>{{ s.row.caseId || s.row.serviceRequestId || '—' }}</b>
                    <div v-if="s.row.caseId && s.row.serviceRequestId" class="cc-dim">{{ s.row.serviceRequestId }}</div>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Created')" width="125">
                <template slot-scope="s">{{ fmtDate(s.row.createdAt) }}<div class="cc-dim">{{ ago(s.row.createdAt) }}</div></template>
            </el-table-column>
            <el-table-column :label="$tp('Customer')" min-width="210">
                <template slot-scope="s">
                    <div><b>{{ custName(s.row) }}</b></div>
                    <div v-if="s.row.customer && s.row.customer.phone">
                        <a :href="'tel:' + s.row.customer.phone" class="cc-tel" @click.stop><i class="el-icon-phone" /> {{ s.row.customer.phone }}</a>
                    </div>
                    <div v-if="s.row.customer && s.row.customer.email" class="cc-dim">{{ s.row.customer.email }}</div>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Device')" min-width="200">
                <template slot-scope="s">
                    <div>{{ deviceName(s.row) }}</div>
                    <div v-if="s.row.device && s.row.device.imei" class="cc-dim">IMEI {{ s.row.device.imei }}</div>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Shop')" min-width="150" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.shopName || '—' }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Status')" width="160">
                <template slot-scope="s"><el-tag size="mini" :type="statusType(s.row.status)" effect="plain">{{ statusLabel(s.row.status) }}</el-tag></template>
            </el-table-column>
            <el-table-column :label="$tp('Call')" width="170">
                <template slot-scope="s">
                    <template v-if="isContacted(s.row)">
                        <el-tag size="mini" type="success">{{ $tp('Contacted') }}</el-tag>
                        <div class="cc-dim">{{ fmtDate(s.row.callCenter.at) }}<template v-if="s.row.callCenter.by"> · {{ s.row.callCenter.by }}</template></div>
                    </template>
                    <template v-else-if="isNoCall(s.row)">
                        <el-tag size="mini" type="info">{{ $tp('No call needed') }}</el-tag>
                        <div class="cc-dim">{{ $tp('Old case') }}</div>
                    </template>
                    <template v-else>
                        <el-tag size="mini" type="warning">{{ $tp('Not contacted') }}</el-tag>
                        <div v-if="callNotes(s.row).length" class="cc-dim">{{ $tp('{n} notes', { n: callNotes(s.row).length }) }}</div>
                    </template>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Actions')" width="275" align="center">
                <template slot-scope="s">
                    <el-button type="text" size="mini" icon="el-icon-view" @click.stop="open(s.row)">{{ $tp('View') }}</el-button>
                    <el-button v-if="canContact && !isContacted(s.row)" type="text" size="mini" icon="el-icon-check" @click.stop="openContact(s.row)">{{ $tp('Mark contacted') }}</el-button>
                    <el-button v-if="canContact" type="text" size="mini" icon="el-icon-edit-outline" @click.stop="openNote(s.row)">{{ $tp('Add note') }}</el-button>
                </template>
            </el-table-column>
        </el-table>
        <el-pagination v-if="total > pageSize" background small class="cc-pager" layout="total, prev, pager, next"
            :total="total" :page-size="pageSize" :current-page="page" @current-change="p => { page = p; load() }" />

        <!-- one case in full -->
        <el-drawer :visible.sync="drawerVisible" :size="narrow ? '100%' : '560px'" :with-header="false" custom-class="cc-drawer">
            <div v-if="detail" v-loading="detailLoading" class="cc-detail">
                <div class="cc-d-head">
                    <div>
                        <div class="cc-d-case">{{ detail.caseId || detail.serviceRequestId || '—' }}</div>
                        <div class="cc-dim">{{ $tp('Created') }} {{ fmtDate(detail.createdAt) }} · {{ ago(detail.createdAt) }}<template v-if="detail.shopName"> · {{ detail.shopName }}</template></div>
                    </div>
                    <el-tag size="small" :type="statusType(detail.status)" effect="plain">{{ statusLabel(detail.status) }}</el-tag>
                    <el-button type="text" icon="el-icon-close" class="cc-d-close" @click="drawerVisible = false" />
                </div>

                <div class="cc-sec">
                    <div class="cc-sec-t"><i class="el-icon-user" /> {{ $tp('Customer details') }}</div>
                    <div class="cc-kv"><span>{{ $tp('Customer') }}</span><b>{{ custName(detail) }}</b></div>
                    <div class="cc-kv"><span>{{ $tp('Phone') }}</span><a v-if="detail.customer && detail.customer.phone" :href="'tel:' + detail.customer.phone" class="cc-tel cc-tel-big"><i class="el-icon-phone" /> {{ detail.customer.phone }}</a><em v-else>—</em></div>
                    <div class="cc-kv"><span>{{ $tp('Email') }}</span><a v-if="detail.customer && detail.customer.email" :href="'mailto:' + detail.customer.email">{{ detail.customer.email }}</a><em v-else>—</em></div>
                    <div class="cc-kv"><span>{{ $tp('Address') }}</span><span>{{ (detail.customer && detail.customer.address) || '—' }}</span></div>
                </div>

                <div class="cc-sec">
                    <div class="cc-sec-t"><i class="el-icon-mobile-phone" /> {{ $tp('Device') }}</div>
                    <div class="cc-kv"><span>{{ $tp('Device') }}</span><b>{{ deviceName(detail) }}</b></div>
                    <div class="cc-kv"><span>{{ $tp('IMEI') }}</span><span>{{ (detail.device && detail.device.imei) || '—' }}</span></div>
                    <div class="cc-kv"><span>{{ $tp('Fault') }}</span><span>{{ detail.describedFault || '—' }}</span></div>
                    <div class="cc-kv"><span>{{ $tp('Shop') }}</span><span>{{ detail.shopName || '—' }}</span></div>
                    <div class="cc-kv"><span>{{ $tp('Retailer') }}</span><span>{{ detail.retailer || '—' }}</span></div>
                </div>

                <div class="cc-sec cc-sec-call">
                    <div class="cc-sec-t"><i class="el-icon-phone-outline" /> {{ $tp('Call') }}</div>
                    <div v-if="isContacted(detail)" class="cc-call-state ok">
                        <i class="el-icon-success" /> {{ $tp('Contacted') }} · {{ fmtDate(detail.callCenter.at) }}<template v-if="detail.callCenter.by"> · {{ $tp('Contacted by {by}', { by: detail.callCenter.by }) }}</template>
                        <div v-if="detail.callCenter.note" class="cc-call-note">{{ detail.callCenter.note }}</div>
                    </div>
                    <div v-else-if="isNoCall(detail)" class="cc-call-state off">
                        <i class="el-icon-remove-outline" /> {{ $tp('No call needed') }} · {{ $tp('Old case') }}<template v-if="detail.callCenter.by && detail.callCenter.by !== 'system'"> · {{ detail.callCenter.by }}</template>
                        <div v-if="detail.callCenter.note" class="cc-call-note">{{ detail.callCenter.note }}</div>
                    </div>
                    <div v-else class="cc-call-state"><i class="el-icon-warning-outline" /> {{ $tp('Not contacted') }}</div>
                    <div v-if="canContact" class="cc-call-actions">
                        <el-button v-if="!isContacted(detail)" size="small" type="primary" icon="el-icon-check" @click="openContact(detail)">{{ $tp('Mark contacted') }}</el-button>
                        <el-button v-if="isContacted(detail)" size="small" icon="el-icon-refresh-left" @click="undo(detail)">{{ $tp('Undo contacted') }}</el-button>
                        <el-button v-else-if="isNoCall(detail)" size="small" icon="el-icon-phone-outline" @click="undo(detail)">{{ $tp('Put on the call list') }}</el-button>
                        <el-button v-else size="small" icon="el-icon-remove-outline" @click="noCall(detail)">{{ $tp('No call needed') }}</el-button>
                        <el-button size="small" icon="el-icon-edit-outline" @click="openNote(detail)">{{ $tp('Add note') }}</el-button>
                    </div>
                </div>

                <div class="cc-sec">
                    <div class="cc-sec-t"><i class="el-icon-chat-line-square" /> {{ $tp('Notes') }}</div>
                    <div v-if="!(detail.notes || []).length" class="cc-dim">{{ $tp('No notes yet') }}</div>
                    <div v-for="(n, i) in notesNewestFirst(detail)" :key="i" :class="['cc-note', { 'is-cc': n.source === 'call-center' }]">
                        <div class="cc-note-text">{{ n.text }}</div>
                        <div class="cc-dim">{{ fmtDate(n.at) }}<template v-if="n.addedBy"> · {{ n.addedBy }}</template></div>
                    </div>
                </div>

                <div class="cc-sec">
                    <div class="cc-sec-t"><i class="el-icon-time" /> {{ $tp('Case history') }}</div>
                    <div v-for="(h, i) in historyNewestFirst(detail)" :key="i" class="cc-hist">
                        <el-tag size="mini" :type="statusType(h.status)" effect="plain">{{ statusLabel(h.status) }}</el-tag>
                        <span class="cc-dim">{{ fmtDate(h.at) }}<template v-if="h.updatedBy"> · {{ h.updatedBy }}</template></span>
                        <div v-if="h.note" class="cc-hist-note">{{ h.note }}</div>
                    </div>
                </div>
            </div>
        </el-drawer>

        <!-- mark as contacted -->
        <el-dialog :title="$tp('Mark contacted')" :visible.sync="contactVisible" width="460px" append-to-body :close-on-click-modal="false">
            <div v-if="target" class="cc-dlg-who"><b>{{ custName(target) }}</b> · {{ target.caseId || target.serviceRequestId }}</div>
            <div class="cc-dim cc-dlg-hint">{{ $tp('The customer was called and knows the repair process') }}</div>
            <el-input v-model="contactNote" type="textarea" :rows="3" maxlength="500" show-word-limit :placeholder="$tp('Call center note (optional)')" />
            <span slot="footer">
                <el-button size="small" @click="contactVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button size="small" type="primary" icon="el-icon-check" :loading="saving" @click="doContact">{{ $tp('Mark contacted') }}</el-button>
            </span>
        </el-dialog>

        <!-- a note -->
        <el-dialog :title="$tp('Add note')" :visible.sync="noteVisible" width="460px" append-to-body :close-on-click-modal="false">
            <div v-if="target" class="cc-dlg-who"><b>{{ custName(target) }}</b> · {{ target.caseId || target.serviceRequestId }}</div>
            <el-input ref="noteInput" v-model="noteText" type="textarea" :rows="4" maxlength="1000" show-word-limit :placeholder="$tp('Write what was said or agreed')" />
            <span slot="footer">
                <el-button size="small" @click="noteVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button size="small" type="primary" :loading="saving" @click="doNote">{{ $tp('Save') }}</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import { listCallCenterCases, getCallCenterCase, markCaseContacted, unmarkCaseContacted, markCaseNoCall, addCallCenterNote } from '@/api/sqtCallCenter'
import { hasPermission } from '@/utils/permission'

// the Cases page's status wording, so both pages say the same thing
const STATUS_META = {
    'require-extra-parts': { label: 'Require Extra Parts', tag: 'warning' },
    'on-hold': { label: 'On Hold', tag: 'warning' },
    pending: { label: 'Pending', tag: 'info' },
    'waiting-for-parts': { label: 'Waiting for Parts', tag: 'warning' },
    'parts-arrived': { label: 'Parts Arrived', tag: 'warning' },
    'waiting-for-drop-off': { label: 'Waiting for Drop-off', tag: 'warning' },
    repairing: { label: 'Repairing', tag: '' },
    repaired: { label: 'Repaired', tag: 'success' },
    'repaired-and-collected': { label: 'Repaired & Collected', tag: 'success' },
    'waiting-solvup': { label: 'Waiting Solvup', tag: 'warning' },
    'issue-with-solvup': { label: 'Issue with Solvup', tag: 'danger' },
    unrepairable: { label: 'Unrepairable', tag: 'danger' },
    ber: { label: 'BER', tag: 'danger' },
    completed: { label: 'Completed', tag: 'success' },
    cancelled: { label: 'Cancelled', tag: 'info' },
    // what a non-admin sees in place of the internal Solvup statuses
    'in-progress': { label: 'In progress', tag: '' }
}
// internal — the server already strips these for non-admin users
const SOLVUP = ['waiting-solvup', 'issue-with-solvup']

export default {
    name: 'SqtCallCenter',
    data() {
        return {
            loading: false, detailLoading: false, saving: false,
            tab: 'todo', q: '', timer: null,
            rows: [], total: 0, page: 1, pageSize: 20,
            counts: { todo: 0, contacted: 0 },
            drawerVisible: false, detail: null,
            contactVisible: false, contactNote: '',
            noteVisible: false, noteText: '',
            target: null,
            narrow: false
        }
    },
    computed: {
        canContact() { return hasPermission(this.$store.getters.permissions, 'sqt:callcenter:contact') },
        // admin-side SQT users see the Solvup hand-off; the call center does not
        canSeeSolvup() { return hasPermission(this.$store.getters.permissions, 'sqt:case:changeStatus') }
    },
    created() { this.load() },
    mounted() {
        this.onResize()
        window.addEventListener('resize', this.onResize)
    },
    beforeDestroy() {
        window.removeEventListener('resize', this.onResize)
        clearTimeout(this.timer)
    },
    methods: {
        onResize() { this.narrow = window.innerWidth < 700 },
        async load() {
            this.loading = true
            try {
                const r = await listCallCenterCases({ tab: this.tab, q: this.q.trim() || undefined, page: this.page, pageSize: this.pageSize })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.rows || []
                this.total = r.total || 0
                if (r.counts) this.counts = r.counts
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load the cases')))
            } finally { this.loading = false }
        },
        onSearch() { clearTimeout(this.timer); this.timer = setTimeout(() => { this.page = 1; this.load() }, 350) },
        // ── reading a case ──
        custName(c) {
            const u = (c && c.customer) || {}
            return [u.firstName, u.lastName].filter(Boolean).join(' ') || '—'
        },
        deviceName(c) {
            const d = (c && c.device) || {}
            return [d.brand, d.modelName].filter(Boolean).join(' ') || d.description || '—'
        },
        isContacted(c) { return !!(c && c.callCenter && c.callCenter.contacted) },
        // an old case (past pending when the call center started), or one
        // marked as needing no call
        isNoCall(c) { return !!(c && c.callCenter && c.callCenter.noCall) && !this.isContacted(c) },
        callNotes(c) { return ((c && c.notes) || []).filter(n => n.source === 'call-center') },
        notesNewestFirst(c) { return ((c && c.notes) || []).slice().reverse() },
        historyNewestFirst(c) { return ((c && c.statusHistory) || []).filter(h => this.canSeeSolvup || !SOLVUP.includes(h.status)).slice().reverse() },
        statusLabel(s) { const k = !this.canSeeSolvup && SOLVUP.includes(s) ? 'in-progress' : s; return (STATUS_META[k] && STATUS_META[k].label) || k || '—' },
        statusType(s) { return (STATUS_META[s] && STATUS_META[s].tag) || 'info' },
        fmtDate(d) {
            if (!d) return '—'
            const x = new Date(d)
            return isNaN(x) ? '—' : x.toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Australia/Melbourne' })
        },
        ago(d) {
            if (!d) return ''
            const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
            if (days <= 0) return this.$tp('today')
            if (days === 1) return this.$tp('yesterday')
            return this.$tp('{n} days', { n: days })
        },
        // ── the drawer ──
        async open(row) {
            this.detail = row
            this.drawerVisible = true
            this.detailLoading = true
            try {
                const r = await getCallCenterCase(row._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.detail = r.data
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load the case')))
            } finally { this.detailLoading = false }
        },
        // the answer carries the updated case: refresh the drawer, the row
        // and (the counts / the To call tab) the list
        applyUpdated(c) {
            if (this.detail && this.detail._id === c._id) this.detail = c
            const i = this.rows.findIndex(r => r._id === c._id)
            if (i >= 0) this.$set(this.rows, i, { ...this.rows[i], ...c })
            this.load()
        },
        // ── contacted ──
        openContact(row) { this.target = row; this.contactNote = ''; this.contactVisible = true },
        async doContact() {
            if (!this.target) return
            this.saving = true
            try {
                const r = await markCaseContacted(this.target._id, this.contactNote.trim())
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('Marked as contacted'))
                this.contactVisible = false
                this.applyUpdated(r.data)
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save')))
            } finally { this.saving = false }
        },
        async undo(c) {
            this.saving = true
            try {
                const r = await unmarkCaseContacted(c._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('Back on the call list'))
                this.applyUpdated(r.data)
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save')))
            } finally { this.saving = false }
        },
        // no call needed — a reason is welcome but not required
        noCall(c) {
            this.$prompt(this.$tp('Why no call is needed (optional)'), this.$tp('No call needed'), {
                confirmButtonText: this.$tp('Save'), cancelButtonText: this.$tp('Cancel'), inputType: 'textarea', inputPlaceholder: this.$tp('Write what was said or agreed')
            }).then(async ({ value }) => {
                this.saving = true
                try {
                    const r = await markCaseNoCall(c._id, (value || '').trim())
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    this.$message.success(this.$tp('Marked as no call needed'))
                    this.applyUpdated(r.data)
                } catch (e) {
                    this.$message.error(this.msg(e, this.$tp('Failed to save')))
                } finally { this.saving = false }
            }).catch(() => {})
        },
        // ── a note ──
        openNote(row) {
            this.target = row; this.noteText = ''; this.noteVisible = true
            this.$nextTick(() => this.$refs.noteInput && this.$refs.noteInput.focus())
        },
        async doNote() {
            if (!this.target) return
            const text = this.noteText.trim()
            if (!text) { this.$message.warning(this.$tp('Note text is required')); return }
            this.saving = true
            try {
                const r = await addCallCenterNote(this.target._id, text)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('Note added'))
                this.noteVisible = false
                this.applyUpdated(r.data)
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save')))
            } finally { this.saving = false }
        },
        msg(e, fallback) { return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback }
    }
}
</script>

<style lang="scss" scoped>
.cc-page { padding: 14px 16px; }
.cc-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.cc-head { min-width: 0; }
.cc-title { font-size: 17px; font-weight: 600; color: #303133; }
.cc-sub { font-size: 13px; color: #909399; margin-top: 3px; }
.cc-spacer { flex: 1; }
.cc-n { margin-left: 4px; }
.cc-search { width: 260px; }
.cc-dim { font-size: 12px; color: #909399; }
.cc-tel { color: #409eff; text-decoration: none; font-variant-numeric: tabular-nums; }
.cc-tel-big { font-size: 16px; font-weight: 600; }
.cc-table ::v-deep .el-table__row { cursor: pointer; }
.cc-pager { margin-top: 12px; text-align: right; }
/* the drawer */
.cc-detail { padding: 18px 20px 30px; }
.cc-d-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px; }
.cc-d-head > div:first-child { flex: 1; min-width: 0; }
.cc-d-case { font-size: 18px; font-weight: 700; color: #303133; }
.cc-d-close { padding: 0; font-size: 18px; color: #909399; }
.cc-sec { padding: 12px 14px; border: 1px solid #ebeef5; border-radius: 6px; margin-bottom: 12px; background: #fff; }
.cc-sec-t { font-size: 13px; font-weight: 600; color: #303133; margin-bottom: 8px; i { color: #409eff; margin-right: 4px; } }
.cc-kv { display: flex; gap: 10px; font-size: 13px; line-height: 1.6; margin-bottom: 2px;
    > span:first-child { flex: 0 0 76px; color: #909399; } em { color: #c0c4cc; font-style: normal; } }
.cc-sec-call { background: #fdf6ec; border-color: #f5dab1; }
.cc-call-state { font-size: 13px; color: #e6a23c; i { margin-right: 4px; } &.ok { color: #67c23a; } &.off { color: #909399; } }
.cc-call-note { margin-top: 4px; color: #606266; }
.cc-call-actions { margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; }
.cc-note { padding: 8px 10px; border-radius: 4px; background: #f5f7fa; margin-bottom: 6px; font-size: 13px; color: #303133;
    &.is-cc { background: #ecf5ff; } }
.cc-note-text { white-space: pre-wrap; }
.cc-hist { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; font-size: 12px; }
.cc-hist-note { flex: 1 1 100%; color: #606266; padding-left: 4px; }
.cc-dlg-who { font-size: 13px; color: #303133; margin-bottom: 6px; }
.cc-dlg-hint { margin-bottom: 8px; }
@media (max-width: 760px) {
    .cc-search { width: 100%; }
    .cc-detail { padding: 14px 12px 30px; }
}
</style>
