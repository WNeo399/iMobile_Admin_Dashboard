<template>
    <div ref="chart" :style="{ width, height }"></div>
</template>

<script>
import * as echarts from 'echarts'
import { STATUS_LABELS } from './caseStatus'

// Donut breakdown of cases by status. Hides any status that has zero cases so
// the legend stays tidy.
export default {
    name: 'StatusDonut',
    props: {
        byStatus: { type: Object, default: () => ({}) },
        height: { type: String, default: '280px' },
        width: { type: String, default: '100%' }
    },
    data() {
        return { chart: null }
    },
    watch: {
        byStatus: { deep: true, handler() { this.render() } }
    },
    mounted() {
        this.chart = echarts.init(this.$refs.chart)
        this.render()
        window.addEventListener('resize', this.resize)
    },
    beforeDestroy() {
        window.removeEventListener('resize', this.resize)
        if (this.chart) { this.chart.dispose(); this.chart = null }
    },
    methods: {
        resize() { if (this.chart) this.chart.resize() },
        render() {
            if (!this.chart) return
            const data = Object.entries(this.byStatus || {})
                .filter(([, v]) => v > 0)
                .map(([k, v]) => ({ name: STATUS_LABELS[k] || k, value: v }))

            this.chart.setOption({
                tooltip: { trigger: 'item' },
                legend: { type: 'scroll', orient: 'vertical', right: 10, top: 'middle', textStyle: { fontSize: 12 } },
                series: [
                    {
                        name: 'Cases',
                        type: 'pie',
                        radius: ['45%', '70%'],
                        center: ['35%', '50%'],
                        avoidLabelOverlap: true,
                        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
                        label: { show: false },
                        emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
                        data
                    }
                ]
            }, true)
        }
    }
}
</script>
