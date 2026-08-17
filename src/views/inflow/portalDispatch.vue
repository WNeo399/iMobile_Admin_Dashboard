<template>
    <!--
        InFlow customer portal — Dispatch Status. Read-only view of the
        logged-in customer's dispatch records (uploaded lists linked to
        them + their mapped sales orders) with per-line progress. No
        internal fields (warehouse SKU, uploader, batches) are shown.
    -->
    <div class="portal-dispatch app-container">
        <div class="pd-head">
            <div>
                <div class="pd-title">Dispatch Status</div>
                <div v-if="customerName" class="pd-sub">{{ customerName }}</div>
            </div>
            <el-button size="small" icon="el-icon-refresh" @click="load">Refresh</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini" row-key="_id"
            empty-text="No dispatch records yet.">
            <el-table-column label="Reference #" min-width="180">
                <template slot-scope="s">
                    <div class="pd-inv">{{ s.row.invoiceNumber }}</div>
                    <div v-if="s.row.linkedInvoiceNumber" class="pd-dim pd-linkline">Invoice {{ s.row.linkedInvoiceNumber }}</div>
                </template>
            </el-table-column>
            <el-table-column label="Date" width="120">
                <template slot-scope="s">{{ dateStr(s.row) }}</template>
            </el-table-column>
            <el-table-column label="Items" width="90" align="right">
                <template slot-scope="s">{{ (s.row.lineItems || []).length }}</template>
            </el-table-column>
            <el-table-column label="Dispatched" width="150" align="center">
                <template slot-scope="s">
                    <span :class="{ 'pd-done': s.row.dispatchStatus === 'dispatched' }">
                        {{ s.row.dispatchedQty }} / {{ s.row.orderedQty }} units
                    </span>
                </template>
            </el-table-column>
            <el-table-column label="Status" width="170" align="center">
                <template slot-scope="s">
                    <el-tag size="mini" :type="dispatchTag(s.row.dispatchStatus)">{{ dispatchLabel(s.row.dispatchStatus) }}</el-tag>
                </template>
            </el-table-column>
            <el-table-column label="" width="90" align="center">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-view" @click="openDetail(s.row)">View</el-button>
                </template>
            </el-table-column>
        </el-table>

        <!-- Per-order detail — the line items that used to sit behind the
             row expander. -->
        <el-dialog :visible.sync="detailVisible" width="860px" top="6vh">
            <div slot="title" class="pd-dlg-title">
                <span class="pd-inv">{{ detail ? detail.invoiceNumber : '' }}</span>
                <el-tag v-if="detail" size="mini" :type="dispatchTag(detail.dispatchStatus)">
                    {{ dispatchLabel(detail.dispatchStatus) }}
                </el-tag>
            </div>
            <div v-if="detail">
                <div class="pd-dlg-meta">
                    <div><label>Date</label><div>{{ dateStr(detail) }}</div></div>
                    <div v-if="detail.linkedInvoiceNumber">
                        <label>Invoice</label><div>{{ detail.linkedInvoiceNumber }}</div>
                    </div>
                    <div><label>Items</label><div>{{ (detail.lineItems || []).length }}</div></div>
                    <div>
                        <label>Dispatched</label>
                        <div :class="{ 'pd-done': detail.dispatchStatus === 'dispatched' }">
                            {{ detail.dispatchedQty }} / {{ detail.orderedQty }} units
                        </div>
                    </div>
                </div>
                <el-tabs v-model="detailTab">
                    <!-- Items: everything on the order, still-owing lines first. -->
                    <el-tab-pane name="items">
                        <span slot="label">
                            Items
                            <span class="pd-tab-count">({{ (detail.lineItems || []).length }})</span>
                        </span>
                        <el-table :data="detailLines" size="mini" border max-height="420">
                            <el-table-column label="Barcode" min-width="150" show-overflow-tooltip>
                                <template slot-scope="li">{{ li.row.sku || '—' }}</template>
                            </el-table-column>
                            <el-table-column label="Description" min-width="260" show-overflow-tooltip>
                                <template slot-scope="li">{{ li.row.description || '—' }}</template>
                            </el-table-column>
                            <el-table-column label="Ordered" width="90" align="right">
                                <template slot-scope="li">{{ li.row.quantity }}</template>
                            </el-table-column>
                            <el-table-column label="Dispatched" width="100" align="right">
                                <template slot-scope="li">{{ li.row.dispatchedQty || 0 }}</template>
                            </el-table-column>
                            <el-table-column label="Remaining" width="100" align="right">
                                <template slot-scope="li">
                                    <span :class="{ 'pd-dim': remainingOf(li.row) === 0 }">{{ remainingOf(li.row) }}</span>
                                </template>
                            </el-table-column>
                            <el-table-column label="" width="90" align="center">
                                <template slot-scope="li">
                                    <el-tag v-if="lineDone(li.row)" size="mini" type="success">Done</el-tag>
                                    <el-tag v-else-if="Number(li.row.dispatchedQty) > 0" size="mini" type="warning">Partial</el-tag>
                                </template>
                            </el-table-column>
                        </el-table>
                    </el-tab-pane>

                    <!-- Dispatched: one block per consignment that has shipped. -->
                    <el-tab-pane name="batches">
                        <span slot="label">
                            Dispatched
                            <span v-if="detailBatches.length" class="pd-tab-count">({{ detailBatches.length }})</span>
                        </span>
                        <div v-if="detailBatches.length" class="pd-batches">
                            <div v-for="b in detailBatches" :key="b.batchNo" class="pd-batch">
                                <div class="pd-batch-head">
                                    <span class="pd-batch-no">Dispatch #{{ b.batchNo }}</span>
                                    <span class="pd-dim">{{ batchDate(b) }}</span>
                                    <span class="pd-batch-units">{{ b.units }} units</span>
                                    <span v-if="b.tracking" class="pd-batch-track">
                                        <i class="el-icon-truck" /> {{ b.tracking }}
                                    </span>
                                </div>
                                <el-table :data="b.lines" size="mini" border>
                                    <el-table-column label="Barcode" min-width="150" show-overflow-tooltip>
                                        <template slot-scope="bl">{{ bl.row.sku || '—' }}</template>
                                    </el-table-column>
                                    <el-table-column label="Description" min-width="300" show-overflow-tooltip>
                                        <template slot-scope="bl">{{ bl.row.description || '—' }}</template>
                                    </el-table-column>
                                    <el-table-column label="Qty" width="80" align="right">
                                        <template slot-scope="bl">{{ bl.row.qty }}</template>
                                    </el-table-column>
                                </el-table>
                            </div>
                        </div>
                        <div v-else class="pd-empty">Nothing has been dispatched on this order yet.</div>
                    </el-tab-pane>
                </el-tabs>
            </div>
            <span slot="footer">
                <el-button size="small" @click="detailVisible = false">Close</el-button>
                <el-button v-if="detailTab === 'items' && remainingLines.length" type="primary" size="small" plain
                    icon="el-icon-download" @click="downloadRemaining">
                    Download Remaining ({{ remainingUnits }})
                </el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import { getMyInflowDispatch } from '@/api/inflow'
