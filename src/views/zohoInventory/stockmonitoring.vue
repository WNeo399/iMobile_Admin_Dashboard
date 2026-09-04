<template>
    <div class="app-container tree-sidebar-manage-wrap">
        <tree-panel title="Category" :tree-data="treeData" search-placeholder="Please Enter Categiry"
            storage-key="dept-sidebar-width" :defaultExpandAll="true" ref="deptTreeRef" @node-click="handleNodeClick" />
        <div class="tree-sidebar-content">
            <div class="content-inner">
                <!-- ── Stock-Dashboard-style main section (both scopes) —
                     header, one search box, clickable count tiles. Only the
                     tile set and the Category filter differ per scope; the
                     items table below keeps its per-scope columns. ── -->
                <div class="sd-head">
                    <div class="sd-title">
                        <h2>{{ currentTab || (isAccessories ? 'Accessories' : 'Spare Parts') }}</h2>
                        <div class="sd-asof">live from Zoho · {{ productList.length.toLocaleString() }} items</div>
                    </div>
                    <div class="sd-spacer" />
                    <el-button v-hasPermi="['zoho:collection:view']" size="small" plain type="primary"
                        icon="el-icon-plus" :loading="collectionDetailLoading" :disabled="!currentCollection"
                        @click="handleEditCollection">Add Product</el-button>
                    <el-dropdown trigger="click" @command="handleExportCommand">
                        <el-button size="small" plain type="success" icon="el-icon-download">
                            Export <i class="el-icon-arrow-down el-icon--right" />
                        </el-button>
                        <el-dropdown-menu slot="dropdown">
                            <el-dropdown-item v-if="!isAccessories && multipleSelection.length" command="selection">
                                Selection ({{ multipleSelection.length }})</el-dropdown-item>
                            <el-dropdown-item command="view">Current view ({{ total.toLocaleString() }})</el-dropdown-item>
                            <el-dropdown-item command="full">Full list ({{ productList.length.toLocaleString() }})</el-dropdown-item>
                        </el-dropdown-menu>
                    </el-dropdown>
                </div>

                <div class="sd-filters">
                    <el-input v-model="queryParams.search" size="small" clearable class="sd-search"
                        placeholder="SKU or product name" prefix-icon="el-icon-search"
                        @keyup.enter.native="handleQuery" @clear="handleQuery" />
                    <el-select v-if="isAccessories" v-model="queryParams.category" size="small" clearable filterable
                        placeholder="Category" class="sd-sel-wide" @change="handleQuery">
                        <el-option v-for="c in categoryOptions" :key="c" :label="c" :value="c" />
                    </el-select>
                    <el-button size="mini" type="primary" icon="el-icon-search" @click="handleQuery">Search</el-button>
                    <el-button size="mini" icon="el-icon-refresh" @click="resetQuery">Reset</el-button>
                </div>

                <!-- The counts, each one a filter (click again to clear) -->
                <div :class="['sd-tiles', { 'sd-tiles-5': !isAccessories }]">
                    <div v-for="t in tiles" :key="t.key"
                        :class="['sd-tile', 'tone-' + t.tone, { on: (queryParams.quick || '') === t.key }]"
                        @click="pickTile(t.key)">
                        <div class="sd-tile-label">{{ t.label }}</div>
                        <div class="sd-tile-value">{{ t.value.toLocaleString() }}</div>
                        <div class="sd-tile-note">{{ t.note }}</div>
                    </div>
                </div>


                <div class="sd-card">
                <div class="sd-card-head">
                    <span class="sd-card-title">{{ activeTileLabel }}</span>
                    <el-tag size="mini" effect="plain">{{ total.toLocaleString() }} items</el-tag>
                    <div class="sd-spacer" />
                    <el-button v-if="!isAccessories && multipleSelection.length" type="text" size="mini"
                        @click="() => { $refs.table.clearSelection() }">Clear Selection ({{ multipleSelection.length }})</el-button>
                    <el-button v-if="queryParams.quick" type="text" size="mini" @click="pickTile('')">Clear filter</el-button>
                </div>
                <el-table v-loading="loading" :data="showProductList" @selection-change="handleSelectionChange"
                    @sort-change="handleSorting" ref="table" empty-text="No Data" stripe border row-key="id">
                    <el-table-column v-if="!isAccessories" type="selection" width="50" align="center" :reserve-selection="true" />
                    <el-table-column label="Product" align="left" header-align="center" key="product"
                        min-width="300" sortable="custom" prop="productName">
                        <template slot-scope="scope">
                            <div class="product-cell">
                                <a class="product-name-link"
                                    :href="`https://inventory.zoho.com/app/746138234#/inventory/items/${scope.row.id}`"
                                    target="_blank" rel="noopener" :title="scope.row.productName">{{ scope.row.productName }}</a>
                                <div class="product-meta">
                                    <span class="p-sku">SKU: {{ scope.row.sku || '—' }}</span>
                                    <span v-if="scope.row.location" class="p-loc"><i class="el-icon-location-outline" /> {{ scope.row.location }}</span>
                                    <span v-if="scope.row.category" class="p-cat"><i class="el-icon-collection-tag" /> {{ scope.row.category }}</span>
                                </div>
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column v-if="!isAccessories" label="Current Stock" align="center" key="stock" prop="stock" width="140"
                        sortable="custom" :show-overflow-tooltip="true" />

                    <!-- Accessories show Zoho's two stock figures stacked in one
                         column: Physical (shipment-driven, the shelf reality —
                         sorting uses it) over Accounting (invoice-driven).
                         Accounting turns amber when the two disagree. -->
                    <el-table-column v-if="isAccessories" label="Stock" align="center" key="accStock"
                        prop="stock" width="140" sortable="custom">
                        <template slot-scope="scope">
                            <div class="stock-line"><span class="stock-label">Physical</span> <b>{{ scope.row.stock }}</b></div>
                            <div class="stock-line">
                                <span class="stock-label">Acct</span>
                                <span :class="{ 'stock-diff': Number(scope.row.accountingStock) !== Number(scope.row.stock) }">{{ scope.row.accountingStock }}</span>
                            </div>
                        </template>
                    </el-table-column>

                    <!-- Zoho's reorder level — maintained for accessories only;
                         red when stock has fallen to or below it. Click to
                         edit; saving writes the new point back to Zoho. -->
                    <el-table-column v-if="isAccessories" label="Reorder Point" align="center" key="reorderLevel"
                        prop="reorderLevel" width="150" sortable="custom">
                        <template slot-scope="scope">
                            <div v-if="rpEdit.id === scope.row.id" class="rp-edit" @click.stop>
                                <el-input-number v-model="rpEdit.value" size="mini" :min="0" :controls="false"
                                    class="rp-input" @keyup.enter.native="rpEnter($event, scope.row)" />
                                <!-- Timing matters: the number input only commits
                                     its value on blur/enter. SAVE must run after
                                     that commit → click (which follows the blur).
                                     CANCEL discards the value anyway and the blur
                                     re-render can swallow a click → mousedown. -->
                                <el-button type="text" size="mini" icon="el-icon-check" class="rp-save"
                                    :loading="rpEdit.saving" @click="saveRpEdit(scope.row)" />
                                <el-button type="text" size="mini" icon="el-icon-close" class="rp-cancel"
                                    :disabled="rpEdit.saving" @mousedown.native.prevent="cancelRpEdit" />
                            </div>
                            <div v-else class="rp-view" title="Click to edit — saves to Zoho"
                                @click.stop="startRpEdit(scope.row)">
                                <span v-if="Number(scope.row.reorderLevel) > 0"
                                    :class="{ 'rp-below': Number(scope.row.stock) <= Number(scope.row.reorderLevel) }">
                                    {{ scope.row.reorderLevel }}
                                </span>
                                <span v-else class="rp-none">—</span>
                                <i class="el-icon-edit rp-pencil" />
                            </div>
                        </template>
                    </el-table-column>

                    <el-table-column align="center" key="sales30Day" prop="sales30Day" width="170"
                        :show-overflow-tooltip="true">
                        <template #header>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span>Sales</span>

                                <el-select v-model="duration" placeholder="Filter" size="mini" style="width:60px">
                                    <el-option label="15" :value="15" />
                                    <el-option label="30" :value="30" />
                                    <el-option label="45" :value="45" />
                                    <el-option label="60" :value="60" />
                                    <el-option label="90" :value="90" />

                                </el-select>
                                days
                            </div>
                        </template>
                        <template slot-scope="scope">
                            <i v-if="salesLoading" class="el-icon-loading"></i>
                            <div class="stock-cell" v-else>
                                <div class="sales-total">
                                    {{ Number(scope.row.zohoSales || 0) + Number(scope.row.offlineSales || 0) }}
                                </div>

                                <div class="sales-breakdown">
                                    <span>Zoho: {{ scope.row.zohoSales || 0 }}</span>
                                    <span>Other: {{ scope.row.offlineSales || 0 }}</span>
                                </div>
                            </div>
                        </template>
                    </el-table-column>

                    <!-- Purchase (Tencent PO) integration is Spare Parts only -->
                    <el-table-column v-if="!isAccessories" label="Purchase" align="center" key="purchase" width="180">
                        <template slot-scope="scope">
                            <i v-if="purchaseLoading" class="el-icon-loading"></i>
                            <div v-else-if="scope.row.purchase && scope.row.purchase.count" class="purchase-cell">
                                <div class="purchase-line"><span class="purchase-label">Order Qty:</span> <b>{{ scope.row.purchase.orderQty }}</b></div>
                                <div v-if="scope.row.purchase.shippedQty" class="purchase-line"><span class="purchase-label">Shipped Qty:</span> <b>{{ scope.row.purchase.shippedQty }}</b></div>
                                <div v-for="t in scope.row.purchase.trackings" :key="t" class="purchase-line">
                                    <span class="purchase-label">DHL:</span> <a :href="dhlUrl(t)" target="_blank" rel="noopener">{{ t }}</a>
                                </div>
                            </div>
                            <span v-else class="purchase-none">-</span>
                        </template>
                    </el-table-column>

                    <el-table-column label="Operation" align="center" width="200"
                        class-name="small-padding fixed-width">
                        <template slot-scope="scope" v-if="scope.row.userId !== 1">
                            <el-button size="mini" type="text" icon="el-icon-edit"
                                @click="handleGetProductDetail(scope.row.id)">View Detail</el-button>
                            <el-button v-if="!isAccessories" size="mini" type="text" icon="el-icon-shopping-cart-2"
                                @click="openCreatePo(scope.row)">Create PO</el-button>
                            <!-- <el-button size="mini" type="text" icon="el-icon-delete" @click="handleDelete(scope.row)" v-hasPermi="['system:user:remove']">删除</el-button>
              <el-dropdown size="mini" @command="(command) => handleCommand(command, scope.row)" v-hasPermi="['system:user:resetPwd', 'system:user:edit']">
                <el-button size="mini" type="text" icon="el-icon-d-arrow-right">更多</el-button>
                <el-dropdown-menu slot="dropdown">
                  <el-dropdown-item command="handleResetPwd" icon="el-icon-key" v-hasPermi="['system:user:resetPwd']">重置密码</el-dropdown-item>
                  <el-dropdown-item command="handleAuthRole" icon="el-icon-circle-check" v-hasPermi="['system:user:edit']">分配角色</el-dropdown-item>
                </el-dropdown-menu>
              </el-dropdown> -->
                        </template>
                    </el-table-column>
                </el-table>
                <pagination v-show="total > 0" :total="total" :page.sync="queryParams.pageNum"
                    :limit.sync="queryParams.pageSize" @pagination="handlePagination" prev-text="Prev"
                    next-text="Next" />
                </div>
            </div>
        </div>
        <ProductDetailDialog :open.sync="open" :product="product"></ProductDetailDialog>

        <!-- Create Purchase Order -->
        <el-dialog :visible.sync="poDialogVisible" width="520px" append-to-body :close-on-click-modal="false">
            <div slot="title" class="po-create-head"><i class="el-icon-shopping-cart-2" /> Create Purchase Order</div>
            <div v-if="poProduct" class="po-create-card">
                <div class="po-create-name" :title="poProduct.productName">{{ poProduct.productName }}</div>
                <div class="po-create-meta">
                    <el-tag size="mini" effect="plain">SKU {{ poProduct.sku || '—' }}</el-tag>
                    <span v-if="poProduct.location" class="po-create-chip"><i class="el-icon-location-outline" /> {{ poProduct.location }}</span>
                    <span class="po-create-chip">Stock <b :class="{ 'po-create-low': Number(poProduct.stock) <= 0 }">{{ poProduct.stock != null ? poProduct.stock : '—' }}</b></span>
                </div>
                <div v-if="poProduct.purchase && poProduct.purchase.count" class="po-create-onorder">
                    <i class="el-icon-warning-outline" /> Already on order: <b>{{ poProduct.purchase.orderQty }}</b><span v-if="poProduct.purchase.shippedQty"> · {{ poProduct.purchase.shippedQty }} shipped</span>
                </div>
            </div>

            <el-form label-position="top" size="small" class="po-create-form" @submit.native.prevent>
                <div class="po-create-row">
                    <el-form-item label="Category" class="po-create-col">
                        <el-select v-model="poForm.category" placeholder="Select category" filterable style="width:100%">
                            <el-option v-for="c in poCategories" :key="c" :label="c" :value="c" />
                        </el-select>
                    </el-form-item>
                    <el-form-item label="Order Quantity" class="po-create-col-qty">
                        <el-input-number v-model="poForm.orderQty" :min="1" :precision="0" :step="1" controls-position="right" style="width:100%" placeholder="Qty" />
                    </el-form-item>
                </div>
                <el-form-item label="Note">
                    <el-input v-model="poForm.note" type="textarea" :rows="2" resize="none" maxlength="200" show-word-limit placeholder="Optional — e.g. urgent / specific colour" />
                </el-form-item>
            </el-form>
            <span slot="footer">
                <el-button size="small" @click="poDialogVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" icon="el-icon-check" :loading="poSaving" @click="submitCreatePo">Create PO</el-button>
            </span>
        </el-dialog>
        <!--
            Shared collection create/edit dialog (same component the
            Collections page uses). Only ever opened in Edit mode here —
            `editingCollection` is hydrated by handleEditCollection from
            the detail endpoint before the dialog opens.
        -->
        <collection-form-dialog
            :visible.sync="collectionDialogVisible"
            :collection="editingCollection"
            :scope="scope"
            products-only
            @saved="onCollectionSaved"
        />
    </div>
