<template>
    <div class="po-page">
        <tree-panel
            ref="treeRef"
            :tree-data="treeData"
            title="Purchase Order"
            title-icon-class="el-icon-shopping-bag-1"
            node-key="id"
            :default-expand-all="true"
            :show-search="false"
            @node-click="onNodeClick"
        >
            <template #node="{ data }">
                <span class="po-node">
                    <i :class="data.id === 'root' ? 'el-icon-notebook-2' : 'el-icon-document'" class="po-node-icon" />
                    <span class="po-node-label" :title="data.label">{{ data.label }}</span>
                    <span v-if="data.count != null" class="po-node-count">{{ data.count }}</span>
                </span>
            </template>
        </tree-panel>

        <div class="po-main">
            <div class="po-toolbar">
                <span class="po-title"><i class="el-icon-tickets" /> {{ activeCategory || 'All Categories' }}</span>
                <span class="po-meta">{{ total.toLocaleString() }} rows</span>
                <span v-if="syncedStr" class="po-meta">· synced {{ syncedStr }}</span>
                <span class="po-spacer" />
                <el-checkbox v-model="notReceived" class="po-toggle" @change="reload">Not yet received only</el-checkbox>
                <el-input
                    v-model="search"
                    size="small"
                    clearable
                    prefix-icon="el-icon-search"
                    placeholder="SKU / product / supplier / DHL#…"
                    class="po-search"
                    @keyup.enter.native="reload"
                    @clear="reload"
                />
                <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">Refresh</el-button>
            </div>

            <el-table
                v-loading="loading"
                :data="rows"
                border
                size="mini"
                height="calc(100vh - 220px)"
                class="po-table"
            >
                <el-table-column label="产品" min-width="340" fixed>
                    <template slot-scope="s">
                        <a v-if="s.row.zoho_id"
                            class="po-prod-link"
                            :href="`https://inventory.zoho.com/app/746138234#/inventory/product/variantslist/${s.row.zoho_id}`"
                            target="_blank" rel="noopener">{{ s.row.productName }}</a>
                        <div v-else class="po-prod-name">{{ s.row.productName }}</div>
                        <div v-if="s.row.sku" class="po-prod-sku">SKU: {{ s.row.sku }}</div>
                        <div v-if="s.row.note" class="po-prod-note">备注: {{ s.row.note }}</div>
                    </template>
                </el-table-column>
                <el-table-column label="订货日期" prop="orderDate" width="110" align="center" />
                <el-table-column label="订货数量" width="100" align="center"><template slot-scope="s">{{ num(s.row.orderQty) }}</template></el-table-column>
                <el-table-column label="采购单价" width="100" align="center"><template slot-scope="s">{{ yuan(s.row.unitPrice) }}</template></el-table-column>
                <el-table-column label="供应商" prop="supplier" width="120" align="center" show-overflow-tooltip />
                <el-table-column label="下单时间" prop="orderedAt" width="110" align="center" />
                <el-table-column label="发货数量" width="100" align="center"><template slot-scope="s">{{ num(s.row.shippedQty) }}</template></el-table-column>
                <el-table-column label="发货日期" prop="shippedDate" width="120" align="center" />
                <el-table-column label="DHL单号" prop="dhlTracking" width="130" align="center" show-overflow-tooltip>
                    <template slot-scope="s">
                        <a v-if="s.row.dhlTracking"
                            class="po-dhl-link"
                            :href="`https://www.dhl.com/au-en/home/tracking.html?tracking-id=${encodeURIComponent(s.row.dhlTracking)}&submit=1`"
                            target="_blank" rel="noopener">{{ s.row.dhlTracking }}</a>
                        <span v-else>—</span>
                    </template>
                </el-table-column>
                <el-table-column label="收到日期" prop="receivedDate" width="120" align="center" />
                <template slot="empty">
                    <span class="po-empty">No records{{ search || notReceived ? ' match the current filters.' : '.' }}</span>
                </template>
            </el-table>

            <div class="po-pager">
                <el-pagination
                    background
                    layout="total, sizes, prev, pager, next, jumper"
                    :total="total"
                    :page-size="pageSize"
                    :page-sizes="[50, 100, 200, 500]"
                    :current-page="page"
                    @current-change="onPage"
                    @size-change="onSize"
                />
            </div>
        </div>
    </div>
</template>

<script>
import TreePanel from '@/components/TreePanel'
import { getPoRecords } from '@/api/purchaseOrder'

const DEFAULT_CATEGORY = '屏幕'

