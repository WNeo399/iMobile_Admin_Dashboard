<template>
    <div class="oz-tool">
        <!-- ── Step 1: Pick the OZ sheet ─────────────────────────────────── -->
        <div v-if="step === 'pick'" class="step pick-step">
            <el-form label-width="90px" size="small">
                <el-form-item label="OZ Sheet" required>
                    <input
                        ref="fileInput"
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        class="hidden-input"
                        @change="onFilePicked"
                    />
                    <div class="file-row">
                        <el-button icon="el-icon-document" @click="$refs.fileInput.click()">Choose File</el-button>
                        <span v-if="fileName" class="file-name" :title="fileName">
                            {{ fileName }}
                            <span class="file-size">({{ formatBytes(fileSize) }})</span>
                        </span>
                        <span v-else class="file-name muted">No file selected</span>
                    </div>
                    <div class="form-hint">
                        An <strong>.xlsx</strong> or <strong>.csv</strong> in the OZ format — parsed in your browser, nothing is uploaded.
                    </div>
                </el-form-item>
            </el-form>

            <div v-if="resolvedLines.length > 0" class="parse-detected">
                <i class="el-icon-circle-check" />
                {{ resolvedLines.length }} product line{{ resolvedLines.length === 1 ? '' : 's' }} detected.
            </div>

            <el-alert v-if="parseError" :title="parseError" type="error" show-icon :closable="false" class="step-alert" />

            <div class="step-actions">
                <el-button
                    type="primary"
                    icon="el-icon-search"
                    :loading="matching"
                    :disabled="resolvedLines.length === 0"
                    @click="runMatch"
                >{{ matching ? 'Matching…' : `Match ${resolvedLines.length || ''} line${resolvedLines.length === 1 ? '' : 's'}` }}</el-button>
            </div>
        </div>

        <!-- ── Step 2: Review match results ──────────────────────────────── -->
        <div v-else-if="step === 'review'" class="step review-step">
            <div class="review-summary">
                <span><strong>{{ fileName }}</strong></span>
                <el-tag size="small" type="success">{{ readyRows.length }} ready</el-tag>
                <el-tag v-if="attentionRows.length" size="small" type="warning">
                    {{ attentionRows.length }} need attention
                </el-tag>
                <el-tag v-if="notCataloguedRows.length" size="small" type="info">
                    {{ notCataloguedRows.length }} not catalogued
                </el-tag>
            </div>

            <!-- Matchable lines (everything except NO_PART) -->
            <div class="review-section">
                <div class="review-section-title">Line items ({{ matchableRows.length }})</div>

                <!--
                    Add-product search — same idea as the Buzztech import's
                    "add to order" autocomplete, but searches the IMB
                    catalogue (imb_products) by SKU or name. Picking one
                    appends a ready-to-order row, so the buyer can top up
                    the parsed sheet with extra items.
                -->
                <div class="add-product-row">
                    <el-autocomplete
                        v-model="addKeyword"
                        :fetch-suggestions="searchZohoProducts"
                        :debounce="400"
                        :disabled="addingProduct"
                        placeholder="Search Zoho products by name or SKU to add an item…"
                        style="width: 100%"
                        :trigger-on-focus="false"
                        value-key="name"
                        clearable
                        prefix-icon="el-icon-search"
                        popper-class="oz-add-suggestions"
                        @select="onZohoProductSelected"
                    >
                        <template slot-scope="{ item }">
                            <div class="add-suggestion">
                                <img
                                    v-if="item.imgUrl"
                                    :src="item.imgUrl"
                                    class="add-suggestion-img"
                                    @error="onSuggestionImgError($event)"
                                />
                                <div v-else class="add-suggestion-img add-suggestion-img-ph">
                                    <i class="el-icon-picture-outline" />
                                </div>
                                <div class="add-suggestion-info">
                                    <div class="add-suggestion-name">{{ item.name }}</div>
                                    <div v-if="item.sku" class="add-suggestion-meta">
                                        <span class="mono">{{ item.sku }}</span>
                                    </div>
                                </div>
                            </div>
                        </template>
                    </el-autocomplete>
                </div>

                <el-table :data="matchableRows" size="small" stripe max-height="360"
                    empty-text="No matchable lines">
                    <el-table-column label="SKU" width="110">
                        <template slot-scope="scope">
                            <span v-if="scope.row.selectedSku" class="mono">{{ scope.row.selectedSku }}</span>
                            <span v-else class="muted">—</span>
                        </template>
                    </el-table-column>
                    <!--
                        Two-line "request vs match" cell, mirroring the
                        Buzztech import's PDF/Zoho cell: top line is the OZ
                        sheet request (model · part · colour · grade), bottom
                        line is the matched Zoho product — OR, when the line
                        still needs attention, the status tag + a re-pick
                        dropdown inline.
                    -->
                    <el-table-column label="Request vs Match" min-width="380">
                        <template slot-scope="scope">
                            <div class="desc-cell">
                                <div class="desc-line desc-oz" :title="requestText(scope.row)">
                                    <span class="desc-tag oz-tag">{{ scope.row.manual ? 'ADD' : 'OZ' }}</span>
                                    <span class="desc-text">{{ requestText(scope.row) }}</span>
                                </div>
                                <div class="desc-line desc-zoho">
                                    <template v-if="scope.row.selectedSku">
                                        <span class="desc-tag zoho-tag">Zoho</span>
                                        <span class="desc-text" :title="matchedName(scope.row)">
                                            {{ matchedName(scope.row) }}
                                        </span>
                                        <span v-if="scope.row.status === 'MATCHED_FALLBACK'" class="fallback-badge">
                                            {{ scope.row.usedQuality }} substituted
                                        </span>
                                        <!-- Re-pick a different product for this line via the search dialog. -->
                                        <el-button type="text" size="mini" icon="el-icon-edit"
                                            class="change-match-btn" @click="openMapDialog(scope.row)">Change</el-button>
                                    </template>
                                    <template v-else>
                                        <el-tag :type="statusTag(scope.row.status)" size="mini" effect="plain">
                                            {{ statusLabel(scope.row.status) }}
                                        </el-tag>
                                        <!-- "Other" (free-text) parts resolve by picking the actual
                                             product (full name), since their category may not map to
                                             stocked grades/colours cleanly. -->
                                        <el-select v-if="isOtherPart(scope.row) && (scope.row.candidates || []).length"
                                            v-model="scope.row.selectedSku" size="mini" placeholder="Pick a product"
                                            class="repick repick-wide" filterable>
                                            <el-option v-for="s in scope.row.candidates" :key="s.sku" :value="s.sku"
                                                :label="skuOptionLabel(s)" />
                                        </el-select>
                                        <!-- Standard parts: re-pick grade / colour (re-matches), or
                                             pick the product when several variants match. -->
                                        <el-select v-else-if="scope.row.status === 'NO_QUALITY'"
                                            v-model="scope.row.repickQuality" size="mini" placeholder="Pick a quality"
                                            class="repick" :loading="scope.row.rematching"
                                            @change="(v) => repickQuality(scope.row, v)">
                                            <el-option v-for="q in scope.row.availableQualities" :key="q" :value="q" :label="q" />
                                        </el-select>
                                        <el-select v-else-if="scope.row.status === 'NO_COLOUR'"
                                            v-model="scope.row.repickColour" size="mini" placeholder="Pick a colour"
                                            class="repick" :loading="scope.row.rematching"
                                            @change="(v) => repickColour(scope.row, v)">
                                            <el-option v-for="c in scope.row.availableColours" :key="c" :value="c" :label="c" />
                                        </el-select>
                                        <el-select v-else-if="scope.row.status === 'MULTIPLE'"
                                            v-model="scope.row.selectedSku" size="mini" placeholder="Pick a product"
                                            class="repick repick-wide" filterable>
                                            <el-option v-for="s in scope.row.skus" :key="s.sku" :value="s.sku"
                                                :label="skuOptionLabel(s)" />
                                        </el-select>
                                    </template>
                                </div>
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column label="Qty" width="110" align="center">
                        <template slot-scope="scope">
                            <el-input-number v-model="scope.row.qty" :min="1" :max="9999" size="mini"
                                controls-position="right" :disabled="!scope.row.selectedSku" style="width: 100%" />
                        </template>
                    </el-table-column>
                    <el-table-column label="" width="50" align="center">
                        <template slot-scope="scope">
                            <el-button size="mini" type="text" icon="el-icon-delete" class="remove-btn"
                                @click="removeRow(scope.row)" />
                        </template>
                    </el-table-column>
                </el-table>
            </div>

            <!-- Lines with no catalogue match at all -->
            <div v-if="notCataloguedRows.length" class="review-section">
                <div class="review-section-title warn">
                    <i class="el-icon-warning-outline" />
                    Not catalogued ({{ notCataloguedRows.length }})
                    <span class="review-section-note">— not in the catalogue. Use "Find product" to map one, or it's left out.</span>
                </div>
                <el-table :data="notCataloguedRows" size="small" max-height="220">
                    <el-table-column label="Model" min-width="140">
                        <template slot-scope="scope">{{ scope.row.line._display.model }}</template>
                    </el-table-column>
                    <el-table-column label="Part" width="120">
                        <template slot-scope="scope">{{ scope.row.line._display.part }}</template>
                    </el-table-column>
                    <el-table-column label="Grade" width="110">
                        <template slot-scope="scope">{{ scope.row.line.requestedQuality }}</template>
                    </el-table-column>
                    <el-table-column label="" width="140" align="center">
                        <template slot-scope="scope">
                            <el-button size="mini" type="primary" plain icon="el-icon-search"
                                @click="openMapDialog(scope.row)">Find product</el-button>
                        </template>
                    </el-table-column>
                </el-table>
            </div>

            <el-alert v-if="submitError" :title="submitError" type="error" show-icon :closable="false" class="step-alert" />

            <div class="step-actions space-between">
                <el-button :disabled="submitting" @click="backToPick">Back</el-button>
                <el-button
                    type="primary"
                    icon="el-icon-shopping-cart-2"
                    :loading="submitting"
                    :disabled="readyRows.length === 0"
                    @click="createOrder"
                >{{ submitting ? 'Creating…' : `Create Draft Order (${readyRows.length})` }}</el-button>
            </div>
        </div>

        <!-- ── Step 3: Done ──────────────────────────────────────────────── -->
        <div v-else-if="step === 'done'" class="step done-step">
            <div class="done-icon"><i class="el-icon-circle-check" /></div>
            <div class="done-title">Draft sales order {{ createdOrder.salesOrderNumber || createdOrder.salesOrderId }} created</div>
            <div class="done-sub">
                {{ submittedLineCount }} line item<span v-if="submittedLineCount !== 1">s</span>
                added as a draft from <strong>{{ fileName }}</strong>.
            </div>
            <div v-if="excludedCount > 0" class="exclude-result">
                <i class="el-icon-warning-outline" />
                {{ excludedCount }} matched SKU<span v-if="excludedCount !== 1">s</span>
                couldn't be resolved to a Zoho item and {{ excludedCount === 1 ? 'was' : 'were' }} left out.
            </div>

            <!-- Label attach outcome — best-effort, surfaced so the user
                 knows whether to attach manually if Zoho rejected it. -->
            <div v-if="attachResult" :class="['label-attach', attachResult.ok ? 'ok' : 'fail']">
                <i :class="attachResult.ok ? 'el-icon-document-checked' : 'el-icon-warning-outline'" />
                <span v-if="attachResult.ok">Labels PDF attached to the sales order.</span>
                <span v-else>Couldn't attach labels to the order: {{ attachResult.message }}. You can still download + print them below.</span>
            </div>

            <div class="step-actions center">
                <el-button @click="reset">Create another</el-button>
                <el-button v-if="labelDoc" icon="el-icon-printer" @click="downloadLabels">
                    Download Labels ({{ labelCount }})
                </el-button>
                <el-button type="primary" icon="el-icon-link" @click="openInZoho">Open in Zoho</el-button>
            </div>
        </div>

        <!-- ── Map a not-catalogued line to a Zoho product ───────────────── -->
        <el-dialog
            :title="mapDialogTitle"
            :visible.sync="mapDialogOpen"
            width="520px"
            append-to-body
            :close-on-click-modal="false"
            @closed="onMapDialogClosed"
        >
            <div v-if="mapTargetRow" class="map-dialog-body">
                <div class="map-request">
                    <span class="desc-tag oz-tag">OZ</span>
                    <span class="desc-text">{{ requestText(mapTargetRow) }}</span>
                </div>
                <el-autocomplete
                    v-model="mapKeyword"
                    :fetch-suggestions="searchZohoProducts"
                    :debounce="400"
                    placeholder="Search Zoho products by name or SKU…"
                    style="width: 100%"
                    :trigger-on-focus="false"
                    value-key="name"
                    clearable
                    prefix-icon="el-icon-search"
                    popper-class="oz-add-suggestions"
                    @select="onMapProductSelected"
                >
                    <template slot-scope="{ item }">
                        <div class="add-suggestion">
                            <img
                                v-if="item.imgUrl"
                                :src="item.imgUrl"
                                class="add-suggestion-img"
                                @error="onSuggestionImgError($event)"
                            />
                            <div v-else class="add-suggestion-img add-suggestion-img-ph">
                                <i class="el-icon-picture-outline" />
                            </div>
                            <div class="add-suggestion-info">
                                <div class="add-suggestion-name">{{ item.name }}</div>
                                <div v-if="item.sku" class="add-suggestion-meta">
                                    <span class="mono">{{ item.sku }}</span>
                                </div>
                            </div>
                        </div>
                    </template>
                </el-autocomplete>
                <div class="map-hint">
                    Pick the Zoho product to map this line to. Its job number is kept on the order.
                </div>
            </div>
            <div slot="footer">
                <el-button @click="mapDialogOpen = false">Cancel</el-button>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import { parseWorkbook, resolveRows } from '@/utils/ozMatcher'
