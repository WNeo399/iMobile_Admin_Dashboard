<template>
    <!-- iMobile → Screen Buyback (user ask 2026-10-13): the ABCD grade price
         list — what we pay back for a returned screen, per model and
         condition grade. Search, add / edit / delete, reorder inside a
         brand, and download the workbook (Phones / Price / Buyback sheets,
         dropdowns and lookups included) that the team used to keep by hand. -->
    <div class="sb-page app-container">
        <div class="sb-bar">
            <div class="sb-head">
                <div class="sb-title">{{ $tt('Screen Buyback') }}</div>
                <div class="sb-sub">{{ $tp('What we pay back for a returned screen, by model and condition grade') }}<template v-if="canManage"> · {{ $tp('Click a price to change it') }}</template></div>
            </div>
            <span class="sb-spacer" />
            <el-input v-model="q" size="small" clearable class="sb-search" prefix-icon="el-icon-search" :placeholder="$tp('Search model')" />
            <el-select v-model="brand" size="small" clearable filterable :placeholder="$tp('All brands')" class="sb-sel">
                <el-option v-for="b in brands" :key="b" :label="`${b} (${countOf(b)})`" :value="b" />
            </el-select>
            <el-button v-if="canManage" size="small" icon="el-icon-rank" :disabled="reorder" @click="startReorder">{{ $tp('Reorder') }}</el-button>
            <el-button v-hasPermi="['buyback:price:manage']" size="small" type="primary" icon="el-icon-plus" :disabled="reorder" @click="openAdd">{{ $tp('Add Model') }}</el-button>
            <el-button size="small" icon="el-icon-download" :loading="exporting" @click="download">{{ $tp('Download Excel') }}</el-button>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load" />
        </div>

        <!-- reorder mode (user ask 2026-10-13): one brand's rows, dragged by
             the handle into the wanted order — the workbook's dropdown
             order — then saved in one go -->
        <div v-if="reorder" class="sb-reorder-bar">
            <i class="el-icon-rank" />
            <span>{{ $tp('Drag the rows to set the order of {brand} — the dropdown order in the workbook', { brand }) }}</span>
            <el-tag size="mini" :type="movedCount ? 'warning' : 'info'" effect="plain">{{ movedCount ? $tp('{n} moved', { n: movedCount }) : $tp('Nothing moved yet') }}</el-tag>
            <span class="sb-spacer" />
            <el-button size="mini" @click="cancelReorder">{{ $tp('Cancel') }}</el-button>
            <el-button size="mini" type="primary" :loading="orderSaving" :disabled="!movedCount" @click="saveOrder">{{ $tp('Save order') }}</el-button>
        </div>
        <el-table v-loading="loading" :data="reorder ? draft : shown" border size="mini" row-key="id" :key="reorder ? 'reorder' : 'list'"
            :empty-text="rows.length ? $tp('Nothing matches') : $tp('No models yet')" :row-class-name="rowClass">
            <el-table-column v-if="reorder" width="44" align="center">
                <template slot-scope="s"><i class="el-icon-rank sb-drag" :title="$tp('Drag')" :data-id="s.row.id" /></template>
            </el-table-column>
            <el-table-column :label="$tp('Brand')" width="140">
                <template slot-scope="s"><span class="sb-brand">{{ s.row.brand }}</span></template>
            </el-table-column>
            <el-table-column :label="$tp('Model')" min-width="220">
                <template slot-scope="s"><b>{{ s.row.model }}</b></template>
            </el-table-column>
            <!-- a price edits in place: click, type, Enter / click away saves,
                 Esc cancels, Tab moves to the next grade -->
            <el-table-column v-for="g in GRADES" :key="g" :label="$tp(g + ' Grade')" width="104" align="right">
                <template slot-scope="s">
                    <el-input v-if="edit.id === s.row.id && edit.g === g" :ref="'cell-' + s.row.id + g" v-model="edit.value" size="mini" class="sb-cell-input"
                        placeholder="—" @keyup.enter.native="commitEdit" @keyup.esc.native="cancelEdit" @keydown.tab.native.prevent="tabEdit(s.row, g)" @blur="commitEdit" />
                    <span v-else :class="['sb-price', { 'sb-dim': s.row.prices[g] == null, 'sb-editable': canManage, 'sb-saving': saving === s.row.id + g }]"
                        @click="startEdit(s.row, g)">
                        <i v-if="saving === s.row.id + g" class="el-icon-loading" />{{ money(s.row.prices[g]) }}
                    </span>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Note')" min-width="160" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.note || '—' }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Updated')" width="150">
                <template slot-scope="s"><span class="sb-dim">{{ fmt(s.row.updatedAt) }}<template v-if="s.row.updatedBy"> · {{ s.row.updatedBy }}</template></span></template>
            </el-table-column>
            <el-table-column v-if="canManage && !reorder" :label="$tp('Actions')" width="150" align="center">
                <template slot-scope="s">
                    <el-button type="text" size="mini" icon="el-icon-edit" @click="openEdit(s.row)">{{ $tp('Edit') }}</el-button>
                    <el-button type="text" size="mini" icon="el-icon-delete" class="sb-danger" @click="remove(s.row)">{{ $tp('Delete') }}</el-button>
                </template>
            </el-table-column>
        </el-table>
        <div class="sb-foot">{{ $tp('{n} models', { n: shown.length }) }}<template v-if="shown.length !== rows.length"> / {{ rows.length }}</template></div>

        <!-- add / edit -->
        <el-dialog :title="form.id ? $tp('Edit model') : $tp('New model')" :visible.sync="dialogVisible" width="520px" top="8vh" :close-on-click-modal="false">
            <el-form ref="form" :model="form" :rules="rules" label-position="top" size="small" @submit.native.prevent>
                <el-form-item :label="$tp('Brand')" prop="brand">
                    <el-select v-model="form.brand" filterable allow-create default-first-option :placeholder="$tp('Pick an existing brand or type a new one')" style="width:100%">
                        <el-option v-for="b in brands" :key="b" :label="b" :value="b" />
                    </el-select>
                    <div class="sb-hint">{{ $tp('Letters, digits and _ only — the brand names the Excel dropdown') }}</div>
                </el-form-item>
                <el-form-item :label="$tp('Model')" prop="model">
                    <el-input v-model="form.model" maxlength="60" />
                </el-form-item>
                <div class="sb-grades">
                    <el-form-item v-for="g in GRADES" :key="g" :label="$tp(g + ' Grade')" :prop="'prices.' + g">
                        <el-input v-model="form.prices[g]" placeholder="—"><template slot="prepend">$</template></el-input>
                    </el-form-item>
                </div>
                <div class="sb-hint">{{ $tp('Leave a grade blank when it does not apply (iPads: A and B only)') }}</div>
                <el-form-item :label="$tp('Note')" prop="note">
                    <el-input v-model="form.note" maxlength="200" />
                </el-form-item>
            </el-form>
            <span slot="footer">
                <el-button size="small" @click="dialogVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button size="small" type="primary" :loading="saving" @click="save">{{ $tp('Save') }}</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import { saveAs } from 'file-saver'
