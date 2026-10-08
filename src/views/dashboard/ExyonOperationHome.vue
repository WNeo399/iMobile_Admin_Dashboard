<template>
    <div class="portal-home">
        <el-card shadow="never" class="ph-card">
            <div class="ph-title"><i class="el-icon-goods" /> Exyon Operation</div>
            <div class="ph-text">
                Exyon's accessory orders: process the open orders (scan the tracking numbers and print the
                shipping labels) and print each day's pick list.
            </div>
            <el-button type="primary" icon="el-icon-box" @click="$router.push('/exyonAccessories/dispatch')">Dispatch</el-button>
            <el-button icon="el-icon-printer" @click="$router.push('/exyonAccessories/pickLists')">Pick Lists</el-button>
            <el-button icon="el-icon-tickets" @click="$router.push('/exyonAccessories/orders')">Orders</el-button>
        </el-card>
    </div>
</template>

<script>
export default {
    name: 'ExyonOperationHome'
}
</script>

<style scoped>
.portal-home { padding: 4px 0; }
.ph-card { max-width: 640px; }
.ph-title { font-size: 18px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.ph-title i { color: #409eff; margin-right: 4px; }
.ph-text { color: #606266; font-size: 13px; margin-bottom: 18px; line-height: 1.6; }
</style>
