<template>
    <div class="app-container">
        <el-form :model="queryParams" ref="queryForm" size="small" :inline="true" v-show="showSearch">
            <el-form-item label="Search" prop="search">
                <el-input v-model="queryParams.search" placeholder="Username or email" clearable
                    style="width: 220px" @keyup.enter.native="handleQuery" />
            </el-form-item>
            <el-form-item label="Role" prop="role">
                <el-select v-model="queryParams.role" placeholder="Any role" clearable style="width: 180px">
                    <el-option v-for="r in roles" :key="r.value" :label="r.label" :value="r.value" />
                </el-select>
            </el-form-item>
            <el-form-item label="Status" prop="active">
                <el-select v-model="queryParams.active" placeholder="Any" clearable style="width: 120px">
                    <el-option label="Active" :value="true" />
                    <el-option label="Disabled" :value="false" />
                </el-select>
            </el-form-item>
            <el-form-item>
                <el-button type="primary" icon="el-icon-search" size="mini" @click="handleQuery">Search</el-button>
                <el-button icon="el-icon-refresh" size="mini" @click="resetQuery">Reset</el-button>
            </el-form-item>
        </el-form>

        <el-row :gutter="10" class="mb8">
            <el-col :span="1.5">
                <el-button type="primary" plain icon="el-icon-plus" size="mini" @click="handleAdd">Add User</el-button>
            </el-col>
            <right-toolbar :showSearch.sync="showSearch" @queryTable="getList"></right-toolbar>
        </el-row>

        <el-table v-loading="loading" :data="list">
            <el-table-column label="Username" prop="username" min-width="140" />
            <el-table-column label="Email" prop="email" min-width="200" />
            <el-table-column label="Role" min-width="150">
                <template slot-scope="scope">
                    <el-tag size="mini" :type="roleTagType(scope.row.role)" effect="light">
                        {{ roleLabel(scope.row.role) }}
                    </el-tag>
                </template>
            </el-table-column>
            <el-table-column label="Shops" min-width="120" align="center">
                <template slot-scope="scope">
                    <span v-if="isShopScoped(scope.row.role)">
                        {{ (scope.row.shopIds && scope.row.shopIds.length) || 0 }}
                    </span>
                    <span v-else style="color: #c0c4cc">—</span>
                </template>
            </el-table-column>
            <el-table-column label="Status" width="100" align="center">
                <template slot-scope="scope">
                    <el-tag size="mini" :type="scope.row.active ? 'success' : 'info'" effect="light">
                        {{ scope.row.active ? 'Active' : 'Disabled' }}
                    </el-tag>
                </template>
            </el-table-column>
            <el-table-column label="Action" align="center" width="240" class-name="small-padding fixed-width">
                <template slot-scope="scope">
                    <el-button size="mini" type="text" icon="el-icon-edit"
                        @click="handleUpdate(scope.row)">Edit</el-button>
                    <el-button size="mini" type="text" icon="el-icon-key"
                        @click="handleResetPwd(scope.row)">Password</el-button>
                    <el-button size="mini" type="text" icon="el-icon-delete"
                        @click="handleDelete(scope.row)">Delete</el-button>
                </template>
            </el-table-column>
        </el-table>

        <pagination v-show="total > 0" :total="total" :page.sync="queryParams.page"
            :limit.sync="queryParams.pageSize" @pagination="getList" />

        <!-- Create / Edit dialog -->
        <el-dialog :title="dialogTitle" :visible.sync="open" width="600px" append-to-body :close-on-click-modal="false" @close="resetForm">
            <el-form ref="form" :model="form" :rules="rules" label-width="110px" size="small">
                <el-form-item label="Username" prop="username">
                    <el-input v-model="form.username" :disabled="!!form._id" />
                </el-form-item>
                <el-form-item label="Email" prop="email">
                    <el-input v-model="form.email" />
                </el-form-item>
                <el-form-item v-if="!form._id" label="Password" prop="password">
                    <el-input v-model="form.password" type="password" show-password
                        placeholder="At least 6 characters" />
                </el-form-item>
                <el-form-item label="Role" prop="role">
                    <el-select v-model="form.role" placeholder="Select a role" style="width: 100%">
                        <el-option v-for="r in roles" :key="r.value" :label="r.label" :value="r.value" />
                    </el-select>
                </el-form-item>
                <el-form-item v-if="selectedRoleShopScoped" label="Shops" prop="shopIds">
                    <el-select v-model="form.shopIds" multiple filterable placeholder="Assign shops"
                        style="width: 100%">
                        <el-option v-for="s in shops" :key="s._id" :label="s.storeName" :value="s._id" />
                    </el-select>
                    <div class="form-hint">The user will only see cases for the shops assigned here.</div>
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

        <!-- Reset password dialog -->
        <el-dialog :title="`Reset Password — ${pwdForm.username}`" :visible.sync="pwdOpen" width="460px" append-to-body>
            <el-form ref="pwdFormRef" :model="pwdForm" :rules="pwdRules" label-width="110px" size="small">
                <el-form-item label="New Password" prop="password">
                    <el-input v-model="pwdForm.password" type="password" show-password
                        placeholder="At least 6 characters" />
                </el-form-item>
            </el-form>
            <div slot="footer">
                <el-button type="primary" :loading="pwdSubmitting" @click="submitResetPwd">Save</el-button>
                <el-button @click="pwdOpen = false">Cancel</el-button>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import { listUsers, createUser, updateUser, deleteUser, resetUserPassword, listRoles } from '@/api/system/users'
import { listShops } from '@/api/sqt/shops'

function emptyForm() {
    return {
        _id: null,
        username: '',
        email: '',
        password: '',
        role: '',
        shopIds: [],
        active: true
    }
}

