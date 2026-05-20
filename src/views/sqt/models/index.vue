<template>
    <div class="app-container">
        <el-form :model="queryParams" ref="queryForm" size="small" :inline="true" v-show="showSearch">
            <el-form-item label="Search" prop="search">
                <el-input v-model="queryParams.search" placeholder="Name, code, brand" clearable style="width: 240px"
                    @keyup.enter.native="handleQuery" />
            </el-form-item>
            <el-form-item label="Brand" prop="brandId">
                <el-select v-model="queryParams.brandId" placeholder="Any brand" clearable style="width: 180px">
                    <el-option v-for="b in brands" :key="b.brandId" :label="b.brandName" :value="b.brandId" />
                </el-select>
            </el-form-item>
            <el-form-item label="Status" prop="active">
                <el-select v-model="queryParams.active" placeholder="Any" clearable style="width: 120px">
                    <el-option label="Active" :value="true" />
                    <el-option label="Inactive" :value="false" />
                </el-select>
            </el-form-item>
            <el-form-item>
                <el-button type="primary" icon="el-icon-search" size="mini" @click="handleQuery">Search</el-button>
                <el-button icon="el-icon-refresh" size="mini" @click="resetQuery">Reset</el-button>
            </el-form-item>
        </el-form>

        <el-row :gutter="10" class="mb8">
            <el-col :span="1.5">
                <el-button type="primary" plain icon="el-icon-plus" size="mini" @click="handleAdd">Add Model</el-button>
            </el-col>
            <right-toolbar :showSearch.sync="showSearch" @queryTable="getList"></right-toolbar>
        </el-row>

        <el-table v-loading="loading" :data="list">
            <el-table-column label="Brand" prop="brandName" width="140" />
            <el-table-column label="Model" min-width="220">
                <template slot-scope="scope">
                    <div>
                        <a style="color: #409EFF; cursor: pointer; font-weight: 500"
                            @click="goDetail(scope.row)">{{ scope.row.name }}</a>
                        <br />
                        <span style="color: #999; font-size: 12px">{{ scope.row.slug }}</span>
                    </div>
                </template>
            </el-table-column>
            <el-table-column label="Code" prop="code" width="120" align="center" />
            <el-table-column label="Status" width="100" align="center">
                <template slot-scope="scope">
                    <el-tag :type="scope.row.active ? 'success' : 'info'" size="mini" effect="light">
                        {{ scope.row.active ? 'Active' : 'Inactive' }}
                    </el-tag>
                </template>
            </el-table-column>
            <el-table-column label="Action" align="center" width="220" class-name="small-padding fixed-width">
                <template slot-scope="scope">
                    <el-button size="mini" type="text" icon="el-icon-view"
                        @click="goDetail(scope.row)">View Parts</el-button>
                    <el-button size="mini" type="text" icon="el-icon-edit"
                        @click="handleUpdate(scope.row)">Edit</el-button>
                    <el-button size="mini" type="text" icon="el-icon-delete"
                        @click="handleDelete(scope.row)">Delete</el-button>
                </template>
            </el-table-column>
        </el-table>

        <pagination v-show="total > 0" :total="total" :page.sync="queryParams.page" :limit.sync="queryParams.pageSize"
            @pagination="getList" />

        <el-dialog :title="title" :visible.sync="open" width="600px" append-to-body @close="resetForm">
            <el-form ref="form" :model="form" :rules="rules" label-width="100px" size="small">
                <el-form-item label="Brand" prop="brandName">
                    <el-autocomplete v-model="form.brandName" :fetch-suggestions="brandSuggestions"
                        placeholder="Samsung, Apple, Google..." style="width: 100%" />
                </el-form-item>
                <el-form-item label="Name" prop="name">
                    <el-input v-model="form.name" placeholder="Samsung S21 (G991)" />
                </el-form-item>
                <el-form-item label="Code" prop="code">
                    <el-input v-model="form.code" placeholder="G991" />
                </el-form-item>
                <el-form-item label="Slug" prop="slug">
                    <el-input v-model="form.slug" :placeholder="autoSlug" />
                </el-form-item>
                <el-form-item label="Active" prop="active">
                    <el-switch v-model="form.active" />
                </el-form-item>
            </el-form>
            <div slot="footer" class="dialog-footer">
                <el-button type="primary" :loading="submitLoading" @click="submitForm">Save</el-button>
                <el-button @click="open = false">Cancel</el-button>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import { listModels, createModel, updateModel, deleteModel, listBrands } from '@/api/sqt/models'