import { buildOzLabelDoc } from '@/utils/ozLabels'
import { matchOzLines } from '@/api/catalogue'
import { searchProducts } from '@/api/zoho/products/product'
import { bulkSkuLookup, createSalesOrder, attachToSalesOrder } from '@/api/tools/ozOrder'

// Fixed OZ customer + pricebook (provided by the business). Every Oz
// order is raised against this account at this pricelist; staff can
// re-assign in Zoho afterwards if needed.
const OZ_CUSTOMER_ID = '2591985000003130211'
const OZ_PRICEBOOK_ID = '2591985000078196985'
const ZOHO_ORG_ID = '746138234'

const STATUS_META = {
    MATCHED: { label: 'Matched', tag: 'success' },
    MATCHED_FALLBACK: { label: 'Matched (fallback)', tag: 'warning' },
    MULTIPLE: { label: 'Multiple — pick one', tag: 'primary' },
    NO_QUALITY: { label: 'Grade not stocked', tag: 'danger' },
    NO_COLOUR: { label: 'Colour not stocked', tag: 'danger' },
    NO_PART: { label: 'Not catalogued', tag: 'info' }
}

export default {
    name: 'CreateOzOrder',
    data() {
        return {
            step: 'pick',            // 'pick' | 'review' | 'done'
            fileName: '',
            fileSize: 0,
            parseError: '',
            resolvedLines: [],
            matching: false,

            rows: [],
            // Add-product autocomplete (review step)
            addKeyword: '',
            addingProduct: false,
            // Map-a-not-catalogued-line dialog
            mapDialogOpen: false,
            mapTargetRow: null,
            mapKeyword: '',
            submitting: false,
            submitError: '',

            createdOrder: {},
            submittedLineCount: 0,
            excludedCount: 0,

            // Printable job labels — generated on the done step from the
            // OZ rows. labelDoc is the jsPDF instance (kept so Download
            // can .save() it); attachResult records the best-effort
            // attach to the Zoho SO.
            labelDoc: null,
            labelFilename: '',
            labelCount: 0,
            attachResult: null
        }
    },
    computed: {
        readyRows() { return this.rows.filter(r => r.selectedSku) },
        notCataloguedRows() { return this.rows.filter(r => r.status === 'NO_PART') },
        matchableRows() { return this.rows.filter(r => r.status !== 'NO_PART') },
        attentionRows() {
            return this.rows.filter(r => !r.selectedSku && r.status !== 'NO_PART')
        },
        mapDialogTitle() {
            if (!this.mapTargetRow) return 'Find product'
            const d = (this.mapTargetRow.line && this.mapTargetRow.line._display) || {}
            const label = [d.model, d.part].filter(Boolean).join(' · ')
            return label ? `Find product — ${label}` : 'Find product'
        }
    },
    methods: {
        // ── Step 1: pick + parse ───────────────────────────────────
        onFilePicked(event) {
            const f = event.target.files && event.target.files[0]
            event.target.value = ''
            if (!f) return
            if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
                this.$message.error('Please choose an .xlsx or .csv file')
                return
            }
            this.fileName = f.name
            this.fileSize = f.size
            this.parseError = ''
            this.resolvedLines = []
            const reader = new FileReader()
            reader.onload = (e) => {
                try {
                    const parsed = parseWorkbook(e.target.result)
                    const lines = resolveRows(parsed)
                    if (lines.length === 0) {
                        this.parseError = 'No product lines found in the sheet. Check it matches the OZ format.'
                        return
                    }
                    this.resolvedLines = lines
                } catch (err) {
                    console.error('OZ parse failed:', err)
                    this.parseError = this.describeError(err) || 'Failed to parse the workbook.'
                }
            }
            reader.onerror = () => { this.parseError = 'Could not read the file.' }
            reader.readAsArrayBuffer(f)
        },

        // ── Match ──────────────────────────────────────────────────
        async runMatch() {
            if (this.resolvedLines.length === 0 || this.matching) return
            this.matching = true
            try {
                const res = await matchOzLines(this.resolvedLines)
                if (!res || res.success === false) throw new Error((res && res.message) || 'Match failed')
                this.rows = (res.results || []).map(r => this.toRow(r))
                this.step = 'review'
            } catch (e) {
                console.error('Match failed:', e)
                this.parseError = this.describeError(e)
            } finally {
                this.matching = false
            }
        },
        toRow(result, prevQty) {
            const row = {
                line: result.line,
                status: result.status,
                skus: result.skus || [],
                // For "Other" parts: products the user can pick directly
                // (MULTIPLE → the matches; NO_QUALITY / NO_COLOUR → the full
                // model+part pool).
                candidates: result.candidates || result.skus || [],
                // For standard parts: grade / colour re-pick options.
                availableQualities: result.availableQualities || [],
                availableColours: result.availableColours || [],
                usedQuality: result.usedQuality || '',
                selectedSku: '',
                // Editable per-row quantity (like the Buzztech import).
                // Preserved across a re-match so an edited qty isn't lost.
                qty: prevQty && prevQty > 0 ? prevQty : 1,
                repickQuality: '',
                repickColour: '',
                rematching: false
            }
            if ((result.status === 'MATCHED' || result.status === 'MATCHED_FALLBACK') && row.skus[0]) {
                row.selectedSku = row.skus[0].sku
            }
            return row
        },

        // "Other" parts come from the sheet's free-text Other column; ozMatcher
        // tags them with a source like "other:Sim Tray". They're resolved by
        // picking the product directly; standard part columns (Frame / Screen /
        // Battery / Charging Port) re-pick grade / colour and re-match.
        isOtherPart(row) {
            return String((row && row.line && row.line.source) || '')
                .toLowerCase()
                .startsWith('other')
        },

        // ── Re-pick (single-line re-match, standard parts) ─────────
        async repickQuality(row, quality) {
            await this.rematchLine(row, { ...row.line, requestedQuality: quality })
        },
        async repickColour(row, colour) {
            await this.rematchLine(row, { ...row.line, color: colour })
        },
        async rematchLine(row, newLine) {
            row.rematching = true
            try {
                const res = await matchOzLines([newLine])
                if (!res || res.success === false) throw new Error((res && res.message) || 'Re-match failed')
                const result = (res.results || [])[0]
                if (!result) return
                const updated = this.toRow({ ...result, line: { ...newLine, _display: row.line._display } }, row.qty)
                const idx = this.rows.indexOf(row)
                if (idx !== -1) this.$set(this.rows, idx, updated)
            } catch (e) {
                console.error('Re-match failed:', e)
                this.$message.error(this.describeError(e))
            } finally {
                row.rematching = false
            }
        },

        // ── Create order ───────────────────────────────────────────
        async createOrder() {
            if (this.readyRows.length === 0 || this.submitting) return
            this.submitting = true
            this.submitError = ''
            try {
                // Resolve every distinct SKU to a Zoho item id in one round trip.
                const skus = [...new Set(this.readyRows.map(r => r.selectedSku))]

                const lookupRes = await bulkSkuLookup(skus)
                if (!lookupRes || lookupRes.success === false) {
                    throw new Error((lookupRes && lookupRes.message) || 'SKU resolution failed')
                }
                const map = lookupRes.data || {}

                // One line item per row so each carries its own job number as
                // the Zoho line description — lets staff trace a line back to
                // the job it's for. (Duplicate SKUs across different jobs become
                // separate lines.) Rows whose SKU doesn't resolve are excluded.
                const lineItems = []
                let excluded = 0
                for (const r of this.readyRows) {
                    const hit = map[r.selectedSku]
                    if (!hit || !hit.itemId) { excluded += 1; continue }
                    const line = {
                        itemId: hit.itemId,
                        quantity: Number(r.qty) > 0 ? Number(r.qty) : 1
                    }
                    const jobNumber = r.line && r.line._label && r.line._label.jobNumber
                    if (jobNumber) line.description = `Job Number: ${jobNumber}`
                    lineItems.push(line)
                }
                if (lineItems.length === 0) {
                    throw new Error('None of the matched SKUs resolved to a Zoho item. Order not created.')
                }

                const res = await createSalesOrder({
                    customerId: OZ_CUSTOMER_ID,
                    priceListId: OZ_PRICEBOOK_ID,
                    lineItems,
                    notes: `Created from OZ order sheet "${this.fileName}" via Create Oz Order tool.`
                })
                if (!res || res.success === false) throw new Error((res && res.message) || 'Order creation failed')

                this.createdOrder = res.data || {}
                this.submittedLineCount = lineItems.length
                this.excludedCount = excluded

                // Build the printable job labels from the OZ rows still
                // in the list (one per job — manual catalogue adds have no
                // _label and are skipped). Then attach the PDF to the SO
                // best-effort, so it's stapled to the order in Zoho too.
                this.buildLabels()
                if (this.labelDoc && this.createdOrder.salesOrderId) {
                    this.attachResult = await this.attachLabels(this.createdOrder.salesOrderId)
                }

                this.step = 'done'
            } catch (e) {
                console.error('Create Oz order failed:', e)
                this.submitError = this.describeError(e)
            } finally {
                this.submitting = false
            }
        },

        // ── Row helpers ────────────────────────────────────────────
        // Top line of the cell — the OZ sheet's request, reading
        // "Model · Part · Colour · Grade" (colour omitted for screens
        // / colourless parts).
        requestText(row) {
            const d = row.line._display || {}
            const parts = [d.model, d.part]
            if (row.line.color) parts.push(row.line.color)
            if (row.line.requestedQuality) parts.push(row.line.requestedQuality)
            return parts.filter(Boolean).join(' · ')
        },
        // Bottom line — the matched Zoho product name for the selected
        // SKU.
        matchedName(row) {
            // The selected SKU can come from skus (MATCHED / MULTIPLE) or from
            // candidates (the "Other" product picker), so search both.
            const pool = [...(row.skus || []), ...(row.candidates || [])]
            const hit = pool.find(s => s.sku === row.selectedSku)
            return (hit && hit.productName) || ''
        },
        // Option label for the "pick a product" dropdown on MULTIPLE rows —
        // the full Zoho product name, falling back to SKU · colour.
        skuOptionLabel(s) {
            if (s && s.productName) return s.productName
            return `${(s && s.sku) || ''} — ${(s && s.color) || 'no colour'}`
        },
        removeRow(row) {
            const idx = this.rows.indexOf(row)
            if (idx !== -1) this.rows.splice(idx, 1)
        },
        // ── Printable labels ───────────────────────────────────────
        // One label per OZ job row (rows carrying _label). Manual
        // catalogue adds have no _label, so they're excluded. Builds
        // the jsPDF doc and stashes it for download.
        buildLabels() {
            const today = this.todayStr()
            const labels = this.rows
                .filter(r => r.line && r.line._label && r.line._label.jobNumber)
                .map(r => ({
                    ...r.line._label,
                    date: r.line._label.date || today
                }))
            this.labelCount = labels.length
            if (labels.length === 0) {
                this.labelDoc = null
                this.labelFilename = ''
                return
            }
            this.labelDoc = buildOzLabelDoc(labels)
            const ref = this.createdOrder.salesOrderNumber || this.todayStr().replace(/\//g, '-')
            this.labelFilename = `oz-labels_${ref}.pdf`
        },
        async attachLabels(salesOrderId) {
            if (!this.labelDoc) return null
            try {
                const blob = this.labelDoc.output('blob')
                const form = new FormData()
                form.append('salesOrderId', String(salesOrderId))
                form.append('file', blob, this.labelFilename)
                const res = await attachToSalesOrder(form)
                if (res && res.success) return { ok: true, filename: this.labelFilename }
                return { ok: false, message: (res && res.message) || 'Attach failed' }
            } catch (e) {
                console.error('Label attach failed:', e)
                return { ok: false, message: this.describeError(e) }
            }
        },
        downloadLabels() {
            if (!this.labelDoc) {
                this.$message.warning('No labels to download.')
                return
            }
            this.labelDoc.save(this.labelFilename)
        },
        todayStr() {
            const d = new Date()
            const dd = String(d.getDate()).padStart(2, '0')
            const mm = String(d.getMonth() + 1).padStart(2, '0')
            return `${dd}/${mm}/${d.getFullYear()}`
        },
        // ── Add a product manually (Zoho Commerce search) ──────────
        // Same source as the Create Sales Order tool — searches Zoho Commerce
        // by name / SKU. The picked product's SKU flows through createOrder's
        // bulkSkuLookup at submit time, exactly like a matched OZ line.
        async searchZohoProducts(query, cb) {
            const q = (query || '').trim()
            if (!q) { cb([]); return }
            try {
                const res = await searchProducts(q)
                if (!res || res.success === false) { cb([]); return }
                const products = Array.isArray(res.data) ? res.data : []
                cb(products.map(p => ({
                    ...p,
                    name: p.name || p.product_name || p.title || '',
                    sku: p.sku
                        || (Array.isArray(p.skus) && p.skus[0] && p.skus[0].sku)
                        || (p.variants && p.variants[0] && p.variants[0].sku)
                        || '',
                    imgUrl: this.extractProductImage(p)
                // OZ orders must never use secondhand stock — drop it here too.
                })).filter(p => !/second\s*hand/i.test(p.name)))
            } catch (e) {
                console.error('Zoho product search failed:', e)
                cb([])
            }
        },
        // Resolve a product thumbnail from the Commerce payload — same logic as
        // the Create Sales Order tool.
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
        onZohoProductSelected(item) {
            if (!item) { this.addKeyword = ''; return }
            if (!item.sku) {
                this.$message.error(
                    `"${item.name || 'This product'}" has no SKU — add one in Zoho before adding it here.`
                )
                this.addKeyword = ''
                return
            }
            // Dedupe by SKU — bump qty if it's already on the list.
            const existing = this.rows.find(r => r.selectedSku === item.sku)
            if (existing) {
                existing.qty = (Number(existing.qty) || 1) + 1
                this.$message.info(`"${item.name}" is already in the list — qty bumped to ${existing.qty}.`)
                this.addKeyword = ''
                return
            }
            // Synthetic, already-resolved row so it flows through readyRows +
            // createOrder like a matched line. `manual` flags it so the cell
            // shows an "ADD" tag instead of "OZ".
            this.rows.push({
                line: {
                    model_id: '',
                    color: null,
                    category: '',
                    requestedQuality: '',
                    _display: { model: item.name, part: '' }
                },
                manual: true,
                status: 'MATCHED',
                skus: [{ sku: item.sku, productName: item.name }],
                candidates: [],
                usedQuality: '',
                selectedSku: item.sku,
                qty: 1
            })
            this.$message.success(`Added "${item.name}"`)
            this.addKeyword = ''
        },
        // ── Map a not-catalogued line to a Zoho product ────────────
        openMapDialog(row) {
            this.mapTargetRow = row
            this.mapKeyword = ''
            this.mapDialogOpen = true
        },
        onMapDialogClosed() {
            this.mapTargetRow = null
            this.mapKeyword = ''
        },
        onMapProductSelected(item) {
            const row = this.mapTargetRow
            if (!row) { this.mapKeyword = ''; return }
            if (!item || !item.sku) {
                this.$message.error(
                    `"${(item && item.name) || 'This product'}" has no SKU — add one in Zoho first.`
                )
                this.mapKeyword = ''
                return
            }
            // Map the not-catalogued line onto the chosen product. Mutating
            // status/selectedSku moves it out of "Not catalogued" into the
            // matchable list as a ready line, keeping its job number so the
            // created Zoho line item still carries it as the description.
            this.$set(row, 'skus', [{ sku: item.sku, productName: item.name }])
            this.$set(row, 'candidates', [])
            this.$set(row, 'selectedSku', item.sku)
            this.$set(row, 'status', 'MATCHED')
            this.$message.success(`Mapped to "${item.name}"`)
            this.mapDialogOpen = false
            this.mapKeyword = ''
        },
        // ── Navigation / misc ──────────────────────────────────────
        backToPick() {
            this.step = 'pick'
            this.submitError = ''
        },
        reset() {
            this.step = 'pick'
            this.fileName = ''
            this.fileSize = 0
            this.parseError = ''
            this.resolvedLines = []
            this.rows = []
            this.submitError = ''
            this.createdOrder = {}
            this.submittedLineCount = 0
            this.excludedCount = 0
            this.labelDoc = null
            this.labelFilename = ''
            this.labelCount = 0
            this.attachResult = null
        },
        openInZoho() {
            if (!this.createdOrder || !this.createdOrder.salesOrderId) return
            const url = `https://inventory.zoho.com/app/${ZOHO_ORG_ID}#/salesorders/${this.createdOrder.salesOrderId}`
            window.open(url, '_blank', 'noopener,noreferrer')
        },
        statusLabel(s) { return (STATUS_META[s] && STATUS_META[s].label) || s },
        statusTag(s) { return (STATUS_META[s] && STATUS_META[s].tag) || 'info' },
        describeError(e) {
            if (!e) return 'Something went wrong'
            if (e.response && e.response.data) {
                return e.response.data.message || `HTTP ${e.response.status}`
            }
            return e.message || String(e)
        },
        formatBytes(n) {
            if (!Number.isFinite(n) || n <= 0) return '—'
            if (n < 1024) return `${n} B`
            if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
            return `${(n / 1024 / 1024).toFixed(2)} MB`
        }
    }
}
</script>

