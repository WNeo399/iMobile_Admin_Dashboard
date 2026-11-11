<template>
    <!--
        A Blackbelt report laid out like Blackbelt's own Analyst Report PDF —
        the same sections and look as the Stock page's Report tab. Takes the
        parsed report the backend sends (utils/blackbelt.js parseReportDetail:
        { status, device, battery, tests, parts, analyst }); fetching is the
        caller's job. First used by Incoming Stocks (2026-11-10).
    -->
    <div v-loading="loading" class="bbr">
        <template v-if="report">
            <div class="bbr-head">
                <div class="bbr-title">{{ $tp('Analyst Report') }}</div>
                <div class="bbr-id">
                    {{ $tp('Report') }} #{{ (report.analyst && report.analyst.reportId) || reportId }}<template
                        v-if="report.analyst && report.analyst.finishDate"> · {{ report.analyst.finishDate }}</template>
                </div>
            </div>

            <div class="bbr-sec">{{ $tp('Device Information') }}</div>
            <div class="bbr-grid">
                <div v-for="c in deviceRows" :key="c[0]" :class="['bbr-cell', c[2] && 'bbr-wide']">
                    <span class="bbr-label">{{ $tp(c[0]) }}:</span>
                    <span class="bbr-value" :title="c[1]">{{ c[1] }}</span>
                </div>
            </div>

            <div class="bbr-sec">{{ $tp('Battery Information') }}</div>
            <div class="bbr-grid">
                <div v-for="c in batteryRows" :key="c[0]" class="bbr-cell">
                    <span class="bbr-label">{{ $tp(c[0]) }}:</span>
                    <span class="bbr-value" :class="c[0] === 'Health' ? batteryClass(parseInt(c[1])) : ''"
                        :title="c[1]">{{ c[1] }}</span>
                </div>
            </div>

            <div class="bbr-sec">{{ $tp('Device Testing Information') }}</div>
            <div class="bbr-grid bbr-tests">
                <div v-for="t in report.tests || []" :key="t.name" class="bbr-cell">
                    <span class="bbr-label">{{ prettyName(t.name) }}:</span>
                    <i :class="['bbr-vicon', testIcon(t.result), testClass(t.result)]" :title="t.result" />
                </div>
            </div>
            <div class="bbr-legend">
                <span><i class="el-icon-success bbr-pass" /> {{ $tp('PASS') }}</span>
                <span><i class="el-icon-error bbr-fail" /> {{ $tp('FAIL') }}</span>
                <span><i class="el-icon-question bbr-na" /> {{ $tp('NOT TESTED') }}</span>
            </div>

            <template v-if="(report.parts || []).length">
                <div class="bbr-sec">{{ $tp('Genuine Parts') }}</div>
                <div class="bbr-grid bbr-tests">
                    <div v-for="p in report.parts" :key="p.name" class="bbr-cell">
                        <span class="bbr-label">{{ prettyName(p.name) }}:</span>
                        <span :class="['bbr-verdict', p.status === 'Genuine' ? 'bbr-pass' : 'bbr-warn']">
                            {{ p.status || p.result || '—' }}
                        </span>
                    </div>
                </div>
            </template>

            <div class="bbr-sec">{{ $tp('Analyst Information') }}</div>
            <div class="bbr-grid">
                <div v-for="c in analystRows" :key="c[0]" class="bbr-cell">
                    <span class="bbr-label">{{ $tp(c[0]) }}:</span>
                    <span class="bbr-value" :title="c[1]">{{ c[1] }}</span>
                </div>
            </div>
        </template>
        <div v-else-if="!loading" class="bbr-empty">{{ error || $tp('No report loaded.') }}</div>
    </div>
</template>

