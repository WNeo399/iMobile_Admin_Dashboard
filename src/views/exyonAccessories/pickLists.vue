<template>
    <div class="xp app-container">
        <div class="xp-head">
            <div class="xp-head-text">
                <div class="xp-title">{{ $tp('Pick Lists') }}</div>
                <div class="xp-sub">{{ $tp('One list per day of the orders being processed, ready to print for picking') }}</div>
            </div>
            <span class="xp-flex" />
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="reload">{{ $tp('Refresh') }}</el-button>
        </div>

        <div class="xp-layout">
            <!-- the days -->
            <div v-loading="loading" class="xp-days">
                <div v-for="d in lists" :key="d.day" :class="['xp-day', { on: d.day === day }]" @click="open(d.day)">
                    <div class="xp-day-1">
                        <b>{{ shortDay(d.day) }}</b>
                        <span v-if="d.day === today" class="xp-today">{{ $tp('Today') }}</span>
                    </div>
                    <div class="xp-day-2">{{ d.orders }} {{ $tp('orders') }} · {{ d.units }} {{ $tp('units') }}</div>
                </div>
                <div v-if="!loading && !lists.length" class="xp-days-empty">
                    <i class="el-icon-document" />
                    <div>{{ $tp('No pick lists yet') }}</div>
                    <small>{{ $tp('Orders join the day\'s list when they are processed on the Dispatch page') }}</small>
                </div>
            </div>

            <!-- one day's list -->
            <div v-loading="detailLoading" class="xp-detail">
                <template v-if="list">
                    <div class="xp-detail-head">
                        <div>
                            <div class="xp-day-title">{{ longDay(list.day) }}</div>
                            <div class="xp-sub">{{ $tp('Started {when} by {by}', { when: time(list.createdAt), by: list.createdBy || '—' }) }}</div>
                        </div>
                        <span class="xp-flex" />
                        <el-button size="small" type="primary" plain icon="el-icon-printer" :disabled="!lines.length" @click="openPrint">{{ $tp('Print pick list') }}</el-button>
                    </div>

                    <div class="xp-stats">
                        <div class="xp-stat"><span>{{ $tp('Orders') }}</span><b>{{ summary.orders }}</b>
                            <small>{{ summary.singleOrders }} {{ $tp('single-line') }} · {{ summary.multiOrders }} {{ $tp('multi-line') }}</small></div>
                        <div class="xp-stat"><span>{{ $tp('Units') }}</span><b>{{ summary.units }}</b>
                            <small>{{ summary.singleUnits }} {{ $tp('single-line') }} · {{ summary.multiUnits }} {{ $tp('multi-line') }}</small></div>
                        <div class="xp-stat"><span>SKUs</span><b>{{ summary.skus }}</b></div>
                    </div>

                    <div class="xp-sec">{{ $tp('Orders on this list') }} <span class="xp-dim">({{ list.orders.length }})</span></div>
                    <el-table :data="list.orders" border size="mini" class="xp-table">
                        <el-table-column :label="$tp('Order')" min-width="130">
                            <template slot-scope="s">
                                <div class="xp-order">{{ s.row.orderId }}</div>
                                <span :class="['xp-ch', chClass(s.row.channel)]">{{ s.row.channel || '—' }}</span>
                            </template>
                        </el-table-column>
                        <el-table-column :label="$tp('Customer')" min-width="130" show-overflow-tooltip>
                            <template slot-scope="s">{{ s.row.customerName || '—' }}</template>
                        </el-table-column>
                        <el-table-column :label="$tp('Items')" min-width="260">
                            <template slot-scope="s">
                                <div v-for="it in s.row.items" :key="it.sku" class="xp-item">
                                    <span class="xp-sku" :title="$tp('Neto SKU')">{{ it.sku }}</span><span v-if="it.zohoSku" class="xp-sku xp-sku-zoho" :title="it.zohoName">{{ it.zohoSku }}</span><span class="xp-item-name">{{ it.productName }}</span><b>× {{ it.quantity }}</b>
                                </div>
                            </template>
                        </el-table-column>
                        <el-table-column :label="$tp('Tracking number')" min-width="140">
                            <template slot-scope="s">
                                <span v-if="s.row.tracking" class="xp-tracking" :title="s.row.processedBy ? $tp('Processed by {by}', { by: s.row.processedBy }) : ''">{{ s.row.tracking }}</span>
                                <span v-else class="xp-zero">{{ $tp('Not processed') }}</span>
                            </template>
                        </el-table-column>
                        <el-table-column :label="$tp('Type')" width="95" align="center">
                            <template slot-scope="s">
                                <el-tag size="mini" :type="s.row.multi ? 'warning' : 'info'" effect="plain">{{ s.row.multi ? $tp('Multi-line') : $tp('Single-line') }}</el-tag>
                            </template>
                        </el-table-column>
                        <el-table-column :label="$tp('Placed')" width="95">
                            <template slot-scope="s"><span class="xp-dim">{{ when(s.row.datePlaced) }}</span></template>
                        </el-table-column>
                        <el-table-column v-if="canEdit" width="44" align="center">
                            <template slot-scope="s">
                                <el-tooltip :content="$tp('Take off this list')" placement="top">
                                    <el-button type="text" icon="el-icon-close" class="xp-remove" @click="remove(s.row)" />
                                </el-tooltip>
                            </template>
                        </el-table-column>
                    </el-table>
                </template>
                <div v-else-if="!detailLoading" class="xp-detail-empty">
                    <i class="el-icon-tickets" />
                    <div>{{ lists.length ? $tp('Pick a day') : $tp('No pick lists yet') }}</div>
                </div>
            </div>
        </div>

        <!-- print preview -->
        <el-dialog :title="printTitle" :visible.sync="printVisible" width="60%" top="5vh" custom-class="xp-print-dialog" @close="cleanupPrint">
            <div class="xp-print-wrap"><iframe v-if="printUrl" :src="printUrl" class="xp-print-frame" title="Pick list" /></div>
            <span slot="footer">
                <el-button size="small" type="primary" icon="el-icon-printer" @click="printNow">{{ $tp('Print') }}</el-button>
                <el-button size="small" icon="el-icon-download" @click="download">{{ $tp('Download') }}</el-button>
                <el-button size="small" @click="printVisible = false">{{ $tp('Close') }}</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import { getExyonPickLists, getExyonPickList, removeFromPickList } from '@/api/exyonAccessories'
