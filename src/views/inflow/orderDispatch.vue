<template>
    <div class="inflow-dispatch app-container">
        <div class="od-filters">
            <el-input v-model="query.search" size="small" clearable class="f-search"
                placeholder="Search invoice / customer / SKU…" prefix-icon="el-icon-search"
                @keyup.enter.native="reload" @clear="reload" />
            <span class="od-spacer" />
            <span class="od-meta">{{ total.toLocaleString() }} orders</span>
            <el-button size="small" icon="el-icon-upload2" @click="openUpload">Upload List</el-button>
            <el-button size="small" icon="el-icon-refresh" @click="load">Refresh</el-button>
            <el-button size="small" type="primary" icon="el-icon-search" @click="reload">Search</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini" row-key="_id" height="calc(100vh - 210px)">
            <el-table-column prop="invoiceNumber" label="Invoice #" min-width="180">
                <template slot-scope="s">
                    <div class="od-inv">
                        {{ s.row.invoiceNumber }}
                        <el-tag v-if="s.row.recordType === 'manual'" size="mini" type="warning" class="od-manual-tag">Manual</el-tag>
                    </div>
                    <div v-if="s.row.vendor" class="od-vendor" :title="s.row.vendor">{{ s.row.vendor }}</div>
                </template>
            </el-table-column>
            <el-table-column prop="customerName" label="Customer" min-width="170" show-overflow-tooltip>
                <template slot-scope="s">
                    <span v-if="s.row.recordType === 'manual'" class="od-dim">
                        {{ s.row.createdBy ? `Uploaded by ${s.row.createdBy}` : 'Manual upload' }}
                    </span>
                    <template v-else>{{ s.row.customerName || '—' }}</template>
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
                <el-tag v-if="dispatchRecord.recordType === 'manual'" size="mini" type="warning">Manual</el-tag>
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
                </div>

                <!-- Line items with live batch column (display order: scanned
                     line on top, completed lines at the bottom on open) -->
                <el-table ref="linesTable" :data="displayLines" size="mini" border max-height="380" :row-class-name="lineRowClass">
                    <el-table-column label="iMobile SKU" min-width="130">
                        <template slot-scope="li">
                            <b v-if="li.row.imbSku">{{ li.row.imbSku }}</b>
                            <span v-else class="od-dim">— not mapped</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="Barcode" min-width="125" show-overflow-tooltip>
                        <template slot-scope="li">{{ li.row.sku || '—' }}</template>
                    </el-table-column>
                    <el-table-column label="Description" min-width="210" show-overflow-tooltip>
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
                                <template slot-scope="b">#{{ b.row.batchNo }}</template>
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
                Upload an Excel file with <b>Barcode</b>, <b>SKU</b> (iMobile warehouse SKU),
                <b>Description</b> and <b>Quantity</b> columns — all four are required.
                Enter the invoice # manually; the record can be linked to a sales order later.
            </div>
            <el-form label-width="90px" size="small" @submit.native.prevent>
                <el-form-item label="Invoice #" required>
                    <el-input v-model="uploadInvoiceNo" placeholder="e.g. INV-12345" />
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
                    <b>{{ uploadRows.length }}</b> line items<span v-if="uploadSkipped"> · {{ uploadSkipped }} rows skipped (missing SKU or Quantity)</span>
                </div>
                <el-table :data="uploadRows.slice(0, 8)" size="mini" border>
                    <el-table-column prop="sku" label="SKU" width="130" show-overflow-tooltip />
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
                Linking transfers the SKU mapping, dispatched quantities and recorded batches onto the sales
                order's matching line items (matched by barcode) and removes this manual record from the list.
            </div>
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
import { getInflowDispatch, createInflowDispatchBatch, updateInflowDispatchBatch, createInflowDispatchUpload, linkInflowDispatchUpload, deleteInflowDispatchUpload, getInflowOrders } from '@/api/inflow'
import { buildPackingListPdf, packingListFileName } from '@/utils/dispatchPackingListPdf'

