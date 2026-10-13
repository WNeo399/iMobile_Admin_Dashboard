<template>
    <div class="spb-page app-container">
        <div class="spb-bar">
            <span class="spb-title">{{ $tt('Batches') }}</span>
            <span class="spb-spacer" />
            <el-radio-group v-model="statusFilter" size="mini" @change="reload">
                <el-radio-button label="">{{ $tp('All') }} ({{ totalAll }})</el-radio-button>
                <el-radio-button label="draft">{{ $tp('Draft') }} ({{ byStatus.draft || 0 }})</el-radio-button>
                <el-radio-button label="shipped">{{ $tp('Shipped') }} ({{ byStatus.shipped || 0 }})</el-radio-button>
                <el-radio-button label="received">{{ $tp('Received') }} ({{ byStatus.received || 0 }})</el-radio-button>
            </el-radio-group>
            <el-input v-model="search" size="small" clearable prefix-icon="el-icon-search" class="spb-search"
                :placeholder="$tp('Batch no, tracking, SKU, product…')" @keyup.enter.native="reload" @clear="reload" />
            <el-button v-if="can('spp:batch:create')" type="primary" size="small" icon="el-icon-truck" @click="openCreate">{{ $tp('Create Batch') }}</el-button>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">{{ $tp('Refresh') }}</el-button>
        </div>

        <!-- phones (2026-10-13): a card per batch instead of the wide table -->
        <div v-if="phone" v-loading="loading" class="spb-cards">
            <div v-if="!rows.length && !loading" class="spb-cards-empty">{{ $tp('No batches yet') }}</div>
            <div v-for="r in rows" :key="r._id" class="spb-card">
                <div class="spb-card-head">
                    <el-tag v-if="r.status === 'draft'" size="mini" type="warning" class="spb-draft-tag" @click="openDraft(r)">{{ $tp('Draft') }}</el-tag>
                    <el-button v-else type="text" class="spb-no" @click="openView(r)">{{ r.batchNo }}</el-button>
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
            <el-table-column :label="$tp('Batch')" width="110">
                <template slot-scope="s">
                    <el-tag v-if="s.row.status === 'draft'" size="mini" type="warning" class="spb-draft-tag" @click="openDraft(s.row)">{{ $tp('Draft') }}</el-tag>
                    <el-button v-else type="text" class="spb-no" @click="openView(s.row)">{{ s.row.batchNo }}</el-button>
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

        <!-- ── Create batch ─────────────────────────────────────────── -->
        <!-- Scan a SKU to pull its oldest waiting line, or pick lines from
             the open list. The shipped qty defaults to the ordered qty; a
             smaller number is a short shipment and still closes the line. -->
        <el-dialog :visible.sync="createVisible" width="960px" append-to-body top="5vh" :fullscreen="phone" :custom-class="dlgClass" @closed="onCreateClosed">
            <div slot="title" class="spb-dlg-head"><i class="el-icon-truck" /> {{ draftId ? $tp('Draft batch') : $tp('Create Batch') }}
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
            <barcode-scanner :visible.sync="cameraVisible" :fullscreen="phone" @scan="onCameraScan">
                <!-- the batch as it builds, under the camera (user ask
                     2026-10-13): every line with its count, +/− and remove;
                     the line just read moves to the top. A scan with no
                     order behind it stays on as an unmatched line. -->
                <div class="spb-scanlist">
                    <div class="spb-scanlist-head">
                        <b>{{ $tp('{n} line(s)', { n: createForm.lines.length }) }}</b> · {{ $tp('{n} pcs', { n: createTotal }) }}
                        <span v-if="unmatchedCount" class="spb-warn"> · {{ $tp('{n} not on any order', { n: unmatchedCount }) }}</span>
                    </div>
                    <div v-if="!createForm.lines.length" class="spb-scanlist-empty">{{ $tp('Scanned lines show here') }}</div>
                    <div v-for="(l, i) in createForm.lines" :key="'s-' + (l.orderId || l.sku) + '-' + i" :class="['spb-scanrow', { hit: isLastScan(l), bad: l.unmatched }]">
                        <div class="spb-scanrow-main">
                            <div class="spb-pname">{{ l.productName || l.sku }}</div>
                            <div class="spb-dim">{{ l.sku || '—' }}<template v-if="l.unmatched"> · <span class="spb-warn">{{ unmatchedLabel(l) }}</span></template><template v-else> · {{ $tp('ordered {n}', { n: l.orderQty }) }}</template></div>
                        </div>
                        <div class="spb-scanrow-qty">
                            <el-button size="mini" icon="el-icon-minus" circle :disabled="!l.qty || l.qty <= 1" @click="bumpQty(l, -1)" />
                            <b>{{ l.qty == null ? '—' : l.qty }}</b>
                            <el-button size="mini" icon="el-icon-plus" circle @click="bumpQty(l, 1)" />
                        </div>
                        <el-button type="text" icon="el-icon-close" class="spb-del spb-scanrow-del" @click="createForm.lines.splice(i, 1)" />
                    </div>
                </div>
            </barcode-scanner>
            <!-- phones: a card per line — the fields that need typing (supplier, price, qty) big enough to tap -->
            <div v-if="phone" class="spb-line-cards">
                <div v-if="!createForm.lines.length" class="spb-cards-empty">{{ $tp('Scan a SKU or pick orders to start the batch') }}</div>
                <div v-for="(l, i) in createForm.lines" :key="l.orderId + '-' + i" class="spb-lcard">
                    <div class="spb-lcard-head">
                        <div class="spb-lcard-main">
                            <div class="spb-pname">{{ l.productName || l.sku }}</div>
                            <div class="spb-dim">SKU: {{ l.sku || '—' }}<span v-if="l.category"> · {{ $tp(l.category) }}</span> ·
                                <span v-if="l.unmatched" class="spb-warn">{{ unmatchedLabel(l) }}</span>
                                <template v-else-if="l.status === 'pending'">{{ $tp('Pending') }}</template><template v-else>{{ $tp('Ordered') }} {{ fmtDay(l.orderedAt) }}</template></div>
                        </div>
                        <el-button type="text" icon="el-icon-close" class="spb-del spb-lcard-del" @click="createForm.lines.splice(i, 1)" />
                    </div>
                    <!-- no order behind it: just the count, and a way to look for its order again -->
                    <div v-if="l.unmatched" class="spb-lcard-grid">
                        <div class="spb-lcard-f">
                            <label>{{ $tp('Scanned Qty') }}</label>
                            <el-input-number v-model="l.qty" size="small" :min="1" :controls="false" style="width:100%" />
                        </div>
                        <div class="spb-lcard-f spb-lcard-btn">
                            <el-button size="small" icon="el-icon-search" :loading="l.matching" @click="rematch(l)">{{ $tp('Find order') }}</el-button>
                        </div>
                    </div>
                    <div v-else class="spb-lcard-grid">
                        <div v-if="l.status === 'pending'" class="spb-lcard-f spb-lcard-wide">
                            <label>{{ $tp('Supplier') }} *</label>
                            <el-select v-model="l.supplier" size="small" filterable allow-create default-first-option :placeholder="$tp('Select')" style="width:100%">
                                <el-option v-for="sup in suppliers" :key="sup" :label="sup" :value="sup" />
                            </el-select>
                        </div>
                        <div class="spb-lcard-f">
                            <label>{{ $tp('Unit Price') }} (¥)</label>
                            <el-input-number v-model="l.unitPrice" size="small" :min="0" :precision="2" :controls="false" style="width:100%"
                                :placeholder="$tp('to fill')" />
                            <div class="spb-dim">{{ $tp('required to ship') }}</div>
                        </div>
                        <div class="spb-lcard-f">
                            <label>{{ $tp('Shipped Qty') }} *</label>
                            <el-input-number v-model="l.qty" size="small" :min="1" :controls="false" style="width:100%" :placeholder="String(l.orderQty)"
                                :class="{ 'spb-short': l.qty != null && l.qty < l.orderQty }" />
                            <div class="spb-dim">{{ $tp('Ordered Qty') }}: {{ l.orderQty }}</div>
                        </div>
                    </div>
                    <div v-if="l.qty != null && l.qty < l.orderQty" class="spb-short-note">{{ $tp('short {n} — the rest becomes a new line', { n: l.orderQty - l.qty }) }}</div>
                </div>
            </div>
            <el-table v-else :data="createForm.lines" size="mini" border max-height="380" :empty-text="$tp('Scan a SKU or pick orders to start the batch')">
                <!-- the name wraps to at most 2 lines; hover for all of it -->
                <el-table-column :label="$tp('Product')" min-width="240">
                    <template slot-scope="s">
                        <div class="spb-pname" :title="s.row.productName">{{ s.row.productName || s.row.sku }}</div>
                        <div class="spb-dim spb-psku">SKU: {{ s.row.sku || '—' }}<span v-if="s.row.category"> · {{ $tp(s.row.category) }}</span>
                            <el-button v-if="s.row.unmatched" type="text" size="mini" icon="el-icon-search" class="spb-find" :loading="s.row.matching" @click="rematch(s.row)">{{ $tp('Find order') }}</el-button></div>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Supplier')" width="150" align="center">
                    <template slot-scope="s">
                        <el-select v-if="s.row.status === 'pending'" v-model="s.row.supplier" size="mini" filterable allow-create
                            default-first-option :placeholder="$tp('Select')" style="width:130px">
                            <el-option v-for="sup in suppliers" :key="sup" :label="sup" :value="sup" />
                        </el-select>
                        <template v-else>{{ s.row.supplier || '—' }}</template>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Ordered')" width="110" align="center">
                    <template slot-scope="s">
                        <el-tag v-if="s.row.unmatched" size="mini" type="danger" effect="plain">{{ unmatchedLabel(s.row) }}</el-tag>
                        <el-tag v-else-if="s.row.status === 'pending'" size="mini" type="warning">{{ $tp('Pending') }}</el-tag>
                        <template v-else>{{ fmtDay(s.row.orderedAt) }}</template>
                    </template>
                </el-table-column>
                <!-- Wanted to ship, not to save a draft (the purchase team can
                     fill the prices in on the downloaded sheet): prefilled from
                     the line, editable on every line. -->
                <el-table-column :label="$tp('Unit Price') + ' (¥)'" width="110" align="center">
                    <template slot-scope="s">
                        <el-input-number v-if="!s.row.unmatched" v-model="s.row.unitPrice" size="mini" :min="0" :precision="2" :controls="false" :placeholder="$tp('to fill')"
                            style="width:88px" />
                        <span v-else class="spb-dim">—</span>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Ordered Qty')" width="90" align="center">
                    <template slot-scope="s">{{ s.row.unmatched ? '—' : s.row.orderQty }}</template>
                </el-table-column>
                <el-table-column :label="$tp('Shipped Qty')" width="120" align="center">
                    <template slot-scope="s">
                        <el-input-number v-model="s.row.qty" size="mini" :min="1" :controls="false" style="width:76px"
                            :placeholder="s.row.orderQty == null ? '' : String(s.row.orderQty)" :class="{ 'spb-short': s.row.qty != null && s.row.qty < s.row.orderQty }" />
                        <div v-if="s.row.qty != null && s.row.qty < s.row.orderQty" class="spb-short-note">{{ $tp('short {n} — the rest becomes a new line', { n: s.row.orderQty - s.row.qty }) }}</div>
                        <div v-else-if="s.row.qty == null" class="spb-dim">{{ $tp('type or scan') }}</div>
                    </template>
                </el-table-column>
                <el-table-column width="40" align="center">
                    <template slot-scope="s">
                        <el-button type="text" size="mini" icon="el-icon-close" class="spb-del" @click="createForm.lines.splice(s.$index, 1)" />
                    </template>
                </el-table-column>
            </el-table>
            <!-- The price sheet (user ask 2026-10-13): a draft is saved with
                 the prices left blank, the list goes to the purchase team as a
                 spreadsheet, they fill the Unit Price column and send it back,
                 and the file is uploaded here to fill the prices in. -->
            <div v-if="createForm.lines.length" class="spb-price-tools">
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
                    <template v-if="createForm.lines.length">{{ $tp('{n} line(s)', { n: createForm.lines.length }) }} · {{ $tp('{n} pcs', { n: createTotal }) }}
                        <!-- the money: goods from the priced lines, plus the shipping cost -->
                        <template v-if="createAmount.goods || createAmount.shipping">
                            · <b>{{ $tp('Total') }} {{ yuan(createAmount.total) }}</b>
                            <span v-if="createAmount.shipping" class="spb-dim"> ({{ $tp('goods') }} {{ yuan(createAmount.goods) }} + {{ $tp('shipping') }} {{ yuan(createAmount.shipping) }})</span>
                        </template>
                        <span v-if="createAmount.unpriced" class="spb-warn"> · {{ $tp('{n} line(s) without a price', { n: createAmount.unpriced }) }}</span>
                        <span v-if="unmatchedCount" class="spb-warn"> · {{ $tp('{n} not on any order', { n: unmatchedCount }) }}</span>
                    </template>
                </span>
                <span>
                    <el-button size="small" @click="createVisible = false">{{ $tp('Cancel') }}</el-button>
                    <el-button size="small" icon="el-icon-document" :loading="savingDraft" :disabled="!createForm.lines.length && !createForm.tracking && !createForm.note && createForm.shippingCost == null"
                        @click="saveDraft">{{ draftId ? $tp('Save draft') : $tp('Save as draft') }}</el-button>
                    <el-button type="primary" size="small" icon="el-icon-truck" :loading="creating" :disabled="!createForm.lines.length"
                        @click="submitCreate">{{ $tp('Ship {n} line(s)', { n: createForm.lines.length }) }}</el-button>
                </span>
            </div>
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
                    <div v-for="c in CATEGORIES" :key="c" :class="['spb-cat', { on: pickerCat === c, empty: !pickerCatCount(c) }]"
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
                                <div class="spb-pname">{{ i + 1 }}. {{ l.productName }}</div>
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
                            <div class="spb-pname" :title="s.row.productName">{{ s.row.productName }}</div>
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
import { listBatches, getBatch, createBatch, updateBatch, receiveBatch, lookupOrder, openLines, getMeta, retryBatchZoho, updateBatchDraft, shipBatchDraft, discardBatchDraft } from '@/api/sparePartsPurchase'
import BarcodeScanner from './components/BarcodeScanner'
import * as XLSX from 'xlsx-js-style'
import { STATUS_META, BATCH_STATUS, CATEGORIES, fmtDay, fmtWhen, yuan, dhlLink, zohoPoLink, todayYmd, packingListHtml, batchAmount } from './shared'
import { buildSppLineLabelsPdf, buildSppBatchLabelsPdf, sppLabelCount, sppLabelFileName, withLabelNames, getLabelOrientation, setLabelOrientation, getLabelSize, setLabelSize, LABEL_SIZES } from '@/utils/sppLabelPdf'
// Category names are stored in English (the register's words) and shown
// through $tp, like everything else on the page.

