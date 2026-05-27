<template>
    <div class="app-container">
        <el-form :model="queryParams" ref="queryForm" size="small" :inline="true" v-show="showSearch">
            <el-form-item label="Search" prop="search">
                <el-input v-model="queryParams.search" placeholder="Name, slug, email, address" clearable
                    style="width: 260px" @keyup.enter.native="handleQuery" />
            </el-form-item>
            <el-form-item label="Status" prop="status">
                <el-select v-model="queryParams.status" placeholder="Any status" clearable style="width: 160px">
                    <el-option label="Active" value="active" />
                    <el-option label="Inactive" value="inactive" />
                    <el-option label="Pending" value="pending" />
                </el-select>
            </el-form-item>
            <el-form-item>
                <el-button type="primary" icon="el-icon-search" size="mini" @click="handleQuery">Search</el-button>
                <el-button icon="el-icon-refresh" size="mini" @click="resetQuery">Reset</el-button>
            </el-form-item>
        </el-form>

        <el-row :gutter="10" class="mb8">
            <el-col :span="1.5">
                <el-button type="primary" plain icon="el-icon-plus" size="mini" @click="handleAdd">Add Shop</el-button>
            </el-col>
            <right-toolbar :showSearch.sync="showSearch" @queryTable="getList"></right-toolbar>
        </el-row>

        <el-table v-loading="loading" :data="list">
            <el-table-column label="Store Name" prop="storeName" min-width="200">
                <template slot-scope="scope">
                    <div>
                        <span style="font-weight: 500">{{ scope.row.storeName }}</span>
                        <br />
                        <span style="color: #999; font-size: 12px">{{ scope.row.slug }}</span>
                    </div>
                </template>
            </el-table-column>
            <el-table-column label="Address" min-width="240">
                <template slot-scope="scope">
                    <span>{{ scope.row.address && scope.row.address.raw || '—' }}</span>
                </template>
            </el-table-column>
            <el-table-column label="Contacts" min-width="200">
                <template slot-scope="scope">
                    <div v-if="scope.row.emails && scope.row.emails.length">
                        <i class="el-icon-message" /> {{ scope.row.emails[0] }}
                        <span v-if="scope.row.emails.length > 1" style="color: #999">
                            +{{ scope.row.emails.length - 1 }}
                        </span>
                    </div>
                    <div v-if="scope.row.phones && scope.row.phones.length" style="font-size: 12px; color: #666">
                        <i class="el-icon-phone" /> {{ scope.row.phones[0].number }}
                        <span v-if="scope.row.phones.length > 1" style="color: #999">
                            +{{ scope.row.phones.length - 1 }}
                        </span>
                    </div>
                </template>
            </el-table-column>
            <el-table-column label="Status" prop="status" width="100" align="center">
                <template slot-scope="scope">
                    <el-tag :type="getStatusType(scope.row.status)" size="mini" effect="light">
                        {{ scope.row.status }}
                    </el-tag>
                </template>
            </el-table-column>
            <el-table-column label="Action" align="center" width="180" class-name="small-padding fixed-width">
                <template slot-scope="scope">
                    <el-button size="mini" type="text" icon="el-icon-edit"
                        @click="handleUpdate(scope.row)">Edit</el-button>
                    <el-button size="mini" type="text" icon="el-icon-delete"
                        @click="handleDelete(scope.row)">Delete</el-button>
                </template>
            </el-table-column>
        </el-table>

        <pagination v-show="total > 0" :total="total" :page.sync="queryParams.page" :limit.sync="queryParams.pageSize"
            @pagination="getList" />

        <!--
            Shop create/edit dialog — body organised into tabs.
            "Users" tab is only shown when editing an existing shop AND the
            current user holds system:user:manage (Admin or TechElite Admin).
        -->
        <el-dialog :title="title" :visible.sync="open" width="780px" append-to-body @close="resetForm">
            <el-tabs v-model="activeTab">
                <el-tab-pane label="Shop Detail" name="detail">
                    <el-form ref="form" :model="form" :rules="rules" label-width="120px" size="small">
                        <el-row :gutter="16">
                            <el-col :span="12">
                                <el-form-item label="Store Name" prop="storeName">
                                    <el-input v-model="form.storeName" />
                                </el-form-item>
                            </el-col>
                            <el-col :span="12">
                                <el-form-item label="Slug" prop="slug">
                                    <el-input v-model="form.slug" placeholder="myfone-repairs-crown" />
                                </el-form-item>
                            </el-col>
                        </el-row>

                        <el-row :gutter="16">
                            <el-col :span="12">
                                <el-form-item label="Status" prop="status">
                                    <el-select v-model="form.status" style="width: 100%">
                                        <el-option label="Active" value="active" />
                                        <el-option label="Inactive" value="inactive" />
                                        <el-option label="Pending" value="pending" />
                                    </el-select>
                                </el-form-item>
                            </el-col>
                            <el-col :span="12">
                                <el-form-item label="Google Maps">
                                    <el-input v-model="form.googleMapsLink" placeholder="https://maps..." />
                                </el-form-item>
                            </el-col>
                        </el-row>

                        <el-row :gutter="16">
                            <el-col :span="12">
                                <el-form-item label="Zoho ID">
                                    <el-input v-model="form.externalIds.zohoId" />
                                </el-form-item>
                            </el-col>
                            <el-col :span="12">
                                <el-form-item label="RepairDesk ID">
                                    <el-input v-model="form.externalIds.repairDeskId" />
                                </el-form-item>
                            </el-col>
                        </el-row>

                        <el-form-item label="Notes">
                            <el-input v-model="form.notes" type="textarea" :rows="3" />
                        </el-form-item>
                    </el-form>
                </el-tab-pane>

                <el-tab-pane label="Address" name="address">
                    <el-form :model="form" label-width="120px" size="small">
                        <el-form-item label="Raw">
                            <el-input v-model="form.address.raw" type="textarea" :rows="2"
                                placeholder="Kiosk 1/8 Whiteman St, Southbank VIC 3006" />
                        </el-form-item>
                        <el-form-item label="Street">
                            <el-input v-model="form.address.street" />
                        </el-form-item>
                        <el-row :gutter="16">
                            <el-col :span="10">
                                <el-form-item label="Suburb">
                                    <el-input v-model="form.address.suburb" />
                                </el-form-item>
                            </el-col>
                            <el-col :span="7">
                                <el-form-item label="State" label-width="60px">
                                    <el-select
                                        v-model="form.address.state"
                                        placeholder="State"
                                        clearable
                                        style="width: 100%"
                                    >
                                        <el-option
                                            v-for="s in australianStates"
                                            :key="s.value"
                                            :label="s.label"
                                            :value="s.value"
                                        />
                                    </el-select>
                                </el-form-item>
                            </el-col>
                            <el-col :span="7">
                                <el-form-item label="Postcode" label-width="90px">
                                    <el-input v-model="form.address.postcode" />
                                </el-form-item>
                            </el-col>
                        </el-row>
                        <el-form-item label="Country" label-width="120px">
                            <el-input v-model="form.address.country" />
                        </el-form-item>
                    </el-form>
                </el-tab-pane>

                <el-tab-pane label="Contacts" name="contacts">
                    <el-form :model="form" label-width="120px" size="small">
                        <el-form-item label="Emails">
                            <div v-for="(email, idx) in form.emails" :key="`email-${idx}`" style="margin-bottom: 4px">
                                <el-input v-model="form.emails[idx]" style="width: 360px" />
                                <el-button size="mini" type="text" icon="el-icon-delete"
                                    @click="form.emails.splice(idx, 1)" />
                            </div>
                            <el-button size="mini" icon="el-icon-plus" @click="form.emails.push('')">Add email</el-button>
                        </el-form-item>

                        <el-form-item label="Phones">
                            <div v-for="(phone, idx) in form.phones" :key="`phone-${idx}`" style="margin-bottom: 4px">
                                <el-input v-model="form.phones[idx].name" placeholder="Name" style="width: 140px" />
                                <el-input v-model="form.phones[idx].number" placeholder="Number" style="width: 220px" />
                                <el-button size="mini" type="text" icon="el-icon-delete"
                                    @click="form.phones.splice(idx, 1)" />
                            </div>
                            <el-button size="mini" icon="el-icon-plus"
                                @click="form.phones.push({ name: '', number: '' })">Add phone</el-button>
                        </el-form-item>
                    </el-form>
                </el-tab-pane>

                <!--
                    Users tab — only available when editing (we need a shop id)
                    AND the current user can manage users (admin only).
                -->
                <el-tab-pane
                    v-if="form._id && canManageUsers"
                    label="Users"
                    name="users"
                >
                    <div class="shop-users-toolbar">
                        <span class="muted">
                            Users with Repair Shop or Repair Shop Owner role attached to this shop.
                        </span>
                        <el-button
                            type="primary"
                            size="mini"
                            icon="el-icon-plus"
                            @click="openAddUser"
                        >Add User</el-button>
                    </div>

                    <el-table
                        v-loading="usersLoading"
                        :data="shopUsers"
                        size="small"
                        empty-text="No users assigned to this shop yet"
                        max-height="380"
                    >
                        <el-table-column label="Username" prop="username" min-width="160" />
                        <el-table-column label="Email" prop="email" min-width="200" show-overflow-tooltip />
                        <el-table-column label="Role" width="160">
                            <template slot-scope="scope">
                                <el-tag size="mini" type="info" effect="plain">
                                    {{ roleLabel(scope.row.role) }}
                                </el-tag>
                            </template>
                        </el-table-column>
                        <el-table-column label="Active" width="80" align="center">
                            <template slot-scope="scope">
                                <i
                                    :class="scope.row.active === false ? 'el-icon-error inactive-dot' : 'el-icon-success active-dot'"
                                />
                            </template>
                        </el-table-column>
                    </el-table>
                </el-tab-pane>
            </el-tabs>

            <div slot="footer" class="dialog-footer">
                <el-button type="primary" :loading="submitLoading" @click="submitForm">Save</el-button>
                <el-button @click="open = false">Cancel</el-button>
            </div>
        </el-dialog>

        <!--
            Add-User sub-dialog opened from the Users tab. Creates a new user
            pre-assigned to the current shop via POST /users/create with
            shopIds: [shop._id]. For Shop Owners the admin can later attach
            additional shops via /system/users.
        -->
        <el-dialog
            title="Add user to this shop"
            :visible.sync="addUserOpen"
            width="520px"
            append-to-body
            @close="resetAddUserForm"
        >
            <el-form ref="addUserForm" :model="addUserForm" :rules="addUserRules" label-width="120px" size="small">
                <el-form-item label="Username" prop="username">
                    <el-input v-model="addUserForm.username" />
                </el-form-item>
                <el-form-item label="Email" prop="email">
                    <el-input v-model="addUserForm.email" />
                </el-form-item>
                <el-form-item label="Password" prop="password">
                    <el-input v-model="addUserForm.password" show-password />
                </el-form-item>
                <el-form-item label="Role" prop="role">
                    <el-radio-group v-model="addUserForm.role">
                        <el-radio label="repair-shop">Repair Shop</el-radio>
                        <el-radio label="shop-owner">Repair Shop Owner</el-radio>
                    </el-radio-group>
                </el-form-item>
                <el-form-item label="Active">
                    <el-switch v-model="addUserForm.active" />
                </el-form-item>
            </el-form>
            <div slot="footer" class="dialog-footer">
                <el-button type="primary" :loading="addUserSubmitting" @click="submitAddUser">Create</el-button>
                <el-button @click="addUserOpen = false">Cancel</el-button>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import { listShops, createShop, updateShop, deleteShop } from '@/api/sqt/shops'
