<template>
    <div class="app-container tree-sidebar-manage-wrap credit-note-page">
        <!--
            Left: shared TreePanel — same component the SQT Cases /
            Repair / Users pages use, so the look + collapse/resize
            behaviour stays consistent. One root + three status leaves.
        -->
        <tree-panel
            title="Status"
            title-icon-class="el-icon-s-flag"
            :tree-data="treeData"
            :default-expand-all="true"
            :show-search="false"
            storage-key="credit-note-status-sidebar-width"
            @node-click="handleStatusClick"
        >
            <template #node="{ data }">
                <span class="status-node">
                    <i
                        :class="data.id === 'all' ? 'el-icon-files' : 'el-icon-collection-tag'"
                        class="status-node-icon"
                        :style="{ color: statusColor(data.id) }"
                    />
                    <span class="status-node-label" :title="data.label">{{ data.label }}</span>
                    <el-badge
                        v-if="data.count !== undefined"
                        :value="data.count"
                        :max="999"
                        :type="data.id === 'all' ? 'primary' : badgeType(data.id)"
                        class="status-node-badge"
                    />
                </span>
            </template>
        </tree-panel>

        <div class="tree-sidebar-content">
            <div class="content-inner">
                <!-- Search row -->
                <div class="filter-bar">
                    <el-input
                        v-model="queryParams.search"
                        placeholder="Search by credit no…"
                        clearable
                        size="small"
                        prefix-icon="el-icon-search"
                        class="filter-search"
                        @keyup.enter.native="handleQuery"
                        @clear="handleQuery"
                    />
                    <el-button size="small" type="primary" icon="el-icon-search" @click="handleQuery">
                        Search
                    </el-button>
                    <el-button
                        size="small"
                        icon="el-icon-refresh"
                        :loading="loading"
                        @click="getList"
                    >Refresh</el-button>

                    <span class="filter-spacer" />
                    <span class="filter-summary">
                        <strong>{{ total }}</strong>
                        {{ total === 1 ? 'credit note' : 'credit notes' }}
                        <span v-if="currentStatusLabel" class="filter-summary-scope">
                            · {{ currentStatusLabel }}
                        </span>
                    </span>
                </div>

                <el-table
                    v-loading="loading"
                    :data="list"
                    stripe
                    size="small"
                    class="credit-table"
                    row-key="_id"
                >
                    <el-table-column label="Credit No" min-width="160">
                        <template slot-scope="scope">
                            <span v-if="scope.row.creditNo" class="credit-no">
                                {{ scope.row.creditNo }}
                            </span>
                            <span v-else class="muted">—</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="Items" prop="itemCount" width="90" align="center">
                        <template slot-scope="scope">
                            {{ scope.row.itemCount || 0 }}
                        </template>
                    </el-table-column>
                    <el-table-column label="Status" min-width="120">
                        <template slot-scope="scope">
                            <el-tag
                                :type="badgeType(scope.row.status)"
                                size="mini"
                                effect="plain"
                            >{{ statusLabel(scope.row.status) }}</el-tag>
                        </template>
                    </el-table-column>
                    <el-table-column label="Submitted" min-width="170">
                        <template slot-scope="scope">
                            {{ formatDate(scope.row.createdAt) || '—' }}
                        </template>
                    </el-table-column>
                    <el-table-column label="OCR Processed" min-width="170">
                        <template slot-scope="scope">
                            {{ formatDate(scope.row.ocrProcessedAt) || '—' }}
                        </template>
                    </el-table-column>
                    <el-table-column label="Attachment" width="120" align="center">
                        <template slot-scope="scope">
                            <a
                                v-if="scope.row.s3Key"
                                :href="s3Url(scope.row.s3Key)"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="attachment-link"
                                :title="scope.row.s3Key"
                            >
                                <i class="el-icon-paperclip" />
                                Open
                            </a>
                            <span v-else class="muted">—</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="Action" width="110" align="center">
                        <template slot-scope="scope">
                            <!-- Review is only meaningful once OCR has
                                 extracted line items + we have the
                                 archived PDF in S3. Queued rows have
                                 neither; completed rows could be added
                                 here later if we want to allow re-review. -->
                            <el-button
                                v-if="scope.row.status === 'processed'"
                                size="mini"
                                type="text"
                                icon="el-icon-view"
                                @click="openReview(scope.row)"
                            >Review</el-button>
                            <span v-else class="muted">—</span>
                        </template>
                    </el-table-column>
                </el-table>

                <pagination
                    v-show="total > 0"
                    :total="total"
                    :page.sync="queryParams.page"
                    :limit.sync="queryParams.pageSize"
                    @pagination="getList"
                />
            </div>
        </div>

        <!--
            Review dialog — two-pane layout: line items on the left so
            the user can scan SKU/quantity at a glance, PDF on the right
            so they can cross-check against the original handwriting.
            Wide (1100px) and tall (70vh) so the PDF iframe isn't cramped;
            falls back to viewport-relative sizing on smaller screens.
        -->
        <el-dialog
            :title="reviewTitle"
            :visible.sync="reviewOpen"
            width="1300px"
            top="6vh"
            append-to-body
            :close-on-click-modal="false"
            custom-class="credit-review-dialog"
            @close="onReviewClose"
        >
            <div v-if="reviewRow" class="review-shell">
                <section class="review-left">
                    <!--
                        Three-tab switcher across Line Items, Repair
                        Devices, and Return Devices. Counts in each tab
                        label come live from the underlying arrays so
                        the user can see the breakdown at a glance and
                        find empty buckets without clicking through.
                    -->
                    <el-tabs v-model="activeTab" class="review-tabs">
                        <el-tab-pane name="items">
                            <span slot="label">
                                <i class="el-icon-tickets" />
                                Line Items
                                <span class="review-tab-count">({{ reviewItems.length }})</span>
                                <span v-if="matchesLoading" class="review-tab-loading">
                                    <i class="el-icon-loading" />
                                </span>
                            </span>
                            <el-alert
                                v-if="matchesError"
                                :title="matchesError"
                                type="error"
                                show-icon
                                :closable="false"
                                class="review-pane-alert"
                            />
                            <el-table
                        :data="reviewItems"
                        size="small"
                        stripe
                        empty-text="No line items extracted"
                        class="review-items-table"
                    >
                        <!--
                            Zoho Item column: OCR SKU on top as context,
                            picker below for the user to confirm / change
                            the Zoho item this row maps to.
                        -->
                        <el-table-column label="Zoho Item" min-width="320">
                            <template slot-scope="scope">
                                <div class="zoho-item-cell">
                                    <div class="zoho-item-sku">
                                        <span class="zoho-item-sku-label">SKU</span>
                                        <span class="zoho-item-sku-value">
                                            {{ scope.row.sku || '—' }}
                                        </span>
                                    </div>
                                    <div class="zoho-item-pick">
                                        <span
                                            v-if="matchesLoading && !matchesBySku[scope.row.sku]"
                                            class="match-loading"
                                        >
                                            <i class="el-icon-loading" /> Loading matches…
                                        </span>
                                        <span
                                            v-else-if="!matchOptions(scope.row.sku).length"
                                            class="muted"
                                        >No matches</span>
                                        <el-select
                                            v-else
                                            :value="selections[scope.row.sku] || ''"
                                            placeholder="Pick a match"
                                            size="small"
                                            filterable
                                            clearable
                                            class="match-select"
                                            popper-class="match-select-popper"
                                            @change="onSelectionChange(scope.row.sku, $event)"
                                        >
                                            <el-option
                                                v-for="m in matchOptions(scope.row.sku)"
                                                :key="m.itemId"
                                                :value="m.itemId"
                                                :label="m.name"
                                            >
                                                <div class="match-option">
                                                    <div class="match-option-name">{{ m.name }}</div>
                                                    <div class="match-option-sku">{{ m.sku }}</div>
                                                </div>
                                            </el-option>
                                        </el-select>
                                    </div>
                                </div>
                            </template>
                        </el-table-column>
                        <!--
                            Quantity column: editable. el-input-number is
                            controlled (:value + @change → $set into the
                            quantities array) so Vue 2's array-index
                            reactivity behaves. Hidden spacer above the
                            input matches the SKU label row on the left
                            so the input bottom-aligns with the el-select
                            on the same row.
                        -->
                        <el-table-column label="Quantity" width="120" align="center">
                            <template slot-scope="scope">
                                <div class="qty-cell">
                                    <div class="qty-cell-spacer" aria-hidden="true" />
                                    <el-input-number
                                        :value="getQuantity(scope.$index)"
                                        :min="0"
                                        :max="9999"
                                        size="small"
                                        controls-position="right"
                                        class="qty-input"
                                        @change="(val) => setQuantity(scope.$index, val)"
                                    />
                                </div>
                            </template>
                        </el-table-column>
                    </el-table>
                        </el-tab-pane>

                        <!--
                            Repair Devices tab — R9999 in the OCR
                            payload. Each row maps to a fixed Zoho
                            catalogue item-id with model as the line
                            item's description.
                        -->
                        <el-tab-pane name="repair">
                            <span slot="label">
                                <i class="el-icon-set-up" />
                                Repair Devices
                                <span class="review-tab-count">({{ editedRepairDevices.length }})</span>
                            </span>
                            <div class="device-tab-head">
                                <span class="device-section-sku">R9999</span>
                                <span class="device-section-spacer" />
                                <el-button
                                    size="mini"
                                    type="text"
                                    icon="el-icon-plus"
                                    @click="addRepairDevice"
                                >Add</el-button>
                            </div>
                            <div v-if="editedRepairDevices.length === 0" class="device-empty">
                                No repair devices.
                            </div>
                            <div v-else class="device-rows">
                                <div
                                    v-for="(d, idx) in editedRepairDevices"
                                    :key="`rep-${idx}`"
                                    class="device-row"
                                >
                                    <el-input
                                        v-model="d.model"
                                        size="small"
                                        placeholder="Model"
                                        class="device-model"
                                    />
                                    <el-input-number
                                        :value="d.quantity"
                                        :min="0"
                                        :max="9999"
                                        size="small"
                                        controls-position="right"
                                        class="device-qty"
                                        @change="(val) => setRepairDeviceQty(idx, val)"
                                    />
                                    <el-button
                                        size="mini"
                                        type="text"
                                        icon="el-icon-delete"
                                        class="device-remove"
                                        @click="removeRepairDevice(idx)"
                                    />
                                </div>
                            </div>
                        </el-tab-pane>

                        <!--
                            Return Devices tab — A9999 in the OCR
                            payload. Same shape as Repair Devices but
                            points at the Return Device catalogue
                            item-id on submit.
                        -->
                        <el-tab-pane name="return">
                            <span slot="label">
                                <i class="el-icon-refresh-left" />
                                Return Devices
                                <span class="review-tab-count">({{ editedReturnDevices.length }})</span>
                            </span>
                            <div class="device-tab-head">
                                <span class="device-section-sku">A9999</span>
                                <span class="device-section-spacer" />
                                <el-button
                                    size="mini"
                                    type="text"
                                    icon="el-icon-plus"
                                    @click="addReturnDevice"
                                >Add</el-button>
                            </div>
                            <div v-if="editedReturnDevices.length === 0" class="device-empty">
                                No return devices.
                            </div>
                            <div v-else class="device-rows">
                                <div
                                    v-for="(d, idx) in editedReturnDevices"
                                    :key="`ret-${idx}`"
                                    class="device-row"
                                >
                                    <el-input
                                        v-model="d.model"
                                        size="small"
                                        placeholder="Model"
                                        class="device-model"
                                    />
                                    <el-input-number
                                        :value="d.quantity"
                                        :min="0"
                                        :max="9999"
                                        size="small"
                                        controls-position="right"
                                        class="device-qty"
                                        @change="(val) => setReturnDeviceQty(idx, val)"
                                    />
                                    <el-button
                                        size="mini"
                                        type="text"
                                        icon="el-icon-delete"
                                        class="device-remove"
                                        @click="removeReturnDevice(idx)"
                                    />
                                </div>
                            </div>
                        </el-tab-pane>
                    </el-tabs>

                    <!--
                        Editable note section. Seeded from the OCR's
                        returnNote (the formatted "Model x Qty (reason)"
                        lines) so the user can tweak the text before it
                        feeds into the downstream Zoho update. Lives in
                        the left pane underneath the items table so the
                        PDF on the right keeps its full height.
                    -->
                    <div class="review-note-section">
                        <label class="review-note-label">
                            <i class="el-icon-edit-outline" />
                            Note
                        </label>
                        <el-input
                            v-model="editedNote"
                            type="textarea"
                            :rows="4"
                            placeholder="Add or edit a note about this credit note…"
                            class="review-note-input"
                        />
                    </div>
                </section>

                <section class="review-right">
                    <div class="review-pane-head">
                        <i class="el-icon-document" />
                        PDF
                        <a
                            v-if="reviewPdfUrl"
                            :href="reviewPdfUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="review-pane-open"
                        >
                            Open in new tab <i class="el-icon-top-right" />
                        </a>
                    </div>
                    <!-- iframe is the most universal way to render a
                         remote PDF; S3 serves the file with the default
                         Content-Type and no X-Frame-Options, so Chrome /
                         Edge / Firefox all render it inline via their
                         built-in PDF viewers. -->
                    <iframe
                        v-if="reviewPdfEmbedUrl"
                        :src="reviewPdfEmbedUrl"
                        class="review-pdf-frame"
                        title="Credit note PDF"
                    />
                    <div v-else class="review-pdf-empty">
                        <i class="el-icon-document-remove" />
                        <span>No PDF attached to this credit note.</span>
                    </div>
                </section>
            </div>
            <div slot="footer">
                <el-button :disabled="submitting" @click="reviewOpen = false">
                    Close
                </el-button>
                <!--
                    Submit only renders for Processed rows — already-
                    Completed rows have been pushed to Zoho once and
                    re-submitting would duplicate the line items in
                    the credit note. Count badge in the label shows how
                    many rows have a Zoho match selected.
                -->
                <el-button
                    v-if="canSubmitToZoho"
                    type="primary"
                    icon="el-icon-upload"
                    :loading="submitting"
                    :disabled="totalSubmittable === 0 || matchesLoading"
                    @click="submitToZoho"
                >Submit to Zoho ({{ totalSubmittable }})</el-button>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import { listCreditNotes, submitCreditNoteToZoho } from '@/api/tools/creditNote'
