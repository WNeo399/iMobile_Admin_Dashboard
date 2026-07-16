<template>
    <div class="po-page">
        <tree-panel
            ref="treeRef"
            :tree-data="treeData"
            title="采购订单"
            title-icon-class="el-icon-box"
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
            <!-- Top action bar -->
            <div class="po-topbar">
                <el-checkbox v-model="notReceived" class="po-toggle" @change="onNotReceived">仅显示未签收</el-checkbox>
                <el-button type="success" size="small" icon="el-icon-plus" @click="openCreatePo">创建 PO</el-button>
                <el-button type="primary" plain size="small" icon="el-icon-sort" :loading="syncing" @click="onSync">同步腾讯</el-button>
                <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">刷新</el-button>
            </div>

            <!-- Title -->
            <div class="po-header">
                <div class="po-h-title">{{ activeCategory || '采购订单' }}</div>
                <div class="po-h-sub">管理和跟踪所有采购订单<span v-if="syncedStr"> · 同步于 {{ syncedStr }}</span></div>
            </div>

            <!-- Filters -->
            <div class="po-filters">
                <div class="po-f-item">
                    <label>状态</label>
                    <el-select v-model="activeStatus" size="small" placeholder="全部状态" clearable
                        style="width:150px" @change="onStatusChange">
                        <el-option v-for="s in STATUS_LIST" :key="s.value" :label="s.label" :value="s.value" />
                    </el-select>
                </div>
                <div class="po-f-item">
                    <label>供应商</label>
                    <el-select v-model="activeSupplier" size="small" placeholder="全部供应商" clearable filterable
                        style="width:180px" @change="reload">
                        <el-option v-for="s in suppliers" :key="s" :label="s" :value="s" />
                    </el-select>
                </div>
                <div class="po-f-item po-f-grow">
                    <label>关键词</label>
                    <el-input v-model="search" size="small" clearable prefix-icon="el-icon-search"
                        placeholder="搜索产品名称、SKU、供应商、DHL单号…"
                        @keyup.enter.native="reload" @clear="reload" />
                </div>
                <el-button size="small" @click="resetFilters">重置</el-button>
            </div>

            <!-- KPI status cards -->
            <div class="po-kpis">
                <div v-for="s in STATUS_LIST" :key="s.value"
                    class="po-kpi" :class="{ active: activeStatus === s.value }"
                    @click="toggleStatus(s.value)">
                    <div class="po-kpi-icon" :style="{ background: s.bg, color: s.color }"><i :class="s.icon" /></div>
                    <div class="po-kpi-body">
                        <div class="po-kpi-label">{{ s.label }}</div>
                        <div class="po-kpi-count">{{ byStatus[s.value] || 0 }}</div>
                    </div>
                </div>
            </div>

            <!-- Table -->
            <el-table
                v-loading="loading"
                :data="rows"
                size="mini"
                height="calc(100vh - 432px)"
                class="po-table"
            >
                <el-table-column label="订单日期" prop="orderDate" width="110" align="center" fixed>
                    <template slot-scope="s">{{ s.row.orderDate || '—' }}</template>
                </el-table-column>
                <el-table-column label="产品" min-width="300" fixed>
                    <template slot-scope="s">
                        <div class="po-prod-name">
                            {{ s.row.productName }}<a v-if="s.row.zoho_id"
                                class="po-prod-zoho"
                                :href="zohoLink(s.row.zoho_id)"
                                target="_blank" rel="noopener"
                                title="在 Zoho 中查看"><i class="el-icon-link" /></a>
                        </div>
                        <div v-if="s.row.sku" class="po-prod-sku">SKU: {{ s.row.sku }}</div>
                        <div v-if="s.row.note" class="po-prod-note">备注: {{ s.row.note }}</div>
                    </template>
                </el-table-column>
                <el-table-column label="订单数量" width="90" align="center"><template slot-scope="s">{{ num(s.row.orderQty) }}</template></el-table-column>
                <el-table-column label="采购单价" width="110" align="center">
                    <template slot-scope="s">
                        <span v-if="s.row.unitPrice != null">{{ yuan(s.row.unitPrice) }}</span>
                        <span v-else-if="s.row.quotedPrice != null">{{ yuan(s.row.quotedPrice) }} <span class="po-quote-tag">报价</span></span>
                        <span v-else>—</span>
                    </template>
                </el-table-column>
                <el-table-column label="供应商" width="100" align="center" show-overflow-tooltip>
                    <template slot-scope="s">{{ s.row.supplier || '—' }}</template>
                </el-table-column>
                <el-table-column label="下单时间" width="100" align="center"><template slot-scope="s">{{ s.row.orderedAt || '—' }}</template></el-table-column>
                <el-table-column label="发货数量" width="130" align="center">
                    <template slot-scope="s">
                        <div>{{ num(s.row.shippedQty) }}</div>
                        <div v-if="s.row.dhlTracking" class="po-dhl-sub">
                            DHL: <a
                                class="po-dhl-link"
                                :href="dhlLink(s.row.dhlTracking)"
                                target="_blank" rel="noopener"
                                :title="s.row.dhlTracking">{{ s.row.dhlTracking }}</a>
                        </div>
                    </template>
                </el-table-column>
                <el-table-column label="发货日期" width="110" align="center"><template slot-scope="s">{{ s.row.shippedDate || '—' }}</template></el-table-column>
                <el-table-column label="收到日期" width="110" align="center"><template slot-scope="s">{{ s.row.receivedDate || '—' }}</template></el-table-column>
                <el-table-column label="状态" width="90" align="center">
                    <template slot-scope="s">
                        <span class="po-status" :style="statusStyle(s.row.status)">{{ statusLabel(s.row.status) }}</span>
                    </template>
                </el-table-column>
                <el-table-column label="操作" align="center" width="130" class-name="small-padding fixed-width" fixed="right">
                    <template slot-scope="s">
                        <el-button
                            v-if="s.row.status === 'pending' || s.row.status === 'shortage'"
                            size="mini"
                            type="text"
                            icon="el-icon-document-checked"
                            @click="openPlaceOrder(s.row)"
                        >已下单</el-button>
                        <el-dropdown trigger="click" @command="(cmd) => cmd()">
                            <el-button size="mini" type="text" icon="el-icon-more" class="more-btn" />
                            <el-dropdown-menu slot="dropdown">
                                <el-dropdown-item :command="() => openDetail(s.row)" icon="el-icon-document">订单详情</el-dropdown-item>
                                <el-dropdown-item v-if="s.row.status === 'pending' || s.row.status === 'shortage'" :command="() => openQuote(s.row)" icon="el-icon-price-tag" divided>报价</el-dropdown-item>
                                <el-dropdown-item v-if="s.row.status === 'pending' || s.row.status === 'ordered'" :command="() => markShortage(s.row)" icon="el-icon-remove-outline" :divided="s.row.status === 'ordered'">缺货</el-dropdown-item>
                                <el-dropdown-item v-if="s.row.status === 'pending' || s.row.status === 'shortage'" :command="() => cancelOrder(s.row)" icon="el-icon-circle-close">取消订单</el-dropdown-item>
                            </el-dropdown-menu>
                        </el-dropdown>
                    </template>
                </el-table-column>
                <template slot="empty">
                    <span class="po-empty">暂无采购订单{{ search || activeStatus || activeSupplier ? '（当前筛选条件下）' : '' }}</span>
                </template>
            </el-table>

            <div class="po-pager">
                <el-pagination
                    background
                    layout="total, sizes, prev, pager, next, jumper"
                    :total="total"
                    :page-size="pageSize"
                    :page-sizes="[10, 20, 50, 100]"
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

        <!-- 标记已下单 -->
        <el-dialog :visible.sync="orderDialogVisible" width="480px" append-to-body :close-on-click-modal="false">
            <div slot="title" class="po-create-head"><i class="el-icon-document-checked" /> 标记为已下单</div>
            <div v-if="orderRow" class="po-order-card">
                <div class="po-item-name" :title="orderRow.productName">{{ orderRow.productName }}</div>
                <div class="po-item-sku">SKU: {{ orderRow.sku || '—' }} · 订单数量 {{ num(orderRow.orderQty) }}</div>
                <div v-if="orderRow.note" class="po-order-note">备注: {{ orderRow.note }}</div>
            </div>
            <el-form label-position="top" size="small" class="po-order-form" @submit.native.prevent>
                <div class="po-order-row">
                    <el-form-item label="供应商" class="po-order-col">
                        <el-select v-model="orderForm.supplier" placeholder="选择或输入" filterable allow-create
                            default-first-option clearable style="width:100%">
                            <el-option v-for="s in suppliers" :key="s" :label="s" :value="s" />
                        </el-select>
                    </el-form-item>
                    <el-form-item label="采购单价" class="po-order-col">
                        <el-input v-model="orderForm.unitPrice" type="number" min="0" placeholder="0.00" style="width:100%">
                            <template slot="prepend">￥</template>
                        </el-input>
                    </el-form-item>
                </div>
                <div class="po-order-hint"><i class="el-icon-time" /> 下单时间记录为当前时间，状态更新为「已下单」。</div>
            </el-form>
            <span slot="footer">
                <el-button size="small" @click="orderDialogVisible = false">取消</el-button>
                <el-button type="primary" size="small" icon="el-icon-check" :loading="orderSaving" @click="submitPlaceOrder">确认下单</el-button>
            </span>
        </el-dialog>

        <!-- 报价 -->
        <el-dialog :visible.sync="quoteVisible" width="420px" append-to-body :close-on-click-modal="false">
            <div slot="title" class="po-create-head"><i class="el-icon-price-tag" /> 报价</div>
            <div v-if="quoteRow" class="po-order-card">
                <div class="po-item-name" :title="quoteRow.productName">{{ quoteRow.productName }}</div>
                <div class="po-item-sku">SKU: {{ quoteRow.sku || '—' }} · 订单数量 {{ num(quoteRow.orderQty) }}</div>
            </div>
            <el-form label-position="top" size="small" @submit.native.prevent>
                <el-form-item label="采购单价">
                    <el-input v-model="quoteForm.unitPrice" type="number" min="0" placeholder="0.00" style="width:100%">
                        <template slot="prepend">￥</template>
                    </el-input>
                </el-form-item>
                <div class="po-order-hint"><i class="el-icon-info" /> 报价仅记录参考单价，不会改变订单状态。</div>
            </el-form>
            <span slot="footer">
                <el-button size="small" @click="quoteVisible = false">取消</el-button>
                <el-button type="primary" size="small" icon="el-icon-check" :loading="quoteSaving" @click="submitQuote">保存报价</el-button>
            </span>
        </el-dialog>

        <!-- 订单详情 -->
        <el-dialog :visible.sync="detailVisible" width="640px" append-to-body :close-on-click-modal="false">
            <div slot="title" class="po-create-head"><i class="el-icon-document" /> 订单详情</div>
            <el-descriptions v-if="detailRow" :column="2" border size="small" class="po-detail">
                <el-descriptions-item label="产品" :span="2">
                    {{ detailRow.productName }}<a v-if="detailRow.zoho_id"
                        class="po-prod-zoho" :href="zohoLink(detailRow.zoho_id)"
                        target="_blank" rel="noopener" title="在 Zoho 中查看"><i class="el-icon-link" /></a>
                </el-descriptions-item>
                <el-descriptions-item label="SKU">{{ detailRow.sku || '—' }}</el-descriptions-item>
                <el-descriptions-item label="分类">{{ detailRow.category || '—' }}</el-descriptions-item>
                <el-descriptions-item label="状态">
                    <span class="po-status" :style="statusStyle(detailRow.status)">{{ statusLabel(detailRow.status) }}</span>
                </el-descriptions-item>
                <el-descriptions-item label="供应商">{{ detailRow.supplier || '—' }}</el-descriptions-item>
                <el-descriptions-item label="订单日期">{{ detailRow.orderDate || '—' }}</el-descriptions-item>
                <el-descriptions-item label="订单数量">
                    <el-input-number v-if="detailRow.status === 'pending'" v-model="detailForm.orderQty"
                        :min="1" :precision="0" :step="1" size="mini" controls-position="right" style="width:130px" />
                    <span v-else>{{ num(detailRow.orderQty) }}</span>
                </el-descriptions-item>
                <el-descriptions-item label="采购单价">
                    <span v-if="detailRow.unitPrice != null">{{ yuan(detailRow.unitPrice) }}</span>
                    <span v-else-if="detailRow.quotedPrice != null">{{ yuan(detailRow.quotedPrice) }} <span class="po-quote-tag">报价</span></span>
                    <span v-else>—</span>
                </el-descriptions-item>
                <el-descriptions-item label="金额">{{ yuan(detailRow.lineTotal) }}</el-descriptions-item>
                <el-descriptions-item label="下单时间">{{ detailRow.orderedAt || '—' }}</el-descriptions-item>
                <el-descriptions-item label="发货数量">{{ num(detailRow.shippedQty) }}</el-descriptions-item>
                <el-descriptions-item label="发货日期">{{ detailRow.shippedDate || '—' }}</el-descriptions-item>
                <el-descriptions-item label="DHL单号">
                    <a v-if="detailRow.dhlTracking" class="po-dhl-link"
                        :href="dhlLink(detailRow.dhlTracking)" target="_blank" rel="noopener">{{ detailRow.dhlTracking }}</a>
                    <span v-else>—</span>
                </el-descriptions-item>
                <el-descriptions-item label="收到日期">{{ detailRow.receivedDate || '—' }}</el-descriptions-item>
            </el-descriptions>
            <div v-if="detailRow" class="po-detail-note">
                <div class="po-detail-note-label">备注</div>
                <el-input v-model="detailForm.note" type="textarea" :rows="2" resize="none"
                    maxlength="200" show-word-limit placeholder="备注（选填）" />
            </div>
            <span slot="footer">
                <el-button size="small" @click="detailVisible = false">关闭</el-button>
                <el-button type="primary" size="small" icon="el-icon-check" :loading="detailSaving" @click="saveDetail">保存</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import TreePanel from '@/components/TreePanel'
