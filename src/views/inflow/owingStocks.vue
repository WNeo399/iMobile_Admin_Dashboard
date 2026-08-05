<template>
    <div class="inflow-owing app-container">
        <div class="ow-filters">
            <el-input v-model="search" size="small" clearable class="f-search"
                placeholder="Search SKU / description / invoice…" prefix-icon="el-icon-search"
                @keyup.enter.native="load" @clear="load" />
            <span class="ow-spacer" />
            <span class="ow-meta">{{ total.toLocaleString() }} SKUs · <b>{{ totalOwing.toLocaleString() }}</b> units owing</span>
            <el-button size="small" icon="el-icon-refresh" @click="load">Refresh</el-button>
            <el-button size="small" type="primary" icon="el-icon-search" @click="load">Search</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini" height="calc(100vh - 210px)"
            empty-text="Nothing owing — all dispatch records are fulfilled.">
            <el-table-column label="iMobile SKU" min-width="140">
                <template slot-scope="s">
                    <b v-if="s.row.imbSku">{{ s.row.imbSku }}</b>
                    <span v-else class="ow-dim">{{ s.row.sku || '—' }}</span>
                </template>
            </el-table-column>
            <el-table-column label="Description" min-width="240" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.description || '—' }}</template>
            </el-table-column>
            <el-table-column label="Owing" width="90" align="right">
                <template slot-scope="s"><span class="ow-owing">{{ s.row.owing }}</span></template>
            </el-table-column>
            <el-table-column label="Ordered" width="90" align="right">
                <template slot-scope="s">{{ s.row.ordered }}</template>
            </el-table-column>
            <el-table-column label="Dispatched" width="100" align="right">
                <template slot-scope="s">{{ s.row.dispatched }}</template>
            </el-table-column>
            <el-table-column label="Orders" min-width="280">
                <template slot-scope="s">
                    <el-tag v-for="o in s.row.orders" :key="String(o.id)"
                        size="mini" :type="o.type === 'manual' ? 'warning' : ''"
                        class="ow-order-tag" effect="plain"
                        @click="goDispatch(o)">
                        {{ o.invoiceNumber || '—' }} · {{ o.owing }}
                    </el-tag>
                </template>
            </el-table-column>
        </el-table>
    </div>
</template>

<script>
import { getInflowOwingStocks } from '@/api/inflow'

export default {
    name: 'InflowOwingStocks',
    data() {
        return {
            loading: false,
            rows: [],
            total: 0,
            totalOwing: 0,
            search: ''
        }
    },
    created() {
        this.load()
    },
    // Kept alive — quantities change as the warehouse dispatches, so
    // refresh whenever the user navigates back.
    activated() {
        this.load()
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await getInflowOwingStocks({ search: this.search.trim() })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.rows || []
                this.total = r.total || 0
                this.totalOwing = r.totalOwing || 0
            } catch (e) {
                this.$message.error((e.response && e.response.data && e.response.data.message) || e.message || 'Failed to load owing stocks')
            } finally {
                this.loading = false
            }
        },
        // Jump to Order Dispatch pre-filtered on this order so the user
        // can open its dispatch dialog straight away.
        goDispatch(order) {
            this.$router.push({ path: '/inflow/orderDispatch', query: { search: order.invoiceNumber || '' } })
        }
    }
}
</script>

<style lang="scss" scoped>
.inflow-owing { padding: 12px 16px; }
.ow-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.f-search { width: 280px; }
.ow-spacer { flex: 1; }
.ow-meta { font-size: 12px; color: #909399; margin-right: 6px; white-space: nowrap; }
.ow-meta b { color: #E6A23C; }
.ow-dim { color: #909399; }
.ow-owing { color: #E6A23C; font-weight: 700; }
.ow-order-tag { margin: 2px 6px 2px 0; cursor: pointer; }
.ow-order-tag:hover { opacity: 0.75; }
</style>
