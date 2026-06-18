<template>
    <div class="app-container sqt-returns-page">
        <!--
            HQ return-tracking dashboard. Lists terminal cases (unrepairable /
            ber / cancelled) that have items to recover from the shop — parts
            and, for ber/unrepairable, the customer's device. Each row expands
            to mark items received inline (one-step, HQ-only). The full case is
            one click away via "Open case" (opens the Cases detail dialog on the
            Returns tab).
        -->
        <div class="filter-bar">
            <el-select
                v-model="queryParams.status"
                size="small"
                class="filter-status"
                @change="handleQuery"
            >
                <el-option label="Outstanding" value="pending" />
                <el-option label="Completed" value="complete" />
                <el-option label="All" value="all" />
            </el-select>

            <el-select
                v-model="queryParams.reason"
                placeholder="Any reason"
                clearable
                size="small"
                class="filter-reason"
                @change="handleQuery"
            >
                <el-option
                    v-for="r in REASON_META"
                    :key="r.value"
                    :label="r.label"
                    :value="r.value"
                />
            </el-select>

            <el-select
                v-model="queryParams.shopId"
                placeholder="Any shop"
                clearable
                filterable
                size="small"
                class="filter-shop"
                @change="handleQuery"
            >
                <el-option
                    v-for="s in shops"
                    :key="s._id"
                    :label="s.storeName"
                    :value="s._id"
                />
            </el-select>

            <el-input
                v-model="queryParams.search"
                placeholder="Case ID, customer, IMEI…"
                clearable
                size="small"
                prefix-icon="el-icon-search"
                class="filter-search"
                @keyup.enter.native="handleQuery"
                @clear="handleQuery"
            />

            <div class="filter-actions">
                <el-button type="primary" icon="el-icon-search" size="small" @click="handleQuery">
                    Search
                </el-button>
                <el-button icon="el-icon-refresh-right" size="small" @click="getList">
                    Refresh
                </el-button>
            </div>

            <span class="filter-spacer" />
            <span class="filter-summary">
                <strong>{{ total }}</strong>
                {{ total === 1 ? 'case' : 'cases' }}
                <span class="filter-summary-scope">· {{ statusScopeLabel }}</span>
            </span>
        </div>

        <el-table
            v-loading="loading"
            :data="list"
            stripe
            size="small"
            row-key="_id"
            class="returns-table"
        >
            <el-table-column label="Case" min-width="190">
                <template slot-scope="scope">
                    <div>
                        <a class="case-link" @click="openCase(scope.row)">
                            Case {{ scope.row.caseId || '—' }}
                        </a>
                        <div class="case-sub">
                            SR {{ scope.row.serviceRequestId || '—' }}
                        </div>
                        <div v-if="scope.row.shopName" class="case-sub case-shop">
                            <i class="el-icon-office-building" />
                            {{ scope.row.shopName }}
                        </div>
                    </div>
                </template>
            </el-table-column>
            <el-table-column label="Customer" min-width="140">
                <template slot-scope="scope">{{ customerName(scope.row) }}</template>
            </el-table-column>
            <el-table-column label="Device" min-width="150">
                <template slot-scope="scope">
                    {{ (scope.row.device && scope.row.device.description) || '—' }}
                </template>
            </el-table-column>
            <el-table-column label="Reason" width="120" align="center">
                <template slot-scope="scope">
                    <el-tag size="mini" :type="reasonType(returnReason(scope.row))" effect="plain">
                        {{ reasonLabel(returnReason(scope.row)) }}
                    </el-tag>
                </template>
            </el-table-column>
            <el-table-column label="Parts" width="90" align="center">
                <template slot-scope="scope">
                    <span :class="{ 'all-in': partsReceived(scope.row) === partsTotal(scope.row) }">
                        {{ partsReceived(scope.row) }}/{{ partsTotal(scope.row) }}
                    </span>
                </template>
            </el-table-column>
            <el-table-column label="Device" width="100" align="center">
                <template slot-scope="scope">
                    <el-tag
                        v-if="deviceState(scope.row)"
                        size="mini"
                        :type="deviceState(scope.row).type"
                        effect="plain"
                    >{{ deviceState(scope.row).label }}</el-tag>
                    <span v-else class="muted-inline">—</span>
                </template>
            </el-table-column>
            <el-table-column label="Opened" width="140" align="center">
                <template slot-scope="scope">
                    <div>{{ fmtDate(returnOpenedAt(scope.row)) }}</div>
                    <div
                        v-if="returnAgeLabel(scope.row)"
                        :class="['return-age', returnAgeClass(scope.row)]"
                    >{{ returnAgeLabel(scope.row) }}</div>
                </template>
            </el-table-column>
            <el-table-column label="" width="110" align="center">
                <template slot-scope="scope">
                    <el-tag size="mini" :type="summaryType(scope.row)" effect="dark">
                        {{ summaryLabel(scope.row) }}
                    </el-tag>
                </template>
            </el-table-column>
            <el-table-column label="Action" width="110" align="center" fixed="right">
                <template slot-scope="scope">
                    <el-button
                        size="mini"
                        type="primary"
                        plain
                        icon="el-icon-edit"
                        @click="openDialog(scope.row)"
                    >Update</el-button>
                </template>
            </el-table-column>
        </el-table>

        <pagination
            v-show="total > 0"
            :total="total"
            :page.sync="queryParams.page"
            :limit.sync="queryParams.pageSize"
            @pagination="getList"
        />

        <!--
            Update-returns dialog. Opened from the Action column; edits an
            isolated working copy (`form`) of the row's returnTracking and saves
            it in one PATCH. Closing without saving discards the edits.
        -->
        <el-dialog
            :title="dialogTitle"
            :visible.sync="dialogOpen"
            width="640px"
            append-to-body
            :close-on-click-modal="false"
            custom-class="returns-dialog"
            @closed="onDialogClosed"
        >
            <div v-if="dialogRow" class="returns-dialog-body">
                <el-alert
                    :type="dialogSummary.type"
                    :title="dialogSummary.text"
                    :closable="false"
                    show-icon
                    class="dialog-summary"
                />

                <div class="row-detail-title">
                    <i class="el-icon-box" /> Parts to return
                </div>
                <el-table v-if="form.parts.length" :data="form.parts" size="mini" border>
                    <el-table-column label="Part" min-width="160">
                        <template slot-scope="p">
                            {{ p.row.partName || '—' }}
                            <span v-if="p.row.zohoSalesOrderNumber" class="muted-inline">
                                · {{ p.row.zohoSalesOrderNumber }}
                            </span>
                        </template>
                    </el-table-column>
                    <el-table-column label="SKU" width="110">
                        <template slot-scope="p">{{ p.row.sku || '—' }}</template>
                    </el-table-column>
                    <el-table-column label="To return" prop="quantityToReturn" width="84" align="center" />
                    <el-table-column label="Received" width="120" align="center">
                        <template slot-scope="p">
                            <el-input-number
                                :value="p.row.quantityReceived"
                                :min="0"
                                :max="p.row.quantityToReturn"
                                size="mini"
                                controls-position="right"
                                class="qty-input"
                                @change="(v) => setPartQty(p.$index, v)"
                            />
                        </template>
                    </el-table-column>
                    <el-table-column label="Status" width="92" align="center">
                        <template slot-scope="p">
                            <el-tag size="mini" :type="p.row.received ? 'success' : 'info'" effect="plain">
                                {{ p.row.received ? 'Received' : 'Pending' }}
                            </el-tag>
                        </template>
                    </el-table-column>
                </el-table>
                <div v-else class="empty-inline">No parts to return.</div>
                <div v-if="form.parts.length" class="dialog-parts-actions">
                    <el-button size="mini" type="text" @click="markAllParts(true)">Mark all received</el-button>
                    <el-button size="mini" type="text" @click="markAllParts(false)">Clear all</el-button>
                </div>

                <template v-if="form.device && form.device.applicable">
                    <div class="row-detail-title">
                        <i class="el-icon-mobile-phone" /> Customer device
                    </div>
                    <div class="device-line">
                        <span class="device-label">Device to return?</span>
                        <el-switch
                            :value="form.device.expected"
                            active-text="Yes"
                            inactive-text="No"
                            @change="onDeviceExpected"
                        />
                        <template v-if="form.device.expected">
                            <span class="device-label device-label-status">Status</span>
                            <el-tag
                                size="mini"
                                :type="form.device.received ? 'success' : 'info'"
                                effect="plain"
                            >{{ form.device.received ? 'Received' : 'Pending' }}</el-tag>
                            <el-checkbox
                                :value="form.device.received"
                                class="device-check"
                                @change="(v) => form.device.received = v"
                            >Mark received</el-checkbox>
                        </template>
                    </div>
                </template>
            </div>
            <div slot="footer">
                <el-button :disabled="saving" @click="dialogOpen = false">Cancel</el-button>
                <el-button
                    type="primary"
                    icon="el-icon-check"
                    :loading="saving"
                    @click="saveReturns"
                >Save</el-button>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import { listReturns, markCaseReturns } from '@/api/sqt/cases'
