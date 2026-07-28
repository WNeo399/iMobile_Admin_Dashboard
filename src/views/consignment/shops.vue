<template>
    <div class="cs-page" v-loading="loading">
        <div class="cs-header">
            <div>
                <div class="cs-title">Consignment Shops</div>
                <div class="cs-sub">Partner shops and their logins.</div>
            </div>
            <div>
                <el-button type="success" size="small" icon="el-icon-plus" @click="openCreate">New Shop</el-button>
                <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">Refresh</el-button>
            </div>
        </div>

        <el-table :data="shops" size="small" class="cs-table">
            <el-table-column label="Shop" min-width="180">
                <template slot-scope="s">
                    <span class="cs-name">{{ s.row.name }}</span>
                    <el-tag v-if="s.row.active === false" size="mini" type="info" style="margin-left:6px">Inactive</el-tag>
                </template>
            </el-table-column>
            <el-table-column label="In Transit" width="95" align="center">
                <template slot-scope="s">{{ s.row.stats.counts['in-transit'] || 0 }}</template>
            </el-table-column>
            <el-table-column label="At Shop" width="90" align="center">
                <template slot-scope="s">{{ s.row.stats.counts['received'] || 0 }}</template>
            </el-table-column>
            <el-table-column label="Returning" width="95" align="center">
                <template slot-scope="s">{{ s.row.stats.counts['returning'] || 0 }}</template>
            </el-table-column>
            <el-table-column label="Sold" width="150" align="center">
                <template slot-scope="s">
                    <b v-if="s.row.stats.uninvoicedSold">{{ s.row.stats.uninvoicedSold }} · {{ money(s.row.stats.uninvoicedValue) }}</b>
                    <span v-else class="cs-dash">—</span>
                </template>
            </el-table-column>
            <el-table-column label="Logins" width="80" align="center">
                <template slot-scope="s">{{ s.row.loginCount }}</template>
            </el-table-column>
            <el-table-column label="Actions" width="200" align="center" class-name="small-padding">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-user" @click="openLogins(s.row)">Logins</el-button>
                    <el-button size="mini" type="text" icon="el-icon-edit" @click="openEdit(s.row)">Edit</el-button>
                </template>
            </el-table-column>
            <template slot="empty"><span class="cs-empty">No shops yet — create the first one.</span></template>
        </el-table>

        <!-- Create / edit shop -->
        <el-dialog :visible.sync="shopDialog" width="420px" append-to-body :close-on-click-modal="false">
            <div slot="title" class="cs-dialog-title"><i class="el-icon-s-shop" /> {{ editingShop._id ? 'Edit Shop' : 'New Shop' }}</div>
            <el-form label-position="top" size="small" @submit.native.prevent>
                <el-form-item label="Shop name" required>
                    <el-input v-model="editingShop.name" maxlength="80" @keyup.enter.native="saveShop" />
                </el-form-item>
                <el-form-item v-if="editingShop._id">
                    <el-switch v-model="editingShop.active" active-text="Active" />
                </el-form-item>
            </el-form>
            <span slot="footer">
                <el-button size="small" @click="shopDialog = false">Cancel</el-button>
                <el-button type="primary" size="small" :loading="savingShop" @click="saveShop">Save</el-button>
            </span>
        </el-dialog>

        <!-- Logins -->
        <el-dialog :visible.sync="loginsDialog" width="560px" append-to-body :close-on-click-modal="false">
            <div slot="title" class="cs-dialog-title"><i class="el-icon-user" /> Logins — {{ activeShop && activeShop.name }}</div>
            <el-table :data="logins" size="mini" v-loading="loginsLoading">
                <el-table-column label="Username" prop="username" min-width="140" />
                <el-table-column label="Name" prop="name" min-width="140" show-overflow-tooltip />
                <el-table-column label="Created" width="100" align="center">
                    <template slot-scope="s">{{ dateStr(s.row.createdAt) }}</template>
                </el-table-column>
                <el-table-column label="" width="120" align="center">
                    <template slot-scope="s">
                        <el-button size="mini" type="text" icon="el-icon-key" @click="resetPassword(s.row)">Reset PW</el-button>
                    </template>
                </el-table-column>
                <template slot="empty"><span class="cs-empty">No logins yet.</span></template>
            </el-table>
            <div class="cs-newlogin">
                <div class="cs-newlogin-title">Add a login</div>
                <div class="cs-newlogin-row">
                    <el-input v-model="newLogin.username" size="small" placeholder="Username" style="width: 160px" />
                    <el-input v-model="newLogin.password" size="small" placeholder="Password (min 6)" show-password style="width: 170px" />
                    <el-input v-model="newLogin.name" size="small" placeholder="Display name (optional)" style="width: 170px" />
                    <el-button type="primary" size="small" :loading="creatingLogin" @click="addLogin">Add</el-button>
                </div>
            </div>
        </el-dialog>

    </div>
