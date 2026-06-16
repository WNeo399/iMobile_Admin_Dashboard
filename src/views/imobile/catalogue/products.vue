<template>
    <div class="app-container catalogue-products">
        <!-- Filter bar -->
        <div class="filter-bar">
            <el-select v-model="queryParams.brand" placeholder="All brands" clearable size="small"
                class="filter-control" @change="handleQuery">
                <el-option v-for="b in brands" :key="b._id" :value="b._id" :label="b.name" />
            </el-select>
            <el-select v-model="queryParams.category" placeholder="All categories" clearable size="small"
                class="filter-control" @change="handleQuery">
                <el-option v-for="c in categories" :key="c._id" :value="c._id" :label="c.name" />
            </el-select>
            <el-select v-model="queryParams.quality" placeholder="All qualities" clearable filterable size="small"
                class="filter-control" @change="handleQuery">
                <el-option v-for="q in qualities" :key="q._id" :value="q._id" :label="q.name" />
            </el-select>
            <el-select v-model="queryParams.model" placeholder="All models" clearable filterable size="small"
                class="filter-control" @change="handleQuery">
                <el-option v-for="m in models" :key="m._id" :value="m._id" :label="m.name" />
            </el-select>
            <el-input v-model="queryParams.search" placeholder="Search SKU or name…" clearable size="small"
                prefix-icon="el-icon-search" class="filter-search" @keyup.enter.native="handleQuery"
                @clear="handleQuery" />
            <el-button type="primary" icon="el-icon-search" size="small" @click="handleQuery">Search</el-button>
            <el-button icon="el-icon-refresh" size="small" :loading="loading" @click="getList">Refresh</el-button>
            <span class="filter-spacer" />
            <el-button type="primary" plain icon="el-icon-plus" size="small" @click="openAdd">Add Product</el-button>
        </div>

        <el-table v-loading="loading" :data="list" stripe size="small" class="products-table" row-key="_id">
            <el-table-column label="SKU" prop="sku" width="110">
                <template slot-scope="scope"><span class="mono">{{ scope.row.sku }}</span></template>
            </el-table-column>
            <el-table-column label="Product Name" prop="productName" min-width="320" show-overflow-tooltip />
            <el-table-column label="Brand" width="100">
                <template slot-scope="scope">{{ scope.row.brand && scope.row.brand.name }}</template>
            </el-table-column>
            <el-table-column label="Category" width="130">
                <template slot-scope="scope">{{ scope.row.category && scope.row.category.name }}</template>
            </el-table-column>
            <el-table-column label="Quality" width="140">
                <template slot-scope="scope">
                    <el-tag size="mini" effect="plain">{{ scope.row.quality && scope.row.quality.name }}</el-tag>
                </template>
            </el-table-column>
            <el-table-column label="Models" min-width="180">
                <template slot-scope="scope">
                    <span class="models-cell" :title="modelNames(scope.row)">{{ modelNames(scope.row) }}</span>
                </template>
            </el-table-column>
            <el-table-column label="Color" width="120">
                <template slot-scope="scope">
                    <span v-if="scope.row.color">{{ scope.row.color }}</span>
                    <span v-else class="muted">—</span>
                </template>
            </el-table-column>
            <el-table-column label="Action" width="120" align="center">
                <template slot-scope="scope">
                    <el-button size="mini" type="text" icon="el-icon-edit" @click="openEdit(scope.row)">Edit</el-button>
                    <el-dropdown trigger="click" @command="(cmd) => cmd()">
                        <el-button size="mini" type="text" icon="el-icon-more" class="more-btn" />
                        <el-dropdown-menu slot="dropdown">
                            <el-dropdown-item :command="() => confirmDelete(scope.row)" icon="el-icon-delete"
                                class="dropdown-delete">Delete</el-dropdown-item>
                        </el-dropdown-menu>
                    </el-dropdown>
                </template>
            </el-table-column>
        </el-table>

        <pagination v-show="total > 0" :total="total" :page.sync="queryParams.page" :limit.sync="queryParams.pageSize"
            @pagination="getList" />

        <!-- Create / Edit dialog -->
        <el-dialog :title="dialogTitle" :visible.sync="dialogOpen" width="640px" append-to-body
            :close-on-click-modal="false" @close="onDialogClose">
            <el-form ref="form" :model="form" :rules="rules" label-width="120px" size="small">
                <el-form-item label="SKU" prop="sku">
                    <el-input v-model="form.sku" placeholder="External SKU (unique)" />
                </el-form-item>
                <el-form-item label="Product Name" prop="productName">
                    <el-input v-model="form.productName" type="textarea" :rows="2"
                        placeholder="Full item name, verbatim" />
                </el-form-item>
                <el-form-item label="Brand" prop="brandId">
                    <el-select v-model="form.brandId" placeholder="Select a brand" filterable class="form-control">
                        <el-option v-for="b in brands" :key="b._id" :value="b._id" :label="b.name" />
                    </el-select>
                </el-form-item>
                <el-form-item label="Category" prop="categoryId">
                    <el-select v-model="form.categoryId" placeholder="Select a category" class="form-control"
                        @change="onCategoryChange">
                        <el-option v-for="c in categories" :key="c._id" :value="c._id" :label="c.name" />
                    </el-select>
                </el-form-item>
                <el-form-item label="Quality" prop="qualityId">
                    <el-select v-model="form.qualityId"
                        :placeholder="form.categoryId ? 'Select a quality' : 'Pick a category first'"
                        :disabled="!form.categoryId" filterable class="form-control">
                        <el-option v-for="q in formQualities" :key="q._id" :value="q._id" :label="q.name" />
                    </el-select>
                    <span v-if="form.categoryId && formQualities.length === 0" class="form-help">
                        No qualities defined for this category yet — add one under Reference.
                    </span>
                </el-form-item>
                <el-form-item label="Compatible Models" prop="modelIds">
                    <el-select v-model="form.modelIds" multiple filterable placeholder="Pick one or more models"
                        class="form-control">
                        <el-option v-for="m in models" :key="m._id" :value="m._id" :label="m.name" />
                    </el-select>
                </el-form-item>
                <el-form-item label="Color" prop="color">
                    <el-input v-model="form.color" placeholder="Optional — leave blank for colourless parts" />
                </el-form-item>
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
    listProducts, createProduct, updateProduct, deleteProduct,
    listBrands, listCategories, listModels, listQualities
} from '@/api/catalogue'