import { listUsers, createUser } from '@/api/system/users'

const ROLE_LABEL_MAP = {
    'repair-shop': 'Repair Shop',
    'shop-owner': 'Repair Shop Owner',
    admin: 'Admin',
    'imobile-admin': 'iMobile Admin',
    'techelite-admin': 'TechElite Admin'
}

// Standard Australia Post abbreviations — value stored on the shop doc,
// label shown in the dropdown.
const AUSTRALIAN_STATES = [
    { value: 'NSW', label: 'NSW — New South Wales' },
    { value: 'VIC', label: 'VIC — Victoria' },
    { value: 'QLD', label: 'QLD — Queensland' },
    { value: 'WA',  label: 'WA — Western Australia' },
    { value: 'SA',  label: 'SA — South Australia' },
    { value: 'TAS', label: 'TAS — Tasmania' },
    { value: 'ACT', label: 'ACT — Australian Capital Territory' },
    { value: 'NT',  label: 'NT — Northern Territory' }
]

// Accept legacy values (full names, casing variants) and map them to the
// canonical abbreviation so the dropdown shows the correct option on edit.
const STATE_ALIASES = {
    'new south wales': 'NSW',
    nsw: 'NSW',
    victoria: 'VIC',
    vic: 'VIC',
    queensland: 'QLD',
    qld: 'QLD',
    'western australia': 'WA',
    wa: 'WA',
    'south australia': 'SA',
    sa: 'SA',
    tasmania: 'TAS',
    tas: 'TAS',
    'australian capital territory': 'ACT',
    act: 'ACT',
    'northern territory': 'NT',
    nt: 'NT'
}

