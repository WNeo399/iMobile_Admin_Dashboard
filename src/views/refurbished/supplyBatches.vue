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
                    <el-tag v-else-if="s.row.received === s.row.total && s.row.total" size="mini" type="success"
                        effect="plain">Received</el-tag>
                    <el-tag v-else size="mini" type="warning" effect="plain">In Transit</el-tag>
                </template>
            </el-table-column>
            <el-table-column label="" width="130" align="center">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-view" @click="openDetail(s.row)">View</el-button>
                    <el-button v-if="s.row.status !== 'Cancelled' && !s.row.received" size="mini" type="text"
                        class="sb-cancel" @click="cancelBatch(s.row)">Cancel</el-button>
                </template>
            </el-table-column>
        </el-table>

        <!-- ── Create ───────────────────────────────────────────────── -->
        <el-dialog title="New Supply Batch" :visible.sync="createVisible" width="820px" top="6vh"
            :close-on-click-modal="false">
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

                <el-table v-if="form.lines.length" :data="form.lines" border size="mini" max-height="300">
                    <el-table-column label="IMEI" min-width="150">
                        <template slot-scope="s"><b>{{ s.row.imei }}</b></template>
                    </el-table-column>
                    <el-table-column label="Device" min-width="220" show-overflow-tooltip>
                        <template slot-scope="s">
                            {{ [s.row.model, s.row.storage, s.row.color].filter(Boolean).join(' · ') || '—' }}
                        </template>
                    </el-table-column>
                    <el-table-column label="Grade" width="70" align="center">
                        <template slot-scope="s">{{ s.row.grade || '—' }}</template>
                    </el-table-column>
                    <el-table-column label="Cost" width="110" align="right">
                        <template slot-scope="s">
                            {{ s.row.costPrice == null ? '—' : (s.row.currency || 'AUD') + ' ' + Number(s.row.costPrice).toFixed(2) }}
                        </template>
                    </el-table-column>
                    <el-table-column label="" width="50" align="center">
                        <template slot-scope="s">
                            <el-button size="mini" type="text" icon="el-icon-close" class="sb-cancel"
                                @click="form.lines.splice(s.$index, 1)" />
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
                    @click="save">Send to iMobile</el-button>
            </span>
        </el-dialog>

        <!-- ── Detail ───────────────────────────────────────────────── -->
        <el-dialog :title="detail ? detail.batchNo : ''" :visible.sync="detailVisible" width="760px">
            <div v-if="detail" class="sb-detail">
                <div class="sb-detail-grid">
                    <div v-if="!isSupplier"><label>Stock Source</label><div>{{ detail.stockSource }}</div></div>
                    <div><label>Created</label><div>{{ formatDateTime(detail.createdAt) }} · {{ detail.createdBy || '—' }}</div></div>
                    <div><label>Received</label><div>{{ detail.received }} / {{ detail.total }}</div></div>
                    <div v-if="detail.tracking"><label>Tracking</label><div>{{ detail.tracking }}</div></div>
                    <div v-if="detail.status === 'Cancelled'">
                        <label>Cancelled</label>
                        <div>{{ formatDateTime(detail.cancelledAt) }} · {{ detail.cancelledBy || '—' }}</div>
                    </div>
                </div>
                <el-table :data="detail.lines" border size="mini" max-height="380">
                    <el-table-column label="IMEI" min-width="150">
                        <template slot-scope="s"><b>{{ s.row.imei }}</b></template>
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
                <el-button size="small" @click="detailVisible = false">Close</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import { getSupplyBatches, getSupplyBatch, createSupplyBatch, cancelSupplyBatch, getRefurbDevices } from '@/api/refurbished'

export default {
    name: 'RefurbSupplyBatches',
    data() {
        return {
            loading: false,
            rows: [],

            createVisible: false,
            creating: false,
            form: { notes: '', tracking: '', lines: [] },
            pickerSearch: '',
            pickerResults: [],
            pickerLoading: false,
            pickerSearched: false,

            detailVisible: false,
            detail: null
        }
    },
    computed: {
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
            this.form = { notes: '', tracking: '', lines: [] }
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
            } catch (e) {
                this.$message.error(this.msg(e, 'Search failed'))
            } finally {
                this.pickerLoading = false
            }
        },
        isPicked(d) {
            return this.form.lines.some(l => String(l.deviceId) === String(d._id))
        },
        addLine(d) {
            if (this.isPicked(d)) return
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
            this.creating = true
            try {
                const r = await createSupplyBatch({
                    notes: this.form.notes,
                    tracking: this.form.tracking,
                    deviceIds: this.form.lines.map(l => l.deviceId)
                })
                this.$message.success(r.message || 'Supply batch created')
                if ((r.skipped || []).length) {
                    this.$notify.warning({
                        title: 'Some devices were skipped',
                        message: r.skipped.map(s => `${s.imei}: ${s.reason}`).join('\n'),
                        duration: 0
                    })
                }
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
