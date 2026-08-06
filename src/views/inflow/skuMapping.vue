<template>
    <div class="inflow-skumap app-container tree-sidebar-manage-wrap">
        <tree-panel
            title="Status"
            title-icon-class="el-icon-collection-tag"
            :tree-data="treeData"
            :default-expand-all="true"
            :show-search="false"
            storage-key="inflow-skumap-sidebar-width"
            @node-click="onTreeClick"
        >
            <template #node="{ data }">
                <span class="sm-node">
                    <i :class="nodeIcon(data.id)" class="sm-node-icon" />
                    <span class="sm-node-label" :title="data.label">{{ data.label }}</span>
                    <el-badge
                        v-if="data.count !== undefined"
                        :value="data.count"
                        :max="9999"
                        :type="data.id === 'pending' ? 'warning' : 'info'"
                        class="sm-node-badge"
                    />
                </span>
            </template>
        </tree-panel>
        <div class="tree-sidebar-content">
            <div class="content-inner">
                <div class="sm-filters">
                    <el-input v-model="query.search" size="small" clearable class="f-search"
                        placeholder="Search barcode / SKU / description…" prefix-icon="el-icon-search"
                        @keyup.enter.native="reload" @clear="reload" />
                    <span class="sm-spacer" />
                    <span class="sm-meta">
                        {{ total.toLocaleString() }} mappings<template v-if="pendingTotal"> · <b class="sm-pending-count">{{ pendingTotal }}</b> pending</template>
                    </span>
                    <el-button size="small" type="primary" plain icon="el-icon-plus" @click="openEdit(null)">Add Mapping</el-button>
                    <el-button size="small" icon="el-icon-upload2" @click="openImport">Import Excel</el-button>
                    <el-button size="small" icon="el-icon-refresh" @click="load">Refresh</el-button>
                    <el-button size="small" type="primary" icon="el-icon-search" @click="reload">Search</el-button>
                </div>

                <el-table v-loading="loading" :data="rows" border size="mini" height="calc(100vh - 210px)"
                    empty-text="No mappings here — add one or import an Excel file.">
                    <el-table-column prop="barcode" label="Customer Barcode" width="150" show-overflow-tooltip>
                        <template slot-scope="s"><b>{{ s.row.barcode }}</b></template>
                    </el-table-column>
                    <el-table-column label="iMobile SKU" width="200">
                        <template slot-scope="s">
                            <div class="sm-sku-cell">
                                <!--
                                    Zoho Commerce product search: type a product
                                    name or SKU and pick a result to map it
                                    (saves immediately). A raw SKU can still be
                                    typed and confirmed with Enter / ✓.
                                -->
                                <el-autocomplete
                                    v-model="s.row.sku"
                                    size="mini"
                                    value-key="sku"
                                    :fetch-suggestions="fetchSkuSuggestions"
                                    :debounce="400"
                                    :trigger-on-focus="false"
                                    popper-class="sm-sku-suggestions"
                                    :placeholder="s.row._origSku ? '' : 'Search product / SKU…'"
                                    :class="{ 'sm-sku-pending': !s.row.sku && !s.row._origSku }"
                                    :disabled="savingRowId === s.row._id"
                                    @select="item => onRowSkuPicked(s.row, item)"
                                    @keyup.enter.native="saveRowSku(s.row)"
                                >
                                    <template slot-scope="{ item }">
                                        <div class="sku-suggestion" :title="item.name">
                                            <img v-if="item.imgUrl" :src="item.imgUrl" class="sku-suggestion-img" @error="onSuggestionImgError($event)" />
                                            <div v-else class="sku-suggestion-img sku-suggestion-img-placeholder"><i class="el-icon-picture-outline" /></div>
                                            <div class="sku-suggestion-info">
                                                <div class="sku-suggestion-name">{{ item.name }}</div>
                                                <div class="sku-suggestion-sku">{{ item.sku || 'no SKU' }}</div>
                                            </div>
                                        </div>
                                    </template>
                                </el-autocomplete>
                                <el-button
                                    v-if="rowDirty(s.row)"
                                    size="mini"
                                    type="text"
                                    icon="el-icon-check"
                                    class="sm-sku-save"
                                    :loading="savingRowId === s.row._id"
                                    @click="saveRowSku(s.row)"
                                />
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column prop="description" label="Description" min-width="220" show-overflow-tooltip>
                        <template slot-scope="s">{{ s.row.description || '—' }}</template>
                    </el-table-column>
                    <el-table-column label="Updated" width="170">
                        <template slot-scope="s">
                            {{ dateOnly(s.row.updatedAt) }}<span v-if="s.row.updatedBy" class="sm-dim"> · {{ s.row.updatedBy }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="" width="120" align="center">
                        <template slot-scope="s">
                            <el-button size="mini" type="text" icon="el-icon-edit" @click="openEdit(s.row)">Edit</el-button>
                            <el-button size="mini" type="text" icon="el-icon-delete" class="sm-del" @click="remove(s.row)" />
                        </template>
                    </el-table-column>
                </el-table>

                <div class="sm-pager">
                    <el-pagination background layout="total, sizes, prev, pager, next, jumper"
                        :total="total" :page-size="query.pageSize" :page-sizes="[25, 50, 100, 200]"
                        :current-page="query.page" @current-change="onPage" @size-change="onSize" />
                </div>
            </div>
        </div>

        <!-- Add / Edit one mapping -->
        <el-dialog :title="editRow ? 'Edit Mapping' : 'Add Mapping'" :visible.sync="editVisible" width="480px" append-to-body>
            <el-form label-width="150px" size="small" class="sm-edit-form" @submit.native.prevent>
                <el-form-item label="Customer Barcode" required>
                    <el-input v-model="editForm.barcode" :disabled="!!editRow" placeholder="Barcode on the customer's order" />
                </el-form-item>
                <el-form-item label="iMobile SKU">
                    <el-autocomplete
                        v-model="editForm.sku"
                        value-key="sku"
                        style="width:100%"
                        :fetch-suggestions="fetchSkuSuggestions"
                        :debounce="400"
                        :trigger-on-focus="false"
                        popper-class="sm-sku-suggestions"
                        placeholder="Search a Zoho product or type a SKU — leave empty to fill in later"
                        @select="onEditSkuPicked"
                        @keyup.enter.native="saveEdit"
                    >
                        <template slot-scope="{ item }">
                            <div class="sku-suggestion" :title="item.name">
                                <img v-if="item.imgUrl" :src="item.imgUrl" class="sku-suggestion-img" @error="onSuggestionImgError($event)" />
                                <div v-else class="sku-suggestion-img sku-suggestion-img-placeholder"><i class="el-icon-picture-outline" /></div>
                                <div class="sku-suggestion-info">
                                    <div class="sku-suggestion-name">{{ item.name }}</div>
                                    <div class="sku-suggestion-sku">{{ item.sku || 'no SKU' }}</div>
                                </div>
                            </div>
                        </template>
                    </el-autocomplete>
                </el-form-item>
                <el-form-item label="Description">
                    <el-input v-model="editForm.description" placeholder="Optional" @keyup.enter.native="saveEdit" />
                </el-form-item>
            </el-form>
            <span slot="footer">
                <el-button size="small" @click="editVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" :loading="editSaving" @click="saveEdit">Save</el-button>
            </span>
        </el-dialog>

        <!-- Import from Excel -->
        <el-dialog title="Import SKU Mappings" :visible.sync="importVisible" width="600px" append-to-body>
            <div class="sm-hint">
                Upload an Excel file with a <b>Barcode</b> column — <b>SKU</b> and <b>Description</b>
                are optional. Rows without a SKU import as <b>Pending</b> so staff can fill the SKU in
                here later. Existing barcodes are updated; mapped rows apply to existing orders
                immediately and to future orders automatically.
            </div>
            <input ref="importFile" type="file" accept=".xlsx,.xls,.csv" class="sm-file-input" @change="onImportFile" />
            <div class="sm-file-pick">
                <el-button size="small" icon="el-icon-folder-opened" @click="$refs.importFile.click()">Choose File</el-button>
                <span class="sm-file-name" :class="{ 'sm-dim': !importFileName }">{{ importFileName || 'No file selected' }}</span>
            </div>
            <template v-if="importRows.length">
                <div class="sm-count">
                    <b>{{ importRows.length }}</b> mappings found<template v-if="importPendingCount"> · <b>{{ importPendingCount }}</b> without SKU (import as Pending)</template><span v-if="importSkipped"> · {{ importSkipped }} rows skipped (missing Barcode)</span>
                </div>
                <el-table :data="importRows.slice(0, 8)" size="mini" border>
                    <el-table-column prop="barcode" label="Barcode" min-width="150" show-overflow-tooltip />
                    <el-table-column label="SKU" min-width="130" show-overflow-tooltip>
                        <template slot-scope="s">
                            <template v-if="s.row.sku">{{ s.row.sku }}</template>
                            <el-tag v-else size="mini" type="warning">Pending</el-tag>
                        </template>
                    </el-table-column>
                    <el-table-column prop="description" label="Description" min-width="180" show-overflow-tooltip />
                </el-table>
                <div v-if="importRows.length > 8" class="sm-more">…and {{ importRows.length - 8 }} more</div>
            </template>
            <span slot="footer">
                <el-button size="small" @click="importVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" :loading="importSaving" :disabled="!importRows.length" @click="submitImport">Import</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import TreePanel from '@/components/TreePanel'
import { getInflowSkuMap, saveInflowSkuMapping, importInflowSkuMap, deleteInflowSkuMapping } from '@/api/inflow'
import { searchProducts } from '@/api/zoho/products/product'

export default {
    name: 'InflowSkuMapping',
    components: { TreePanel },
    data() {
        return {
            loading: false,
            rows: [],
            total: 0,
            allTotal: 0,
            pendingTotal: 0,
            // Tree filter: all | pending | matched
            statusFilter: 'all',
            query: { page: 1, pageSize: 25, search: '' },
            // Inline SKU save state ( _id of the row being saved )
            savingRowId: null,
            // Add/Edit dialog. editRow = the row being edited (null = add);
            // the barcode is immutable in edit mode — delete + re-add to
            // change a barcode.
            editVisible: false,
            editRow: null,
            editForm: { barcode: '', sku: '', description: '' },
            editSaving: false,
            // Import dialog
            importVisible: false,
            importFileName: '',
            importRows: [],
            importSkipped: 0,
            importSaving: false
        }
    },
    computed: {
        importPendingCount() {
            return this.importRows.filter(r => !r.sku).length
        },
        treeData() {
            return [{
                id: 'all',
                label: 'All',
                count: this.allTotal,
                children: [
                    { id: 'pending', label: 'Pending', count: this.pendingTotal },
                    { id: 'matched', label: 'Matched', count: Math.max(0, this.allTotal - this.pendingTotal) }
                ]
            }]
        }
    },
    created() {
        this.load()
    },
    activated() {
        this.load()
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await getInflowSkuMap({
                    ...this.query,
                    filter: this.statusFilter === 'all' ? undefined : this.statusFilter
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                // _origSku backs the inline editor's dirty check.
                this.rows = (r.rows || []).map(row => ({ ...row, _origSku: row.sku || '' }))
                this.total = r.total || 0
                this.allTotal = r.allTotal || 0
                this.pendingTotal = r.pendingTotal || 0
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load SKU mappings'))
            } finally {
                this.loading = false
            }
        },
        reload() { this.query.page = 1; this.load() },
        onPage(p) { this.query.page = p; this.load() },
        onSize(s) { this.query.pageSize = s; this.query.page = 1; this.load() },
        onTreeClick(data) {
            if (!data || !data.id) return
            this.statusFilter = data.id
            this.reload()
        },
        nodeIcon(id) {
            return { all: 'el-icon-files', pending: 'el-icon-edit-outline', matched: 'el-icon-circle-check' }[id] || 'el-icon-document'
        },
        // ── Zoho Commerce product search (shared by the inline editor
        // and the Add/Edit dialog). Same source as the collection product
        // picker: search by name or SKU, pick a result to use its SKU.
        async fetchSkuSuggestions(query, cb) {
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
                    imgUrl: this.extractProductImage(p)
                })))
            } catch (e) {
                console.error('Product search failed:', e)
                cb([])
            }
        },
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
        // Picking a product in the inline editor maps + saves in one step.
        onRowSkuPicked(row, item) {
            if (!item || !item.sku) {
                this.$message.warning(`"${(item && item.name) || 'This product'}" has no SKU in Zoho — add one there first.`)
                row.sku = row._origSku
                return
            }
            row.sku = item.sku
            this.saveRowSku(row)
        },
        // ── Inline SKU input (type in the table, Enter or ✓ to save) ──
        rowDirty(row) {
            return String(row.sku || '').trim() !== String(row._origSku || '')
        },
        async saveRowSku(row) {
            if (!this.rowDirty(row) || this.savingRowId) return
            const sku = String(row.sku || '').trim()
            this.savingRowId = row._id
            try {
                const r = await saveInflowSkuMapping({ barcode: row.barcode, sku, description: row.description || '' })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                // Keep counts + row state in sync without a full reload so
                // staff can keep typing down the pending list.
                if (!row._origSku && sku) this.pendingTotal = Math.max(0, this.pendingTotal - 1)
                if (row._origSku && !sku) this.pendingTotal += 1
                row.sku = sku
                row._origSku = sku
                this.$message.success(sku ? 'Saved' : 'Saved as pending')
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to save SKU'))
            } finally {
                this.savingRowId = null
            }
        },
        onEditSkuPicked(item) {
            if (!item || !item.sku) {
                this.$message.warning(`"${(item && item.name) || 'This product'}" has no SKU in Zoho — add one there first.`)
                this.editForm.sku = ''
            }
        },
        // ── Add / Edit dialog ────────────────────────────────────────
        openEdit(row) {
            this.editRow = row
            this.editForm = row
                ? { barcode: row.barcode, sku: row.sku, description: row.description || '' }
                : { barcode: '', sku: '', description: '' }
            this.editVisible = true
        },
        async saveEdit() {
            const barcode = this.editForm.barcode.trim()
            const sku = this.editForm.sku.trim()
            if (!barcode) { this.$message.warning('Barcode is required.'); return }
            this.editSaving = true
            try {
                const r = await saveInflowSkuMapping({ barcode, sku, description: this.editForm.description.trim() })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(sku ? 'Mapping saved' : 'Saved as pending — fill in the SKU when known')
                this.editVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to save mapping'))
            } finally {
                this.editSaving = false
            }
        },
        remove(row) {
            this.$confirm(`Delete the mapping for barcode "${row.barcode}"?`, 'Delete mapping', {
                type: 'warning', confirmButtonText: 'Delete', cancelButtonText: 'Cancel'
            }).then(async () => {
                try {
                    const r = await deleteInflowSkuMapping(row._id)
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    this.$message.success('Mapping deleted')
                    this.load()
                } catch (e) {
                    this.$message.error(this.msg(e, 'Failed to delete mapping'))
                }
            }).catch(() => {})
        },
        // ── Excel import ─────────────────────────────────────────────
        openImport() {
            this.importVisible = true
            this.importFileName = ''
            this.importRows = []
            this.importSkipped = 0
            if (this.$refs.importFile) this.$refs.importFile.value = ''
        },
        async onImportFile(e) {
            const file = e.target.files && e.target.files[0]
            if (!file) return
            this.importFileName = file.name
            this.importRows = []
            this.importSkipped = 0
            try {
                const XLSX = await import('xlsx')
                const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
                const sheet = wb.Sheets[wb.SheetNames[0]]
                const rows = sheet ? XLSX.utils.sheet_to_json(sheet, { defval: '' }) : []
                if (!rows.length) { this.$message.warning('The file has no data rows.'); return }
                const headers = Object.keys(rows[0])
                const key = (name) => headers.find(h => String(h).trim().toLowerCase() === name)
                const barcodeKey = key('barcode')
                if (!barcodeKey) {
                    this.$message.warning('The file is missing the "Barcode" column.')
                    return
                }
                const skuKey = key('sku')
                const descKey = key('description')
                const parsed = []
                let skipped = 0
                for (const r of rows) {
                    const barcode = String(r[barcodeKey] == null ? '' : r[barcodeKey]).trim()
                    if (!barcode) { skipped++; continue }
                    parsed.push({
                        barcode,
                        // Empty SKU = pending — staff fill it in on this page later.
                        sku: skuKey ? String(r[skuKey] == null ? '' : r[skuKey]).trim() : '',
                        description: descKey ? String(r[descKey] == null ? '' : r[descKey]).trim() : ''
                    })
                }
                if (!parsed.length) { this.$message.warning('No usable rows — every row needs a Barcode.'); return }
                this.importRows = parsed
                this.importSkipped = skipped
            } catch (err) {
                this.$message.error('Could not read the Excel file.')
            }
        },
        async submitImport() {
            this.importSaving = true
            try {
                const r = await importInflowSkuMap(this.importRows)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                const bits = [`${r.mappings} mappings imported`]
                if (r.pending) bits.push(`${r.pending} pending (no SKU yet)`)
                this.$message.success(bits.join(' — '))
                this.importVisible = false
                this.reload()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to import mappings'))
            } finally {
                this.importSaving = false
            }
        },
        dateOnly(v) {
            if (!v) return '—'
            const d = new Date(v)
            return isNaN(d) ? '—' : d.toLocaleDateString('en-AU')
        },
        msg(e, fallback) { return (e.response && e.response.data && e.response.data.message) || e.message || fallback }
    }
}
</script>

