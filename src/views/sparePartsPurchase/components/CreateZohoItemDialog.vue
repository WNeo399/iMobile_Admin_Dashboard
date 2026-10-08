<template>
    <!--
        Purchase Order page → a New Product line created in Zoho Inventory (user
        ask 2026-10-08). The line is a product not in Zoho yet; this makes the
        item (set up like the New Products page's items) and links the line to
        it. Starts from the line's photos — its name is shown for reference
        only, the Zoho name is typed (user 2026-10-08); the Zoho fields come
        from the stock register's own lists (classification / sub, brand,
        series, models — typed values allowed). Brand › Series › Model is a
        hierarchy: series after a brand, models after a series (user 2026-10-08).
    -->
    <el-dialog :visible="visible" :width="narrow ? '96%' : '880px'" top="5vh" append-to-body :close-on-click-modal="false"
        custom-class="czi-dlg" @update:visible="v => $emit('update:visible', v)" @closed="clearFiles">
        <div slot="title" class="czi-head">
            <div class="czi-title"><i class="el-icon-upload2" /> {{ $tp('Create in Zoho Inventory') }}</div>
            <div v-if="order" class="czi-sub">
                <span class="czi-tag">{{ $tp('New Product') }}</span>
                <span class="czi-dim">× {{ order.orderQty }}<template v-if="order.requestedFor"> · {{ order.requestedFor }}</template></span>
            </div>
        </div>

        <!-- a screenshot pasted anywhere in the form becomes a photo -->
        <el-form v-loading="optionsLoading" label-position="top" size="small" class="czi-form" @submit.native.prevent @paste.native="onPaste">
            <div class="czi-main">
                <div class="czi-sec">{{ $tp('Item') }}</div>
                <el-form-item :label="$tp('Item name')">
                    <!-- the name typed when the order was raised — a reference, not the Zoho name -->
                    <div v-if="order" class="czi-ref" :title="order.productName">
                        <span class="czi-ref-label">{{ $tp('Name on the order') }}</span>{{ order.productName }}
                    </div>
                    <el-input ref="name" v-model="form.name" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" resize="none"
                        maxlength="200" show-word-limit class="czi-name" :placeholder="$tp('Type the item name as it should read in Zoho')"
                        @keydown.native.enter.prevent />
                </el-form-item>
                <div class="czi-row">
                    <el-form-item class="czi-col">
                        <span slot="label">{{ $tp('SKU') }}
                            <el-tooltip :content="$tp('The next free number in the parts range; checked in Zoho before creating.')" placement="top">
                                <i class="el-icon-info czi-help" /></el-tooltip></span>
                        <el-input v-model="form.sku" :placeholder="skuLoading ? $tp('Finding the next free SKU…') : ''"
                            :suffix-icon="skuLoading ? 'el-icon-loading' : ''" />
                    </el-form-item>
                    <el-form-item :label="$tp('Quality')" class="czi-col">
                        <!-- the register's qualities, most used first; a new one can be typed -->
                        <el-select v-model="form.quality" clearable filterable allow-create default-first-option
                            :placeholder="$tp('None')" style="width:100%" @change="onQuality">
                            <el-option v-for="q in options.qualities" :key="q" :label="q" :value="q" />
                        </el-select>
                    </el-form-item>
                </div>

                <div class="czi-sec">{{ $tp('Zoho fields') }}</div>
                <div class="czi-row">
                    <el-form-item :label="$tp('Classification')" class="czi-col" required>
                        <el-select v-model="form.classification" filterable :placeholder="$tp('Pick one')" style="width:100%" @change="form.subClassification = ''">
                            <el-option v-for="c in options.classifications" :key="c.value" :label="classLabel(c.value)" :value="c.value" />
                        </el-select>
                    </el-form-item>
                    <el-form-item :label="$tp('Sub Classification')" class="czi-col">
                        <el-select v-model="form.subClassification" filterable allow-create clearable default-first-option
                            :placeholder="subOptions.length ? $tp('Pick or type') : $tp('None')" style="width:100%">
                            <el-option v-for="u in subOptions" :key="u.value" :label="u.value" :value="u.value" />
                        </el-select>
                    </el-form-item>
                </div>
                <!-- Brand › Series › Model, top down: each one opens once the one
                     above is picked (a brand without series goes straight to models) -->
                <div class="czi-row">
                    <el-form-item :label="$tp('Device Brand')" class="czi-col">
                        <el-select v-model="form.deviceBrand" filterable allow-create clearable default-first-option
                            :placeholder="$tp('Pick or type')" style="width:100%" @change="onBrand">
                            <el-option v-for="b in options.brands" :key="b.value" :label="b.value" :value="b.value" />
                        </el-select>
                    </el-form-item>
                    <el-form-item :label="$tp('Device Series')" class="czi-col">
                        <el-select v-model="form.deviceSeries" multiple filterable allow-create default-first-option
                            :disabled="!form.deviceBrand" :loading="brandLoading"
                            :placeholder="!form.deviceBrand ? $tp('Pick a brand first') : brandSeries.length ? $tp('Pick or type') : $tp('This brand has no series')"
                            style="width:100%" @change="onSeries">
                            <el-option v-for="x in brandSeries" :key="x.value" :label="x.value" :value="x.value" />
                        </el-select>
                    </el-form-item>
                </div>
                <el-form-item class="czi-models">
                    <span slot="label">{{ $tp('Compatible Models') }}
                        <el-tooltip :content="$tp('Goes into the Compatible Model field in Zoho. The list shows the models of the picked series; others can be typed.')" placement="top">
                            <i class="el-icon-info czi-help" /></el-tooltip></span>
                    <el-select v-model="form.compatibleModels" multiple filterable allow-create default-first-option
                        :disabled="!modelsOpen" :placeholder="modelsPlaceholder" style="width:100%">
                        <el-option v-for="m in seriesModels" :key="m.model" :label="m.model" :value="m.model" />
                    </el-select>
                </el-form-item>

                <div class="czi-sec">{{ $tp('Prices') }}
                    <el-tooltip :content="$tp('The price lists are written to Zoho after the item is made; blank ones stay unset.')" placement="top">
                        <i class="el-icon-info czi-help" /></el-tooltip></div>
                <div class="czi-prices">
                    <div class="czi-price">
                        <span class="czi-price-label">{{ $tp('Selling price') }}
                            <el-tooltip :content="$tp('9999.99 is the usual placeholder until the price is set.')" placement="top">
                                <i class="el-icon-info czi-help" /></el-tooltip></span>
                        <el-input-number v-model="form.rate" size="small" :min="0" :precision="2" :controls="false" class="czi-money" style="width:100%" />
                    </div>
                    <div v-for="p in options.priceLists" :key="p.key" class="czi-price">
                        <span class="czi-price-label">{{ p.label }}</span>
                        <el-input-number v-model="form.prices[p.key]" size="small" :min="0" :precision="2" :controls="false"
                            :placeholder="$tp('Not set')" class="czi-money" style="width:100%" />
                    </div>
                </div>
                <div v-for="w in priceWarnings" :key="w" class="czi-warn"><i class="el-icon-warning-outline" /> {{ w }}</div>
            </div>

            <!-- the line's photos to start with; the first becomes the main image -->
            <div class="czi-side">
                <div class="czi-sec">{{ $tp('Photos') }}<span v-if="files.length" class="czi-n">{{ files.length }}</span></div>
                <image-picker ref="picker" v-model="files" :max="10" :disabled="creating" compact />
            </div>
        </el-form>

        <div slot="footer" class="czi-foot">
            <span class="czi-sum">{{ summary }}</span>
            <el-button size="small" :disabled="creating" @click="$emit('update:visible', false)">{{ $tp('Cancel') }}</el-button>
            <el-button type="primary" size="small" icon="el-icon-check" :loading="creating" :disabled="skuLoading && !form.sku" @click="submit">{{ $tp('Create item') }}</el-button>
        </div>
    </el-dialog>
