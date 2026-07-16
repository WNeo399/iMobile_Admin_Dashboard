<template>
    <div class="ai-chat">
        <div ref="thread" class="ai-thread">
            <div v-if="!messages.length" class="ai-empty">
                <div class="ai-empty-title">Try asking…</div>
                <div class="ai-chips">
                    <el-button v-for="(s, i) in suggestions" :key="i" size="mini" round plain @click="useSuggestion(s)">{{ s }}</el-button>
                </div>
            </div>

            <div v-for="(m, idx) in messages" :key="idx" class="msg" :class="m.role">
                <div class="bubble" :class="{ 'has-chart': m.result && m.result.view === 'chart' }">
                    <template v-if="m.role === 'user'">
                        <div v-if="m.attachments && m.attachments.length" class="msg-attach">
                            <template v-for="(a, ai) in m.attachments">
                                <img v-if="a.kind === 'image'" :key="ai" :src="a.previewUrl" class="msg-thumb" />
                                <span v-else :key="ai" class="msg-file"><i class="el-icon-document" /> {{ a.name }}</span>
                            </template>
                        </div>
                        <div v-if="m.text" class="bubble-text">{{ m.text }}</div>
                    </template>
                    <template v-else>
                        <template v-if="m.result">
                            <div v-if="m.result.summary" class="bubble-text">{{ m.result.summary }}</div>
                            <el-table
                                v-if="m.result.view === 'table' && m.result.rows && m.result.rows.length"
                                :data="tableData(m.result)" size="mini" border max-height="300" class="result-table">
                                <el-table-column v-for="(col, ci) in m.result.columns" :key="ci"
                                    :prop="'c' + ci" :label="col" min-width="110" show-overflow-tooltip />
                            </el-table>
                            <div v-if="m.result.card && (m.result.view === 'card' || m.result.view === 'chart')" class="result-card">
                                <div v-if="m.result.card.title" class="result-card-title">{{ m.result.card.title }}</div>
                                <div v-if="m.result.card.subtitle" class="result-card-sub">{{ m.result.card.subtitle }}</div>
                                <div v-if="m.result.card.fields && m.result.card.fields.length" class="result-card-fields">
                                    <div v-for="(f, fi) in m.result.card.fields" :key="fi" class="result-field">
                                        <span class="result-field-label">{{ f.label }}</span>
                                        <span class="result-field-value">{{ f.value }}</span>
                                    </div>
                                </div>
                            </div>
                            <template v-if="m.result.view === 'chart'">
                                <result-chart v-for="(c, cidx) in chartsOf(m.result)" :key="cidx" :chart="c" class="result-chart" height="200px" />
                            </template>
                            <div v-if="expandable && hasVisual(m)" class="result-expand">
                                <el-button type="text" size="mini" icon="el-icon-full-screen" @click="openExpand(m)">Expand</el-button>
                            </div>
                        </template>
                        <div v-else class="bubble-text" :class="{ err: m.error }">{{ m.text }}</div>
                    </template>
                </div>
            </div>

            <div v-if="loading" class="msg assistant">
                <div class="bubble"><span class="thinking"><i class="el-icon-loading" /> {{ progressLabel || 'Thinking…' }}</span></div>
            </div>
        </div>

        <div class="ai-composer">
            <div v-if="pending.length || attaching" class="ai-attachments">
                <div v-for="(a, i) in pending" :key="i" class="ai-attach">
                    <img v-if="a.kind === 'image'" :src="a.previewUrl" class="ai-attach-thumb" />
                    <span v-else class="ai-attach-name"><i class="el-icon-document" /> {{ a.name }}</span>
                    <i class="el-icon-close ai-attach-x" @click="removeAttach(i)" />
                </div>
                <span v-if="attaching" class="ai-attaching"><i class="el-icon-loading" /> reading…</span>
            </div>
            <div class="ai-input">
                <el-button icon="el-icon-paperclip" circle :disabled="loading || attaching" title="Attach image or spreadsheet" @click="pickFiles" />
                <el-input
                    v-model="input" type="textarea" :rows="rows" resize="none"
                    :placeholder="placeholder" :disabled="loading"
                    @keydown.enter.native.exact.prevent="send"
                />
                <el-button type="primary" icon="el-icon-position" circle :loading="loading" :disabled="(!input.trim() && !pending.length) || attaching" @click="send" />
                <input ref="file" type="file" multiple accept="image/*,.xlsx,.xls,.csv" class="ai-file-input" @change="onFiles" />
            </div>
        </div>

        <!-- Expanded reply — a roomier view of a table/card answer (used when the
             chat lives in the small assistant panel). append-to-body so it isn't
             clipped by the panel. -->
        <el-dialog :visible.sync="expandVisible" width="720px" top="8vh" append-to-body :close-on-click-modal="false" custom-class="ai-expand-dialog" @opened="onExpandOpened">
            <div slot="title" class="ai-expand-title"><i class="el-icon-magic-stick" /> Answer</div>
            <template v-if="expanded && expanded.result">
                <div v-if="expanded.result.summary" class="ai-expand-summary">{{ expanded.result.summary }}</div>
                <el-table
                    v-if="expanded.result.view === 'table' && expanded.result.rows && expanded.result.rows.length"
                    :data="tableData(expanded.result)" size="small" border max-height="480" class="result-table">
                    <el-table-column v-for="(col, ci) in expanded.result.columns" :key="ci"
                        :prop="'c' + ci" :label="col" min-width="120" show-overflow-tooltip />
                </el-table>
                <template v-if="expanded.result.view === 'chart'">
                    <div v-if="expanded.result.card" class="result-card ai-expand-chart-card">
                        <div v-if="expanded.result.card.title" class="result-card-title">{{ expanded.result.card.title }}</div>
                        <div v-if="expanded.result.card.subtitle" class="result-card-sub">{{ expanded.result.card.subtitle }}</div>
                        <div v-if="expanded.result.card.fields && expanded.result.card.fields.length" class="result-card-fields">
                            <div v-for="(f, fi) in expanded.result.card.fields" :key="'f' + fi" class="result-field">
                                <span class="result-field-label">{{ f.label }}</span>
                                <span class="result-field-value">{{ f.value }}</span>
                            </div>
                        </div>
                    </div>
                    <result-chart v-for="(c, cidx) in chartsOf(expanded.result)" :key="cidx"
                        ref="expandCharts" :chart="c" height="320px" class="ai-expand-chart" />
                </template>
                <div v-else-if="expanded.result.view === 'card' && expanded.result.card" class="result-card ai-expand-card">
                    <div v-if="expanded.result.card.title" class="result-card-title">{{ expanded.result.card.title }}</div>
                    <div v-if="expanded.result.card.subtitle" class="result-card-sub">{{ expanded.result.card.subtitle }}</div>
                    <div v-if="expanded.result.card.fields && expanded.result.card.fields.length" class="result-card-fields">
                        <div v-for="(f, fi) in expanded.result.card.fields" :key="fi" class="result-field">
                            <span class="result-field-label">{{ f.label }}</span>
                            <span class="result-field-value">{{ f.value }}</span>
                        </div>
                    </div>
                </div>
            </template>
        </el-dialog>
    </div>