import { bulkSkuMatches } from '@/api/zoho/products/product'
import TreePanel from '@/components/TreePanel'

// Status metadata — `tag` is the el-tag / el-badge variant, `color`
// drives the leaf icon tint in the tree. Three states match the
// lifecycle: OCR queued → OCR processed (shown as "Pending" because
// from the user's POV the row is pending their review + submit to
// Zoho) → completed once it's been pushed into Zoho. The internal
// value stays "processed" so OCR's webhook payload (which uses that
// literal string) and existing DB rows continue to match.
const STATUS_META = [
    { value: 'queued',    label: 'Queued',    tag: 'info',    color: '#909399' },
    { value: 'processed', label: 'Pending',   tag: 'success', color: '#67C23A' },
    { value: 'completed', label: 'Completed', tag: 'primary', color: '#409EFF' }
]

// Public base URL for the S3 bucket the OCR submit flow archives PDFs
// into. Combined with the row's s3Key for the Attachment column's link.
// Lives here as a constant rather than an env var because the bucket
// is hard-coded across the deploy — if we ever move buckets, swap the
// string (or graduate to a per-row presigned URL from the backend if
// the bucket is locked down).
const S3_BUCKET_BASE_URL = 'https://imobile-credit-note-053188594440-us-east-1-an.s3.us-east-1.amazonaws.com/'

