<template>
    <div class="app-container catalogue-reference">
        <el-tabs v-model="activeTab" @tab-click="onTabChange">
            <!-- ── Models ──────────────────────────────────────────── -->
            <el-tab-pane label="Models" name="models">
                <div class="tab-head">
                    <el-select v-model="modelBrandFilter" placeholder="All brands" clearable size="small"
                        class="head-filter" @change="loadModels">
                        <el-option v-for="b in brands" :key="b._id" :value="b._id" :label="b.name" />
                    </el-select>
                    <span class="tab-spacer" />
                    <el-button type="primary" plain icon="el-icon-plus" size="small"
                        @click="openAdd('model')">Add Model</el-button>
                </div>
                <el-table v-loading="loading.models" :data="models" stripe size="small" class="ref-table">
                    <el-table-column label="Name" prop="name" min-width="180" />
                    <el-table-column label="Brand" min-width="100">
                        <template slot-scope="scope">{{ brandName(scope.row.brand_id) }}</template>
                    </el-table-column>
                    <el-table-column label="Series" min-width="110">
                        <template slot-scope="scope">{{ scope.row.series || '—' }}</template>
                    </el-table-column>
                    <el-table-column label="ID (slug)" min-width="160">
                        <template slot-scope="scope"><span class="mono">{{ scope.row._id }}</span></template>
                    </el-table-column>
                    <el-table-column label="Action" width="120" align="center">
                        <template slot-scope="scope">
                            <el-button size="mini" type="text" icon="el-icon-edit"
                                @click="openEdit('model', scope.row)">Edit</el-button>
                            <el-button size="mini" type="text" icon="el-icon-delete" class="row-delete"
                                @click="confirmDelete('model', scope.row)">Delete</el-button>
                        </template>
                    </el-table-column>
                </el-table>
            </el-tab-pane>

            <!-- ── Qualities ───────────────────────────────────────── -->
            <el-tab-pane label="Qualities" name="qualities">
                <div class="tab-head">
                    <el-select v-model="qualityCategoryFilter" placeholder="All categories" clearable size="small"
                        class="head-filter" @change="loadQualities">
                        <el-option v-for="c in categories" :key="c._id" :value="c._id" :label="c.name" />
                    </el-select>
                    <span class="tab-spacer" />
                    <el-button type="primary" plain icon="el-icon-plus" size="small"
                        @click="openAdd('quality')">Add Quality</el-button>
                </div>
                <el-table v-loading="loading.qualities" :data="qualities" stripe size="small" class="ref-table">
                    <el-table-column label="Name" prop="name" min-width="180" />
                    <el-table-column label="Category" min-width="140">
                        <template slot-scope="scope">{{ categoryName(scope.row.category_id) }}</template>
                    </el-table-column>
                    <el-table-column label="ID (slug)" min-width="200">
                        <template slot-scope="scope"><span class="mono">{{ scope.row._id }}</span></template>
                    </el-table-column>
                    <el-table-column label="Action" width="120" align="center">
                        <template slot-scope="scope">
                            <el-button size="mini" type="text" icon="el-icon-edit"
                                @click="openEdit('quality', scope.row)">Edit</el-button>
                            <el-button size="mini" type="text" icon="el-icon-delete" class="row-delete"
                                @click="confirmDelete('quality', scope.row)">Delete</el-button>
                        </template>
                    </el-table-column>
                </el-table>
            </el-tab-pane>

            <!-- ── Brands ──────────────────────────────────────────── -->
            <el-tab-pane label="Brands" name="brands">
                <div class="tab-head">
                    <span class="tab-spacer" />
                    <el-button type="primary" plain icon="el-icon-plus" size="small"
                        @click="openAdd('brand')">Add Brand</el-button>
                </div>
                <el-table v-loading="loading.brands" :data="brands" stripe size="small" class="ref-table">
                    <el-table-column label="Name" prop="name" min-width="200" />
                    <el-table-column label="ID (slug)" min-width="180">
                        <template slot-scope="scope"><span class="mono">{{ scope.row._id }}</span></template>
                    </el-table-column>
                    <el-table-column label="Action" width="120" align="center">
                        <template slot-scope="scope">
                            <el-button size="mini" type="text" icon="el-icon-edit"
                                @click="openEdit('brand', scope.row)">Edit</el-button>
                            <el-button size="mini" type="text" icon="el-icon-delete" class="row-delete"
                                @click="confirmDelete('brand', scope.row)">Delete</el-button>
                        </template>
                    </el-table-column>
                </el-table>
            </el-tab-pane>

            <!-- ── Categories (read-only, fixed set) ───────────────── -->
            <el-tab-pane label="Categories" name="categories">
                <el-alert type="info" :closable="false" show-icon class="cat-hint"
                    title="Categories are a fixed set and can't be edited here." />
                <el-table :data="categories" stripe size="small" class="ref-table">
                    <el-table-column label="Name" prop="name" min-width="200" />
                    <el-table-column label="ID" min-width="180">
                        <template slot-scope="scope"><span class="mono">{{ scope.row._id }}</span></template>
                    </el-table-column>
                </el-table>
            </el-tab-pane>
        </el-tabs>

        <!-- Shared add/edit dialog — fields adapt to refType -->
        <el-dialog :title="dialogTitle" :visible.sync="dialogOpen" width="460px" append-to-body
            :close-on-click-modal="false" @close="onDialogClose">
            <el-form ref="form" :model="form" :rules="dialogRules" label-width="90px" size="small">
                <el-form-item label="Name" prop="name">
                    <el-input v-model="form.name" placeholder="Display name" />
                </el-form-item>
                <el-form-item v-if="refType === 'model'" label="Brand" prop="brand_id">
                    <el-select v-model="form.brand_id" placeholder="Select a brand" filterable class="form-control"
                        :disabled="isEdit">
                        <el-option v-for="b in brands" :key="b._id" :value="b._id" :label="b.name" />
                    </el-select>
                </el-form-item>
                <el-form-item v-if="refType === 'model'" label="Series" prop="series">
                    <!-- Pick an existing series for the brand, or type a new one
                         (allow-create). Groups models in the catalogue selectors. -->
                    <el-select v-model="form.series" placeholder="Pick or type a series" filterable allow-create
                        default-first-option class="form-control">
                        <el-option v-for="s in modelSeriesOptions" :key="s" :value="s" :label="s" />
                    </el-select>
                </el-form-item>
                <el-form-item v-if="refType === 'quality'" label="Category" prop="category_id">
                    <el-select v-model="form.category_id" placeholder="Select a category" class="form-control"
                        :disabled="isEdit">
                        <el-option v-for="c in categories" :key="c._id" :value="c._id" :label="c.name" />
                    </el-select>
                </el-form-item>
                <p v-if="isEdit" class="dialog-help">
                    The ID (<span class="mono">{{ form.id }}</span>) is fixed — only the name can change.
                </p>
            </el-form>
            <div slot="footer">
                <el-button :disabled="saving" @click="dialogOpen = false">Cancel</el-button>
                <el-button type="primary" :loading="saving" @click="onSave">{{ isEdit ? 'Save' : 'Add' }}</el-button>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import {
    listBrands, createBrand, updateBrand, deleteBrand,
    listCategories,
    listModels, createModel, updateModel, deleteModel,
    listQualities, createQuality, updateQuality, deleteQuality
} from '@/api/catalogue'

