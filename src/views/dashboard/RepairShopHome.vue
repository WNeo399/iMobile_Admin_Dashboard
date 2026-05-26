<template>
    <div v-loading="loading">
        <!-- KPI strip — single shop view -->
        <el-row :gutter="16" class="kpi-row">
            <el-col :xs="24" :sm="12" :md="6">
                <KpiTile label="My open cases" :value="totals.open" icon="el-icon-tickets" color="blue" />
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
                <KpiTile label="Awaiting parts" :value="totals.byStatus['waiting-for-parts'] || 0" icon="el-icon-shopping-cart-2" color="orange" />
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
                <KpiTile label="Ready to repair" :value="totals.byStatus['parts-arrived'] || 0" icon="el-icon-box" color="teal" />
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
                <KpiTile label="Ready for collection" :value="totals.byStatus['repaired'] || 0" icon="el-icon-bell" color="purple" />
            </el-col>
        </el-row>

        <!-- Today's queue: cases grouped by the action you need to take -->
        <div class="panel">
            <div class="panel-header">
                <strong>Today's queue</strong>
                <span class="panel-sub">Grouped by the next action</span>
            </div>

            <div v-if="actionGroups.length === 0" class="empty-state">
                Nothing on your queue right now — nice work!
            </div>

            <div v-for="grp in actionGroups" :key="grp.status" class="action-group">
                <div class="group-header">
                    <el-tag size="small" :type="statusTag(grp.status)">{{ grp.label }}</el-tag>
                    <span class="group-count">{{ grp.cases.length }} case<span v-if="grp.cases.length !== 1">s</span></span>
                </div>
                <div class="group-cards">
                    <div v-for="c in grp.cases" :key="c._id" class="case-card" @click="openCase(c)">
                        <div class="card-row top">
                            <span class="card-id">{{ c.serviceRequestId || c.caseId || '—' }}</span>
                            <span class="card-age">{{ daysOld(c.createdAt) }}d</span>
                        </div>
                        <div class="card-row middle">{{ customerName(c) }}</div>
                        <div class="card-row sub">
                            {{ (c.device && (c.device.modelName || c.device.description)) || '—' }}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="panel">
            <div class="panel-header"><strong>Quick actions</strong></div>
            <QuickLinks :links="quickLinks" />
        </div>
    </div>
</template>

<script>
import KpiTile from './components/KpiTile'
import QuickLinks from './components/QuickLinks'
import { statusLabel, statusTag } from './components/caseStatus'
import { getSqtDashboard, getShopDashboard } from '@/api/dashboard'

// Workflow order: parts arrive → notify customer → customer drops off → repair
// → done → mark collected. We surface every status the shop must action.
const ACTION_ORDER = ['parts-arrived', 'waiting-for-drop-off', 'repairing', 'repaired']
const ACTION_LABEL = {
    'parts-arrived': 'Notify customer parts arrived',
    'waiting-for-drop-off': 'Start repair (after drop-off)',
    repairing: 'Mark as repaired',
    repaired: 'Mark as collected'
}

// Single repair shop home — action-card layout that mirrors the daily workflow.
export default {
    name: 'RepairShopHome',
    components: { KpiTile, QuickLinks },
    data() {
        return {
            loading: true,
            totals: { total: 0, open: 0, byStatus: {} },
            actionQueue: [],
            quickLinks: [
                { to: '/sqt/cases', title: 'All My Cases', desc: 'Full case list', icon: 'el-icon-tickets', color: 'blue' }
            ]
        }
    },
    computed: {
        actionGroups() {
            // Bucket the action queue by status, in our preferred display order.
            const byStatus = {}
            for (const c of this.actionQueue) {
                if (!byStatus[c.status]) byStatus[c.status] = []
                byStatus[c.status].push(c)
            }
            return ACTION_ORDER
                .filter(s => byStatus[s] && byStatus[s].length > 0)
                .map(s => ({ status: s, label: ACTION_LABEL[s] || statusLabel(s), cases: byStatus[s] }))
        }
    },
    created() { this.load() },
    methods: {
        statusLabel, statusTag,
        async load() {
            this.loading = true
            try {
                const [sqtRes, shopRes] = await Promise.all([
                    getSqtDashboard(),
                    getShopDashboard()
                ])
                this.totals = (sqtRes.data && sqtRes.data.totals) || { total: 0, open: 0, byStatus: {} }
                this.actionQueue = (shopRes.data && shopRes.data.actionQueue) || []
            } catch (e) {
                console.error(e)
                this.$message.error('Failed to load dashboard')
            } finally {
                this.loading = false
            }
        },
        customerName(row) {
            const c = row.customer || {}
            const n = [c.firstName, c.lastName].filter(Boolean).join(' ')
            return n || '—'
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
.panel {
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 12px;
    padding: 18px 20px;
    margin-bottom: 16px;
}
.panel-header {
    font-size: 15px; color: #111827; margin-bottom: 12px;
    display: flex; align-items: baseline; gap: 12px;
}
.panel-sub { color: #909399; font-size: 12px; font-weight: 400; }
.empty-state { color: #909399; padding: 24px 0; text-align: center; }
.action-group { margin-bottom: 22px; }
.action-group:last-child { margin-bottom: 0; }
.group-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.group-count { color: #909399; font-size: 13px; }
.group-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
}
.case-card {
    background: #fafbff;
    border: 1px solid #e7eaf3;
    border-radius: 10px;
    padding: 12px 14px;
    cursor: pointer;
    transition: box-shadow 0.18s ease, transform 0.18s ease, border-color 0.18s ease;
}
.case-card:hover {
    box-shadow: 0 6px 14px rgba(0,0,0,0.06);
    transform: translateY(-1px);
    border-color: #c6cef0;
}
.card-row { font-size: 13px; color: #4b5563; }
.card-row.top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.card-id { font-weight: 600; color: #111827; font-size: 14px; }
.card-age { color: #909399; font-size: 12px; }
.card-row.middle { color: #111827; font-weight: 500; }
.card-row.sub { color: #909399; font-size: 12px; margin-top: 2px; }
</style>
