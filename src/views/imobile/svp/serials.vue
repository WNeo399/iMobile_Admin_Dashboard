<template>
    <div class="app-container svp-serials-page">
        <!-- Current list -->
        <el-card shadow="never" class="stats-card">
            <div class="stats-row">
                <div class="stat">
                    <div class="stat-value">{{ stats.count != null ? stats.count.toLocaleString() : '—' }}</div>
                    <div class="stat-label">genuine serials on record</div>
                </div>
                <div class="stat-meta">
                    <div v-if="stats.lastImportedAt">
                        Last updated {{ formatDate(stats.lastImportedAt) }}
                        <span v-if="stats.lastBy">by {{ stats.lastBy }}</span>
                        <span v-if="stats.lastMode">· {{ stats.lastMode }}</span>
                    </div>
                    <div v-else class="muted">No list uploaded yet.</div>
                </div>
                <span class="stat-spacer" />
                <el-button size="small" icon="el-icon-refresh" :loading="loadingStats" @click="loadStats">Refresh</el-button>
            </div>
        </el-card>

        <!-- Upload -->
        <el-card shadow="never" class="upload-card">
            <div slot="header" class="card-head"><i class="el-icon-upload2" /> Upload supplier list</div>

            <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" class="hidden-input" @change="onFilePicked" />
            <div class="file-row">
                <el-button icon="el-icon-document" @click="$refs.fileInput.click()">Choose Excel / CSV</el-button>
                <span v-if="fileName" class="file-name" :title="fileName">{{ fileName }}</span>
                <span v-else class="file-name muted">No file selected</span>
            </div>
            <div class="form-hint">
                The sheet is parsed in your browser — every serial-looking cell is collected (headers skipped).
            </div>

            <el-alert v-if="parseError" :title="parseError" type="error" show-icon :closable="false" class="block" />

            <div v-if="parsedSerials.length" class="parsed-block">
                <div class="parsed-count">
                    <i class="el-icon-circle-check" />
                    <strong>{{ parsedSerials.length.toLocaleString() }}</strong> serials found
                    <span class="muted">(deduplicated)</span>
                </div>
                <div class="parsed-preview muted">
                    e.g. {{ parsedSerials.slice(0, 5).join(', ') }}{{ parsedSerials.length > 5 ? '…' : '' }}
                </div>

                <el-radio-group v-model="mode" class="mode-group">
                    <el-radio label="replace">
                        Replace entire list
                        <span class="radio-hint">— the new sheet becomes the list</span>
                    </el-radio>
                    <el-radio label="merge">
                        Add to existing list
                        <span class="radio-hint">— keep current serials, add new ones</span>
                    </el-radio>
                </el-radio-group>

                <el-button type="primary" icon="el-icon-upload" :loading="importing" @click="doImport">
                    {{ importing ? 'Importing…' : (mode === 'replace' ? `Replace list with ${parsedSerials.length.toLocaleString()} serials` : `Add ${parsedSerials.length.toLocaleString()} serials`) }}
                </el-button>
            </div>
        </el-card>

        <!-- Spot check -->
        <el-card shadow="never" class="check-card">
            <div slot="header" class="card-head"><i class="el-icon-search" /> Check a serial</div>
            <div class="check-row">
                <el-input
                    v-model="checkSerial"
                    placeholder="Enter a serial to test the list…"
                    clearable
                    size="small"
                    class="check-input"
                    @keyup.enter.native="doCheck"
                    @clear="checkResult = null"
                />
                <el-button size="small" type="primary" icon="el-icon-search" :loading="checking" @click="doCheck">Check</el-button>
                <el-tag v-if="checkResult" :type="checkResult.found ? 'success' : 'info'" size="medium" effect="plain">
                    <i :class="checkResult.found ? 'el-icon-circle-check' : 'el-icon-warning-outline'" />
                    {{ checkResult.found ? 'On record (genuine)' : 'Not on record' }}
                    <span class="mono">· {{ checkResult.serial }}</span>
                </el-tag>
            </div>
        </el-card>
    </div>
</template>

<script>
import * as XLSX from 'xlsx-js-style'
import { getSvpSerialStats, importSvpSerials, checkSvpSerial } from '@/api/svp/serial'

