<template>
    <!--
        An existing product's details, prices and photos, edited in Zoho
        (2026-10-20 on Listing; its own component 2026-10-21 so Listing → New
        Products opens the same dialog). Read live: GET
        /new-products/items/:itemId (+ Price Monitoring's live prices with
        zoho:stock:edit); saved: only what changed — PUT /new-products/items/:itemId
        (one Zoho update), the prices (PUT /stock-monitor/prices/bulk), the
        photos (POST …/items/:itemId/photos). Around it, the brand's models,
        qualities, classifications and formulas: `context` from the page that
        has them (Listing), else GET /new-products/edit-context?brand=.
    -->
    <el-dialog :visible="visible" :width="narrow ? '96%' : '860px'" top="5vh" append-to-body
        :close-on-click-modal="false" custom-class="ped-dlg" @update:visible="v => $emit('update:visible', v)"
        @open="open" @closed="clearEditFiles">
        <div slot="title" class="spn-ct">
            <div class="spn-ct-title"><i class="el-icon-edit" /> {{ $tp(title) }}
                <el-tag v-if="editItem && editItem.status && editItem.status !== 'active'" size="mini" type="info">{{ editItem.status }}</el-tag></div>
            <div v-if="editItem" class="spn-ct-sub">
                <b>{{ $tp('SKU {sku}', { sku: editItem.sku || '—' }) }}</b>
                <span class="spn-dim">{{ $tp('Device Brand') }}: {{ editItem.deviceBrand || '—' }}
                    <template v-if="editItem.deviceSeries"> · {{ $tp('Device Series') }}: {{ editItem.deviceSeries }}</template></span>
                <a class="spn-link" :href="zohoLink(editItem.itemId)" target="_blank" rel="noopener">{{ $tp('Open in Zoho') }}</a>
            </div>
        </div>

        <div v-loading="editLoading" class="spn-edit-body">
            <div v-if="editError" class="spn-none">{{ editError }}</div>
            <el-form v-if="editItem" label-position="top" size="small" class="spn-cf" @submit.native.prevent @paste.native="onEditPaste">
                <div class="spn-cf-main">
                    <div class="spn-sec">{{ $tp('Item') }}</div>
                    <el-form-item :label="$tp('Item name')">
                        <el-input v-model="editForm.name" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" resize="none"
                            maxlength="200" show-word-limit class="spn-name" @keydown.native.enter.prevent />
                    </el-form-item>
                    <!-- the models in the name follow the Compatible Models (2026-10-20) -->
                    <div v-if="nameFollow.note === 'updated'" class="spn-follow"><i class="el-icon-refresh" />
                        {{ $tp('The models in the name follow the Compatible Models below.') }}
                        <el-button type="text" size="mini" @click="undoFollow">{{ $tp('Undo') }}</el-button></div>
                    <div v-else-if="nameFollow.note === 'manual'" class="spn-price-warn"><i class="el-icon-warning-outline" />
                        {{ $tp('This name has no "… Compatible …" — change the models in it by hand.') }}</div>
                    <div v-if="editForm.name.length > 200" class="spn-price-warn"><i class="el-icon-warning-outline" />
                        {{ $tp('{n} characters — Zoho takes 200 at most', { n: editForm.name.length }) }}</div>
                    <div class="spn-row">
                        <el-form-item class="spn-col" :label="$tp('Classification')">
                            <el-select v-model="editForm.classification" filterable style="width:100%" @change="onEditClassification">
                                <el-option v-for="c in ctx.classifications" :key="c.value" :label="classLabel(c.value)" :value="c.value" />
                            </el-select>
                        </el-form-item>
                        <el-form-item class="spn-col">
                            <span slot="label">{{ $tp('Sub Classification') }}
                                <el-tooltip :content="$tp('The ones Zoho items of this classification use; a new one can be typed.')" placement="top">
                                    <i class="el-icon-info spn-help" /></el-tooltip></span>
                            <el-select v-model="editForm.subClassification" filterable allow-create clearable default-first-option
                                :placeholder="$tp('None')" style="width:100%">
                                <el-option v-for="x in editSubOptions" :key="x" :label="x" :value="x" />
                            </el-select>
                        </el-form-item>
                    </div>
                    <div class="spn-row">
                        <el-form-item class="spn-col">
                            <span slot="label">{{ $tp('SKU') }}
                                <el-tooltip :content="$tp('Not changed here — it is on the labels and barcodes.')" placement="top">
                                    <i class="el-icon-info spn-help" /></el-tooltip></span>
                            <el-input :value="editItem.sku" disabled />
                        </el-form-item>
                        <el-form-item class="spn-col" :label="$tp('Quality')">
                            <el-select v-model="editForm.quality" clearable filterable :allow-create="!editQualityListed" default-first-option
                                :placeholder="$tp('None')" style="width:100%" @change="onEditQuality">
                                <el-option v-for="q in editQualityOptions" :key="q" :label="q" :value="q" />
                            </el-select>
                        </el-form-item>
                    </div>
                    <el-form-item>
                        <span slot="label">{{ $tp('Category') }}
                            <el-tooltip :content="$tp('The store category the item is filed under.')" placement="top">
                                <i class="el-icon-info spn-help" /></el-tooltip></span>
                        <div class="spn-cat">
                            <!-- a hidden category can't be picked: its name shows until another is chosen -->
                            <el-cascader v-model="editForm.categoryId" :options="categoryTree" :props="CATEGORY_PROPS" :filter-method="categoryFilter"
                                filterable :placeholder="editItem.categoryName || $tp('Pick the category')" class="spn-cat-pick" />
                            <el-tooltip :content="$tp('Read the categories again from Zoho (after adding one on the Categories page)')" placement="top">
                                <el-button size="small" icon="el-icon-refresh" :loading="categoriesLoading" @click="loadCategories(true)" />
                            </el-tooltip>
                        </div>
                        <div v-if="model && model.categoryId && editForm.categoryId !== model.categoryId" class="spn-cat-hint">
                            {{ $tp('This model\'s category') }}: <el-button type="text" size="mini" @click="editForm.categoryId = model.categoryId">{{ categoryPathOf(model) }}</el-button></div>
                    </el-form-item>

                    <!-- the cost and prices: with the Price Monitoring right only, read live -->
                    <template v-if="editCanPrice">
                        <div class="spn-sec">{{ $tp('Prices') }}
                            <el-tooltip :content="$tp('Read live from Zoho. Only the prices you change are saved, as on Price Monitoring.')" placement="top">
                                <i class="el-icon-info spn-help" /></el-tooltip></div>
                        <div v-if="editPricesError" class="spn-price-warn"><i class="el-icon-warning-outline" /> {{ editPricesError }}</div>
                        <div v-loading="editPricesLoading">
                            <div class="spn-cost">
                                <div class="spn-price">
                                    <span class="spn-price-label">{{ $tp('Cost price') }}
                                        <el-tooltip :content="$tp('Zoho\'s purchase price — what the formula prices are worked out from.')" placement="top">
                                            <i class="el-icon-info spn-help" /></el-tooltip></span>
                                    <el-input-number v-model="editForm.cost" size="small" :min="0" :precision="2" :controls="false" class="spn-money"
                                        :disabled="!editPricesReady" style="width:100%" />
                                </div>
                                <div class="spn-price">
                                    <span class="spn-price-label">{{ $tp('Selling price') }}
                                        <el-tooltip :content="$tp('9999.99 is the usual placeholder until the price is set.')" placement="top">
                                            <i class="el-icon-info spn-help" /></el-tooltip></span>
                                    <el-input-number v-model="editForm.rate" size="small" :min="0" :precision="2" :controls="false" class="spn-money" style="width:100%" />
                                </div>
                                <el-button v-if="editFormulaOff && editPricesReady" type="text" size="mini" icon="el-icon-refresh" class="spn-formula"
                                    @click="editForm.prices = { ...editFormula }">{{ $tp('Use the formula prices') }}</el-button>
                            </div>
                            <div class="spn-prices">
                                <div v-for="p in PRICE_LISTS" :key="p.list" class="spn-price">
                                    <span class="spn-price-label">{{ p.label }}</span>
                                    <el-input-number v-model="editForm.prices[p.list]" size="small" :min="0" :precision="2" :controls="false" class="spn-money"
                                        :disabled="!editPricesReady" :placeholder="$tp('Not set')" style="width:100%" />
                                    <span v-if="editFormula && editOffFormula(p.list)" class="spn-ref" :title="$tp('Use the formula price')"
                                        @click="editForm.prices[p.list] = editFormula[p.list]">{{ $tp('Formula') }} ${{ editFormula[p.list].toFixed(2) }}</span>
                                </div>
                            </div>
                            <div v-for="w in editPriceWarnings" :key="w" class="spn-price-warn"><i class="el-icon-warning-outline" /> {{ w }}</div>
                        </div>
                    </template>

                    <div class="spn-sec">{{ $tp('Compatible Models') }}
                        <el-tooltip :content="$tp('Goes into the Compatible Model field in Zoho. One item can fit several models — it then counts for each of them.')" placement="top">
                            <i class="el-icon-info spn-help" /></el-tooltip></div>
                    <!-- the brand's models on Listing, or typed ("A; B" adds both) -->
                    <el-form-item class="spn-fits-item">
                        <el-select v-model="editForm.compatibleModels" multiple filterable allow-create default-first-option style="width:100%"
                            :placeholder="$tp('Pick every model this part fits')" @change="onEditModels">
                            <el-option v-for="m in editModelOptions" :key="m" :label="m" :value="m" />
                        </el-select>
                    </el-form-item>
                    <div v-if="editDropsOpen" class="spn-price-warn"><i class="el-icon-warning-outline" />
                        {{ $tp('{model} is not on the list — this part will no longer show for it', { model: model.compatibleModel || model.model }) }}</div>
                    <div v-if="editModelsChanged" class="spn-cat-hint">{{ $tp('The Device Series follows the models when saved.') }}</div>
                </div>

                <!-- its photos and new ones in one list (2026-10-20): drag to
                     reorder, the first is the main image; the ones in Zoho
                     stay (removing needs a Zoho right we don't hold) -->
                <div class="spn-cf-side">
                    <div class="spn-sec">{{ $tp('Photos') }}<span v-if="editPhotos.length" class="spn-sec-n">{{ editPhotos.length }}</span>
                        <span v-if="editPhotosChanged" class="spn-photos-changed">{{ $tp('changed') }}</span></div>
                    <image-picker ref="editPhotoPicker" v-model="editPhotos" :max="editPhotoMax" :disabled="editSaving" keep-saved compact />
                </div>
            </el-form>
        </div>

        <div slot="footer" class="spn-cfoot">
            <span class="spn-cfoot-sum">{{ editSummary }}</span>
            <!-- the host's own buttons (New Products: Approve) -->
            <slot name="footer-extra" :item="editItem" :changed="editChangeCount > 0" />
            <el-button size="small" :disabled="editSaving" @click="$emit('update:visible', false)">{{ $tp('Cancel') }}</el-button>
            <el-button type="primary" size="small" icon="el-icon-check" :loading="editSaving" :disabled="editLoading || !editChangeCount"
                @click="saveEdit">{{ $tp('Save to Zoho') }}</el-button>
        </div>
    </el-dialog>
</template>

<script>
import ImagePicker from '@/views/zohoInventory/components/ImagePicker'
import { hasPermission } from '@/utils/permission'
import { getNewProductItem, updateNewProductItem, saveNewProductItemPhotos, getNewProductEditContext, newProductCategories } from '@/api/sparePartsPurchase'
import { getStockItemPrices, pushStockItemPrices } from '@/api/stockMonitor'
import {
    zohoLink, formulaPricesFor, priceFamilyOf, CATEGORY_PROPS, categoryIndex, pickableCategories as pickableOf, categoryTreeOf, categoryPathIn, categoryFilter,
    fitKey, PRICE_LISTS, blankPrices, samePrice, swapModelsInName, blankFollow, modelsNamePartFor, withQualityTag, priceWarningsFor
} from '../shared'

const CLASS_LABELS = { BackCover: 'Back Cover', '': 'Unclassified' }
const blankEditForm = () => ({ name: '', quality: '', classification: '', subClassification: '', categoryId: '', compatibleModels: [], rate: undefined, cost: undefined, prices: blankPrices() })
const blankContext = () => ({ brand: '', brands: [], rows: [], qualities: [], qualitiesByClass: {}, classifications: [], priceFamilies: {}, priceFormulas: {} })
// the store categories and each brand's context, kept a while for the next product
const CATEGORIES_TTL = 10 * 60 * 1000
const CONTEXT_TTL = 5 * 60 * 1000
const cache = { categories: [], categoriesAt: 0, contexts: {} }

export default {
    name: 'ProductEditDialog',
    components: { ImagePicker },
    props: {
        visible: { type: Boolean, default: false },
        itemId: { type: String, default: '' },
        title: { type: String, default: 'Edit in Zoho Inventory' },
        // the page's own { brands, rows, qualities, qualitiesByClass, classifications,
        // priceFamilies, priceFormulas } (Listing); null = read for `brand`
        context: { type: Object, default: null },
        // the item's Device Brand, for that read
        brand: { type: String, default: '' },
        // Listing: the model open on the page ("This model's category", the part leaving it)
        model: { type: Object, default: null }
    },
    data() {
        return {
            PRICE_LISTS,
            CATEGORY_PROPS,
            narrow: false,
            ownContext: blankContext(),
            categories: cache.categories,
            categoriesLoading: false,
            // the item as Zoho has it, the form, and what was loaded into it (to send only what changed)
            editLoading: false,
            editError: '',
            editItem: null,
            editForm: blankEditForm(),
            editOrig: blankEditForm(),
            editAppliedQuality: '',
            editServerCanPrice: false,
            editPricesLoading: false,
            editPricesReady: false,
            editPricesError: '',
            // the photos: the item's ({ key "d:<id>", id, url, name }) and new ones ({ key, file, url }), in order
            editPhotos: [],
            editPhotosOrig: '',
            editSaving: false,
            editSeq: 0,
            // the name following the Compatible Models
            nameFollow: blankFollow()
        }
    },
    computed: {
        ctx() {
            return this.context || this.ownContext
        },
        categoryById() {
            return categoryIndex(this.categories)
        },
        // the categories that can be picked: shown on the store — a hidden one is left out with everything under it
        categoryTree() {
            return categoryTreeOf(pickableOf(this.categories, this.categoryById))
        },
        // prices: the Price Monitoring right (the server agrees when it reads the item)
        editCanPrice() {
            return this.can('zoho:stock:edit') && this.editServerCanPrice
        },
        editSubOptions() {
            const c = (this.ctx.classifications || []).find(x => x.value === this.editForm.classification)
            const list = c ? c.subs.map(x => x.value) : []
            const cur = this.editOrig.subClassification
            return cur && this.editForm.classification === this.editOrig.classification && !list.includes(cur) ? [cur, ...list] : list
        },
        editQualityListed() {
            const list = this.editForm.classification && (this.ctx.qualitiesByClass || {})[this.editForm.classification]
            return list && list.length ? list : null
        },
        // its classification's qualities (or every one in use), its own kept in the list
        editQualityOptions() {
            const list = this.editQualityListed || (this.ctx.qualities || []).filter(Boolean)
            const cur = this.editOrig.quality
            return cur && !list.includes(cur) ? [cur, ...list] : list
        },
        // Listing's brand of the item (its Device Brand), else the open model's / the one read
        editBrand() {
            const dev = String((this.editItem && this.editItem.deviceBrand) || this.brand || '').toLowerCase()
            return ((this.ctx.brands || []).find(b => b.deviceBrand && b.deviceBrand.toLowerCase() === dev) || {}).value ||
                (this.model ? this.model.brand : this.ctx.brand || '')
        },
        // the brand's models on Listing (their Compatible Model), and the ones the item lists
        editModelOptions() {
            const list = [...new Set((this.ctx.rows || []).filter(r => r.brand === this.editBrand).map(r => r.compatibleModel).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
            const have = new Set(list.map(fitKey))
            return [...this.editForm.compatibleModels.filter(m => !have.has(fitKey(m))), ...list]
        },
        editModelsChanged() {
            return this.editForm.compatibleModels.join('; ') !== this.editOrig.compatibleModels.join('; ')
        },
        // the open model is off the list (the part leaves this model)
        editDropsOpen() {
            return !!this.editItem && !!this.model && !this.editForm.compatibleModels.some(m => this.isOpenModel(m))
        },
        editPriceFamily() {
            return priceFamilyOf({ quality: this.editForm.quality, name: this.editForm.name, family: (this.ctx.priceFamilies || {})[this.editForm.classification] })
        },
        editFormula() {
            return formulaPricesFor(this.editForm.cost, (this.ctx.priceFormulas || {})[this.editPriceFamily])
        },
        editFormulaOff() {
            return !!this.editFormula && PRICE_LISTS.some(p => this.editOffFormula(p.list))
        },
        editPriceWarnings() {
            return this.editCanPrice && this.editPricesReady ? priceWarningsFor(this.editForm.prices, this.editForm.cost, this.$tp.bind(this)) : []
        },
        // the item's fields that differ from Zoho's (what PUT /items/:id gets)
        editFieldChanges() {
            const f = this.editForm
            const o = this.editOrig
            const out = {}
            const name = String(f.name || '').replace(/\s+/g, ' ').trim()
            if (name !== o.name) out.name = name
            if ((f.quality || '') !== o.quality) out.quality = f.quality || ''
            if (f.classification !== o.classification) out.classification = f.classification
            const sub = String(f.subClassification || '').trim()
            if (sub !== o.subClassification) out.subClassification = sub
            if (f.categoryId && f.categoryId !== o.categoryId) out.categoryId = f.categoryId
            if (this.editModelsChanged) out.compatibleModels = [...f.compatibleModels]
            if (this.editCanPrice && f.rate != null && f.rate !== '' && !samePrice(f.rate, o.rate)) out.rate = Number(f.rate)
            return out
        },
        // the cost and price lists that differ (Price Monitoring's bulk route); a blank stays as it is
        editPriceChanges() {
            if (!this.editCanPrice || !this.editPricesReady || !this.editItem) return []
            const out = []
            const itemId = this.editItem.itemId
            for (const { list } of PRICE_LISTS) {
                const v = this.editForm.prices[list]
                if (v != null && v !== '' && !samePrice(v, this.editOrig.prices[list])) out.push({ itemId, list, rate: Number(v) })
            }
            const c = this.editForm.cost
            if (c != null && c !== '' && !samePrice(c, this.editOrig.cost)) out.push({ itemId, list: 'purchase', rate: Number(c) })
            return out
        },
        // new photos, or the item's in another order
        editPhotosChanged() {
            return this.editPhotos.some(p => p.file) || this.editPhotos.filter(p => !p.file).map(p => p.id).join(',') !== this.editPhotosOrig
        },
        // Zoho keeps up to 15 photos an item; 10 new at a time
        editPhotoMax() {
            const saved = this.editPhotos.filter(p => !p.file).length
            return Math.max(saved, Math.min(15, saved + 10))
        },
        editChangeCount() {
            return Object.keys(this.editFieldChanges).length + this.editPriceChanges.length + (this.editPhotosChanged ? 1 : 0)
        },
        // the footer: what Save will do
        editSummary() {
            if (this.editLoading || !this.editItem) return ''
            const bits = []
            const fields = Object.keys(this.editFieldChanges).length + this.editPriceChanges.length
            if (fields) bits.push(this.$tp('{n} change(s)', { n: fields }))
            const added = this.editPhotos.filter(p => p.file).length
            if (added) bits.push(this.$tp('{n} photo(s) to add', { n: added }))
            else if (this.editPhotosChanged) bits.push(this.$tp('photos reordered'))
            return bits.length ? bits.join(' · ') : this.$tp('Nothing changed yet')
        }
    },
    methods: {
        zohoLink,
        categoryFilter,
        can(p) {
            return hasPermission(this.$store.getters.permissions, p)
        },
        // the server's own reason first, not axios' "Request failed with status code 400"
        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback
        },
        classLabel(c) {
            return this.$tp(CLASS_LABELS[c] || c)
        },
        categoryPathOf(row) {
            if (!row || !row.categoryId) return ''
            return (this.categoryById[row.categoryId] && categoryPathIn(this.categoryById, row.categoryId)) || row.categoryPath || row.categoryName || row.categoryId
        },
        async loadCategories(refresh) {
            if (this.categoriesLoading) return
            this.categoriesLoading = true
            try {
                const r = await newProductCategories(refresh)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                cache.categories = r.categories || []
                cache.categoriesAt = Date.now()
                this.categories = cache.categories
            } catch (e) {
                this.$message.warning(this.msg(e, this.$tp('Could not read the categories from Zoho Commerce')))
            } finally {
                this.categoriesLoading = false
            }
        },
        // the brand's context when the page has none (kept a few minutes)
        async loadContext(brand) {
            const key = String(brand || '').toLowerCase()
            const hit = cache.contexts[key]
            if (hit && Date.now() - hit.at < CONTEXT_TTL) return hit.ctx
            const r = await getNewProductEditContext(brand)
            if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
            const ctx = { ...blankContext(), ...r }
            cache.contexts[key] = { ctx, at: Date.now() }
            return ctx
        },
        // a model name is the open model (its name, Compatible Model or another name)
        isOpenModel(m) {
            const k = fitKey(m)
            return !!this.model && !!k && [this.model.model, this.model.compatibleModel, ...(this.model.aliases || [])].some(x => fitKey(x) === k)
        },
        withQuality(name, quality, applied) {
            return withQualityTag(name, quality, applied, this.ctx.qualities)
        },
        // Open: the item live from Zoho, and — with the price right — its cost
        // and four price lists (Price Monitoring's live read)
        async open() {
            const seq = ++this.editSeq
            this.clearEditFiles()
            this.editPhotosOrig = ''
            this.editItem = null
            this.editError = ''
            this.editForm = blankEditForm()
            this.editOrig = blankEditForm()
            this.editPricesReady = false
            this.editPricesError = ''
            this.nameFollow = blankFollow()
            this.narrow = window.innerWidth < 900
            this.editLoading = true
            if (!this.itemId) { this.editError = this.$tp('No product picked'); this.editLoading = false; return }
            if (!cache.categories.length || Date.now() - cache.categoriesAt > CATEGORIES_TTL) this.loadCategories()
            else this.categories = cache.categories
            try {
                const [r, ctx] = await Promise.all([
                    getNewProductItem(this.itemId),
                    this.context ? null : this.loadContext(this.brand).catch(() => null)
                ])
                if (seq !== this.editSeq) return
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                if (!this.context) this.ownContext = ctx || blankContext()
                const x = r.item
                this.editServerCanPrice = !!r.canPrice
                const form = {
                    name: x.name || '',
                    quality: x.quality || '',
                    classification: x.classification || '',
                    subClassification: x.subClassification || '',
                    categoryId: x.categoryId || '',
                    compatibleModels: [...(x.compatibleModels || [])],
                    rate: x.rate == null ? undefined : x.rate,
                    cost: undefined,
                    prices: blankPrices()
                }
                this.editOrig = JSON.parse(JSON.stringify(form))
                this.editForm = form
                this.editAppliedQuality = form.quality
                this.editItem = x
                this.editPhotos = (x.photos || []).map(p => ({ key: 'd:' + p.id, id: p.id, url: p.url, name: p.name }))
                this.editPhotosOrig = (x.photos || []).map(p => p.id).join(',')
                this.nameFollow = { ...blankFollow(), part: modelsNamePartFor(this.ctx.brands, this.ctx.rows, this.editBrand, form.compatibleModels) }
                if (this.editCanPrice) this.loadEditPrices(seq, x.itemId)
            } catch (e) {
                if (seq === this.editSeq) this.editError = this.msg(e, this.$tp('Could not read the item from Zoho'))
            } finally {
                if (seq === this.editSeq) this.editLoading = false
            }
        },
        async loadEditPrices(seq, itemId) {
            this.editPricesLoading = true
            try {
                const r = await getStockItemPrices(itemId)
                if (seq !== this.editSeq) return
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                const prices = blankPrices()
                for (const { list } of PRICE_LISTS) prices[list] = r.prices && r.prices[list] != null ? r.prices[list] : undefined
                const cost = r.purchasePrice != null ? r.purchasePrice : undefined
                this.editOrig.prices = { ...prices }
                this.editOrig.cost = cost
                this.editForm.prices = { ...prices }
                this.editForm.cost = cost
                this.editPricesReady = true
            } catch (e) {
                if (seq === this.editSeq) this.editPricesError = this.msg(e, this.$tp('Could not read the prices from Zoho — they are not changed here'))
            } finally {
                if (seq === this.editSeq) this.editPricesLoading = false
            }
        },
        editOffFormula(list) {
            const v = this.editForm.prices[list]
            return v == null || v === '' || Math.abs(Number(v) - this.editFormula[list]) > 0.004
        },
        onEditClassification() {
            const f = this.editForm
            if (f.subClassification && !this.editSubOptions.includes(f.subClassification)) f.subClassification = ''
            if (f.quality && this.editQualityListed && !this.editQualityListed.includes(f.quality)) {
                f.quality = ''
                this.onEditQuality('')
            }
        },
        // the quality's [tag] on the name follows it, as in the create dialog
        onEditQuality(q) {
            this.editForm.name = this.withQuality(this.editForm.name, q || '', this.editAppliedQuality)
            this.editAppliedQuality = q || ''
        },
        // picked or typed: "A; B" becomes two, the same model twice (any case) once
        onEditModels(list) {
            const out = []
            for (const raw of list || []) {
                for (const part of String(raw).split(';')) {
                    const m = part.trim().replace(/\s+/g, ' ')
                    if (!m) continue
                    if (m.length > 80) { this.$message.warning(this.$tp('A model name is 80 characters at most')); continue }
                    if (!out.some(x => x.toLowerCase() === m.toLowerCase())) out.push(m)
                }
            }
            this.editForm.compatibleModels = out
            this.followModels()
        },
        // the models changed: the name follows (swapModelsInName) — the name it
        // had is kept for Undo — or a note says to change it by hand
        followModels() {
            const form = this.editForm
            const st = this.nameFollow
            const part = modelsNamePartFor(this.ctx.brands, this.ctx.rows, this.editBrand, form.compatibleModels)
            if (!part) return
            const next = swapModelsInName(form.name, st.part, part)
            if (next == null) { st.note = 'manual'; return }
            if (next !== form.name) {
                if (st.undo == null) st.undo = form.name
                form.name = next
                st.note = 'updated'
            }
            st.part = part
        },
        // back to the name before the models changed it (with the quality tag as it is now)
        undoFollow() {
            const st = this.nameFollow
            if (st.undo == null) return
            this.editForm.name = this.withQuality(st.undo, this.editForm.quality || '', this.editAppliedQuality)
            this.nameFollow = blankFollow()
        },
        onEditPaste(e) {
            const files = Array.from((e.clipboardData && e.clipboardData.files) || []).filter(x => /^image\//i.test(x.type))
            if (!files.length || !this.$refs.editPhotoPicker) return
            e.preventDefault()
            this.$refs.editPhotoPicker.add(files.map((raw, i) => raw.name && raw.name !== 'image.png'
                ? raw : new File([raw], `screenshot-${Date.now() + i}.png`, { type: raw.type })))
        },
        clearEditFiles() {
            for (const x of this.editPhotos) { if (x.file && x.url && x.url.startsWith('blob:')) { try { URL.revokeObjectURL(x.url) } catch (e) { /* ignore */ } } }
            this.editPhotos = []
        },
        // Save: the item's fields (one Zoho update), then the prices, then the
        // photos — a step that fails is said so; the ones before it are saved
        async saveEdit() {
            if (!this.editItem || this.editSaving || !this.editChangeCount) return
            const fields = this.editFieldChanges
            if (fields.name !== undefined && fields.name.length < 5) return this.$message.warning(this.$tp('Item name is too short'))
            if (fields.compatibleModels && !fields.compatibleModels.length) {
                try {
                    await this.$confirm(this.$tp('Save with no models? The part will not show for any model on this page.'), this.$tp('Compatible Models'),
                        { type: 'warning', confirmButtonText: this.$tp('Save to Zoho'), cancelButtonText: this.$tp('Cancel') })
                } catch (e) { return }
            }
            const itemId = this.editItem.itemId
            const sku = this.editItem.sku
            const prices = this.editPriceChanges
            const photos = this.editPhotosChanged ? this.editPhotos.slice() : null
            const done = []
            const failed = []
            this.editSaving = true
            try {
                if (Object.keys(fields).length) {
                    try {
                        const r = await updateNewProductItem(itemId, fields)
                        if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                        done.push(this.$tp('details'))
                        // the item is renamed; the store product's own name can still fail
                        if (r.store && r.store.error) failed.push(this.$tp('store product name: {error}', { error: r.store.error }))
                    } catch (e) {
                        // nothing else is sent: the dialog stays open to fix it
                        this.$message.error(this.msg(e, this.$tp('Zoho did not update the item')))
                        return
                    }
                }
                if (prices.length) {
                    try {
                        const r = await pushStockItemPrices(prices)
                        const bad = ((r && r.results) || []).filter(x => !x.ok)
                        if (!r || r.success === false || bad.length) {
                            const names = (bad.length ? bad : prices).map(x => x.list === 'purchase' ? this.$tp('Cost price') : (PRICE_LISTS.find(p => p.list === x.list) || { label: x.list }).label)
                            failed.push(this.$tp('prices: {lists}', { lists: names.join(', ') }))
                        } else done.push(this.$tp('prices'))
                    } catch (e) {
                        failed.push(this.$tp('prices: {lists}', { lists: this.msg(e, '') }))
                    }
                }
                if (photos) {
                    // the new files, and the whole list's order ("d:<id>" / "n:<i>") — the first is the main image
                    try {
                        const fresh = photos.filter(p => p.file)
                        const data = new FormData()
                        fresh.forEach(p => data.append('images', p.file, p.file.name))
                        data.append('order', JSON.stringify(photos.map(p => (p.file ? 'n:' + fresh.indexOf(p) : 'd:' + p.id))))
                        const r = await saveNewProductItemPhotos(itemId, data)
                        if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                        done.push(fresh.length ? this.$tp('{n} photo(s)', { n: fresh.length }) : this.$tp('photo order'))
                    } catch (e) {
                        failed.push(this.$tp('photos: {error}', { error: this.msg(e, '') }))
                    }
                }
                if (failed.length) this.$message.warning(this.$tp('{sku}: not saved — {what}', { sku, what: failed.join('; ') }))
                if (done.length) this.$message.success(this.$tp('{sku} saved to Zoho: {what}', { sku, what: done.join(', ') }))
                this.$emit('update:visible', false)
                this.$emit('saved', { itemId, sku, done, failed })
            } finally {
                this.editSaving = false
            }
        }
    }
}
</script>

<style lang="scss" scoped>
/* the same look as Listing's create dialog (newProducts.vue) */
.spn-ct-title { font-size: 15px; font-weight: 600; color: #303133; i { color: #409eff; margin-right: 4px; } }
.spn-ct-sub { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; margin-top: 4px; font-size: 13px; color: #303133; }
.spn-dim { font-size: 11px; color: #909399; line-height: 1.4; }
.spn-link { color: #409eff; text-decoration: none; font-weight: 600; font-variant-numeric: tabular-nums; &:hover { text-decoration: underline; } }
.spn-edit-body { min-height: 120px; }
.spn-none { padding: 14px 12px; font-size: 12px; color: #b88230; }
.spn-row { display: flex; gap: 12px; }
.spn-col { flex: 1; }
.spn-cf { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 0 20px; }
.spn-cf-side { border-left: 1px solid #ebeef5; padding-left: 20px; min-width: 0; }
.spn-sec { display: flex; align-items: center; gap: 4px; margin: 2px 0 8px; font-size: 12px; font-weight: 600; color: #909399; text-transform: uppercase; letter-spacing: .4px; }
.spn-sec:not(:first-child) { margin-top: 14px; padding-top: 12px; border-top: 1px dashed #ebeef5; }
.spn-sec-n { margin-left: 4px; padding: 0 7px; border-radius: 9px; background: #f0f2f5; color: #606266; font-weight: 500; text-transform: none; }
.spn-photos-changed { margin-left: 6px; padding: 0 6px; border-radius: 9px; background: #fdf6ec; color: #e6a23c; font-weight: 500; text-transform: none; }
.spn-help { color: #c0c4cc; cursor: help; font-size: 12px; font-weight: normal; &:hover { color: #409eff; } }
.spn-cf ::v-deep .el-form-item { margin-bottom: 12px; }
.spn-cf ::v-deep .el-form-item__label { padding-bottom: 2px; line-height: 22px; }
.spn-fits-item { margin-bottom: 0 !important; }
.spn-name ::v-deep .el-textarea__inner { padding-bottom: 18px; line-height: 1.5; font-family: Arial, Helvetica, sans-serif; /* as the inputs */ }
.spn-follow { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin: -6px 0 10px; font-size: 12px; color: #67c23a; line-height: 1.5;
    .el-button { padding: 0; } }
.spn-prices { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.spn-price { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.spn-price-label { font-size: 12px; color: #606266; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* a $ in front of a price (el-input-number has no prefix slot) */
.spn-money::before { content: "$"; position: absolute; left: 9px; top: 50%; transform: translateY(-50%); z-index: 1; font-size: 12px; color: #909399; pointer-events: none; }
.spn-money ::v-deep .el-input__inner { padding-left: 20px; text-align: left; }
.spn-price-warn { margin-top: 4px; font-size: 12px; color: #e6a23c; line-height: 1.6; i { margin-right: 2px; } }
/* cost + selling price on the same columns as the four lists below */
.spn-cost { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; align-items: end; margin-bottom: 10px; }
.spn-formula { grid-column: span 2; justify-self: start; padding: 0 0 8px; }
.spn-ref { font-size: 11px; line-height: 16px; color: #409eff; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; &:hover { text-decoration: underline; } }
.spn-cat { display: flex; gap: 6px; }
.spn-cat-pick { flex: 1; min-width: 0; }
.spn-cat-hint { margin-top: 4px; font-size: 12px; line-height: 1.5; color: #909399; i { color: #67c23a; } .el-button { padding: 0; } }
.spn-cfoot { display: flex; align-items: center; gap: 8px; }
.spn-cfoot-sum { flex: 1; min-width: 0; text-align: left; font-size: 12px; color: #909399; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spn-cfoot .el-button + .el-button { margin-left: 0; }
@media (max-width: 899px) {
    .spn-cf { grid-template-columns: 1fr; }
    .spn-cf-side { border-left: 0; padding-left: 0; margin-top: 14px; padding-top: 12px; border-top: 1px dashed #ebeef5; }
    .spn-prices { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .spn-cost { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>

<style lang="scss">
/* appended to <body>: its body scrolls, the footer stays (as Listing's .spn-create-dlg) */
.ped-dlg { display: flex; flex-direction: column; max-height: 90vh; margin-bottom: 0 !important;
    .el-dialog__header { padding: 16px 20px 10px; border-bottom: 1px solid #ebeef5; }
    .el-dialog__body { flex: 1; min-height: 0; overflow: auto; padding: 14px 20px 6px; word-break: normal; }
    .el-dialog__footer { padding: 10px 20px; border-top: 1px solid #ebeef5; } }
</style>
