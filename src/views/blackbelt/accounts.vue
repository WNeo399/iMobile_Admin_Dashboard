<template>
    <div class="bb-page" v-loading="loading">
        <div class="bb-header">
            <div>
                <div class="bb-title">Blackbelt Accounts</div>
                <div class="bb-sub">Partner accounts and the SQT shops linked to each — one account can cover multiple shops.</div>
            </div>
            <div>
                <el-button type="success" size="small" icon="el-icon-plus" @click="openCreate">New Account</el-button>
                <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">Refresh</el-button>
            </div>
        </div>

        <el-table :data="accounts" size="small" class="bb-table">
            <el-table-column label="Account" min-width="160">
                <template slot-scope="s"><span class="bb-name">{{ s.row.name }}</span></template>
            </el-table-column>
            <el-table-column label="Email" prop="email" min-width="180" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.email || '—' }}</template>
            </el-table-column>
            <el-table-column label="Contact Number" prop="contactNumber" width="150">
                <template slot-scope="s">{{ s.row.contactNumber || '—' }}</template>
            </el-table-column>
            <el-table-column label="Rate" width="100" align="right">
                <template slot-scope="s">
                    <b v-if="s.row.negotiatedRate != null">${{ s.row.negotiatedRate }}</b>
                    <span v-else class="bb-dash" title="Not negotiated yet">—</span>
                </template>
            </el-table-column>
            <el-table-column label="Linked SQT Shops" min-width="260">
                <template slot-scope="s">
                    <template v-if="s.row.shops.length">
                        <el-tag v-for="shop in s.row.shops.slice(0, 4)" :key="shop._id" size="mini" class="bb-shop-tag">
                            {{ shop.storeName }}
                        </el-tag>
                        <el-tooltip v-if="s.row.shops.length > 4" placement="top">
                            <div slot="content">{{ s.row.shops.slice(4).map(x => x.storeName).join(', ') }}</div>
                            <el-tag size="mini" type="info" class="bb-shop-tag">+{{ s.row.shops.length - 4 }} more</el-tag>
                        </el-tooltip>
                    </template>
                    <span v-else class="bb-dash">—</span>
                </template>
            </el-table-column>
            <el-table-column label="Actions" width="150" align="center">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-view" @click="openEdit(s.row)">View</el-button>
                    <el-button size="mini" type="text" icon="el-icon-delete" class="bb-del" @click="removeAccount(s.row)">Delete</el-button>
                </template>
            </el-table-column>
            <template slot="empty"><span class="bb-empty">No accounts yet — create the first one.</span></template>
        </el-table>

        <!-- Create / view+edit. Existing accounts get tabs (Details editable +
             their invoices); a new account is just the details form. -->
        <el-dialog :visible.sync="dialogVisible" width="640px" append-to-body :close-on-click-modal="false">
            <div slot="title" class="bb-dialog-title"><i class="el-icon-office-building" /> {{ editing._id ? editing.name || 'Account' : 'New Account' }}</div>
            <el-tabs v-if="editing._id" v-model="activeTab">
                <el-tab-pane label="Details" name="details" />
                <el-tab-pane :label="`Invoices (${accountInvoices.length})`" name="invoices" />
            </el-tabs>

            <el-form v-show="!editing._id || activeTab === 'details'" label-position="top" size="small" @submit.native.prevent>
                <el-form-item label="Name" required>
                    <el-input v-model="editing.name" maxlength="120" />
                </el-form-item>
                <div class="bb-form-row">
                    <el-form-item label="Email" class="bb-form-col">
                        <el-input v-model="editing.email" type="email" placeholder="name@example.com" />
                    </el-form-item>
                    <el-form-item label="Contact Number" class="bb-form-col">
                        <el-input v-model="editing.contactNumber" placeholder="04xx xxx xxx" />
                    </el-form-item>
                    <el-form-item label="Rate" class="bb-form-rate">
                        <el-input v-model="editing.negotiatedRate" type="number" min="0" placeholder="0.00">
                            <template slot="prepend">$</template>
                        </el-input>
                    </el-form-item>
                </div>
                <el-form-item>
                    <template slot="label">
                        Linked SQT shops
                        <span class="bb-label-hint">— selecting a shop already on another account moves it here</span>
                    </template>
                    <el-select v-model="editing.shopIds" multiple filterable clearable collapse-tags
                        placeholder="Select shops…" style="width: 100%" :loading="shopsLoading">
                        <el-option v-for="shop in sqtShops" :key="shop._id" :value="shop._id" :label="shop.storeName">
                            <span>{{ shop.storeName }}</span>
                            <span v-if="linkedElsewhere(shop)" class="bb-opt-note">linked to {{ accountName(shop.blackbeltAccountId) }}</span>
                            <span v-else-if="shop.status && shop.status !== 'active'" class="bb-opt-note">{{ shop.status }}</span>
                        </el-option>
                    </el-select>
                </el-form-item>
            </el-form>

            <div v-if="editing._id && activeTab === 'invoices'">
                <el-table :data="accountInvoices" size="mini" v-loading="invoicesLoading" max-height="360">
                    <el-table-column label="Invoice #" prop="number" width="110" />
                    <el-table-column label="Qty" prop="qty" width="70" align="center" />
                    <el-table-column label="Rate" width="80" align="right">
                        <template slot-scope="s">${{ s.row.rate }}</template>
                    </el-table-column>
                    <el-table-column label="Total" width="100" align="right">
                        <template slot-scope="s"><b>{{ money(s.row.total) }}</b></template>
                    </el-table-column>
                    <el-table-column label="Payment" width="90" align="center">
                        <template slot-scope="s">
                            <el-tag v-if="s.row.paymentStatus === 'paid'" size="mini" type="success">Paid</el-tag>
                            <el-tag v-else size="mini" type="warning">Unpaid</el-tag>
                        </template>
                    </el-table-column>
                    <el-table-column label="Created" width="100" align="center">
                        <template slot-scope="s">{{ dateStr(s.row.createdAt) }}</template>
                    </el-table-column>
                    <template slot="empty"><span class="bb-empty">No invoices for this account yet.</span></template>
                </el-table>
                <div v-if="accountInvoices.length" class="bb-inv-summary">
                    {{ accountInvoices.length }} invoice{{ accountInvoices.length === 1 ? '' : 's' }} ·
                    total {{ money(accountInvoices.reduce((t, i) => t + (i.total || 0), 0)) }} ·
                    unpaid {{ money(accountInvoices.filter(i => i.paymentStatus !== 'paid').reduce((t, i) => t + (i.total || 0), 0)) }}
                </div>
            </div>

            <span slot="footer">
                <el-button size="small" @click="dialogVisible = false">Close</el-button>
                <el-button v-show="!editing._id || activeTab === 'details'" type="primary" size="small" :loading="saving" @click="save">Save</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import {
    getBlackbeltAccounts, createBlackbeltAccount, updateBlackbeltAccount,
    deleteBlackbeltAccount, getBlackbeltSqtShops, setBlackbeltAccountShops,
    getBlackbeltInvoices
} from '@/api/blackbelt'