import { buildPickListPdf, pickListFileName } from '@/utils/exyonPickListPdf'
import { hasPermission } from '@/utils/permission'

export default {
    name: 'ExyonAccessoryPickLists',
    data() {
        return {
            loading: false,
            lists: [],
            today: '',
            day: '',
            detailLoading: false,
            list: null,
            lines: [],
            summary: {},
            printVisible: false,
            printUrl: '',
            printTitle: ''
        }
    },
    computed: {
        canEdit() {
            return hasPermission(this.$store.getters.permissions, 'exyon:accessory:picklist')
        }
    },
    created() {
        this.reload()
    },
    beforeDestroy() {
        this.cleanupPrint()
    },
    methods: {
        async reload() {
            await this.loadLists()
            const want = this.day && this.lists.some(d => d.day === this.day) ? this.day : (this.lists[0] && this.lists[0].day)
            if (want) await this.open(want)
            else { this.list = null; this.day = '' }
        },
        async loadLists() {
            this.loading = true
            try {
                const r = await getExyonPickLists()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.lists = r.lists || []
                this.today = r.today || ''
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load the pick lists')))
            } finally {
                this.loading = false
            }
        },
        async open(day) {
            this.day = day
            this.detailLoading = true
            try {
                const r = await getExyonPickList(day)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.list = r.list
                this.lines = r.lines || []
                this.summary = r.summary || {}
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load the pick list')))
            } finally {
                this.detailLoading = false
            }
        },
        async remove(order) {
            try {
                await this.$confirm(this.$tp('Take {no} off this pick list? It goes back to the open orders.', { no: order.orderId }),
                    this.$tp('Take off this list'), { type: 'warning', confirmButtonText: this.$tp('Take off'), cancelButtonText: this.$tp('Cancel') })
            } catch (e) { return }
            try {
                const r = await removeFromPickList(this.list.day, order.orderId)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('{no} taken off the list', { no: order.orderId }))
                await this.reload()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to remove the order')))
            }
        },
        // ── printing ──
        buildPdf() {
            return buildPickListPdf({ day: this.list.day, lines: this.lines, summary: this.summary })
        },
        openPrint() {
            this.cleanupPrint()
            this.printUrl = this.buildPdf().output('bloburl') + '#toolbar=0'
            this.printTitle = `${this.$tp('Pick list')} — ${this.longDay(this.list.day)}`
            this.printVisible = true
        },
        printNow() {
            const doc = this.buildPdf()
            doc.autoPrint()
            const w = window.open(doc.output('bloburl'))
            if (!w) this.$message.warning(this.$tp('Pop-up blocked — use Download instead'))
        },
        download() {
            this.buildPdf().save(pickListFileName(this.list.day))
        },
        cleanupPrint() {
            if (this.printUrl) {
                try { URL.revokeObjectURL(this.printUrl.replace('#toolbar=0', '')) } catch (e) { /* ignore */ }
            }
            this.printUrl = ''
        },
        // ── formatting ──
        dateOf(day) {
            const [y, m, d] = String(day || '').split('-').map(Number)
            return new Date(y, (m || 1) - 1, d || 1)
        },
        shortDay(day) {
            return this.dateOf(day).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
        },
        longDay(day) {
            return this.dateOf(day).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        },
        time(v) {
            const d = new Date(v)
            return isNaN(d) ? '—' : d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
        },
        // "2026-10-08 00:09:54" (as written in Exyon's table) → "08/10 00:09"
        when(v) {
            const m = /^\d{4}-(\d{2})-(\d{2})\s(\d{2}:\d{2})/.exec(v || '')
            return m ? `${m[2]}/${m[1]} ${m[3]}` : '—'
        },
        chClass(c) {
            const v = String(c || '').toLowerCase()
            if (v.includes('reebelo')) return 'ch-reebelo'
            if (v.includes('backmarket') || v.includes('back market')) return 'ch-backmarket'
            if (v.includes('jb hi-fi')) return 'ch-jb'
            if (v.includes('kogan')) return 'ch-kogan'
            return ''
        },
        msg(e, fallback) { return (e.response && e.response.data && e.response.data.message) || e.message || fallback }
    }
}
</script>

