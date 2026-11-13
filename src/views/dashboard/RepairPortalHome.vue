<template>
    <div class="portal-home">
        <el-card shadow="never" class="ph-card">
            <div class="ph-title"><i class="el-icon-s-tools" /> {{ $tp('Your repairs with iMobile') }}</div>
            <div class="ph-text">{{ $tp('See every repair ticket of your shops and where it is up to, and send iMobile a new device to repair') }}</div>
            <el-button type="primary" icon="el-icon-tickets" @click="$router.push('/portal/repair/index')">{{ $tp('Repair Tickets') }}</el-button>
            <el-button icon="el-icon-plus" @click="$router.push({ path: '/portal/repair/index', query: { new: '1' } })">{{ $tp('New ticket') }}</el-button>
        </el-card>
    </div>
</template>

<script>
// Home for the Repair Customer role (2026-11-13) — the repair portal.
export default {
    name: 'RepairPortalHome'
}
</script>

<style scoped>
.portal-home { padding: 4px 0; }
.ph-card { max-width: 560px; }
.ph-title { font-size: 18px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.ph-title i { color: #409eff; margin-right: 4px; }
.ph-text { color: #606266; font-size: 13px; margin-bottom: 18px; line-height: 1.6; }
</style>