</template>

<script>
import * as XLSX from 'xlsx-js-style'
import TreePanel from "@/components/TreePanel"
import { getCurrentStock, getSalesTotal, updateItemReorderLevel } from "../../api/zoho/stockMonitoring";
import { getPoByZohoIds, getPoCategories, createPo } from "@/api/purchaseOrder";
import { getCollectionGroups, getCollectionDetail } from "../../api/zoho/products/collection";
import { getProductDetail } from "../../api/zoho/products/product";
import ProductDetailDialog from "@/components/ProductDetailDialog"
import CollectionFormDialog from "@/views/products/collection/CollectionFormDialog.vue"
export default {
    name: "StockMonitoring",
    components: { TreePanel, ProductDetailDialog, CollectionFormDialog },
    data() {
        return {

            open: false,
            loading: false,
            salesLoading: false,
            purchaseLoading: false,
            poCategories: [],
            poDialogVisible: false,
            poProduct: null,
            poForm: { category: '', orderQty: null, note: '' },
            poSaving: false,
            total: 0,
            showSearch: true,
            applyPurchaseFilter: false,
            purchaseFilterType: "",
            currentTab: "",
            duration: 30,
            treeData: [],
            currentCollection: "",
            // Inline reorder-point edit — one row at a time.
            rpEdit: { id: null, value: 0, saving: false },
            // Edit Collection dialog state. `editingCollection` is the
            // full collection document (from /detail/:id) — the tree
            // nodes only carry {label, value} so a fetch is required
            // before the dialog can hydrate.
            collectionDialogVisible: false,
            editingCollection: null,
            collectionDetailLoading: false,
            queryParams: {
                pageNum: 1,
                pageSize: 20,
                sku: undefined,
                productName: undefined,
                search: '',
                category: '',
                quick: '',
            },
            productList: [],
            showProductList: [],
            product: {},
            multipleSelection: [],
        }
    },
    computed: {
        // 'accessories' on the Accessories route (set via route meta); ''
        // on the original Spare Parts route. Drives which collection set
        // the backend reads — same functionality, separate data.
        scope() {
            return (this.$route.meta && this.$route.meta.scope) || ''
        },
        // Accessories has no Tencent-Doc purchase-order integration: the
        // Purchase column and the Create PO action are hidden entirely.
        isAccessories() {
            return this.scope === 'accessories'
        },
        // Distinct categories present in the loaded collection.
        categoryOptions() {
            return [...new Set(this.productList.map(p => p.category).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b))
        },
        zeroStockCount() {
            return this.productList.filter(i => Number(i.stock) <= 0).length
        },
        belowReorderCount() {
            return this.productList.filter(i =>
                Number(i.reorderLevel) > 0 && Number(i.stock) <= Number(i.reorderLevel)).length
        },
        // Dashboard-style count tiles; each doubles as the quick filter.
        tiles() {
            if (this.isAccessories) {
                return [
                    { key: '', label: 'All Items', value: this.productList.length, tone: 'ok', note: 'in this collection' },
                    { key: 'zero', label: 'Zero Stock', value: this.zeroStockCount, tone: 'bad', note: 'physical stock at 0' },
                    { key: 'belowReorder', label: 'Under Reorder', value: this.belowReorderCount, tone: 'warn', note: 'at or below reorder point' }
                ]
            }
            // Spare Parts: purchasing-led buckets. "On order" reads the
            // Tencent order sheet via the Purchase column's data.
            const oos = this.productList.filter(i => Number(i.stock) <= 0)
            return [
                { key: '', label: 'All Items', value: this.productList.length, tone: 'ok', note: 'in this collection' },
                { key: 'zero', label: 'Out of Stock', value: oos.length, tone: 'bad', note: 'stock at 0' },
                { key: 'noOnOrder', label: 'No on Order', value: oos.filter(i => !this.onOrderQty(i)).length, tone: 'bad', note: 'out of stock, nothing ordered' },
                { key: 'onOrder', label: 'On Order', value: this.productList.filter(i => this.onOrderQty(i) > 0).length, tone: 'ok', note: 'on the supplier order sheet' },
                { key: 'underMonth', label: "Under a Month's Cover", value: this.productList.filter(i => this.underMonthCover(i)).length, tone: 'warn', note: 'stock below 30-day sales' }
            ]
        },
        activeTileLabel() {
            const t = this.tiles.find(x => x.key === (this.queryParams.quick || ''))
            return t ? t.label : 'All Items'
        }
    },
    created() {

        this.getCollectionGroup()
    },
    watch: {
        duration() {
            this.handleGetSalesTotal()
        }
    },
    methods: {
        handleGetProductDetail(id) {
            this.loading = true
            const that = this
            getProductDetail(id).then(res => {
                that.product = res
                that.open = true
                that.loading = false
            })
        },
        // ── Edit Collection (in place) ─────────────────────────────
        // Tree nodes only carry {label, value}; the shared dialog needs
        // the full document (rules / products / status / note), so
        // fetch the detail first, then open.
        async handleEditCollection() {
            if (!this.currentCollection || this.collectionDetailLoading) return
            this.collectionDetailLoading = true
            try {
                const res = await getCollectionDetail(this.currentCollection, this.scope)
                if (!res || res.success === false || !res.data) {
                    throw new Error((res && res.message) || 'Failed to load collection')
                }
                this.editingCollection = res.data
                this.collectionDialogVisible = true
            } catch (e) {
                console.error('Load collection detail failed:', e)
                const msg = (e.response && e.response.data && e.response.data.message)
                    || e.message
                    || 'Failed to load collection'
                this.$message.error(msg)
            } finally {
                this.collectionDetailLoading = false
            }
        },
        onCollectionSaved(saved) {
            // Title may have changed — refresh the sidebar tree, which
            // re-reads the groups, keeps the current collection id from
            // the route query, and re-fetches the stock list in its
            // nextTick. That re-fetch also picks up any criteria /
            // product changes, so one call covers everything.
            if (saved && saved.title) {
                this.currentTab = saved.title
            }
            this.getCollectionGroup()
        },
        getCollectionGroup() {
            getCollectionGroups(this.scope).then(res => {
                const groups = res.data || []

                const buildTree = categories => {
                    return categories.map(category => {
                        const node = {
                            label: category.title,
                            children: []
                        }

                        const collectionChildren = (category.collections || []).map(item => ({
                            label: item.title,
                            value: item._id
                        }))

                        const subCategoryChildren = buildTree(category.children || [])

                        node.children = [
                            ...collectionChildren,
                            ...subCategoryChildren
                        ]

                        return node
                    })
                }

                const findFirstCollectionId = categories => {
                    for (const category of categories) {
                        if (category.collections && category.collections.length > 0) {
                            return category.collections[0]._id
                        }

                        if (category.children && category.children.length > 0) {
                            const found = findFirstCollectionId(category.children)

                            if (found) {
                                return found
                            }
                        }
                    }

                    return ''
                }

                this.treeData = buildTree(groups)

                this.currentCollection = this.$route.query.collection ? this.$route.query.collection : findFirstCollectionId(groups)

                // The auto-selected collection (first load / deep link) never
                // goes through handleNodeClick, so resolve its label here too —
                // the page title reads it.
                const findLabel = (nodes, id) => {
                    for (const node of nodes || []) {
                        if (!node.children && node.value === id) return node.label
                        const hit = findLabel(node.children, id)
                        if (hit) return hit
                    }
                    return ''
                }
                this.currentTab = findLabel(this.treeData, this.currentCollection) || this.currentTab

                this.$router.replace({
                    query: {
                        collection: this.currentCollection
                    }
                })
                this.$nextTick(() => {
                    this.getList()
                })
            })
        },
        handleNodeClick(data) {
            if (!data.children) {
                this.currentTab = data.label
                this.currentCollection = data.value
                this.queryParams = {
                    pageNum: 1,
                    pageSize: 20,
                    sku: undefined,
                    productName: undefined,
                    search: '',
                    category: '',
                    quick: '',
                },
                    this.$router.replace({
                        query: {
                            collection: data.value
                        }
                    })
                this.$nextTick(() => {
                    this.$refs.table.clearSort()
                    this.clearSelection()
                    this.getList()
                })
            }
        },
        handleSelectionChange(val) {
            this.multipleSelection = val;
        },
        clearSelection() {
            this.multipleSelection = []

            this.$nextTick(() => {
                this.$refs.productTable && this.$refs.productTable.clearSelection()
            })
        },
        handleGetSalesTotal() {
            const that = this
            that.salesLoading = true
            // Whole list, always: the server reads sales in whole-window
            // Analytics calls, so a big id set costs the same as a page —
            // and the count tiles need every row's sales.
            const itemIds = that.productList.map(product => product.id)

            getSalesTotal({ itemIds: itemIds, duration: that.duration }).then(resp => {

                const salesMap = Object.fromEntries(
                    resp.result.map(item => [
                        item.id,
                        {
                            zohoSales: item.zohoSales || 0,
                            offlineSales: item.offlineSales || 0,
                        }
                    ])
                );

                that.showProductList = that.showProductList.map(item => {
                    const sales = salesMap[item.id] || {
                        zohoSales: 0,
                        offlineSales: 0,
                    };

                    return {
                        ...item,
                        zohoSales: sales.zohoSales,
                        offlineSales: sales.offlineSales,
                    };
                });

                that.productList = that.productList.map(item => {
                    const sales = salesMap[item.id] || {
                        zohoSales: 0,
                        offlineSales: 0,
                    };

                    return {
                        ...item,
                        zohoSales: sales.zohoSales,
                        offlineSales: sales.offlineSales,
                    };
                });

                that.salesLoading = false;

            }).catch(err => {
                that.salesLoading = false
            })
        },
        // Not-yet-received purchases per Zoho item_id, merged onto the rows for
        // the "Purchase" column. Mirrors handleGetSalesTotal's id set.
        // No-op for Accessories — the column doesn't exist there.
        handleGetPurchase() {
            if (this.isAccessories) return
            const that = this
            that.purchaseLoading = true
            // Whole list, always — a Mongo $in on the order sheet, and the
            // On Order tiles need every row's purchase state.
            const itemIds = that.productList.map(product => product.id).filter(Boolean)
            getPoByZohoIds(itemIds).then(resp => {
                const map = (resp && resp.data) || {}
                const merge = list => list.map(item => ({ ...item, purchase: map[item.id] || null }))
                that.showProductList = merge(that.showProductList)
                that.productList = merge(that.productList)
                that.purchaseLoading = false
            }).catch(() => {
                that.purchaseLoading = false
            })
        },
        dhlUrl(t) {
            return `https://www.dhl.com/au-en/home/tracking.html?tracking-id=${encodeURIComponent(t)}&submit=1`
        },
        openCreatePo(row) {
            this.poProduct = row
            this.poForm = { category: '', orderQty: null, note: '' }
            this.poDialogVisible = true
            if (!this.poCategories.length) {
                getPoCategories().then(r => { if (r && r.success) this.poCategories = r.categories || [] }).catch(() => {})
            }
        },
        async submitCreatePo() {
            if (!this.poForm.category) { this.$message.warning('Please select a category.'); return }
            const qty = Number(this.poForm.orderQty)
            if (!Number.isFinite(qty) || qty <= 0) { this.$message.warning('Please enter a quantity.'); return }
            this.poSaving = true
            try {
                const r = await createPo({
                    category: this.poForm.category,
                    orderQty: qty,
                    note: this.poForm.note,
                    sku: this.poProduct.sku,
                    productName: this.poProduct.productName,
                    zoho_id: this.poProduct.id
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                if (r.tencentWritten) {
                    this.$message.success('Purchase order created and added to the Tencent sheet')
                } else {
                    this.$message.warning('Purchase order saved — but it could not be written to the Tencent sheet yet.')
                }
                this.poDialogVisible = false
                this.handleGetPurchase()
            } catch (e) {
                this.$message.error((e.response && e.response.data && e.response.data.message) || e.message || 'Failed to create purchase order')
            } finally {
                this.poSaving = false
            }
        },
        getList() {
            const that = this
            this.loading = true
            const page = this.queryParams.pageNum
            const pageSize = this.queryParams.pageSize
            getCurrentStock({ collection: that.currentCollection, scope: that.scope || undefined }).then(resp => {
                that.productList = resp
                that.total = resp.length
                that.showProductList = resp.slice(
                    (page - 1) * pageSize,
                    page * pageSize
                )
                that.loading = false
                that.$nextTick(() => {
                    that.handleGetSalesTotal()
                    that.handleGetPurchase()
                })
            }).catch(err => {
                that.loading = false
            })
        },
        handleFilterPurchases(type) {
            this.duration = 60
            this.applyPurchaseFilter = true
            this.purchaseFilterType = type
        },
        handlePagination() {
            const that = this
            const page = this.queryParams.pageNum
            const pageSize = this.queryParams.pageSize
            this.showProductList = this.productList.slice(
                (page - 1) * pageSize,
                page * pageSize
            )
        },
        handleSorting({ prop, order }) {
            if (!order) {
                this.queryParams.pageNum = 1
                this.handlePagination()
                return
            }

            this.productList.sort((a, b) => {
                let aValue
                let bValue

                if (prop === 'stock' || prop === 'reorderLevel' || prop === 'accountingStock') {
                    aValue = Number(a[prop] || 0)
                    bValue = Number(b[prop] || 0)
                } else {
                    aValue = String(a[prop] || '').toLowerCase()
                    bValue = String(b[prop] || '').toLowerCase()
                }

                if (aValue > bValue) return order === 'ascending' ? 1 : -1
                if (aValue < bValue) return order === 'ascending' ? -1 : 1

                return 0
            })

            this.queryParams.pageNum = 1

            this.handlePagination()
        },
        // Export dropdown: the filtered view, the whole collection, or (parts
        // only, when rows are ticked) the selection.
        handleExportCommand(command) {
            this.doExport(command === 'selection' ? this.multipleSelection
                : command === 'view' ? this.productList.filter(item => this.matchesFilters(item))
                    : this.productList)
        },
        doExport(exportList) {
            if (!exportList.length) {
                this.$message.warning('No data to export')
                return
            }

            const data = exportList.map(item => ({
                SKU: item.sku || '',
                'Product Name': item.productName || '',
                Location: item.location || '',
                // Accessories carry category + the accounting/physical split.
                ...(this.isAccessories
                    ? {
                        Category: item.category || '',
                        'Accounting Stock': item.accountingStock || 0,
                        'Physical Stock': item.stock || 0,
                        'Reorder Point': item.reorderLevel || 0,
                    }
                    : { 'Current Stock': item.stock || 0 }),
                [`Total Sales (${this.duration} Days)`]: Number(item.zohoSales || 0) + Number(item.offlineSales || 0),
                'Zoho': item.zohoSales || 0,
                'Other': item.offlineSales || 0,
            }))

            const worksheet = XLSX.utils.json_to_sheet(data)

            // Header style
            const headerStyle = {
                font: {
                    bold: true,
                    color: { rgb: 'FFFFFF' },
                    sz: 12
                },
                fill: {
                    fgColor: { rgb: '409EFF' }
                },
                alignment: {
                    horizontal: 'center',
                    vertical: 'center'
                },
                border: {
                    top: { style: 'thin', color: { rgb: 'DCDCDC' } },
                    bottom: { style: 'thin', color: { rgb: 'DCDCDC' } },
                    left: { style: 'thin', color: { rgb: 'DCDCDC' } },
                    right: { style: 'thin', color: { rgb: 'DCDCDC' } },
                }
            }

            // Apply style to first row
            const range = XLSX.utils.decode_range(worksheet['!ref'])

            for (let col = range.s.c; col <= range.e.c; col++) {
                const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })

                if (worksheet[cellAddress]) {
                    worksheet[cellAddress].s = headerStyle
                }
            }

            // Column widths
            worksheet['!cols'] = [
                { wch: 20 },
                { wch: 60 },
                { wch: 20 },
                { wch: 15 },
                { wch: 15 },
                { wch: 15 },
                { wch: 15 },
            ]

            const workbook = XLSX.utils.book_new()

            XLSX.utils.book_append_sheet(
                workbook,
                worksheet,
                'Stock Monitoring'
            )
            const today = new Date().toISOString().split('T')[0]

            const fileName = `${this.currentTab || 'stock-monitoring'}_${today}.xlsx`
            XLSX.writeFile(workbook, fileName)
        },
        // ── tile helpers ──────────────────────────────────────────────
        // Not-yet-received quantity on the supplier order sheet (attached to
        // rows by handleGetPurchase; parts only).
        onOrderQty(item) {
            return (item.purchase && Number(item.purchase.orderQty)) || 0
        },
        // Stock below one month of sales, normalised from the selected
        // sales window. Items with no sales in the window don't count.
        underMonthCover(item) {
            const days = Number(this.duration) || 30
            const pace = ((Number(item.zohoSales) || 0) + (Number(item.offlineSales) || 0)) * (30 / days)
            return pace > 0 && Number(item.stock) < pace
        },
        // The one filter predicate — shared by the table (handleQuery) and
        // "Export current view", so they can never disagree.
        matchesFilters(item) {
            const { sku, productName, search, category, quick } = this.queryParams

            const matchSku = !sku || String(item.sku || '')
                .toLowerCase()
                .includes(String(sku).toLowerCase())

            const matchProductName = !productName || String(item.productName || '')
                .toLowerCase()
                .includes(String(productName).toLowerCase())

            // Accessories' single search box — SKU or name.
            const q = String(search || '').toLowerCase()
            const matchSearch = !q ||
                String(item.sku || '').toLowerCase().includes(q) ||
                String(item.productName || '').toLowerCase().includes(q)

            const matchCategory = !category || item.category === category

            const matchQuick = !quick ||
                (quick === 'zero' ? Number(item.stock) <= 0
                    : quick === 'belowReorder' ? Number(item.reorderLevel) > 0 && Number(item.stock) <= Number(item.reorderLevel)
                        : quick === 'noOnOrder' ? Number(item.stock) <= 0 && !this.onOrderQty(item)
                            : quick === 'onOrder' ? this.onOrderQty(item) > 0
                                : quick === 'underMonth' ? this.underMonthCover(item)
                                    : true)

            return matchSku && matchProductName && matchSearch && matchCategory && matchQuick
        },
        handleQuery() {
            const filteredList = this.productList.filter(item => this.matchesFilters(item))

            this.queryParams.pageNum = 1
            this.total = filteredList.length

            this.showProductList = filteredList.slice(
                0,
                this.queryParams.pageSize
            )
        },
        // ── Inline reorder-point edit (writes back to Zoho) ───────────
        // Enter in the input: blur first so el-input-number commits the
        // typed value into rpEdit.value, then save on the next tick.
        rpEnter(e, row) {
            if (e && e.target && e.target.blur) e.target.blur()
            this.$nextTick(() => this.saveRpEdit(row))
        },
        startRpEdit(row) {
            if (this.rpEdit.saving) return
            this.rpEdit = { id: row.id, value: Number(row.reorderLevel) || 0, saving: false }
        },
        cancelRpEdit() {
            if (this.rpEdit.saving) return
            // Discard the typed value entirely and close the input — the
            // row keeps showing its saved reorder point.
            this.rpEdit = { id: null, value: 0, saving: false }
        },
        async saveRpEdit(row) {
            if (this.rpEdit.saving) return
            const value = Math.max(0, Math.floor(Number(this.rpEdit.value) || 0))
            if (value === (Number(row.reorderLevel) || 0)) { this.cancelRpEdit(); return }
            this.rpEdit.saving = true
            try {
                const r = await updateItemReorderLevel(row.id, value)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                // The visible row and the master list hold separate objects
                // after the sales merge — update both by id.
                this.$set(row, 'reorderLevel', r.reorderLevel)
                const master = this.productList.find(p => p.id === row.id)
                if (master) this.$set(master, 'reorderLevel', r.reorderLevel)
                this.$message.success(`Reorder point saved to Zoho (${r.reorderLevel})`)
                // Reset directly — cancelRpEdit refuses to run mid-save (its
                // guard protects against a stray cross-click while saving).
                this.rpEdit = { id: null, value: 0, saving: false }
            } catch (e) {
                this.$message.error((e && e.message) || 'Failed to update the reorder point')
                this.rpEdit.saving = false
            }
        },
        pickTile(key) {
            // Clicking the active tile clears it, same as picking All.
            this.queryParams.quick = this.queryParams.quick === key ? '' : key
            this.handleQuery()
        },
        resetQuery() {
            this.queryParams = {
                pageNum: 1,
                pageSize: 20,
                sku: undefined,
                productName: undefined,
                search: '',
                category: '',
                quick: '',
            }

            this.total = this.productList.length

            this.showProductList = this.productList.slice(
                0,
                this.queryParams.pageSize
            )
        }
    }
}
</script>

