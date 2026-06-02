<template>
    <div class="buzztech-tool">
        <!-- ── Step 1: Pick shop + PDF ───────────────────────────────────── -->
        <div v-if="step === 'pick'" class="step pick-step">
            <el-form :model="picker" label-width="80px" size="small">
                <el-form-item label="Shop" required>
                    <el-select
                        v-model="picker.shopId"
                        placeholder="Select a shop"
                        style="width: 100%"
                        :disabled="parsing"
                    >
                        <el-option
                            v-for="s in shopOptions"
                            :key="s.id"
                            :label="s.label"
                            :value="s.id"
                        />
                    </el-select>
                </el-form-item>

                <el-form-item label="PO PDF" required>
                    <input
                        ref="fileInput"
                        type="file"
                        accept="application/pdf,.pdf"
                        class="hidden-input"
                        @change="onFilePicked"
                    />
                    <div class="file-row">
                        <el-button
                            icon="el-icon-document"
                            :disabled="parsing"
                            @click="$refs.fileInput.click()"
                        >Choose PDF</el-button>
                        <span v-if="picker.file" class="file-name" :title="picker.file.name">
                            {{ picker.file.name }}
                            <span class="file-size">({{ formatBytes(picker.file.size) }})</span>
                        </span>
                        <span v-else class="file-name muted">No file selected</span>
                    </div>
                    <div class="form-hint">
                        Filename must start with <strong>PO</strong>, e.g. <code>PO 9681.pdf</code>.
                    </div>
                </el-form-item>
            </el-form>

            <el-alert
                v-if="lastError"
                :title="lastError"
                type="error"
                show-icon
                :closable="false"
                class="step-alert"
            />

            <div class="step-actions">
                <el-button
                    type="primary"
                    icon="el-icon-search"
                    :loading="parsing"
                    :disabled="!canParse"
                    @click="parsePdf"
                >{{ parsing ? 'Parsing…' : 'Parse PDF' }}</el-button>
            </div>
        </div>

        <!-- ── Step 2: Review parsed items ──────────────────────────────── -->
        <div v-else-if="step === 'review'" class="step review-step">
            <div class="review-summary">
                <span><strong>{{ parseResult.filename }}</strong></span>
                <el-tag size="small" type="success">{{ keptActive.length }} ready</el-tag>
                <el-tag v-if="keptInactive.length" size="small" type="info">
                    {{ keptInactive.length }} inactive (will skip)
                </el-tag>
                <el-tag v-if="parseResult.discarded.length" size="small" type="warning">
                    {{ parseResult.discarded.length }} not in Zoho
                </el-tag>
            </div>

            <!-- Ready-to-order items -->
            <div class="review-section">
                <div class="review-section-title">
                    Line items ({{ keptActive.length }})
                </div>

                <!--
                    Add-product autocomplete sits above the table. Reuses the
                    same Zoho Commerce search endpoint as Send Parts, then
                    resolves the SKU to a real Inventory item_id via
                    skuLookup before pushing onto the list. Lets the user
                    top up a parsed PO with extra items the PDF didn't
                    include.
                -->
                <div class="add-product-row">
                    <el-autocomplete
                        v-model="addProductKeyword"
                        :fetch-suggestions="fetchProductSuggestions"
                        :debounce="400"
                        :disabled="addingProduct"
                        placeholder="Search Zoho products to add to the order…"
                        style="width: 100%"
                        :trigger-on-focus="false"
                        value-key="name"
                        clearable
                        prefix-icon="el-icon-search"
                        popper-class="buzztech-suggestions"
                        @select="onProductSelected"
                    >
                        <template slot-scope="{ item }">
                            <div class="product-suggestion">
                                <img
                                    v-if="item.imgUrl"
                                    :src="item.imgUrl"
                                    class="product-suggestion-img"
                                    @error="onSuggestionImgError($event)"
                                />
                                <div v-else class="product-suggestion-img product-suggestion-img-placeholder">
                                    <i class="el-icon-picture-outline" />
                                </div>
                                <div class="product-suggestion-info">
                                    <div class="product-suggestion-name">{{ item.name }}</div>
                                    <div v-if="item.sku" class="product-suggestion-meta">SKU: {{ item.sku }}</div>
                                </div>
                            </div>
                        </template>
                    </el-autocomplete>
                </div>

                <el-table
                    :data="keptActive"
                    size="small"
                    stripe
                    empty-text="No active items to import"
                    max-height="340"
                >
                    <el-table-column label="SKU" prop="manufacturerSKU" min-width="110" show-overflow-tooltip />
                    <el-table-column label="Description vs Zoho Item" min-width="400">
                        <template slot-scope="scope">
                            <div class="desc-cell">
                                <div class="desc-line desc-pdf" :title="scope.row.description">
                                    <span class="desc-tag pdf-tag">PDF</span>
                                    <span class="desc-text">{{ scope.row.description || '—' }}</span>
                                </div>
                                <div class="desc-line desc-zoho" :title="scope.row.zohoName">
                                    <span class="desc-tag zoho-tag">Zoho</span>
                                    <span class="desc-text">{{ scope.row.zohoName || '—' }}</span>
                                </div>
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column label="Qty" width="110" align="center">
                        <template slot-scope="scope">
                            <el-input-number
                                v-model="scope.row.qty"
                                :min="1"
                                :max="9999"
                                size="mini"
                                controls-position="right"
                                style="width: 100%"
                            />
                        </template>
                    </el-table-column>
                    <el-table-column label="" width="50" align="center">
                        <template slot-scope="scope">
                            <el-button
                                size="mini"
                                type="text"
                                icon="el-icon-delete"
                                class="remove-btn"
                                @click="removeItem(scope.row)"
                            />
                        </template>
                    </el-table-column>
                </el-table>
            </div>

            <!-- Items skipped because they're not in Zoho -->
            <div v-if="parseResult.discarded.length" class="review-section">
                <div class="review-section-title warn">
                    <i class="el-icon-warning-outline" />
                    SKUs not found in Zoho ({{ parseResult.discarded.length }})
                    <span class="review-section-note">— SKU might be mismatched, or the item is inactive in Zoho</span>
                </div>
                <el-table
                    :data="parseResult.discarded"
                    size="small"
                    max-height="200"
                >
                    <el-table-column label="Manufacturer SKU" prop="manufacturerSKU" min-width="160" />
                    <el-table-column label="Description" prop="description" min-width="240" show-overflow-tooltip />
                    <el-table-column label="Qty" prop="qty" width="70" align="right" />
                </el-table>
            </div>

            <!-- Inactive items that will be filtered out of the SO -->
            <div v-if="keptInactive.length" class="review-section">
                <div class="review-section-title warn">
                    <i class="el-icon-info" />
                    Inactive items skipped ({{ keptInactive.length }})
                </div>
                <el-table
                    :data="keptInactive"
                    size="small"
                    max-height="180"
                >
                    <el-table-column label="Manufacturer SKU" prop="manufacturerSKU" min-width="160" />
                    <el-table-column label="Status" prop="status" width="100" />
                    <el-table-column label="Qty" prop="qty" width="70" align="right" />
                </el-table>
            </div>

            <el-alert
                v-if="lastError"
                :title="lastError"
                type="error"
                show-icon
                :closable="false"
                class="step-alert"
            />

            <div class="step-actions space-between">
                <el-button :disabled="creating" @click="backToPick">Back</el-button>
                <el-button
                    type="primary"
                    :loading="creating"
                    :disabled="keptActive.length === 0"
                    icon="el-icon-shopping-cart-2"
                    @click="createOrder"
                >{{ creating ? 'Creating…' : `Create Sales Order (${keptActive.length})` }}</el-button>
            </div>
        </div>

        <!-- ── Step 3: Done ─────────────────────────────────────────────── -->
        <div v-else-if="step === 'done'" class="step done-step">
            <div class="done-icon"><i class="el-icon-circle-check" /></div>
            <div class="done-title">Sales order {{ createdSO.salesOrderNumber }} created</div>
            <div class="done-sub">
                {{ keptActive.length }} line item<span v-if="keptActive.length !== 1">s</span>
                sent to Zoho Inventory from <strong>{{ parseResult.filename }}</strong>.
            </div>

            <!-- PDF-attachment outcome — best-effort, surfaced so the user
                 knows whether to attach manually if Zoho rejected it. -->
            <div v-if="attachResult" :class="['attach-result', attachResult.ok ? 'ok' : 'fail']">
                <i :class="attachResult.ok ? 'el-icon-document-checked' : 'el-icon-warning-outline'" />
                <span v-if="attachResult.ok">
                    PDF <strong>{{ attachResult.filename }}</strong> attached to the sales order.
                </span>
                <span v-else>
                    Couldn't attach PDF: {{ attachResult.message }}. Attach manually in Zoho if needed.
                </span>
            </div>

            <div class="step-actions center">
                <el-button @click="reset">Import another</el-button>
                <el-button
                    type="primary"
                    icon="el-icon-link"
                    @click="openInZoho"
                >Open in Zoho</el-button>
            </div>
        </div>
    </div>
