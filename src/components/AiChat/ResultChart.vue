<template>
    <div ref="el" class="result-chart-el" :style="{ height }"></div>
</template>

<script>
import * as echarts from 'echarts'

// Series named after real phone colours render IN that colour — far clearer
// than an arbitrary palette when the split is by variant colour. Longest-match
// wins ("Blue Titanium" hits the titanium entry, not plain blue).
const NAME_COLOURS = [
    { match: 'natural titanium', color: '#8d8778' },
    { match: 'desert titanium', color: '#c0a062' },
    { match: 'blue titanium', color: '#46586e' },
    { match: 'white titanium', color: '#c9c9ce' },
    { match: 'black titanium', color: '#3b3b3d' },
    { match: 'space gray', color: '#5f6368' },
    { match: 'space grey', color: '#5f6368' },
    { match: 'graphite', color: '#54565a' },
    { match: 'midnight', color: '#2f3a4f' },
    { match: 'starlight', color: '#cbb98c' },
    { match: 'black', color: '#303133' },
    { match: 'white', color: '#9aa3af' },
    { match: 'silver', color: '#a8abb2' },
    { match: 'gold', color: '#d4a017' },
    { match: 'blue', color: '#409EFF' },
    { match: 'green', color: '#67C23A' },
    { match: 'red', color: '#F56C6C' },
    { match: 'pink', color: '#ff85c0' },
    { match: 'purple', color: '#8B5CF6' },
    { match: 'yellow', color: '#e6c619' },
    { match: 'orange', color: '#ff9800' },
    { match: 'coral', color: '#ff7f6e' },
]
const FALLBACK = ['#409EFF', '#67C23A', '#E6A23C', '#8B5CF6', '#F56C6C', '#13C2C2', '#ff85c0', '#795548']

// Renders a present_answer chart spec ({ type, title, xLabels, yLabel, series })
// from the AI Agent as an echarts line/bar chart.
export default {
    name: 'ResultChart',
    props: {
        chart: { type: Object, required: true },
        height: { type: String, default: '220px' }
    },
    data() {
        return { inst: null }
    },
    watch: {
        chart: { deep: true, handler() { this.render() } }
    },
    mounted() {
        this.$nextTick(() => {
            this.inst = echarts.init(this.$refs.el)
            this.render()
        })
        window.addEventListener('resize', this.resize)
    },
    beforeDestroy() {
        window.removeEventListener('resize', this.resize)
        if (this.inst) { this.inst.dispose(); this.inst = null }
    },
    methods: {
        seriesColor(name, index, used) {
            const n = String(name || '').toLowerCase()
            const hit = NAME_COLOURS.find(c => n.includes(c.match))
            if (hit && !used.has(hit.color)) { used.add(hit.color); return hit.color }
            const fb = FALLBACK.find(c => !used.has(c)) || FALLBACK[index % FALLBACK.length]
            used.add(fb)
            return fb
        },
        render() {
            if (!this.inst) return
            const c = this.chart || {}
            const many = (c.xLabels || []).length > 20
            const used = new Set()
            const series = (c.series || []).map((s, i) => ({
                name: s.name || `Series ${i + 1}`,
                type: c.type === 'bar' ? 'bar' : 'line',
                data: s.data || [],
                smooth: c.type === 'bar' ? false : 0.25,
                showSymbol: !many && (c.series || []).length <= 3,
                connectNulls: true,
                barMaxWidth: 24,
                // Hovering a series dims the others — key for overlapping lines.
                emphasis: { focus: 'series' },
                itemStyle: { color: this.seriesColor(s.name, i, used) },
                lineStyle: { width: 2 }
            }))
            // A long y-axis name clips at the chart edge — fold it into the title
            // instead; short units (e.g. "AUD") stay on the axis.
            const yLabel = String(c.yLabel || '')
            const longLabel = yLabel.length > 6
            const titleText = c.title
                ? c.title + (longLabel && !c.title.toLowerCase().includes(yLabel.toLowerCase()) ? ` (${yLabel})` : '')
                : (longLabel ? yLabel : '')
            this.inst.setOption({
                title: titleText ? { text: titleText, left: 'center', textStyle: { fontSize: 12, color: '#606266', fontWeight: 600 } } : undefined,
                tooltip: { trigger: 'axis' },
                legend: series.length > 1 ? { type: 'scroll', bottom: 0, itemWidth: 14, textStyle: { fontSize: 11 } } : undefined,
                grid: { left: 6, right: 14, top: titleText ? 32 : 14, bottom: series.length > 1 ? 26 : 8, containLabel: true },
                xAxis: { type: 'category', data: c.xLabels || [], axisLabel: { fontSize: 10 } },
                yAxis: { type: 'value', name: longLabel ? '' : yLabel, scale: true, splitLine: { lineStyle: { color: '#f0f2f5' } }, axisLabel: { fontSize: 10 } },
                series
            }, true)
            this.resize()
        },
        resize() {
            if (this.inst) this.inst.resize()
        }
    }
}
</script>

<style scoped>
.result-chart-el { width: 100%; min-width: 0; }
</style>
