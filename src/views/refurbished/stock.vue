<template>
    <div class="rs-page">
        <div class="rs-placeholder">
            <i class="el-icon-box" />
            <h2>Stock</h2>
            <p>Refurbished Phones · Stock — placeholder page. Details to come.</p>
        </div>
    </div>
</template>

<script>
export default {
    name: 'RefurbishedStock'
}
</script>

<style scoped>
.rs-page {
    padding: 24px;
    min-height: calc(100vh - 84px);
    background: #f6f8fb;
}
.rs-placeholder {
    text-align: center;
    color: #909399;
    padding: 90px 0;
}
.rs-placeholder i { font-size: 52px; color: #c0c4cc; }
.rs-placeholder h2 { margin: 16px 0 6px; color: #303133; font-weight: 600; }
.rs-placeholder p { margin: 0; font-size: 13px; }
</style>
