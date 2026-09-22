<template>
    <div class="spp-page">
        <!-- Category tree: every line files under one purchase category; the
             count is the lines still to arrive. -->
        <tree-panel ref="treeRef" :tree-data="treeData" :title="$tp('Purchase Orders')" title-icon-class="el-icon-box"
            node-key="id" :default-expand-all="true" :show-search="false" @node-click="onNodeClick">
            <template #node="{ data }">
                <span class="spp-node">
                    <i :class="data.id === 'root' ? 'el-icon-notebook-2' : 'el-icon-document'" class="spp-node-icon" />
                    <span class="spp-node-label" :title="data.label">{{ data.label }}</span>
                    <span v-if="data.count != null" :class="['spp-node-count', { 'is-zero': !data.count }]" :title="$tp('Pending')">{{ data.count }}</span>
                </span>
            </template>
        </tree-panel>

        <div class="spp-main">
            <div class="spp-topbar">
                <el-checkbox v-model="openOnly" class="spp-toggle" @change="onOpenOnly">{{ $tp('Open orders only') }}</el-checkbox>
                <!-- Several pending lines with one supplier happen on the Order
                     Batches page (the list to send them comes from there). -->
                <el-button v-if="can('spp:order:supply')" size="small" icon="el-icon-document-checked"
                    @click="$router.push({ path: '/sparePartsPurchase/order-batches', query: { create: '1' } })">{{ $tp('Create Order Batch') }}</el-button>
                <el-button size="small" icon="el-icon-download" :loading="exporting" @click="exportList">{{ $tp('Export') }}</el-button>
                <el-button v-if="can('spp:order:create')" type="success" size="small" icon="el-icon-plus" @click="openCreate">{{ $tp('Create PO') }}</el-button>
                <el-button v-if="can('spp:batch:create')" type="warning" plain size="small" icon="el-icon-truck" @click="goCreateBatch">{{ $tp('Create Batch') }}</el-button>
                <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">{{ $tp('Refresh') }}</el-button>
            </div>

            <div class="spp-header">
                <div class="spp-h-title">{{ activeCategory ? catLabel(activeCategory) : $tp('All orders') }}</div>
            </div>

            <div class="spp-filters">
                <div class="spp-f-item">
                    <label>{{ $tp('Status') }}</label>
                    <el-select v-model="activeStatus" size="small" :placeholder="$tp('All statuses')" clearable
                        style="width:150px" @change="onStatusChange">
                        <el-option v-for="s in STATUS_LIST" :key="s.value" :label="$tp(s.label)" :value="s.value" />
                    </el-select>
                </div>
                <div class="spp-f-item">
                    <label>{{ $tp('Supplier') }}</label>
                    <el-select v-model="activeSupplier" size="small" :placeholder="$tp('All suppliers')" clearable filterable
                        style="width:180px" @change="reload">
                        <el-option v-for="s in suppliers" :key="s" :label="s" :value="s" />
                    </el-select>
                </div>
                <div class="spp-f-item spp-f-grow">
                    <label>{{ $tp('Search') }}</label>
                    <el-input v-model="search" size="small" clearable prefix-icon="el-icon-search"
                        :placeholder="$tp('Product, SKU, order no, supplier, tracking…')"
                        @keyup.enter.native="reload" @clear="reload" />
                </div>
                <el-button size="small" @click="resetFilters">{{ $tp('Reset') }}</el-button>
            </div>

            <!-- Status cards double as the status filter. -->
            <div class="spp-kpis">
                <div v-for="s in STATUS_LIST" :key="s.value" class="spp-kpi" :class="{ active: activeStatus === s.value }"
                    @click="toggleStatus(s.value)">
                    <div class="spp-kpi-icon" :style="{ background: s.bg, color: s.color }"><i :class="s.icon" /></div>
                    <div class="spp-kpi-body">
                        <div class="spp-kpi-label">{{ $tp(s.label) }}</div>
                        <div class="spp-kpi-count">{{ byStatus[s.value] || 0 }}</div>
                    </div>
                </div>
            </div>

            <el-table ref="table" v-loading="loading" :data="rows" size="mini" height="calc(100vh - 432px)" class="spp-table">
                <!-- The day the line was raised; the SP- number stays internal. -->
                <el-table-column :label="$tp('Date')" width="100" align="center" fixed>
                    <template slot-scope="s">{{ fmtDay(s.row.createdAt) }}</template>
                </el-table-column>
                <el-table-column :label="$tp('Product')" min-width="300" fixed>
                    <template slot-scope="s">
                        <div class="spp-prod-name">
                            {{ s.row.productName }}<a v-if="s.row.itemId" class="spp-prod-zoho" :href="zohoLink(s.row.itemId)"
                                target="_blank" rel="noopener" :title="$tp('Open in Zoho')"><i class="el-icon-link" /></a>
                        </div>
                        <div class="spp-sub">
                            <span v-if="s.row.sku">SKU: {{ s.row.sku }}</span>
                            <span v-if="s.row.category" class="spp-cat">{{ catLabel(s.row.category) }}</span>
                        </div>
                        <div v-if="s.row.note" class="spp-note">{{ $tp('Note') }}: {{ s.row.note }}</div>
                        <div v-if="s.row.splitFrom" class="spp-sub"><i class="el-icon-share" /> {{ $tp('Remainder of a short shipment') }}</div>
                        <div v-if="s.row.status === 'shortage' && s.row.shortageNote" class="spp-note spp-warn">{{ s.row.shortageNote }}</div>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Qty')" width="66" align="center">
                    <template slot-scope="s">{{ s.row.orderQty }}</template>
                </el-table-column>
                <el-table-column :label="$tp('Unit Price')" width="104" align="center">
                    <template slot-scope="s">
                        <span v-if="s.row.unitPrice != null">{{ yuan(s.row.unitPrice) }}</span>
                        <span v-else-if="s.row.quotedPrice != null">{{ yuan(s.row.quotedPrice) }} <span class="spp-quote-tag">{{ $tp('quote') }}</span></span>
                        <span v-else>—</span>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Supplier')" width="104" align="center" show-overflow-tooltip>
                    <template slot-scope="s">{{ s.row.supplier || '—' }}</template>
                </el-table-column>
                <el-table-column :label="$tp('Ordered')" width="122" align="center">
                    <template slot-scope="s">{{ fmtWhen(s.row.orderedAt) }}</template>
                </el-table-column>
                <el-table-column :label="$tp('Shipped')" width="160" align="center">
                    <template slot-scope="s">
                        <template v-if="s.row.shippedQty != null">
                            <div><b :class="s.row.shippedQty < s.row.orderQty ? 'spp-qty-short' : 'spp-qty-full'">{{ s.row.shippedQty }}</b><span class="spp-sub"> · {{ fmtDay(s.row.shippedAt) }}</span></div>
                            <div class="spp-sub">
                                <router-link v-if="s.row.batchNo" class="spp-link"
                                    :to="{ path: '/sparePartsPurchase/batches', query: { batch: s.row.batchNo } }">{{ s.row.batchNo }}</router-link>
                                <a v-if="s.row.tracking" class="spp-link" :href="dhlLink(s.row.tracking)" target="_blank"
                                    rel="noopener" :title="s.row.tracking">{{ s.row.tracking }}</a>
                            </div>
                        </template>
                        <span v-else>—</span>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Received')" width="104" align="center">
                    <template slot-scope="s">
                        <template v-if="s.row.receivedAt">
                            <div>{{ fmtDay(s.row.receivedAt) }}</div>
                            <div v-if="s.row.receivedQty != null && s.row.receivedQty !== s.row.shippedQty" class="spp-sub spp-warn">
                                {{ $tp('{n} received', { n: s.row.receivedQty }) }}</div>
                        </template>
                        <span v-else>—</span>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Status')" width="92" align="center">
                    <template slot-scope="s">
                        <span class="spp-status" :style="statusStyle(s.row.status)">{{ statusLabel(s.row.status) }}</span>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Actions')" align="center" width="136" fixed="right">
                    <template slot-scope="s">
                        <el-button v-if="can('spp:order:supply') && (s.row.status === 'pending' || s.row.status === 'shortage')"
                            size="mini" type="text" icon="el-icon-document-checked" @click="openPlace(s.row)">{{ $tp('Place order') }}</el-button>
                        <el-dropdown trigger="click" @command="(cmd) => cmd()">
                            <el-button size="mini" type="text" icon="el-icon-more" class="spp-more" />
                            <el-dropdown-menu slot="dropdown">
                                <el-dropdown-item :command="() => openDetail(s.row)" icon="el-icon-document">{{ $tp('Details') }}</el-dropdown-item>
                                <el-dropdown-item v-if="can('spp:order:supply') && ['pending', 'shortage', 'ordered'].includes(s.row.status)"
                                    :command="() => openQuote(s.row)" icon="el-icon-price-tag" divided>{{ $tp('Quote') }}</el-dropdown-item>
                                <el-dropdown-item v-if="can('spp:order:supply') && (s.row.status === 'pending' || s.row.status === 'ordered')"
                                    :command="() => markShortage(s.row)" icon="el-icon-remove-outline">{{ $tp('Shortage') }}</el-dropdown-item>
                                <el-dropdown-item v-if="canEither && (s.row.status === 'pending' || s.row.status === 'shortage')"
                                    :command="() => cancel(s.row)" icon="el-icon-circle-close">{{ $tp('Cancel order') }}</el-dropdown-item>
                                <el-dropdown-item v-if="canEither && (s.row.status === 'shortage' || s.row.status === 'cancelled')"
                                    :command="() => reopen(s.row)" icon="el-icon-refresh-left">{{ $tp('Reopen') }}</el-dropdown-item>
                            </el-dropdown-menu>
                        </el-dropdown>
                    </template>
                </el-table-column>
                <template slot="empty">
                    <span class="spp-empty">{{ $tp('No purchase orders here') }}</span>
                </template>
            </el-table>

            <div class="spp-pager">
                <el-pagination background layout="total, sizes, prev, pager, next, jumper" :total="total"
                    :page-size="pageSize" :page-sizes="[10, 20, 50, 100]" :current-page="page"
                    @current-change="onPage" @size-change="onSize" />
            </div>
        </div>

        <!-- ── Create PO ────────────────────────────────────────────── -->
        <el-dialog :visible.sync="createVisible" width="880px" append-to-body>
            <div slot="title" class="spp-dlg-head"><i class="el-icon-shopping-cart-2" /> {{ $tp('Create Purchase Order') }}</div>
            <el-form label-position="top" size="small" class="spp-create-form" @submit.native.prevent>
                <el-form-item :label="$tp('Add product')">
                    <el-autocomplete v-model="createSearch" :fetch-suggestions="fetchProducts" :debounce="300"
                        :placeholder="$tp('Type a product name or SKU…')" style="width:100%" value-key="name"
                        :trigger-on-focus="false" clearable prefix-icon="el-icon-search" popper-class="spp-suggestions"
                        @select="onProductPicked">
                        <template slot-scope="{ item }">
                            <div class="spp-suggestion">
                                <img v-if="item.imageUrl" :src="item.imageUrl" class="spp-suggestion-img" @error="hideImg($event)" />
                                <div v-else class="spp-suggestion-img spp-suggestion-ph"><i class="el-icon-picture-outline" /></div>
                                <div class="spp-suggestion-info">
                                    <div class="spp-suggestion-name">{{ item.name }}</div>
                                    <div class="spp-suggestion-meta">
                                        <span v-if="item.sku">SKU: {{ item.sku }}</span>
                                        <span v-if="item.classification"> · {{ item.classification }}</span>
                                        <span v-if="item.available != null"> · {{ $tp('stock {n}', { n: item.available }) }}</span>
                                    </div>
                                </div>
                            </div>
                        </template>
                    </el-autocomplete>
                </el-form-item>
            </el-form>
            <el-table :data="createLines" size="mini" border max-height="360" class="spp-lines"
                :empty-text="$tp('Search above to add one or more products')">
                <el-table-column :label="$tp('Product')" min-width="240">
                    <template slot-scope="{ row }">
                        <div class="spp-line-name" :title="row.productName">{{ row.productName }}</div>
                        <div class="spp-sub">SKU: {{ row.sku || '—' }}</div>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Category')" width="170">
                    <template slot-scope="{ row }">
                        <el-select v-model="row.category" :placeholder="$tp('Select')" size="mini" style="width:100%">
                            <el-option v-for="c in categoryOptions" :key="c" :label="catLabel(c)" :value="c" />
                        </el-select>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Qty')" width="120" align="center">
                    <template slot-scope="{ row }">
                        <el-input-number v-model="row.orderQty" :min="1" :precision="0" :step="1" size="mini"
                            controls-position="right" style="width:100%" />
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Note')" min-width="150">
                    <template slot-scope="{ row }">
                        <el-input v-model="row.note" size="mini" maxlength="200" :placeholder="$tp('Optional')" />
                    </template>
                </el-table-column>
                <el-table-column width="44" align="center">
                    <template slot-scope="{ $index }">
                        <el-button type="text" icon="el-icon-delete" class="spp-del" @click="createLines.splice($index, 1)" />
                    </template>
                </el-table-column>
            </el-table>
            <span slot="footer">
                <el-button size="small" @click="createVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button type="primary" size="small" icon="el-icon-check" :loading="creating" :disabled="!createLines.length"
                    @click="submitCreate">{{ $tp('Create {n} line(s)', { n: createLines.length }) }}</el-button>
            </span>
        </el-dialog>

        <!-- ── Place order (one line) ───────────────────────────────── -->
        <el-dialog :visible.sync="placeVisible" width="480px" append-to-body>
            <div slot="title" class="spp-dlg-head"><i class="el-icon-document-checked" /> {{ $tp('Place order') }}</div>
            <div v-if="placeRow" class="spp-card">
                <div class="spp-line-name" :title="placeRow.productName">{{ placeRow.productName }}</div>
                <div class="spp-sub">{{ fmtDay(placeRow.createdAt) }} · SKU: {{ placeRow.sku || '—' }} · {{ $tp('Qty') }} {{ placeRow.orderQty }}</div>
                <div v-if="placeRow.note" class="spp-note">{{ $tp('Note') }}: {{ placeRow.note }}</div>
            </div>
            <el-form label-position="top" size="small" @submit.native.prevent>
                <div class="spp-row">
                    <el-form-item :label="$tp('Supplier')" class="spp-col">
                        <el-select v-model="placeForm.supplier" :placeholder="$tp('Select or type')" filterable allow-create
                            default-first-option clearable style="width:100%">
                            <el-option v-for="s in suppliers" :key="s" :label="s" :value="s" />
                        </el-select>
                    </el-form-item>
                    <el-form-item :label="$tp('Unit Price') + ' (' + $tp('optional') + ')'" class="spp-col">
                        <el-input v-model="placeForm.unitPrice" type="number" min="0" placeholder="0.00" style="width:100%">
                            <template slot="prepend">¥</template>
                        </el-input>
                    </el-form-item>
                </div>
                <div class="spp-hint"><i class="el-icon-time" /> {{ $tp('The order time is recorded as now and the line moves to Ordered.') }}
                    {{ $tp('The price can wait until the line ships.') }}</div>
            </el-form>
            <span slot="footer">
                <el-button size="small" @click="placeVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button type="primary" size="small" icon="el-icon-check" :loading="placing" @click="submitPlace">{{ $tp('Confirm order') }}</el-button>
            </span>
        </el-dialog>

        <!-- ── Quote ────────────────────────────────────────────────── -->
        <el-dialog :visible.sync="quoteVisible" width="420px" append-to-body>
            <div slot="title" class="spp-dlg-head"><i class="el-icon-price-tag" /> {{ $tp('Quote') }}</div>
            <div v-if="quoteRow" class="spp-card">
                <div class="spp-line-name" :title="quoteRow.productName">{{ quoteRow.productName }}</div>
                <div class="spp-sub">{{ fmtDay(quoteRow.createdAt) }} · SKU: {{ quoteRow.sku || '—' }} · {{ $tp('Qty') }} {{ quoteRow.orderQty }}</div>
            </div>
            <el-form label-position="top" size="small" @submit.native.prevent>
                <el-form-item :label="$tp('Unit Price')">
                    <el-input v-model="quoteForm.unitPrice" type="number" min="0" placeholder="0.00" style="width:100%">
                        <template slot="prepend">¥</template>
                    </el-input>
                </el-form-item>
                <div class="spp-hint"><i class="el-icon-info" /> {{ $tp('A quote is a reference price only; the status does not change.') }}</div>
            </el-form>
            <span slot="footer">
                <el-button size="small" @click="quoteVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button type="primary" size="small" icon="el-icon-check" :loading="quoting" @click="submitQuote">{{ $tp('Save quote') }}</el-button>
            </span>
        </el-dialog>

        <!-- ── Details ──────────────────────────────────────────────── -->
        <el-dialog :visible.sync="detailVisible" width="680px" append-to-body>
            <div slot="title" class="spp-dlg-head"><i class="el-icon-document"></i> {{ $tp('Order details') }}<span v-if="detail" class="spp-dlg-no">{{ fmtDay(detail.createdAt) }}</span></div>
            <div v-loading="detailLoading">
                <el-descriptions v-if="detail" :column="2" border size="small" class="spp-detail">
                    <el-descriptions-item :label="$tp('Product')" :span="2">
                        {{ detail.productName }}<a v-if="detail.itemId" class="spp-prod-zoho" :href="zohoLink(detail.itemId)"
                            target="_blank" rel="noopener" :title="$tp('Open in Zoho')"><i class="el-icon-link" /></a>
                    </el-descriptions-item>
                    <el-descriptions-item label="SKU">{{ detail.sku || '—' }}</el-descriptions-item>
                    <el-descriptions-item :label="$tp('Category')">
                        <el-select v-if="editable" v-model="detailForm.category" size="mini" style="width:160px">
                            <el-option v-for="c in categoryOptions" :key="c" :label="catLabel(c)" :value="c" />
                        </el-select>
                        <span v-else>{{ catLabel(detail.category) }}</span>
                    </el-descriptions-item>
                    <el-descriptions-item :label="$tp('Status')">
                        <span class="spp-status" :style="statusStyle(detail.status)">{{ statusLabel(detail.status) }}</span>
                    </el-descriptions-item>
                    <el-descriptions-item :label="$tp('Supplier')">{{ detail.supplier || '—' }}</el-descriptions-item>
                    <el-descriptions-item :label="$tp('Qty')">
                        <el-input-number v-if="editable" v-model="detailForm.orderQty" :min="1" :precision="0" :step="1"
                            size="mini" controls-position="right" style="width:130px" />
                        <span v-else>{{ detail.orderQty }}</span>
                    </el-descriptions-item>
                    <el-descriptions-item :label="$tp('Unit Price')">
                        <span v-if="detail.unitPrice != null">{{ yuan(detail.unitPrice) }}</span>
                        <span v-else-if="detail.quotedPrice != null">{{ yuan(detail.quotedPrice) }} <span class="spp-quote-tag">{{ $tp('quote') }}</span></span>
                        <span v-else>—</span>
                    </el-descriptions-item>
                    <el-descriptions-item :label="$tp('Line total')">{{ yuan(detail.lineTotal) }}</el-descriptions-item>
                    <el-descriptions-item :label="$tp('Ordered')">{{ fmtWhen(detail.orderedAt) }}<span v-if="detail.orderedBy" class="spp-sub"> · {{ detail.orderedBy }}</span></el-descriptions-item>
                    <el-descriptions-item :label="$tp('Shipped')">
                        <template v-if="detail.shippedQty != null">{{ detail.shippedQty }} · {{ fmtDay(detail.shippedAt) }}
                            <router-link v-if="detail.batchNo" class="spp-link" :to="{ path: '/sparePartsPurchase/batches', query: { batch: detail.batchNo } }">{{ detail.batchNo }}</router-link>
                        </template>
                        <span v-else>—</span>
                    </el-descriptions-item>
                    <el-descriptions-item :label="$tp('Tracking')">
                        <a v-if="detail.tracking" class="spp-link" :href="dhlLink(detail.tracking)" target="_blank" rel="noopener">{{ detail.tracking }}</a>
                        <span v-else>—</span>
                    </el-descriptions-item>
                    <el-descriptions-item :label="$tp('Received')">
                        <template v-if="detail.receivedAt">{{ detail.receivedQty }} · {{ fmtDay(detail.receivedAt) }}<span v-if="detail.receivedBy" class="spp-sub"> · {{ detail.receivedBy }}</span></template>
                        <span v-else>—</span>
                    </el-descriptions-item>
                    <el-descriptions-item :label="$tp('Created')">{{ fmtWhen(detail.createdAt) }}<span v-if="detail.createdBy" class="spp-sub"> · {{ detail.createdBy }}</span></el-descriptions-item>
                </el-descriptions>
                <div v-if="detail" class="spp-detail-note">
                    <div class="spp-detail-label">{{ $tp('Note') }}</div>
                    <el-input v-if="can('spp:order:create')" v-model="detailForm.note" type="textarea" :rows="2" resize="none"
                        maxlength="200" show-word-limit :placeholder="$tp('Optional')" />
                    <div v-else>{{ detail.note || '—' }}</div>
                </div>
                <div v-if="detail && detail.history && detail.history.length" class="spp-history">
                    <div class="spp-detail-label">{{ $tp('History') }}</div>
                    <div v-for="(h, i) in detail.history" :key="i" class="spp-hist-row">
                        <span class="spp-hist-when">{{ fmtWhen(h.at) }}</span>
                        <span class="spp-hist-action">{{ actionLabel(h.action) }}</span>
                        <span v-if="h.by" class="spp-sub">{{ h.by }}</span>
                        <span v-if="h.detail" class="spp-sub">{{ detailText(h.detail) }}</span>
                    </div>
                </div>
            </div>
            <span slot="footer">
                <el-button size="small" @click="detailVisible = false">{{ $tp('Close') }}</el-button>
                <el-button v-if="can('spp:order:create')" type="primary" size="small" icon="el-icon-check" :loading="detailSaving"
                    @click="saveDetail">{{ $tp('Save') }}</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import TreePanel from '@/components/TreePanel'