export default {
    name: 'ImobileCreditNote',
    components: { TreePanel },
    data() {
        return {
            loading: false,
            list: [],
            total: 0,
            counts: { all: 0, queued: 0, processed: 0, completed: 0 },
            queryParams: {
                page: 1,
                pageSize: 20,
                search: '',
                // '' means "all statuses" — tree's All node click clears this.
                status: ''
            },

            // Review dialog state. `reviewRow` carries the whole row
            // object so reviewItems / reviewPdfUrl can compute off it
            // and re-render without re-fetching.
            reviewOpen: false,
            reviewRow: null,
            // Zoho SKU-match results, keyed by the OCR sku:
            //   { '5470': [{ itemId, sku, name, status }, ...] }
            // Populated when the dialog opens. Cleared on close so
            // reopening triggers a fresh lookup.
            matchesBySku: {},
            matchesLoading: false,
            matchesError: '',
            // User's per-row picks, keyed by OCR sku → matched Zoho itemId.
            // In-memory only — discarded when the dialog closes. The
            // single-match auto-select still kicks in on every open.
            selections: {},
            // Editable quantities, indexed by row position in items[].
            // Indexed (rather than keyed by sku) so two rows with the
            // same OCR sku can hold independent quantities. Same
            // session-only contract as `selections`.
            quantities: [],
            // Editable note text, seeded from row.returnNote on open.
            // Session-only — will feed into the downstream Zoho update
            // along with selections + quantities.
            editedNote: '',
            // Session-editable device buckets, seeded from row.returnDevice
            // / row.repairDevice on open. Each entry is {model, quantity}.
            // Plain arrays so the table-style v-for works with $set.
            editedReturnDevices: [],
            editedRepairDevices: [],
            // Tab switcher inside the left pane: 'items' | 'repair' | 'return'.
            // Driven by el-tabs v-model; count badges in each tab label
            // come from the corresponding *.length live, so they update
            // as the user adds/removes rows.
            activeTab: 'items',
            submitting: false
        }
    },
    computed: {
        treeData() {
            return [
                {
                    id: 'all',
                    label: 'All Credit Notes',
                    count: this.counts.all || 0,
                    children: STATUS_META.map(s => ({
                        id: s.value,
                        label: s.label,
                        count: this.counts[s.value] || 0
                    }))
                }
            ]
        },
        currentStatusLabel() {
            if (!this.queryParams.status) return 'All'
            const meta = STATUS_META.find(s => s.value === this.queryParams.status)
            return meta ? meta.label : this.queryParams.status
        },
        reviewTitle() {
            if (!this.reviewRow) return 'Credit Note'
            const cn = this.reviewRow.creditNo
            return cn ? `Credit Note ${cn}` : 'Credit Note'
        },
        reviewItems() {
            return (this.reviewRow && this.reviewRow.items) || []
        },
        reviewPdfUrl() {
            return this.reviewRow ? this.s3Url(this.reviewRow.s3Key) : ''
        },
        // Same URL, but with `#toolbar=0` appended so the embedded PDF
        // viewer hides its top control bar (zoom / download / print).
        // The plain reviewPdfUrl is still used for the "Open in new
        // tab" escape hatch, where the toolbar IS useful.
        reviewPdfEmbedUrl() {
            const base = this.reviewPdfUrl
            return base ? base + '#toolbar=0' : ''
        },
        // Rows the user has picked a Zoho match for. Drives the
        // matched-items count shown in the Submit button label.
        submittableItemCount() {
            if (!this.reviewRow) return 0
            const items = this.reviewRow.items || []
            return items.filter(it => it.sku && this.selections[it.sku]).length
        },
        // Submittable device count = entries with either a model or
        // a positive quantity. Mirrors the backend's filter so the
        // button label matches what actually gets sent.
        submittableDeviceCount() {
            const live = (d) =>
                (d.model && String(d.model).trim()) || Number(d.quantity) > 0
            return this.editedReturnDevices.filter(live).length
                + this.editedRepairDevices.filter(live).length
        },
        // Total payload size — drives the Submit button's disabled
        // state. Need at least one of either kind.
        totalSubmittable() {
            return this.submittableItemCount + this.submittableDeviceCount
        },
        // Submit only makes sense on Processed rows — already-Completed
        // rows have been pushed to Zoho already, and Queued rows have
        // no items / no PDF to send yet.
        canSubmitToZoho() {
            return !!(this.reviewRow && this.reviewRow.status === 'processed')
        }
    },
    created() {
        this.getList()
    },
    methods: {
        async getList() {
            this.loading = true
            try {
                const params = {
                    page: this.queryParams.page,
                    pageSize: this.queryParams.pageSize
                }
                if (this.queryParams.search) params.search = this.queryParams.search
                if (this.queryParams.status) params.status = this.queryParams.status

                const res = await listCreditNotes(params)
                if (!res || res.success === false) {
                    throw new Error((res && res.message) || 'Failed to load credit notes')
                }
                this.list = res.data || []
                this.total = res.total || 0
                // Counts are unaffected by the status filter (see backend
                // comment in /creditNote/list) so the tree badges show
                // the real distribution even when one node is selected.
                this.counts = res.counts || { all: 0 }
            } catch (e) {
                console.error('Credit Note list failed:', e)
                const msg = (e.response && e.response.data && e.response.data.message)
                    || e.message
                    || 'Failed to load credit notes'
                this.$message.error(msg)
                this.list = []
                this.total = 0
            } finally {
                this.loading = false
            }
        },
        handleQuery() {
            this.queryParams.page = 1
            this.getList()
        },
        // ── Review dialog ─────────────────────────────────────────
        openReview(row) {
            if (!row) return
            this.reviewRow = row
            this.reviewOpen = true
            // Selections are session-only — start blank every open so
            // a previous dialog's picks don't bleed across rows. The
            // single-match auto-select inside loadSkuMatches will fill
            // the easy ones in once the lookup lands.
            this.selections = {}
            this.matchesBySku = {}
            this.matchesError = ''
            // Seed quantities from the parsed items[].quantity (which
            // the OCR parser stringifies); Number() so the
            // el-input-number doesn't choke on string input.
            this.quantities = (row.items || []).map(
                it => Number((it && it.quantity)) || 0
            )
            // Seed the editable note from the OCR-parsed text. Empty
            // string when the row never had a note so the textarea
            // shows its placeholder.
            this.editedNote = (row && row.returnNote) || ''
            // Deep-clone the device buckets so in-place edits in the
            // dialog don't mutate the list row's stored copy.
            this.editedReturnDevices = ((row && row.returnDevice) || []).map(d => ({
                model: (d && d.model) || '',
                quantity: Number((d && d.quantity)) || 0
            }))
            this.editedRepairDevices = ((row && row.repairDevice) || []).map(d => ({
                model: (d && d.model) || '',
                quantity: Number((d && d.quantity)) || 0
            }))
            // Reset to the Line Items tab on every open so the user
            // starts from the same spot regardless of where they were
            // last.
            this.activeTab = 'items'
            this.loadSkuMatches(row)
        },
        onReviewClose() {
            // Drop the row reference so the PDF iframe unmounts and
            // doesn't keep the previous file in memory. Reset the
            // lookup cache so reopening hits Zoho again with fresh
            // data (Active-status changes between sessions are real).
            this.reviewRow = null
            this.matchesBySku = {}
            this.selections = {}
            this.quantities = []
            this.editedNote = ''
            this.editedReturnDevices = []
            this.editedRepairDevices = []
            this.matchesError = ''
            this.matchesLoading = false
            this.submitting = false
        },
        // Fire the bulk LIKE-search against Zoho for every unique SKU
        // in the row's items. Auto-selects when a SKU has exactly one
        // match AND the user hasn't already picked something different
        // — keeps the experience snappy without overriding existing
        // saved picks.
        async loadSkuMatches(row) {
            const skus = [...new Set(
                (row.items || [])
                    .map(i => i && i.sku)
                    .filter(Boolean)
            )]
            if (skus.length === 0) {
                this.matchesBySku = {}
                return
            }
            this.matchesLoading = true
            try {
                const res = await bulkSkuMatches(skus)
                const data = (res && res.data) || {}
                this.matchesBySku = data
                // Auto-select singletons that don't already have a pick.
                const updated = { ...this.selections }
                for (const sku of skus) {
                    const matches = data[sku] || []
                    if (matches.length === 1 && !updated[sku]) {
                        updated[sku] = matches[0].itemId
                    }
                }
                this.selections = updated
            } catch (e) {
                console.error('SKU match lookup failed:', e)
                this.matchesError = (e.response && e.response.data && e.response.data.message)
                    || e.message
                    || 'SKU match lookup failed'
            } finally {
                this.matchesLoading = false
            }
        },
        // Push the current selections + quantities + note into the
        // existing Zoho credit note. Iterates row-by-row (not by sku)
        // so duplicate OCR skus across rows each produce their own
        // Zoho line item.
        async submitToZoho() {
            if (!this.reviewRow || this.submitting) return
            const rowItems = this.reviewRow.items || []
            const payloadItems = []
            rowItems.forEach((it, idx) => {
                const sku = it && it.sku
                const itemId = sku ? this.selections[sku] : null
                if (!itemId) return
                const candidates = this.matchesBySku[sku] || []
                const m = candidates.find(c => c.itemId === itemId)
                if (!m) return
                payloadItems.push({
                    matchedItemId: m.itemId,
                    matchedSku: m.sku,
                    matchedName: m.name,
                    quantity: this.getQuantity(idx) || 1
                })
            })
            // Same liveness filter as the backend (model OR positive
            // qty); empty rows the user added then never filled in
            // get dropped before send.
            const liveDevice = (d) =>
                (d.model && String(d.model).trim()) || Number(d.quantity) > 0
            const returnDevicePayload = this.editedReturnDevices
                .filter(liveDevice)
                .map(d => ({
                    model: String(d.model || '').trim(),
                    quantity: Number(d.quantity) || 0
                }))
            const repairDevicePayload = this.editedRepairDevices
                .filter(liveDevice)
                .map(d => ({
                    model: String(d.model || '').trim(),
                    quantity: Number(d.quantity) || 0
                }))

            if (
                payloadItems.length === 0 &&
                returnDevicePayload.length === 0 &&
                repairDevicePayload.length === 0
            ) {
                this.$message.warning(
                    'Pick a Zoho match for at least one row, or add a return/repair device, before submitting.'
                )
                return
            }
            this.submitting = true
            try {
                const res = await submitCreditNoteToZoho(this.reviewRow._id, {
                    items: payloadItems,
                    note: this.editedNote,
                    returnDevice: returnDevicePayload,
                    repairDevice: repairDevicePayload
                })
                if (!res || res.success === false) {
                    throw new Error((res && res.message) || 'Submit failed')
                }
                // Patch the live row so the list reflects "completed"
                // straight away without a full refresh.
                const idx = this.list.findIndex(
                    r => String(r._id) === String(this.reviewRow._id)
                )
                if (idx !== -1) {
                    this.$set(this.list, idx, { ...this.list[idx], status: 'completed' })
                }
                if (res.attach && res.attach.ok === false) {
                    this.$message.warning(
                        `Credit note updated in Zoho, but the PDF attach failed${res.attach.message ? ': ' + res.attach.message : ''}.`
                    )
                } else {
                    this.$message.success('Credit note updated in Zoho.')
                }
                this.reviewOpen = false
            } catch (e) {
                console.error('Submit to Zoho failed:', e)
                const msg = (e.response && e.response.data && e.response.data.message)
                    || e.message
                    || 'Submit failed'
                this.$message.error(msg)
            } finally {
                this.submitting = false
            }
        },
        // Match candidates for a given OCR sku — returns [] if the
        // lookup hasn't landed yet or the sku produced no Active hits.
        matchOptions(sku) {
            if (!sku) return []
            return this.matchesBySku[sku] || []
        },
        // Element UI's el-select is :value + @change so we can swap
        // entries on the selections map without two-way binding to a
        // nested path. Empty string is treated as "clear".
        onSelectionChange(sku, itemId) {
            const next = { ...this.selections }
            if (itemId) {
                next[sku] = itemId
            } else {
                delete next[sku]
            }
            this.selections = next
        },
        // Quantity is held in a plain array indexed by row position;
        // `$set` keeps Vue 2's reactivity in sync after array-index
        // writes (which `quantities[i] = x` wouldn't trigger on its own).
        getQuantity(idx) {
            const v = this.quantities[idx]
            return v == null ? 0 : v
        },
        setQuantity(idx, val) {
            // el-input-number can yield undefined when the user blanks
            // it; coerce to 0 so downstream consumers always see a
            // number.
            this.$set(this.quantities, idx, Number(val) || 0)
        },
        // ── Device buckets (A9999 / R9999) ────────────────────────
        // Add starts a blank row with qty=1 so the user only needs
        // to type the model. Remove just splices the row.
        addReturnDevice() {
            this.editedReturnDevices.push({ model: '', quantity: 1 })
        },
        removeReturnDevice(idx) {
            this.editedReturnDevices.splice(idx, 1)
        },
        setReturnDeviceQty(idx, val) {
            const row = this.editedReturnDevices[idx]
            if (row) this.$set(row, 'quantity', Number(val) || 0)
        },
        addRepairDevice() {
            this.editedRepairDevices.push({ model: '', quantity: 1 })
        },
        removeRepairDevice(idx) {
            this.editedRepairDevices.splice(idx, 1)
        },
        setRepairDeviceQty(idx, val) {
            const row = this.editedRepairDevices[idx]
            if (row) this.$set(row, 'quantity', Number(val) || 0)
        },
        // ── Tree ──────────────────────────────────────────────────
        handleStatusClick(data) {
            if (!data) return
            this.queryParams.status = data.id === 'all' ? '' : data.id
            this.queryParams.page = 1
            this.getList()
        },
        // ── Tree helpers (parity with SQT Cases / Repair) ─────────
        statusColor(id) {
            if (id === 'all') return '#409EFF'
            const meta = STATUS_META.find(s => s.value === id)
            return meta ? meta.color : '#909399'
        },
        badgeType(id) {
            const meta = STATUS_META.find(s => s.value === id)
            return meta ? meta.tag : 'info'
        },
        statusLabel(value) {
            if (!value) return 'Unknown'
            const meta = STATUS_META.find(s => s.value === value)
            return meta ? meta.label : value
        },
        // ── Cell formatters ───────────────────────────────────────
        // Build the absolute S3 URL for an archived PDF. `encodeURI`
        // preserves the path slashes that delimit the date partition
        // while escaping any other reserved characters that might
        // slip into a key (the backend's own slug shouldn't produce
        // any, but be defensive).
        s3Url(key) {
            if (!key) return ''
            return S3_BUCKET_BASE_URL + encodeURI(key)
        },
        formatDate(value) {
            if (!value) return ''
            const d = new Date(value)
            if (isNaN(d.getTime())) return ''
            return d.toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })
        }
    }
}
</script>