</template>

<script>
import { parseBuzztechPdf, createBuzztechSalesOrder, attachToBuzztechOrder } from '@/api/tools/buzztech'
import { searchProducts, lookupProductBySku } from '@/api/zoho/products/product'

// Static shop list — each entry maps a label the user sees to the Zoho
// customer_id that becomes the sales-order customer. Add a row here when a
// new BuzzTech shop comes online; no other code changes needed.
const SHOP_OPTIONS = [
    { id: '2591985000001408911', label: 'BuzzTech Geelong (KO)' },
    { id: '2591985000001408545', label: 'BuzzTech Colac (KO)' },
    { id: '2591985000041415509', label: 'BuzzTech Moonee Ponds (KO)' },
    { id: '2591985000001404795', label: 'BuzzTech - Phone Repair Newtown' },
    { id: '2591985000001409928', label: 'BuzzTech Warrnambool Rhett (KO)' },
    { id: '2591985000072961811', label: 'Buzztech Horsham (KO)' },
    { id: '2591985000001418341', label: 'Buzz Tech Mount Gambier' }
]

// GST line on every BuzzTech import — matches the n8n workflow's hardcoded
// values exactly. Pulled into a constant so it's easy to change if your tax
// setup ever shifts.
const GST_LINE = {
    tax_id: '2591985000000073173',
    tax_name: 'GST',
    tax_type: 'tax',
    tax_percentage: 10
}