function normalizeStateValue(raw) {
    if (!raw) return ''
    const key = String(raw).trim().toLowerCase()
    return STATE_ALIASES[key] || ''
}

function emptyForm() {
    return {
        _id: null,
        storeName: '',
        slug: '',
        status: 'pending',
        googleMapsLink: '',
        externalIds: { zohoId: '', repairDeskId: '' },
        address: {
            raw: '', street: '', suburb: '', state: '', postcode: '', country: 'Australia'
        },
        emails: [],
        phones: [],
        notes: ''
    }
}

function emptyAddUserForm() {
    return {
        username: '',
        email: '',
        password: '',
        role: 'repair-shop',
        active: true
    }
}

export default {
    name: 'SqtShops',
    data() {
        return {
            showSearch: true,
            loading: false,
            submitLoading: false,
            list: [],
            total: 0,
            queryParams: {
                page: 1,
                pageSize: 20,
                search: '',
                status: ''
            },
            open: false,
            title: '',
            activeTab: 'detail',
            // Static reference list for the State dropdown
            australianStates: AUSTRALIAN_STATES,
            form: emptyForm(),
            rules: {
                storeName: [{ required: true, message: 'Store name is required', trigger: 'blur' }],
                status: [{ required: true, message: 'Status is required', trigger: 'change' }]
            },

            // ── Users tab ─────────────────────────────────────────────────
            shopUsers: [],
            usersLoading: false,

            // Add-user sub-dialog
            addUserOpen: false,
            addUserSubmitting: false,
            addUserForm: emptyAddUserForm(),
            addUserRules: {
                username: [{ required: true, message: 'Username is required', trigger: 'blur' }],
                // Email is optional (users log in with their username); when
                // provided we still validate the format.
                email: [
                    { type: 'email', message: 'Invalid email', trigger: 'blur' }
                ],
                password: [
                    { required: true, message: 'Password is required', trigger: 'blur' },
                    { min: 6, message: 'At least 6 characters', trigger: 'blur' }
                ],
                role: [{ required: true, message: 'Role is required', trigger: 'change' }]
            }
        }
    },
    computed: {
        // Admin + TechElite Admin both hold system:user:manage, so both
        // roles can see + use the Users tab.
        canManageUsers() {
            const roles = (this.$store && this.$store.state.user.roles) || []
            return roles.includes('admin') || roles.includes('techelite-admin')
        }
    },
    watch: {
        // Lazy-load the user list the first time the Users tab is opened (or
        // when the user switches back to it after editing other tabs).
        activeTab(tab) {
            if (tab === 'users' && this.form._id) {
                this.loadShopUsers()
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
                const params = {
                    page: this.queryParams.page,
                    pageSize: this.queryParams.pageSize
                }
                if (this.queryParams.search) params.search = this.queryParams.search
                if (this.queryParams.status) params.status = this.queryParams.status

                const res = await listShops(params)
                this.list = res.data || []
                this.total = res.totalDocs || 0
            } catch (e) {
                console.error(e)
                this.$message.error('Failed to load shops')
            } finally {
                this.loading = false
            }
        },
        handleQuery() {
            this.queryParams.page = 1
            this.getList()
        },
        resetQuery() {
            this.queryParams = { page: 1, pageSize: 20, search: '', status: '' }
            this.getList()
        },
        handleAdd() {
            this.form = emptyForm()
            this.activeTab = 'detail'
            this.title = 'Add Shop'
            this.open = true
        },
        handleUpdate(row) {
            this.form = {
                _id: row._id,
                storeName: row.storeName || '',
                slug: row.slug || '',
                status: row.status || 'pending',
                googleMapsLink: row.googleMapsLink || '',
                externalIds: {
                    zohoId: row.externalIds && row.externalIds.zohoId || '',
                    repairDeskId: row.externalIds && row.externalIds.repairDeskId || ''
                },
                address: {
                    raw: row.address && row.address.raw || '',
                    street: row.address && row.address.street || '',
                    suburb: row.address && row.address.suburb || '',
                    // Coerce legacy state values (full names, casing variants)
                    // to the canonical abbreviation the dropdown expects.
                    state: normalizeStateValue(row.address && row.address.state),
                    postcode: row.address && row.address.postcode || '',
                    country: row.address && row.address.country || 'Australia'
                },
                emails: (row.emails || []).slice(),
                phones: (row.phones || []).map(p => ({ name: p.name || '', number: p.number || '' })),
                notes: row.notes || ''
            }
            this.activeTab = 'detail'
            this.shopUsers = []
            this.title = 'Edit Shop'
            this.open = true
        },
        async handleDelete(row) {
            try {
                await this.$confirm(`Delete "${row.storeName}"?`, 'Warning', {
                    confirmButtonText: 'Confirm',
                    cancelButtonText: 'Cancel',
                    type: 'warning'
                })
                await deleteShop(row._id)
                this.$message.success('Shop deleted')
                this.getList()
            } catch (e) {
                if (e !== 'cancel') {
                    console.error(e)
                    this.$message.error('Delete failed')
                }
            }
        },
        submitForm() {
            // Only validate the main form (Shop Detail tab). The Users tab is
            // self-contained and doesn't contribute to the shop save payload.
            this.$refs.form.validate(async valid => {
                if (!valid) {
                    // Validation failures live on the Shop Detail tab — jump
                    // there so the user can see the errors.
                    this.activeTab = 'detail'
                    return
                }
                this.submitLoading = true
                try {
                    const payload = { ...this.form }
                    payload.emails = payload.emails.filter(e => e && e.trim())
                    payload.phones = payload.phones.filter(p => p.number && p.number.trim())

                    if (this.form._id) {
                        await updateShop(this.form._id, payload)
                        this.$message.success('Shop updated')
                    } else {
                        await createShop(payload)
                        this.$message.success('Shop created')
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
            this.shopUsers = []
            this.activeTab = 'detail'
            this.$nextTick(() => {
                this.$refs.form && this.$refs.form.clearValidate()
            })
        },
        getStatusType(status) {
            switch (status) {
                case 'active': return 'success'
                case 'inactive': return 'danger'
                case 'pending': return 'warning'
                default: return 'info'
            }
        },

        // ── Users tab ────────────────────────────────────────────────────
        roleLabel(role) {
            return ROLE_LABEL_MAP[role] || role || '—'
        },
        async loadShopUsers() {
            if (!this.form._id) return
            this.usersLoading = true
            try {
                // Backend defaults to role IN [repair-shop, shop-owner] when
                // shopId is supplied without an explicit role, so this returns
                // exactly the users we want to surface here.
                const res = await listUsers({ shopId: this.form._id, pageSize: 200 })
                this.shopUsers = res.data || []
            } catch (e) {
                console.error(e)
                this.$message.error('Failed to load users for this shop')
            } finally {
                this.usersLoading = false
            }
        },
        openAddUser() {
            this.addUserForm = emptyAddUserForm()
            this.addUserOpen = true
        },
        resetAddUserForm() {
            this.addUserForm = emptyAddUserForm()
            this.$nextTick(() => {
                this.$refs.addUserForm && this.$refs.addUserForm.clearValidate()
            })
        },
        submitAddUser() {
            this.$refs.addUserForm.validate(async valid => {
                if (!valid) return
                this.addUserSubmitting = true
                try {
                    await createUser({
                        username: this.addUserForm.username.trim(),
                        email: this.addUserForm.email.trim().toLowerCase(),
                        password: this.addUserForm.password,
                        role: this.addUserForm.role,
                        active: this.addUserForm.active,
                        // Pre-attach to the shop currently being edited
                        shopIds: [this.form._id]
                    })
                    this.$message.success('User created')
                    this.addUserOpen = false
                    this.loadShopUsers()
                } catch (e) {
                    console.error(e)
                    const msg = (e.response && e.response.data && e.response.data.message) || 'Create failed'
                    this.$message.error(msg)
                } finally {
                    this.addUserSubmitting = false
                }
            })
        },
    }
}
</script>

<style scoped>
.shop-users-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
}
.muted {
    color: #909399;
    font-size: 13px;
}
.active-dot { color: #67C23A; font-size: 16px; }
.inactive-dot { color: #C0C4CC; font-size: 16px; }
</style>