export default {
    name: 'SystemUsers',
    data() {
        return {
            showSearch: true,
            loading: false,
            submitLoading: false,
            list: [],
            total: 0,
            roles: [],
            shops: [],
            queryParams: { page: 1, pageSize: 20, search: '', role: '', active: '' },
            open: false,
            dialogTitle: '',
            form: emptyForm(),
            rules: {
                username: [{ required: true, message: 'Username is required', trigger: 'blur' }],
                email: [
                    { required: true, message: 'Email is required', trigger: 'blur' },
                    { type: 'email', message: 'Enter a valid email', trigger: 'blur' }
                ],
                password: [
                    { required: true, message: 'Password is required', trigger: 'blur' },
                    { min: 6, message: 'At least 6 characters', trigger: 'blur' }
                ],
                role: [{ required: true, message: 'Role is required', trigger: 'change' }]
            },
            pwdOpen: false,
            pwdSubmitting: false,
            pwdForm: { id: null, username: '', password: '' },
            pwdRules: {
                password: [
                    { required: true, message: 'Password is required', trigger: 'blur' },
                    { min: 6, message: 'At least 6 characters', trigger: 'blur' }
                ]
            }
        }
    },
    computed: {
        selectedRoleShopScoped() {
            const r = this.roles.find(x => x.value === this.form.role)
            return r ? r.shopScoped : false
        }
    },
    created() {
        this.getList()
        this.loadRoles()
        this.loadShops()
    },
    methods: {
        async getList() {
            this.loading = true
            try {
                const params = { page: this.queryParams.page, pageSize: this.queryParams.pageSize }
                if (this.queryParams.search) params.search = this.queryParams.search
                if (this.queryParams.role) params.role = this.queryParams.role
                if (this.queryParams.active !== '' && this.queryParams.active !== null) {
                    params.active = this.queryParams.active
                }
                const res = await listUsers(params)
                this.list = res.data || []
                this.total = res.totalDocs || 0
            } catch (e) {
                console.error(e)
                this.$message.error('Failed to load users')
            } finally {
                this.loading = false
            }
        },
        async loadRoles() {
            try {
                const res = await listRoles()
                this.roles = res.data || []
            } catch (e) { console.error(e) }
        },
        async loadShops() {
            try {
                const res = await listShops({ page: 1, pageSize: 500 })
                this.shops = res.data || []
            } catch (e) { console.error(e) }
        },
        handleQuery() {
            this.queryParams.page = 1
            this.getList()
        },
        resetQuery() {
            this.queryParams = { page: 1, pageSize: 20, search: '', role: '', active: '' }
            this.getList()
        },
        handleAdd() {
            this.form = emptyForm()
            this.dialogTitle = 'Add User'
            this.open = true
        },
        handleUpdate(row) {
            this.form = {
                _id: row._id,
                username: row.username || '',
                email: row.email || '',
                password: '',
                role: row.role || '',
                shopIds: (row.shopIds || []).map(String),
                active: row.active !== false
            }
            this.dialogTitle = 'Edit User'
            this.open = true
        },
        async handleDelete(row) {
            try {
                await this.$confirm(`Delete user "${row.username}"?`, 'Warning', {
                    confirmButtonText: 'Confirm', cancelButtonText: 'Cancel', type: 'warning'
                })
                await deleteUser(row._id)
                this.$message.success('User deleted')
                this.getList()
            } catch (e) {
                if (e !== 'cancel') {
                    const msg = (e.response && e.response.data && e.response.data.message) || 'Delete failed'
                    this.$message.error(msg)
                }
            }
        },
        handleResetPwd(row) {
            this.pwdForm = { id: row._id, username: row.username, password: '' }
            this.pwdOpen = true
            this.$nextTick(() => this.$refs.pwdFormRef && this.$refs.pwdFormRef.clearValidate())
        },
        submitResetPwd() {
            this.$refs.pwdFormRef.validate(async valid => {
                if (!valid) return
                this.pwdSubmitting = true
                try {
                    await resetUserPassword(this.pwdForm.id, this.pwdForm.password)
                    this.$message.success('Password reset')
                    this.pwdOpen = false
                } catch (e) {
                    const msg = (e.response && e.response.data && e.response.data.message) || 'Failed to reset password'
                    this.$message.error(msg)
                } finally {
                    this.pwdSubmitting = false
                }
            })
        },
        submitForm() {
            this.$refs.form.validate(async valid => {
                if (!valid) return
                this.submitLoading = true
                try {
                    const payload = {
                        username: this.form.username,
                        email: this.form.email,
                        role: this.form.role,
                        active: this.form.active,
                        shopIds: this.selectedRoleShopScoped ? this.form.shopIds : []
                    }
                    if (this.form._id) {
                        await updateUser(this.form._id, payload)
                        this.$message.success('User updated')
                    } else {
                        payload.password = this.form.password
                        await createUser(payload)
                        this.$message.success('User created')
                    }
                    this.open = false
                    this.getList()
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
            this.$nextTick(() => this.$refs.form && this.$refs.form.clearValidate())
        },
        roleLabel(role) {
            const r = this.roles.find(x => x.value === role)
            return r ? r.label : role
        },
        isShopScoped(role) {
            const r = this.roles.find(x => x.value === role)
            return r ? r.shopScoped : false
        },
        roleTagType(role) {
            switch (role) {
                case 'admin': return 'danger'
                case 'imobile-admin':
                case 'techelite-admin': return 'warning'
                default: return 'info'
            }
        }
    }
}
</script>

<style scoped>
.form-hint {
    color: #909399;
    font-size: 12px;
    line-height: 1.4;
    margin-top: 4px;
}
</style>