<style scoped>
.app-container {
    height: 100%;
}

/* ── Accessories: Stock-Dashboard-style chrome (classes mirror
      stockDashboard.vue so the two pages read as one family) ── */
.sd-spacer {
    flex: 1;
}

.sd-dim {
    color: #909399;
    font-size: 12px;
}

.sd-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
}

.sd-title h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: #303133;
    line-height: 1.2;
}

.sd-asof {
    margin-top: 4px;
    font-size: 12px;
    color: #909399;
}

.sd-filters {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 14px;
}

.sd-search {
    width: 260px;
}

.sd-sel-wide {
    width: 260px;
}

.sd-tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 14px;
}

/* Spare Parts carries five tiles */
.sd-tiles-5 {
    grid-template-columns: repeat(5, minmax(0, 1fr));
}

.sd-tile {
    background: #fff;
    border: 1px solid #e6ebf5;
    border-radius: 4px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    cursor: pointer;
    transition: border-color .15s, box-shadow .15s;
}

.sd-tile:hover {
    border-color: #b3d8ff;
}

.sd-tile.on {
    box-shadow: 0 0 0 1px #1890ff inset;
    border-color: #1890ff;
}

.sd-tile-label {
    font-size: 12px;
    color: #909399;
}

.sd-tile-value {
    font-size: 26px;
    font-weight: 600;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    color: #303133;
}

