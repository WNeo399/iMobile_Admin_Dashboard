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
                <el-button size="small" type="success" icon="el-icon-plus" @click="openCreatePo">Create PO</el-button>
                <el-button size="small" type="primary" plain icon="el-icon-sort" :loading="syncing" @click="onSync">Sync with Tencent</el-button>
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

        <!-- Create Purchase Order -->
        <el-dialog :visible.sync="poDialogVisible" width="820px" append-to-body :close-on-click-modal="false">
            <div slot="title" class="po-create-head"><i class="el-icon-shopping-cart-2" /> Create Purchase Order</div>

            <el-form label-position="top" size="small" class="po-create-form" @submit.native.prevent>
                <el-form-item label="Add product">
                    <el-autocomplete
                        v-model="poSearchKeyword"
                        :fetch-suggestions="fetchProductSuggestions"
                        :debounce="400"
                        :disabled="poLookupLoading"
                        placeholder="Type product name, SKU, or part to search…"
                        style="width:100%"
                        value-key="name"
                        :trigger-on-focus="false"
                        clearable
                        prefix-icon="el-icon-search"
                        popper-class="po-create-suggestions"
                        @select="onProductSelected"
                    >
                        <template slot-scope="{ item }">
                            <div class="po-suggestion">
                                <img
                                    v-if="item.imgUrl"
                                    :src="item.imgUrl"
                                    class="po-suggestion-img"
                                    @error="onSuggestionImgError($event)"
                                />
                                <div v-else class="po-suggestion-img po-suggestion-img-ph"><i class="el-icon-picture-outline" /></div>
                                <div class="po-suggestion-info">
                                    <div class="po-suggestion-name">{{ item.name }}</div>
                                    <div class="po-suggestion-meta"><span v-if="item.sku">SKU: {{ item.sku }}</span></div>
                                </div>
                            </div>
                        </template>
                    </el-autocomplete>
                </el-form-item>
            </el-form>

            <el-table
                :data="poItems"
                size="mini"
                border
                v-loading="poLookupLoading"
                empty-text="Search above to add one or more products"
                class="po-items-table"
                max-height="360"
            >
                <el-table-column label="Product" min-width="240">
                    <template slot-scope="{ row }">
                        <div class="po-item-name" :title="row.productName">{{ row.productName }}</div>
                        <div class="po-item-sku">
                            SKU: {{ row.sku || '—' }}
                            <el-tag v-if="row.zoho_id" size="mini" type="success" effect="plain" class="po-item-tag">Zoho</el-tag>
                        </div>
                    </template>
                </el-table-column>
                <el-table-column label="Category" width="170">
                    <template slot-scope="{ row }">
                        <el-select v-model="row.category" placeholder="Select" filterable size="mini" style="width:100%">
                            <el-option v-for="c in poCategories" :key="c" :label="c" :value="c" />
                        </el-select>
                    </template>
                </el-table-column>
                <el-table-column label="Qty" width="120" align="center">
                    <template slot-scope="{ row }">
                        <el-input-number v-model="row.orderQty" :min="1" :precision="0" :step="1" size="mini" controls-position="right" style="width:100%" />
                    </template>
                </el-table-column>
                <el-table-column label="Note" min-width="150">
                    <template slot-scope="{ row }">
                        <el-input v-model="row.note" size="mini" maxlength="200" placeholder="Optional" />
                    </template>
                </el-table-column>
                <el-table-column width="44" align="center">
                    <template slot-scope="{ $index }">
                        <el-button type="text" icon="el-icon-delete" class="po-item-del" @click="removePoItem($index)" />
                    </template>
                </el-table-column>
            </el-table>

            <span slot="footer">
                <el-button size="small" @click="poDialogVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" icon="el-icon-check" :loading="poSaving" :disabled="!poItems.length" @click="submitCreatePo">
                    Create {{ poItems.length > 1 ? poItems.length + ' POs' : 'PO' }}
                </el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import TreePanel from '@/components/TreePanel'
