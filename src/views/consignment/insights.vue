<template>
    <div class="ci-page" v-loading="loading">
        <div class="ci-header">
            <div>
                <div class="ci-title">Consignment Insights</div>
                <div class="ci-sub">Where the consigned stock is, what's sold, and what still needs invoicing.</div>
            </div>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">Refresh</el-button>
        </div>

        <!-- Status KPIs -->
        <div class="ci-kpis">
            <div v-for="s in STATUS_LIST" :key="s.value" class="ci-kpi">
                <div class="ci-kpi-icon" :style="{ background: s.bg, color: s.color }"><i :class="s.icon" /></div>
                <div>
                    <div class="ci-kpi-label">{{ s.label }}</div>
                    <div class="ci-kpi-count">{{ (byStatus[s.value] && byStatus[s.value].count) || 0 }}</div>
                    <div class="ci-kpi-sub">{{ money((byStatus[s.value] && byStatus[s.value].value) || 0) }}</div>
                </div>
            </div>
            <div class="ci-kpi ci-kpi-invoice">
                <div class="ci-kpi-icon" style="background:#FDF2F2;color:#F56C6C"><i class="el-icon-document-add" /></div>
                <div>
                    <div class="ci-kpi-label">Awaiting Invoice</div>
                    <div class="ci-kpi-count">{{ uninvoicedSold.count }}</div>
                    <div class="ci-kpi-sub">{{ money(uninvoicedSold.value) }}</div>
                </div>
            </div>
        </div>

        <!-- Weekly sold trend -->
        <div class="ci-card">
            <div class="ci-card-title">Devices sold per week <span class="ci-card-note">— last 12 weeks</span></div>
            <result-chart v-if="weeklyChart" :chart="weeklyChart" height="260px" />
            <div v-else class="ci-empty">No sales recorded yet.</div>
        </div>

        <!-- Per-shop table -->
        <div class="ci-card">
            <div class="ci-card-title">By shop</div>
            <el-table :data="shops" size="small">
                <el-table-column label="Shop" min-width="160">
                    <template slot-scope="s">
                        <span class="ci-shop">{{ s.row.name }}</span>
                        <el-tag v-if="!s.row.active" size="mini" type="info" style="margin-left:6px">Inactive</el-tag>
                    </template>
                </el-table-column>
                <el-table-column label="In Transit" width="100" align="center"><template slot-scope="s">{{ s.row['in-transit'] }}</template></el-table-column>
                <el-table-column label="At Shop" width="100" align="center"><template slot-scope="s">{{ s.row['received'] }}</template></el-table-column>
                <el-table-column label="Sold" width="100" align="center"><template slot-scope="s">{{ s.row['sold'] }}</template></el-table-column>
                <el-table-column label="Returning" width="100" align="center"><template slot-scope="s">{{ s.row['returning'] }}</template></el-table-column>
                <el-table-column label="Returned" width="100" align="center"><template slot-scope="s">{{ s.row['returned'] }}</template></el-table-column>
                <template slot="empty"><span class="ci-empty">No shops yet.</span></template>
            </el-table>
        </div>
    </div>
</template>

<script>
import ResultChart from '@/components/AiChat/ResultChart'
import { getConsignInsights } from '@/api/consignment'

const STATUS_LIST = [
    { value: 'in-transit', label: 'In Transit', icon: 'el-icon-truck', color: '#E6A23C', bg: '#FDF6EC' },
    { value: 'received', label: 'At Shop', icon: 'el-icon-s-shop', color: '#409EFF', bg: '#ECF5FF' },
    { value: 'sold', label: 'Sold', icon: 'el-icon-sell', color: '#67C23A', bg: '#F0F9EB' },
    { value: 'returning', label: 'Returning', icon: 'el-icon-back', color: '#8B5CF6', bg: '#F3EFFF' },
    { value: 'returned', label: 'Returned', icon: 'el-icon-finished', color: '#909399', bg: '#F4F4F5' }
]

export default {
    name: 'ConsignmentInsights',
    components: { ResultChart },
    data() {
        return {
            STATUS_LIST,
            loading: false,
            byStatus: {},
            uninvoicedSold: { count: 0, value: 0 },
            shops: [],
            weeklySold: []
        }
    },
    computed: {
        weeklyChart() {
            if (!this.weeklySold.length) return null
            return {
                type: 'bar',
                xLabels: this.weeklySold.map(w => w.week),
                series: [{ name: 'Devices sold', data: this.weeklySold.map(w => w.count) }]
            }
        }
    },
    created() {
        this.load()
    },
    // Keep-alive revisits skip created() — refresh so cross-page changes show.
    activated() {
        this.load()
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await getConsignInsights()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.byStatus = r.byStatus || {}
                this.uninvoicedSold = r.uninvoicedSold || { count: 0, value: 0 }
                this.shops = r.shops || []
                this.weeklySold = r.weeklySold || []
            } catch (e) {
                this.$message.error((e.response && e.response.data && e.response.data.message) || e.message || 'Failed to load insights')
            } finally {
                this.loading = false
            }
        },
        money(v) {
            return '$' + Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
        }
    }
}
</script>

<style scoped>
.ci-page { padding: 16px 20px; min-height: calc(100vh - 84px); background: #f6f8fb; }
.ci-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.ci-title { font-size: 20px; font-weight: 700; color: #1f2937; line-height: 1.2; }
.ci-sub { font-size: 13px; color: #909399; margin-top: 3px; }

.ci-kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 12px; }
.ci-kpi { display: flex; align-items: center; gap: 12px; background: #fff; border: 1px solid #ebeef5; border-radius: 10px; padding: 13px 15px; }
.ci-kpi-invoice { border-left: 3px solid #F56C6C; }
.ci-kpi-icon { width: 42px; height: 42px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 20px; }
.ci-kpi-label { font-size: 12.5px; color: #909399; line-height: 1.2; }
.ci-kpi-count { font-size: 21px; font-weight: 700; color: #1f2937; line-height: 1.25; }
.ci-kpi-sub { font-size: 11px; color: #a0a4ab; }

.ci-card { background: #fff; border: 1px solid #ebeef5; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; }
.ci-card-title { font-size: 14px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.ci-card-note { font-weight: normal; color: #909399; font-size: 12px; }
.ci-shop { font-weight: 600; color: #303133; }
.ci-empty { color: #909399; font-size: 13px; padding: 12px 0; }

@media (max-width: 1100px) {
    .ci-kpis { grid-template-columns: repeat(3, 1fr); }
}
</style>