<style lang="scss" scoped>
.xp { padding: 14px 16px; }
.xp-flex { flex: 1; }
.xp-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.xp-head-text { min-width: 0; }
.xp-title { font-size: 17px; font-weight: 600; color: #303133; }
.xp-sub { font-size: 13px; color: #909399; margin-top: 3px; }
.xp-dim { color: #909399; font-weight: normal; }

.xp-layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 14px; align-items: start; }
.xp-days { min-height: 120px; display: flex; flex-direction: column; gap: 6px; }
.xp-day { padding: 9px 12px; border: 1px solid #ebeef5; border-radius: 6px; background: #fff; cursor: pointer;
    &:hover { border-color: #b3d8ff; }
    &.on { border-color: #409eff; background: #ecf5ff; } }
.xp-day-1 { display: flex; align-items: center; gap: 6px; b { font-size: 13px; color: #303133; } }
.xp-day-2 { margin-top: 2px; font-size: 12px; color: #909399; }
.xp-today { padding: 0 6px; border-radius: 9px; background: #67c23a; color: #fff; font-size: 11px; line-height: 17px; }
.xp-days-empty, .xp-detail-empty { padding: 40px 10px; text-align: center; color: #909399; font-size: 13px;
    i { display: block; font-size: 32px; color: #c0c4cc; margin-bottom: 8px; }
    small { display: block; margin-top: 4px; font-size: 12px; } }

.xp-detail { min-height: 200px; padding: 14px 16px; border: 1px solid #ebeef5; border-radius: 8px; background: #fff; }
.xp-detail-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.xp-day-title { font-size: 16px; font-weight: 600; color: #303133; }
.xp-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-bottom: 6px; }
.xp-stat { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; padding: 8px 12px; border-radius: 6px; background: #f5f7fa;
    span { width: 100%; font-size: 12px; color: #909399; }
    b { font-size: 20px; color: #303133; }
    small { font-size: 12px; color: #909399; } }
.xp-sec { margin: 16px 0 8px; font-size: 13px; font-weight: 600; color: #303133; }
.xp-table { width: 100%; }
.xp-sku { display: inline-block; padding: 0 6px; border-radius: 4px; background: #f0f2f5; color: #303133; font-family: Menlo, Consolas, monospace; font-size: 11px; line-height: 18px; white-space: nowrap; }
.xp-sku-zoho { background: #ecf5ff; color: #1f6fd1; }
.xp-tracking { font-family: Menlo, Consolas, monospace; font-size: 12px; color: #529b2e; }
.xp-zero { color: #c0c4cc; }
.xp-order { font-weight: 600; color: #303133; }
.xp-ch { display: inline-block; padding: 0 6px; border-radius: 3px; font-size: 11px; line-height: 17px; white-space: nowrap; color: #606266; background: #f4f4f5;
    &.ch-reebelo { color: #409eff; background: #ecf5ff; }
    &.ch-backmarket { color: #67c23a; background: #f0f9eb; }
    &.ch-jb { color: #b88200; background: #fdf6ec; }
    &.ch-kogan { color: #c45656; background: #fef0f0; } }
.xp-item { display: flex; align-items: baseline; gap: 6px; padding: 1px 0; font-size: 12px;
    b { flex-shrink: 0; margin-left: auto; } }
.xp-item-name { min-width: 0; color: #606266; line-height: 1.35; word-break: normal; }
.xp-remove { color: #c0c4cc; &:hover { color: #f56c6c; } }
.xp-print-wrap { height: 72vh; background: #f2f3f5; }
.xp-print-frame { width: 100%; height: 100%; border: none; display: block; }

@media (max-width: 760px) {
    .xp-layout { grid-template-columns: minmax(0, 1fr); }
    .xp-days { flex-direction: row; overflow-x: auto; min-height: 0; padding-bottom: 2px; }
    .xp-day { flex-shrink: 0; }
    .xp-detail { padding: 10px; }
}
</style>