</template>

<script>
import { askDataStream } from '@/api/aiQuery'
import ResultChart from './ResultChart'

const MAX_ATTACH = 6
const MAX_FILE_BYTES = 15 * 1024 * 1024
const IMG_MAX_EDGE = 1568
const SHEET_TEXT_CAP = 100 * 1024

export default {
    name: 'AiChat',
    components: { ResultChart },
    props: {
        suggestions: {
            type: Array,
            default: () => [
                'Platform price of iPhone 13 128GB in A grade?',
                'How is the iPhone 13 128GB selling recently?',
                'Has the price of the iPhone 12 128GB dropped in the last 30 days?',
                'After-commission payout for the cheapest iPhone 12 128GB?'
            ]
        },
        placeholder: {
            type: String,
            default: 'Ask a question, or attach an image / spreadsheet…  (Enter to send)'
        },
        rows: { type: Number, default: 2 },
        // Show an "Expand" control on table/card answers that opens them in a
        // large dialog — for hosts with limited width (the assistant orb panel).
        expandable: { type: Boolean, default: false }
    },
    data() {
        return {
            input: '',
            loading: false,
            progressLabel: '',
            expandVisible: false,
            expanded: null,
            attaching: false,
            pending: [], // [{ name, kind:'image'|'sheet', block, previewUrl }]
            messages: [] // [{ role, text, apiContent, attachments?, steps?, error? }]
        }
    },
    methods: {
        useSuggestion(s) {
            if (this.loading) return
            this.input = s
            this.send()
        },
        pickFiles() {
            if (this.$refs.file) this.$refs.file.click()
        },
        async onFiles(e) {
            const files = Array.from(e.target.files || [])
            e.target.value = '' // allow re-selecting the same file
            if (!files.length) return
            if (this.pending.length + files.length > MAX_ATTACH) {
                this.$message.warning(`Up to ${MAX_ATTACH} attachments at a time.`)
                return
            }
            this.attaching = true
            try {
                for (const f of files) {
                    if (f.size > MAX_FILE_BYTES) {
                        this.$message.warning(`"${f.name}" is too large (max 15MB).`)
                        continue
                    }
                    if (/^image\//.test(f.type)) {
                        const { block, previewUrl } = await this.fileToImage(f)
                        this.pending.push({ name: f.name, kind: 'image', block, previewUrl })
                    } else if (/\.(xlsx|xls|csv)$/i.test(f.name)) {
                        const block = await this.fileToSheet(f)
                        this.pending.push({ name: f.name, kind: 'sheet', block, previewUrl: null })
                    } else {
                        this.$message.warning(`"${f.name}" isn't supported — attach an image, .xlsx, .xls or .csv.`)
                    }
                }
            } catch (err) {
                this.$message.error('Could not read a file: ' + ((err && err.message) || err))
            } finally {
                this.attaching = false
            }
        },
        removeAttach(i) {
            this.pending.splice(i, 1)
        },
        fileToImage(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader()
                reader.onerror = () => reject(new Error('read failed'))
                reader.onload = () => {
                    const img = new Image()
                    img.onerror = () => reject(new Error('not a valid image'))
                    img.onload = () => {
                        const scale = Math.min(1, IMG_MAX_EDGE / Math.max(img.width, img.height))
                        const w = Math.max(1, Math.round(img.width * scale))
                        const h = Math.max(1, Math.round(img.height * scale))
                        const canvas = document.createElement('canvas')
                        canvas.width = w
                        canvas.height = h
                        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
                        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
                        resolve({
                            block: { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: dataUrl.split(',')[1] } },
                            previewUrl: dataUrl
                        })
                    }
                    img.src = reader.result
                }
                reader.readAsDataURL(file)
            })
        },
        async fileToSheet(file) {
            const buf = await file.arrayBuffer()
            let text
            if (/\.csv$/i.test(file.name)) {
                text = new TextDecoder('utf-8').decode(new Uint8Array(buf))
            } else {
                const mod = await import('xlsx')
                const XLSX = mod && mod.read ? mod : mod.default
                const wb = XLSX.read(buf, { type: 'array' })
                text = wb.SheetNames
                    .map(n => `# Sheet: ${n}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n]))
                    .join('\n\n')
            }
            if (text.length > SHEET_TEXT_CAP) text = text.slice(0, SHEET_TEXT_CAP) + '\n…(truncated)'
            return { type: 'text', text: `Attached spreadsheet "${file.name}":\n\n${text}` }
        },
        async send() {
            const text = (this.input || '').trim()
            if ((!text && !this.pending.length) || this.loading || this.attaching) return

            const attachBlocks = this.pending.map(p => p.block)
            let apiContent
            if (attachBlocks.length) {
                apiContent = attachBlocks.slice()
                if (text) apiContent.push({ type: 'text', text })
            } else {
                apiContent = text
            }
            const attachments = this.pending.map(p => ({ name: p.name, kind: p.kind, previewUrl: p.previewUrl }))

            this.messages.push({ role: 'user', text, apiContent, attachments })
            this.input = ''
            this.pending = []
            this.scrollDown()

            const history = this.messages
                .filter(m => !m.error)
                .map(m => ({ role: m.role, content: m.apiContent }))

            this.loading = true
            this.progressLabel = 'Thinking…'
            try {
                const res = await askDataStream(history, { onProgress: (label) => { this.progressLabel = label } })
                if (!res || res.success === false) throw res
                const answer = res.answer || '(no answer)'
                this.messages.push({ role: 'assistant', text: answer, apiContent: answer, steps: res.steps || [], result: res.result || null })
            } catch (e) {
                const code = (e && e.code) || (e && e.response && e.response.data && e.response.data.code)
                const msg = code === 'not_configured'
                    ? "AI querying isn't set up yet — add ANTHROPIC_API_KEY to the backend .env and restart the server."
                    : this.errMsg(e)
                this.messages.push({ role: 'assistant', text: msg, apiContent: '', error: true })
            } finally {
                this.loading = false
                this.progressLabel = ''
                this.scrollDown()
            }
        },
        clear() {
            if (this.loading) return
            this.messages = []
            this.pending = []
        },
        // Charts arrive as `charts` (1–3); older answers used a single `chart`.
        chartsOf(result) {
            if (!result) return []
            if (Array.isArray(result.charts) && result.charts.length) return result.charts
            return result.chart ? [result.chart] : []
        },
        // A message has an expandable visual when its result is a table, card or chart.
        hasVisual(m) {
            const r = m && m.result
            if (!r) return false
            return (r.view === 'table' && r.rows && r.rows.length) ||
                (r.view === 'card' && r.card) ||
                (r.view === 'chart' && this.chartsOf(r).length > 0)
        },
        openExpand(m) {
            this.expanded = m
            this.expandVisible = true
        },
        onExpandOpened() {
            // Charts may have initialised while the dialog was still animating —
            // re-measure once it's fully open.
            const refs = this.$refs.expandCharts
            const list = Array.isArray(refs) ? refs : refs ? [refs] : []
            list.forEach(c => c && c.resize && c.resize())
        },
        // Zip a present_answer table (columns[] + rows[][]) into el-table row objects.
        tableData(result) {
            const cols = (result && result.columns) || []
            return ((result && result.rows) || []).map(r => {
                const o = {}
                cols.forEach((c, i) => { o['c' + i] = (r && r[i] != null) ? r[i] : '' })
                return o
            })
        },
        scrollDown() {
            this.$nextTick(() => {
                const el = this.$refs.thread
                if (el) el.scrollTop = el.scrollHeight
            })
        },
        errMsg(e) {
            return (e && e.response && e.response.data && e.response.data.message) ||
                (e && e.message) || 'Something went wrong.'
        }
    }
}
</script>

<style lang="scss" scoped>
.ai-chat {
    display: flex; flex-direction: column; height: 100%; min-height: 0;
    /* When hosted as a flex item (the orb panel body), don't let wide content
       (tables) inflate the chat past the host's width — shrink and let the
       table scroll internally instead. */
    min-width: 0;
    max-width: 100%;
}

.ai-thread {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px 4px;
    background: #f7f8fa;
    border: 1px solid #ebeef5;
    border-radius: 8px;
}
.ai-empty { text-align: center; color: #909399; padding: 24px 10px; }
.ai-empty-title { font-size: 13px; margin-bottom: 12px; }
.ai-chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }

.msg { display: flex; margin: 8px 6px; }
.msg.user { justify-content: flex-end; }
.msg.assistant { justify-content: flex-start; }
.bubble {
    max-width: 82%;
    /* Flex items default to min-width:auto and refuse to shrink below their
       content (a wide table would push the bubble past the panel edge and get
       clipped) — allow shrinking so tables scroll INSIDE the bubble instead. */
    min-width: 0;
    padding: 9px 13px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.5;
}
.msg.user .bubble { background: #409eff; color: #fff; border-bottom-right-radius: 3px; }
.msg.assistant .bubble {
    background: #fff; color: #303133; border: 1px solid #ebeef5; border-bottom-left-radius: 3px;
    /* Answers can carry tables — give them the full row and clip anything
       that would spill past the rounded corner. */
    max-width: 96%;
    overflow: hidden;
}
.bubble-text { white-space: pre-wrap; word-break: break-word; }
.bubble-text.err { color: #F56C6C; }

/* Structured answer: table + single-product card + chart */
.result-table { margin-top: 8px; width: 100%; max-width: 100%; }
.result-chart { margin-top: 8px; }
.ai-expand-chart { margin-bottom: 10px; }
.ai-expand-chart-card { margin: 0 0 12px; }
/* Charts need real width — take the full row instead of shrink-to-fit. */
.msg.assistant .bubble.has-chart { width: 96%; }
/* Belt-and-braces: whatever el-table computes, keep the horizontal overflow
   scrollable inside the table rather than clipped by the bubble. */
.result-table ::v-deep .el-table__body-wrapper { overflow-x: auto; }
.result-expand { text-align: right; margin-top: 2px; }
.result-expand .el-button { padding: 2px 0; font-size: 12px; color: #909399; }
.result-expand .el-button:hover { color: #409eff; }
.ai-expand-title { font-size: 15px; font-weight: 600; color: #303133; }
.ai-expand-title i { color: #409eff; margin-right: 4px; }
.ai-expand-summary { font-size: 14px; color: #303133; line-height: 1.6; margin-bottom: 10px; }
.ai-expand-card { margin-top: 0; }
.result-card {
    margin-top: 8px;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    padding: 12px 14px;
    background: #fafbfc;
}
.result-card-title { font-size: 14px; font-weight: 600; color: #303133; line-height: 1.35; }
.result-card-sub { font-size: 12px; color: #909399; margin-top: 2px; }
.result-card-fields { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.result-field { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
.result-field-label { color: #909399; flex-shrink: 0; }
.result-field-value { color: #303133; font-weight: 500; text-align: right; word-break: break-word; }
.thinking { color: #909399; }

.msg-attach { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
.msg-thumb { max-width: 120px; max-height: 120px; border-radius: 6px; display: block; }
.msg-file {
    display: inline-flex; align-items: center; gap: 4px;
    background: rgba(255, 255, 255, 0.22); color: #fff;
    padding: 3px 8px; border-radius: 6px; font-size: 12px;
}

.ai-composer { margin-top: 10px; }
.ai-attachments {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
    margin-bottom: 8px;
}
.ai-attach {
    position: relative;
    border: 1px solid #dcdfe6; border-radius: 6px; background: #fff;
    padding: 3px;
}
.ai-attach-thumb { width: 46px; height: 46px; object-fit: cover; border-radius: 4px; display: block; }
.ai-attach-name { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #606266; padding: 6px 8px; max-width: 180px; }
.ai-attach-name > span, .ai-attach-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-attach-x {
    position: absolute; top: -7px; right: -7px;
    background: #909399; color: #fff; border-radius: 50%;
    font-size: 12px; width: 16px; height: 16px; line-height: 16px; text-align: center;
    cursor: pointer;
}
.ai-attach-x:hover { background: #F56C6C; }
.ai-attaching { font-size: 12px; color: #909399; }

.ai-input { display: flex; gap: 8px; align-items: flex-end; }
.ai-input ::v-deep .el-textarea { flex: 1; }
.ai-file-input { display: none; }
</style>
