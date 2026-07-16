<template>
    <div class="ins-page" v-loading="loading">
        <!-- Header -->
        <div class="ins-header">
            <div>
                <div class="ins-title">Insights</div>
                <div class="ins-sub">
                    Device sales from ExEngine
                    <span v-if="rangeStr">· {{ rangeStr }}</span>
                    <span v-if="syncedStr" class="ins-synced">· updated {{ syncedStr }}</span>
                </div>
            </div>
            <div class="ins-actions">
                <el-radio-group v-model="days" size="small" @change="load">
                    <el-radio-button :label="30">30d</el-radio-button>
                    <el-radio-button :label="90">90d</el-radio-button>
                    <el-radio-button :label="180">6m</el-radio-button>
                    <el-radio-button :label="365">1y</el-radio-button>
                    <el-radio-button :label="0">All</el-radio-button>
                </el-radio-group>
                <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">Refresh</el-button>
            </div>
        </div>

        <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="ins-alert" />

        <!-- Summary KPI cards (all-time) -->
        <div class="ins-kpis">
            <div class="ins-kpi">
                <div class="ins-kpi-icon" style="background:#ECF5FF;color:#409EFF"><i class="el-icon-goods" /></div>
                <div class="ins-kpi-body">
                    <div class="ins-kpi-label">Units sold</div>
                    <div class="ins-kpi-val">{{ num(summary.units) }}</div>
                    <div class="ins-kpi-sub">{{ num(windowInfo.units) }} in {{ windowLabel }}</div>
                </div>
            </div>
            <div class="ins-kpi">
                <div class="ins-kpi-icon" style="background:#F0F9EB;color:#67C23A"><i class="el-icon-money" /></div>
                <div class="ins-kpi-body">
                    <div class="ins-kpi-label">Revenue</div>
                    <div class="ins-kpi-val">{{ money(summary.revenue) }}</div>
                    <div class="ins-kpi-sub">{{ money(windowInfo.revenue) }} in {{ windowLabel }}</div>
                </div>
            </div>
            <div class="ins-kpi">
                <div class="ins-kpi-icon" style="background:#FDF6EC;color:#E6A23C"><i class="el-icon-price-tag" /></div>
                <div class="ins-kpi-body">
                    <div class="ins-kpi-label">Avg sale price</div>
                    <div class="ins-kpi-val">{{ money(summary.avgPrice) }}</div>
                    <div class="ins-kpi-sub">{{ money(windowInfo.avgPrice) }} in {{ windowLabel }}</div>
                </div>
            </div>
            <div class="ins-kpi">
                <div class="ins-kpi-icon" style="background:#F3EFFF;color:#8B5CF6"><i class="el-icon-cpu" /></div>
                <div class="ins-kpi-body">
                    <div class="ins-kpi-label">Distinct models</div>
                    <div class="ins-kpi-val">{{ num(summary.models) }}</div>
                    <div class="ins-kpi-sub">by source: <span v-for="(s, i) in bySource" :key="s.source">{{ i ? ' · ' : '' }}{{ s.source }} {{ num(s.units) }}</span></div>
                </div>
            </div>
        </div>

        <!-- Selling trend -->
        <div class="ins-card">
            <div class="ins-card-title">Selling trend <span class="ins-card-note">— monthly units &amp; revenue (all time)</span></div>
            <div ref="trendChart" class="ins-chart"></div>
        </div>

        <!-- Per-model trend -->
        <div class="ins-card">
            <div class="ins-card-head">
                <div class="ins-card-title">Model trend <span class="ins-card-note">— monthly units by model (all time)</span></div>
                <el-select v-model="selectedModels" multiple collapse-tags filterable size="small"
                    placeholder="Select models to compare" class="ins-model-select" @change="renderModelTrend">
                    <el-option v-for="m in modelTrends" :key="m.model" :label="m.model + ' (' + m.total + ')'" :value="m.model" />
                </el-select>
            </div>
            <div ref="modelTrendChart" class="ins-chart"></div>
        </div>

        <div class="ins-row">
            <!-- Fast-moving models chart -->
            <div class="ins-card ins-col">
                <div class="ins-card-title">Fast-moving models <span class="ins-card-note">— top by units in {{ windowLabel }}</span></div>
                <div ref="modelChart" class="ins-chart"></div>
            </div>

            <!-- Fast-moving models table -->
            <div class="ins-card ins-col">
                <div class="ins-card-title">Top models</div>
                <el-table :data="topModels" size="mini" height="360" class="ins-table">
                    <el-table-column type="index" label="#" width="44" align="center" />
                    <el-table-column prop="model" label="Model" min-width="180" show-overflow-tooltip />
                    <el-table-column label="Units" width="80" align="right"><template slot-scope="s">{{ num(s.row.units) }}</template></el-table-column>
                    <el-table-column label="Revenue" width="110" align="right"><template slot-scope="s">{{ money(s.row.revenue) }}</template></el-table-column>
                    <el-table-column label="Avg" width="90" align="right"><template slot-scope="s">{{ money(s.row.avgPrice) }}</template></el-table-column>
                    <template slot="empty"><span class="ins-empty">No sales in this window.</span></template>
                </el-table>
            </div>
        </div>
    </div>
