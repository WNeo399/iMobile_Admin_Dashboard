<template>
    <div class="portal-home">
        <el-card shadow="never" class="ph-card">
            <div class="ph-title"><i class="el-icon-user" /> iMobile Front Desk</div>
            <div class="ph-text">
                SQT repair cases, InFlow sales orders and payments, refurbished device stock, sales and consignment,
                and the tools.
            </div>
            <el-button type="primary" icon="el-icon-document" @click="$router.push('/sqt/cases')">SQT Cases</el-button>
            <el-button icon="el-icon-s-order" @click="$router.push('/inflow/salesOrders')">InFlow Sales Orders</el-button>
            <el-button icon="el-icon-mobile-phone" @click="$router.push('/refurbished/stock')">Refurbished Stock</el-button>
            <el-button icon="el-icon-magic-stick" @click="$router.push('/tools')">Tools</el-button>
        </el-card>
    </div>
</template>

<script>
export default {
    name: 'FrontDeskHome'
}
</script>

<style scoped>
.portal-home { padding: 4px 0; }
.ph-card { max-width: 640px; }
.ph-title { font-size: 18px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.ph-title i { color: #409eff; margin-right: 4px; }
.ph-text { color: #606266; font-size: 13px; margin-bottom: 18px; line-height: 1.6; }
</style>
