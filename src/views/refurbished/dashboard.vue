<template>
    <div class="refurb-dash app-container">
        <div class="rd-head">
            <div>
                <div class="rd-title">Refurbished Phones — Market Snapshot</div>
                <div class="rd-sub">
                    Reebelo offers · {{ date || '—' }}
                    <span v-if="meta.days"> · {{ meta.days }} scrape day{{ meta.days === 1 ? '' : 's' }} tracked</span>
                </div>
            </div>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">Refresh</el-button>
        </div>

        <div class="rd-kpis" v-loading="loading">
            <div class="kpi"><div class="kpi-val">{{ num(totals.offers) }}</div><div class="kpi-lbl">Offers</div></div>
            <div class="kpi"><div class="kpi-val">{{ num(totals.models) }}</div><div class="kpi-lbl">Distinct models</div></div>
            <div class="kpi"><div class="kpi-val">{{ num(totals.sellers) }}</div><div class="kpi-lbl">Sellers</div></div>
            <div class="kpi"><div class="kpi-val">${{ num(totals.avgPrice) }}</div><div class="kpi-lbl">Avg price</div></div>
            <div class="kpi"><div class="kpi-val">${{ num(totals.minPrice) }} – ${{ num(totals.maxPrice) }}</div><div class="kpi-lbl">Price range</div></div>
        </div>

        <div class="rd-grid">
            <el-card shadow="never" class="rd-card">
                <div slot="header" class="rd-card-head">Offers by brand</div>
                <div ref="brandChart" class="rd-chart" />
            </el-card>
            <el-card shadow="never" class="rd-card">
                <div slot="header" class="rd-card-head">By grade</div>
                <div ref="gradeChart" class="rd-chart" />
            </el-card>
            <el-card shadow="never" class="rd-card">
                <div slot="header" class="rd-card-head">Price distribution</div>
                <div ref="priceChart" class="rd-chart" />
            </el-card>
        </div>

        <el-card shadow="never" class="rd-sellers">
            <div slot="header" class="rd-card-head">Top sellers</div>
            <el-table :data="topSellers" size="mini" border>
                <el-table-column type="index" label="#" width="45" align="center" />
                <el-table-column prop="seller" label="Seller" min-width="180" />
                <el-table-column prop="count" label="Offers" width="110" align="right">
                    <template slot-scope="s">{{ num(s.row.count) }}</template>
                </el-table-column>
                <el-table-column label="Avg price" width="130" align="right">
                    <template slot-scope="s">${{ num(s.row.avgPrice) }}</template>
                </el-table-column>
            </el-table>
        </el-card>
    </div>
</template>

<script>
import * as echarts from 'echarts'
import { getRefurbSummary } from '@/api/refurbished'

const PRICE_ORDER = ['<$200', '$200-500', '$500-1k', '$1k-2k', '$2k+']

export default {
    name: 'RefurbishedDashboard',
    data() {
        return {
            loading: false,
            date: null,
            totals: {},
            byBrand: [],
            byGrade: [],
            topSellers: [],
            priceBands: [],
            meta: {},
            charts: {}
        }
    },
    created() {
        this.load()
    },
    mounted() {
        window.addEventListener('resize', this.resizeCharts)
    },
    beforeDestroy() {
        window.removeEventListener('resize', this.resizeCharts)
        Object.values(this.charts).forEach(c => c && c.dispose())
        this.charts = {}
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const res = await getRefurbSummary()
                if (!res || res.success === false) throw new Error((res && res.message) || 'Failed to load')
                this.date = res.date
                this.totals = res.totals || {}
                this.byBrand = res.byBrand || []
                this.byGrade = res.byGrade || []
                this.topSellers = res.topSellers || []
                this.priceBands = res.priceBands || []
                this.meta = res.meta || {}
                this.$nextTick(this.renderCharts)
            } catch (e) {
                console.error('Refurb dashboard load failed:', e)
                this.$message.error(this.msg(e, 'Failed to load dashboard'))
            } finally {
                this.loading = false
            }
        },
        chart(ref, option) {
            const el = this.$refs[ref]
            if (!el) return
            let c = this.charts[ref]
            if (!c) { c = echarts.init(el); this.charts[ref] = c }
            c.setOption(option, true)
        },
        renderCharts() {
            const brands = [...this.byBrand].reverse()
            this.chart('brandChart', {
                grid: { left: 8, right: 40, top: 8, bottom: 8, containLabel: true },
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                xAxis: { type: 'value' },
                yAxis: { type: 'category', data: brands.map(b => b.brand), axisLabel: { fontSize: 11 } },
                series: [{
                    type: 'bar', data: brands.map(b => b.count), barMaxWidth: 16,
                    itemStyle: { color: '#409EFF', borderRadius: [0, 3, 3, 0] },
                    label: { show: true, position: 'right', fontSize: 11, color: '#909399' }
                }]
            })
            this.chart('gradeChart', {
                tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
                legend: { bottom: 0, textStyle: { fontSize: 11 } },
                color: ['#67C23A', '#409EFF', '#E6A23C', '#F56C6C', '#909399'],
                series: [{
                    type: 'pie', radius: ['42%', '66%'], center: ['50%', '45%'],
                    data: this.byGrade.map(g => ({ name: g.grade, value: g.count })),
                    label: { fontSize: 11 }
                }]
            })
            const map = {}
            this.priceBands.forEach(b => { map[b.band] = b.count })
            this.chart('priceChart', {
                grid: { left: 8, right: 16, top: 20, bottom: 8, containLabel: true },
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                xAxis: { type: 'category', data: PRICE_ORDER, axisLabel: { fontSize: 11 } },
                yAxis: { type: 'value' },
                series: [{
                    type: 'bar', data: PRICE_ORDER.map(b => map[b] || 0), barMaxWidth: 40,
                    itemStyle: { color: '#67C23A', borderRadius: [3, 3, 0, 0] },
                    label: { show: true, position: 'top', fontSize: 11, color: '#909399' }
                }]
            })
        },
        resizeCharts() {
            Object.values(this.charts).forEach(c => c && c.resize())
        },
        num(v) {
            const n = Number(v)
            return isNaN(n) ? '—' : n.toLocaleString()
        },
        msg(e, fallback) {
            return (e.response && e.response.data && e.response.data.message) || e.message || fallback
        }
    }
}
</script>

<style lang="scss" scoped>
.refurb-dash { padding: 14px 16px; }
.rd-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 14px; }
.rd-title { font-size: 17px; font-weight: 600; color: #303133; }
.rd-sub { font-size: 12px; color: #909399; margin-top: 3px; }

.rd-kpis { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; }
.kpi {
    flex: 1; min-width: 150px;
    background: #fff; border: 1px solid #ebeef5; border-radius: 6px; padding: 14px 16px;
}
.kpi-val { font-size: 24px; font-weight: 600; color: #303133; line-height: 1.2; }
.kpi-lbl { font-size: 12px; color: #909399; margin-top: 4px; }

.rd-grid { display: grid; grid-template-columns: 1.4fr 1fr 1.2fr; gap: 12px; margin-bottom: 14px; }
.rd-card-head { font-weight: 600; font-size: 13px; color: #303133; }
.rd-chart { height: 300px; width: 100%; }
@media (max-width: 1100px) { .rd-grid { grid-template-columns: 1fr; } }

.rd-sellers { }
</style>