import { getPoRecords, updateSyncPo, getPoCategories, createPoBatch, placePoOrder, markPoShortage, cancelPoOrder, updatePoDetail, quotePoPrice } from '@/api/purchaseOrder'
import { searchProducts, lookupProductBySku } from '@/api/zoho/products/product'

// The 5 PO statuses — DB value → { label, icon, colours }. The first four are
// derived by the backend (deriveStatus); "shortage" (缺货) is supported here but
// not auto-derived yet.
const STATUS_LIST = [
    { value: 'pending', label: '待处理', icon: 'el-icon-time', color: '#E6A23C', bg: '#FDF6EC' },
    { value: 'ordered', label: '已下单', icon: 'el-icon-document-checked', color: '#409EFF', bg: '#ECF5FF' },
    { value: 'shipped', label: '已发货', icon: 'el-icon-truck', color: '#8B5CF6', bg: '#F3EFFF' },
    { value: 'received', label: '已签收', icon: 'el-icon-circle-check', color: '#67C23A', bg: '#F0F9EB' },
    { value: 'shortage', label: '缺货', icon: 'el-icon-remove-outline', color: '#F56C6C', bg: '#FEF0F0' },
    { value: 'cancelled', label: '已取消', icon: 'el-icon-circle-close', color: '#909399', bg: '#F4F4F5' }
]
const STATUS_META = STATUS_LIST.reduce((m, s) => ((m[s.value] = s), m), {})