// Cells that are obviously a header label, not a serial.
const HEADER_RE = /^(serial(\s*(no\.?|number|#))?|s\/?n|imei|#|sno)$/i
// A serial-looking cell: alphanumeric, no spaces/symbols, reasonably long.
// Min length 10 keeps real Apple serials (≥14 chars in supplier sheets, ≥10
// for older formats) while dropping the short model-name labels the supplier
// groups serials under (e.g. "13promax", "14plus", "16ProMax" — 6–8 chars).
const SERIAL_RE = /^[A-Za-z0-9]{10,}$/

export default {
    name: 'ImobileSvpSerials',
    data() {
        return {
            stats: { count: null, lastImportedAt: null, lastBy: null, lastMode: null },
            loadingStats: false,
            fileName: '',
            parseError: '',
            parsedSerials: [],
            mode: 'replace',
            importing: false,
            checkSerial: '',
            checking: false,
            checkResult: null
        }
    },
    created() {
        this.loadStats()
    },
    methods: {
        async loadStats() {
            this.loadingStats = true
            try {
                const res = await getSvpSerialStats()
                if (res && res.success) {
                    this.stats = {
                        count: res.count,
                        lastImportedAt: res.lastImportedAt,
                        lastBy: res.lastBy,
                        lastMode: res.lastMode
                    }
                }
            } catch (e) {
                console.error('Load SVP serial stats failed:', e)
                this.$message.error(this.msg(e, 'Failed to load stats'))
            } finally {
                this.loadingStats = false
            }
        },
        onFilePicked(event) {
            const f = event.target.files && event.target.files[0]
            event.target.value = ''
            if (!f) return
            this.fileName = f.name
            this.parseError = ''
            this.parsedSerials = []
            const reader = new FileReader()
            reader.onload = (e) => {
                try {
                    this.parsedSerials = this.extractSerials(e.target.result)
                    if (this.parsedSerials.length === 0) {
                        this.parseError = 'No serial numbers found in the sheet.'
                    }
                } catch (err) {
                    console.error('SVP sheet parse failed:', err)
                    this.parseError = 'Could not read the file. Make sure it\'s a valid Excel/CSV.'
                }
            }
            reader.onerror = () => { this.parseError = 'Could not read the file.' }
            reader.readAsArrayBuffer(f)
        },
        // Collect every serial-looking cell across all sheets, skipping header
        // labels, then dedupe (case/space-insensitive).
        extractSerials(arrayBuffer) {
            const wb = XLSX.read(arrayBuffer, { type: 'array' })
            const seen = new Set()
            const out = []
            for (const sheetName of wb.SheetNames) {
                const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: false })
                for (const row of rows) {
                    for (const cell of row) {
                        const v = String(cell == null ? '' : cell).trim()
                        if (!v || HEADER_RE.test(v) || !SERIAL_RE.test(v)) continue
                        const key = v.replace(/\s+/g, '').toUpperCase()
                        if (seen.has(key)) continue
                        seen.add(key)
                        out.push(v)
                    }
                }
            }
            return out
        },
        async doImport() {
            if (!this.parsedSerials.length || this.importing) return
            if (this.mode === 'replace') {
                try {
                    await this.$confirm(
                        `Replace the entire list (currently ${this.stats.count != null ? this.stats.count.toLocaleString() : '—'}) with these ${this.parsedSerials.length.toLocaleString()} serials? This can't be undone.`,
                        'Replace serial list',
                        { confirmButtonText: 'Replace', cancelButtonText: 'Cancel', type: 'warning' }
                    )
                } catch { return }
            }
            this.importing = true
            try {
                const res = await importSvpSerials({ serials: this.parsedSerials, mode: this.mode })
                if (!res || res.success === false) throw new Error((res && res.message) || 'Import failed')
                this.$message.success(
                    this.mode === 'replace'
                        ? `List replaced — ${res.total.toLocaleString()} serials on record.`
                        : `Added ${res.inserted.toLocaleString()} new serials — ${res.total.toLocaleString()} on record.`
                )
                this.parsedSerials = []
                this.fileName = ''
                this.loadStats()
            } catch (e) {
                console.error('SVP serial import failed:', e)
                this.$message.error(this.msg(e, 'Import failed'))
            } finally {
                this.importing = false
            }
        },
        async doCheck() {
            const s = (this.checkSerial || '').trim()
            if (!s) return
            this.checking = true
            this.checkResult = null
            try {
                const res = await checkSvpSerial(s)
                if (!res || res.success === false) throw new Error((res && res.message) || 'Check failed')
                this.checkResult = { found: res.found, serial: res.serial }
            } catch (e) {
                console.error('SVP serial check failed:', e)
                this.$message.error(this.msg(e, 'Check failed'))
            } finally {
                this.checking = false
            }
        },
        formatDate(value) {
            if (!value) return '—'
            const d = new Date(value)
            if (isNaN(d.getTime())) return '—'
            return d.toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })
        },
        msg(e, fallback) {
            return (e.response && e.response.data && e.response.data.message) || e.message || fallback
        }
    }
}
</script>

<style lang="scss" scoped>
.svp-serials-page { display: flex; flex-direction: column; gap: 14px; max-width: 760px; }
.hidden-input { position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; }
.card-head { font-weight: 600; font-size: 14px; i { color: #409eff; margin-right: 4px; } }

.stats-card .stats-row { display: flex; align-items: center; gap: 18px; }
.stat-value { font-size: 28px; font-weight: 600; color: #303133; line-height: 1.1; }
.stat-label { font-size: 12px; color: #909399; margin-top: 2px; }
.stat-meta { font-size: 13px; color: #606266; }
.stat-spacer { flex: 1; }

.file-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.file-name { font-size: 13px; font-weight: 500; color: #303133; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-name.muted { color: #909399; font-weight: normal; }
.form-hint { color: #909399; font-size: 12px; margin-top: 6px; }
.block { margin-top: 10px; }

.parsed-block { margin-top: 14px; padding-top: 14px; border-top: 1px solid #ebeef5; display: flex; flex-direction: column; gap: 8px; }
.parsed-count { font-size: 14px; color: #303133; i { color: #67c23a; margin-right: 4px; } }
.parsed-preview { font-size: 12px; }
.mode-group { display: flex; flex-direction: column; gap: 8px; margin: 6px 0 4px; }
.radio-hint { color: #909399; font-weight: normal; font-size: 12px; }

.check-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.check-input { width: 280px; max-width: 100%; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.muted { color: #909399; }
</style>
