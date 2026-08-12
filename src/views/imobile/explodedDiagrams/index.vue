<template>
    <div class="xd-page app-container">
        <div class="xd-bar">
            <span class="xd-title">Exploded Diagrams</span>
            <span class="xd-spacer" />
            <el-button size="small" type="primary" plain icon="el-icon-upload2" @click="openUpload">Upload Diagram</el-button>
            <el-button size="small" icon="el-icon-refresh" @click="load">Refresh</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini"
            empty-text="No diagrams yet — upload one to start.">
            <el-table-column label="" width="64" align="center">
                <template slot-scope="s">
                    <img v-if="s.row.image && s.row.image.url" :src="s.row.image.url" class="xd-thumb" />
                </template>
            </el-table-column>
            <el-table-column prop="brand" label="Brand" min-width="110" show-overflow-tooltip />
            <el-table-column prop="model" label="Model" min-width="140" show-overflow-tooltip />
            <el-table-column prop="title" label="Title" min-width="170" show-overflow-tooltip />
            <el-table-column label="Parts" width="70" align="center">
                <template slot-scope="s">{{ s.row.hotspotCount }}</template>
            </el-table-column>
            <el-table-column label="Published" width="100" align="center">
                <template slot-scope="s">
                    <el-switch :value="s.row.status === 'published'" :disabled="savingId === s.row._id"
                        @change="v => togglePublish(s.row, v)" />
                </template>
            </el-table-column>
            <el-table-column label="Updated" width="160">
                <template slot-scope="s">
                    <div>{{ shortDate(s.row.updatedAt) }}</div>
                    <div v-if="s.row.updatedBy || s.row.createdBy" class="xd-sub">{{ s.row.updatedBy || s.row.createdBy }}</div>
                </template>
            </el-table-column>
            <el-table-column label="" width="180" align="center">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-edit-outline" @click="openEditor(s.row)">Edit Hotspots</el-button>
                    <el-button size="mini" type="text" icon="el-icon-delete" class="xd-del" @click="remove(s.row)" />
                </template>
            </el-table-column>
        </el-table>

        <!-- ── Upload dialog ────────────────────────────────────────── -->
        <el-dialog title="Upload Diagram" :visible.sync="uploadVisible" width="560px">
            <el-form label-width="90px" size="small" class="xd-up-form" @submit.native.prevent>
                <el-form-item label="Image">
                    <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" class="xd-file"
                        @change="onFile" />
                    <div class="xd-hint">PNG, JPEG or WebP, up to 15 MB.</div>
                    <img v-if="uploadPreview" :src="uploadPreview" class="xd-preview" />
                </el-form-item>
                <el-form-item label="Brand">
                    <el-select v-model="upload.brand" filterable allow-create default-first-option
                        placeholder="Pick from the catalogue or type a new one" style="width: 100%"
                        @change="onBrandChange">
                        <el-option v-for="b in brands" :key="b._id" :label="b.name" :value="b.name" />
                    </el-select>
                </el-form-item>
                <el-form-item label="Model">
                    <el-select v-model="upload.model" filterable allow-create default-first-option
                        placeholder="Pick from the catalogue or type a new one" style="width: 100%">
                        <el-option v-for="m in models" :key="m._id" :label="m.name" :value="m.name" />
                    </el-select>
                </el-form-item>
                <el-form-item label="Title">
                    <el-input v-model="upload.title" placeholder="Optional — e.g. Front Assembly" maxlength="120" />
                    <div class="xd-hint">Shown when a model has several diagrams. Defaults to Brand + Model.</div>
                </el-form-item>
            </el-form>
            <span slot="footer">
                <el-button size="small" @click="uploadVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" :loading="uploading"
                    :disabled="!uploadFile || !upload.brand || !upload.model" @click="submitUpload">Upload</el-button>
            </span>
        </el-dialog>

        <!-- ── Hotspot editor ───────────────────────────────────────── -->
        <el-dialog :title="editorTitle" :visible.sync="editorVisible" fullscreen
            :close-on-click-modal="false" @opened="editorOpened" @closed="editorClosed">
            <div v-if="editorDiagram" class="xd-editor">
                <div class="xd-canvas-col">
                    <div class="xd-toolbar">
                        <el-button size="mini" :type="drawing ? 'warning' : 'primary'" plain icon="el-icon-edit"
                            @click="toggleDraw">{{ drawing ? 'Cancel Drawing (Esc)' : 'Add Hotspot' }}</el-button>
                        <span v-if="drawing && drawStage === 'rect'" class="xd-draw-hint">
                            Drag on the image to draw a rectangle
                        </span>
                        <span v-else-if="drawing" class="xd-draw-hint">
                            Drag points / lines to reshape, drag inside to move · ＋ point · ✓ save · ✕ cancel
                        </span>
                        <span v-else class="xd-idle-hint">
                            Click a hotspot to select · double-click to reshape · drag to pan · scroll to zoom
                        </span>
                        <span class="xd-spacer" />
                        <div class="xd-zoom-group">
                            <el-button size="mini" icon="el-icon-minus" @click="zoomBtn(0.8)" />
                            <span class="xd-zoom" @click="fitImage" title="Fit to screen">{{ Math.round(view.scale * 100) }}%</span>
                            <el-button size="mini" icon="el-icon-plus" @click="zoomBtn(1.25)" />
                            <el-button size="mini" @click="fitImage">Fit</el-button>
                        </div>
                    </div>
                    <div ref="viewport" class="xd-viewport"
                        :class="{ 'xd-drawing': drawing && drawStage === 'rect' }"
                        @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp"
                        @dblclick.prevent="onDblClick" @wheel.prevent="onWheel">
                        <div ref="stage" class="xd-stage">
                            <img :src="editorDiagram.image.url" :width="imgW" :height="imgH" draggable="false" />
                            <svg :width="imgW" :height="imgH" :viewBox="`0 0 ${imgW} ${imgH}`">
                                <!-- existing hotspot polygons (the one being
                                     reshaped renders as the draft instead) -->
                                <polygon v-for="h in canvasHotspots" :key="h.id"
                                    :points="polyPoints(h)"
                                    :class="['xd-poly', { sel: h.id === selectedId, ghost: drawing }]"
                                    @click.stop="!drawing && selectHotspot(h.id, true)"
                                    @dblclick.stop="!drawing && reshapeHotspot(h)">
                                    <title>{{ h.partNumber }}{{ h.partNumber && h.title ? ' — ' : '' }}{{ h.title }}</title>
                                </polygon>
                                <!-- shape being drawn / reshaped -->
                                <template v-if="drawing && draft.length">
                                    <!-- In the shape stage the fill itself is
                                         draggable: it moves the whole polygon. -->
                                    <polygon :points="draftPolygon"
                                        :class="['xd-draft-line', { movable: drawStage === 'shape' }]"
                                        @pointerdown.stop.prevent="drawStage === 'shape' && startPolyDrag($event)" />
                                    <template v-if="drawStage === 'shape'">
                                        <!-- edge hit areas: drag a line to move it -->
                                        <line v-for="(p, i) in draft" :key="'e' + i"
                                            :x1="p[0] * imgW" :y1="p[1] * imgH"
                                            :x2="draft[(i + 1) % draft.length][0] * imgW"
                                            :y2="draft[(i + 1) % draft.length][1] * imgH"
                                            class="xd-edge" :stroke-width="12 / view.scale"
                                            @pointerdown.stop.prevent="startEdgeDrag(i, $event)" />
                                        <!-- vertices: drag a point to move it -->
                                        <circle v-for="(p, i) in draft" :key="'v' + i"
                                            :cx="p[0] * imgW" :cy="p[1] * imgH"
                                            :r="6 / view.scale" class="xd-vertex"
                                            @pointerdown.stop.prevent="startVertexDrag(i, $event)" />
                                    </template>
                                </template>
                            </svg>
                        </div>
                        <!-- floating controls beside the shape being drawn -->
                        <div v-if="drawing && drawStage === 'shape' && draft.length"
                            class="xd-draft-btns" :style="draftBtnsStyle" @pointerdown.stop>
                            <el-button circle size="mini" icon="el-icon-plus" title="Add a point"
                                @click.stop="addPointToDraft" />
                            <el-button circle size="mini" type="success" icon="el-icon-check" title="Save this hotspot"
                                @click.stop="closeDraft" />
                            <el-button circle size="mini" type="danger" icon="el-icon-close" title="Cancel"
                                @click.stop="cancelDraw" />
                        </div>
                    </div>
                </div>

                <div class="xd-side">
                    <div class="xd-side-head">
                        Hotspots <span class="xd-count">({{ hotspots.length }})</span>
                        <span class="xd-spacer" />
                        <el-button size="mini" type="primary" :loading="savingHotspots"
                            :disabled="!dirty" @click="saveHotspots">Save</el-button>
                    </div>
                    <div class="xd-side-hint">
                        Click a hotspot to select it. Double-click one on the image to
                        reshape its outline (✓ applies, ✕ reverts).
                    </div>
                    <div class="xd-rows">
                        <div v-for="h in hotspots" :key="h.id" :data-id="h.id" class="xd-row-wrap">
                            <div :class="['xd-row', { sel: h.id === selectedId, flash: h.id === flashId }]"
                                @click="onRowClick(h)">
                                <!-- inline edit of part number / title -->
                                <template v-if="h.id === editingRowId">
                                    <div class="xd-row-main" @click.stop>
                                        <el-input ref="rowPartInput" v-model="rowDraft.partNumber" size="mini"
                                            placeholder="Part number" maxlength="80"
                                            @keyup.enter.native="confirmRowEdit" @keyup.esc.native="cancelRowEdit" />
                                        <el-input v-model="rowDraft.title" size="mini"
                                            placeholder="Title" maxlength="160"
                                            @keyup.enter.native="confirmRowEdit" @keyup.esc.native="cancelRowEdit" />
                                    </div>
                                    <el-button size="mini" type="text" icon="el-icon-check" class="xd-ok"
                                        :disabled="!rowDraft.partNumber && !rowDraft.title"
                                        @click.stop="confirmRowEdit" />
                                    <el-button size="mini" type="text" icon="el-icon-close"
                                        @click.stop="cancelRowEdit" />
                                </template>
                                <template v-else>
                                    <div class="xd-row-main">
                                        <div class="xd-row-part">{{ h.partNumber || '—' }}</div>
                                        <div v-if="h.title" class="xd-row-title">{{ h.title }}</div>
                                        <div v-if="(h.products || []).length" class="xd-row-links">
                                            <i class="el-icon-link" /> {{ h.products.length }} product{{ h.products.length === 1 ? '' : 's' }}
                                        </div>
                                    </div>
                                    <i :class="['xd-caret', 'el-icon-arrow-' + (expandedRowId === h.id ? 'up' : 'down')]" />
                                    <el-button size="mini" type="text" icon="el-icon-edit"
                                        @click.stop="startRowEdit(h)" />
                                    <el-button size="mini" type="text" icon="el-icon-delete" class="xd-del"
                                        @click.stop="removeHotspot(h.id)" />
                                </template>
                            </div>
                            <!-- linked shop products — toggled by clicking the row -->
                            <div v-if="expandedRowId === h.id" class="xd-prods" @click.stop>
                                <div v-for="(p, pi) in h.products" :key="pi" class="xd-prod">
                                    <!-- photo slot: thumb + preview/replace icons
                                         when uploaded, clickable placeholder when not -->
                                    <div v-if="p.imageUrl" class="xd-prod-imgcol" @click.stop>
                                        <img :src="p.imageUrl" class="xd-prod-img xd-prod-img-click"
                                            title="Preview" @click="previewProductImage(p)" />
                                        <div class="xd-prod-img-acts">
                                            <i class="el-icon-zoom-in" title="Preview"
                                                @click="previewProductImage(p)" />
                                            <i class="el-icon-refresh" title="Replace photo"
                                                @click="!uploadingProdImage && pickProductImage(h, pi)" />
                                        </div>
                                    </div>
                                    <div v-else class="xd-prod-img xd-prod-img-empty" title="Upload a photo"
                                        @click.stop="!uploadingProdImage && pickProductImage(h, pi)">
                                        <i class="el-icon-plus" />
                                    </div>
                                    <div class="xd-prod-main">
                                        <div class="xd-prod-title" :title="p.title">{{ p.title || '—' }}</div>
                                        <div class="xd-prod-sku">
                                            {{ p.sku || 'no SKU' }}<span v-if="!p.inventoryId" class="xd-prod-warn"> · no inventory id</span>
                                        </div>
                                    </div>
                                    <el-button size="mini" type="text" icon="el-icon-close" class="xd-del"
                                        @click.stop="removeProduct(h, pi)" />
                                </div>
                                <div v-if="!(h.products || []).length" class="xd-prod-empty">
                                    No products linked yet.
                                </div>
                                <el-button v-if="addingForRow !== h.id" size="mini" type="primary" plain
                                    icon="el-icon-plus" class="xd-prod-add-btn"
                                    @click.stop="startAddProduct(h)">Add Product</el-button>
                                <div v-else class="xd-prod-search-row">
                                    <el-autocomplete
                                        ref="prodSearch"
                                        v-model="prodQuery"
                                        size="mini"
                                        class="xd-prod-search"
                                        placeholder="Search Zoho products…"
                                        value-key="name"
                                        :fetch-suggestions="fetchProdSuggestions"
                                        :debounce="400"
                                        :trigger-on-focus="false"
                                        :disabled="addingProduct"
                                        popper-class="xd-prod-suggestions"
                                        @select="item => addProduct(h, item)"
                                        @keyup.esc.native="cancelAddProduct"
                                    >
                                        <template slot-scope="{ item }">
                                            <div class="xd-sug" :title="item.name">
                                                <img v-if="item.imgUrl" :src="item.imgUrl" class="xd-sug-img"
                                                    @error="onSuggestionImgError($event)" />
                                                <div v-else class="xd-sug-img xd-sug-img-ph"><i class="el-icon-picture-outline" /></div>
                                                <div class="xd-sug-info">
                                                    <div class="xd-sug-name">{{ item.name }}</div>
                                                    <div class="xd-sug-sku">{{ item.sku || 'no SKU' }}</div>
                                                </div>
                                            </div>
                                        </template>
                                    </el-autocomplete>
                                    <el-button size="mini" type="text" icon="el-icon-close"
                                        @click.stop="cancelAddProduct" />
                                </div>
                                <div v-if="addingProduct" class="xd-prod-adding">
                                    <i class="el-icon-loading" /> Resolving inventory item…
                                </div>
                                <div v-if="uploadingProdImage" class="xd-prod-adding">
                                    <i class="el-icon-loading" /> Uploading photo…
                                </div>
                                <!-- hidden picker for product photos -->
                                <input ref="prodImgInput" type="file" accept="image/png,image/jpeg,image/webp"
                                    class="xd-hidden-input" @change="onProductImageFile" />
                            </div>
                        </div>
                        <div v-if="!hotspots.length" class="xd-empty">
                            No hotspots yet — use Add Hotspot and draw the first area.
                        </div>
                    </div>
                </div>
            </div>

            <!-- product photo preview -->
            <el-dialog title="Product Photo" :visible.sync="prodPreviewVisible" width="560px" append-to-body>
                <img v-if="prodPreviewUrl" :src="prodPreviewUrl" class="xd-preview-full" />
            </el-dialog>

            <!-- Details for a freshly drawn hotspot (existing ones edit
                 their part number / title inline in the side panel) -->
            <el-dialog title="New Hotspot" :visible.sync="detailVisible" width="380px" append-to-body
                :close-on-click-modal="false" @closed="detailClosed">
                <el-form label-width="100px" size="small" @submit.native.prevent="confirmDetail">
                    <el-form-item label="Part Number">
                        <el-input ref="partInput" v-model="detail.partNumber" maxlength="80" placeholder="e.g. GH82-26509A" />
                    </el-form-item>
                    <el-form-item label="Title">
                        <el-input v-model="detail.title" maxlength="160" placeholder="e.g. OLED Screen Assembly" />
                    </el-form-item>
                </el-form>
                <span slot="footer">
                    <el-button size="small" @click="detailVisible = false">Back</el-button>
                    <el-button type="primary" size="small" :disabled="!detail.partNumber && !detail.title"
                        @click="confirmDetail">Add</el-button>
                </span>
            </el-dialog>
        </el-dialog>
    </div>