<style lang="scss" scoped>
.filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
}
.filter-search { width: 280px; max-width: 100%; }
.filter-spacer { flex: 1; }
.filter-summary {
    color: #606266;
    font-size: 13px;
}
.filter-summary strong { color: #303133; font-weight: 600; }
.filter-summary-scope { color: #909399; }

/* Tree node template (same shape as SQT Cases / Repair) */
.status-node {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    padding-right: 6px;
}
.status-node-icon {
    font-size: 14px;
    flex-shrink: 0;
}
.status-node-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
}
.status-node-badge {
    flex-shrink: 0;
    margin-left: 4px;
}

/* Table */
.credit-table {
    border: 1px solid #ebeef5;
    border-radius: 8px;
    overflow: hidden;
}
.credit-no {
    font-weight: 500;
    color: #303133;
}
.attachment-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #2563eb;
    text-decoration: none;
    font-size: 13px;
}
.attachment-link:hover {
    text-decoration: underline;
}
.attachment-link i {
    font-size: 13px;
}
.muted {
    color: #c0c4cc;
    font-style: italic;
}

/* ── Review dialog ───────────────────────────────────────────────── */
.review-shell {
    display: flex;
    gap: 16px;
    height: 70vh;
    min-height: 480px;
}
.review-left {
    /* 3:2 split with the PDF — items + note get the wider share so
       long product names fit in the picker without truncation, and
       the editable note has room to breathe. */
    flex: 3 1 0;
    min-width: 420px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
}
.review-right {
    flex: 2 1 0;
    min-width: 360px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
}
.review-pane-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid #ebeef5;
    background: #f9fafb;
    color: #303133;
    font-size: 13px;
    font-weight: 600;
}
.review-pane-head i {
    color: #2563eb;
    font-size: 14px;
}
.review-pane-count {
    margin-left: auto;
    color: #909399;
    font-weight: 500;
    font-size: 12px;
}
.review-pane-loading {
    color: #2563eb;
    font-size: 12px;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}
