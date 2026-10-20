<template>
    <div class="spb-page app-container">
        <div class="spb-bar">
            <span class="spb-title">{{ $tt('Dispatch Batches') }}</span>
            <span class="spb-spacer" />
            <el-radio-group v-model="statusFilter" size="mini" @change="reload">
                <el-radio-button label="">{{ $tp('All') }} ({{ totalAll }})</el-radio-button>
                <el-radio-button label="draft">{{ $tp('Draft') }} ({{ byStatus.draft || 0 }})</el-radio-button>
                <el-radio-button label="shipped">{{ $tp('Shipped') }} ({{ byStatus.shipped || 0 }})</el-radio-button>
                <el-radio-button label="received">{{ $tp('Received') }} ({{ byStatus.received || 0 }})</el-radio-button>
            </el-radio-group>
            <el-input v-model="search" size="small" clearable prefix-icon="el-icon-search" class="spb-search"
                :placeholder="$tp('Batch no, tracking, SKU, product…')" @keyup.enter.native="reload" @clear="reload" />
            <el-button v-if="can('spp:batch:create')" type="primary" size="small" icon="el-icon-truck" @click="freightVisible = true">{{ $tp('Create Batch') }}</el-button>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">{{ $tp('Refresh') }}</el-button>
        </div>

        <!-- phones (2026-10-13): a card per batch instead of the wide table -->
        <div v-if="phone" v-loading="loading" class="spb-cards">
            <div v-if="!rows.length && !loading" class="spb-cards-empty">{{ $tp('No batches yet') }}</div>
            <div v-for="r in rows" :key="r._id" class="spb-card">
                <div class="spb-card-head">
                    <el-tag v-if="r.status === 'draft'" size="mini" type="warning" class="spb-draft-tag" @click="openDraft(r)">{{ $tp('Draft') }}</el-tag>
                    <el-button v-else type="text" class="spb-no" @click="openView(r)">{{ r.batchNo }}</el-button>
                    <i :class="['spb-freight-ico', freightOf(r), freightIcon(r)]" :title="freightLabel(r)" />
                    <el-tag size="mini" :type="batchTag(r.status)" effect="plain">{{ batchLabel(r.status) }}</el-tag>
                    <span class="spb-spacer" />
                    <span class="spb-dim">{{ fmtDay(r.shippedAt) }}</span>
                </div>
                <div class="spb-card-row"><span>{{ $tp('Tracking') }}</span>
                    <a v-if="r.tracking" class="spb-link" :href="dhlLink(r.tracking)" target="_blank" rel="noopener">{{ r.tracking }}</a>
                    <em v-else>{{ $tp('not yet') }}</em></div>
                <div class="spb-card-row"><span>{{ $tp('Lines') }}</span><span><b>{{ r.lineCount }}</b> · {{ r.totalQty }} {{ $tp('Pcs') }}<span v-if="r.discrepancy" class="spb-warn"> · {{ $tp('qty differs') }}</span><span v-if="r.unmatchedCount" class="spb-warn"> · {{ $tp('{n} not on any order', { n: r.unmatchedCount }) }}</span></span></div>
                <div v-if="r.zoho && r.zoho.pos && r.zoho.pos.length" class="spb-card-row"><span>{{ $tp('Zoho PO') }}</span>
                    <span><a v-for="p in r.zoho.pos" :key="p.purchaseorderId" class="spb-link spb-zpo-inline" :href="zohoPoLink(p.purchaseorderId)" target="_blank" rel="noopener">{{ p.number }}</a></span></div>
                <div v-if="r.receivedAt" class="spb-card-row"><span>{{ $tp('Received') }}</span><span>{{ fmtDay(r.receivedAt) }}<template v-if="r.receivedBy"> · {{ r.receivedBy }}</template></span></div>
                <div class="spb-card-row"><span>{{ $tp('Created by') }}</span><span>{{ r.createdBy || '—' }} · {{ fmtWhen(r.createdAt) }}</span></div>
                <div v-if="r.note" class="spb-card-row"><span>{{ $tp('Note') }}</span><span>{{ r.note }}</span></div>
                <div class="spb-card-actions">
                    <template v-if="r.status === 'draft'">
                        <el-button v-if="can('spp:batch:create')" size="mini" icon="el-icon-edit" @click="openDraft(r)">{{ $tp('Edit') }}</el-button>
                        <el-button v-if="r.lineCount" size="mini" icon="el-icon-download" @click="downloadPriceSheet(r)">{{ $tp('Price sheet') }}</el-button>
                        <el-button v-if="can('spp:batch:create')" size="mini" icon="el-icon-delete" class="spb-del" @click="deleteDraft(r)">{{ $tp('Delete') }}</el-button>
                    </template>
                    <template v-else>
                        <el-button size="mini" icon="el-icon-view" @click="openView(r)">{{ $tp('View') }}</el-button>
                        <el-button v-if="can('spp:order:receive') && r.status === 'shipped'" size="mini" type="success" plain icon="el-icon-circle-check" @click="openReceive(r)">{{ $tp('Receive') }}</el-button>
                    </template>
                </div>
            </div>
        </div>
        <el-table v-else v-loading="loading" :data="rows" size="mini" border :empty-text="$tp('No batches yet')">
            <el-table-column :label="$tp('Batch')" width="120">
                <template slot-scope="s">
                    <el-tag v-if="s.row.status === 'draft'" size="mini" type="warning" class="spb-draft-tag" @click="openDraft(s.row)">{{ $tp('Draft') }}</el-tag>
                    <el-button v-else type="text" class="spb-no" @click="openView(s.row)">{{ s.row.batchNo }}</el-button>
                    <!-- 海运 / 空运 as an icon (2026-10-16; older batches were all air) -->
                    <i :class="['spb-freight-ico', freightOf(s.row), freightIcon(s.row)]" :title="freightLabel(s.row)" />
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Shipped')" width="110" align="center">
                <template slot-scope="s">{{ fmtDay(s.row.shippedAt) }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Tracking')" min-width="190" show-overflow-tooltip>
                <template slot-scope="s">
                    <a v-if="s.row.tracking" class="spb-link" :href="dhlLink(s.row.tracking)" target="_blank" rel="noopener">{{ s.row.tracking }}</a>
                    <span v-else class="spb-dim">{{ $tp('not yet') }}</span>
                    <el-button v-if="can('spp:batch:manage') && s.row.status !== 'cancelled'" type="text" size="mini" icon="el-icon-edit"
                        class="spb-edit" @click="openEdit(s.row)" />
                </template>
            </el-table-column>
            <!-- The Zoho Inventory PO(s) raised for the shipment, one per vendor. -->
            <el-table-column :label="$tp('Zoho PO')" min-width="150">
                <template slot-scope="s">
                    <template v-if="s.row.zoho && s.row.zoho.pos && s.row.zoho.pos.length">
                        <div v-for="p in s.row.zoho.pos" :key="p.purchaseorderId" class="spb-zpo">
                            <a class="spb-link" :href="zohoPoLink(p.purchaseorderId)" target="_blank" rel="noopener"
                                :title="p.vendorName">{{ p.number }}</a>
                            <span class="spb-dim"> {{ p.vendorName }}</span>
                        </div>
                    </template>
                    <span v-else-if="s.row.status === 'cancelled' || s.row.status === 'draft'" class="spb-dim">—</span>
                    <span v-else-if="s.row.zoho && s.row.zoho.status === 'skipped'" class="spb-dim" :title="$tp('No line had a Zoho item')">—</span>
                    <span v-else-if="s.row.zoho" class="spb-warn">{{ $tp('not created') }}</span>
                    <span v-else class="spb-dim">—</span>
                    <el-button v-if="can('spp:batch:manage') && s.row.status !== 'cancelled' && s.row.status !== 'draft' && zohoIncomplete(s.row)" type="text" size="mini"
                        icon="el-icon-refresh-right" class="spb-edit" :loading="zohoRetryingId === s.row._id"
                        :title="$tp('Create the missing Zoho PO')" @click="retryZoho(s.row)" />
                    <div v-if="s.row.zoho && s.row.zoho.skipped && s.row.zoho.skipped.length" class="spb-warn"
                        :title="s.row.zoho.skipped.map(x => x.sku || x.productName).join(', ')">
                        {{ $tp('{n} line(s) without a Zoho item', { n: s.row.zoho.skipped.length }) }}</div>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Lines')" width="70" align="center">
                <template slot-scope="s">{{ s.row.lineCount }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Pcs')" width="70" align="center">
                <template slot-scope="s">{{ s.row.totalQty }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Status')" width="110" align="center">
                <template slot-scope="s">
                    <el-tag size="mini" :type="batchTag(s.row.status)" effect="plain">{{ batchLabel(s.row.status) }}</el-tag>
                    <div v-if="s.row.discrepancy" class="spb-warn">{{ $tp('qty differs') }}</div>
                    <div v-if="s.row.unmatchedCount" class="spb-warn">{{ $tp('{n} not on any order', { n: s.row.unmatchedCount }) }}</div>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Received')" width="150">
                <template slot-scope="s">
                    <template v-if="s.row.receivedAt">
                        <div>{{ fmtDay(s.row.receivedAt) }}</div>
                        <div v-if="s.row.receivedBy" class="spb-dim">{{ s.row.receivedBy }}</div>
                    </template>
                    <span v-else>—</span>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Created by')" width="150">
                <template slot-scope="s">
                    <div>{{ s.row.createdBy || '—' }}</div>
                    <div class="spb-dim">{{ fmtWhen(s.row.createdAt) }}</div>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Note')" min-width="140" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.note || '—' }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Actions')" width="250" align="center">
                <template slot-scope="s">
                    <template v-if="s.row.status === 'draft'">
                        <el-button v-if="can('spp:batch:create')" type="text" size="mini" icon="el-icon-edit" @click="openDraft(s.row)">{{ $tp('Edit') }}</el-button>
                        <!-- the sheet the purchase team fills the prices in on -->
                        <el-button v-if="s.row.lineCount" type="text" size="mini" icon="el-icon-download" @click="downloadPriceSheet(s.row)">{{ $tp('Price sheet') }}</el-button>
                        <!-- the same discard the draft dialog offers, right from the list (user ask 2026-10-06) -->
                        <el-button v-if="can('spp:batch:create')" type="text" size="mini" icon="el-icon-delete" class="spb-del" @click="deleteDraft(s.row)">{{ $tp('Delete') }}</el-button>
                        <span v-if="!can('spp:batch:create')" class="spb-dim">{{ $tp('Draft') }}</span>
                    </template>
                    <template v-else>
                        <el-button type="text" size="mini" icon="el-icon-view" @click="openView(s.row)">{{ $tp('View') }}</el-button>
                        <el-button type="text" size="mini" icon="el-icon-printer" @click="print(s.row)">{{ $tp('Print') }}</el-button>
                        <el-button v-if="can('spp:order:receive') && s.row.status === 'shipped'" type="text" size="mini"
                            icon="el-icon-circle-check" class="spb-receive" @click="openReceive(s.row)">{{ $tp('Receive') }}</el-button>
                    </template>
                </template>
            </el-table-column>
        </el-table>

        <div class="spb-pager">
            <el-pagination background :small="phone" :layout="phone ? 'prev, pager, next' : 'total, sizes, prev, pager, next'" :pager-count="phone ? 5 : 7"
                :total="total" :page-size="pageSize" :page-sizes="[10, 20, 50]" :current-page="page" @current-change="onPage" @size-change="onSize" />
        </div>

        <!-- ── 海运 or 空运 first (user ask 2026-10-16): a batch takes only its
             own kind of line — 海运 the 海运 lines, 空运 every other one. ── -->
        <el-dialog :visible.sync="freightVisible" :width="phone ? '92%' : '420px'" append-to-body top="20vh" custom-class="spb-dlg spb-freight-dlg"
            @closed="!createVisible && clearQuery()">
            <div slot="title" class="spb-dlg-head"><i class="el-icon-truck" /> {{ $tp('Create Batch') }}</div>
            <div class="spb-freight-ask">{{ $tp('How does this batch ship?') }}</div>
            <div class="spb-freight-pick">
                <div class="spb-freight-opt air" @click="chooseFreight('air')">
                    <i class="el-icon-position" />
                    <b>空运</b>
                    <span>{{ $tp('Air — every line except 海运') }}</span>
                </div>
                <div class="spb-freight-opt sea" @click="chooseFreight('sea')">
                    <i class="el-icon-ship" />
                    <b>海运</b>
                    <span>{{ $tp('Sea — the 海运 lines only') }}</span>
                </div>
            </div>
        </el-dialog>

        <!-- ── Create batch ─────────────────────────────────────────── -->
        <!-- Scan a SKU to pull its oldest waiting line, or pick lines from
             the open list. The shipped qty defaults to the ordered qty; a
             smaller number is a short shipment and still closes the line. -->
        <el-dialog :visible.sync="createVisible" width="960px" append-to-body top="5vh" :fullscreen="phone" :custom-class="dlgClass" @closed="onCreateClosed">
            <div slot="title" class="spb-dlg-head"><i class="el-icon-truck" /> {{ draftId ? $tp('Draft batch') : $tp('Create Batch') }}
                <span :class="['spb-freight', createForm.freight]">{{ createForm.freight === 'sea' ? '海运' : '空运' }}</span>
                <span v-if="draftId" class="spb-dim spb-dlg-sub">{{ $tp('saved, not shipped') }}</span></div>
            <div class="spb-head-fields">
                <!-- The Zoho Inventory PO for the whole batch is booked to this vendor. -->
                <div class="spb-field spb-field-vendor">
                    <label>{{ $tp('Zoho vendor') }} *</label>
                    <el-select v-model="createForm.zohoVendorId" size="small" :placeholder="$tp('Select the Zoho vendor')" style="width:100%">
                        <el-option v-for="v in zohoVendors" :key="v.id" :label="v.name" :value="v.id" />
                    </el-select>
                </div>
                <div class="spb-field spb-field-date">
                    <label>{{ $tp('Ship date') }}</label>
                    <el-date-picker v-model="createForm.shippedAt" size="small" type="date" value-format="yyyy-MM-dd"
                        format="yyyy-MM-dd" :clearable="false" :editable="false" style="width:150px" />
                </div>
            </div>
            <div class="spb-scan">
                <el-input ref="scanRef" v-model="scan" size="small" prefix-icon="el-icon-full-screen" clearable
                    :placeholder="phone ? $tp('Scan or type a SKU') : $tp('Scan a SKU — one scan counts one unit; the oldest waiting order fills first…')" @keyup.enter.native="doScan">
                    <el-button slot="append" icon="el-icon-plus" :loading="scanning" @click="doScan" />
                </el-input>
                <!-- the device camera reads the label's barcode (phones; any
                     browser with a camera) — each read is one scan -->
                <el-button v-if="hasCamera" size="small" type="primary" plain icon="el-icon-camera" @click="cameraVisible = true">{{ $tp('Scan with camera') }}</el-button>
                <el-button size="small" icon="el-icon-tickets" @click="openPicker">{{ $tp('Pick from open orders') }}</el-button>
            </div>
            <barcode-scanner ref="scanner" :visible.sync="cameraVisible" :fullscreen="phone" @scan="onCameraScan">
                <!-- the batch as it builds, under the camera (user ask
                     2026-10-13): every line with its count, +/− and remove;
                     the line just read moves to the top. A scan with no
                     order behind it stays on as an unmatched line. -->
                <div class="spb-scanlist">
                    <div class="spb-scanlist-head">
                        <b>{{ $tp('{n} line(s)', { n: createForm.lines.length }) }}</b> · {{ $tp('{n} pcs', { n: createTotal }) }}
                        <span v-if="unlinkedCount" class="spb-warn"> · {{ $tp('{n} not on any order', { n: unlinkedCount }) }}</span>
                        <span v-if="unmatchedCount - unlinkedCount"> · {{ $tp('{n} not in PO (new lines)', { n: unmatchedCount - unlinkedCount }) }}</span>
                    </div>
                    <div v-if="!scanRows.length" class="spb-scanlist-empty">{{ $tp('Scanned lines show here') }}</div>
                    <div v-for="(l, i) in scanRows" :key="'s-' + (l.orderId || l.key || l.sku) + '-' + i" :class="['spb-scanrow', { hit: isLastScan(l), bad: l.unmatched }]">
                        <div class="spb-scanrow-main">
                            <div class="spb-pname">{{ l.productName || l.sku }} <span v-if="l.forCustomer" class="spb-for">{{ l.forCustomer }}</span></div>
                            <div class="spb-dim">{{ l.sku || '—' }}<template v-if="l.unmatched"> · <span class="spb-warn">{{ unmatchedLabel(l) }}</span></template><template v-else> · {{ $tp('ordered {n}', { n: l.orderQty }) }}</template></div>
                        </div>
                        <div class="spb-scanrow-qty">
                            <el-button size="mini" icon="el-icon-minus" circle :disabled="!l.qty || l.qty <= 1" @click="bumpQty(l, -1)" />
                            <b>{{ l.qty == null ? '—' : l.qty }}</b>
                            <el-button size="mini" icon="el-icon-plus" circle @click="bumpQty(l, 1)" />
                        </div>
                        <el-button type="text" icon="el-icon-close" class="spb-del spb-scanrow-del" @click="removeLine(l)" />
                    </div>
                </div>
            </barcode-scanner>
            <!-- One row per SKU and destination (user ask 2026-10-16): every
                 waiting PO line of the SKU for iMobile together (OSCAR's apart),
                 their ordered quantities side by side; the shipped count fills
                 the oldest line first — a line it doesn't reach stays open, the
                 one it ends in ships short (the rest becomes a new line). -->
            <!-- phones: a card per row — the fields that need typing (supplier, price, qty) big enough to tap -->
            <div v-if="phone" class="spb-line-cards">
                <div v-if="!lineGroups.length" class="spb-cards-empty">{{ $tp('Scan a SKU or pick orders to start the batch') }}</div>
                <div v-for="g in lineGroups" :key="g.key" class="spb-lcard">
                    <div class="spb-lcard-head">
                        <div class="spb-lcard-main">
                            <div class="spb-pname">{{ g.productName || g.sku }} <span v-if="g.forCustomer" class="spb-for">{{ g.forCustomer }}</span></div>
                            <div class="spb-dim">SKU: {{ g.sku || '—' }}<span v-if="g.category"> · {{ $tp(g.category) }}</span> · {{ groupOrderedText(g) }}</div>
                        </div>
                        <el-button type="text" icon="el-icon-close" class="spb-del spb-lcard-del" @click="removeLine(g)" />
                    </div>
                    <div class="spb-lcard-grid">
                        <div v-if="g.pending" class="spb-lcard-f spb-lcard-wide">
                            <label>{{ $tp('Supplier') }} *</label>
                            <el-select :value="g.supplier" size="small" filterable allow-create default-first-option :placeholder="$tp('Select')" style="width:100%"
                                @change="v => setGroupSupplier(g, v)">
                                <el-option v-for="sup in suppliers" :key="sup" :label="sup" :value="sup" />
                            </el-select>
                        </div>
                        <div class="spb-lcard-f">
                            <label>{{ $tp('Unit Price') }} (¥)</label>
                            <el-input-number :value="g.unitPrice" size="small" :min="0" :precision="2" :controls="false" style="width:100%"
                                :placeholder="g.mixedPrice ? $tp('mixed') : $tp('to fill')" @change="v => setGroupPrice(g, v)" />
                            <div class="spb-dim">{{ $tp('required to ship') }}</div>
                        </div>
                        <div class="spb-lcard-f">
                            <label>{{ $tp('Shipped Qty') }} *</label>
                            <el-input-number :value="g.qty" size="small" :min="1" :controls="false" style="width:100%" :placeholder="String(g.orderQty)"
                                :class="{ 'spb-short': g.qty != null && g.qty < g.orderQty }" @change="v => setGroupQty(g, v)" />
                            <div class="spb-dim">{{ $tp('Ordered Qty') }}: {{ orderQtyText(g) }}</div>
                        </div>
                    </div>
                    <div v-for="n in allocationNotes(g)" :key="n.k" :class="n.cls">{{ n.text }}</div>
                </div>
            </div>
            <el-table v-else :data="lineGroups" row-key="key" size="mini" border max-height="380" :empty-text="$tp('Scan a SKU or pick orders to start the batch')">
                <!-- the name wraps to at most 2 lines; hover for all of it -->
                <el-table-column :label="$tp('Product')" min-width="240">
                    <template slot-scope="s">
                        <div class="spb-pname" :title="s.row.productName">{{ s.row.productName || s.row.sku }}</div>
                        <div class="spb-dim spb-psku">SKU: {{ s.row.sku || '—' }}<span v-if="s.row.category"> · {{ $tp(s.row.category) }}</span>
                            <span v-if="s.row.forCustomer" class="spb-for">{{ s.row.forCustomer }}</span></div>
                        <div v-if="s.row.lines.length > 1" class="spb-dim">{{ s.row.lines.map(l => l.orderNo).join(' · ') }}</div>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Supplier')" width="150" align="center">
                    <template slot-scope="s">
                        <el-select v-if="s.row.pending" :value="s.row.supplier" size="mini" filterable allow-create
                            default-first-option :placeholder="$tp('Select')" style="width:130px" @change="v => setGroupSupplier(s.row, v)">
                            <el-option v-for="sup in suppliers" :key="sup" :label="sup" :value="sup" />
                        </el-select>
                        <template v-else>{{ s.row.supplierText || '—' }}</template>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Ordered')" width="110" align="center">
                    <template slot-scope="s">
                        <el-tag v-if="s.row.allPending" size="mini" type="warning">{{ $tp('Pending') }}</el-tag>
                        <template v-else>{{ fmtDay(s.row.orderedAt) }}<div v-if="s.row.pending" class="spb-dim">+ {{ $tp('Pending') }}</div></template>
                    </template>
                </el-table-column>
                <!-- Wanted to ship, not to save a draft (the purchase team can
                     fill the prices in on the downloaded sheet): prefilled from
                     the lines, editable — one price for the row's lines. -->
                <el-table-column :label="$tp('Unit Price') + ' (¥)'" width="110" align="center">
                    <template slot-scope="s">
                        <el-input-number :value="s.row.unitPrice" size="mini" :min="0" :precision="2" :controls="false"
                            :placeholder="s.row.mixedPrice ? $tp('mixed') : $tp('to fill')" style="width:88px" @change="v => setGroupPrice(s.row, v)" />
                    </template>
                </el-table-column>
                <!-- every waiting line's quantity: "10 + 20 + 30" over "= 60" -->
                <el-table-column :label="$tp('Ordered Qty')" width="110" align="center">
                    <template slot-scope="s">
                        <template v-if="s.row.lines.length > 1">
                            <div>{{ s.row.lines.map(l => l.orderQty).join(' + ') }}</div>
                            <div class="spb-dim">= {{ s.row.orderQty }}</div>
                        </template>
                        <template v-else>{{ s.row.orderQty }}</template>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Shipped Qty')" width="120" align="center">
                    <template slot-scope="s">
                        <el-input-number :value="s.row.qty" size="mini" :min="1" :controls="false" style="width:76px"
                            :placeholder="String(s.row.orderQty)" :class="{ 'spb-short': s.row.qty != null && s.row.qty < s.row.orderQty }" @change="v => setGroupQty(s.row, v)" />
                        <div v-for="n in allocationNotes(s.row)" :key="n.k" :class="n.cls">{{ n.text }}</div>
                        <div v-if="s.row.qty == null" class="spb-dim">{{ $tp('type or scan') }}</div>
                    </template>
                </el-table-column>
                <el-table-column width="40" align="center">
                    <template slot-scope="s">
                        <el-button type="text" size="mini" icon="el-icon-close" class="spb-del" @click="removeLine(s.row)" />
                    </template>
                </el-table-column>
            </el-table>
            <!-- ── Special Orders (user ask 2026-10-14): their own section — picked
                 from the open Special Order lines, or typed in here as new lines.
                 They have no Zoho item: on the PO every one goes under the shared
                 Special Order item with its own description, price and quantity. ── -->
            <div v-if="!isSea" class="spb-special">
                <div class="spb-special-head">
                    <b><i class="el-icon-star-off" /> {{ $tp('Special Order') }}</b>
                    <span class="spb-dim">{{ $tp('{n} line(s)', { n: createForm.special.length }) }}</span>
                    <span class="spb-spacer" />
                    <el-button size="mini" icon="el-icon-tickets" @click="openSpecialPicker">{{ $tp('Pick Special Orders') }}</el-button>
                    <el-button size="mini" type="primary" plain icon="el-icon-plus" @click="addSpecialBlank">{{ $tp('New line') }}</el-button>
                </div>
                <div v-if="!createForm.special.length" class="spb-dim spb-special-empty">{{ $tp('None on this batch') }}</div>
                <div v-else class="spb-special-lines">
                    <div v-for="(l, i) in createForm.special" :key="l.orderId || l.key" class="spb-slrow">
                        <div class="spb-slrow-main">
                            <el-input v-if="l.special" v-model="l.productName" size="small" maxlength="200" :placeholder="$tp('Description of the item')" />
                            <template v-else>
                                <div class="spb-pname">{{ l.productName }}</div>
                                <div class="spb-dim">{{ l.orderNo }}<span v-if="l.requestedFor"> · {{ $tp('For') }} {{ l.requestedFor }}</span> ·
                                    <template v-if="l.status === 'pending'">{{ $tp('Pending') }}</template><template v-else>{{ $tp('Ordered') }} {{ fmtDay(l.orderedAt) }}</template>
                                    · {{ $tp('Ordered Qty') }} {{ l.orderQty }}</div>
                            </template>
                        </div>
                        <el-select v-model="l.supplier" size="small" filterable allow-create default-first-option clearable :placeholder="$tp('Supplier') + ' (' + $tp('optional') + ')'" class="spb-slrow-sup">
                            <el-option v-for="sup in suppliers" :key="sup" :label="sup" :value="sup" />
                        </el-select>
                        <el-input-number v-model="l.unitPrice" size="small" :min="0" :precision="2" :controls="false" :placeholder="$tp('Unit Price') + ' ¥'" class="spb-slrow-num" />
                        <el-input-number v-model="l.qty" size="small" :min="1" :controls="false" :placeholder="$tp('Qty')" class="spb-slrow-num" />
                        <el-button type="text" icon="el-icon-close" class="spb-del" @click="createForm.special.splice(i, 1)" />
                    </div>
                </div>
            </div>
            <!-- ── Warranty (user ask 2026-10-14): replacement parts claimed from the
                 supplier — picked from the open Warranty lines, or a new line with a
                 product chosen from the register. No charge: price 0, the PO line
                 says "Warranty replacement". ── -->
            <div v-if="!isSea" class="spb-special spb-warranty">
                <div class="spb-special-head">
                    <b><i class="el-icon-umbrella" /> {{ $tp('Warranty') }}</b>
                    <span class="spb-dim">{{ $tp('{n} line(s)', { n: createForm.warranty.length }) }}</span>
                    <span class="spb-spacer" />
                    <el-button size="mini" icon="el-icon-tickets" @click="openSpecialPicker('Warranty')">{{ $tp('Pick Warranty lines') }}</el-button>
                    <el-button size="mini" type="primary" plain icon="el-icon-plus" @click="addWarrantyBlank">{{ $tp('New line') }}</el-button>
                </div>
                <div v-if="!createForm.warranty.length" class="spb-dim spb-special-empty">{{ $tp('None on this batch') }}</div>
                <div v-else class="spb-special-lines">
                    <div v-for="(l, i) in createForm.warranty" :key="l.orderId || l.key" :class="['spb-slrow', { 'spb-slrow-bad': l.unmatched && !l.itemId }]">
                        <img v-if="l.imageUrl" :src="l.imageUrl" class="spb-slrow-img" alt="" loading="lazy">
                        <div class="spb-slrow-main">
                            <div class="spb-pname" :title="l.productName">{{ l.productName || l.sku || '—' }}</div>
                            <div class="spb-dim spb-slrow-sub">
                                <template v-if="l.unmatched">
                                    <span v-if="l.itemId">SKU {{ l.sku || '—' }}<span v-if="l.category"> · {{ $tp(l.category) }}</span></span>
                                    <span v-else class="spb-warn">{{ $tp('Not on any order — pick a product') }}</span>
                                    <el-button type="text" size="mini" icon="el-icon-search" class="spb-slrow-act" @click="openProductPick(l)">{{ $tp('Choose product') }}</el-button>
                                </template>
                                <template v-else>{{ l.orderNo }} · SKU {{ l.sku || '—' }} ·
                                    <template v-if="l.status === 'pending'">{{ $tp('Pending') }}</template><template v-else>{{ $tp('Ordered') }} {{ fmtDay(l.orderedAt) }}</template>
                                    · {{ $tp('Ordered Qty') }} {{ l.orderQty }}</template>
                                <el-tag size="mini" type="success" class="spb-warranty-tag">{{ $tp('No charge') }}</el-tag>
                            </div>
                        </div>
                        <el-select v-model="l.supplier" size="small" filterable allow-create default-first-option clearable :placeholder="$tp('Supplier') + ' (' + $tp('optional') + ')'" class="spb-slrow-sup">
                            <el-option v-for="sup in suppliers" :key="sup" :label="sup" :value="sup" />
                        </el-select>
                        <el-input-number v-model="l.qty" size="small" :min="1" :controls="false" :placeholder="$tp('Qty')" class="spb-slrow-num" />
                        <el-button type="text" icon="el-icon-close" class="spb-del" @click="createForm.warranty.splice(i, 1)" />
                    </div>
                </div>
            </div>
            <!-- ── Not in PO (user ask 2026-10-14): scans with no order behind them, in
                 their own section — each linked to a register product (automatically
                 when the SKU is known, else searched here), with supplier, price and
                 count; every one ships as a new SP- line. "New line" starts one by hand. ── -->
            <div class="spb-special spb-extra">
                <div class="spb-special-head">
                    <b><i class="el-icon-warning-outline" /> {{ $tp('Not in PO') }}</b>
                    <span class="spb-dim">{{ $tp('{n} line(s)', { n: createForm.extra.length }) }}<span v-if="unlinkedCount" class="spb-warn"> · {{ $tp('{n} not on any order', { n: unlinkedCount }) }}</span></span>
                    <span class="spb-spacer" />
                    <el-button size="mini" type="primary" plain icon="el-icon-plus" @click="addExtraBlank">{{ $tp('New line') }}</el-button>
                </div>
                <div v-if="!createForm.extra.length" class="spb-dim spb-special-empty">{{ $tp('Scanned items with no order behind them land here') }}</div>
                <div v-else class="spb-special-lines">
                    <div v-for="(l, i) in createForm.extra" :key="l.key" :class="['spb-slrow', { 'spb-slrow-bad': !l.itemId }]">
                        <img v-if="l.imageUrl" :src="l.imageUrl" class="spb-slrow-img" alt="" loading="lazy">
                        <div class="spb-slrow-main">
                            <!-- the product as text; "Choose product" beside the label opens the search for this line -->
                            <div class="spb-pname" :title="l.productName">{{ l.productName || l.sku || '—' }}</div>
                            <div class="spb-dim spb-slrow-sub">
                                <span v-if="l.itemId">SKU {{ l.sku || '—' }}<span v-if="l.category"> · {{ $tp(l.category) }}</span> · <span class="spb-okt">{{ unmatchedLabel(l) }}</span></span>
                                <span v-else class="spb-warn"><template v-if="l.sku">{{ $tp('Scanned {sku}', { sku: l.sku }) }} · </template>{{ $tp('Not in Zoho') }}</span>
                                <el-button type="text" size="mini" icon="el-icon-search" class="spb-slrow-act" @click="openProductPick(l)">{{ $tp('Choose product') }}</el-button>
                                <!-- a SKU Zoho does not know can become a Special Order instead (空运 only) -->
                                <el-button v-if="!l.itemId && !isSea" type="text" size="mini" icon="el-icon-star-off" class="spb-slrow-act" @click="toSpecial(l)">{{ $tp('Special Order') }}</el-button>
                            </div>
                        </div>
                        <el-select v-model="l.supplier" size="small" filterable allow-create default-first-option :placeholder="$tp('Supplier')" class="spb-slrow-sup">
                            <el-option v-for="sup in suppliers" :key="sup" :label="sup" :value="sup" />
                        </el-select>
                        <el-input-number v-model="l.unitPrice" size="small" :min="0" :precision="2" :controls="false" :disabled="l.warranty" :placeholder="$tp('Unit Price') + ' ¥'" class="spb-slrow-num" />
                        <el-input-number v-model="l.qty" size="small" :min="1" :controls="false" :placeholder="$tp('Qty')" class="spb-slrow-num" />
                        <el-button type="text" icon="el-icon-close" class="spb-del" @click="createForm.extra.splice(i, 1)" />
                    </div>
                </div>
            </div>
            <!-- The price sheet (user ask 2026-10-13): a draft is saved with
                 the prices left blank, the list goes to the purchase team as a
                 spreadsheet, they fill the Unit Price column and send it back,
                 and the file is uploaded here to fill the prices in. -->
            <div v-if="allLines.length" class="spb-price-tools">
                <el-button type="text" size="mini" icon="el-icon-download" @click="downloadPriceSheet()">{{ $tp('Download price sheet') }}</el-button>
                <el-button type="text" size="mini" icon="el-icon-upload2" :loading="pricesUploading" @click="$refs.priceFile.click()">{{ $tp('Upload prices') }}</el-button>
                <input ref="priceFile" type="file" accept=".xlsx,.xls,.csv" class="spb-file" @change="uploadPrices">
                <span class="spb-dim spb-price-hint">{{ $tp('Prices can be filled in later: send the sheet to the purchase team and upload it when it comes back') }}</span>
            </div>
            <!-- Tracking with the parcel's freight beside it (the two arrive
                 together, on the courier's docket); the note beneath. The
                 shipping cost is optional and goes on the Zoho PO as its own
                 "Shipping fee" line. -->
            <div class="spb-head-fields spb-below">
                <div class="spb-field spb-field-grow">
                    <label>{{ $tp('Tracking') }}</label>
                    <el-input v-model="createForm.tracking" size="small" :placeholder="$tp('Can be added later')" clearable />
                </div>
                <div class="spb-field spb-field-ship">
                    <label>{{ $tp('Shipping cost') }} (¥)</label>
                    <el-input-number v-model="createForm.shippingCost" size="small" :min="0" :precision="2" :controls="false"
                        :placeholder="$tp('Optional')" style="width:150px" />
                    <span class="spb-dim spb-field-hint">{{ $tp('Added to the Zoho PO as its own line') }}</span>
                </div>
            </div>
            <div class="spb-field spb-below">
                <label>{{ $tp('Note') }}</label>
                <el-input v-model="createForm.note" type="textarea" :rows="3" resize="none" maxlength="500" show-word-limit
                    :placeholder="$tp('Optional')" />
            </div>
            <div slot="footer" class="spb-footer">
                <span class="spb-sum">
                    <el-button v-if="draftId" type="text" size="small" icon="el-icon-delete" class="spb-del" :loading="discarding"
                        @click="discardDraft">{{ $tp('Discard draft') }}</el-button>
                    <template v-if="allLines.length">{{ $tp('{n} line(s)', { n: allLines.length }) }} · {{ $tp('{n} pcs', { n: createTotal }) }}
                        <!-- the money: goods from the priced lines, plus the shipping cost -->
                        <template v-if="createAmount.goods || createAmount.shipping">
                            · <b>{{ $tp('Total') }} {{ yuan(createAmount.total) }}</b>
                            <span v-if="createAmount.shipping" class="spb-dim"> ({{ $tp('goods') }} {{ yuan(createAmount.goods) }} + {{ $tp('shipping') }} {{ yuan(createAmount.shipping) }})</span>
                        </template>
                        <span v-if="createAmount.unpriced" class="spb-warn"> · {{ $tp('{n} line(s) without a price', { n: createAmount.unpriced }) }}</span>
                        <span v-if="unlinkedCount" class="spb-warn"> · {{ $tp('{n} not on any order', { n: unlinkedCount }) }}</span>
                        <span v-if="unmatchedCount - unlinkedCount" class="spb-dim"> · {{ $tp('{n} not in PO (new lines)', { n: unmatchedCount - unlinkedCount }) }}</span>
                    </template>
                </span>
                <span>
                    <el-button size="small" @click="createVisible = false">{{ $tp('Cancel') }}</el-button>
                    <el-button size="small" icon="el-icon-document" :loading="savingDraft" :disabled="!allLines.length && !createForm.tracking && !createForm.note && createForm.shippingCost == null"
                        @click="saveDraft">{{ draftId ? $tp('Save draft') : $tp('Save as draft') }}</el-button>
                    <!-- Ship waits until every line has a price (user ask 2026-10-13) and no
                         unmatched line is left; the footer text says what is missing -->
                    <el-button type="primary" size="small" icon="el-icon-truck" :loading="creating" :disabled="!canShip"
                        @click="submitCreate">{{ $tp('Ship {n} line(s)', { n: shipLines.length }) }}</el-button>
                </span>
            </div>
        </el-dialog>

        <!-- ── Choose product (2026-10-14): the register search for one not-in-PO
             line; the pick links the line (it takes the item's SKU). ── -->
        <el-dialog :visible.sync="productPickVisible" width="560px" append-to-body top="12vh" :fullscreen="phone" :custom-class="dlgClass">
            <div slot="title" class="spb-dlg-head"><i class="el-icon-search" /> {{ $tp('Choose product') }}</div>
            <div v-if="productPickLine && productPickLine.sku" class="spb-dim spb-pick-for">{{ $tp('Scanned {sku}', { sku: productPickLine.sku }) }}<template v-if="productPickLine.productName"> · {{ productPickLine.productName }}</template></div>
            <el-autocomplete ref="productPickInput" v-model="productPickQuery" :fetch-suggestions="suggestProduct" :trigger-on-focus="false" :debounce="250"
                highlight-first-item value-key="name" size="small" style="width:100%" popper-class="spb-sug-popper" clearable
                :placeholder="$tp('Search by SKU or product name')" @select="pickProductFor">
                <template slot-scope="{ item }">
                    <div class="spb-sug">
                        <img v-if="item.imageUrl" :src="item.imageUrl" class="spb-sug-img" alt="" loading="lazy">
                        <div v-else class="spb-sug-img spb-sug-none"><i class="el-icon-picture-outline" /></div>
                        <div class="spb-sug-main">
                            <div class="spb-sug-name">{{ item.name }}</div>
                            <div class="spb-dim">SKU {{ item.sku || '—' }} · {{ $tp(item.suggestedCategory) }}<span v-if="item.available != null"> · {{ $tp('Stock') }} {{ item.available }}</span></div>
                        </div>
                    </div>
                </template>
            </el-autocomplete>
            <span slot="footer"><el-button size="small" @click="productPickVisible = false">{{ $tp('Cancel') }}</el-button></span>
        </el-dialog>

        <!-- ── Pick open Special Orders (2026-10-14): the waiting Special Order
             lines not on this batch yet; a click picks one. ── -->
        <el-dialog :visible.sync="specialPickerVisible" width="640px" append-to-body top="6vh" :fullscreen="phone" :custom-class="dlgClass">
            <div slot="title" class="spb-dlg-head"><i :class="specialPickerKind === 'Warranty' ? 'el-icon-umbrella' : 'el-icon-star-off'" /> {{ $tp(specialPickerKind === 'Warranty' ? 'Open Warranty lines' : 'Open Special Orders') }}</div>
            <div v-loading="specialPickerLoading" class="spb-lines spb-special-pick">
                <div v-if="!specialPickerRows.length && !specialPickerLoading" class="spb-lines-empty">
                    <i class="el-icon-folder-opened" />
                    <div>{{ $tp(specialPickerKind === 'Warranty' ? 'No waiting Warranty lines' : 'No waiting Special Orders') }}</div>
                </div>
                <div v-for="r in specialPickerRows" :key="r._id" :class="['spb-line', { on: specialPicked[r._id] }]" @click="toggleSpecialPick(r)">
                    <i :class="specialPicked[r._id] ? 'el-icon-success spb-line-check' : 'el-icon-circle-plus-outline spb-line-plus'" />
                    <div class="spb-line-main">
                        <div class="spb-line-name">{{ r.productName }}</div>
                        <div class="spb-dim">{{ r.orderNo }}<span v-if="r.requestedFor"> · {{ $tp('For') }} {{ r.requestedFor }}</span> ·
                            <span class="spb-status spb-line-status" :style="statusStyle(r.status)">{{ statusLabel(r.status) }}</span>
                            <span v-if="r.supplier"> · {{ r.supplier }}</span> · {{ fmtDay(r.orderedAt || r.createdAt) }}<span v-if="r.note"> · {{ r.note }}</span></div>
                    </div>
                    <div class="spb-line-qty">× {{ r.orderQty }}</div>
                </div>
            </div>
            <span slot="footer">
                <el-button size="small" @click="specialPickerVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button type="primary" size="small" :disabled="!specialPickedCount" @click="addSpecialPicked">{{ $tp('Add {n} line(s)', { n: specialPickedCount }) }}</el-button>
            </span>
        </el-dialog>

        <!-- ── Pick open orders: the Order Batch picker — a category on the
             left (open lines in red, picks in green), its lines on the
             right (ordered first, oldest first); a click picks a line and
             the picks add up across categories. ─────────────────────── -->
        <el-dialog :visible.sync="pickerVisible" width="960px" append-to-body top="4vh" :fullscreen="phone" :custom-class="dlgClass">
            <div slot="title" class="spb-dlg-head"><i class="el-icon-tickets" /> {{ $tp('Open orders') }}</div>
            <!-- One supplier's lines only (counts and list follow); picks
                 made under another supplier stay picked. -->
            <div class="spb-picker-bar">
                <label>{{ $tp('Supplier') }}</label>
                <el-select v-model="pickerSupplier" size="small" filterable clearable :placeholder="$tp('All suppliers')"
                    class="spb-picker-supplier" @change="onPickerSupplier">
                    <el-option v-for="o in pickerSuppliers" :key="o.value" :label="o.label + ' (' + o.n + ')'" :value="o.value" />
                </el-select>
            </div>
            <div v-loading="pickerLoading" class="spb-picker">
                <div class="spb-cats">
                    <div v-for="c in pickerCats" :key="c" :class="['spb-cat', { on: pickerCat === c, empty: !pickerCatCount(c) }]"
                        @click="pickerCat = c">
                        <span class="spb-cat-name">{{ $tp(c) }}</span>
                        <span v-if="pickedInCat(c)" class="spb-cat-sel"><i class="el-icon-check" />{{ pickedInCat(c) }}</span>
                        <span :class="['spb-cat-n', { 'is-zero': !pickerCatCount(c) }]">{{ pickerCatCount(c) }}</span>
                    </div>
                </div>
                <div class="spb-lines">
                    <div v-if="!pickerCatLines.length" class="spb-lines-empty">
                        <i class="el-icon-folder-opened" />
                        <div>{{ $tp('No waiting orders in this category') }}</div>
                    </div>
                    <div v-for="r in pickerCatLines" :key="r._id" :class="['spb-line', { on: pickerPicked[r._id] }]" @click="togglePick(r)">
                        <i :class="pickerPicked[r._id] ? 'el-icon-success spb-line-check' : 'el-icon-circle-plus-outline spb-line-plus'" />
                        <div class="spb-line-main">
                            <div class="spb-line-name">{{ r.productName }}</div>
                            <div class="spb-dim">SKU: {{ r.sku || '—' }} ·
                                <span class="spb-status spb-line-status" :style="statusStyle(r.status)">{{ statusLabel(r.status) }}</span>
                                <span v-if="r.supplier"> · {{ r.supplier }}</span> · {{ fmtDay(r.orderedAt || r.createdAt) }}<span
                                    v-if="r.note"> · {{ r.note }}</span></div>
                        </div>
                        <div class="spb-line-qty">× {{ r.orderQty }}</div>
                    </div>
                </div>
            </div>
            <span slot="footer">
                <span class="spb-foot-sum">{{ $tp('{n} line(s) selected', { n: pickerCount }) }}<span v-if="pickerCount"> · {{ pickerQty }} {{ $tp('Pcs') }}</span></span>
                <el-button size="small" @click="pickerVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button type="primary" size="small" :disabled="!pickerCount" @click="addPicked">{{ $tp('Add {n} line(s)', { n: pickerCount }) }}</el-button>
            </span>
        </el-dialog>

        <!-- ── View batch ───────────────────────────────────────────── -->
        <el-dialog :visible.sync="viewVisible" width="900px" append-to-body top="5vh" :fullscreen="phone" :custom-class="dlgClass">
            <div slot="title" class="spb-dlg-head"><i class="el-icon-tickets" /> {{ view ? view.batchNo : '' }}
                <span v-if="view" :class="['spb-freight', freightOf(view)]">{{ freightLabel(view) }}</span>
                <el-tag v-if="view" size="mini" :type="batchTag(view.status)" effect="plain" class="spb-dlg-tag">{{ batchLabel(view.status) }}</el-tag>
            </div>
            <div v-if="view">
                <el-descriptions :column="phone ? 1 : 3" border size="small" class="spb-desc">
                    <el-descriptions-item :label="$tp('Shipped')">{{ fmtDay(view.shippedAt) }}</el-descriptions-item>
                    <el-descriptions-item :label="$tp('Zoho vendor')">{{ view.zohoVendorName || '—' }}</el-descriptions-item>
                    <el-descriptions-item :label="$tp('Created by')">{{ view.createdBy || '—' }} · {{ fmtWhen(view.createdAt) }}</el-descriptions-item>
                    <el-descriptions-item :label="$tp('Received')">
                        <template v-if="view.receivedAt">{{ fmtDay(view.receivedAt) }}<span v-if="view.receivedBy"> · {{ view.receivedBy }}</span><span v-if="view.receiveNote"> · {{ $tp('on receipt') }}: {{ view.receiveNote }}</span></template>
                        <span v-else>—</span>
                    </el-descriptions-item>
                    <el-descriptions-item :label="$tp('Shipping cost')">{{ view.shippingCost != null ? yuan(view.shippingCost) : '—' }}</el-descriptions-item>
                    <el-descriptions-item :label="$tp('Total')">
                        <template v-if="viewAmount.goods || viewAmount.shipping">
                            <b>{{ yuan(viewAmount.total) }}</b>
                            <span v-if="viewAmount.shipping" class="spb-dim"> ({{ $tp('goods') }} {{ yuan(viewAmount.goods) }} + {{ $tp('shipping') }} {{ yuan(viewAmount.shipping) }})</span>
                            <span v-if="viewAmount.unpriced" class="spb-dim"> · {{ $tp('{n} line(s) without a price', { n: viewAmount.unpriced }) }}</span>
                        </template>
                        <span v-else>—</span>
                    </el-descriptions-item>
                    <el-descriptions-item :label="$tp('Zoho PO')" :span="phone ? 1 : 3">
                        <template v-if="view.zoho && view.zoho.pos && view.zoho.pos.length">
                            <span v-for="p in view.zoho.pos" :key="p.purchaseorderId" class="spb-zpo-inline">
                                <a class="spb-link" :href="zohoPoLink(p.purchaseorderId)" target="_blank" rel="noopener">{{ p.number }}</a>
                                <span class="spb-dim"> {{ p.vendorName }} · {{ $tp('{n} line(s)', { n: p.lines }) }}</span>
                            </span>
                        </template>
                        <span v-else-if="view.zoho && view.zoho.errors && view.zoho.errors.length" class="spb-warn">{{ view.zoho.errors[0].message }}</span>
                        <span v-else>—</span>
                    </el-descriptions-item>
                </el-descriptions>
                <div v-if="phone" class="spb-line-cards">
                    <div v-for="(l, i) in view.lines" :key="i" class="spb-lcard">
                        <div class="spb-lcard-head">
                            <div class="spb-lcard-main">
                                <div class="spb-pname">{{ i + 1 }}. {{ l.productName }} <el-tag v-if="l.warranty" size="mini" type="success">{{ $tp('Warranty') }}</el-tag></div>
                                <div class="spb-dim">SKU: {{ l.sku || '—' }}<span v-if="l.category"> · {{ $tp(l.category) }}</span><span v-if="l.supplier"> · {{ l.supplier }}</span></div>
                            </div>
                            <el-button type="text" icon="el-icon-printer" class="spb-lcard-del" :title="$tp('Print {n} label(s)', { n: Math.max(1, Math.floor(Number(l.shippedQty)) || 0) })" @click="printLineLabels(l)" />
                        </div>
                        <div class="spb-lcard-nums">
                            <span><em>{{ $tp('Unit Price') }}</em>{{ yuan(l.unitPrice) }}</span>
                            <span><em>{{ $tp('Ordered Qty') }}</em>{{ l.orderQty }}</span>
                            <span><em>{{ $tp('Shipped Qty') }}</em><b :class="qtyTone(l)">{{ l.shippedQty }}</b></span>
                            <span v-if="view.status === 'received'"><em>{{ $tp('Received Qty') }}</em><span :class="{ 'spb-warn': l.receivedQty !== l.shippedQty }">{{ l.receivedQty }}</span></span>
                        </div>
                    </div>
                </div>
                <el-table v-else :data="view.lines" size="mini" border max-height="400" class="spb-view-lines">
                    <el-table-column label="#" type="index" width="40" align="center" />
                    <!-- the name wraps to at most 2 lines (user ask 2026-10-05); hover for all of it -->
                    <el-table-column :label="$tp('Product')" min-width="260">
                        <template slot-scope="s">
                            <div class="spb-pname" :title="s.row.productName">{{ s.row.productName }} <el-tag v-if="s.row.warranty" size="mini" type="success">{{ $tp('Warranty') }}</el-tag></div>
                            <div class="spb-dim spb-psku">SKU: {{ s.row.sku || '—' }}<span v-if="s.row.category"> · {{ $tp(s.row.category) }}</span></div>
                        </template>
                    </el-table-column>
                    <el-table-column :label="$tp('Supplier')" width="110" align="center" show-overflow-tooltip>
                        <template slot-scope="s">{{ s.row.supplier || '—' }}</template>
                    </el-table-column>
                    <el-table-column :label="$tp('Unit Price')" width="96" align="center">
                        <template slot-scope="s">{{ yuan(s.row.unitPrice) }}</template>
                    </el-table-column>
                    <el-table-column :label="$tp('Ordered Qty')" width="90" align="center">
                        <template slot-scope="s">{{ s.row.orderQty }}</template>
                    </el-table-column>
                    <el-table-column :label="$tp('Shipped Qty')" width="90" align="center">
                        <template slot-scope="s"><b :class="qtyTone(s.row)">{{ s.row.shippedQty }}</b></template>
                    </el-table-column>
                    <!-- 50×40 part labels: one per shipped unit of the line. -->
                    <el-table-column :label="$tp('Label')" width="60" align="center">
                        <template slot-scope="s">
                            <el-tooltip :content="$tp('Print {n} label(s)', { n: Math.max(1, Math.floor(Number(s.row.shippedQty)) || 0) })" placement="top">
                                <el-button type="text" size="mini" icon="el-icon-printer" @click="printLineLabels(s.row)" />
                            </el-tooltip>
                        </template>
                    </el-table-column>
                    <el-table-column v-if="view.status === 'received'" :label="$tp('Received Qty')" width="100" align="center">
                        <template slot-scope="s"><span :class="{ 'spb-warn': s.row.receivedQty !== s.row.shippedQty }">{{ s.row.receivedQty }}</span></template>
                    </el-table-column>
                </el-table>
                <!-- Tracking and note, edited right here (a tracking number
                     usually turns up after the batch has shipped). -->
                <div class="spb-inline">
                    <el-input v-model="viewEdit.tracking" size="small" clearable :disabled="!canEditView()" class="spb-inline-tracking"
                        :placeholder="$tp('Tracking number')">
                        <template slot="prepend">{{ $tp('Tracking') }}</template>
                        <template v-if="viewEdit.tracking" slot="append">
                            <a class="spb-link" :href="dhlLink(viewEdit.tracking)" target="_blank" rel="noopener" :title="$tp('Track on DHL')"><i class="el-icon-position" /></a>
                        </template>
                    </el-input>
                    <!-- the shipping cost, while shipped and not yet received (2026-10-15):
                         saved onto the Zoho PO's shipping line as well -->
                    <div v-if="view.status === 'shipped'" class="spb-inline-ship">
                        <span class="spb-inline-label">{{ $tp('Shipping cost') }} (¥)</span>
                        <el-input-number v-model="viewEdit.shippingCost" size="small" :min="0" :precision="2" :controls="false"
                            :disabled="!canEditView()" :placeholder="$tp('Optional')" />
                    </div>
                    <el-input v-model="viewEdit.note" type="textarea" :rows="2" resize="none" maxlength="500" show-word-limit
                        :disabled="!canEditView()" :placeholder="$tp('Note')" />
                    <div v-if="canEditView()" class="spb-inline-actions">
                        <span v-if="viewDirty()" class="spb-dim">{{ $tp('Unsaved changes') }}</span>
                        <el-button size="mini" :disabled="!viewDirty()" @click="resetViewEdit">{{ $tp('Reset') }}</el-button>
                        <el-button type="primary" size="mini" :disabled="!viewDirty()" :loading="viewSaving" @click="saveViewEdit">{{ $tp('Save') }}</el-button>
                    </div>
                </div>
            </div>
            <span slot="footer">
                <el-button size="small" icon="el-icon-printer" @click="print(view)">{{ $tp('Print') }}</el-button>
                <el-button size="small" icon="el-icon-collection-tag" :disabled="!labelCount(view)" @click="printAllLabels(view)">
                    {{ $tp('Print labels ({n})', { n: labelCount(view) }) }}</el-button>
                <el-button v-if="view && can('spp:order:receive') && view.status === 'shipped'" type="success" size="small"
                    icon="el-icon-circle-check" @click="openReceive(view)">{{ $tp('Receive') }}</el-button>
                <el-button size="small" @click="viewVisible = false">{{ $tp('Close') }}</el-button>
            </span>
        </el-dialog>

        <!-- ── Print preview ────────────────────────────────────────── -->
        <el-dialog :title="$tp('Print preview')" :visible.sync="printVisible" :width="phone ? '96%' : '860px'" append-to-body top="4vh"
            custom-class="spb-print-dlg">
            <iframe ref="printFrame" class="spb-print-frame" :srcdoc="printHtml" title="packing list" />
            <span slot="footer">
                <el-button size="small" @click="printVisible = false">{{ $tp('Close') }}</el-button>
                <el-button type="primary" size="small" icon="el-icon-printer" @click="doPrint">{{ $tp('Print') }}</el-button>
            </span>
        </el-dialog>

        <!-- ── Label preview: the PDF, printed or saved from here ───── -->
        <el-dialog :title="labelTitle" :visible.sync="labelVisible" :width="phone ? '96%' : '560px'" append-to-body top="5vh" @closed="cleanupLabels">
            <!-- Portrait = the same label turned 90° on a 40 × 50 page, for a
                 printer whose label stock runs the other way; remembered. -->
            <div v-if="!labelOscar" class="label-orient">
                <span>{{ $tp('Orientation') }}</span>
                <el-radio-group v-model="labelOrientation" size="mini" @change="onLabelOrientation">
                    <el-radio-button label="portrait">{{ $tp('Portrait') }}</el-radio-button>
                    <el-radio-button label="landscape">{{ $tp('Landscape') }}</el-radio-button>
                </el-radio-group>
                <span class="label-orient-gap">{{ $tp('Size') }}</span>
                <el-radio-group v-model="labelSize" size="mini" @change="onLabelSize">
                    <el-radio-button v-for="z in LABEL_SIZES" :key="z.key" :label="z.key">{{ $tp(z.label) }}</el-radio-button>
                </el-radio-group>
                <span v-if="labelSize === '40x30x2'">{{ $tp('2 labels per page, side by side') }}</span>
            </div>
            <iframe v-if="labelUrl" :src="labelUrl" class="spb-label-frame" title="labels" />
            <span slot="footer">
                <el-button size="small" icon="el-icon-download" @click="downloadLabels">{{ $tp('Download') }}</el-button>
                <el-button size="small" @click="labelVisible = false">{{ $tp('Close') }}</el-button>
                <el-button type="primary" size="small" icon="el-icon-printer" @click="printLabels">{{ $tp('Print') }}</el-button>
            </span>
        </el-dialog>

        <!-- ── Edit tracking / date / note ──────────────────────────── -->
        <el-dialog :title="$tp('Edit batch')" :visible.sync="editVisible" :width="phone ? '96%' : '480px'" append-to-body>
            <el-form label-position="top" size="small" @submit.native.prevent>
                <el-form-item :label="$tp('Tracking')">
                    <el-input v-model="editForm.tracking" clearable />
                </el-form-item>
                <el-form-item :label="$tp('Ship date')">
                    <el-date-picker v-model="editForm.shippedAt" type="date" value-format="yyyy-MM-dd" format="yyyy-MM-dd"
                        :clearable="false" :editable="false" style="width:100%" />
                </el-form-item>
                <el-form-item :label="$tp('Note')">
                    <el-input v-model="editForm.note" maxlength="200" clearable />
                </el-form-item>
                <!-- the shipping cost, while shipped and not yet received (2026-10-15): goes onto the Zoho PO's shipping line -->
                <el-form-item v-if="editRow && editRow.status === 'shipped'" :label="$tp('Shipping cost') + ' (¥)'">
                    <el-input-number v-model="editForm.shippingCost" size="small" :min="0" :precision="2" :controls="false"
                        :placeholder="$tp('Optional')" style="width:100%" />
                </el-form-item>
            </el-form>
            <span slot="footer">
                <el-button size="small" @click="editVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button type="primary" size="small" :loading="editSaving" @click="submitEdit">{{ $tp('Save') }}</el-button>
            </span>
        </el-dialog>

        <!-- ── Receive ──────────────────────────────────────────────── -->
        <el-dialog :visible.sync="receiveVisible" width="760px" append-to-body top="6vh" :fullscreen="phone" :custom-class="dlgClass">
            <div slot="title" class="spb-dlg-head"><i class="el-icon-circle-check" /> {{ $tp('Receive') }} {{ receiveBatchDoc ? receiveBatchDoc.batchNo : '' }}</div>
            <div class="spb-head-fields">
                <div class="spb-field spb-field-date">
                    <label>{{ $tp('Received on') }}</label>
                    <el-date-picker v-model="receiveForm.receivedAt" size="small" type="date" value-format="yyyy-MM-dd"
                        format="yyyy-MM-dd" :clearable="false" :editable="false" style="width:150px" />
                </div>
                <div class="spb-field spb-field-grow">
                    <label>{{ $tp('Note') }}</label>
                    <el-input v-model="receiveForm.note" size="small" maxlength="200" :placeholder="$tp('Anything missing or damaged?')" clearable />
                </div>
            </div>
            <div v-if="phone" class="spb-line-cards">
                <div v-for="(l, i) in receiveForm.lines" :key="i" class="spb-lcard">
                    <div class="spb-pname">{{ l.productName }}</div>
                    <div class="spb-dim">SKU: {{ l.sku || '—' }}</div>
                    <div class="spb-lcard-grid">
                        <div class="spb-lcard-f"><label>{{ $tp('Shipped Qty') }}</label><b :class="qtyTone(l)" class="spb-lcard-val">{{ l.shippedQty }}</b></div>
                        <div class="spb-lcard-f"><label>{{ $tp('Received Qty') }}</label>
                            <el-input-number v-model="l.receivedQty" size="small" :min="0" :controls="false" style="width:100%" :class="{ 'spb-short': l.receivedQty !== l.shippedQty }" /></div>
                    </div>
                </div>
            </div>
            <el-table v-else :data="receiveForm.lines" size="mini" border max-height="380">
                <!-- the name wraps to at most 2 lines; hover for all of it -->
                <el-table-column :label="$tp('Product')" min-width="260">
                    <template slot-scope="s">
                        <div class="spb-pname" :title="s.row.productName">{{ s.row.productName }}</div>
                        <div class="spb-dim spb-psku">SKU: {{ s.row.sku || '—' }}</div>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Shipped Qty')" width="100" align="center">
                    <template slot-scope="s"><b :class="qtyTone(s.row)">{{ s.row.shippedQty }}</b></template>
                </el-table-column>
                <el-table-column :label="$tp('Received Qty')" width="130" align="center">
                    <template slot-scope="s">
                        <el-input-number v-model="s.row.receivedQty" size="mini" :min="0" :controls="false" style="width:80px"
                            :class="{ 'spb-short': s.row.receivedQty !== s.row.shippedQty }" />
                    </template>
                </el-table-column>
            </el-table>
            <div class="spb-hint"><i class="el-icon-info" /> {{ $tp('Every line on the batch is marked received. Change a quantity only when the count differs.') }}</div>
            <span slot="footer">
                <el-button size="small" @click="receiveVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button type="success" size="small" icon="el-icon-circle-check" :loading="receiving" @click="submitReceive">{{ $tp('Confirm receipt') }}</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import { hasPermission } from '@/utils/permission'
import { listBatches, getBatch, createBatch, updateBatch, receiveBatch, lookupOrder, openLines, getMeta, retryBatchZoho, updateBatchDraft, shipBatchDraft, discardBatchDraft, searchProducts } from '@/api/sparePartsPurchase'
import BarcodeScanner from './components/BarcodeScanner'
import * as XLSX from 'xlsx-js-style'
import { STATUS_META, BATCH_STATUS, CATEGORIES, fmtDay, fmtWhen, yuan, dhlLink, zohoPoLink, todayYmd, packingListHtml, batchAmount } from './shared'
import { buildSppLineLabelsPdf, buildSppBatchLabelsPdf, sppLabelCount, sppLabelFileName, withLabelNames, getLabelOrientation, setLabelOrientation, getLabelSize, setLabelSize, LABEL_SIZES } from '@/utils/sppLabelPdf'
import { appendOscarLabelsToDoc, appendDispatchLabelsToDoc } from '@/utils/dispatchItemLabelPdf'
// Category names are stored in English (the register's words) and shown
// through $tp, like everything else on the page.

// Supplier filter value for lines that have no supplier yet.
const NO_SUPPLIER = '__none__'
// the sea-freight category: a 海运 batch takes only its lines, a 空运 batch everything else
const SEA = '海运'
// Oldest PO line first, as the server's scan lookup orders them: ordered
// before pending, then by order date, then by SP- number (creation order).
const seqOf = no => Number(String(no || '').replace(/\D/g, '')) || 0
const oldestFirst = (a, b) => (a.status === 'pending' ? 1 : 0) - (b.status === 'pending' ? 1 : 0) ||
    (new Date(a.orderedAt || a.createdAt || 0) - new Date(b.orderedAt || b.createdAt || 0)) || seqOf(a.orderNo) - seqOf(b.orderNo)

export default {
    name: 'SppBatches',
    components: { BarcodeScanner },
    data() {
        return {
            rows: [],
            total: 0,
            page: 1,
            pageSize: 20,
            loading: false,
            byStatus: {},
            statusFilter: '',
            search: '',
            suppliers: [],
            zohoVendors: [],
            // print preview
            printVisible: false,
            printHtml: '',
            // part labels (PDF preview)
            labelVisible: false,
            labelTitle: '',
            labelUrl: '',
            labelBuild: null,
            labelFileName: '',
            labelOrientation: getLabelOrientation(),
            labelOscar: false, // the preview holds only fixed-size labels (Oscar's / Order Dispatch's): no size / orientation choice
            labelSize: getLabelSize(),
            LABEL_SIZES,
            // a phone-width window (user ask 2026-10-13: batches are created on
            // the team's phones): cards instead of tables, fullscreen dialogs
            phone: window.innerWidth < 768,
            // the camera scanner (Create Batch): shown wherever a camera API exists
            hasCamera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            cameraVisible: false,
            lastScan: '', // the SKU just read — its line is highlighted in the camera view
            // create / draft — 海运 (sea) or 空运 (air) is chosen first
            freightVisible: false,
            createVisible: false,
            createForm: { freight: 'air', zohoVendorId: '', tracking: '', shippedAt: todayYmd(), note: '', shippingCost: undefined, lines: [], extra: [], special: [], warranty: [] },
            // "Choose product" for one not-in-PO line
            productPickVisible: false,
            productPickQuery: '',
            productPickLine: null,
            // the Special Order picker
            specialPickerVisible: false,
            specialPickerKind: 'Special Order', // or 'Warranty'
            specialPickerLoading: false,
            specialPickerRows: [],
            specialPicked: {},
            creating: false,
            draftId: null,
            savingDraft: false,
            discarding: false,
            pricesUploading: false,
            scan: '',
            scanning: false,
            // picker
            // open-orders picker: every waiting line, the category shown,
            // and the picks (by id)
            CATEGORIES,
            pickerVisible: false,
            pickerRows: [],
            pickerCat: '',
            pickerPicked: {},
            pickerSupplier: '', // '' = all, NO_SUPPLIER = lines without one
            pickerLoading: false,
            // view / edit / receive
            viewVisible: false,
            // tracking / note edited inline in the view dialog
            viewEdit: { tracking: '', note: '', shippingCost: undefined },
            viewSaving: false,
            view: null,
            editVisible: false,
            editRow: null,
            editForm: { tracking: '', shippedAt: '', note: '' },
            editSaving: false,
            receiveVisible: false,
            receiveBatchDoc: null,
            receiveForm: { receivedAt: todayYmd(), note: '', lines: [] },
            receiving: false,
            zohoRetryingId: null
        }
    },
    computed: {
        // the create / picker / view / receive dialogs on a phone
        dlgClass() { return this.phone ? 'spb-dlg spb-dlg-phone' : 'spb-dlg' },
        // The supplier filter's options: every supplier on a waiting line,
        // busiest first, plus the lines with none (usually still pending).
        pickerSuppliers() {
            const n = {}
            let none = 0
            for (const r of this.pickerRows) {
                const k = (r.supplier || '').trim()
                if (k) n[k] = (n[k] || 0) + 1
                else none++
            }
            const out = Object.keys(n).sort((a, b) => n[b] - n[a] || a.localeCompare(b)).map(k => ({ value: k, label: k, n: n[k] }))
            if (none) out.push({ value: NO_SUPPLIER, label: this.$tp('No supplier'), n: none })
            return out
        },
        pickerFiltered() {
            const f = this.pickerSupplier
            if (!f) return this.pickerRows
            return this.pickerRows.filter(r => (f === NO_SUPPLIER ? !(r.supplier || '').trim() : (r.supplier || '').trim() === f))
        },
        // Waiting lines per side-menu category, and the shown one's lines.
        pickerByCat() {
            const by = {}
            for (const r of this.pickerFiltered) (by[this.pickerCatOf(r)] = by[this.pickerCatOf(r)] || []).push(r)
            return by
        },
        // the batch being built ships by sea (海运)
        isSea() {
            return this.createForm.freight === 'sea'
        },
        // the picker's categories: a 海运 batch takes only 海运; a 空运 one every
        // other category but Special Orders and Warranty (their own sections, 2026-10-14)
        pickerCats() {
            if (this.isSea) return [SEA]
            return CATEGORIES.filter(c => c !== SEA && c !== 'Special Order' && c !== 'Warranty')
        },
        pickerCatLines() {
            return this.pickerByCat[this.pickerCat] || []
        },
        pickerCount() {
            return Object.keys(this.pickerPicked).length
        },
        pickerQty() {
            return Object.values(this.pickerPicked).reduce((t, r) => t + (r.orderQty || 0), 0)
        },
        totalAll() {
            return Object.keys(this.byStatus).reduce((t, k) => t + (this.byStatus[k] || 0), 0)
        },
        // every line on the form: the main list and the Special Order section
        allLines() {
            return [...this.createForm.lines, ...this.createForm.extra, ...this.createForm.warranty, ...this.createForm.special]
        },
        // The order lines as the form shows them (user ask 2026-10-16): one
        // row per SKU and destination — iMobile's own lines together, a line
        // raised for a customer (OSCAR) apart, by its return code — the lines
        // oldest first; the row's count is spread over them in that order.
        lineGroups() {
            const order = []
            const by = {}
            for (const l of this.createForm.lines) {
                const k = this.groupKey(l)
                if (!by[k]) { by[k] = []; order.push(k) }
                by[k].push(l)
            }
            return order.map(key => {
                const lines = [...by[key]].sort(oldestFirst)
                const first = lines[0]
                const counted = lines.filter(l => l.qty != null && l.qty !== '')
                const pend = lines.filter(l => l.status === 'pending')
                const prices = [...new Set(lines.map(l => (l.unitPrice == null || l.unitPrice === '' ? null : Number(l.unitPrice))))]
                const ordered = lines.filter(l => l.status !== 'pending' && l.orderedAt)
                return {
                    isGroup: true, key, lines,
                    sku: first.sku, productName: first.productName, category: first.category, forCustomer: first.forCustomer || '',
                    orderQty: lines.reduce((t, l) => t + (Number(l.orderQty) || 0), 0),
                    qty: counted.length ? counted.reduce((t, l) => t + (Number(l.qty) || 0), 0) : undefined,
                    pending: pend.length > 0,
                    allPending: pend.length === lines.length,
                    supplier: pend.length ? pend[0].supplier : '',
                    supplierText: [...new Set(lines.map(l => l.supplier).filter(Boolean))].join(', '),
                    unitPrice: prices.length === 1 && prices[0] != null ? prices[0] : undefined,
                    mixedPrice: prices.length > 1,
                    orderedAt: ordered.length ? ordered[0].orderedAt : null
                }
            })
        },
        // what ships: the order lines the count reaches, and every line of the other sections
        shipLines() {
            return [...this.createForm.lines.filter(l => Number(l.qty) > 0), ...this.createForm.extra, ...this.createForm.warranty, ...this.createForm.special]
        },
        // the camera view: the not-in-PO lines first (they need attention), then the order rows
        scanRows() {
            return [...this.createForm.extra, ...this.lineGroups, ...this.createForm.warranty]
        },
        specialPickedCount() {
            return Object.keys(this.specialPicked).length
        },
        // typed Special Order lines still without a description
        specialIncomplete() {
            return this.createForm.special.filter(l => l.special && !(l.productName || '').trim()).length
        },
        createTotal() {
            return this.allLines.reduce((t, l) => t + (Number(l.qty) || 0), 0)
        },
        // the money on the form (the lines that ship) / on the batch being viewed
        createAmount() {
            return batchAmount(this.shipLines, this.createForm.shippingCost, l => l.qty)
        },
        // lines scanned with no order behind them (kept for adjustment)
        unmatchedCount() {
            return this.createForm.extra.length
        },
        // the batch can ship: lines on it, every one priced, none unmatched
        // not-in-PO lines still without a product picked
        unlinkedCount() {
            return this.createForm.extra.filter(l => !l.itemId).length + this.createForm.warranty.filter(l => l.unmatched && !l.itemId).length
        },
        canShip() {
            return this.shipLines.length > 0 && !this.createAmount.unpriced && !this.unlinkedCount && !this.specialIncomplete
        },
        viewAmount() {
            return this.view ? batchAmount(this.view.lines, this.view.shippingCost) : batchAmount([], 0)
        }
    },
    created() {
        this.load().then(() => this.fromQuery())
    },
    // Coming back to the tab (kept alive by the tags bar): fresh data, and
    // a ?batch= / ?create= link opens even when the tab was already open.
    // The first activation follows created(), which has done both.
    mounted() {
        this.onResize = () => { this.phone = window.innerWidth < 768 }
        window.addEventListener('resize', this.onResize)
    },
    beforeDestroy() {
        window.removeEventListener('resize', this.onResize)
    },
    activated() {
        if (!this.activatedOnce) { this.activatedOnce = true; return }
        this.load().then(() => this.fromQuery())
    },
    methods: {
        fmtDay, fmtWhen, yuan, dhlLink, zohoPoLink,
        can(p) {
            return hasPermission(this.$store.getters.permissions, p)
        },
        batchLabel(v) {
            const m = BATCH_STATUS[v]
            return m ? this.$tp(m.label) : v
        },
        batchTag(v) {
            const m = BATCH_STATUS[v]
            return m ? m.type : 'info'
        },
        // 海运 (sea) or 空运 (air) — batches from before 2026-10-16 carry none: they were all air
        freightOf(b) {
            return b && b.freight === 'sea' ? 'sea' : 'air'
        },
        freightLabel(b) {
            return this.freightOf(b) === 'sea' ? SEA : '空运'
        },
        // the list shows the kind as an icon (user 2026-10-16): a ship / a plane
        freightIcon(b) {
            return this.freightOf(b) === 'sea' ? 'el-icon-ship' : 'el-icon-position'
        },
        statusLabel(v) {
            const m = STATUS_META[v]
            return m ? this.$tp(m.label) : v
        },
        statusStyle(v) {
            const m = STATUS_META[v]
            return m ? { color: m.color, background: m.bg } : {}
        },
        // ── Zoho purchase orders ───────────────────────────────────
        zohoIncomplete(b) {
            const z = b.zoho
            if (!z) return true
            return z.status === 'error' || z.status === 'partial'
        },
        zohoToast(z) {
            if (!z) return
            if (z.pos && z.pos.length) {
                this.$message.success(this.$tp('Zoho PO created: {nos}', { nos: z.pos.map(p => p.number).join(', ') }))
            }
            if (z.errors && z.errors.length) {
                this.$message.warning(this.$tp('Zoho PO could not be created — use the retry on the batch') + ': ' + z.errors[0].message)
            }
            if (z.skipped && z.skipped.length) {
                this.$message.info(this.$tp('{n} line(s) without a Zoho item were left off the Zoho PO', { n: z.skipped.length }))
            }
        },
        async retryZoho(row) {
            this.zohoRetryingId = row._id
            try {
                const r = await retryBatchZoho(row._id)
                this.zohoToast(r && r.zoho)
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Zoho PO could not be created — use the retry on the batch')))
            } finally {
                this.zohoRetryingId = null
            }
        },
        // Shipped quantity: green when the whole order went, yellow when short.
        qtyTone(l) {
            if (l.orderQty == null || l.shippedQty == null) return ''
            return l.shippedQty < l.orderQty ? 'spb-qty-short' : 'spb-qty-full'
        },
        msg(e, fallback) {
            return (e && (e.message || (e.response && e.response.data && e.response.data.message))) || fallback
        },
        // ── List ───────────────────────────────────────────────────
        async load() {
            this.loading = true
            try {
                const r = await listBatches({ page: this.page, pageSize: this.pageSize, status: this.statusFilter || undefined, search: this.search || undefined })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.rows || []
                this.total = r.total || 0
                this.byStatus = r.byStatus || {}
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load the batches')))
            } finally {
                this.loading = false
            }
        },
        reload() { this.page = 1; this.load() },
        onPage(p) { this.page = p; this.load() },
        onSize(s) { this.pageSize = s; this.reload() },
        fromQuery() {
            const q = this.$route.query || {}
            if (q.batch) this.openByNo(String(q.batch))
            // (never over a form still open from before — that would wipe it);
            // ?create=sea|air opens that kind straight away, else 海运 / 空运 is asked first
            else if (q.create && !this.createVisible) {
                if (q.create === 'sea' || q.create === 'air') this.openCreate(q.create)
                else this.freightVisible = true
            }
        },
        clearQuery() {
            if (Object.keys(this.$route.query || {}).length) this.$router.replace({ query: {} }).catch(() => {})
        },
        // ── Create ─────────────────────────────────────────────────
        // 海运 or 空运 picked: the batch form for that kind
        chooseFreight(freight) {
            this.freightVisible = false
            this.openCreate(freight)
        },
        async openCreate(freight) {
            this.draftId = null
            this.createForm = { freight: freight === 'sea' ? 'sea' : 'air', zohoVendorId: '', tracking: '', shippedAt: todayYmd(), note: '', shippingCost: undefined, lines: [], extra: [], special: [], warranty: [] }
            this.scan = ''
            this.createVisible = true
            this.loadSuppliers()
        },
        // A saved draft back into the form.
        openDraft(row) {
            this.draftId = row._id
            this.createForm = {
                freight: this.freightOf(row),
                zohoVendorId: row.zohoVendorId || '',
                tracking: row.tracking || '',
                shippedAt: fmtDay(row.shippedAt) !== '—' ? fmtDay(row.shippedAt) : todayYmd(),
                note: row.note || '',
                shippingCost: row.shippingCost != null ? row.shippingCost : undefined,
                // Special Orders (picked or typed) live in their own section
                lines: (row.lines || []).filter(l => !this.isSpecialLine(l) && !this.isWarrantyLine(l) && !l.unmatched).map(l => this.formLine(l)),
                extra: (row.lines || []).filter(l => l.unmatched && !this.isWarrantyLine(l)).map(l => this.formLine(l)),
                warranty: (row.lines || []).filter(l => this.isWarrantyLine(l)).map(l => this.formLine(l)),
                special: (row.lines || []).filter(l => this.isSpecialLine(l)).map(l => this.formLine(l))
            }
            this.scan = ''
            this.createVisible = true
            this.loadSuppliers()
            this.joinWaitingLines(row._id)
        },
        // A draft saved before its SKU's rows were grouped (or before another
        // PO line of the SKU was placed) holds only some of a row's waiting
        // lines (user 2026-10-16: 13360 showed 20, not 20 + 50). The others
        // join their rows as a scan or a pick brings them; the row's count is
        // spread over them again, oldest first, and a joined line without a
        // price takes the row's.
        async joinWaitingLines(draftId) {
            let r
            try { r = await openLines(undefined, this.createForm.freight) } catch (e) { return }
            // the dialog was closed or another draft opened meanwhile
            if (!this.createVisible || this.draftId !== draftId) return
            const keys = new Set(this.lineGroups.filter(g => g.sku).map(g => g.key))
            const on = new Set(this.allLines.map(l => l.orderId).filter(Boolean))
            const join = ((r && r.rows) || []).filter(o => !on.has(o._id) && o.category !== 'Special Order' && o.category !== 'Warranty' && keys.has(this.groupKey(this.toLine(o))))
            if (!join.length) return
            const before = {}
            for (const g of this.lineGroups) if (keys.has(g.key)) before[g.key] = { qty: g.qty, price: g.unitPrice }
            for (const o of join) {
                const line = this.toLine(o)
                const was = before[this.groupKey(line)]
                if (line.unitPrice == null && was && was.price != null) line.unitPrice = was.price
                this.createForm.lines.push(line)
            }
            const touched = new Set(join.map(o => this.groupKey(this.toLine(o))))
            for (const g of this.lineGroups) {
                if (touched.has(g.key) && before[g.key] && before[g.key].qty != null) this.setGroupQty(g, before[g.key].qty)
            }
            this.$message({ type: 'info', duration: 5000, message: this.$tp('{n} more waiting line(s) of the same SKU joined their rows', { n: join.length }) + ' — ' + this.$tp('save the draft to keep them') })
        },
        // `ship`: only the order lines the count reaches go (the rest stay
        // open); a draft keeps them all, so its rows come back whole
        batchPayload(ship) {
            const lines = ship ? this.shipLines : this.allLines
            return {
                freight: this.createForm.freight,
                zohoVendorId: this.createForm.zohoVendorId,
                tracking: this.createForm.tracking,
                shippedAt: this.createForm.shippedAt,
                note: this.createForm.note,
                // null (not undefined) when blank, so clearing the field on a draft clears it there too
                shippingCost: this.createForm.shippingCost == null ? null : this.createForm.shippingCost,
                lines: lines.filter(l => !(l.unmatched && !l.itemId && !l.sku && !(l.productName || '').trim())).map(l => (l.special
                    ? { special: true, key: l.key, productName: l.productName, requestedFor: l.requestedFor, supplier: l.supplier, unitPrice: l.unitPrice, qty: l.qty }
                    : l.unmatched
                        ? { unmatched: true, key: l.key, itemId: l.itemId, imageId: l.imageId, sku: l.sku, productName: l.productName, category: l.category, reason: l.reason, supplier: l.supplier, unitPrice: l.warranty ? 0 : l.unitPrice, qty: l.qty, warranty: !!l.warranty, oscarCode: l.oscarCode || '', customerCode: l.customerCode || '', customerName: l.customerName || '' }
                        : { orderId: l.orderId, qty: l.qty, supplier: l.status === 'pending' ? l.supplier : undefined, unitPrice: l.unitPrice }))
            }
        },
        async saveDraft() {
            this.savingDraft = true
            try {
                const r = this.draftId
                    ? await updateBatchDraft(this.draftId, this.batchPayload())
                    : await createBatch({ ...this.batchPayload(), draft: true })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('Draft saved'))
                this.createVisible = false
                this.reload()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save the draft')))
            } finally {
                this.savingDraft = false
            }
        },
        // ── Price sheet ────────────────────────────────────────────
        // The lines as a spreadsheet for the purchase team: they fill the Unit
        // Price column (yellow) and send the file back. From the form, or a
        // draft's row in the list. The Order ID column is what the upload
        // matches on (SKU / Order No as fallbacks), so a renamed header or a
        // re-sorted sheet still comes back right.
        async downloadPriceSheet(row) {
            const raw = row ? (row.lines || []) : this.allLines
            if (!raw.length) { this.$message.info(this.$tp('Nothing to export')); return }
            // the product reads as on the part labels (user ask 2026-10-14): no brand, no iPhone / iPad / MacBook / Galaxy
            const lines = await withLabelNames(raw)
            const t = k => this.$tp(k)
            const tracking = row ? row.tracking : this.createForm.tracking
            const date = fmtDay(new Date().toISOString())
            const price = `${t('Unit Price')} (¥)`
            const data = lines.map((l, i) => ({
                '#': i + 1,
                [t('Order No')]: l.orderNo || '',
                'SKU': l.sku || '',
                [t('Product')]: l.labelName || l.productName || '',
                [t('Category')]: l.category ? t(l.category) : '',
                [t('Supplier')]: l.supplier || '',
                [t('Ordered Qty')]: l.orderQty != null ? l.orderQty : '',
                [t('Shipped Qty')]: l.qty != null ? l.qty : '',
                [price]: l.unitPrice != null ? l.unitPrice : '',
                [t('Order ID')]: String(l.orderId || l.key || '')
            }))
            const ws = XLSX.utils.json_to_sheet(data, { origin: 'A3' })
            XLSX.utils.sheet_add_aoa(ws, [
                [`${t('Price sheet')} — ${tracking || t('Draft batch')} — ${date}`],
                [t('Fill in the Unit Price column and send the file back; leave the other columns as they are')]
            ], { origin: 'A1' })
            // Order No and Order ID stay in the file for the upload to match on, but hidden (user ask 2026-10-14)
            ws['!cols'] = [4, 12, 14, 50, 14, 14, 11, 11, 14, 26].map((w, i) => (i === 1 || i === 9 ? { wch: w, hidden: true } : { wch: w }))
            ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } }]
            const head = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '409EFF' } }, alignment: { horizontal: 'center', vertical: 'center' } }
            const fillIn = { fill: { fgColor: { rgb: 'FFF2CC' } }, numFmt: '0.00' }
            ws.A1.s = { font: { bold: true, sz: 13 } }
            ws.A2.s = { font: { italic: true, color: { rgb: '606266' } } }
            const PRICE_COL = 8
            for (let c = 0; c < 10; c++) {
                const h = ws[XLSX.utils.encode_cell({ r: 2, c })]
                if (h) h.s = c === PRICE_COL ? { ...head, fill: { fgColor: { rgb: 'E6A23C' } } } : head
            }
            for (let r = 0; r < data.length; r++) {
                const addr = XLSX.utils.encode_cell({ r: 3 + r, c: PRICE_COL })
                if (!ws[addr]) ws[addr] = { t: 's', v: '' }
                ws[addr].s = fillIn
            }
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, t('Price sheet').replace(/[\\/?*[\]:]/g, ' ').slice(0, 30))
            XLSX.writeFile(wb, `${t('Price sheet')} - ${(tracking || t('Draft batch')).replace(/[\\/?*[\]:]/g, ' ')} - ${date}.xlsx`)
        },
        // The sheet back from the purchase team: the prices go onto the lines
        // in the form (a supplier typed on a pending line without one is
        // taken too). Rows are matched by Order ID, else Order No, else SKU.
        // Nothing is saved until the draft is saved or shipped.
        async uploadPrices(e) {
            const file = e.target.files && e.target.files[0]
            e.target.value = ''
            if (!file) return
            this.pricesUploading = true
            try {
                const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
                const ws = wb.Sheets[wb.SheetNames[0]]
                const aoa = ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) : []
                const norm = v => String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
                const t = k => norm(this.$tp(k))
                const COLS = {
                    orderId: ['orderid', t('Order ID')],
                    orderNo: ['orderno', t('Order No')],
                    sku: ['sku'],
                    price: ['unitprice', 'price', t('Unit Price'), t('Price')],
                    supplier: ['supplier', t('Supplier')]
                }
                // the header row: the first row (title rows above it skipped) naming the SKU or Order ID column
                let hi = -1
                let idx = {}
                for (let r = 0; r < Math.min(aoa.length, 30); r++) {
                    const m = {}
                    aoa[r].forEach((c, ci) => { const n = norm(c); for (const k in COLS) if (m[k] == null && COLS[k].includes(n)) m[k] = ci })
                    if (m.sku != null || m.orderId != null) { hi = r; idx = m; break }
                }
                if (hi < 0 || idx.price == null) throw new Error(this.$tp('The file needs a SKU (or Order ID) column and a Unit Price column'))
                const lines = this.allLines
                const used = new Set()
                const find = (row) => {
                    const by = (fn) => lines.find(l => !used.has(l) && fn(l))
                    const id = idx.orderId != null ? String(row[idx.orderId] || '').trim() : ''
                    const no = idx.orderNo != null ? String(row[idx.orderNo] || '').trim() : ''
                    const sku = idx.sku != null ? String(row[idx.sku] || '').trim().toLowerCase() : ''
                    return (id && by(l => String(l.orderId || l.key || '') === id)) ||
                        (no && by(l => String(l.orderNo || '') === no)) ||
                        (sku && by(l => String(l.sku || '').toLowerCase() === sku)) || null
                }
                let filled = 0; let blank = 0; let unmatched = 0
                for (let r = hi + 1; r < aoa.length; r++) {
                    const row = aoa[r]
                    if (!row || row.every(c => c === '' || c == null)) continue
                    const raw = String(row[idx.price] == null ? '' : row[idx.price]).replace(/[¥￥,\s]/g, '')
                    const line = find(row)
                    if (!line) { unmatched++; continue }
                    used.add(line)
                    if (idx.supplier != null && line.status === 'pending' && !line.supplier && String(row[idx.supplier] || '').trim()) {
                        line.supplier = String(row[idx.supplier]).trim()
                    }
                    if (raw === '') { blank++; continue }
                    const p = Number(raw)
                    if (!isFinite(p) || p < 0) { blank++; continue }
                    line.unitPrice = Math.round(p * 100) / 100
                    filled++
                }
                if (!filled) {
                    this.$message.warning(this.$tp('No prices found in the file') + (unmatched ? ` · ${this.$tp('{n} row(s) not matched', { n: unmatched })}` : ''))
                    return
                }
                const parts = [this.$tp('{n} price(s) filled', { n: filled })]
                if (blank) parts.push(this.$tp('{n} row(s) without a price', { n: blank }))
                if (unmatched) parts.push(this.$tp('{n} row(s) not matched', { n: unmatched }))
                this.$message({ type: unmatched ? 'warning' : 'success', duration: 6000, message: `${parts.join(' · ')} — ${this.$tp('save the draft or ship to keep them')}` })
            } catch (err) {
                this.$message.error(this.msg(err, this.$tp('Failed to read the file')))
            } finally {
                this.pricesUploading = false
            }
        },
        // Delete a draft from the list: nothing has shipped, its lines are untouched.
        async deleteDraft(row) {
            const what = row.tracking ? `${row.tracking} · ` : ''
            try {
                await this.$confirm(`${what}${row.createdBy || ''} · ${this.$tp('{n} line(s)', { n: row.lineCount || 0 })}\n${this.$tp('Discard this draft? Nothing has shipped.')}`, this.$tp('Delete draft'),
                    { type: 'warning', confirmButtonText: this.$tp('Delete'), cancelButtonText: this.$tp('Keep') })
            } catch (e) { return }
            try {
                const r = await discardBatchDraft(row._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('Draft deleted'))
                this.reload()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to discard the draft')))
            }
        },
        async discardDraft() {
            try {
                await this.$confirm(this.$tp('Discard this draft? Nothing has shipped.'), this.$tp('Discard draft'),
                    { type: 'warning', confirmButtonText: this.$tp('Discard draft'), cancelButtonText: this.$tp('Keep') })
            } catch (e) { return }
            this.discarding = true
            try {
                const r = await discardBatchDraft(this.draftId)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.createVisible = false
                this.reload()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to discard the draft')))
            } finally {
                this.discarding = false
            }
        },
        // The pick lists for the form (suppliers, Zoho vendors), fetched once.
        async loadSuppliers() {
            this.$nextTick(() => { if (this.$refs.scanRef) this.$refs.scanRef.focus() })
            if (!this.suppliers.length || !this.zohoVendors.length) {
                try {
                    const r = await getMeta()
                    this.suppliers = (r && r.suppliers) || []
                    this.zohoVendors = (r && r.zohoVendors) || []
                } catch (e) { /* the supplier select still allows typing */ }
            }
        },
        onCreateClosed() {
            this.clearQuery()
        },
        // The shipped quantity is never assumed: a picked line starts empty
        // and is typed in; a scanned line counts up one per scan.
        addLine(o, qty) {
            if (this.allLines.find(l => l.orderId === o._id)) return false
            // the newest line on top, where it is seen on a phone; a Special
            // Order goes to its own section
            const target = o.category === 'Special Order' ? this.createForm.special : o.category === 'Warranty' ? this.createForm.warranty : this.createForm.lines
            target.unshift(this.toLine(o, qty))
            return true
        },
        // a waiting PO line (as the server lists it) in the form's shape
        toLine(o, qty) {
            return {
                orderId: o._id,
                orderNo: o.orderNo,
                requestedFor: o.requestedFor || '',
                sku: o.sku,
                productName: o.productName,
                category: o.category,
                status: o.status,
                supplier: o.supplier || '',
                forCustomer: o.forCustomer || '', oscarPrefix: (o.dispatchRef && o.dispatchRef.faultyCodePrefix) || '', customerSku: (o.dispatchRef && o.dispatchRef.customerSku) || '',
                orderedAt: o.orderedAt,
                createdAt: o.createdAt,
                unitPrice: o.unitPrice != null ? o.unitPrice : (o.quotedPrice != null ? o.quotedPrice : undefined),
                orderQty: o.orderQty,
                qty: qty == null ? undefined : qty
            }
        },
        // ── One row per SKU and destination (2026-10-16) ──
        // The row a line belongs to: its SKU for iMobile; a line raised for a
        // customer (OSCAR) by its return code — never with iMobile's.
        groupKey(l) {
            if (!l.sku) return 'id:' + (l.orderId || l.key)
            const dest = l.forCustomer ? `${l.forCustomer}|${this.oscarCodeOf(l)}` : ''
            return `${String(l.sku).toLowerCase()}|${dest}`.toLowerCase()
        },
        // The row's count, spread over its lines oldest first: each line takes
        // up to its ordered quantity, the newest one any excess; a line the
        // count doesn't reach is left without one (it stays open).
        setGroupQty(g, v) {
            let left = v == null || v === '' ? null : Math.max(0, Math.round(Number(v)))
            g.lines.forEach((l, i) => {
                if (left == null) { l.qty = undefined; return }
                const take = i === g.lines.length - 1 ? left : Math.min(left, Number(l.orderQty) || 0)
                l.qty = take > 0 ? take : undefined
                left -= take
            })
        },
        // a pending line's supplier / the price: one for the row's lines
        setGroupSupplier(g, v) {
            for (const l of g.lines) if (l.status === 'pending') l.supplier = v
        },
        setGroupPrice(g, v) {
            for (const l of g.lines) l.unitPrice = v == null ? undefined : v
        },
        // "10 + 20 + 30 = 60" (one line: its quantity)
        orderQtyText(g) {
            return g.lines.length > 1 ? `${g.lines.map(l => l.orderQty).join(' + ')} = ${g.orderQty}` : String(g.orderQty)
        },
        groupOrderedText(g) {
            if (g.allPending) return this.$tp('Pending')
            return `${this.$tp('Ordered')} ${fmtDay(g.orderedAt)}` + (g.pending ? ` + ${this.$tp('Pending')}` : '')
        },
        // Under the count: a single line shipped short says so; a row of
        // several lines shows no per-line note (user 2026-10-16)
        allocationNotes(g) {
            if (g.qty == null || g.lines.length !== 1) return []
            const l = g.lines[0]
            return l.qty != null && l.qty < l.orderQty
                ? [{ k: l.orderId, cls: 'spb-short-note', text: this.$tp('short {n} — the rest becomes a new line', { n: l.orderQty - l.qty }) }]
                : []
        },
        // the batch's row for a scanned code: an Oscar return code → its OSCAR
        // row; a SKU → iMobile's row first, else a customer row of that SKU
        groupForCode(code) {
            const c = String(code || '').toLowerCase()
            if (/^ss-\d+-.+$/.test(c)) return this.lineGroups.find(g => g.lines.some(l => (this.oscarCodeOf(l) || '').toLowerCase() === c)) || null
            // another customer's own barcode (Best Sourcing, 2026-10-19): that customer's row
            const theirs = this.lineGroups.find(g => g.lines.some(l => (this.customerCodeOf(l) || '').toLowerCase() === c))
            if (theirs) return theirs
            const same = this.lineGroups.filter(g => String(g.sku || '').toLowerCase() === c)
            return same.find(g => !g.forCustomer) || same[0] || null
        },
        // the barcode a line raised for another customer answers to (Best
        // Sourcing's 13 digits — on Order Dispatch's label); Oscar's go by return code
        customerCodeOf(l) {
            if (!l) return ''
            if (l.customerCode) return l.customerCode
            return l.forCustomer && l.forCustomer !== 'OSCAR' ? (l.customerSku || '') : ''
        },
        // One scan = one unit, counted on the scanned SKU's row (its lines
        // fill oldest first). The first scan of a SKU brings in every waiting
        // line of its row (2026-10-16); once the row is full a newer line is
        // looked up, else the scan is kept as not in PO (over).
        async doScan() {
            const sku = (this.scan || '').trim()
            if (!sku) return
            // by SKU (iMobile's row), or by Oscar's return code for a line raised for OSCAR (user 2026-10-14)
            const oscarCode = /^SS-\d+-.+$/i.test(sku)
            const g = this.groupForCode(sku)
            // the customer's own barcode scanned: their row (a plain SKU leaves a customer's row to its code)
            const theirCode = !!g && g.lines.some(l => (this.customerCodeOf(l) || '').toLowerCase() === sku.toLowerCase())
            const room = x => !!x && (x.qty || 0) < x.orderQty
            if (room(g) && (!g.forCustomer || oscarCode || theirCode)) {
                this.countScan(g, sku)
                this.scan = ''
                this.$nextTick(() => { if (this.$refs.scanRef) this.$refs.scanRef.focus() })
                return
            }
            this.scanning = true
            try {
                const r = await lookupOrder(sku, this.createForm.lines.map(l => l.orderId), this.createForm.freight)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.lastScan = sku
                if (r.match) {
                    // the matched line and the other waiting lines of its row come in together
                    const key = this.groupKey(this.toLine(r.match))
                    const rows = (r.all || [r.match]).filter(o => this.groupKey(this.toLine(o)) === key)
                    if (!rows.some(o => o._id === r.match._id)) rows.push(r.match)
                    rows.forEach(o => this.addLine(o))
                    this.countScan(this.lineGroups.find(x => x.key === key), sku)
                } else if (room(g)) {
                    // only a customer's row of this SKU has room left: count it there
                    this.countScan(g, sku)
                } else if (r.otherFreight) {
                    // waiting only on the other kind of batch: not added (it would count twice as not in PO)
                    this.$message({ type: 'error', duration: 4000, message: this.$tp('{sku} is waiting on a {other} line ({no}) — it can\'t go on this {kind} batch', { sku, other: r.otherFreight.label, no: r.otherFreight.orderNo, kind: this.isSea ? SEA : '空运' }) })
                    if (this.cameraVisible && this.$refs.scanner) this.$refs.scanner.beep('bad')
                } else {
                    this.keepUnmatched(sku, r)
                }
                this.scan = ''
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Lookup failed')))
            } finally {
                this.scanning = false
                this.$nextTick(() => { if (this.$refs.scanRef) this.$refs.scanRef.focus() })
            }
        },
        // one unit onto a row: its count + 1, spread oldest first; the row goes to the top
        countScan(g, code) {
            if (!g) return
            const n = (g.qty || 0) + 1
            this.setGroupQty(g, n)
            this.toTop(g.lines[0])
            this.lastScan = code
            const lines = g.lines.length > 1 ? ` · ${this.$tp('{n} PO lines', { n: g.lines.length })}` : ''
            this.$message({ message: `${code} · ${n} / ${g.orderQty}${lines}`, type: 'success', duration: 1300 })
        },
        // the Oscar return code a line answers to: "SS-<prefix>-<customer SKU>"
        oscarCodeOf(l) {
            if (!l) return ''
            if (l.oscarCode) return l.oscarCode
            return l.oscarPrefix && l.customerSku ? `SS-${l.oscarPrefix}-${l.customerSku}` : ''
        },
        codeMatches(l, code) {
            const c = String(code || '').toLowerCase()
            return String(l.sku || '').toLowerCase() === c || (this.oscarCodeOf(l) || '').toLowerCase() === c || (this.customerCodeOf(l) || '').toLowerCase() === c
        },
        // the line just scanned goes to the top, where the camera view shows it
        // (an order line takes the rest of its row along)
        toTop(line) {
            if (!line) return
            if (this.createForm.lines.includes(line)) {
                const key = this.groupKey(line)
                const mine = this.createForm.lines.filter(l => this.groupKey(l) === key)
                this.createForm.lines = [...mine, ...this.createForm.lines.filter(l => this.groupKey(l) !== key)]
                return
            }
            for (const arr of [this.createForm.extra, this.createForm.warranty]) {
                const i = arr.indexOf(line)
                if (i > 0) { arr.splice(i, 1); arr.unshift(line) }
                if (i >= 0) return
            }
        },
        // a line (or an order row: all its lines) off whichever list it sits on
        removeLine(line) {
            if (line && line.isGroup) {
                this.createForm.lines = this.createForm.lines.filter(l => !line.lines.includes(l))
                return
            }
            for (const arr of [this.createForm.lines, this.createForm.extra, this.createForm.warranty, this.createForm.special]) {
                const i = arr.indexOf(line)
                if (i >= 0) { arr.splice(i, 1); return }
            }
        },
        // the register search for one not-in-PO line
        openProductPick(l) {
            this.productPickLine = l
            this.productPickQuery = ''
            this.productPickVisible = true
            this.$nextTick(() => { const i = this.$refs.productPickInput; if (i && i.focus) i.focus() })
        },
        pickProductFor(p) {
            const l = this.productPickLine
            if (!l || !p || !p.itemId) return
            this.linkProduct(l, p)
            this.productPickVisible = false
            this.$message.success(`${p.sku ? p.sku + ' · ' : ''}${p.name || ''}`)
        },
        // a warranty replacement: no charge — the price locks at 0
        toggleWarranty(l) {
            l.warranty = !l.warranty
            if (l.warranty) l.unitPrice = 0
            else if (l.unitPrice === 0) l.unitPrice = undefined
        },
        // a scanned SKU Zoho does not know: the line becomes a typed Special Order instead
        toSpecial(l) {
            const i = this.createForm.extra.indexOf(l)
            if (i < 0) return
            this.createForm.extra.splice(i, 1)
            this.createForm.special.unshift(this.specialLine({ key: l.key, productName: (l.productName || '').trim() || l.sku || '', supplier: l.supplier, unitPrice: l.unitPrice, qty: l.qty }))
            this.$message.success(this.$tp('Moved to Special Order'))
        },
        // a not-in-PO line started by hand: the product is searched on the row
        addExtraBlank() {
            this.createForm.extra.unshift(this.unmatchedLine('', null, 1))
        },
        isLastScan(l) {
            if (!this.lastScan) return false
            if (l.isGroup) return l.lines.some(x => this.codeMatches(x, this.lastScan))
            return String(l.sku || '').toLowerCase() === this.lastScan.toLowerCase()
        },
        bumpQty(l, d) {
            if (l.isGroup) { this.setGroupQty(l, Math.max(1, (Number(l.qty) || 0) + d)); return }
            l.qty = Math.max(1, (Number(l.qty) || 0) + d)
        },
        unmatchedLabel(l) {
            if (!l.itemId) return this.$tp('Not on any order — pick a product')
            return l.reason === 'over' ? this.$tp('Over the ordered quantity') : this.$tp('Not in PO')
        },
        // the shape of a line with no order behind it (`src` = the lookup's
        // register item, or the saved draft line)
        unmatchedLine(sku, src, qty) {
            return {
                orderId: null, unmatched: true, key: (src && src.key) || this.newKey(), reason: (src && src.reason === 'over') ? 'over' : 'none',
                // the product behind it (the register's item when the SKU is known, or one picked by hand)
                itemId: (src && src.itemId) || null, imageId: (src && src.imageId) || null, imageUrl: (src && src.imageUrl) || '', warranty: !!(src && src.warranty), oscarCode: (src && src.oscarCode) || '',
                // another customer's barcode scanned with no open line: it ships marked for them
                customerCode: (src && src.customerCode) || '', customerName: (src && src.customerName) || '',
                orderNo: '', sku, productName: (src && (src.productName || src.name)) || '', category: (src && (src.category || src.suggestedCategory || src.classification)) || '',
                status: 'unmatched', supplier: (src && src.supplier) || '', orderedAt: null,
                unitPrice: src && src.unitPrice != null ? src.unitPrice : undefined, orderQty: null, qty
            }
        },
        // A scan with no order behind it (user asks 2026-10-13/14): kept on the
        // batch as a not-in-PO line, by SKU — linked to the register's product
        // when the SKU is known, else one is picked by hand — with its own
        // supplier, price and count; it ships as a new SP- line. Nothing
        // ships while a line still has no product.
        keepUnmatched(sku, r) {
            const same = l => l.unmatched && this.codeMatches(l, sku)
            let line = this.createForm.extra.find(same)
            const oscar = !!(r && r.oscar)
            const customer = (r && r.customer) || null
            if (line) {
                line.qty = (line.qty || 0) + 1
                this.toTop(line)
            } else {
                // an Oscar return code / a customer's barcode stands for a product:
                // the line takes the product's SKU and keeps the code for re-scans
                const lineSku = (oscar || customer) && r.item && r.item.sku ? r.item.sku : sku
                line = this.unmatchedLine(lineSku, {
                    ...(r && r.item), reason: r && r.hadWaiting ? 'over' : 'none', oscarCode: oscar ? sku : '',
                    customerCode: customer ? sku : '', customerName: customer ? customer.name : ''
                }, 1)
                if (this.isSea) line.category = SEA // it ships as a 海运 line
                this.createForm.extra.unshift(line)
            }
            const note = oscar ? ' · ' + this.$tp('OSCAR code with no open purchase line')
                : customer ? ' · ' + this.$tp('{c} code with no open purchase line', { c: customer.tag || customer.name }) : ''
            this.$message({ message: `${sku} · ${line.qty} — ${this.unmatchedLabel(line)}` + note, type: 'warning', duration: note ? 3000 : 2000 })
            // heard without looking: the camera's low double tone
            if (this.cameraVisible && this.$refs.scanner) this.$refs.scanner.beep('bad')
        },
        // a line of the batch with no order behind it keeps a key of its own (the price sheet's hidden id)
        newKey() {
            return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
        },
        isSpecialLine(l) {
            return !!l && (l.special === true || l.category === 'Special Order')
        },
        // a Warranty line: picked from the Warranty list, or a new one raised on the batch
        isWarrantyLine(l) {
            return !!l && (l.category === 'Warranty' || (l.unmatched === true && l.warranty === true))
        },
        // a saved draft line back into the form's shape
        formLine(l) {
            if (l.unmatched) return this.unmatchedLine(l.sku, l, l.qty == null ? undefined : l.qty)
            if (l.special) return this.specialLine(l)
            return {
                orderId: l.orderId, orderNo: l.orderNo, sku: l.sku, productName: l.productName, category: l.category, requestedFor: l.requestedFor || '',
                status: l.status, supplier: l.supplier || '', orderedAt: l.orderedAt,
                forCustomer: l.forCustomer || '', oscarPrefix: l.oscarPrefix || '', customerSku: l.customerSku || '',
                unitPrice: l.unitPrice != null ? l.unitPrice : undefined, orderQty: l.orderQty, qty: l.qty == null ? undefined : l.qty
            }
        },
        // a Special Order typed straight into the batch (no order behind it yet)
        specialLine(src) {
            return {
                orderId: null, special: true, key: (src && src.key) || this.newKey(), orderNo: '', sku: '', itemId: null,
                productName: (src && src.productName) || '', category: 'Special Order', status: 'special',
                supplier: (src && src.supplier) || '', requestedFor: (src && src.requestedFor) || '', orderedAt: null,
                unitPrice: src && src.unitPrice != null ? src.unitPrice : undefined, orderQty: null, qty: src && src.qty != null ? src.qty : undefined
            }
        },
        // ── Special Orders on the batch ──
        openSpecialPicker(kind) {
            this.specialPickerKind = kind === 'Warranty' ? 'Warranty' : 'Special Order'
            this.specialPicked = {}
            this.specialPickerVisible = true
            this.loadSpecialPicker()
        },
        async loadSpecialPicker() {
            this.specialPickerLoading = true
            try {
                const r = await openLines()
                const on = new Set(this.allLines.map(l => l.orderId).filter(Boolean))
                this.specialPickerRows = ((r && r.rows) || []).filter(o => o.category === this.specialPickerKind && !on.has(o._id))
            } catch (e) {
                this.specialPickerRows = []
            } finally {
                this.specialPickerLoading = false
            }
        },
        toggleSpecialPick(r) {
            if (this.specialPicked[r._id]) this.$delete(this.specialPicked, r._id)
            else this.$set(this.specialPicked, r._id, r)
        },
        addSpecialPicked() {
            let n = 0
            for (const o of Object.values(this.specialPicked).reverse()) if (this.addLine(o)) n++
            this.specialPickerVisible = false
            if (n) this.$message.success(this.$tp('{n} line(s) added', { n }))
        },
        addSpecialBlank() {
            this.createForm.special.unshift(this.specialLine(null))
        },
        // a new warranty line: the product is chosen on the row; no charge
        addWarrantyBlank() {
            const l = this.unmatchedLine('', { warranty: true }, 1)
            l.unitPrice = 0
            this.createForm.warranty.unshift(l)
        },
        // product search for a not-in-PO line (the register, as Add Item does)
        async suggestProduct(q, cb) {
            const text = (q || '').trim()
            if (!text) { cb([]); return }
            try {
                const r = await searchProducts(text)
                cb((r && r.products) || [])
            } catch (e) { cb([]) }
        },
        // the picked product becomes the line's item: it ships as a new SP- line
        linkProduct(l, p) {
            if (!p || !p.itemId) return
            l.itemId = p.itemId
            l.sku = p.sku || l.sku
            l.productName = p.name || ''
            // on a 海运 batch it ships as a 海运 line
            l.category = this.isSea && !l.warranty ? SEA : (p.suggestedCategory || p.classification || '')
            l.imageId = p.imageId || null
            l.imageUrl = p.imageUrl || ''
        },
        // a camera read is one scan, through the same path as the scan box;
        // reads queue behind an in-flight lookup so none is lost
        async onCameraScan(code) {
            this.cameraQueue = (this.cameraQueue || []).concat(code)
            if (this.cameraBusy) return
            this.cameraBusy = true
            try {
                while (this.cameraQueue.length) {
                    this.scan = this.cameraQueue.shift()
                    await this.doScan()
                }
            } finally { this.cameraBusy = false }
        },
        openPicker() {
            this.pickerPicked = {}
            this.pickerSupplier = ''
            this.pickerVisible = true
            this.loadPicker()
        },
        // Every waiting line not on this batch yet, grouped client-side.
        async loadPicker() {
            this.pickerLoading = true
            try {
                // only the lines this kind of batch takes (海运 / everything else)
                const r = await openLines(undefined, this.createForm.freight)
                const on = new Set(this.allLines.map(l => l.orderId).filter(Boolean))
                this.pickerRows = ((r && r.rows) || []).filter(o => !on.has(o._id) && o.category !== 'Special Order' && o.category !== 'Warranty')
                // land on the first category that has something to pick
                if (!this.pickerCat || !this.pickerCatCount(this.pickerCat)) {
                    this.pickerCat = this.pickerCats.find(c => this.pickerCatCount(c)) || this.pickerCats[0]
                }
            } catch (e) {
                this.pickerRows = []
            } finally {
                this.pickerLoading = false
            }
        },
        // A line's category in the side menu (an unknown value files under Other).
        pickerCatOf(r) {
            return CATEGORIES.includes(r.category) ? r.category : 'Other'
        },
        pickerCatCount(c) {
            return (this.pickerByCat[c] || []).length
        },
        pickedInCat(c) {
            let n = 0
            for (const r of Object.values(this.pickerPicked)) if (this.pickerCatOf(r) === c) n++
            return n
        },
        // A supplier picked: stay on the category if it has their lines,
        // else move to the first one that does.
        onPickerSupplier() {
            if (!this.pickerCatCount(this.pickerCat)) {
                this.pickerCat = this.pickerCats.find(c => this.pickerCatCount(c)) || this.pickerCat
            }
        },
        togglePick(r) {
            if (this.pickerPicked[r._id]) this.$delete(this.pickerPicked, r._id)
            else this.$set(this.pickerPicked, r._id, r)
        },
        // the picks, and the other waiting lines of their rows (same SKU and
        // destination, 2026-10-16) — the row's count decides which ship
        addPicked() {
            const picked = Object.values(this.pickerPicked)
            const keys = new Set(picked.map(o => this.groupKey(this.toLine(o))))
            const along = this.pickerRows.filter(o => !this.pickerPicked[o._id] && keys.has(this.groupKey(this.toLine(o))))
            let n = 0
            for (const o of [...picked, ...along].reverse()) if (this.addLine(o)) n++
            this.pickerVisible = false
            if (n) this.$message.success(this.$tp('{n} line(s) added', { n }) + (along.length ? ` · ${this.$tp('{n} more waiting line(s) of the same SKU joined their rows', { n: along.length })}` : ''))
        },
        async submitCreate() {
            if (this.unlinkedCount) { this.$message.warning(this.$tp('{n} line(s) are not on any order — pick a product for them or remove them before shipping', { n: this.unlinkedCount })); return }
            if (!this.createForm.zohoVendorId) { this.$message.warning(this.$tp('Select the Zoho vendor')); return }
            if (this.specialIncomplete) { this.$message.warning(this.$tp('Enter a description for every Special Order line')); return }
            // every order row needs a count (it may reach only some of its lines)
            for (const g of this.lineGroups) {
                if (!g.qty || g.qty < 1) { this.$message.warning(this.$tp('{sku}: enter the shipped quantity', { sku: g.sku || g.productName })); return }
            }
            for (const l of this.shipLines) {
                if (!l.qty || l.qty < 1) { this.$message.warning(this.$tp('{sku}: enter the shipped quantity', { sku: l.sku || l.productName })); return }
                // a Special Order (typed or picked) may ship without a supplier (user 2026-10-14)
                if ((l.status === 'pending' || l.unmatched) && !l.supplier && l.category !== 'Special Order' && l.category !== 'Warranty' && !l.warranty) { this.$message.warning(this.$tp('{sku}: pick a supplier', { sku: l.sku || l.productName })); return }
                if (l.unitPrice == null || l.unitPrice === '') { this.$message.warning(this.$tp('{sku}: enter the unit price', { sku: l.sku || l.productName })); return }
            }
            this.creating = true
            try {
                const r = this.draftId
                    ? await shipBatchDraft(this.draftId, this.batchPayload(true))
                    : await createBatch(this.batchPayload(true))
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('{no} created with {n} line(s)', { no: r.batch.batchNo, n: r.batch.lineCount }))
                if (r.remainders && r.remainders.length) {
                    this.$message.info(this.$tp('{n} short shipment(s): the rest was carried over as new pending line(s)', { n: r.remainders.length }))
                }
                this.zohoToast(r.zoho)
                this.createVisible = false
                this.reload()
                this.openView(r.batch)
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to create the batch')))
            } finally {
                this.creating = false
            }
        },
        // ── View / print ───────────────────────────────────────────
        openView(row) {
            this.view = row
            this.viewEdit = { tracking: row.tracking || '', note: row.note || '', shippingCost: row.shippingCost != null ? row.shippingCost : undefined }
            this.viewVisible = true
        },
        // ── Tracking / note, inline in the view dialog ─────────────
        canEditView() {
            return !!this.view && this.can('spp:batch:manage') && this.view.status !== 'cancelled'
        },
        viewDirty() {
            if (!this.view) return false
            const num = (v) => (v == null || v === '' ? null : Number(v))
            return this.viewEdit.tracking.trim() !== (this.view.tracking || '') || this.viewEdit.note.trim() !== (this.view.note || '') ||
                (this.view.status === 'shipped' && num(this.viewEdit.shippingCost) !== num(this.view.shippingCost))
        },
        resetViewEdit() {
            this.viewEdit = { tracking: this.view.tracking || '', note: this.view.note || '', shippingCost: this.view.shippingCost != null ? this.view.shippingCost : undefined }
        },
        async saveViewEdit() {
            if (!this.view) return
            this.viewSaving = true
            try {
                const data = { tracking: this.viewEdit.tracking.trim(), note: this.viewEdit.note.trim() }
                if (this.view.shippedAt) data.shippedAt = fmtDay(this.view.shippedAt)
                // the shipping cost only while shipped (not received) — the backend refuses it otherwise
                if (this.view.status === 'shipped') data.shippingCost = this.viewEdit.shippingCost == null || this.viewEdit.shippingCost === '' ? null : this.viewEdit.shippingCost
                const r = await updateBatch(this.view._id, data)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.view = { ...this.view, tracking: data.tracking, note: data.note, ...(data.shippingCost !== undefined ? { shippingCost: data.shippingCost } : {}) }
                this.viewEdit = { tracking: data.tracking, note: data.note, shippingCost: data.shippingCost == null ? undefined : data.shippingCost }
                this.sayZohoReference(r)
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save')))
            } finally {
                this.viewSaving = false
            }
        },
        async openByNo(no) {
            try {
                const r = await getBatch(no)
                if (r && r.batch) this.openView(r.batch)
                else this.$message.warning(this.$tp('Batch {no} not found', { no }))
            } catch (e) {
                this.$message.warning(this.$tp('Batch {no} not found', { no }))
            }
            this.clearQuery()
        },
        // Preview first; the Print button prints the previewed document.
        print(batch) {
            try {
                this.printHtml = packingListHtml(batch, (t, p) => this.$tp(t, p))
                this.printVisible = true
            } catch (e) {
                this.$message.error(this.$tp('Could not build the print list'))
            }
        },
        doPrint() {
            const f = this.$refs.printFrame
            try { f.contentWindow.focus(); f.contentWindow.print() } catch (e) { this.$message.error(this.$tp('Could not build the print list')) }
        },
        // ── Part labels (50×40: product name + SKU barcode) ────────
        labelCount(batch) {
            return sppLabelCount(batch)
        },
        // Build once for the preview; Print / Download rebuild from `build`.
        showLabels(build, fileName, title) {
            this.cleanupLabels()
            try {
                const doc = build()
                if (!doc) { this.$message.info(this.$tp('Nothing to print')); return }
                this.labelBuild = build
                this.labelFileName = fileName
                this.labelUrl = doc.output('bloburl') + '#toolbar=0'
                this.labelTitle = title
                this.labelVisible = true
            } catch (e) {
                this.$message.error(this.$tp('Could not build the labels'))
            }
        },
        // Label names without Device Brand / Series, looked up first.
        // a line ordered for Oscar Mobile prints the Order Dispatch label set;
        // the description follows the label-name rule (a line from withLabelNames)
        oscarArgs(l) {
            return { record: { faultyCodePrefix: l.oscarPrefix || '' }, line: { sku: l.customerSku || l.sku, description: l.customerLabelName || l.labelName || l.customerDescription || l.productName } }
        },
        // a line ordered for another customer from Order Dispatch (Best Sourcing, 2026-10-19):
        // the Order Dispatch label — their barcode and description, their PO number, the ship date
        isCustomerLine(l) {
            return !!l && !!l.forCustomer && l.forCustomer !== 'OSCAR' && !!l.customerSku
        },
        // the description under the label-name rule, as on the Purchase Order page (a line from withLabelNames; 2026-10-20)
        customerArgs(l, batch) {
            const b = batch || this.view || {}
            return { record: { invoiceNumber: l.customerPo || '' }, batch: { at: b.shippedAt || b.createdAt || new Date() }, line: { sku: l.customerSku, description: l.customerLabelName || l.labelName || l.customerDescription || l.productName } }
        },
        async printLineLabels(line) {
            if (this.isCustomerLine(line)) {
                this.labelOscar = true // a fixed-size label: no size / orientation choice
                const [named] = await withLabelNames([line])
                this.showLabels(() => appendDispatchLabelsToDoc(null, this.customerArgs(named), 1), sppLabelFileName(this.view, line), this.$tp('Label') + ' — ' + line.forCustomer + ' · ' + line.customerSku)
                return
            }
            if (line.forCustomer === 'OSCAR') {
                if (!line.oscarPrefix) this.$message.warning(this.$tp('No return-code prefix on the dispatch record — the supplier card is left out'))
                this.labelOscar = true
                const [named] = await withLabelNames([line])
                this.showLabels(() => appendOscarLabelsToDoc(null, this.oscarArgs(named), 1), sppLabelFileName(this.view, line), this.$tp('Labels') + ' — OSCAR · ' + (line.customerSku || line.sku))
                return
            }
            this.labelOscar = false
            const [named] = await withLabelNames([line])
            this.showLabels(() => buildSppLineLabelsPdf(named), sppLabelFileName(this.view, line), this.$tp('Labels') + ' — ' + (line.sku || line.productName))
        },
        async printAllLabels(batch) {
            const n = sppLabelCount(batch)
            if (!n) return
            const named = { ...batch, lines: await withLabelNames(batch.lines) }
            // Oscar's lines go on their own 100×50 pages after the ordinary labels,
            // another customer's (Best Sourcing) on Order Dispatch's 50×40 ones
            const oscar = named.lines.filter(l => l.forCustomer === 'OSCAR')
            const customer = named.lines.filter(l => this.isCustomerLine(l))
            const rest = named.lines.filter(l => l.forCustomer !== 'OSCAR' && !this.isCustomerLine(l))
            this.labelOscar = !rest.length // only fixed-size pages: nothing to re-lay out
            const units = l => Math.max(1, Math.floor(Number(l.shippedQty)) || 1)
            const build = () => {
                let doc = rest.length ? buildSppBatchLabelsPdf({ ...named, lines: rest }) : null
                for (const l of oscar) doc = appendOscarLabelsToDoc(doc, this.oscarArgs(l), units(l))
                for (const l of customer) doc = appendDispatchLabelsToDoc(doc, this.customerArgs(l, batch), units(l))
                return doc
            }
            this.showLabels(build, sppLabelFileName(batch), this.$tp('Labels') + ' — ' + batch.batchNo + ' (' + n + ')')
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
        // ── Edit ───────────────────────────────────────────────────
        openEdit(row) {
            this.editRow = row
            this.editForm = { tracking: row.tracking || '', shippedAt: fmtDay(row.shippedAt), note: row.note || '', shippingCost: row.shippingCost != null ? row.shippingCost : undefined }
            this.editVisible = true
        },
        async submitEdit() {
            this.editSaving = true
            try {
                // the shipping cost only rides along while the batch is shipped (not received)
                const data = { tracking: this.editForm.tracking, shippedAt: this.editForm.shippedAt, note: this.editForm.note }
                if (this.editRow.status === 'shipped') data.shippingCost = this.editForm.shippingCost == null ? null : this.editForm.shippingCost
                const r = await updateBatch(this.editRow._id, data)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.sayZohoReference(r)
                this.editVisible = false
                this.load()
                if (this.view && this.view._id === this.editRow._id) {
                    this.view = { ...this.view, ...data, shippedAt: this.editForm.shippedAt, ...(data.shippingCost !== undefined ? { shippingCost: data.shippingCost } : {}) }
                    this.viewEdit = { tracking: this.editForm.tracking, note: this.editForm.note, shippingCost: data.shippingCost == null ? undefined : data.shippingCost }
                }
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save')))
            } finally {
                this.editSaving = false
            }
        },
        // Saved — and, when the tracking changed on a batch with a Zoho PO,
        // whether the PO's Reference# followed (user 2026-10-15).
        sayZohoReference(r) {
            const z = r && r.zohoReference
            const s = r && r.zohoShipping
            const notes = []
            let warn = false
            if (z) {
                if (z.failed && z.failed.length) { warn = true; notes.push(this.$tp('the Zoho PO Reference# was not updated: {msg}', { msg: z.failed.map(f => `${f.number}: ${f.message}`).join('; ') })) }
                else if (z.updated && z.updated.length) notes.push(this.$tp('Zoho PO Reference# set to {ref} ({pos})', { ref: z.reference, pos: z.updated.join(', ') }))
            }
            if (s) {
                const changed = (s.updated || []).filter(u => !u.unchanged)
                if (s.failed && s.failed.length) { warn = true; notes.push(this.$tp('the Zoho PO shipping fee was not updated: {msg}', { msg: s.failed.map(f => `${f.number}: ${f.message}`).join('; ') })) }
                else if (changed.length) notes.push(s.shippingCost > 0 ? this.$tp('Zoho PO shipping fee set to ¥{n} ({pos})', { n: s.shippingCost, pos: changed.map(u => u.number).join(', ') }) : this.$tp('Zoho PO shipping fee removed ({pos})', { pos: changed.map(u => u.number).join(', ') }))
                if (s.skipped && s.skipped.length) notes.push(this.$tp('no shipping line on {pos} (not a CNY vendor)', { pos: s.skipped.map(k => k.number).join(', ') }))
            }
            if (!notes.length) { this.$message.success(this.$tp('Saved')); return }
            const message = this.$tp('Saved') + (warn ? ' — ' : ' · ') + notes.join(' · ')
            if (warn) this.$message({ type: 'warning', duration: 7000, message })
            else this.$message({ type: 'success', duration: 5000, message })
        },
        // ── Receive ────────────────────────────────────────────────
        openReceive(batch) {
            this.receiveBatchDoc = batch
            this.receiveForm = {
                receivedAt: todayYmd(),
                note: '',
                lines: (batch.lines || []).map(l => ({ orderId: l.orderId, orderNo: l.orderNo, sku: l.sku, productName: l.productName, orderQty: l.orderQty, shippedQty: l.shippedQty, receivedQty: l.shippedQty }))
            }
            this.receiveVisible = true
        },
        async submitReceive() {
            this.receiving = true
            try {
                const r = await receiveBatch(this.receiveBatchDoc._id, {
                    receivedAt: this.receiveForm.receivedAt,
                    note: this.receiveForm.note,
                    lines: this.receiveForm.lines.map(l => ({ orderId: l.orderId, receivedQty: l.receivedQty }))
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(r.discrepancy
                    ? this.$tp('{no} received — quantities differ from what was shipped', { no: r.batchNo })
                    : this.$tp('{no} received', { no: r.batchNo }))
                this.receiveVisible = false
                this.viewVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to receive the batch')))
            } finally {
                this.receiving = false
            }
        },
        // (Cancelling a shipped batch is deliberately not offered on the
        // page for now — the API keeps POST /batches/:id/cancel.)
    }
}
</script>

<style lang="scss" scoped>
.spb-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.spb-title { font-size: 18px; font-weight: 600; color: #303133; }
.spb-sub { font-size: 12px; color: #909399; }
.spb-spacer { flex: 1; }
.spb-search { width: 260px; }
.spb-no { font-weight: 600; padding: 0; }
.spb-link { color: #409eff; text-decoration: none; &:hover { text-decoration: underline; } }
.spb-dim { font-size: 11px; color: #909399; }
.spb-warn { font-size: 11px; color: #f56c6c; }
.spb-edit { padding: 0 4px; color: #909399; }
.spb-receive { color: #67c23a; }
.spb-del { color: #f56c6c; }
.spb-pager { padding-top: 10px; text-align: right; }
.spb-dlg-head { font-size: 15px; font-weight: 600; color: #303133; i { color: #409eff; margin-right: 4px; } }
.spb-dlg-tag { margin-left: 8px; }
.spb-head-fields { display: flex; gap: 12px; margin-bottom: 10px; }
.spb-field { display: flex; flex-direction: column; gap: 3px; min-width: 200px; label { font-size: 12px; color: #909399; } }
.spb-field-date { min-width: 150px; }
.spb-field-vendor { min-width: 170px; }
.spb-field-ship { min-width: 150px; flex: 0 0 auto; }
.spb-field-hint { font-size: 11px; }
.spb-below { margin-top: 10px; }
.spb-inline { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.spb-inline-tracking { max-width: 440px; }
.spb-inline-ship { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; }
.spb-inline-ship .el-input-number { width: 150px; }
.spb-inline-label { color: #606266; }
.spb-inline-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.spb-print-frame { width: 100%; height: 62vh; border: 1px solid #ebeef5; background: #fff; }
.label-orient { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; color: #909399; flex-wrap: wrap; }
.label-orient-gap { margin-left: 12px; }
.spb-label-frame { width: 100%; height: 56vh; border: 1px solid #ebeef5; background: #fff; }
.spb-field-grow { flex: 1; }
.spb-scan { display: flex; gap: 8px; margin-bottom: 10px; .el-input { flex: 1; } }
/* Short while counting: yellow, like a short shipped figure — not an error. */
.spb-short ::v-deep .el-input__inner { color: #e6a23c; border-color: #e6a23c; }
.spb-short-note { font-size: 11px; color: #e6a23c; }
/* the destination of a row raised for a customer (OSCAR), 2026-10-16 */
.spb-for { display: inline-block; margin-left: 4px; padding: 0 5px; border-radius: 3px; font-size: 10px; line-height: 16px; font-weight: 600; color: #fff; background: #409eff; vertical-align: middle; }
.spb-price-tools { display: flex; align-items: center; flex-wrap: wrap; gap: 0 12px; margin-top: 6px; .el-button { padding: 4px 0; } }
.spb-price-hint { flex: 1 1 240px; word-break: normal; }
.spb-file { display: none; }
// the Special Order section
.spb-special { margin-top: 12px; border: 1px dashed #dcdfe6; border-radius: 8px; padding: 8px 10px; }
.spb-special-head { display: flex; align-items: center; gap: 8px; font-size: 13px; i { color: #e6a23c; } }
.spb-special-empty { padding: 6px 0 2px; font-size: 12px; }
.spb-special-lines { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.spb-slrow { display: flex; align-items: flex-start; gap: 8px; }
.spb-slrow .spb-del { margin-top: 6px; }
.spb-slrow-act { padding: 0; margin-left: 8px; }
.spb-pick-for { margin-bottom: 8px; font-size: 12px; }
.spb-edit-hint { font-size: 12px; line-height: 1.4; margin-top: 4px; }
.spb-warranty-tag { margin-left: 6px; }
.spb-act-on { color: #67c23a; }
.spb-slrow-main { flex: 1; min-width: 0; font-size: 13px; }
.spb-slrow-sup { width: 150px; flex: 0 0 150px; }
.spb-slrow-num { width: 110px; flex: 0 0 110px; }
.spb-special-pick { max-height: 60vh; }
.spb-extra .spb-special-head i { color: #f56c6c; }
.spb-warranty .spb-special-head i { color: #67c23a; }
.spb-slrow-sub { font-size: 12px; margin-top: 3px; }
.spb-okt { color: #e6a23c; }
.spb-slrow-bad ::v-deep .el-autocomplete .el-input__inner { border-color: #f56c6c; }
.spb-sug { display: flex; align-items: center; gap: 8px; line-height: 1.3; padding: 4px 0; white-space: normal; .spb-sug-name { font-size: 13px; color: #303133; } }
.spb-sug-img { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 4px; object-fit: contain; background: #f5f7fa; }
.spb-sug-none { display: flex; align-items: center; justify-content: center; color: #c0c4cc; }
.spb-sug-main { flex: 1; min-width: 0; }
.spb-slrow-img { flex: 0 0 40px; width: 40px; height: 40px; border-radius: 4px; object-fit: contain; background: #f5f7fa; border: 1px solid #ebeef5; }
.spb-lcard-btn { justify-content: flex-end; }
// the camera view's line list
.spb-scanlist { margin-top: 10px; max-height: 42vh; overflow: auto; border-top: 1px solid #ebeef5; }
.spb-scanlist-head { font-size: 12px; color: #909399; padding: 8px 0 4px; }
.spb-scanlist-empty { padding: 16px; text-align: center; color: #c0c4cc; font-size: 13px; }
.spb-scanrow { display: flex; align-items: center; gap: 8px; padding: 6px 4px; border-bottom: 1px solid #f2f6fc; border-radius: 6px; transition: background .4s;
    &.hit { background: #ecf5ff; } &.bad { background: #fef0f0; } }
.spb-scanrow-main { flex: 1; min-width: 0; font-size: 13px; .spb-pname { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; } }
.spb-scanrow-qty { display: flex; align-items: center; gap: 6px; b { min-width: 24px; text-align: center; font-size: 15px; font-variant-numeric: tabular-nums; } }
.spb-scanrow-del { padding: 0; font-size: 16px; }
.spb-zpo { line-height: 1.4; white-space: nowrap; }
.spb-draft-tag { cursor: pointer; }
/* 海运 / 空运 (2026-10-16) */
.spb-freight { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 3px; font-size: 11px; line-height: 18px; font-weight: 600; vertical-align: middle;
    &.sea { color: #0e7490; background: #e0f2fe; }
    &.air { color: #b45309; background: #fef3c7; } }
.spb-freight-ico { margin-left: 6px; font-size: 15px; vertical-align: middle; cursor: default;
    &.sea { color: #0e7490; }
    &.air { color: #d97706; } }
.spb-freight-ask { margin-bottom: 12px; color: #606266; font-size: 13px; }
.spb-freight-pick { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.spb-freight-opt { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px 10px; border: 1px solid #dcdfe6; border-radius: 8px; cursor: pointer; text-align: center;
    i { font-size: 28px; } b { font-size: 18px; color: #303133; } span { font-size: 12px; color: #909399; line-height: 1.4; }
    &.air i { color: #d97706; } &.sea i { color: #0e7490; }
    &.air:hover { border-color: #f59e0b; background: #fffbeb; }
    &.sea:hover { border-color: #0891b2; background: #ecfeff; } }
.spb-dlg-sub { margin-left: 8px; font-weight: 400; }
.spb-zpo-inline { margin-right: 12px; }
.spb-qty-full { color: #67c23a; }
.spb-qty-short { color: #e6a23c; }
.spb-footer { display: flex; align-items: center; justify-content: space-between; }
.spb-sum { font-size: 12px; color: #909399; }
/* open-orders picker — same look as the Order Batch picker */
.spb-picker-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; label { font-size: 12px; color: #909399; } }
.spb-picker-supplier { width: 260px; }
.spb-picker { display: flex; height: 440px; border: 1px solid #ebeef5; border-radius: 6px; overflow: hidden; }
.spb-cats { flex: 0 0 200px; border-right: 1px solid #ebeef5; background: #fafafa; overflow: auto; }
.spb-cat {
    display: flex; align-items: center; gap: 6px; padding: 10px 12px; cursor: pointer; font-size: 13px; color: #303133;
    border-left: 3px solid transparent; user-select: none;
    &:hover { background: #f0f2f5; }
    &.on { background: #fff; border-left-color: #409eff; font-weight: 600; }
    &.empty { color: #909399; }
}
.spb-cat-name { flex: 1; }
.spb-cat-sel { font-size: 11px; color: #67c23a; font-weight: 600; i { margin-right: 1px; } }
.spb-cat-n {
    min-width: 22px; text-align: center; font-size: 11px; font-weight: 600; color: #f56c6c; background: #fef0f0;
    border-radius: 10px; padding: 1px 6px;
    &.is-zero { color: #c0c4cc; background: #f4f4f5; font-weight: 400; }
}
.spb-lines { flex: 1; overflow: auto; }
.spb-lines-empty { padding: 60px 20px; text-align: center; color: #909399; font-size: 13px; i { font-size: 28px; color: #dcdfe6; display: block; margin-bottom: 8px; } }
.spb-line {
    display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-bottom: 1px solid #f2f6fc; cursor: pointer; user-select: none;
    &:hover { background: #f5f7fa; }
    &.on { background: #ecf5ff; }
    &:last-child { border-bottom: 0; }
}
.spb-line-plus { color: #c0c4cc; font-size: 18px; }
.spb-line:hover .spb-line-plus { color: #409eff; }
.spb-line-check { color: #409eff; font-size: 18px; }
.spb-line-main { flex: 1; min-width: 0; line-height: 1.35; }
.spb-line-name { font-size: 13px; color: #303133; }
/* batch create / detail / receive: product name up to 2 lines, then "…" */
.spb-pname { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; word-break: break-word; line-height: 1.35; }
.spb-psku { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spb-line-status { padding: 0 6px; font-size: 10px; }
.spb-line-qty { font-size: 13px; font-weight: 600; color: #303133; white-space: nowrap; font-variant-numeric: tabular-nums; }
.spb-foot-sum { float: left; line-height: 32px; font-size: 12px; color: #909399; }
.spb-status { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; white-space: nowrap; }
.spb-desc { margin-bottom: 10px; }
.spb-hint { font-size: 12px; color: #909399; margin-top: 8px; i { margin-right: 3px; } }
/* phones (user ask 2026-10-13): the list and the dialogs' lines as cards */
.spb-cards { display: flex; flex-direction: column; gap: 10px; min-height: 80px; }
.spb-cards-empty { padding: 26px 10px; text-align: center; color: #909399; font-size: 13px; }
.spb-card { border: 1px solid #ebeef5; border-radius: 8px; padding: 10px 12px; background: #fff; }
.spb-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.spb-card-row { display: flex; gap: 8px; font-size: 13px; line-height: 1.6; > span:first-child { flex: 0 0 74px; color: #909399; font-size: 12px; } em { font-style: normal; color: #c0c4cc; } }
.spb-card-actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; .el-button { margin-left: 0; } }
.spb-line-cards { display: flex; flex-direction: column; gap: 8px; }
.spb-lcard { border: 1px solid #ebeef5; border-radius: 8px; padding: 10px; background: #fafbfc; }
.spb-lcard-head { display: flex; align-items: flex-start; gap: 8px; }
.spb-lcard-main { flex: 1; min-width: 0; font-size: 13px; }
.spb-lcard-del { padding: 0; font-size: 18px; }
.spb-lcard-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
.spb-lcard-wide { grid-column: 1 / -1; }
.spb-lcard-f { display: flex; flex-direction: column; gap: 3px; label { font-size: 12px; color: #909399; } }
.spb-lcard-val { font-size: 16px; line-height: 32px; }
.spb-lcard-nums { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 8px; font-size: 13px; span { display: flex; flex-direction: column; } em { font-style: normal; font-size: 11px; color: #909399; } }
@media (max-width: 767px) {
    .spb-page { padding: 10px 10px 16px; }
    .spb-bar { gap: 8px; }
    .spb-bar .el-radio-group { width: 100%; display: flex; overflow-x: auto; }
    .spb-search { width: 100%; }
    .spb-bar > .el-button { flex: 1; margin-left: 0; }
    .spb-pager { text-align: center; }
    .spb-picker-supplier { width: 100%; }
}
</style>

<style lang="scss">
/* phone dialogs (they append to body, so outside the scoped block):
   fullscreen with tight paddings, fields and footer buttons stacked, the
   open-orders picker's categories as a scrolling row */
.spb-dlg-phone .el-dialog__header { padding: 12px 14px 8px; }
.spb-dlg-phone .el-dialog__body { padding: 8px 12px 12px; }
.spb-dlg-phone .el-dialog__footer { padding: 8px 12px 14px; }
.spb-dlg-phone .spb-head-fields { flex-direction: column; gap: 8px; }
.spb-dlg-phone .spb-field { min-width: 0; }
.spb-dlg-phone .spb-field-date .el-date-editor, .spb-dlg-phone .spb-field-ship .el-input-number { width: 100% !important; }
.spb-sug-popper { min-width: 360px; max-width: 560px; li { line-height: 1.3 !important; padding: 6px 12px !important; } }
.spb-dlg-phone .spb-slrow { flex-wrap: wrap; .spb-slrow-main { flex: 1 1 100%; } .spb-slrow-sup { flex: 1 1 100%; width: auto; } .spb-slrow-num { flex: 1 1 40%; width: auto; } }
.spb-dlg-phone .spb-special-head { flex-wrap: wrap; }
.spb-dlg-phone .spb-scan { flex-wrap: wrap; .el-input { flex: 1 1 100%; } .el-button { flex: 1; margin-left: 0; } }
.spb-dlg-phone .spb-footer { flex-direction: column; align-items: stretch; gap: 8px; }
.spb-dlg-phone .spb-footer > span:last-child { display: flex; flex-direction: column-reverse; gap: 6px; }
.spb-dlg-phone .spb-footer .el-button { margin-left: 0; width: 100%; }
.spb-dlg-phone .el-dialog__footer > span:not(.spb-footer) { display: flex; flex-direction: column; gap: 6px; }
.spb-dlg-phone .el-dialog__footer > span:not(.spb-footer) .el-button { margin-left: 0; width: 100%; }
.spb-dlg-phone .spb-foot-sum { float: none; line-height: 1.4; text-align: center; }
.spb-dlg-phone .spb-picker { flex-direction: column; height: calc(100vh - 230px); }
.spb-dlg-phone .spb-cats { flex: 0 0 auto; display: flex; overflow-x: auto; border-right: 0; border-bottom: 1px solid #ebeef5; }
.spb-dlg-phone .spb-cat { flex: 0 0 auto; border-left: 0; border-bottom: 3px solid transparent; padding: 8px 10px; white-space: nowrap; }
.spb-dlg-phone .spb-cat.on { border-bottom-color: #409eff; }
.spb-dlg-phone .spb-inline-tracking { max-width: none; }
.spb-dlg-phone .spb-inline-actions { flex-wrap: wrap; }
.spb-dlg-phone .spb-picker-bar { flex-direction: column; align-items: stretch; gap: 4px; }
.spb-dlg-phone .el-descriptions-item__label { min-width: 96px; word-break: keep-all; }
</style>
