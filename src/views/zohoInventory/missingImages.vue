<template>
    <div class="app-container sd">

        <!-- ── header ───────────────────────────────────────────────── -->
        <div class="sd-head">
            <div class="sd-title">
                <h2>Missing Images</h2>
                <div v-if="snapshotDate" :class="['sd-asof', staleness.tone]">
                    <i :class="staleness.icon" />
                    {{ staleness.text }}
                </div>
            </div>
            <div class="sd-spacer" />
            <el-button size="small" plain type="success" icon="el-icon-download"
                :loading="exporting" @click="exportCsv">Export</el-button>
        </div>

        <el-alert v-if="runProblem" :title="runProblem" type="warning" show-icon :closable="false"
            class="sd-alert" />

        <!-- ── filters ──────────────────────────────────────────────── -->
        <div class="sd-filters">
            <el-input v-model="query.search" size="small" clearable class="sd-search"
                placeholder="SKU or product name" prefix-icon="el-icon-search"
                @keyup.enter.native="reload" @clear="reload" />

            <el-select v-model="query.category" size="small" clearable filterable placeholder="Category"
                class="sd-sel" @change="reload">
                <el-option v-for="o in options.categories" :key="o.value"
                    :label="`${o.value} (${o.count})`" :value="o.value" />
            </el-select>

            <el-select v-model="query.collection" size="small" clearable filterable placeholder="Collection"
                class="sd-sel" @change="reload">
                <el-option v-for="o in options.collections" :key="o.value"
                    :label="`${o.value} (${o.count})`" :value="o.value" />
            </el-select>

            <el-select v-model="query.vendor" size="small" clearable filterable placeholder="Vendor"
                class="sd-sel" @change="reload">
                <el-option v-for="o in options.vendors" :key="o.value"
                    :label="`${o.value} (${o.count})`" :value="o.value" />
            </el-select>

            <el-button size="mini" type="primary" icon="el-icon-search" @click="reload">Search</el-button>
            <el-button size="mini" icon="el-icon-refresh" @click="resetFilters">Reset</el-button>

            <div class="sd-spacer" />
            <!-- Archived products without an image — viewable to restore. -->
            <el-button v-if="counts.noImageArchived || query.filter === ARCHIVED" type="text" size="mini"
                class="sd-archived-link" @click="pickTile(ARCHIVED)">
                {{ (counts.noImageArchived || 0).toLocaleString() }} archived
                {{ query.filter === ARCHIVED ? '— hide' : '— view' }}
            </el-button>
        </div>

        <!-- ── the counts, each one a filter ────────────────────────── -->
        <div class="sd-tiles" v-loading="summaryLoading">
            <div v-for="t in TILES" :key="t.key"
                :class="['sd-tile', 'tone-' + t.tone, { on: query.filter === t.key }]"
                @click="pickTile(t.key)">
                <div class="sd-tile-label">{{ t.label }}</div>
                <div class="sd-tile-value">{{ (counts[t.key] || 0).toLocaleString() }}</div>
                <div class="sd-tile-note">{{ t.note }}</div>
            </div>
        </div>

        <!-- ── the working list ─────────────────────────────────────── -->
        <div class="sd-card">
            <div class="sd-card-head">
                <span class="sd-card-title">{{ activeTile.title }}</span>
                <el-tag size="mini" :type="activeTile.tag" effect="plain">
                    {{ total.toLocaleString() }} items
                </el-tag>
                <span class="sd-dim">Upload from the row, or add in Zoho Inventory (shows after the nightly update).</span>
                <div class="sd-spacer" />
                <el-button type="text" size="mini" icon="el-icon-refresh"
                    @click="refreshData">Refresh</el-button>
            </div>

            <el-table :data="rows" v-loading="loading" size="mini" border
                :default-sort="{ prop: query.sort, order: query.order === 'asc' ? 'ascending' : 'descending' }"
                @sort-change="onSort" empty-text="Every product here has an image.">
                <el-table-column prop="name" label="Item" min-width="340" sortable="custom">
                    <template slot-scope="s">
                        <div class="mi-item">
                            <!-- Placeholder until an upload adds the image. -->
                            <product-thumb :src="s.row.imageUrl" :item-id="s.row.itemId" />
                            <div class="mi-text">
                                <!-- Straight into the item in Zoho Inventory. -->
                                <a class="mi-item-link"
                                    :href="`https://inventory.zoho.com/app/746138234#/inventory/items/${s.row.itemId}`"
                                    target="_blank" rel="noopener" :title="s.row.name">{{ s.row.name }}</a>
                                <div class="mi-item-meta">
                                    <span class="sd-sku">{{ s.row.sku || '—' }}</span>
                                    <el-tag v-if="s.row.imageUrl" size="mini" type="success" effect="plain">image added</el-tag>
                                </div>
                            </div>
                        </div>
                    </template>
                </el-table-column>

                <el-table-column prop="category" label="Category" min-width="150" show-overflow-tooltip>
                    <template slot-scope="s">{{ s.row.category || '—' }}</template>
                </el-table-column>

                <el-table-column prop="location" label="Shelf" width="110" sortable="custom" show-overflow-tooltip>
                    <template slot-scope="s">{{ s.row.location || '—' }}</template>
                </el-table-column>

                <el-table-column prop="available" label="Stock" width="86" align="center" sortable="custom">
                    <template slot-scope="s">
                        <span :class="['sd-num', s.row.available <= 0 ? 'sd-bad' : '']">{{ s.row.available }}</span>
                    </template>
                </el-table-column>

                <el-table-column prop="units90" label="Sold 90d" width="96" align="center" sortable="custom">
                    <template slot-scope="s">
                        <span :class="s.row.units90 ? 'sd-num' : 'sd-dim'">{{ s.row.units90 || 0 }}</span>
                    </template>
                </el-table-column>

                <el-table-column prop="daysSinceSale" label="Last sale" width="100" align="center" sortable="custom">
                    <template slot-scope="s">
                        <span v-if="s.row.daysSinceSale == null" class="sd-dim">never</span>
                        <span v-else class="sd-num">{{ s.row.daysSinceSale }}d ago</span>
                    </template>
                </el-table-column>

                <el-table-column label="" width="80" align="center">
                    <template slot-scope="s">
                        <!-- Upload one or more images straight to the item in Zoho. -->
                        <el-tooltip v-if="canEdit" content="Upload images to Zoho" placement="top">
                            <el-button type="text" size="mini" icon="el-icon-upload2" @click="openUpload(s.row)" />
                        </el-tooltip>
                        <!-- Move to / restore from the Archive bucket (shared with
                             Stock and Price Monitoring). -->
                        <el-tooltip v-if="canEdit" placement="top"
                            :content="query.filter === ARCHIVED ? 'Restore from Archive' : 'Move to Archive'">
                            <el-button type="text" size="mini" :loading="s.row.__archivedBusy"
                                :icon="query.filter === ARCHIVED ? 'el-icon-refresh-left' : 'el-icon-box'"
                                @click="toggleArchive(s.row)" />
                        </el-tooltip>
                    </template>
                </el-table-column>
            </el-table>

            <div class="sd-pager">
                <el-pagination background layout="total, sizes, prev, pager, next"
                    :current-page="query.page" :page-size="query.pageSize" :page-sizes="[20, 50, 100, 200]"
                    :total="total" @current-change="onPage" @size-change="onSize" />
            </div>
        </div>
        <!-- ── upload images to Zoho ───────────────────────────────── -->
        <el-dialog :visible.sync="upload.visible" title="Upload images to Zoho" width="640px"
            :close-on-click-modal="false" append-to-body @closed="clearUpload">
            <div v-if="upload.row" class="mi-up-head">
                <span class="sd-sku">{{ upload.row.sku || '—' }}</span>
                <span class="mi-up-title">{{ upload.row.name }}</span>
            </div>

            <div :class="['mi-drop', { over: upload.over }]" @click="$refs.imageInput.click()"
                @dragover.prevent="upload.over = true" @dragleave.prevent="upload.over = false"
                @drop.prevent="onDrop">
                <i class="el-icon-upload" />
                <div>Drop images here or <em>choose files</em></div>
                <div class="sd-dim">gif, png, jpeg, bmp or webp · up to 7 MB each · {{ MAX_UPLOAD }} at most</div>
            </div>
            <input ref="imageInput" type="file" multiple accept="image/gif,image/png,image/jpeg,image/bmp,image/webp"
                class="mi-hidden-input" @change="onPick">

            <div v-if="upload.files.length" class="mi-up-grid">
                <div v-for="(f, i) in upload.files" :key="f.key" :class="['mi-up-card', { main: i === 0 && !upload.hasImage }]">
                    <i class="el-icon-close mi-up-remove" title="Remove" @click="removeUpload(i)" />
                    <img :src="f.url" alt="">
                    <div class="mi-up-name" :title="f.file.name">{{ f.file.name }}</div>
                    <div class="mi-up-foot">
                        <span class="sd-dim">{{ sizeText(f.file.size) }}</span>
                        <span v-if="i === 0 && !upload.hasImage" class="mi-up-main">Main image</span>
                        <el-button v-else-if="!upload.hasImage" type="text" size="mini" @click="makeMain(i)">Set as main</el-button>
                    </div>
                </div>
            </div>
            <div v-if="upload.hasImage" class="mi-up-note">
                <i class="el-icon-info" /> This product already has a main image — these are added after it.
            </div>

            <span slot="footer">
                <el-button size="small" :disabled="upload.busy" @click="upload.visible = false">Cancel</el-button>
                <el-button size="small" type="primary" :loading="upload.busy" :disabled="!upload.files.length"
                    @click="submitUpload">Upload {{ upload.files.length || '' }} to Zoho</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import auth from '@/plugins/auth'
