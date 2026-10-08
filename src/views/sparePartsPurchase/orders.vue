<template>
    <div class="spp-page">
        <!-- Category tree: every line files under one purchase category; the
             count is the lines still to arrive. -->
        <tree-panel v-show="!isMobile" ref="treeRef" :tree-data="treeData" :title="$tp('Purchase Orders')" title-icon-class="el-icon-box"
            node-key="id" :default-expand-all="true" :show-search="false" @node-click="onNodeClick" @collapsed-change="onTreeToggle">
            <!-- New Product and Special Order are their own lists, pinned above
                 the tree (like Stock Monitoring's Dashboard / 海运) and kept out
                 of the tree and of "All orders". The count is the pending lines. -->
            <template #top>
                <div v-for="p in PINNED" :key="p.category" :class="['spp-pin', { on: activeCategory === p.category }]" @click="openPin(p.category)">
                    <i :class="p.icon" /> <span class="spp-pin-label">{{ catLabel(p.category) }}</span>
                    <span :class="['spp-node-count', { 'is-zero': !pendingOf(p.category) }]" :title="$tp('Pending')">{{ pendingOf(p.category) }}</span>
                </div>
            </template>
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
                <!-- Open lines by default (Received / Cancelled cards show the rest);
                     Zoho items are added here with Add Item (or from the Stock
                     Monitoring dashboard), a product not in Zoho yet with Order
                     New Product. Order
                     batches and shipment batches are made on their own pages
                     (the buttons left this bar on 2026-10-06). -->
                <!-- New Product / Special Order: the table by default (user 2026-10-06, while the
                     board is being rethought); Board is a switch for this visit only -->
                <el-radio-group v-if="isPinned" v-model="pinView" size="small" class="spp-view" @change="onPinView">
                    <el-radio-button label="board" :title="$tp('Board')"><i class="el-icon-s-grid" /><span v-if="!isMobile"> {{ $tp('Board') }}</span></el-radio-button>
                    <el-radio-button label="table" :title="$tp('Table')"><i :class="isMobile ? 'el-icon-s-order' : 'el-icon-tickets'" /><span v-if="!isMobile"> {{ $tp('Table') }}</span></el-radio-button>
                </el-radio-group>
                <!-- Add Item: Zoho items as Pending lines (not on the two pinned lists).
                     The parts supplier may add lines too, but not Special Orders. -->
                <el-button v-if="canAdd && !isPinned" type="primary" size="small" icon="el-icon-plus" @click="addVisible = true">{{ $tp('Add Item') }}</el-button>
                <el-button v-if="canAdd && (activeCategory !== 'Special Order' || canSpecial)" type="primary" size="small" :plain="!isPinned" :icon="isPinned ? 'el-icon-plus' : 'el-icon-circle-plus-outline'"
                    @click="openNewProduct">{{ $tp(activeCategory === 'Special Order' ? 'New Special Order' : (isMobile && !isPinned ? 'New Product' : 'Order New Product')) }}</el-button>
                <el-button size="small" icon="el-icon-download" :loading="exporting" :title="$tp('Export')" @click="exportList">{{ compact ? '' : $tp('Export') }}</el-button>
                <el-button size="small" icon="el-icon-refresh" :loading="loading" :title="$tp('Refresh')" @click="load">{{ compact ? '' : $tp('Refresh') }}</el-button>
            </div>

            <!-- phone: the tree is hidden, the lists are a strip (pending counts) -->
            <div v-if="isMobile" ref="mlists" class="spp-mlists">
                <span :class="['spp-mchip', { on: !activeCategory }]" @click="pickList('')">{{ $tp('All orders') }}<b v-if="treeData[0].count">{{ treeData[0].count }}</b></span>
                <span v-for="p in PINNED" :key="p.category" :class="['spp-mchip', 'is-pin', { on: activeCategory === p.category }]" @click="pickList(p.category)">
                    <i :class="p.icon" />{{ catLabel(p.category) }}<b v-if="pendingOf(p.category)">{{ pendingOf(p.category) }}</b></span>
                <span class="spp-mchip-sep" />
                <span v-for="c in treeData[0].children" :key="c.id" :class="['spp-mchip', { on: activeCategory === c.id }]" @click="pickList(c.id)">
                    {{ c.label }}<b v-if="c.count">{{ c.count }}</b></span>
            </div>

            <div v-if="!isMobile" class="spp-header">
                <div class="spp-h-title">{{ activeCategory ? catLabel(activeCategory) : $tp('All orders') }}</div>
                <div v-if="boardMode" class="spp-h-sub">{{ $tp('Supplier quotes → iMobile confirms → supplier orders and ships → iMobile receives') }}
                    <span v-if="boardCapped" class="spp-warn"> · {{ $tp('Showing the oldest {n} open lines', { n: 200 }) }}</span></div>
            </div>

            <channel-board v-if="boardMode" :rows="boardRows" :category="activeCategory" :loading="loading" :received-cap="BOARD_RECEIVED"
                :can="can" :can-either="canEither" :mobile="isMobile" @action="onBoardAction" />
            <template v-else>
            <div class="spp-filters">
                <div v-if="!isMobile" class="spp-f-item">
                    <label>{{ $tp('Status') }}</label>
                    <el-select v-model="activeStatus" size="small" :placeholder="$tp('All statuses')" clearable
                        style="width:150px" @change="onStatusChange">
                        <el-option v-for="s in STATUS_LIST" :key="s.value" :label="$tp(s.label)" :value="s.value" />
                    </el-select>
                </div>
                <div v-if="!isMobile || mFilters" class="spp-f-item">
                    <label>{{ $tp('Supplier') }}</label>
                    <el-select v-model="activeSupplier" size="small" :placeholder="$tp('All suppliers')" clearable filterable
                        :style="{ width: isMobile ? '100%' : '180px' }" @change="reload">
                        <el-option v-for="s in suppliers" :key="s" :label="s" :value="s" />
                    </el-select>
                </div>
                <div class="spp-f-item spp-f-grow">
                    <label>{{ $tp('Search') }}</label>
                    <el-input v-model="search" size="small" clearable prefix-icon="el-icon-search"
                        :placeholder="$tp('Product, SKU, order no, supplier, tracking…')"
                        @keyup.enter.native="reload" @clear="reload" />
                </div>
                <el-button v-if="isMobile" size="small" icon="el-icon-s-operation" :type="activeSupplier ? 'primary' : 'default'" :plain="!!activeSupplier"
                    :title="$tp('Filters')" class="spp-f-toggle" @click="mFilters = !mFilters" />
                <el-button v-if="!isMobile || mFilters" size="small" @click="resetFilters">{{ $tp('Reset') }}</el-button>
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

            <!-- Height is measured (whatever the header rows take on this screen);
                 `compact` drops the wide columns and folds their facts into the
                 product cell. -->
            <!-- phone: the lines as cards, with the table's actions -->
            <div v-if="isMobile" v-loading="loading" class="spp-mcards">
                <order-card v-for="r in rows" :key="r._id" :row="r" :can="can" :can-either="canEither" show-status detailed :placeholder="false"
                    @action="onBoardAction" />
                <div v-if="!rows.length && !loading" class="spp-empty spp-mempty">{{ $tp('No purchase orders here') }}</div>
            </div>
            <el-table v-else ref="table" v-loading="loading" :data="rows" size="mini" :height="tableHeight" class="spp-table">
                <!-- The day the line was raised; the SP- number stays internal. -->
                <el-table-column :label="$tp('Date')" :width="compact ? 92 : 100" align="center" :fixed="!compact">
                    <template slot-scope="s">{{ fmtDay(s.row.createdAt) }}</template>
                </el-table-column>
                <el-table-column :label="$tp('Product')" :min-width="compact ? 220 : 300" :fixed="!compact">
                    <template slot-scope="s">
                        <div class="spp-prod-name">
                            {{ s.row.productName }}<a v-if="s.row.itemId" class="spp-prod-zoho" :href="zohoLink(s.row.itemId)"
                                target="_blank" rel="noopener" :title="$tp('Open in Zoho')"><i class="el-icon-link" /></a>
                        </div>
                        <div class="spp-sub">
                            <span v-if="s.row.sku">SKU: {{ s.row.sku }}</span>
                            <span v-if="s.row.category" class="spp-cat">{{ catLabel(s.row.category) }}</span>
                            <span v-if="s.row.requestedFor" class="spp-for"><i class="el-icon-user" /> {{ s.row.requestedFor }}</span>
                            <span v-if="s.row.urgent" class="spp-urgent">{{ $tp('Urgent') }}</span>
                            <span v-if="s.row.images && s.row.images.length" class="spp-photos" :title="$tp('Photos')" @click="openDetail(s.row)">
                                <i class="el-icon-picture" /> {{ s.row.images.length }}</span>
                            <!-- Small screens: the supplier and order date live here instead of their own columns. -->
                            <span v-if="compact && s.row.supplier" class="spp-fold">· {{ s.row.supplier }}</span>
                            <span v-if="compact && s.row.orderedAt" class="spp-fold">· {{ $tp('Ordered') }} {{ fmtDay(s.row.orderedAt) }}</span>
                            <!-- Went through To Confirm and was confirmed — the mark stays. -->
                            <span v-if="s.row.confirmed" class="spp-tag-ok" :title="confirmedTitle(s.row.confirmed)">
                                <i class="el-icon-circle-check" /> {{ $tp('Confirmed') }}</span>
                            <!-- A New Product / Special Order is quoted, then confirmed, before it is ordered. -->
                            <span v-if="awaitsQuote(s.row)" class="spp-tag-quote" :title="$tp('Quote it first; the quote moves it to To Confirm.')">
                                <i class="el-icon-price-tag" /> {{ $tp('Needs a quote') }}</span>
                            <!-- a New Product not in Zoho yet: make the item there (user ask 2026-10-08) -->
                            <a v-if="canZohoCreate(s.row)" class="spp-zoho-create" @click="openZohoCreate(s.row)">
                                <i class="el-icon-upload2" /> {{ $tp('Create in Zoho') }}</a>
                        </div>
                        <div v-if="s.row.note" class="spp-note">{{ $tp('Note') }}: {{ s.row.note }}</div>
                        <div v-if="s.row.splitFrom" class="spp-sub"><i class="el-icon-share" /> {{ $tp('Remainder of a short shipment') }}</div>
                        <div v-if="s.row.status === 'shortage' && s.row.shortageNote" class="spp-note spp-warn">{{ s.row.shortageNote }}</div>
                        <div v-if="s.row.status === 'toConfirm' && s.row.confirmNote" class="spp-note spp-confirm"><i class="el-icon-question" /> {{ s.row.confirmNote }}</div>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Qty')" :width="compact ? 56 : 66" align="center">
                    <template slot-scope="s">{{ s.row.orderQty }}</template>
                </el-table-column>
                <!-- An ordered line's price is changed inline (click the price →
                     number + ✓ / ✗, Enter saves, Esc cancels). Save runs on
                     click (after the input's blur commits), cancel on
                     mousedown (before a re-render swallows it) — as on Order
                     Batches. -->
                <el-table-column :label="$tp('Unit Price')" :width="compact ? 128 : 136" align="center">
                    <template slot-scope="s">
                        <div v-if="priceEdit.id === s.row._id" class="spp-pedit" @click.stop>
                            <el-input-number v-model="priceEdit.value" size="mini" :min="0" :precision="2" :controls="false"
                                class="spp-pinput" placeholder="¥" @keyup.enter.native="priceEnter($event, s.row)" @keyup.esc.native="cancelPriceEdit" />
                            <el-button type="text" size="mini" icon="el-icon-check" class="spp-psave" :loading="priceSaving" @click="savePrice(s.row)" />
                            <el-button type="text" size="mini" icon="el-icon-close" class="spp-pcancel" @mousedown.native.prevent="cancelPriceEdit" />
                        </div>
                        <div v-else :class="{ 'spp-pview': canPrice(s.row) }" :title="canPrice(s.row) ? $tp('Click to change the unit price') : ''"
                            @click="canPrice(s.row) && startPriceEdit(s.row)">
                            <span v-if="s.row.unitPrice != null">{{ yuan(s.row.unitPrice) }}</span>
                            <span v-else-if="s.row.quotedPrice != null">{{ yuan(s.row.quotedPrice) }} <span class="spp-quote-tag">{{ $tp('quote') }}</span></span>
                            <span v-else>—</span>
                            <i v-if="canPrice(s.row)" class="el-icon-edit spp-pencil" />
                        </div>
                    </template>
                </el-table-column>
                <el-table-column v-if="!compact" :label="$tp('Supplier')" width="104" align="center" show-overflow-tooltip>
                    <template slot-scope="s">{{ s.row.supplier || '—' }}</template>
                </el-table-column>
                <el-table-column v-if="!compact" :label="$tp('Ordered')" width="122" align="center">
                    <template slot-scope="s">{{ fmtWhen(s.row.orderedAt) }}</template>
                </el-table-column>
                <el-table-column :label="$tp('Shipped')" :width="compact ? 118 : 160" align="center">
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
                <el-table-column v-if="!compact" :label="$tp('Received')" width="104" align="center">
                    <template slot-scope="s">
                        <template v-if="s.row.receivedAt">
                            <div>{{ fmtDay(s.row.receivedAt) }}</div>
                            <div v-if="s.row.receivedQty != null && s.row.receivedQty !== s.row.shippedQty" class="spp-sub spp-warn">
                                {{ $tp('{n} received', { n: s.row.receivedQty }) }}</div>
                        </template>
                        <span v-else>—</span>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Status')" :width="compact ? 84 : 92" align="center">
                    <template slot-scope="s">
                        <span class="spp-status" :style="statusStyle(s.row.status)">{{ statusLabel(s.row.status) }}</span>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Actions')" align="center" :width="compact ? 124 : 176" fixed="right">
                    <template slot-scope="s">
                        <!-- Details is always one click away; the rest sits under "…".
                             Small screens: icons only, the words in tooltips. -->
                        <el-tooltip :content="$tp('Details')" placement="top">
                            <el-button size="mini" type="text" icon="el-icon-view" @click="openDetail(s.row)" />
                        </el-tooltip>
                        <!-- The part label, on any line (was ordered-only until 2026-09-30) —
                             one; copies are set when printing. -->
                        <el-tooltip :content="$tp('Print label')" placement="top">
                            <el-button size="mini" type="text" icon="el-icon-printer" class="spp-act-label" @click="printLineLabels(s.row)" />
                        </el-tooltip>
                        <el-tooltip v-if="can('spp:order:supply') && awaitsQuote(s.row)" :content="$tp('Quote')" placement="top" :disabled="!compact">
                            <el-button size="mini" type="text" icon="el-icon-price-tag" class="spp-act-quote" @click="openQuote(s.row)">{{ compact ? '' : $tp('Quote') }}</el-button>
                        </el-tooltip>
                        <el-tooltip v-else-if="can('spp:order:supply') && (s.row.status === 'pending' || s.row.status === 'shortage')"
                            :content="$tp('Place order')" placement="top" :disabled="!compact">
                            <el-button size="mini" type="text" icon="el-icon-document-checked" @click="openPlace(s.row)">{{ compact ? '' : $tp('Place order') }}</el-button>
                        </el-tooltip>
                        <!-- A parked line: the decision is the main action. -->
                        <el-tooltip v-if="canEither && s.row.status === 'toConfirm'" :content="$tp('Confirm')" placement="top" :disabled="!compact">
                            <el-button size="mini" type="text" icon="el-icon-check" class="spp-act-confirm" @click="confirm(s.row)">{{ compact ? '' : $tp('Confirm') }}</el-button>
                        </el-tooltip>
                        <el-dropdown v-if="['pending', 'toConfirm', 'ordered', 'shortage', 'cancelled'].includes(s.row.status)"
                            trigger="click" @command="(cmd) => cmd()">
                            <el-button size="mini" type="text" icon="el-icon-more" class="spp-more" />
                            <el-dropdown-menu slot="dropdown">
                                <el-dropdown-item v-if="can('spp:order:supply') && ['pending', 'shortage', 'ordered', 'toConfirm'].includes(s.row.status)"
                                    :command="() => openQuote(s.row)" icon="el-icon-price-tag">{{ $tp('Quote') }}</el-dropdown-item>
                                <el-dropdown-item v-if="canEither && ['pending', 'ordered', 'shortage'].includes(s.row.status) && !awaitsQuote(s.row)"
                                    :command="() => toConfirm(s.row)" icon="el-icon-question">{{ $tp('To Confirm') }}</el-dropdown-item>
                                <el-dropdown-item v-if="can('spp:order:supply') && (s.row.status === 'pending' || s.row.status === 'ordered')"
                                    :command="() => markShortage(s.row)" icon="el-icon-remove-outline">{{ $tp('Shortage') }}</el-dropdown-item>
                                <el-dropdown-item v-if="canEither && ['pending', 'shortage', 'toConfirm'].includes(s.row.status)"
                                    :command="() => cancel(s.row)" icon="el-icon-circle-close" divided>{{ $tp('Cancel order') }}</el-dropdown-item>
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
                <el-pagination background :small="isMobile" :pager-count="isMobile ? 5 : 7"
                    :layout="isMobile ? 'total, prev, pager, next' : 'total, sizes, prev, pager, next, jumper'" :total="total"
                    :page-size="pageSize" :page-sizes="[10, 20, 50, 100]" :current-page="page"
                    @current-change="onPage" @size-change="onSize" />
            </div>
            </template>
        </div>

        <!-- ── Add Item: Zoho items from the register → Pending lines ── -->
        <add-item-dialog :visible.sync="addVisible" :default-sea="activeCategory === '海运'" :mobile="isMobile" @added="load" />

        <!-- ── Place order (one line) ───────────────────────────────── -->
        <el-dialog :visible.sync="placeVisible" :width="dlgWidth('480px')" :custom-class="mDlg" append-to-body>
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
            <span slot="footer" class="spp-dlg-foot">
                <el-button size="small" @click="placeVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button type="primary" size="small" icon="el-icon-check" :loading="placing" @click="submitPlace">{{ $tp('Confirm order') }}</el-button>
            </span>
        </el-dialog>

        <!-- ── Order New Product / Special Order: a product not in Zoho yet,
             or one ordered for someone. Both are quoted first, confirmed,
             then ordered as usual (user rules 2026-10-06). ───────────── -->
        <el-dialog :visible.sync="newVisible" :width="dlgWidth('600px')" :top="isMobile ? '3vh' : '15vh'" append-to-body :custom-class="'spp-np-dlg ' + mDlg"
            @opened="focusNewName" @closed="clearNewFiles">
            <div slot="title" class="spp-dlg-head"><i :class="isSpecial ? 'el-icon-star-off' : 'el-icon-circle-plus-outline'" /> {{ $tp(isSpecial ? 'New Special Order' : 'Order New Product') }}</div>
            <!-- a screenshot pasted anywhere in the dialog becomes a photo -->
            <div @paste="onNewPaste">
                <!-- which list it goes on -->
                <div class="spp-np-types">
                    <div v-for="t in newTypes" :key="t.category" :class="['spp-np-type', { on: newForm.category === t.category }]" @click="newForm.category = t.category">
                        <i :class="t.icon" class="spp-np-type-icon" />
                        <div class="spp-np-type-text">
                            <div class="spp-np-type-title">{{ catLabel(t.category) }}</div>
                            <div class="spp-np-type-sub">{{ $tp(t.sub) }}</div>
                        </div>
                        <i v-if="newForm.category === t.category" class="el-icon-success spp-np-type-tick" />
                    </div>
                </div>
                <!-- the road both take -->
                <div v-if="!isMobile" class="spp-np-steps">
                    <span class="spp-np-step is-now"><b>1</b>{{ $tp('Order it') }}</span>
                    <i class="el-icon-arrow-right" />
                    <span class="spp-np-step"><b>2</b>{{ $tp('Supplier quotes') }}</span>
                    <i class="el-icon-arrow-right" />
                    <span class="spp-np-step"><b>3</b>{{ $tp('You confirm') }}</span>
                    <i class="el-icon-arrow-right" />
                    <span class="spp-np-step"><b>4</b>{{ $tp('Ordered as usual') }}</span>
                </div>
                <el-form label-position="top" size="small" class="spp-np-form" @submit.native.prevent>
                    <div class="spp-row">
                        <el-form-item :label="$tp('Product name')" required class="spp-col">
                            <el-input ref="newName" v-model="newForm.productName" maxlength="200" clearable
                                :placeholder="$tp('e.g. Samsung Galaxy Z Flip 7 FE (F761) Main Battery')" @keyup.enter.native="submitNewProduct(false)" />
                        </el-form-item>
                        <el-form-item :label="$tp('Quantity')" required class="spp-np-qty">
                            <el-input-number v-model="newForm.orderQty" :min="1" :max="99999" :precision="0" controls-position="right" style="width:110px" />
                        </el-form-item>
                    </div>
                    <!-- a Special Order says who it is for, and whether it is urgent -->
                    <div v-if="isSpecial" class="spp-row">
                        <el-form-item :label="$tp('For')" class="spp-col">
                            <el-select v-model="newForm.requestedFor" filterable allow-create default-first-option clearable
                                :placeholder="$tp('Who is it for? Pick or type')" style="width:100%">
                                <el-option v-for="n in REQUESTED_FOR" :key="n" :label="n" :value="n" />
                            </el-select>
                        </el-form-item>
                        <el-form-item :label="$tp('Urgent')" class="spp-np-urgent">
                            <el-checkbox v-model="newForm.urgent" border>{{ $tp('Urgent') }}</el-checkbox>
                        </el-form-item>
                    </div>
                    <el-form-item :label="$tp('Note')">
                        <el-input v-model="newForm.note" type="textarea" :rows="2" resize="none" maxlength="500"
                            :placeholder="$tp('Optional — a link, a photo reference, the colour…')" />
                    </el-form-item>
                    <el-form-item class="spp-np-photo-item">
                        <span slot="label">{{ $tp('Photos') }} <span class="spp-np-opt">{{ $tp('optional — click, or paste a screenshot') }}</span></span>
                        <el-upload action="#" list-type="picture-card" accept="image/*" multiple :auto-upload="false" :limit="MAX_IMAGES"
                            :file-list="newFiles" :on-change="onNewFiles" :on-remove="onNewFiles" :on-exceed="onNewExceed" :on-preview="previewNewFile"
                            :class="['spp-np-photos', { full: newFiles.length >= MAX_IMAGES }]">
                            <i class="el-icon-plus" />
                        </el-upload>
                    </el-form-item>
                </el-form>
                <!-- "Save & add another" keeps the dialog open; what went in shows here -->
                <div v-if="newAdded.length" class="spp-np-added">
                    <div class="spp-np-added-title"><i class="el-icon-circle-check" /> {{ $tp('Added just now') }} ({{ newAdded.length }})</div>
                    <div v-for="a in newAdded" :key="a.no" class="spp-np-added-row">
                        <i :class="a.category === 'Special Order' ? 'el-icon-star-off' : 'el-icon-circle-plus-outline'" class="spp-np-added-icon" />
                        <span class="spp-np-added-name" :title="a.name">{{ a.name }}</span>
                        <span v-if="a.requestedFor" class="spp-for">{{ a.requestedFor }}</span>
                        <span v-if="a.urgent" class="spp-urgent">{{ $tp('Urgent') }}</span>
                        <span v-if="a.photos" class="spp-sub"><i class="el-icon-picture" /> {{ a.photos }}</span>
                        <b>× {{ a.qty }}</b>
                    </div>
                </div>
            </div>
            <span slot="footer" class="spp-dlg-foot">
                <el-button size="small" @click="newVisible = false">{{ newAdded.length ? $tp('Done') : $tp('Cancel') }}</el-button>
                <el-button size="small" icon="el-icon-plus" :loading="newSaving === 'again'" :disabled="!!newSaving"
                    @click="submitNewProduct(true)">{{ $tp('Save & add another') }}</el-button>
                <el-button type="primary" size="small" icon="el-icon-check" :loading="newSaving === 'close'" :disabled="!!newSaving"
                    @click="submitNewProduct(false)">{{ $tp(isSpecial ? 'New Special Order' : 'Order New Product') }}</el-button>
            </span>
        </el-dialog>

        <!-- ── Quote ────────────────────────────────────────────────── -->
        <el-dialog :visible.sync="quoteVisible" :width="dlgWidth('420px')" :custom-class="mDlg" append-to-body>
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
                <!-- "Quote, then confirm": the line parks in To Confirm with the price. -->
                <el-form-item v-if="quoteRow && quoteRow.status !== 'toConfirm' && !awaitsQuote(quoteRow)">
                    <el-checkbox v-model="quoteForm.toConfirm">{{ $tp('Move to To Confirm') }}</el-checkbox>
                </el-form-item>
                <el-form-item v-if="quoteForm.toConfirm && quoteRow && quoteRow.status !== 'toConfirm'" :label="$tp('Needs confirming')">
                    <el-input v-model="quoteForm.note" type="textarea" :rows="2" resize="none" maxlength="200" show-word-limit
                        :placeholder="awaitsQuote(quoteRow) ? $tp('Optional') : $tp('What needs confirming?')" />
                </el-form-item>
                <div v-if="quoteRow && awaitsQuote(quoteRow)" class="spp-hint"><i class="el-icon-question" />
                    {{ $tp('This line goes to To Confirm with its quote; once confirmed it is ordered as usual.') }}</div>
                <div v-else-if="quoteForm.toConfirm && quoteRow && quoteRow.status !== 'toConfirm'" class="spp-hint"><i class="el-icon-question" />
                    {{ $tp('The line parks in To Confirm with this quote; confirm it to carry on.') }}</div>
                <div v-else class="spp-hint"><i class="el-icon-info" /> {{ $tp('A quote is a reference price only; the status does not change.') }}</div>
            </el-form>
            <span slot="footer" class="spp-dlg-foot">
                <el-button size="small" @click="quoteVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button type="primary" size="small" icon="el-icon-check" :loading="quoting" @click="submitQuote">{{ $tp('Save quote') }}</el-button>
            </span>
        </el-dialog>

        <!-- ── a New Product line → a Zoho item ─────────────────────── -->
        <create-zoho-item-dialog :visible.sync="zohoVisible" :order="zohoOrder" @created="onZohoCreated" />

        <!-- ── Details ──────────────────────────────────────────────── -->
        <el-dialog :visible.sync="detailVisible" :width="dlgWidth('680px')" :top="isMobile ? '3vh' : '15vh'" :custom-class="mDlg" append-to-body @closed="onDetailClosed">
            <div slot="title" class="spp-dlg-head"><i class="el-icon-document"></i> {{ $tp('Order details') }}<span v-if="detail" class="spp-dlg-no">{{ fmtDay(detail.createdAt) }}</span></div>
            <div v-loading="detailLoading">
                <el-descriptions v-if="detail" :column="isMobile ? 1 : 2" border size="small" class="spp-detail">
                    <el-descriptions-item :label="$tp('Product')" :span="2">
                        {{ detail.productName }}<a v-if="detail.itemId" class="spp-prod-zoho" :href="zohoLink(detail.itemId)"
                            target="_blank" rel="noopener" :title="$tp('Open in Zoho')"><i class="el-icon-link" /></a>
                        <span v-if="detail.sku" class="spp-sub"> · SKU {{ detail.sku }}</span>
                        <el-button v-if="canZohoCreate(detail)" size="mini" type="primary" plain icon="el-icon-upload2" class="spp-zoho-btn"
                            @click="openZohoCreate(detail)">{{ $tp('Create in Zoho') }}</el-button>
                    </el-descriptions-item>
                    <!-- a Special Order: who it is for, urgent (editable any time) -->
                    <el-descriptions-item v-if="isSpecialDetail" :label="$tp('For')">
                        <el-select v-if="can('spp:order:create')" v-model="detailForm.requestedFor" size="mini" filterable allow-create
                            default-first-option clearable :placeholder="$tp('Pick or type')" style="width:160px">
                            <el-option v-for="n in REQUESTED_FOR" :key="n" :label="n" :value="n" />
                        </el-select>
                        <span v-else>{{ detail.requestedFor || '—' }}</span>
                    </el-descriptions-item>
                    <el-descriptions-item v-if="isSpecialDetail" :label="$tp('Urgent')">
                        <el-checkbox v-if="can('spp:order:create')" v-model="detailForm.urgent">{{ $tp('Urgent') }}</el-checkbox>
                        <span v-else-if="detail.urgent" class="spp-urgent">{{ $tp('Urgent') }}</span>
                        <span v-else>—</span>
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
                    <el-descriptions-item v-if="detail.status === 'toConfirm'" :label="$tp('Needs confirming')" :span="2">
                        <span class="spp-confirm">{{ detail.confirmNote || '—' }}</span>
                        <span class="spp-sub"> · {{ $tp('back to Pending once confirmed') }}</span>
                    </el-descriptions-item>
                    <el-descriptions-item v-if="detail.confirmed" :label="$tp('Confirmed')" :span="2">
                        <span class="spp-tag-ok"><i class="el-icon-circle-check" /> {{ fmtWhen(detail.confirmed.at) }}<span v-if="detail.confirmed.by"> · {{ detail.confirmed.by }}</span></span>
                        <span v-if="detail.confirmed.question" class="spp-sub"> · {{ detail.confirmed.question }}</span>
                        <span v-if="detail.confirmed.answer" class="spp-sub"> → {{ detail.confirmed.answer }}</span>
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
                <!-- photos: saved straight away (not with Save) -->
                <div v-if="detail" class="spp-detail-note">
                    <div class="spp-detail-label">{{ $tp('Photos') }} <span class="spp-sub">{{ (detail.images || []).length }} / {{ MAX_IMAGES }}</span></div>
                    <div class="spp-photo-row">
                        <div v-for="im in detail.images || []" :key="im.id" class="spp-photo">
                            <el-image :src="im.url" fit="cover" :preview-src-list="(detail.images || []).map(i => i.url)" class="spp-photo-img" />
                            <i v-if="canEither" class="el-icon-close spp-photo-del" :title="$tp('Remove photo')" @click="removePhoto(im)" />
                        </div>
                        <el-upload v-if="canEither && (detail.images || []).length < MAX_IMAGES" action="#" :show-file-list="false" accept="image/*"
                            :http-request="addPhoto" :disabled="photoBusy" class="spp-photo-add">
                            <div v-loading="photoBusy" class="spp-photo-add-box"><i class="el-icon-plus" /></div>
                        </el-upload>
                        <span v-if="!(detail.images || []).length && !canEither" class="spp-sub">—</span>
                    </div>
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
            <span slot="footer" class="spp-dlg-foot">
                <el-button size="small" @click="detailVisible = false">{{ $tp('Close') }}</el-button>
                <el-button v-if="can('spp:order:create')" type="primary" size="small" icon="el-icon-check" :loading="detailSaving"
                    @click="saveDetail">{{ $tp('Save') }}</el-button>
            </span>
        </el-dialog>

        <!-- ── Part labels (50×40: product name + SKU barcode), the PDF
             previewed, then printed or saved ─────────────────────────── -->
        <el-dialog :title="labelTitle" :visible.sync="labelVisible" :width="dlgWidth('560px')" :custom-class="mDlg" append-to-body top="5vh" @closed="cleanupLabels">
            <!-- Portrait = the same label turned 90° on a 40 × 50 page, for a
                 printer whose label stock runs the other way; remembered. -->
            <div class="label-orient">
                <span>{{ $tp('Orientation') }}</span>
                <el-radio-group v-model="labelOrientation" size="mini" @change="onLabelOrientation">
                    <el-radio-button label="portrait">{{ $tp('Portrait') }}</el-radio-button>
                    <el-radio-button label="landscape">{{ $tp('Landscape') }}</el-radio-button>
                </el-radio-group>
                <span class="label-orient-gap">{{ $tp('Size') }}</span>
                <el-radio-group v-model="labelSize" size="mini" @change="onLabelSize">
                    <el-radio-button v-for="z in LABEL_SIZES" :key="z.key" :label="z.key">{{ $tp(z.label) }}</el-radio-button>
                </el-radio-group>
                <span v-if="labelSize === '40x30x2'">{{ $tp('The label prints twice, side by side — each copy in the printer dialog gives 2') }}</span>
            </div>
            <iframe v-if="labelUrl" :src="labelUrl" class="spp-label-frame" title="labels" />
            <span slot="footer" class="spp-dlg-foot">
                <el-button size="small" icon="el-icon-download" @click="downloadLabels">{{ $tp('Download') }}</el-button>
                <el-button size="small" @click="labelVisible = false">{{ $tp('Close') }}</el-button>
                <el-button type="primary" size="small" icon="el-icon-printer" @click="printLabels">{{ $tp('Print') }}</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import TreePanel from '@/components/TreePanel'
import ChannelBoard from './components/ChannelBoard'
import OrderCard from './components/OrderCard'
import AddItemDialog from './components/AddItemDialog'
import CreateZohoItemDialog from './components/CreateZohoItemDialog'
import { hasPermission } from '@/utils/permission'
import * as XLSX from 'xlsx-js-style'
import {
    listOrders, getOrder, updateOrder, quoteOrder, placeOrder, priceOrder, shortageOrder,
    cancelOrder, reopenOrder, toConfirmOrder, confirmOrder, createOrders, uploadOrderImage, deleteOrderImage
} from '@/api/sparePartsPurchase'
import { STATUS_LIST, STATUS_META, CATEGORIES, REQUESTED_FOR, MAX_IMAGES, awaitsQuote as needsQuote, fmtDay, fmtWhen, yuan, dhlLink, zohoLink } from './shared'

// The channels with a list of their own, pinned above the category tree and
// left out of the tree and of "All orders" (user ask 2026-10-06).
const PINNED = [
    { category: 'New Product', icon: 'el-icon-circle-plus-outline' },
    { category: 'Special Order', icon: 'el-icon-star-off' }
]
const PINNED_CATS = PINNED.map(p => p.category)
// What the Order New Product dialog can raise.
const NEW_TYPES = [
    { category: 'New Product', icon: 'el-icon-circle-plus-outline', sub: 'A product not in Zoho yet' },
    { category: 'Special Order', icon: 'el-icon-star-off', sub: 'Ordered for someone in particular' }
]
const blankNew = (category) => ({ category, productName: '', orderQty: 1, note: '', requestedFor: '', urgent: false })
// The board shows every open line and the latest received ones.
const BOARD_OPEN = 200
const BOARD_RECEIVED = 30
import { buildSppLineLabelsPdf, sppLabelFileName, withLabelNames, getLabelOrientation, setLabelOrientation, getLabelSize, setLabelSize, LABEL_SIZES } from '@/utils/sppLabelPdf'

// What each audit entry did — English source, translated through $tp.
const ACTION_LABELS = {
    created: 'Created', edited: 'Edited', quoted: 'Quoted', ordered: 'Placed with supplier', shortage: 'Marked shortage',
    cancelled: 'Cancelled', reopened: 'Reopened', shipped: 'Shipped', received: 'Received', unshipped: 'Batch cancelled',
    toConfirm: 'Moved to To Confirm', confirmed: 'Confirmed', unplaced: 'Order batch back to draft',
    priced: 'Unit price set', photo: 'Photo'
}

export default {
    name: 'SppOrders',
    components: { TreePanel, ChannelBoard, OrderCard, AddItemDialog, CreateZohoItemDialog },
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
            // Place order — one row
            placeVisible: false,
            placeRow: null,
            placeForm: { supplier: '', unitPrice: undefined },
            placing: false,
            exporting: false,
            // Order New Product
            newVisible: false,
            newForm: blankNew('New Product'),
            // the photos picked / pasted, uploaded once the line exists
            newFiles: [],
            NEW_TYPES,
            REQUESTED_FOR,
            MAX_IMAGES,
            // the pinned lists: 'table' | 'board' — the table by default, not remembered
            pinView: 'table',
            boardRows: [],
            boardCapped: false,
            BOARD_RECEIVED,
            // '' | 'again' (Save & add another) | 'close'
            newSaving: '',
            // what went in while the dialog stayed open
            newAdded: [],
            PINNED,
            // Quote
            quoteVisible: false,
            quoteRow: null,
            quoteForm: { unitPrice: undefined, toConfirm: false, note: '' },
            quoting: false,
            // Details (note / qty / category editable while pending)
            detailVisible: false,
            // a New Product line being created in Zoho
            zohoVisible: false,
            zohoOrder: null,
            detail: null,
            detailLoading: false,
            detailForm: { note: '', orderQty: null, category: '', requestedFor: '', urgent: false },
            detailSaving: false,
            // a photo uploading in the details; the list reloads on close if any changed
            photoBusy: false,
            photosChanged: false,
            // The ordered line whose price is being typed: { id, value }
            priceEdit: { id: null, value: undefined },
            priceSaving: false,
            // Part labels (PDF preview)
            labelVisible: false,
            labelTitle: '',
            labelUrl: '',
            labelBuild: null,
            labelFileName: '',
            labelOrientation: getLabelOrientation(),
            labelSize: getLabelSize(),
            LABEL_SIZES,
            // Smaller screens (< 1440px): fewer columns, icon-only actions.
            compact: false,
            // Phones (< 768px): no tree, chip strip, cards, folded filters.
            isMobile: false,
            // Add Item dialog
            addVisible: false,
            mFilters: false,
            // The table fills what is left under the header rows.
            tableHeight: 400
        }
    },
    watch: {
        // The header rows may have re-flowed once the counts are in.
        loading(v) { if (!v) this.$nextTick(this.fitTable) }
    },
    computed: {
        treeData() {
            // Every category, even empty — the count is the lines still
            // waiting to be placed (pending), in red.
            // (the pinned channels are not in it)
            const cats = (this.categories.length ? this.categories : CATEGORIES).filter(c => !PINNED_CATS.includes(c))
            const pending = cat => (this.byCategory[cat] && this.byCategory[cat].pending) || 0
            const children = cats.map(cat => ({ id: cat, label: this.catLabel(cat), count: pending(cat) }))
            const total = Object.keys(this.byCategory).filter(c => !PINNED_CATS.includes(c)).reduce((sum, cat) => sum + pending(cat), 0)
            return [{ id: 'root', label: this.$tp('All orders'), count: total, children }]
        },
        canEither() {
            return this.can('spp:order:create') || this.can('spp:order:supply')
        },
        // Adding lines (Add Item, Order New Product): iMobile, or the parts
        // supplier (spp:order:add, 2026-10-07) — who can't raise Special Orders.
        canAdd() {
            return this.can('spp:order:create') || this.can('spp:order:add')
        },
        canSpecial() {
            return this.can('spp:order:create')
        },
        newTypes() {
            return this.canSpecial ? NEW_TYPES : NEW_TYPES.filter(t => t.category !== 'Special Order')
        },
        editable() {
            return !!this.detail && this.detail.status === 'pending' && this.can('spp:order:create')
        },
        categoryOptions() {
            return this.categories.length ? this.categories : CATEGORIES
        },
        // a phone's dialogs: tighter padding, wrapping footer
        mDlg() {
            return this.isMobile ? 'spp-dlg-m' : ''
        },
        isPinned() {
            return PINNED_CATS.includes(this.activeCategory)
        },
        boardMode() {
            return this.isPinned && this.pinView === 'board'
        },
        isSpecial() {
            return this.newForm.category === 'Special Order'
        },
        isSpecialDetail() {
            return !!this.detail && (this.detail.category === 'Special Order' || (this.editable && this.detailForm.category === 'Special Order'))
        }
    },
    created() {
        this.load()
    },
    // Coming back to the tab (kept alive by the tags bar) — e.g. from Order
    // Batches after placing lines — must show fresh data.
    mounted() {
        this.onResize()
        window.addEventListener('resize', this.onResize)
        // A narrow window starts with the category tree folded away.
        if (window.innerWidth < 1200) {
            const t = this.$refs.treeRef
            if (t && !t.collapsed && typeof t.toggleCollapsed === 'function') t.toggleCollapsed()
        }
    },
    beforeDestroy() {
        window.removeEventListener('resize', this.onResize)
    },
    activated() {
        this.load()
        this.$nextTick(this.fitTable)
    },
    methods: {
        fmtDay, fmtWhen, yuan, dhlLink, zohoLink,
        // ── Fit the screen ─────────────────────────────────────────
        onResize() {
            this.compact = window.innerWidth < 1440
            this.isMobile = window.innerWidth < 768
            this.$nextTick(this.fitTable)
        },
        // The table takes the room under the header rows down to the pager.
        fitTable() {
            const el = this.$refs.table && this.$refs.table.$el
            if (!el) return
            const top = el.getBoundingClientRect().top
            this.tableHeight = Math.max(200, Math.floor(window.innerHeight - top - 60))
        },
        // The tree panel animates its width; the table re-measures after it.
        onTreeToggle() {
            setTimeout(() => { this.fitTable(); this.$refs.table && this.$refs.table.doLayout() }, 350)
        },
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
            if (this.boardMode) return this.loadBoard()
            this.loading = true
            try {
                const r = await listOrders({
                    page: this.page,
                    pageSize: this.pageSize,
                    category: this.activeCategory || undefined,
                    excludeCategory: this.activeCategory ? undefined : PINNED_CATS.join(','),
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
        // The stage board: every open line of the pinned list (oldest first)
        // and the latest received ones; the counts come along as usual.
        async loadBoard() {
            const category = this.activeCategory
            this.loading = true
            try {
                const [open, done] = await Promise.all([
                    listOrders({ category, open: 1, page: 1, pageSize: BOARD_OPEN, sort: 'oldest' }),
                    listOrders({ category, status: 'received', page: 1, pageSize: BOARD_RECEIVED, sort: 'received' })
                ])
                for (const r of [open, done]) if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                if (category !== this.activeCategory) return
                this.boardRows = [...(open.rows || []), ...(done.rows || [])]
                this.boardCapped = (open.total || 0) > (open.rows || []).length
                this.byStatus = open.byStatus || {}
                this.byCategory = open.byCategory || {}
                this.categories = open.categories || []
                this.suppliers = open.suppliers || []
                this.treeInit = true
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load purchase orders')))
            } finally {
                this.loading = false
            }
        },
        onPinView() {
            this.reload()
        },
        // The board's buttons run the page's own actions.
        onBoardAction(key, row) {
            const run = {
                detail: this.openDetail, label: this.printLineLabels, quote: this.openQuote, confirm: this.confirm,
                place: this.openPlace, shortage: this.markShortage, cancel: this.cancel, reopen: this.reopen,
                toConfirm: this.toConfirm, price: this.promptPrice, zoho: this.openZohoCreate
            }[key]
            if (run) run(row)
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
        // A pinned channel: its own list; the tree shows nothing selected.
        openPin(category) {
            this.activeCategory = category
            if (this.$refs.treeRef && this.$refs.treeRef.setCurrentKey) this.$refs.treeRef.setCurrentKey(null)
            this.reload()
        },
        pendingOf(category) {
            return (this.byCategory[category] && this.byCategory[category].pending) || 0
        },
        onPage(p) { this.page = p; this.load() },
        // phone: a chip in the list strip (the tree's job on a big screen)
        pickList(cat) {
            if (PINNED_CATS.includes(cat)) this.openPin(cat)
            else {
                this.onNodeClick({ id: cat || 'root' })
                if (this.$refs.treeRef && this.$refs.treeRef.setCurrentKey) this.$refs.treeRef.setCurrentKey(cat || 'root')
            }
            this.$nextTick(() => {
                const el = this.$refs.mlists && this.$refs.mlists.querySelector('.spp-mchip.on')
                if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'center' })
            })
        },
        dlgWidth(w) {
            return this.isMobile ? '94%' : w
        },
        onSize(s) { this.pageSize = s; this.reload() },
        // A New Product / Special Order line waits for its quote (then To
        // Confirm, then Confirmed) before it can be ordered — the backend's awaitsQuote.
        awaitsQuote(row) {
            return needsQuote(row)
        },
        // ── Order New Product ──────────────────────────────────────
        openNewProduct() {
            this.clearNewFiles()
            this.newForm = blankNew(this.activeCategory === 'Special Order' && this.canSpecial ? 'Special Order' : 'New Product')
            this.newAdded = []
            this.newVisible = true
        },
        focusNewName() {
            const r = this.$refs.newName
            if (r && r.focus) r.focus()
        },
        // el-upload keeps the picked files (nothing uploads until the line exists)
        onNewFiles(file, fileList) {
            this.newFiles = fileList.slice()
        },
        onNewExceed() {
            this.$message.warning(this.$tp('At most {n} photos', { n: MAX_IMAGES }))
        },
        previewNewFile(file) {
            if (file && file.url) window.open(file.url, '_blank')
        },
        // A screenshot pasted into the dialog (Ctrl+V) is added as a photo.
        onNewPaste(e) {
            const files = Array.from((e.clipboardData && e.clipboardData.files) || []).filter(x => /^image\//i.test(x.type))
            if (!files.length) return
            e.preventDefault()
            const room = MAX_IMAGES - this.newFiles.length
            if (room <= 0) { this.onNewExceed(); return }
            const stamp = Date.now()
            const added = files.slice(0, room).map((raw, i) => ({
                uid: stamp + i, status: 'ready', raw, url: URL.createObjectURL(raw),
                name: raw.name && raw.name !== 'image.png' ? raw.name : `screenshot-${stamp + i}.png`
            }))
            this.newFiles = [...this.newFiles, ...added]
            if (files.length > room) this.onNewExceed()
        },
        clearNewFiles() {
            for (const x of this.newFiles) { if (x.url && x.url.startsWith('blob:')) { try { URL.revokeObjectURL(x.url) } catch (e) { /* ignore */ } } }
            this.newFiles = []
        },
        // `again`: keep the dialog open for the next product.
        async submitNewProduct(again) {
            if (this.newSaving) return
            const f = this.newForm
            const productName = (f.productName || '').trim()
            const orderQty = Number(f.orderQty)
            if (!productName) { this.$message.warning(this.$tp('Enter the product name')); this.focusNewName(); return }
            if (!Number.isInteger(orderQty) || orderQty < 1) { this.$message.warning(this.$tp('Quantity must be a positive number')); return }
            const category = f.category === 'Special Order' ? 'Special Order' : 'New Product'
            const line = { productName, orderQty, category, note: (f.note || '').trim() }
            if (category === 'Special Order') { line.requestedFor = (f.requestedFor || '').trim(); line.urgent = !!f.urgent }
            this.newSaving = again ? 'again' : 'close'
            try {
                const r = await createOrders([line])
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                const no = (r.orderNos || [])[0] || ''
                const id = (r.ids || [])[0]
                // the photos go onto the new line, one at a time
                const files = this.newFiles.filter(x => x.raw)
                let failed = 0
                for (const x of files) {
                    try {
                        if (!id) throw new Error('no id')
                        const fd = new FormData()
                        fd.append('image', x.raw, x.name)
                        const u = await uploadOrderImage(id, fd)
                        if (!u || u.success === false) throw new Error('Failed')
                    } catch (e) { failed++ }
                }
                if (failed) this.$message.warning(this.$tp('{no} created, but {n} photo(s) did not upload — add them from its details', { no, n: failed }))
                else this.$message.success(this.$tp('{no} created — waiting for a quote', { no }))
                // show that list behind the dialog
                this.openPin(category)
                if (again) {
                    this.newAdded.unshift({ no, name: productName, qty: orderQty, category, requestedFor: line.requestedFor || '', urgent: !!line.urgent, photos: files.length - failed })
                    this.clearNewFiles()
                    // the list and who it is for stay for the next one
                    this.newForm = { ...blankNew(category), requestedFor: f.requestedFor || '' }
                    this.$nextTick(this.focusNewName)
                } else {
                    this.newVisible = false
                }
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to create the order')))
            } finally {
                this.newSaving = ''
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
                    excludeCategory: this.activeCategory ? undefined : PINNED_CATS.join(','),
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
            // a New Product awaiting its quote always goes to To Confirm with it
            this.quoteForm = { unitPrice: row.quotedPrice != null ? row.quotedPrice : undefined, toConfirm: this.awaitsQuote(row), note: '' }
            this.quoteVisible = true
        },
        async submitQuote() {
            const v = Number(this.quoteForm.unitPrice)
            if (this.quoteForm.unitPrice === undefined || this.quoteForm.unitPrice === '' || isNaN(v) || v < 0) {
                this.$message.warning(this.$tp('Enter a unit price of 0 or more')); return
            }
            this.quoting = true
            try {
                const park = this.quoteForm.toConfirm && this.quoteRow.status !== 'toConfirm'
                const r = await quoteOrder(this.quoteRow._id, { unitPrice: v, toConfirm: park, note: park ? this.quoteForm.note : '' })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(park ? this.$tp('{no} quoted and parked in To Confirm', { no: this.quoteRow.orderNo }) : this.$tp('Quote saved'))
                this.quoteVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save the quote')))
            } finally {
                this.quoting = false
            }
        },
        // 待确认: parked for a decision — the note says what needs confirming.
        async toConfirm(row) {
            let note = ''
            try {
                const r = await this.$prompt(this.$tp('Move {no} to To Confirm? Say what needs confirming.', { no: row.orderNo }),
                    this.$tp('To Confirm'), {
                        customClass: 'spp-msgbox', confirmButtonText: this.$tp('Move to To Confirm'), cancelButtonText: this.$tp('Cancel'), inputType: 'textarea',
                        inputPlaceholder: this.$tp('What needs confirming?'),
                        inputValidator: v => (v && v.trim() ? true : this.$tp('A note is required'))
                    })
                note = (r && r.value) || ''
            } catch (e) { return }
            try {
                const r = await toConfirmOrder(row._id, note.trim())
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('{no} is now To Confirm', { no: row.orderNo }))
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to update the order')))
            }
        },
        confirmedTitle(c) {
            return [c.question ? 'Q: ' + c.question : '', c.answer ? 'A: ' + c.answer : '', fmtWhen(c.at) + (c.by ? ' · ' + c.by : '')].filter(Boolean).join('\n')
        },
        // Decision made: back to Pending, marked Confirmed (the user's rule).
        async confirm(row) {
            let note = ''
            try {
                const r = await this.$prompt(this.$tp('Confirm {no}? It goes back to Pending, marked Confirmed.', { no: row.orderNo }),
                    this.$tp('Confirm'), { customClass: 'spp-msgbox', confirmButtonText: this.$tp('Confirm'), cancelButtonText: this.$tp('Cancel'), inputPlaceholder: this.$tp('Optional') })
                note = (r && r.value) || ''
            } catch (e) { return }
            try {
                const r = await confirmOrder(row._id, note)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('{no} confirmed — back to Pending', { no: row.orderNo }))
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to update the order')))
            }
        },
        async markShortage(row) {
            let note = ''
            try {
                const r = await this.$prompt(this.$tp('Mark {no} as shortage? Add a note for iMobile if you like.', { no: row.orderNo }),
                    this.$tp('Shortage'), { customClass: 'spp-msgbox', confirmButtonText: this.$tp('Confirm'), cancelButtonText: this.$tp('Cancel'), inputPlaceholder: this.$tp('Optional') })
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
                    { type: 'warning', customClass: 'spp-msgbox', confirmButtonText: this.$tp('Cancel order'), cancelButtonText: this.$tp('Keep') })
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
        // ── Inline unit price (ordered lines) ─────────────────────
        canPrice(row) {
            return this.can('spp:order:supply') && row.status === 'ordered'
        },
        startPriceEdit(row) {
            const p = row.unitPrice != null ? row.unitPrice : row.quotedPrice
            this.priceEdit = { id: row._id, value: p == null ? undefined : p }
        },
        cancelPriceEdit() {
            this.priceEdit = { id: null, value: undefined }
        },
        // Enter: blur first so el-input-number commits, then save.
        priceEnter(evt, row) {
            if (evt && evt.target) evt.target.blur()
            this.$nextTick(() => this.savePrice(row))
        },
        async savePrice(row) {
            if (this.priceEdit.id !== row._id) return
            const v = Number(this.priceEdit.value)
            if (this.priceEdit.value == null || this.priceEdit.value === '' || isNaN(v) || v < 0) {
                this.$message.warning(this.$tp('Enter a unit price of 0 or more')); return
            }
            const price = Math.round(v * 100) / 100
            if (price === row.unitPrice) { this.cancelPriceEdit(); return }
            this.priceSaving = true
            try {
                const r = await priceOrder(row._id, price)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$set(row, 'unitPrice', r.unitPrice)
                this.$set(row, 'lineTotal', r.lineTotal)
                this.$message.success(this.$tp('Price saved'))
                this.cancelPriceEdit()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save the prices')))
            } finally {
                this.priceSaving = false
            }
        },
        // The cards' "Set unit price" (the table edits it inline).
        async promptPrice(row) {
            const cur = row.unitPrice != null ? row.unitPrice : row.quotedPrice
            let v
            try {
                const r = await this.$prompt(this.$tp('Unit price for {no} (¥)', { no: row.orderNo }), this.$tp('Unit Price'), {
                    customClass: 'spp-msgbox', inputValue: cur == null ? '' : String(cur), inputType: 'number', inputPlaceholder: '0.00',
                    inputValidator: x => (x !== '' && x != null && !isNaN(Number(x)) && Number(x) >= 0) || this.$tp('Enter a unit price of 0 or more'),
                    confirmButtonText: this.$tp('Save'), cancelButtonText: this.$tp('Cancel')
                })
                v = Number(r.value)
            } catch (e) { return }
            const price = Math.round(v * 100) / 100
            if (price === row.unitPrice) return
            try {
                const r = await priceOrder(row._id, price)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$set(row, 'unitPrice', r.unitPrice)
                this.$set(row, 'lineTotal', r.lineTotal)
                this.$message.success(this.$tp('Price saved'))
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save the prices')))
            }
        },
        // ── Part labels ────────────────────────────────────────────
        // ONE label (user ask 2026-09-30): the copies are set in the
        // printer dialog.
        async printLineLabels(row) {
            this.cleanupLabels()
            try {
                const [line] = await withLabelNames([row])
                const build = () => buildSppLineLabelsPdf(line, 1)
                this.labelBuild = build
                this.labelFileName = sppLabelFileName({ batchNo: row.orderNo }, row)
                this.labelUrl = build().output('bloburl') + '#toolbar=0'
                this.labelTitle = this.$tp('Label') + ' — ' + (row.sku || row.productName)
                this.labelVisible = true
            } catch (e) {
                this.$message.error(this.$tp('Could not build the labels'))
            }
        },
        // Portrait / landscape and 60 × 40 / 50 × 40: remembered for next
        // time, preview redrawn.
        onLabelOrientation(v) {
            setLabelOrientation(v)
            this.redrawLabels()
        },
        onLabelSize(v) {
            setLabelSize(v)
            this.redrawLabels()
        },
        redrawLabels() {
            if (!this.labelBuild) return
            try {
                const doc = this.labelBuild()
                if (!doc) return
                this.cleanupLabels()
                this.labelUrl = doc.output('bloburl') + '#toolbar=0'
            } catch (e) {
                this.$message.error(this.$tp('Could not build the labels'))
            }
        },
        printLabels() {
            if (!this.labelBuild) return
            const doc = this.labelBuild()
            doc.autoPrint()
            const w = window.open(doc.output('bloburl'))
            if (!w) this.$message.warning(this.$tp('Pop-up blocked — use Download instead'))
        },
        downloadLabels() {
            if (this.labelBuild) this.labelBuild().save(this.labelFileName)
        },
        cleanupLabels() {
            if (this.labelUrl) { try { URL.revokeObjectURL(this.labelUrl.replace('#toolbar=0', '')) } catch (e) { /* ignore */ } }
            this.labelUrl = ''
        },
        // ── A New Product line → a Zoho item ───────────────────────
        // a New Product not in Zoho yet (not cancelled), for whoever may create items
        canZohoCreate(row) {
            return !!row && row.category === 'New Product' && !row.itemId && row.status !== 'cancelled' && this.can('spp:product:create')
        },
        openZohoCreate(row) {
            this.zohoOrder = row
            this.zohoVisible = true
        },
        onZohoCreated() {
            // the line now carries the item: the list, and the details if open
            this.load()
            if (this.detailVisible && this.detail && this.zohoOrder && this.detail._id === this.zohoOrder._id) this.openDetail(this.detail)
        },
        // ── Details ────────────────────────────────────────────────
        async openDetail(row) {
            this.detail = row
            this.detailForm = { note: row.note || '', orderQty: row.orderQty, category: row.category || '', requestedFor: row.requestedFor || '', urgent: !!row.urgent }
            this.detailVisible = true
            this.detailLoading = true
            try {
                const r = await getOrder(row._id)
                if (r && r.order) {
                    this.detail = r.order
                    this.detailForm = { note: r.order.note || '', orderQty: r.order.orderQty, category: r.order.category || '', requestedFor: r.order.requestedFor || '', urgent: !!r.order.urgent }
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
                if (this.isSpecialDetail) { data.requestedFor = this.detailForm.requestedFor || ''; data.urgent = !!this.detailForm.urgent }
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
        },
        // Photos save at once; the list catches up when the details close.
        async addPhoto({ file }) {
            const d = this.detail
            if (!d) return
            this.photoBusy = true
            try {
                const fd = new FormData()
                fd.append('image', file, file.name)
                const r = await uploadOrderImage(d._id, fd)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$set(d, 'images', [...(d.images || []), r.image])
                this.photosChanged = true
                this.$message.success(this.$tp('Photo added'))
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to upload the photo')))
            } finally {
                this.photoBusy = false
            }
        },
        async removePhoto(im) {
            try {
                await this.$confirm(this.$tp('Remove this photo?'), this.$tp('Photos'),
                    { type: 'warning', customClass: 'spp-msgbox', confirmButtonText: this.$tp('Remove'), cancelButtonText: this.$tp('Keep') })
            } catch (e) { return }
            const d = this.detail
            try {
                const r = await deleteOrderImage(d._id, im.id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$set(d, 'images', (d.images || []).filter(i => i.id !== im.id))
                this.photosChanged = true
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to update the order')))
            }
        },
        onDetailClosed() {
            if (this.photosChanged) { this.photosChanged = false; this.load() }
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
.spp-topbar { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 8px; margin-bottom: 10px; }
.spp-header { margin-bottom: 8px; }
.spp-h-title { font-size: 18px; font-weight: 600; color: #303133; }
.spp-h-sub { font-size: 12px; color: #909399; margin-top: 2px; }
.spp-filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; margin-bottom: 10px; }
.spp-f-item { display: flex; flex-direction: column; gap: 3px; }
.spp-f-item label { font-size: 12px; color: #909399; }
.spp-f-grow { flex: 1; min-width: 160px; }
.spp-kpis { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 10px; margin-bottom: 10px; }
.spp-kpi { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid #ebeef5; border-radius: 6px; cursor: pointer; transition: box-shadow .15s;
    &:hover { box-shadow: 0 2px 8px rgba(0,0,0,.06); }
    &.active { border-color: #409eff; box-shadow: 0 0 0 1px #409eff inset; }
}
.spp-kpi-icon { width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 17px; flex-shrink: 0; }
.spp-kpi-label { font-size: 12px; color: #909399; }
.spp-kpi-count { font-size: 18px; font-weight: 600; color: #303133; line-height: 1.1; }
/* Smaller screens: the header rows shrink and the status cards become one
   row of chips (the columns are handled by `compact` in the script). */
@media (max-width: 1440px) {
    .spp-main { padding: 8px 10px 6px; }
    .spp-topbar { margin-bottom: 6px; }
    .spp-header { margin-bottom: 2px; }
    .spp-h-title { font-size: 16px; }
    .spp-filters { gap: 8px; margin-bottom: 8px; }
    .spp-kpis { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
    .spp-kpi { gap: 6px; padding: 3px 10px 3px 4px; border-radius: 16px; }
    .spp-kpi-icon { width: 22px; height: 22px; border-radius: 50%; font-size: 12px; }
    .spp-kpi-body { display: flex; align-items: baseline; gap: 5px; }
    .spp-kpi-label { font-size: 12px; white-space: nowrap; }
    .spp-kpi-count { font-size: 13px; }
}
.spp-fold { color: #909399; }
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
.spp-act-label { margin-left: 4px; }
/* inline unit price (ordered lines) */
.spp-pview { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; padding: 2px 4px; border-radius: 4px; &:hover { background: #f5f7fa; .spp-pencil { opacity: 1; } } }
.spp-pencil { font-size: 11px; color: #409eff; opacity: 0; transition: opacity .15s; }
.spp-pedit { display: inline-flex; align-items: center; gap: 2px; }
.spp-pinput { width: 66px; ::v-deep .el-input__inner { padding: 0 6px; text-align: right; } }
.spp-psave { color: #67c23a; padding: 2px; }
.spp-pcancel { color: #909399; padding: 2px; }
.label-orient { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; color: #909399; flex-wrap: wrap; }
.label-orient-gap { margin-left: 12px; }
.spp-label-frame { width: 100%; height: 56vh; border: 1px solid #ebeef5; background: #fff; }
.spp-confirm { color: #0ea5a5; }
/* the pinned lists above the tree — Stock Monitoring's .dash-tab look */
.spp-pin { margin: 10px 10px 0; padding: 0 10px; height: 34px; display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600;
    color: #606266; border: 1px solid #e8eaed; border-radius: 4px; cursor: pointer; transition: all .15s;
    i { color: #909399; font-size: 15px; }
    &:hover { color: #409eff; border-color: #b3d8ff; background: #f0f7ff; i { color: #409eff; } }
    &.on { color: #409eff; background: #e6f0fd; border-color: #b3d8ff; i { color: #409eff; } }
    &:last-of-type { margin-bottom: 4px; } }
.spp-pin-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Order New Product */
.spp-np-steps { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 8px 10px; margin-bottom: 14px;
    background: #f7f9fc; border: 1px solid #ebeef5; border-radius: 6px; font-size: 12px; color: #909399;
    > i { color: #c0c4cc; font-size: 11px; } }
.spp-np-step { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;
    b { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%;
        background: #e4e7ed; color: #606266; font-size: 11px; }
    &.is-now { color: #409eff; font-weight: 600; b { background: #409eff; color: #fff; } } }
.spp-np-qty { flex: 0 0 auto; }
.spp-np-form .el-form-item { margin-bottom: 12px; }
.spp-np-added { margin-top: 4px; padding: 8px 10px; border: 1px dashed #c2e7b0; border-radius: 6px; background: #f0f9eb; max-height: 140px; overflow-y: auto; }
.spp-np-added-title { font-size: 12px; color: #67c23a; font-weight: 600; margin-bottom: 4px; }
.spp-np-added-row { display: flex; gap: 8px; align-items: baseline; font-size: 12px; color: #303133; padding: 2px 0;
    b { flex-shrink: 0; color: #606266; } }
.spp-np-added-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Special Order: who it is for / urgent; photos */
.spp-for { margin-left: 6px; color: #409eff; background: #ecf5ff; border-radius: 10px; padding: 0 6px; white-space: nowrap; }
.spp-urgent { margin-left: 6px; color: #fff; background: #f56c6c; border-radius: 10px; padding: 0 6px; font-weight: 600; white-space: nowrap; }
.spp-photos { margin-left: 6px; color: #909399; cursor: pointer; white-space: nowrap; &:hover { color: #409eff; } }
.spp-view { margin-right: auto; flex-shrink: 0; display: inline-flex; white-space: nowrap; }
.spp-np-types { display: flex; gap: 10px; margin-bottom: 12px; }
.spp-np-type { flex: 1; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid #dcdfe6; border-radius: 8px; cursor: pointer; transition: all .15s; position: relative;
    &:hover { border-color: #b3d8ff; background: #f7fbff; }
    &.on { border-color: #409eff; background: #ecf5ff; box-shadow: 0 0 0 1px #409eff inset; .spp-np-type-icon { color: #409eff; } } }
.spp-np-type-icon { font-size: 22px; color: #909399; }
.spp-np-type-text { flex: 1; min-width: 0; }
.spp-np-type-title { font-size: 13px; font-weight: 600; color: #303133; }
.spp-np-type-sub { font-size: 11px; color: #909399; margin-top: 2px; }
.spp-np-type-tick { color: #409eff; font-size: 16px; }
.spp-np-urgent { flex: 0 0 auto; ::v-deep .el-form-item__label { visibility: hidden; } }
.spp-np-opt { font-size: 11px; color: #c0c4cc; font-weight: 400; }
.spp-np-photo-item { margin-bottom: 4px !important; }
.spp-np-photos { line-height: 1;
    ::v-deep .el-upload--picture-card { width: 72px; height: 72px; line-height: 78px; border-radius: 6px; i { font-size: 20px; } }
    ::v-deep .el-upload-list--picture-card .el-upload-list__item { width: 72px; height: 72px; margin: 0 8px 8px 0; border-radius: 6px; }
    ::v-deep .el-upload-list--picture-card .el-upload-list__item-actions { font-size: 14px; }
    ::v-deep .el-upload-list__item.is-ready .el-upload-list__item-status-label { display: none; }
    &.full ::v-deep .el-upload--picture-card { display: none; } }
.spp-np-added-icon { color: #909399; flex-shrink: 0; }
.spp-photo-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.spp-photo { position: relative; width: 72px; height: 72px; }
.spp-photo-img { width: 72px; height: 72px; border-radius: 6px; border: 1px solid #ebeef5; }
.spp-photo-del { position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; line-height: 18px; text-align: center; font-size: 11px;
    border-radius: 50%; background: #f56c6c; color: #fff; cursor: pointer; box-shadow: 0 1px 3px rgba(0, 0, 0, .2); }
.spp-photo-add-box { width: 72px; height: 72px; border: 1px dashed #c0ccda; border-radius: 6px; display: flex; align-items: center; justify-content: center;
    color: #8c939d; font-size: 20px; background: #fbfdff; &:hover { border-color: #409eff; color: #409eff; } }
.spp-tag-quote { display: inline-flex; align-items: center; gap: 2px; color: #e6a23c; background: #fdf6ec; border-radius: 10px; padding: 0 6px; font-size: 11px; white-space: nowrap; }
.spp-act-quote { color: #e6a23c; }
.spp-tag-ok { display: inline-flex; align-items: center; gap: 2px; color: #67c23a; background: #f0f9eb; border-radius: 10px; padding: 0 6px; font-size: 11px; white-space: nowrap; }
.spp-act-confirm { color: #0ea5a5; font-weight: 600; }
.spp-empty { color: #909399; }
.spp-pager { padding-top: 8px; text-align: right; }
/* ── phone (< 768px): list strip, cards, folded filters ── */
.spp-mlists { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 2px; scrollbar-width: none; -webkit-overflow-scrolling: touch;
    &::-webkit-scrollbar { display: none; } }
.spp-mchip { flex-shrink: 0; display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 11px; border: 1px solid #e4e7ed; border-radius: 15px;
    font-size: 12px; color: #606266; background: #fff; white-space: nowrap; cursor: pointer;
    i { color: #909399; }
    b { color: #f56c6c; font-weight: 600; font-size: 11px; }
    &.is-pin { font-weight: 600; }
    &.on { color: #409eff; border-color: #409eff; background: #ecf5ff; i { color: #409eff; } } }
.spp-mchip-sep { flex: 0 0 1px; background: #e4e7ed; margin: 5px 2px; }
.spp-mcards { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 2px 0 10px; -webkit-overflow-scrolling: touch; }
.spp-mempty { display: block; text-align: center; padding: 40px 0; }
.spp-f-toggle { flex-shrink: 0; }
@media (max-width: 767px) {
    .spp-main { padding: 8px 10px 4px; }
    .spp-topbar { flex-wrap: nowrap; gap: 6px; .el-button + .el-button { margin-left: 0; } }
    .spp-filters { gap: 8px; margin-bottom: 8px; align-items: center;
        .spp-f-item label { display: none; }
        .spp-f-grow { order: -2; flex: 1 1 0; min-width: 0; }
        .spp-f-toggle { order: -1; margin-left: 0; }
        .spp-f-item:not(.spp-f-grow) { flex: 1 1 0; min-width: 0; } }
    .spp-kpis { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; &::-webkit-scrollbar { display: none; } }
    .spp-kpi { flex-shrink: 0; }
    .spp-pager { padding-top: 6px; text-align: center; }
}
.spp-dlg-head { font-size: 15px; font-weight: 600; color: #303133; i { color: #409eff; margin-right: 4px; } }
.spp-dlg-no { margin-left: 8px; font-weight: 400; color: #909399; font-size: 13px; }
.spp-line-name { color: #303133; line-height: 1.3; }
.spp-card { padding: 10px 12px; border: 1px solid #ebeef5; border-radius: 6px; background: #fafafa; margin-bottom: 12px; }
.spp-row { display: flex; gap: 12px; }
.spp-col { flex: 1; }
.spp-hint { font-size: 12px; color: #909399; i { margin-right: 3px; } }
.spp-detail-note { margin-top: 12px; }
.spp-zoho-create { color: #409eff; cursor: pointer; white-space: nowrap; &:hover { text-decoration: underline; } i { margin-right: 1px; } }
.spp-zoho-btn { margin-left: 8px; padding: 4px 8px; }
.spp-detail-label { font-size: 12px; color: #909399; margin-bottom: 4px; }
.spp-history { margin-top: 12px; }
.spp-hist-row { display: flex; gap: 8px; font-size: 12px; padding: 3px 0; border-bottom: 1px dashed #f0f0f0; }
.spp-hist-when { color: #909399; font-variant-numeric: tabular-nums; white-space: nowrap; }
.spp-hist-action { color: #303133; }
</style>

<style lang="scss">
.spp-suggestions { min-width: 460px !important; li { line-height: 1.3 !important; padding: 4px 12px !important; } }
/* Element's dialog body breaks words mid-letter; wrap at spaces instead */
.spp-np-dlg .el-dialog__body, .spp-dlg-m .el-dialog__body { word-break: normal; overflow-wrap: break-word; }
/* phone: message boxes and dialogs fit the screen */
.spp-msgbox { max-width: calc(100vw - 24px); }
.spp-dlg-m { margin-bottom: 3vh !important;
    .el-dialog__header { padding: 14px 14px 8px; }
    .el-dialog__body { padding: 10px 14px; }
    .el-dialog__footer { padding: 8px 14px 14px; }
    .spp-dlg-foot { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; .el-button { flex: 1 1 auto; } .el-button + .el-button { margin-left: 0; } }
    .spp-row { gap: 8px; }
    .spp-hist-row { flex-wrap: wrap; gap: 2px 8px; }
    .el-descriptions-item__label { white-space: nowrap; width: 84px; }
    .spp-np-types { gap: 8px; }
    .spp-np-type { padding: 8px 10px; gap: 8px; }
    .spp-np-type-sub, .spp-np-type-tick { display: none; }
    .spp-np-type-icon { font-size: 18px; }
    .spp-label-frame { height: 48vh; } }
</style>