export default {
    name: 'ImobilePurchaseOrder',
    components: { TreePanel },
    data() {
        return {
            byCategory: {},
            byCategoryOpen: {},
            activeCategory: DEFAULT_CATEGORY,
            rows: [],
            total: 0,
            lastSyncedAt: null,
            notReceived: true,
            search: '',
            page: 1,
            pageSize: 100,
            loading: false,
            treeInit: false
        }
    },
    computed: {
        treeData() {
            // Counts follow the "Not yet received only" toggle.
            const counts = this.notReceived ? this.byCategoryOpen : this.byCategory
            const children = Object.keys(this.byCategory).map(cat => ({
                id: cat, label: cat, count: counts[cat] || 0
            }))
            const total = Object.keys(this.byCategory).reduce((sum, cat) => sum + (counts[cat] || 0), 0)
            return [{ id: 'root', label: 'All Categories', count: total, children }]
        },
        syncedStr() {
            if (!this.lastSyncedAt) return ''
            const d = new Date(this.lastSyncedAt)
            return isNaN(d.getTime()) ? '' : d.toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })
        }
    },
    created() {
        this.load()
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await getPoRecords({
                    page: this.page,
                    pageSize: this.pageSize,
                    category: this.activeCategory,
                    notReceived: this.notReceived ? 'true' : undefined,
                    search: this.search
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.rows || []
                this.total = r.total || 0
                if (r.lastSyncedAt) this.lastSyncedAt = r.lastSyncedAt
                if (r.byCategory && Object.keys(r.byCategory).length) this.byCategory = r.byCategory
                this.byCategoryOpen = r.byCategoryOpen || {}
                // First load: if the default category is missing, fall back to All.
                if (!this.treeInit && Object.keys(this.byCategory).length) {
                    this.treeInit = true
                    if (this.activeCategory && !this.byCategory[this.activeCategory]) {
                        this.activeCategory = ''
                        this.load()
                    }
                    this.$nextTick(() => {
                        if (this.$refs.treeRef && this.$refs.treeRef.setCurrentKey) {
                            this.$refs.treeRef.setCurrentKey(this.activeCategory || 'root')
                        }
                    })
                }
            } catch (e) {
                console.error('PO records load failed:', e)
                this.$message.error(this.msg(e, 'Failed to load purchase orders'))
            } finally {
                this.loading = false
            }
        },
        reload() { this.page = 1; this.load() },
        onNodeClick(data) {
            if (!data) return
            const cat = data.id === 'root' ? '' : data.label
            if (cat === this.activeCategory) return
            this.activeCategory = cat
            this.page = 1
            this.load()
        },
        onPage(p) { this.page = p; this.load() },
        onSize(s) { this.pageSize = s; this.page = 1; this.load() },
        num(v) { return (v == null || v === '') ? '—' : Number(v).toLocaleString() },
        yuan(v) { return (v == null || v === '') ? '—' : '￥' + Number(v).toLocaleString() },
        msg(e, fallback) {
            return (e.response && e.response.data && e.response.data.message) || e.message || fallback
        }
    }
}
</script>

<style lang="scss" scoped>
.po-page {
    display: flex;
    height: calc(100vh - 84px);
    background: #fff;
}
.po-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding: 12px 14px;
}
.po-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    flex-wrap: wrap;
}
.po-title {
    font-size: 15px;
    font-weight: 600;
    color: #303133;
    white-space: nowrap;
    i { color: #409eff; margin-right: 4px; }
}
.po-meta { font-size: 12px; color: #909399; white-space: nowrap; }
.po-spacer { flex: 1; }
.po-toggle { white-space: nowrap; }
.po-search { width: 240px; max-width: 40vw; }
.po-table { flex: 1; }
.po-prod-name { color: #303133; line-height: 1.35; white-space: normal; word-break: break-word; }
.po-prod-link { display: inline-block; color: #409eff; text-decoration: underline; line-height: 1.35; white-space: normal; word-break: break-word; }
.po-prod-link:hover { color: #66b1ff; }
.po-prod-sku { font-size: 12px; color: #909399; line-height: 1.3; margin-top: 1px; }
.po-prod-note { font-size: 12px; color: #E6A23C; line-height: 1.3; margin-top: 1px; white-space: normal; word-break: break-word; }
.po-dhl-link { color: #409eff; text-decoration: underline; }
.po-dhl-link:hover { color: #66b1ff; }
.po-pager { margin-top: 10px; text-align: right; }
.po-empty { color: #909399; font-size: 13px; }

.po-node {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 13px;
    overflow: hidden;
    width: 100%;
}
.po-node-icon { color: #E6A23C; flex-shrink: 0; }
.po-node-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.po-node-count {
    flex-shrink: 0;
    margin-left: auto;
    font-size: 11px;
    color: #909399;
    background: #f4f4f5;
    padding: 0 6px;
    border-radius: 8px;
}
</style>
