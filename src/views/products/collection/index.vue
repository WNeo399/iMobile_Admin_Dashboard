<template>
    <div class="app-container">
        <el-form :model="queryParams" ref="queryForm" size="small" :inline="true" v-show="showSearch">
            <el-form-item label="Title" prop="title">
                <el-input v-model="queryParams.title" placeholder="Search by title" clearable style="width: 240px" />
            </el-form-item>
            <el-form-item label="Status" prop="status">
                <el-select v-model="queryParams.status" placeholder="Select a status">
                    <el-option label="Active" value="Active"></el-option>
                    <el-option label="Inactive" value="Inactive"></el-option>
                    <el-option label="Draft" value="Draft"></el-option>

                </el-select>
            </el-form-item>
            <el-form-item>
                <el-button type="primary" icon="el-icon-search" size="mini" @click="handleQuery">Search</el-button>
                <el-button icon="el-icon-refresh" size="mini" @click="resetQuery">Reset</el-button>
            </el-form-item>
        </el-form>

        <el-row :gutter="10" class="mb8">
            <el-col :span="1.5">
                <el-button type="primary" plain icon="el-icon-plus" size="mini" @click="handleAdd">Create
                    New</el-button>
            </el-col>
            <el-col :span="1.5">
                <el-button type="success" plain icon="el-icon-edit" size="mini"
                    @click="showCollectionGroupDialog = true">Manage Collection</el-button>
            </el-col>
            <!-- <el-col :span="1.5">
                <el-button type="warning" plain icon="el-icon-download" size="mini"
                    @click="handleExport">Export</el-button>
            </el-col> -->
            <right-toolbar :showSearch.sync="showSearch" @queryTable="getList"></right-toolbar>
        </el-row>

        <el-table v-loading="loading" :data="list">
            <el-table-column label="Title" prop="title" width="" align="center">
                <template slot-scope="scope">
                    <div>
                        <span>{{ scope.row.title }}</span> <br/>
                        <span style="color: #ccc">{{ scope.row.note }}</span>
                    </div>
                </template>
            </el-table-column>
            <el-table-column label="Type" prop="type" width="" align="center"></el-table-column>
            <el-table-column label="Status" prop="status" align="center">
                <template #default="{ row }">
                    <el-tag :type="getStatusType(row.status)" effect="light">
                        {{ row.status }}
                    </el-tag>
                </template>
            </el-table-column>
            <el-table-column label="Action" align="center" class-name="small-padding fixed-width">
                <template slot-scope="scope" v-if="scope.row.roleId !== 1">
                    <el-button size="mini" type="text" icon="el-icon-edit"
                        @click="handleUpdate(scope.row)">修改</el-button>
                    <el-button size="mini" type="text" icon="el-icon-delete"
                        @click="handleDelete(scope.row)">删除</el-button>
                </template>
            </el-table-column>
        </el-table>
        <pagination v-show="total > 0" :total="total" :page.sync="queryParams.pageNum"
            :limit.sync="queryParams.pageSize" @pagination="handlePagination" prev-text="Prev" next-text="Next" />


        <el-dialog :title="title" :visible.sync="open" width="720px" append-to-body>
            <el-form ref="form" :model="form" :rules="rules" label-width="100px">
                <el-form-item label="Title" prop="title">
                    <el-input v-model="form.title" placeholder="Please Enter Title" />
                </el-form-item>
                <el-form-item label="Note" prop="note">
                    <el-input v-model="form.note" type="textarea" placeholder="Please Leave a Note" />
                </el-form-item>
                <el-form-item prop="type" label="Type">
                    <el-radio-group v-model="form.type">
                        <el-radio v-for="type in types" :key="type" :label="type">{{
                            type }}</el-radio>
                    </el-radio-group>
                </el-form-item>
                <el-form-item label="Status" prop="status">
                    <el-select v-model="form.status" placeholder="Select a status">
                        <el-option label="Active" value="Active"></el-option>
                        <el-option label="Inactive" value="Inactive"></el-option>
                        <el-option label="Draft" value="Draft" selected></el-option>
                    </el-select>
                </el-form-item>
                <!--
                    Selection-type collections: user picks specific products
                    from Zoho Commerce. Each pick is translated via SKU into a
                    real Zoho Inventory item_id (Commerce id ≠ Inventory id) so
                    downstream stock/sales lookups work.
                -->
                <el-form-item
                    v-if="form.type == 'Selection'"
                    label="Products"
                    prop="products"
                    :required="form.type == 'Selection'"
                >
                    <el-autocomplete
                        v-model="productSearchKeyword"
                        :fetch-suggestions="fetchProductSuggestions"
                        :debounce="400"
                        :disabled="productLookupLoading"
                        placeholder="Search Zoho products by name or SKU..."
                        style="width: 100%"
                        value-key="name"
                        :trigger-on-focus="false"
                        clearable
                        prefix-icon="el-icon-search"
                        popper-class="collection-product-suggestions"
                        @select="onProductSelected"
                    >
                        <template slot-scope="{ item }">
                            <div class="product-suggestion">
                                <img
                                    v-if="item.imgUrl"
                                    :src="item.imgUrl"
                                    class="product-suggestion-img"
                                    @error="onSuggestionImgError($event)"
                                />
                                <div v-else class="product-suggestion-img product-suggestion-img-placeholder">
                                    <i class="el-icon-picture-outline" />
                                </div>
                                <div class="product-suggestion-info">
                                    <div class="product-suggestion-name">{{ item.name }}</div>
                                    <div class="product-suggestion-meta">
                                        <span v-if="item.sku">SKU: {{ item.sku }}</span>
                                    </div>
                                </div>
                            </div>
                        </template>
                    </el-autocomplete>

                    <div class="selected-products-wrap">
                        <div v-if="!form.products || form.products.length === 0" class="selected-empty">
                            No products yet — use the search above to add some.
                        </div>
                        <ul v-else class="selected-products">
                            <li v-for="(p, idx) in form.products" :key="p.itemId" class="selected-product">
                                <img
                                    v-if="p.imageUrl"
                                    :src="p.imageUrl"
                                    class="selected-product-img"
                                    @error="onSuggestionImgError($event)"
                                />
                                <div v-else class="selected-product-img selected-product-img-placeholder">
                                    <i class="el-icon-picture-outline" />
                                </div>
                                <div class="selected-product-info">
                                    <div class="selected-product-name">{{ p.name || '(unnamed)' }}</div>
                                    <div class="selected-product-meta">
                                        <span v-if="p.sku">SKU: {{ p.sku }}</span>
                                        <span class="selected-product-id">· item {{ p.itemId }}</span>
                                    </div>
                                </div>
                                <el-button
                                    size="mini"
                                    type="text"
                                    icon="el-icon-delete"
                                    @click="removeSelectedProduct(idx)"
                                />
                            </li>
                        </ul>
                    </div>
                </el-form-item>

                <el-form-item label="Criteria" prop="criteria" :required="form.type == 'Criteria'"
                    v-if="form.type == 'Criteria'">
                    <el-input v-model="form.criteria" type="textarea" :rows="2" placeholder="Please Enter Criteria" />
                </el-form-item>

            </el-form>
            <div slot="footer" class="dialog-footer">
                <el-button type="primary" :disable="submitLoading" @click="submitForm">{{ submitLoading ? 'Submiting...'
                    :
                    "Submit" }}</el-button>
                <el-button @click="cancel">Cancel</el-button>
            </div>
        </el-dialog>
        <CollectionGroupDialog :visible.sync="showCollectionGroupDialog"></CollectionGroupDialog>
    </div>