<style lang="scss" scoped>
.inflow-skumap { height: 100%; }
.content-inner { padding: 12px 16px; }
.sm-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.f-search { width: 260px; }
.sm-spacer { flex: 1; }
.sm-meta { font-size: 12px; color: #909399; margin-right: 6px; white-space: nowrap; }
.sm-pending-count { color: #E6A23C; }
.sm-pager { margin-top: 10px; text-align: right; }
.sm-dim { color: #909399; }
.sm-del { color: #F56C6C; }
.sm-sku-cell { display: flex; align-items: center; gap: 6px; }
.sm-sku-cell .el-autocomplete { flex: 1; }
.sm-sku-pending ::v-deep .el-input__inner { border-color: #E6A23C; }
.sm-sku-save { color: #67C23A; padding: 0 2px; font-size: 16px; }
.sm-node { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.sm-node-icon { color: #909399; }
.sm-node-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sm-node-badge { margin-left: 4px; ::v-deep .el-badge__content { transform: none; position: static; } }
.sm-hint { font-size: 13px; color: #606266; line-height: 1.6; margin-bottom: 12px; }
.sm-edit-form ::v-deep .el-form-item__label { white-space: nowrap; }
.sm-file-input { display: none; }
.sm-file-pick { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.sm-file-name { font-size: 12px; color: #303133; }
.sm-count { font-size: 12px; color: #606266; margin-bottom: 8px; }
.sm-more { font-size: 12px; color: #909399; margin-top: 6px; }
</style>

<style>
/* Zoho product suggestion popup — unscoped because Element UI teleports
   the autocomplete dropdown outside the component root. */
/* The popper defaults to the (narrow) input's width — widen it and let
   names breathe so the full product name is readable. */
.sm-sku-suggestions { min-width: 520px !important; width: auto !important; }
.sm-sku-suggestions li { line-height: normal !important; padding: 6px 14px !important; }
.sm-sku-suggestions .sku-suggestion {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
}
.sm-sku-suggestions .sku-suggestion-img {
    width: 32px;
    height: 32px;
    object-fit: cover;
    border-radius: 4px;
    flex-shrink: 0;
    background: #f5f7fa;
}
.sm-sku-suggestions .sku-suggestion-img-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #c0c4cc;
    font-size: 14px;
}
.sm-sku-suggestions .sku-suggestion-info { min-width: 0; line-height: 1.4; }
.sm-sku-suggestions .sku-suggestion-name {
    font-weight: 500;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.sm-sku-suggestions .sku-suggestion-sku {
    color: #909399;
    font-size: 12px;
}
</style>
