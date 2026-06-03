<template>
    <div class="app-container users-page">
        <!--
            Two-column layout: a role-tree panel on the left for scope
            selection (All / group / single role), and the user table +
            dialogs on the right. The tree replaces the inline Role select
            from the search bar so there's exactly one place that drives
            the role filter.
        -->
        <div class="users-shell">
            <!-- Left: role tree -->
            <aside class="users-tree-panel">
                <div class="tree-head">
                    <i class="el-icon-user-solid" />
                    Roles
                </div>
                <el-tree
                    ref="roleTree"
                    :data="roleTree"
                    node-key="key"
                    :default-expand-all="true"
                    :expand-on-click-node="false"
                    :current-node-key="currentTreeKey"
                    highlight-current
                    class="role-tree"
                    @node-click="onTreeNodeClick"
                >
                    <template slot-scope="{ node, data }">
                        <span class="tree-row">
                            <i v-if="data.icon" :class="['tree-row-icon', data.icon]" />
                            <span class="tree-row-label">{{ node.label }}</span>
                        </span>
                    </template>
                </el-tree>
            </aside>

            <!-- Right: existing search bar + table -->
            <section class="users-main">
                <el-form :model="queryParams" ref="queryForm" size="small" :inline="true" v-show="showSearch">
                    <el-form-item label="Search" prop="search">
                        <el-input v-model="queryParams.search" placeholder="Username or email" clearable
                            style="width: 220px" @keyup.enter.native="handleQuery" />
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

                <div class="filter-summary">
                    <span class="filter-label">Showing:</span>
                    <el-tag size="mini" type="info" effect="plain">{{ currentScopeLabel }}</el-tag>
                </div>

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
            </section>
        </div>

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
                <!--
                    Shop selector. Repair Shop is a single-shop role (one
                    physical location, one account), so we render a single
                    select. Repair Shop Owner can hold many shops, so they
                    get the multi-select. The model is always an array
                    internally — `shopIdSingle` is a getter/setter bridge.
                -->
                <el-form-item
                    v-if="selectedRoleShopScoped"
                    :label="selectedRoleIsRepairShop ? 'Shop' : 'Shops'"
                    prop="shopIds"
                >
                    <el-select
                        v-if="selectedRoleIsRepairShop"
                        v-model="shopIdSingle"
                        filterable
                        clearable
                        placeholder="Assign a shop"
                        style="width: 100%"
                    >
                        <el-option v-for="s in shops" :key="s._id" :label="s.storeName" :value="s._id" />
                    </el-select>
                    <el-select
                        v-else
                        v-model="form.shopIds"
                        multiple
                        filterable
                        placeholder="Assign shops"
                        style="width: 100%"
                    >
                        <el-option v-for="s in shops" :key="s._id" :label="s.storeName" :value="s._id" />
                    </el-select>
                    <div class="form-hint">
                        {{ selectedRoleIsRepairShop
                            ? 'A Repair Shop user is tied to a single shop.'
                            : 'The user will only see cases for the shops assigned here.' }}
                    </div>
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

