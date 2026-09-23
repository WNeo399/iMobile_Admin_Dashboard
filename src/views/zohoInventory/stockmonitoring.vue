<template>
    <div class="app-container tree-sidebar-manage-wrap">
        <!-- Parts: short labels fit a narrower panel; collapsed by default
             with accordion (opening one brand closes the others). Its own
             storage key so the old saved width doesn't override the new
             default. Accessories keeps the previous behaviour. -->
        <!-- Browse mode swaps the collection tree for the register's own
             Brand → Series → Classification tree; clicking any node lists
             it (the arrow expands), so clicks must not toggle expansion. -->
        <tree-panel title="Category" :tree-data="browse ? browseTree : treeData" search-placeholder="Please Enter Categiry"
            :storage-key="isAccessories ? 'dept-sidebar-width' : 'stock-tree-width'"
            :default-width="isAccessories ? 228 : 180"
            :defaultExpandAll="isAccessories" :accordion="!isAccessories && !browse"
            :expand-on-click-node="!browse" ref="deptTreeRef"
            @node-click="handleNodeClick">
            <!-- The Dashboard tab, pinned above the category tree. Spare
                 Parts only — the Accessories page keeps the plain tree. -->
            <template v-if="!isAccessories" #top>
                <div :class="['dash-tab', { on: viewMode === 'dashboard' }]" @click="openDashboard">
                    <i class="el-icon-odometer" /> Dashboard
                </div>
                <!-- The 海运 (sea freight) list — a pinned-products collection
                     kept out of the category tree and surfaced here instead. -->
                <div v-if="seaFreightId" :class="['dash-tab', { on: isSeaView }]" @click="openSeaFreight">
                    <i class="el-icon-ship" /> 海运
                </div>
                <!-- Browse = every part by its own fields (Brand → Series →
                     Classification), counted from the register; Collections =
                     the hand-made lists. Remembered per browser. -->
                <div class="sm-mode">
                    <span :class="['sm-mode-btn', { on: sideMode === 'browse' }]" @click="switchSideMode('browse')">
                        <i class="el-icon-s-grid" /> Browse</span>
                    <span :class="['sm-mode-btn', { on: sideMode === 'collections' }]" @click="switchSideMode('collections')">
                        <i class="el-icon-folder-opened" /> Collections</span>
                </div>
            </template>
            <!-- Whole-tree rearrangement — the same group manager the
                 Collections page uses. -->
            <template #actions>
                <el-tooltip v-if="!browse" content="Manage folders" placement="right">
                    <i v-hasPermi="['zoho:collection:view']" class="tree-action-icon el-icon-setting"
                        @click="openGroupDialog" />
                </el-tooltip>
            </template>
            <!-- Custom node row: label + a hover ⋯ menu for in-place
                 collection management (edit/copy/move/delete, and folder
                 ops). Replaces TreePanel's default node, so the icon and
                 label are re-rendered here. -->
            <template #node="{ node, data }">
                <i :class="data.children && data.children.length ? 'el-icon-folder' : 'el-icon-document'"
                    class="tn-icon" />
                <span class="tn-label" :title="node.label">{{ node.label }}</span>
                <!-- Browse nodes carry a count and no menu. -->
                <span v-if="data.browse" class="tn-count">{{ data.count.toLocaleString() }}</span>
                <el-dropdown v-else v-hasPermi="['zoho:collection:view']" trigger="click" size="small"
                    class="tn-menu" @command="cmd => treeMenu(cmd, data)">
                    <i class="el-icon-more tn-menu-icon" @click.stop />
                    <el-dropdown-menu slot="dropdown">
                        <template v-if="data.value">
                            <el-dropdown-item command="edit" icon="el-icon-edit">Edit</el-dropdown-item>
                            <el-dropdown-item command="delete" icon="el-icon-delete" divided>Delete</el-dropdown-item>
                        </template>
                        <template v-else>
                            <el-dropdown-item command="newCollection" icon="el-icon-plus">New Collection</el-dropdown-item>
                            <!-- The tree is capped at three levels (brand →
                                 part type → collections), so only top-level
                                 folders can grow a sub-folder. -->
                            <el-dropdown-item v-if="(data.path || []).length < 2" command="newFolder"
                                icon="el-icon-folder-add">New Sub-folder</el-dropdown-item>
                            <el-dropdown-item command="renameFolder" icon="el-icon-edit-outline">Rename</el-dropdown-item>
                            <!-- Only an empty folder can go — no point
                                 offering Delete on one that can't. -->
                            <el-dropdown-item v-if="canDeleteFolder(data)" command="deleteFolder"
                                icon="el-icon-delete" divided>Delete</el-dropdown-item>
                        </template>
                    </el-dropdown-menu>
                </el-dropdown>
            </template>
        </tree-panel>
        <div class="tree-sidebar-content">
            <!-- Dashboard view: the snapshot dashboard embedded whole.
                 v-if (not v-show) so its data loads only when opened. -->
            <div v-if="viewMode === 'dashboard'" class="content-inner">
                <stock-dashboard embedded />
            </div>
            <div v-else class="content-inner">
                <!-- ── Stock-Dashboard-style main section (both scopes) —
                     header, one search box, clickable count tiles. Only the
                     tile set and the Category filter differ per scope; the
                     items table below keeps its per-scope columns. ── -->
                <div class="sd-head">
                    <div class="sd-title">
                        <!-- Breadcrumb title: the tree path, leaf emphasised. -->
                        <h2 v-if="currentPath.length > 1" class="sd-crumbs">
                            <template v-for="(p, i) in currentPath">
                                <span :key="'c' + i" :class="i === currentPath.length - 1 ? 'crumb-leaf' : 'crumb'">{{ p }}</span>
                                <i v-if="i < currentPath.length - 1" :key="'s' + i" class="el-icon-arrow-right crumb-sep" />
                            </template>
                        </h2>
                        <h2 v-else>{{ currentTab || (isAccessories ? 'Accessories' : 'Spare Parts') }}</h2>
                        <div class="sd-asof">{{ asOfText }}</div>
                    </div>
                    <div class="sd-spacer" />
                    <!-- Editing targets ONE collection — hidden on a branch
                         view, where several are merged. -->
                    <el-button v-if="!subOptions.length && !browse" v-hasPermi="['zoho:collection:view']" size="small"
                        plain type="primary" icon="el-icon-plus" :loading="collectionDetailLoading"
                        :disabled="!currentCollection" @click="handleEditCollection">Add Product</el-button>
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
                    <!-- Browse mode: narrow the node by quality, or by series /
                         compatible model — one cascader, Series › Model, multi-
                         pick; a series on its own means the whole series. The
                         counts are this node's. -->
                    <el-select v-if="browse" v-model="browseQuery.quality" size="small" clearable filterable
                        placeholder="Quality" class="sd-sel" @change="handleQuery">
                        <el-option v-for="q in browseState.qualities" :key="q.value || '__none__'"
                            :label="`${q.value || '(no quality)'} (${q.count.toLocaleString()})`" :value="q.value || '__none__'" />
                    </el-select>
                    <el-cascader v-if="browse" v-model="browseQuery.models" size="small" clearable filterable collapse-tags
                        class="sd-casc" placeholder="Series / compatible model" :options="browseState.seriesModels"
                        :props="{ multiple: true, checkStrictly: true, emitPath: true }" @change="handleQuery" />
                    <el-select v-if="isAccessories" v-model="queryParams.category" size="small" clearable filterable
                        placeholder="Category" class="sd-sel-wide" @change="handleQuery">
                        <el-option v-for="c in categoryOptions" :key="c" :label="c" :value="c" />
                    </el-select>
                    <!-- Branch view only: narrow the merged list to one of
                         the child collections. -->
                    <el-select v-if="!isAccessories && subOptions.length" v-model="queryParams.subCol"
                        size="small" clearable filterable placeholder="Category" class="sd-sel-wide"
                        @change="handleQuery">
                        <el-option v-for="o in subOptions" :key="o.value" :label="o.label" :value="o.value" />
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
                    <el-button v-if="hiddenCount || showHidden" type="text" size="mini"
                        @click="toggleShowHidden">{{ showHidden ? 'Back to list' : `${hiddenCount} hidden — view` }}</el-button>
                    <el-button v-if="queryParams.quick && !showHidden" type="text" size="mini" @click="pickTile('')">Clear filter</el-button>
                </div>
                <el-table v-loading="loading" :data="showProductList" @selection-change="handleSelectionChange"
                    @sort-change="handleSorting" ref="table" empty-text="No Data" stripe border row-key="id">
                    <el-table-column v-if="!isAccessories" type="selection" width="50" align="center" :reserve-selection="true" />
                    <el-table-column label="Product" align="left" header-align="center" key="product"
                        min-width="300" sortable="custom" prop="productName">
                        <template slot-scope="scope">
                            <div class="product-cell">
                                <!-- Main Zoho image — its URL comes with the row
                                     (no per-row call). Click opens the viewer. -->
                                <product-thumb :src="scope.row.imageUrl" :item-id="String(scope.row.id)" :size="44" />
                                <div class="product-text">
                                    <a class="product-name-link"
                                        :href="`https://inventory.zoho.com/app/746138234#/inventory/items/${scope.row.id}`"
                                        target="_blank" rel="noopener" :title="scope.row.productName">{{ scope.row.productName }}</a>
                                    <div class="product-meta">
                                        <span v-if="scope.row.sku" class="p-sku p-sku-copy" title="Click to copy SKU"
                                            @click.stop="copySku(scope.row.sku)">SKU: {{ scope.row.sku }}</span>
                                        <span v-else class="p-sku">SKU: —</span>
                                        <span v-if="scope.row.location" class="p-loc"><i class="el-icon-location-outline" /> {{ scope.row.location }}</span>
                                        <!-- Same signal as the dashboard's ship button: green = in
                                             海运, grey = not; click toggles membership. -->
                                        <el-tooltip v-if="!isAccessories" placement="top"
                                            :content="scope.row.seaFreight ? 'Remove from 海运' : 'Add to 海运'">
                                            <span :class="['p-sea-btn', { on: scope.row.seaFreight }]"
                                                @click.stop="toggleSeaItem(scope.row)"><i class="el-icon-ship" /> 海运</span>
                                        </el-tooltip>
                                        <span v-if="scope.row.category" class="p-cat"><i class="el-icon-collection-tag" /> {{ scope.row.category }}</span>
                                    </div>
                                </div>
                            </div>
                        </template>
                    </el-table-column>
                    <!-- Spare parts: the register's figure, replaced by Zoho's
                         current one for the rows on this page. -->
                    <el-table-column v-if="!isAccessories" label="Current Stock" align="center" key="stock" prop="stock" width="140"
                        sortable="custom" :show-overflow-tooltip="true" />

                    <!-- Accessories show Zoho's two stock figures stacked in one
                         column: Accounting (invoice-driven) over Physical
                         (shipment-driven, the shelf reality — sorting uses it).
                         Accounting turns amber when the two disagree. -->
                    <el-table-column v-if="isAccessories" label="Stock" align="center" key="accStock"
                        prop="stock" width="140" sortable="custom">
                        <template slot-scope="scope">
                            <div class="stock-line">
                                <span class="stock-label">Acct</span>
                                <span :class="{ 'stock-diff': Number(scope.row.accountingStock) !== Number(scope.row.stock) }">{{ scope.row.accountingStock }}</span>
                            </div>
                            <div class="stock-line"><span class="stock-label">Physical</span> <b>{{ scope.row.stock }}</b></div>
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

                                <!-- Spare parts offer the windows the register
                                     stores; Accessories (still read live) keep
                                     the old set. -->
                                <el-select v-model="duration" placeholder="Filter" size="mini" style="width:60px">
                                    <el-option v-for="d in durationOptions" :key="d" :label="String(d)" :value="d" />
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

                    <!-- Open Spare Parts Purchase lines — Spare Parts only -->
                    <el-table-column v-if="!isAccessories" label="Purchase" align="center" key="purchase" width="180">
                        <template slot-scope="scope">
                            <i v-if="purchaseLoading" class="el-icon-loading"></i>
                            <div v-else-if="onOrderQty(scope.row) > 0" class="purchase-cell">
                                <div class="purchase-line"><span class="purchase-label">On order:</span> <b>{{ onOrderQty(scope.row) }}</b></div>
                                <div v-if="scope.row.purchase.shipped" class="purchase-line"><span class="purchase-label">Shipped:</span> <b>{{ scope.row.purchase.shipped }}</b></div>
                                <div v-for="t in scope.row.purchase.trackings" :key="t" class="purchase-line">
                                    <span class="purchase-label">DHL:</span> <a :href="dhlUrl(t)" target="_blank" rel="noopener">{{ t }}</a>
                                </div>
                            </div>
                            <span v-else class="purchase-none">-</span>
                        </template>
                    </el-table-column>

                    <el-table-column label="Operation" align="center" width="240"
                        class-name="small-padding fixed-width">
                        <template slot-scope="scope" v-if="scope.row.userId !== 1">
                            <el-button size="mini" type="text" icon="el-icon-edit"
                                @click="handleGetProductDetail(scope.row.id)">View Detail</el-button>
                            <el-button v-if="!isAccessories && !showHidden" size="mini" type="text" icon="el-icon-shopping-cart-2"
                                @click="openCreatePo(scope.row)">Create PO</el-button>
                            <el-button v-if="showHidden" size="mini" type="text" icon="el-icon-view"
                                @click="unhideItem(scope.row)">Unhide</el-button>
                            <!-- The row leaves the list (and its tile counts);
                                 restore via "N hidden — view". -->
                            <el-button v-if="!isAccessories && !showHidden" size="mini" type="text"
                                icon="el-icon-remove-outline" class="sm-hide-op"
                                @click="hideItem(scope.row)">Hide</el-button>
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
                <div v-if="onOrderQty(poProduct) > 0" class="po-create-onorder">
                    <i class="el-icon-warning-outline" /> Already on order: <b>{{ onOrderQty(poProduct) }}</b><span v-if="poProduct.purchase.shipped"> · {{ poProduct.purchase.shipped }} shipped</span>
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
            :products-only="dialogProductsOnly"
            @saved="onCollectionSaved"
        />

        <!-- Whole-tree group manager (shared with the Collections page). -->
        <CollectionGroupDialog :visible.sync="groupDialogVisible" :scope="scope" />
    </div>
