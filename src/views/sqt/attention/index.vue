<template>
    <!-- SQT → Need Attention (user ask 2026-10-28): SquareTrade follow-up
         emails the user's automation picked up from the mailbox. One row per
         case (newest first); the email is read from the mailbox when opened,
         and the reply goes out from the same mailbox. Unmatched = emails no
         case could be found for — link them, or dismiss. -->
    <div class="na-page app-container">
        <div class="na-bar">
            <div class="na-head">
                <div class="na-title">{{ $tt('Need Attention') }}</div>
                <div class="na-sub">{{ $tp('SquareTrade follow-up emails picked up from the mailbox — read and reply here') }}</div>
            </div>
            <span class="na-spacer" />
            <el-radio-group v-model="tab" size="small" @change="switchTab">
                <el-radio-button label="open">{{ $tp('Open') }} <b class="na-n">{{ counts.open }}</b></el-radio-button>
                <el-radio-button label="replied">{{ $tp('Replied') }}</el-radio-button>
                <el-radio-button label="handled">{{ $tp('Handled') }}</el-radio-button>
                <el-radio-button label="unmatched">{{ $tp('Unmatched') }} <b v-if="counts.unmatched" class="na-n na-n-warn">{{ counts.unmatched }}</b></el-radio-button>
            </el-radio-group>
            <el-input v-model="q" size="small" clearable class="na-search" prefix-icon="el-icon-search"
                :placeholder="$tp('Case, SR, customer, shop or subject')" @input="onSearch" />
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load" />
        </div>

        <div class="na-body">
            <!-- the list -->
            <div v-loading="loading" class="na-list">
                <div v-if="!loading && !rows.length" class="na-empty">
                    <i class="el-icon-circle-check" />
                    <div>{{ tab === 'open' && !q ? $tp('Nothing needs attention') : $tp('Nothing matches') }}</div>
                </div>
                <template v-if="tab !== 'unmatched'">
                    <div v-for="r in rows" :key="r.sqtCaseId" :class="['na-row', { active: selCase === String(r.sqtCaseId) }]" @click="pickCase(r)">
                        <div class="na-row-1">
                            <b>{{ r.case.caseId || r.case.serviceRequestId }}</b>
                            <span class="na-cust">{{ r.case.customerName }}</span>
                            <span class="na-spacer" />
                            <span :class="['na-age', ageClass(r)]">{{ ago(tab === 'open' ? (r.waitingSince || r.latest.date) : (r.latest.handledAt || r.latest.date)) }}</span>
                        </div>
                        <div class="na-row-2">
                            <span class="na-subj">{{ r.latest.subject || $tp('(no subject)') }}</span>
                            <el-badge v-if="tab === 'open' && r.openCount > 1" :value="r.openCount" class="na-badge" />
                        </div>
                        <div class="na-snip">{{ r.latest.snippet }}</div>
                        <div class="na-row-3">
                            <el-tag size="mini" :type="statusType(r.case.status)" effect="plain">{{ statusLabel(r.case.status) }}</el-tag>
                            <span class="na-dim">{{ r.case.shopName }}</span>
                            <span v-if="tab !== 'open' && r.latest.handledBy" class="na-dim">· {{ r.latest.handledBy }}</span>
                        </div>
                    </div>
                </template>
                <template v-else>
                    <div v-for="r in rows" :key="r.email._id" :class="['na-row', { active: selEmail && selEmail._id === r.email._id }]" @click="pickEmail(r.email)">
                        <div class="na-row-1">
                            <b>{{ (r.email.from && (r.email.from.name || r.email.from.address)) || '—' }}</b>
                            <span class="na-spacer" />
                            <span class="na-age">{{ ago(r.email.date) }}</span>
                        </div>
                        <div class="na-row-2"><span class="na-subj">{{ r.email.subject || $tp('(no subject)') }}</span></div>
                        <div class="na-snip">{{ r.email.snippet }}</div>
                    </div>
                </template>
                <el-pagination v-if="total > pageSize" small layout="prev, pager, next" class="na-pager"
                    :total="total" :page-size="pageSize" :current-page="page" @current-change="p => { page = p; load() }" />
            </div>

            <!-- the case / email (beside the list; a drawer on small screens) -->
            <div v-if="!narrow" class="na-pane">
                <email-thread v-if="selCase" :key="selCase" :sqt-case-id="selCase" @changed="load" />
                <unmatched-email v-else-if="selEmail" :key="selEmail._id" :email="selEmail" @changed="onUnmatchedChanged" />
                <div v-else class="na-pane-empty"><i class="el-icon-message" /><div>{{ $tp('Pick a case to read its emails') }}</div></div>
            </div>
        </div>

        <el-drawer v-if="narrow" :visible.sync="drawer" size="100%" :with-header="false" @closed="selCase = null; selEmail = null">
            <div class="na-drawer">
                <el-button type="text" icon="el-icon-arrow-left" class="na-back" @click="drawer = false">{{ $tp('Back') }}</el-button>
                <email-thread v-if="selCase" :key="selCase" :sqt-case-id="selCase" @changed="load" />
                <unmatched-email v-else-if="selEmail" :key="selEmail._id" :email="selEmail" @changed="onUnmatchedChanged" />
            </div>
        </el-drawer>
    </div>