import { buildRemainingListPdf, remainingListFileName } from '@/utils/dispatchPackingListPdf'

export default {
    name: 'InflowPortalDispatch',
    data() {
        return {
            loading: false,
            customerName: null,
            rows: [],
            detailVisible: false,
            detail: null,
            detailTab: 'items'
        }
    },
    computed: {
        // Newest consignment first.
        detailBatches() {
            const bs = (this.detail && this.detail.batches) || []
            return [...bs].sort((a, b) => (b.batchNo || 0) - (a.batchNo || 0))
        },
        // Lines still owing float to the top of the dialog; the rest keep
        // their original order underneath.
        detailLines() {
            const lines = (this.detail && this.detail.lineItems) || []
            const left = lines.filter(l => this.remainingOf(l) > 0)
            const done = lines.filter(l => this.remainingOf(l) === 0)
            return [...left, ...done]
        },
        remainingLines() {
            return ((this.detail && this.detail.lineItems) || []).filter(l => this.remainingOf(l) > 0)
        },
        remainingUnits() {
            return this.remainingLines.reduce((s, l) => s + this.remainingOf(l), 0)
        }
    },
    created() {
        this.load()
    },
    activated() {
        this.load()
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await getMyInflowDispatch()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.customerName = r.customerName || null
                this.rows = r.rows || []
            } catch (e) {
                this.$message.error((e.response && e.response.data && e.response.data.message) || e.message || 'Failed to load dispatch status')
            } finally {
                this.loading = false
            }
        },
        openDetail(row) {
            this.detail = row
            this.detailTab = 'items'
            this.detailVisible = true
        },
        batchDate(b) {
            if (!b || !b.at) return '—'
            const d = new Date(b.at)
            return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-AU')
        },
        // Customer copy of what's still owing — no internal warehouse SKU.
        downloadRemaining() {
            if (!this.detail || !this.remainingLines.length) return
            try {
                const doc = buildRemainingListPdf({
                    record: {
                        invoiceNumber: this.detail.invoiceNumber,
                        customerName: this.customerName
                    },
                    lines: this.remainingLines.map(l => ({
                        sku: l.sku || '',
                        description: l.description || '',
                        ordered: Number(l.quantity) || 0,
                        dispatched: Number(l.dispatchedQty) || 0,
                        remaining: this.remainingOf(l)
                    })),
                    hideInternalSku: true
                })
                doc.save(remainingListFileName({ invoiceNumber: this.detail.invoiceNumber }))
            } catch (e) {
                console.error('Remaining list PDF failed:', e)
                this.$message.error('Could not build the remaining items list.')
            }
        },
        remainingOf(li) {
            return Math.max(0, (Number(li.quantity) || 0) - (Number(li.dispatchedQty) || 0))
        },
        lineDone(li) {
            return Number(li.quantity) > 0 && this.remainingOf(li) === 0
        },
        dispatchTag(s) { return { pending: 'info', partial: 'warning', dispatched: 'success' }[s] || 'info' },
        dispatchLabel(s) { return { pending: 'Preparing', partial: 'Partially Dispatched', dispatched: 'Dispatched' }[s] || s },
        dateStr(o) {
            if (o && o.invoiceDateRaw) return o.invoiceDateRaw
            if (o && o.date) { const d = new Date(o.date); if (!isNaN(d)) return d.toLocaleDateString('en-AU') }
            return '—'
        }
    }
}
</script>