function blankAccount() {
    return { _id: null, name: '', email: '', contactNumber: '', negotiatedRate: '', shopIds: [] }
}

export default {
    name: 'BlackbeltAccounts',
    data() {
        return {
            loading: false,
            accounts: [],
            sqtShops: [],
            shopsLoading: false,
            dialogVisible: false,
            editing: blankAccount(),
            saving: false,
            activeTab: 'details',
            accountInvoices: [],
            invoicesLoading: false
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
                const r = await getBlackbeltAccounts()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.accounts = r.accounts || []
                this.maybeOpenFromQuery()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load accounts'))
            } finally {
                this.loading = false
            }
        },
        // Deep link from the Invoices page: /blackbelt/accounts?open=<id>
        // opens that account's detail dialog once the list has loaded.
        maybeOpenFromQuery() {
            const id = this.$route.query && this.$route.query.open
            if (!id) return
            const row = this.accounts.find(a => String(a._id) === String(id))
            // Clear the query either way so revisiting the page doesn't re-open.
            this.$router.replace({ query: {} }).catch(() => {})
            if (row) this.openEdit(row)
        },
        async loadShops() {
            this.shopsLoading = true
            try {
                const r = await getBlackbeltSqtShops()
                if (r && r.success) this.sqtShops = r.shops || []
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load SQT shops'))
            } finally {
                this.shopsLoading = false
            }
        },
        openCreate() {
            this.editing = blankAccount()
            this.activeTab = 'details'
            this.accountInvoices = []
            this.dialogVisible = true
            this.loadShops()
        },
        openEdit(row) {
            this.editing = {
                _id: row._id,
                name: row.name,
                email: row.email || '',
                contactNumber: row.contactNumber || '',
                negotiatedRate: row.negotiatedRate != null ? String(row.negotiatedRate) : '',
                shopIds: (row.shops || []).map(s => s._id)
            }
            this.activeTab = 'details'
            this.dialogVisible = true
            this.loadShops()
            this.loadAccountInvoices(row._id)
        },
        async loadAccountInvoices(accountId) {
            this.accountInvoices = []
            this.invoicesLoading = true
            try {
                const r = await getBlackbeltInvoices({ accountId })
                if (r && r.success) this.accountInvoices = r.invoices || []
            } catch (e) { /* tab shows empty; page toast would be noise */ } finally {
                this.invoicesLoading = false
            }
        },
        // Is this shop linked to a different account than the one being edited?
        linkedElsewhere(shop) {
            return shop.blackbeltAccountId && String(shop.blackbeltAccountId) !== String(this.editing._id || '')
        },
        accountName(accountId) {
            const a = this.accounts.find(x => String(x._id) === String(accountId))
            return a ? a.name : 'another account'
        },
        async save() {
            const name = (this.editing.name || '').trim()
            if (!name) { this.$message.warning('Please enter the account name.'); return }
            this.saving = true
            try {
                const payload = {
                    name,
                    email: (this.editing.email || '').trim(),
                    contactNumber: (this.editing.contactNumber || '').trim(),
                    negotiatedRate: this.editing.negotiatedRate
                }
                let accountId = this.editing._id
                if (accountId) {
                    const r = await updateBlackbeltAccount(accountId, payload)
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                } else {
                    const r = await createBlackbeltAccount(payload)
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    accountId = r.account._id
                }
                const rl = await setBlackbeltAccountShops(accountId, this.editing.shopIds || [])
                if (!rl || rl.success === false) throw new Error((rl && rl.message) || 'Failed to link shops')
                this.$message.success('Saved.')
                this.dialogVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Save failed'))
            } finally {
                this.saving = false
            }
        },
        async removeAccount(row) {
            try {
                await this.$confirm(
                    `Delete account "${row.name}"?${row.shops.length ? ` Its ${row.shops.length} linked shop${row.shops.length === 1 ? '' : 's'} will be unlinked.` : ''}`,
                    'Delete account',
                    { confirmButtonText: 'Delete', cancelButtonText: 'Cancel', type: 'warning' }
                )
            } catch (e) { return }
            try {
                const r = await deleteBlackbeltAccount(row._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success('Account deleted.')
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Delete failed'))
            }
        },
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
.bb-page { padding: 16px 20px; min-height: calc(100vh - 84px); background: #f6f8fb; }
.bb-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.bb-title { font-size: 20px; font-weight: 700; color: #1f2937; line-height: 1.2; }
.bb-sub { font-size: 13px; color: #909399; margin-top: 3px; }
.bb-table { width: 100%; background: #fff; border: 1px solid #ebeef5; border-radius: 8px; }
.bb-name { font-weight: 600; color: #303133; }
.bb-shop-tag { margin: 2px 4px 2px 0; }
.bb-dash { color: #c0c4cc; }
.bb-del { color: #f56c6c; }
.bb-empty { color: #909399; font-size: 13px; }
.bb-dialog-title { font-size: 15px; font-weight: 600; color: #303133; }
.bb-dialog-title i { color: #409eff; margin-right: 6px; }
.bb-form-row { display: flex; gap: 12px; }
.bb-form-col { flex: 1; }
.bb-form-rate { width: 140px; flex-shrink: 0; }
.bb-label-hint { font-size: 11px; color: #c0c4cc; font-weight: normal; }
.bb-opt-note { float: right; font-size: 11px; color: #E6A23C; margin-left: 12px; }
.bb-inv-summary { margin-top: 10px; font-size: 12.5px; color: #606266; text-align: right; }
</style>
