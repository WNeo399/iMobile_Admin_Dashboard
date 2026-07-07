<template>
    <div class="inflow-customers app-container">
        <div class="ic-head">
            <el-input v-model="search" size="small" clearable class="ic-search"
                placeholder="Search customer…" prefix-icon="el-icon-search" @input="page = 1" />
            <span class="ic-spacer" />
            <span class="ic-meta">{{ filtered.length.toLocaleString() }} customers</span>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">Refresh</el-button>
        </div>

        <el-table v-loading="loading" :data="paged" border size="mini" height="calc(100vh - 210px)" @sort-change="onSort">
            <el-table-column prop="name" label="Customer" min-width="220" sortable="custom" show-overflow-tooltip>
                <template slot-scope="s">
                    <el-link type="primary" :underline="false" @click="viewStatement(s.row)">{{ s.row.name }}</el-link>
                </template>
            </el-table-column>
            <el-table-column prop="orderCount" label="Orders" width="90" align="right" sortable="custom" />
            <el-table-column prop="invoiced" label="Invoiced" width="130" align="right" sortable="custom">
                <template slot-scope="s">{{ money(s.row.invoiced) }}</template>
            </el-table-column>
            <el-table-column prop="credits" label="Credits" width="130" align="right" sortable="custom">
                <template slot-scope="s"><span :class="{ neg: s.row.credits < 0 }">{{ money(s.row.credits) }}</span></template>
            </el-table-column>
            <el-table-column prop="paid" label="Paid" width="130" align="right" sortable="custom">
                <template slot-scope="s">{{ money(s.row.paid) }}</template>
            </el-table-column>
            <el-table-column prop="outstanding" label="Outstanding" width="140" align="right" sortable="custom">
                <template slot-scope="s"><b :class="outClass(s.row.outstanding)">{{ money(s.row.outstanding) }}</b></template>
            </el-table-column>
            <el-table-column label="Portal" width="110" align="center">
                <template slot-scope="s">
                    <el-tag v-if="s.row.portalEnabled" size="mini" type="success">{{ s.row.portalUserCount || 0 }} user{{ s.row.portalUserCount === 1 ? '' : 's' }}</el-tag>
                    <span v-else class="ic-muted">—</span>
                </template>
            </el-table-column>
            <el-table-column label="" width="230" align="right">
                <template slot-scope="s">
                    <el-button size="mini" type="text" @click="viewStatement(s.row)">View statement</el-button>
                    <el-button v-hasPermi="['inflow:portal:manage']" size="mini" type="text" @click="openPortal(s.row)">{{ s.row.portalEnabled ? 'Manage Portal' : 'Enable User Portal' }}</el-button>
                </template>
            </el-table-column>
        </el-table>

        <div class="ic-pager">
            <el-pagination background layout="total, sizes, prev, pager, next"
                :total="filtered.length" :page-size="pageSize" :page-sizes="[25, 50, 100]"
                :current-page="page" @current-change="p => page = p" @size-change="onSize" />
        </div>

        <!-- User portal management -->
        <el-dialog :title="'User Portal — ' + (portalCustomer ? portalCustomer.name : '')" :visible.sync="portalVisible" width="640px">
            <div v-loading="portalLoading">
                <div class="ic-portal-status">
                    Portal is <el-tag size="mini" :type="portalEnabled ? 'success' : 'info'">{{ portalEnabled ? 'enabled' : 'not enabled' }}</el-tag>
                    <span class="ic-portal-hint">The customer signs in with a login below to view their statement.</span>
                </div>

                <el-table v-if="portalUsers.length" :data="portalUsers" size="mini" border class="ic-portal-table">
                    <el-table-column prop="username" label="Username" min-width="130" show-overflow-tooltip />
                    <el-table-column prop="email" label="Email" min-width="140" show-overflow-tooltip><template slot-scope="s">{{ s.row.email || '—' }}</template></el-table-column>
                    <el-table-column label="Status" width="90" align="center"><template slot-scope="s"><el-tag size="mini" :type="s.row.active === false ? 'info' : 'success'">{{ s.row.active === false ? 'Disabled' : 'Active' }}</el-tag></template></el-table-column>
                    <el-table-column label="" width="200" align="right">
                        <template slot-scope="s">
                            <el-button size="mini" type="text" @click="resetPortalPassword(s.row)">Reset PW</el-button>
                            <el-button size="mini" type="text" @click="togglePortalUser(s.row)">{{ s.row.active === false ? 'Enable' : 'Disable' }}</el-button>
                            <el-button size="mini" type="text" class="ic-del" @click="deletePortalUser(s.row)">Delete</el-button>
                        </template>
                    </el-table-column>
                </el-table>
                <div v-else class="ic-empty2">No portal logins yet.</div>

                <div class="ic-add">
                    <div class="ic-add-title">Add a login</div>
                    <el-form :inline="true" size="small" @submit.native.prevent>
                        <el-form-item><el-input v-model="addForm.username" placeholder="Username" style="width:150px" /></el-form-item>
                        <el-form-item><el-input v-model="addForm.password" placeholder="Password" style="width:150px" show-password /></el-form-item>
                        <el-form-item><el-input v-model="addForm.email" placeholder="Email (optional)" style="width:170px" /></el-form-item>
                        <el-form-item><el-button type="primary" :loading="adding" @click="addPortalUser">Add</el-button></el-form-item>
                    </el-form>
                </div>
            </div>
            <span slot="footer"><el-button size="small" @click="portalVisible = false">Close</el-button></span>
        </el-dialog>
    </div>
