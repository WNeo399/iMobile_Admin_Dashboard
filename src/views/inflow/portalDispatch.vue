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
            <el-table-column type="expand">
                <template slot-scope="s">
                    <el-table :data="s.row.lineItems" size="mini" border class="pd-lines">
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
                </template>
            </el-table-column>
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
            <el-table-column label="Status" width="120" align="center">
                <template slot-scope="s">
                    <el-tag size="mini" :type="dispatchTag(s.row.dispatchStatus)">{{ dispatchLabel(s.row.dispatchStatus) }}</el-tag>
                </template>
            </el-table-column>
        </el-table>
    </div>
</template>

<script>
import { getMyInflowDispatch } from '@/api/inflow'

export default {
    name: 'InflowPortalDispatch',
    data() {
        return {
            loading: false,
            customerName: null,
            rows: []
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
.pd-lines { margin: 4px 12px; width: calc(100% - 24px); }
.pd-dim { color: #C0C4CC; }
.pd-done { color: #67C23A; font-weight: 600; }
</style>