</template>

<script>
import { listAttention } from '@/api/sqtCaseEmails'
import EmailThread from './components/EmailThread'
import UnmatchedEmail from './components/UnmatchedEmail'

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
    cancelled: { label: 'Cancelled', tag: 'info' }
}
const HOUR = 3600 * 1000

export default {
    name: 'SqtAttention',
    components: { EmailThread, UnmatchedEmail },
    data() {
        return {
            loading: false, tab: 'open', q: '', timer: null,
            rows: [], total: 0, page: 1, pageSize: 30,
            counts: { open: 0, unmatched: 0 },
            selCase: null, selEmail: null, drawer: false,
            narrow: false, shown: false
        }
    },
    watch: {
        // /sqt/attention?case=<id> — from the Cases page's envelope badge
        '$route.query.case'(id) { if (id) this.openCaseId(String(id)) }
    },
    created() {
        this.load()
        const id = this.$route.query.case
        if (id) this.openCaseId(String(id))
    },
    activated() {
        // created() already loaded on the first visit
        if (this.shown) this.load()
        this.shown = true
    },
    mounted() {
        this.onResize()
        window.addEventListener('resize', this.onResize)
    },
    beforeDestroy() {
        window.removeEventListener('resize', this.onResize)
        clearTimeout(this.timer)
    },
    methods: {
        onResize() { this.narrow = window.innerWidth < 960 },
        async load() {
            this.loading = true
            try {
                const r = await listAttention({ tab: this.tab, q: this.q.trim() || undefined, page: this.page, pageSize: this.pageSize })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.data.rows || []
                this.total = r.data.total || 0
                if (r.data.counts) this.counts = r.data.counts
                // wide screens: open the first row when nothing is picked
                if (!this.narrow && !this.selCase && !this.selEmail && this.rows.length) {
                    if (this.tab === 'unmatched') this.selEmail = this.rows[0].email
                    else this.selCase = String(this.rows[0].sqtCaseId)
                }
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load the follow-up emails')))
            } finally { this.loading = false }
        },
        onSearch() { clearTimeout(this.timer); this.timer = setTimeout(() => { this.page = 1; this.load() }, 350) },
        // Unmatched rows are emails, the other tabs' are cases — never
        // render one tab's rows with the other's layout.
        switchTab() {
            this.rows = []
            this.total = 0
            this.page = 1
            this.selCase = null
            this.selEmail = null
            this.load()
        },
        pickCase(r) { this.selEmail = null; this.selCase = String(r.sqtCaseId); this.drawer = this.narrow },
        pickEmail(e) { this.selCase = null; this.selEmail = e; this.drawer = this.narrow },
        openCaseId(id) { this.selEmail = null; this.selCase = id; this.drawer = this.narrow },
        onUnmatchedChanged(linked) {
            // linked to a case → show that case's thread
            if (linked && linked.sqtCaseId) { this.selEmail = null; this.selCase = String(linked.sqtCaseId) } else { this.selEmail = null }
            this.load()
        },
        statusLabel(s) { return (STATUS_META[s] && STATUS_META[s].label) || s || '—' },
        statusType(s) { return (STATUS_META[s] && STATUS_META[s].tag) || 'info' },
        // how long it has waited — amber after a day, red after two
        ageClass(r) {
            if (this.tab !== 'open') return ''
            const t = new Date(r.waitingSince || r.latest.date).getTime()
            const h = (Date.now() - t) / HOUR
            return h >= 48 ? 'late' : h >= 24 ? 'warn' : ''
        },
        ago(d) {
            if (!d) return ''
            const ms = Date.now() - new Date(d).getTime()
            if (ms < HOUR) return Math.max(1, Math.round(ms / 60000)) + 'm'
            if (ms < 24 * HOUR) return Math.round(ms / HOUR) + 'h'
            return Math.floor(ms / (24 * HOUR)) + 'd'
        },
        msg(e, fallback) { return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback }
    }
}
</script>