// BuzzTech price list — applies to every shop in SHOP_OPTIONS. If a single
// shop ever needs a different pricebook, switch this constant out for a
// per-shop field on the SHOP_OPTIONS rows.
const BUZZTECH_PRICEBOOK = '2591985000078196985'

const ZOHO_ORG_ID = '746138234'

export default {
    name: 'BuzztechOrderImport',
    data() {
        return {
            step: 'pick',
            // Reactive picker state
            picker: {
                shopId: '',
                file: null
            },
            shopOptions: SHOP_OPTIONS,
            parsing: false,
            creating: false,
            lastError: '',
            parseResult: null,
            createdSO: null,

            // Add-product autocomplete state (review step)
            addProductKeyword: '',
            addingProduct: false,

            // PDF-attachment outcome shown on the done step. The order is
            // already created at this point; this just records whether the
            // best-effort attach call succeeded.
            attachResult: null
        }
    },
    computed: {
        canParse() {
            return !!(this.picker.shopId && this.picker.file)
        },
        // Items that will be sent to Zoho (have a resolved Item ID and are Active).
        keptActive() {
            const kept = (this.parseResult && this.parseResult.kept) || []
            return kept.filter(k => k.status === 'Active')
        },
        // Items that resolved to an Item ID but aren't Active — the n8n flow
        // calls these out separately in the SO notes.
        keptInactive() {
            const kept = (this.parseResult && this.parseResult.kept) || []
            return kept.filter(k => k.status && k.status !== 'Active')
        }
    },
    methods: {
        onFilePicked(event) {
            const f = event.target.files && event.target.files[0]
            event.target.value = ''
            if (!f) return
            if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) {
                this.$message.error('Please choose a PDF file')
                return
            }
            this.picker.file = f
            this.lastError = ''
        },
        async parsePdf() {
            if (!this.canParse || this.parsing) return
            this.parsing = true
            this.lastError = ''
            try {
                const form = new FormData()
                form.append('file', this.picker.file, this.picker.file.name)
                const res = await parseBuzztechPdf(form)
                if (!res || !res.success) {
                    throw new Error((res && res.message) || 'Parse failed')
                }
                this.parseResult = res.data
                this.step = 'review'
            } catch (e) {
                console.error('BuzzTech parse failed:', e)
                this.lastError = this.describeError(e)
            } finally {
                this.parsing = false
            }
        },
        async createOrder() {
            if (this.keptActive.length === 0 || this.creating) return
            this.creating = true
            this.lastError = ''
            this.attachResult = null
            try {
                const lineItems = this.keptActive.map(item => ({
                    itemId: item.itemId,
                    quantity: item.qty,
                    ...GST_LINE
                }))
                const payload = {
                    customerId: this.picker.shopId,
                    priceListId: BUZZTECH_PRICEBOOK,
                    lineItems,
                    notes: this.buildNotes()
                }
                const res = await createBuzztechSalesOrder(payload)
                if (!res || !res.success || !res.data) {
                    throw new Error((res && res.message) || 'Create failed')
                }
                this.createdSO = res.data

                // Best-effort: staple the original PO PDF onto the SO. Failure
                // here doesn't undo the SO — we just surface the outcome on the
                // done screen so the user knows whether they need to attach
                // manually in Zoho.
                if (this.picker.file && this.createdSO.salesOrderId) {
                    this.attachResult = await this.attachPdfToOrder(
                        this.createdSO.salesOrderId,
                        this.picker.file
                    )
                }

                this.step = 'done'
            } catch (e) {
                console.error('BuzzTech create failed:', e)
                this.lastError = this.describeError(e)
            } finally {
                this.creating = false
            }
        },
        async attachPdfToOrder(salesOrderId, file) {
            try {
                const form = new FormData()
                form.append('salesOrderId', String(salesOrderId))
                form.append('file', file, file.name)
                const res = await attachToBuzztechOrder(form)
                if (res && res.success) {
                    return { ok: true, filename: file.name }
                }
                return {
                    ok: false,
                    filename: file.name,
                    message: (res && res.message) || 'Attach failed'
                }
            } catch (e) {
                console.error('BuzzTech PDF attach failed:', e)
                return {
                    ok: false,
                    filename: file.name,
                    message: this.describeError(e)
                }
            }
        },
        buildNotes() {
            // Mirror the n8n notes composition — same line breaks, same wording,
            // same filter logic. Keeps any downstream reporting consistent.
            const parts = [
                `Order created from ${this.parseResult.filename}.`
            ]
            const discarded = this.parseResult.discarded || []
            if (discarded.length) {
                parts.push(
                    `Can not find Manufacture SKU: ${discarded.map(d => d.manufacturerSKU).join(', ')}. Please add manually.`
                )
            }
            if (this.keptInactive.length) {
                parts.push(
                    `Inactive items filtered out: ${this.keptInactive.map(i => i.manufacturerSKU).join(', ')}.`
                )
            }
            return parts.filter(Boolean).join('\n')
        },
        backToPick() {
            this.step = 'pick'
            this.lastError = ''
            this.parseResult = null
        },
        reset() {
            this.step = 'pick'
            this.picker = { shopId: '', file: null }
            this.parseResult = null
            this.createdSO = null
            this.lastError = ''
            this.addProductKeyword = ''
            this.attachResult = null
        },

        // ── Add product / remove item ─────────────────────────────────
        async fetchProductSuggestions(query, cb) {
            const q = (query || '').trim()
            if (!q) { cb([]); return }
            try {
                const res = await searchProducts(q)
                if (!res || !res.success) { cb([]); return }
                const products = Array.isArray(res.data) ? res.data : []
                cb(products.map(p => ({
                    ...p,
                    name: p.name || p.product_name || p.title || '',
                    sku: p.sku
                        || (Array.isArray(p.skus) && p.skus[0] && p.skus[0].sku)
                        || (p.variants && p.variants[0] && p.variants[0].sku)
                        || '',
                    imgUrl: this.extractProductImage(p)
                })))
            } catch (e) {
                console.error('Buzztech product search failed:', e)
                cb([])
            }
        },
        // Zoho Commerce returns product images in several shapes — try each
        // known shape in priority order and fall back to a placeholder if
        // none match. Same logic as the SQT Send Parts picker.
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
            // Broken image URL — hide the <img> so the placeholder layout
            // doesn't show a busted icon.
            if (e && e.target) e.target.style.display = 'none'
        },
        async onProductSelected(item) {
            if (!item) return
            if (!item.sku) {
                this.$message.error(
                    `"${item.name || 'This product'}" has no SKU — add one in Zoho before importing.`
                )
                this.addProductKeyword = ''
                return
            }
            this.addingProduct = true
            try {
                // Resolve Commerce SKU → real Inventory item_id.
                const res = await lookupProductBySku(item.sku)
                if (!res || !res.success || !res.data || !res.data.itemId) {
                    throw new Error('No inventory item returned for this SKU')
                }
                const itemId = String(res.data.itemId)
                // Dedupe by itemId — both against parsed rows and prior adds.
                const kept = (this.parseResult && this.parseResult.kept) || []
                if (kept.some(k => String(k.itemId) === itemId)) {
                    this.$message.info(`"${item.name}" is already in the list`)
                    return
                }
                // Push a synthetic row matching the same shape as parsed rows
                // so it flows through keptActive / payload composition
                // identically. Empty description marks it as a manual add.
                kept.push({
                    supplierSKU: '',
                    supplierSKU2: '',
                    manufacturerSKU: item.sku,
                    description: '',
                    attributes: '',
                    qty: 1,
                    supplierBuyExTax: '',
                    totalSupplierExTax: '',
                    itemId,
                    zohoName: item.name || '',
                    status: 'Active'
                })
                this.$message.success(`Added "${item.name}"`)
            } catch (e) {
                console.error('Buzztech add product failed:', e)
                const msg = (e.response && e.response.data && e.response.data.message) || e.message || 'Failed to add product'
                this.$message.error(msg)
            } finally {
                this.addingProduct = false
                this.addProductKeyword = ''
            }
        },
        removeItem(row) {
            if (!this.parseResult || !Array.isArray(this.parseResult.kept)) return
            const idx = this.parseResult.kept.indexOf(row)
            if (idx !== -1) this.parseResult.kept.splice(idx, 1)
        },
        openInZoho() {
            if (!this.createdSO || !this.createdSO.salesOrderId) return
            const url = `https://inventory.zoho.com/app/${ZOHO_ORG_ID}#/salesorders/${this.createdSO.salesOrderId}`
            window.open(url, '_blank', 'noopener,noreferrer')
        },
        describeError(e) {
            if (!e) return 'Something went wrong'
            if (e.response && e.response.data) {
                return e.response.data.message || `HTTP ${e.response.status}`
            }
            return e.message || String(e)
        },
        formatBytes(n) {
            if (!Number.isFinite(n)) return '—'
            if (n < 1024) return `${n} B`
            if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
            return `${(n / 1024 / 1024).toFixed(2)} MB`
        }
    }
}
</script>

