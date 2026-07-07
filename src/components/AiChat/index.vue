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
                <div class="bubble">
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
                        <div class="bubble-text" :class="{ err: m.error }">{{ m.text }}</div>
                        <el-collapse v-if="m.steps && m.steps.length" class="steps">
                            <el-collapse-item :title="stepTitle(m.steps)">
                                <div v-for="(st, si) in m.steps" :key="si" class="step">
                                    <pre class="sql">{{ st.sql }}</pre>
                                    <div v-if="st.error" class="step-err">⚠ {{ st.error }}</div>
                                    <template v-else>
                                        <div class="step-meta">{{ st.rowCount }} row{{ st.rowCount === 1 ? '' : 's' }}</div>
                                        <el-table v-if="st.rows && st.rows.length" :data="st.rows.slice(0, 20)" size="mini" border max-height="240" class="step-table">
                                            <el-table-column v-for="col in columnsOf(st.rows)" :key="col" :prop="col" :label="col" min-width="110" show-overflow-tooltip>
                                                <template slot-scope="s">{{ fmt(s.row[col]) }}</template>
                                            </el-table-column>
                                        </el-table>
                                        <div v-if="st.rowCount > 20" class="step-more">…and {{ st.rowCount - 20 }} more rows</div>
                                    </template>
                                </div>
                            </el-collapse-item>
                        </el-collapse>
                    </template>
                </div>
            </div>

            <div v-if="loading" class="msg assistant">
                <div class="bubble"><span class="thinking"><i class="el-icon-loading" /> Querying…</span></div>
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
    </div>
</template>

<script>
import { askData } from '@/api/aiQuery'

const MAX_ATTACH = 6
const MAX_FILE_BYTES = 15 * 1024 * 1024
const IMG_MAX_EDGE = 1568
const SHEET_TEXT_CAP = 100 * 1024

export default {
    name: 'AiChat',
    props: {
        suggestions: {
            type: Array,
            default: () => [
                'Cheapest Like New iPhone 15 Pro right now?',
                'Top 5 sellers by number of offers',
                'Average price by grade for Apple',
                'Which brands have the most offers?'
            ]
        },
        placeholder: {
            type: String,
            default: 'Ask a question, or attach an image / spreadsheet…  (Enter to send)'
        },
        rows: { type: Number, default: 2 }
    },
    data() {
        return {
            input: '',
            loading: false,
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
            try {
                const res = await askData(history)
                if (!res || res.success === false) throw res
                const answer = res.answer || '(no answer)'
                this.messages.push({ role: 'assistant', text: answer, apiContent: answer, steps: res.steps || [] })
            } catch (e) {
                const code = (e && e.code) || (e && e.response && e.response.data && e.response.data.code)
                const msg = code === 'not_configured'
                    ? "AI querying isn't set up yet — add ANTHROPIC_API_KEY to the backend .env and restart the server."
                    : this.errMsg(e)
                this.messages.push({ role: 'assistant', text: msg, apiContent: '', error: true })
            } finally {
                this.loading = false
                this.scrollDown()
            }
        },
        clear() {
            if (this.loading) return
            this.messages = []
            this.pending = []
        },
        stepTitle(steps) {
            const n = steps.length
            return `Ran ${n} quer${n === 1 ? 'y' : 'ies'}`
        },
        columnsOf(rows) {
            const cols = []
            const seen = {}
            rows.forEach(r => Object.keys(r || {}).forEach(k => {
                if (!seen[k]) { seen[k] = 1; cols.push(k) }
            }))
            return cols
        },
        fmt(v) {
            if (v === null || v === undefined) return ''
            return typeof v === 'object' ? JSON.stringify(v) : String(v)
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
.ai-chat { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.ai-thread {
    flex: 1;
    overflow-y: auto;
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
    padding: 9px 13px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.5;
}
.msg.user .bubble { background: #409eff; color: #fff; border-bottom-right-radius: 3px; }
.msg.assistant .bubble { background: #fff; color: #303133; border: 1px solid #ebeef5; border-bottom-left-radius: 3px; }
.bubble-text { white-space: pre-wrap; word-break: break-word; }
.bubble-text.err { color: #F56C6C; }
.thinking { color: #909399; }

.msg-attach { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
.msg-thumb { max-width: 120px; max-height: 120px; border-radius: 6px; display: block; }
.msg-file {
    display: inline-flex; align-items: center; gap: 4px;
    background: rgba(255, 255, 255, 0.22); color: #fff;
    padding: 3px 8px; border-radius: 6px; font-size: 12px;
}

.steps { margin-top: 8px; border-top: 1px dashed #ebeef5; }
.steps ::v-deep .el-collapse-item__header { height: 30px; line-height: 30px; font-size: 12px; color: #909399; border: none; background: transparent; }
.steps ::v-deep .el-collapse-item__wrap { border: none; background: transparent; }
.steps ::v-deep .el-collapse { border: none; }
.step { margin-bottom: 12px; }
.step .sql {
    margin: 0 0 5px; padding: 7px 9px;
    background: #2d2d2d; color: #d6e9c6;
    border-radius: 5px; font-size: 11.5px;
    white-space: pre-wrap; word-break: break-word;
    font-family: Consolas, Menlo, monospace;
}
.step-meta { font-size: 11px; color: #909399; margin-bottom: 4px; }
.step-err { font-size: 12px; color: #F56C6C; margin-bottom: 4px; }
.step-more { font-size: 11px; color: #c0c4cc; margin-top: 4px; }
.step-table { width: 100%; }

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