<style lang="scss" scoped>
.na-page { padding: 14px 16px; }
.na-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.na-head { min-width: 0; }
.na-title { font-size: 17px; font-weight: 600; color: #303133; }
.na-sub { font-size: 13px; color: #909399; margin-top: 3px; }
.na-spacer { flex: 1; }
.na-n { margin-left: 4px; }
.na-n-warn { color: #e6a23c; }
.na-search { width: 260px; }
.na-dim { font-size: 12px; color: #909399; }
.na-body { display: flex; gap: 12px; align-items: flex-start; }
.na-list { flex: 0 0 380px; min-height: 200px; max-height: calc(100vh - 170px); overflow-y: auto; border: 1px solid #ebeef5; border-radius: 6px; background: #fff; }
.na-empty { padding: 40px 10px; text-align: center; color: #909399; font-size: 13px; i { font-size: 28px; color: #67c23a; margin-bottom: 6px; } }
.na-row { padding: 10px 12px; border-bottom: 1px solid #f2f3f5; cursor: pointer;
    &:hover { background: #f5f7fa; }
    &.active { background: #ecf5ff; box-shadow: inset 3px 0 0 #409eff; } }
.na-row-1 { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #303133; }
.na-cust { color: #606266; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.na-age { font-size: 12px; color: #909399; font-variant-numeric: tabular-nums;
    &.warn { color: #e6a23c; font-weight: 600; }
    &.late { color: #f56c6c; font-weight: 600; } }
.na-row-2 { display: flex; align-items: center; gap: 6px; margin-top: 3px; }
.na-subj { flex: 1; min-width: 0; font-size: 13px; color: #303133; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.na-badge ::v-deep .el-badge__content { position: static; transform: none; }
.na-snip { margin-top: 2px; font-size: 12px; color: #909399; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.na-row-3 { display: flex; align-items: center; gap: 6px; margin-top: 5px; overflow: hidden; white-space: nowrap; }
.na-pager { padding: 8px; text-align: center; }
.na-pane { flex: 1; min-width: 0; max-height: calc(100vh - 170px); overflow-y: auto; padding: 12px 14px; border: 1px solid #ebeef5; border-radius: 6px; background: #fff; }
.na-pane-empty { padding: 60px 10px; text-align: center; color: #c0c4cc; font-size: 13px; i { font-size: 32px; margin-bottom: 8px; } }
.na-drawer { padding: 8px 12px 30px; }
.na-back { padding: 4px 0 10px; }
@media (max-width: 960px) {
    .na-list { flex: 1 1 100%; max-height: none; }
    .na-search { width: 100%; }
}
</style>