</template>

<script>
import * as XLSX from 'xlsx-js-style'
import TreePanel from "@/components/TreePanel"
import { getCurrentStock, getSalesTotal, updateItemReorderLevel, hideStockItems, unhideStockItem, getSeaFreight, addSeaFreightItems, removeSeaFreightItem } from "../../api/zoho/stockMonitoring";
// Purchases run in Spare Parts Purchase (the Tencent sheet was retired
// 2026-09-23): the Purchase column reads its open lines, Create PO adds one.
import { createOrders, purchasesByItemIds } from "@/api/sparePartsPurchase";
import { CATEGORIES as PO_CATEGORIES } from "../sparePartsPurchase/shared";
import { getCollectionGroups, getCollectionDetail, updateCollectionGroups, deleteCollection } from "../../api/zoho/products/collection";
import CollectionGroupDialog from "@/views/products/collection/CollectionGroup/collectionGroup.vue"
import { orderedEntries, isFolderEntry } from "@/utils/collectionGroupOrder"
import { getProductDetail } from "../../api/zoho/products/product";
// Spare parts read the stock register (2026-09-22) — one call for a
// collection's rows and their sales windows — and overlay live stock on the
// rows shown. Accessories still read Zoho live through getCurrentStock.
import { getStockCollectionItems, getLiveStock, getBrowseTree, getBrowseItems } from "@/api/stockMonitor";
import ProductDetailDialog from "@/components/ProductDetailDialog"
import ProductThumb from "@/components/ProductThumb"
import CollectionFormDialog from "@/views/products/collection/CollectionFormDialog.vue"
import StockDashboard from "./stockDashboard.vue"
export default {
    name: "StockMonitoring",
    components: { TreePanel, ProductDetailDialog, CollectionFormDialog, StockDashboard, CollectionGroupDialog, ProductThumb },
    data() {
        return {
            // 'dashboard' shows the embedded snapshot dashboard in the
            // content area; 'list' the per-collection stock table. The
            // page lands on the dashboard (see created), and picking a
            // category in the tree switches to the list.
            viewMode: 'list',

            open: false,
            loading: false,
            salesLoading: false,
            purchaseLoading: false,
            poCategories: PO_CATEGORIES,
            poDialogVisible: false,
            poProduct: null,
            poForm: { category: '', orderQty: null, note: '' },
            poSaving: false,
            total: 0,
            showSearch: true,
            applyPurchaseFilter: false,
            purchaseFilterType: "",
            currentTab: "",
            // Breadcrumb for the title — the tree path down to the picked
            // collection, e.g. ['iPhone', 'Screen', 'SVP'].
            currentPath: [],
            duration: 30,
            // When the register's numbers were taken (parts only) — the
            // header says so.
            asOf: { snapshotDate: null, metricsAt: null },
            liveSeq: 0,
            // Browse mode (parts): the catalogue by its own fields. The
            // sidebar mode is remembered per browser; browseSel is the
            // picked node's { brand, series, classification, sub }; the
            // list is server-paged, so productList holds one page and the
            // tiles / hidden count / quality breakdown come with it.
            sideMode: 'collections',
            browseTree: [],
            browseTreeLoading: false,
            browseSel: null,
            browseSeq: 0,
            // browseQuery.models holds cascader paths: [series] = the whole
            // series, [series, model] = one model (any of them matches).
            browseQuery: { quality: '', models: [], sort: '', order: '' },
            browseState: { tiles: null, hiddenCount: 0, qualities: [], seriesModels: [] },
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
            // Add Product opens the dialog in products-only mode; the tree's
            // Edit / New Collection open the full form.
            dialogProductsOnly: true,
            // In-tree collection management: the raw group docs (the tree
            // is a projection of these; every mutation rewrites them).
            rawGroups: [],
            groupDialogVisible: false,
            // Folder id a newly created collection should land in.
            creatingInFolder: null,
            queryParams: {
                pageNum: 1,
                pageSize: 20,
                sku: undefined,
                productName: undefined,
                search: '',
                category: '',
                quick: '',
                // In a branch (aggregate) view: narrow to one child
                // collection's items (matched via each row's memberOf).
                subCol: ''
            },
            // The child collections of the open branch — the sub-category
            // filter's options. Empty outside a branch view.
            subOptions: [],
            productList: [],
            showProductList: [],
            // false = the normal list (hidden rows excluded everywhere,
            // tiles included); true = the review view of ONLY hidden rows,
            // each with an Unhide button.
            showHidden: false,
            // The 海运 collection's Mongo id — loaded once; '' until known
            // (the tab renders only when it is).
            seaFreightId: '',
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
        // Accessories are not bought through Spare Parts Purchase: the
        // Purchase column and the Create PO action are hidden entirely.
        isAccessories() {
            return this.scope === 'accessories'
        },
        browse() {
            return this.sideMode === 'browse' && !this.isAccessories
        },
        // Distinct categories present in the loaded collection.
        categoryOptions() {
            return [...new Set(this.productList.map(p => p.category).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b))
        },
        // The rows the search / category filters allow — what the tiles
        // count over, so their numbers follow the filters live.
        baseFilteredList() {
            return this.productList.filter(i => this.matchesBaseFilters(i))
        },
        zeroStockCount() {
            return this.baseFilteredList.filter(i => Number(i.stock) <= 0).length
        },
        belowReorderCount() {
            return this.baseFilteredList.filter(i =>
                Number(i.reorderLevel) > 0 && Number(i.stock) <= Number(i.reorderLevel)).length
        },
        // Dashboard-style count tiles; each doubles as the quick filter.
        tiles() {
            const base = this.baseFilteredList
            if (this.isAccessories) {
                return [
                    { key: '', label: 'All Items', value: base.length, tone: 'ok', note: 'matching the filters' },
                    { key: 'zero', label: 'Zero Stock', value: this.zeroStockCount, tone: 'bad', note: 'physical stock at 0' },
                    { key: 'belowReorder', label: 'Under Reorder', value: this.belowReorderCount, tone: 'warn', note: 'at or below reorder point' }
                ]
            }
            // Browse mode: the counts came with the page, over the whole node.
            if (this.browse) {
                const t = this.browseState.tiles || {}
                return [
                    { key: '', label: 'All Items', value: t.all || 0, tone: 'ok', note: 'in this category' },
                    { key: 'zero', label: 'Out of Stock', value: t.zero || 0, tone: 'bad', note: 'stock at 0' },
                    { key: 'noOnOrder', label: 'No on Order', value: t.noOnOrder || 0, tone: 'bad', note: 'out of stock, nothing ordered' },
                    { key: 'onOrder', label: 'On Order', value: t.onOrder || 0, tone: 'ok', note: 'open in Spare Parts Purchase' },
                    { key: 'underMonth', label: "Under a Month's Cover", value: t.underMonth || 0, tone: 'warn', note: `stock below ${this.duration}-day sales` }
                ]
            }
            // Spare Parts: purchasing-led buckets. "On order" reads the open
            // Spare Parts Purchase lines via the Purchase column's data.
            const oos = base.filter(i => Number(i.stock) <= 0)
            return [
                { key: '', label: 'All Items', value: base.length, tone: 'ok', note: 'matching the filters' },
                { key: 'zero', label: 'Out of Stock', value: oos.length, tone: 'bad', note: 'stock at 0' },
                { key: 'noOnOrder', label: 'No on Order', value: oos.filter(i => !this.onOrderQty(i)).length, tone: 'bad', note: 'out of stock, nothing ordered' },
                { key: 'onOrder', label: 'On Order', value: base.filter(i => this.onOrderQty(i) > 0).length, tone: 'ok', note: 'open in Spare Parts Purchase' },
                { key: 'underMonth', label: "Under a Month's Cover", value: base.filter(i => this.underMonthCover(i)).length, tone: 'warn', note: 'stock below 30-day sales' }
            ]
        },
        activeTileLabel() {
            if (this.showHidden) return 'Hidden Items'
            const t = this.tiles.find(x => x.key === (this.queryParams.quick || ''))
            return t ? t.label : 'All Items'
        },
        hiddenCount() {
            if (this.browse) return this.browseState.hiddenCount || 0
            return this.productList.filter(i => i.hidden).length
        },
        isSeaView() {
            return !!this.seaFreightId && this.currentCollection === this.seaFreightId
        },
        // The sales windows on offer: the four the register stores for
        // parts; the live read's five for accessories.
        durationOptions() {
            return this.isAccessories ? [15, 30, 45, 60, 90] : [7, 14, 30, 90]
        },
        asOfText() {
            const n = `${(this.browse ? this.total : this.productList.length).toLocaleString()} items`
            if (this.isAccessories) return `live from Zoho · ${n}`
            if (!this.asOf.metricsAt) return n
            const mins = Math.max(0, Math.round((Date.now() - new Date(this.asOf.metricsAt).getTime()) / 60000))
            const age = mins < 60 ? `${mins} min ago` : mins < 48 * 60 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} days ago`
            return `counted ${age} · ${n}`
        }
    },
    created() {
        // Land on the Dashboard tab unless a deep link names a collection.
        // Accessories has no Dashboard tab and keeps the old first-category
        // landing.
        if (!this.isAccessories && !this.$route.query.collection) {
            this.viewMode = 'dashboard'
        }
        this.getCollectionGroup()
        if (!this.isAccessories) {
            this.loadSeaFreight()
            try {
                if (localStorage.getItem('stock-side-mode') === 'browse' || this.$route.query.browse) this.sideMode = 'browse'
            } catch (e) { /* the default stands */ }
            if (this.sideMode === 'browse') this.loadBrowseTree()
        }
    },
    watch: {
        duration() {
            if (this.isAccessories) this.handleGetSalesTotal()
            // Browse: the Under-a-Month tile follows the window — re-ask.
            else if (this.browse) this.loadBrowse()
            else this.applyStoredSales()
        },
        // The group manager saves inside its own dialog — re-read the tree
        // when it closes so any rearrangement shows immediately.
        groupDialogVisible(open) {
            if (!open) this.getCollectionGroup()
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
            this.dialogProductsOnly = true
            this.creatingInFolder = null
            try {
                await this.openCollectionEditor(this.currentCollection)
            } catch (e) {
                console.error('Load collection detail failed:', e)
                const msg = (e.response && e.response.data && e.response.data.message)
                    || e.message
                    || 'Failed to load collection'
                this.$message.error(msg)
            }
        },
        async onCollectionSaved(saved) {
            // Title may have changed — refresh the sidebar tree, which
            // re-reads the groups, keeps the current collection id from
            // the route query, and re-fetches the stock list in its
            // nextTick. That re-fetch also picks up any criteria /
            // product changes, so one call covers everything.
            if (saved && saved.title) {
                this.currentTab = saved.title
            }
            try {
                if (saved && saved._id) {
                    const copy = { ...saved, _id: String(saved._id) }
                    if (this.creatingInFolder) {
                        // A create from the tree — land it in its folder.
                        const folder = this.findFolder(this.rawGroups, this.creatingInFolder)
                        if (folder) {
                            folder.collections = folder.collections || []
                            folder.collections.push(copy)
                        }
                        this.creatingInFolder = null
                        await updateCollectionGroups(this.rawGroups, this.scope)
                    } else {
                        // An edit — keep the tree's embedded copy in step so
                        // a rename can't leave a stale title behind.
                        const existing = this.findCopy(this.rawGroups, saved._id)
                        if (existing) {
                            Object.assign(existing, copy)
                            await updateCollectionGroups(this.rawGroups, this.scope)
                        }
                    }
                }
            } catch (e) {
                console.error('Group write-back failed:', e)
            }
            this.getCollectionGroup()
        },
        // ── in-tree collection management ────────────────────────────
        openGroupDialog() {
            this.groupDialogVisible = true
        },
        canDeleteFolder(data) {
            const folder = this.findFolder(this.rawGroups, data.fid)
            return !!folder && !(folder.collections || []).length && !(folder.children || []).length
        },
        findFolder(nodes, fid) {
            for (const n of nodes || []) {
                if (String(n._id) === String(fid)) return n
                const hit = this.findFolder(n.children, fid)
                if (hit) return hit
            }
            return null
        },
        findCopy(nodes, colId) {
            for (const n of nodes || []) {
                const c = (n.collections || []).find(x => String(x._id) === String(colId))
                if (c) return c
                const hit = this.findCopy(n.children, colId)
                if (hit) return hit
            }
            return null
        },
        // Remove a collection's embedded copy from whichever folder holds
        // it; returns the copy (for re-homing) or null.
        pluckCopy(nodes, colId) {
            for (const n of nodes || []) {
                const i = (n.collections || []).findIndex(c => String(c._id) === String(colId))
                if (i !== -1) return n.collections.splice(i, 1)[0]
                const hit = this.pluckCopy(n.children, colId)
                if (hit) return hit
            }
            return null
        },
        removeFolder(nodes, fid) {
            const i = (nodes || []).findIndex(n => String(n._id) === String(fid))
            if (i !== -1) { nodes.splice(i, 1); return true }
            for (const n of nodes || []) {
                if (n.children && this.removeFolder(n.children, fid)) return true
            }
            return false
        },
        async saveGroups() {
            await updateCollectionGroups(this.rawGroups, this.scope)
            this.getCollectionGroup()
        },
        async openCollectionEditor(id) {
            this.collectionDetailLoading = true
            try {
                const res = await getCollectionDetail(id, this.scope)
                if (!res || res.success === false || !res.data) {
                    throw new Error((res && res.message) || 'Failed to load collection')
                }
                this.editingCollection = res.data
                this.collectionDialogVisible = true
            } finally {
                this.collectionDetailLoading = false
            }
        },
        async treeMenu(cmd, data) {
            try {
                if (cmd === 'edit') {
                    this.dialogProductsOnly = false
                    this.creatingInFolder = null
                    await this.openCollectionEditor(data.value)
                } else if (cmd === 'delete') {
                    await this.$confirm(`Delete collection "${data.label}"? This cannot be undone.`, 'Delete',
                        { type: 'warning', confirmButtonText: 'Delete', cancelButtonText: 'Cancel' })
                    await deleteCollection({ id: data.value }, this.scope)
                    this.pluckCopy(this.rawGroups, data.value)
                    await this.saveGroups()
                    if (this.currentCollection === data.value) this.openDashboard()
                    this.$message.success('Collection deleted')
                } else if (cmd === 'newCollection') {
                    this.dialogProductsOnly = false
                    this.creatingInFolder = data.fid
                    this.editingCollection = null
                    this.collectionDialogVisible = true
                } else if (cmd === 'newFolder') {
                    const { value } = await this.$prompt('Folder name', 'New Sub-folder',
                        { inputValidator: v => !!String(v || '').trim() || 'Name required' })
                    const folder = this.findFolder(this.rawGroups, data.fid)
                    if (!folder) return
                    folder.children = folder.children || []
                    folder.children.push({
                        _id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                        title: String(value).trim(), expanded: false, collections: [], children: []
                    })
                    await this.saveGroups()
                } else if (cmd === 'renameFolder') {
                    const { value } = await this.$prompt('Folder name', `Rename ${data.label}`,
                        { inputValue: data.label, inputValidator: v => !!String(v || '').trim() || 'Name required' })
                    const folder = this.findFolder(this.rawGroups, data.fid)
                    if (!folder) return
                    folder.title = String(value).trim()
                    await this.saveGroups()
                } else if (cmd === 'deleteFolder') {
                    const folder = this.findFolder(this.rawGroups, data.fid)
                    if (!folder) return
                    if ((folder.collections || []).length || (folder.children || []).length) {
                        this.$message.warning('Only empty folders can be deleted — move their contents first.')
                        return
                    }
                    await this.$confirm(`Delete folder "${data.label}"?`, 'Delete',
                        { type: 'warning', confirmButtonText: 'Delete', cancelButtonText: 'Cancel' })
                    this.removeFolder(this.rawGroups, data.fid)
                    await this.saveGroups()
                }
            } catch (e) {
                if (e === 'cancel' || e === 'close') return
                this.$message.error((e && e.message) || 'Operation failed')
            }
        },
        getCollectionGroup() {
            getCollectionGroups(this.scope).then(res => {
                const groups = res.data || []
                // Kept verbatim — the tree menu's mutations edit these docs
                // and write them back whole through updateGroup.
                this.rawGroups = groups

                // Leaf labels drop the words their ancestors already say:
                // under iPhone → Screen, "iPhone SVP Screen" shows as "SVP".
                // Display-only — the collection titles themselves are used by
                // the snapshot tags and filters and stay untouched. A title
                // fully covered by its ancestors ("iPad Battery" under
                // iPad → Battery) shows as "All".
                const esc = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                const stripLabel = (title, ancestors) => {
                    let label = ` ${String(title || '')} `
                    for (const a of ancestors) {
                        for (const word of String(a).split(/\s+/).filter(Boolean)) {
                            label = label.replace(new RegExp(`\\s${esc(word)}(?=\\s)`, 'ig'), ' ')
                        }
                    }
                    return label.replace(/\s+/g, ' ').trim() || 'All'
                }

                const buildTree = (categories, ancestors = []) => {
                    return categories.map(category => {
                        const path = [...ancestors, category.title]

                        // Collections and sub-folders in one list, in the order
                        // Manage Category set (`order`); a folder that an old
                        // drag left among the collections still shows as a folder.
                        const entries = orderedEntries(category)
                        const children = entries.map(item => {
                            if (isFolderEntry(item)) return buildTree([item], path)[0]
                            const label = stripLabel(item.title, path)
                            return {
                                label,
                                // The breadcrumb the title shows for this leaf.
                                path: [...path, label],
                                value: item._id
                            }
                        })

                        // A category whose only content is one fully-stripped
                        // collection ("iPad Screen" under iPad → Screen)
                        // becomes the clickable leaf itself — no "All" level.
                        if (entries.length === 1 && !isFolderEntry(entries[0]) && children[0].label === 'All') {
                            return { label: category.title, path, value: children[0].value }
                        }

                        return {
                            label: category.title,
                            path,
                            // The folder's id in the raw group docs — the
                            // tree menu's folder operations key off it.
                            fid: category._id,
                            children
                        }
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

                // On the Dashboard tab nothing is auto-selected: the tree is
                // there, and picking a category (or a ?collection deep link)
                // is what enters the list view.
                if (this.viewMode === 'dashboard' && !this.$route.query.collection) {
                    return
                }

                this.currentCollection = this.$route.query.collection ? this.$route.query.collection : findFirstCollectionId(groups)

                // The auto-selected collection (first load / deep link) never
                // goes through handleNodeClick, so resolve its label here too —
                // the page title reads it.
                const findPath = (nodes, id) => {
                    for (const node of nodes || []) {
                        if (!node.children && node.value === id) return node.path || [node.label]
                        const hit = findPath(node.children, id)
                        if (hit) return hit
                    }
                    return null
                }
                const path = findPath(this.treeData, this.currentCollection)
                if (path) {
                    this.currentPath = path
                    this.currentTab = path[path.length - 1]
                }
                // A comma-list deep link is a branch view — find the parent
                // whose children it spans and restore its title + filter.
                if (String(this.currentCollection).includes(',')) {
                    const target = String(this.currentCollection)
                    const findAgg = nodes => {
                        for (const n of nodes || []) {
                            if (n.children && n.children.length && n.children.every(c => !c.children)
                                && n.children.map(c => c.value).join(',') === target) return n
                            const hit = findAgg(n.children)
                            if (hit) return hit
                        }
                        return null
                    }
                    const agg = findAgg(this.treeData)
                    if (agg) {
                        this.currentTab = agg.label
                        this.currentPath = agg.path || [agg.label]
                        this.subOptions = agg.children.map(c => ({ label: c.label, value: c.value }))
                    }
                }
                // The 海运 collection lives outside the tree, so the label
                // lookup can't know it (deep links land here before or after
                // loadSeaFreight — cover both orders).
                if (this.seaFreightId && this.currentCollection === this.seaFreightId) {
                    this.currentTab = '海运'
                    this.currentPath = ['海运']
                }

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
        // The Dashboard tab above the tree — the content pane swaps to the
        // embedded dashboard and the tree keeps no selection.
        openDashboard() {
            if (this.viewMode === 'dashboard') return
            this.viewMode = 'dashboard'
            this.currentCollection = ''
            this.currentTab = ''
            this.currentPath = []
            this.subOptions = []
            this.browseSel = null
            if (this.$refs.deptTreeRef) this.$refs.deptTreeRef.setCurrentKey(null)
            if (this.$route.query.collection || this.$route.query.browse) this.$router.replace({ query: {} })
        },
        handleNodeClick(data, node) {
            if (this.browse) { this.openBrowseNode(data); return }
            if (!data.children) {
                this.viewMode = 'list'
                this.currentTab = data.label
                this.currentPath = data.path || [data.label]
                this.currentCollection = data.value
                this.subOptions = []
                this.queryParams = {
                    pageNum: 1,
                    pageSize: 20,
                    sku: undefined,
                    productName: undefined,
                    search: '',
                    category: '',
                    quick: '',
                    subCol: ''
                },
                    this.$router.replace({
                        query: {
                            collection: data.value
                        }
                    })
                this.$nextTick(() => {
                    // Coming from the Dashboard tab the table mounts on this
                    // same tick — it may not be in refs yet.
                    this.$refs.table && this.$refs.table.clearSort()
                    this.clearSelection()
                    this.getList()
                })
            } else if (data.children.length && data.children.every(c => !c.children)) {
                // A bottom-level parent (every child is a collection).
                // el-tree toggles the expansion BEFORE this handler runs, so:
                // collapsed → click → now expanded: just the expand, no
                // content change; expanded → click → the toggle closed it:
                // keep it open and load everything under it.
                if (node && node.expanded) return
                if (node) node.expanded = true
                this.openAggregate(data)
            }
        },
        // Load the union of every collection under a bottom-level parent
        // (e.g. iPhone → Screen = all seven screen collections at once);
        // the children become the sub-category filter.
        openAggregate(data) {
            this.viewMode = 'list'
            this.currentTab = data.label
            this.currentPath = data.path || [data.label]
            // Only real collection ids go to the API (a folder has none).
            const leaves = data.children.filter(c => /^[0-9a-f]{24}$/i.test(String(c.value || '')))
            this.subOptions = leaves.map(c => ({ label: c.label, value: c.value }))
            this.currentCollection = leaves.map(c => c.value).join(',')
            this.queryParams = {
                pageNum: 1, pageSize: 20, sku: undefined, productName: undefined,
                search: '', category: '', quick: '', subCol: ''
            }
            this.$router.replace({ query: { collection: this.currentCollection } }).catch(() => {})
            this.$nextTick(() => {
                this.$refs.table && this.$refs.table.clearSort()
                this.clearSelection()
                this.getList()
            })
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
        // Open Spare Parts Purchase lines per Zoho item_id, merged onto the
        // rows for the "Purchase" column. Mirrors handleGetSalesTotal's id set.
        // No-op for Accessories — the column doesn't exist there.
        handleGetPurchase() {
            if (this.isAccessories) return
            const that = this
            that.purchaseLoading = true
            // Whole list, always — one Mongo read, and the On Order tiles
            // need every row's purchase state.
            const itemIds = that.productList.map(product => product.id).filter(Boolean)
            purchasesByItemIds(itemIds).then(resp => {
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
            // The item's classification, or the 海运 channel for a part on the
            // 海运 list (still changeable in the picker).
            const category = this.isSeaView || row.seaFreight ? '海运'
                : PO_CATEGORIES.includes(row.classification) ? row.classification : 'Other'
            this.poForm = { category, orderQty: null, note: '' }
            this.poDialogVisible = true
        },
        async submitCreatePo() {
            if (!this.poForm.category) { this.$message.warning('Please select a category.'); return }
            const qty = Number(this.poForm.orderQty)
            if (!Number.isFinite(qty) || qty <= 0) { this.$message.warning('Please enter a quantity.'); return }
            this.poSaving = true
            try {
                const r = await createOrders([{
                    itemId: this.poProduct.id,
                    sku: this.poProduct.sku,
                    productName: this.poProduct.productName,
                    category: this.poForm.category,
                    orderQty: qty,
                    note: this.poForm.note
                }])
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(`${(r.orderNos || [])[0] || 'Purchase order'} created for ${this.poProduct.sku || this.poProduct.productName}`)
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
            // A fresh collection starts on the normal view, not the
            // hidden-items review of the previous one.
            this.showHidden = false
            if (this.browse) { this.loadBrowse(); return }
            if (!this.isAccessories) {
                // The register: rows with their sales windows in one call.
                // Purchase data is a Mongo read as before; stock on the
                // page shown is overlaid live in handlePagination.
                getStockCollectionItems({ collection: that.currentCollection }).then(resp => {
                    that.productList = (resp && resp.rows) || []
                    that.asOf = { snapshotDate: resp && resp.snapshotDate, metricsAt: resp && resp.metricsAt }
                    that.applyStoredSales()
                    that.loading = false
                    that.$nextTick(() => that.handleGetPurchase())
                }).catch(() => {
                    that.loading = false
                })
                return
            }
            getCurrentStock({ collection: that.currentCollection, scope: that.scope || undefined }).then(resp => {
                that.productList = resp
                that.handlePagination()
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
        // Every path that renders rows (search, sort, page change, load)
        // goes through here, so the active filters can never be dropped —
        // sorting or paging used to slice the UNFILTERED master list,
        // silently discarding the search.
        handlePagination() {
            // Browse mode is server-paged: every path that re-renders rows
            // (search, tile, page, hidden review) asks for the page again.
            if (this.browse) { this.loadBrowse(); return }
            const filtered = this.productList.filter(item => this.matchesFilters(item))
            this.total = filtered.length
            const page = this.queryParams.pageNum
            const pageSize = this.queryParams.pageSize
            this.showProductList = filtered.slice(
                (page - 1) * pageSize,
                page * pageSize
            )
            if (!this.isAccessories) this.overlayLiveStock()
        },
        handleSorting({ prop, order }) {
            if (this.browse) {
                const map = { productName: 'name', stock: 'stock' }
                this.browseQuery.sort = order ? (map[prop] || '') : ''
                this.browseQuery.order = order === 'descending' ? 'desc' : 'asc'
                this.queryParams.pageNum = 1
                this.loadBrowse()
                return
            }
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
        async handleExportCommand(command) {
            if (this.browse && command !== 'selection') {
                // Server-paged, so the rows are fetched for the export: the
                // current filters for the view, none of them for the full list.
                try {
                    const r = await getBrowseItems({ ...this.browseParams(command === 'full'), all: 1 })
                    if (r && r.capped) this.$message.warning('Export capped at 5,000 rows — narrow the category')
                    this.doExport(((r && r.rows) || []).map(row => this.withStoredSales(row)))
                } catch (e) {
                    this.$message.error('Could not fetch the rows to export')
                }
                return
            }
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
        // ── the register (spare parts) ───────────────────────────────
        // Each row carries the four windows { total, online }; the Sales
        // column shows the picked one as Zoho (online orders) + Other
        // (counter / workshop / Neto / dispatch). Re-run on a window change
        // — no request, the numbers are already here.
        withStoredSales(item) {
            const u = (item.sales && item.sales[String(this.duration)]) || { total: 0, online: 0 }
            return {
                ...item,
                zohoSales: Math.round(u.online * 100) / 100,
                offlineSales: Math.round((u.total - u.online) * 100) / 100
            }
        },
        applyStoredSales() {
            if (this.isAccessories) return
            this.productList = this.productList.map(item => this.withStoredSales(item))
            this.handlePagination()
        },
        // ── Browse mode ──────────────────────────────────────────────
        switchSideMode(mode) {
            if (mode === this.sideMode) return
            this.sideMode = mode
            try { localStorage.setItem('stock-side-mode', mode) } catch (e) { /* fine */ }
            // The open list belongs to the other tree — back to the Dashboard.
            if (this.viewMode === 'list') this.openDashboard()
            if (mode === 'browse' && !this.browseTree.length) this.loadBrowseTree()
        },
        async loadBrowseTree() {
            if (this.browseTreeLoading) return
            this.browseTreeLoading = true
            try {
                const r = await getBrowseTree({ scope: 'parts' })
                this.browseTree = (r && r.tree) || []
                // A ?browse deep link: open its node once the tree is here.
                const key = this.$route.query.browse
                if (key && this.browse) {
                    const find = nodes => {
                        for (const n of nodes || []) {
                            if (n.key === key) return n
                            const hit = find(n.children)
                            if (hit) return hit
                        }
                        return null
                    }
                    const node = find(this.browseTree)
                    if (node) this.openBrowseNode(node)
                }
            } catch (e) {
                this.$message.error('Could not load the category tree')
            } finally {
                this.browseTreeLoading = false
            }
        },
        // Any node lists everything under it; the tree arrow expands.
        openBrowseNode(data) {
            this.viewMode = 'list'
            this.browseSel = data.sel
            this.currentTab = data.label
            this.currentPath = data.path || [data.label]
            this.currentCollection = ''
            this.subOptions = []
            this.showHidden = false
            this.queryParams = {
                pageNum: 1, pageSize: this.queryParams.pageSize || 20, sku: undefined, productName: undefined,
                search: '', category: '', quick: '', subCol: ''
            }
            this.browseQuery = { quality: '', models: [], sort: '', order: '' }
            this.$router.replace({ query: { browse: data.key } }).catch(() => {})
            this.$nextTick(() => {
                this.$refs.table && this.$refs.table.clearSort()
                this.clearSelection()
                this.loadBrowse()
            })
        },
        // The query for the picked node and the filters above the table.
        browseParams(ignoreTile) {
            const s = this.browseSel || {}
            const p = { scope: 'parts', page: this.queryParams.pageNum, pageSize: this.queryParams.pageSize, days: this.duration }
            for (const k of ['brand', 'series', 'classification', 'sub']) if (s[k] !== undefined) p[k] = s[k]
            if (this.queryParams.search) p.search = this.queryParams.search
            if (this.browseQuery.quality) p.quality = this.browseQuery.quality
            const picks = this.browseQuery.models || []
            const seriesIn = picks.filter(x => x.length === 1).map(x => x[0])
            const models = picks.filter(x => x.length === 2).map(x => x[1])
            if (seriesIn.length) p.seriesIn = seriesIn
            if (models.length) p.models = models
            if (this.browseQuery.sort) { p.sort = this.browseQuery.sort; p.order = this.browseQuery.order }
            if (!ignoreTile && this.queryParams.quick) p.tile = this.queryParams.quick
            if (this.showHidden) p.hidden = 1
            return p
        },
        // One page of the node with its counts. A reply that lands after
        // the selection moved on is dropped.
        async loadBrowse() {
            if (!this.browseSel) return
            const seq = ++this.browseSeq
            this.loading = true
            try {
                const r = await getBrowseItems(this.browseParams())
                if (seq !== this.browseSeq) return
                this.productList = ((r && r.rows) || []).map(row => this.withStoredSales(row))
                this.showProductList = this.productList
                this.total = (r && r.total) || 0
                this.browseState = {
                    tiles: (r && r.tiles) || null,
                    hiddenCount: (r && r.hiddenCount) || 0,
                    qualities: (r && r.qualities) || [],
                    seriesModels: (r && r.seriesModels) || []
                }
                this.asOf = { snapshotDate: r && r.snapshotDate, metricsAt: r && r.metricsAt }
                this.overlayLiveStock()
                this.$nextTick(() => this.handleGetPurchase())
            } catch (e) {
                if (seq === this.browseSeq) this.$message.error('Could not load this category')
            } finally {
                if (seq === this.browseSeq) this.loading = false
            }
        },
        // Zoho's current stock for the rows on this page, painted over the
        // register's figure (no mark — the user asked for none). Tiles and
        // sorting keep the stored figure, as on the dashboard. A read that
        // lands after the page has moved on is dropped; if Zoho is slow or
        // down the stored figure simply stands.
        async overlayLiveStock() {
            const ids = this.showProductList.map(r => r.id).filter(Boolean)
            if (!ids.length) return
            const seq = ++this.liveSeq
            try {
                const r = await getLiveStock(ids)
                if (seq !== this.liveSeq || !r || !r.stock) return
                // Look the rows up again: purchase data may have replaced
                // the page's objects while the read was in flight.
                for (const row of this.showProductList) {
                    const s = r.stock[String(row.id)]
                    if (!s) continue
                    this.$set(row, 'stock', s.available)
                    this.$set(row, 'accountingStock', s.accountingStock)
                }
            } catch (e) {
                // The stored figure stands.
            }
        },
        // ── tile helpers ──────────────────────────────────────────────
        // Quantity on open Spare Parts Purchase lines (attached to rows by
        // handleGetPurchase; parts only) — a shipped line counts what was
        // shipped, the same figure as the Stock Monitoring On order column.
        onOrderQty(item) {
            const p = item && item.purchase
            return p ? (p.pending || 0) + (p.toConfirm || 0) + (p.ordered || 0) + (p.shipped || 0) + (p.shortage || 0) : 0
        },
        // Stock below one month of sales, normalised from the selected
        // sales window. Items with no sales in the window don't count.
        underMonthCover(item) {
            const days = Number(this.duration) || 30
            const pace = ((Number(item.zohoSales) || 0) + (Number(item.offlineSales) || 0)) * (30 / days)
            return pace > 0 && Number(item.stock) < pace
        },
        // Search / category / legacy sku+name filters — everything EXCEPT
        // the tile quick-filter. The tiles count over this set, so their
        // numbers follow the filters while each tile's own count ignores
        // the tile selection (you can still read the other buckets).
        matchesBaseFilters(item) {
            // Manually hidden items are out of every count and view on this
            // page; the review toggle flips to showing ONLY them.
            if (this.showHidden ? !item.hidden : item.hidden) return false

            const { sku, productName, search, category } = this.queryParams

            const matchSku = !sku || String(item.sku || '')
                .toLowerCase()
                .includes(String(sku).toLowerCase())

            const matchProductName = !productName || String(item.productName || '')
                .toLowerCase()
                .includes(String(productName).toLowerCase())

            // The single search box — SKU or name.
            const q = String(search || '').toLowerCase()
            const matchSearch = !q ||
                String(item.sku || '').toLowerCase().includes(q) ||
                String(item.productName || '').toLowerCase().includes(q)

            const matchCategory = !category || item.category === category

            // Branch view: one child collection picked in the filter.
            const matchSub = !this.queryParams.subCol ||
                (item.memberOf || []).includes(this.queryParams.subCol)

            return matchSku && matchProductName && matchSearch && matchCategory && matchSub
        },
        // The full predicate — shared by the table (handleQuery) and
        // "Export current view", so they can never disagree.
        matchesFilters(item) {
            const { quick } = this.queryParams

            const matchQuick = !quick ||
                (quick === 'zero' ? Number(item.stock) <= 0
                    : quick === 'belowReorder' ? Number(item.reorderLevel) > 0 && Number(item.stock) <= Number(item.reorderLevel)
                        : quick === 'noOnOrder' ? Number(item.stock) <= 0 && !this.onOrderQty(item)
                            : quick === 'onOrder' ? this.onOrderQty(item) > 0
                                : quick === 'underMonth' ? this.underMonthCover(item)
                                    : true)

            return this.matchesBaseFilters(item) && matchQuick
        },
        handleQuery() {
            this.queryParams.pageNum = 1
            this.handlePagination()
        },
        // ── 海运 (sea freight) list ──────────────────────────────────
        // Backed by a pinned-products collection the tree never shows;
        // the tab above the tree opens it through the normal list path.
        async loadSeaFreight() {
            try {
                const r = await getSeaFreight()
                if (r && r.success) {
                    this.seaFreightId = r.id
                    // A ?collection deep link straight onto 海运 resolves its
                    // title here — the tree lookup can't know it.
                    if (this.currentCollection === r.id) {
                        this.currentTab = '海运'
                        this.currentPath = ['海运']
                    }
                }
            } catch (e) { /* the tab just stays hidden */ }
        },
        openSeaFreight() {
            if (!this.seaFreightId || this.isSeaView) return
            this.viewMode = 'list'
            this.currentTab = '海运'
            this.currentPath = ['海运']
            this.currentCollection = this.seaFreightId
            this.subOptions = []
            this.queryParams = {
                pageNum: 1, pageSize: 20, sku: undefined, productName: undefined,
                search: '', category: '', quick: '', subCol: ''
            }
            if (this.$refs.deptTreeRef) this.$refs.deptTreeRef.setCurrentKey(null)
            this.$router.replace({ query: { collection: this.seaFreightId } })
            this.$nextTick(() => {
                this.$refs.table && this.$refs.table.clearSort()
                this.clearSelection()
                this.getList()
            })
        },
        // The per-row ship icon in the product meta — one click adds or
        // removes, mirroring the dashboard's button.
        async toggleSeaItem(row) {
            if (row.__seaBusy) return
            this.$set(row, '__seaBusy', true)
            try {
                if (row.seaFreight) {
                    const r = await removeSeaFreightItem(row.id)
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    if (this.isSeaView) {
                        // The current view IS the 海运 list — drop the row.
                        this.productList = this.productList.filter(p => String(p.id) !== String(row.id))
                    } else {
                        const master = this.productList.find(p => String(p.id) === String(row.id))
                        if (master) this.$set(master, 'seaFreight', false)
                    }
                    this.$message.success(`${row.productName || row.sku || 'Item'} removed from 海运`)
                } else {
                    const r = await addSeaFreightItems([{ id: row.id, name: row.productName, sku: row.sku }])
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    const master = this.productList.find(p => String(p.id) === String(row.id))
                    if (master) this.$set(master, 'seaFreight', true)
                    this.$message.success(`${row.productName || row.sku || 'Item'} added to 海运`)
                }
                this.handlePagination()
            } catch (e) {
                this.$message.error((e && e.message) || 'Failed to update 海运')
            } finally {
                this.$set(row, '__seaBusy', false)
            }
        },
        // ── manual hide list ─────────────────────────────────────────
        // Page-level only: a hidden item leaves this list (and its tile
        // counts) but still exists everywhere else — the Dashboard, buy
        // lists and Price Monitoring are untouched. The stronger,
        // cross-page bucket remains the Archive.
        // Per-row hide via the meta-line icon (no selection needed).
        async hideItem(row) {
            if (row.__hideBusy) return
            this.$set(row, '__hideBusy', true)
            try {
                const r = await hideStockItems([{ id: row.id, name: row.productName, sku: row.sku }])
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                const master = this.productList.find(p => String(p.id) === String(row.id))
                if (master) this.$set(master, 'hidden', true)
                this.handlePagination()
                this.$message.success(`${row.productName || row.sku || 'Item'} hidden — restore via "${this.hiddenCount} hidden — view"`)
            } catch (e) {
                this.$message.error((e && e.message) || 'Failed to hide the item')
            } finally {
                this.$set(row, '__hideBusy', false)
            }
        },
        async unhideItem(row) {
            try {
                const r = await unhideStockItem(row.id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                const master = this.productList.find(p => String(p.id) === String(row.id))
                if (master) this.$set(master, 'hidden', false)
                if (!this.hiddenCount) this.showHidden = false
                this.handlePagination()
                this.$message.success(`${row.productName || row.sku || 'Item'} is back on the list`)
            } catch (e) {
                this.$message.error((e && e.message) || 'Failed to unhide the item')
            }
        },
        toggleShowHidden() {
            this.showHidden = !this.showHidden
            this.queryParams.pageNum = 1
            if (this.$refs.table) this.$refs.table.clearSelection()
            this.handlePagination()
        },
        // Same textarea+execCommand pattern the rest of the app uses —
        // works regardless of the clipboard API's secure-context rules.
        copySku(sku) {
            const ta = document.createElement('textarea')
            ta.value = sku
            ta.style.position = 'fixed'
            ta.style.opacity = '0'
            document.body.appendChild(ta)
            ta.select()
            try {
                document.execCommand('copy')
                this.$message.success(`SKU ${sku} copied`)
            } catch (e) {
                this.$message.warning('Copy failed — select the text manually.')
            }
            document.body.removeChild(ta)
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
                subCol: ''
            }
            this.browseQuery.quality = ''
            this.browseQuery.models = []
            this.handlePagination()
        }
    }
}
</script>

<style scoped>
.app-container {
    height: 100%;
}

/* ── Browse | Collections switch above the tree ── */
.sm-mode {
    display: flex;
    margin: 10px 10px 0;
    border: 1px solid #e8eaed;
    border-radius: 4px;
    overflow: hidden;
}
.sm-mode-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 28px;
    font-size: 12px;
    font-weight: 600;
    color: #909399;
    cursor: pointer;
    transition: all .15s;
}
.sm-mode-btn + .sm-mode-btn { border-left: 1px solid #e8eaed; }
.sm-mode-btn:hover { color: #409eff; background: #f0f7ff; }
.sm-mode-btn.on { color: #409eff; background: #e6f0fd; }
/* The count beside a Browse node. */
.tn-count { flex-shrink: 0; margin-right: 6px; font-size: 11px; color: #c0c4cc; font-variant-numeric: tabular-nums; }
.sd-sel { width: 200px; }
.sd-casc { width: 320px; }

/* ── Dashboard tab pinned above the category tree ── */
.dash-tab {
    margin: 10px 10px 0;
    padding: 0 10px;
    height: 34px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: #606266;
    border: 1px solid #e8eaed;
    border-radius: 4px;
    cursor: pointer;
    transition: all .15s;
}

.dash-tab i {
    color: #909399;
    font-size: 15px;
}

.dash-tab:hover {
    color: #409eff;
    border-color: #b3d8ff;
    background: #f0f7ff;
}

.dash-tab:hover i {
    color: #409eff;
}

.dash-tab.on {
    color: #409eff;
    background: #e6f0fd;
    border-color: #b3d8ff;
}

.dash-tab.on i {
    color: #409eff;
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

/* The Hide row action — amber so it reads as "tuck away", not delete. */
.sm-hide-op { color: #E6A23C; }
/* Custom tree node (the TreePanel slot replaces its default row). */
.tn-icon { font-size: 14px; color: #f5a623; flex-shrink: 0; }
.tn-icon.el-icon-document { color: #909399; }
.tn-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tn-menu { flex-shrink: 0; margin-right: 4px; }
.tn-menu-icon {
    font-size: 12px; color: #c0c4cc; padding: 3px; border-radius: 3px;
    opacity: 0; transition: opacity .15s;
    &:hover { color: #409eff; background: #ecf5ff; }
}
.el-tree-node__content:hover .tn-menu-icon { opacity: 1; }
/* Breadcrumb title: ancestors muted, the picked collection bold. */
.sd-crumbs {
    display: flex; align-items: center; gap: 6px;
    .crumb { font-weight: 500; color: #909399; }
    .crumb-leaf { font-weight: 700; color: #303133; }
    .crumb-sep { font-size: 14px; color: #c0c4cc; }
}
/* Green = in 海运, grey = not; click toggles. */
.p-sea-btn {
    color: #c0c4cc; cursor: pointer;
    &:hover { color: #909399; }
    &.on { color: #67C23A; &:hover { color: #529b2e; } }
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
    display: flex;
    align-items: center;
    gap: 10px;
    line-height: 1.35;
    text-align: left;
}

.product-text {
    min-width: 0;
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

.product-meta .p-sku-copy {
    cursor: pointer;
}

.product-meta .p-sku-copy:hover {
    color: #409EFF;
    text-decoration: underline;
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