function emptyForm() {
    return {
        _id: null,
        name: '',
        code: '',
        slug: '',
        brandName: '',
        active: true
    }
}

function slugify(s) {
    return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export default {
    name: 'SqtModels',
    data() {
        return {
            showSearch: true,
            loading: false,
            submitLoading: false,
            list: [],
            total: 0,
            brands: [],
            queryParams: {
                page: 1,
                pageSize: 20,
                search: '',
                brandId: '',
                active: ''
            },
            open: false,
            title: '',
            form: emptyForm(),
            rules: {
                name: [{ required: true, message: 'Name is required', trigger: 'blur' }],
                brandName: [{ required: true, message: 'Brand is required', trigger: 'blur' }]
            }
        }
    },
    computed: {
        autoSlug() {
            return slugify(this.form.name) || 'auto-generated'
        }
    },
    created() {
        this.getList()
        this.loadBrands()
    },
    methods: {
        async getList() {
            this.loading = true
            try {
                const params = {
                    page: this.queryParams.page,
                    pageSize: this.queryParams.pageSize
                }
                if (this.queryParams.search) params.search = this.queryParams.search
                if (this.queryParams.brandId) params.brandId = this.queryParams.brandId
                if (this.queryParams.active !== '' && this.queryParams.active !== null) {
                    params.active = this.queryParams.active
                }

                const res = await listModels(params)
                this.list = res.data || []
                this.total = res.totalDocs || 0
            } catch (e) {
                console.error(e)
                this.$message.error('Failed to load models')
            } finally {
                this.loading = false
            }
        },
        async loadBrands() {
            try {
                const res = await listBrands()
                this.brands = res.data || []
            } catch (e) {
                // brands list is non-critical
            }
        },
        brandSuggestions(queryString, cb) {
            const q = (queryString || '').toLowerCase()
            const results = this.brands
                .filter(b => !q || b.brandName.toLowerCase().includes(q))
                .map(b => ({ value: b.brandName }))
            cb(results)
        },
        handleQuery() {
            this.queryParams.page = 1
            this.getList()
        },
        resetQuery() {
            this.queryParams = { page: 1, pageSize: 20, search: '', brandId: '', active: '' }
            this.getList()
        },
        handleAdd() {
            this.form = emptyForm()
            this.title = 'Add Model'
            this.open = true
        },
        handleUpdate(row) {
            this.form = {
                _id: row._id,
                name: row.name || '',
                code: row.code || '',
                slug: row.slug || '',
                brandName: row.brandName || '',
                active: row.active !== false
            }
            this.title = 'Edit Model'
            this.open = true
        },
        async handleDelete(row) {
            try {
                await this.$confirm(`Delete model "${row.name}"?`, 'Warning', {
                    confirmButtonText: 'Confirm',
                    cancelButtonText: 'Cancel',
                    type: 'warning'
                })
                await deleteModel(row._id)
                this.$message.success('Model deleted')
                this.getList()
                this.loadBrands()
            } catch (e) {
                if (e !== 'cancel') {
                    console.error(e)
                    const msg = (e.response && e.response.data && e.response.data.message) || 'Delete failed'
                    this.$message.error(msg)
                }
            }
        },
        goDetail(row) {
            this.$router.push({ name: 'SqtModelDetail', params: { id: row._id } })
        },
        submitForm() {
            this.$refs.form.validate(async valid => {
                if (!valid) return
                this.submitLoading = true
                try {
                    const payload = { ...this.form }
                    if (!payload.slug) payload.slug = slugify(payload.name)
                    if (this.form._id) {
                        await updateModel(this.form._id, payload)
                        this.$message.success('Model updated')
                    } else {
                        await createModel(payload)
                        this.$message.success('Model created')
                    }
                    this.open = false
                    this.getList()
                    this.loadBrands()
                } catch (e) {
                    console.error(e)
                    const msg = (e.response && e.response.data && e.response.data.message) || 'Save failed'
                    this.$message.error(msg)
                } finally {
                    this.submitLoading = false
                }
            })
        },
        resetForm() {
            this.form = emptyForm()
            this.$nextTick(() => {
                this.$refs.form && this.$refs.form.clearValidate()
            })
        }
    }
}
</script>