export default {
    name: 'ImobilePurchaseOrder',
    components: { TreePanel },
    data() {
        return {
            STATUS_LIST,
            byCategory: {},
            byCategoryOpen: {},
            byStatus: {},
            suppliers: [],
            activeCategory: '',
            activeStatus: '',
            activeSupplier: '',
            rows: [],
            total: 0,
            lastSyncedAt: null,
            notReceived: true,
            search: '',
            page: 1,
            pageSize: 10,
            loading: false,
            syncing: false,
            treeInit: false,
            // Create PO dialog — each row is its own PO (product/category/qty/note)
            poDialogVisible: false,
            poCategories: [],
            poItems: [],
            poSearchKeyword: '',
            poLookupLoading: false,
            poSaving: false,
            // Mark-as-ordered dialog
            orderDialogVisible: false,
            orderRow: null,
            orderForm: { supplier: '', unitPrice: undefined },
            orderSaving: false,
            // 报价 dialog
            quoteVisible: false,
            quoteRow: null,
            quoteForm: { unitPrice: undefined },
            quoteSaving: false,
            // Order detail dialog (备注 / 订单数量 editable)
            detailVisible: false,
            detailRow: null,
            detailForm: { note: '', orderQty: null },
            detailSaving: false
        }
    },
    computed: {
        treeData() {
            // Tree counts show the outstanding (未签收) count per category.
            const counts = this.byCategoryOpen
            const children = Object.keys(this.byCategory).map(cat => ({
                id: cat, label: cat, count: counts[cat] || 0
            }))
            const total = Object.keys(this.byCategory).reduce((sum, cat) => sum + (counts[cat] || 0), 0)
            return [{ id: 'root', label: '所有订单', count: total, children }]
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
                    status: this.activeStatus || undefined,
                    supplier: this.activeSupplier || undefined,
                    notReceived: (!this.activeStatus && this.notReceived) ? 'true' : undefined,
                    search: this.search
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.rows || []
                this.total = r.total || 0
                if (r.lastSyncedAt) this.lastSyncedAt = r.lastSyncedAt
                if (r.byCategory && Object.keys(r.byCategory).length) this.byCategory = r.byCategory
                this.byCategoryOpen = r.byCategoryOpen || {}
                this.byStatus = r.byStatus || {}
                this.suppliers = r.suppliers || []
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
                this.$message.error(this.msg(e, '加载采购订单失败'))
            } finally {
                this.loading = false
            }
        },
        reload() { this.page = 1; this.load() },
        // ── Filters / status ────────────────────────────────────────
        onNotReceived() {
            // "仅显示未签收" is a broad filter — checking it clears any specific status.
            if (this.notReceived) this.activeStatus = ''
            this.reload()
        },
        onStatusChange() {
            // 已签收 contradicts "仅显示未签收", so untick it in that case.
            if (this.activeStatus === 'received') this.notReceived = false
            this.reload()
        },
        // Clicking a KPI card toggles that status filter.
        toggleStatus(value) {
            if (this.activeStatus === value) {
                this.activeStatus = ''
            } else {
                this.activeStatus = value
                if (value === 'received') this.notReceived = false
            }
            this.reload()
        },
        resetFilters() {
            this.activeStatus = ''
            this.activeSupplier = ''
            this.search = ''
            this.notReceived = true
            this.reload()
        },
        statusLabel(v) { return (STATUS_META[v] && STATUS_META[v].label) || v || '—' },
        statusStyle(v) {
            const m = STATUS_META[v]
            return m ? { color: m.color, background: m.bg } : { color: '#909399', background: '#f4f4f5' }
        },
        zohoLink(id) { return `https://inventory.zoho.com/app/746138234#/inventory/product/variantslist/${id}` },
        dhlLink(t) { return `https://www.dhl.com/au-en/home/tracking.html?tracking-id=${encodeURIComponent(t)}&submit=1` },
        openDetail(row) {
            this.detailRow = row
            this.detailForm = {
                note: row.note || '',
                orderQty: row.orderQty != null ? Number(row.orderQty) : null
            }
            this.detailVisible = true
        },
        async saveDetail() {
            const isPending = this.detailRow.status === 'pending'
            const qty = Number(this.detailForm.orderQty)
            if (isPending && (!Number.isFinite(qty) || qty <= 0)) { this.$message.warning('请输入有效的订单数量。'); return }
            this.detailSaving = true
            try {
                const r = await updatePoDetail({
                    id: this.detailRow._id,
                    note: this.detailForm.note,
                    orderQty: isPending ? qty : undefined
                })
                if (!r || r.success === false) throw new Error((r && r.message) || '保存失败')
                if (r.tencentWritten === false) {
                    this.$message.warning('已保存 — 但数量尚未能写入腾讯文档。')
                } else {
                    this.$message.success('已保存。')
                }
                this.detailVisible = false
                this.load()
            } catch (e) {
                console.error('PO update detail failed:', e)
                this.$message.error(this.msg(e, '保存失败'))
            } finally {
                this.detailSaving = false
            }
        },
        // ── Quote a purchase price ──────────────────────────────────
        openQuote(row) {
            this.quoteRow = row
            const seed = row.quotedPrice != null ? row.quotedPrice : row.unitPrice
            this.quoteForm = { unitPrice: seed != null ? Number(seed) : undefined }
            this.quoteVisible = true
        },
        async submitQuote() {
            const price = Number(this.quoteForm.unitPrice)
            if (!Number.isFinite(price) || price < 0) { this.$message.warning('请输入有效的采购单价。'); return }
            this.quoteSaving = true
            try {
                const r = await quotePoPrice({ id: this.quoteRow._id, unitPrice: price })
                if (!r || r.success === false) throw new Error((r && r.message) || '保存失败')
                this.$message.success('报价已保存。')
                this.quoteVisible = false
                this.load()
            } catch (e) {
                console.error('PO quote failed:', e)
                this.$message.error(this.msg(e, '保存失败'))
            } finally {
                this.quoteSaving = false
            }
        },
        // ── Mark a pending PO as ordered ────────────────────────────
        openPlaceOrder(row) {
            this.orderRow = row
            // Pre-fill the price from a confirmed price, else the recorded quote.
            const seed = row.unitPrice != null ? row.unitPrice : row.quotedPrice
            this.orderForm = {
                supplier: row.supplier || '',
                unitPrice: seed != null ? Number(seed) : undefined
            }
            this.orderDialogVisible = true
        },
        async submitPlaceOrder() {
            const supplier = String(this.orderForm.supplier || '').trim()
            this.orderSaving = true
            try {
                const r = await placePoOrder({
                    id: this.orderRow._id,
                    supplier,
                    unitPrice: this.orderForm.unitPrice
                })
                if (!r || r.success === false) throw new Error((r && r.message) || '操作失败')
                if (r.tencentWritten) {
                    this.$message.success('已标记为已下单，并同步到腾讯文档。')
                } else {
                    this.$message.warning('已标记为已下单 — 但尚未能写入腾讯文档。')
                }
                this.orderDialogVisible = false
                this.load()
            } catch (e) {
                console.error('PO place order failed:', e)
                this.$message.error(this.msg(e, '操作失败'))
            } finally {
                this.orderSaving = false
            }
        },
        async markShortage(row) {
            try {
                await this.$confirm('确认将此订单标记为「缺货」？', '标记缺货',
                    { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' })
            } catch (e) {
                return // cancelled
            }
            try {
                const r = await markPoShortage(row._id)
                if (!r || r.success === false) throw new Error((r && r.message) || '操作失败')
                this.$message.success('已标记为缺货。')
                this.load()
            } catch (e) {
                console.error('PO mark shortage failed:', e)
                this.$message.error(this.msg(e, '操作失败'))
            }
        },
        async cancelOrder(row) {
            try {
                await this.$confirm('确认取消此订单？状态将更新为「已取消」。', '取消订单',
                    { confirmButtonText: '确认', cancelButtonText: '返回', type: 'warning' })
            } catch (e) {
                return // cancelled
            }
            try {
                const r = await cancelPoOrder(row._id)
                if (!r || r.success === false) throw new Error((r && r.message) || '操作失败')
                this.$message.success('订单已取消。')
                this.load()
            } catch (e) {
                console.error('PO cancel order failed:', e)
                this.$message.error(this.msg(e, '操作失败'))
            }
        },
        async onSync() {
            try {
                await this.$confirm(
                    '将从腾讯文档拉取最新更新并应用到数据库（更新已变动的行，新增新行）。因需导出整个表格，可能需要一些时间。',
                    '同步腾讯文档',
                    { confirmButtonText: '同步', cancelButtonText: '取消', type: 'info' }
                )
            } catch (e) {
                return // cancelled
            }
            this.syncing = true
            try {
                const r = await updateSyncPo()
                if (!r || r.success === false) throw new Error((r && r.message) || '同步失败')
                const updated = r.updated || 0
                const inserted = r.inserted || 0
                const unchanged = r.unchanged || 0
                this.$message.success(`同步完成 — 更新 ${updated}，新增 ${inserted}，未变动 ${unchanged}。`)
                this.reload()
            } catch (e) {
                console.error('PO update sync failed:', e)
                this.$message.error(this.msg(e, '同步失败'))
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
                    this.$message.success(`已创建 ${n} 个采购订单并写入腾讯文档。`)
                } else {
                    this.$message.warning(`已保存 ${n} 个采购订单 — 但尚未能写入腾讯文档。`)
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
    padding: 14px 18px;
    background: #f6f8fb;
    overflow: hidden;
}
/* Top action bar */
.po-topbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    margin-bottom: 12px;
    flex-wrap: wrap;
}
.po-toggle { white-space: nowrap; }
.po-topsearch { width: 300px; max-width: 42vw; }

/* Page title */
.po-header { margin-bottom: 12px; }
.po-h-title { font-size: 20px; font-weight: 700; color: #1f2937; line-height: 1.2; }
.po-h-sub { font-size: 13px; color: #909399; margin-top: 3px; }

/* Filter bar */
.po-filters {
    display: flex;
    align-items: flex-end;
    gap: 16px;
    flex-wrap: wrap;
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 12px;
}
.po-f-item { display: flex; flex-direction: column; gap: 5px; }
.po-f-item > label { font-size: 12px; color: #909399; }
.po-f-grow { flex: 1; min-width: 200px; }

/* KPI status cards */
.po-kpis {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 12px;
    margin-bottom: 12px;
}
.po-kpi {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 10px;
    padding: 14px 16px;
    cursor: pointer;
    transition: box-shadow .15s, transform .15s, border-color .15s;
}
.po-kpi:hover { box-shadow: 0 2px 12px rgba(0, 0, 0, .07); transform: translateY(-1px); }
.po-kpi.active { border-color: #409eff; box-shadow: 0 0 0 2px rgba(64, 158, 255, .15); }
.po-kpi-icon {
    width: 44px; height: 44px; border-radius: 10px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; font-size: 21px;
}
.po-kpi-body { min-width: 0; }
.po-kpi-label { font-size: 13px; color: #909399; line-height: 1.2; }
.po-kpi-count { font-size: 22px; font-weight: 700; color: #1f2937; line-height: 1.25; margin-top: 2px; }

/* Table */
.po-table {
    flex: 1;
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 10px;
    overflow: hidden;
}
.po-prod-name { color: #303133; line-height: 1.35; white-space: normal; word-break: break-word; }
.po-prod-zoho { color: #409eff; margin-left: 5px; font-size: 13px; text-decoration: none; cursor: pointer; }
.po-prod-zoho:hover { color: #66b1ff; }
.po-prod-sku { font-size: 12px; color: #909399; line-height: 1.3; margin-top: 1px; }
.po-prod-note { font-size: 12px; color: #E6A23C; line-height: 1.3; margin-top: 1px; white-space: normal; word-break: break-word; }
.po-action-dash { color: #c0c4cc; }
.more-btn {
    padding: 4px 4px !important;
    color: #909399;
    &:hover { color: #409eff; }
}
.po-order-card { margin: 0 0 14px; padding: 10px 12px; background: #f5f7fa; border: 1px solid #ebeef5; border-radius: 6px; }
.po-order-note { font-size: 12px; color: #E6A23C; line-height: 1.3; margin-top: 4px; word-break: break-word; }
.po-quote-tag { font-size: 10px; color: #909399; background: #f4f4f5; padding: 0 5px; border-radius: 8px; margin-left: 2px; }
.po-order-form ::v-deep .el-form-item { margin-bottom: 8px; }
.po-order-row { display: flex; gap: 12px; }
.po-order-col { flex: 1; margin-bottom: 0; }
.po-order-hint { font-size: 12px; color: #909399; margin-top: 4px; i { margin-right: 4px; } }
.po-dhl-link { color: #409eff; text-decoration: none; }
.po-dhl-link:hover { color: #66b1ff; text-decoration: underline; }
.po-dhl-sub { font-size: 12px; color: #909399; line-height: 1.3; margin-top: 1px; word-break: break-all; }
.po-status {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
}
.po-detail-note { margin-top: 12px; }
.po-detail-note-label { font-size: 13px; color: #606266; margin-bottom: 6px; }
.po-pager { margin-top: 12px; text-align: right; }
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
