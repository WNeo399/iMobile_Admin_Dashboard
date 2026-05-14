<template>
    <div class="app-container">
        <el-form :model="queryParams" ref="queryForm" size="small" :inline="true" v-show="showSearch">
            <el-form-item label="Title" prop="roleName">
                <el-input v-model="queryParams.title" placeholder="Search by title" clearable style="width: 240px" />
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
            <!-- <el-col :span="1.5">
                <el-button type="warning" plain icon="el-icon-download" size="mini"
                    @click="handleExport">Export</el-button>
            </el-col> -->
            <right-toolbar :showSearch.sync="showSearch" @queryTable="getList"></right-toolbar>
        </el-row>

        <el-table v-loading="loading" :data="list">
            <el-table-column type="index" width="55" align="center" />
            <el-table-column label="Operation" align="center" class-name="small-padding fixed-width">
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
                <el-form-item prop="type" label="Type">
                    <el-radio-group v-model="form.type">
                        <el-radio v-for="type in types" :key="type" :label="type">{{
                            type }}</el-radio>
                    </el-radio-group>
                </el-form-item>
            </el-form>
            <div slot="footer" class="dialog-footer">
                <el-button type="primary" @click="submitForm">Submit</el-button>
                <el-button @click="cancel">Cancel</el-button>
            </div>
        </el-dialog>
    </div>

</template>

<script>
export default {
    data() {
        return {

            showSearch: true,
            loading: false,
            list: [],
            total: 10,
            queryParams: {
                pageNum: 1,
                pageSize: 10,
                title: undefined
            },

            title: "",
            open: false,
            types: ["Selection", "Criteria", "Condition", "Parent"],
            form: {
                title: "",
                type: ""
            },
            rules: {
                title: [
                    { required: true, message: "Title can not be empty", trigger: "blur" }
                ],
                type: [
                    { required: true, message: "Type can not be empty", trigger: "blur" }
                ]
            }
        }
    },
    methods: {
        handleQuery() { },
        resetQuery() { },
        getList() { },
        handleExport() { },
        handleAdd() {
            this.form = {
                title: "",
                type: ""
            },
                this.open = true
            this.title = "Add Collection"
        },
        handleUpdate(row) { },
        handleDelete(row) { },
        handlePagination() { },
        submitForm() { },
        cancel() {
            this.data.open = false
        }
    }
}
</script>

<style scoped></style>