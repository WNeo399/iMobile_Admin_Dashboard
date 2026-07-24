<template>
    <div class="portal-home">
        <el-card shadow="never" class="ph-card">
            <div class="ph-title"><i class="el-icon-shopping-cart-full" /> Purchasing</div>
            <div class="ph-text">
                Track purchase orders through ordering, shipping and receiving — and triage
                incoming special-order requests from customers.
            </div>
            <el-button type="primary" icon="el-icon-notebook-2" @click="$router.push('/imobile/purchaseOrder')">Purchase Order</el-button>
            <el-button icon="el-icon-shopping-cart-2" @click="$router.push('/imobile/specialOrder')">Special Order</el-button>
        </el-card>
    </div>
</template>

<script>
export default {
    name: 'ImobilePurchaseHome'
}
</script>

<style scoped>
.portal-home { padding: 4px 0; }
.ph-card { max-width: 560px; }
.ph-title { font-size: 18px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.ph-title i { color: #409eff; margin-right: 4px; }
.ph-text { color: #606266; font-size: 13px; margin-bottom: 18px; line-height: 1.6; }
</style>