export default {
    name: 'InflowOrderDispatch',
    data() {
        return {
            loading: false,
            rows: [],
            total: 0,
            query: { page: 1, pageSize: 25, search: '' },
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
            // Edit-batch dialog
            batchEditVisible: false,
            batchEditNo: null,
            batchEditLines: [],
            batchEditSaving: false,
            // Packing list preview
            packVisible: false,
            packTitle: '',
            packUrl: '',
            packRecord: null,
            packBatch: null,
            // Upload List dialog
            uploadVisible: false,
            uploadInvoiceNo: '',
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
        fulfilledCount() {
            const items = (this.dispatchRecord && this.dispatchRecord.lineItems) || []
            return items.filter(li => this.remainingOf(li) === 0).length
        }
    },
    created() {
        this.load()
    },
    // Page is kept alive — refresh when the user navigates back (new SKU
    // mappings uploaded on the Sales Orders page should show up here).
    activated() {
        this.load()
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await getInflowDispatch(this.query)
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
            this.batchSaving = true
            try {
                const r = await createInflowDispatchBatch(this.dispatchRecord._id, {
                    lines,
                    type: this.dispatchRecord.recordType === 'manual' ? 'manual' : undefined
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.applyUpdatedRecord(r.record)
                this.batchQty = {}
                this.$message.success(`Batch #${r.batch.batchNo} recorded — ${r.batch.units} units`)
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
        // ── Edit a recorded batch ────────────────────────────────────
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
        // ── Packing list ─────────────────────────────────────────────
        openPackingList(record, batch) {
            this.cleanupPack()
            this.packRecord = { invoiceNumber: record.invoiceNumber, customerName: record.customerName, recordType: record.recordType }
            this.packBatch = batch
            const doc = buildPackingListPdf({ record: this.packRecord, batch })
            this.packUrl = doc.output('bloburl') + '#toolbar=0'
            this.packTitle = `Packing List — ${record.invoiceNumber} · Batch #${batch.batchNo}`
            this.packVisible = true
        },
        printPackingList() {
            if (!this.packRecord || !this.packBatch) return
            const doc = buildPackingListPdf({ record: this.packRecord, batch: this.packBatch })
            doc.autoPrint()
            const url = doc.output('bloburl')
            const w = window.open(url)
            if (!w) this.$message.warning('Pop-up blocked — use Download instead.')
        },
        downloadPackingList() {
            if (!this.packRecord || !this.packBatch) return
            const doc = buildPackingListPdf({ record: this.packRecord, batch: this.packBatch })
            doc.save(packingListFileName(this.packRecord, this.packBatch))
        },
        cleanupPack() {
            if (this.packUrl) {
                try { URL.revokeObjectURL(this.packUrl.replace('#toolbar=0', '')) } catch (e) { /* ignore */ }
            }
            this.packUrl = ''
        },
        // ── Upload List — manual dispatch record from an Excel file ──
        openUpload() {
            this.uploadVisible = true
            this.uploadInvoiceNo = ''
            this.uploadFileName = ''
            this.uploadRows = []
            this.uploadSkipped = 0
            if (this.$refs.uploadFile) this.$refs.uploadFile.value = ''
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
                // All four columns are required — name every one that's missing.
                const missing = [
                    !barcodeKey && '"Barcode"',
                    !skuKey && '"SKU"',
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
                    const sku = String(r[skuKey] == null ? '' : r[skuKey]).trim()
                    const quantity = Number(r[qtyKey])
                    if (!sku || !isFinite(quantity) || quantity <= 0) { skipped++; continue }
                    parsed.push({
                        sku,
                        quantity,
                        barcode: barcodeKey ? String(r[barcodeKey] == null ? '' : r[barcodeKey]).trim() : '',
                        description: descKey ? String(r[descKey] == null ? '' : r[descKey]).trim() : ''
                    })
                }
                if (!parsed.length) { this.$message.warning('No usable rows — every row needs a SKU and a positive Quantity.'); return }
                this.uploadRows = parsed
                this.uploadSkipped = skipped
            } catch (err) {
                this.$message.error('Could not read the Excel file.')
            }
        },
        async submitUpload() {
            const invoiceNumber = this.uploadInvoiceNo.trim()
            if (!invoiceNumber || !this.uploadRows.length) return
            this.uploadSaving = true
            try {
                const r = await createInflowDispatchUpload({ invoiceNumber, rows: this.uploadRows })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(`Dispatch record ${invoiceNumber} created — ${r.lines} line items`)
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
                if (r.linesMatched < r.linesTotal) {
                    this.$message.warning(`Linked to ${r.orderInvoiceNumber} — ${r.linesMatched} of ${r.linesTotal} lines matched by barcode; the rest stayed unmapped.`)
                } else {
                    this.$message.success(`Linked to ${r.orderInvoiceNumber} — all ${r.linesTotal} lines matched`)
                }
                this.linkVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to link'))
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
.od-spacer { flex: 1; }
.od-meta { font-size: 12px; color: #909399; margin-right: 6px; white-space: nowrap; }
.od-pager { margin-top: 10px; text-align: right; }
.od-inv { line-height: 1.3; font-weight: 600; }
.od-manual-tag { margin-left: 6px; font-weight: normal; }
.od-vendor { font-size: 11px; color: #909399; line-height: 1.3; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.od-dim { color: #C0C4CC; }
.od-done { color: #67C23A; font-weight: 600; }
.od-del { color: #F56C6C; }
.od-dlg-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; color: #303133; }
.od-dlg-progress { font-size: 12px; font-weight: normal; color: #909399; }
.od-scan-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.od-line-filter { margin-bottom: 8px; }
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
.od-up-input { display: none; }
.od-up-pick { display: flex; align-items: center; gap: 10px; }
.od-up-file { font-size: 12px; color: #303133; }
.od-up-count { font-size: 12px; color: #606266; margin-bottom: 8px; }
.od-up-more { font-size: 12px; color: #909399; margin-top: 6px; }
.od-link-search { display: flex; gap: 8px; margin-bottom: 10px; }
</style>
