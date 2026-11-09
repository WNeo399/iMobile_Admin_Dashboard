<template>
    <div class="portal-home">
        <el-card shadow="never" class="ph-card">
            <div class="ph-title"><i class="el-icon-mobile-phone" /> Your devices</div>
            <div class="ph-text">See the refurbished devices you've bought from us — your orders, each device's details and its Blackbelt test report.</div>
            <el-button type="primary" icon="el-icon-mobile-phone" @click="$router.push('/portal/devices/index')">My Devices</el-button>
        </el-card>
    </div>
</template>

<script>
// Home for the Devices Customer role (2026-11-09). An account that is also
// an InFlow Customer gets the "Home for" picker between the two homes.
export default {
    name: 'DevicesCustomerHome'
}
</script>

<style scoped>
.portal-home { padding: 4px 0; }
.ph-card { max-width: 560px; }
.ph-title { font-size: 18px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.ph-title i { color: #409eff; margin-right: 4px; }
.ph-text { color: #606266; font-size: 13px; margin-bottom: 18px; line-height: 1.6; }
</style>