<style scoped>
.buzztech-tool {
    padding: 4px 0;
}
.hidden-input {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
}

/* Step wrappers */
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
.file-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
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
.form-hint {
    color: #909399;
    font-size: 12px;
    margin-top: 4px;
    code {
        background: #f5f7fa;
        padding: 1px 6px;
        border-radius: 3px;
        font-size: 12px;
    }
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

/* Add-product autocomplete row above the line-items table */
.add-product-row { margin: 0 0 8px; }

/* Remove button on each line-item row — quiet by default, highlights on hover */
.remove-btn {
    padding: 4px !important;
    color: #909399;
}
.remove-btn:hover { color: #f56c6c; }

/* Side-by-side description vs Zoho item-name cell. Two stacked lines, each
   tagged so the user can see at a glance which row came from where and
   spot a SKU mismatch. */
.desc-cell { display: flex; flex-direction: column; gap: 3px; }
.desc-line {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 12px;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.desc-tag {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 3px;
    flex-shrink: 0;
    letter-spacing: 0.3px;
}
.pdf-tag  { background: #eff6ff; color: #1d4ed8; }
.zoho-tag { background: #f0fdf4; color: #15803d; }
.desc-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.desc-pdf .desc-text  { color: #303133; }
.desc-zoho .desc-text { color: #606266; }

/* Done step */
.done-step { text-align: center; padding: 16px 0 8px; }
.done-icon { color: #67C23A; font-size: 48px; margin-bottom: 8px; }
.done-title { font-size: 17px; font-weight: 600; color: #111827; margin-bottom: 4px; }
.done-sub { color: #606266; font-size: 13px; margin-bottom: 16px; line-height: 1.5; }

/* Attach result chip — green when the PDF made it to Zoho, amber when the
   SO was created but the attachment failed (best-effort behaviour). */
.attach-result {
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
.attach-result.ok {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
}
.attach-result.fail {
    background: #fffaf0;
    border: 1px solid #fde68a;
    color: #92400e;
}

/* Mobile */
@media (max-width: 600px) {
    .step-actions {
        flex-direction: column-reverse;
        gap: 8px;
    }
    .step-actions .el-button {
        width: 100%;
        margin-left: 0 !important;
    }
    .step-actions.space-between .el-button { width: 100%; }
    .review-section { ::v-deep .el-table { font-size: 12px; } }
}
</style>

<style>
/* Suggestion popup for the Buzztech add-product autocomplete. Unscoped
   because Element UI teleports the popper outside the component root. */
.buzztech-suggestions .product-suggestion {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
    line-height: 1.3;
}
.buzztech-suggestions .product-suggestion-img {
    width: 40px;
    height: 40px;
    object-fit: cover;
    border-radius: 4px;
    flex-shrink: 0;
    background: #f5f7fa;
}
.buzztech-suggestions .product-suggestion-img-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #c0c4cc;
    font-size: 18px;
}
.buzztech-suggestions .product-suggestion-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
}
.buzztech-suggestions .product-suggestion-name {
    font-weight: 500;
    color: #303133;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.buzztech-suggestions .product-suggestion-meta {
    color: #909399;
    font-size: 12px;
}
</style>
