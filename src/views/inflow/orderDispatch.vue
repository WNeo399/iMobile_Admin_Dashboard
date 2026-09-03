<template>
    <div class="inflow-dispatch app-container">
        <div class="od-filters">
            <el-input v-model="query.search" size="small" clearable class="f-search"
                placeholder="Search invoice / customer / SKU…" prefix-icon="el-icon-search"
                @keyup.enter.native="reload" @clear="reload" />
            <el-select v-model="query.customer" size="small" clearable filterable
                placeholder="Customer" class="f-customer" @change="reload">
                <el-option v-for="c in customerOptions" :key="c" :label="c" :value="c" />
            </el-select>
            <!-- Defaults to everything still open — dispatched records are
                 finished paperwork and only show when ticked. Empty = all. -->
            <el-select v-model="query.status" size="small" class="f-status" multiple collapse-tags
                placeholder="All statuses" @change="reload">
                <el-option label="Pending" value="pending" />
                <el-option label="Partial" value="partial" />
                <el-option label="Dispatched" value="dispatched" />
            </el-select>
            <span class="od-spacer" />
            <span class="od-meta">{{ total.toLocaleString() }} orders</span>
            <el-button size="small" icon="el-icon-upload2" @click="openUpload">Upload List</el-button>
            <el-button size="small" icon="el-icon-refresh" @click="load">Refresh</el-button>
            <el-button size="small" type="primary" icon="el-icon-search" @click="reload">Search</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini" row-key="_id" height="calc(100vh - 210px)">
            <el-table-column prop="invoiceNumber" label="Order Dispatch" min-width="180">
                <template slot-scope="s">
                    <div class="od-inv">
                        <!-- Opens this record's dispatch dialog. -->
                        <el-link type="primary" :underline="false" class="od-inv-link"
                            @click="openDispatch(s.row)">{{ s.row.invoiceNumber }}</el-link>
                    </div>
                    <div v-if="s.row.vendor" class="od-vendor" :title="s.row.vendor">{{ s.row.vendor }}</div>
                </template>
            </el-table-column>
            <el-table-column prop="customerName" label="Customer" min-width="170" show-overflow-tooltip>
                <template slot-scope="s">
                    <div v-if="s.row.customerName">{{ s.row.customerName }}</div>
                    <!-- The linked sales order — jumps to Sales Orders with
                         that order's detail dialog opened. -->
                    <el-link v-if="s.row.linkedInvoiceNumber && orderIdOf(s.row)" type="primary" :underline="false"
                        class="od-linked" @click="goOrderDetail(s.row)">
                        <i class="el-icon-connection" /> {{ s.row.linkedInvoiceNumber }}
                    </el-link>
                    <div v-else-if="s.row.linkedInvoiceNumber" class="od-linked">
                        <i class="el-icon-connection" /> {{ s.row.linkedInvoiceNumber }}
                    </div>
                    <span v-if="!s.row.customerName && !s.row.linkedInvoiceNumber" class="od-dim">
                        {{ s.row.createdBy ? `Uploaded by ${s.row.createdBy}` : 'Manual upload' }}
                    </span>
                </template>
            </el-table-column>
            <el-table-column label="Date" width="110">
                <template slot-scope="s">{{ dateStr(s.row) }}</template>
            </el-table-column>
            <el-table-column label="Items" width="80" align="right">
                <template slot-scope="s">{{ (s.row.lineItems || []).length }}</template>
            </el-table-column>
            <el-table-column label="Dispatched" width="130" align="center">
                <template slot-scope="s">
                    <span :class="{ 'od-done': s.row.dispatchStatus === 'dispatched' }">
                        {{ s.row.dispatchedQty }} / {{ s.row.orderedQty }} units
                    </span>
                </template>
            </el-table-column>
            <el-table-column label="Batches" width="90" align="center">
                <template slot-scope="s">{{ (s.row.dispatchBatches || []).length || '—' }}</template>
            </el-table-column>
            <el-table-column label="Status" width="105" align="center">
                <template slot-scope="s">
                    <el-tag size="mini" :type="dispatchTag(s.row.dispatchStatus)">{{ dispatchLabel(s.row.dispatchStatus) }}</el-tag>
                </template>
            </el-table-column>
            <el-table-column label="" width="190" align="center">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-box" @click="openDispatch(s.row)">Dispatch</el-button>
                    <template v-if="s.row.recordType === 'manual'">
                        <el-button size="mini" type="text" icon="el-icon-connection" @click="openLink(s.row)">Link</el-button>
                        <el-button size="mini" type="text" icon="el-icon-delete" class="od-del" @click="deleteUpload(s.row)" />
                    </template>
                </template>
            </el-table-column>
        </el-table>

        <div class="od-pager">
            <el-pagination background layout="total, sizes, prev, pager, next, jumper"
                :total="total" :page-size="query.pageSize" :page-sizes="[25, 50, 100, 200]"
                :current-page="query.page" @current-change="onPage" @size-change="onSize" />
        </div>

        <!-- Dispatch dialog — line items, scan-to-batch, batch history -->
        <el-dialog :visible.sync="dispatchVisible" width="920px" top="4vh" @close="resetDispatch">
            <div v-if="dispatchRecord" slot="title" class="od-dlg-title">
                Dispatch — {{ dispatchRecord.invoiceNumber }}
                <el-tag size="mini" :type="dispatchTag(dispatchRecord.dispatchStatus)">{{ dispatchLabel(dispatchRecord.dispatchStatus) }}</el-tag>
                <span class="od-dlg-progress">{{ dispatchRecord.dispatchedQty }} / {{ dispatchRecord.orderedQty }} units dispatched</span>
            </div>
            <div v-if="dispatchRecord" class="od-dlg-body">
                <el-tabs v-model="dispatchTab" @tab-click="onDispatchTab">
                    <el-tab-pane name="dispatch">
                        <span slot="label"><i class="el-icon-box" /> Dispatch</span>
                <!-- Scan-to-batch bar -->
                <div class="od-scan-row">
                    <el-input
                        ref="scanInput"
                        v-model="scanCode"
                        size="small"
                        class="od-scan-input"
                        placeholder="Scan or type an iMobile SKU / barcode, then Enter — each scan adds 1 to the batch"
                        prefix-icon="el-icon-full-screen"
                        clearable
                        @keyup.enter.native="handleScan"
                    />
                    <el-button size="small" @click="handleScan">Add</el-button>
                    <span class="od-spacer" />
                    <span v-if="batchUnits" class="od-batch-units">This batch: <b>{{ batchUnits }}</b> unit{{ batchUnits === 1 ? '' : 's' }}</span>
                    <el-button
                        size="small"
                        icon="el-icon-magic-stick"
                        :loading="batchSaving"
                        :disabled="!totalRemaining"
                        @click="autoFulfill"
                    >Fulfill Order</el-button>
                    <el-button
                        type="primary"
                        size="small"
                        icon="el-icon-finished"
                        :loading="batchSaving"
                        :disabled="!batchUnits"
                        @click="recordBatch"
                    >Record Batch + Packing List</el-button>
                </div>

                <!-- Remaining / fulfilled filter -->
                <div class="od-line-filter">
                    <el-radio-group v-model="lineFilter" size="mini">
                        <el-radio-button label="all">All ({{ (dispatchRecord.lineItems || []).length }})</el-radio-button>
                        <el-radio-button label="remaining">Remaining ({{ remainingCount }})</el-radio-button>
                        <el-radio-button label="fulfilled">Fulfilled ({{ fulfilledCount }})</el-radio-button>
                    </el-radio-group>
                    <span class="od-spacer" />
                    <el-button size="mini" icon="el-icon-printer" :disabled="!remainingCount"
                        @click="openRemainingList">Print Remaining</el-button>
                </div>

                <!-- Line items with live batch column (display order: scanned
                     line on top, completed lines at the bottom on open) -->
                <el-table ref="linesTable" :data="displayLines" size="mini" border max-height="380" :row-class-name="lineRowClass">
                    <el-table-column label="iMobile SKU" min-width="150">
                        <template slot-scope="li">
                            <!--
                                Same inline editor as the SKU Mapping page:
                                search a Zoho product and pick it to map the
                                barcode (saves to the global SKU Mapping list,
                                so every other order learns it too), or type a
                                raw SKU and confirm with Enter / ✓. Manual-
                                upload lines carry their SKU from the uploaded
                                file and aren't map-driven.
                            -->
                            <div v-if="canMapLine(li.row)" class="od-sku-cell">
                                <el-autocomplete
                                    :value="skuDraft(li.row)"
                                    size="mini"
                                    value-key="sku"
                                    :fetch-suggestions="fetchSkuSuggestions"
                                    :debounce="400"
                                    :trigger-on-focus="false"
                                    popper-class="od-sku-suggestions"
                                    :placeholder="li.row.imbSku ? '' : 'Search product / SKU…'"
                                    :class="{ 'od-sku-pending': !skuDraft(li.row) }"
                                    :disabled="savingLineIdx === li.row.__idx"
                                    @input="v => setSkuDraft(li.row.__idx, v)"
                                    @select="item => onLineSkuPicked(li.row, item)"
                                    @keyup.enter.native="saveLineSku(li.row.__idx)"
                                >
                                    <template slot-scope="{ item }">
                                        <div class="sku-suggestion" :title="item.name">
                                            <img v-if="item.imgUrl" :src="item.imgUrl" class="sku-suggestion-img" @error="onSuggestionImgError($event)" />
                                            <div v-else class="sku-suggestion-img sku-suggestion-img-placeholder"><i class="el-icon-picture-outline" /></div>
                                            <div class="sku-suggestion-info">
                                                <div class="sku-suggestion-name">{{ item.name }}</div>
                                                <div class="sku-suggestion-sku">{{ item.sku || 'no SKU' }}</div>
                                            </div>
                                        </div>
                                    </template>
                                </el-autocomplete>
                                <el-button
                                    v-if="lineSkuDirty(li.row)"
                                    size="mini"
                                    type="text"
                                    icon="el-icon-check"
                                    class="od-sku-save"
                                    :loading="savingLineIdx === li.row.__idx"
                                    @click="saveLineSku(li.row.__idx)"
                                />
                            </div>
                            <template v-else>
                                <b v-if="li.row.imbSku">{{ li.row.imbSku }}</b>
                                <span v-else class="od-dim">— not mapped</span>
                            </template>
                        </template>
                    </el-table-column>
                    <el-table-column label="Barcode" min-width="100" show-overflow-tooltip>
                        <template slot-scope="li">{{ li.row.sku || '—' }}</template>
                    </el-table-column>
                    <el-table-column label="Description" min-width="285" show-overflow-tooltip>
                        <template slot-scope="li">{{ li.row.description || '—' }}</template>
                    </el-table-column>
                    <el-table-column label="Ordered" width="76" align="right">
                        <template slot-scope="li">{{ li.row.quantity }}</template>
                    </el-table-column>
                    <el-table-column label="Dispatched" width="100" align="right">
                        <template slot-scope="li">
                            <span :class="{ 'od-done': lineDone(li.row) }">{{ Number(li.row.dispatchedQty) || 0 }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="Remaining" width="90" align="right">
                        <template slot-scope="li">
                            <span :class="{ 'od-dim': remainingOf(li.row) === 0 }">{{ remainingOf(li.row) }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="This Batch" width="130" align="center">
                        <template slot-scope="li">
                            <el-input-number
                                v-if="batchQty[li.row.__idx]"
                                :value="batchQty[li.row.__idx]"
                                :min="0" :max="remainingOf(li.row)"
                                size="mini" class="od-batch-qty"
                                @change="v => setBatchQty(li.row.__idx, v)" />
                            <el-button
                                v-else-if="remainingOf(li.row) > 0"
                                size="mini" type="text" icon="el-icon-plus"
                                @click="setBatchQty(li.row.__idx, 1)"
                            >Add</el-button>
                            <span v-else class="od-dim">—</span>
                        </template>
                    </el-table-column>
                </el-table>
                    </el-tab-pane>

                    <el-tab-pane name="batches">
                        <span slot="label">
                            <i class="el-icon-printer" /> Recorded Batches
                            <span v-if="(dispatchRecord.dispatchBatches || []).length" class="od-tab-count">({{ dispatchRecord.dispatchBatches.length }})</span>
                        </span>
                        <el-table :data="dispatchRecord.dispatchBatches || []" size="mini" border
                            empty-text="No batches recorded yet — scan items on the Dispatch tab.">
                            <el-table-column label="Batch" width="70" align="center">
                                <template slot-scope="b">
                                    <el-link type="primary" :underline="false" @click="openBatchDetail(b.row)">#{{ b.row.batchNo }}</el-link>
                                </template>
                            </el-table-column>
                            <el-table-column label="Date" min-width="150">
                                <template slot-scope="b">{{ dateTimeStr(b.row.at) }}</template>
                            </el-table-column>
                            <el-table-column label="By" min-width="110" show-overflow-tooltip>
                                <template slot-scope="b">{{ b.row.by || '—' }}</template>
                            </el-table-column>
                            <el-table-column label="Lines" width="70" align="right">
                                <template slot-scope="b">{{ (b.row.lines || []).length }}</template>
                            </el-table-column>
                            <el-table-column label="Units" width="70" align="right">
                                <template slot-scope="b">{{ b.row.units }}</template>
                            </el-table-column>
                            <!-- Tracking is usually known only after the label
                                 is printed, so it stays editable here. -->
                            <el-table-column label="Tracking #" min-width="180">
                                <template slot-scope="b">
                                    <div class="od-track-cell">
                                        <el-input
                                            :value="trackingDraft(b.row)"
                                            size="mini"
                                            placeholder="Add tracking #"
                                            :disabled="savingTrackingNo === b.row.batchNo"
                                            @input="v => setTrackingDraft(b.row.batchNo, v)"
                                            @keyup.enter.native="saveTracking(b.row)"
                                        />
                                        <el-button
                                            v-if="trackingDirty(b.row)"
                                            size="mini" type="text" icon="el-icon-check"
                                            class="od-track-save"
                                            :loading="savingTrackingNo === b.row.batchNo"
                                            @click="saveTracking(b.row)"
                                        />
                                    </div>
                                </template>
                            </el-table-column>
                            <!-- Zoho stock write-off created when the batch
                                 was recorded. -->
                            <el-table-column label="Stock Adj." width="120" align="center">
                                <template slot-scope="b">
                                    <el-tag v-if="b.row.inventoryAdjustmentId" size="mini" type="success" effect="plain"
                                        :title="'Zoho inventory adjustment ' + b.row.inventoryAdjustmentId">Deducted</el-tag>
                                    <el-tag v-else-if="b.row.inventoryAdjustmentError" size="mini" type="danger" effect="plain"
                                        :title="b.row.inventoryAdjustmentError">Failed</el-tag>
                                    <span v-else class="od-dim">—</span>
                                </template>
                            </el-table-column>
                            <el-table-column label="" width="190" align="center">
                                <template slot-scope="b">
                                    <el-button size="mini" type="text" icon="el-icon-printer" @click="openPackingList(dispatchRecord, b.row)">Packing List</el-button>
                                    <el-button size="mini" type="text" icon="el-icon-edit" @click="openBatchEdit(b.row)">Edit</el-button>
                                </template>
                            </el-table-column>
                        </el-table>
                    </el-tab-pane>
                </el-tabs>
            </div>
            <span slot="footer">
                <el-button size="small" @click="dispatchVisible = false">Close</el-button>
            </span>
        </el-dialog>

        <!-- Batch detail — the items scanned into one recorded batch, with a
             per-item label action. -->
        <el-dialog :title="'Batch #' + (batchDetailBatch ? batchDetailBatch.batchNo : '')"
            :visible.sync="batchDetailVisible" width="760px" append-to-body>
            <template v-if="batchDetailBatch">
                <div class="od-bd-meta">
                    <b>{{ (batchDetailBatch.lines || []).length }}</b> item{{ (batchDetailBatch.lines || []).length === 1 ? '' : 's' }}
                    · <b>{{ batchDetailBatch.units }}</b> unit{{ batchDetailBatch.units === 1 ? '' : 's' }}
                    · {{ dateTimeStr(batchDetailBatch.at) }}
                    <template v-if="batchDetailBatch.by"> · by {{ batchDetailBatch.by }}</template>
                    <template v-if="batchDetailBatch.trackingNo"> · tracking {{ batchDetailBatch.trackingNo }}</template>
                    <template v-if="dispatchRecord && dispatchRecord.faultyCodePrefix"> · faulty prefix <b>{{ dispatchRecord.faultyCodePrefix }}</b></template>
                </div>
                <el-table :data="batchDetailBatch.lines || []" size="mini" border stripe max-height="380">
                    <el-table-column type="index" width="46" align="center" />
                    <el-table-column label="iMobile SKU" min-width="130">
                        <template slot-scope="l"><b>{{ l.row.imbSku || '—' }}</b></template>
                    </el-table-column>
                    <el-table-column label="Barcode" width="130" show-overflow-tooltip>
                        <template slot-scope="l">{{ l.row.sku || '—' }}</template>
                    </el-table-column>
                    <el-table-column label="Description" min-width="210" show-overflow-tooltip>
                        <template slot-scope="l">{{ l.row.description || '—' }}</template>
                    </el-table-column>
                    <el-table-column label="Qty" width="60" align="right">
                        <template slot-scope="l">{{ l.row.qty }}</template>
                    </el-table-column>
                    <el-table-column label="Action" width="110" align="center">
                        <template slot-scope="l">
                            <el-button size="mini" type="text" icon="el-icon-printer"
                                :disabled="!String(l.row.sku || '').trim()"
                                :title="String(l.row.sku || '').trim() ? '' : 'No barcode on this line'"
                                @click="printItemLabel(batchDetailBatch, l.row)">Print Label</el-button>
                        </template>
                    </el-table-column>
                </el-table>
            </template>
            <span slot="footer">
                <el-button size="small" @click="batchDetailVisible = false">Close</el-button>
                <el-button type="primary" size="small" icon="el-icon-printer"
                    :disabled="!batchDetailLabelCount"
                    @click="printAllLabels">Print All Labels ({{ batchDetailLabelCount }})</el-button>
            </span>
        </el-dialog>

        <!-- Edit a recorded batch -->
        <el-dialog :title="'Edit Batch #' + (batchEditNo || '')" :visible.sync="batchEditVisible" width="780px" append-to-body>
            <div class="od-up-hint">
                Adjust the quantities picked in this batch — line totals update by the difference.
                Setting a line to 0 removes it; a batch with every line at 0 is deleted.
                Dispatched / Remaining update live as you change the batch qty.
            </div>
            <el-table :data="batchEditLines" size="mini" border>
                <el-table-column label="iMobile SKU" min-width="120">
                    <template slot-scope="l"><b>{{ l.row.imbSku || '—' }}</b></template>
                </el-table-column>
                <el-table-column label="Description" min-width="190" show-overflow-tooltip>
                    <template slot-scope="l">{{ l.row.description || '—' }}</template>
                </el-table-column>
                <el-table-column label="Ordered" width="76" align="right">
                    <template slot-scope="l">{{ l.row.ordered }}</template>
                </el-table-column>
                <el-table-column label="Dispatched" width="94" align="right">
                    <template slot-scope="l">{{ batchEditDispatched(l.row) }}</template>
                </el-table-column>
                <el-table-column label="Remaining" width="90" align="right">
                    <template slot-scope="l">
                        <span :class="{ 'od-dim': batchEditRemaining(l.row) === 0 }">{{ batchEditRemaining(l.row) }}</span>
                    </template>
                </el-table-column>
                <el-table-column label="This Batch" width="150" align="center">
                    <template slot-scope="l">
                        <el-input-number v-model="l.row.qty" :min="0" :max="l.row.maxQty" size="mini" class="od-batch-qty" />
                    </template>
                </el-table-column>
            </el-table>
            <span slot="footer">
                <el-button size="small" @click="batchEditVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" :loading="batchEditSaving" @click="saveBatchEdit">Save</el-button>
            </span>
        </el-dialog>

        <!-- Packing list preview -->
        <el-dialog :title="packTitle" :visible.sync="packVisible" width="60%" top="5vh" @close="cleanupPack">
            <div class="od-pack-wrap">
                <iframe v-if="packUrl" :src="packUrl" class="od-pack-frame" title="Packing list" />
            </div>
            <span slot="footer">
                <el-button size="small" icon="el-icon-printer" @click="printPackingList">Print</el-button>
                <el-button size="small" icon="el-icon-download" @click="downloadPackingList">Download</el-button>
                <el-button size="small" @click="packVisible = false">Close</el-button>
            </span>
        </el-dialog>

        <!-- Upload List — create a manual dispatch record from an Excel file -->
        <el-dialog title="Upload Dispatch List" :visible.sync="uploadVisible" width="600px">
            <div class="od-up-hint">
                Upload an Excel file with <b>Description</b> and <b>Quantity</b> columns.
                <b>SKU</b> (iMobile warehouse SKU) and <b>Barcode</b> are optional —
                lines without a barcode can't be scanned, only recorded by hand.
            </div>
            <el-form label-width="100px" size="small" class="od-up-form" @submit.native.prevent>
                <el-form-item label="Sales Order">
                    <el-select v-model="uploadOrderId" filterable remote clearable
                        :remote-method="searchUploadOrders" :loading="uploadOrderLoading"
                        placeholder="Optional — search a sales order to link this record to" style="width:100%"
                        @change="onUploadOrderPicked">
                        <el-option v-for="o in uploadOrderOptions" :key="o._id" :value="o._id"
                            :label="o.invoiceNumber + (o.customerName ? ' — ' + o.customerName : '')" />
                    </el-select>
                </el-form-item>
                <el-form-item label="Customer">
                    <el-select v-model="uploadCustomer" filterable clearable
                        placeholder="Optional — link a customer (auto-set when a sales order is picked)" style="width:100%">
                        <el-option v-for="c in customerOptions" :key="c" :label="c" :value="c" />
                    </el-select>
                </el-form-item>
                <!-- Oscar Mobile's faulty-item labels need a return-code
                     prefix (SS-<prefix>-<barcode>) — required for Oscar. -->
                <el-form-item v-if="isOscarName(uploadCustomer)" label="Faulty Prefix" required>
                    <el-input v-model="uploadFaultyPrefix"
                        placeholder="e.g. 310826 — return codes print as SS-<prefix>-<barcode>" />
                </el-form-item>
                <el-form-item label="Title" required>
                    <el-input v-model="uploadInvoiceNo" placeholder="e.g. INV-12345 or PO110960" />
                </el-form-item>
                <el-form-item label="File">
                    <input ref="uploadFile" type="file" accept=".xlsx,.xls,.csv" class="od-up-input" @change="onUploadFile" />
                    <div class="od-up-pick">
                        <el-button size="small" icon="el-icon-folder-opened" @click="$refs.uploadFile.click()">Choose File</el-button>
                        <span class="od-up-file" :class="{ 'od-dim': !uploadFileName }">{{ uploadFileName || 'No file selected' }}</span>
                    </div>
                </el-form-item>
            </el-form>
            <template v-if="uploadRows.length">
                <div class="od-up-count">
                    <b>{{ uploadRows.length }}</b> line items<template v-if="uploadPendingCount"> · <b>{{ uploadPendingCount }}</b> without SKU (map later)</template><span v-if="uploadSkipped"> · {{ uploadSkipped }} rows skipped</span>
                </div>
                <el-table :data="uploadRows.slice(0, 8)" size="mini" border>
                    <el-table-column label="SKU" width="130" show-overflow-tooltip>
                        <template slot-scope="s">
                            <template v-if="s.row.sku">{{ s.row.sku }}</template>
                            <el-tag v-else size="mini" type="warning">Pending</el-tag>
                        </template>
                    </el-table-column>
                    <el-table-column prop="description" label="Description" min-width="200" show-overflow-tooltip />
                    <el-table-column prop="quantity" label="Qty" width="70" align="right" />
                </el-table>
                <div v-if="uploadRows.length > 8" class="od-up-more">…and {{ uploadRows.length - 8 }} more</div>
            </template>
            <span slot="footer">
                <el-button size="small" @click="uploadVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" :loading="uploadSaving"
                    :disabled="!uploadRows.length || !uploadInvoiceNo.trim()"
                    @click="submitUpload">Create Record</el-button>
            </span>
        </el-dialog>

        <!-- Link a manual record to a real sales order -->
        <el-dialog :title="'Link to Sales Order — ' + (linkRecord ? linkRecord.invoiceNumber : '')"
            :visible.sync="linkVisible" width="680px">
            <div class="od-up-hint">
                Links are just relationships — the record stays here and the warehouse keeps dispatching
                from it. Linking a <b>customer</b> lets that customer's portal login follow the dispatch
                status (useful before the invoice exists); linking a <b>sales order</b> also adopts that
                order's customer.
            </div>
            <div class="od-link-customer">
                <span class="od-link-label">Customer</span>
                <el-select :value="linkRecord ? linkRecord.customerName : ''" filterable clearable
                    size="small" style="flex:1" placeholder="No customer linked — pick one"
                    :loading="customerSaving" :disabled="customerSaving"
                    @change="setCustomer">
                    <el-option v-for="c in customerOptions" :key="c" :label="c" :value="c" />
                </el-select>
            </div>
            <el-alert v-if="linkRecord && linkRecord.linkedInvoiceNumber" type="info" :closable="false" show-icon class="od-link-current">
                <template slot="title">
                    Currently linked to <b>{{ linkRecord.linkedInvoiceNumber }}</b>
                    <el-button type="text" size="mini" class="od-unlink-btn" :loading="linkSavingId === 'unlink'" @click="doUnlink">Unlink</el-button>
                </template>
            </el-alert>
            <div class="od-link-search">
                <el-input v-model="linkSearch" size="small" clearable placeholder="Search sales orders by invoice # / customer…"
                    prefix-icon="el-icon-search" @keyup.enter.native="searchLinkOrders" />
                <el-button size="small" type="primary" :loading="linkLoading" @click="searchLinkOrders">Search</el-button>
            </div>
            <el-table v-loading="linkLoading" :data="linkResults" size="mini" border empty-text="No matching sales orders">
                <el-table-column prop="invoiceNumber" label="Invoice #" min-width="160" show-overflow-tooltip />
                <el-table-column prop="customerName" label="Customer" min-width="150" show-overflow-tooltip>
                    <template slot-scope="s">{{ s.row.customerName || '—' }}</template>
                </el-table-column>
                <el-table-column label="Date" width="100">
                    <template slot-scope="s">{{ dateStr(s.row) }}</template>
                </el-table-column>
                <el-table-column label="Items" width="70" align="right">
                    <template slot-scope="s">{{ s.row.lineItemCount == null ? '—' : s.row.lineItemCount }}</template>
                </el-table-column>
                <el-table-column label="" width="90" align="center">
                    <template slot-scope="s">
                        <el-button size="mini" type="primary" plain :loading="linkSavingId === s.row._id"
                            @click="doLink(s.row)">Link</el-button>
                    </template>
                </el-table-column>
            </el-table>
            <span slot="footer">
                <el-button size="small" @click="linkVisible = false">Close</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import { getInflowDispatch, createInflowDispatchBatch, updateInflowDispatchBatch, createInflowDispatchUpload, linkInflowDispatchUpload, setInflowDispatchCustomer, deleteInflowDispatchUpload, getInflowOrders, getInflowFilters, saveInflowSkuMapping, setInflowDispatchLineSku } from '@/api/inflow'
import { searchProducts } from '@/api/zoho/products/product'
import { buildPackingListPdf, packingListFileName, buildRemainingListPdf, remainingListFileName } from '@/utils/dispatchPackingListPdf'
import { buildItemLabelPdf, itemLabelFileName, buildBatchLabelsPdf, batchLabelsFileName, batchLabelCount, isOscarCustomer, buildOscarItemLabelsPdf, buildOscarBatchLabelsPdf } from '@/utils/dispatchItemLabelPdf'

export default {
    name: 'InflowOrderDispatch',
    data() {
        return {
            loading: false,
            rows: [],
            total: 0,
            query: { page: 1, pageSize: 25, search: '', customer: '', status: ['pending', 'partial'] },
            // Dispatch dialog + scan-to-batch state. batchQty maps
            // lineIndex → qty for the batch being built.
            dispatchVisible: false,
            dispatchRecord: null,
            // Display order of the dialog's line rows, as ORIGINAL lineItems
            // indexes. Seeded on open (completed lines sink to the bottom)
            // and re-shuffled on scan (the scanned line jumps to the top).
            // All batch/API operations stay keyed by the original index.
            lineOrder: [],
            dispatchTab: 'dispatch',
            // Line list filter: all | remaining (still units to pick) |
            // fulfilled (fully dispatched). Based on RECORDED quantities —
            // a line stays under Remaining until its batch is recorded.
            lineFilter: 'all',
            scanCode: '',
            batchQty: {},
            batchSaving: false,
            // Per-batch tracking-number drafts, edited on the Recorded
            // Batches tab (the number is only known once the courier label
            // exists, i.e. after the batch is recorded).
            trackingDrafts: {},
            savingTrackingNo: null,
            // Inline SKU mapping drafts (same editor as the SKU Mapping
            // page), keyed by ORIGINAL line index. Kept outside the
            // computed displayLines copies so typing survives re-renders.
            skuDrafts: {},
            savingLineIdx: null,
            // Edit-batch dialog
            // Batch detail dialog — the clicked batch row (read-only view).
            batchDetailVisible: false,
            batchDetailBatch: null,
            batchEditVisible: false,
            batchEditNo: null,
            batchEditLines: [],
            batchEditSaving: false,
            // PDF preview (packing list / remaining items). packBuild is a
            // closure that rebuilds the current document — print and
            // download rerun it, so one dialog serves both kinds.
            packVisible: false,
            packTitle: '',
            packUrl: '',
            packBuild: null,
            packFileName: '',
            // InFlow customer names, for the customer link pickers.
            customerOptions: [],
            customerSaving: false,
            // Upload List dialog
            uploadVisible: false,
            uploadInvoiceNo: '',
            uploadCustomer: '',
            // Oscar Mobile return-code prefix (SS-<prefix>-<barcode>).
            uploadFaultyPrefix: '',
            uploadOrderId: '',
            uploadOrderOptions: [],
            uploadOrderLoading: false,
            uploadFileName: '',
            uploadRows: [],
            uploadSkipped: 0,
            uploadSaving: false,
            // Link dialog
            linkVisible: false,
            linkRecord: null,
            linkSearch: '',
            linkResults: [],
            linkLoading: false,
            linkSavingId: null
        }
    },
    computed: {
        uploadPendingCount() {
            return this.uploadRows.filter(r => !r.sku).length
        },
        // Labels "Print All" would produce for the open batch: one per unit,
        // barcode-less lines excluded.
        batchDetailLabelCount() {
            return batchLabelCount(this.batchDetailBatch)
        },
        batchUnits() {
            return Object.values(this.batchQty).reduce((s, q) => s + (Number(q) || 0), 0)
        },
        // The dialog's rows in display order. Each row is a copy of its
        // line item carrying __idx (the original lineItems index) so the
        // batch map and the API keep pointing at the right line no matter
        // how the rows are rearranged.
        displayLines() {
            const items = (this.dispatchRecord && this.dispatchRecord.lineItems) || []
            return this.lineOrder
                .filter(i => items[i])
                .filter(i => {
                    if (this.lineFilter === 'remaining') return this.remainingOf(items[i]) > 0
                    if (this.lineFilter === 'fulfilled') return this.remainingOf(items[i]) === 0
                    return true
                })
                .map(i => Object.assign({ __idx: i }, items[i]))
        },
        remainingCount() {
            const items = (this.dispatchRecord && this.dispatchRecord.lineItems) || []
            return items.filter(li => this.remainingOf(li) > 0).length
        },
        // Units still to dispatch across the whole record — drives Auto Fulfill.
        totalRemaining() {
            const items = (this.dispatchRecord && this.dispatchRecord.lineItems) || []
            return items.reduce((s, li) => s + this.remainingOf(li), 0)
        },
        fulfilledCount() {
            const items = (this.dispatchRecord && this.dispatchRecord.lineItems) || []
            return items.filter(li => this.remainingOf(li) === 0).length
        }
    },
    created() {
        this.applyRouteSearch()
        this.load()
        this.loadCustomers()
    },
    // Page is kept alive — refresh when the user navigates back, applying
    // any search handed over via the route (e.g. an Owing Stocks chip).
    activated() {
        this.applyRouteSearch()
        this.load()
    },
    methods: {
        // Owing Stocks (and other pages) can deep-link here with ?search=…
        // Applied once, then stripped from the URL so clearing the box
        // doesn't get overridden on the next keep-alive activation.
        applyRouteSearch() {
            const s = this.$route.query && this.$route.query.search
            if (s) {
                this.query.search = String(s)
                this.query.page = 1
                this.$router.replace({ query: {} })
            }
        },
        async load() {
            this.loading = true
            try {
                // The status ticks travel as a comma list.
                const r = await getInflowDispatch({ ...this.query, status: (this.query.status || []).join(',') })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.rows || []
                this.total = r.total || 0
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load dispatch orders'))
            } finally {
                this.loading = false
            }
        },
        reload() { this.query.page = 1; this.load() },
        onPage(p) { this.query.page = p; this.load() },
        onSize(s) { this.query.pageSize = s; this.query.page = 1; this.load() },
        lineDone(li) { return Number(li.dispatchedQty) >= (Number(li.quantity) || 0) && Number(li.quantity) > 0 },
        // The sales-order id behind a row: the row itself for order records,
        // the linked order for manual records (null when unlinked).
        orderIdOf(row) {
            if (!row) return null
            if (row.recordType === 'manual') return row.linkedOrderId || null
            return row._id
        },
        goOrderDetail(row) {
            const id = this.orderIdOf(row)
            if (!id) return
            this.$router.push({ path: '/inflow/salesOrders', query: { open: String(id) } })
        },
        remainingOf(li) {
            return Math.max(0, (Number(li.quantity) || 0) - (Number(li.dispatchedQty) || 0))
        },
        // ── Dispatch dialog + scan-to-batch ──────────────────────────
        openDispatch(row) {
            this.dispatchRecord = row
            this.lineOrder = this.sortedLineOrder(row.lineItems || [])
            this.dispatchTab = 'dispatch'
            this.lineFilter = 'all'
            this.batchQty = {}
            this.trackingDrafts = {}
            this.savingTrackingNo = null
            this.skuDrafts = {}
            this.savingLineIdx = null
            this.scanCode = ''
            this.dispatchVisible = true
            this.$nextTick(() => {
                this.$refs.scanInput && this.$refs.scanInput.focus()
            })
        },
        // Coming back to the Dispatch tab puts the cursor straight back in
        // the scan box so the scanner keeps working without a click.
        onDispatchTab() {
            if (this.dispatchTab === 'dispatch') {
                this.$nextTick(() => {
                    this.$refs.scanInput && this.$refs.scanInput.focus()
                })
            }
        },
        // Open-time ordering: still-to-pick lines first (original order),
        // fully dispatched lines at the bottom.
        sortedLineOrder(items) {
            const open = []
            const done = []
            items.forEach((li, i) => (this.lineDone(li) ? done : open).push(i))
            return open.concat(done)
        },
        resetDispatch() {
            this.dispatchRecord = null
            this.lineOrder = []
            this.batchQty = {}
            this.trackingDrafts = {}
            this.savingTrackingNo = null
            this.skuDrafts = {}
            this.savingLineIdx = null
            this.scanCode = ''
        },
        // Row background reflects dispatch progress: green = fulfilled,
        // yellow = partially dispatched, none = untouched. Rows in the
        // current (unrecorded) batch get a blue left-edge marker on top.
        lineRowClass({ row }) {
            const cls = []
            if (Number(row.quantity) > 0 && this.remainingOf(row) === 0) cls.push('od-line-full')
            else if (Number(row.dispatchedQty) > 0) cls.push('od-line-partial')
            if (this.batchQty[row.__idx]) cls.push('od-line-in-batch')
            return cls.join(' ')
        },
        // One scan = +1 on the matching line. Matches the iMobile SKU
        // (case-insensitive) or the barcode; duplicate-SKU lines fill up
        // in order — the first line with room left takes the unit.
        handleScan() {
            const code = this.scanCode.trim()
            if (!code) return
            const items = (this.dispatchRecord && this.dispatchRecord.lineItems) || []
            const lower = code.toLowerCase()
            const matches = []
            items.forEach((li, idx) => {
                if (!li) return
                const bySku = li.imbSku && String(li.imbSku).toLowerCase() === lower
                const byBarcode = li.sku && String(li.sku) === code
                if (bySku || byBarcode) matches.push(idx)
            })
            if (!matches.length) {
                this.$message.error(`No line item matches "${code}"`)
                this.scanCode = ''
                return
            }
            const idx = matches.find(i => {
                const li = items[i]
                return this.remainingOf(li) - (Number(this.batchQty[i]) || 0) > 0
            })
            if (idx === undefined) {
                this.$message.warning(`"${code}" is already fully dispatched (including this batch).`)
                this.scanCode = ''
                return
            }
            this.$set(this.batchQty, idx, (Number(this.batchQty[idx]) || 0) + 1)
            // Bring the scanned line to the top of the list (and scroll
            // there) so the picker always sees what they just scanned.
            this.lineOrder = [idx, ...this.lineOrder.filter(i => i !== idx)]
            this.$nextTick(() => {
                const t = this.$refs.linesTable
                if (t && t.bodyWrapper) t.bodyWrapper.scrollTop = 0
            })
            this.scanCode = ''
        },
        setBatchQty(idx, v) {
            const li = (this.dispatchRecord && this.dispatchRecord.lineItems || [])[idx]
            if (!li) return
            const qty = Math.min(Math.max(0, Number(v) || 0), this.remainingOf(li))
            if (qty <= 0) {
                this.$delete(this.batchQty, idx)
            } else {
                this.$set(this.batchQty, idx, qty)
            }
        },
        async recordBatch() {
            if (!this.dispatchRecord || !this.batchUnits) return
            const lines = Object.keys(this.batchQty)
                .map(k => ({ lineIndex: Number(k), qty: Number(this.batchQty[k]) }))
                .filter(l => l.qty > 0)
            await this.submitBatchLines(lines)
        },
        // Auto Fulfill — one batch covering every line's remaining units,
        // so the record completes with a normal batch entry + packing list.
        autoFulfill() {
            if (!this.dispatchRecord) return
            const items = this.dispatchRecord.lineItems || []
            const lines = []
            items.forEach((li, idx) => {
                const rem = this.remainingOf(li)
                if (rem > 0) lines.push({ lineIndex: idx, qty: rem })
            })
            if (!lines.length) return
            const units = lines.reduce((s, l) => s + l.qty, 0)
            this.$confirm(
                `Dispatch ALL remaining stock — ${units} unit${units === 1 ? '' : 's'} across ${lines.length} line${lines.length === 1 ? '' : 's'}? This records a batch and generates its packing list.`,
                'Fulfill Order',
                { type: 'warning', confirmButtonText: 'Fulfill', cancelButtonText: 'Cancel' }
            ).then(() => this.submitBatchLines(lines, { autoFulfill: true })).catch(() => {})
        },
        async submitBatchLines(lines, { autoFulfill = false } = {}) {
            if (!this.dispatchRecord || !lines.length) return
            this.batchSaving = true
            try {
                const r = await createInflowDispatchBatch(this.dispatchRecord._id, {
                    lines,
                    type: this.dispatchRecord.recordType === 'manual' ? 'manual' : undefined,
                    // Auto Fulfill also prunes PENDING SKU-map entries for
                    // barcodes this record never needed mapped.
                    autoFulfill: autoFulfill || undefined
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.applyUpdatedRecord(r.record)
                this.batchQty = {}
                const bits = [`Batch #${r.batch.batchNo} recorded — ${r.batch.units} units`]
                if (r.mappingsRemoved) bits.push(`${r.mappingsRemoved} pending SKU mapping${r.mappingsRemoved === 1 ? '' : 's'} removed`)
                const adj = r.adjustment || {}
                if (adj.id) bits.push('stock deducted in Zoho')
                this.$message.success(bits.join(' · '))
                // Stock deduction is best-effort — surface a failure clearly
                // rather than letting it pass as a clean batch.
                if (adj.error) {
                    this.$message.warning(`Batch saved, but the Zoho stock deduction failed: ${adj.error}`)
                } else if (adj.skipped) {
                    this.$message.warning(`Batch saved, but no stock was deducted — ${adj.message}`)
                } else if (adj.id && (adj.notFound || []).length) {
                    this.$message.warning(`Stock deducted, except these SKUs weren't found in Zoho: ${adj.notFound.join(', ')}`)
                }
                this.openPackingList(this.dispatchRecord, r.batch)
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to record batch'))
            } finally {
                this.batchSaving = false
            }
        },
        // Merge the server's post-batch document back into the live row so
        // the dialog AND the list behind it update without a reload.
        applyUpdatedRecord(updated) {
            if (!updated || !this.dispatchRecord) return
            this.$set(this.dispatchRecord, 'lineItems', updated.lineItems || [])
            this.$set(this.dispatchRecord, 'dispatchBatches', updated.dispatchBatches || [])
            // Line count never changes on a batch save, but if it ever did
            // the display order must not point at ghost indexes.
            if (this.lineOrder.length !== (updated.lineItems || []).length) {
                this.lineOrder = this.sortedLineOrder(updated.lineItems || [])
            }
            const items = this.dispatchRecord.lineItems || []
            const ordered = items.reduce((s, li) => s + (Number(li.quantity) || 0), 0)
            const dispatched = items.reduce((s, li) => s + (Number(li.dispatchedQty) || 0), 0)
            this.$set(this.dispatchRecord, 'orderedQty', ordered)
            this.$set(this.dispatchRecord, 'dispatchedQty', dispatched)
            this.$set(this.dispatchRecord, 'dispatchStatus', dispatched <= 0 ? 'pending' : dispatched < ordered ? 'partial' : 'dispatched')
        },
        // ── Inline SKU editing in the dispatch dialog ────────────────
        // Any line can take a SKU here. With a barcode the save goes into
        // the global SKU Mapping list AND stamps matching lines on dispatch
        // records (never on sales orders); without one there's nothing to
        // hang a mapping on, so the SKU lands on this line only.
        canMapLine(li) {
            return !!li
        },
        skuDraft(row) {
            const d = this.skuDrafts[row.__idx]
            return d !== undefined ? d : (row.imbSku || '')
        },
        setSkuDraft(idx, v) {
            this.$set(this.skuDrafts, idx, v)
        },
        lineSkuDirty(row) {
            const d = this.skuDrafts[row.__idx]
            if (d === undefined) return false
            const t = String(d).trim()
            return !!t && t !== String(row.imbSku || '')
        },
        onLineSkuPicked(row, item) {
            if (!item || !item.sku) {
                this.$message.warning(`"${(item && item.name) || 'This product'}" has no SKU in Zoho — add one there first.`)
                this.$set(this.skuDrafts, row.__idx, row.imbSku || '')
                return
            }
            this.$set(this.skuDrafts, row.__idx, item.sku)
            this.saveLineSku(row.__idx)
        },
        async saveLineSku(idx) {
            const items = (this.dispatchRecord && this.dispatchRecord.lineItems) || []
            const line = items[idx]
            if (!line || this.savingLineIdx != null) return
            const draft = this.skuDrafts[idx]
            const sku = String(draft !== undefined ? draft : line.imbSku || '').trim()
            if (!sku || sku === String(line.imbSku || '')) return
            const barcode = line.sku
            this.savingLineIdx = idx
            try {
                if (!barcode) {
                    // No barcode → nothing to map globally. The SKU lands on
                    // this one line and SKU Mapping is left alone.
                    const r = await setInflowDispatchLineSku(this.dispatchRecord._id, { lineIndex: idx, sku })
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    this.$set(line, 'imbSku', sku)
                    this.$delete(this.skuDrafts, idx)
                    this.$message.success('SKU saved on this line')
                    return
                }
                const r = await saveInflowSkuMapping({
                    barcode,
                    sku,
                    description: line.description || ''
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                // The retro-apply already stamped this order in Mongo —
                // mirror it on every line of the open record with this
                // barcode so the dialog (and scan matching) update live.
                items.forEach((li, i) => {
                    if (li && li.sku === barcode) {
                        this.$set(li, 'imbSku', sku)
                        this.$delete(this.skuDrafts, i)
                    }
                })
                this.$message.success('Mapped — SKU Mapping updated')
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to save mapping'))
            } finally {
                this.savingLineIdx = null
            }
        },
        async fetchSkuSuggestions(query, cb) {
            const q = (query || '').trim()
            if (!q) { cb([]); return }
            try {
                const res = await searchProducts(q)
                if (!res || !res.success) { cb([]); return }
                const products = Array.isArray(res.data) ? res.data : []
                cb(products.map(p => ({
                    name: p.name || p.product_name || p.title || '',
                    sku: p.sku
                        || (Array.isArray(p.skus) && p.skus[0] && p.skus[0].sku)
                        || (p.variants && p.variants[0] && p.variants[0].sku)
                        || '',
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
        // ── Tracking number on a recorded batch ──────────────────────
        trackingDraft(batch) {
            const d = this.trackingDrafts[batch.batchNo]
            return d !== undefined ? d : (batch.tracking || '')
        },
        setTrackingDraft(batchNo, v) {
            this.$set(this.trackingDrafts, batchNo, v)
        },
        trackingDirty(batch) {
            const d = this.trackingDrafts[batch.batchNo]
            return d !== undefined && String(d).trim() !== String(batch.tracking || '')
        },
        async saveTracking(batch) {
            if (!this.dispatchRecord || !this.trackingDirty(batch)) return
            const tracking = String(this.trackingDrafts[batch.batchNo] || '').trim()
            this.savingTrackingNo = batch.batchNo
            try {
                const r = await updateInflowDispatchBatch(this.dispatchRecord._id, batch.batchNo, {
                    tracking,
                    type: this.dispatchRecord.recordType === 'manual' ? 'manual' : undefined
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.applyUpdatedRecord(r.record)
                this.$delete(this.trackingDrafts, batch.batchNo)
                this.$message.success(tracking ? `Tracking saved for batch #${batch.batchNo}` : 'Tracking cleared')
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to save tracking number'))
            } finally {
                this.savingTrackingNo = null
            }
        },
        // ── Edit a recorded batch ────────────────────────────────────
        openBatchDetail(batch) {
            this.batchDetailBatch = batch
            this.batchDetailVisible = true
        },
        // One label per UNIT across the whole batch (qty 5 → 5 copies);
        // barcode-less lines aren't printable and are left out.
        printAllLabels() {
            const batch = this.batchDetailBatch
            if (!batch || !this.batchDetailLabelCount) return
            const skipped = (batch.lines || []).filter(l => !String(l.sku || '').trim()).length
            if (skipped) {
                this.$message.warning(`${skipped} line${skipped === 1 ? ' has' : 's have'} no barcode and won't print.`)
            }
            const rec = this.dispatchRecord || {}
            // Oscar Mobile: a PAIR per unit (item label + supplier card),
            // pairs kept together so the bench applies both to each part.
            if (this.isOscarName(rec.customerName)) {
                if (this.oscarPrefixMissing()) return
                this.showPdf(
                    () => buildOscarBatchLabelsPdf({ record: rec, batch }),
                    batchLabelsFileName(rec, batch),
                    `Labels — ${rec.invoiceNumber} · Batch #${batch.batchNo} (${this.batchDetailLabelCount} pairs)`
                )
                return
            }
            this.showPdf(
                () => buildBatchLabelsPdf({ record: rec, batch }),
                batchLabelsFileName(rec, batch),
                `Labels — ${rec.invoiceNumber} · Batch #${batch.batchNo} (${this.batchDetailLabelCount} labels)`
            )
        },
        // Per-item 50×40mm label: description on top, Code 128 of the item
        // barcode, PO number + dispatched date in the footer. Uses the same
        // PDF preview dialog as the packing list.
        printItemLabel(batch, line) {
            if (!String(line.sku || '').trim()) {
                this.$message.warning('This line has no barcode to print.')
                return
            }
            const rec = this.dispatchRecord || {}
            // Oscar Mobile gets the 100×50mm pair: item label + Supplier
            // Item Card with the SS-<prefix>-<barcode> return code.
            if (this.isOscarName(rec.customerName)) {
                if (this.oscarPrefixMissing()) return
                this.showPdf(
                    () => buildOscarItemLabelsPdf({ record: rec, line }),
                    itemLabelFileName(rec, line),
                    `Labels — ${line.sku} · item + supplier card`
                )
                return
            }
            this.showPdf(
                () => buildItemLabelPdf({ record: rec, batch, line }),
                itemLabelFileName(rec, line),
                `Label — ${line.sku} · Batch #${batch.batchNo}`
            )
        },
        isOscarName(name) {
            return isOscarCustomer(name)
        },
        // Oscar records can't print labels without the return-code prefix.
        // Returns true when printing must stop.
        oscarPrefixMissing() {
            const rec = this.dispatchRecord || {}
            if (!this.isOscarName(rec.customerName)) return false
            if (String(rec.faultyCodePrefix || '').trim()) return false
            this.$message.warning('This Oscar Mobile record has no faulty-code prefix — re-pick the customer in the Link dialog to add one.')
            return true
        },
        openBatchEdit(batch) {
            const items = (this.dispatchRecord && this.dispatchRecord.lineItems) || []
            this.batchEditNo = batch.batchNo
            this.batchEditLines = (batch.lines || []).map(l => {
                const li = items[l.lineIndex]
                // Cap = ordered qty minus what OTHER batches/corrections have
                // dispatched on this line (i.e. this batch can grow into
                // whatever the line still has free, plus its own share).
                const maxQty = li && Number(li.quantity) > 0
                    ? Math.max(0, Number(li.quantity) - ((Number(li.dispatchedQty) || 0) - (Number(l.qty) || 0)))
                    : 9999
                return {
                    lineIndex: l.lineIndex,
                    imbSku: l.imbSku,
                    sku: l.sku,
                    description: l.description,
                    qty: Number(l.qty) || 0,
                    maxQty,
                    ordered: li ? Number(li.quantity) || 0 : 0,
                    // What every OTHER batch/correction has dispatched on this
                    // line — the live Dispatched/Remaining columns add the
                    // in-dialog qty on top of this.
                    otherQty: li ? Math.max(0, (Number(li.dispatchedQty) || 0) - (Number(l.qty) || 0)) : 0
                }
            })
            this.batchEditVisible = true
        },
        // Live projections for the edit dialog: what the line's dispatched /
        // remaining totals become if the current edit is saved.
        batchEditDispatched(row) {
            return row.otherQty + (Number(row.qty) || 0)
        },
        batchEditRemaining(row) {
            return Math.max(0, row.ordered - this.batchEditDispatched(row))
        },
        async saveBatchEdit() {
            if (!this.dispatchRecord || this.batchEditNo == null) return
            const lines = this.batchEditLines.map(l => ({ lineIndex: l.lineIndex, qty: Number(l.qty) || 0 }))
            this.batchEditSaving = true
            try {
                const r = await updateInflowDispatchBatch(this.dispatchRecord._id, this.batchEditNo, {
                    lines,
                    type: this.dispatchRecord.recordType === 'manual' ? 'manual' : undefined
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.applyUpdatedRecord(r.record)
                this.$message.success(r.removed ? `Batch #${this.batchEditNo} removed` : `Batch #${this.batchEditNo} updated`)
                this.batchEditVisible = false
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to update batch'))
            } finally {
                this.batchEditSaving = false
            }
        },
        // ── PDF preview (packing list / remaining items) ─────────────
        openPackingList(record, batch) {
            const rec = { invoiceNumber: record.invoiceNumber, customerName: record.customerName, recordType: record.recordType }
            this.showPdf(
                () => buildPackingListPdf({ record: rec, batch }),
                packingListFileName(rec, batch),
                `Packing List — ${record.invoiceNumber} · Batch #${batch.batchNo}`
            )
        },
        // Everything still to dispatch on the open record, for the bench.
        openRemainingList() {
            const record = this.dispatchRecord
            if (!record) return
            const lines = (record.lineItems || [])
                .map(li => {
                    const ordered = Number(li.quantity) || 0
                    const dispatched = Math.min(Number(li.dispatchedQty) || 0, ordered)
                    return {
                        imbSku: li.imbSku || '',
                        sku: li.sku || '',
                        description: li.description || '',
                        ordered,
                        dispatched,
                        remaining: ordered - dispatched
                    }
                })
                .filter(l => l.remaining > 0)
            if (!lines.length) { this.$message.info('Nothing remaining — every line is fulfilled.'); return }
            const rec = { invoiceNumber: record.invoiceNumber, customerName: record.customerName }
            this.showPdf(
                () => buildRemainingListPdf({ record: rec, lines }),
                remainingListFileName(rec),
                `Remaining Items — ${record.invoiceNumber}`
            )
        },
        showPdf(build, fileName, title) {
            this.cleanupPack()
            this.packBuild = build
            this.packFileName = fileName
            this.packUrl = build().output('bloburl') + '#toolbar=0'
            this.packTitle = title
            this.packVisible = true
        },
        printPackingList() {
            if (!this.packBuild) return
            const doc = this.packBuild()
            doc.autoPrint()
            const url = doc.output('bloburl')
            const w = window.open(url)
            if (!w) this.$message.warning('Pop-up blocked — use Download instead.')
        },
        downloadPackingList() {
            if (!this.packBuild) return
            this.packBuild().save(this.packFileName)
        },
        cleanupPack() {
            if (this.packUrl) {
                try { URL.revokeObjectURL(this.packUrl.replace('#toolbar=0', '')) } catch (e) { /* ignore */ }
            }
            this.packUrl = ''
        },
        // ── Upload List — manual dispatch record from an Excel file ──
        async loadCustomers() {
            try {
                const r = await getInflowFilters()
                if (r && r.success !== false) this.customerOptions = r.customers || []
            } catch (e) { /* non-fatal — pickers just stay empty */ }
        },
        openUpload() {
            this.uploadVisible = true
            this.uploadInvoiceNo = ''
            this.uploadCustomer = ''
            this.uploadFaultyPrefix = ''
            this.uploadOrderId = ''
            this.uploadOrderOptions = []
            this.uploadFileName = ''
            this.uploadRows = []
            this.uploadSkipped = 0
            if (this.$refs.uploadFile) this.$refs.uploadFile.value = ''
            // Seed the optional order picker with the most recent orders.
            this.searchUploadOrders('')
        },
        async searchUploadOrders(q) {
            this.uploadOrderLoading = true
            try {
                const r = await getInflowOrders({ page: 1, pageSize: 10, search: String(q || '').trim() })
                if (r && r.success !== false) this.uploadOrderOptions = r.rows || []
            } catch (e) { /* non-fatal — picker just stays empty */ }
            finally { this.uploadOrderLoading = false }
        },
        // Picking an order auto-fills the invoice # with its order number
        // and selects the order's customer (both still editable). Clearing
        // the pick leaves the fields untouched.
        onUploadOrderPicked(orderId) {
            if (!orderId) return
            const o = this.uploadOrderOptions.find(x => x._id === orderId)
            if (!o) return
            if (o.invoiceNumber) this.uploadInvoiceNo = o.invoiceNumber
            if (o.customerName) this.uploadCustomer = o.customerName
        },
        async onUploadFile(e) {
            const file = e.target.files && e.target.files[0]
            if (!file) return
            this.uploadFileName = file.name
            this.uploadRows = []
            this.uploadSkipped = 0
            try {
                const XLSX = await import('xlsx')
                const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
                const sheet = wb.Sheets[wb.SheetNames[0]]
                const rows = sheet ? XLSX.utils.sheet_to_json(sheet, { defval: '' }) : []
                if (!rows.length) { this.$message.warning('The file has no data rows.'); return }
                const headers = Object.keys(rows[0])
                const key = (name) => headers.find(h => String(h).trim().toLowerCase() === name)
                const barcodeKey = key('barcode')
                const skuKey = key('sku')
                const descKey = key('description')
                const qtyKey = key('quantity')
                // Only Description and Quantity columns are required — SKU
                // and Barcode are both fully optional. Rows without them
                // import as description-only lines (recordable by hand, not
                // scannable). Name every required column that's missing.
                const missing = [
                    !descKey && '"Description"',
                    !qtyKey && '"Quantity"'
                ].filter(Boolean)
                if (missing.length) {
                    this.$message.warning(`The file is missing the ${missing.join(', ')} column${missing.length > 1 ? 's' : ''}.`)
                    return
                }
                const parsed = []
                let skipped = 0
                for (const r of rows) {
                    // SKU cells can be numbers or carry stray whitespace /
                    // newlines in real files — normalise hard.
                    const sku = skuKey ? String(r[skuKey] == null ? '' : r[skuKey]).trim() : ''
                    const barcode = barcodeKey ? String(r[barcodeKey] == null ? '' : r[barcodeKey]).trim() : ''
                    const description = String(r[descKey] == null ? '' : r[descKey]).trim()
                    const quantity = Number(r[qtyKey])
                    if ((!sku && !barcode && !description) || !isFinite(quantity) || quantity <= 0) { skipped++; continue }
                    parsed.push({ sku, quantity, barcode, description })
                }
                if (!parsed.length) { this.$message.warning('No usable rows — every row needs a positive Quantity and a SKU, Barcode or Description.'); return }
                this.uploadRows = parsed
                this.uploadSkipped = skipped
            } catch (err) {
                this.$message.error('Could not read the Excel file.')
            }
        },
        async submitUpload() {
            const invoiceNumber = this.uploadInvoiceNo.trim()
            if (!invoiceNumber || !this.uploadRows.length) return
            if (this.isOscarName(this.uploadCustomer) && !this.uploadFaultyPrefix.trim()) {
                this.$message.warning('Oscar Mobile needs a faulty-code prefix — return codes print as SS-<prefix>-<barcode>.')
                return
            }
            this.uploadSaving = true
            try {
                const r = await createInflowDispatchUpload({
                    invoiceNumber,
                    rows: this.uploadRows,
                    orderId: this.uploadOrderId || undefined,
                    customerName: this.uploadCustomer || undefined,
                    faultyCodePrefix: this.uploadFaultyPrefix.trim() || undefined
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                const bits = [`Dispatch record ${invoiceNumber} created — ${r.lines} line items`]
                if (r.mappingsSaved) bits.push(`${r.mappingsSaved} SKU mapping${r.mappingsSaved === 1 ? '' : 's'} saved`)
                if (r.unmappedLines) bits.push(`${r.unmappedLines} line${r.unmappedLines === 1 ? '' : 's'} to map`)
                if (r.linkedInvoiceNumber) bits.push(`linked to ${r.linkedInvoiceNumber}`)
                if (r.customerName) bits.push(`customer ${r.customerName}`)
                this.$message.success(bits.join(', '))
                this.uploadVisible = false
                this.reload()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to create dispatch record'))
            } finally {
                this.uploadSaving = false
            }
        },
        // ── Link a manual record to a real sales order ────────────────
        openLink(row) {
            this.linkRecord = row
            this.linkSearch = row.invoiceNumber || ''
            this.linkResults = []
            this.linkVisible = true
            this.searchLinkOrders()
        },
        async searchLinkOrders() {
            this.linkLoading = true
            try {
                const r = await getInflowOrders({ page: 1, pageSize: 10, search: this.linkSearch.trim() })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.linkResults = r.rows || []
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to search sales orders'))
            } finally {
                this.linkLoading = false
            }
        },
        async doLink(order) {
            if (!this.linkRecord) return
            this.linkSavingId = order._id
            try {
                const r = await linkInflowDispatchUpload(this.linkRecord._id, { orderId: order._id })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(`Linked to ${r.orderInvoiceNumber}`)
                // Reflect the relationship on the live row — no reload needed.
                // The order's customer is adopted server-side; mirror it here.
                this.$set(this.linkRecord, 'linkedOrderId', order._id)
                this.$set(this.linkRecord, 'linkedInvoiceNumber', r.orderInvoiceNumber)
                this.$set(this.linkRecord, 'customerName', r.customerName || null)
                this.linkVisible = false
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to link'))
            } finally {
                this.linkSavingId = null
            }
        },
        // Customer link (select in the link dialog) — saves on change;
        // clearing the select unlinks the customer.
        async setCustomer(name) {
            if (!this.linkRecord) return
            // Picking Oscar Mobile needs the return-code prefix too (labels
            // print SS-<prefix>-<barcode>); ask for it when missing.
            const extra = {}
            if (this.isOscarName(name) && !String(this.linkRecord.faultyCodePrefix || '').trim()) {
                try {
                    const { value } = await this.$prompt(
                        'Oscar Mobile labels print a return code SS-<prefix>-<barcode>. Enter the prefix for this record.',
                        'Faulty code prefix',
                        { inputPlaceholder: 'e.g. 310826', inputPattern: /\S/, inputErrorMessage: 'Prefix is required' }
                    )
                    extra.faultyCodePrefix = String(value).trim()
                } catch (e) {
                    return // cancelled — leave the customer unchanged
                }
            }
            this.customerSaving = true
            try {
                const r = await setInflowDispatchCustomer(this.linkRecord._id, { customerName: name || null, ...extra })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$set(this.linkRecord, 'customerName', r.customerName)
                if (extra.faultyCodePrefix) this.$set(this.linkRecord, 'faultyCodePrefix', extra.faultyCodePrefix)
                this.$message.success(r.customerName ? `Customer set to ${r.customerName}` : 'Customer unlinked')
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to link customer'))
            } finally {
                this.customerSaving = false
            }
        },
        async doUnlink() {
            if (!this.linkRecord) return
            this.linkSavingId = 'unlink'
            try {
                const r = await linkInflowDispatchUpload(this.linkRecord._id, { orderId: null })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success('Unlinked')
                this.$set(this.linkRecord, 'linkedOrderId', null)
                this.$set(this.linkRecord, 'linkedInvoiceNumber', null)
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to unlink'))
            } finally {
                this.linkSavingId = null
            }
        },
        deleteUpload(row) {
            this.$confirm(`Delete the manual dispatch record "${row.invoiceNumber}"?`, 'Delete record', {
                type: 'warning', confirmButtonText: 'Delete', cancelButtonText: 'Cancel'
            }).then(async () => {
                try {
                    const r = await deleteInflowDispatchUpload(row._id)
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    this.$message.success('Record deleted')
                    this.load()
                } catch (e) {
                    this.$message.error(this.msg(e, 'Failed to delete record'))
                }
            }).catch(() => {})
        },
        dispatchTag(s) { return { pending: 'danger', partial: 'warning', dispatched: 'success' }[s] || 'info' },
        dispatchLabel(s) { return { pending: 'Pending', partial: 'Partial', dispatched: 'Dispatched' }[s] || s },
        dateStr(o) {
            if (o && o.invoiceDateRaw) return o.invoiceDateRaw
            if (o && o.invoiceDate) { const d = new Date(o.invoiceDate); if (!isNaN(d)) return d.toLocaleDateString('en-AU') }
            return '—'
        },
        dateTimeStr(v) {
            if (!v) return '—'
            const d = new Date(v)
            return isNaN(d) ? '—' : d.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        },
        msg(e, fallback) { return (e.response && e.response.data && e.response.data.message) || e.message || fallback }
    }
}
</script>

<style lang="scss" scoped>
.inflow-dispatch { padding: 12px 16px; }
.od-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.f-search { width: 260px; }
.f-customer { width: 200px; }
.f-status { width: 210px; }
.od-spacer { flex: 1; }
.od-meta { font-size: 12px; color: #909399; margin-right: 6px; white-space: nowrap; }
.od-pager { margin-top: 10px; text-align: right; }
.od-inv { line-height: 1.3; font-weight: 600; }
.od-inv-link { font-weight: 600; font-size: inherit; }
.od-vendor { font-size: 11px; color: #909399; line-height: 1.3; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.od-dim { color: #C0C4CC; }
.od-done { color: #67C23A; font-weight: 600; }
.od-del { color: #F56C6C; }
.od-dlg-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; color: #303133; }
.od-dlg-progress { font-size: 12px; font-weight: normal; color: #909399; }
.od-scan-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.od-line-filter { display: flex; align-items: center; margin-bottom: 8px; }
.od-scan-input { flex: 1; max-width: 460px; }
.od-batch-units { font-size: 13px; color: #606266; margin-right: 4px; white-space: nowrap; }
.od-batch-qty { width: 110px; }
.od-tab-count { color: #909399; font-weight: normal; }
.od-dlg-body ::v-deep .od-line-full td { background: #f0f9eb; }
.od-dlg-body ::v-deep .od-line-partial td { background: #fdf6ec; }
.od-dlg-body ::v-deep .od-line-in-batch td:first-child { box-shadow: inset 3px 0 0 #409EFF; }
.od-pack-wrap { height: 70vh; background: #f2f3f5; }
.od-pack-frame { width: 100%; height: 100%; border: none; display: block; }
.od-up-hint { font-size: 13px; color: #606266; line-height: 1.6; margin-bottom: 12px; }
.od-up-form ::v-deep .el-form-item__label { white-space: nowrap; }
.od-up-input { display: none; }
// Batch detail dialog header line.
.od-bd-meta { font-size: 13px; color: #606266; margin-bottom: 10px; b { color: #303133; } }
.od-up-pick { display: flex; align-items: center; gap: 10px; }
.od-up-file { font-size: 12px; color: #303133; }
.od-up-count { font-size: 12px; color: #606266; margin-bottom: 8px; }
.od-up-more { font-size: 12px; color: #909399; margin-top: 6px; }
.od-link-search { display: flex; gap: 8px; margin-bottom: 10px; }
.od-track-cell { display: flex; align-items: center; gap: 4px; }
.od-track-cell .el-input { flex: 1; }
.od-track-save { color: #67C23A; padding: 0 2px; font-size: 15px; }
.od-sku-cell { display: flex; align-items: center; gap: 6px; }
.od-sku-cell .el-autocomplete { flex: 1; }
.od-sku-pending ::v-deep .el-input__inner { border-color: #E6A23C; }
.od-sku-save { color: #67C23A; padding: 0 2px; font-size: 16px; }
.od-linked { color: #409EFF; font-size: 12px; }
.od-link-current { margin-bottom: 10px; }
.od-link-customer { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.od-link-label { font-size: 13px; color: #606266; white-space: nowrap; }
.od-unlink-btn { margin-left: 10px; padding: 0; color: #F56C6C; }
</style>

<style>
/* Zoho product suggestion popup for the Map Barcode dialog — unscoped
   because Element UI teleports the dropdown outside the component root. */
.od-sku-suggestions { min-width: 480px !important; width: auto !important; }
.od-sku-suggestions li { line-height: normal !important; padding: 6px 14px !important; }
.od-sku-suggestions .sku-suggestion { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
.od-sku-suggestions .sku-suggestion-img {
    width: 32px; height: 32px; object-fit: cover; border-radius: 4px;
    flex-shrink: 0; background: #f5f7fa;
}
.od-sku-suggestions .sku-suggestion-img-placeholder {
    display: flex; align-items: center; justify-content: center;
    color: #c0c4cc; font-size: 14px;
}
.od-sku-suggestions .sku-suggestion-info { min-width: 0; line-height: 1.4; }
.od-sku-suggestions .sku-suggestion-name {
    font-weight: 500; font-size: 13px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.od-sku-suggestions .sku-suggestion-sku { color: #909399; font-size: 12px; }
</style>
