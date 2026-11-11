<template>
    <!--
        Refurbished Device → Repair Batches, for phone suppliers (user ask
        2026-11-04): Pending Stock devices waiting (待处理) go to one of their
        repairers in a batch, RPB-10001+, and turn 已分配; back from the
        repairer they are marked 已处理, one by one or the whole batch. The
        Pending Stock page does the same for a single device. Backend
        routes/refurbishedRoutes/precheckRepair.js.
    -->
    <div class="rrb app-container">
        <div class="rrb-filters">
            <el-input v-model="query.search" size="small" clearable class="f-search"
                :placeholder="$tp('Search batch / repairer / note…')" prefix-icon="el-icon-search"
                @keyup.enter.native="load" @clear="load" />
            <el-select v-model="query.repairerId" size="small" clearable filterable class="f-repairer" :placeholder="$tp('All repairers')" @change="load">
                <el-option v-for="r in repairers" :key="r._id" :label="r.name" :value="r._id" />
            </el-select>
            <el-radio-group v-model="query.status" size="small" @change="load">
                <el-radio-button label="">{{ $tp('All') }} {{ counts.all }}</el-radio-button>
                <el-radio-button label="open">{{ $tp('In progress') }} {{ counts.open }}</el-radio-button>
                <el-radio-button label="done">{{ $tp('Processed') }} {{ counts.done }}</el-radio-button>
            </el-radio-group>
            <span class="rrb-spacer" />
            <el-button v-if="canManage" size="small" type="primary" icon="el-icon-plus" @click="openPicker('new')">{{ $tp('New Batch') }}</el-button>
            <el-button size="small" icon="el-icon-refresh" @click="load">{{ $tp('Refresh') }}</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini" height="calc(100vh - 210px)"
            :empty-text="$tp('No repair batches yet — New Batch sends waiting devices to a repairer.')" @row-click="openBatch">
            <el-table-column :label="$tp('Batch')" width="120">
                <template slot-scope="s"><b class="rrb-link">{{ s.row.batchNo }}</b></template>
            </el-table-column>
            <el-table-column :label="$tp('Repairer')" min-width="150" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.repairer && s.row.repairer.name }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Processed')" min-width="170">
                <template slot-scope="s">
                    <div class="rrb-progress">
                        <el-progress :percentage="s.row.devices ? Math.round(s.row.processed / s.row.devices * 100) : 0" :show-text="false"
                            :status="s.row.status === 'done' ? 'success' : undefined" :stroke-width="6" />
                        <span>{{ s.row.processed }} / {{ s.row.devices }}</span>
                    </div>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Status')" width="100" align="center">
                <template slot-scope="s"><el-tag size="mini" :type="BATCH_STATUS[s.row.status].type">{{ $tp(BATCH_STATUS[s.row.status].label) }}</el-tag></template>
            </el-table-column>
            <el-table-column :label="$tp('Note')" min-width="200" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.note || '—' }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Created')" width="140">
                <template slot-scope="s">
                    <div>{{ fmtWhen(s.row.createdAt) }}</div>
                    <div class="rrb-dim">{{ s.row.createdBy || '' }}</div>
                </template>
            </el-table-column>
        </el-table>

        <!-- ── a new batch, or more devices for one: the waiting devices to pick from ── -->
        <el-dialog :title="pickMode === 'new' ? $tp('New Batch') : $tp('Add devices to {no}', { no: batch ? batch.batchNo : '' })"
            :visible.sync="pickVisible" :width="narrow ? '96%' : '760px'" top="6vh" append-to-body :close-on-click-modal="false" @opened="focusScan">
            <el-form v-if="pickMode === 'new'" label-width="80px" size="small" class="rrb-pick-form" @submit.native.prevent>
                <el-form-item :label="$tp('Repairer')" required>
                    <el-select v-model="pickForm.repairerId" filterable class="rrb-full" :placeholder="$tp('Pick the repairer')"
                        :no-data-text="$tp('No repairers yet — add them on the Repairers page')">
                        <el-option v-for="r in activeRepairers" :key="r._id" :label="r.name" :value="r._id" />
                    </el-select>
                </el-form-item>
                <el-form-item :label="$tp('Note')">
                    <el-input v-model="pickForm.note" maxlength="500" />
                </el-form-item>
            </el-form>
            <div class="rrb-pick-bar">
                <el-input ref="scan" v-model="scanText" size="small" clearable class="rrb-scan" prefix-icon="el-icon-full-screen"
                    :placeholder="$tp('Scan or type an IMEI and press Enter')" @keyup.enter.native="onScan" />
                <el-input v-model="pickSearch" size="small" clearable class="rrb-pick-search" prefix-icon="el-icon-search" :placeholder="$tp('Filter the list')" />
                <span class="rrb-dim">{{ $tp('{n} selected', { n: picked.length }) }}</span>
            </div>
            <el-table v-loading="pendingLoading" :data="pendingShown" border size="mini" height="46vh" row-key="_id"
                :empty-text="$tp('No devices waiting (待处理) on Pending Stock')" :row-class-name="pickRowClass" @row-click="togglePick">
                <el-table-column width="44" align="center">
                    <template slot="header">
                        <el-checkbox :value="allShownPicked" :indeterminate="someShownPicked && !allShownPicked" :disabled="!pendingShown.length" @change="pickAllShown" />
                    </template>
                    <template slot-scope="s"><el-checkbox :value="pickedSet.has(s.row._id)" @change="togglePick(s.row)" @click.native.stop /></template>
                </el-table-column>
                <el-table-column :label="$tp('IMEI')" min-width="160"><template slot-scope="s"><b class="rrb-mono">{{ s.row.imei }}</b></template></el-table-column>
                <el-table-column :label="$tp('Device')" min-width="190" show-overflow-tooltip><template slot-scope="s">{{ oneLine(s.row.device) || '—' }}</template></el-table-column>
                <el-table-column :label="$tp('Supplier')" min-width="120" show-overflow-tooltip><template slot-scope="s">{{ (s.row.supplier && s.row.supplier.name) || '—' }}</template></el-table-column>
                <el-table-column :label="$tp('Note')" min-width="150" show-overflow-tooltip><template slot-scope="s">{{ s.row.note || '—' }}</template></el-table-column>
            </el-table>
            <div slot="footer">
                <el-button size="small" @click="pickVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button size="small" type="primary" :loading="pickSaving" :disabled="!picked.length" @click="savePick">
                    {{ pickMode === 'new' ? $tp('Create batch with {n} device(s)', { n: picked.length }) : $tp('Add {n} device(s)', { n: picked.length }) }}</el-button>
            </div>
        </el-dialog>

        <!-- ── one batch ── -->
        <el-dialog :visible.sync="batchVisible" :width="narrow ? '96%' : '980px'" top="5vh" append-to-body
            @opened="layoutBatchTable" @closed="onBatchClosed">
            <div v-if="batch" slot="title" class="rrb-bt-head">
                <b>{{ batch.batchNo }}</b>
                <el-tag size="mini" :type="BATCH_STATUS[batch.status].type">{{ $tp(BATCH_STATUS[batch.status].label) }}</el-tag>
                <span class="rrb-dim">{{ batch.repairer && batch.repairer.name }} · {{ fmtWhen(batch.createdAt) }}<template v-if="batch.createdBy"> · {{ batch.createdBy }}</template></span>
            </div>
            <div v-loading="batchLoading">
                <template v-if="batch">
                    <div class="rrb-bt-info">
                        <div class="rrb-bt-progress">
                            <el-progress :percentage="batch.devices ? Math.round(batch.processed / batch.devices * 100) : 0"
                                :status="batch.status === 'done' ? 'success' : undefined" :stroke-width="10" :show-text="false" />
                            <span>{{ $tp('{n} of {total} processed', { n: batch.processed, total: batch.devices }) }}</span>
                        </div>
                        <div class="rrb-bt-note">
                            <el-input v-model="noteDraft" size="small" maxlength="500" :disabled="!canManage" :placeholder="$tp('Note')" />
                            <el-button v-if="canManage && noteDraft !== (batch.note || '')" size="small" type="primary" plain :loading="noteSaving" @click="saveNote">{{ $tp('Save') }}</el-button>
                        </div>
                    </div>
                    <div v-if="canManage" class="rrb-bt-tools">
                        <el-button size="small" icon="el-icon-plus" @click="openPicker('add')">{{ $tp('Add devices') }}</el-button>
                        <el-button v-if="selectedOpen.length" size="small" type="success" plain icon="el-icon-check" :loading="acting" @click="setStatus(selectedOpen, 'done')">
                            {{ $tp('Mark {n} processed', { n: selectedOpen.length }) }}</el-button>
                        <span class="rrb-spacer" />
                        <el-button v-if="batch.devices && batch.processed < batch.devices" size="small" type="success" icon="el-icon-finished" :loading="acting" @click="finishBatch">
                            {{ $tp('Mark all processed') }}</el-button>
                        <el-button v-if="!batch.devices" size="small" type="danger" plain icon="el-icon-delete" @click="removeBatch">{{ $tp('Delete batch') }}</el-button>
                    </div>
                    <!-- max-height in PIXELS: Element only gives the body a scroll
                         area for a number — "52vh" clipped the rows with no scroll
                         bar (2026-11-11, an 83-device batch) -->
                    <!-- IMEI search + status filter (2026-11-11), in the page: the whole batch is loaded -->
                    <div v-if="batchRows.length" class="rrb-bt-filter">
                        <el-input v-model="batchSearch" size="small" clearable class="rrb-bt-search" prefix-icon="el-icon-search"
                            :placeholder="$tp('Search IMEI / device')" />
                        <el-radio-group v-model="batchStatus" size="small">
                            <el-radio-button label="">{{ $tp('All') }} {{ batchRows.length }}</el-radio-button>
                            <el-radio-button label="assigned">{{ $tp('In repair') }} {{ openRows.length }}</el-radio-button>
                            <el-radio-button label="done">{{ $tp('Processed') }} {{ batchRows.length - openRows.length }}</el-radio-button>
                        </el-radio-group>
                        <span v-if="batchFiltered" class="rrb-dim">{{ $tp('{n} device(s)', { n: batchShown.length }) }}</span>
                    </div>
                    <el-table ref="batchTable" :data="batchShown" border size="mini" :max-height="batchTableMax" row-key="_id"
                        :empty-text="batchFiltered ? $tp('No devices match the current filters') : $tp('No devices on this batch')">
                        <el-table-column v-if="canManage" width="44" align="center">
                            <template slot="header">
                                <el-checkbox :value="allOpenSelected" :indeterminate="!!selectedOpen.length && !allOpenSelected" :disabled="!shownOpen.length" @change="selectAllOpen" />
                            </template>
                            <template slot-scope="s"><el-checkbox v-if="s.row.status === 'assigned'" :value="selectedSet.has(s.row._id)" @change="toggleSelected(s.row)" /></template>
                        </el-table-column>
                        <el-table-column :label="$tp('IMEI')" min-width="150"><template slot-scope="s"><b class="rrb-mono">{{ s.row.imei }}</b></template></el-table-column>
                        <el-table-column :label="$tp('Device')" min-width="170" show-overflow-tooltip><template slot-scope="s">{{ oneLine(s.row.device) || '—' }}</template></el-table-column>
                        <el-table-column :label="$tp('Supplier')" min-width="100" show-overflow-tooltip><template slot-scope="s">{{ (s.row.supplier && s.row.supplier.name) || '—' }}</template></el-table-column>
                        <el-table-column :label="$tp('Status')" width="96" align="center">
                            <template slot-scope="s"><el-tag size="mini" :type="DEVICE_STATUS[deviceStatus(s.row)].type">{{ $tp(DEVICE_STATUS[deviceStatus(s.row)].label) }}</el-tag></template>
                        </el-table-column>
                        <el-table-column :label="$tp('Processed')" width="140">
                            <template slot-scope="s">
                                <template v-if="s.row.status === 'done'"><div>{{ fmtWhen(s.row.processedAt) }}</div><div class="rrb-dim">{{ s.row.processedBy || '' }}</div></template>
                                <span v-else class="rrb-dim">—</span>
                            </template>
                        </el-table-column>
                        <el-table-column v-if="canManage" label="" width="170" align="center">
                            <template slot-scope="s">
                                <template v-if="s.row.status === 'assigned'">
                                    <el-button size="mini" type="success" plain :disabled="acting" @click="setStatus([s.row._id], 'done')">{{ $tp('Processed') }}</el-button>
                                    <el-button size="mini" type="text" class="rrb-off" :disabled="acting" :title="$tp('Take it off the batch: back to To process')" @click="unassign(s.row)">{{ $tp('Remove') }}</el-button>
                                </template>
                                <el-button v-else-if="s.row.status === 'done'" size="mini" type="text" :disabled="acting" @click="setStatus([s.row._id], 'reopen')">{{ $tp('Undo processed') }}</el-button>
                            </template>
                        </el-table-column>
                    </el-table>
                </template>
            </div>
            <div slot="footer"><el-button size="small" @click="batchVisible = false">{{ $tp('Close') }}</el-button></div>
        </el-dialog>
    </div>
