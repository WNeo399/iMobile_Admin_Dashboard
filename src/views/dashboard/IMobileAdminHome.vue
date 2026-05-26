<template>
    <div>
        <!-- Brief inventory-focused intro -->
        <el-row :gutter="16" class="kpi-row">
            <el-col :xs="24" :sm="12" :md="8">
                <KpiTile
                    label="Stock Monitoring"
                    value="Live"
                    icon="el-icon-goods"
                    color="green"
                    sub="Real-time inventory by collection"
                />
            </el-col>
            <el-col :xs="24" :sm="12" :md="8">
                <KpiTile
                    label="Collections"
                    value="Manage"
                    icon="el-icon-collection"
                    color="orange"
                    sub="Group products into collections"
                />
            </el-col>
            <el-col :xs="24" :sm="12" :md="8">
                <KpiTile
                    label="Sales analysis"
                    value="90d"
                    icon="el-icon-data-line"
                    color="blue"
                    sub="Zoho + InFlow sales side-by-side"
                />
            </el-col>
        </el-row>

        <div class="intro-panel">
            <div class="intro-text">
                <h3>Inventory at a glance</h3>
                <p>
                    Pick a collection in <strong>Stock Monitoring</strong> to see live stock-on-hand,
                    committed stock and available-for-sale figures across every product.
                    Open any product to drill into its price lists and a 90-day sales chart that
                    overlays <strong>Zoho online sales</strong> with <strong>InFlow consumption</strong>
                    from the repair team.
                </p>
                <p>
                    Use <strong>Collections</strong> to bundle SKUs into the groupings the rest of the
                    dashboard depends on.
                </p>
                <div class="intro-actions">
                    <el-button type="primary" icon="el-icon-goods" @click="$router.push('/zohoInventory/stockMonitoring')">
                        Open Stock Monitoring
                    </el-button>
                    <el-button icon="el-icon-collection" @click="$router.push('/zohoInventory/collections')">
                        Manage Collections
                    </el-button>
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

// iMobile Admin home — inventory only. No SQT data shown (they don't have
// sqt:case:list). The pitch panel doubles as an intro for new admins.
export default {
    name: 'IMobileAdminHome',
    components: { KpiTile, QuickLinks },
    data() {
        return {
            quickLinks: [
                { to: '/zohoInventory/stockMonitoring', title: 'Stock Monitoring', desc: 'Live inventory levels', icon: 'el-icon-goods', color: 'green' },
                { to: '/zohoInventory/collections', title: 'Collections', desc: 'Product collections', icon: 'el-icon-collection', color: 'orange' }
            ]
        }
    }
}
</script>

<style scoped>
.kpi-row { margin-bottom: 16px; }
.kpi-row .el-col { margin-bottom: 12px; }
.intro-panel {
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 12px;
    padding: 22px 26px;
    margin-bottom: 16px;
}
.intro-text h3 { margin: 0 0 10px; color: #111827; font-size: 18px; }
.intro-text p { color: #4b5563; line-height: 1.6; margin: 0 0 10px; }
.intro-actions { margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap; }
.panel {
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 12px;
    padding: 18px 20px;
    margin-bottom: 16px;
}
.panel-header { font-size: 15px; color: #111827; margin-bottom: 12px; }
</style>