</template>

<script>
import ImagePicker from '@/views/zohoInventory/components/ImagePicker'
import { getZohoItemOptions, createZohoItemForOrder, nextNewProductSku } from '@/api/sparePartsPurchase'
import { zohoLink } from '../shared'

const CLASS_LABELS = { BackCover: 'Back Cover' }
const blankPrices = () => ({ platinum: undefined, vip: undefined, svip: undefined, wholesale: undefined })

export default {
    name: 'CreateZohoItemDialog',
    components: { ImagePicker },
    props: {
        visible: { type: Boolean, default: false },
        // the Purchase Order line (a New Product with no Zoho item)
        order: { type: Object, default: null }
    },
    data() {
        return {
            options: { classifications: [], brands: [], qualities: [], priceLists: [], placeholderRate: 9999.99 },
            optionsLoaded: false,
            optionsLoading: false,
            brandSeries: [],
            brandModels: [],
            brandSeq: 0,
            brandLoading: false,
            form: this.blankForm(),
            // the quality whose [tag] is on the name now
            appliedQuality: '',
            files: [],
            skuLoading: false,
            skuSeq: 0,
            creating: false,
            narrow: false
        }
    },
    computed: {
        // models open once a series is picked — or right after a brand that has no series
        modelsOpen() {
            if (!this.form.deviceBrand || this.brandLoading) return false
            return this.form.deviceSeries.length > 0 || this.brandSeries.length === 0
        },
        modelsPlaceholder() {
            if (!this.form.deviceBrand) return this.$tp('Pick a brand first')
            if (!this.modelsOpen) return this.$tp('Pick a series first')
            return this.$tp('Pick every model this part fits')
        },
        // the brand's models in the picked series (all of them when the brand has none)
        seriesModels() {
            if (!this.brandSeries.length) return this.brandModels
            const picked = new Set(this.form.deviceSeries)
            return this.brandModels.filter(m => (m.series || []).some(x => picked.has(x)))
        },
        subOptions() {
            const c = this.options.classifications.find(x => x.value === this.form.classification)
            return c ? c.subs : []
        },
        // the typed price lists against the tier order (advisory, as on Price
        // Monitoring: SVIP & Wholesale ≤ VIP ≤ Platinum)
        priceWarnings() {
            const p = this.form.prices || {}
            const has = k => p[k] != null && p[k] !== ''
            const out = []
            const rule = (low, high, a, b) => { if (has(low) && has(high) && Number(p[low]) > Number(p[high])) out.push(this.$tp('{a} is above {b}', { a, b })) }
            rule('vip', 'platinum', 'VIP', 'Platinum')
            rule('svip', 'vip', 'SVIP', 'VIP')
            rule('wholesale', 'vip', 'Wholesale', 'VIP')
            if (!has('vip')) { rule('svip', 'platinum', 'SVIP', 'Platinum'); rule('wholesale', 'platinum', 'Wholesale', 'Platinum') }
            return out
        },
        summary() {
            const bits = []
            const sku = String(this.form.sku || '').trim()
            bits.push(sku ? this.$tp('SKU {sku}', { sku }) : (this.skuLoading ? this.$tp('Finding the next free SKU…') : this.$tp('No SKU yet')))
            if (this.files.length) bits.push(this.$tp('{n} photo(s)', { n: this.files.length }))
            const prices = Object.values(this.form.prices || {}).filter(v => v != null && v !== '').length
            if (prices) bits.push(this.$tp('{n} price list(s)', { n: prices }))
            return bits.join(' · ')
        }
    },
    watch: {
        visible(v) { if (v) this.start() }
    },
    methods: {
        blankForm() {
            return { name: '', sku: '', quality: '', rate: 9999.99, prices: blankPrices(), classification: '', subClassification: '', deviceBrand: '', deviceSeries: [], compatibleModels: [] }
        },
        classLabel(c) { return this.$tp(CLASS_LABELS[c] || c) },
        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback
        },
        // a fresh start from the line: its name and photos, the next free SKU
        async start() {
            this.narrow = window.innerWidth < 900
            this.clearFiles()
            this.appliedQuality = ''
            this.brandSeries = []
            this.brandModels = []
            const o = this.order || {}
            this.form = { ...this.blankForm(), rate: this.options.placeholderRate }
            this.files = (o.images || []).map(im => ({ key: im.id, id: im.id, url: im.url, name: im.name }))
            this.loadSku()
            await this.loadOptions()
            this.form.rate = this.options.placeholderRate
        },
        async loadOptions() {
            if (this.optionsLoaded) return
            this.optionsLoading = true
            try {
                const r = await getZohoItemOptions({})
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.options = { classifications: r.classifications || [], brands: r.brands || [], qualities: r.qualities || [], priceLists: r.priceLists || [], placeholderRate: r.placeholderRate }
                this.optionsLoaded = true
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Could not load the Zoho field lists')))
            } finally {
                this.optionsLoading = false
            }
        },
        // a new brand: its series and models start again
        onBrand(brand) {
            this.form.deviceSeries = []
            this.form.compatibleModels = []
            this.brandSeries = []
            this.brandModels = []
            if (brand) this.loadBrand(brand)
        },
        async loadBrand(brand) {
            const seq = ++this.brandSeq
            this.brandLoading = true
            try {
                const r = await getZohoItemOptions({ brand })
                if (seq !== this.brandSeq) return
                this.brandSeries = r.series || []
                this.brandModels = r.models || []
            } catch (e) { /* the lists stay empty; typing still works */ } finally {
                if (seq === this.brandSeq) this.brandLoading = false
            }
        },
        // a series taken off: its models go too (typed ones the register
        // doesn't know stay); none left → no models
        onSeries() {
            if (!this.form.deviceSeries.length && this.brandSeries.length) { this.form.compatibleModels = []; return }
            const known = new Map(this.brandModels.map(m => [m.model, m.series || []]))
            const picked = new Set(this.form.deviceSeries)
            this.form.compatibleModels = this.form.compatibleModels.filter(m => !known.has(m) || known.get(m).some(x => picked.has(x)))
        },
        // the quality last in brackets, as the team's items read ("… Battery [Original]")
        onQuality(q) {
            this.form.name = this.withQuality(this.form.name, q || '')
            this.appliedQuality = q || ''
        },
        // the name with the quality as its last [tag] — a trailing tag that is a
        // quality (the list's, or the one put on last) is swapped; an empty name
        // stays empty (the tag goes on at Create)
        withQuality(name, q) {
            const known = [...this.options.qualities, this.appliedQuality].filter(Boolean)
            let base = String(name || '').trim()
            for (let m = base.match(/\s*\[([^\]]+)\]$/); m && known.includes(m[1]); m = base.match(/\s*\[([^\]]+)\]$/)) base = base.slice(0, m.index).trim()
            if (!base) return ''
            return q ? `${base} [${q}]` : base
        },
        async loadSku() {
            const seq = ++this.skuSeq
            this.skuLoading = true
            try {
                const r = await nextNewProductSku()
                if (seq !== this.skuSeq) return
                if (!String(this.form.sku || '').trim()) this.form.sku = r.sku
            } catch (e) {
                if (seq === this.skuSeq) this.$message.warning(this.$tp('Could not find the next free SKU — type one in'))
            } finally {
                if (seq === this.skuSeq) this.skuLoading = false
            }
        },
        onPaste(e) {
            const files = Array.from((e.clipboardData && e.clipboardData.files) || []).filter(x => /^image\//i.test(x.type))
            if (!files.length || !this.$refs.picker) return
            e.preventDefault()
            this.$refs.picker.add(files.map((raw, i) => raw.name && raw.name !== 'image.png' ? raw : new File([raw], `screenshot-${Date.now() + i}.png`, { type: raw.type })))
        },
        clearFiles() {
            for (const x of this.files) { if (x.url && x.url.startsWith('blob:')) { try { URL.revokeObjectURL(x.url) } catch (e) { /* ignore */ } } }
            this.files = []
        },
        async submit() {
            const f = this.form
            const typed = String(f.name || '').replace(/[\r\n]+/g, ' ').trim()
            if (typed.length < 5) { this.$message.warning(this.$tp('Enter the item name')); this.$refs.name && this.$refs.name.focus(); return }
            // the quality's [tag] at the end, if it isn't there yet
            const name = this.withQuality(typed, f.quality || '')
            if (name !== typed) f.name = name
            if (!f.classification) { this.$message.warning(this.$tp('Pick a classification')); return }
            if (!/^\d{4,6}$/.test(String(f.sku || '').trim())) { this.$message.warning(this.$tp('SKU must be a number')); return }
            const data = new FormData()
            const fields = {
                name, sku: String(f.sku).trim(), quality: f.quality || '', rate: f.rate == null ? '' : f.rate,
                classification: f.classification, subClassification: f.subClassification || '', deviceBrand: f.deviceBrand || '',
                deviceSeries: JSON.stringify(f.deviceSeries || []), compatibleModels: JSON.stringify(f.compatibleModels || []),
                prices: JSON.stringify(Object.fromEntries(Object.entries(f.prices || {}).filter(([, v]) => v != null && v !== '')))
            }
            Object.keys(fields).forEach(k => data.append(k, fields[k]))
            let n = 0
            data.append('order', JSON.stringify(this.files.map(x => (x.file ? { new: n++ } : { id: x.id }))))
            this.files.filter(x => x.file).forEach(x => data.append('images', x.file, x.file.name))
            this.creating = true
            try {
                const r = await createZohoItemForOrder(this.order._id, data)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                if (r.photos && r.photos.error) {
                    this.$message.warning(this.$tp('{sku} created, but the photos did not upload: {error} — add them from Missing Images', { sku: r.item.sku, error: r.photos.error }))
                }
                const priceErrors = Object.keys((r.prices && r.prices.errors) || {})
                if (priceErrors.length) {
                    const names = priceErrors.map(k => (this.options.priceLists.find(p => p.key === k) || { label: k }).label).join(', ')
                    this.$message.warning(this.$tp('{sku} created, but these prices did not save: {lists} — set them on Price Monitoring', { sku: r.item.sku, lists: names }))
                }
                const h = this.$createElement
                this.$notify({
                    title: this.$tp('Created in Zoho'),
                    message: h('span', [`${r.item.sku} · ${r.item.name} · ${this.$tp('the line is linked to it')} `, h('a', { attrs: { href: zohoLink(r.item.itemId), target: '_blank', rel: 'noopener' } }, this.$tp('Open in Zoho'))]),
                    type: 'success', duration: 8000
                })
                this.$emit('created', r)
                this.$emit('update:visible', false)
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Zoho did not create the item')))
            } finally {
                this.creating = false
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.czi-title { font-size: 15px; font-weight: 600; color: #303133; i { color: #409eff; margin-right: 4px; } }
.czi-sub { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; margin-top: 4px; font-size: 13px; color: #303133; }
.czi-tag { padding: 0 8px; border-radius: 10px; font-size: 12px; color: #409eff; background: #ecf5ff; border: 1px solid #d9ecff; }
.czi-dim { font-size: 12px; color: #909399; }
.czi-form { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 0 20px; }
.czi-side { border-left: 1px solid #ebeef5; padding-left: 20px; min-width: 0; }
.czi-sec { display: flex; align-items: center; gap: 4px; margin: 2px 0 8px; font-size: 12px; font-weight: 600; color: #909399; text-transform: uppercase; letter-spacing: .4px; }
.czi-sec:not(:first-child) { margin-top: 14px; padding-top: 12px; border-top: 1px dashed #ebeef5; }
.czi-n { margin-left: 4px; padding: 0 7px; border-radius: 9px; background: #f0f2f5; color: #606266; font-weight: 500; text-transform: none; }
.czi-help { color: #c0c4cc; cursor: help; font-size: 12px; font-weight: normal; &:hover { color: #409eff; } }
.czi-form ::v-deep .el-form-item { margin-bottom: 12px; }
.czi-form ::v-deep .el-form-item__label { padding-bottom: 2px; line-height: 22px; }
.czi-row { display: flex; gap: 12px; }
.czi-col { flex: 1; min-width: 0; }
.czi-ref { margin-bottom: 6px; padding: 6px 10px; border-radius: 4px; background: #f5f7fa; border: 1px dashed #dcdfe6; font-size: 12px; color: #303133; line-height: 1.5; word-break: break-word; }
.czi-ref-label { margin-right: 8px; padding: 0 6px; border-radius: 9px; font-size: 11px; color: #909399; background: #fff; border: 1px solid #e4e7ed; }
.czi-name ::v-deep .el-textarea__inner { padding-bottom: 18px; line-height: 1.5; font-family: Arial, Helvetica, sans-serif; }
.czi-prices { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.czi-price { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.czi-price-label { font-size: 12px; color: #606266; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* a $ in front of a price (el-input-number has no prefix slot) */
.czi-money::before { content: "$"; position: absolute; left: 9px; top: 50%; transform: translateY(-50%); z-index: 1; font-size: 12px; color: #909399; pointer-events: none; }
.czi-money ::v-deep .el-input__inner { padding-left: 20px; text-align: left; }
.czi-warn { margin-top: 4px; font-size: 12px; color: #e6a23c; line-height: 1.6; i { margin-right: 2px; } }
.czi-foot { display: flex; align-items: center; gap: 8px; }
.czi-sum { flex: 1; min-width: 0; text-align: left; font-size: 12px; color: #909399; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.czi-foot .el-button + .el-button { margin-left: 0; }
@media (max-width: 899px) {
    .czi-form { grid-template-columns: 1fr; }
    .czi-side { border-left: 0; padding-left: 0; }
    .czi-row { flex-direction: column; gap: 0; }
    .czi-prices { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
</style>

<style lang="scss">
/* appended to <body>: the body scrolls under a fixed header / footer */
.czi-dlg { display: flex; flex-direction: column; max-height: 90vh; margin-bottom: 0 !important;
    .el-dialog__header { padding: 16px 20px 10px; border-bottom: 1px solid #ebeef5; }
    .el-dialog__body { flex: 1; min-height: 0; overflow: auto; padding: 14px 20px 6px; word-break: normal; }
    .el-dialog__footer { padding: 10px 20px; border-top: 1px solid #ebeef5; } }
</style>
