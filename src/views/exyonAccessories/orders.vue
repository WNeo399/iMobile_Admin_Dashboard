<template>
    <div class="xa app-container">
        <div class="xa-head">
            <div>
                <div class="xa-title">{{ $tp('Orders') }}</div>
                <div class="xa-sub">{{ $tp("Exyon's accessory orders, one row per order line, as they come in from the marketplaces") }}</div>
            </div>
            <span class="xa-flex" />
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">{{ $tp('Refresh') }}</el-button>
        </div>

        <!-- totals for the current filters -->
        <div class="xa-stats">
            <div class="xa-stat"><div class="xa-stat-label">{{ $tp('Orders') }}</div><div class="xa-stat-value">{{ summary.orders }}</div></div>
            <div class="xa-stat"><div class="xa-stat-label">{{ $tp('Lines') }}</div><div class="xa-stat-value">{{ summary.lines }}</div></div>
            <div class="xa-stat"><div class="xa-stat-label">{{ $tp('Units') }}</div><div class="xa-stat-value">{{ summary.units }}</div></div>
            <div class="xa-stat"><div class="xa-stat-label">{{ $tp('Sales') }}</div><div class="xa-stat-value">{{ money(summary.sales) }}</div></div>
        </div>

        <div class="xa-filters">
            <el-input v-model="search" size="small" clearable class="xa-search" prefix-icon="el-icon-search"
                :placeholder="$tp('Search order / SKU / product / customer')" @input="onSearch" />
            <el-select v-model="channel" size="small" clearable class="xa-select" :placeholder="$tp('All channels')" @change="reload">
                <el-option v-for="c in channels" :key="c.value" :label="c.value" :value="c.value">
                    <span>{{ c.value }}</span><span class="xa-opt-n">{{ c.n }}</span>
                </el-option>
            </el-select>
            <el-select v-model="status" size="small" clearable class="xa-select" :placeholder="$tp('All statuses')" @change="reload">
                <el-option v-for="s in statuses" :key="s.value" :label="s.value" :value="s.value">
                    <span>{{ s.value }}</span><span class="xa-opt-n">{{ s.n }}</span>
                </el-option>
            </el-select>
            <el-date-picker v-model="range" type="daterange" size="small" value-format="yyyy-MM-dd" format="dd/MM/yyyy"
                unlink-panels class="xa-range" :range-separator="$tp('to')" :start-placeholder="$tp('Placed from')"
                :end-placeholder="$tp('Placed to')" :picker-options="pickerOptions" @change="reload" />
            <el-button v-if="filtered" size="small" type="text" icon="el-icon-close" @click="clearFilters">{{ $tp('Clear filters') }}</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini" class="xa-table" row-key="id">
            <!-- the rest of the line: notes, account, the order's total … -->
            <el-table-column type="expand" width="36">
                <template slot-scope="s">
                    <div class="xa-more">
                        <div><span>{{ $tp('Account') }}</span>{{ s.row.account || '—' }}</div>
                        <div><span>{{ $tp('Customer email') }}</span>{{ s.row.customerEmail || '—' }}</div>
                        <div><span>{{ $tp('Order total') }}</span>{{ money(s.row.orderTotal) }}</div>
                        <div><span>{{ $tp('Line ID') }}</span>{{ s.row.lineId }}</div>
                        <div><span>{{ $tp('Detected via') }}</span>{{ s.row.detectedVia || '—' }}</div>
                        <div><span>{{ $tp('Received') }}</span>{{ dateTime(s.row.receivedAt) }}</div>
                        <div class="xa-more-notes"><span>{{ $tp('Notes') }}</span>{{ s.row.notes || '—' }}</div>
                    </div>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Placed')" width="105">
                <template slot-scope="s">
                    <div>{{ dateOnly(s.row.datePlaced) }}</div>
                    <div class="xa-dim">{{ timeOnly(s.row.datePlaced) }}</div>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Order')" min-width="140">
                <template slot-scope="s">
                    <div class="xa-order">{{ s.row.orderId }}</div>
                    <el-tag v-if="s.row.channel" size="mini" effect="plain" :type="channelTag(s.row.channel)">{{ s.row.channel }}</el-tag>
                </template>
            </el-table-column>
            <el-table-column label="SKU" width="130">
                <template slot-scope="s">
                    <div class="xa-sku" :title="$tp('Neto SKU')">{{ s.row.sku }}</div>
                    <div v-if="s.row.zohoSku" class="xa-zoho" :title="s.row.zohoName">Zoho {{ s.row.zohoSku }}</div>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Product')" min-width="280">
                <template slot-scope="s">
                    <div class="xa-prod">
                        <el-image v-if="s.row.image" :src="s.row.image" fit="contain" :preview-src-list="[s.row.image]" class="xa-thumb" />
                        <div v-else class="xa-thumb xa-thumb-none"><i class="el-icon-picture-outline" /></div>
                        <div class="xa-product">{{ s.row.productName || '—' }}</div>
                    </div>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Qty')" width="60" align="right">
                <template slot-scope="s">{{ s.row.quantity }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Unit price')" width="95" align="right">
                <template slot-scope="s">{{ money(s.row.unitPrice) }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Line total')" width="100" align="right">
                <template slot-scope="s"><b>{{ money(lineTotal(s.row)) }}</b></template>
            </el-table-column>
            <el-table-column :label="$tp('Status')" width="110" align="center">
                <template slot-scope="s">
                    <el-tag v-if="s.row.status" size="mini" :type="statusTag(s.row.status)">{{ s.row.status }}</el-tag>
                    <span v-else class="xa-dim">—</span>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Customer')" min-width="150" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.customerName || '—' }}</template>
            </el-table-column>
            <template slot="empty">
                <span class="xa-empty">{{ filtered ? $tp('No orders match the filters') : $tp('No accessory orders yet') }}</span>
            </template>
        </el-table>

        <el-pagination v-if="total > 10" background small class="xa-pager"
            layout="total, sizes, prev, pager, next" :total="total" :page-sizes="[20, 50, 100]"
            :page-size="pageSize" :current-page="page" @current-change="onPage" @size-change="onSize" />
    </div>
</template>

<script>
import { getExyonAccessoryOrders } from '@/api/exyonAccessories'

// a date `days` ago (0 = today), as yyyy-MM-dd
function dayAgo(days) {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default {
    name: 'ExyonAccessoryOrders',
    data() {
        return {
            loading: false,
            rows: [],
            total: 0,
            summary: { orders: 0, lines: 0, units: 0, sales: 0 },
            channels: [],
            statuses: [],
            search: '',
            channel: '',
            status: '',
            range: null,
            page: 1,
            pageSize: 20,
            searchTimer: null
        }
    },
    computed: {
        filtered() {
            return !!(this.search.trim() || this.channel || this.status || (this.range && this.range.length))
        },
        pickerOptions() {
            const shortcut = (text, from) => ({ text: this.$tp(text), onClick: (picker) => picker.$emit('pick', [from, dayAgo(0)]) })
            const d = new Date()
            const monthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
            return {
                shortcuts: [
                    shortcut('Today', dayAgo(0)),
                    shortcut('Last 7 days', dayAgo(6)),
                    shortcut('Last 30 days', dayAgo(29)),
                    shortcut('This month', monthStart)
                ]
            }
        }
    },
    created() {
        this.load()
    },
    beforeDestroy() {
        clearTimeout(this.searchTimer)
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const [from, to] = this.range || []
                const r = await getExyonAccessoryOrders({
                    q: this.search.trim() || undefined,
                    channel: this.channel || undefined,
                    status: this.status || undefined,
                    from, to,
                    page: this.page,
                    pageSize: this.pageSize
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.rows || []
                this.total = r.total || 0
                this.summary = r.summary || this.summary
                this.channels = r.channels || []
                this.statuses = r.statuses || []
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load the accessory orders')))
            } finally {
                this.loading = false
            }
        },
        reload() {
            this.page = 1
            this.load()
        },
        onSearch() {
            clearTimeout(this.searchTimer)
            this.searchTimer = setTimeout(this.reload, 350)
        },
        onPage(p) {
            this.page = p
            this.load()
        },
        onSize(n) {
            this.pageSize = n
            this.reload()
        },
        clearFilters() {
            this.search = ''
            this.channel = ''
            this.status = ''
            this.range = null
            this.reload()
        },
        lineTotal(r) {
            const n = Number(r.unitPrice) * (Number(r.quantity) || 0)
            return isFinite(n) && r.unitPrice != null ? n : null
        },
        channelTag(c) {
            return { reebelo: '', backmarket: 'success' }[String(c).toLowerCase()] || 'info'
        },
        statusTag(s) {
            const v = String(s).toLowerCase()
            if (/dispatch|ship|complete|deliver/.test(v)) return 'success'
            if (/cancel|refund|void|return/.test(v)) return 'danger'
            return 'warning'
        },
        // dates come as written in Exyon's table ("2026-10-08 00:09:54")
        dateOnly(v) {
            const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || '')
            return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'
        },
        timeOnly(v) {
            const m = /\s(\d{2}:\d{2})/.exec(v || '')
            return m ? m[1] : ''
        },
        dateTime(v) {
            return v ? `${this.dateOnly(v)} ${this.timeOnly(v)}` : '—'
        },
        money(v) {
            if (v === null || v === undefined || v === '') return '—'
            const n = Number(v)
            if (!isFinite(n)) return '—'
            return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        },
        msg(e, fallback) { return (e.response && e.response.data && e.response.data.message) || e.message || fallback }
    }
}
</script>

<style lang="scss" scoped>
.xa { padding: 14px 16px; }
.xa-head { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 12px; }
.xa-title { font-size: 17px; font-weight: 600; color: #303133; }
.xa-sub { font-size: 13px; color: #909399; margin-top: 3px; }
.xa-flex { flex: 1; }
.xa-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 12px; }
.xa-stat { padding: 10px 14px; border: 1px solid #ebeef5; border-radius: 6px; background: #fff; }
.xa-stat-label { font-size: 12px; color: #909399; }
.xa-stat-value { margin-top: 2px; font-size: 20px; font-weight: 600; color: #303133; }
.xa-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
.xa-search { width: 280px; max-width: 100%; }
.xa-select { width: 160px; }
.xa-range { width: 260px !important; max-width: 100%; }
.xa-opt-n { float: right; margin-left: 12px; color: #c0c4cc; font-size: 12px; }
.xa-table { width: 100%; }
.xa-dim { font-size: 12px; color: #909399; }
.xa-order { font-weight: 600; color: #303133; margin-bottom: 2px; }
.xa-product { line-height: 1.35; color: #303133; word-break: normal; }
.xa-prod { display: flex; align-items: center; gap: 8px; }
.xa-thumb { flex-shrink: 0; width: 40px; height: 40px; border-radius: 4px; border: 1px solid #ebeef5; background: #fff; cursor: zoom-in; }
.xa-thumb-none { display: flex; align-items: center; justify-content: center; background: #f5f7fa; color: #c0c4cc; font-size: 16px; cursor: default; }
.xa-sku { font-family: Menlo, Consolas, monospace; font-size: 12px; color: #303133; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.xa-zoho { display: inline-block; margin-top: 2px; padding: 0 5px; border-radius: 3px; background: #ecf5ff; color: #1f6fd1; font-size: 11px; line-height: 17px; white-space: nowrap; }
.xa-empty { color: #909399; font-size: 13px; }
.xa-pager { margin-top: 10px; text-align: right; }
.xa-more { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px 18px; padding: 4px 12px; font-size: 12px; color: #303133;
    span { display: inline-block; min-width: 96px; margin-right: 6px; color: #909399; } }
.xa-more-notes { grid-column: 1 / -1; white-space: pre-line; }
@media (max-width: 600px) {
    .xa-search, .xa-select, .xa-range { width: 100% !important; }
}
</style>
