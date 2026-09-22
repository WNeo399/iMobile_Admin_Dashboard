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

        <el-table v-loading="loading" :data="rows" size="mini" border :empty-text="$tp('No batches yet')">
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
            <el-table-column :label="$tp('Actions')" width="210" align="center">
                <template slot-scope="s">
                    <template v-if="s.row.status === 'draft'">
                        <el-button v-if="can('spp:batch:create')" type="text" size="mini" icon="el-icon-edit" @click="openDraft(s.row)">{{ $tp('Edit') }}</el-button>
                        <span v-else class="spb-dim">{{ $tp('Draft') }}</span>
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
            <el-pagination background layout="total, sizes, prev, pager, next" :total="total" :page-size="pageSize"
                :page-sizes="[10, 20, 50]" :current-page="page" @current-change="onPage" @size-change="onSize" />
        </div>

        <!-- ── Create batch ─────────────────────────────────────────── -->
        <!-- Scan a SKU to pull its oldest waiting line, or pick lines from
             the open list. The shipped qty defaults to the ordered qty; a
             smaller number is a short shipment and still closes the line. -->
        <el-dialog :visible.sync="createVisible" width="960px" append-to-body top="5vh" @closed="onCreateClosed">
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
                    :placeholder="$tp('Scan a SKU — one scan counts one unit; the oldest waiting order fills first…')" @keyup.enter.native="doScan">
                    <el-button slot="append" icon="el-icon-plus" :loading="scanning" @click="doScan" />
                </el-input>
                <el-button size="small" icon="el-icon-tickets" @click="openPicker">{{ $tp('Pick from open orders') }}</el-button>
            </div>
            <el-table :data="createForm.lines" size="mini" border max-height="380" :empty-text="$tp('Scan a SKU or pick orders to start the batch')">
                <el-table-column :label="$tp('Product')" min-width="240" show-overflow-tooltip>
                    <template slot-scope="s">
                        <div>{{ s.row.productName }}</div>
                        <div class="spb-dim">SKU: {{ s.row.sku || '—' }}<span v-if="s.row.category"> · {{ $tp(s.row.category) }}</span></div>
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
                        <el-tag v-if="s.row.status === 'pending'" size="mini" type="warning">{{ $tp('Pending') }}</el-tag>
                        <template v-else>{{ fmtDay(s.row.orderedAt) }}</template>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Unit Price')" width="110" align="center">
                    <template slot-scope="s">
                        <el-input-number v-if="s.row.status === 'pending'" v-model="s.row.unitPrice" size="mini" :min="0" :precision="2"
                            :controls="false" placeholder="¥" style="width:88px" />
                        <template v-else>{{ yuan(s.row.unitPrice) }}</template>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Ordered Qty')" width="90" align="center">
                    <template slot-scope="s">{{ s.row.orderQty }}</template>
                </el-table-column>
                <el-table-column :label="$tp('Shipped Qty')" width="120" align="center">
                    <template slot-scope="s">
                        <el-input-number v-model="s.row.qty" size="mini" :min="1" :controls="false" style="width:76px"
                            :placeholder="String(s.row.orderQty)" :class="{ 'spb-short': s.row.qty != null && s.row.qty < s.row.orderQty }" />
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
            <!-- Tracking on its own line, the note as a text area beneath. -->
            <div class="spb-field spb-below">
                <label>{{ $tp('Tracking') }}</label>
                <el-input v-model="createForm.tracking" size="small" :placeholder="$tp('Can be added later')" clearable />
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
                    <template v-if="createForm.lines.length">{{ $tp('{n} line(s)', { n: createForm.lines.length }) }} · {{ $tp('{n} pcs', { n: createTotal }) }}</template>
                </span>
                <span>
                    <el-button size="small" @click="createVisible = false">{{ $tp('Cancel') }}</el-button>
                    <el-button size="small" icon="el-icon-document" :loading="savingDraft" :disabled="!createForm.lines.length && !createForm.tracking && !createForm.note"
                        @click="saveDraft">{{ draftId ? $tp('Save draft') : $tp('Save as draft') }}</el-button>
                    <el-button type="primary" size="small" icon="el-icon-truck" :loading="creating" :disabled="!createForm.lines.length"
                        @click="submitCreate">{{ $tp('Ship {n} line(s)', { n: createForm.lines.length }) }}</el-button>
                </span>
            </div>
        </el-dialog>

        <!-- ── Pick open orders ─────────────────────────────────────── -->
        <el-dialog :title="$tp('Open orders')" :visible.sync="pickerVisible" width="820px" append-to-body top="6vh">
            <el-input v-model="pickerSearch" size="small" clearable prefix-icon="el-icon-search" class="spb-picker-search"
                :placeholder="$tp('Product, SKU, order no, supplier, category…')" @keyup.enter.native="loadPicker" @clear="loadPicker" />
            <el-table ref="pickerTable" v-loading="pickerLoading" :data="pickerRows" size="mini" border max-height="420"
                :empty-text="$tp('No waiting orders')" @selection-change="v => pickerSelection = v">
                <el-table-column type="selection" width="40" />
                <el-table-column :label="$tp('Product')" min-width="240" show-overflow-tooltip>
                    <template slot-scope="s">
                        <div>{{ s.row.productName }}</div>
                        <div class="spb-dim">SKU: {{ s.row.sku || '—' }}<span v-if="s.row.category"> · {{ $tp(s.row.category) }}</span></div>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Status')" width="90" align="center">
                    <template slot-scope="s"><span class="spb-status" :style="statusStyle(s.row.status)">{{ statusLabel(s.row.status) }}</span></template>
                </el-table-column>
                <el-table-column :label="$tp('Supplier')" width="110" align="center" show-overflow-tooltip>
                    <template slot-scope="s">{{ s.row.supplier || '—' }}</template>
                </el-table-column>
                <el-table-column :label="$tp('Ordered')" width="110" align="center">
                    <template slot-scope="s">{{ fmtDay(s.row.orderedAt || s.row.createdAt) }}</template>
                </el-table-column>
                <el-table-column :label="$tp('Qty')" width="66" align="center">
                    <template slot-scope="s">{{ s.row.orderQty }}</template>
                </el-table-column>
            </el-table>
            <span slot="footer">
                <el-button size="small" @click="pickerVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button type="primary" size="small" :disabled="!pickerSelection.length" @click="addPicked">{{ $tp('Add {n} line(s)', { n: pickerSelection.length }) }}</el-button>
            </span>
        </el-dialog>

        <!-- ── View batch ───────────────────────────────────────────── -->
        <el-dialog :visible.sync="viewVisible" width="900px" append-to-body top="5vh">
            <div slot="title" class="spb-dlg-head"><i class="el-icon-tickets" /> {{ view ? view.batchNo : '' }}
                <el-tag v-if="view" size="mini" :type="batchTag(view.status)" effect="plain" class="spb-dlg-tag">{{ batchLabel(view.status) }}</el-tag>
            </div>
            <div v-if="view">
                <el-descriptions :column="3" border size="small" class="spb-desc">
                    <el-descriptions-item :label="$tp('Shipped')">{{ fmtDay(view.shippedAt) }}</el-descriptions-item>
                    <el-descriptions-item :label="$tp('Tracking')">
                        <a v-if="view.tracking" class="spb-link" :href="dhlLink(view.tracking)" target="_blank" rel="noopener">{{ view.tracking }}</a>
                        <span v-else>—</span>
                    </el-descriptions-item>
                    <el-descriptions-item :label="$tp('Zoho vendor')">{{ view.zohoVendorName || '—' }}</el-descriptions-item>
                    <el-descriptions-item :label="$tp('Created by')">{{ view.createdBy || '—' }} · {{ fmtWhen(view.createdAt) }}</el-descriptions-item>
                    <el-descriptions-item :label="$tp('Received')">
                        <template v-if="view.receivedAt">{{ fmtDay(view.receivedAt) }}<span v-if="view.receivedBy"> · {{ view.receivedBy }}</span></template>
                        <span v-else>—</span>
                    </el-descriptions-item>
                    <el-descriptions-item :label="$tp('Note')" :span="2">{{ view.note || '—' }}<span v-if="view.receiveNote"> · {{ $tp('on receipt') }}: {{ view.receiveNote }}</span></el-descriptions-item>
                    <el-descriptions-item :label="$tp('Zoho PO')" :span="3">
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
                <el-table :data="view.lines" size="mini" border max-height="400" class="spb-view-lines">
                    <el-table-column label="#" type="index" width="40" align="center" />
                    <el-table-column :label="$tp('Product')" min-width="260" show-overflow-tooltip>
                        <template slot-scope="s">
                            <div>{{ s.row.productName }}</div>
                            <div class="spb-dim">SKU: {{ s.row.sku || '—' }}<span v-if="s.row.category"> · {{ $tp(s.row.category) }}</span></div>
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
                    <el-table-column v-if="view.status === 'received'" :label="$tp('Received Qty')" width="100" align="center">
                        <template slot-scope="s"><span :class="{ 'spb-warn': s.row.receivedQty !== s.row.shippedQty }">{{ s.row.receivedQty }}</span></template>
                    </el-table-column>
                </el-table>
            </div>
            <span slot="footer">
                <el-button v-if="view && can('spp:batch:manage') && view.status !== 'cancelled'" size="small" icon="el-icon-edit"
                    @click="openEdit(view)">{{ $tp('Edit tracking / note') }}</el-button>
                <el-button size="small" icon="el-icon-printer" @click="print(view)">{{ $tp('Print') }}</el-button>
                <el-button v-if="view && can('spp:order:receive') && view.status === 'shipped'" type="success" size="small"
                    icon="el-icon-circle-check" @click="openReceive(view)">{{ $tp('Receive') }}</el-button>
                <el-button size="small" @click="viewVisible = false">{{ $tp('Close') }}</el-button>
            </span>
        </el-dialog>

        <!-- ── Print preview ────────────────────────────────────────── -->
        <el-dialog :title="$tp('Print preview')" :visible.sync="printVisible" width="860px" append-to-body top="4vh"
            custom-class="spb-print-dlg">
            <iframe ref="printFrame" class="spb-print-frame" :srcdoc="printHtml" title="packing list" />
            <span slot="footer">
                <el-button size="small" @click="printVisible = false">{{ $tp('Close') }}</el-button>
                <el-button type="primary" size="small" icon="el-icon-printer" @click="doPrint">{{ $tp('Print') }}</el-button>
            </span>
        </el-dialog>

        <!-- ── Edit tracking / date / note ──────────────────────────── -->
        <el-dialog :title="$tp('Edit batch')" :visible.sync="editVisible" width="480px" append-to-body>
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
        <el-dialog :visible.sync="receiveVisible" width="760px" append-to-body top="6vh">
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
            <el-table :data="receiveForm.lines" size="mini" border max-height="380">
                <el-table-column :label="$tp('Product')" min-width="260" show-overflow-tooltip>
                    <template slot-scope="s">
                        <div>{{ s.row.productName }}</div>
                        <div class="spb-dim">SKU: {{ s.row.sku || '—' }}</div>
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
import { STATUS_META, BATCH_STATUS, fmtDay, fmtWhen, yuan, dhlLink, zohoPoLink, todayYmd, packingListHtml } from './shared'
// Category names are stored in English (the register's words) and shown
// through $tp, like everything else on the page.

