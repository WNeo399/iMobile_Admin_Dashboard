<template>
    <!-- Home for the SQT Call Center role: how many customers are waiting
         for their call, and the way to the list. -->
    <div class="portal-home">
        <el-card shadow="never" class="ph-card">
            <div class="ph-title"><i class="el-icon-phone-outline" /> {{ $tp('Call Center') }}</div>
            <div class="ph-text">{{ $tp('The cases still waiting for a call, with the customer details to hand') }}</div>
            <div class="ph-count">
                <b>{{ todo == null ? '…' : todo.toLocaleString() }}</b>
                <span>{{ $tp('Customers to call') }}</span>
            </div>
            <el-button type="primary" icon="el-icon-phone-outline" @click="$router.push('/sqt/callCenter')">{{ $tp('Open the call list') }}</el-button>
        </el-card>
    </div>
</template>

<script>
import { listCallCenterCases } from '@/api/sqtCallCenter'

export default {
    name: 'CallCenterHome',
    data() { return { todo: null } },
    async created() {
        try {
            const r = await listCallCenterCases({ tab: 'todo', page: 1, pageSize: 1 })
            this.todo = r && r.counts ? r.counts.todo : 0
        } catch (e) { this.todo = 0 }
    }
}
</script>

<style scoped>
.portal-home { padding: 4px 0; }
.ph-card { max-width: 640px; }
.ph-title { font-size: 18px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.ph-title i { color: #409eff; margin-right: 4px; }
.ph-text { color: #606266; font-size: 13px; margin-bottom: 14px; line-height: 1.6; }
.ph-count { display: flex; align-items: baseline; gap: 10px; margin-bottom: 18px; }
.ph-count b { font-size: 34px; color: #e6a23c; line-height: 1; }
.ph-count span { font-size: 13px; color: #909399; }
</style>
