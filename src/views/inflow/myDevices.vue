<template>
    <div class="mydev app-container">
        <div class="mydev-head">
            <div>
                <div class="mydev-title">My Devices</div>
                <div class="mydev-sub">{{ refurbCustomerName || '—' }}</div>
            </div>
            <div class="mydev-actions">
                <el-radio-group v-if="linked" v-model="view" size="small">
                    <el-radio-button label="devices">Devices</el-radio-button>
                    <el-radio-button label="orders">Orders</el-radio-button>
                </el-radio-group>
                <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">Refresh</el-button>
            </div>
        </div>

        <!-- Not linked: friendly empty state (also what an admin sees). -->
        <div v-if="!loading && !linked" class="mydev-unlinked">
            <i class="el-icon-mobile-phone" />
            <div class="mydev-unlinked-title">No device purchases on this account</div>
            <div class="mydev-unlinked-sub">Your login isn't connected to refurbished-device purchases. If you buy devices from us, ask us to enable it.</div>
        </div>

        <template v-else>
            <div class="mydev-kpis" v-loading="loading">
                <div class="kpi">
                    <i class="el-icon-mobile-phone kpi-ico kpi-ico-blue" />
                    <div><div class="kpi-val">{{ summary.devices || 0 }}</div><div class="kpi-lbl">Devices</div></div>
                </div>
                <div class="kpi">
                    <i class="el-icon-tickets kpi-ico kpi-ico-purple" />
                    <div><div class="kpi-val">{{ summary.orders || 0 }}</div><div class="kpi-lbl">Orders</div></div>
                </div>
                <div class="kpi">
                    <i class="el-icon-money kpi-ico kpi-ico-green" />
                    <div><div class="kpi-val">{{ money(summary.total) }}</div><div class="kpi-lbl">Total purchased</div></div>
                </div>
            </div>

            <!-- Flat device list — every unit sold, searchable. -->
            <div v-show="view === 'devices'" v-loading="loading">
                <div class="mydev-filters">
                    <el-input v-model="search" size="small" clearable class="mydev-search"
                        placeholder="Search model / IMEI / serial / order…" prefix-icon="el-icon-search" />
                    <span class="mydev-flex" />
                    <span class="mydev-count">{{ filteredDevices.length }} of {{ allDevices.length }} devices</span>
                </div>
                <el-table :data="pagedDevices" border stripe size="mini" class="mydev-table">
                    <el-table-column label="Order" width="150">
                        <template slot-scope="s">
                            <el-link type="primary" :underline="false" class="mydev-order-link"
                                @click="openOrderDetail(s.row.orderId)">{{ s.row.orderNo || '—' }}</el-link>
                            <div class="mydev-specs">{{ devDate(s.row.date) }}</div>
                        </template>
                    </el-table-column>
                    <el-table-column label="IMEI / Serial" width="160">
                        <template slot-scope="s"><span class="mydev-mono">{{ s.row.imei || s.row.serialNumber || '—' }}</span></template>
                    </el-table-column>
                    <el-table-column label="Device" min-width="220">
                        <template slot-scope="s">
                            <div class="mydev-name">
                                {{ [s.row.brand, s.row.model].filter(Boolean).join(' ') || '—' }}
                                <el-tag v-if="s.row.grade" size="mini" effect="plain" class="mydev-grade">{{ s.row.grade }}</el-tag>
                            </div>
                            <div class="mydev-specs">{{ [s.row.storage, s.row.color].filter(Boolean).join(' · ') || '&nbsp;' }}</div>
                        </template>
                    </el-table-column>
                    <el-table-column label="Battery" width="85" align="center">
                        <template slot-scope="s">
                            <span v-if="s.row.batteryHealth != null" :class="batteryClass(s.row.batteryHealth)">{{ s.row.batteryHealth }}%</span>
                            <span v-else class="mydev-dim">—</span>
                        </template>
                    </el-table-column>
                    <!-- Same read as the Refurbished Stock page: a check when
                         Blackbelt has a report for the device, a cross when not. -->
                    <el-table-column label="Blackbelt" width="90" align="center">
                        <template slot-scope="s">
                            <i v-if="s.row.bbChecked" class="el-icon-success rs-bb-yes"
                                :title="s.row.bbStatus || 'Blackbelt report found'" />
                            <i v-else class="el-icon-error rs-bb-no" title="No Blackbelt report" />
                        </template>
                    </el-table-column>
                    <el-table-column label="Price" width="100" align="right">
                        <template slot-scope="s"><b>{{ money(s.row.price) }}</b></template>
                    </el-table-column>
                    <el-table-column label="" width="80" align="center">
                        <template slot-scope="s">
                            <el-button size="mini" type="text" icon="el-icon-view" @click="openDeviceDetail(s.row)">Detail</el-button>
                        </template>
                    </el-table-column>
                    <template slot="empty"><span class="mydev-dim">{{ allDevices.length ? 'No devices match your search.' : 'No devices purchased yet.' }}</span></template>
                </el-table>
                <el-pagination v-if="filteredDevices.length > pageSize"
                    background layout="total, sizes, prev, pager, next"
                    :total="filteredDevices.length" :page-size="pageSize" :page-sizes="[15, 30, 50, 100]"
                    :current-page="page"
                    @current-change="p => page = p"
                    @size-change="s => { pageSize = s; page = 1 }"
                    class="mydev-pager" />
            </div>

            <!-- Order view — totals with GST, rows expand to the devices. -->
            <div v-show="view === 'orders'" v-loading="loading">
                <el-table :data="orders" border stripe size="mini" class="mydev-table">
                    <el-table-column type="expand">
                        <template slot-scope="s">
                            <el-table :data="s.row.lines" size="mini" border class="mydev-lines">
                                <el-table-column label="Device" min-width="220">
                                    <template slot-scope="l">
                                        {{ [l.row.brand, l.row.model].filter(Boolean).join(' ') || '—' }}
                                        <span class="mydev-dim">{{ [l.row.storage, l.row.color].filter(Boolean).join(' · ') }}</span>
                                    </template>
                                </el-table-column>
                                <el-table-column label="IMEI / Serial" width="150">
                                    <template slot-scope="l"><span class="mydev-mono">{{ l.row.imei || l.row.serialNumber || '—' }}</span></template>
                                </el-table-column>
                                <el-table-column label="Grade" width="70" align="center">
                                    <template slot-scope="l">{{ l.row.grade || '—' }}</template>
                                </el-table-column>
                                <el-table-column label="Battery" width="75" align="center">
                                    <template slot-scope="l">{{ l.row.batteryHealth != null ? l.row.batteryHealth + '%' : '—' }}</template>
                                </el-table-column>
                                <el-table-column label="Price" width="100" align="right">
                                    <template slot-scope="l">{{ money(l.row.price) }}</template>
                                </el-table-column>
                            </el-table>
                        </template>
                    </el-table-column>
                    <el-table-column prop="orderNo" label="Order #" min-width="140">
                        <template slot-scope="s">
                            <el-link type="primary" :underline="false" class="mydev-order-link"
                                @click="openOrderDetail(s.row.id)">{{ s.row.orderNo || '—' }}</el-link>
                        </template>
                    </el-table-column>
                    <el-table-column label="Date" width="110">
                        <template slot-scope="s">{{ devDate(s.row.date) }}</template>
                    </el-table-column>
                    <el-table-column label="Devices" width="80" align="right">
                        <template slot-scope="s">{{ s.row.deviceCount }}</template>
                    </el-table-column>
                    <el-table-column label="Subtotal" width="110" align="right">
                        <template slot-scope="s">{{ money(s.row.subTotal) }}</template>
                    </el-table-column>
                    <el-table-column label="GST" width="100" align="right">
                        <template slot-scope="s">{{ money(s.row.gstAmount) }}</template>
                    </el-table-column>
                    <el-table-column label="Total" width="120" align="right">
                        <template slot-scope="s"><b>{{ money(s.row.total) }}</b></template>
                    </el-table-column>
                    <el-table-column label="Status" width="100" align="center">
                        <template slot-scope="s">
                            <el-tag size="mini" :type="s.row.status === 'Cancelled' ? 'info' : 'success'">{{ s.row.status }}</el-tag>
                        </template>
                    </el-table-column>
                    <template slot="empty"><span class="mydev-dim">No device orders yet.</span></template>
                </el-table>
            </div>
        </template>

        <!-- Order detail — the full order the clicked device came on -->
        <el-dialog :title="orderDetail ? orderDetail.orderNo : 'Order'" :visible.sync="orderDetailVisible" width="720px" append-to-body>
            <template v-if="orderDetail">
                <el-descriptions :column="3" size="small" border class="mydev-od-desc">
                    <el-descriptions-item label="Date">{{ devDate(orderDetail.date) }}</el-descriptions-item>
                    <el-descriptions-item label="Status">
                        <el-tag size="mini" :type="orderDetail.status === 'Cancelled' ? 'info' : 'success'">{{ orderDetail.status }}</el-tag>
                    </el-descriptions-item>
                    <el-descriptions-item label="Devices">{{ orderDetail.deviceCount }}</el-descriptions-item>
                    <el-descriptions-item label="Subtotal">{{ money(orderDetail.subTotal) }}</el-descriptions-item>
                    <el-descriptions-item label="GST">{{ money(orderDetail.gstAmount) }}</el-descriptions-item>
                    <el-descriptions-item label="Total"><b>{{ money(orderDetail.total) }}</b></el-descriptions-item>
                </el-descriptions>
                <el-table :data="orderDetail.lines" size="mini" border stripe max-height="360">
                    <el-table-column label="Device" min-width="220">
                        <template slot-scope="l">
                            {{ [l.row.brand, l.row.model].filter(Boolean).join(' ') || '—' }}
                            <span class="mydev-dim">{{ [l.row.storage, l.row.color].filter(Boolean).join(' · ') }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="IMEI / Serial" width="150">
                        <template slot-scope="l"><span class="mydev-mono">{{ l.row.imei || l.row.serialNumber || '—' }}</span></template>
                    </el-table-column>
                    <el-table-column label="Grade" width="70" align="center">
                        <template slot-scope="l">{{ l.row.grade || '—' }}</template>
                    </el-table-column>
                    <el-table-column label="Battery" width="75" align="center">
                        <template slot-scope="l">{{ l.row.batteryHealth != null ? l.row.batteryHealth + '%' : '—' }}</template>
                    </el-table-column>
                    <el-table-column label="Price" width="100" align="right">
                        <template slot-scope="l">{{ money(l.row.price) }}</template>
                    </el-table-column>
                </el-table>
            </template>
            <span slot="footer"><el-button size="small" @click="orderDetailVisible = false">Close</el-button></span>
        </el-dialog>

        <!-- Device detail — the purchase snapshot plus the Blackbelt report -->
        <el-dialog :title="detailTitle" :visible.sync="detailVisible" width="720px" append-to-body>
            <el-tabs v-if="detailDevice" v-model="detailTab">
                <el-tab-pane label="Device" name="device">
                    <el-descriptions :column="2" size="small" border>
                        <el-descriptions-item label="Model" :span="2">{{ [detailDevice.brand, detailDevice.model].filter(Boolean).join(' ') || '—' }}</el-descriptions-item>
                        <el-descriptions-item label="Storage">{{ detailDevice.storage || '—' }}</el-descriptions-item>
                        <el-descriptions-item label="Colour">{{ detailDevice.color || '—' }}</el-descriptions-item>
                        <el-descriptions-item label="Grade">{{ detailDevice.grade || '—' }}</el-descriptions-item>
                        <el-descriptions-item label="Battery">
                            <span v-if="detailDevice.batteryHealth != null" :class="batteryClass(detailDevice.batteryHealth)">{{ detailDevice.batteryHealth }}%</span>
                            <span v-else>—</span>
                        </el-descriptions-item>
                        <el-descriptions-item label="IMEI">{{ detailDevice.imei || '—' }}</el-descriptions-item>
                        <el-descriptions-item label="Serial">{{ detailDevice.serialNumber || '—' }}</el-descriptions-item>
                        <el-descriptions-item label="Price"><b>{{ money(detailDevice.price) }}</b></el-descriptions-item>
                        <el-descriptions-item label="Order">{{ detailDevice.orderNo || '—' }} · {{ devDate(detailDevice.date) }}</el-descriptions-item>
                    </el-descriptions>
                </el-tab-pane>
                <!-- Full Blackbelt report, fetched live by the stored id and
                     laid out like the Refurbished Stock page's Report tab. -->
                <el-tab-pane v-if="detailDevice.bbReportId" label="Blackbelt Report" name="blackbelt">
                    <div v-loading="reportLoading" class="rs-report">
                        <template v-if="report">
                            <div class="rs-report-head">
                                <div>
                                    <div class="rs-report-title">Analyst Report</div>
                                    <div class="rs-report-id">
                                        Report #{{ report.analyst.reportId || detailDevice.bbReportId }}<template
                                            v-if="report.analyst.finishDate"> · {{ report.analyst.finishDate }}</template>
                                    </div>
                                </div>
                            </div>

                            <div class="rs-rep-sec">Device Information</div>
                            <div class="rs-rep-grid">
                                <div v-for="c in reportDeviceRows" :key="c[0]"
                                    :class="['rs-rep-cell', c[2] && 'rs-rep-wide']">
                                    <span class="rs-rep-label">{{ c[0] }}:</span>
                                    <span class="rs-rep-value" :title="c[1]">{{ c[1] }}</span>
                                </div>
                            </div>

                            <div class="rs-rep-sec">Battery Information</div>
                            <div class="rs-rep-grid">
                                <div v-for="c in reportBatteryRows" :key="c[0]" class="rs-rep-cell">
                                    <span class="rs-rep-label">{{ c[0] }}:</span>
                                    <span class="rs-rep-value"
                                        :class="c[0] === 'Health' ? batteryClass(parseInt(c[1])) : ''"
                                        :title="c[1]">{{ c[1] }}</span>
                                </div>
                            </div>

                            <div class="rs-rep-sec">Device Testing Information</div>
                            <div class="rs-rep-grid rs-rep-tests">
                                <div v-for="t in report.tests" :key="t.name" class="rs-rep-cell">
                                    <span class="rs-rep-label">{{ prettyName(t.name) }}:</span>
                                    <i :class="['rs-rep-vicon', testIcon(t.result), testClass(t.result)]" :title="t.result" />
                                </div>
                            </div>
                            <div class="rs-legend">
                                <span><i class="el-icon-success rs-verdict-pass" /> PASS</span>
                                <span><i class="el-icon-error rs-verdict-fail" /> FAIL</span>
                                <span><i class="el-icon-question rs-verdict-na" /> NOT TESTED</span>
                            </div>

                            <template v-if="report.parts.length">
                                <div class="rs-rep-sec">Genuine Parts</div>
                                <div class="rs-rep-grid rs-rep-tests">
                                    <div v-for="p in report.parts" :key="p.name" class="rs-rep-cell">
                                        <span class="rs-rep-label">{{ prettyName(p.name) }}:</span>
                                        <span :class="['rs-rep-verdict', p.status === 'Genuine' ? 'rs-verdict-pass' : 'rs-verdict-warn']">
                                            {{ p.status || p.result || '—' }}
                                        </span>
                                    </div>
                                </div>
                            </template>

                            <div class="rs-rep-sec">Analyst Information</div>
                            <div class="rs-rep-grid">
                                <div v-for="c in reportAnalystRows" :key="c[0]" class="rs-rep-cell">
                                    <span class="rs-rep-label">{{ c[0] }}:</span>
                                    <span class="rs-rep-value" :title="c[1]">{{ c[1] }}</span>
                                </div>
                            </div>
                        </template>
                        <div v-else-if="!reportLoading" class="rs-hist-empty">{{ reportError || 'No report loaded.' }}</div>
                    </div>
                </el-tab-pane>
            </el-tabs>
            <span slot="footer"><el-button size="small" @click="detailVisible = false">Close</el-button></span>
        </el-dialog>
    </div>
</template>

<script>
import { getInflowStatementDevices, getMyDeviceReport } from '@/api/inflow'

export default {
    name: 'InflowMyDevices',
    data() {
        return {
            loading: false,
            linked: true, // optimistic so the empty state doesn't flash
            refurbCustomerName: '',
            orders: [],
            summary: {},
            view: 'devices',
            search: '',
            page: 1,
            pageSize: 15,
            detailVisible: false,
            detailDevice: null,
            detailTab: 'device',
            orderDetailVisible: false,
            orderDetail: null,
            // Blackbelt report — fetched lazily when the tab is opened.
            report: null,
            reportLoading: false,
            reportError: ''
        }
    },
    computed: {
        // Every unit actually sold (cancelled orders excluded), flattened
        // with its order number + date for the device-centric table.
        allDevices() {
            const out = []
            for (const o of this.orders) {
                if (o.status === 'Cancelled') continue
                for (const l of o.lines || []) {
                    out.push({ ...l, orderId: o.id, orderNo: o.orderNo, date: o.date })
                }
            }
            return out
        },
        filteredDevices() {
            const q = this.search.trim().toLowerCase()
            if (!q) return this.allDevices
            return this.allDevices.filter(d =>
                [d.brand, d.model, d.storage, d.color, d.grade, d.imei, d.serialNumber, d.orderNo]
                    .some(v => String(v || '').toLowerCase().includes(q)))
        },
        pagedDevices() {
            const start = (this.page - 1) * this.pageSize
            return this.filteredDevices.slice(start, start + this.pageSize)
        },
        detailTitle() {
            const d = this.detailDevice
            if (!d) return 'Device'
            return [d.brand, d.model].filter(Boolean).join(' ') || d.imei || 'Device'
        },
        // ── Blackbelt report rows — same layout as the Stock page ─────
        reportDeviceRows() {
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
        reportBatteryRows() {
            const b = (this.report && this.report.battery) || {}
            return [
                ['Serial', b.serial], ['Manufacturer Date', b.manufacturerDate],
                ['Temperature', b.temperature], ['Design Capacity', b.designCapacity],
                ['Actual Design Capacity', b.actualDesignCapacity], ['Full Charge Capacity', b.fullChargeCapacity],
                ['Cycle Count', b.cycleCount], ['Health', b.health]
            ].filter(c => c[1])
        },
        reportAnalystRows() {
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
    watch: {
        search() { this.page = 1 },
        detailTab(tab) {
            if (tab === 'blackbelt') this.loadReport()
        }
    },
    created() {
        this.load()
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await getInflowStatementDevices()
                if (r && r.success !== false) {
                    this.linked = !!r.linked
                    this.refurbCustomerName = r.refurbCustomerName || ''
                    this.orders = r.orders || []
                    this.summary = r.summary || {}
                }
            } catch (e) {
                this.$message.error('Failed to load your devices')
            } finally {
                this.loading = false
            }
        },
        money(v) {
            const n = Number(v) || 0
            return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        },
        devDate(d) {
            if (!d) return '—'
            const x = new Date(d)
            return isNaN(x.getTime()) ? '—' : x.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
        },
        batteryClass(h) {
            return h >= 90 ? 'mydev-batt-good' : h >= 80 ? '' : 'mydev-batt-low'
        },
        openOrderDetail(orderId) {
            const o = this.orders.find(x => x.id === orderId)
            if (!o) return
            this.orderDetail = o
            this.orderDetailVisible = true
        },
        openDeviceDetail(row) {
            this.detailDevice = row
            this.detailTab = 'device'
            this.report = null
            this.reportError = ''
            this.detailVisible = true
        },
        async loadReport() {
            if (this.report || this.reportLoading || !this.detailDevice) return
            this.reportLoading = true
            this.reportError = ''
            try {
                const r = await getMyDeviceReport(this.detailDevice.deviceId)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                if (!r.hasReport) {
                    this.reportError = r.message || 'No Blackbelt report for this device.'
                    return
                }
                this.report = r.report
            } catch (e) {
                this.reportError = (e && e.message) || 'Failed to load the report'
            } finally {
                this.reportLoading = false
            }
        },
        prettyName(name) {
            return String(name || '').replace(/([a-z])([A-Z])/g, '$1 $2')
        },
        testIcon(result) {
            const v = String(result || '').toUpperCase()
            if (v === 'PASS') return 'el-icon-success'
            if (v === 'FAIL') return 'el-icon-error'
            if (v === 'WARNING') return 'el-icon-warning'
            return 'el-icon-question'
        },
        testClass(result) {
            const v = String(result || '').toUpperCase()
            if (v === 'PASS') return 'rs-verdict-pass'
            if (v === 'FAIL') return 'rs-verdict-fail'
            if (v === 'WARNING') return 'rs-verdict-warn'
            return 'rs-verdict-na'
        }
    }
}
</script>

<style lang="scss" scoped>
.mydev-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.mydev-title { font-size: 20px; font-weight: 600; color: #303133; }
.mydev-sub { font-size: 13px; color: #909399; margin-top: 2px; }
.mydev-actions { display: flex; align-items: center; gap: 10px; }
.mydev-kpis { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; }
.kpi {
    display: flex; align-items: center; gap: 12px;
    min-width: 170px; padding: 12px 18px;
    border: 1px solid #ebeef5; border-radius: 10px; background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}
.kpi-ico {
    font-size: 22px; padding: 9px; border-radius: 8px;
    &.kpi-ico-blue { color: #409EFF; background: #ecf5ff; }
    &.kpi-ico-purple { color: #9B59B6; background: #f7f0fa; }
    &.kpi-ico-green { color: #67C23A; background: #f0f9eb; }
}
.kpi-val { font-size: 19px; font-weight: 600; color: #303133; line-height: 1.2; }
.kpi-lbl { font-size: 12px; color: #909399; margin-top: 2px; }
.mydev-filters { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.mydev-search { width: 300px; max-width: 100%; }
.mydev-flex { flex: 1; }
.mydev-count { font-size: 12px; color: #909399; }
.mydev-table { width: 100%; }
.mydev-lines { margin: 4px 12px; width: calc(100% - 24px); }
// Two-line cell composition: bold headline + muted spec/date line.
.mydev-name { font-weight: 600; color: #303133; line-height: 1.3; }
.mydev-specs { font-size: 12px; color: #909399; line-height: 1.4; }
.mydev-grade { margin-left: 4px; }
.mydev-batt-good { color: #67C23A; font-weight: 600; }
.mydev-batt-low { color: #E6A23C; font-weight: 600; }
// Blackbelt column + report tab — same classes/looks as the Refurbished
// Stock page, so the two read identically.
.rs-bb-yes { color: #67C23A; font-size: 17px; }
.rs-bb-no { color: #F56C6C; font-size: 17px; }
.rs-report { min-height: 160px; max-height: 66vh; overflow-y: auto; padding-right: 6px; }
.rs-report-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.rs-report-title { font-size: 16px; font-weight: 700; color: #303133; }
.rs-report-id { font-size: 12px; color: #909399; margin-top: 2px; }
.rs-rep-sec {
    font-size: 13px; font-weight: 700; color: #303133;
    border-bottom: 2px solid #303133; padding-bottom: 4px; margin: 18px 0 10px;
}
.rs-rep-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 28px; }
.rs-rep-tests { grid-template-columns: 1fr 1fr 1fr; }
.rs-rep-cell { display: flex; gap: 6px; font-size: 12px; line-height: 1.8; min-width: 0; }
.rs-rep-wide { grid-column: 1 / -1; }
.rs-rep-label { color: #909399; white-space: nowrap; }
.rs-rep-value {
    color: #303133; font-weight: 600;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rs-rep-verdict { font-weight: 700; font-size: 11px; align-self: center; white-space: nowrap; }
.rs-verdict-pass { color: #67C23A; }
.rs-verdict-fail { color: #F56C6C; }
.rs-verdict-warn { color: #E6A23C; }
.rs-verdict-na { color: #909399; }
.rs-rep-vicon { font-size: 14px; align-self: center; cursor: default; }
.rs-legend { display: flex; gap: 18px; margin-top: 10px; font-size: 11px; color: #606266; }
.rs-legend span { display: inline-flex; align-items: center; gap: 5px; }
.rs-legend i { font-size: 13px; }
.rs-hist-empty { padding: 20px; text-align: center; color: #909399; font-size: 12px; }
.mydev-dim { color: #909399; font-size: 12px; margin-left: 6px; }
.mydev-mono { font-family: Menlo, Consolas, monospace; font-size: 12px; }
.mydev-order-link { font-weight: 600; }
.mydev-od-desc { margin-bottom: 12px; }
.mydev-pager { margin-top: 12px; text-align: right; }
.mydev-unlinked {
    margin-top: 40px; text-align: center; color: #909399;
    i { font-size: 44px; color: #c0c4cc; }
}
.mydev-unlinked-title { margin-top: 12px; font-size: 15px; color: #606266; font-weight: 500; }
.mydev-unlinked-sub { margin-top: 6px; font-size: 13px; line-height: 1.6; }
</style>
