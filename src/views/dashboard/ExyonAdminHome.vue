<template>
    <div class="portal-home">
        <el-card shadow="never" class="ph-card">
            <div class="ph-title"><i class="el-icon-s-custom" /> Exyon Admin</div>
            <div class="ph-text">
                Exyon's accessory orders, SQT repair cases, Blackbelt accounts and invoices, and the ExEngine data.
            </div>
            <div class="ph-row">
                <span class="ph-label">Exyon Accessories</span>
                <el-button type="primary" size="small" icon="el-icon-box" @click="$router.push('/exyonAccessories/dispatch')">Dispatch</el-button>
                <el-button size="small" icon="el-icon-printer" @click="$router.push('/exyonAccessories/pickLists')">Pick Lists</el-button>
                <el-button size="small" icon="el-icon-tickets" @click="$router.push('/exyonAccessories/orders')">Orders</el-button>
            </div>
            <div class="ph-row">
                <span class="ph-label">SQT</span>
                <el-button size="small" icon="el-icon-s-cooperation" @click="$router.push('/sqt/cases')">Cases</el-button>
            </div>
            <div class="ph-row">
                <span class="ph-label">Blackbelt</span>
                <el-button size="small" icon="el-icon-office-building" @click="$router.push('/blackbelt/accounts')">Accounts</el-button>
                <el-button size="small" icon="el-icon-tickets" @click="$router.push('/blackbelt/invoices')">Invoices</el-button>
            </div>
            <div class="ph-row">
                <span class="ph-label">ExEngine</span>
                <el-button size="small" icon="el-icon-data-analysis" @click="$router.push('/exengine/devices/insights')">Insights</el-button>
            </div>
        </el-card>
    </div>
</template>

<script>
// Home for the Exyon Admin role (2026-10-20): shortcuts into its four menus.
export default {
    name: 'ExyonAdminHome'
}
</script>

<style scoped>
.portal-home { padding: 4px 0; }
.ph-card { max-width: 680px; }
.ph-title { font-size: 18px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.ph-title i { color: #409eff; margin-right: 4px; }
.ph-text { color: #606266; font-size: 13px; margin-bottom: 16px; line-height: 1.6; }
.ph-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
.ph-row .el-button + .el-button { margin-left: 0; }
.ph-label { width: 130px; font-size: 13px; font-weight: 600; color: #303133; }
</style>