import Sortable from 'sortablejs'
import { listScreenBuyback, createScreenBuyback, updateScreenBuyback, saveScreenBuybackOrder, deleteScreenBuyback, exportScreenBuyback } from '@/api/screenBuyback'
import { hasPermission } from '@/utils/permission'

const GRADES = ['A', 'B', 'C', 'D']
const BRAND_RE = /^[A-Za-z_][A-Za-z0-9_]{0,30}$/
const blank = () => ({ id: '', brand: '', model: '', prices: { A: '', B: '', C: '', D: '' }, note: '' })

export default {
    name: 'ImobileScreenBuyback',
    data() {
        const priceRule = { validator: (r, v, cb) => (v === '' || v == null || (Number.isFinite(Number(v)) && Number(v) >= 0)) ? cb() : cb(new Error(this.$tp('A price must be a number'))), trigger: 'blur' }
        return {
            GRADES,
            loading: false, exporting: false,
            // reorder mode: the brand's rows as dragged (draft), their
            // order when it started (original), the save in flight
            reorder: false, draft: [], original: [], orderSaving: false,
            // the dialog's save, or the id+grade of the cell being saved
            saving: false,
            // the cell being edited in place: { id, g, value }
            edit: { id: '', g: '', value: '' },
            rows: [], brands: [],
            q: '', brand: '',
            dialogVisible: false,
            form: blank(),
            rules: {
                brand: [{ required: true, message: this.$tp('Brand is required'), trigger: 'change' },
                    { validator: (r, v, cb) => BRAND_RE.test(String(v || '')) ? cb() : cb(new Error(this.$tp('Letters, digits and _ only — the brand names the Excel dropdown'))), trigger: 'change' }],
                model: [{ required: true, message: this.$tp('Model is required'), trigger: 'blur' }],
                'prices.A': [priceRule], 'prices.B': [priceRule], 'prices.C': [priceRule], 'prices.D': [priceRule]
            }
        }
    },
    computed: {
        canManage() { return hasPermission(this.$store.getters.permissions, 'buyback:price:manage') },
        movedCount() {
            return this.draft.reduce((n, r, i) => n + (this.original[i] !== r.id ? 1 : 0), 0)
        },
        shown() {
            const q = this.q.trim().toLowerCase()
            return this.rows.filter(r => (!this.brand || r.brand === this.brand) && (!q || r.model.toLowerCase().includes(q) || r.brand.toLowerCase().includes(q)))
        }
    },
    created() { this.load() },
    beforeDestroy() { this.destroySortable() },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await listScreenBuyback()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.rows || []
                this.brands = r.brands || []
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load the price list')))
            } finally { this.loading = false }
        },
        countOf(b) { return this.rows.filter(r => r.brand === b).length },
        money(v) { return v == null ? '—' : '$' + (Number.isInteger(v) ? v : Number(v).toFixed(2)) },
        fmt(d) { const x = new Date(d); return isNaN(x) ? '' : x.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) },
        // a brand's first row gets a top border, so the groups read
        rowClass({ row, rowIndex }) { const list = this.reorder ? this.draft : this.shown; return rowIndex > 0 && list[rowIndex - 1].brand !== row.brand ? 'sb-first' : '' },
        // ── a price edited in the table ──
        startEdit(row, g) {
            if (!this.canManage || this.saving || this.reorder) return
            if (this.edit.id && (this.edit.id !== row.id || this.edit.g !== g)) this.commitEdit()
            this.edit = { id: row.id, g, value: row.prices[g] == null ? '' : String(row.prices[g]) }
            this.$nextTick(() => {
                const r = this.$refs['cell-' + row.id + g]
                const input = Array.isArray(r) ? r[0] : r
                if (input && input.focus) { input.focus(); if (input.select) input.select() }
            })
        },
        cancelEdit() { this.edit = { id: '', g: '', value: '' } },
        async commitEdit() {
            const { id, g, value } = this.edit
            if (!id) return
            const row = this.rows.find(x => x.id === id)
            this.edit = { id: '', g: '', value: '' }
            if (!row) return
            const v = String(value).trim()
            const next = v === '' ? null : Number(v)
            if (next !== null && (!Number.isFinite(next) || next < 0)) { this.$message.warning(this.$tp('A price must be a number')); return }
            if (next === (row.prices[g] == null ? null : row.prices[g])) return
            this.saving = id + g
            try {
                const r = await updateScreenBuyback(id, { brand: row.brand, model: row.model, note: row.note || '', prices: { ...row.prices, [g]: next } })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                // the row in place — no reload, so the scroll position stays
                Object.assign(row, { prices: r.row.prices, updatedAt: r.row.updatedAt, updatedBy: r.row.updatedBy })
                this.$message({ message: this.$tp('Price saved'), type: 'success', duration: 1200 })
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save')))
            } finally { this.saving = false }
        },
        // Tab: save this grade and open the next one on the same row
        tabEdit(row, g) {
            const i = GRADES.indexOf(g)
            const nextG = GRADES[i + 1]
            this.commitEdit().then(() => { if (nextG) this.startEdit(row, nextG) })
        },
        openAdd() { this.form = blank(); if (this.brand) this.form.brand = this.brand; this.dialogVisible = true; this.$nextTick(() => this.$refs.form && this.$refs.form.clearValidate()) },
        openEdit(row) {
            this.form = { id: row.id, brand: row.brand, model: row.model, note: row.note || '', prices: Object.fromEntries(GRADES.map(g => [g, row.prices[g] == null ? '' : String(row.prices[g])])) }
            this.dialogVisible = true
            this.$nextTick(() => this.$refs.form && this.$refs.form.clearValidate())
        },
        async save() {
            try { await this.$refs.form.validate() } catch (e) { return }
            this.saving = true
            try {
                const payload = { brand: this.form.brand.trim(), model: this.form.model.trim(), note: this.form.note.trim(),
                    prices: Object.fromEntries(GRADES.map(g => [g, this.form.prices[g] === '' ? null : Number(this.form.prices[g])])) }
                const r = this.form.id ? await updateScreenBuyback(this.form.id, payload) : await createScreenBuyback(payload)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('Model saved'))
                this.dialogVisible = false
                await this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save')))
            } finally { this.saving = false }
        },
        // ── reorder by drag and drop, saved in one go ──
        startReorder() {
            if (!this.brand) { this.$message.warning(this.$tp('Pick a brand first')); return }
            this.cancelEdit()
            this.q = ''
            this.draft = this.rows.filter(r => r.brand === this.brand).map(r => ({ ...r }))
            this.original = this.draft.map(r => r.id)
            this.reorder = true
            this.$nextTick(this.initSortable)
        },
        initSortable() {
            const tbody = this.$el.querySelector('.el-table__body-wrapper tbody')
            if (!tbody) return
            this.destroySortable()
            this.sortable = Sortable.create(tbody, {
                handle: '.sb-drag',
                animation: 150,
                // mouse / touch events rather than native HTML5 drag: the same
                // feel on every device, and the ghost row follows the pointer
                forceFallback: true,
                fallbackTolerance: 3,
                ghostClass: 'sb-ghost',
                onEnd: ({ oldIndex, newIndex }) => {
                    if (oldIndex === newIndex || oldIndex == null || newIndex == null) return
                    const moved = this.draft.splice(oldIndex, 1)[0]
                    this.draft.splice(newIndex, 0, moved)
                }
            })
        },
        destroySortable() {
            if (this.sortable) { this.sortable.destroy(); this.sortable = null }
        },
        cancelReorder() {
            this.destroySortable()
            this.reorder = false
            this.draft = []
            this.original = []
        },
        async saveOrder() {
            this.orderSaving = true
            try {
                const r = await saveScreenBuybackOrder(this.brand, this.draft.map(x => x.id))
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('Order saved'))
                this.cancelReorder()
                await this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save the order')))
            } finally { this.orderSaving = false }
        },
        remove(row) {
            this.$confirm(this.$tp('Delete "{model}"? It leaves the list and the workbook', { model: row.model }), this.$tp('Delete'), {
                type: 'warning', confirmButtonText: this.$tp('Delete'), cancelButtonText: this.$tp('Cancel')
            }).then(async () => {
                try {
                    const r = await deleteScreenBuyback(row.id)
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    this.$message.success(this.$tp('Model deleted'))
                    await this.load()
                } catch (e) {
                    this.$message.error(this.msg(e, this.$tp('Failed to delete')))
                }
            }).catch(() => {})
        },
        async download() {
            this.exporting = true
            try {
                const data = await exportScreenBuyback()
                const blob = data instanceof Blob ? data : new Blob([data])
                if (blob.type && blob.type.includes('json')) throw new Error(JSON.parse(await blob.text()).message || 'Failed')
                saveAs(blob, `ABCD grade price list ${new Date().toISOString().slice(0, 10)}.xlsx`)
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to build the workbook')))
            } finally { this.exporting = false }
        },
        msg(e, fallback) { return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback }
    }
}
</script>