import { listShops } from '@/api/sqt/shops'

// The terminal statuses that drive a return. Mirrors the backend
// TERMINAL_RETURN_STATUSES; `tag` is the el-tag variant for the reason chip.
const REASON_META = [
    { value: 'unrepairable', label: 'Unrepairable', tag: 'danger' },
    { value: 'ber', label: 'BER', tag: 'danger' },
    { value: 'cancelled', label: 'Cancelled', tag: 'info' }
]

export default {
    name: 'SqtReturns',
    data() {
        return {
            loading: false,
            list: [],
            total: 0,
            shops: [],
            REASON_META,
            // Update-returns dialog state. `form` is an isolated working copy of
            // the open row's returnTracking, seeded on open and saved as one
            // PATCH. `dialogRow` is the source list row we write back to.
            dialogOpen: false,
            dialogRow: null,
            form: { parts: [], device: null },
            saving: false,
            queryParams: {
                page: 1,
                pageSize: 20,
                status: 'pending',
                reason: '',
                shopId: '',
                search: ''
            }
        }
    },
    computed: {
        statusScopeLabel() {
            if (this.queryParams.status === 'complete') return 'completed'
            if (this.queryParams.status === 'all') return 'all'
            return 'outstanding'
        },
        dialogTitle() {
            if (!this.dialogRow) return 'Update Returns'
            const label = this.dialogRow.caseId || this.dialogRow.serviceRequestId || ''
            return `Returns — ${label}`
        },
        // Outstanding rollup over the working copy — drives the dialog's banner.
        dialogSummary() {
            const f = this.form || {}
            const parts = f.parts || []
            const deviceExpected = !!(f.device && f.device.applicable && f.device.expected)
            const anyExpected = parts.length > 0 || deviceExpected
            let n = parts.filter(p => !p.received).length
            if (deviceExpected && !f.device.received) n += 1
            if (!anyExpected) return { type: 'info', text: 'Nothing to return for this case.' }
            if (n === 0) return { type: 'success', text: 'All expected items have been received.' }
            return { type: 'warning', text: `${n} item${n === 1 ? '' : 's'} still to come back.` }
        }
    },
    created() {
        this.loadShops()
        this.getList()
    },
    methods: {
        async getList() {
            this.loading = true
            try {
                const params = {
                    page: this.queryParams.page,
                    pageSize: this.queryParams.pageSize,
                    status: this.queryParams.status
                }
                if (this.queryParams.reason) params.reason = this.queryParams.reason
                if (this.queryParams.shopId) params.shopId = this.queryParams.shopId
                if (this.queryParams.search) params.search = this.queryParams.search

                const res = await listReturns(params)
                if (!res || res.success === false) {
                    throw new Error((res && res.message) || 'Failed to load returns')
                }
                this.list = res.data || []
                this.total = res.totalDocs || 0
            } catch (e) {
                console.error('List returns failed:', e)
                const msg = (e.response && e.response.data && e.response.data.message) || e.message || 'Failed to load returns'
                this.$message.error(msg)
                this.list = []
                this.total = 0
            } finally {
                this.loading = false
            }
        },
        async loadShops() {
            try {
                const res = await listShops({ page: 1, pageSize: 200 })
                this.shops = (res && res.data) || []
            } catch (e) {
                console.error('Load shops failed:', e)
                this.shops = []
            }
        },
        handleQuery() {
            this.queryParams.page = 1
            this.getList()
        },
        // ── Editable working copy ──────────────────────────────────────
        buildForm(row) {
            const rt = (row && row.returnTracking) || null
            if (!rt) return { parts: [], device: null }
            return {
                parts: (rt.parts || []).map(p => ({
                    zohoSalesOrderId: p.zohoSalesOrderId || null,
                    zohoSalesOrderNumber: p.zohoSalesOrderNumber || null,
                    lineItemIdx: p.lineItemIdx,
                    partName: p.partName || '',
                    sku: p.sku || '',
                    quantityToReturn: Number(p.quantityToReturn) || 0,
                    quantityReceived: Number(p.quantityReceived) || 0,
                    received: !!p.received
                })),
                device: rt.device
                    ? {
                        applicable: !!rt.device.applicable,
                        expected: !!rt.device.expected,
                        received: !!rt.device.received,
                        note: rt.device.note || ''
                    }
                    : null
            }
        },
        // ── Update dialog ──────────────────────────────────────────────
        openDialog(row) {
            this.dialogRow = row
            this.form = this.buildForm(row)
            this.dialogOpen = true
        },
        onDialogClosed() {
            this.dialogRow = null
            this.form = { parts: [], device: null }
        },
        setPartQty(idx, val) {
            const p = this.form.parts[idx]
            if (!p) return
            const qty = Math.max(0, Math.min(Number(val) || 0, p.quantityToReturn))
            this.$set(this.form.parts, idx, {
                ...p,
                quantityReceived: qty,
                received: p.quantityToReturn > 0 && qty >= p.quantityToReturn
            })
        },
        markAllParts(received) {
            this.form.parts = this.form.parts.map(p => ({
                ...p,
                quantityReceived: received ? p.quantityToReturn : 0,
                received: received && p.quantityToReturn > 0
            }))
        },
        onDeviceExpected(v) {
            const d = this.form.device
            if (!d) return
            d.expected = !!v
            if (!v) d.received = false
        },
        async saveReturns() {
            if (!this.dialogRow || this.saving) return
            const row = this.dialogRow
            const payload = {
                parts: this.form.parts.map(p => ({
                    zohoSalesOrderId: p.zohoSalesOrderId,
                    lineItemIdx: p.lineItemIdx,
                    quantityReceived: p.quantityReceived
                }))
            }
            if (this.form.device && this.form.device.applicable) {
                payload.device = {
                    expected: this.form.device.expected,
                    received: this.form.device.received,
                    note: this.form.device.note || ''
                }
            }
            this.saving = true
            try {
                const res = await markCaseReturns(row._id, payload)
                const updated = res && res.data
                if (!updated) throw new Error((res && res.message) || 'Save failed')
                const idx = this.list.findIndex(c => c._id === row._id)
                if (idx !== -1) this.$set(this.list, idx, updated)
                this.$message.success('Return tracking updated')
                this.dialogOpen = false
                // If we're viewing only outstanding and this case is now fully
                // received, drop it from the list so the view stays focused.
                if (this.queryParams.status === 'pending' &&
                    updated.returnTracking && updated.returnTracking.summaryStatus === 'complete') {
                    const i = this.list.findIndex(c => c._id === row._id)
                    if (i !== -1) {
                        this.list.splice(i, 1)
                        this.total = Math.max(0, this.total - 1)
                    }
                }
            } catch (e) {
                console.error('Save returns failed:', e)
                const msg = (e.response && e.response.data && e.response.data.message) || e.message || 'Save failed'
                this.$message.error(msg)
            } finally {
                this.saving = false
            }
        },
        // Open the full case detail (Cases page) on the Returns tab.
        openCase(row) {
            this.$router.push({ path: '/sqt/cases', query: { openCase: row._id, tab: 'returns' } })
        },
        // ── Display helpers ───────────────────────────────────────────
        customerName(row) {
            const c = row && row.customer
            if (!c) return '—'
            const name = `${c.firstName || ''} ${c.lastName || ''}`.trim()
            return name || '—'
        },
        returnReason(row) {
            return (row.returnTracking && row.returnTracking.reason) || row.status
        },
        partsTotal(row) {
            return ((row.returnTracking && row.returnTracking.parts) || []).length
        },
        partsReceived(row) {
            return ((row.returnTracking && row.returnTracking.parts) || []).filter(p => p.received).length
        },
        // Returns null when no device is expected (shows a dash); otherwise the
        // received/pending tag descriptor.
        deviceState(row) {
            const d = row.returnTracking && row.returnTracking.device
            if (!d || !d.applicable || !d.expected) return null
            return d.received
                ? { type: 'success', label: 'Received' }
                : { type: 'info', label: 'Pending' }
        },
        summaryType(row) {
            const s = row.returnTracking && row.returnTracking.summaryStatus
            if (s === 'complete') return 'success'
            if (s === 'pending') return 'warning'
            return 'info'
        },
        summaryLabel(row) {
            const s = row.returnTracking && row.returnTracking.summaryStatus
            if (s === 'complete') return 'Complete'
            if (s === 'pending') return 'Outstanding'
            return 'None'
        },
        reasonType(reason) {
            const m = REASON_META.find(r => r.value === reason)
            return m ? m.tag : 'info'
        },
        reasonLabel(reason) {
            const m = REASON_META.find(r => r.value === reason)
            return m ? m.label : (reason || '—')
        },
        // ── Ageing ─────────────────────────────────────────────────────
        // When the return was opened (returnTracking initialised on the
        // terminal transition).
        returnOpenedAt(row) {
            return row.returnTracking && row.returnTracking.initializedAt
        },
        // Whole days since the return was opened — null if unknown.
        returnAgeDays(row) {
            const v = this.returnOpenedAt(row)
            if (!v) return null
            const d = new Date(v)
            if (isNaN(d.getTime())) return null
            return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))
        },
        returnAgeLabel(row) {
            const days = this.returnAgeDays(row)
            if (days === null) return ''
            if (days === 0) return 'Today'
            return days === 1 ? '1 day open' : `${days} days open`
        },
        // Colour-code the age so stale returns stand out: >14d red, >7d amber.
        returnAgeClass(row) {
            const days = this.returnAgeDays(row)
            if (days === null) return ''
            if (days > 14) return 'age-old'
            if (days > 7) return 'age-mid'
            return 'age-new'
        },
        fmtDate(value) {
            if (!value) return '—'
            const d = new Date(value)
            if (isNaN(d.getTime())) return '—'
            return d.toLocaleDateString('en-AU', { timeZone: 'Australia/Melbourne' })
        }
    }
}
</script>