// Pseudo node-keys for the role tree. Real role rows use `role:<value>`.
const ALL_KEY = 'all'

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
            // Flat list of roles (from /users/roles). Each entry has
            // { value, label, shopScoped, group }.
            roles: [],
            // Group metadata from the same endpoint. { value, label }.
            roleGroups: [],
            shops: [],
            // queryParams.role holds the comma-separated role(s) the
            // backend should filter on. The tree drives this — the inline
            // search bar no longer shows a Role dropdown.
            queryParams: { page: 1, pageSize: 20, search: '', role: '', active: '' },
            // The tree node currently selected, in node-key form.
            // Defaults to 'all' (no role filter).
            currentTreeKey: ALL_KEY,
            // Human-readable label for the active filter, shown above the
            // table as a quick "where am I" cue.
            currentScopeLabel: 'All Users',
            open: false,
            dialogTitle: '',
            form: emptyForm(),
            rules: {
                username: [{ required: true, message: 'Username is required', trigger: 'blur' }],
                // Email is optional — users can log in with their username.
                // When provided we still enforce a valid format.
                email: [
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
        },
        // Repair Shop is a single-shop role; Repair Shop Owner is multi-shop.
        selectedRoleIsRepairShop() {
            return this.form.role === 'repair-shop'
        },
        // Bridges the single-shop select to the form.shopIds array so the
        // model stays a consistent array type regardless of role.
        shopIdSingle: {
            get() { return (this.form.shopIds && this.form.shopIds[0]) || '' },
            set(val) { this.form.shopIds = val ? [val] : [] }
        },
        // Tree data shape el-tree expects. "All Users" sits at the top
        // outside any group so clearing the filter is a single click; the
        // two groups (iMobile / TechElite) expand to their member roles.
        roleTree() {
            const groupNodes = this.roleGroups.map(g => {
                const children = this.roles
                    .filter(r => r.group === g.value)
                    .map(r => ({
                        key: `role:${r.value}`,
                        label: r.label,
                        role: r.value
                    }))
                return {
                    key: `group:${g.value}`,
                    label: g.label,
                    isGroup: true,
                    // Roles in this group — used to build a comma-separated
                    // `role` filter on click.
                    groupRoles: children.map(c => c.role),
                    children
                }
            })
            return [
                { key: ALL_KEY, label: 'All Users', icon: 'el-icon-user' },
                ...groupNodes
            ]
        }
    },
    watch: {
        // Switching INTO repair-shop must trim any extra shops the user may
        // have had from a previous shop-owner assignment, so the single-shop
        // invariant holds before save.
        'form.role'(newRole, oldRole) {
            if (newRole === oldRole) return
            if (newRole === 'repair-shop' && Array.isArray(this.form.shopIds) && this.form.shopIds.length > 1) {
                this.form.shopIds = this.form.shopIds.slice(0, 1)
            }
        }
    },
    async created() {
        // Roles must arrive before the first list call, otherwise the tree
        // renders empty for a beat. Await rather than fire-and-forget.
        await this.loadRoles()
        this.getList()
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
                this.roleGroups = res.groups || []
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
        // Reset clears the search/status form but leaves the tree selection
        // alone — the user can untangle search vs role-scope independently.
        resetQuery() {
            this.queryParams = {
                page: 1,
                pageSize: 20,
                search: '',
                role: this.queryParams.role, // keep the tree-selected scope
                active: ''
            }
            this.getList()
        },
        // ── Role tree ─────────────────────────────────────────────────
        onTreeNodeClick(data) {
            if (!data) return
            if (data.key === ALL_KEY) {
                this.queryParams.role = ''
                this.currentScopeLabel = 'All Users'
            } else if (data.isGroup) {
                // Group click → filter by every role inside it, joined as
                // CSV the backend splits into an $in.
                this.queryParams.role = (data.groupRoles || []).join(',')
                this.currentScopeLabel = `${data.label} group`
            } else if (data.role) {
                this.queryParams.role = data.role
                this.currentScopeLabel = data.label
            } else {
                return
            }
            this.currentTreeKey = data.key
            this.queryParams.page = 1
            this.getList()
        },
        // ── User row actions ──────────────────────────────────────────
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
                case 'imobile-repair-admin':
                case 'techelite-admin': return 'warning'
                default: return 'info'
            }
        }
    }
}
</script>

<style scoped>
.users-page {
    padding: 18px 20px;
}

/* Two-column shell: fixed-width tree on the left, fluid table on right. */
.users-shell {
    display: flex;
    gap: 16px;
    align-items: flex-start;
}

/* Left: role tree panel */
.users-tree-panel {
    flex: 0 0 240px;
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    padding: 10px 6px 12px;
    /* Sticky so the tree stays in view as the user scrolls a long list. */
    position: sticky;
    top: 12px;
    max-height: calc(100vh - 30px);
    overflow-y: auto;
}
.tree-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 8px;
    color: #303133;
    font-size: 13px;
    font-weight: 600;
    border-bottom: 1px solid #ebeef5;
    margin-bottom: 6px;
}
.tree-head i {
    color: #2563eb;
    font-size: 14px;
}

/* Custom row layout (icon + label) so the "All Users" pseudo-node can
   carry an icon while the role/group nodes stay clean. */
.tree-row {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
}
.tree-row-icon {
    color: #909399;
    font-size: 13px;
}
.tree-row-label {
    color: inherit;
}
/* Override el-tree's default tight spacing so highlight bands feel airy. */
.role-tree ::v-deep .el-tree-node__content {
    height: 32px;
    border-radius: 4px;
}
.role-tree ::v-deep .el-tree-node__content:hover {
    background: #f5f7fa;
}
.role-tree ::v-deep .is-current > .el-tree-node__content {
    background: #ecf5ff !important;
    color: #2563eb;
}

/* Right: main content column */
.users-main {
    flex: 1;
    min-width: 0;
}

/* "Showing: X" cue above the table — disappears when no scope is picked. */
.filter-summary {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 8px;
    color: #606266;
    font-size: 12px;
}
.filter-label {
    color: #909399;
}

.form-hint {
    color: #909399;
    font-size: 12px;
    line-height: 1.4;
    margin-top: 4px;
}

/* Narrow viewports: collapse to single column with the tree above. */
@media (max-width: 900px) {
    .users-shell {
        flex-direction: column;
    }
    .users-tree-panel {
        flex: 1 1 auto;
        width: 100%;
        position: static;
        max-height: none;
    }
}
</style>