export default {
    name: 'CatalogueReference',
    data() {
        return {
            activeTab: 'models',
            loading: { models: false, qualities: false, brands: false },
            brands: [],
            categories: [],
            models: [],
            qualities: [],
            modelBrandFilter: '',
            qualityCategoryFilter: '',

            // Shared dialog
            dialogOpen: false,
            saving: false,
            refType: 'model',     // 'model' | 'quality' | 'brand'
            form: { id: '', name: '', brand_id: '', category_id: '', series: '' }
        }
    },
    computed: {
        isEdit() { return !!this.form.id },
        // Distinct series already used by the selected brand's models, to seed
        // the model dialog's series picker (allow-create lets you add a new one).
        modelSeriesOptions() {
            const bid = this.form.brand_id
            const set = new Set()
            for (const m of this.models) {
                if ((!bid || m.brand_id === bid) && m.series) set.add(m.series)
            }
            return [...set].sort()
        },
        dialogTitle() {
            const label = { model: 'Model', quality: 'Quality', brand: 'Brand' }[this.refType] || ''
            return `${this.isEdit ? 'Edit' : 'Add'} ${label}`
        },
        // Build rules dynamically so the brand/category requirement only
        // applies for the relevant ref type.
        dialogRules() {
            const r = { name: [{ required: true, message: 'Name is required', trigger: 'blur' }] }
            if (this.refType === 'model') {
                r.brand_id = [{ required: true, message: 'Pick a brand', trigger: 'change' }]
                r.series = [{ required: true, message: 'Pick or enter a series', trigger: 'change' }]
            }
            if (this.refType === 'quality') {
                r.category_id = [{ required: true, message: 'Pick a category', trigger: 'change' }]
            }
            return r
        }
    },
    created() {
        // Brands + categories feed every tab's name lookups + dialog
        // dropdowns, so always load them; models/qualities load with
        // their tabs.
        this.loadBrands()
        this.loadCategories()
        this.loadModels()
        this.loadQualities()
    },
    methods: {
        // ── Loads ──────────────────────────────────────────────────
        async loadBrands() {
            this.loading.brands = true
            try {
                const res = await listBrands()
                this.brands = (res && res.data) || []
            } catch (e) { this.fail(e, 'Failed to load brands') } finally { this.loading.brands = false }
        },
        async loadCategories() {
            try {
                const res = await listCategories()
                this.categories = (res && res.data) || []
            } catch (e) { this.fail(e, 'Failed to load categories') }
        },
        async loadModels() {
            this.loading.models = true
            try {
                const params = this.modelBrandFilter ? { brand_id: this.modelBrandFilter } : {}
                const res = await listModels(params)
                this.models = (res && res.data) || []
            } catch (e) { this.fail(e, 'Failed to load models') } finally { this.loading.models = false }
        },
        async loadQualities() {
            this.loading.qualities = true
            try {
                const params = this.qualityCategoryFilter ? { category_id: this.qualityCategoryFilter } : {}
                const res = await listQualities(params)
                this.qualities = (res && res.data) || []
            } catch (e) { this.fail(e, 'Failed to load qualities') } finally { this.loading.qualities = false }
        },
        onTabChange() { /* lists are already loaded; no-op kept for future lazy-load */ },

        // ── Name lookups ───────────────────────────────────────────
        brandName(id) { const b = this.brands.find(x => x._id === id); return b ? b.name : id },
        categoryName(id) { const c = this.categories.find(x => x._id === id); return c ? c.name : id },

        // ── Dialog ─────────────────────────────────────────────────
        openAdd(type) {
            this.refType = type
            this.form = {
                id: '', name: '',
                brand_id: type === 'model' && this.brands.length === 1 ? this.brands[0]._id : '',
                category_id: '',
                series: ''
            }
            this.dialogOpen = true
            this.$nextTick(() => this.$refs.form && this.$refs.form.clearValidate())
        },
        openEdit(type, row) {
            this.refType = type
            this.form = {
                id: row._id,
                name: row.name || '',
                brand_id: row.brand_id || '',
                category_id: row.category_id || '',
                series: row.series || ''
            }
            this.dialogOpen = true
            this.$nextTick(() => this.$refs.form && this.$refs.form.clearValidate())
        },
        onDialogClose() { this.saving = false },
        onSave() {
            this.$refs.form.validate(async valid => {
                if (!valid) return
                this.saving = true
                try {
                    if (this.refType === 'model') await this.saveModel()
                    else if (this.refType === 'quality') await this.saveQuality()
                    else await this.saveBrand()
                    this.dialogOpen = false
                } catch (e) {
                    this.$message.error(this.msg(e, 'Save failed'))
                } finally {
                    this.saving = false
                }
            })
        },
        async saveModel() {
            if (this.isEdit) {
                await updateModel(this.form.id, { name: this.form.name, series: this.form.series })
                this.$message.success('Model updated')
            } else {
                await createModel({ name: this.form.name, brand_id: this.form.brand_id, series: this.form.series })
                this.$message.success('Model added')
            }
            this.loadModels()
        },
        async saveQuality() {
            if (this.isEdit) {
                await updateQuality(this.form.id, { name: this.form.name })
                this.$message.success('Quality updated')
            } else {
                await createQuality({ name: this.form.name, category_id: this.form.category_id })
                this.$message.success('Quality added')
            }
            this.loadQualities()
        },
        async saveBrand() {
            if (this.isEdit) {
                await updateBrand(this.form.id, { name: this.form.name })
                this.$message.success('Brand updated')
            } else {
                await createBrand({ name: this.form.name })
                this.$message.success('Brand added')
            }
            this.loadBrands()
        },
        // ── Delete ─────────────────────────────────────────────────
        async confirmDelete(type, row) {
            try {
                await this.$confirm(`Delete "${row.name}"?`, 'Confirm delete',
                    { confirmButtonText: 'Delete', cancelButtonText: 'Cancel', type: 'warning' })
            } catch { return }
            try {
                if (type === 'model') { await deleteModel(row._id); this.loadModels() }
                else if (type === 'quality') { await deleteQuality(row._id); this.loadQualities() }
                else { await deleteBrand(row._id); this.loadBrands() }
                this.$message.success('Deleted')
            } catch (e) {
                // Backend returns 409 with a clear message when the entry
                // is still referenced by products — surface it verbatim.
                this.$message.error(this.msg(e, 'Delete failed'))
            }
        },
        // ── Helpers ────────────────────────────────────────────────
        fail(e, fallback) { console.error(fallback, e); this.$message.error(this.msg(e, fallback)) },
        msg(e, fallback) {
            return (e.response && e.response.data && e.response.data.message) || e.message || fallback
        }
    }
}
</script>

<style lang="scss" scoped>
.tab-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
}
.head-filter { width: 180px; }
.tab-spacer { flex: 1; }
.ref-table {
    border: 1px solid #ebeef5;
    border-radius: 8px;
    overflow: hidden;
}
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; color: #606266; }
.row-delete { color: #f56c6c; &:hover { color: #c45656; } }
.cat-hint { margin-bottom: 10px; }
.form-control { width: 100%; }
.dialog-help { margin: 4px 0 0; color: #909399; font-size: 12px; }
</style>
