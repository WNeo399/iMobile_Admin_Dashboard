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
                        :fetch-suggestions="searchCatalogueProducts"
                        :debounce="400"
                        :disabled="addingProduct"
                        placeholder="Search the catalogue by SKU or name to add an item…"
                        style="width: 100%"
                        :trigger-on-focus="false"
                        value-key="value"
                        clearable
                        prefix-icon="el-icon-search"
                        popper-class="oz-add-suggestions"
                        @select="onCatalogueProductSelected"
                    >
                        <template slot-scope="{ item }">
                            <div class="add-suggestion">
                                <div class="add-suggestion-name">{{ item.productName }}</div>
                                <div class="add-suggestion-meta">
                                    <span class="mono">{{ item.sku }}</span>
                                    <span v-if="item.quality && item.quality.name"> · {{ item.quality.name }}</span>
                                    <span v-if="item.color"> · {{ item.color }}</span>
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
                                    </template>
                                    <template v-else>
                                        <el-tag :type="statusTag(scope.row.status)" size="mini" effect="plain">
                                            {{ statusLabel(scope.row.status) }}
                                        </el-tag>
                                        <el-select v-if="scope.row.status === 'NO_QUALITY'"
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
                                            v-model="scope.row.selectedSku" size="mini" placeholder="Pick a SKU"
                                            class="repick">
                                            <el-option v-for="s in scope.row.skus" :key="s.sku" :value="s.sku"
                                                :label="`${s.sku} — ${s.color || 'no colour'}`" />
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
                    <span class="review-section-note">— this model/part isn't in the catalogue, so it's left out</span>
                </div>
                <el-table :data="notCataloguedRows" size="small" max-height="180">
                    <el-table-column label="Model" min-width="140">
                        <template slot-scope="scope">{{ scope.row.line._display.model }}</template>
                    </el-table-column>
                    <el-table-column label="Part" width="120">
                        <template slot-scope="scope">{{ scope.row.line._display.part }}</template>
                    </el-table-column>
                    <el-table-column label="Grade" width="120">
                        <template slot-scope="scope">{{ scope.row.line.requestedQuality }}</template>
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
    </div>
</template>

<script>
import { parseWorkbook, resolveRows } from '@/utils/ozMatcher'
import { buildOzLabelDoc } from '@/utils/ozLabels'
import { matchOzLines, listProducts } from '@/api/catalogue'
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
                availableQualities: result.availableQualities || [],
                availableColours: result.availableColours || [],
                usedQuality: result.usedQuality || '',
                selectedSku: '',
                // Editable per-row quantity (like the Buzztech import).
                // Defaults to 1; preserved across a re-match so the user
                // doesn't lose an edited qty when they re-pick a grade.
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

        // ── Re-pick (single-line re-match) ─────────────────────────
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
                // Aggregate by SKU → quantity (duplicate SKUs combine,
                // summing each row's editable qty).
                const qtyBySku = {}
                for (const r of this.readyRows) {
                    const q = Number(r.qty) > 0 ? Number(r.qty) : 1
                    qtyBySku[r.selectedSku] = (qtyBySku[r.selectedSku] || 0) + q
                }
                const skus = Object.keys(qtyBySku)

                const lookupRes = await bulkSkuLookup(skus)
                if (!lookupRes || lookupRes.success === false) {
                    throw new Error((lookupRes && lookupRes.message) || 'SKU resolution failed')
                }
                const map = lookupRes.data || {}

                const lineItems = []
                let excluded = 0
                for (const sku of skus) {
                    const hit = map[sku]
                    if (hit && hit.itemId) {
                        lineItems.push({ itemId: hit.itemId, quantity: qtyBySku[sku] })
                    } else {
                        excluded += 1
                    }
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
            const hit = (row.skus || []).find(s => s.sku === row.selectedSku)
            return (hit && hit.productName) || ''
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
        // ── Add a catalogue product manually ───────────────────────
        async searchCatalogueProducts(query, cb) {
            const q = (query || '').trim()
            if (!q) { cb([]); return }
            try {
                const res = await listProducts({ search: q, page: 1, pageSize: 20 })
                if (!res || res.success === false) { cb([]); return }
                const items = (res.data || []).map(p => ({
                    ...p,
                    // el-autocomplete writes value-key back into the input
                    // on select — show the product name there.
                    value: p.productName
                }))
                cb(items)
            } catch (e) {
                console.error('Catalogue search failed:', e)
                cb([])
            }
        },
        onCatalogueProductSelected(item) {
            if (!item || !item.sku) { this.addKeyword = ''; return }
            // Dedupe by SKU — if it's already on the list, just bump its
            // qty rather than adding a duplicate row.
            const existing = this.rows.find(r => r.selectedSku === item.sku)
            if (existing) {
                existing.qty = (Number(existing.qty) || 1) + 1
                this.$message.info(`"${item.productName}" is already in the list — qty bumped to ${existing.qty}.`)
                this.addKeyword = ''
                return
            }
            // Build a synthetic, already-resolved row so it flows through
            // readyRows + createOrder exactly like a matched line. `manual`
            // flags it so the cell shows an "ADD" tag instead of "OZ".
            const modelNames = (item.compatible_models || []).map(m => m.name).join(', ')
            this.rows.push({
                line: {
                    model_id: '',
                    color: item.color || null,
                    category: (item.category && item.category.id) || '',
                    requestedQuality: (item.quality && item.quality.name) || '',
                    _display: {
                        model: modelNames || '—',
                        part: (item.category && item.category.name) || ''
                    }
                },
                manual: true,
                status: 'MATCHED',
                skus: [{
                    sku: item.sku,
                    productName: item.productName,
                    quality: (item.quality && item.quality.name) || '',
                    color: item.color || null
                }],
                availableQualities: [],
                availableColours: [],
                usedQuality: '',
                selectedSku: item.sku,
                qty: 1,
                repickQuality: '',
                repickColour: '',
                rematching: false
            })
            this.$message.success(`Added "${item.productName}"`)
            this.addKeyword = ''
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
.repick { margin-left: 6px; width: 160px; }

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
    padding: 4px 0;
    line-height: 1.3;
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
