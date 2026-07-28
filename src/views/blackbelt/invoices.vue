<template>
    <div class="bi-page" v-loading="loading">
        <div class="bi-header">
            <div>
                <div class="bi-title">Blackbelt Invoices</div>
                <div class="bi-sub">Invoices billed to Blackbelt accounts — qty × the account's rate at the time of invoicing.</div>
            </div>
            <div>
                <el-select v-model="accountFilter" size="small" placeholder="All accounts" clearable filterable
                    style="width: 200px; margin-right: 8px" @change="load">
                    <el-option v-for="a in accounts" :key="a._id" :label="a.name" :value="a._id" />
                </el-select>
                <el-button type="success" size="small" icon="el-icon-plus" @click="openCreate">New Invoice</el-button>
                <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">Refresh</el-button>
            </div>
        </div>

        <el-table :data="invoices" size="small" class="bi-table">
            <el-table-column label="Invoice #" prop="number" width="180">
                <template slot-scope="s"><span class="bi-number">{{ s.row.number }}</span></template>
            </el-table-column>
            <el-table-column label="Account" min-width="160" show-overflow-tooltip>
                <template slot-scope="s">
                    <span class="bi-account-link" title="Open account detail" @click="goAccount(s.row)">{{ liveAccountName(s.row) }}</span>
                </template>
            </el-table-column>
            <el-table-column label="Rate" width="100" align="right">
                <template slot-scope="s">${{ s.row.rate }}</template>
            </el-table-column>
            <el-table-column label="Qty" prop="qty" width="80" align="center" />
            <el-table-column label="Total" width="120" align="right">
                <template slot-scope="s"><b>{{ money(s.row.total) }}</b></template>
            </el-table-column>
            <el-table-column label="Payment" width="100" align="center">
                <template slot-scope="s">
                    <el-tag v-if="s.row.paymentStatus === 'paid'" size="mini" type="success">Paid</el-tag>
                    <el-tag v-else size="mini" type="warning">Unpaid</el-tag>
                </template>
            </el-table-column>
            <el-table-column label="Created" width="150" align="center">
                <template slot-scope="s">{{ dateStr(s.row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="By" prop="createdBy" width="130" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.createdBy || '—' }}</template>
            </el-table-column>
            <el-table-column label="Action" width="160" align="center">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-view" @click="downloadPdf(s.row)">View Invoice</el-button>
                    <el-dropdown trigger="click" class="bi-more" @command="cmd => onRowCommand(cmd, s.row)">
                        <el-button size="mini" type="text" class="bi-more-btn">···</el-button>
                        <el-dropdown-menu slot="dropdown">
                            <el-dropdown-item v-if="s.row.paymentStatus !== 'paid'" command="paid" icon="el-icon-check">Mark Paid</el-dropdown-item>
                            <el-dropdown-item v-else command="unpaid" icon="el-icon-refresh-left">Mark Unpaid</el-dropdown-item>
                            <el-dropdown-item command="delete" icon="el-icon-delete" class="bi-drop-del">Delete</el-dropdown-item>
                        </el-dropdown-menu>
                    </el-dropdown>
                </template>
            </el-table-column>
            <template slot="empty"><span class="bi-empty">No invoices yet.</span></template>
        </el-table>

        <!-- New invoice -->
        <el-dialog :visible.sync="dialogVisible" width="480px" append-to-body :close-on-click-modal="false">
            <div slot="title" class="bi-dialog-title"><i class="el-icon-tickets" /> New Invoice</div>
            <el-form label-position="top" size="small" class="bi-form" @submit.native.prevent>
                <el-form-item label="Account" required>
                    <el-select v-model="form.accountId" placeholder="Select account" filterable style="width: 100%">
                        <el-option v-for="a in accounts" :key="a._id" :value="a._id" :label="a.name"
                            :disabled="a.negotiatedRate == null">
                            <span>{{ a.name }}</span>
                            <span class="bi-opt-rate">{{ a.negotiatedRate != null ? '$' + a.negotiatedRate : 'no rate set' }}</span>
                        </el-option>
                    </el-select>
                </el-form-item>
                <div class="bi-form-row">
                    <el-form-item label="Qty" required class="bi-form-col">
                        <el-input-number v-model="form.qty" :min="1" :precision="0" controls-position="right" style="width: 100%" />
                    </el-form-item>
                    <el-form-item label="Rate" class="bi-form-col">
                        <el-input :value="selectedAccount && selectedAccount.negotiatedRate != null ? selectedAccount.negotiatedRate : ''"
                            disabled placeholder="—">
                            <template slot="prepend">$</template>
                        </el-input>
                    </el-form-item>
                </div>
                <el-form-item label="Note">
                    <el-input v-model="form.note" type="textarea" :autosize="{ minRows: 2, maxRows: 5 }"
                        maxlength="500" show-word-limit placeholder="Optional — printed on the invoice under the items table" />
                </el-form-item>
            </el-form>
            <div class="bi-total">
                <span class="bi-total-label">Total</span>
                <span class="bi-total-calc">
                    <template v-if="selectedAccount && selectedAccount.negotiatedRate != null">
                        ${{ selectedAccount.negotiatedRate }} × {{ form.qty || 0 }} =
                    </template>
                    <b>{{ money(computedTotal) }}</b>
                </span>
            </div>
            <span slot="footer">
                <el-button size="small" @click="dialogVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" :loading="creating"
                    :disabled="!form.accountId || !form.qty"
                    @click="create">Create Invoice</el-button>
            </span>
        </el-dialog>

        <!-- PDF preview -->
        <el-dialog :visible.sync="previewVisible" width="760px" top="4vh" append-to-body
            custom-class="bi-preview-dialog" @closed="cleanupPreview">
            <div slot="title" class="bi-dialog-title"><i class="el-icon-view" /> {{ previewNumber }}</div>
            <iframe v-if="previewUrl" ref="previewFrame" :src="previewUrl" class="bi-preview-frame" />
            <span slot="footer">
                <el-button size="small" @click="previewVisible = false">Close</el-button>
                <el-button size="small" icon="el-icon-printer" @click="printPreview">Print</el-button>
                <el-button type="primary" size="small" icon="el-icon-download" @click="downloadPreview">Download</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import { getBlackbeltAccounts, getBlackbeltInvoices, createBlackbeltInvoice, deleteBlackbeltInvoice, setBlackbeltInvoicePayment } from '@/api/blackbelt'
import { buildBlackbeltInvoicePdf } from '@/utils/blackbeltInvoicePdf'

export default {
    name: 'BlackbeltInvoices',
    data() {
        return {
            loading: false,
            invoices: [],
            accounts: [],
            accountFilter: '',
            dialogVisible: false,
            form: { accountId: '', qty: 1, note: '' },
            creating: false,
            previewVisible: false,
            previewUrl: '',
            previewDoc: null,
            previewNumber: ''
        }
    },
    computed: {
        selectedAccount() {
            return this.accounts.find(a => String(a._id) === String(this.form.accountId)) || null
        },
        computedTotal() {
            if (!this.selectedAccount || this.selectedAccount.negotiatedRate == null || !this.form.qty) return 0
            return Math.round(this.selectedAccount.negotiatedRate * this.form.qty * 100) / 100
        }
    },
    created() {
        this.load()
        this.loadAccounts()
    },
    // Keep-alive: created() doesn't re-run when navigating back to a cached
    // page, so refresh here — otherwise an account added on the Accounts page
    // never shows up in the create dialog.
    activated() {
        this.load()
        this.loadAccounts()
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await getBlackbeltInvoices(this.accountFilter ? { accountId: this.accountFilter } : {})
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.invoices = r.invoices || []
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load invoices'))
            } finally {
                this.loading = false
            }
        },
        async loadAccounts() {
            try {
                const r = await getBlackbeltAccounts()
                if (r && r.success) this.accounts = r.accounts || []
            } catch (e) { /* select stays empty; invoices list still works */ }
        },
        openCreate() {
            this.form = { accountId: this.accountFilter || '', qty: 1, note: '' }
            this.dialogVisible = true
            // Belt-and-braces freshness: re-pull accounts every time the
            // dialog opens, so a just-created account (or freshly negotiated
            // rate) is always selectable.
            this.loadAccounts()
        },
        async create() {
            this.creating = true
            try {
                const r = await createBlackbeltInvoice({ accountId: this.form.accountId, qty: this.form.qty, note: (this.form.note || '').trim() })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(`Invoice ${r.invoice.number} created — ${this.money(r.invoice.total)}.`)
                this.dialogVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to create invoice'))
            } finally {
                this.creating = false
            }
        },
        onRowCommand(cmd, row) {
            if (cmd === 'paid') this.setPayment(row, 'paid')
            else if (cmd === 'unpaid') this.setPayment(row, 'unpaid')
            else if (cmd === 'delete') this.removeInvoice(row)
        },
        // The account's CURRENT name (accounts list) — the invoice only holds a
        // snapshot from creation time. Falls back to the snapshot if the
        // account list hasn't loaded or the account was deleted.
        liveAccountName(row) {
            const acc = this.accounts.find(a => String(a._id) === String(row.accountId))
            return acc ? acc.name : row.accountName
        },
        goAccount(row) {
            this.$router.push({ path: '/blackbelt/accounts', query: { open: String(row.accountId) } })
        },
        // Build the PDF and show it in a preview dialog (download/print from there).
        downloadPdf(row) {
            try {
                const doc = buildBlackbeltInvoicePdf({ ...row, accountName: this.liveAccountName(row) })
                this.previewDoc = doc
                this.previewNumber = row.number
                // #toolbar=0 hides the browser viewer chrome — our footer buttons
                // cover download/print.
                this.previewUrl = doc.output('bloburl') + '#toolbar=0'
                this.previewVisible = true
            } catch (e) {
                console.error('Invoice PDF failed:', e)
                this.$message.error('Could not build the invoice PDF.')
            }
        },
        downloadPreview() {
            if (this.previewDoc) this.previewDoc.save(`${this.previewNumber}.pdf`)
        },
        printPreview() {
            const frame = this.$refs.previewFrame
            try {
                frame.contentWindow.focus()
                frame.contentWindow.print()
            } catch (e) {
                // Cross-origin/viewer quirks — fall back to a tab with auto-print.
                if (this.previewDoc) {
                    this.previewDoc.autoPrint()
                    window.open(this.previewDoc.output('bloburl'), '_blank')
                }
            }
        },
        cleanupPreview() {
            if (this.previewUrl) {
                try { URL.revokeObjectURL(this.previewUrl.split('#')[0]) } catch (e) { /* ignore */ }
            }
            this.previewUrl = ''
            this.previewDoc = null
            this.previewNumber = ''
        },
        async setPayment(row, status) {
            if (status === 'unpaid') {
                try {
                    await this.$confirm(`Mark invoice ${row.number} back to unpaid?`, 'Payment status',
                        { confirmButtonText: 'Mark Unpaid', cancelButtonText: 'Cancel', type: 'warning' })
                } catch (e) { return }
            }
            try {
                const r = await setBlackbeltInvoicePayment(row._id, status)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(`${row.number} marked ${status}.`)
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to update payment status'))
            }
        },
        async removeInvoice(row) {
            try {
                await this.$confirm(`Delete invoice ${row.number} (${this.money(row.total)} to ${row.accountName})?`, 'Delete invoice',
                    { confirmButtonText: 'Delete', cancelButtonText: 'Cancel', type: 'warning' })
            } catch (e) { return }
            try {
                const r = await deleteBlackbeltInvoice(row._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success('Invoice deleted.')
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
            return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()} ${p(x.getHours())}:${p(x.getMinutes())}`
        },
        msg(e, fallback) {
            return (e.response && e.response.data && e.response.data.message) || e.message || fallback
        }
    }
}
</script>

<style scoped>
.bi-page { padding: 16px 20px; min-height: calc(100vh - 84px); background: #f6f8fb; }
.bi-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.bi-title { font-size: 20px; font-weight: 700; color: #1f2937; line-height: 1.2; }
.bi-sub { font-size: 13px; color: #909399; margin-top: 3px; }
.bi-table { width: 100%; background: #fff; border: 1px solid #ebeef5; border-radius: 8px; }
.bi-number { font-family: Consolas, Menlo, monospace; font-size: 12.5px; color: #303133; }
.bi-del { color: #f56c6c; }
.bi-account-link { color: #409eff; cursor: pointer; font-weight: 500; }
.bi-account-link:hover { text-decoration: underline; }
.bi-more { margin-left: 8px; }
.bi-more-btn { font-weight: 700; letter-spacing: 1px; color: #909399; }
.bi-more-btn:hover { color: #409eff; }
.bi-drop-del { color: #f56c6c; }
.bi-empty { color: #909399; font-size: 13px; }
.bi-dialog-title { font-size: 15px; font-weight: 600; color: #303133; }
.bi-dialog-title i { color: #409eff; margin-right: 6px; }
.bi-opt-rate { float: right; font-size: 12px; color: #909399; margin-left: 12px; }
.bi-form ::v-deep .el-form-item { margin-bottom: 14px; }
.bi-form-row { display: flex; gap: 12px; }
.bi-form-col { flex: 1; }
.bi-preview-frame { width: 100%; height: 72vh; border: 1px solid #ebeef5; border-radius: 6px; background: #525659; }
::v-deep .bi-preview-dialog .el-dialog__body { padding: 10px 16px 0; }
.bi-total {
    display: flex; align-items: center; justify-content: space-between;
    background: #f6f8fb; border: 1px solid #ebeef5; border-radius: 8px;
    padding: 10px 14px; margin-top: 4px;
}
.bi-total-label { font-size: 13px; color: #909399; }
.bi-total-calc { font-size: 14px; color: #303133; }
.bi-total-calc b { font-size: 17px; }
</style>
