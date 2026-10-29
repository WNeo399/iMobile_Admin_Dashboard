<template>
    <!-- One case's emails (SquareTrade follow-ups + our replies), oldest
         first, and the reply box. Used by SQT → Need Attention and the
         Cases page's Emails tab (compact: no case header). The case's
         original request opens in a popup from the header. -->
    <div v-loading="loading" class="et">
        <div v-if="error" class="et-error"><i class="el-icon-warning-outline" /> {{ error }}</div>
        <template v-else-if="data">
            <div v-if="!compact" class="et-head">
                <div class="et-head-main">
                    <div class="et-case">
                        {{ $tp('Case') }} {{ c.caseId || '—' }}
                        <span class="et-dim">SR {{ c.serviceRequestId || '—' }}</span>
                        <el-tag size="mini" :type="statusType(c.status)" effect="plain">{{ statusLabel(c.status) }}</el-tag>
                    </div>
                    <div class="et-dim">{{ [c.customerName, c.device, c.shopName].filter(Boolean).join(' · ') }}</div>
                </div>
                <div class="et-head-btns">
                    <el-button size="mini" icon="el-icon-document" @click="openCase">{{ $tp('Open case') }}</el-button>
                    <el-button v-if="data.original" size="mini" icon="el-icon-message" @click="originalOpen = true">{{ $tp('Original request') }}</el-button>
                </div>
            </div>

            <div v-if="!emails.length" class="et-empty">{{ $tp('No emails on this case yet') }}</div>
            <div v-for="e in emails" :key="e._id" :class="['et-mail', e.direction, { 'is-open': e.status === 'open' }]">
                <div class="et-mail-head" @click="toggle(e)">
                    <i :class="e.direction === 'outbound' ? 'el-icon-s-promotion' : 'el-icon-message'" class="et-icon" />
                    <b class="et-who">{{ who(e) }}</b>
                    <el-tag v-if="e.direction === 'inbound'" size="mini" :type="mailTagType(e)" effect="light">{{ mailTag(e) }}</el-tag>
                    <i v-if="e.attachmentCount" class="el-icon-paperclip et-dim" />
                    <span class="et-spacer" />
                    <span class="et-dim">{{ fmtDate(e.date) }}</span>
                    <i :class="expanded[e._id] ? 'el-icon-arrow-up' : 'el-icon-arrow-down'" class="et-dim" />
                </div>
                <div class="et-subject">{{ e.subject || $tp('(no subject)') }}</div>
                <div v-if="!expanded[e._id]" class="et-snippet" @click="toggle(e)">{{ e.snippet }}</div>
                <div v-else class="et-mail-body">
                    <div class="et-addr">
                        <span v-if="e.to.length">{{ $tp('To') }}: {{ addrList(e.to) }}</span>
                        <span v-if="e.cc.length"> · {{ $tp('Cc') }}: {{ addrList(e.cc) }}</span>
                    </div>
                    <template v-if="e.direction === 'outbound'">
                        <pre class="et-out-text">{{ e.text }}</pre>
                        <div v-if="e.attachmentNames.length" class="et-dim et-out-atts"><i class="el-icon-paperclip" /> {{ e.attachmentNames.join(', ') }}</div>
                    </template>
                    <email-body v-else :email-id="String(e._id)" />
                    <div v-if="e.direction === 'inbound' && e.status !== 'open'" class="et-done">
                        <i class="el-icon-circle-check" />
                        {{ e.status === 'replied' ? $tp('Replied') : $tp('Handled') }}<template v-if="e.handledBy"> · {{ e.handledBy }}</template> · {{ fmtDate(e.handledAt) }}
                        <template v-if="e.handledNote"> — {{ e.handledNote }}</template>
                        <el-button v-if="canHandle" type="text" size="mini" @click="reopen(e)">{{ $tp('Reopen') }}</el-button>
                    </div>
                </div>
            </div>

            <!-- reply -->
            <div v-if="target && canReply" class="et-compose">
                <div class="et-compose-t"><i class="el-icon-edit" /> {{ $tp('Reply') }}
                    <span class="et-dim">— {{ $tp('to the email of {date}', { date: fmtDate(target.date) }) }}</span>
                </div>
                <!-- Reply all, same subject — folded into one line; Edit opens the fields -->
                <div v-if="!showFields" class="et-summary">
                    <span class="et-sum-k">{{ $tp('Reply all') }}</span>
                    <span class="et-sum-v" :title="recipientsText + '\n' + form.subject">{{ recipientsText || '—' }}</span>
                    <el-button type="text" size="mini" icon="el-icon-edit" @click="showFields = true">{{ $tp('Edit') }}</el-button>
                </div>
                <el-form v-show="showFields" size="small" label-width="72px" class="et-form" @submit.native.prevent>
                    <el-form-item :label="$tp('To')">
                        <el-select v-model="form.to" multiple filterable allow-create default-first-option class="et-addr-input"
                            :placeholder="$tp('Recipient email')">
                            <el-option v-for="a in addrOptions" :key="a" :label="a" :value="a" />
                        </el-select>
                        <el-button v-if="otherRecipients.length" type="text" size="mini" @click="replyAll">{{ $tp('Reply all') }}</el-button>
                    </el-form-item>
                    <el-form-item :label="$tp('Cc')">
                        <el-select v-model="form.cc" multiple filterable allow-create default-first-option class="et-addr-input"
                            :placeholder="$tp('Optional')">
                            <el-option v-for="a in addrOptions" :key="a" :label="a" :value="a" />
                        </el-select>
                    </el-form-item>
                    <el-form-item :label="$tp('Subject')">
                        <el-input v-model="form.subject" maxlength="300" />
                    </el-form-item>
                </el-form>
                <el-input v-model="form.body" type="textarea" :rows="7" maxlength="20000" :placeholder="$tp('Write your reply…')" />
                <div v-if="files.length" class="et-files">
                    <el-tag v-for="(f, i) in files" :key="i" size="small" closable @close="files.splice(i, 1)">
                        <i class="el-icon-paperclip" /> {{ f.name }}
                    </el-tag>
                </div>
                <div class="et-actions">
                    <el-checkbox v-model="form.includeQuote">{{ $tp('Include the original email') }}</el-checkbox>
                    <span class="et-spacer" />
                    <el-button size="small" icon="el-icon-paperclip" @click="$refs.fileInput.click()">{{ $tp('Attach') }}</el-button>
                    <el-button size="small" icon="el-icon-document-add" @click="insertUpdate">{{ $tp('Insert case update') }}</el-button>
                    <el-button v-if="canHandle && openCount" size="small" icon="el-icon-check" @click="markHandled">{{ $tp('Mark handled') }}</el-button>
                    <el-button size="small" type="primary" icon="el-icon-s-promotion" :loading="sending" @click="send">{{ $tp('Send') }}</el-button>
                </div>
                <input ref="fileInput" type="file" multiple style="display:none" @change="onFiles">
            </div>
            <div v-else-if="canHandle && openCount" class="et-actions et-actions-only">
                <span class="et-spacer" />
                <el-button size="small" icon="el-icon-check" @click="markHandled">{{ $tp('Mark handled') }}</el-button>
            </div>

            <!-- the request the case was created from (sqt_cases.source.messageId), read from the mailbox -->
            <el-dialog v-if="data.original" :visible.sync="originalOpen" :title="$tp('Original request')"
                width="760px" top="6vh" append-to-body custom-class="et-orig-dialog">
                <div class="et-orig-head">
                    <div class="et-orig-subject">{{ data.original.subject || $tp('(no subject)') }}</div>
                    <div class="et-dim">{{ data.original.from }} · {{ fmtDate(data.original.date) }}</div>
                </div>
                <email-body v-if="originalOpen" :original-of="sqtCaseId" />
            </el-dialog>
        </template>
    </div>