.review-pane-alert {
    margin: 8px 12px 0;
}
.review-pane-open {
    margin-left: auto;
    color: #2563eb;
    font-weight: 500;
    font-size: 12px;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}
.review-pane-open:hover { text-decoration: underline; }

.review-items-table {
    flex: 1;
    overflow: auto;
}

/* Zoho Item cell — SKU label up top, picker (or loading / no-match
   placeholder) directly underneath in a single stacked block. Padding
   on the cell itself (via the row's default vertical padding) gives
   breathing room between adjacent rows. */
.zoho-item-cell {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 2px 0;
}
.zoho-item-sku {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 12px;
}
.zoho-item-sku-label {
    color: #909399;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    font-size: 11px;
}
.zoho-item-sku-value {
    color: #303133;
    font-weight: 600;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.match-select {
    width: 100%;
}
/* Quantity cell mirrors the Zoho Item cell's stacked layout so the
   input bottom-aligns with the el-select. The spacer matches the SKU
   label row's visible height — match font-size and line-height to
   .zoho-item-sku so the alignment survives style changes. */
.qty-cell {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 2px 0;
}
.qty-cell-spacer {
    /* Same vertical footprint as .zoho-item-sku: 12px font-size *
       1.5 default line-height ≈ 18px. */
    height: 18px;
    visibility: hidden;
}
.qty-input {
    width: 100%;
}

/* ── Tabs in the left pane ─────────────────────────────────────────
   el-tabs needs to fill the remaining vertical space above the note
   section and let its content scroll independently. Element UI's
   default tabs__content has no flex; we hijack it with flex + overflow
   so each tab pane gets the full remaining height with its own
   scroll. */
.review-tabs {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
}
.review-tabs ::v-deep .el-tabs__header {
    margin: 0;
    flex-shrink: 0;
    padding: 0 12px;
    background: #f9fafb;
    border-bottom: 1px solid #ebeef5;
}
.review-tabs ::v-deep .el-tabs__nav-wrap::after {
    display: none;
}
.review-tabs ::v-deep .el-tabs__item {
    font-size: 13px;
    height: 38px;
    line-height: 38px;
    padding: 0 14px;
    color: #606266;
}
.review-tabs ::v-deep .el-tabs__item.is-active {
    color: #2563eb;
    font-weight: 600;
}
.review-tabs ::v-deep .el-tabs__active-bar {
    background-color: #2563eb;
}
.review-tabs ::v-deep .el-tabs__content {
    flex: 1;
    overflow: auto;
    min-height: 0;
}
.review-tabs ::v-deep .el-tab-pane {
    padding: 10px 12px;
}
.review-tab-count {
    color: #909399;
    font-weight: 500;
    margin-left: 4px;
}
.is-active .review-tab-count {
    color: #2563eb;
}
.review-tab-loading {
    color: #2563eb;
    margin-left: 4px;
}
.review-tab-loading i {
    font-size: 13px;
}

/* Device tab head — the chip + Add button row that sits above the
   device list inside the Repair / Return tab content. Same idea as
   the standalone .device-section-head used to be, just no need for
   its own title since the tab label already plays that role. */
.device-tab-head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
}
.device-section-sku {
    color: #909399;
    font-weight: 500;
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    background: #eef0f3;
    padding: 1px 6px;
    border-radius: 3px;
}
.device-section-spacer {
    flex: 1;
}
.device-empty {
    color: #909399;
    font-size: 12px;
    font-style: italic;
    padding: 4px 0 2px;
}
.device-rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.device-row {
    display: flex;
    align-items: center;
    gap: 6px;
}
.device-model {
    flex: 1;
    min-width: 0;
}
.device-qty {
    flex: 0 0 110px;
}
.device-remove {
    flex-shrink: 0;
    padding: 4px !important;
    color: #909399;
}
.device-remove:hover {
    color: #f56c6c;
}

