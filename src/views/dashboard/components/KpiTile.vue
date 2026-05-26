<template>
    <div :class="['kpi-tile', `kpi-${color}`]">
        <div class="kpi-icon">
            <i :class="icon"></i>
        </div>
        <div class="kpi-body">
            <div class="kpi-label">{{ label }}</div>
            <div class="kpi-value">{{ value }}</div>
            <div v-if="sub" class="kpi-sub">{{ sub }}</div>
        </div>
    </div>
</template>

<script>
// Simple presentational KPI card. Colors map to a small palette so the dashboards
// stay visually consistent regardless of which role is viewing.
export default {
    name: 'KpiTile',
    props: {
        label: { type: String, required: true },
        value: { type: [Number, String], required: true },
        icon: { type: String, default: 'el-icon-data-line' },
        color: {
            type: String,
            default: 'blue',
            validator: v => ['blue', 'green', 'orange', 'purple', 'red', 'teal'].includes(v)
        },
        sub: { type: String, default: '' }
    }
}
</script>

<style scoped>
.kpi-tile {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 20px;
    border-radius: 12px;
    background: #fff;
    border: 1px solid #ebeef5;
    min-height: 92px;
    transition: box-shadow 0.18s ease, transform 0.18s ease;
}
.kpi-tile:hover {
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06);
    transform: translateY(-1px);
}
.kpi-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    flex-shrink: 0;
}
.kpi-body { min-width: 0; }
.kpi-label {
    color: #909399;
    font-size: 13px;
    margin-bottom: 4px;
}
.kpi-value {
    color: #111827;
    font-size: 26px;
    font-weight: 600;
    line-height: 1.1;
}
.kpi-sub {
    color: #909399;
    font-size: 12px;
    margin-top: 2px;
}

/* color palette */
.kpi-blue   .kpi-icon { background: #eff6ff; color: #1d4ed8; }
.kpi-green  .kpi-icon { background: #f0fdf4; color: #15803d; }
.kpi-orange .kpi-icon { background: #fff7ed; color: #c2410c; }
.kpi-purple .kpi-icon { background: #f5f3ff; color: #6d28d9; }
.kpi-red    .kpi-icon { background: #fef2f2; color: #b91c1c; }
.kpi-teal   .kpi-icon { background: #f0fdfa; color: #0f766e; }
</style>
