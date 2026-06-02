<template>
    <div class="loc-page">
        <!-- Header -->
        <div class="loc-header">
            <div>
                <h2 class="loc-title">
                    <i class="el-icon-location" />
                    Stock Location Monitoring
                </h2>
                <p class="loc-sub">
                    Search locations or products to open inspection panels. Drag
                    items between panels to move stock — tick multiple rows
                    first to move them as a group.
                </p>
            </div>
            <el-button icon="el-icon-back" size="small" @click="goBack">Back to Tools</el-button>
        </div>

        <!-- Search bar -->
        <div class="loc-searchbar">
            <!-- Row 1: composed-location selector -->
            <div class="search-row">
                <div class="row-label">Search by Location</div>
                <div class="composer">
                    <!-- Area -->
                    <div class="composer-field">
                        <label>Area</label>
                        <div class="field-pair">
                            <input class="fixed-prefix" :value="locForm.areaCode" disabled />
                            <el-select v-model="locForm.areaNumber" size="small">
                                <el-option v-for="n in areaNumberOption" :key="n" :label="n" :value="n" />
                            </el-select>
                        </div>
                    </div>
                    <!-- Zoom -->
                    <div class="composer-field">
                        <label>Zoom</label>
                        <div class="field-pair">
                            <el-select v-model="locForm.zoomCode" size="small">
                                <el-option v-for="c in zoomCodeOption" :key="c" :label="c" :value="c" />
                            </el-select>
                            <el-select v-model="locForm.zoomNumber" size="small">
                                <el-option v-for="n in zoomNumberOption" :key="n" :label="n" :value="n" />
                            </el-select>
                        </div>
                    </div>
                    <!-- Layer -->
                    <div class="composer-field">
                        <label>Layer</label>
                        <div class="field-pair">
                            <input class="fixed-prefix" :value="locForm.layerCode" disabled />
                            <el-select v-model="locForm.layerNumber" size="small">
                                <el-option v-for="n in layerNumberOption" :key="n" :label="n" :value="n" />
                            </el-select>
                        </div>
                    </div>
                    <!-- Surfix -->
                    <div class="composer-field">
                        <label>Surfix</label>
                        <div class="field-pair">
                            <input class="fixed-prefix" value="-" disabled />
                            <el-input
                                v-model="locForm.surfix"
                                size="small"
                                placeholder="(optional)"
                                @keyup.enter.native="onAddComposedLocation"
                            />
                        </div>
                    </div>

                    <el-button
                        type="primary"
                        size="small"
                        icon="el-icon-plus"
                        class="add-btn"
                        @click="onAddComposedLocation"
                    >Open</el-button>
                </div>
            </div>

            <!-- Row 2: product search + clear all -->
            <div class="search-row">
                <div class="row-label">Search by Product</div>
                <div class="composer">
                    <el-autocomplete
                        v-model="productKeyword"
                        :fetch-suggestions="fetchProductSuggestions"
                        :debounce="300"
                        :trigger-on-focus="false"
                        placeholder="Search product by name or SKU…"
                        clearable
                        prefix-icon="el-icon-search"
                        popper-class="loc-suggest prod-suggest"
                        value-key="name"
                        size="small"
                        class="product-input"
                        @select="onPickProduct"
                    >
                        <template slot-scope="{ item }">
                            <div class="prod-suggestion">
                                <img
                                    v-if="item.imgUrl"
                                    :src="item.imgUrl"
                                    class="prod-suggestion-img"
                                    @error="onImgError($event)"
                                />
                                <div v-else class="prod-suggestion-img prod-suggestion-img-ph">
                                    <i class="el-icon-picture-outline" />
                                </div>
                                <div class="prod-suggestion-info">
                                    <div class="prod-suggestion-name">{{ item.name }}</div>
                                    <div class="prod-suggestion-meta">
                                        <span v-if="item.sku">SKU: {{ item.sku }}</span>
                                    </div>
                                </div>
                            </div>
                        </template>
                    </el-autocomplete>

                    <el-button
                        size="small"
                        icon="el-icon-close"
                        :disabled="boxes.length === 0 && loadingZone.length === 0"
                        @click="clearAll"
                    >Clear All</el-button>
                </div>
            </div>

            <div class="composed-preview">
                Composing: <code>{{ composedLocation }}</code>
            </div>
        </div>

        <!-- Status / legend row -->
        <div class="loc-legend-row">
            <div class="legend-left">
                Showing {{ boxes.length }} location<span v-if="boxes.length !== 1">s</span>
            </div>
            <div class="legend-right">
                <span class="legend-dot dot-green" /> Sufficient
                <span class="legend-dot dot-yellow" /> Low Stock
                <span class="legend-dot dot-red" /> Out of Stock
            </div>
        </div>

        <!--
            Bulk-selection toolbar.
            Only visible once the user has ticked at least one row. Dragging any
            selected item then drags the whole bag — items can be from different
            boxes or the Loading Zone; each one is PUT independently so a single
            failure won't roll back the others.
        -->
        <div v-if="selectedIds.length > 0" class="selection-bar">
            <span class="selection-count">
                <i class="el-icon-check" />
                <strong>{{ selectedIds.length }}</strong>
                item<span v-if="selectedIds.length !== 1">s</span> selected
            </span>
            <span class="selection-hint">
                Drag any selected row to move them all together.
            </span>
            <el-button size="mini" type="text" @click="clearSelection">
                Clear selection
            </el-button>
        </div>

        <!-- Main: location boxes grid + loading zone sidebar -->
        <div class="loc-main">
            <!-- Boxes -->
            <div class="boxes-area">
                <div v-if="boxes.length === 0" class="empty-area">
                    <i class="el-icon-box" />
                    <div>Use the search above to open a location panel.</div>
                </div>

                <div
                    v-for="box in boxes"
                    :key="box.id"
                    :class="['loc-box', { 'is-drop-target': dropHover === box.id }]"
                    @dragover.prevent="onDragOver(box.id)"
                    @dragleave="onDragLeave(box.id)"
                    @drop.prevent="onDropToBox(box)"
                >
                    <div class="box-head">
                        <div class="box-title">
                            <i class="el-icon-location" />
                            {{ box.location }}
                        </div>
                        <div class="box-actions">
                            <!-- Per-location Select All. Toggles between
                                 "Select all" and "Deselect all" based on
                                 the current state; disabled when the box
                                 is loading or empty. -->
                            <el-button
                                size="mini"
                                type="text"
                                class="select-all-btn"
                                :disabled="box.loading || box.items.length === 0"
                                @click="toggleSelectAll(box.id)"
                            >{{ selectAllLabel(box.id) }}</el-button>
                            <el-button
                                size="mini"
                                type="text"
                                icon="el-icon-refresh"
                                @click="reloadBox(box)"
                            />
                            <el-button
                                size="mini"
                                type="text"
                                icon="el-icon-close"
                                @click="removeBox(box.id)"
                            />
                        </div>
                    </div>

                    <div v-loading="box.loading" class="box-body">
                        <!-- Click the row to toggle selection; the blue tint
                             on .is-selected is the only affordance. A click
                             that turns into a drag fires `dragstart` instead,
                             so the two gestures don't conflict per HTML5
                             spec (no click after a successful drag). -->
                        <div
                            v-for="item in box.items"
                            :key="item.itemId"
                            :class="['item-row', { 'is-selected': isSelected(item.itemId) }]"
                            :title="rowTooltip(item)"
                            draggable="true"
                            @click="toggleSelection(item.itemId, box.id)"
                            @dragstart="onDragStart($event, item, box.id, 'box')"
                            @dragend="onDragEnd"
                        >
                            <i class="el-icon-rank drag-handle" />
                            <img
                                v-if="item.imageUrl"
                                :src="item.imageUrl"
                                class="item-img"
                                @error="onImgError($event)"
                            />
                            <div v-else class="item-img item-img-placeholder">
                                <i class="el-icon-picture-outline" />
                            </div>
                            <div class="item-meta">
                                <div class="item-name">{{ item.name }}</div>
                                <div class="item-sku">SKU: {{ item.sku || '—' }}</div>
                            </div>
                            <span :class="['stock-pill', stockClass(item.stock)]">
                                {{ item.stock }} units
                            </span>
                        </div>

                        <div v-if="!box.loading && box.items.length === 0" class="box-empty">
                            No items at this location.
                        </div>
                    </div>
                </div>
            </div>

            <!-- Loading Zone -->
            <aside
                v-loading="loadingZoneLoading"
                :class="['loading-zone', { 'is-drop-target': dropHover === 'loading' }]"
                @dragover.prevent="onDragOver('loading')"
                @dragleave="onDragLeave('loading')"
                @drop.prevent="onDropToLoadingZone"
            >
                <div class="lz-head">
                    <span class="lz-title">
                        Loading Zone
                        <span v-if="loadingZone.length" class="lz-count">{{ loadingZone.length }}</span>
                    </span>
                    <div class="lz-head-actions">
                        <el-button
                            size="mini"
                            type="text"
                            class="select-all-btn"
                            :disabled="loadingZoneLoading || loadingZone.length === 0"
                            @click="toggleSelectAll('loading')"
                        >{{ selectAllLabel('loading') }}</el-button>
                        <el-tooltip
                            content="A real Zoho location. Drop items here to move them to the Loading Zone; drag them out to relocate."
                            placement="top"
                        >
                            <i class="el-icon-info" />
                        </el-tooltip>
                    </div>
                </div>

                <div v-if="!loadingZoneLoading && loadingZone.length === 0" class="lz-empty">
                    <i class="el-icon-download" />
                    <div class="lz-empty-title">Drop items here</div>
                    <div class="lz-empty-sub">Items placed here are moved to the Loading Zone in Zoho.</div>
                </div>

                <div v-else class="lz-list">
                    <div
                        v-for="item in loadingZone"
                        :key="item.itemId"
                        :class="['item-row', 'lz-row', { 'is-selected': isSelected(item.itemId) }]"
                        :title="rowTooltip(item)"
                        draggable="true"
                        @click="toggleSelection(item.itemId, 'loading')"
                        @dragstart="onDragStart($event, item, 'loading', 'loading')"
                        @dragend="onDragEnd"
                    >
                        <i class="el-icon-rank drag-handle" />
                        <img
                            v-if="item.imageUrl"
                            :src="item.imageUrl"
                            class="item-img"
                            @error="onImgError($event)"
                        />
                        <div v-else class="item-img item-img-placeholder">
                            <i class="el-icon-picture-outline" />
                        </div>
                        <div class="item-meta">
                            <div class="item-name">{{ item.name }}</div>
                            <div class="item-sku">SKU: {{ item.sku || '—' }}</div>
                        </div>
                        <span :class="['stock-pill', stockClass(item.stock)]">
                            {{ item.stock }}
                        </span>
                    </div>
                </div>

                <div class="lz-foot">
                    <i class="el-icon-info" />
                    <div>
                        <strong>How it works</strong>
                        <div>Tick rows to bulk-select, then drag any of them to move the whole set in one go. Single drags still work without ticking anything.</div>
                    </div>
                </div>
            </aside>
        </div>
    </div>
