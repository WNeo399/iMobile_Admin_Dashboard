<template>
    <div class="bg-tool">
        <!-- Product search — same Zoho picker pattern as the other tools -->
        <el-autocomplete
            v-model="keyword"
            :fetch-suggestions="searchZohoProducts"
            :debounce="400"
            :disabled="loading"
            placeholder="Search Zoho products by name or SKU…"
            style="width: 100%"
            :trigger-on-focus="false"
            value-key="name"
            clearable
            prefix-icon="el-icon-search"
            popper-class="oz-add-suggestions"
            @select="onProductSelected"
        >
            <template slot-scope="{ item }">
                <div class="add-suggestion">
                    <img v-if="item.imgUrl" :src="item.imgUrl" class="add-suggestion-img" @error="onImgError($event)" />
                    <div v-else class="add-suggestion-img add-suggestion-img-ph"><i class="el-icon-picture-outline" /></div>
                    <div class="add-suggestion-info">
                        <div class="add-suggestion-name">{{ item.name }}</div>
                        <div v-if="item.sku" class="add-suggestion-meta"><span class="mono">{{ item.sku }}</span></div>
                    </div>
                </div>
            </template>
        </el-autocomplete>

        <div v-if="loading" class="bg-loading"><i class="el-icon-loading" /> Loading product data…</div>

        <template v-if="form.sku && !loading">
            <!-- Label fields -->
            <el-form label-position="top" size="small" class="bg-form" @submit.native.prevent>
                <el-form-item label="Product name (as printed)">
                    <el-input v-model="form.name" type="textarea" :autosize="{ minRows: 2, maxRows: 8 }" maxlength="220" show-word-limit />
                </el-form-item>
                <div class="bg-row">
                    <el-form-item class="bg-col">
                        <template slot="label">
                            <el-switch v-model="form.showSelling" active-text="Retail Price" class="bg-switch" />
                        </template>
                        <el-input v-model="form.sellingPrice" type="number" min="0" :disabled="!form.showSelling" placeholder="0.00">
                            <template slot="prepend">$</template>
                        </el-input>
                    </el-form-item>
                    <el-form-item class="bg-col">
                        <template slot="label">
                            <el-switch v-model="form.showPlatinum" active-text="Platinum Price" class="bg-switch" />
                        </template>
                        <el-input v-model="form.platinumPrice" type="number" min="0" :disabled="!form.showPlatinum" placeholder="0.00">
                            <template slot="prepend">$</template>
                        </el-input>
                    </el-form-item>
                    <el-form-item label="Copies" class="bg-col-copies">
                        <el-input-number v-model="form.copies" :min="1" :max="50" :precision="0" controls-position="right" style="width: 100%" />
                    </el-form-item>
                </div>
            </el-form>

            <!-- Live preview (HTML mock at the label's 89:36 aspect ratio) -->
            <div class="bg-preview-wrap">
                <div class="bg-preview-title">Label preview — 89mm × 36mm</div>
                <div class="bg-label">
                    <div class="bg-label-name">{{ form.name }}</div>
                    <div class="bg-label-bottom">
                        <div v-if="form.showSelling || form.showPlatinum" class="bg-label-prices">
                            <div v-if="form.showPlatinum" class="bg-price-block">
                                <div class="bg-price-label">Wholesale Price</div>
                                <div class="bg-price-value">{{ money(form.platinumPrice) }}</div>
                            </div>
                            <div v-if="form.showSelling" class="bg-price-block">
                                <div class="bg-price-label">Retail Price</div>
                                <div class="bg-price-value">{{ money(form.sellingPrice) }}</div>
                            </div>
                        </div>
                        <div class="bg-label-barcode">
                            <img v-if="barcodeUrl" :src="barcodeUrl" />
                            <div class="bg-label-sku">{{ form.sku }}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="bg-actions">
                <el-button type="primary" icon="el-icon-printer" :disabled="!form.sku" :loading="printing" @click="printLabels">
                    Print{{ form.copies > 1 ? ` (${form.copies} labels)` : '' }}
                </el-button>
            </div>
        </template>
        <div v-else-if="!loading" class="bg-empty">Search for a product above to build its label.</div>
    </div>
</template>

<script>
import JsBarcode from 'jsbarcode'
import { searchProducts, getLabelData } from '@/api/zoho/products/product'
import { buildBarcodeLabelDoc } from '@/utils/barcodeLabel'

export default {
    name: 'BarcodeGenerator',
    data() {
        return {
            keyword: '',
            loading: false,
            printing: false,
            printFrame: null,
            barcodeUrl: '',
            form: {
                sku: '',
                name: '',
                sellingPrice: '',
                platinumPrice: '',
                showSelling: true,
                showPlatinum: true,
                copies: 1
            }
        }
    },
    watch: {
        'form.sku'() { this.renderBarcode() }
    },
    beforeDestroy() {
        if (this.printFrame) { this.printFrame.remove(); this.printFrame = null }
    },
    methods: {
        async searchZohoProducts(query, cb) {
            const q = (query || '').trim()
            if (!q) { cb([]); return }
            try {
                const res = await searchProducts(q)
                if (!res || res.success === false) { cb([]); return }
                const products = Array.isArray(res.data) ? res.data : []
                cb(products.map(p => ({
                    ...p,
                    name: this.decodeEntities(p.name || p.product_name || p.title || ''),
                    sku: p.sku
                        || (Array.isArray(p.skus) && p.skus[0] && p.skus[0].sku)
                        || (p.variants && p.variants[0] && p.variants[0].sku)
                        || '',
                    imgUrl: this.extractImage(p)
                })))
            } catch (e) {
                console.error('Product search failed:', e)
                cb([])
            }
        },
        async onProductSelected(item) {
            this.keyword = ''
            if (!item || !item.sku) {
                this.$message.error(`"${(item && item.name) || 'This product'}" has no SKU — a barcode needs one.`)
                return
            }
            this.loading = true
            try {
                const r = await getLabelData(item.sku)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Lookup failed')
                const d = r.data || {}
                this.form.sku = d.sku || item.sku
                this.form.name = d.name || item.name || ''
                // Retail Price comes from the cf_retail_price custom field in
                // Zoho Inventory — empty when the product doesn't have it
                // filled in yet, so the user can type it manually.
                this.form.sellingPrice = d.retailPrice != null ? String(d.retailPrice) : ''
                this.form.platinumPrice = d.platinumPrice != null ? String(d.platinumPrice) : ''
                this.form.showSelling = d.retailPrice != null
                this.form.showPlatinum = d.platinumPrice != null
                if (d.retailPrice == null) this.$message.info('No Retail Price on this product in Zoho — toggle it on to enter one manually.')
                if (d.platinumPrice == null) this.$message.info('No Platinum price found for this product — toggle it on to enter one manually.')
            } catch (e) {
                const msg = (e.response && e.response.data && e.response.data.message) || e.message || 'Failed to load product data'
                this.$message.error(msg)
            } finally {
                this.loading = false
            }
        },
        renderBarcode() {
            if (!this.form.sku) { this.barcodeUrl = ''; return }
            try {
                const canvas = document.createElement('canvas')
                JsBarcode(canvas, String(this.form.sku), { format: 'CODE128', displayValue: false, margin: 0, width: 4, height: 120 })
                this.barcodeUrl = canvas.toDataURL('image/png')
            } catch (e) {
                console.error('Barcode render failed:', e)
                this.barcodeUrl = ''
            }
        },
        // Build the exact-size PDF and open the browser print dialog for it via a
        // hidden iframe — no download step; the label prints at true 89×36mm.
        printLabels() {
            const label = {
                name: this.form.name,
                sku: this.form.sku,
                sellingPrice: this.form.showSelling && this.form.sellingPrice !== '' ? Number(this.form.sellingPrice) : null,
                platinumPrice: this.form.showPlatinum && this.form.platinumPrice !== '' ? Number(this.form.platinumPrice) : null
            }
            const copies = Math.max(1, Number(this.form.copies) || 1)
            this.printing = true
            try {
                const doc = buildBarcodeLabelDoc(Array.from({ length: copies }, () => label))
                doc.autoPrint()
                const url = doc.output('bloburl')
                // Reuse one hidden iframe per component instance.
                if (this.printFrame) { this.printFrame.remove(); this.printFrame = null }
                const frame = document.createElement('iframe')
                frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;'
                frame.src = url
                frame.onload = () => {
                    try {
                        frame.contentWindow.focus()
                        frame.contentWindow.print()
                    } catch (e) {
                        // Fallback: open the PDF in a tab (autoPrint pops the dialog there).
                        window.open(url, '_blank')
                    }
                    this.printing = false
                }
                document.body.appendChild(frame)
                this.printFrame = frame
            } catch (e) {
                console.error('Print failed:', e)
                this.$message.error('Could not build the label for printing.')
                this.printing = false
            }
        },
        money(v) {
            const n = Number(v)
            if (!Number.isFinite(n)) return '$—'
            return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        },
        decodeEntities(str) {
            if (!str) return ''
            const el = document.createElement('textarea')
            el.innerHTML = String(str)
            return el.value
        },
        extractImage(p) {
            const BASE = 'https://www.imobilestore.com.au'
            const abs = (path) => !path ? '' : (/^https?:\/\//i.test(path) ? path : BASE + (path.startsWith('/') ? '' : '/') + path)
            if (Array.isArray(p.documents) && p.documents[0]) {
                const d = p.documents[0]
                if (d.file_name && d.document_id) return `${BASE}/product-images/${d.file_name}/${d.document_id}/100x100`
            }
            if (Array.isArray(p.images) && p.images[0]) {
                const i = p.images[0]
                return abs(i.image_url || i.url || i.path || i.image_path || '')
            }
            return abs(p.image_url || p.image || p.image_path || '')
        },
        onImgError(e) {
            if (e && e.target) e.target.style.display = 'none'
        }
    }
}
</script>

<style scoped>
.bg-tool { display: flex; flex-direction: column; gap: 14px; padding: 4px 0; }
.bg-loading { color: #909399; font-size: 13px; }
.bg-empty { color: #909399; font-size: 13px; text-align: center; padding: 18px 0; }

.bg-form ::v-deep .el-form-item { margin-bottom: 12px; }
.bg-form ::v-deep .el-form-item__label { padding-bottom: 4px; line-height: 20px; }
.bg-row { display: flex; gap: 12px; }
.bg-col { flex: 1; }
.bg-col-copies { width: 110px; flex-shrink: 0; }
.bg-switch ::v-deep .el-switch__label { font-size: 13px; }

/* Preview — scaled 89:36 label (1mm ≈ 5px) */
.bg-preview-wrap { display: flex; flex-direction: column; gap: 6px; align-items: center; }
.bg-preview-title { font-size: 12px; color: #909399; }
.bg-label {
    width: 445px; height: 180px;
    background: #fff; border: 1px dashed #c0c4cc; border-radius: 4px;
    padding: 16px 25px; /* 3.5mm top, 5mm sides at the 5px/mm preview scale */
    box-sizing: border-box;
    display: flex; flex-direction: column;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.bg-label-name {
    font-size: 13px; font-weight: 700; color: #111; line-height: 1.25;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.bg-label-bottom { flex: 1; display: flex; align-items: flex-end; gap: 12px; margin-top: 6px; min-height: 0; }
.bg-label-prices { flex-shrink: 0; width: 150px; align-self: center; display: flex; flex-direction: column; gap: 8px; }
.bg-price-block { line-height: 1.15; }
.bg-price-label { font-size: 11px; color: #111; }
.bg-price-value { font-size: 20px; font-weight: 700; color: #111; }
.bg-label-barcode { flex: 1; min-width: 0; text-align: center; }
.bg-label-barcode img { width: 100%; height: 58px; object-fit: fill; display: block; }
.bg-label-sku { font-size: 12px; color: #111; letter-spacing: 1px; margin-top: 2px; }

.bg-actions { display: flex; justify-content: flex-end; }
</style>