import { getStockSummary, getStockItems, setStockItemArchived, uploadStockItemImages } from '@/api/stockMonitor'
import ProductThumb from '@/components/ProductThumb'

// Tile keys are also the backend filter names (FILTERS in stockMonitorRoutes).
const TILES = [
    { key: 'noImage', label: 'No Image', title: 'All products without an image', tone: 'bad', tag: 'danger', note: 'spare parts, archive excluded' },
    { key: 'noImageInStock', label: 'In Stock', title: 'No image — in stock', tone: 'warn', tag: 'warning', note: 'on the shelf, fix these first' },
    { key: 'noImageOutOfStock', label: 'Out of Stock', title: 'No image — out of stock', tone: 'ok', tag: 'info', note: 'nothing available' }
]
// The archived products without an image (backend filter of the same name).
const ARCHIVED = 'noImageArchived'
// Zoho's upload limits (the backend checks the same).
const UPLOAD_TYPES = /^image\/(gif|png|jpe?g|bmp|webp)$/i
const MAX_UPLOAD_BYTES = 7 * 1024 * 1024
const MAX_UPLOAD = 10

export default {
    name: 'MissingImages',
    components: { ProductThumb },
    data() {
        return {
            TILES,
            ARCHIVED,
            MAX_UPLOAD,
            // Upload dialog: the row, and the picked files in upload order
            // ({ key, file, url } — url is a local preview).
            upload: { visible: false, row: null, files: [], busy: false, over: false, hasImage: false },
            loading: false,
            summaryLoading: false,
            exporting: false,
            // Set after the first summary answer, so the "no snapshot"
            // warning can't flash while the page is still loading.
            loaded: false,

            snapshotDate: null,
            run: null,
            counts: {},
            options: { categories: [], collections: [], vendors: [] },

            rows: [],
            total: 0,
            query: {
                filter: 'noImage',
                search: '', category: '', collection: '', vendor: '',
                sort: 'available', order: 'desc', page: 1, pageSize: 50
            }
        }
    },
    computed: {
        canEdit() {
            return auth.hasPermi('zoho:stock:edit')
        },
        activeTile() {
            if (this.query.filter === ARCHIVED) {
                return { key: ARCHIVED, title: 'Archived — no image', tag: 'info' }
            }
            return TILES.find(t => t.key === this.query.filter) || TILES[0]
        },
        staleness() {
            if (!this.snapshotDate) return { tone: 'bad', icon: 'el-icon-warning-outline', text: 'No snapshot yet' }
            const days = Math.floor((Date.now() - new Date(this.snapshotDate + 'T00:00:00').getTime()) / 86400000)
            if (days <= 0) return { tone: 'ok', icon: 'el-icon-time', text: 'Images as checked today' }
            if (days === 1) return { tone: 'ok', icon: 'el-icon-time', text: 'Images as checked yesterday' }
            return { tone: 'warn', icon: 'el-icon-warning-outline', text: `Checked ${days} days ago` }
        },
        runProblem() {
            if (!this.loaded) return ''
            if (!this.snapshotDate) return 'No stock snapshot has been taken yet — run the daily job to populate this page.'
            if (this.run && this.run.ok === false) {
                return `The last snapshot failed${this.run.error ? ': ' + this.run.error : ''}. The list below is from the last good run.`
            }
            if (this.staleness.tone === 'warn') {
                return 'The snapshot is more than a day old — the daily job may not be running.'
            }
            return ''
        }
    },
    created() {
        this.reload()
    },
    beforeDestroy() {
        this.clearUpload()
    },
    methods: {
        async reload() {
            this.query.page = 1
            await Promise.all([this.loadItems(), this.loadSummary()])
        },
        async loadSummary() {
            this.summaryLoading = true
            try {
                // Filters ride along so the tiles count what the table shows.
                const r = await getStockSummary({
                    scope: 'parts',
                    search: this.query.search,
                    category: this.query.category,
                    collection: this.query.collection,
                    vendor: this.query.vendor
                })
                this.snapshotDate = r.snapshotDate
                this.run = r.run
                this.counts = r.counts || {}
                if (r.options) this.options = r.options
            } catch (e) {
                this.$message.error(this.msg(e, 'Could not load the image summary'))
            } finally {
                this.summaryLoading = false
                this.loaded = true
            }
        },
        async loadItems() {
            this.loading = true
            try {
                const r = await getStockItems({ scope: 'parts', ...this.query })
                this.rows = r.rows || []
                this.total = r.total || 0
                this.snapshotDate = r.snapshotDate || this.snapshotDate
            } catch (e) {
                this.$message.error(this.msg(e, 'Could not load the list'))
            } finally {
                this.loading = false
            }
        },
        // No "all items" view here — clicking the active tile goes back to
        // the full no-image list.
        pickTile(key) {
            this.query.filter = this.query.filter === key ? 'noImage' : key
            this.query.page = 1
            this.loadItems()
        },
        // Move a row to the Archive bucket, or restore it from the archived
        // view — it leaves the current list either way. Restoring a
        // criteria-matched name pins it as never-archived.
        async toggleArchive(row) {
            if (row.__archivedBusy) return
            const restoring = this.query.filter === ARCHIVED
            this.$set(row, '__archivedBusy', true)
            try {
                const r = await setStockItemArchived(row.itemId, restoring)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(`${row.sku || row.name} ${restoring ? 'restored' : 'moved to Archive'}`)
                this.loadItems()
                this.loadSummary()
            } catch (e) {
                this.$message.error(this.msg(e, 'Update failed'))
            } finally {
                this.$set(row, '__archivedBusy', false)
            }
        },
        refreshData() {
            this.loadItems()
            this.loadSummary()
        },
        resetFilters() {
            Object.assign(this.query, {
                filter: 'noImage', search: '', category: '', collection: '', vendor: '',
                sort: 'available', order: 'desc', page: 1
            })
            this.loadItems()
            this.loadSummary()
        },
        onSort({ prop, order }) {
            if (!prop || !order) return
            this.query.sort = prop
            this.query.order = order === 'ascending' ? 'asc' : 'desc'
            this.query.page = 1
            this.loadItems()
        },
        onPage(p) { this.query.page = p; this.loadItems() },
        onSize(s) { this.query.pageSize = s; this.query.page = 1; this.loadItems() },

        // ── image upload ───────────────────────────────────────────
        openUpload(row) {
            this.clearUpload()
            this.upload.row = row
            this.upload.hasImage = !!row.imageUrl
            this.upload.visible = true
        },
        onPick(e) {
            this.addUploads(e.target.files)
            e.target.value = '' // picking the same file again still fires change
        },
        onDrop(e) {
            this.upload.over = false
            this.addUploads(e.dataTransfer && e.dataTransfer.files)
        },
        // Same checks as the backend (and Zoho): type, 7 MB, how many.
        addUploads(fileList) {
            const skipped = []
            for (const file of Array.from(fileList || [])) {
                if (!UPLOAD_TYPES.test(file.type)) { skipped.push(`${file.name} (not an image type Zoho takes)`); continue }
                if (file.size > MAX_UPLOAD_BYTES) { skipped.push(`${file.name} (over 7 MB)`); continue }
                if (this.upload.files.length >= MAX_UPLOAD) { skipped.push(`${file.name} (${MAX_UPLOAD} at most)`); continue }
                this.upload.files.push({ key: `${Date.now()}-${Math.random()}`, file, url: URL.createObjectURL(file) })
            }
            if (skipped.length) this.$message.warning(`Skipped: ${skipped.join(', ')}`)
        },
        removeUpload(i) {
            const [f] = this.upload.files.splice(i, 1)
            if (f) URL.revokeObjectURL(f.url)
        },
        // The first image is the one Zoho makes the main image.
        makeMain(i) {
            const [f] = this.upload.files.splice(i, 1)
            this.upload.files.unshift(f)
        },
        clearUpload() {
            for (const f of this.upload.files) URL.revokeObjectURL(f.url)
            Object.assign(this.upload, { row: null, files: [], busy: false, over: false, hasImage: false })
        },
        async submitUpload() {
            const row = this.upload.row
            if (!row || !this.upload.files.length || this.upload.busy) return
            this.upload.busy = true
            try {
                const files = this.upload.files.map(f => f.file)
                const r = await uploadStockItemImages(row.itemId, files)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Upload failed')
                if (r.imageUrl) this.$set(row, 'imageUrl', r.imageUrl)
                this.$message.success(`${row.sku || row.name}: ${r.uploaded} ${r.uploaded === 1 ? 'image' : 'images'} uploaded to Zoho`)
                this.upload.visible = false
                this.loadSummary()
            } catch (e) {
                this.$message.error(this.msg(e, 'Upload failed'))
            } finally {
                this.upload.busy = false
            }
        },
        sizeText(bytes) {
            return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
        },

        // Every row of the current view, 200 a page.
        async exportCsv() {
            this.exporting = true
            try {
                const all = []
                for (let page = 1; ; page++) {
                    const r = await getStockItems({ scope: 'parts', ...this.query, page, pageSize: 200 })
                    all.push(...(r.rows || []))
                    if (!(r.rows || []).length || all.length >= (r.total || 0)) break
                }
                const head = ['Item ID', 'SKU', 'Item Name', 'Category', 'Shelf', 'Stock', 'Sold 90d', 'Zoho link']
                const cell = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`
                const lines = [head.map(cell).join(',')]
                for (const x of all) {
                    lines.push([x.itemId, x.sku, x.name, x.category, x.location, x.available, x.units90 || 0,
                        `https://inventory.zoho.com/app/746138234#/inventory/items/${x.itemId}`].map(cell).join(','))
                }
                const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = `missing_images_${this.query.filter}_${this.snapshotDate}.csv`
                a.click()
                URL.revokeObjectURL(a.href)
            } catch (e) {
                this.$message.error(this.msg(e, 'Export failed'))
            } finally {
                this.exporting = false
            }
        },

        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback
        }
    }
}
</script>

