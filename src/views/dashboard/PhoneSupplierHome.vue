<template>
    <div class="portal-home">
        <el-card shadow="never" class="ph-card">
            <div class="ph-title"><i class="el-icon-mobile-phone" /> Refurbished phones market</div>
            <div class="ph-text">
                Browse the refurbished device market data — current offers, prices, sellers and stock —
                or ask the AI Agent a question in plain language.
            </div>
            <el-button type="primary" icon="el-icon-data-line" @click="$router.push('/refurbished/scraper/dashboard')">Market Dashboard</el-button>
            <el-button icon="el-icon-mobile-phone" @click="$router.push('/refurbished/scraper/reebelo')">Reebelo Offers</el-button>
            <el-button icon="el-icon-chat-line-round" @click="$router.push('/refurbished/ask')">AI Agent</el-button>
        </el-card>
    </div>
</template>

<script>
export default {
    name: 'PhoneSupplierHome'
}
</script>

<style scoped>
.portal-home { padding: 4px 0; }
.ph-card { max-width: 620px; }
.ph-title { font-size: 18px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.ph-title i { color: #409eff; margin-right: 4px; }
.ph-text { color: #606266; font-size: 13px; margin-bottom: 18px; line-height: 1.6; }
</style>
