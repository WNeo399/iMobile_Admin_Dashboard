<template>
    <div v-loading="loading">
        <!--
            KPI tiles row. Element UI's grid can't do a 5-across split on
            the 24-col system (24/5 = 4.8), so this is a flex container
            with each tile claiming an equal share. Wraps to 2/row on
            narrow screens via the min-width on .kpi-cell.
        -->
        <div class="kpi-row">
            <div class="kpi-cell">
                <KpiTile
                    label="Pending"
                    :value="kpis.pending"
                    icon="el-icon-time"
                    color="purple"
                    sub="Awaiting assignment"
                />
            </div>
            <div class="kpi-cell">
                <KpiTile
                    label="In Progress"
                    :value="kpis.inProgress"
                    icon="el-icon-set-up"
                    color="blue"
                    sub="Being worked on"
                />
            </div>
            <div class="kpi-cell">
                <KpiTile
                    label="On Hold"
                    :value="kpis.onHold"
                    icon="el-icon-video-pause"
                    color="orange"
                    sub="Waiting parts / reply"
                />
            </div>
            <div class="kpi-cell">
                <KpiTile
                    label="Over Due"
                    :value="kpis.overDue"
                    icon="el-icon-warning-outline"
                    color="red"
                    sub="Needs attention now"
                />
            </div>
            <div class="kpi-cell">
                <KpiTile
                    label="Repaired Today"
                    :value="kpis.repairedToday"
                    icon="el-icon-circle-check"
                    color="green"
                    sub="Across all repaired states"
                />
            </div>
        </div>

        <!-- ── Throughput chart (full width) ─────────────────────── -->
        <div class="panel">
            <div class="panel-header">
                <strong>Throughput — last 30 days</strong>
                <span class="panel-sub">
                    New tickets vs repaired per day
                </span>
            </div>
            <!-- Echarts mounts inside this div; height is fixed so the
                 layout doesn't reflow when the chart is initialised. -->
            <div ref="chart" class="chart-canvas" />
        </div>

        <!-- ── Aging + Workload (side by side on wide screens) ──── -->
        <el-row :gutter="12">
            <el-col :xs="24" :lg="12">
                <div class="panel panel-aging">
                    <div class="panel-header">
                        <strong>Oldest stuck tickets</strong>
                        <span class="panel-sub">
                            Top 5 in Pending or On Hold by age
                        </span>
                    </div>
                    <el-table
                        :data="oldestStuck"
                        size="small"
                        :show-header="true"
                        empty-text="Nothing stuck — clean board"
                        @row-click="openDetail"
                        row-key="id"
                        class="aging-table"
                    >
                        <el-table-column label="Ticket" min-width="110">
                            <template slot-scope="scope">
                                <span class="ticket-link">{{ scope.row.ticketNumber }}</span>
                            </template>
                        </el-table-column>
                        <el-table-column label="Device" min-width="160" show-overflow-tooltip>
                            <template slot-scope="scope">
                                {{ deviceName(scope.row) }}
                            </template>
                        </el-table-column>
                        <el-table-column label="Customer" prop="customer" min-width="120" show-overflow-tooltip />
                        <el-table-column label="Status" min-width="120">
                            <template slot-scope="scope">
                                <el-tag size="mini" effect="plain" :type="ageStatusTag(scope.row)">
                                    {{ ticketStatusName(scope.row) }}
                                </el-tag>
                            </template>
                        </el-table-column>
                        <el-table-column label="Age" width="80" align="right">
                            <template slot-scope="scope">
                                <span :class="['age-pill', ageClass(scope.row.daysStuck)]">
                                    {{ scope.row.daysStuck }}d
                                </span>
                            </template>
                        </el-table-column>
                    </el-table>
                </div>
            </el-col>
            <el-col :xs="24" :lg="12">
                <div class="panel panel-workload">
                    <div class="panel-header">
                        <strong>Workload by assignee</strong>
                        <span class="panel-sub">
                            Active tickets only (excludes repaired)
                        </span>
                    </div>
                    <el-table
                        :data="workload"
                        size="small"
                        empty-text="No active tickets"
                        class="workload-table"
                    >
                        <el-table-column label="Assignee" min-width="130">
                            <template slot-scope="scope">
                                <span :class="{ 'workload-unassigned': scope.row.isUnassigned }">
                                    <i v-if="scope.row.isUnassigned" class="el-icon-warning-outline" />
                                    {{ scope.row.name }}
                                </span>
                            </template>
                        </el-table-column>
                        <el-table-column label="Pending" prop="pending" width="80" align="center" />
                        <el-table-column label="In Prog" prop="inProgress" width="80" align="center" />
                        <el-table-column label="On Hold" prop="onHold" width="80" align="center" />
                        <el-table-column label="Over Due" width="90" align="center">
                            <template slot-scope="scope">
                                <span :class="{ 'workload-overdue': scope.row.overDue > 0 }">
                                    {{ scope.row.overDue }}
                                </span>
                            </template>
                        </el-table-column>
                        <el-table-column label="Total" prop="total" width="70" align="center">
                            <template slot-scope="scope">
                                <strong>{{ scope.row.total }}</strong>
                            </template>
                        </el-table-column>
                    </el-table>
                </div>
            </el-col>
        </el-row>

        <!-- ── Quick links ───────────────────────────────────────── -->
        <div class="panel quick-actions">
            <el-button
                type="primary"
                icon="el-icon-s-tools"
                @click="$router.push('/imobile/repair')"
            >Open Repair</el-button>
            <el-button
                icon="el-icon-refresh"
                :loading="loading"
                @click="getTickets"
            >Refresh</el-button>
            <span v-if="lastRefreshLabel" class="refresh-hint">
                Updated {{ lastRefreshLabel }}
            </span>
        </div>

        <!-- Detail dialog (opened from the aging table) -->
        <ticket-detail ref="detailDialog" />
    </div>
