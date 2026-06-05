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
            <div v-if="reviewRow" class="review-body">
                <!--
                    Header strip — two rows.

                    Row 1: editable Credit No with inline edit
                    affordance. Confirming PATCHes the field AND
                    re-triggers the Zoho detail fetch so the customer /
                    pricelist below match the new lookup target.

                    Row 2: read-only Customer + Price List sourced from
                    /zohoDetail. Loads in the background after the
                    dialog opens; shows a small spinner while inflight
                    and an inline error chip on failure.

                    The strip lives outside .review-shell so the shell's
                    left/right panes keep their full height regardless
                    of how tall the header grows.
                -->
                <div class="review-header">
                    <div class="review-header-row">
                        <div class="review-header-cn">
                            <span class="review-header-label">Credit No</span>
                            <template v-if="editingCreditNo">
                                <el-input
                                    v-model="editingCreditNoDraft"
                                    size="small"
                                    class="cn-edit-input"
                                    :disabled="savingCreditNo"
                                    @keyup.enter.native="confirmEditCreditNo"
                                    @keyup.esc.native="cancelEditCreditNo"
                                />
                                <el-button
                                    size="mini"
                                    type="text"
                                    icon="el-icon-check"
                                    class="cn-edit-action cn-edit-confirm"
                                    :loading="savingCreditNo"
                                    @click="confirmEditCreditNo"
                                />
                                <el-button
                                    size="mini"
                                    type="text"
                                    icon="el-icon-close"
                                    class="cn-edit-action cn-edit-cancel"
                                    :disabled="savingCreditNo"
                                    @click="cancelEditCreditNo"
                                />
                            </template>
                            <template v-else>
                                <span class="review-header-value">
                                    {{ editedCreditNo || '—' }}
                                </span>
                                <el-button
                                    size="mini"
                                    type="text"
                                    icon="el-icon-edit"
                                    class="cn-edit-btn"
                                    @click="startEditCreditNo"
                                />
                            </template>
                        </div>
                    </div>
                    <div class="review-header-row review-header-meta">
                        <div class="review-header-meta-item">
                            <span class="review-header-label">Customer</span>
                            <span
                                v-if="zohoDetailLoading && !zohoCustomerName"
                                class="review-header-loading"
                            >
                                <i class="el-icon-loading" />
                            </span>
                            <span v-else-if="zohoCustomerName" class="review-header-value">
                                {{ zohoCustomerName }}
                            </span>
                            <span v-else class="muted">—</span>
                        </div>
                        <div class="review-header-meta-item">
                            <span class="review-header-label">Price List</span>
                            <span
                                v-if="zohoDetailLoading && !zohoPricebookId"
                                class="review-header-loading"
                            >
                                <i class="el-icon-loading" />
                            </span>
                            <el-tag
                                v-else-if="zohoPriceListLabel"
                                size="mini"
                                :type="zohoPriceListKnown ? 'success' : 'info'"
                                effect="plain"
                            >{{ zohoPriceListLabel }}</el-tag>
                            <span v-else class="muted">—</span>
                        </div>
                        <span
                            v-if="zohoDetailError"
                            class="review-header-meta-error"
                            :title="zohoDetailError"
                        >
                            <i class="el-icon-warning-outline" />
                            {{ zohoDetailError }}
                        </span>
                    </div>
                </div>
                <div class="review-shell">
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
                                        <!--
                                            Two-state SKU display: the static
                                            label + pencil edit button by
                                            default, swapped for an input +
                                            confirm/cancel pair when this
                                            row is the one being edited. Only
                                            one row at a time can be in edit
                                            mode (single-row UX is simpler
                                            and avoids confusing partial-
                                            save state across rows).
                                        -->
                                        <template v-if="editingSkuIdx === scope.$index">
                                            <el-input
                                                v-model="editingSkuDraft"
                                                size="mini"
                                                class="sku-edit-input"
                                                :disabled="savingSkuIdx === scope.$index"
                                                @keyup.enter.native="confirmEditSku(scope.$index)"
                                                @keyup.esc.native="cancelEditSku"
                                            />
                                            <el-button
                                                size="mini"
                                                type="text"
                                                icon="el-icon-check"
                                                class="sku-edit-action sku-edit-confirm"
                                                :loading="savingSkuIdx === scope.$index"
                                                @click="confirmEditSku(scope.$index)"
                                            />
                                            <el-button
                                                size="mini"
                                                type="text"
                                                icon="el-icon-close"
                                                class="sku-edit-action sku-edit-cancel"
                                                :disabled="savingSkuIdx === scope.$index"
                                                @click="cancelEditSku"
                                            />
                                        </template>
                                        <template v-else>
                                            <span class="zoho-item-sku-value">
                                                {{ scope.row.sku || '—' }}
                                            </span>
                                            <el-button
                                                size="mini"
                                                type="text"
                                                icon="el-icon-edit"
                                                class="sku-edit-btn"
                                                :disabled="editingSkuIdx !== -1 || savingSkuIdx !== -1"
                                                @click="startEditSku(scope.$index)"
                                            />
                                        </template>
                                    </div>
                                    <div class="zoho-item-pick">
                                        <span
                                            v-if="(matchesLoading || savingSkuIdx === scope.$index) && !matchesBySku[scope.row.sku]"
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
                        <!--
                            Per-row delete. Mirrors the device tabs'
                            trash button — instant remove (no confirm)
                            because the action is one-click reversible
                            via Undo Ctrl+Z? No, there's no undo, but
                            the cost is low (re-add + retype the sku)
                            and matching the device-row behaviour keeps
                            the dialog feeling consistent. Disabled
                            while any row is mid-edit so the indices
                            can't shift under an in-flight save.
                        -->
                        <el-table-column label="" width="50" align="center">
                            <template slot-scope="scope">
                                <el-button
                                    size="mini"
                                    type="text"
                                    icon="el-icon-delete"
                                    class="line-item-remove"
                                    :disabled="editingSkuIdx !== -1 || savingSkuIdx !== -1"
                                    @click="removeLineItem(scope.$index)"
                                />
                            </template>
                        </el-table-column>
                    </el-table>
                            <!--
                                Add button sits below the table so it
                                visually anchors to "end of list" — the
                                user scans the rows, then adds another
                                one at the bottom (matches how Excel /
                                most form-style item lists feel). The
                                button disables while any row is mid-
                                edit so the new row doesn't strand the
                                in-flight one.
                            -->
                            <div class="line-items-foot">
                                <el-button
                                    size="mini"
                                    type="text"
                                    icon="el-icon-plus"
                                    :disabled="editingSkuIdx !== -1 || savingSkuIdx !== -1"
                                    @click="addLineItem"
                                >Add Line Item</el-button>
                            </div>
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
                <!--
                    Submit button wrapped in a tooltip so the user can
                    hover the disabled button and see exactly why it's
                    off — most-likely cause first (zoho lookup failed
                    → unmatched item → empty payload). Tooltip is
                    disabled when the button is enabled so a stray
                    hover doesn't show an empty bubble.
                -->
                <el-tooltip
                    v-if="canSubmitToZoho"
                    :content="submitDisabledReason || ''"
                    placement="top"
                    :disabled="!submitDisabledReason || submitting"
                >
                    <!--
                        wrapper span keeps el-tooltip working when the
                        button is :disabled — Element UI's disabled
                        buttons swallow pointer events so the tooltip
                        wouldn't fire without it.
                    -->
                    <span class="submit-tooltip-anchor">
                        <el-button
                            type="primary"
                            icon="el-icon-upload"
                            :loading="submitting"
                            :disabled="!!submitDisabledReason"
                            @click="submitToZoho"
                        >Submit to Zoho ({{ totalSubmittable }})</el-button>
                    </span>
                </el-tooltip>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import { listCreditNotes, submitCreditNoteToZoho, updateCreditNote, getCreditNoteZohoDetail } from '@/api/tools/creditNote'