<style lang="scss" scoped>
.portal-dispatch { padding: 16px 20px; }
.pd-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.pd-title { font-size: 16px; font-weight: 600; color: #303133; }
.pd-sub { font-size: 12px; color: #909399; margin-top: 2px; }
.pd-inv { font-weight: 600; line-height: 1.3; }
.pd-linkline { font-size: 11px; line-height: 1.3; margin-top: 1px; }
.pd-dim { color: #C0C4CC; }
.pd-done { color: #67C23A; font-weight: 600; }
.pd-tab-count { color: #909399; font-weight: normal; }
.pd-batches { max-height: 420px; overflow: auto; }
.pd-batch + .pd-batch { margin-top: 14px; }
.pd-batch-head {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    padding: 6px 2px;
    font-size: 12px;
}
.pd-batch-no { font-weight: 600; color: #303133; }
.pd-batch-units { color: #606266; }
.pd-batch-track { color: #409EFF; }
.pd-empty {
    padding: 24px;
    text-align: center;
    color: #909399;
    background: #fafafa;
    border-radius: 4px;
}
.pd-dlg-title { display: flex; align-items: center; gap: 10px; font-size: 15px; }
.pd-dlg-meta {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px 20px;
    margin-bottom: 14px;

    label {
        display: block;
        font-size: 11px;
        font-weight: 600;
        color: #909399;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-bottom: 2px;
    }
}
</style>