.sd-tile-note {
    font-size: 11px;
    color: #c0c4cc;
}

.sd-tile.tone-bad {
    background: #fef0f0;
    border-color: #fbc4c4;
}

.sd-tile.tone-bad .sd-tile-label {
    color: #ff4949;
    font-weight: 600;
}

.sd-tile.tone-bad .sd-tile-value {
    color: #ff4949;
}

.sd-tile.tone-bad .sd-tile-note {
    color: #f89898;
}

.sd-tile.tone-bad.on {
    border-color: #ff4949;
    box-shadow: 0 0 0 1px #ff4949 inset;
}

.sd-tile.tone-warn .sd-tile-value {
    color: #e6a23c;
}

.sd-card {
    background: #fff;
    border: 1px solid #e6ebf5;
    border-radius: 4px;
    overflow: hidden;
}

.sd-card-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 14px;
    border-bottom: 1px solid #ebeef5;
}

.sd-card-title {
    font-size: 13px;
    font-weight: 600;
    color: #303133;
}

/* Stacked stock cell (accessories): Physical over Accounting */
.stock-line {
    font-size: 12px;
    line-height: 1.6;
    color: #303133;
}

.stock-line b {
    font-size: 13px;
}

.stock-label {
    color: #909399;
    margin-right: 4px;
}