export default {
    name: 'SppBatches',
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
            // create / draft
            createVisible: false,
            createForm: { zohoVendorId: '', tracking: '', shippedAt: todayYmd(), note: '', lines: [] },
            creating: false,
            draftId: null,
            savingDraft: false,
            discarding: false,
            scan: '',
            scanning: false,
            // picker
            pickerVisible: false,
            pickerSearch: '',
            pickerRows: [],
            pickerSelection: [],
            pickerLoading: false,
            // view / edit / receive
            viewVisible: false,
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
        totalAll() {
            return Object.keys(this.byStatus).reduce((t, k) => t + (this.byStatus[k] || 0), 0)
        },
        createTotal() {
            return this.createForm.lines.reduce((t, l) => t + (Number(l.qty) || 0), 0)
        }
    },
    created() {
        this.load().then(() => {
            const q = this.$route.query || {}
            if (q.batch) this.openByNo(String(q.batch))
            else if (q.create) this.openCreate()
        })
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
        clearQuery() {
            if (Object.keys(this.$route.query || {}).length) this.$router.replace({ query: {} }).catch(() => {})
        },
        // ── Create ─────────────────────────────────────────────────
        async openCreate() {
            this.draftId = null
            this.createForm = { zohoVendorId: '', tracking: '', shippedAt: todayYmd(), note: '', lines: [] }
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
                lines: (row.lines || []).map(l => ({
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
                lines: this.createForm.lines.map(l => ({ orderId: l.orderId, qty: l.qty, supplier: l.status === 'pending' ? l.supplier : undefined, unitPrice: l.status === 'pending' ? l.unitPrice : undefined }))
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
            this.createForm.lines.push({
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
                this.$message({ message: `${sku} · ${open.qty} / ${open.orderQty}`, type: 'success', duration: 1200 })
                this.scan = ''
                this.$nextTick(() => { if (this.$refs.scanRef) this.$refs.scanRef.focus() })
                return
            }
            this.scanning = true
            try {
                const r = await lookupOrder(sku, this.createForm.lines.map(l => l.orderId))
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                if (!r.match) {
                    this.$message.warning(r.hadWaiting
                        ? this.$tp('Every waiting order for {sku} is already filled on this batch', { sku })
                        : this.$tp('No waiting order for {sku}', { sku }))
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
        openPicker() {
            this.pickerSearch = ''
            this.pickerSelection = []
            this.pickerVisible = true
            this.loadPicker()
        },
        async loadPicker() {
            this.pickerLoading = true
            try {
                const r = await openLines(this.pickerSearch || undefined)
                const on = new Set(this.createForm.lines.map(l => l.orderId))
                this.pickerRows = ((r && r.rows) || []).filter(o => !on.has(o._id))
            } catch (e) {
                this.pickerRows = []
            } finally {
                this.pickerLoading = false
            }
        },
        addPicked() {
            let n = 0
            for (const o of this.pickerSelection) if (this.addLine(o)) n++
            this.pickerVisible = false
            if (n) this.$message.success(this.$tp('{n} line(s) added', { n }))
        },
        async submitCreate() {
            if (!this.createForm.zohoVendorId) { this.$message.warning(this.$tp('Select the Zoho vendor')); return }
            for (const l of this.createForm.lines) {
                if (!l.qty || l.qty < 1) { this.$message.warning(this.$tp('{sku}: enter the shipped quantity', { sku: l.sku || l.productName })); return }
                if (l.status === 'pending' && !l.supplier) { this.$message.warning(this.$tp('{no}: pick a supplier', { no: l.orderNo })); return }
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
            this.viewVisible = true
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
                if (this.view && this.view._id === this.editRow._id) this.view = { ...this.view, ...this.editForm, shippedAt: this.editForm.shippedAt }
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
.spb-below { margin-top: 10px; }
.spb-print-frame { width: 100%; height: 62vh; border: 1px solid #ebeef5; background: #fff; }
.spb-field-grow { flex: 1; }
.spb-scan { display: flex; gap: 8px; margin-bottom: 10px; .el-input { flex: 1; } }
/* Short while counting: yellow, like a short shipped figure — not an error. */
.spb-short ::v-deep .el-input__inner { color: #e6a23c; border-color: #e6a23c; }
.spb-short-note { font-size: 11px; color: #e6a23c; }
.spb-zpo { line-height: 1.4; white-space: nowrap; }
.spb-draft-tag { cursor: pointer; }
.spb-dlg-sub { margin-left: 8px; font-weight: 400; }
.spb-zpo-inline { margin-right: 12px; }
.spb-qty-full { color: #67c23a; }
.spb-qty-short { color: #e6a23c; }
.spb-footer { display: flex; align-items: center; justify-content: space-between; }
.spb-sum { font-size: 12px; color: #909399; }
.spb-picker-search { margin-bottom: 8px; }
.spb-status { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; white-space: nowrap; }
.spb-desc { margin-bottom: 10px; }
.spb-hint { font-size: 12px; color: #909399; margin-top: 8px; i { margin-right: 3px; } }
</style>