</template>

<script>
import {
    listExplodedDiagrams, createExplodedDiagram, getExplodedDiagram,
    updateExplodedDiagram, saveExplodedHotspots, deleteExplodedDiagram,
    uploadExplodedProductImage
} from '@/api/exploded'
import { listBrands, listModels } from '@/api/catalogue'
import { searchProducts, lookupProductBySku } from '@/api/zoho/products/product'

export default {
    name: 'ExplodedDiagrams',
    data() {
        return {
            loading: false,
            rows: [],
            savingId: null,
            // Upload
            uploadVisible: false,
            uploading: false,
            upload: { brand: '', model: '', title: '' },
            uploadFile: null,
            uploadPreview: '',
            brands: [],
            models: [],
            // Editor
            editorVisible: false,
            editorDiagram: null,
            hotspots: [],
            selectedId: null,
            dirty: false,
            savingHotspots: false,
            // drawing state. Flow: Add Hotspot → 'rect' (drag a rectangle)
            // → 'shape' (drag points / lines to reshape, ＋ ✓ ✕ controls).
            drawing: false,
            drawStage: 'rect',
            draft: [],
            rectDrag: null,
            dragTarget: null,
            // Set while an EXISTING hotspot's shape is being edited (its
            // points become the draft; ✓ applies them back, ✕ reverts).
            reshapeId: null,
            detailVisible: false,
            detail: { partNumber: '', title: '' },
            // Inline row editing (part number / title) in the side panel
            editingRowId: null,
            rowDraft: { partNumber: '', title: '' },
            flashId: null,
            // Linked-products dropdown (one row expanded at a time). The
            // search input appears only after Add Product is clicked.
            expandedRowId: null,
            addingForRow: null,
            prodQuery: '',
            addingProduct: false,
            // Product photo upload (separate from the shop thumbnail)
            uploadingProdImage: false,
            prodImageTarget: null,
            prodPreviewVisible: false,
            prodPreviewUrl: '',
            // view transform (plain object so the zoom label reacts)
            view: { scale: 1, tx: 0, ty: 0 },
            pointer: null
        }
    },
    computed: {
        imgW() { return (this.editorDiagram && this.editorDiagram.image.width) || 1 },
        imgH() { return (this.editorDiagram && this.editorDiagram.image.height) || 1 },
        editorTitle() {
            const d = this.editorDiagram
            return d ? `Hotspots — ${d.brand} ${d.model}${d.title ? ' · ' + d.title : ''}` : 'Hotspots'
        },
        displayHotspots() {
            return this.reshapeId ? this.hotspots.filter(h => h.id !== this.reshapeId) : this.hotspots
        },
        // Render order = hit-test order in SVG, so draw big polygons first
        // and small ones last: a small hotspot inside a big one stays
        // clickable. The side-panel list keeps the original order.
        canvasHotspots() {
            const area = (h) => {
                let s = 0
                const pts = h.points
                for (let i = 0; i < pts.length; i++) {
                    const a = pts[i]
                    const b = pts[(i + 1) % pts.length]
                    s += a[0] * b[1] - b[0] * a[1]
                }
                return Math.abs(s)
            }
            return [...this.displayHotspots].sort((x, y) => area(y) - area(x))
        },
        draftPolygon() {
            return this.draft.map(p => `${p[0] * this.imgW},${p[1] * this.imgH}`).join(' ')
        },
        // Floating ＋ ✓ ✕ controls sit just right of the shape's top-right
        // corner, in viewport coordinates (reactive on both the draft and
        // the view transform).
        draftBtnsStyle() {
            if (!this.draft.length) return {}
            const xs = this.draft.map(p => p[0])
            const ys = this.draft.map(p => p[1])
            const left = this.view.tx + Math.max(...xs) * this.imgW * this.view.scale + 12
            const top = this.view.ty + Math.min(...ys) * this.imgH * this.view.scale - 12
            return { left: Math.max(6, left) + 'px', top: Math.max(6, top) + 'px' }
        }
    },
    created() {
        this.load()
        this.loadBrands()
        window.addEventListener('keydown', this.onKey)
    },
    beforeDestroy() {
        window.removeEventListener('keydown', this.onKey)
    },
    methods: {
        // ── List ─────────────────────────────────────────────────────
        async load() {
            this.loading = true
            try {
                const r = await listExplodedDiagrams()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.rows || []
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load diagrams'))
            } finally {
                this.loading = false
            }
        },
        async togglePublish(row, v) {
            this.savingId = row._id
            try {
                const r = await updateExplodedDiagram(row._id, { status: v ? 'published' : 'draft' })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$set(row, 'status', v ? 'published' : 'draft')
                this.$message.success(v ? 'Published — visible in the widget' : 'Unpublished')
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to update'))
            } finally {
                this.savingId = null
            }
        },
        remove(row) {
            this.$confirm(`Delete the ${row.brand} ${row.model} diagram and its hotspots?`, 'Delete diagram', {
                type: 'warning', confirmButtonText: 'Delete', cancelButtonText: 'Cancel'
            }).then(async () => {
                try {
                    const r = await deleteExplodedDiagram(row._id)
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    this.$message.success('Diagram deleted')
                    this.load()
                } catch (e) {
                    this.$message.error(this.msg(e, 'Failed to delete'))
                }
            }).catch(() => {})
        },

        // ── Upload ───────────────────────────────────────────────────
        async loadBrands() {
            try {
                const r = await listBrands()
                if (r && r.success !== false) this.brands = r.data || []
            } catch (e) { /* pickers just stay empty */ }
        },
        async onBrandChange(name) {
            this.upload.model = ''
            this.models = []
            const b = this.brands.find(x => x.name === name)
            if (!b) return // free-typed brand — model is free-typed too
            try {
                const r = await listModels({ brand_id: b._id })
                if (r && r.success !== false) this.models = r.data || []
            } catch (e) { /* ignore */ }
        },
        openUpload() {
            this.upload = { brand: '', model: '', title: '' }
            this.uploadFile = null
            this.uploadPreview = ''
            this.models = []
            this.uploadVisible = true
            this.$nextTick(() => { if (this.$refs.fileInput) this.$refs.fileInput.value = '' })
        },
        onFile(e) {
            const f = e.target.files && e.target.files[0]
            this.uploadFile = f || null
            if (this.uploadPreview) URL.revokeObjectURL(this.uploadPreview)
            this.uploadPreview = f ? URL.createObjectURL(f) : ''
        },
        async submitUpload() {
            if (!this.uploadFile) return
            this.uploading = true
            try {
                const fd = new FormData()
                fd.append('image', this.uploadFile)
                fd.append('brand', this.upload.brand)
                fd.append('model', this.upload.model)
                fd.append('title', this.upload.title)
                const r = await createExplodedDiagram(fd)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success('Diagram uploaded — draw its hotspots next')
                this.uploadVisible = false
                await this.load()
                const created = this.rows.find(x => String(x._id) === String(r.id))
                if (created) this.openEditor(created)
            } catch (e) {
                this.$message.error(this.msg(e, 'Upload failed'))
            } finally {
                this.uploading = false
            }
        },

        // ── Editor ───────────────────────────────────────────────────
        async openEditor(row) {
            try {
                const r = await getExplodedDiagram(row._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.editorDiagram = r.diagram
                this.hotspots = (r.diagram.hotspots || []).map(h => ({
                    ...h,
                    products: (h.products || []).map(p => ({ ...p }))
                }))
                this.selectedId = null
                this.dirty = false
                this.cancelDraw()
                this.editorVisible = true
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to open the editor'))
            }
        },
        editorOpened() {
            this.fitImage()
        },
        editorClosed() {
            if (this.dirty) this.$message.warning('Hotspot changes were not saved.')
            this.editorDiagram = null
            this.hotspots = []
            this.cancelDraw()
        },
        polyPoints(h) {
            return h.points.map(p => `${p[0] * this.imgW},${p[1] * this.imgH}`).join(' ')
        },
        // scrollTo: clicking a polygon on the canvas also brings its row
        // into view so the selection is visible on both sides.
        selectHotspot(id, scrollTo) {
            this.selectedId = id
            if (scrollTo) {
                this.$nextTick(() => {
                    const row = this.$el.querySelector(`.xd-row-wrap[data-id="${id}"]`)
                    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
                })
            }
        },
        // Clicking a row selects its hotspot and toggles the linked-products
        // dropdown beneath it (one open at a time).
        onRowClick(h) {
            this.selectedId = h.id
            this.expandedRowId = this.expandedRowId === h.id ? null : h.id
            this.addingForRow = null
            this.prodQuery = ''
        },
        startAddProduct(h) {
            this.addingForRow = h.id
            this.prodQuery = ''
            this.$nextTick(() => {
                const el = this.$refs.prodSearch
                const input = Array.isArray(el) ? el[0] : el
                if (input && input.focus) input.focus()
            })
        },
        cancelAddProduct() {
            this.addingForRow = null
            this.prodQuery = ''
        },
        async fetchProdSuggestions(query, cb) {
            const q = (query || '').trim()
            if (!q) { cb([]); return }
            try {
                const res = await searchProducts(q)
                if (!res || !res.success) { cb([]); return }
                const products = Array.isArray(res.data) ? res.data : []
                cb(products.map(p => ({
                    name: p.name || p.product_name || p.title || '',
                    sku: p.sku
                        || (Array.isArray(p.skus) && p.skus[0] && p.skus[0].sku)
                        || (p.variants && p.variants[0] && p.variants[0].sku)
                        || '',
                    commerceId: String(p.product_id || p.productId || ''),
                    variantId: String(p.variant_id || ''),
                    url: String(p.url || ''),
                    imgUrl: this.extractProductImage(p)
                })))
            } catch (e) {
                cb([])
            }
        },
        // Same resolution as the Order Dispatch picker: storefront paths are
        // relative, so they're anchored to the shop's base URL.
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
        async addProduct(h, item) {
            if (!item || !item.sku) {
                this.$message.warning(`"${(item && item.name) || 'This product'}" has no SKU in Zoho — add one there first.`)
                this.prodQuery = ''
                return
            }
            if ((h.products || []).some(p => p.sku === item.sku)) {
                this.$message.info('That product is already linked.')
                this.prodQuery = ''
                return
            }
            this.addingProduct = true
            try {
                // Resolve the Zoho Inventory item id by SKU. A miss still
                // links the product — the id can be fixed in Zoho later.
                let inventoryId = ''
                try {
                    const r = await lookupProductBySku(item.sku)
                    inventoryId = String((r && r.data && r.data.itemId) || '')
                } catch (e) { /* 404 → no inventory item for this SKU */ }
                if (!Array.isArray(h.products)) this.$set(h, 'products', [])
                h.products.push({
                    title: item.name,
                    sku: item.sku,
                    commerceId: item.commerceId || '',
                    variantId: item.variantId || '',
                    url: item.url || '',
                    inventoryId
                })
                this.dirty = true
                if (!inventoryId) {
                    this.$message.warning(`No Zoho Inventory item found for SKU "${item.sku}" — linked without an inventory id.`)
                }
                // Product links persist immediately — no separate Save click.
                const saved = await this.saveHotspots({ silent: true })
                if (saved) this.$message.success(`Linked "${item.sku}"`)
            } finally {
                this.addingProduct = false
                this.prodQuery = ''
                this.addingForRow = null // back to the Add Product button
            }
        },
        previewProductImage(p) {
            this.prodPreviewUrl = p.imageUrl
            this.prodPreviewVisible = true
        },
        pickProductImage(h, index) {
            this.prodImageTarget = { hotspotId: h.id, index }
            const el = this.$refs.prodImgInput
            const input = Array.isArray(el) ? el[0] : el
            if (input) { input.value = ''; input.click() }
        },
        async onProductImageFile(e) {
            const file = e.target.files && e.target.files[0]
            if (!file || !this.prodImageTarget) return
            const h = this.hotspots.find(x => x.id === this.prodImageTarget.hotspotId)
            const product = h && h.products && h.products[this.prodImageTarget.index]
            if (!product) return
            this.uploadingProdImage = true
            try {
                const fd = new FormData()
                fd.append('image', file)
                const r = await uploadExplodedProductImage(this.editorDiagram._id, fd)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$set(product, 'imageUrl', r.url)
                this.$set(product, 'imageKey', r.key)
                this.dirty = true
                const saved = await this.saveHotspots({ silent: true })
                if (saved) this.$message.success('Photo uploaded')
            } catch (err) {
                this.$message.error(this.msg(err, 'Failed to upload the photo'))
            } finally {
                this.uploadingProdImage = false
                this.prodImageTarget = null
            }
        },
        async removeProduct(h, index) {
            const removedSku = (h.products[index] || {}).sku
            h.products.splice(index, 1)
            this.dirty = true
            const saved = await this.saveHotspots({ silent: true })
            if (saved) this.$message.success(removedSku ? `Unlinked "${removedSku}"` : 'Product unlinked')
        },
        // Double-clicking a hotspot on the image pulls its row into view in
        // the side panel and flashes it.
        revealHotspot(id) {
            this.selectedId = id
            this.flashId = id
            setTimeout(() => { if (this.flashId === id) this.flashId = null }, 900)
            this.$nextTick(() => {
                const row = this.$el.querySelector(`.xd-row-wrap[data-id="${id}"]`)
                if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
            })
        },
        startRowEdit(h) {
            this.selectedId = h.id
            this.editingRowId = h.id
            this.rowDraft = { partNumber: h.partNumber || '', title: h.title || '' }
            this.$nextTick(() => {
                const el = this.$refs.rowPartInput
                const input = Array.isArray(el) ? el[0] : el
                if (input && input.focus) input.focus()
            })
        },
        confirmRowEdit() {
            if (!this.rowDraft.partNumber && !this.rowDraft.title) return
            const h = this.hotspots.find(x => x.id === this.editingRowId)
            if (h) {
                h.partNumber = this.rowDraft.partNumber.trim()
                h.title = this.rowDraft.title.trim()
                this.dirty = true
            }
            this.editingRowId = null
        },
        cancelRowEdit() {
            this.editingRowId = null
        },
        removeHotspot(id) {
            const i = this.hotspots.findIndex(h => h.id === id)
            if (i >= 0) this.hotspots.splice(i, 1)
            if (this.selectedId === id) this.selectedId = null
            if (this.editingRowId === id) this.editingRowId = null
            if (this.expandedRowId === id) this.expandedRowId = null
            this.dirty = true
        },
        // Drop repeated identical points — adjacent duplicates and a closing
        // point equal to the first (typical leftovers of ＋ clicked twice or
        // a vertex dragged onto its neighbour).
        dedupePoints(points) {
            const out = []
            for (const p of points) {
                const prev = out[out.length - 1]
                if (prev && prev[0] === p[0] && prev[1] === p[1]) continue
                out.push(p)
            }
            while (out.length > 1) {
                const first = out[0]
                const last = out[out.length - 1]
                if (first[0] === last[0] && first[1] === last[1]) out.pop()
                else break
            }
            return out
        },
        // `opts.silent` skips the success toast (auto-saves bring their own).
        // Returns true when the save went through.
        async saveHotspots(opts) {
            const silent = !!(opts && opts.silent === true)
            const bad = this.hotspots.find(h => !String(h.partNumber || '').trim() && !String(h.title || '').trim())
            if (bad) { this.$message.warning('Every hotspot needs a part number or a title.'); return false }

            // Clean duplicate points before validating and sending.
            let removed = 0
            for (const h of this.hotspots) {
                const cleaned = this.dedupePoints(h.points)
                if (cleaned.length !== h.points.length) {
                    removed += h.points.length - cleaned.length
                    if (cleaned.length < 3) {
                        this.$message.error(`"${h.partNumber || h.title}" has fewer than 3 distinct points — reshape or delete it.`)
                        return false
                    }
                    h.points = cleaned
                }
            }
            if (removed) this.$message.info(`Removed ${removed} duplicated point(s).`)

            this.savingHotspots = true
            try {
                const r = await saveExplodedHotspots(this.editorDiagram._id, this.hotspots.map(h => ({
                    id: h.id, partNumber: h.partNumber, title: h.title,
                    points: h.points, products: h.products || []
                })))
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.dirty = false
                if (!silent) this.$message.success(`Saved ${r.count} hotspot(s)`)
                this.load()
                return true
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to save hotspots'))
                return false
            } finally {
                this.savingHotspots = false
            }
        },

        // ── Drawing ──────────────────────────────────────────────────
        toggleDraw() {
            if (this.drawing) { this.cancelDraw(); return }
            this.drawing = true
            this.drawStage = 'rect'
            this.draft = []
            this.selectedId = null
        },
        cancelDraw() {
            this.drawing = false
            this.drawStage = 'rect'
            this.draft = []
            this.rectDrag = null
            this.dragTarget = null
            this.reshapeId = null
        },
        // Double-click an existing hotspot → its polygon becomes the draft
        // with the full reshape toolkit; ✓ applies, ✕ reverts. Also pulls
        // its row into view so it's clear which part is being edited.
        reshapeHotspot(h) {
            this.revealHotspot(h.id)
            this.drawing = true
            this.drawStage = 'shape'
            this.reshapeId = h.id
            this.draft = h.points.map(p => p.slice())
        },
        onKey(e) {
            if (e.key === 'Escape' && this.drawing) this.cancelDraw()
        },
        // Client position → normalized image coordinates (clamped).
        clientToNorm(clientX, clientY) {
            const r = this.$refs.viewport.getBoundingClientRect()
            const nx = (clientX - r.left - this.view.tx) / this.view.scale / this.imgW
            const ny = (clientY - r.top - this.view.ty) / this.view.scale / this.imgH
            return [
                Number(Math.max(0, Math.min(1, nx)).toFixed(5)),
                Number(Math.max(0, Math.min(1, ny)).toFixed(5))
            ]
        },
        // ＋ — insert a vertex at the midpoint of the longest edge, ready
        // to be dragged into place.
        addPointToDraft() {
            let best = 0
            let bestLen = -1
            const n = this.draft.length
            for (let i = 0; i < n; i++) {
                const a = this.draft[i]
                const b = this.draft[(i + 1) % n]
                const len = Math.hypot((a[0] - b[0]) * this.imgW, (a[1] - b[1]) * this.imgH)
                if (len > bestLen) { bestLen = len; best = i }
            }
            const a = this.draft[best]
            const b = this.draft[(best + 1) % n]
            this.draft.splice(best + 1, 0, [
                Number(((a[0] + b[0]) / 2).toFixed(5)),
                Number(((a[1] + b[1]) / 2).toFixed(5))
            ])
        },
        startVertexDrag(i, e) {
            this.dragTarget = { type: 'vertex', index: i }
            const vp = this.$refs.viewport
            vp.setPointerCapture && vp.setPointerCapture(e.pointerId)
        },
        // Drag anywhere inside the shape to move the whole polygon. The
        // delta is clamped so the shape stays inside the image without
        // distorting (points never clamp individually).
        startPolyDrag(e) {
            this.dragTarget = {
                type: 'poly',
                start: this.clientToNorm(e.clientX, e.clientY),
                orig: this.draft.map(p => p.slice())
            }
            const vp = this.$refs.viewport
            vp.setPointerCapture && vp.setPointerCapture(e.pointerId)
        },
        startEdgeDrag(i, e) {
            this.dragTarget = {
                type: 'edge',
                index: i,
                start: this.clientToNorm(e.clientX, e.clientY),
                orig: [
                    this.draft[i].slice(),
                    this.draft[(i + 1) % this.draft.length].slice()
                ]
            }
            const vp = this.$refs.viewport
            vp.setPointerCapture && vp.setPointerCapture(e.pointerId)
        },
        closeDraft() {
            if (this.draft.length < 3) { this.$message.warning('A hotspot needs at least 3 points.'); return }
            // Reshaping an existing hotspot: apply the new shape, no dialog.
            if (this.reshapeId) {
                const h = this.hotspots.find(x => x.id === this.reshapeId)
                if (h) {
                    h.points = this.draft.slice()
                    this.dirty = true
                }
                this.cancelDraw()
                return
            }
            this.detail = { partNumber: '', title: '' }
            this.detailVisible = true
            this.$nextTick(() => { if (this.$refs.partInput) this.$refs.partInput.focus() })
        },
        confirmDetail() {
            if (!this.detail.partNumber && !this.detail.title) return
            this.hotspots.push({
                id: 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                partNumber: this.detail.partNumber.trim(),
                title: this.detail.title.trim(),
                points: this.draft.slice()
            })
            this.dirty = true
            this.detailVisible = false
            this.cancelDraw()
        },
        detailClosed() {
            // Closed without adding — keep the shape so it can be reshaped
            // or saved again; the ✕ control is the explicit discard.
        },

        // ── Transform / pointer machinery ────────────────────────────
        applyTransform() {
            const st = this.$refs.stage
            if (st) st.style.transform = `translate(${this.view.tx}px, ${this.view.ty}px) scale(${this.view.scale})`
        },
        setTransform(s, x, y) {
            this.view.scale = Math.max(0.1, Math.min(8, s))
            this.view.tx = x
            this.view.ty = y
            this.applyTransform()
        },
        fitImage() {
            const vp = this.$refs.viewport
            if (!vp) return
            const r = vp.getBoundingClientRect()
            const s = Math.min(r.width / this.imgW, r.height / this.imgH) * 0.95
            this.setTransform(s, (r.width - this.imgW * s) / 2, (r.height - this.imgH * s) / 2)
        },
        zoomBtn(factor) {
            const vp = this.$refs.viewport
            if (!vp) return
            const r = vp.getBoundingClientRect()
            this.zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor)
        },
        zoomAt(clientX, clientY, factor) {
            const vp = this.$refs.viewport
            const r = vp.getBoundingClientRect()
            const px = clientX - r.left
            const py = clientY - r.top
            const ix = (px - this.view.tx) / this.view.scale
            const iy = (py - this.view.ty) / this.view.scale
            const ns = Math.max(0.1, Math.min(8, this.view.scale * factor))
            this.setTransform(ns, px - ix * ns, py - iy * ns)
        },
        onWheel(e) {
            this.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 0.89)
        },
        onPointerDown(e) {
            // Starting a rectangle takes priority while in the rect stage.
            if (this.drawing && this.drawStage === 'rect') {
                this.rectDrag = { start: this.clientToNorm(e.clientX, e.clientY) }
                e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId)
                return
            }
            // Deliberately NO pointer capture here: capturing on press
            // retargets the coming click/dblclick to the viewport, which
            // silently swallows clicks on hotspot polygons (and turns a
            // double-click into a fit-to-screen). Capture starts only once
            // an actual pan movement begins, in onPointerMove.
            this.pointer = { x: e.clientX, y: e.clientY, moved: false, pointerId: e.pointerId }
        },
        onPointerMove(e) {
            // Reshaping: a vertex follows the pointer; an edge or the whole
            // polygon moves rigidly.
            if (this.dragTarget) {
                if (this.dragTarget.type === 'vertex') {
                    this.$set(this.draft, this.dragTarget.index, this.clientToNorm(e.clientX, e.clientY))
                } else if (this.dragTarget.type === 'poly') {
                    const cur = this.clientToNorm(e.clientX, e.clientY)
                    let dx = cur[0] - this.dragTarget.start[0]
                    let dy = cur[1] - this.dragTarget.start[1]
                    const xs = this.dragTarget.orig.map(p => p[0])
                    const ys = this.dragTarget.orig.map(p => p[1])
                    dx = Math.max(-Math.min(...xs), Math.min(1 - Math.max(...xs), dx))
                    dy = Math.max(-Math.min(...ys), Math.min(1 - Math.max(...ys), dy))
                    this.draft = this.dragTarget.orig.map(p => [
                        Number((p[0] + dx).toFixed(5)),
                        Number((p[1] + dy).toFixed(5))
                    ])
                } else {
                    const cur = this.clientToNorm(e.clientX, e.clientY)
                    const dx = cur[0] - this.dragTarget.start[0]
                    const dy = cur[1] - this.dragTarget.start[1]
                    const i = this.dragTarget.index
                    const j = (i + 1) % this.draft.length
                    const clamp01 = v => Number(Math.max(0, Math.min(1, v)).toFixed(5))
                    this.$set(this.draft, i, [clamp01(this.dragTarget.orig[0][0] + dx), clamp01(this.dragTarget.orig[0][1] + dy)])
                    this.$set(this.draft, j, [clamp01(this.dragTarget.orig[1][0] + dx), clamp01(this.dragTarget.orig[1][1] + dy)])
                }
                return
            }
            // Rectangle being dragged out
            if (this.rectDrag) {
                const a = this.rectDrag.start
                const b = this.clientToNorm(e.clientX, e.clientY)
                this.draft = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]]
                return
            }
            if (!this.pointer) return
            const dx = e.clientX - this.pointer.x
            const dy = e.clientY - this.pointer.y
            if (!this.pointer.moved && Math.abs(dx) + Math.abs(dy) > 3) {
                this.pointer.moved = true
                // The gesture is a pan after all — safe to capture now, the
                // click that capture would have stolen is no longer coming.
                const vp = this.$refs.viewport
                vp && vp.setPointerCapture && vp.setPointerCapture(this.pointer.pointerId)
            }
            if (this.pointer.moved) {
                this.setTransform(this.view.scale, this.view.tx + dx, this.view.ty + dy)
                this.pointer.x = e.clientX
                this.pointer.y = e.clientY
            }
        },
        onPointerUp(e) {
            if (this.dragTarget) { this.dragTarget = null; return }
            if (this.rectDrag) {
                this.rectDrag = null
                // A real rectangle moves into the reshape stage; a stray
                // click (no meaningful drag) just stays armed.
                if (this.draft.length === 4) {
                    const wPx = Math.abs(this.draft[1][0] - this.draft[0][0]) * this.imgW * this.view.scale
                    const hPx = Math.abs(this.draft[3][1] - this.draft[0][1]) * this.imgH * this.view.scale
                    if (wPx > 8 && hPx > 8) { this.drawStage = 'shape'; return }
                }
                this.draft = []
                return
            }
            const wasClick = this.pointer && !this.pointer.moved
            this.pointer = null
            if (wasClick && !this.drawing) this.selectedId = null // click on empty image deselects
        },
        onDblClick() {
            if (!this.drawing) this.fitImage()
        },

        shortDate(v) {
            if (!v) return '—'
            const d = new Date(v)
            return isNaN(d) ? '—' : d.toLocaleString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            })
        },
        msg(e, fallback) { return (e.response && e.response.data && e.response.data.message) || e.message || fallback }
    }
}
</script>