import { hasPermission } from '@/utils/permission'
import * as XLSX from 'xlsx-js-style'
import {
    listOrders, getOrder, createOrders, updateOrder, quoteOrder, placeOrder, shortageOrder,
    cancelOrder, reopenOrder, searchProducts
} from '@/api/sparePartsPurchase'
import { STATUS_LIST, STATUS_META, CATEGORIES, isChannel, fmtDay, fmtWhen, yuan, dhlLink, zohoLink } from './shared'

// What each audit entry did — English source, translated through $tp.
const ACTION_LABELS = {
    created: 'Created', edited: 'Edited', quoted: 'Quoted', ordered: 'Placed with supplier', shortage: 'Marked shortage',
    cancelled: 'Cancelled', reopened: 'Reopened', shipped: 'Shipped', received: 'Received', unshipped: 'Batch cancelled'
}

export default {
    name: 'SppOrders',
    components: { TreePanel },
    data() {
        return {
            STATUS_LIST,
            rows: [],
            total: 0,
            page: 1,
            pageSize: 20,
            loading: false,
            byStatus: {},
            byCategory: {},
            categories: [],
            suppliers: [],
            activeCategory: '',
            activeStatus: '',
            activeSupplier: '',
            search: '',
            openOnly: true,
            treeInit: false,
            // Create PO — one line per product
            createVisible: false,
            createSearch: '',
            createLines: [],
            creating: false,
            // Place order — one row
            placeVisible: false,
            placeRow: null,
            placeForm: { supplier: '', unitPrice: undefined },
            placing: false,
            exporting: false,
            // Quote
            quoteVisible: false,
            quoteRow: null,
            quoteForm: { unitPrice: undefined },
            quoting: false,
            // Details (note / qty / category editable while pending)
            detailVisible: false,
            detail: null,
            detailLoading: false,
            detailForm: { note: '', orderQty: null, category: '' },
            detailSaving: false
        }
    },
    computed: {
        treeData() {
            // Every category, even empty — the count is the lines still
            // waiting to be placed (pending), in red.
            const cats = this.categories.length ? this.categories : CATEGORIES
            const pending = cat => (this.byCategory[cat] && this.byCategory[cat].pending) || 0
            const children = cats.map(cat => ({ id: cat, label: this.catLabel(cat), count: pending(cat) }))
            const total = Object.keys(this.byCategory).reduce((sum, cat) => sum + pending(cat), 0)
            return [{ id: 'root', label: this.$tp('All orders'), count: total, children }]
        },
        canEither() {
            return this.can('spp:order:create') || this.can('spp:order:supply')
        },
        editable() {
            return !!this.detail && this.detail.status === 'pending' && this.can('spp:order:create')
        },
        categoryOptions() {
            return this.categories.length ? this.categories : CATEGORIES
        }
    },
    created() {
        this.load()
    },
    // Coming back to the tab (kept alive by the tags bar) — e.g. from Order
    // Batches after placing lines — must show fresh data.
    activated() {
        this.load()
    },
    methods: {
        fmtDay, fmtWhen, yuan, dhlLink, zohoLink,
        can(p) {
            return hasPermission(this.$store.getters.permissions, p)
        },
        // Category names are stored in English (the register's words); the
        // page shows them in the app language.
        catLabel(c) {
            return c ? this.$tp(c) : '—'
        },
        statusLabel(v) {
            const m = STATUS_META[v]
            return m ? this.$tp(m.label) : v
        },
        statusStyle(v) {
            const m = STATUS_META[v]
            return m ? { color: m.color, background: m.bg } : {}
        },
        actionLabel(a) {
            return this.$tp(ACTION_LABELS[a] || a)
        },
        detailText(d) {
            if (!d || typeof d !== 'object') return String(d)
            return Object.keys(d).map(k => {
                const v = d[k]
                if (v && typeof v === 'object' && 'from' in v) return `${k}: ${v.from} → ${v.to}`
                return `${k}: ${v}`
            }).join(' · ')
        },
        msg(e, fallback) {
            return (e && (e.message || (e.response && e.response.data && e.response.data.message))) || fallback
        },
        // ── Loading ────────────────────────────────────────────────
        async load() {
            this.loading = true
            try {
                const r = await listOrders({
                    page: this.page,
                    pageSize: this.pageSize,
                    category: this.activeCategory || undefined,
                    status: this.activeStatus || undefined,
                    supplier: this.activeSupplier || undefined,
                    open: (!this.activeStatus && this.openOnly) ? 1 : undefined,
                    search: this.search || undefined
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.rows || []
                this.total = r.total || 0
                this.byStatus = r.byStatus || {}
                this.byCategory = r.byCategory || {}
                this.categories = r.categories || []
                this.suppliers = r.suppliers || []
                if (!this.treeInit) {
                    this.treeInit = true
                    this.$nextTick(() => {
                        if (this.$refs.treeRef && this.$refs.treeRef.setCurrentKey) this.$refs.treeRef.setCurrentKey('root')
                    })
                }
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load purchase orders')))
            } finally {
                this.loading = false
            }
        },
        reload() { this.page = 1; this.load() },
        onOpenOnly() {
            if (this.openOnly) this.activeStatus = ''
            this.reload()
        },
        onStatusChange() {
            if (this.activeStatus === 'received' || this.activeStatus === 'cancelled') this.openOnly = false
            this.reload()
        },
        toggleStatus(v) {
            this.activeStatus = this.activeStatus === v ? '' : v
            this.onStatusChange()
        },
        resetFilters() {
            this.activeStatus = ''
            this.activeSupplier = ''
            this.search = ''
            this.openOnly = true
            this.reload()
        },
        onNodeClick(data) {
            this.activeCategory = data.id === 'root' ? '' : data.id
            this.reload()
        },
        onPage(p) { this.page = p; this.load() },
        onSize(s) { this.pageSize = s; this.reload() },
        goCreateBatch() {
            this.$router.push({ path: '/sparePartsPurchase/batches', query: { create: '1' } })
        },
        // ── Create PO ──────────────────────────────────────────────
        openCreate() {
            this.createLines = []
            this.createSearch = ''
            this.createVisible = true
        },
        async fetchProducts(query, cb) {
            const q = (query || '').trim()
            if (!q) { cb([]); return }
            try {
                const r = await searchProducts(q)
                cb((r && r.products) || [])
            } catch (e) {
                cb([])
            }
        },
        onProductPicked(p) {
            this.createSearch = ''
            const dup = this.createLines.find(l => l.itemId && l.itemId === p.itemId)
            if (dup) { dup.orderQty += 1; return }
            // Files under the item's classification; under 海运 / Special
            // Order when that tab is open (the picker can still change it).
            this.createLines.push({
                itemId: p.itemId || null,
                sku: p.sku || '',
                productName: p.name || '',
                imageId: p.imageId || null,
                category: isChannel(this.activeCategory) ? this.activeCategory : (p.suggestedCategory || 'Other'),
                orderQty: 1,
                note: ''
            })
        },
        hideImg(e) {
            if (e && e.target) e.target.style.display = 'none'
        },
        async submitCreate() {
            for (let i = 0; i < this.createLines.length; i++) {
                const l = this.createLines[i]
                if (!l.category) { this.$message.warning(this.$tp('Line {n}: pick a category', { n: i + 1 })); return }
                if (!l.orderQty || l.orderQty < 1) { this.$message.warning(this.$tp('Line {n}: quantity must be at least 1', { n: i + 1 })); return }
            }
            this.creating = true
            try {
                const r = await createOrders(this.createLines)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('{n} purchase order(s) created', { n: r.created }))
                this.createVisible = false
                this.reload()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to create the purchase orders')))
            } finally {
                this.creating = false
            }
        },
        // ── Place / quote / shortage / cancel / reopen ─────────────
        openPlace(row) {
            this.placeRow = row
            this.placeForm = { supplier: row.supplier || '', unitPrice: row.unitPrice != null ? row.unitPrice : (row.quotedPrice != null ? row.quotedPrice : undefined) }
            this.placeVisible = true
        },
        async submitPlace() {
            if (!this.placeForm.supplier) { this.$message.warning(this.$tp('Supplier is required')); return }
            this.placing = true
            try {
                const r = await placeOrder(this.placeRow._id, { supplier: this.placeForm.supplier, unitPrice: this.placeForm.unitPrice })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('{no} placed with {supplier}', { no: this.placeRow.orderNo, supplier: this.placeForm.supplier }))
                this.placeVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to place the order')))
            } finally {
                this.placing = false
            }
        },
        // ── Export ─────────────────────────────────────────────────
        // The current tab (category, status / supplier / search filters, open
        // toggle) as an Excel sheet — every page of it.
        async exportList() {
            this.exporting = true
            try {
                const base = {
                    category: this.activeCategory || undefined,
                    status: this.activeStatus || undefined,
                    supplier: this.activeSupplier || undefined,
                    open: (!this.activeStatus && this.openOnly) ? 1 : undefined,
                    search: this.search || undefined,
                    sort: 'oldest',
                    pageSize: 200
                }
                const all = []
                for (let page = 1; page <= 50; page++) {
                    const r = await listOrders({ ...base, page })
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    all.push(...(r.rows || []))
                    if (all.length >= (r.total || 0) || !(r.rows || []).length) break
                }
                if (!all.length) { this.$message.info(this.$tp('Nothing to export')); return }
                const t = k => this.$tp(k)
                const data = all.map(r => ({
                    [t('Date')]: fmtDay(r.createdAt),
                    ['SKU']: r.sku || '',
                    [t('Product')]: r.productName || '',
                    [t('Category')]: this.catLabel(r.category),
                    [t('Qty')]: r.orderQty,
                    [t('Unit Price')]: r.unitPrice != null ? r.unitPrice : (r.quotedPrice != null ? r.quotedPrice : ''),
                    [t('Supplier')]: r.supplier || '',
                    [t('Status')]: this.statusLabel(r.status),
                    [t('Ordered')]: fmtWhen(r.orderedAt) === '—' ? '' : fmtWhen(r.orderedAt),
                    [t('Shipped Qty')]: r.shippedQty != null ? r.shippedQty : '',
                    [t('Batch')]: r.batchNo || '',
                    [t('Tracking')]: r.tracking || '',
                    [t('Received')]: fmtDay(r.receivedAt) === '—' ? '' : fmtDay(r.receivedAt),
                    [t('Note')]: r.note || ''
                }))
                const ws = XLSX.utils.json_to_sheet(data)
                ws['!cols'] = [10, 10, 60, 14, 6, 10, 12, 10, 16, 10, 10, 16, 10, 30].map(w => ({ wch: w }))
                const wb = XLSX.utils.book_new()
                const sheet = (this.activeCategory ? this.catLabel(this.activeCategory) : t('All orders')).replace(/[\\/?*[\]:]/g, ' ').slice(0, 30)
                XLSX.utils.book_append_sheet(wb, ws, sheet)
                XLSX.writeFile(wb, `${t('Purchase Orders')} - ${sheet} - ${fmtDay(new Date().toISOString())}.xlsx`)
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Export failed')))
            } finally {
                this.exporting = false
            }
        },
        openQuote(row) {
            this.quoteRow = row
            this.quoteForm = { unitPrice: row.quotedPrice != null ? row.quotedPrice : undefined }
            this.quoteVisible = true
        },
        async submitQuote() {
            const v = Number(this.quoteForm.unitPrice)
            if (this.quoteForm.unitPrice === undefined || this.quoteForm.unitPrice === '' || isNaN(v) || v < 0) {
                this.$message.warning(this.$tp('Enter a unit price of 0 or more')); return
            }
            this.quoting = true
            try {
                const r = await quoteOrder(this.quoteRow._id, v)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('Quote saved'))
                this.quoteVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save the quote')))
            } finally {
                this.quoting = false
            }
        },
        async markShortage(row) {
            let note = ''
            try {
                const r = await this.$prompt(this.$tp('Mark {no} as shortage? Add a note for iMobile if you like.', { no: row.orderNo }),
                    this.$tp('Shortage'), { confirmButtonText: this.$tp('Confirm'), cancelButtonText: this.$tp('Cancel'), inputPlaceholder: this.$tp('Optional') })
                note = (r && r.value) || ''
            } catch (e) { return }
            try {
                const r = await shortageOrder(row._id, note)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('{no} marked as shortage', { no: row.orderNo }))
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to update the order')))
            }
        },
        async cancel(row) {
            try {
                await this.$confirm(this.$tp('Cancel {no}? It can be reopened later.', { no: row.orderNo }), this.$tp('Cancel order'),
                    { type: 'warning', confirmButtonText: this.$tp('Cancel order'), cancelButtonText: this.$tp('Keep') })
            } catch (e) { return }
            try {
                const r = await cancelOrder(row._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('{no} cancelled', { no: row.orderNo }))
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to update the order')))
            }
        },
        async reopen(row) {
            try {
                const r = await reopenOrder(row._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('{no} is pending again', { no: row.orderNo }))
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to update the order')))
            }
        },
        // ── Details ────────────────────────────────────────────────
        async openDetail(row) {
            this.detail = row
            this.detailForm = { note: row.note || '', orderQty: row.orderQty, category: row.category || '' }
            this.detailVisible = true
            this.detailLoading = true
            try {
                const r = await getOrder(row._id)
                if (r && r.order) {
                    this.detail = r.order
                    this.detailForm = { note: r.order.note || '', orderQty: r.order.orderQty, category: r.order.category || '' }
                }
            } catch (e) { /* the row's copy stands */ } finally {
                this.detailLoading = false
            }
        },
        async saveDetail() {
            this.detailSaving = true
            try {
                const data = { note: this.detailForm.note }
                if (this.editable) { data.orderQty = this.detailForm.orderQty; data.category = this.detailForm.category }
                const r = await updateOrder(this.detail._id, data)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('Saved'))
                this.detailVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save')))
            } finally {
                this.detailSaving = false
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.spp-page { display: flex; height: calc(100vh - 84px); overflow: hidden; }
.spp-main { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 12px 16px 8px; background: #fff; }
.spp-node { display: flex; align-items: center; min-width: 0; width: 100%; }
.spp-node-icon { color: #909399; margin-right: 6px; flex-shrink: 0; }
.spp-node-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spp-node-count { flex-shrink: 0; margin-left: 8px; font-size: 11px; font-weight: 600; color: #f56c6c; font-variant-numeric: tabular-nums; }
.spp-node-count.is-zero { color: #c0c4cc; font-weight: 400; }
.spp-topbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.spp-toggle { margin-right: auto; }
.spp-header { margin-bottom: 8px; }
.spp-h-title { font-size: 18px; font-weight: 600; color: #303133; }
.spp-h-sub { font-size: 12px; color: #909399; margin-top: 2px; }
.spp-filters { display: flex; align-items: flex-end; gap: 12px; margin-bottom: 10px; }
.spp-f-item { display: flex; flex-direction: column; gap: 3px; }
.spp-f-item label { font-size: 12px; color: #909399; }
.spp-f-grow { flex: 1; min-width: 200px; }
.spp-kpis { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; margin-bottom: 10px; }
.spp-kpi { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid #ebeef5; border-radius: 6px; cursor: pointer; transition: box-shadow .15s;
    &:hover { box-shadow: 0 2px 8px rgba(0,0,0,.06); }
    &.active { border-color: #409eff; box-shadow: 0 0 0 1px #409eff inset; }
}
.spp-kpi-icon { width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 17px; flex-shrink: 0; }
.spp-kpi-label { font-size: 12px; color: #909399; }
.spp-kpi-count { font-size: 18px; font-weight: 600; color: #303133; line-height: 1.1; }
.spp-table { flex: 1; }
.spp-no { font-weight: 600; color: #303133; font-variant-numeric: tabular-nums; }
.spp-sub { font-size: 11px; color: #909399; }
.spp-cat { margin-left: 8px; padding: 0 5px; border-radius: 3px; background: #f4f4f5; color: #606266; }
.spp-note { font-size: 11px; color: #e6a23c; }
.spp-warn { color: #f56c6c; }
.spp-qty-full { color: #67c23a; }
.spp-qty-short { color: #e6a23c; }
.spp-prod-name { color: #303133; line-height: 1.35; }
.spp-prod-zoho { margin-left: 4px; color: #c0c4cc; &:hover { color: #409eff; } }
.spp-link { color: #409eff; text-decoration: none; margin-right: 6px; &:hover { text-decoration: underline; } }
.spp-quote-tag { font-size: 10px; color: #e6a23c; border: 1px solid #f5dab1; border-radius: 3px; padding: 0 3px; }
.spp-status { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; white-space: nowrap; }
.spp-more { margin-left: 4px; color: #909399; }
.spp-empty { color: #909399; }
.spp-pager { padding-top: 8px; text-align: right; }
.spp-dlg-head { font-size: 15px; font-weight: 600; color: #303133; i { color: #409eff; margin-right: 4px; } }
.spp-dlg-no { margin-left: 8px; font-weight: 400; color: #909399; font-size: 13px; }
.spp-create-form { margin-bottom: 6px; }
.spp-suggestion { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
.spp-suggestion-img { width: 36px; height: 36px; object-fit: contain; border-radius: 4px; border: 1px solid #ebeef5; background: #fff; }
.spp-suggestion-ph { display: flex; align-items: center; justify-content: center; color: #c0c4cc; }
.spp-suggestion-info { min-width: 0; line-height: 1.3; }
.spp-suggestion-name { white-space: normal; color: #303133; }
.spp-suggestion-meta { font-size: 11px; color: #909399; }
.spp-line-name { color: #303133; line-height: 1.3; }
.spp-del { color: #f56c6c; }
.spp-card { padding: 10px 12px; border: 1px solid #ebeef5; border-radius: 6px; background: #fafafa; margin-bottom: 12px; }
.spp-row { display: flex; gap: 12px; }
.spp-col { flex: 1; }
.spp-hint { font-size: 12px; color: #909399; i { margin-right: 3px; } }
.spp-detail-note { margin-top: 12px; }
.spp-detail-label { font-size: 12px; color: #909399; margin-bottom: 4px; }
.spp-history { margin-top: 12px; }
.spp-hist-row { display: flex; gap: 8px; font-size: 12px; padding: 3px 0; border-bottom: 1px dashed #f0f0f0; }
.spp-hist-when { color: #909399; font-variant-numeric: tabular-nums; white-space: nowrap; }
.spp-hist-action { color: #303133; }
</style>

<style lang="scss">
.spp-suggestions { min-width: 460px !important; li { line-height: 1.3 !important; padding: 4px 12px !important; } }
</style>