/* Note section sits below the items table in the left pane. The items
   table keeps flex: 1 above it (so it shrinks gracefully when the
   note is taller), and the note has a fixed footprint via the 4-row
   textarea + padding. A subtle background tint + top border separates
   it from the items table without competing with the pane header. */
.review-note-section {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px 12px;
    border-top: 1px solid #ebeef5;
    background: #fafbfc;
}
.review-note-label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #303133;
    font-size: 13px;
    font-weight: 600;
}
.review-note-label i {
    color: #2563eb;
    font-size: 14px;
}
.review-note-input ::v-deep .el-textarea__inner {
    font-family: inherit;
    font-size: 13px;
    line-height: 1.5;
    padding: 6px 10px;
}
.match-loading {
    color: #909399;
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}
.review-pdf-frame {
    flex: 1;
    width: 100%;
    border: 0;
    background: #fafafa;
}
.review-pdf-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #909399;
    gap: 8px;
    i { font-size: 32px; }
}

/* Mobile: stack the two panes vertically when there isn't room. */
@media (max-width: 900px) {
    .review-shell {
        flex-direction: column;
        height: auto;
    }
    .review-left {
        flex: 0 0 auto;
        max-height: 30vh;
    }
    .review-right {
        flex: 1 1 auto;
        height: 50vh;
    }
}
</style>

