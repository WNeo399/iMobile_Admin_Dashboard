<template>
    <div class="inflow-customers app-container">
        <div class="ic-head">
            <el-input v-model="search" size="small" clearable class="ic-search"
                placeholder="Search customer…" prefix-icon="el-icon-search" @input="page = 1" />
            <span class="ic-spacer" />
            <span class="ic-meta">{{ filtered.length.toLocaleString() }} customers</span>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">Refresh</el-button>
        </div>

        <el-table v-loading="loading" :data="paged" border size="mini" height="calc(100vh - 210px)" @sort-change="onSort">
            <el-table-column prop="name" label="Customer" min-width="220" sortable="custom" show-overflow-tooltip>
                <template slot-scope="s">
                    <el-link type="primary" :underline="false" @click="viewOrders(s.row)">{{ s.row.name }}</el-link>
                </template>
            </el-table-column>
            <el-table-column prop="orderCount" label="Orders" width="90" align="right" sortable="custom" />
            <el-table-column prop="invoiced" label="Invoiced" width="130" align="right" sortable="custom">
                <template slot-scope="s">{{ money(s.row.invoiced) }}</template>
            </el-table-column>
            <el-table-column prop="credits" label="Credits" width="130" align="right" sortable="custom">
                <template slot-scope="s"><span :class="{ neg: s.row.credits < 0 }">{{ money(s.row.credits) }}</span></template>
            </el-table-column>
            <el-table-column prop="paid" label="Paid" width="130" align="right" sortable="custom">
                <template slot-scope="s">{{ money(s.row.paid) }}</template>
            </el-table-column>
            <el-table-column prop="outstanding" label="Outstanding" width="140" align="right" sortable="custom">
                <template slot-scope="s"><b :class="outClass(s.row.outstanding)">{{ money(s.row.outstanding) }}</b></template>
            </el-table-column>
            <el-table-column label="" width="120" align="right">
                <template slot-scope="s"><el-button size="mini" type="text" @click="viewOrders(s.row)">View orders</el-button></template>
            </el-table-column>
        </el-table>

        <div class="ic-pager">
            <el-pagination background layout="total, sizes, prev, pager, next"
                :total="filtered.length" :page-size="pageSize" :page-sizes="[25, 50, 100]"
                :current-page="page" @current-change="p => page = p" @size-change="onSize" />
        </div>
    </div>
</template>

<script>
import { getInflowCustomers } from '@/api/inflow'

export default {
    name: 'InflowCustomers',
    data() {
        return {
            loading: false,
            all: [],
            search: '',
            page: 1,
            pageSize: 25,
            sort: 'outstanding',
            order: 'descending'
        }
    },
    computed: {
        filtered() {
            const q = (this.search || '').trim().toLowerCase()
            let rows = q ? this.all.filter(c => String(c.name || '').toLowerCase().indexOf(q) !== -1) : this.all.slice()
            if (this.sort) {
                const dir = this.order === 'ascending' ? 1 : -1
                rows.sort((a, b) => {
                    const av = a[this.sort], bv = b[this.sort]
                    if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv)) * dir
                    return ((av || 0) - (bv || 0)) * dir
                })
            }
            return rows
        },
        paged() {
            const start = (this.page - 1) * this.pageSize
            return this.filtered.slice(start, start + this.pageSize)
        }
    },
    created() {
        this.load()
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await getInflowCustomers()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.all = r.rows || []
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load customers'))
            } finally {
                this.loading = false
            }
        },
        onSort({ prop, order }) {
            this.sort = order ? prop : 'outstanding'
            this.order = order || 'descending'
            this.page = 1
        },
        onSize(s) { this.pageSize = s; this.page = 1 },
        viewOrders(row) {
            this.$router.push({ path: '/inflow/salesOrders', query: { customer: row.name } })
        },
        outClass(v) {
            if (v > 0) return 'owing'
            if (v < 0) return 'neg'
            return ''
        },
        money(v) {
            const n = Number(v)
            if (!isFinite(n)) return '—'
            return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        },
        msg(e, fallback) { return (e.response && e.response.data && e.response.data.message) || e.message || fallback }
    }
}
</script>

<style lang="scss" scoped>
.inflow-customers { padding: 12px 16px; }
.ic-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.ic-search { width: 260px; }
.ic-spacer { flex: 1; }
.ic-meta { font-size: 12px; color: #909399; margin-right: 6px; white-space: nowrap; }
.ic-pager { margin-top: 10px; text-align: right; }
.neg { color: #F56C6C; }
.owing { color: #E6A23C; }
</style>
