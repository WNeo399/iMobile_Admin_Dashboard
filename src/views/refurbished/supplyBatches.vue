<template>
    <div class="sb-page app-container">
        <div class="sb-bar">
            <span class="sb-title">Supply Batches</span>
            <span class="sb-spacer" />
            <!-- Creation is the supplier's act — staff watch and receive. -->
            <el-button v-if="isSupplier" size="small" type="primary" plain icon="el-icon-plus" @click="openCreate">New Batch</el-button>
            <el-button size="small" icon="el-icon-refresh" @click="load">Refresh</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini"
            :empty-text="isSupplier ? 'No supply batches yet — create one to send devices to iMobile.' : 'No supply batches yet.'">
            <el-table-column label="Batch" width="120">
                <template slot-scope="s">
                    <el-button type="text" class="sb-link" @click="openDetail(s.row)">{{ s.row.batchNo }}</el-button>
                </template>
            </el-table-column>
            <el-table-column v-if="!isSupplier" label="Stock Source" min-width="120" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.stockSource || '—' }}</template>
            </el-table-column>
            <el-table-column label="Devices" width="90" align="center">
                <template slot-scope="s">{{ s.row.total }}</template>
            </el-table-column>
            <el-table-column label="Received" width="110" align="center">
                <template slot-scope="s">
                    <span :class="s.row.received === s.row.total && s.row.total ? 'sb-ok' : ''">
                        {{ s.row.received }} / {{ s.row.total }}
                    </span>
                </template>
            </el-table-column>
            <el-table-column label="Tracking" min-width="130" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.tracking || '—' }}</template>
            </el-table-column>
            <el-table-column label="Notes" min-width="160" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.notes || '—' }}</template>
            </el-table-column>
            <el-table-column label="Created" width="160">
                <template slot-scope="s">
                    <div>{{ formatDateTime(s.row.createdAt) }}</div>
                    <div v-if="s.row.createdBy" class="sb-sub">{{ s.row.createdBy }}</div>
                </template>
            </el-table-column>
            <el-table-column label="Status" width="110" align="center">
                <template slot-scope="s">
                    <el-tag v-if="s.row.status === 'Cancelled'" size="mini" type="info" effect="plain">Cancelled</el-tag>
                    <el-tag v-else-if="s.row.status === 'Pending'" size="mini" type="warning" effect="plain">Pending</el-tag>
                    <el-tag v-else-if="s.row.received === s.row.total && s.row.total" size="mini" type="success"
                        effect="plain">Received</el-tag>
                    <el-tag v-else size="mini" effect="plain">In Transit</el-tag>
                </template>
            </el-table-column>
            <el-table-column label="" width="200" align="center">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-view" @click="openDetail(s.row)">View</el-button>
                    <!-- A Pending batch is still the supplier's draft. -->
                    <el-button v-if="isSupplier && s.row.status === 'Pending'" size="mini" type="text"
                        icon="el-icon-edit" @click="openEdit(s.row)">Edit</el-button>
                    <el-button v-if="isSupplier && s.row.status === 'Pending'" size="mini" type="text"
                        icon="el-icon-check" @click="confirmBatch(s.row)">Confirm</el-button>
                    <el-button v-if="s.row.status !== 'Cancelled' && !s.row.received" size="mini" type="text"
                        class="sb-cancel" @click="cancelBatch(s.row)">Cancel</el-button>
                </template>
            </el-table-column>
        </el-table>

        <!-- ── Create ───────────────────────────────────────────────── -->
        <el-dialog :title="editing ? `Edit ${editing.batchNo}` : 'New Supply Batch'"
            :visible.sync="createVisible" width="820px" top="6vh" :close-on-click-modal="false">
            <div class="sb-form">
                <div class="sb-field">
                    <label>Add devices <span class="sb-dim">— search your In&nbsp;Stock devices by IMEI / serial / model</span></label>
                    <el-input v-model="pickerSearch" size="small" clearable placeholder="Scan or type, then Enter…"
                        prefix-icon="el-icon-search" @keyup.enter.native="searchDevices" @clear="pickerResults = []">
                        <el-button slot="append" icon="el-icon-search" :loading="pickerLoading" @click="searchDevices" />
                    </el-input>
                    <div v-if="pickerResults.length" class="sb-picker">
                        <div v-for="d in pickerResults" :key="d._id" class="sb-pick-row">
                            <div class="sb-pick-info">
                                <b>{{ d.imei }}</b>
                                <span>{{ [d.model, d.storage, d.color, d.grade].filter(Boolean).join(' · ') || '—' }}</span>
                            </div>
                            <el-button size="mini" type="primary" plain icon="el-icon-plus"
                                :disabled="isPicked(d)" @click="addLine(d)">
                                {{ isPicked(d) ? 'Added' : 'Add' }}
                            </el-button>
                        </div>
                    </div>
                    <div v-else-if="pickerSearched && !pickerLoading" class="sb-dim sb-noresult">
                        No matching devices — only units on your shelf (or In Stock) can be sent.
                    </div>
                </div>

                <el-table v-if="form.lines.length" :data="groupedFormLines" border size="mini" max-height="300"
                    :row-class-name="lineRowClass" :span-method="lineSpan"
                    @row-click="r => toggleGroup(r, collapsedFormGroups)">
                    <el-table-column label="IMEI" min-width="150">
                        <template slot-scope="s">
                            <div v-if="s.row.__group" class="sb-group">
                                <i :class="s.row.collapsed ? 'el-icon-arrow-right' : 'el-icon-arrow-down'" />
                                {{ s.row.model }}
                                <span class="sb-dim">· {{ s.row.count }} device{{ s.row.count === 1 ? '' : 's' }}</span>
                            </div>
                            <div v-else><b>{{ s.row.imei }}</b></div>
                            <!-- A scanned code that isn't on the register yet:
                                 created on your shelf when the batch is made. -->
                            <div v-if="s.row.bbChecking" class="sb-li-sub sb-dim">
                                <i class="el-icon-loading" /> checking Blackbelt…
                            </div>
                            <div v-else-if="s.row.isNew" :class="['sb-li-sub', s.row.bbFound ? 'sb-li-ok' : 'sb-li-warn']">
                                <i :class="s.row.bbFound ? 'el-icon-success' : 'el-icon-warning'" />
                                new — {{ s.row.bbFound ? 'Blackbelt found' : 'no Blackbelt report' }}
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column label="Device" min-width="280">
                        <template slot-scope="s">
                            <!-- Blackbelt's answer is the identity; typing is
                                 only for devices it doesn't know. -->
                            <div v-if="s.row.isNew && !s.row.bbFound && !s.row.bbChecking" class="sb-line-edit">
                                <!-- Typed into a draft field and committed on
                                     blur — the grouping keys on the model, so
                                     committing per keystroke would re-sort
                                     the table out from under the cursor. -->
                                <el-input :value="s.row.modelDraft" size="mini" placeholder="Model *" class="sble-model"
                                    @input="v => s.row.modelDraft = v"
                                    @change="commitModel(s.row)" />
                                <el-input :value="s.row.color" size="mini" placeholder="Colour" class="sble-small"
                                    @input="v => s.row.color = v.toUpperCase()" />
                                <el-select v-model="s.row.storage" size="mini" clearable filterable allow-create
                                    default-first-option placeholder="Storage" class="sble-small">
                                    <el-option v-for="o in storageOptions" :key="o" :label="o" :value="o" />
                                </el-select>
                            </div>
                            <template v-else>
                                {{ [s.row.model, s.row.storage, s.row.color].filter(Boolean).join(' · ') || '—' }}
                            </template>
                        </template>
                    </el-table-column>
                    <el-table-column label="Grade" width="95" align="center">
                        <template slot-scope="s">
                            <el-select v-if="s.row.isNew" v-model="s.row.grade" size="mini" clearable placeholder="—"
                                class="sb-full">
                                <el-option v-for="g in gradeOptions" :key="g" :label="g" :value="g" />
                            </el-select>
                            <template v-else>{{ s.row.grade || '—' }}</template>
                        </template>
                    </el-table-column>
                    <el-table-column label="Cost" width="110" align="right">
                        <template slot-scope="s">
                            <el-input-number v-if="s.row.isNew" v-model="s.row.costPrice" size="mini" :min="0"
                                :precision="2" :controls="false" class="sble-cost" />
                            <template v-else>
                                {{ s.row.costPrice == null ? '—' : (s.row.currency || 'AUD') + ' ' + Number(s.row.costPrice).toFixed(2) }}
                            </template>
                        </template>
                    </el-table-column>
                    <el-table-column label="" width="50" align="center">
                        <template slot-scope="s">
                            <el-button v-if="!s.row.__group" size="mini" type="text" icon="el-icon-close"
                                class="sb-cancel" @click="removeLine(s.row)" />
                        </template>
                    </el-table-column>
                </el-table>

                <div class="sb-row">
                    <div class="sb-field sb-grow">
                        <label>Tracking Number</label>
                        <el-input v-model="form.tracking" size="small" maxlength="100" clearable
                            placeholder="Optional — the courier's tracking number" />
                    </div>
                </div>
                <div class="sb-field">
                    <label>Notes</label>
                    <el-input v-model="form.notes" type="textarea" :rows="2" maxlength="1000" size="small"
                        placeholder="Optional — courier, anything the warehouse should know" />
                </div>
            </div>
            <span slot="footer">
                <span v-if="form.lines.length" class="sb-foot-note">
                    {{ form.lines.length }} device{{ form.lines.length === 1 ? '' : 's' }}
                </span>
                <el-button size="small" @click="createVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" :loading="creating" :disabled="!form.lines.length"
                    @click="save">{{ editing ? 'Save Changes' : 'Save' }}</el-button>
            </span>
        </el-dialog>

        <!-- ── Detail ───────────────────────────────────────────────── -->
        <el-dialog :title="detail ? detail.batchNo : ''" :visible.sync="detailVisible" width="760px">
            <div v-if="detail" class="sb-detail">
                <div class="sb-detail-grid">
                    <div v-if="!isSupplier"><label>Stock Source</label><div>{{ detail.stockSource }}</div></div>
                    <div><label>Created</label><div>{{ formatDateTime(detail.createdAt) }} · {{ detail.createdBy || '—' }}</div></div>
                    <div><label>Status</label><div>{{ detail.status }}</div></div>
                    <div v-if="detail.confirmedAt">
                        <label>Confirmed</label>
                        <div>{{ formatDateTime(detail.confirmedAt) }} · {{ detail.confirmedBy || '—' }}</div>
                    </div>
                    <div v-if="detail.status !== 'Pending'"><label>Received</label><div>{{ detail.received }} / {{ detail.total }}</div></div>
                    <div v-if="detail.tracking"><label>Tracking</label><div>{{ detail.tracking }}</div></div>
                    <div v-if="detail.status === 'Cancelled'">
                        <label>Cancelled</label>
                        <div>{{ formatDateTime(detail.cancelledAt) }} · {{ detail.cancelledBy || '—' }}</div>
                    </div>
                </div>
                <el-table :data="groupedDetailLines" border size="mini" max-height="380"
                    :row-class-name="r => (r.row.__group ? 'sb-row-grouphead' : '')" :span-method="lineSpan"
                    @row-click="r => toggleGroup(r, collapsedDetailGroups)">
                    <el-table-column label="IMEI" min-width="150">
                        <template slot-scope="s">
                            <div v-if="s.row.__group" class="sb-group">
                                <i :class="s.row.collapsed ? 'el-icon-arrow-right' : 'el-icon-arrow-down'" />
                                {{ s.row.model }}
                                <span class="sb-dim">· {{ s.row.count }} device{{ s.row.count === 1 ? '' : 's' }}</span>
                                <span v-if="s.row.receivedCount" class="sb-group-recv">· {{ s.row.receivedCount }} received</span>
                                <span :class="s.row.remainingCount ? 'sb-group-rem' : 'sb-dim'">· {{ s.row.remainingCount }} remaining</span>
                            </div>
                            <b v-else>{{ s.row.imei }}</b>
                        </template>
                    </el-table-column>
                    <el-table-column label="Device" min-width="210" show-overflow-tooltip>
                        <template slot-scope="s">
                            {{ [s.row.model, s.row.storage, s.row.color].filter(Boolean).join(' · ') || '—' }}
                        </template>
                    </el-table-column>
                    <el-table-column label="Grade" width="70" align="center">
                        <template slot-scope="s">{{ s.row.grade || '—' }}</template>
                    </el-table-column>
                    <el-table-column label="Received" width="150" align="center">
                        <template slot-scope="s">
                            <el-tag v-if="s.row.received" size="mini" type="success" effect="plain"
                                :title="formatDateTime(s.row.receivedAt)">Received</el-tag>
                            <span v-else class="sb-dim">In transit</span>
                        </template>
                    </el-table-column>
                </el-table>
                <div v-if="detail.notes" class="sb-notes">{{ detail.notes }}</div>
            </div>
            <span slot="footer">
                <el-button size="small" icon="el-icon-download" @click="downloadXlsx">Excel</el-button>
                <el-button size="small" icon="el-icon-document" @click="downloadPdf">PDF</el-button>
                <el-button v-if="isSupplier && detail && detail.status === 'Pending'" size="small" type="success" plain
                    icon="el-icon-check" @click="confirmBatch(detail)">Confirm</el-button>
                <el-button size="small" @click="detailVisible = false">Close</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import {
    getSupplyBatches, getSupplyBatch, createSupplyBatch, updateSupplyBatch,
    confirmSupplyBatch, cancelSupplyBatch,
    getRefurbDevices, lookupRefurbDevice, createRefurbDevice
} from '@/api/refurbished'