/* Accounting disagrees with physical — worth a look */
.stock-diff {
    color: #E6A23C;
    font-weight: 600;
}

/* Reorder Point column: red when stock is at or below the point */
.rp-below {
    color: #F56C6C;
    font-weight: 600;
}

.rp-none {
    color: #C0C4CC;
}

/* Click-to-edit reorder point. The pencil is absolutely positioned so
   it takes no layout space — the number stays truly centred whether the
   icon is visible or not. */
.rp-view {
    cursor: pointer;
    position: relative;
    text-align: center;
}

.rp-view .rp-pencil {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    color: #c0c4cc;
    opacity: 0;
    transition: opacity .15s;
}

.rp-view:hover .rp-pencil {
    opacity: 1;
    color: #409EFF;
}

.rp-edit {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
}

.rp-input {
    width: 70px;
}

.rp-save {
    color: #67C23A;
    padding: 2px;
}

.rp-cancel {
    color: #909399;
    padding: 2px;
}

.content-inner {
    /* display: flex; */
    /* flex-direction: column; */
}

.tree-sidebar-content>>>.el-table {
    overflow-y: scroll;
    position: relative;
}

.tree-sidebar-content>>>.el-table__header-wrapper {
    position: sticky;
    top: 0;
    z-index: 999;
}

