<template>
    <!-- Home for the Supplier Warehouse role (2026-10-13): the supplier's
         warehouse staff scan the parcels into shipment batches on their
         phones — the Dispatch Batches page and nothing else. -->
    <div class="portal-home">
        <el-card shadow="never" class="ph-card">
            <div class="ph-title"><i class="el-icon-truck" /> {{ $tp('Dispatch Batches') }}</div>
            <div class="ph-text">{{ $tp('Scan the labels of each parcel into a batch and save it as a draft; the office fills in the prices and ships it') }}</div>
            <el-button type="primary" icon="el-icon-plus" @click="$router.push({ path: '/sparePartsPurchase/batches', query: { create: 1 } })">{{ $tp('Create Batch') }}</el-button>
            <el-button icon="el-icon-truck" @click="$router.push('/sparePartsPurchase/batches')">{{ $tp('Dispatch Batches') }}</el-button>
        </el-card>
    </div>
</template>

<script>
export default {
    name: 'SupplierWarehouseHome'
}
</script>

<style scoped>
.portal-home { padding: 4px 0; }
.ph-card { max-width: 560px; }
.ph-title { font-size: 18px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.ph-title i { color: #409eff; margin-right: 4px; }
.ph-text { color: #606266; font-size: 13px; margin-bottom: 18px; line-height: 1.6; }
</style>