import { buildSupplyBatchPdf, supplyBatchPdfFileName, groupSupplyLines } from '@/utils/supplyBatchPdf'
import * as XLSX from 'xlsx-js-style'

const GRADES = ['A++', 'A+', 'A', 'B+', 'B', 'C+', 'C']
const STORAGES = ['16GB', '32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB']
const CODE_RE = /^[A-Z0-9]{10,20}$/

export default {
    name: 'RefurbSupplyBatches',
    data() {
        return {
            loading: false,
            rows: [],

            createVisible: false,
            creating: false,
            editing: null,
            form: { notes: '', tracking: '', lines: [] },
            // Model groups folded shut, per dialog, by name.
            collapsedFormGroups: {},
            collapsedDetailGroups: {},
            pickerSearch: '',
            pickerResults: [],
            pickerLoading: false,
            pickerSearched: false,

            detailVisible: false,
            detail: null
        }
    },
    computed: {
        gradeOptions() { return GRADES },
        // Both dialog tables show the lines grouped by model under
        // full-width header rows (lineSpan collapses the other cells).
        groupedFormLines() {
            const out = []
            for (const g of groupSupplyLines(this.form.lines)) {
                const collapsed = !!this.collapsedFormGroups[g.name]
                out.push({ __group: true, model: g.name, count: g.rows.length, collapsed })
                if (!collapsed) out.push(...g.rows)
            }
            return out
        },
        groupedDetailLines() {
            const out = []
            for (const g of groupSupplyLines((this.detail && this.detail.lines) || [])) {
                const received = g.rows.filter(r => r.received).length
                const collapsed = !!this.collapsedDetailGroups[g.name]
                out.push({
                    __group: true,
                    model: g.name,
                    count: g.rows.length,
                    receivedCount: received,
                    remainingCount: g.rows.length - received,
                    collapsed
                })
                if (!collapsed) out.push(...g.rows)
            }
            return out
        },
        storageOptions() { return STORAGES },
        isSupplier() {
            return (this.$store.getters.roles || []).includes('phone-supplier')
        }
    },
    created() {
        this.load()
        // Landed here from the Stock page's Bulk Action (suppliers only).
        if (this.$route.query.create) {
            this.$router.replace({ query: {} })
            if (this.isSupplier) this.openCreate()
        }
    },
    methods: {
        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || fallback
        },
        formatDateTime(v) {
            if (!v) return '—'
            const d = new Date(v)
            if (isNaN(d.getTime())) return '—'
            const p = x => String(x).padStart(2, '0')
            return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
        },
        async load() {
            this.loading = true
            try {
                const r = await getSupplyBatches()
                this.rows = r.batches || []
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load supply batches'))
            } finally {
                this.loading = false
            }
        },

        // ── create ───────────────────────────────────────────────────
        openCreate() {
            this.editing = null
            this.form = { notes: '', tracking: '', lines: [] }
            this.collapsedFormGroups = {}
            this.pickerSearch = ''
            this.pickerResults = []
            this.pickerSearched = false
            this.createVisible = true
        },
        // The list endpoint scopes a supplier to their own shelf, so the
        // picker can only ever surface devices they may send.
        async searchDevices() {
            const q = this.pickerSearch.trim()
            if (!q) { this.pickerResults = []; this.pickerSearched = false; return }
            this.pickerLoading = true
            try {
                // Our In Stock units and the supplier's own shelf both board.
                const r = await getRefurbDevices({ search: q, status: 'In Stock,With Supplier', page: 1, pageSize: 20 })
                this.pickerResults = r.rows || []
                this.pickerSearched = true
                // A scan that matches exactly one device goes straight in.
                if (this.pickerResults.length === 1 && !this.isPicked(this.pickerResults[0])) {
                    this.addLine(this.pickerResults[0])
                    this.pickerSearch = ''
                    this.pickerResults = []
                    this.pickerSearched = false
                }
                // A code-shaped scan with no hit joins the batch as a new
                // record on your shelf: Blackbelt is asked automatically,
                // and where it has no report the details are typed on the
                // line. Created at Send to iMobile.
                if (!this.pickerResults.length) {
                    const code = q.replace(/[\s-]/g, '').toUpperCase()
                    if (CODE_RE.test(code)) {
                        this.addDraftLine(code)
                        this.pickerSearch = ''
                        this.pickerSearched = false
                    }
                }
            } catch (e) {
                this.$message.error(this.msg(e, 'Search failed'))
            } finally {
                this.pickerLoading = false
            }
        },
        lineRowClass({ row }) {
            if (row.__group) return 'sb-row-grouphead'
            return row.isNew ? 'sb-row-new' : ''
        },
        lineSpan({ row, columnIndex }) {
            if (!row.__group) return [1, 1]
            return columnIndex === 0 ? [1, 99] : [0, 0]
        },
        // A Pending batch reopens in the create dialog with its lines.
        openEdit(row) {
            this.editing = row
            this.form = {
                notes: row.notes || '',
                tracking: row.tracking || '',
                lines: (row.lines || []).map(l => ({
                    deviceId: String(l.deviceId),
                    imei: l.imei,
                    model: l.model || '',
                    color: l.color || '',
                    storage: l.storage || '',
                    grade: l.grade || '',
                    costPrice: l.costPrice == null ? null : l.costPrice,
                    currency: l.currency || 'AUD'
                }))
            }
            this.collapsedFormGroups = {}
            this.pickerSearch = ''
            this.pickerResults = []
            this.pickerSearched = false
            this.createVisible = true
        },
        async confirmBatch(row) {
            try {
                await this.$confirm(
                    `Confirm ${row.batchNo}? The devices go on the road to iMobile and the warehouse gets its receiving list.`,
                    'Confirm supply batch',
                    { type: 'warning', confirmButtonText: 'Confirm', cancelButtonText: 'Not yet' }
                )
            } catch (e) { return }
            try {
                const r = await confirmSupplyBatch(row._id)
                this.$message.success(r.message || 'Confirmed')
                if ((r.skipped || []).length) {
                    this.$notify.warning({
                        title: 'Some devices were skipped',
                        message: r.skipped.map(s => `${s.imei}: ${s.reason}`).join('\n'),
                        duration: 0
                    })
                }
                this.detailVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to confirm the batch'))
            }
        },
        toggleGroup(row, state) {
            if (!row.__group) return
            this.$set(state, row.model, !state[row.model])
        },
        // Anything newly added lands visibly — its group unfolds.
        unfoldFor(model) {
            const k = String(model || '').trim() || '(No model)'
            if (this.collapsedFormGroups[k]) this.$set(this.collapsedFormGroups, k, false)
        },
        // The blur (or Enter) commits the typed model, which is when the
        // row jumps to its model group.
        commitModel(row) {
            row.model = String(row.modelDraft || '').trim()
            this.unfoldFor(row.model)
        },
        removeLine(row) {
            const i = this.form.lines.findIndex(l => l.imei === row.imei)
            if (i >= 0) this.form.lines.splice(i, 1)
        },
        // ── downloads — the same grouped list, on paper or in a sheet ─
        downloadPdf() {
            try {
                buildSupplyBatchPdf({ batch: this.detail }).save(supplyBatchPdfFileName(this.detail))
            } catch (e) {
                console.error('Supply batch PDF failed:', e)
                this.$message.error('Could not build the PDF.')
            }
        },
        downloadXlsx() {
            try {
                const d = this.detail
                const head = { font: { bold: true } }
                const rows = [
                    [{ v: d.batchNo, s: { font: { bold: true, sz: 14 } } }],
                    ['From', d.stockSource || ''],
                    ['Tracking #', d.tracking || ''],
                    ['Created', this.formatDateTime(d.createdAt) + (d.createdBy ? ' · ' + d.createdBy : '')],
                    ['Notes', d.notes || ''],
                    [],
                    ['Model', 'IMEI / Serial', 'Colour', 'Storage', 'Grade', 'Cost', 'Currency', 'Received', 'Received At']
                        .map(v => ({ v, s: head }))
                ]
                for (const g of groupSupplyLines(d.lines || [])) {
                    rows.push([{ v: `${g.name} — ${g.rows.length} device${g.rows.length === 1 ? '' : 's'}`, s: head }])
                    for (const l of g.rows) {
                        rows.push([
                            l.model || '', l.imei || '', l.color || '', l.storage || '', l.grade || '',
                            l.costPrice == null ? '' : Number(l.costPrice), l.currency || 'AUD',
                            l.received ? 'Yes' : '', l.receivedAt ? this.formatDateTime(l.receivedAt) : ''
                        ])
                    }
                }
                const ws = XLSX.utils.aoa_to_sheet(rows)
                ws['!cols'] = [{ wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 9 }, { wch: 9 }, { wch: 17 }]
                const wb = XLSX.utils.book_new()
                XLSX.utils.book_append_sheet(wb, ws, d.batchNo)
                XLSX.writeFile(wb, `supply-batch_${String(d.batchNo).replace(/[^\w.-]+/g, '_')}.xlsx`)
            } catch (e) {
                console.error('Supply batch xlsx failed:', e)
                this.$message.error('Could not build the spreadsheet.')
            }
        },
        async addDraftLine(code) {
            if (this.form.lines.some(l => String(l.imei).toUpperCase() === code)) {
                this.$message.warning(code + ' is already on the batch')
                return
            }
            // Every field seeded now — Vue 2 can't track keys added later.
            const line = {
                deviceId: null,
                isNew: true,
                imei: code,
                model: '', modelDraft: '', color: '', storage: '', grade: '',
                costPrice: undefined,
                currency: 'AUD',
                bbChecking: true,
                bbFound: false,
                bb: {}
            }
            this.form.lines.push(line)
            this.unfoldFor('')
            try {
                const r = await lookupRefurbDevice(code)
                if (r && r.alreadyInStock) {
                    // In the register but the picker didn't offer it — not
                    // sendable (sold, away, already moving) or not this
                    // supplier's shelf.
                    const i = this.form.lines.indexOf(line)
                    if (i >= 0) this.form.lines.splice(i, 1)
                    this.$message.warning(code + ' is already in the register but not sendable — check it on the Stock page.')
                    return
                }
                const d = (r && r.device) || {}
                line.model = d.model || ''
                line.modelDraft = d.model || ''
                this.unfoldFor(line.model)
                line.color = d.color || ''
                line.storage = d.storage || ''
                // Passed through to the create so the record matches one
                // added from the Stock page.
                line.bb = {
                    brand: d.brand || '',
                    serialNumber: d.serialNumber || '',
                    batteryHealth: d.batteryHealth == null ? null : d.batteryHealth,
                    batteryCycleCount: d.batteryCycleCount == null ? null : d.batteryCycleCount,
                    batteryCapacity: d.batteryCapacity || '',
                    aNumber: d.aNumber || '',
                    blackbeltChecked: (r && r.blackbeltChecked) === true,
                    blackbeltReportId: (r && r.blackbeltReportId) || '',
                    blackbeltStatus: (r && r.blackbeltStatus) || ''
                }
                line.bbFound = !!(r && r.found)
            } catch (e) {
                // Lookup failing is not fatal — the line stays editable.
            } finally {
                line.bbChecking = false
            }
        },
        isPicked(d) {
            return this.form.lines.some(l => String(l.deviceId) === String(d._id))
        },
        addLine(d) {
            if (this.isPicked(d)) return
            this.unfoldFor(d.model)
            this.form.lines.push({
                deviceId: String(d._id),
                imei: d.imei,
                model: d.model || '',
                color: d.color || '',
                storage: d.storage || '',
                grade: d.grade || '',
                costPrice: d.costPrice == null ? null : d.costPrice,
                currency: d.currency || 'AUD'
            })
        },
        async save() {
            const stillChecking = this.form.lines.find(l => l.bbChecking)
            if (stillChecking) {
                this.$message.warning(`Still checking ${stillChecking.imei} against Blackbelt — one moment`)
                return
            }
            // A model typed but never blurred still counts.
            for (const l of this.form.lines) {
                if (l.isNew && !String(l.model || '').trim() && String(l.modelDraft || '').trim()) {
                    this.commitModel(l)
                }
            }
            const noModel = this.form.lines.find(l => l.isNew && !String(l.model || '').trim())
            if (noModel) {
                this.$message.warning(`Enter a model for ${noModel.imei}`)
                return
            }
            this.creating = true
            try {
                // Scanned-in devices join the register first (on this
                // supplier's shelf, as With Supplier), so the batch only
                // ever references real stock records. A line that gets its
                // id keeps it — a retry doesn't create the device twice.
                for (const l of this.form.lines.filter(x => x.isNew && !x.deviceId)) {
                    const r = await createRefurbDevice({
                        imei: l.imei,
                        model: l.model,
                        color: l.color,
                        storage: l.storage,
                        grade: l.grade,
                        costPrice: l.costPrice,
                        currency: l.currency || 'AUD',
                        ...l.bb
                    })
                    if (!r || r.success === false) throw new Error((r && r.message) || `Could not add ${l.imei} to the register`)
                    l.deviceId = String(r.id)
                }
                const payload = {
                    notes: this.form.notes,
                    tracking: this.form.tracking,
                    deviceIds: this.form.lines.map(l => l.deviceId)
                }
                const r = this.editing
                    ? await updateSupplyBatch(this.editing._id, payload)
                    : await createSupplyBatch(payload)
                this.$message.success(r.message || 'Saved')
                this.createVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to create the supply batch'))
            } finally {
                this.creating = false
            }
        },

        // ── detail / cancel ──────────────────────────────────────────
        async openDetail(row) {
            try {
                const r = await getSupplyBatch(row._id)
                this.detail = r.batch
                this.collapsedDetailGroups = {}
                this.detailVisible = true
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load the batch'))
            }
        },
        async cancelBatch(row) {
            try {
                await this.$confirm(
                    `Cancel ${row.batchNo}? The devices go back In Stock where they were, ` +
                    'and the Incoming Stocks record is removed.',
                    'Cancel supply batch',
                    { type: 'warning', confirmButtonText: 'Cancel batch', cancelButtonText: 'Keep it' }
                )
            } catch (e) { return }
            try {
                const r = await cancelSupplyBatch(row._id)
                this.$message.success(r.message || 'Batch cancelled')
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to cancel the batch'))
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.sb-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.sb-title { font-size: 16px; font-weight: 600; color: #303133; }
.sb-spacer { flex: 1; }
.sb-link { font-weight: 600; padding: 0; }
.sb-sub { font-size: 11px; color: #909399; line-height: 1.3; }
.sb-dim { color: #909399; }
.sb-ok { color: #67c23a; font-weight: 600; }
.sb-cancel { color: #f56c6c; }
.sb-foot-note { font-size: 12px; color: #909399; margin-right: 10px; }

.sb-form { display: flex; flex-direction: column; gap: 12px; }
.sb-row { display: flex; gap: 14px; }
.sb-grow { flex: 1; }
.sb-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    label { font-size: 12px; font-weight: 600; color: #606266; }
}
.sb-picker {
    margin-top: 8px;
    border: 1px solid #ebeef5;
    border-radius: 6px;
    max-height: 180px;
    overflow: auto;
}
.sb-pick-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 7px 10px;

    + .sb-pick-row { border-top: 1px solid #f2f4f7; }
}
.sb-pick-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    span { font-size: 12px; color: #909399; }
}
.sb-noresult { padding: 8px 2px; font-size: 12px; }
.sb-li-sub { font-size: 11px; line-height: 1.4; margin-top: 1px; }
.sb-li-ok { color: #67c23a; }
.sb-li-warn { color: #e6a23c; }
.sb-line-edit { display: flex; gap: 6px; }
.sble-model { flex: 1; min-width: 120px; }
.sble-small { width: 100px; }
.sble-cost { width: 90px; }
.sb-full { width: 100%; }
.sb-group { font-size: 12px; font-weight: 700; color: #303133; white-space: nowrap; }
.sb-group-recv { color: #67c23a; font-weight: 600; }
.sb-group-rem { color: #e6a23c; font-weight: 600; }
::v-deep .el-table .sb-row-grouphead > td { background: #f4f6fa; cursor: pointer; }
::v-deep .el-table .sb-row-grouphead:hover > td { background: #eef1f7; }
::v-deep .el-table .sb-row-new > td { background: #fdf9ee; }
::v-deep .el-table .sb-row-new:hover > td { background: #faf3e0; }

.sb-detail { display: flex; flex-direction: column; gap: 12px; }
.sb-detail-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px 16px;
    label { font-size: 11px; color: #909399; text-transform: uppercase; letter-spacing: .04em; }
    div > div { font-size: 13px; color: #303133; }
}
.sb-notes {
    font-size: 12px; color: #606266; background: #f8f9fb;
    border: 1px solid #ebeef5; border-radius: 6px; padding: 8px 10px;
    white-space: pre-wrap;
}
</style>
