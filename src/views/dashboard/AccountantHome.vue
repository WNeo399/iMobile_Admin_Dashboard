<template>
    <div class="portal-home">
        <el-card shadow="never" class="ph-card">
            <div class="ph-title"><i class="el-icon-coin" /> iMobile Accountant</div>
            <div class="ph-text">
                The Dashboard has the consignment invoicing — devices the shops have sold that aren't invoiced yet,
                and the unpaid invoices. My Fone shows what the My Fone shops owe iMobile, from Zoho Inventory.
                InFlow has the sales orders and their payments, and Refurbished Device the stock, sales and consignment.
            </div>
            <el-button type="primary" icon="el-icon-data-analysis" @click="$router.push('/accountant/dashboard')">Dashboard</el-button>
            <el-button icon="el-icon-s-shop" @click="$router.push('/accountant/myfone')">My Fone</el-button>
            <el-button icon="el-icon-s-order" @click="$router.push('/inflow/salesOrders')">InFlow Sales Orders</el-button>
            <el-button icon="el-icon-mobile-phone" @click="$router.push('/refurbished/stock')">Refurbished Stock</el-button>
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