// Supplier filter value for lines that have no supplier yet.
const NO_SUPPLIER = '__none__'

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
            labelSize: getLabelSize(),
            LABEL_SIZES,
            // a phone-width window (user ask 2026-10-13: batches are created on
            // the team's phones): cards instead of tables, fullscreen dialogs
            phone: window.innerWidth < 768,
            // the camera scanner (Create Batch): shown wherever a camera API exists
            hasCamera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            cameraVisible: false,
            lastScan: '', // the SKU just read — its line is highlighted in the camera view
            // create / draft
            createVisible: false,
            createForm: { zohoVendorId: '', tracking: '', shippedAt: todayYmd(), note: '', shippingCost: undefined, lines: [] },
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
            viewEdit: { tracking: '', note: '' },
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
        createTotal() {
            return this.createForm.lines.reduce((t, l) => t + (Number(l.qty) || 0), 0)
        },
        // the money on the form / on the batch being viewed
        createAmount() {
            return batchAmount(this.createForm.lines.filter(l => !l.unmatched), this.createForm.shippingCost, l => l.qty)
        },
        // lines scanned with no order behind them (kept for adjustment)
        unmatchedCount() {
            return this.createForm.lines.filter(l => l.unmatched).length
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
            // (never over a form still open from before — that would wipe it)
            else if (q.create && !this.createVisible) this.openCreate()
        },
        clearQuery() {
            if (Object.keys(this.$route.query || {}).length) this.$router.replace({ query: {} }).catch(() => {})
        },
        // ── Create ─────────────────────────────────────────────────
        async openCreate() {
            this.draftId = null
            this.createForm = { zohoVendorId: '', tracking: '', shippedAt: todayYmd(), note: '', shippingCost: undefined, lines: [] }
            this.scan = ''
            this.createVisible = true
            this.loadSuppliers()
        },
        // A saved draft back into the form.
        openDraft(row) {
            this.draftId = row._id
            this.createForm = {
                zohoVendorId: row.zohoVendorId || '',
                tracking: row.tracking || '',
                shippedAt: fmtDay(row.shippedAt) !== '—' ? fmtDay(row.shippedAt) : todayYmd(),
                note: row.note || '',
                shippingCost: row.shippingCost != null ? row.shippingCost : undefined,
                lines: (row.lines || []).map(l => (l.unmatched ? this.unmatchedLine(l.sku, l, l.qty == null ? undefined : l.qty) : {
                    orderId: l.orderId, orderNo: l.orderNo, sku: l.sku, productName: l.productName, category: l.category,
                    status: l.status, supplier: l.supplier || '', orderedAt: l.orderedAt,
                    unitPrice: l.unitPrice != null ? l.unitPrice : undefined, orderQty: l.orderQty, qty: l.qty == null ? undefined : l.qty
                }))
            }
            this.scan = ''
            this.createVisible = true
            this.loadSuppliers()
        },
        batchPayload() {
            return {
                zohoVendorId: this.createForm.zohoVendorId,
                tracking: this.createForm.tracking,
                shippedAt: this.createForm.shippedAt,
                note: this.createForm.note,
                // null (not undefined) when blank, so clearing the field on a draft clears it there too
                shippingCost: this.createForm.shippingCost == null ? null : this.createForm.shippingCost,
                lines: this.createForm.lines.map(l => (l.unmatched
                    ? { unmatched: true, sku: l.sku, productName: l.productName, category: l.category, reason: l.reason, qty: l.qty }
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
        downloadPriceSheet(row) {
            const lines = (row ? (row.lines || []) : this.createForm.lines).filter(l => !l.unmatched)
            if (!lines.length) { this.$message.info(this.$tp('Nothing to export')); return }
            const t = k => this.$tp(k)
            const tracking = row ? row.tracking : this.createForm.tracking
            const date = fmtDay(new Date().toISOString())
            const price = `${t('Unit Price')} (¥)`
            const data = lines.map((l, i) => ({
                '#': i + 1,
                [t('Order No')]: l.orderNo || '',
                'SKU': l.sku || '',
                [t('Product')]: l.productName || '',
                [t('Category')]: l.category ? t(l.category) : '',
                [t('Supplier')]: l.supplier || '',
                [t('Ordered Qty')]: l.orderQty != null ? l.orderQty : '',
                [t('Shipped Qty')]: l.qty != null ? l.qty : '',
                [price]: l.unitPrice != null ? l.unitPrice : '',
                [t('Order ID')]: String(l.orderId || '')
            }))
            const ws = XLSX.utils.json_to_sheet(data, { origin: 'A3' })
            XLSX.utils.sheet_add_aoa(ws, [
                [`${t('Price sheet')} — ${tracking || t('Draft batch')} — ${date}`],
                [t('Fill in the Unit Price column and send the file back; leave the other columns as they are')]
            ], { origin: 'A1' })
            ws['!cols'] = [4, 12, 14, 50, 14, 14, 11, 11, 14, 26].map(w => ({ wch: w }))
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
                const lines = this.createForm.lines
                const used = new Set()
                const find = (row) => {
                    const by = (fn) => lines.find(l => !used.has(l) && fn(l))
                    const id = idx.orderId != null ? String(row[idx.orderId] || '').trim() : ''
                    const no = idx.orderNo != null ? String(row[idx.orderNo] || '').trim() : ''
                    const sku = idx.sku != null ? String(row[idx.sku] || '').trim().toLowerCase() : ''
                    return (id && by(l => String(l.orderId) === id)) ||
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
            if (this.createForm.lines.find(l => l.orderId === o._id)) return false
            // the newest line on top, where it is seen on a phone
            this.createForm.lines.unshift({
                orderId: o._id,
                orderNo: o.orderNo,
                sku: o.sku,
                productName: o.productName,
                category: o.category,
                status: o.status,
                supplier: o.supplier || '',
                orderedAt: o.orderedAt,
                unitPrice: o.unitPrice != null ? o.unitPrice : (o.quotedPrice != null ? o.quotedPrice : undefined),
                orderQty: o.orderQty,
                qty: qty == null ? undefined : qty
            })
            return true
        },
        // One scan = one unit. It fills the SKU's line already on the batch
        // (oldest first); once that line is full the next waiting order for
        // the SKU is pulled on with a count of 1.
        async doScan() {
            const sku = (this.scan || '').trim()
            if (!sku) return
            const same = l => String(l.sku || '').toLowerCase() === sku.toLowerCase()
            const open = this.createForm.lines.find(l => same(l) && (l.qty == null || l.qty < l.orderQty))
            if (open) {
                open.qty = (open.qty || 0) + 1
                this.toTop(open)
                this.lastScan = sku
                this.$message({ message: `${sku} · ${open.qty} / ${open.orderQty}`, type: 'success', duration: 1200 })
                this.scan = ''
                this.$nextTick(() => { if (this.$refs.scanRef) this.$refs.scanRef.focus() })
                return
            }
            this.scanning = true
            try {
                const r = await lookupOrder(sku, this.createForm.lines.map(l => l.orderId))
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.lastScan = sku
                if (!r.match) {
                    this.keepUnmatched(sku, r)
                } else {
                    this.addLine(r.match, 1)
                    this.$message({ message: `${sku} · 1 / ${r.match.orderQty}` + (r.remaining ? ` · ${this.$tp('{n} more waiting order(s)', { n: r.remaining })}` : ''), type: 'success', duration: 1500 })
                }
                this.scan = ''
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Lookup failed')))
            } finally {
                this.scanning = false
                this.$nextTick(() => { if (this.$refs.scanRef) this.$refs.scanRef.focus() })
            }
        },
        // the line just scanned goes to the top, where the camera view shows it
        toTop(line) {
            const i = this.createForm.lines.indexOf(line)
            if (i > 0) { this.createForm.lines.splice(i, 1); this.createForm.lines.unshift(line) }
        },
        isLastScan(l) {
            return !!this.lastScan && String(l.sku || '').toLowerCase() === this.lastScan.toLowerCase()
        },
        bumpQty(l, d) {
            l.qty = Math.max(1, (Number(l.qty) || 0) + d)
        },
        unmatchedLabel(l) {
            return l.reason === 'over' ? this.$tp('Over the ordered quantity') : this.$tp('Not on any order')
        },
        // the shape of a line with no order behind it (`src` = the lookup's
        // register item, or the saved draft line)
        unmatchedLine(sku, src, qty) {
            return {
                orderId: null, unmatched: true, reason: (src && src.reason === 'over') ? 'over' : 'none', matching: false,
                orderNo: '', sku, productName: (src && (src.productName || src.name)) || '', category: (src && (src.category || src.classification)) || '',
                status: 'unmatched', supplier: '', orderedAt: null, unitPrice: undefined, orderQty: null, qty
            }
        },
        // A scan with no order behind it (user ask 2026-10-13: "leave it as
        // it is for future adjustment"): not thrown away — kept on the batch
        // as an unmatched line, by SKU, for someone to remove or to match
        // once its order exists. Nothing ships while one is on the form.
        keepUnmatched(sku, r) {
            const same = l => l.unmatched && String(l.sku || '').toLowerCase() === sku.toLowerCase()
            let line = this.createForm.lines.find(same)
            if (line) {
                line.qty = (line.qty || 0) + 1
                this.toTop(line)
            } else {
                line = this.unmatchedLine(sku, { ...(r && r.item), reason: r && r.hadWaiting ? 'over' : 'none' }, 1)
                this.createForm.lines.unshift(line)
            }
            this.$message({ message: `${sku} · ${line.qty} — ${this.unmatchedLabel(line)}`, type: 'warning', duration: 2000 })
        },
        // Look again for the order behind an unmatched line (one may have
        // been raised since): on a hit the line becomes that order's line.
        async rematch(l) {
            this.$set(l, 'matching', true)
            try {
                const r = await lookupOrder(l.sku, this.createForm.lines.filter(x => x.orderId).map(x => x.orderId))
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                if (!r.match) { this.$message.info(this.$tp('Still no waiting order for {sku}', { sku: l.sku })); return }
                const i = this.createForm.lines.indexOf(l)
                if (i < 0) return
                this.createForm.lines.splice(i, 1)
                this.addLine(r.match, l.qty || 1)
                this.$message.success(`${l.sku} → ${r.match.orderNo}`)
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Lookup failed')))
            } finally { this.$set(l, 'matching', false) }
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
                const r = await openLines()
                const on = new Set(this.createForm.lines.map(l => l.orderId))
                this.pickerRows = ((r && r.rows) || []).filter(o => !on.has(o._id))
                // land on the first category that has something to pick
                if (!this.pickerCat || !this.pickerCatCount(this.pickerCat)) {
                    this.pickerCat = CATEGORIES.find(c => this.pickerCatCount(c)) || CATEGORIES[0]
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
                this.pickerCat = CATEGORIES.find(c => this.pickerCatCount(c)) || this.pickerCat
            }
        },
        togglePick(r) {
            if (this.pickerPicked[r._id]) this.$delete(this.pickerPicked, r._id)
            else this.$set(this.pickerPicked, r._id, r)
        },
        addPicked() {
            let n = 0
            for (const o of Object.values(this.pickerPicked).reverse()) if (this.addLine(o)) n++
            this.pickerVisible = false
            if (n) this.$message.success(this.$tp('{n} line(s) added', { n }))
        },
        async submitCreate() {
            if (this.unmatchedCount) { this.$message.warning(this.$tp('{n} line(s) are not on any order — remove them or find their order before shipping', { n: this.unmatchedCount })); return }
            if (!this.createForm.zohoVendorId) { this.$message.warning(this.$tp('Select the Zoho vendor')); return }
            for (const l of this.createForm.lines) {
                if (!l.qty || l.qty < 1) { this.$message.warning(this.$tp('{sku}: enter the shipped quantity', { sku: l.sku || l.productName })); return }
                if (l.status === 'pending' && !l.supplier) { this.$message.warning(this.$tp('{sku}: pick a supplier', { sku: l.sku || l.productName })); return }
                if (l.unitPrice == null || l.unitPrice === '') { this.$message.warning(this.$tp('{sku}: enter the unit price', { sku: l.sku || l.productName })); return }
            }
            this.creating = true
            try {
                const r = this.draftId
                    ? await shipBatchDraft(this.draftId, this.batchPayload())
                    : await createBatch(this.batchPayload())
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
            this.viewEdit = { tracking: row.tracking || '', note: row.note || '' }
            this.viewVisible = true
        },
        // ── Tracking / note, inline in the view dialog ─────────────
        canEditView() {
            return !!this.view && this.can('spp:batch:manage') && this.view.status !== 'cancelled'
        },
        viewDirty() {
            return !!this.view && (this.viewEdit.tracking.trim() !== (this.view.tracking || '') || this.viewEdit.note.trim() !== (this.view.note || ''))
        },
        resetViewEdit() {
            this.viewEdit = { tracking: this.view.tracking || '', note: this.view.note || '' }
        },
        async saveViewEdit() {
            if (!this.view) return
            this.viewSaving = true
            try {
                const data = { tracking: this.viewEdit.tracking.trim(), note: this.viewEdit.note.trim() }
                if (this.view.shippedAt) data.shippedAt = fmtDay(this.view.shippedAt)
                const r = await updateBatch(this.view._id, data)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.view = { ...this.view, tracking: data.tracking, note: data.note }
                this.viewEdit = { tracking: data.tracking, note: data.note }
                this.$message.success(this.$tp('Saved'))
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
        async printLineLabels(line) {
            const [named] = await withLabelNames([line])
            this.showLabels(() => buildSppLineLabelsPdf(named), sppLabelFileName(this.view, line), this.$tp('Labels') + ' — ' + (line.sku || line.productName))
        },
        async printAllLabels(batch) {
            const n = sppLabelCount(batch)
            if (!n) return
            const named = { ...batch, lines: await withLabelNames(batch.lines) }
            this.showLabels(() => buildSppBatchLabelsPdf(named), sppLabelFileName(batch), this.$tp('Labels') + ' — ' + batch.batchNo + ' (' + n + ')')
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
            this.editForm = { tracking: row.tracking || '', shippedAt: fmtDay(row.shippedAt), note: row.note || '' }
            this.editVisible = true
        },
        async submitEdit() {
            this.editSaving = true
            try {
                const r = await updateBatch(this.editRow._id, this.editForm)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('Saved'))
                this.editVisible = false
                this.load()
                if (this.view && this.view._id === this.editRow._id) {
                    this.view = { ...this.view, ...this.editForm, shippedAt: this.editForm.shippedAt }
                    this.viewEdit = { tracking: this.editForm.tracking, note: this.editForm.note }
                }
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save')))
            } finally {
                this.editSaving = false
            }
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
.spb-price-tools { display: flex; align-items: center; flex-wrap: wrap; gap: 0 12px; margin-top: 6px; .el-button { padding: 4px 0; } }
.spb-price-hint { flex: 1 1 240px; word-break: normal; }
.spb-file { display: none; }
.spb-find { padding: 0; margin-left: 6px; }
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