<style lang="scss" scoped>
.sd-spacer { flex: 1; }
.sd-dim { color: #909399; font-size: 12px; }
.sd-bad { color: #ff4949; }
.sd-num { font-variant-numeric: tabular-nums; font-weight: 600; }
.sd-sku { font-variant-numeric: tabular-nums; font-weight: 600; color: #1890ff; margin-right: 5px; }

.sd-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.sd-title h2 { margin: 0; font-size: 20px; font-weight: 600; color: #303133; line-height: 1.2; }
.sd-asof {
    margin-top: 4px; font-size: 12px; display: flex; align-items: center; gap: 5px;
    &.ok { color: #909399; i { color: #67c23a; } }
    &.warn { color: #e6a23c; }
    &.bad { color: #ff4949; }
}
.sd-alert { margin-bottom: 14px; }

.sd-filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.sd-archived-link { padding: 0; font-size: 12px; color: #909399; &:hover { color: #409eff; } }
.sd-search { width: 260px; }
.sd-sel { width: 160px; }

.sd-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
.sd-tile {
    background: #fff; border: 1px solid #e6ebf5; border-radius: 4px; padding: 14px 16px;
    display: flex; flex-direction: column; gap: 6px; cursor: pointer;
    transition: border-color .15s, box-shadow .15s;
    &:hover { border-color: #b3d8ff; }
    &.on { box-shadow: 0 0 0 1px #1890ff inset; border-color: #1890ff; }
}
.sd-tile-label { font-size: 12px; color: #909399; }
.sd-tile-value { font-size: 26px; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; color: #303133; }
.sd-tile-note { font-size: 11px; color: #c0c4cc; }
.sd-tile.tone-bad {
    background: #fef0f0; border-color: #fbc4c4;
    .sd-tile-label { color: #ff4949; font-weight: 600; }
    .sd-tile-value { color: #ff4949; }
    .sd-tile-note { color: #f89898; }
    &.on { border-color: #ff4949; box-shadow: 0 0 0 1px #ff4949 inset; }
}
.sd-tile.tone-warn .sd-tile-value { color: #e6a23c; }

/* Item column: name links to Zoho, SKU underneath; a thumbnail once found */
.mi-item { display: flex; align-items: center; gap: 8px; line-height: 1.35; }
.mi-text { min-width: 0; }
.mi-item-link {
    color: #303133; text-decoration: none;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    &:hover { color: #1890ff; text-decoration: underline; }
}
.mi-item-meta { display: flex; align-items: center; gap: 6px; margin-top: 1px; font-size: 12px; }

/* Upload dialog */
.mi-up-head { display: flex; align-items: baseline; gap: 6px; margin: -6px 0 12px; font-size: 13px; }
.mi-up-title { color: #303133; }
.mi-hidden-input { display: none; }
.mi-drop {
    border: 1px dashed #c0c4cc; border-radius: 6px; padding: 18px; text-align: center; cursor: pointer;
    color: #606266; font-size: 13px; line-height: 1.7; transition: border-color .15s, background .15s;
    i { font-size: 30px; color: #c0c4cc; }
    em { color: #409eff; font-style: normal; }
    &:hover, &.over { border-color: #409eff; background: #f5faff; }
}
.mi-up-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; margin-top: 14px; }
.mi-up-card {
    position: relative; border: 1px solid #ebeef5; border-radius: 4px; padding: 6px; background: #fff;
    img { display: block; width: 100%; height: 110px; object-fit: contain; }
    &.main { border-color: #409eff; box-shadow: 0 0 0 1px #409eff inset; }
}
.mi-up-remove {
    position: absolute; top: 4px; right: 4px; z-index: 1; padding: 2px; border-radius: 50%;
    background: rgba(255, 255, 255, .9); color: #909399; cursor: pointer;
    &:hover { color: #f56c6c; }
}
.mi-up-name { font-size: 12px; color: #606266; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mi-up-foot { display: flex; align-items: center; justify-content: space-between; min-height: 22px; font-size: 12px; }
.mi-up-main { color: #409eff; font-weight: 600; }
.mi-up-note { margin-top: 10px; font-size: 12px; color: #909399; }

.sd-card { background: #fff; border: 1px solid #e6ebf5; border-radius: 4px; overflow: hidden; }
.sd-card-head {
    display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-bottom: 1px solid #ebeef5;
}
.sd-card-title { font-size: 13px; font-weight: 600; color: #303133; }
.sd-pager { padding: 12px 14px; text-align: right; }
</style>
