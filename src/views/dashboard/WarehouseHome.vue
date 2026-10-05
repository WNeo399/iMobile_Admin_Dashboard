<template>
    <div class="portal-home">
        <el-card shadow="never" class="ph-card">
            <div class="ph-title"><i class="el-icon-box" /> iMobile Warehouse</div>
            <div class="ph-text">
                Spare parts stock and prices, the spare parts purchase orders and batches, InFlow sales orders and
                dispatch, and the warehouse tools.
            </div>
            <el-button type="primary" icon="el-icon-s-data" @click="$router.push('/zohoInventory/stockMonitoring')">Stock Monitoring</el-button>
            <el-button icon="el-icon-shopping-cart-2" @click="$router.push('/sparePartsPurchase/orders')">Purchase Orders</el-button>
            <el-button icon="el-icon-s-order" @click="$router.push('/inflow/salesOrders')">InFlow Sales Orders</el-button>
            <el-button icon="el-icon-magic-stick" @click="$router.push('/tools')">Tools</el-button>
        </el-card>
    </div>
</template>

<script>
export default {
    name: 'WarehouseHome'
}
</script>

<style scoped>
.portal-home { padding: 4px 0; }
.ph-card { max-width: 640px; }
.ph-title { font-size: 18px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.ph-title i { color: #409eff; margin-right: 4px; }
.ph-text { color: #606266; font-size: 13px; margin-bottom: 18px; line-height: 1.6; }
</style>
