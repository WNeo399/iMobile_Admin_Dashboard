<template>
    <!-- A follow-up email no case could be found for: read it, then link it
         to a case (by Case ID or SR number) or dismiss it. -->
    <div class="ue">
        <div class="ue-head">
            <div class="ue-from"><i class="el-icon-message" /> <b>{{ fromText }}</b></div>
            <div class="ue-dim">{{ fmtDate(email.date) }}<template v-if="email.to.length"> · {{ $tp('To') }}: {{ addrList(email.to) }}</template></div>
            <div class="ue-subject">{{ email.subject || $tp('(no subject)') }}</div>
        </div>
        <email-body :email-id="String(email._id)" class="ue-body" />

        <div v-if="canHandle" class="ue-actions">
            <div class="ue-t">{{ $tp('Which case is this about?') }}</div>
            <div class="ue-link">
                <el-input v-model="caseRef" size="small" clearable :placeholder="$tp('Case ID or SR number')" @keyup.enter.native="link" />
                <el-button size="small" type="primary" icon="el-icon-link" :loading="saving" @click="link">{{ $tp('Link to case') }}</el-button>
                <el-button size="small" icon="el-icon-close" @click="dismiss">{{ $tp('Dismiss') }}</el-button>
            </div>
        </div>
    </div>
</template>

<script>
import { linkEmailToCase, markEmailHandled } from '@/api/sqtCaseEmails'
import { hasPermission } from '@/utils/permission'
import EmailBody from './EmailBody'

export default {
    name: 'UnmatchedEmail',
    components: { EmailBody },
    props: { email: { type: Object, required: true } },
    data() {
        return { caseRef: this.email.caseRef || '', saving: false }
    },
    computed: {
        canHandle() { return hasPermission(this.$store.getters.permissions || [], 'sqt:email:handle') },
        fromText() {
            const f = this.email.from || {}
            return f.name ? `${f.name} <${f.address}>` : f.address || '—'
        }
    },
    methods: {
        async link() {
            const ref = this.caseRef.trim()
            if (!ref) { this.$message.warning(this.$tp('Enter a Case ID or SR number')); return }
            this.saving = true
            try {
                const r = await linkEmailToCase(this.email._id, ref)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('Linked to case {id}', { id: r.data.caseId }))
                this.$emit('changed', r.data)
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Could not link the email')))
            } finally { this.saving = false }
        },
        dismiss() {
            this.$prompt(this.$tp('Why does it need nothing? (optional)'), this.$tp('Dismiss'), {
                confirmButtonText: this.$tp('Dismiss'), cancelButtonText: this.$tp('Cancel'),
                inputType: 'textarea', inputPlaceholder: this.$tp('e.g. Not about a case')
            }).then(async ({ value }) => {
                try {
                    const r = await markEmailHandled(this.email._id, (value || '').trim())
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    this.$message.success(this.$tp('Dismissed'))
                    this.$emit('changed', null)
                } catch (e) {
                    this.$message.error(this.msg(e, this.$tp('Failed to save')))
                }
            }).catch(() => {})
        },
        addrList(list) { return (list || []).map(a => a.address).join(', ') },
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
.ue-head { padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid #ebeef5; }
.ue-from { font-size: 14px; color: #303133; i { color: #409eff; } }
.ue-dim { font-size: 12px; color: #909399; margin-top: 2px; }
.ue-subject { font-size: 14px; color: #303133; margin-top: 6px; font-weight: 600; }
.ue-body { border: 1px solid #ebeef5; border-radius: 6px; }
.ue-actions { margin-top: 12px; padding: 12px; border: 1px solid #faecd8; border-radius: 6px; background: #fdf6ec; }
.ue-t { font-size: 13px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.ue-link { display: flex; flex-wrap: wrap; gap: 8px; .el-input { width: 220px; } .el-button { margin-left: 0; } }
</style>
