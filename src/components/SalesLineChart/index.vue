<template>
  <div class="sales-chart-wrap">
    <div class="toolbar">
      <button
        v-for="item in groupOptions"
        :key="item.value"
        :class="['toolbar-btn', groupBy === item.value ? 'active' : '']"
        @click="changeGroup(item.value)"
      >
        {{ item.label }}
      </button>
    </div>

    <div ref="chart" :style="{ width, height }"></div>
  </div>
</template>

<script>
import * as echarts from 'echarts'

export default {
  name: 'SalesLineChart',

  props: {
    sales: {
      type: Array,
      required: true,
      default: () => []
    },
    width: {
      type: String,
      default: '100%'
    },
    height: {
      type: String,
      default: '350px'
    }
  },

  data() {
    return {
      chart: null,

      groupBy: 'day',

      groupOptions: [
        {
          label: 'Day',
          value: 'day'
        },
        {
          label: 'Week',
          value: 'week'
        },
        {
          label: 'Month',
          value: 'month'
        }
      ]
    }
  },

  watch: {
    sales: {
      deep: true,
      handler() {
        this.renderChart()
      }
    }
  },

  mounted() {
    this.chart = echarts.init(this.$refs.chart)

    this.renderChart()

    window.addEventListener('resize', this.resizeChart)
  },

  beforeDestroy() {
    window.removeEventListener('resize', this.resizeChart)

    if (this.chart) {
      this.chart.dispose()
      this.chart = null
    }
  },

  methods: {
    changeGroup(type) {
      this.groupBy = type
      this.renderChart()
    },

    formatDate(date) {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')

      return `${year}-${month}-${day}`
    },

    getWeekStart(date) {
      const d = new Date(date)

      const day = d.getDay() || 7

      if (day !== 1) {
        d.setDate(d.getDate() - day + 1)
      }

      return this.formatDate(d)
    },

    getGroupKey(createdTime) {
      const dateStr = createdTime.split(' ')[0]

      const date = new Date(dateStr)

      // Month
      if (this.groupBy === 'month') {
        return dateStr.slice(0, 7)
      }

      // Week
      if (this.groupBy === 'week') {
        return this.getWeekStart(date)
      }

      // Day
      return dateStr
    },

getChartData() {
  const grouped = {}

  // Group sales data
  this.sales.forEach(item => {
    const key = this.getGroupKey(item['Created Time'])
    const quantity = Number(item.Quantity || 0)

    if (!grouped[key]) {
      grouped[key] = 0
    }

    grouped[key] += quantity
  })

  // Day: last 90 days
  if (this.groupBy === 'day') {
    const labels = []
    const values = []

    for (let i = 89; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)

      const key = this.formatDate(date)

      labels.push(key)
      values.push(grouped[key] || 0)
    }

    return { labels, values }
  }

  // Week: last 12 weeks
  if (this.groupBy === 'week') {
    const labels = []
    const values = []

    for (let i = 11; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i * 7)

      const key = this.getWeekStart(date)

      labels.push(key)
      values.push(grouped[key] || 0)
    }

    return { labels, values }
  }

  // Month: last 3 months
  if (this.groupBy === 'month') {
    const labels = []
    const values = []

    for (let i = 2; i >= 0; i--) {
      const date = new Date()
      date.setMonth(date.getMonth() - i)

      const key = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, '0')}`

      labels.push(key)
      values.push(grouped[key] || 0)
    }

    return { labels, values }
  }

  return {
    labels: [],
    values: []
  }
},

    renderChart() {
      if (!this.chart) return

      const { labels, values } = this.getChartData()

      this.chart.setOption({
        tooltip: {
          trigger: 'axis'
        },

        grid: {
          left: 30,
          right: 20,
          top: 40,
          bottom: 30,
          containLabel: true
        },

        xAxis: {
          type: 'category',
          data: labels,
          boundaryGap: false,
          axisTick: {
            show: false
          }
        },

        yAxis: {
          type: 'value',
          minInterval: 1
        },

        series: [
          {
            name: 'Sales Quantity',
            type: 'line',
            smooth: true,
            data: values,
            areaStyle: {},
            animationDuration: 1200
          }
        ]
      })
    },

    resizeChart() {
      if (this.chart) {
        this.chart.resize()
      }
    }
  }
}
</script>

<style scoped>
.sales-chart-wrap {
  width: 100%;
}

.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.toolbar-btn {
  border: 1px solid #dcdfe6;
  background: #fff;
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
}

.toolbar-btn.active {
  background: #409eff;
  color: #fff;
  border-color: #409eff;
}
</style>