</template>

<script>
import {
    getConsignShops, createConsignShop, updateConsignShop,
    getConsignLogins, createConsignLogin, resetConsignLoginPassword
} from '@/api/consignment'

export default {
    name: 'ConsignmentShops',
    data() {
        return {
            loading: false,
            shops: [],
            shopDialog: false,
            editingShop: { _id: null, name: '', active: true },
            savingShop: false,
            activeShop: null,
            loginsDialog: false,
            loginsLoading: false,
            logins: [],
            newLogin: { username: '', password: '', name: '' },
            creatingLogin: false
        }
    },
    created() {
        this.load()
    },
    // Keep-alive revisits skip created() — refresh so cross-page changes show.
    activated() {
        this.load()
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await getConsignShops()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.shops = r.shops || []
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load shops'))
            } finally {
                this.loading = false
            }
        },
        // ── Shop create / edit ──
        openCreate() {
            this.editingShop = { _id: null, name: '', active: true }
            this.shopDialog = true
        },
        openEdit(shop) {
            this.editingShop = { _id: shop._id, name: shop.name, active: shop.active !== false }
            this.shopDialog = true
        },
        async saveShop() {
            const name = (this.editingShop.name || '').trim()
            if (!name) { this.$message.warning('Please enter the shop name.'); return }
            this.savingShop = true
            try {
                const r = this.editingShop._id
                    ? await updateConsignShop(this.editingShop._id, { name, active: this.editingShop.active })
                    : await createConsignShop({ name })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success('Saved.')
                this.shopDialog = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Save failed'))
            } finally {
                this.savingShop = false
            }
        },
        // ── Logins ──
        async openLogins(shop) {
            this.activeShop = shop
            this.logins = []
            this.newLogin = { username: '', password: '', name: '' }
            this.loginsDialog = true
            this.loginsLoading = true
            try {
                const r = await getConsignLogins(shop._id)
                if (r && r.success) this.logins = r.logins || []
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load logins'))
            } finally {
                this.loginsLoading = false
            }
        },
        async addLogin() {
            const { username, password } = this.newLogin
            if (!username.trim() || !password) { this.$message.warning('Username and password are required.'); return }
            this.creatingLogin = true
            try {
                const r = await createConsignLogin(this.activeShop._id, {
                    username: username.trim(),
                    password,
                    name: (this.newLogin.name || '').trim()
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(`Login "${r.login.username}" created.`)
                this.newLogin = { username: '', password: '', name: '' }
                this.openLogins(this.activeShop)
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to create login'))
            } finally {
                this.creatingLogin = false
            }
        },
        async resetPassword(login) {
            let value
            try {
                const r = await this.$prompt(`New password for "${login.username}" (min 6 characters):`, 'Reset password', {
                    confirmButtonText: 'Reset', cancelButtonText: 'Cancel', inputType: 'password',
                    inputValidator: v => (v && v.length >= 6) || 'At least 6 characters'
                })
                value = r.value
            } catch (e) { return }
            try {
                const r = await resetConsignLoginPassword(login._id, value)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success('Password reset.')
            } catch (e) {
                this.$message.error(this.msg(e, 'Reset failed'))
            }
        },
        // ── Formatting ──
        money(v) {
            if (v == null || v === '') return '—'
            return '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        },
        dateStr(d) {
            if (!d) return '—'
            const x = new Date(d)
            if (isNaN(x.getTime())) return '—'
            const p = n => String(n).padStart(2, '0')
            return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${String(x.getFullYear()).slice(2)}`
        },
        msg(e, fallback) {
            return (e.response && e.response.data && e.response.data.message) || e.message || fallback
        }
    }
}
</script>

<style scoped>
.cs-page { padding: 16px 20px; min-height: calc(100vh - 84px); background: #f6f8fb; }
.cs-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.cs-title { font-size: 20px; font-weight: 700; color: #1f2937; line-height: 1.2; }
.cs-sub { font-size: 13px; color: #909399; margin-top: 3px; }
.cs-table { width: 100%; background: #fff; border: 1px solid #ebeef5; border-radius: 8px; }
.cs-name { font-weight: 600; color: #303133; }
.cs-dash { color: #c0c4cc; }
.cs-empty { color: #909399; font-size: 13px; }
.cs-dialog-title { font-size: 15px; font-weight: 600; color: #303133; }
.cs-dialog-title i { color: #409eff; margin-right: 6px; }
.cs-newlogin { margin-top: 14px; border-top: 1px dashed #ebeef5; padding-top: 12px; }
.cs-newlogin-title { font-size: 13px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.cs-newlogin-row { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