import { getPoRecords, updateSyncPo, getPoCategories, createPoBatch } from '@/api/purchaseOrder'
import { searchProducts, lookupProductBySku } from '@/api/zoho/products/product'

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
            syncing: false,
            treeInit: false,
            // Create PO dialog — each row is its own PO (product/category/qty/note)
            poDialogVisible: false,
            poCategories: [],
            poItems: [],
            poSearchKeyword: '',
            poLookupLoading: false,
            poSaving: false
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
        async onSync() {
            try {
                await this.$confirm(
                    'This pulls the latest updates from the Tencent Doc and applies them to the database (updates changed rows, adds new ones). It can take a while as it exports the whole sheet.',
                    'Sync with Tencent Doc',
                    { confirmButtonText: 'Sync', cancelButtonText: 'Cancel', type: 'info' }
                )
            } catch (e) {
                return // cancelled
            }
            this.syncing = true
            try {
                const r = await updateSyncPo()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Sync failed')
                const updated = r.updated || 0
                const inserted = r.inserted || 0
                const unchanged = r.unchanged || 0
                this.$message.success(`Sync complete — ${updated} updated, ${inserted} new, ${unchanged} unchanged.`)
                this.reload()
            } catch (e) {
                console.error('PO update sync failed:', e)
                this.$message.error(this.msg(e, 'Sync failed'))
            } finally {
                this.syncing = false
            }
        },
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

        // ── Create PO ───────────────────────────────────────────────
        openCreatePo() {
            this.poItems = []
            this.poSearchKeyword = ''
            this.poDialogVisible = true
            if (!this.poCategories.length) {
                getPoCategories().then(r => { if (r && r.success) this.poCategories = r.categories || [] }).catch(() => {})
            }
        },
        // Same Zoho product search as the SQT "Send parts" picker.
        async fetchProductSuggestions(query, cb) {
            const q = (query || '').trim()
            if (!q) { cb([]); return }
            try {
                const res = await searchProducts(q)
                if (!res || !res.success) { cb([]); return }
                const products = Array.isArray(res.data) ? res.data : []
                cb(products.map(p => ({
                    ...p,
                    // Zoho returns names HTML-encoded (e.g. 13&quot; → 13"); decode
                    // so the picker, DB record and Tencent row all get real chars.
                    name: this.decodeEntities(p.name || p.product_name || p.title || ''),
                    sku: p.sku
                        || (Array.isArray(p.skus) && p.skus[0] && p.skus[0].sku)
                        || (p.variants && p.variants[0] && p.variants[0].sku)
                        || '',
                    product_id: p.product_id || p.id || '',
                    imgUrl: this.extractProductImage(p)
                })))
            } catch (e) {
                console.error('Product search failed:', e)
                cb([])
            }
        },
        extractProductImage(p) {
            const BASE = 'https://www.imobilestore.com.au'
            const toAbsolute = (path) => {
                if (!path) return ''
                if (/^https?:\/\//i.test(path)) return path
                return BASE + (path.startsWith('/') ? '' : '/') + path
            }
            if (Array.isArray(p.documents) && p.documents[0]) {
                const d = p.documents[0]
                if (d.file_name && d.document_id) {
                    return `${BASE}/product-images/${d.file_name}/${d.document_id}/100x100`
                }
            }
            if (Array.isArray(p.images) && p.images[0]) {
                const i = p.images[0]
                return toAbsolute(i.image_url || i.url || i.path || i.image_path || '')
            }
            return toAbsolute(p.image_url || p.image || p.image_path || '')
        },
        onSuggestionImgError(e) {
            if (e && e.target) e.target.style.display = 'none'
        },
        // Decode HTML entities (&quot; &amp; &#39; …) via the browser's own parser.
        decodeEntities(str) {
            if (!str) return ''
            const el = document.createElement('textarea')
            el.innerHTML = String(str)
            return el.value
        },
        // On select, resolve the real Zoho Inventory item_id via SKU (Commerce
        // product_id ≠ Inventory item_id), then add a row for the product. Each
        // row is an independent PO with its own category / qty / note.
        async onProductSelected(item) {
            if (!item) return
            if (!item.sku) {
                this.$message.error(`"${item.name || 'This product'}" has no SKU — add one in Zoho before creating a PO.`)
                this.poSearchKeyword = ''
                return
            }
            if (this.poItems.some(p => p.sku === item.sku)) {
                this.$message.info(`"${item.name}" is already in the list.`)
                this.poSearchKeyword = ''
                return
            }
            this.poLookupLoading = true
            try {
                let zohoId = null
                try {
                    const res = await lookupProductBySku(item.sku)
                    zohoId = res && res.success && res.data ? res.data.itemId : null
                } catch (e) {
                    console.error('SKU lookup failed:', e)
                }
                this.poItems.push({
                    sku: item.sku,
                    productName: item.name || '',
                    zoho_id: zohoId || null,
                    // Default the category to the one being viewed (unless it's "All").
                    category: this.activeCategory || '',
                    orderQty: 1,
                    note: ''
                })
                if (!zohoId) {
                    this.$message.warning(`"${item.name}" added without a Zoho link (no inventory item found for this SKU).`)
                }
            } finally {
                this.poLookupLoading = false
                this.poSearchKeyword = ''
            }
        },
        removePoItem(idx) {
            this.poItems.splice(idx, 1)
        },
        async submitCreatePo() {
            if (!this.poItems.length) { this.$message.warning('Please search and add at least one product.'); return }
            for (let i = 0; i < this.poItems.length; i++) {
                const it = this.poItems[i]
                if (!it.category) { this.$message.warning(`Row ${i + 1}: please select a category.`); return }
                const qty = Number(it.orderQty)
                if (!Number.isFinite(qty) || qty <= 0) { this.$message.warning(`Row ${i + 1}: please enter a quantity.`); return }
            }
            this.poSaving = true
            try {
                const items = this.poItems.map(it => ({
                    category: it.category,
                    orderQty: Number(it.orderQty),
                    note: it.note,
                    sku: it.sku,
                    productName: it.productName,
                    zoho_id: it.zoho_id
                }))
                const r = await createPoBatch(items)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                const n = r.created || items.length
                if (r.tencentWritten) {
                    this.$message.success(`${n} purchase order${n > 1 ? 's' : ''} created and added to the Tencent sheet.`)
                } else {
                    this.$message.warning(`${n} purchase order${n > 1 ? 's' : ''} saved — but they could not be written to the Tencent sheet yet.`)
                }
                this.poDialogVisible = false
                // If every new PO went to one category, jump there so they're visible.
                const cats = [...new Set(this.poItems.map(it => it.category))]
                if (cats.length === 1 && cats[0] !== this.activeCategory) {
                    this.activeCategory = cats[0]
                    this.$nextTick(() => {
                        if (this.$refs.treeRef && this.$refs.treeRef.setCurrentKey) {
                            this.$refs.treeRef.setCurrentKey(this.activeCategory)
                        }
                    })
                }
                this.reload()
            } catch (e) {
                console.error('PO create failed:', e)
                this.$message.error(this.msg(e, 'Failed to create purchase orders'))
            } finally {
                this.poSaving = false
            }
        },
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

/* Create PO dialog */
.po-create-head { font-size: 15px; font-weight: 600; color: #303133; i { color: #67c23a; margin-right: 6px; } }
.po-create-form ::v-deep .el-form-item { margin-bottom: 10px; }
.po-items-table { margin-top: 2px; }
.po-item-name { font-weight: 600; color: #303133; line-height: 1.3; white-space: normal; word-break: break-word; }
.po-item-sku { font-size: 12px; color: #909399; line-height: 1.3; margin-top: 1px; }
.po-item-tag { margin-left: 4px; }
.po-item-del { color: #f56c6c; padding: 0; font-size: 15px; }

/* Product search suggestions (slot content keeps the scope attribute even in the body-mounted popper) */
.po-suggestion { display: flex; align-items: center; gap: 10px; padding: 4px 0; line-height: 1.4; min-width: 0; }
.po-suggestion-img { width: 40px; height: 40px; flex-shrink: 0; border-radius: 4px; object-fit: cover; background: #f5f7fa; border: 1px solid #ebeef5; }
.po-suggestion-img-ph { display: flex; align-items: center; justify-content: center; color: #c0c4cc; font-size: 18px; }
.po-suggestion-info { flex: 1; min-width: 0; overflow: hidden; }
.po-suggestion-name { font-size: 13px; color: #303133; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.po-suggestion-meta { font-size: 12px; color: #909399; }
</style>
