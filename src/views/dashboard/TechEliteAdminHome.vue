<template>
    <div v-loading="loading">
        <!-- KPI strip — case-focused overview of the whole SQT pipeline -->
        <el-row :gutter="16" class="kpi-row">
            <el-col :xs="24" :sm="12" :md="6">
                <KpiTile label="Open SQT cases" :value="totals.open" icon="el-icon-tickets" color="blue" />
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
                <KpiTile label="Cases this week" :value="weekTotal" icon="el-icon-time" color="teal"
                    sub="New in last 7 days" />
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
                <KpiTile label="Awaiting parts" :value="totals.byStatus['waiting-for-parts'] || 0"
                    icon="el-icon-shopping-cart-2" color="orange" />
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
                <KpiTile label="Pending cases" :value="totals.byStatus['pending'] || 0"
                    icon="el-icon-document" color="purple" />
            </el-col>
        </el-row>

        <!-- Charts + aging row -->
        <el-row :gutter="16" class="content-row">
            <el-col :xs="24" :md="14">
                <div class="panel">
                    <div class="panel-header"><strong>Cases by status</strong></div>
                    <StatusDonut :by-status="totals.byStatus" height="320px" />
                </div>
            </el-col>
            <el-col :xs="24" :md="10">
                <div class="panel">
                    <div class="panel-header"><strong>Aging cases (&gt; 14 days)</strong></div>
                    <el-table :data="aging" size="small" :empty-text="'Nothing aging — nice!'" max-height="320">
                        <el-table-column label="Case" min-width="120">
                            <template slot-scope="scope">
                                <a class="case-link" @click="openCase(scope.row)">
                                    {{ scope.row.serviceRequestId || scope.row.caseId || '—' }}
                                </a>
                            </template>
                        </el-table-column>
                        <el-table-column label="Shop" prop="shopName" min-width="120" show-overflow-tooltip />
                        <el-table-column label="Status" width="130">
                            <template slot-scope="scope">
                                <el-tag size="mini" :type="statusTag(scope.row.status)">
                                    {{ statusLabel(scope.row.status) }}
                                </el-tag>
                            </template>
                        </el-table-column>
                        <el-table-column label="Age" width="80">
                            <template slot-scope="scope">{{ daysOld(scope.row.createdAt) }}d</template>
                        </el-table-column>
                    </el-table>
                </div>
            </el-col>
        </el-row>

        <!-- Recent cases -->
        <div class="panel">
            <div class="panel-header"><strong>Recent cases</strong></div>
            <RecentCasesTable :rows="recent" />
        </div>

        <!-- Quick actions -->
        <div class="panel">
            <div class="panel-header"><strong>Quick actions</strong></div>
            <QuickLinks :links="quickLinks" />
        </div>
    </div>
</template>

<script>
import KpiTile from './components/KpiTile'
import StatusDonut from './components/StatusDonut'
import RecentCasesTable from './components/RecentCasesTable'
import QuickLinks from './components/QuickLinks'
import { statusLabel, statusTag } from './components/caseStatus'
import { getSqtDashboard } from '@/api/dashboard'

// TechElite Admin home — comprehensive SQT pipeline overview. Originally lived
// as AdminHome; relocated here because TE is the primary day-to-day operator.
// Shop/user-count tiles were intentionally not moved across — they require the
// admin-only `system:user:manage` permission TE doesn't hold.
export default {
    name: 'TechEliteAdminHome',
    components: { KpiTile, StatusDonut, RecentCasesTable, QuickLinks },
    data() {
        return {
            loading: true,
            totals: { total: 0, open: 0, byStatus: {} },
            recent: [],
            aging: [],
            weekly: [],
            quickLinks: [
                { to: '/sqt/cases', title: 'SQT Cases', desc: 'Manage repair cases', icon: 'el-icon-tickets', color: 'blue' },
                { to: '/sqt/shops', title: 'Shops', desc: 'Repair shop directory', icon: 'el-icon-office-building', color: 'purple' },
                { to: '/sqt/models', title: 'Models', desc: 'Device model catalogue', icon: 'el-icon-mobile-phone', color: 'teal' }
            ]
        }
    },
    computed: {
        weekTotal() {
            return (this.weekly || []).reduce((s, r) => s + (r.count || 0), 0)
        }
    },
    created() { this.load() },
    methods: {
        statusLabel, statusTag,
        async load() {
            this.loading = true
            try {
                const res = await getSqtDashboard()
                const d = res.data || {}
                this.totals = d.totals || { total: 0, open: 0, byStatus: {} }
                this.recent = d.recent || []
                this.aging = d.aging || []
                this.weekly = d.weekly || []
            } catch (e) {
                console.error(e)
                this.$message.error('Failed to load dashboard')
            } finally {
                this.loading = false
            }
        },
        daysOld(d) {
            if (!d) return 0
            return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000))
        },
        openCase(row) {
            this.$router.push({ path: '/sqt/cases', query: { openCase: row._id } })
        }
    }
}
</script>

<style scoped>
.kpi-row { margin-bottom: 16px; }
.kpi-row .el-col { margin-bottom: 12px; }
.content-row .el-col { margin-bottom: 12px; }
.panel {
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 12px;
    padding: 18px 20px;
    margin-bottom: 16px;
}
.panel-header { font-size: 15px; color: #111827; margin-bottom: 12px; }
.case-link { color: #409eff; cursor: pointer; font-weight: 500; }
.case-link:hover { text-decoration: underline; }
</style>