</template>

<script>
import { listRepairTickets } from '@/api/repair/tickets'
import KpiTile from './components/KpiTile'
import TicketDetail from '@/views/imobile/repair/components/TicketDetail.vue'
import * as echarts from 'echarts'

// Same 10-min auto-refresh cadence as the Repair page so the two views
// stay in sync if both are open.
const REFRESH_INTERVAL_MS = 10 * 60 * 1000

// How many days back the throughput chart spans.
const THROUGHPUT_DAYS = 30

// Helper: convert a Date to a stable YYYY-MM-DD key in local time.
function dayKey(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

export default {
    name: 'IMobileRepairAdminHome',
    components: { KpiTile, TicketDetail },
    data() {
        return {
            loading: false,
            ticketGrouped: {
                pending: [], inProgress: [], onHold: [], overDue: [],
                repaired: [], repairedDispatching: [], repairedCollected: [],
                unrepairableDispatching: [], unrepairableReturned: [],
                fullfilled: [], notYetRecive: []
            },
            chart: null,
            lastRefreshAt: null,
            refreshTimer: null,
            _refreshInFlight: false,
            _resizeHandler: null
        }
    },
    computed: {
        // Flat list of repaired-variants — used for "repaired today" and
        // for the chart's repaired series.
        repairedAll() {
            return [
                ...this.ticketGrouped.repaired,
                ...this.ticketGrouped.repairedDispatching,
                ...this.ticketGrouped.repairedCollected
            ]
        },
        // Headline KPIs. `repairedToday` counts every repaired-variant
        // whose invoice date falls on or after midnight local time.
        kpis() {
            const startOfTodaySec = Math.floor(
                new Date(new Date().setHours(0, 0, 0, 0)).getTime() / 1000
            )
            const repairedToday = this.repairedAll.filter(
                t => t.repaired_date && t.repaired_date >= startOfTodaySec
            ).length
            return {
                pending: this.ticketGrouped.pending.length,
                inProgress: this.ticketGrouped.inProgress.length,
                onHold: this.ticketGrouped.onHold.length,
                overDue: this.ticketGrouped.overDue.length,
                repairedToday
            }
        },
        // Top 5 oldest tickets stuck in Pending or On Hold, sorted by
        // age (oldest first). Click a row → opens TicketDetail.
        oldestStuck() {
            const now = Date.now()
            const stuck = [
                ...this.ticketGrouped.pending,
                ...this.ticketGrouped.onHold
            ]
            return stuck
                .slice() // don't mutate the source arrays
                .sort((a, b) => a.createDate - b.createDate)
                .slice(0, 5)
                .map(t => ({
                    ...t,
                    daysStuck: Math.max(0, Math.floor((now - t.createDate) / 86_400_000))
                }))
        },
        // Per-assignee breakdown across the four active statuses (Pending,
        // In Progress, On Hold, Over Due). Unassigned pinned at the top;
        // remaining rows sorted by total desc so the busiest people are
        // first. Repaired and Other are intentionally excluded — this
        // table is about live workload.
        workload() {
            const buckets = {
                pending: this.ticketGrouped.pending,
                inProgress: this.ticketGrouped.inProgress,
                onHold: this.ticketGrouped.onHold,
                overDue: this.ticketGrouped.overDue
            }
            const map = new Map()
            for (const [key, list] of Object.entries(buckets)) {
                for (const t of list) {
                    const name = (t.devices[0]
                        && t.devices[0].assigned_to
                        && t.devices[0].assigned_to.fullname) || '__unassigned'
                    if (!map.has(name)) {
                        map.set(name, {
                            name: name === '__unassigned' ? 'Unassigned' : name,
                            isUnassigned: name === '__unassigned',
                            pending: 0, inProgress: 0, onHold: 0, overDue: 0, total: 0
                        })
                    }
                    const row = map.get(name)
                    row[key]++
                    row.total++
                }
            }
            const rows = Array.from(map.values())
            rows.sort((a, b) => {
                // Unassigned always first — it's the action item.
                if (a.isUnassigned !== b.isUnassigned) return a.isUnassigned ? -1 : 1
                return b.total - a.total
            })
            return rows
        },
        lastRefreshLabel() {
            if (!this.lastRefreshAt) return ''
            const diff = Date.now() - this.lastRefreshAt
            if (diff < 60_000) return 'just now'
            const mins = Math.floor(diff / 60_000)
            return mins === 1 ? '1 min ago' : `${mins} mins ago`
        }
    },
    watch: {
        // Re-render the chart whenever the underlying data changes. echarts'
        // setOption merges by default so this is cheap.
        ticketGrouped() {
            this.$nextTick(() => this.renderChart())
        }
    },
    mounted() {
        this.initChart()
        this._resizeHandler = () => { if (this.chart) this.chart.resize() }
        window.addEventListener('resize', this._resizeHandler)
        this.getTickets()
        // Background refresh — matches the Repair page so the two views
        // don't show conflicting numbers if both are open.
        this.refreshTimer = setInterval(() => {
            this.getTickets({ silent: true })
        }, REFRESH_INTERVAL_MS)
    },
    beforeDestroy() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer)
            this.refreshTimer = null
        }
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler)
            this._resizeHandler = null
        }
        if (this.chart) {
            this.chart.dispose()
            this.chart = null
        }
    },
    methods: {
        async getTickets({ silent = false } = {}) {
            // Same concurrent-refresh guard as the Repair page — a slow
            // RepairDesk walk and a manual click can otherwise race.
            if (this._refreshInFlight) return
            this._refreshInFlight = true
            if (!silent) this.loading = true
            try {
                const res = await listRepairTickets()
                const data = (res && res.data) || {}
                this.ticketGrouped = data.ticketGrouped || this.ticketGrouped
                this.lastRefreshAt = Date.now()
            } catch (e) {
                console.error('Repair home: ticket load failed:', e)
                const msg = (e.response && e.response.data && e.response.data.message)
                    || 'Failed to load tickets'
                if (!silent) this.$message.error(msg)
            } finally {
                this._refreshInFlight = false
                if (!silent) this.loading = false
            }
        },
        // ── Chart ─────────────────────────────────────────────────
        initChart() {
            if (!this.$refs.chart || this.chart) return
            this.chart = echarts.init(this.$refs.chart)
            this.renderChart()
        },
        renderChart() {
            if (!this.chart) return
            // Build the last-N-days date axis up front so empty days
            // still appear (otherwise the chart skips them).
            const days = []
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            for (let i = THROUGHPUT_DAYS - 1; i >= 0; i--) {
                const d = new Date(today)
                d.setDate(d.getDate() - i)
                days.push(dayKey(d))
            }
            const intakeByDay = Object.create(null)
            const repairedByDay = Object.create(null)
            for (const d of days) {
                intakeByDay[d] = 0
                repairedByDay[d] = 0
            }

            // Intake = createDate of every ticket regardless of status —
            // we want the total intake rate, not just active tickets.
            const allTickets = [
                ...this.ticketGrouped.pending,
                ...this.ticketGrouped.inProgress,
                ...this.ticketGrouped.onHold,
                ...this.ticketGrouped.overDue,
                ...this.repairedAll,
                ...this.ticketGrouped.unrepairableDispatching,
                ...this.ticketGrouped.unrepairableReturned,
                ...this.ticketGrouped.fullfilled
            ]
            for (const t of allTickets) {
                if (!t.createDate) continue
                const key = dayKey(new Date(t.createDate))
                if (key in intakeByDay) intakeByDay[key]++
            }
            // Repaired = day the invoice was created (repaired_date is
            // unix seconds, so multiply by 1000).
            for (const t of this.repairedAll) {
                if (!t.repaired_date) continue
                const key = dayKey(new Date(t.repaired_date * 1000))
                if (key in repairedByDay) repairedByDay[key]++
            }
            // Format axis labels as MM-DD for readability — full ISO
            // dates eat too much horizontal space at 30 ticks.
            const axisLabels = days.map(d => d.slice(5))

            this.chart.setOption({
                tooltip: {
                    trigger: 'axis',
                    axisPointer: { type: 'cross' }
                },
                legend: {
                    top: 0,
                    right: 0,
                    data: ['New', 'Repaired']
                },
                grid: { left: 36, right: 16, top: 36, bottom: 28 },
                xAxis: {
                    type: 'category',
                    boundaryGap: false,
                    data: axisLabels,
                    axisLabel: { fontSize: 11, color: '#909399' }
                },
                yAxis: {
                    type: 'value',
                    minInterval: 1,
                    axisLabel: { fontSize: 11, color: '#909399' },
                    splitLine: { lineStyle: { color: '#f0f2f5' } }
                },
                series: [
                    {
                        name: 'New',
                        type: 'line',
                        smooth: true,
                        symbol: 'circle',
                        symbolSize: 5,
                        itemStyle: { color: '#409EFF' },
                        areaStyle: { color: 'rgba(64, 158, 255, 0.08)' },
                        data: days.map(d => intakeByDay[d])
                    },
                    {
                        name: 'Repaired',
                        type: 'line',
                        smooth: true,
                        symbol: 'circle',
                        symbolSize: 5,
                        itemStyle: { color: '#67C23A' },
                        areaStyle: { color: 'rgba(103, 194, 58, 0.08)' },
                        data: days.map(d => repairedByDay[d])
                    }
                ]
            })
        },
        // ── Aging table helpers ───────────────────────────────────
        deviceName(t) {
            return (t.devices && t.devices[0] && t.devices[0].device && t.devices[0].device.name) || '—'
        },
        ticketStatusName(t) {
            return (t.devices && t.devices[0] && t.devices[0].status && t.devices[0].status.name) || ''
        },
        ageStatusTag(t) {
            const name = this.ticketStatusName(t)
            if (name === 'Pending') return 'info'
            if (name === 'Waiting for Parts' || name === 'Awaiting reply') return 'warning'
            return ''
        },
        // Visual escalation by age. Matches the Over Due red feel at 7d+
        // so the user spots it without reading the number.
        ageClass(days) {
            if (days >= 7) return 'age-red'
            if (days >= 3) return 'age-orange'
            return 'age-default'
        },
        openDetail(row) {
            if (row && row.id && this.$refs.detailDialog) {
                this.$refs.detailDialog.openDialog(row.id)
            }
        }
    }
}
</script>