export default {
    name: 'CatalogueProducts',
    data() {
        return {
            loading: false,
            list: [],
            total: 0,
            queryParams: {
                page: 1, pageSize: 20,
                brand: '', category: '', quality: '', model: '', search: ''
            },
            // Reference data for dropdowns. brands/categories/models are
            // loaded once on created(); qualities is the FILTER-bar list
            // (all qualities), while formQualities is the category-scoped
            // subset used inside the dialog.
            brands: [],
            categories: [],
            models: [],
            qualities: [],
            formQualities: [],

            dialogOpen: false,
            saving: false,
            form: {
                id: '', sku: '', productName: '',
                brandId: '', categoryId: '', qualityId: '',
                modelIds: [], color: ''
            },
            rules: {
                sku: [{ required: true, message: 'SKU is required', trigger: 'blur' }],
                productName: [{ required: true, message: 'Product name is required', trigger: 'blur' }],
                brandId: [{ required: true, message: 'Pick a brand', trigger: 'change' }],
                categoryId: [{ required: true, message: 'Pick a category', trigger: 'change' }],
                qualityId: [{ required: true, message: 'Pick a quality', trigger: 'change' }],
                modelIds: [{ type: 'array', required: true, min: 1, message: 'Pick at least one model', trigger: 'change' }]
            }
        }
    },
    computed: {
        isEdit() { return !!this.form.id },
        dialogTitle() { return this.isEdit ? 'Edit Product' : 'Add Product' }
    },
    created() {
        this.loadReference()
        this.getList()
    },
    methods: {
        async loadReference() {
            try {
                const [b, c, m, q] = await Promise.all([
                    listBrands(), listCategories(), listModels(), listQualities()
                ])
                this.brands = (b && b.data) || []
                this.categories = (c && c.data) || []
                this.models = (m && m.data) || []
                this.qualities = (q && q.data) || []
            } catch (e) {
                console.error('Load catalogue reference failed:', e)
                this.$message.error('Failed to load reference data')
            }
        },
        async getList() {
            this.loading = true
            try {
                const params = { page: this.queryParams.page, pageSize: this.queryParams.pageSize }
                if (this.queryParams.brand) params.brand = this.queryParams.brand
                if (this.queryParams.category) params.category = this.queryParams.category
                if (this.queryParams.quality) params.quality = this.queryParams.quality
                if (this.queryParams.model) params.model = this.queryParams.model
                if (this.queryParams.search) params.search = this.queryParams.search
                const res = await listProducts(params)
                if (!res || res.success === false) throw new Error((res && res.message) || 'Failed to load')
                this.list = res.data || []
                this.total = res.total || 0
            } catch (e) {
                console.error('List products failed:', e)
                this.$message.error(this.errMsg(e, 'Failed to load products'))
                this.list = []
                this.total = 0
            } finally {
                this.loading = false
            }
        },
        handleQuery() {
            this.queryParams.page = 1
            this.getList()
        },
        modelNames(row) {
            return (row.compatible_models || []).map(m => m.name).join(', ')
        },
        // ── Dialog ─────────────────────────────────────────────────
        openAdd() {
            this.form = {
                id: '', sku: '', productName: '',
                brandId: this.brands.length === 1 ? this.brands[0]._id : '',
                categoryId: '', qualityId: '', modelIds: [], color: ''
            }
            this.formQualities = []
            this.dialogOpen = true
            this.$nextTick(() => this.$refs.form && this.$refs.form.clearValidate())
        },
        openEdit(row) {
            this.form = {
                id: row._id,
                sku: row.sku || '',
                productName: row.productName || '',
                brandId: (row.brand && row.brand.id) || '',
                categoryId: (row.category && row.category.id) || '',
                qualityId: (row.quality && row.quality.id) || '',
                modelIds: (row.compatible_models || []).map(m => m.id),
                color: row.color || ''
            }
            this.loadFormQualities(this.form.categoryId)
            this.dialogOpen = true
            this.$nextTick(() => this.$refs.form && this.$refs.form.clearValidate())
        },
        onDialogClose() {
            this.saving = false
        },
        // Quality is scoped to category: reload the dialog's quality list
        // whenever the category changes, and drop a now-invalid pick.
        async onCategoryChange(categoryId) {
            this.form.qualityId = ''
            await this.loadFormQualities(categoryId)
        },
        async loadFormQualities(categoryId) {
            if (!categoryId) { this.formQualities = []; return }
            try {
                const res = await listQualities({ category_id: categoryId })
                this.formQualities = (res && res.data) || []
            } catch (e) {
                console.error('Load qualities failed:', e)
                this.formQualities = []
            }
        },
        onSave() {
            this.$refs.form.validate(async valid => {
                if (!valid) return
                this.saving = true
                try {
                    const payload = {
                        sku: this.form.sku,
                        productName: this.form.productName,
                        brandId: this.form.brandId,
                        categoryId: this.form.categoryId,
                        qualityId: this.form.qualityId,
                        modelIds: this.form.modelIds,
                        color: this.form.color
                    }
                    if (this.isEdit) {
                        await updateProduct(this.form.id, payload)
                        this.$message.success('Product updated')
                    } else {
                        await createProduct(payload)
                        this.$message.success('Product added')
                    }
                    this.dialogOpen = false
                    this.getList()
                } catch (e) {
                    console.error('Save product failed:', e)
                    this.$message.error(this.errMsg(e, 'Save failed'))
                } finally {
                    this.saving = false
                }
            })
        },
        async confirmDelete(row) {
            try {
                await this.$confirm(`Delete "${row.productName}" (SKU ${row.sku})? This cannot be undone.`,
                    'Confirm delete', { confirmButtonText: 'Delete', cancelButtonText: 'Cancel', type: 'warning' })
            } catch { return }
            try {
                await deleteProduct(row._id)
                const idx = this.list.findIndex(r => String(r._id) === String(row._id))
                if (idx !== -1) this.list.splice(idx, 1)
                this.total = Math.max(0, this.total - 1)
                this.$message.success('Product deleted')
            } catch (e) {
                console.error('Delete product failed:', e)
                this.$message.error(this.errMsg(e, 'Delete failed'))
            }
        },
        errMsg(e, fallback) {
            return (e.response && e.response.data && e.response.data.message) || e.message || fallback
        }
    }
}
</script>

<style lang="scss" scoped>
.filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
}
.filter-control { width: 150px; }
.filter-search { width: 220px; max-width: 100%; }
.filter-spacer { flex: 1; }
.products-table {
    border: 1px solid #ebeef5;
    border-radius: 8px;
    overflow: hidden;
}
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.models-cell {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #606266;
    font-size: 12px;
}
.muted { color: #c0c4cc; font-style: italic; }
.more-btn { padding: 4px !important; color: #909399; &:hover { color: #409eff; } }
.form-control { width: 100%; }
.form-help { display: block; margin-top: 4px; color: #e6a23c; font-size: 12px; line-height: 1.4; }
</style>

<style>
.dropdown-delete { color: #f56c6c !important; }
.dropdown-delete:hover, .dropdown-delete:focus { background-color: #fef0f0 !important; color: #f56c6c !important; }
</style>