</template>

<script>
import { getInflowCustomers, getInflowPortal, createInflowPortalUser, updateInflowPortalUser, deleteInflowPortalUser } from '@/api/inflow'

export default {
    name: 'InflowCustomers',
    data() {
        return {
            loading: false,
            all: [],
            search: '',
            page: 1,
            pageSize: 25,
            sort: 'outstanding',
            order: 'descending',
            portalVisible: false,
            portalLoading: false,
            portalCustomer: null,
            portalEnabled: false,
            portalUsers: [],
            adding: false,
            addForm: { username: '', password: '', email: '' }
        }
    },
    computed: {
        filtered() {
            const q = (this.search || '').trim().toLowerCase()
            let rows = q ? this.all.filter(c => String(c.name || '').toLowerCase().indexOf(q) !== -1) : this.all.slice()
            if (this.sort) {
                const dir = this.order === 'ascending' ? 1 : -1
                rows.sort((a, b) => {
                    const av = a[this.sort], bv = b[this.sort]
                    if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv)) * dir
                    return ((av || 0) - (bv || 0)) * dir
                })
            }
            return rows
        },
        paged() {
            const start = (this.page - 1) * this.pageSize
            return this.filtered.slice(start, start + this.pageSize)
        }
    },
    created() {
        this.load()
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await getInflowCustomers()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.all = r.rows || []
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load customers'))
            } finally {
                this.loading = false
            }
        },
        onSort({ prop, order }) {
            this.sort = order ? prop : 'outstanding'
            this.order = order || 'descending'
            this.page = 1
        },
        onSize(s) { this.pageSize = s; this.page = 1 },
        viewStatement(row) {
            this.$router.push({ path: '/statement/index', query: { customer: row.name } })
        },
        async openPortal(row) {
            this.portalCustomer = row
            this.portalVisible = true
            this.addForm = { username: '', password: '', email: '' }
            await this.refreshPortal()
        },
        async refreshPortal() {
            this.portalLoading = true
            try {
                const r = await getInflowPortal(this.portalCustomer.name)
                if (r && r.success) { this.portalEnabled = r.portalEnabled; this.portalUsers = r.users || [] }
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load portal'))
            } finally { this.portalLoading = false }
        },
        async addPortalUser() {
            const u = (this.addForm.username || '').trim()
            const p = this.addForm.password
            if (!u || !p) { this.$message.warning('Username and password are required.'); return }
            this.adding = true
            try {
                const r = await createInflowPortalUser(this.portalCustomer.name, { username: u, password: p, email: (this.addForm.email || '').trim() })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success('Login created')
                this.addForm = { username: '', password: '', email: '' }
                await this.refreshPortal()
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to create login'))
            } finally { this.adding = false }
        },
        async togglePortalUser(user) {
            try {
                const r = await updateInflowPortalUser(this.portalCustomer.name, user._id, { active: user.active === false })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                await this.refreshPortal()
            } catch (e) { this.$message.error(this.msg(e, 'Failed to update login')) }
        },
        resetPortalPassword(user) {
            this.$prompt('New password for ' + user.username, 'Reset password', { inputType: 'password', confirmButtonText: 'Set', cancelButtonText: 'Cancel' })
                .then(async ({ value }) => {
                    if (!value) { this.$message.warning('Password required'); return }
                    try {
                        const r = await updateInflowPortalUser(this.portalCustomer.name, user._id, { password: value })
                        if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                        this.$message.success('Password reset')
                    } catch (e) { this.$message.error(this.msg(e, 'Failed to reset password')) }
                }).catch(() => {})
        },
        deletePortalUser(user) {
            this.$confirm(`Delete login "${user.username}"?`, 'Delete login', { type: 'warning', confirmButtonText: 'Delete', cancelButtonText: 'Cancel' })
                .then(async () => {
                    try {
                        const r = await deleteInflowPortalUser(this.portalCustomer.name, user._id)
                        if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                        this.$message.success('Login deleted')
                        await this.refreshPortal()
                        this.load()
                    } catch (e) { this.$message.error(this.msg(e, 'Failed to delete login')) }
                }).catch(() => {})
        },
        outClass(v) {
            if (v > 0) return 'owing'
            if (v < 0) return 'neg'
            return ''
        },
        money(v) {
            const n = Number(v)
            if (!isFinite(n)) return '—'
            return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        },
        msg(e, fallback) { return (e.response && e.response.data && e.response.data.message) || e.message || fallback }
    }
}
</script>

<style lang="scss" scoped>
.inflow-customers { padding: 12px 16px; }
.ic-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.ic-search { width: 260px; }
.ic-spacer { flex: 1; }
.ic-meta { font-size: 12px; color: #909399; margin-right: 6px; white-space: nowrap; }
.ic-pager { margin-top: 10px; text-align: right; }
.neg { color: #F56C6C; }
.owing { color: #E6A23C; }
.ic-muted { color: #c0c4cc; }
.ic-del { color: #F56C6C; }
.ic-portal-status { font-size: 13px; color: #606266; margin-bottom: 12px; }
.ic-portal-hint { color: #909399; font-size: 12px; margin-left: 8px; }
.ic-portal-table { margin-bottom: 14px; }
.ic-empty2 { color: #909399; font-size: 13px; margin: 8px 0 14px; }
.ic-add { border-top: 1px solid #ebeef5; padding-top: 12px; }
.ic-add-title { font-weight: 600; font-size: 13px; margin-bottom: 8px; color: #303133; }
</style>