<style scoped>
/* KPI row — flex layout because Element UI's 24-col grid can't split
   evenly into 5. Each cell takes an equal share on wide screens; below
   1200px the min-width forces two-per-row, and below 600px it goes
   single-column. */
.kpi-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 12px;
}
.kpi-cell {
    flex: 1 1 0;
    min-width: 180px;
}
@media (max-width: 1199px) {
    .kpi-cell {
        flex-basis: calc(33.333% - 8px);
    }
}
@media (max-width: 768px) {
    .kpi-cell {
        flex-basis: calc(50% - 6px);
    }
}
@media (max-width: 480px) {
    .kpi-cell {
        flex-basis: 100%;
    }
}

/* Panels — match the look of the existing role-aware home cards. */
.panel {
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 12px;
    padding: 16px 18px;
    margin-bottom: 12px;
}
.panel-header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    color: #111827;
    font-size: 15px;
    margin-bottom: 10px;
}
.panel-sub {
    color: #909399;
    font-size: 12px;
    font-weight: 400;
}

/* Throughput chart — fixed pixel height so layout doesn't reflow
   while echarts initialises. */
.chart-canvas {
    width: 100%;
    height: 240px;
}

/* Aging table */
.aging-table {
    cursor: pointer;
}
.ticket-link {
    color: #2563eb;
    font-weight: 500;
}
.age-pill {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.4;
}
.age-default { background: #f0f2f5; color: #606266; }
.age-orange  { background: #fff7ed; color: #c2410c; }
.age-red     { background: #fef2f2; color: #b91c1c; }

/* Workload table */
.workload-unassigned {
    color: #c2410c;
    font-weight: 500;
    i { margin-right: 4px; }
}
.workload-overdue {
    color: #b91c1c;
    font-weight: 600;
}

/* Quick-actions strip */
.quick-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
.refresh-hint {
    color: #909399;
    font-size: 12px;
    margin-left: auto;
}
</style>
