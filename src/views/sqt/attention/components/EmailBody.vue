<template>
    <!-- One email, read from the mailbox when shown. HTML renders in a
         sandboxed iframe: no scripts run, links open in a new tab, and the
         email's styles can't leak into the dashboard. -->
    <div v-loading="loading" class="eb">
        <div v-if="error" class="eb-error"><i class="el-icon-warning-outline" /> {{ error }}
            <el-button type="text" size="mini" @click="load">{{ $tp('Try again') }}</el-button>
        </div>
        <template v-else-if="content">
            <iframe v-if="content.html" ref="frame" class="eb-frame" :style="{ height: frameHeight + 'px' }"
                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                :srcdoc="srcdoc" @load="fit" />
            <template v-else>
                <pre class="eb-text">{{ showQuoted ? content.text : newText }}</pre>
                <el-button v-if="hasQuoted" type="text" size="mini" @click="showQuoted = !showQuoted">
                    {{ showQuoted ? $tp('Hide quoted text') : $tp('Show quoted text') }}
                </el-button>
            </template>
            <div v-if="content.attachments.length" class="eb-atts">
                <el-button v-for="a in content.attachments" :key="a.index" size="mini" icon="el-icon-paperclip"
                    :loading="downloading === a.index" @click="download(a)">
                    {{ a.filename }} <span class="eb-dim">{{ size(a.size) }}</span>
                </el-button>
            </div>
        </template>
    </div>
</template>

<script>
import { saveAs } from 'file-saver'
import { getEmailContent, downloadEmailAttachment, getOriginalContent, downloadOriginalAttachment } from '@/api/sqtCaseEmails'

// Strict CSP inside the frame: nothing loads but images, inline styles and
// fonts; scripts are already blocked by the sandbox.
const HEAD = '<meta charset="utf-8"><base target="_blank">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: http: data:; style-src \'unsafe-inline\' https:; font-src https: data:">' +
    '<style>html,body{margin:0;padding:6px 8px;font:13px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#303133;word-wrap:break-word}img{max-width:100%;height:auto}</style>'
const MAX_HEIGHT = 640

export default {
    name: 'EmailBody',
    // one of: emailId (a picked-up email) / originalOf (a case's original request)
    props: {
        emailId: { type: String, default: '' },
        originalOf: { type: String, default: '' }
    },
    data() {
        return { loading: false, error: '', content: null, frameHeight: 60, showQuoted: false, downloading: null }
    },
    computed: {
        srcdoc() { return this.content && this.content.html ? HEAD + this.content.html : '' },
        // the new part of a plain-text email — the quoted history folds away
        newText() {
            const out = []
            for (const line of String((this.content && this.content.text) || '').replace(/\r/g, '').split('\n')) {
                if (/^\s*On .+wrote:\s*$/i.test(line) || /^\s*-{2,}\s*Original Message/i.test(line)) break
                if (/^\s*From:\s.+/i.test(line) && out.length) break
                out.push(line)
            }
            return out.join('\n').trim()
        },
        hasQuoted() { return !!this.content && this.newText.length < String(this.content.text || '').trim().length }
    },
    watch: { emailId() { this.load() }, originalOf() { this.load() } },
    created() { this.load() },
    methods: {
        async load() {
            this.loading = true
            this.error = ''
            try {
                const r = this.originalOf ? await getOriginalContent(this.originalOf) : await getEmailContent(this.emailId)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.content = r.data
            } catch (e) {
                this.error = (e && e.response && e.response.data && e.response.data.message) || this.$tp('Could not open this email')
            } finally { this.loading = false }
        },
        // grow the frame to its content, up to MAX_HEIGHT (then it scrolls)
        fit() {
            try {
                const doc = this.$refs.frame && this.$refs.frame.contentDocument
                // the body's height — <html>'s never drops below the frame's own
                if (doc && doc.body) {
                    const h = doc.body.scrollHeight + 12
                    this.frameHeight = Math.min(MAX_HEIGHT, Math.max(40, h))
                    // a scrollbar only when the email is taller than the cap
                    doc.documentElement.style.overflowY = h > MAX_HEIGHT ? 'auto' : 'hidden'
                    // late-loading images change the height once more
                    Array.from(doc.images || []).forEach(img => { if (!img.complete) img.addEventListener('load', () => this.fit(), { once: true }) })
                }
            } catch (e) { this.frameHeight = 400 }
        },
        async download(a) {
            this.downloading = a.index
            try {
                const blob = this.originalOf
                    ? await downloadOriginalAttachment(this.originalOf, a.index)
                    : await downloadEmailAttachment(this.emailId, a.index)
                saveAs(blob, a.filename)
            } catch (e) {
                this.$message.error(this.$tp('Could not download the attachment'))
            } finally { this.downloading = null }
        },
        size(n) {
            if (!n) return ''
            return n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1024 / 1024).toFixed(1) + ' MB'
        }
    }
}
</script>

<style lang="scss" scoped>
.eb { min-height: 60px; }
.eb-frame { display: block; width: 100%; border: 0; background: #fff; }
.eb-text { margin: 0; padding: 6px 8px; white-space: pre-wrap; word-wrap: break-word; font: 13px/1.5 -apple-system, Segoe UI, Arial, sans-serif; color: #303133; }
.eb-atts { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; border-top: 1px dashed #ebeef5; margin-top: 4px;
    .el-button { margin-left: 0; } }
.eb-dim { color: #909399; margin-left: 4px; }
.eb-error { padding: 10px; font-size: 13px; color: #e6a23c; }
</style>
