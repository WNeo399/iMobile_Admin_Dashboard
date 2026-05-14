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
                <div v-if="form.type == 'Selection'">

                </div>
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
                criteria: ""
            },
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
                ]
            },
            productSelectionString: "",
            productSelected: [],
            Criteria: ""
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
                criteria: " "
            },
                this.open = true
            this.title = "Add Collection"
        },
        handleUpdate(row) {
            console.log(row)
            this.form = {
                id: row._id,
                title: row.title,
                type: row.type,
                note: row.note,
                status: row.status,
                criteria: row.type == "Criteria" ? row.rules[0].criteria.equals : ""
            }
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

                    // if (this.form.type === 'Selection') {
                    //     payload.products = this.form.products || []
                    // }
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
            this.title = ""
            this.$nextTick(() => {
                this.$refs.form && this.$refs.form.clearValidate()
            })
        },
        cancel() {
            this.open = false
            this.form = {
                title: "",
                type: "",
                status: "Draft",
                criteria: ""
            }
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

<style scoped></style>