import { bulkSkuMatches } from '@/api/zoho/products/product'
import { priceListLabel, isKnownPriceList } from '@/utils/zohoPriceList'
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
            // Editable working copy of the OCR-extracted items[]. Deep-
            // cloned from reviewRow.items on open so the user's SKU
            // edits don't mutate the parent list row until the PATCH
            // round-trip succeeds (and so an unsaved edit doesn't
            // bleed onto the list page if the dialog is closed without
            // a confirm). Each entry mirrors the OCR shape:
            // { sku, model, quantity }.
            editedItems: [],
            // Editable credit note number, seeded from row.creditNo on
            // open. Held separately from reviewRow.creditNo for the
            // same optimistic-update reason as editedItems.
            editedCreditNo: '',
            // Inline-edit state for the SKU cells. Only one row at a
            // time can be in edit mode (-1 = none); editingSkuDraft
            // holds the typed value before it's committed. Confirming
            // writes back into editedItems + PATCH-persists; cancel
            // throws the draft away.
            editingSkuIdx: -1,
            editingSkuDraft: '',
            // Inline-edit state for the Credit No header. Same shape
            // as the SKU edit (draft + flag) — separate from the
            // editedCreditNo "current saved" value so cancel can
            // revert to the last confirmed value.
            editingCreditNo: false,
            editingCreditNoDraft: '',
            // Set to the row index whose SKU is currently being
            // persisted (PATCH + match lookup) so the row's confirm
            // button can show a spinner. -1 = no inflight save.
            savingSkuIdx: -1,
            // Same idea for the credit no save round-trip.
            savingCreditNo: false,
            // Zoho-side detail for the credit note: fetched once on
            // dialog open via /:id/zohoDetail and refreshed whenever
            // the creditNo is edited. Held verbatim and forwarded back
            // to submitToZoho so the backend skips the second Zoho
            // round trip on commit.
            //   zohoCreditNoteId   the resolved creditnote_id (string)
            //   zohoCustomerName   creditnote.customer_name
            //   zohoPricebookId    line_items[0].pricebook_id (string)
            //   zohoDetail         the entire creditnote object verbatim
            // Each is null until the fetch lands; the header strip
            // hides its row when both customer + pricelist are null.
            zohoCreditNoteId: null,
            zohoCustomerName: null,
            zohoPricebookId: null,
            zohoDetail: null,
            zohoDetailLoading: false,
            zohoDetailError: '',
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
            // The credit note number now has its own editable header
            // inside the dialog body, so the dialog title stays generic
            // — the header strip is the single source of truth for the
            // user-visible credit no value while editing.
            return 'Credit Note'
        },
        reviewItems() {
            // editedItems is the session-editable working copy seeded
            // from reviewRow.items in openReview. Reading from it (not
            // the original row) means SKU edits flow through to the
            // template immediately without mutating the parent list.
            return this.editedItems || []
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
        // matched-items count shown in the Submit button label. Reads
        // from editedItems so a freshly-edited SKU's match (looked up
        // and possibly auto-selected after the edit) counts the moment
        // it lands, without waiting for the dialog to be re-opened.
        submittableItemCount() {
            const items = this.editedItems || []
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
        },
        // True only when every line item has a Zoho match picked.
        // Rows with no SKU (e.g. a freshly-added blank row the user
        // hasn't filled in) count as missing a match, which is what
        // we want — they'd send a row with no item_id to Zoho.
        allItemsHaveMatch() {
            const items = this.editedItems || []
            return items.every(it => it.sku && this.selections[it.sku])
        },
        // First reason the submit can't fire, in priority order. null
        // when the button is enabled. Used both as the disable gate
        // and as the tooltip text so the user can see WHY it's off.
        submitDisabledReason() {
            if (this.zohoDetailLoading) return 'Loading credit note details from Zoho…'
            if (this.zohoDetailError) return `Zoho lookup failed: ${this.zohoDetailError}`
            if (!this.zohoCreditNoteId) {
                return `Credit note "${this.editedCreditNo || ''}" was not found in Zoho.`
            }
            if (this.matchesLoading) return 'Loading SKU matches…'
            if (!this.allItemsHaveMatch) {
                return 'Pick a Zoho item match for every line item before submitting.'
            }
            if (this.totalSubmittable === 0) {
                return 'Add a line item, return device, or repair device first.'
            }
            return null
        },
        // Human-readable pricelist label (VIP / SVIP / Platinum / etc.)
        // resolved off the pricebook_id on Zoho's line_items[0]. Falls
        // back to the raw id when we don't recognise the pricebook —
        // see @/utils/zohoPriceList for the catalogue.
        zohoPriceListLabel() {
            return priceListLabel(this.zohoPricebookId)
        },
        // Drives a "muted" style on the chip when the pricebook id
        // isn't in our known catalogue, so staff can spot an unfamiliar
        // pricelist at a glance and add it to PRICE_LIST_IDS.
        zohoPriceListKnown() {
            return isKnownPriceList(this.zohoPricebookId)
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
            // Deep-clone items into the editable working copy. Shallow
            // would alias the inner objects so a SKU edit before save
            // mutates the parent list row — bad UX (the list cell
            // updates to a value that may yet fail to persist).
            this.editedItems = (row.items || []).map(it => ({
                sku: (it && it.sku) || '',
                model: it && it.model != null ? it.model : null,
                quantity: it && it.quantity != null ? it.quantity : '0'
            }))
            // Seed quantities from the parsed items[].quantity (which
            // the OCR parser stringifies); Number() so the
            // el-input-number doesn't choke on string input.
            this.quantities = this.editedItems.map(
                it => Number(it.quantity) || 0
            )
            // Editable creditNo header strip — seeded from the row
            // and reset back on close. Empty string is fine (the
            // strip will show "—" until the user clicks edit).
            this.editedCreditNo = (row && row.creditNo) || ''
            // Reset inline-edit state so a previous dialog's "in the
            // middle of typing" state can't bleed across opens.
            this.editingSkuIdx = -1
            this.editingSkuDraft = ''
            this.editingCreditNo = false
            this.editingCreditNoDraft = ''
            this.savingSkuIdx = -1
            this.savingCreditNo = false
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
            // Clear any stale Zoho detail before kicking off the
            // fresh fetch so the header doesn't briefly show the
            // previous row's customer.
            this.zohoCreditNoteId = null
            this.zohoCustomerName = null
            this.zohoPricebookId = null
            this.zohoDetail = null
            this.zohoDetailError = ''
            this.loadSkuMatches(row)
            this.loadZohoDetail()
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
            this.editedItems = []
            this.editedCreditNo = ''
            this.editingSkuIdx = -1
            this.editingSkuDraft = ''
            this.editingCreditNo = false
            this.editingCreditNoDraft = ''
            this.savingSkuIdx = -1
            this.savingCreditNo = false
            this.editedNote = ''
            this.editedReturnDevices = []
            this.editedRepairDevices = []
            this.matchesError = ''
            this.matchesLoading = false
            this.submitting = false
            this.zohoCreditNoteId = null
            this.zohoCustomerName = null
            this.zohoPricebookId = null
            this.zohoDetail = null
            this.zohoDetailLoading = false
            this.zohoDetailError = ''
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
            // Iterate the editable copy so the freshly-edited SKU
            // (and its newly-selected match) shows up in the payload
            // even before the dialog is re-opened.
            const rowItems = this.editedItems || []
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
                    repairDevice: repairDevicePayload,
                    // Pass through the Zoho-side detail we already
                    // fetched when the dialog opened. Backend uses it
                    // verbatim instead of re-fetching, saving a round
                    // trip per submit. If the detail load failed (or
                    // is still in flight) we just omit these and the
                    // backend falls back to its own find + fetch.
                    // pricebookId is sent separately so the backend
                    // doesn't need to re-run the contact fallback for
                    // empty-credit-note rows where line_items[0] has
                    // no pricebook_id to read.
                    zohoCreditNoteId: this.zohoCreditNoteId || undefined,
                    pricebookId: this.zohoPricebookId || undefined,
                    existing: this.zohoDetail || undefined
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
        // ── Line item add / delete ────────────────────────────────
        // Optimistic mutations: change editedItems locally first, then
        // PATCH the full array. On failure the local change is rolled
        // back so the in-dialog state always matches what's in Mongo.
        //
        // Quantities are indexed by row position, so add appends a 0
        // and delete splices at the same index. The editingSkuIdx
        // tracker also has to shift when a row before it is deleted
        // (otherwise the input would jump to the wrong row mid-edit).
        async addLineItem() {
            // Block while any row is being edited or saved so the new
            // row doesn't strand the existing one (only one inline
            // editor at a time, see startEditSku).
            if (this.editingSkuIdx !== -1 || this.savingSkuIdx !== -1) return
            const newRow = { sku: '', model: null, quantity: '0' }
            this.editedItems.push(newRow)
            this.quantities.push(0)
            const newIdx = this.editedItems.length - 1
            try {
                await updateCreditNote(this.reviewRow._id, {
                    items: this.editedItems
                })
                this.syncListRowItems()
                // Drop the user straight into edit mode on the new
                // row so they can type the SKU without an extra click.
                this.editingSkuIdx = newIdx
                this.editingSkuDraft = ''
            } catch (e) {
                // Roll back the optimistic append so the dialog
                // matches what's actually in Mongo.
                this.editedItems.pop()
                this.quantities.pop()
                const msg = (e.response && e.response.data && e.response.data.message)
                    || e.message
                    || 'Failed to add line item'
                this.$message.error(msg)
                console.error('Add line item failed:', e)
            }
        },
        async removeLineItem(idx) {
            // Same guard as Add — never mutate the array while an
            // inline edit is in flight on another row.
            if (this.editingSkuIdx !== -1 || this.savingSkuIdx !== -1) return
            const removedItem = this.editedItems[idx]
            if (!removedItem) return
            const removedQty = this.quantities[idx]
            this.editedItems.splice(idx, 1)
            this.quantities.splice(idx, 1)
            try {
                await updateCreditNote(this.reviewRow._id, {
                    items: this.editedItems
                })
                this.syncListRowItems()
            } catch (e) {
                // Re-insert at the original position so the row order
                // doesn't visibly shuffle when persist fails.
                this.editedItems.splice(idx, 0, removedItem)
                this.quantities.splice(idx, 0, removedQty)
                const msg = (e.response && e.response.data && e.response.data.message)
                    || e.message
                    || 'Failed to delete line item'
                this.$message.error(msg)
                console.error('Delete line item failed:', e)
            }
        },
        // Patch the visible list row to mirror editedItems so the
        // table cell (status / items / itemCount) reflects in-dialog
        // changes without a refetch. Used by every items-mutating
        // path (SKU edit, add, delete).
        syncListRowItems() {
            const i = this.list.findIndex(
                r => String(r._id) === String(this.reviewRow._id)
            )
            if (i === -1) return
            const cloned = this.editedItems.map(it => ({ ...it }))
            this.$set(this.list, i, {
                ...this.list[i],
                items: cloned,
                itemCount: cloned.length
            })
        },
        // ── Inline SKU edit ───────────────────────────────────────
        // The Zoho Item cell shows the OCR-extracted SKU plus a pencil
        // button. Clicking the pencil swaps the value for an input +
        // confirm/cancel pair. Confirm persists via PATCH (so the
        // correction survives dialog re-opens) AND triggers a fresh
        // bulk-match lookup for the new SKU so the picker below
        // refreshes without needing the user to re-open the dialog.
        startEditSku(idx) {
            // Bail out if another row is mid-save so we don't double-
            // fire round-trips or strand the spinner.
            if (this.savingSkuIdx !== -1) return
            const row = this.editedItems[idx]
            if (!row) return
            this.editingSkuIdx = idx
            this.editingSkuDraft = row.sku || ''
        },
        cancelEditSku() {
            this.editingSkuIdx = -1
            this.editingSkuDraft = ''
        },
        async confirmEditSku(idx) {
            const newSku = String(this.editingSkuDraft || '').trim()
            if (!newSku) {
                this.$message.warning('SKU cannot be empty.')
                return
            }
            const row = this.editedItems[idx]
            if (!row) {
                this.cancelEditSku()
                return
            }
            const oldSku = row.sku || ''
            // No-op when the user confirms the same value — saves a
            // pointless PATCH and avoids resetting the existing match.
            if (newSku === oldSku) {
                this.cancelEditSku()
                return
            }
            // Optimistic UI: apply the new sku locally first so the
            // cell repaints immediately. Revert on persist failure.
            this.$set(this.editedItems[idx], 'sku', newSku)
            this.editingSkuIdx = -1
            this.editingSkuDraft = ''
            this.savingSkuIdx = idx
            try {
                // Persist + look up matches in parallel — the two
                // round-trips are independent and the picker is more
                // useful when both land together.
                const [, ] = await Promise.all([
                    updateCreditNote(this.reviewRow._id, {
                        items: this.editedItems
                    }),
                    this.loadSingleSkuMatches(newSku)
                ])
                // Patch the live list row so the visible table stays
                // in sync without a full refresh — same trick we use
                // after submitToZoho.
                this.syncListRowItems()
            } catch (e) {
                // Roll back the in-dialog edit so the displayed value
                // matches what's actually in Mongo.
                this.$set(this.editedItems[idx], 'sku', oldSku)
                const msg = (e.response && e.response.data && e.response.data.message)
                    || e.message
                    || 'Failed to save SKU edit'
                this.$message.error(msg)
                console.error('SKU edit persist failed:', e)
            } finally {
                this.savingSkuIdx = -1
            }
        },
        // ── Zoho credit-note detail ───────────────────────────────
        // Fetched once on dialog open and again after every creditNo
        // edit (the new creditNo resolves to a different Zoho record).
        // Surfaces customer name + pricelist for the header strip AND
        // caches the full Zoho object so submitToZoho can ship it back
        // verbatim instead of paying for a second fetch.
        async loadZohoDetail() {
            if (!this.reviewRow || !this.reviewRow._id) return
            // Skip rows that obviously won't resolve so we don't
            // burn a Zoho call on a record OCR couldn't read a
            // creditNo from. Backend would return 400 anyway; bail
            // early to avoid the loading flicker.
            if (!this.editedCreditNo) {
                this.zohoDetailError = 'No credit no on this row yet.'
                return
            }
            this.zohoDetailLoading = true
            this.zohoDetailError = ''
            const requestedId = this.reviewRow._id
            try {
                const res = await getCreditNoteZohoDetail(this.reviewRow._id)
                // Guard against the user closing the dialog (or opening
                // a different row) while this round trip was in flight
                // — without the check the stale response would clobber
                // the new row's state.
                if (!this.reviewRow || this.reviewRow._id !== requestedId) {
                    return
                }
                if (!res || res.success === false) {
                    throw new Error((res && res.message) || 'Failed to load Zoho detail')
                }
                this.zohoCreditNoteId = res.zohoCreditNoteId || null
                this.zohoCustomerName = res.customerName || null
                this.zohoPricebookId = res.pricebookId || null
                this.zohoDetail = res.detail || null
            } catch (e) {
                if (!this.reviewRow || this.reviewRow._id !== requestedId) {
                    return
                }
                this.zohoDetailError =
                    (e.response && e.response.data && e.response.data.message)
                    || e.message
                    || 'Failed to load Zoho detail'
                console.error('Zoho detail load failed:', e)
            } finally {
                if (this.reviewRow && this.reviewRow._id === requestedId) {
                    this.zohoDetailLoading = false
                }
            }
        },
        // Single-SKU variant of loadSkuMatches — used after an inline
        // SKU edit so the picker refreshes for just the changed row.
        // No-op when the SKU is already in the cache (the bulk lookup
        // may have already covered it on first open).
        async loadSingleSkuMatches(sku) {
            if (!sku) return
            if (Object.prototype.hasOwnProperty.call(this.matchesBySku, sku)) return
            try {
                const res = await bulkSkuMatches([sku])
                const data = (res && res.data) || {}
                this.matchesBySku = { ...this.matchesBySku, ...data }
                // Same single-match auto-select rule as the bulk path.
                const matches = data[sku] || []
                if (matches.length === 1 && !this.selections[sku]) {
                    const next = { ...this.selections }
                    next[sku] = matches[0].itemId
                    this.selections = next
                }
            } catch (e) {
                // Surface in the dialog's alert banner so the failure
                // is visible without dismissing the user's edit.
                this.matchesError = (e.response && e.response.data && e.response.data.message)
                    || e.message
                    || 'SKU match lookup failed'
                console.error('Single SKU match lookup failed:', e)
            }
        },
        // ── Inline Credit No edit ──────────────────────────────────
        // Same pattern as the SKU editor but for the credit no shown
        // in the dialog's header strip. Confirming PATCHes the field
        // and updates the live list row so the table reflects the
        // corrected number immediately.
        startEditCreditNo() {
            if (this.savingCreditNo) return
            this.editingCreditNo = true
            this.editingCreditNoDraft = this.editedCreditNo || ''
        },
        cancelEditCreditNo() {
            this.editingCreditNo = false
            this.editingCreditNoDraft = ''
        },
        async confirmEditCreditNo() {
            const newCn = String(this.editingCreditNoDraft || '').trim()
            if (!newCn) {
                this.$message.warning('Credit No cannot be empty.')
                return
            }
            const oldCn = this.editedCreditNo || ''
            if (newCn === oldCn) {
                this.cancelEditCreditNo()
                return
            }
            this.editedCreditNo = newCn
            this.editingCreditNo = false
            this.editingCreditNoDraft = ''
            this.savingCreditNo = true
            try {
                await updateCreditNote(this.reviewRow._id, { creditNo: newCn })
                // Also patch the source-of-truth reference inside the
                // dialog so submitToZoho (which reads reviewRow) and
                // any other future readers see the new value without
                // a re-open.
                if (this.reviewRow) {
                    this.$set(this.reviewRow, 'creditNo', newCn)
                }
                const i = this.list.findIndex(
                    r => String(r._id) === String(this.reviewRow._id)
                )
                if (i !== -1) {
                    this.$set(this.list, i, { ...this.list[i], creditNo: newCn })
                }
                // The new creditNo resolves to a different Zoho record
                // — clear the cached detail and re-fetch so the header
                // strip (customer + pricelist) and the cached payload
                // submitToZoho will send are both consistent with the
                // new lookup.
                this.zohoCreditNoteId = null
                this.zohoCustomerName = null
                this.zohoPricebookId = null
                this.zohoDetail = null
                this.zohoDetailError = ''
                this.loadZohoDetail()
            } catch (e) {
                this.editedCreditNo = oldCn
                const msg = (e.response && e.response.data && e.response.data.message)
                    || e.message
                    || 'Failed to save credit no'
                this.$message.error(msg)
                console.error('CreditNo edit persist failed:', e)
            } finally {
                this.savingCreditNo = false
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
/* .review-body wraps the header strip + the two-pane shell. The
   header is a fixed-height row; the shell flex-grows into the
   remaining vertical space so the inner panes still get the same
   70vh budget the previous layout assumed. */
.review-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 70vh;
    min-height: 480px;
}
.review-shell {
    display: flex;
    gap: 16px;
    flex: 1;
    min-height: 0;
}

/* Header strip — stacked rows. Row 1 is the editable Credit No; Row 2
   carries the read-only Zoho-side metadata (customer + pricelist) that
   /zohoDetail returns. Both rows share the same padded box so they
   read as one panel. */
.review-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 12px;
    background: #f9fafb;
    border: 1px solid #ebeef5;
    border-radius: 6px;
}
.review-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
}
.review-header-cn {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
}
/* Meta row — multiple labelled values side by side. Wraps on narrow
   widths so the row doesn't blow out the header height. */
.review-header-meta {
    flex-wrap: wrap;
    justify-content: flex-start;
    row-gap: 4px;
    column-gap: 18px;
}
.review-header-meta-item {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}
.review-header-loading {
    color: #909399;
    font-size: 13px;
    display: inline-flex;
    align-items: center;
}
.review-header-meta-error {
    color: #e6a23c;
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    /* Push error pill to the end of the meta row when present. */
    margin-left: auto;
    /* Truncate gracefully — the full error sits on the title for
       hover, the inline one stays a single line. */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 50%;
}
.review-header-meta-error i {
    font-size: 14px;
    flex-shrink: 0;
}
.review-header-label {
    color: #909399;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    flex-shrink: 0;
}
.review-header-value {
    color: #303133;
    font-size: 16px;
    font-weight: 600;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    /* Truncate gracefully if a credit no is suspiciously long rather
       than blowing out the header row's height. */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
}
.cn-edit-input {
    width: 220px;
    max-width: 60%;
}
.cn-edit-btn,
.cn-edit-action {
    padding: 4px !important;
    color: #909399;
}
.cn-edit-btn:hover {
    color: #2563eb;
}
.cn-edit-confirm {
    color: #67c23a !important;
}
.cn-edit-cancel {
    color: #f56c6c !important;
}

/* SKU inline-edit — input + confirm/cancel sit on the same baseline
   as the label. mini buttons keep the cell from growing taller in
   edit mode, which would shift the picker below. */
.sku-edit-input {
    width: 140px;
    margin-left: 2px;
}
.sku-edit-input ::v-deep .el-input__inner {
    height: 24px;
    line-height: 24px;
    padding: 0 6px;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.sku-edit-btn,
.sku-edit-action {
    padding: 2px 4px !important;
    margin-left: 2px;
    color: #c0c4cc;
    font-size: 13px;
}
.sku-edit-btn:hover {
    color: #2563eb;
}
.sku-edit-confirm {
    color: #67c23a !important;
}
.sku-edit-cancel {
    color: #f56c6c !important;
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

/* Items tab foot — Add button anchored under the table so the user
   reads top-down: existing rows → add. Left-aligned (the button itself
   is short text + icon) so the click target sits at the natural
   start-of-line where the eye lands after scanning the rows. Small
   top margin separates it from the last row without competing with
   the row's bottom border. */
.line-items-foot {
    display: flex;
    align-items: center;
    margin-top: 6px;
    padding: 2px 0 4px;
}
.line-item-remove {
    padding: 4px !important;
    color: #909399;
}
.line-item-remove:hover {
    color: #f56c6c;
}

/* The wrapper span keeps el-tooltip working on a disabled el-button —
   :disabled on the button itself swallows pointer events, so the
   tooltip needs an element with active pointer events around it.
   margin-left replaces Element UI's `el-button + el-button` adjacent-
   sibling spacing, which the wrapper breaks because the Close button
   is no longer a direct sibling of the Submit button. */
.submit-tooltip-anchor {
    display: inline-block;
    margin-left: 10px;
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

/* Mobile: stack the two panes vertically when there isn't room. The
   height container is now .review-body — release its fixed 70vh so
   the page can scroll naturally with the editable header strip on top
   and the two panes stacked underneath. */
@media (max-width: 900px) {
    .review-body {
        height: auto;
    }
    .review-shell {
        flex-direction: column;
        flex: 0 0 auto;
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