<style lang="scss" scoped>
.xd-page { padding: 12px 16px; }
.xd-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.xd-title { font-size: 15px; font-weight: 600; color: #303133; }
.xd-spacer { flex: 1; }
.xd-sub { font-size: 11px; color: #909399; }
.xd-del { color: #F56C6C; }
.xd-ok { color: #67C23A; }
.xd-thumb { width: 40px; height: 40px; object-fit: contain; background: #f5f6f8; border: 1px solid #ebeef5; border-radius: 4px; }
/* Upload */
.xd-file { font-size: 12px; }
.xd-hint { font-size: 11px; color: #909399; line-height: 1.6; }
.xd-preview { max-width: 100%; max-height: 180px; margin-top: 8px; border: 1px solid #ebeef5; border-radius: 6px; }
.xd-up-form ::v-deep .el-form-item__label { white-space: nowrap; }
/* Editor — trim the fullscreen dialog chrome so the canvas gets the room */
.xd-page ::v-deep .el-dialog.is-fullscreen .el-dialog__body { padding: 10px 16px 16px; }
.xd-page ::v-deep .el-dialog.is-fullscreen .el-dialog__header { padding: 14px 16px 8px; }
.xd-editor { display: flex; gap: 12px; height: calc(100vh - 92px); }
.xd-canvas-col { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.xd-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.xd-draw-hint {
    font-size: 12px; color: #b88230; background: #fdf6ec; border: 1px solid #faecd8;
    border-radius: 12px; padding: 4px 12px;
}
.xd-idle-hint { font-size: 12px; color: #b9bfc9; }
.xd-zoom-group {
    display: flex; align-items: center; gap: 6px;
    border: 1px solid #ebeef5; border-radius: 8px; padding: 3px 6px; background: #fafbfc;
}
.xd-zoom-group .el-button { border: none; background: transparent; padding: 4px 6px; margin: 0; }
.xd-zoom-group .el-button:hover { color: #409EFF; }
.xd-zoom { font-size: 12px; color: #606266; min-width: 42px; text-align: center; cursor: pointer; }
.xd-viewport {
    position: relative; flex: 1; overflow: hidden; background: #171a20;
    border-radius: 8px; cursor: grab; touch-action: none;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06), inset 0 2px 12px rgba(0, 0, 0, 0.35);
}
.xd-viewport.xd-drawing { cursor: crosshair; }
.xd-stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.xd-stage img { display: block; user-select: none; pointer-events: none; }
.xd-stage svg { position: absolute; left: 0; top: 0; }
.xd-poly {
    fill: rgba(126, 200, 255, 0.14); stroke: rgba(126, 200, 255, 0.9); stroke-width: 1.6;
    vector-effect: non-scaling-stroke; cursor: pointer;
}
.xd-poly:hover { fill: rgba(126, 200, 255, 0.28); }
.xd-poly.sel { fill: rgba(255, 204, 107, 0.25); stroke: #ffcc6b; stroke-width: 2; }
.xd-poly.ghost { pointer-events: none; opacity: 0.45; }
.xd-draft-line {
    fill: rgba(103, 194, 58, 0.12); stroke: #67C23A; stroke-width: 1.6;
    vector-effect: non-scaling-stroke; pointer-events: none;
}
.xd-draft-line.movable { pointer-events: all; cursor: move; }
.xd-edge { stroke: transparent; cursor: move; }
.xd-vertex { fill: #67C23A; stroke: #fff; stroke-width: 1; cursor: grab; }
.xd-draft-btns {
    position: absolute; z-index: 5; display: flex; gap: 6px;
}
.xd-draft-btns .el-button { margin: 0; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35); }
/* Side panel */
.xd-side { width: 420px; display: flex; flex-direction: column; border: 1px solid #ebeef5; border-radius: 8px; background: #fff; }
.xd-side-head { display: flex; align-items: center; gap: 6px; padding: 10px 12px; font-weight: 600; font-size: 13px; border-bottom: 1px solid #ebeef5; }
.xd-count { color: #909399; font-weight: normal; }
.xd-side-hint { font-size: 11px; color: #909399; padding: 8px 12px; line-height: 1.6; border-bottom: 1px solid #f2f6fc; background: #fafbfc; }
.xd-rows { flex: 1; overflow-y: auto; padding: 6px; }
.xd-row {
    display: flex; align-items: center; gap: 4px; padding: 7px 8px; border-radius: 6px; cursor: pointer;
    border: 1px solid transparent; border-left: 3px solid transparent;
}
.xd-row:hover { background: #f5f7fa; }
.xd-row.sel { background: #fdf6ec; border-color: #faecd8; border-left-color: #E6A23C; }
.xd-row-main { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.xd-row-part { font-size: 12px; font-weight: 600; color: #303133; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.xd-row-title { font-size: 11px; color: #909399; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.xd-row.flash { animation: xd-flash 0.9s ease; }
@keyframes xd-flash {
    0%, 60% { background: #fdf0d5; }
    100% { background: transparent; }
}
.xd-empty { padding: 22px 12px; text-align: center; font-size: 12px; color: #909399; }
.xd-row-wrap + .xd-row-wrap { margin-top: 2px; }
.xd-row-links { font-size: 11px; color: #409EFF; }
.xd-caret { color: #C0C4CC; font-size: 12px; margin-right: 2px; }
/* Linked products dropdown */
.xd-prods {
    margin: 0 4px 6px 12px; padding: 8px 10px; border-left: 2px solid #ebeef5;
    background: #fafbfc; border-radius: 0 6px 6px 0;
}
.xd-prod { display: flex; align-items: center; gap: 6px; padding: 4px 0; }
.xd-prod-img {
    width: 32px; height: 32px; object-fit: cover; border-radius: 4px;
    border: 1px solid #ebeef5; background: #f5f6f8; flex-shrink: 0;
}
.xd-prod-img-click { cursor: pointer; }
.xd-prod-img-click:hover { border-color: #409EFF; }
.xd-prod-imgcol { display: flex; flex-direction: column; align-items: center; gap: 2px; flex-shrink: 0; }
.xd-prod-img-acts { display: flex; gap: 6px; }
.xd-prod-img-acts i { font-size: 12px; color: #909399; cursor: pointer; }
.xd-prod-img-acts i:hover { color: #409EFF; }
.xd-preview-full { display: block; max-width: 100%; max-height: 70vh; margin: 0 auto; }
.xd-prod-img-empty {
    display: flex; align-items: center; justify-content: center;
    border: 1px dashed #d4d9e2; color: #b9bfc9; cursor: pointer; font-size: 14px;
}
.xd-prod-img-empty:hover { border-color: #409EFF; color: #409EFF; }
.xd-hidden-input { display: none; }
.xd-prod-main { flex: 1; min-width: 0; }
.xd-prod-title {
    font-size: 12px; color: #303133; line-height: 1.4;
    /* clamp to two lines, ellipsis after */
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; word-break: break-word;
}
.xd-prod-sku { font-size: 11px; color: #909399; }
.xd-prod-warn { color: #E6A23C; }
.xd-prod-empty { font-size: 11px; color: #C0C4CC; padding: 2px 0 6px; }
.xd-prod-add-btn { margin-top: 6px; }
.xd-prod-search-row { display: flex; align-items: center; gap: 4px; margin-top: 6px; }
.xd-prod-search { flex: 1; }
.xd-prod-adding { font-size: 11px; color: #909399; margin-top: 6px; }
</style>

<style lang="scss">
/* Unscoped: the autocomplete popper teleports to <body>, outside the
   scoped-style boundary. */
.xd-prod-suggestions {
    li { line-height: normal !important; padding: 6px 10px !important; }
    .xd-sug { display: flex; align-items: center; gap: 8px; }
    .xd-sug-img {
        width: 34px; height: 34px; object-fit: contain; border-radius: 4px;
        background: #f5f6f8; flex-shrink: 0;
    }
    .xd-sug-img-ph { display: flex; align-items: center; justify-content: center; color: #C0C4CC; }
    .xd-sug-info { min-width: 0; }
    .xd-sug-name {
        font-size: 12px; color: #303133; line-height: 1.4;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        overflow: hidden; word-break: break-word; white-space: normal;
    }
    .xd-sug-sku { font-size: 11px; color: #909399; }
}
</style>