</template>

<script>
import {
    getPrecheck, getPrecheckRepairers, getPrecheckRepairBatches, addPrecheckRepairBatch, getPrecheckRepairBatch,
    updatePrecheckRepairBatch, addPrecheckRepairBatchDevices, finishPrecheckRepairBatch, deletePrecheckRepairBatch, setPrecheckRepairStatus
} from '@/api/refurbished'
import { hasPermission } from '@/utils/permission'
import { DEVICE_STATUS, BATCH_STATUS, deviceStatus, fmtWhen } from './repairStatus'

export default {
    name: 'RefurbishedPrecheckRepairBatches',
    data() {
        return {
            DEVICE_STATUS,
            BATCH_STATUS,
            // the batch dialog's table height in px (see layoutBatchTable)
            batchTableMax: Math.max(240, Math.round(window.innerHeight * 0.52)),
            loading: false,
            rows: [],
            counts: { all: 0, open: 0, done: 0 },
            query: { search: '', repairerId: '', status: '' },
            repairers: [],
            narrow: false,
            // the picker: a new batch, or devices added to the open one
            pickVisible: false,
            pickMode: 'new',
            pickForm: { repairerId: '', note: '' },
            pending: [],
            pendingLoading: false,
            picked: [],
            pickSearch: '',
            scanText: '',
            lastScanned: '',
            pickSaving: false,
            // one batch
            batchVisible: false,
            batchLoading: false,
            batch: null,
            batchRows: [],
            // the dialog's IMEI / device search and status filter (2026-11-11)
            batchSearch: '',
            batchStatus: '',
            selected: [],
            noteDraft: '',
            noteSaving: false,
            acting: false
        }
    },
    computed: {
        canManage() {
            return hasPermission(this.$store.getters.permissions, 'refurb:precheck:manage')
        },
        activeRepairers() {
            return this.repairers.filter(r => r.active !== false)
        },
        pickedSet() {
            return new Set(this.picked)
        },
        pendingShown() {
            const q = this.pickSearch.trim().toLowerCase()
            if (!q) return this.pending
            return this.pending.filter(r => [r.imei, r.device, r.note, r.supplier && r.supplier.name].some(x => String(x || '').toLowerCase().includes(q)))
        },
        allShownPicked() {
            return !!this.pendingShown.length && this.pendingShown.every(r => this.pickedSet.has(r._id))
        },
        someShownPicked() {
            return this.pendingShown.some(r => this.pickedSet.has(r._id))
        },
        openRows() {
            return this.batchRows.filter(r => r.status === 'assigned')
        },
        batchFiltered() {
            return !!(this.batchSearch.trim() || this.batchStatus)
        },
        // what the table shows: the search (IMEI — spaces ignored — or device
        // text) and the status filter
        batchShown() {
            const q = this.batchSearch.trim().toLowerCase()
            const code = q.replace(/[\s-]/g, '')
            return this.batchRows.filter(r => {
                if (this.batchStatus && r.status !== this.batchStatus) return false
                if (!q) return true
                return String(r.imei || '').toLowerCase().includes(code) || this.oneLine(r.device).toLowerCase().includes(q)
            })
        },
        // the In repair devices on screen — the header tick box acts on these only
        shownOpen() {
            return this.batchShown.filter(r => r.status === 'assigned')
        },
        selectedSet() {
            return new Set(this.selected)
        },
        selectedOpen() {
            return this.openRows.filter(r => this.selectedSet.has(r._id)).map(r => r._id)
        },
        allOpenSelected() {
            return !!this.shownOpen.length && this.shownOpen.every(r => this.selectedSet.has(r._id))
        }
    },
    watch: {
        // a tick on a device the filter now hides is dropped, so "Mark n
        // processed" only ever covers devices on screen
        batchShown(rows) {
            if (!this.selected.length) return
            const shown = new Set(rows.map(r => r._id))
            const kept = this.selected.filter(id => shown.has(id))
            if (kept.length !== this.selected.length) this.selected = kept
        }
    },
    created() {
        if (this.$route.query.repairerId) this.query.repairerId = String(this.$route.query.repairerId)
        this.load()
        this.loadRepairers()
        // from Pending Stock: straight to one batch
        if (this.$route.query.batch) this.openBatch({ _id: String(this.$route.query.batch) })
    },
    methods: {
        fmtWhen,
        deviceStatus,
        oneLine(v) {
            return String(v || '').split(/\n+/).map(x => x.trim()).filter(Boolean).join(' · ')
        },
        async load() {
            this.loading = true
            try {
                const r = await getPrecheckRepairBatches(this.query)
                this.rows = r.batches || []
                this.counts = r.counts || this.counts
            } catch (e) {
                // the request layer has said why
            } finally {
                this.loading = false
            }
        },
        async loadRepairers() {
            try {
                const r = await getPrecheckRepairers({})
                this.repairers = r.repairers || []
            } catch (e) { this.repairers = [] }
        },
        // ── the picker ──
        async openPicker(mode) {
            this.pickMode = mode
            this.pickForm = { repairerId: this.query.repairerId || '', note: '' }
            this.picked = []
            this.pickSearch = ''
            this.scanText = ''
            this.lastScanned = ''
            this.narrow = window.innerWidth < 800
            this.pickVisible = true
            if (mode === 'new') this.loadRepairers()
            this.pendingLoading = true
            try {
                // every waiting device, a page of 500 at a time
                const out = []
                for (let page = 1; ; page++) {
                    const r = await getPrecheck({ status: 'pending', page, pageSize: 500 })
                    out.push(...(r.rows || []))
                    if (!(r.rows || []).length || out.length >= (r.total || 0)) break
                }
                this.pending = out
            } catch (e) {
                this.pending = []
            } finally {
                this.pendingLoading = false
            }
        },
        focusScan() {
            const el = this.$refs.scan
            if (el && el.focus) el.focus()
        },
        togglePick(row) {
            this.picked = this.pickedSet.has(row._id) ? this.picked.filter(id => id !== row._id) : [...this.picked, row._id]
        },
        pickAllShown(on) {
            const shown = new Set(this.pendingShown.map(r => r._id))
            this.picked = on ? [...new Set([...this.picked, ...shown])] : this.picked.filter(id => !shown.has(id))
        },
        // a scan ticks the device (it stays ticked when scanned again)
        onScan() {
            const code = String(this.scanText || '').replace(/\s+/g, '').toUpperCase()
            this.scanText = ''
            if (!code) return
            const row = this.pending.find(r => r.imei === code)
            if (!row) { this.$message.warning(this.$tp('{imei} is not waiting (待处理) on Pending Stock', { imei: code })); return }
            if (!this.pickedSet.has(row._id)) this.picked = [...this.picked, row._id]
            this.lastScanned = row._id
            // the scanned one first, so it is seen
            this.pending = [row, ...this.pending.filter(r => r._id !== row._id)]
        },
        pickRowClass({ row }) {
            return [this.pickedSet.has(row._id) ? 'rrb-picked' : '', row._id === this.lastScanned ? 'rrb-scanned' : ''].join(' ')
        },
        async savePick() {
            if (!this.picked.length || this.pickSaving) return
            if (this.pickMode === 'new' && !this.pickForm.repairerId) { this.$message.warning(this.$tp('Pick the repairer')); return }
            this.pickSaving = true
            try {
                const r = this.pickMode === 'new'
                    ? await addPrecheckRepairBatch({ repairerId: this.pickForm.repairerId, note: this.pickForm.note, ids: this.picked })
                    : await addPrecheckRepairBatchDevices(this.batch._id, this.picked)
                this.reportSkipped(r)
                this.$message.success(this.pickMode === 'new'
                    ? this.$tp('{no} created: {n} device(s) assigned', { no: r.batch.batchNo, n: r.assigned })
                    : this.$tp('{n} device(s) added', { n: r.assigned }))
                this.pickVisible = false
                this.load()
                if (this.pickMode === 'new') this.openBatch(r.batch)
                else this.reloadBatch()
            } catch (e) {
                // the request layer has said why; the picker stays open
            } finally {
                this.pickSaving = false
            }
        },
        // devices that moved meanwhile (another tab, the Pending Stock page)
        reportSkipped(r) {
            const skipped = (r && r.skipped) || []
            if (skipped.length) {
                this.$alert(skipped.map(s => `${s.imei || '?'} — ${s.reason}`).join('; '),this.$tp('{n} device(s) not added', { n: skipped.length }), { type: 'warning' })
            }
        },
        // ── one batch ──
        async openBatch(row) {
            this.batch = null
            this.batchRows = []
            this.selected = []
            this.batchSearch = ''
            this.batchStatus = ''
            this.narrow = window.innerWidth < 800
            this.batchVisible = true
            await this.reloadBatch(row._id)
        },
        async reloadBatch(id) {
            const batchId = id || (this.batch && this.batch._id)
            if (!batchId) return
            this.batchLoading = true
            try {
                const r = await getPrecheckRepairBatch(batchId)
                this.batch = r.batch
                this.batchRows = r.rows || []
                this.noteDraft = r.batch.note || ''
                this.selected = this.selected.filter(id2 => this.batchRows.some(x => x._id === id2 && x.status === 'assigned'))
            } catch (e) {
                this.batchVisible = false
            } finally {
                this.batchLoading = false
                this.layoutBatchTable()
            }
        },
        // The batch table's height: about half the window, in px (Element's
        // max-height scrolls only with a number), re-measured once it is
        // visible with its rows.
        layoutBatchTable() {
            this.batchTableMax = Math.max(240, Math.round(window.innerHeight * 0.52))
            this.$nextTick(() => {
                const t = this.$refs.batchTable
                if (t && t.doLayout) t.doLayout()
            })
        },
        onBatchClosed() {
            this.batch = null
            if (this.$route.query.batch) this.$router.replace({ query: { ...this.$route.query, batch: undefined } })
        },
        toggleSelected(row) {
            this.selected = this.selectedSet.has(row._id) ? this.selected.filter(id => id !== row._id) : [...this.selected, row._id]
        },
        selectAllOpen(on) {
            this.selected = on ? this.shownOpen.map(r => r._id) : []
        },
        async saveNote() {
            this.noteSaving = true
            try {
                await updatePrecheckRepairBatch(this.batch._id, { note: this.noteDraft })
                this.batch = { ...this.batch, note: this.noteDraft }
                this.$message.success(this.$tp('Saved'))
                this.load()
            } catch (e) {
                // the request layer has said why
            } finally {
                this.noteSaving = false
            }
        },
        async setStatus(ids, action) {
            if (!ids.length || this.acting) return
            this.acting = true
            try {
                const r = await setPrecheckRepairStatus(ids, action)
                if (action === 'done') this.$message.success(this.$tp('{n} device(s) processed', { n: r.changed }))
                this.selected = []
                await this.reloadBatch()
                this.load()
            } catch (e) {
                // the request layer has said why
            } finally {
                this.acting = false
            }
        },
        async unassign(row) {
            try {
                await this.$confirm(this.$tp('Take {imei} off {no}? It goes back to To process.', { imei: row.imei, no: this.batch.batchNo }), this.$tp('Remove'),
                    { type: 'warning', confirmButtonText: this.$tp('Remove'), cancelButtonText: this.$tp('Cancel') })
            } catch (e) { return }
            this.setStatus([row._id], 'unassign')
        },
        async finishBatch() {
            const left = this.batch.devices - this.batch.processed
            try {
                await this.$confirm(this.$tp('Mark the {n} device(s) still in repair on {no} as processed?', { n: left, no: this.batch.batchNo }), this.$tp('Mark all processed'),
                    { type: 'info', confirmButtonText: this.$tp('Mark all processed'), cancelButtonText: this.$tp('Cancel') })
            } catch (e) { return }
            this.acting = true
            try {
                const r = await finishPrecheckRepairBatch(this.batch._id)
                this.$message.success(this.$tp('{n} device(s) processed', { n: r.processed }))
                await this.reloadBatch()
                this.load()
            } catch (e) {
                // the request layer has said why
            } finally {
                this.acting = false
            }
        },
        async removeBatch() {
            try {
                await this.$confirm(this.$tp('Delete {no}? It has no devices left.', { no: this.batch.batchNo }), this.$tp('Delete batch'),
                    { type: 'warning', confirmButtonText: this.$tp('Delete'), cancelButtonText: this.$tp('Cancel') })
            } catch (e) { return }
            try {
                await deletePrecheckRepairBatch(this.batch._id)
                this.batchVisible = false
                this.load()
            } catch (e) {
                // the request layer has said why
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.rrb-filters {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px;
    .f-search { width: 240px; }
    .f-repairer { width: 170px; }
    .el-button + .el-button { margin-left: 0; }
}
.rrb-spacer { flex: 1; }
.rrb-dim { font-size: 11px; color: #909399; }
.rrb-mono { font-variant-numeric: tabular-nums; letter-spacing: .2px; }
.rrb-link { color: #409eff; cursor: pointer; }
.rrb ::v-deep .el-table__row { cursor: pointer; }
.rrb-progress { display: flex; align-items: center; gap: 8px; .el-progress { flex: 1; } span { font-size: 12px; color: #606266; white-space: nowrap; font-variant-numeric: tabular-nums; } }
.rrb-full { width: 100%; }
.rrb-pick-form { margin-bottom: 4px; }
.rrb-pick-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; word-break: normal;
    .rrb-scan { width: 300px; } .rrb-pick-search { width: 200px; } }
::v-deep .rrb-picked td { background: #f0f9eb !important; }
::v-deep .rrb-scanned td { background: #e1f3d8 !important; }
.rrb-bt-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 16px; word-break: normal; }
.rrb-bt-info { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; margin-bottom: 12px; word-break: normal; }
.rrb-bt-progress { flex: 1 1 260px; display: flex; align-items: center; gap: 10px; .el-progress { flex: 1; } span { font-size: 13px; color: #303133; white-space: nowrap; } }
.rrb-bt-note { flex: 1 1 300px; display: flex; gap: 6px; }
.rrb-bt-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; .el-button + .el-button { margin-left: 0; } }
.rrb-bt-filter { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 8px; word-break: normal; .rrb-bt-search { width: 240px; } }
.rrb-off { color: #909399; &:hover { color: #f56c6c; } }
@media (max-width: 767px) {
    .rrb-filters .f-search, .rrb-filters .f-repairer, .rrb-pick-bar .rrb-scan, .rrb-pick-bar .rrb-pick-search, .rrb-bt-filter .rrb-bt-search { width: 100%; }
}
</style>