</template>

<script>
import * as echarts from 'echarts'
import { getExInsights } from '@/api/exengine'

export default {
    name: 'ExEngineInsights',
    data() {
        return {
            loading: false,
            error: '',
            days: 90,
            summary: { units: 0, revenue: 0, avgPrice: 0, models: 0 },
            windowInfo: { days: 90, units: 0, revenue: 0, avgPrice: 0 },
            topModels: [],
            trend: [],
            months: [],
            modelTrends: [],
            selectedModels: [],
            bySource: [],
            range: { first: null, last: null },
            syncedAt: null,
            trendChart: null,
            modelChart: null,
            modelTrendChart: null
        }
    },
    computed: {
        windowLabel() {
            const d = this.days
            if (!d) return 'all time'
            if (d % 365 === 0) return (d / 365) + 'y'
            if (d % 30 === 0) return (d / 30) + 'm'
            return d + ' days'
        },
        rangeStr() {
            const f = this.range.first, l = this.range.last
            if (!f || !l) return ''
            return this.dateStr(f) + ' – ' + this.dateStr(l)
        },
        syncedStr() {
            if (!this.syncedAt) return ''
            const d = new Date(this.syncedAt)
            return isNaN(d.getTime()) ? '' : d.toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })
        }
    },
    mounted() {
        this.trendChart = echarts.init(this.$refs.trendChart)
        this.modelChart = echarts.init(this.$refs.modelChart)
        this.modelTrendChart = echarts.init(this.$refs.modelTrendChart)
        window.addEventListener('resize', this.onResize)
        this.load()
    },
    beforeDestroy() {
        window.removeEventListener('resize', this.onResize)
        if (this.trendChart) this.trendChart.dispose()
        if (this.modelChart) this.modelChart.dispose()
        if (this.modelTrendChart) this.modelTrendChart.dispose()
    },
    methods: {
        async load() {
            this.loading = true
            this.error = ''
            try {
                const r = await getExInsights({ days: this.days })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.summary = r.summary || this.summary
                this.windowInfo = r.window || this.windowInfo
                this.topModels = r.topModels || []
                this.trend = r.trend || []
                this.months = r.months || []
                this.modelTrends = r.modelTrends || []
                this.bySource = r.bySource || []
                this.range = r.range || { first: null, last: null }
                this.syncedAt = r.syncedAt || null
                // Default the comparison to the 3 busiest models (first load only).
                if (!this.selectedModels.length) {
                    this.selectedModels = this.modelTrends.slice(0, 3).map(m => m.model)
                }
                this.$nextTick(this.renderCharts)
            } catch (e) {
                console.error('ExEngine insights load failed:', e)
                this.error = (e.response && e.response.data && e.response.data.message) || e.message || 'Failed to load insights'
            } finally {
                this.loading = false
            }
        },
        renderCharts() {
            this.renderTrend()
            this.renderModels()
            this.renderModelTrend()
        },
        renderModelTrend() {
            if (!this.modelTrendChart) return
            const palette = ['#409EFF', '#67C23A', '#E6A23C', '#8B5CF6', '#F56C6C', '#13C2C2', '#FF9800', '#795548']
            const series = this.selectedModels.map((model, i) => {
                const m = this.modelTrends.find(x => x.model === model)
                return {
                    name: model, type: 'line', smooth: true, showSymbol: false,
                    data: m ? m.units : [],
                    itemStyle: { color: palette[i % palette.length] }, lineStyle: { width: 2 }
                }
            })
            // notMerge (2nd arg true) so deselecting a model clears its line.
            this.modelTrendChart.setOption({
                tooltip: { trigger: 'axis' },
                legend: { type: 'scroll', top: 0, data: this.selectedModels },
                grid: { left: 8, right: 8, top: 34, bottom: 24, containLabel: true },
                xAxis: { type: 'category', data: this.months, axisLabel: { fontSize: 11 } },
                yAxis: { type: 'value', name: 'Units', splitLine: { lineStyle: { color: '#f0f2f5' } } },
                series
            }, true)
        },
        renderTrend() {
            if (!this.trendChart) return
            const months = this.trend.map(t => t.ym)
            this.trendChart.setOption({
                tooltip: { trigger: 'axis' },
                legend: { data: ['Units', 'Revenue'], right: 0, top: 0 },
                grid: { left: 8, right: 8, top: 34, bottom: 24, containLabel: true },
                xAxis: { type: 'category', data: months, axisLabel: { fontSize: 11 } },
                yAxis: [
                    { type: 'value', name: 'Units', splitLine: { lineStyle: { color: '#f0f2f5' } } },
                    { type: 'value', name: 'Revenue', axisLabel: { formatter: v => '$' + this.compact(v) }, splitLine: { show: false } }
                ],
                series: [
                    { name: 'Units', type: 'bar', data: this.trend.map(t => t.units), itemStyle: { color: '#409EFF', borderRadius: [3, 3, 0, 0] }, barMaxWidth: 26 },
                    { name: 'Revenue', type: 'line', yAxisIndex: 1, smooth: true, data: this.trend.map(t => t.revenue), itemStyle: { color: '#67C23A' }, lineStyle: { width: 2 } }
                ]
            })
        },
        renderModels() {
            if (!this.modelChart) return
            // Top ~12 for the bar, highest at the top.
            const list = this.topModels.slice(0, 12).slice().reverse()
            this.modelChart.setOption({
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: p => `${p[0].name}<br/>${p[0].value} units` },
                grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
                xAxis: { type: 'value', splitLine: { lineStyle: { color: '#f0f2f5' } } },
                yAxis: { type: 'category', data: list.map(m => m.model), axisLabel: { fontSize: 11, width: 150, overflow: 'truncate' } },
                series: [{
                    type: 'bar',
                    data: list.map(m => m.units),
                    itemStyle: { color: '#8B5CF6', borderRadius: [0, 3, 3, 0] },
                    barMaxWidth: 18,
                    label: { show: true, position: 'right', fontSize: 11, color: '#606266' }
                }]
            })
        },
        onResize() {
            if (this.trendChart) this.trendChart.resize()
            if (this.modelChart) this.modelChart.resize()
            if (this.modelTrendChart) this.modelTrendChart.resize()
        },
        num(v) { return (v == null) ? '0' : Number(v).toLocaleString() },
        money(v) {
            const n = Number(v) || 0
            return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
        },
        compact(v) {
            const n = Number(v) || 0
            if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
            if (n >= 1e3) return (n / 1e3).toFixed(0) + 'k'
            return String(n)
        },
        dateStr(d) {
            const x = new Date(d)
            if (isNaN(x.getTime())) return ''
            const p = n => String(n).padStart(2, '0')
            return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`
        }
    }
}
</script>

<style scoped>
.ins-page { padding: 16px 20px; min-height: calc(100vh - 84px); background: #f6f8fb; }
.ins-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; }
.ins-title { font-size: 20px; font-weight: 700; color: #1f2937; line-height: 1.2; }
.ins-sub { font-size: 13px; color: #909399; margin-top: 3px; }
.ins-synced { color: #c0c4cc; }
.ins-actions { display: flex; align-items: center; gap: 10px; }
.ins-alert { margin-bottom: 12px; }

.ins-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }
.ins-kpi { display: flex; align-items: center; gap: 12px; background: #fff; border: 1px solid #ebeef5; border-radius: 10px; padding: 14px 16px; }
.ins-kpi-icon { width: 46px; height: 46px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 22px; }
.ins-kpi-body { min-width: 0; }
.ins-kpi-label { font-size: 13px; color: #909399; line-height: 1.2; }
.ins-kpi-val { font-size: 22px; font-weight: 700; color: #1f2937; line-height: 1.3; }
.ins-kpi-sub { font-size: 11px; color: #a0a4ab; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ins-card { background: #fff; border: 1px solid #ebeef5; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; }
.ins-card-title { font-size: 14px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.ins-card-note { font-weight: normal; color: #909399; font-size: 12px; }
.ins-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.ins-card-head .ins-card-title { margin-bottom: 0; }
.ins-model-select { width: 340px; max-width: 60vw; }
.ins-chart { height: 300px; width: 100%; }
.ins-row { display: flex; gap: 12px; }
.ins-col { flex: 1; min-width: 0; }
.ins-table { width: 100%; }
.ins-empty { color: #909399; font-size: 13px; }

@media (max-width: 900px) {
    .ins-kpis { grid-template-columns: repeat(2, 1fr); }
    .ins-row { flex-direction: column; }
}
</style>