<style scoped>
.oz-tool { padding: 4px 0; }
.hidden-input {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
}

/* Step wrappers — same language as the Buzztech import dialog. */
.step { display: flex; flex-direction: column; gap: 14px; }
.step-alert { margin: 0; }
.step-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 4px;
}
.step-actions.space-between { justify-content: space-between; }
.step-actions.center { justify-content: center; }

/* Pick step */
.file-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.file-name {
    color: #303133;
    font-size: 13px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 320px;
}
.file-name.muted { color: #909399; font-weight: normal; }
.file-size { color: #909399; font-weight: normal; margin-left: 4px; }
.form-hint { color: #909399; font-size: 12px; margin-top: 4px; }
.parse-detected {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #15803d;
    font-size: 13px;
    i { font-size: 15px; }
}

/* Review step */
.review-summary {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 10px 12px;
    background: #f5f7fb;
    border: 1px solid #ebeef5;
    border-radius: 6px;
    font-size: 13px;
    color: #303133;
}
.review-section { display: flex; flex-direction: column; gap: 6px; }
.add-product-row { margin: 0 0 8px; }
.review-section-title {
    font-size: 13px;
    font-weight: 600;
    color: #303133;
    display: flex;
    align-items: center;
    gap: 6px;
}
.review-section-title.warn { color: #b06b00; }
.review-section-note { color: #909399; font-weight: normal; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.muted { color: #c0c4cc; font-style: italic; }
.fallback-badge { margin-left: 6px; font-size: 11px; color: #e6a23c; }
.change-match-btn { margin-left: 6px; padding: 0 !important; font-size: 12px; }
.repick { margin-left: 6px; width: 160px; }
/* Product-pick dropdown carries full product names — give it more room. */
.repick-wide { width: 280px; max-width: 100%; }

/* Map-not-catalogued dialog */
.map-dialog-body { display: flex; flex-direction: column; gap: 12px; }
.map-request {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #303133;
    padding: 8px 10px;
    background: #f5f7fb;
    border: 1px solid #ebeef5;
    border-radius: 6px;
}
.map-hint { color: #909399; font-size: 12px; }

/* Two-line request/match cell — same shape as the Buzztech import's
   PDF/Zoho description cell. */
.desc-cell { display: flex; flex-direction: column; gap: 3px; }
.desc-line {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    line-height: 1.35;
    overflow: hidden;
}
.desc-tag {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 3px;
    flex-shrink: 0;
    letter-spacing: 0.3px;
}
.oz-tag   { background: #fff7ed; color: #c2410c; }
.zoho-tag { background: #f0fdf4; color: #15803d; }
.desc-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.desc-oz .desc-text   { color: #303133; }
.desc-zoho .desc-text { color: #606266; }

/* Remove button on each line — quiet by default, red on hover. */
.remove-btn { padding: 4px !important; color: #909399; }
.remove-btn:hover { color: #f56c6c; }

/* Done step */
.done-step { text-align: center; padding: 16px 0 8px; }
.done-icon { color: #67C23A; font-size: 48px; margin-bottom: 8px; }
.done-title { font-size: 17px; font-weight: 600; color: #111827; margin-bottom: 4px; }
.done-sub { color: #606266; font-size: 13px; margin-bottom: 16px; line-height: 1.5; }
.exclude-result {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.4;
    text-align: left;
    margin: 0 auto 16px;
    max-width: 480px;
    background: #fffaf0;
    border: 1px solid #fde68a;
    color: #92400e;
    i { font-size: 16px; flex-shrink: 0; }
}
.label-attach {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.4;
    text-align: left;
    margin: 0 auto 16px;
    max-width: 480px;
    i { font-size: 16px; flex-shrink: 0; }
}
.label-attach.ok { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
.label-attach.fail { background: #fffaf0; border: 1px solid #fde68a; color: #92400e; }

/* Mobile */
@media (max-width: 600px) {
    .step-actions { flex-direction: column-reverse; gap: 8px; }
    .step-actions .el-button { width: 100%; margin-left: 0 !important; }
    .step-actions.space-between .el-button { width: 100%; }
    .repick { width: 100%; margin-left: 0; margin-top: 4px; }
}
</style>

<style>
/* Add-product suggestion popup — unscoped because Element UI teleports
   the autocomplete popper outside the component root. */
.oz-add-suggestions .add-suggestion {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
    line-height: 1.3;
}
.oz-add-suggestions .add-suggestion-img {
    width: 40px;
    height: 40px;
    object-fit: cover;
    border-radius: 4px;
    flex-shrink: 0;
    background: #f5f7fa;
}
.oz-add-suggestions .add-suggestion-img-ph {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #c0c4cc;
    font-size: 18px;
}
.oz-add-suggestions .add-suggestion-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
}
.oz-add-suggestions .add-suggestion-name {
    font-weight: 500;
    color: #303133;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.oz-add-suggestions .add-suggestion-meta {
    color: #909399;
    font-size: 12px;
}
.oz-add-suggestions .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
