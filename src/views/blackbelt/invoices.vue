<template>
    <div class="bb-page">
        <div class="bb-placeholder">
            <i class="el-icon-tickets" />
            <h2>Invoices</h2>
            <p>Blackbelt · Invoices — placeholder page. Details to come.</p>
        </div>
    </div>
</template>

<script>
export default {
    name: 'BlackbeltInvoices'
}
</script>

<style scoped>
.bb-page {
    padding: 24px;
    min-height: calc(100vh - 84px);
    background: #f6f8fb;
}
.bb-placeholder {
    text-align: center;
    color: #909399;
    padding: 90px 0;
}
.bb-placeholder i { font-size: 52px; color: #c0c4cc; }
.bb-placeholder h2 { margin: 16px 0 6px; color: #303133; font-weight: 600; }
.bb-placeholder p { margin: 0; font-size: 13px; }
</style>
