<template>
    <div class="portal-home">
        <el-card shadow="never" class="ph-card">
            <div class="ph-title"><i class="el-icon-document" /> Your customer portal</div>
            <div class="ph-text">View your account statement — invoices, payments, and your outstanding balance.</div>
            <el-button type="primary" icon="el-icon-right" @click="$router.push('/statement/index')">Go to my statement</el-button>
        </el-card>
    </div>
</template>

<script>
export default {
    name: 'InflowCustomerHome'
}
</script>

<style scoped>
.portal-home { padding: 4px 0; }
.ph-card { max-width: 560px; }
.ph-title { font-size: 18px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.ph-title i { color: #409eff; margin-right: 4px; }
.ph-text { color: #606266; font-size: 13px; margin-bottom: 18px; line-height: 1.6; }
</style>