<script>
export default {
    name: 'BlackbeltReportView',
    props: {
        report: { type: Object, default: null },
        reportId: { type: String, default: '' },
        loading: { type: Boolean, default: false },
        error: { type: String, default: '' }
    },
    computed: {
        // [label, value, wide?] — wide values span the full row
        deviceRows() {
            const d = (this.report && this.report.device) || {}
            return [
                ['Manufacturer', d.manufacturer],
                ['Model', d.model && d.modelNumber ? `${d.model} (${d.modelNumber})` : (d.model || d.modelNumber)],
                ['Operating System', d.os], ['Version', d.osVersion],
                ['Serial Number', d.serialNumber], ['IMEI/MEID', d.imei],
                ['IMEI 2', d.imei2],
                ['A Number', d.aNumber], ['Device Storage', d.storage],
                ['RAM', d.ram], ['Device Color', d.color],
                ['MLB Serial Number', d.mlbSerial], ['Region Info', d.region],
                ['FMIP', d.fmip], ['MDM Status', d.mdmStatus],
                ['CPU Name', d.cpuName], ['CPU Speed', d.cpuSpeed],
                ['Country Origin', d.countryOrigin],
                ['EID', d.eid, true],
                ['Manufacture Date', d.manufactureDate],
                ['Device ID', d.deviceId, true]
            ].filter(c => c[1])
        },
        batteryRows() {
            const b = (this.report && this.report.battery) || {}
            return [
                ['Serial', b.serial], ['Manufacturer Date', b.manufacturerDate],
                ['Temperature', b.temperature], ['Design Capacity', b.designCapacity],
                ['Actual Design Capacity', b.actualDesignCapacity], ['Full Charge Capacity', b.fullChargeCapacity],
                ['Cycle Count', b.cycleCount], ['Health', b.health && parseInt(b.health) === 0 ? '—' : b.health]
            ].filter(c => c[1])
        },
        analystRows() {
            const a = (this.report && this.report.analyst) || {}
            return [
                ['Start Date', a.startDate], ['Start Time', a.startTime],
                ['Finish Date', a.finishDate], ['Finish Time', a.finishTime],
                ['Device Analyst Version', a.deviceAnalystVersion],
                ['Analyst Application Version', a.appVersion],
                ['Operator/User Name', a.operator], ['License Id', a.licenseId],
                ['Profile Name', a.profileName],
                ['Status', (this.report && this.report.status) || '']
            ].filter(c => c[1])
        }
    },
    methods: {
        // Apple treats <80% as "service recommended"; 80-89 is worth a warning.
        batteryClass(v) {
            if (!(Number(v) > 0)) return ''
            if (v >= 90) return 'bbr-batt-good'
            if (v >= 80) return 'bbr-batt-ok'
            return 'bbr-batt-low'
        },
        testClass(result) {
            const v = String(result || '').toUpperCase()
            if (v === 'PASS') return 'bbr-pass'
            if (v === 'FAIL') return 'bbr-fail'
            if (v === 'WARNING') return 'bbr-warn'
            return 'bbr-na'
        },
        // NOT TESTED and NOT SUPPORTED ON DEVICE both read as "no answer".
        testIcon(result) {
            const v = String(result || '').toUpperCase()
            if (v === 'PASS') return 'el-icon-success'
            if (v === 'FAIL') return 'el-icon-error'
            if (v === 'WARNING') return 'el-icon-warning'
            return 'el-icon-question'
        },
        // "MultiTouchScreen" → "Multi Touch Screen"; all-caps names stay.
        prettyName(name) {
            return String(name || '').replace(/([a-z])([A-Z])/g, '$1 $2')
        }
    }
}
</script>

<style scoped>
.bbr { min-height: 160px; max-height: 66vh; overflow-y: auto; padding-right: 6px; }
.bbr-title { font-size: 16px; font-weight: 700; color: #303133; }
.bbr-id { font-size: 12px; color: #909399; margin-top: 2px; }
.bbr-sec {
    font-size: 13px; font-weight: 700; color: #303133;
    border-bottom: 2px solid #303133; padding-bottom: 4px; margin: 18px 0 10px;
}
.bbr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 28px; }
.bbr-tests { grid-template-columns: 1fr 1fr 1fr; }
.bbr-cell { display: flex; gap: 6px; font-size: 12px; line-height: 1.8; min-width: 0; }
.bbr-wide { grid-column: 1 / -1; }
.bbr-label { color: #909399; white-space: nowrap; }
.bbr-value { color: #303133; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bbr-verdict { font-weight: 700; font-size: 11px; align-self: center; white-space: nowrap; }
.bbr-pass { color: #67C23A; }
.bbr-fail { color: #F56C6C; }
.bbr-warn { color: #E6A23C; }
.bbr-na { color: #909399; }
.bbr-vicon { font-size: 14px; align-self: center; cursor: default; }
.bbr-legend { display: flex; gap: 18px; margin-top: 10px; font-size: 11px; color: #606266; }
.bbr-legend span { display: inline-flex; align-items: center; gap: 5px; }
.bbr-legend i { font-size: 13px; }
.bbr-batt-good { color: #67C23A; }
.bbr-batt-ok { color: #E6A23C; }
.bbr-batt-low { color: #F56C6C; }
.bbr-empty { padding: 20px; text-align: center; color: #909399; font-size: 12px; }
/* phones: one column so labels and values stay readable */
@media (max-width: 600px) {
    .bbr-grid, .bbr-tests { grid-template-columns: 1fr; }
}
</style>
