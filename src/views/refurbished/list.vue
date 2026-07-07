<template>
    <div class="refurb-list app-container">
        <div class="rl-filters">
            <el-input
                v-model="query.search" size="small" clearable
                placeholder="Search title / model / SKU…" class="f-search"
                prefix-icon="el-icon-search"
                @keyup.enter.native="reload" @clear="reload"
            />
            <el-select v-model="query.brand" size="small" clearable filterable placeholder="Brand" class="f-sel" @change="reload">
                <el-option v-for="b in filters.brands" :key="b" :label="b" :value="b" />
            </el-select>
            <el-select v-model="query.grade" size="small" clearable placeholder="Grade" class="f-sel" @change="reload">
                <el-option v-for="g in filters.grades" :key="g" :label="g" :value="g" />
            </el-select>
            <el-select v-model="query.seller" size="small" clearable filterable placeholder="Seller" class="f-sel-w" @change="reload">
                <el-option v-for="s in filters.sellers" :key="s" :label="s" :value="s" />
            </el-select>
            <el-select v-if="filters.dates.length > 1" v-model="query.date" size="small" placeholder="Date" class="f-sel" @change="reload">
                <el-option v-for="d in filters.dates" :key="d" :label="d" :value="d" />
            </el-select>
            <span class="rl-spacer" />
            <span class="rl-meta">{{ total.toLocaleString() }} offers · {{ date || '—' }}</span>
            <el-button size="small" @click="resetFilters">Reset</el-button>
            <el-button size="small" type="primary" icon="el-icon-search" @click="reload">Search</el-button>
        </div>

        <el-table
            v-loading="loading" :data="rows" border size="mini"
            height="calc(100vh - 210px)" class="rl-table"
            @sort-change="onSort"
        >
            <el-table-column label="Title" min-width="300" show-overflow-tooltip>
                <template slot-scope="s">
                    <a v-if="s.row.detail_url || s.row.reebelo_detail_url"
                       :href="s.row.detail_url || s.row.reebelo_detail_url"
                       target="_blank" rel="noopener" class="rl-link">{{ s.row.title || '—' }}</a>
                    <span v-else>{{ s.row.title || '—' }}</span>
                </template>
            </el-table-column>
            <el-table-column prop="brand" label="Brand" width="100" sortable="custom" />
            <el-table-column prop="model" label="Model" min-width="150" show-overflow-tooltip />
            <el-table-column prop="variant_colour" label="Colour" width="100" show-overflow-tooltip />
            <el-table-column prop="internal_memory" label="Storage" width="90" />
            <el-table-column prop="battery_health" label="Battery" width="86">
                <template slot-scope="s">{{ s.row.battery_health || '—' }}</template>
            </el-table-column>
            <el-table-column prop="grade" label="Grade" width="110" sortable="custom" />
            <el-table-column prop="price" label="Price" width="110" align="right" sortable="custom">
                <template slot-scope="s">${{ money(s.row.price) }}</template>
            </el-table-column>
            <el-table-column prop="seller" label="Seller" width="150" sortable="custom" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.sold_by || '—' }}</template>
            </el-table-column>
            <el-table-column prop="stock" label="Stock" width="80" align="right" sortable="custom" />
        </el-table>

        <div class="rl-pager">
            <el-pagination
                background layout="total, sizes, prev, pager, next, jumper"
                :total="total" :page-size="query.pageSize" :page-sizes="[25, 50, 100, 200]"
                :current-page="query.page" @current-change="onPage" @size-change="onSize"
            />
        </div>
    </div>
</template>

<script>
import { getRefurbOffers, getRefurbFilters } from '@/api/refurbished'

export default {
    name: 'RefurbishedList',
    data() {
        return {
            loading: false,
            rows: [],
            total: 0,
            date: null,
            filters: { brands: [], grades: [], sellers: [], dates: [] },
            query: {
                page: 1, pageSize: 50,
                search: '', brand: '', grade: '', seller: '', date: '',
                sort: 'price', order: 'desc'
            }
        }
    },
    created() {
        this.loadFilters()
        this.load()
    },
    methods: {
        async loadFilters() {
            try {
                const r = await getRefurbFilters()
                if (r && r.success) {
                    this.filters = {
                        brands: r.brands || [], grades: r.grades || [],
                        sellers: r.sellers || [], dates: r.dates || []
                    }
                    if (!this.query.date) this.query.date = r.date
                }
            } catch (e) {
                console.error('Refurb filters load failed:', e)
            }
        },
        async load() {
            this.loading = true
            try {
                const r = await getRefurbOffers(this.query)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed to load')
                this.rows = r.rows || []
                this.total = r.total || 0
                this.date = r.date
            } catch (e) {
                console.error('Refurb offers load failed:', e)
                this.$message.error(this.msg(e, 'Failed to load offers'))
            } finally {
                this.loading = false
            }
        },
        reload() { this.query.page = 1; this.load() },
        onPage(p) { this.query.page = p; this.load() },
        onSize(s) { this.query.pageSize = s; this.query.page = 1; this.load() },
        onSort({ prop, order }) {
            const map = { brand: 'brand', model: 'model', grade: 'grade', price: 'price', seller: 'seller', stock: 'stock', title: 'title' }
            if (order) {
                this.query.sort = map[prop] || 'price'
                this.query.order = order === 'ascending' ? 'asc' : 'desc'
            } else {
                this.query.sort = 'price'; this.query.order = 'desc'
            }
            this.query.page = 1
            this.load()
        },
        resetFilters() {
            this.query.search = ''
            this.query.brand = ''
            this.query.grade = ''
            this.query.seller = ''
            this.query.page = 1
            this.load()
        },
        money(v) {
            const n = Number(v)
            return isNaN(n) ? '—' : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        },
        msg(e, fallback) {
            return (e.response && e.response.data && e.response.data.message) || e.message || fallback
        }
    }
}
</script>

<style lang="scss" scoped>
.refurb-list { padding: 12px 16px; }
.rl-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.f-search { width: 260px; }
.f-sel { width: 130px; }
.f-sel-w { width: 180px; }
.rl-spacer { flex: 1; }
.rl-meta { font-size: 12px; color: #909399; margin-right: 6px; white-space: nowrap; }
.rl-table { width: 100%; }
.rl-link { color: #409eff; text-decoration: none; }
.rl-link:hover { text-decoration: underline; }
.rl-pager { margin-top: 10px; text-align: right; }
</style>