<style lang="scss" scoped>
.filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
}
.filter-status { width: 140px; }
.filter-reason { width: 150px; }
.filter-shop { width: 200px; max-width: 100%; }
.filter-search { width: 240px; max-width: 100%; }
.filter-actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.filter-spacer { flex: 1; }
.filter-summary { color: #606266; font-size: 13px; }
.filter-summary strong { color: #303133; font-weight: 600; }
.filter-summary-scope { color: #909399; }

.returns-table {
    border: 1px solid #ebeef5;
    border-radius: 8px;
    overflow: hidden;
}
.case-link { color: #409eff; cursor: pointer; font-weight: 500; }
.case-link:hover { text-decoration: underline; }
.case-sub { color: #909399; font-size: 12px; margin-top: 2px; }
.case-shop {
    display: flex;
    align-items: center;
    gap: 4px;
    i { font-size: 12px; color: #909399; }
}
.muted-inline { color: #909399; font-size: 12px; }
.all-in { color: #67c23a; font-weight: 600; }
.return-age {
    font-size: 12px;
    margin-top: 2px;
}
.return-age.age-new { color: #909399; }
.return-age.age-mid { color: #e6a23c; font-weight: 600; }
.return-age.age-old { color: #f56c6c; font-weight: 600; }

/* Update-returns dialog */
.returns-dialog-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.dialog-summary { padding: 8px 12px; }
.row-detail-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: #303133;
    i { color: #409eff; }
}
.empty-inline { color: #909399; font-size: 13px; padding: 4px 0; }
.qty-input { width: 110px; }
.dialog-parts-actions {
    display: flex;
    gap: 12px;
    margin-top: -4px;
}
.device-line {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}
.device-label { color: #606266; font-size: 13px; }
.device-label-status { margin-left: 12px; }
.device-check { margin-left: 4px; }
</style>