.product-cell {
    line-height: 1.35;
    text-align: left;
}

.product-name-link {
    display: inline-block;
    font-weight: 500;
    color: #409eff;
    text-decoration: underline;
    white-space: normal;
    word-break: break-word;
}

.product-name-link:hover {
    color: #66b1ff;
}

.product-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    margin-top: 3px;
    font-size: 12px;
    color: #909399;
}

.product-meta .p-loc i {
    margin-right: 2px;
}

.product-meta .p-cat i {
    margin-right: 2px;
}

.purchase-cell {
    line-height: 1.5;
    text-align: left;
    display: inline-block;
    font-size: 12px;
}
.purchase-line {
    color: #303133;
    white-space: nowrap;
}
.purchase-label {
    color: #909399;
}
.purchase-line a {
    color: #409eff;
    text-decoration: underline;
}
.purchase-line a:hover {
    color: #66b1ff;
}
.purchase-none {
    color: #c0c4cc;
}
.po-create-head {
    font-size: 15px;
    font-weight: 600;
    color: #303133;
}
.po-create-head i {
    color: #409eff;
    margin-right: 6px;
}
.po-create-card {
    background: #f5f7fa;
    border: 1px solid #ebeef5;
    border-radius: 6px;
    padding: 12px 14px;
    margin-bottom: 18px;
}
.po-create-name {
    font-weight: 600;
    font-size: 14px;
    color: #303133;
    line-height: 1.4;
}
.po-create-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
    margin-top: 8px;
    font-size: 12px;
    color: #909399;
}
.po-create-chip i {
    margin-right: 2px;
}
.po-create-meta b {
    color: #303133;
    margin-left: 2px;
}
.po-create-low {
    color: #F56C6C;
}
.po-create-onorder {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px dashed #dcdfe6;
    font-size: 12px;
    color: #E6A23C;
}
.po-create-form ::v-deep .el-form-item {
    margin-bottom: 16px;
}
.po-create-form ::v-deep .el-form-item__label {
    padding-bottom: 2px;
    line-height: 1.4;
    color: #606266;
}
.po-create-row {
    display: flex;
    gap: 14px;
}
.po-create-col {
    flex: 1;
    min-width: 0;
}
.po-create-col-qty {
    width: 150px;
    flex: none;
}

.sales-cell {
    padding: 6px 0;
    text-align: center;
}

.sales-total {
    font-size: 20px;
    font-weight: 700;
    color: #303133;
    line-height: 1.2;
}

.sales-breakdown {
    margin-top: 4px;
    display: flex;
    justify-content: center;
    gap: 8px;
    font-size: 12px;
    color: #909399;
    white-space: nowrap;
}

.sales-breakdown span {
    background: #f5f7fa;
    border: 1px solid #ebeef5;
    border-radius: 4px;
    padding: 2px 6px;
}

.el-dropdown {
    vertical-align: top;
}

.el-dropdown+.el-dropdown {
    margin-left: 15px;
}

.el-icon-arrow-down {
    font-size: 12px;
}
</style>