</template>

<script>
import {
    listItemsByLocation,
    updateItemLocation,
    getProductLocation
} from '@/api/zoho/location'
// Reuse the shared Zoho Commerce search the Buzztech / Send Parts pickers
// already use. The dedicated /zoho/product/searchProduct endpoint is the
// known-good Commerce caller; rather than maintain a second one under
// /zoho/location, this page just calls the same helper they do.
import { searchProducts } from '@/api/zoho/products/product'

let nextBoxId = 1

// The Loading Zone is a real Zoho Location, not just transient UI state.
// Dropping items here PUTs `location = LOADING_ZONE_LOCATION` against Zoho,
// and on page load we fetch any items already at this location and seed
// the LZ panel from them. Change this string if the warehouse uses a
// different label for its loading zone.
const LOADING_ZONE_LOCATION = 'Loading Zone'

export default {
    name: 'ToolsLocationMonitoring',
    data() {
        return {
            // Composed-location selector — mirrors the structured location
            // format used in the warehouse: <areaCode><areaNumber>
            // <zoomCode><zoomNumber><layerCode><layerNumber>[-surfix].
            // The areaCode and layerCode are fixed; everything else is
            // user-picked.
            areaNumberOption: ['1', '2', '3', '4'],
            zoomCodeOption: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'],
            zoomNumberOption: ['1', '2', '3', '4', '5', '6'],
            layerNumberOption: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
            locForm: {
                areaCode: 'A',
                areaNumber: '1',
                zoomCode: 'A',
                zoomNumber: '1',
                layerCode: 'L',
                layerNumber: '1',
                surfix: ''
            },

            // Product search input
            productKeyword: '',

            // Open location boxes
            //   { id, location, items, loading }
            boxes: [],

            // Items currently at LOADING_ZONE_LOCATION in Zoho. Hydrated
            // on page load and kept in sync as items are dragged in/out.
            loadingZone: [],
            loadingZoneLoading: false,

            // Drag-and-drop transient state.
            //   dragging: Array<{ item, sourceBoxId, sourceType }> | null
            //     One entry per item being moved this gesture. A solo drag
            //     of an unselected row has length 1; a drag of any selected
            //     row carries the whole selection (potentially from multiple
            //     sources). Cleared on drop or dragend.
            //   dropHover: box.id | 'loading' | null
            dragging: null,
            dropHover: null,

            // IDs of items the user has ticked for a bulk move. Anchored
            // by itemId so a panel refresh that reshuffles the array doesn't
            // lose the picks. Selection is single-scope — see selectionScope
            // below — so all entries here belong to the same source.
            selectedIds: [],

            // Which panel the current selection belongs to:
            //   box.id    → items inside that location box
            //   'loading' → items inside the Loading Zone
            //   null      → no selection
            // Picking an item in a different scope clears the old selection
            // and re-anchors here, so the user can never accidentally pull
            // items from two different locations into the same drag.
            selectionScope: null
        }
    },
    computed: {
        // Reactive live preview of the location string the composer will
        // submit. Area / Zoom / Layer are joined with dashes (so a panel
        // resolves to e.g. "A1-A1-L1"), and the optional Surfix is
        // appended as a fourth dash-separated segment when set.
        composedLocation() {
            const l = this.locForm
            const parts = [
                `${l.areaCode}${l.areaNumber}`,
                `${l.zoomCode}${l.zoomNumber}`,
                `${l.layerCode}${l.layerNumber}`
            ]
            const sfx = (l.surfix || '').trim()
            if (sfx) parts.push(sfx)
            return parts.join('-')
        }
    },
    created() {
        this.loadLoadingZone()
    },
    methods: {
        // Commit the composed location: open a panel for it.
        onAddComposedLocation() {
            const loc = this.composedLocation
            if (!loc) return
            this.addLocationBox(loc)
        },

        // Load whatever Zoho currently has at the Loading Zone location.
        // Silent on failure — the panel just stays empty if Zoho hasn't
        // seen this location yet (e.g. first time the tool is used).
        async loadLoadingZone() {
            this.loadingZoneLoading = true
            try {
                const res = await listItemsByLocation({ location: LOADING_ZONE_LOCATION })
                const items = (res && res.data && res.data.items) || []
                this.loadingZone = items.map(it => ({
                    ...it,
                    _originalLocation: it.location || LOADING_ZONE_LOCATION
                }))
            } catch (e) {
                console.warn('Load loading zone failed:', e)
            } finally {
                this.loadingZoneLoading = false
            }
        },

        // ── Search by Product autocomplete ────────────────────────────
        // Reuses the shared Commerce-backed /zoho/product/searchProduct
        // endpoint (same one Buzztech Order Import + SQT Send Parts use).
        // We shape each Commerce product into the {name, sku, imgUrl}
        // triplet el-autocomplete needs — Commerce shape varies (name |
        // product_name | title; sku | skus[0].sku | variants[0].sku).
        async fetchProductSuggestions(query, cb) {
            const q = (query || '').trim()
            if (!q) { cb([]); return }
            try {
                const res = await searchProducts(q)
                if (!res || !res.success) { cb([]); return }
                const products = Array.isArray(res.data) ? res.data : []
                cb(products.map(p => ({
                    raw: p,
                    name: p.name || p.product_name || p.title || '',
                    sku:
                        p.sku
                        || (Array.isArray(p.skus) && p.skus[0] && p.skus[0].sku)
                        || (p.variants && p.variants[0] && p.variants[0].sku)
                        || '',
                    imgUrl: this.extractCommerceImage(p)
                })).filter(s => s.name || s.sku))
            } catch (e) {
                console.error('Product search failed:', e)
                cb([])
            }
        },
        // Map a Commerce product to a single thumbnail URL. Mirrors the
        // CreateSalesOrder picker so the two pickers look alike.
        extractCommerceImage(p) {
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
        // Two-step pick: resolve the SKU to its Inventory item_id +
        // Location via the new endpoint, then open the box for that
        // location and auto-select the searched row once it lands.
        async onPickProduct(item) {
            if (!item) return
            const sku = (item.sku || '').trim()
            if (!sku) {
                this.$message.warning(
                    `"${item.name || 'Product'}" has no SKU on the Commerce record, can't resolve its location.`
                )
                this.$nextTick(() => { this.productKeyword = '' })
                return
            }
            try {
                const res = await getProductLocation(sku)
                const data = (res && res.data) || {}
                if (!data.location) {
                    this.$message.warning(
                        `"${item.name || sku}" has no Location set in Zoho Inventory.`
                    )
                    this.$nextTick(() => { this.productKeyword = '' })
                    return
                }
                await this.addLocationBox(data.location, {
                    autoSelectItemId: data.itemId
                })
            } catch (e) {
                console.error('Product location lookup failed:', e)
                const msg = (e.response && e.response.data && e.response.data.message)
                    || 'Failed to resolve product location'
                this.$message.error(msg)
            } finally {
                this.$nextTick(() => { this.productKeyword = '' })
            }
        },

        // ── Box management ────────────────────────────────────────────
        // opts.autoSelectItemId: if set, once the box's items finish
        // loading we'll claim the selection scope for this box and tick
        // just that item. Used by the Search-by-Product flow so the
        // searched row is highlighted immediately after the panel opens.
        async addLocationBox(location, opts) {
            const trimmed = String(location || '').trim()
            if (!trimmed) return
            const autoSelectItemId = (opts && opts.autoSelectItemId) || null
            // De-dupe: if it's already open, reload + (re-)apply the
            // auto-select. Awaited so the highlight lands after the
            // freshly-fetched items render.
            const existing = this.boxes.find(
                b => b.location.toLowerCase() === trimmed.toLowerCase()
            )
            if (existing) {
                await this.reloadBox(existing)
                if (autoSelectItemId) {
                    this.applyAutoSelect(existing, autoSelectItemId)
                }
                return
            }
            const box = {
                id: `box-${nextBoxId++}`,
                location: trimmed,
                items: [],
                loading: true
            }
            this.boxes.push(box)
            await this.loadBoxItems(box)
            if (autoSelectItemId) {
                this.applyAutoSelect(box, autoSelectItemId)
            }
        },
        // Replace the active selection with just `itemId` inside the
        // given box's scope. No-op (with a warning toast) when the item
        // isn't actually in the loaded list — most often because Zoho
        // moved it after the search but before the box opened.
        applyAutoSelect(box, itemId) {
            const found = box.items.find(it => it.itemId === itemId)
            if (!found) {
                this.$message.info(
                    `Opened "${box.location}" — searched item isn't in this panel anymore.`
                )
                return
            }
            this.selectedIds = [itemId]
            this.selectionScope = box.id
        },
        async reloadBox(box) {
            box.loading = true
            await this.loadBoxItems(box)
        },
        async loadBoxItems(box) {
            try {
                const res = await listItemsByLocation({ location: box.location })
                box.items = ((res && res.data && res.data.items) || []).map(it => ({
                    ...it,
                    // Stash original location so we can compare on drop
                    // and skip same-location PUTs.
                    _originalLocation: it.location || box.location
                }))
            } catch (e) {
                console.error('Load box items failed:', e)
                const msg = (e.response && e.response.data && e.response.data.message) || 'Failed to load items'
                this.$message.error(`${box.location}: ${msg}`)
                box.items = []
            } finally {
                box.loading = false
            }
        },
        removeBox(id) {
            const idx = this.boxes.findIndex(b => b.id === id)
            if (idx !== -1) this.boxes.splice(idx, 1)
        },
        clearAll() {
            this.boxes = []
            this.loadingZone = []
            this.selectedIds = []
            this.selectionScope = null
        },

        // ── Bulk selection ────────────────────────────────────────────
        isSelected(itemId) {
            return this.selectedIds.indexOf(itemId) !== -1
        },
        // Toggle a single item in/out of the selection. `scopeId` is the
        // owning panel — box.id for a location box, 'loading' for the
        // Loading Zone. Picking an item in a NEW scope wipes the old
        // selection and re-anchors here, enforcing "one source per bulk
        // drag".
        toggleSelection(itemId, scopeId) {
            if (!itemId) return
            if (this.selectionScope !== null && this.selectionScope !== scopeId) {
                // Cross-scope click → swap to this scope, select only this
                // item. The previously-checked rows visibly clear because
                // their `isSelected()` flips to false.
                this.selectedIds = [itemId]
                this.selectionScope = scopeId
                return
            }
            const idx = this.selectedIds.indexOf(itemId)
            if (idx === -1) {
                this.selectedIds.push(itemId)
                this.selectionScope = scopeId
            } else {
                this.selectedIds.splice(idx, 1)
                // Drop the scope anchor once nothing's left so the next
                // pick can claim any panel freely.
                if (this.selectedIds.length === 0) {
                    this.selectionScope = null
                }
            }
        },
        clearSelection() {
            this.selectedIds = []
            this.selectionScope = null
        },
        // Items array for a given scope id — used by the Select-All header
        // checkbox to compute its state and to know what to toggle.
        scopeItems(scopeId) {
            if (scopeId === 'loading') return this.loadingZone
            const box = this.boxes.find(b => b.id === scopeId)
            return box ? box.items : []
        },
        // True iff every item in this scope is currently selected. Drives
        // the checked state of the scope's Select-All checkbox.
        isAllSelected(scopeId) {
            if (this.selectionScope !== scopeId) return false
            const items = this.scopeItems(scopeId)
            if (!items.length) return false
            return items.every(it => this.isSelected(it.itemId))
        },
        // True iff this scope has at least one selection but not all of
        // them — drives the checkbox's `indeterminate` state for the
        // classic "some children ticked" affordance.
        isPartiallySelected(scopeId) {
            if (this.selectionScope !== scopeId) return false
            const items = this.scopeItems(scopeId)
            if (!items.length) return false
            const anyOn = items.some(it => this.isSelected(it.itemId))
            const allOn = items.every(it => this.isSelected(it.itemId))
            return anyOn && !allOn
        },
        // Label for the Select-All text button. Flips to "Deselect all"
        // only when every row in this scope is already selected — partial
        // selection still reads as "Select all" so a single click rounds
        // it up.
        selectAllLabel(scopeId) {
            return this.isAllSelected(scopeId) ? 'Deselect all' : 'Select all'
        },
        // Select-all header handler. If every item in this scope is
        // already selected, this is a "deselect all" gesture; otherwise
        // it claims the scope and ticks every item — wiping any other
        // panel's selection in the process.
        toggleSelectAll(scopeId) {
            const items = this.scopeItems(scopeId)
            if (!items.length) return
            if (this.isAllSelected(scopeId)) {
                this.clearSelection()
            } else {
                this.selectionScope = scopeId
                this.selectedIds = items.map(it => it.itemId)
            }
        },
        // Walk every panel to gather the {item, source} tuples for the
        // items the user has ticked. Used at drag-start so a single drag
        // gesture can carry items from multiple sources at once.
        gatherSelectedItems() {
            const out = []
            for (const box of this.boxes) {
                for (const item of box.items) {
                    if (this.isSelected(item.itemId)) {
                        out.push({ item, sourceBoxId: box.id, sourceType: 'box' })
                    }
                }
            }
            for (const item of this.loadingZone) {
                if (this.isSelected(item.itemId)) {
                    out.push({ item, sourceBoxId: 'loading', sourceType: 'loading' })
                }
            }
            return out
        },
        // Drop a single itemId from the active selection — called after
        // a successful per-item move so the user can see the bag empty
        // out as items land.
        _dropFromSelection(itemId) {
            const i = this.selectedIds.indexOf(itemId)
            if (i !== -1) this.selectedIds.splice(i, 1)
        },

        // ── Drag and drop ─────────────────────────────────────────────
        onDragStart(event, item, sourceBoxId, sourceType) {
            // If the dragged row is part of the active selection, capture
            // the whole bag for a bulk move. Otherwise it's a solo drag.
            let dragSet
            if (this.isSelected(item.itemId)) {
                dragSet = this.gatherSelectedItems()
                // Defensive: if reactivity hiccuped and the gather didn't
                // find the dragged row, fall back to a solo drag so the
                // gesture still does something useful.
                if (!dragSet.some(d => d.item.itemId === item.itemId)) {
                    dragSet = [{ item, sourceBoxId, sourceType }]
                }
            } else {
                dragSet = [{ item, sourceBoxId, sourceType }]
            }
            this.dragging = dragSet
            // dataTransfer is required for Firefox to fire drop events.
            if (event && event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move'
                try { event.dataTransfer.setData('text/plain', item.itemId) } catch (_) { /* noop */ }
            }
        },
        onDragEnd() {
            this.dragging = null
            this.dropHover = null
        },
        onDragOver(id) {
            if (this.dragging && this.dropHover !== id) this.dropHover = id
        },
        onDragLeave(id) {
            // dragleave fires when crossing child elements — only clear if
            // we're leaving the actual target we were hovering.
            if (this.dropHover === id) this.dropHover = null
        },
        async onDropToBox(targetBox) {
            const drags = this.dragging
            this.dropHover = null
            this.dragging = null
            if (!Array.isArray(drags) || drags.length === 0) return

            // Independent per-item moves: allSettled so a single failure
            // doesn't roll back the others. Same-source / same-location
            // entries short-circuit inside moveOneToBox without a PUT.
            const settled = await Promise.allSettled(
                drags.map(d => this.moveOneToBox(d, targetBox))
            )
            const outcomes = settled.map(s =>
                s.status === 'fulfilled'
                    ? s.value
                    : { ok: false, item: null, reason: String(s.reason || 'error') }
            )
            this.reportBulk(outcomes, `"${targetBox.location}"`)
        },
        async moveOneToBox(drag, targetBox) {
            if (!drag || !drag.item) {
                return { ok: false, item: null, reason: 'invalid' }
            }
            const item = drag.item
            const targetLocation = targetBox.location

            // Same-source-box drop is a no-op (mark as no-op so the
            // bulk reporter doesn't count it as a failure).
            if (drag.sourceType === 'box' && drag.sourceBoxId === targetBox.id) {
                return { ok: true, item, reason: 'no-op' }
            }
            // Already at target location in Zoho → just shuffle the panels,
            // no network call needed.
            if (
                String(item._originalLocation || '').toLowerCase() ===
                targetLocation.toLowerCase()
            ) {
                this.detachFromSource(drag, item)
                this.attachToBox(targetBox, item, targetLocation)
                this._dropFromSelection(item.itemId)
                return { ok: true, item, reason: 'no-op' }
            }
            // Optimistic detach + attach, revert on failure.
            this.detachFromSource(drag, item)
            this.attachToBox(targetBox, item, targetLocation)
            try {
                await updateItemLocation(item.itemId, targetLocation)
                item._originalLocation = targetLocation
                this._dropFromSelection(item.itemId)
                return { ok: true, item, reason: 'moved' }
            } catch (e) {
                console.error('Move failed:', e)
                const tIdx = targetBox.items.indexOf(item)
                if (tIdx !== -1) targetBox.items.splice(tIdx, 1)
                this.restoreToSource(drag, item)
                const msg = (e.response && e.response.data && e.response.data.message) || 'Move failed'
                return { ok: false, item, reason: msg }
            }
        },
        async onDropToLoadingZone() {
            const drags = this.dragging
            this.dropHover = null
            this.dragging = null
            if (!Array.isArray(drags) || drags.length === 0) return

            const settled = await Promise.allSettled(
                drags.map(d => this.moveOneToLoadingZone(d))
            )
            const outcomes = settled.map(s =>
                s.status === 'fulfilled'
                    ? s.value
                    : { ok: false, item: null, reason: String(s.reason || 'error') }
            )
            this.reportBulk(outcomes, 'Loading Zone')
        },
        async moveOneToLoadingZone(drag) {
            if (!drag || !drag.item) {
                return { ok: false, item: null, reason: 'invalid' }
            }
            const item = drag.item
            // From-LZ to LZ → no-op.
            if (drag.sourceType === 'loading') {
                return { ok: true, item, reason: 'no-op' }
            }
            // Already at Loading Zone in Zoho → relocate panels only.
            if (
                String(item._originalLocation || '').toLowerCase() ===
                LOADING_ZONE_LOCATION.toLowerCase()
            ) {
                this.detachFromSource(drag, item)
                this.attachToLoadingZone(item)
                this._dropFromSelection(item.itemId)
                return { ok: true, item, reason: 'no-op' }
            }
            this.detachFromSource(drag, item)
            this.attachToLoadingZone(item)
            try {
                await updateItemLocation(item.itemId, LOADING_ZONE_LOCATION)
                item._originalLocation = LOADING_ZONE_LOCATION
                item.location = LOADING_ZONE_LOCATION
                this._dropFromSelection(item.itemId)
                return { ok: true, item, reason: 'moved' }
            } catch (e) {
                console.error('Move to Loading Zone failed:', e)
                const idx = this.loadingZone.indexOf(item)
                if (idx !== -1) this.loadingZone.splice(idx, 1)
                this.restoreToSource(drag, item)
                const msg = (e.response && e.response.data && e.response.data.message) || 'Move failed'
                return { ok: false, item, reason: msg }
            }
        },

        // Show a concise toast after a (possibly bulk) drop. Single-item
        // drags get the classic "X moved to Y" message; bulk drags get
        // a summary with a partial-failure note when needed.
        reportBulk(outcomes, destLabel) {
            // outcomes: [{ ok, item, reason }]
            // "no-op" means same-source / same-location skip — counted as
            // neither success nor failure for the toast.
            const moved = outcomes.filter(o => o.ok && o.reason === 'moved')
            const failed = outcomes.filter(o => !o.ok)
            if (outcomes.length === 1) {
                const o = outcomes[0]
                if (o.ok && o.reason === 'moved') {
                    const name = (o.item && o.item.name) || 'Item'
                    this.$message.success(`${name} moved to ${destLabel}`)
                } else if (!o.ok) {
                    this.$message.error(o.reason || 'Move failed')
                }
                return
            }
            if (moved.length > 0 && failed.length === 0) {
                this.$message.success(
                    `Moved ${moved.length} item${moved.length === 1 ? '' : 's'} to ${destLabel}`
                )
            } else if (moved.length > 0 && failed.length > 0) {
                this.$message.warning(
                    `Moved ${moved.length}, ${failed.length} failed to update`
                )
            } else if (failed.length > 0) {
                this.$message.error(
                    `Move failed for ${failed.length} item${failed.length === 1 ? '' : 's'}`
                )
            }
        },

        // ── Source / target list helpers ──────────────────────────────
        detachFromSource(drag, item) {
            if (drag.sourceType === 'loading') {
                const idx = this.loadingZone.indexOf(item)
                if (idx !== -1) this.loadingZone.splice(idx, 1)
                return
            }
            const sourceBox = this.boxes.find(b => b.id === drag.sourceBoxId)
            if (!sourceBox) return
            const idx = sourceBox.items.indexOf(item)
            if (idx !== -1) sourceBox.items.splice(idx, 1)
        },
        attachToBox(box, item, location) {
            item.location = location
            // Dedupe by itemId — if the user managed to fire two drops
            // before state caught up, don't show twice.
            if (!box.items.some(i => i.itemId === item.itemId)) {
                box.items.push(item)
            }
        },
        attachToLoadingZone(item) {
            if (!this.loadingZone.some(i => i.itemId === item.itemId)) {
                this.loadingZone.push(item)
            }
        },
        restoreToSource(drag, item) {
            if (drag.sourceType === 'loading') {
                this.attachToLoadingZone(item)
                return
            }
            const sourceBox = this.boxes.find(b => b.id === drag.sourceBoxId)
            if (sourceBox) {
                if (!sourceBox.items.some(i => i.itemId === item.itemId)) {
                    sourceBox.items.push(item)
                }
            }
        },

        // ── Misc ──────────────────────────────────────────────────────
        // Build a multi-line native-title tooltip for an item row. Surfaces
        // the full product name (which the row truncates with ellipsis) plus
        // the SKU and stock as quick context.
        rowTooltip(item) {
            if (!item) return ''
            const lines = [item.name || '']
            if (item.sku) lines.push(`SKU: ${item.sku}`)
            const stock = Number(item.stock)
            if (Number.isFinite(stock)) lines.push(`Stock: ${stock}`)
            return lines.join('\n')
        },
        stockClass(stock) {
            const n = Number(stock) || 0
            if (n <= 0) return 'stock-red'
            if (n < 5) return 'stock-yellow'
            return 'stock-green'
        },
        onImgError(e) {
            if (e && e.target) e.target.style.display = 'none'
        },
        goBack() {
            this.$router.push('/tools')
        }
    }
}
</script>

<style scoped>
.loc-page {
    padding: 18px 20px;
    background: #f5f7fb;
    min-height: 100%;
}

/* Header */
.loc-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
}
.loc-title {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
    color: #111827;
    display: flex;
    align-items: center;
    gap: 8px;
    i { color: #2563eb; }
}
.loc-sub {
    margin: 6px 0 0;
    color: #909399;
    font-size: 13px;
    max-width: 760px;
}

/* Search bar */
.loc-searchbar {
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 12px;
    padding: 14px 18px;
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.search-row {
    display: flex;
    align-items: center;
    gap: 14px;
}
.row-label {
    color: #303133;
    font-size: 13px;
    font-weight: 600;
    width: 140px;
    flex-shrink: 0;
}
.composer {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    flex-wrap: wrap;
    flex: 1;
    min-width: 0;
}

/* Composed-location field group */
.composer-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.composer-field > label {
    color: #303133;
    font-size: 12px;
    font-weight: 500;
}
.field-pair {
    display: flex;
    gap: 6px;
    align-items: center;
}
.fixed-prefix {
    width: 40px;
    height: 32px;
    border: 1px solid #dcdfe6;
    border-radius: 4px;
    background: #f5f7fa;
    color: #909399;
    text-align: center;
    font-size: 13px;
    font-weight: 600;
    line-height: 32px;
    padding: 0;
    cursor: not-allowed;
    box-sizing: border-box;
}
/* Element UI's el-select wraps its trigger in an el-input. Setting a width
   on .el-select alone leaves the inner el-input at its default ~200px,
   which causes it to overflow into the next field. Constrain both so the
   visible size matches the rendered size. */
.field-pair ::v-deep .el-select {
    width: 80px;
}
.field-pair ::v-deep .el-select .el-input,
.field-pair ::v-deep .el-select .el-input__inner {
    width: 100%;
}
.field-pair ::v-deep .el-input {
    width: 120px;
}
.field-pair ::v-deep .el-input .el-input__inner {
    padding-left: 10px;
    padding-right: 10px;
}
.add-btn { align-self: flex-end; }

.product-input { flex: 1; min-width: 220px; }

.composed-preview {
    color: #909399;
    font-size: 12px;
    padding-left: 154px;
    code {
        background: #f5f7fa;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 12px;
        color: #2563eb;
        font-weight: 600;
    }
}

/* Legend row */
.loc-legend-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 4px 4px;
    margin-bottom: 10px;
    color: #606266;
    font-size: 13px;
    flex-wrap: wrap;
}
.legend-right {
    display: flex;
    align-items: center;
    gap: 12px;
    color: #606266;
    font-size: 12px;
}
.legend-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 4px;
    vertical-align: middle;
}
.dot-green  { background: #10b981; }
.dot-yellow { background: #f59e0b; }
.dot-red    { background: #ef4444; }

/* Bulk-selection toolbar. Sits between the legend and the boxes grid;
   only renders when something is selected so it doesn't take vertical
   space otherwise. */
.selection-bar {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 14px;
    margin-bottom: 10px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 8px;
    color: #1e40af;
    font-size: 13px;
}
.selection-count {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #1d4ed8;
    font-weight: 500;
}
.selection-count i {
    color: #2563eb;
    font-weight: 700;
}
.selection-count strong {
    color: #1e3a8a;
    font-weight: 700;
}
.selection-hint {
    flex: 1;
    color: #475569;
    font-size: 12px;
    font-weight: 400;
}

/* Main layout */
.loc-main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 14px;
    align-items: start;
}
/*
 * Boxes are laid out with flex-wrap so the row width adapts to the count:
 *   - 1 box  → spans the full row (flex-grow fills the line)
 *   - 2 boxes → each takes half
 *   - 3 boxes → each takes a third
 *   - 4+ boxes → 3-per-row, the trailing boxes on the last row grow to
 *     fill that row (same rule applied per-line).
 * Flex-basis 33.333% minus the gap allowance keeps three boxes per row,
 * and `flex-grow: 1` makes fewer-than-three rows expand to fill.
 */
.boxes-area {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    min-height: 200px;
}
.empty-area {
    flex: 1 1 100%;
    padding: 60px 20px;
    text-align: center;
    color: #909399;
    background: #fff;
    border: 1px dashed #dcdfe6;
    border-radius: 12px;
    i {
        font-size: 32px;
        margin-bottom: 8px;
        display: block;
    }
}

/* Location box */
.loc-box {
    flex: 1 1 calc(33.333% - 10px);
    min-width: 320px;
    /* Without max-width the box would still grow under flex-grow when
       another line has fewer items; we cap at the 1-row-of-3 width to
       keep proportions consistent across the page. The cap is removed
       on the last row implicitly because flex-grow only kicks in to
       absorb leftover space within a wrapped line. */
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: box-shadow 0.15s ease, border-color 0.15s ease;
}
.loc-box.is-drop-target {
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}
.box-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid #ebeef5;
    background: #f9fafb;
}
.box-title {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #111827;
    font-weight: 600;
    font-size: 14px;
    i { color: #2563eb; }
}
.box-actions {
    display: flex;
    gap: 4px;
    .el-button { color: #909399; padding: 4px !important; }
    .el-button:hover { color: #2563eb; }
}
.box-body {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    /* Grow with the viewport so tall monitors show more rows without
       scrolling. The offset accounts for the header, search bar, legend,
       and box title — leaving room above and below without pushing the
       page chrome off-screen. The floor keeps short screens usable. */
    min-height: 320px;
    max-height: calc(100vh - 340px);
    overflow-y: auto;
}
.box-empty {
    color: #909399;
    text-align: center;
    padding: 20px 0;
    font-size: 13px;
}

/* Item rows */
.item-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    cursor: grab;
    user-select: none;
    transition: background-color 0.15s ease, box-shadow 0.15s ease,
        border-color 0.15s ease;
}
.item-row:active { cursor: grabbing; }
.item-row:hover {
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    border-color: #c6cef0;
}
/* Selected row — tinted background + accent border. Doubles as the
   "this will move with the bulk drag" affordance. */
.item-row.is-selected {
    background: #eff6ff;
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.08);
}
.item-row.is-selected:hover {
    border-color: #1d4ed8;
}
/* Per-location Select All text button. Lives in box-actions alongside
   the icon buttons but needs different padding/font so the label fits.
   The .box-actions block underneath gives all its el-buttons grey-on-
   blue hover; the select-all variant inherits that automatically. */
.select-all-btn {
    padding: 4px 6px !important;
    font-size: 12px;
    font-weight: 500;
}
.drag-handle {
    color: #c0c4cc;
    font-size: 14px;
    flex-shrink: 0;
}
.item-img {
    width: 36px;
    height: 36px;
    object-fit: cover;
    border-radius: 4px;
    background: #f5f7fa;
    flex-shrink: 0;
}
.item-img-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #c0c4cc;
    font-size: 16px;
}
.item-meta {
    flex: 1;
    min-width: 0;
}
.item-name {
    font-weight: 500;
    color: #303133;
    font-size: 13px;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.item-sku {
    color: #909399;
    font-size: 11px;
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.stock-pill {
    flex-shrink: 0;
    padding: 3px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
}
.stock-green  { background: #d1fae5; color: #065f46; }
.stock-yellow { background: #fef3c7; color: #92400e; }
.stock-red    { background: #fee2e2; color: #991b1b; }

/* Loading Zone */
.loading-zone {
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 12px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: sticky;
    top: 12px;
    max-height: calc(100vh - 30px);
    overflow-y: auto;
    transition: box-shadow 0.15s ease, border-color 0.15s ease;
}
.loading-zone.is-drop-target {
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}
.lz-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: #111827;
    font-weight: 600;
    font-size: 14px;
    i { color: #909399; cursor: help; }
}
.lz-head-actions {
    display: flex;
    align-items: center;
    gap: 4px;
}
.lz-head-actions .select-all-btn {
    color: #2563eb;
}
.lz-count {
    display: inline-block;
    background: #eff6ff;
    color: #1d4ed8;
    font-size: 12px;
    font-weight: 600;
    padding: 1px 8px;
    border-radius: 10px;
    margin-left: 6px;
}
.lz-empty {
    border: 2px dashed #dcdfe6;
    border-radius: 8px;
    padding: 24px 12px;
    text-align: center;
    color: #909399;
    i { font-size: 28px; margin-bottom: 6px; display: block; }
}
.lz-empty-title {
    color: #303133;
    font-weight: 500;
    font-size: 13px;
    margin-bottom: 2px;
}
.lz-empty-sub { font-size: 12px; line-height: 1.4; }
.lz-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.lz-row {
    position: relative;
}
.lz-remove {
    color: #c0c4cc;
    padding: 4px !important;
}
.lz-remove:hover { color: #f56c6c; }
.lz-foot {
    background: #eff6ff;
    border: 1px solid #dbeafe;
    border-radius: 8px;
    padding: 10px 12px;
    color: #1e40af;
    font-size: 12px;
    line-height: 1.5;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    i { flex-shrink: 0; margin-top: 2px; }
    strong { display: block; margin-bottom: 2px; }
}

/* Mobile / narrow */
@media (max-width: 980px) {
    .loc-main {
        grid-template-columns: 1fr;
    }
    .loading-zone {
        position: static;
        max-height: none;
    }
    .composer { flex-direction: column; align-items: stretch; }
}
@media (max-width: 700px) {
    .loc-page { padding: 12px; }
    .loc-header { flex-direction: column; align-items: stretch; }
    .search-row { flex-direction: column; align-items: stretch; }
    .row-label { width: auto; }
    .composer { width: 100%; }
    .composed-preview { padding-left: 0; }
    .selection-bar { flex-wrap: wrap; }
}
</style>

<style>
/* Suggestion popper — unscoped because Element UI teleports it. */
.prod-suggest .prod-suggestion {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
    line-height: 1.3;
}
.prod-suggest .prod-suggestion-img {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border-radius: 4px;
    object-fit: cover;
    background: #f5f7fa;
}
.prod-suggest .prod-suggestion-img-ph {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #c0c4cc;
    font-size: 16px;
}
.prod-suggest .prod-suggestion-info {
    min-width: 0;
    flex: 1;
}
.prod-suggest .prod-suggestion-name {
    color: #303133;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.prod-suggest .prod-suggestion-meta {
    color: #909399;
    font-size: 12px;
    display: flex;
    gap: 10px;
    align-items: center;
}
</style>
