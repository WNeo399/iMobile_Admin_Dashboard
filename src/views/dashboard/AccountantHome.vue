<template>
    <div class="portal-home">
        <el-card shadow="never" class="ph-card">
            <div class="ph-title"><i class="el-icon-coin" /> iMobile Accountant</div>
            <div class="ph-text">
                What the My Fone shops owe iMobile, from Zoho Inventory: the total balance and how late it is,
                what was invoiced and paid over any dates, and a statement per shop.
            </div>
            <el-button type="primary" icon="el-icon-s-shop" @click="$router.push('/accountant/myfone')">My Fone</el-button>
        </el-card>
    </div>
</template>

<script>
export default {
    name: 'AccountantHome'
}
</script>

<style scoped>
.portal-home { padding: 4px 0; }
.ph-card { max-width: 560px; }
.ph-title { font-size: 18px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.ph-title i { color: #409eff; margin-right: 4px; }
.ph-text { color: #606266; font-size: 13px; margin-bottom: 18px; line-height: 1.6; }
</style>