<style lang="scss" scoped>
.sb-page { padding: 14px 16px; }
.sb-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.sb-head { min-width: 0; }
.sb-title { font-size: 17px; font-weight: 600; color: #303133; }
.sb-sub { font-size: 13px; color: #909399; margin-top: 3px; }
.sb-spacer { flex: 1; }
.sb-search { width: 220px; }
.sb-sel { width: 190px; }
.sb-brand { color: #606266; }
.sb-dim { color: #c0c4cc; }
/* the whole cell is the click target */
.sb-price { display: block; min-width: 40px; }
.sb-editable { cursor: pointer; border-bottom: 1px dashed #c0c4cc; padding-bottom: 1px; }
.sb-editable:hover { color: #409eff; border-bottom-color: #409eff; }
.sb-saving { color: #909399; }
.sb-cell-input ::v-deep .el-input__inner { text-align: right; padding: 0 6px; height: 24px; line-height: 24px; }
.sb-danger { color: #f56c6c; }
.sb-foot { margin-top: 8px; font-size: 12px; color: #909399; text-align: right; }
.sb-reorder-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 12px; margin-bottom: 8px; border: 1px solid #f5dab1; border-radius: 4px; background: #fdf6ec; font-size: 13px; color: #606266; }
.sb-drag { cursor: grab; color: #909399; font-size: 16px; }
.sb-drag:active { cursor: grabbing; }
::v-deep .el-table .sb-ghost td { background: #ecf5ff; }
.sb-grades { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0 10px; }
.sb-hint { font-size: 12px; color: #909399; line-height: 1.4; margin: 2px 0 8px; }
::v-deep .el-table .sb-first td { border-top: 2px solid #dcdfe6; }
@media (max-width: 760px) {
    .sb-search, .sb-sel { width: 100%; }
    .sb-grades { grid-template-columns: repeat(2, 1fr); }
}
</style>
