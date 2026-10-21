<template>
    <!--
        Listing → New Products (user ask 2026-10-21): every product created in
        the dashboard (Listing's Create, Purchase Order's "Create in Zoho"),
        newest first — to review its details and prices, tick it Reviewed, and
        order it from the supplier. Admin, iMobile Admin and iMobile Warehouse.
          · prices: the same editable cells and loading zone as Price
            Monitoring (../zohoInventory/priceEditing.js — one queue for all);
          · Product: its details, prices and photos in Listing's Edit dialog
            (../sparePartsPurchase/components/ProductEditDialog.vue), right here;
          · Reviewed: a green tick, or Approve (also in the Product dialog) —
            approving shows the product in the online store (Zoho Commerce);
          · Create PO: the picked products into Spare Parts Purchase's Add
            Item, as Pending lines (user's pick over a Zoho PO).
        Backend: GET /sparePartsPurchase/new-items, POST …/new-items/review.
    -->
    <div class="app-container ni">
        <div class="ni-head">
            <div>
                <h2 class="ni-title">{{ $tp('New Products') }}</h2>
                <div class="ni-sub">{{ $tp('Products created in the dashboard — review their details and prices, then order them.') }}</div>
            </div>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">{{ $tp('Refresh') }}</el-button>
        </div>

        <div class="ni-filters">
            <el-input v-model="query.search" size="small" clearable prefix-icon="el-icon-search" class="ni-search"
                :placeholder="$tp('Search SKU / name / model')" @input="onSearch" @clear="reload" />
            <el-radio-group v-model="query.reviewed" size="small" @change="reload">
                <el-radio-button label="no">{{ $tp('Not reviewed') }} ({{ counts.notReviewed }})</el-radio-button>
                <el-radio-button label="yes">{{ $tp('Reviewed') }} ({{ counts.reviewed }})</el-radio-button>
                <el-radio-button v-if="counts.changed || query.reviewed === 'changed'" label="changed">{{ $tp('Changed since review') }} ({{ counts.changed }})</el-radio-button>
                <el-radio-button label="">{{ $tp('All') }} ({{ counts.all }})</el-radio-button>
            </el-radio-group>
            <el-select v-model="query.by" size="small" clearable :placeholder="$tp('Created by')" class="ni-sel" @change="reload">
                <el-option v-for="c in creators" :key="c" :label="c" :value="c" />
            </el-select>
            <el-select v-if="brands.length > 1 || query.brand" v-model="query.brand" size="small" clearable :placeholder="$tp('Brand')" class="ni-sel" @change="reload">
                <el-option v-for="b in brands" :key="b" :label="b" :value="b" />
            </el-select>
            <el-select v-model="query.order" size="small" clearable :placeholder="$tp('On order?')" class="ni-sel" @change="reload">
                <el-option :label="$tp('Not on order')" value="no" />
                <el-option :label="$tp('On order')" value="yes" />
            </el-select>
        </div>

        <div class="ni-bar">
            <span class="ni-count">{{ $tp('{n} product(s)', { n: total }) }}<template v-if="selected.length"> · <b>{{ $tp('{n} picked', { n: selected.length }) }}</b></template></span>
            <div class="ni-spacer" />
            <template v-if="selected.length">
                <el-button v-if="canReview && selected.some(r => !r.reviewed)" size="small" type="success" plain icon="el-icon-check" :loading="reviewing"
                    @click="markReviewed(selected.filter(r => !r.reviewed), true)">{{ $tp('Approve {n}', { n: selected.filter(r => !r.reviewed).length }) }}</el-button>
                <el-button v-if="canReview && selected.some(r => r.reviewed)" size="small" plain :disabled="reviewing"
                    @click="markReviewed(selected.filter(r => r.reviewed), false)">{{ $tp('Undo approval') }}</el-button>
                <el-button v-if="canOrder" size="small" type="primary" icon="el-icon-shopping-cart-2"
                    @click="openPo(selected)">{{ $tp('Create PO ({n})', { n: selected.length }) }}</el-button>
            </template>
            <span v-else class="ni-hint">{{ $tp('Tick products to approve them or create a PO together') }}</span>
        </div>

        <el-table ref="table" v-loading="loading" :data="rows" size="mini" border row-key="itemId" class="ni-table"
            :empty-text="$tp('Nothing matches these filters')" :row-class-name="rowClass" @selection-change="sel => (selected = sel)">
            <el-table-column type="selection" width="40" align="center" />
            <el-table-column :label="$tp('Product')" min-width="300">
                <template slot-scope="s">
                    <div class="ni-prod">
                        <product-thumb :src="s.row.imageUrl" :item-id="s.row.itemId" />
                        <div class="ni-prod-text">
                            <div class="ni-name"><span :title="s.row.name">{{ s.row.name || '—' }}</span>
                                <a class="ni-zoho" :href="zohoLink(s.row.itemId)" target="_blank" rel="noopener" :title="$tp('Open in Zoho')"
                                    @click.stop><i class="el-icon-link" /> {{ $tp('Open in Zoho') }}</a></div>
                            <div class="ni-meta">
                                <span class="ni-sku">{{ s.row.sku || '—' }}</span>
                                <span v-if="s.row.classification">{{ s.row.classification }}<template v-if="s.row.subClassification"> · {{ s.row.subClassification }}</template></span>
                                <el-tag v-if="s.row.quality" size="mini" type="info" effect="plain">{{ s.row.quality }}</el-tag>
                                <el-tag v-if="!s.row.active" size="mini" type="danger" effect="plain">{{ $tp('inactive') }}</el-tag>
                                <el-tag v-if="s.row.showInStore" size="mini" type="success" effect="plain">{{ $tp('In store') }}</el-tag>
                            </div>
                            <div class="ni-created"><i class="el-icon-time" /> {{ fmtWhen(s.row.createdAt) }} · {{ s.row.createdBy || '—' }} · {{ viaText(s.row) }}</div>
                        </div>
                    </div>
                </template>
            </el-table-column>
            <!-- cost + the four lists: Price Monitoring's cells (click to edit) -->
            <el-table-column v-for="c in EDIT_COLS" :key="c.prop" :label="c.list === 'purchase' ? $tp('Cost') : c.label"
                :width="c.list === 'purchase' ? 92 : 96" align="center">
                <template slot-scope="s">
                    <price-cell :row="s.row" :col="c" :pm="pm" compact />
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Checks')" width="116">
                <template slot-scope="s">
                    <div class="ni-tags">
                        <el-tag v-for="k in issuesOf(s.row)" :key="k" size="mini" :type="ISSUE_TYPES[k] || 'warning'" effect="plain">{{ $tp(ISSUE_LABELS[k]) }}</el-tag>
                        <span v-if="!issuesOf(s.row).length" class="ni-ok"><i class="el-icon-circle-check" /> {{ $tp('OK') }}</span>
                    </div>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('On order')" width="100">
                <template slot-scope="s">
                    <template v-if="s.row.onOrder">
                        <div class="ni-order">{{ orderText(s.row.onOrder) }}</div>
                        <div class="ni-dim">{{ s.row.onOrder.lastNo }}</div>
                    </template>
                    <span v-else class="ni-dim">—</span>
                </template>
            </el-table-column>
            <!-- reviewed: a green tick (who / when); not yet: Approve (user 2026-10-21) -->
            <el-table-column :label="$tp('Reviewed')" width="116" align="center">
                <template slot-scope="s">
                    <template v-if="s.row.reviewed">
                        <div class="ni-rv-ok"><i class="el-icon-success" /> {{ $tp('Reviewed') }}</div>
                        <div class="ni-dim">{{ s.row.reviewed.by }} · {{ fmtWhen(s.row.reviewed.at) }}</div>
                        <div v-if="s.row.changedSinceReview.length" class="ni-changed">
                            <i class="el-icon-warning-outline" /> {{ $tp('Changed: {what}', { what: s.row.changedSinceReview.join(', ') }) }}
                            <div v-if="canReview"><el-button type="text" size="mini" :disabled="!!s.row.__reviewBusy"
                                @click="markReviewed([s.row], true)">{{ $tp('Approve again') }}</el-button></div>
                        </div>
                    </template>
                    <el-tooltip v-else-if="canReview" :content="$tp('Approve it and show it in the online store')" placement="top">
                        <el-button size="mini" type="success" plain icon="el-icon-check" :loading="!!s.row.__reviewBusy"
                            @click="markReviewed([s.row], true)">{{ $tp('Approve') }}</el-button>
                    </el-tooltip>
                    <span v-else class="ni-dim">{{ $tp('Not reviewed') }}</span>
                </template>
            </el-table-column>
            <!-- pinned right on a wide screen; on a phone it would cover the product -->
            <el-table-column label="" width="124" align="center" :fixed="mobile ? false : 'right'">
                <template slot-scope="s">
                    <div class="ni-acts">
                        <!-- details, prices and photos in one dialog (the same as Listing's Edit) -->
                        <el-button v-if="canEditListing" size="mini" icon="el-icon-edit" @click="openProduct(s.row)">{{ $tp('Product') }}</el-button>
                        <el-button v-if="canOrder" size="mini" type="primary" plain icon="el-icon-shopping-cart-2" @click="openPo([s.row])">{{ $tp('Create PO') }}</el-button>
                    </div>
                </template>
            </el-table-column>
        </el-table>

        <el-pagination v-if="total > query.pageSize" class="ni-pager" background small layout="total, sizes, prev, pager, next"
            :total="total" :page-size="query.pageSize" :page-sizes="[20, 50, 100, 200]" :current-page="query.page"
            @current-change="p => { query.page = p; load() }" @size-change="n => { query.pageSize = n; reload() }" />

        <!-- price changes waiting for Zoho (shared with Price Monitoring / Browse Items) -->
        <price-queue-zone :pm="pm" />

        <!-- Create PO = Spare Parts Purchase → Purchase Order's Add Item, filled with the picked products -->
        <add-item-dialog :visible.sync="poVisible" :preset="poItems" title="Create PO" :mobile="mobile" @added="onOrdered" />

        <!-- Product: details, prices and photos, saved to Zoho (Listing's Edit dialog) — and Approve from there -->
        <product-edit-dialog :visible.sync="productVisible" :item-id="productRow ? productRow.itemId : ''" :brand="productRow ? productRow.deviceBrand : ''"
            title="Product details" @saved="onProductSaved">
            <template #footer-extra="{ changed }">
                <el-tooltip v-if="canReview && productRow && !productRow.reviewed" :disabled="!changed" placement="top"
                    :content="$tp('Save the changes first')">
                    <span><el-button size="small" type="success" plain icon="el-icon-check" :disabled="changed" :loading="reviewing"
                        @click="approveFromDialog">{{ $tp('Approve') }}</el-button></span>
                </el-tooltip>
            </template>
        </product-edit-dialog>
    </div>
</template>

<script>
import ProductThumb from '@/components/ProductThumb'
import auth from '@/plugins/auth'
import priceEditMixin from '../zohoInventory/priceEditing'
import PriceCell from '../zohoInventory/components/PriceCell'
import PriceQueueZone from '../zohoInventory/components/PriceQueueZone'
import AddItemDialog from '../sparePartsPurchase/components/AddItemDialog'
import ProductEditDialog from '../sparePartsPurchase/components/ProductEditDialog'
import { zohoLink } from '../sparePartsPurchase/shared'
import { listNewItems, reviewNewItems } from '@/api/sparePartsPurchase'

const ISSUE_LABELS = {
    noCost: 'No cost',
    missingPrice: 'Missing price',
    belowCost: 'Below cost',
    wrongOrder: 'Wrong order',
    offFormula: 'Off formula',
    noPhoto: 'No photo',
    noCategory: 'No category'
}
const ISSUE_TYPES = { noCost: 'danger', missingPrice: 'danger', belowCost: 'danger' }
const ORDER_STAGES = [['pending', 'pending'], ['toConfirm', 'to confirm'], ['ordered', 'ordered'], ['shipped', 'shipped'], ['shortage', 'shortage']]

export default {
    name: 'ListingNewItems',
    components: { ProductThumb, PriceCell, PriceQueueZone, AddItemDialog, ProductEditDialog },
    mixins: [priceEditMixin],
    data() {
        return {
            ISSUE_LABELS,
            ISSUE_TYPES,
            loading: false,
            loaded: false,
            seq: 0,
            rows: [],
            total: 0,
            counts: { all: 0, notReviewed: 0, reviewed: 0, changed: 0 },
            creators: [],
            brands: [],
            query: { search: '', reviewed: 'no', by: '', brand: '', order: '', page: 1, pageSize: 50 },
            selected: [],
            reviewing: false,
            poVisible: false,
            poItems: [],
            // the Product dialog: its row
            productVisible: false,
            productRow: null,
            mobile: window.innerWidth < 768,
            searchTimer: null
        }
    },
    computed: {
        canReview() { return auth.hasPermi('newproduct:item:review') },
        canOrder() { return auth.hasPermiOr(['spp:order:create', 'spp:order:add']) },
        canEditListing() { return auth.hasPermi('listing:product:create') }
    },
    created() {
        this.load()
    },
    // kept open in a tab: back from the Purchase Order page, Price Monitoring … → fresh figures
    activated() {
        if (this.loaded && !this.loading) this.load()
    },
    beforeDestroy() {
        clearTimeout(this.searchTimer)
    },
    methods: {
        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback
        },
        onSearch() {
            clearTimeout(this.searchTimer)
            this.searchTimer = setTimeout(this.reload, 350)
        },
        reload() {
            this.query.page = 1
            this.load()
        },
        async load() {
            const seq = ++this.seq
            this.loading = true
            try {
                const q = this.query
                const r = await listNewItems({
                    search: q.search || undefined, reviewed: q.reviewed || undefined, by: q.by || undefined, brand: q.brand || undefined,
                    order: q.order || undefined, page: q.page, pageSize: q.pageSize
                })
                if (seq !== this.seq) return
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.rows || []
                this.total = r.total || 0
                this.counts = r.counts || this.counts
                this.creators = r.creators || []
                this.brands = r.brands || []
                this.loaded = true
            } catch (e) {
                if (seq === this.seq) this.$message.error(this.msg(e, this.$tp('Failed to load the new products')))
            } finally {
                if (seq === this.seq) this.loading = false
            }
        },
        // worked out from the row as it is now (a price push or live check changes it)
        issuesOf(r) {
            const out = []
            if (!(Number(r.purchasePrice) > 0)) out.push('noCost')
            if (r.priceMissing || r.pricePlaceholder) out.push('missingPrice')
            if (r.priceBelowCost) out.push('belowCost')
            if (r.priceOrderBroken) out.push('wrongOrder')
            if (r.priceRuleBroken) out.push('offFormula')
            if (!r.imageId) out.push('noPhoto')
            if (!r.zohoCategoryId) out.push('noCategory')
            return out
        },
        rowClass({ row }) {
            return row.reviewed ? 'ni-row-reviewed' : ''
        },
        fmtWhen(d) {
            if (!d) return '—'
            const t = new Date(d)
            return t.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        },
        viaText(r) {
            const via = (r.via || []).map(v => this.$tp(v)).join(' + ')
            return r.orderNo ? `${via} ${r.orderNo}` : via
        },
        orderText(o) {
            return ORDER_STAGES.filter(([k]) => o[k]).map(([k, label]) => `${o[k]} ${this.$tp(label)}`).join(' · ') || this.$tp('{n} line(s)', { n: o.lines })
        },
        async markReviewed(list, reviewed) {
            const rows = list.filter(r => r.__reviewBusy !== true)
            if (!rows.length || this.reviewing) return
            // several at once go live in the store together: say so first
            if (reviewed && rows.length > 1) {
                try {
                    await this.$confirm(this.$tp('Approve {n} products and show them in the online store?', { n: rows.length }), this.$tp('Approve'),
                        { type: 'warning', confirmButtonText: this.$tp('Approve'), cancelButtonText: this.$tp('Cancel') })
                } catch (e) { return }
            }
            this.reviewing = true
            rows.forEach(r => this.$set(r, '__reviewBusy', true))
            try {
                const r = await reviewNewItems(rows.map(x => x.itemId), reviewed)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                // the filter counts follow at once (the list itself stays till the next load)
                // approving: only the ones the store now shows came back (r.reviewed); the rest in r.failed
                const done = rows.filter(row => !reviewed || (r.reviewed && r.reviewed[row.itemId]))
                for (const row of done) {
                    const was = !!row.reviewed
                    if (was && row.changedSinceReview.length) this.counts.changed--
                    row.reviewed = (r.reviewed && r.reviewed[row.itemId]) || null
                    row.changedSinceReview = []
                    if (reviewed) row.showInStore = true
                    if (was !== !!row.reviewed) {
                        this.counts.reviewed += row.reviewed ? 1 : -1
                        this.counts.notReviewed += row.reviewed ? -1 : 1
                    }
                }
                const failed = r.failed || []
                if (failed.length) {
                    this.$message({ type: 'error', duration: 8000, showClose: true,
                        message: this.$tp('Not approved — the store could not show {what}', { what: failed.map(x => `${x.sku || x.itemId} (${x.message})`).join('; ') }) })
                }
                if (done.length > 1 || (done.length && failed.length)) this.$message.success(reviewed ? this.$tp('{n} approved', { n: done.length }) : this.$tp('{n} approvals undone', { n: done.length }))
                if (this.$refs.table && rows.length > 1) this.$refs.table.clearSelection()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Could not save the review')))
            } finally {
                rows.forEach(r => this.$set(r, '__reviewBusy', false))
                this.reviewing = false
            }
        },
        openPo(list) {
            this.poItems = list.slice(0, 100).map(r => ({
                itemId: r.itemId, sku: r.sku, name: r.name, imageId: r.imageId, imageUrl: r.imageUrl,
                suggestedCategory: r.suggestedCategory, available: r.available
            }))
            if (list.length > 100) this.$message.warning(this.$tp('At most {n} items at a time', { n: 100 }))
            this.poVisible = true
        },
        onOrdered(e) {
            if (this.$refs.table) this.$refs.table.clearSelection()
            if (e && e.orderNos && e.orderNos.length) this.$message.success(this.$tp('On Spare Parts Purchase → Purchase Order as Pending: {nos}', { nos: e.orderNos.join(', ') }))
            this.load()
        },
        zohoLink,
        openProduct(row) {
            this.productRow = row
            this.productVisible = true
        },
        // saved to Zoho (and mirrored into the register): the list again
        onProductSaved() {
            this.load()
        },
        // Approve from the Product dialog (what Zoho has now — saved first)
        async approveFromDialog() {
            const row = this.productRow
            if (!row) return
            await this.markReviewed([row], true)
            if (row.reviewed) {
                this.$message.success(this.$tp('{sku} approved', { sku: row.sku }))
                this.productVisible = false
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.ni-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.ni-title { margin: 0; font-size: 20px; font-weight: 600; color: #303133; line-height: 1.2; }
.ni-sub { color: #909399; font-size: 13px; margin-top: 4px; }
.ni-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; margin-bottom: 10px; }
.ni-search { width: 260px; }
.ni-sel { width: 150px; }
.ni-bar { display: flex; align-items: center; gap: 8px; min-height: 32px; margin-bottom: 8px; flex-wrap: wrap;
    .el-button + .el-button { margin-left: 0; } }
.ni-count { font-size: 13px; color: #606266; }
.ni-hint { font-size: 12px; color: #c0c4cc; }
.ni-spacer { flex: 1; }
.ni-prod { display: flex; gap: 10px; align-items: flex-start; }
.ni-prod-text { min-width: 0; flex: 1; }
.ni-name { font-size: 13px; color: #303133; line-height: 1.35; word-break: normal; }
.ni-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; font-size: 12px; color: #909399; margin-top: 2px; }
.ni-sku { font-weight: 600; color: #1890ff; font-variant-numeric: tabular-nums; }
.ni-created { font-size: 11px; color: #909399; margin-top: 3px; i { margin-right: 2px; } }
.ni-dim { font-size: 11px; color: #909399; line-height: 1.4; }
.ni-tags { display: flex; flex-wrap: wrap; gap: 3px; }
.ni-ok { font-size: 12px; color: #67c23a; }
.ni-order { font-size: 12px; color: #e6a23c; line-height: 1.4; }
.ni-changed { font-size: 11px; color: #e6a23c; line-height: 1.4; margin-top: 2px; word-break: normal;
    .el-button { padding: 0; font-size: 11px; } }
.ni-rv-ok { font-size: 12px; font-weight: 600; color: #67c23a; i { font-size: 14px; vertical-align: -1px; } }
.ni-table ::v-deep .ni-row-reviewed > td { background: #f6fbf3; }
/* the row's two buttons, one under the other */
.ni-acts { display: flex; flex-direction: column; align-items: stretch; gap: 6px;
    .el-button { margin: 0; padding: 6px 4px; } }
/* Open in Zoho, beside the product's name */
.ni-zoho { margin-left: 6px; font-size: 11px; color: #409eff; white-space: nowrap; text-decoration: none; &:hover { text-decoration: underline; } }
.ni-pager { margin-top: 12px; text-align: right; }
@media (max-width: 767px) {
    .ni-search { width: 100%; }
    .ni-sel { width: calc(50% - 5px); }
    .ni-head { flex-direction: column; }
}
</style>
