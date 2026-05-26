<template>
    <div v-loading="loading">
        <!-- KPI strip — aggregated across all owned shops -->
        <el-row :gutter="16" class="kpi-row">
            <el-col :xs="24" :sm="12" :md="6">
                <KpiTile label="Open cases" :value="totals.open" icon="el-icon-tickets" color="blue" />
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
                <KpiTile label="Parts received" :value="totals.byStatus['parts-arrived'] || 0" icon="el-icon-box" color="orange"
                    sub="Ready to start repair" />
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
                <KpiTile label="Awaiting collection" :value="totals.byStatus['repaired'] || 0" icon="el-icon-bell" color="purple" />
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
                <KpiTile label="Action queue" :value="actionQueue.length" icon="el-icon-warning-outline" color="red"
                    sub="Cases waiting on you" />
            </el-col>
        </el-row>

        <!-- Per-shop breakdown -->
        <div class="panel" v-if="shops.length > 0">
            <div class="panel-header"><strong>Per-shop breakdown</strong></div>
            <el-table :data="shops" size="small" stripe>
                <el-table-column label="Shop" prop="shopName" min-width="200" show-overflow-tooltip />
                <el-table-column label="Open" prop="open" width="100" align="center" />
                <el-table-column label="Parts received" prop="partsReceived" width="140" align="center" />
                <el-table-column label="Awaiting collection" prop="awaitingCollection" width="170" align="center" />
                <el-table-column label="Repaired this month" prop="repairedThisMonth" width="170" align="center" />
                <el-table-column label="" width="120">
                    <template slot-scope="scope">
                        <el-button type="text" size="mini" @click="goShopCases(scope.row)">
                            View cases →
                        </el-button>
                    </template>
                </el-table-column>
            </el-table>
        </div>

        <!-- Action queue -->
        <div class="panel">
            <div class="panel-header">
                <strong>Action queue</strong>
                <span class="panel-sub">Cases where the shop is the next actor</span>
            </div>
            <el-table :data="actionQueue" size="small" stripe :empty-text="'Nothing to action — all caught up!'" max-height="420">
                <el-table-column label="Case" min-width="140">
                    <template slot-scope="scope">
                        <a class="case-link" @click="openCase(scope.row)">
                            {{ scope.row.serviceRequestId || scope.row.caseId || '—' }}
                        </a>
                    </template>
                </el-table-column>
                <el-table-column label="Shop" prop="shopName" min-width="140" show-overflow-tooltip />
                <el-table-column label="Customer" min-width="140" show-overflow-tooltip>
                    <template slot-scope="scope">{{ customerName(scope.row) }}</template>
                </el-table-column>
                <el-table-column label="Device" min-width="140" show-overflow-tooltip>
                    <template slot-scope="scope">
                        {{ (scope.row.device && (scope.row.device.modelName || scope.row.device.description)) || '—' }}
                    </template>
                </el-table-column>
                <el-table-column label="Next action" width="180">
                    <template slot-scope="scope">
                        <el-tag size="mini" :type="statusTag(scope.row.status)">
                            {{ nextAction(scope.row.status) }}
                        </el-tag>
                    </template>
                </el-table-column>
            </el-table>
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

// What the shop has to do next when a case is in a given status.
const NEXT_ACTION_LABEL = {
    'parts-arrived': 'Notify customer',
    'waiting-for-drop-off': 'Start repair',
    repairing: 'Mark repaired',
    repaired: 'Mark collected'
}

// Shop Owner home — same data as Repair Shop, but the per-shop table is
// useful here because owners have multiple shops.
export default {
    name: 'ShopOwnerHome',
    components: { KpiTile, QuickLinks },
    data() {
        return {
            loading: true,
            totals: { total: 0, open: 0, byStatus: {} },
            shops: [],
            actionQueue: [],
            quickLinks: [
                { to: '/sqt/cases', title: 'My Cases', desc: 'All cases across your shops', icon: 'el-icon-tickets', color: 'blue' }
            ]
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
                const sqt = sqtRes.data || {}
                this.totals = sqt.totals || { total: 0, open: 0, byStatus: {} }
                const shop = shopRes.data || {}
                this.shops = shop.shops || []
                this.actionQueue = shop.actionQueue || []
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
        nextAction(s) { return NEXT_ACTION_LABEL[s] || statusLabel(s) },
        openCase(row) {
            this.$router.push({ path: '/sqt/cases', query: { openCase: row._id } })
        },
        goShopCases(row) {
            this.$router.push({ path: '/sqt/cases', query: { shopId: row.shopId } })
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
.case-link { color: #409eff; cursor: pointer; font-weight: 500; }
.case-link:hover { text-decoration: underline; }
</style>
