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

        <!--
            Shared create/edit dialog — extracted to its own component
            (CollectionFormDialog) so the Stock Monitoring page can edit
            a collection in place with the exact same form. `collection`
            null = Add mode.
        -->
        <collection-form-dialog
            :visible.sync="dialogVisible"
            :collection="editingCollection"
            @saved="getList"
        />
        <CollectionGroupDialog :visible.sync="showCollectionGroupDialog"></CollectionGroupDialog>
    </div>
</template>

<script>
import CollectionGroupDialog from "./CollectionGroup/collectionGroup.vue"
import CollectionFormDialog from "./CollectionFormDialog.vue"
import { getCollectionList, deleteCollection } from "../../../api/zoho/products/collection";
export default {
    components: {
        CollectionGroupDialog,
        CollectionFormDialog
    },
    data() {
        return {
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
            // Shared form dialog state. `editingCollection` carries the
            // row being edited; null switches the dialog to Add mode.
            dialogVisible: false,
            editingCollection: null
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
            this.editingCollection = null
            this.dialogVisible = true
        },
        handleUpdate(row) {
            this.editingCollection = row
            this.dialogVisible = true
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