</template>

<script>
import { getCaseEmails, replyToCaseEmail, markCaseEmailsHandled, reopenEmail } from '@/api/sqtCaseEmails'
import { hasPermission } from '@/utils/permission'
import EmailBody from './EmailBody'

// the Cases page's status wording, so every page says the same thing
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
const MAX_FILE = 15 * 1024 * 1024
const MAX_TOTAL = 20 * 1024 * 1024

export default {
    name: 'EmailThread',
    components: { EmailBody },
    props: {
        sqtCaseId: { type: String, required: true },
        compact: { type: Boolean, default: false }
    },
    data() {
        return {
            loading: false, error: '', data: null,
            expanded: {},
            form: { to: [], cc: [], subject: '', body: '', includeQuote: true },
            showFields: false,
            originalOpen: false,
            files: [], sending: false
        }
    },
    computed: {
        c() { return (this.data && this.data.case) || {} },
        emails() { return (this.data && this.data.emails) || [] },
        inbound() { return this.emails.filter(e => e.direction === 'inbound') },
        openCount() { return this.inbound.filter(e => e.status === 'open').length },
        // the email a reply answers: the latest still open, else the latest
        target() {
            const open = this.inbound.filter(e => e.status === 'open')
            const list = open.length ? open : this.inbound
            return list.length ? list[list.length - 1] : null
        },
        ours() { return String((this.data && this.data.mailboxAddress) || '').toLowerCase() },
        // every address in the thread, for the To / Cc pickers
        addrOptions() {
            const set = new Set()
            for (const e of this.inbound) {
                for (const a of [e.from, ...(e.replyTo || []), ...(e.to || []), ...(e.cc || [])]) {
                    if (a && a.address && a.address.toLowerCase() !== this.ours) set.add(a.address)
                }
            }
            return [...set]
        },
        // "Reply all": the target's other recipients, not us, not already in
        otherRecipients() {
            return this.othersOf(this.target, [...this.form.to, ...this.form.cc])
        },
        recipientsText() {
            const to = this.form.to.join(', ')
            return this.form.cc.length ? `${to} · ${this.$tp('Cc')}: ${this.form.cc.join(', ')}` : to
        },
        perms() { return this.$store.getters.permissions || [] },
        canReply() { return hasPermission(this.perms, 'sqt:email:reply') },
        canHandle() { return hasPermission(this.perms, 'sqt:email:handle') }
    },
    watch: {
        sqtCaseId() { this.originalOpen = false; this.load(true) }
    },
    created() { this.load(true) },
    methods: {
        async load(fresh) {
            this.loading = true
            this.error = ''
            try {
                const r = await getCaseEmails(this.sqtCaseId)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.data = r.data
                // open what needs reading: every open email + the newest one
                const ex = {}
                const list = this.emails
                list.forEach(e => { if (e.status === 'open') ex[e._id] = true })
                if (list.length) ex[list[list.length - 1]._id] = true
                this.expanded = fresh ? ex : { ...ex, ...this.expanded }
                if (fresh) this.resetForm()
            } catch (e) {
                this.error = this.msg(e, this.$tp('Failed to load the emails'))
            } finally { this.loading = false }
        },
        // Reply all by default: To = the sender (or its Reply-To), Cc = the
        // email's other recipients; the fields stay folded away.
        resetForm() {
            const t = this.target
            const to = t ? ((t.replyTo && t.replyTo[0]) || t.from || {}).address : ''
            const subj = t ? String(t.subject || '') : ''
            const toList = to ? [to] : []
            this.form = {
                to: toList,
                cc: this.othersOf(t, toList),
                subject: /^re:/i.test(subj) ? subj : ('Re: ' + subj).trim(),
                body: '',
                includeQuote: true
            }
            this.showFields = false
            this.files = []
        },
        // An email's To + Cc minus us (any tech-elite address — they all
        // land in this mailbox) and minus `taken`.
        othersOf(t, taken) {
            if (!t) return []
            const domain = this.ours.split('@')[1] || ''
            const seen = new Set(taken.map(a => String(a).toLowerCase()))
            const out = []
            for (const a of [...(t.to || []), ...(t.cc || [])]) {
                const addr = a && a.address
                const low = String(addr || '').toLowerCase()
                if (!addr || seen.has(low) || low === this.ours || (domain && low.endsWith('@' + domain))) continue
                seen.add(low)
                out.push(addr)
            }
            return out
        },
        toggle(e) { this.$set(this.expanded, e._id, !this.expanded[e._id]) },
        replyAll() { this.form.cc = [...this.form.cc, ...this.otherRecipients] },
        insertUpdate() {
            const c = this.c
            let line = `Case ${c.caseId || c.serviceRequestId} is currently ${this.statusLabel(c.status)}.`
            const ls = c.lastStatus
            if (ls && ls.note) line += ` Latest update (${this.fmtDate(ls.at)}): ${ls.note}`
            this.form.body = this.form.body ? this.form.body.replace(/\s*$/, '') + '\n\n' + line : line
        },
        onFiles(ev) {
            const picked = [...((ev.target && ev.target.files) || [])]
            ev.target.value = ''
            for (const f of picked) {
                if (f.size > MAX_FILE) { this.$message.warning(this.$tp('{name} is over 15 MB', { name: f.name })); continue }
                if (this.files.length >= 10) { this.$message.warning(this.$tp('10 attachments at most')); break }
                this.files.push(f)
            }
            if (this.files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL) {
                this.$message.warning(this.$tp('Attachments add up to more than 20 MB'))
            }
        },
        send() {
            const f = this.form
            if (!f.to.length) { this.showFields = true; this.$message.warning(this.$tp('Add at least one recipient')); return }
            if (!f.body.trim()) { this.$message.warning(this.$tp('Write the reply first')); return }
            if (this.files.reduce((n, x) => n + x.size, 0) > MAX_TOTAL) { this.$message.warning(this.$tp('Attachments add up to more than 20 MB')); return }
            const who = [...f.to, ...f.cc].join(', ')
            this.$confirm(this.$tp('Send this reply to {who}?', { who }), this.$tp('Send reply'), {
                confirmButtonText: this.$tp('Send'), cancelButtonText: this.$tp('Cancel'), type: 'info'
            }).then(async () => {
                this.sending = true
                try {
                    const fd = new FormData()
                    fd.append('to', JSON.stringify(f.to))
                    fd.append('cc', JSON.stringify(f.cc))
                    fd.append('subject', f.subject)
                    fd.append('body', f.body)
                    fd.append('includeQuote', f.includeQuote ? '1' : '0')
                    if (this.target) fd.append('replyToEmailId', this.target._id)
                    this.files.forEach(x => fd.append('files', x, x.name))
                    const r = await replyToCaseEmail(this.sqtCaseId, fd)
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    if (r.data && r.data.savedToSent === false) {
                        this.$message.warning(this.$tp('Reply sent, but no copy could be saved in the Sent folder'))
                    } else {
                        this.$message.success(this.$tp('Reply sent'))
                    }
                    await this.load(true)
                    this.$emit('changed')
                } catch (e) {
                    this.$message.error(this.msg(e, this.$tp('Could not send the reply')))
                } finally { this.sending = false }
            }).catch(() => {})
        },
        markHandled() {
            this.$prompt(this.$tp('How was it dealt with? (optional)'), this.$tp('Mark handled'), {
                confirmButtonText: this.$tp('Mark handled'), cancelButtonText: this.$tp('Cancel'),
                inputType: 'textarea', inputPlaceholder: this.$tp('e.g. Called SquareTrade, no reply needed')
            }).then(async ({ value }) => {
                try {
                    const r = await markCaseEmailsHandled(this.sqtCaseId, (value || '').trim())
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    this.$message.success(this.$tp('Marked handled'))
                    await this.load(false)
                    this.$emit('changed')
                } catch (e) {
                    this.$message.error(this.msg(e, this.$tp('Failed to save')))
                }
            }).catch(() => {})
        },
        async reopen(e) {
            try {
                const r = await reopenEmail(e._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                await this.load(false)
                this.$emit('changed')
            } catch (err) {
                this.$message.error(this.msg(err, this.$tp('Failed to save')))
            }
        },
        openCase() {
            this.$router.push({ path: '/sqt/cases', query: { openCase: String(this.sqtCaseId), _r: Date.now() } })
        },
        // ── display ──
        who(e) {
            if (e.direction === 'outbound') return 'Tech Elite' + (e.sentBy ? ' · ' + e.sentBy : '')
            const f = e.from || {}
            return f.name || f.address || '—'
        },
        mailTag(e) { return e.status === 'open' ? this.$tp('Needs reply') : e.status === 'replied' ? this.$tp('Replied') : this.$tp('Handled') },
        mailTagType(e) { return e.status === 'open' ? 'danger' : e.status === 'replied' ? 'success' : 'info' },
        addrList(list) { return (list || []).map(a => a.name ? `${a.name} <${a.address}>` : a.address).join(', ') },
        statusLabel(s) { return (STATUS_META[s] && STATUS_META[s].label) || s || '—' },
        statusType(s) { return (STATUS_META[s] && STATUS_META[s].tag) || 'info' },
        fmtDate(d) {
            if (!d) return '—'
            const x = new Date(d)
            return isNaN(x) ? '—' : x.toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Australia/Melbourne' })
        },
        msg(e, fallback) { return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback }
    }
}
</script>

<style lang="scss" scoped>
.et { min-height: 120px; }
.et-error { padding: 14px; color: #e6a23c; font-size: 13px; }
.et-empty { padding: 20px; text-align: center; color: #909399; font-size: 13px; }
.et-dim { font-size: 12px; color: #909399; }
.et-spacer { flex: 1; }
.et-head { display: flex; align-items: flex-start; gap: 10px; padding-bottom: 10px; margin-bottom: 10px; border-bottom: 1px solid #ebeef5; }
.et-head-main { flex: 1; min-width: 0; }
.et-head-btns { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px;
    .el-button { margin-left: 0; } }
.et-orig-head { padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid #ebeef5; }
.et-orig-subject { font-size: 14px; font-weight: 600; color: #303133; margin-bottom: 2px; }
.et-case { font-size: 16px; font-weight: 700; color: #303133; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    .et-dim { font-weight: 400; } }
.et-mail { border: 1px solid #ebeef5; border-radius: 6px; margin-bottom: 8px; background: #fff;
    &.outbound { background: #f6faff; border-color: #d9ecff; }
    &.is-open { border-color: #fbc4c4; box-shadow: inset 3px 0 0 #f56c6c; } }
.et-mail-head { display: flex; align-items: center; gap: 6px; padding: 8px 10px 2px; cursor: pointer; font-size: 13px; }
.et-icon { color: #409eff; }
.et-who { color: #303133; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 50%; }
.et-subject { padding: 0 10px 4px 30px; font-size: 13px; color: #606266; }
.et-snippet { padding: 0 10px 8px 30px; font-size: 12px; color: #909399; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.et-mail-body { padding: 0 6px 8px; }
.et-addr { padding: 0 4px 6px 24px; font-size: 12px; color: #909399; }
.et-out-text { margin: 0; padding: 6px 8px; white-space: pre-wrap; word-wrap: break-word; font: 13px/1.5 -apple-system, Segoe UI, Arial, sans-serif; color: #303133; }
.et-out-atts { padding: 0 8px; }
.et-done { margin: 6px 4px 0; padding: 6px 8px; border-radius: 4px; background: #f0f9eb; color: #67c23a; font-size: 12px; }
.et-compose { margin-top: 12px; padding: 12px; border: 1px solid #dcdfe6; border-radius: 6px; background: #fafbfc; }
.et-compose-t { font-size: 13px; font-weight: 600; color: #303133; margin-bottom: 10px; }
.et-form ::v-deep .el-form-item { margin-bottom: 8px; }
.et-form ::v-deep .el-form-item__label { white-space: nowrap; }
.et-summary { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; color: #606266; min-width: 0;
    .el-button { padding: 0; flex: none; } }
.et-sum-k { flex: none; padding: 1px 6px; border-radius: 3px; background: #ecf5ff; color: #409eff; }
.et-sum-v { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.et-addr-input { width: calc(100% - 80px); min-width: 200px; margin-right: 6px; }
.et-files { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.et-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px;
    .el-button { margin-left: 0; } }
.et-actions-only { margin-top: 12px; }
@media (max-width: 700px) {
    .et-addr-input { width: 100%; }
    .et-who { max-width: 40%; }
}
</style>
