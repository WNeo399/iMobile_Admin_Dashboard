<template>
    <div class="portal-home">
        <el-card shadow="never" class="ph-card">
            <div class="ph-title"><i class="el-icon-box" /> Your consignment stock</div>
            <div class="ph-text">
                Review the devices consigned to your shop — confirm batches as received when they arrive,
                mark devices as sold when they sell, or initiate a return to send stock back.
            </div>
            <el-button type="primary" icon="el-icon-mobile-phone" @click="$router.push('/consignment/devices')">My Devices</el-button>
        </el-card>
    </div>
</template>

<script>
export default {
    name: 'ConsignmentShopHome'
}
</script>

<style scoped>
.portal-home { padding: 4px 0; }
.ph-card { max-width: 560px; }
.ph-title { font-size: 18px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.ph-title i { color: #409eff; margin-right: 4px; }
.ph-text { color: #606266; font-size: 13px; margin-bottom: 18px; line-height: 1.6; }
</style>