<style>
/* Unscoped so it reaches the body-appended dialog wrapper. */
.credit-review-dialog .el-dialog__body {
    padding: 12px 20px 4px;
}
.credit-review-dialog .el-dialog__footer {
    padding: 10px 20px 14px;
}
@media (max-width: 1400px) {
    .credit-review-dialog {
        width: 92vw !important;
    }
}
/* Match-select popper. Element UI's el-select default option height
   (34px) clips two-line content — bump to auto with a min-height +
   relaxed line-height so the name AND sku both fit comfortably. Lives
   here (unscoped) because el-select's popper is appended to <body>,
   which escapes the component's scoped styles. */
.match-select-popper .el-select-dropdown__item {
    height: auto;
    min-height: 48px;
    line-height: 1.35;
    padding: 8px 14px;
}
.match-select-popper .match-option {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
}
.match-select-popper .match-option-name {
    color: #303133;
    font-weight: 500;
    font-size: 13px;
    /* Allow long product names to wrap rather than truncate so the
       user can read the full identifier when picking. */
    white-space: normal;
    word-break: break-word;
    line-height: 1.3;
}
.match-select-popper .match-option-sku {
    color: #909399;
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
/* Locking the SKU's colour across every option state. Element UI's
   default hover background is light gray (#f5f7fa) — turning the SKU
   white on hover (the previous override) made it invisible. The name
   inherits parent colour, so it picks up the selected-blue when active. */
.match-select-popper .el-select-dropdown__item.selected .match-option-sku,
.match-select-popper .el-select-dropdown__item.hover .match-option-sku,
.match-select-popper .el-select-dropdown__item:hover .match-option-sku {
    color: #909399;
}
</style>