</template>

<script>
import CollectionGroupDialog from "./CollectionGroup/collectionGroup.vue"
import { createCollection, getCollectionList, deleteCollection, updateCollection } from "../../../api/zoho/products/collection";
import { searchProducts, lookupProductBySku } from "@/api/zoho/products/product";
export default {
    components: {
        CollectionGroupDialog
    },
    data() {
        const validateCriteria = (rule, value, callback) => {
            if (this.form.type === 'Criteria' && !value) {
                callback(new Error('Criteria can not be empty'))
            } else {
                callback()
            }
        }
        // Selection collections must have at least one picked product —
        // otherwise saving a "Selection" with empty products would create a
        // silently-broken collection.
        const validateProducts = (rule, value, callback) => {
            if (this.form.type === 'Selection' && (!Array.isArray(value) || value.length === 0)) {
                callback(new Error('Please add at least one product'))
            } else {
                callback()
            }
        }
        return {
            submitLoading: false,
            showSearch: true,
            loading: false,
            showCollectionGroupDialog: false,
            list: [],
            total: 10,
            queryParams: {
                pageNum: 1,
                pageSize: 20,
                title: undefined,
                status: undefined
            },
            title: "",
            open: false,
            types: ["Selection", "Criteria"],
            form: {
                id: "",
                title: "",
                type: "",
                status: "Draft",
                note: "",
                criteria: "",
                // Each entry: { itemId, sku, name, imageUrl }. `itemId` is the
                // Zoho Inventory product id (resolved via skuLookup).
                products: []
            },
            // Selection product picker state
            productSearchKeyword: "",
            productLookupLoading: false,
            rules: {
                title: [
                    { required: true, message: "Title can not be empty", trigger: "blur" }
                ],
                type: [
                    { required: true, message: "Type can not be empty", trigger: "blur" }
                ],
                status: [
                    { required: true, message: "Status can not be empty", trigger: "blur" }
                ],
                criteria: [
                    {
                        validator: validateCriteria,
                        trigger: "blur"
                    }
                ],
                products: [
                    {
                        validator: validateProducts,
                        trigger: "change"
                    }
                ]
            }
        }
    },
    created() {
        this.getList()
    },
    methods: {
        async getList() {
            this.loading = true

            try {
                const query = {
                    page: this.queryParams.pageNum,
                    pageSize: this.queryParams.pageSize
                }

                if (this.queryParams.title) {
                    query.title = this.queryParams.title
                }

                if (
                    this.queryParams.status &&
                    this.queryParams.status.length
                ) {
                    query.status = this.queryParams.status
                }

                const res = await getCollectionList(query)

                this.list = res.data || []
                this.total = res.totalDocs || 0
            } catch (error) {
                console.error(error)
                this.$message.error('Failed to load collections')
            } finally {
                this.loading = false
            }
        },

        handleQuery() {
            this.queryParams.pageNum = 1
            this.getList()
        },

        resetQuery() {
            this.queryParams = {
                pageNum: 1,
                pageSize: 10,
                title: undefined,
                status: undefined
            }

            this.getList()
        },

        handleSizeChange(size) {
            this.queryParams.pageSize = size
            this.getList()
        },

        handleCurrentChange(page) {
            this.queryParams.pageNum = page
            this.getList()
        },
        handleExport() { },
        handleAdd() {
            this.form = {
                id: "",
                title: "",
                type: "",
                note: "",
                status: "Draft",
                criteria: " ",
                products: []
            }
            this.productSearchKeyword = ""
            this.open = true
            this.title = "Add Collection"
        },
        handleUpdate(row) {
            this.form = {
                id: row._id,
                title: row.title,
                type: row.type,
                note: row.note,
                status: row.status,
                criteria: row.type == "Criteria" && row.rules && row.rules[0] && row.rules[0].criteria
                    ? row.rules[0].criteria.equals
                    : "",
                // Hydrate from the stored array. Each entry already has the
                // display metadata we need; no extra round-trip required.
                products: Array.isArray(row.products) ? row.products.map(p => ({ ...p })) : []
            }
            this.productSearchKeyword = ""
            this.title = "Edit Collection"
            this.open = true
        },
        async handleDelete(row) {
            const that = this
            try {
                await this.$confirm(
                    `Are you sure you want to delete "${row.title}"?`,
                    'Warning',
                    {
                        confirmButtonText: 'Confirm',
                        cancelButtonText: 'Cancel',
                        type: 'warning'
                    }
                )

                that.loading = true
                await deleteCollection({
                    id: row._id
                })

                this.$message.success('Deleted successfully')
                that.loading = false
                this.getList()
            } catch (error) {
                // cancel confirm will also enter catch
                if (error !== 'cancel') {
                    console.error(error)
                    this.$message.error('Delete failed')
                }
            }
        },
        handlePagination() {
             this.getList()
         },
        submitForm() {
            this.$refs.form.validate(async valid => {
                if (!valid) return

                this.submitLoading = true

                try {
                    const payload = {
                        title: this.form.title,
                        type: this.form.type,
                        note: this.form.note,
                        status: this.form.status
                    }

                    if (this.form.type === 'Criteria') {
                        payload.rules = [{ criteria: { equals: this.form.criteria } }]
                    }

                    if (this.form.type === 'Selection') {
                        // Backend stores the full snapshot; itemId is the
                        // canonical Zoho Inventory product id.
                        payload.products = (this.form.products || []).map(p => ({
                            itemId: p.itemId,
                            sku: p.sku || '',
                            name: p.name || '',
                            imageUrl: p.imageUrl || ''
                        }))
                    }
                    if (this.form.id) {
                        await updateCollection(this.form.id, payload)
                        this.$message.success('Collection updated successfully')

                    } else {
                        await createCollection(payload)

                        this.$message.success('Collection created successfully')

                    }


                    this.open = false
                    this.resetForm()

                    // refresh list if you have this method
                    this.getList && this.getList()
                } catch (error) {
                    console.error(error)
                    this.$message.error('Failed to create collection')
                } finally {
                    this.submitLoading = false
                }
            })
        },

        resetForm() {
            this.form = {
                id: "",
                title: '',
                type: '',
                note: "",
                status: 'Draft',
                criteria: '',
                products: []
            }
            this.productSearchKeyword = ""
            this.title = ""
            this.$nextTick(() => {
                this.$refs.form && this.$refs.form.clearValidate()
            })
        },
        cancel() {
            this.open = false
            this.form = {
                id: "",
                title: "",
                type: "",
                status: "Draft",
                note: "",
                criteria: "",
                products: []
            }
            this.productSearchKeyword = ""
        },

        // ── Selection product picker ────────────────────────────────────
        // Reuses the Send Parts picker endpoints. Commerce search gives us
        // the list to choose from; SKU lookup translates that pick into the
        // real Zoho Inventory item_id we ultimately save.

        async fetchProductSuggestions(query, cb) {
            const q = (query || '').trim()
            if (!q) { cb([]); return }
            try {
                const res = await searchProducts(q)
                if (!res || !res.success) { cb([]); return }
                const products = Array.isArray(res.data) ? res.data : []
                const suggestions = products.map(p => ({
                    ...p,
                    name: p.name || p.product_name || p.title || '',
                    sku: p.sku
                        || (Array.isArray(p.skus) && p.skus[0] && p.skus[0].sku)
                        || (p.variants && p.variants[0] && p.variants[0].sku)
                        || '',
                    product_id: p.product_id || p.id || '',
                    imgUrl: this.extractProductImage(p)
                }))
                cb(suggestions)
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
        async onProductSelected(item) {
            if (!item) return
            // SKU is required — Commerce product_id ≠ Inventory item_id, so we
            // translate via SKU to get the real id we ultimately save.
            if (!item.sku) {
                this.$message.error(
                    `"${item.name || 'This product'}" has no SKU — add one in Zoho before selecting.`
                )
                this.productSearchKeyword = ""
                return
            }
            // Dedupe by SKU before the round-trip; final dedupe by itemId below.
            if ((this.form.products || []).some(p => p.sku === item.sku)) {
                this.$message.info(`"${item.name}" is already in this collection`)
                this.productSearchKeyword = ""
                return
            }
            this.productLookupLoading = true
            try {
                const res = await lookupProductBySku(item.sku)
                if (!res || !res.success || !res.data || !res.data.itemId) {
                    throw new Error('No inventory item returned for this SKU')
                }
                const itemId = String(res.data.itemId)
                if ((this.form.products || []).some(p => p.itemId === itemId)) {
                    this.$message.info(`"${item.name}" is already in this collection`)
                    return
                }
                this.form.products.push({
                    itemId,
                    sku: item.sku,
                    name: item.name,
                    imageUrl: item.imgUrl || ''
                })
                // Trigger the validator so the "required" message clears once
                // the first product is added.
                this.$refs.form && this.$refs.form.validateField('products', () => {})
                this.$message.success(`Added "${item.name}"`)
            } catch (e) {
                console.error('SKU lookup failed:', e)
                const msg = (e.response && e.response.data && e.response.data.message) || e.message || 'Failed to add product'
                this.$message.error(msg)
            } finally {
                this.productLookupLoading = false
                this.productSearchKeyword = ""
            }
        },
        removeSelectedProduct(idx) {
            this.form.products.splice(idx, 1)
            this.$refs.form && this.$refs.form.validateField('products', () => {})
        },
        getStatusType(status) {
            switch (status) {
                case 'Active':
                    return 'success' // green
                case 'Inactive':
                    return 'danger' // red
                case 'Draft':
                    return 'info'
                default:
                    return 'info'
            }
        }
    }
}
</script>

<style scoped>
/* Selected products list inside the Selection collection picker */
.selected-products-wrap {
    margin-top: 10px;
    border: 1px dashed #dcdfe6;
    border-radius: 6px;
    padding: 8px;
    background: #fafbfc;
    min-height: 56px;
}
.selected-empty {
    color: #909399;
    font-size: 13px;
    text-align: center;
    padding: 12px 0;
}
.selected-products {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.selected-product {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 6px;
    padding: 6px 10px;
}
.selected-product-img {
    width: 36px;
    height: 36px;
    object-fit: cover;
    border-radius: 4px;
    flex-shrink: 0;
    background: #f5f7fa;
}
.selected-product-img-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #c0c4cc;
    font-size: 16px;
}
.selected-product-info {
    flex: 1;
    min-width: 0;
}
.selected-product-name {
    font-weight: 500;
    color: #303133;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.selected-product-meta {
    color: #909399;
    font-size: 12px;
    margin-top: 2px;
}
.selected-product-id {
    margin-left: 6px;
    color: #c0c4cc;
}
</style>

<style>
/* Autocomplete suggestion popup — needs to be unscoped because the popup is
   teleported outside the component root by Element UI. */
.collection-product-suggestions .product-suggestion {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
}
.collection-product-suggestions .product-suggestion-img {
    width: 36px;
    height: 36px;
    object-fit: cover;
    border-radius: 4px;
    flex-shrink: 0;
    background: #f5f7fa;
}
.collection-product-suggestions .product-suggestion-img-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #c0c4cc;
    font-size: 16px;
}
.collection-product-suggestions .product-suggestion-info { min-width: 0; }
.collection-product-suggestions .product-suggestion-name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.collection-product-suggestions .product-suggestion-meta {
    color: #909399;
    font-size: 12px;
}
</style>