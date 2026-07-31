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
                            <el-dropdown-item command="email" icon="el-icon-message">Email Invoice</el-dropdown-item>
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
        <el-dialog :visible.sync="dialogVisible" width="540px" append-to-body :close-on-click-modal="false">
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
                    <el-form-item label="Due Date" class="bi-form-col">
                        <el-date-picker v-model="form.dueDate" type="date" value-format="yyyy-MM-dd"
                            :clearable="false" style="width: 100%" />
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

        <!-- Email compose — laid out like a mail client: inline address
             fields, a borderless body, attachment chips at the bottom -->
        <el-dialog :visible.sync="emailVisible" width="640px" append-to-body :close-on-click-modal="false" custom-class="bi-email-dialog">
            <div slot="title" class="bi-dialog-title">
                <i class="el-icon-message" /> Email {{ emailRow && emailRow.number }}
                <span v-if="emailRow" class="bi-email-context">{{ money(emailRow.total) }} · {{ liveAccountName(emailRow) }}</span>
            </div>
            <div class="bi-email">
                <div class="bi-email-field">
                    <span class="bi-email-label">To</span>
                    <el-select v-model="emailForm.to" size="small" multiple filterable allow-create default-first-option
                        placeholder="Type an address and press Enter" class="bi-email-select"
                        @change="list => captureTyped(list, 'typedTo')">
                        <el-option v-for="o in toOptions" :key="o.email" :value="o.email" :label="o.email">
                            <span>{{ o.email }}</span>
                            <span v-if="o.name" class="bi-opt-rate">{{ o.name }}</span>
                        </el-option>
                    </el-select>
                </div>
                <div class="bi-email-field">
                    <span class="bi-email-label">Cc</span>
                    <el-select v-model="emailForm.cc" size="small" multiple filterable allow-create default-first-option
                        placeholder="optional" class="bi-email-select"
                        @change="list => captureTyped(list, 'typedCc')">
                        <el-option v-for="o in ccOptions" :key="o.email" :value="o.email" :label="o.email">
                            <span>{{ o.email }}</span>
                            <span v-if="o.name" class="bi-opt-rate">{{ o.name }}</span>
                        </el-option>
                    </el-select>
                </div>
                <div class="bi-email-field">
                    <span class="bi-email-label">Subject</span>
                    <el-input v-model="emailForm.subject" size="small" maxlength="200" class="bi-email-subject" />
                </div>
                <el-input v-model="emailForm.body" type="textarea" :autosize="{ minRows: 9, maxRows: 16 }"
                    maxlength="5000" class="bi-email-body" placeholder="Write your message…" />
                <div class="bi-attach-list">
                    <span class="bi-attach bi-attach-fixed bi-attach-click" title="Preview the invoice PDF"
                        @click="emailRow && downloadPdf(emailRow)">
                        <i class="el-icon-document" /> {{ emailRow && emailRow.number }}.pdf
                        <span class="bi-attach-note">invoice</span>
                        <i class="el-icon-view bi-attach-eye" />
                    </span>
                    <span v-for="(f, i) in emailFiles" :key="i" class="bi-attach">
                        <i class="el-icon-paperclip" /> {{ f.filename }}
                        <span class="bi-attach-note">{{ prettySize(f.size) }}</span>
                        <i class="el-icon-close bi-attach-x" @click="emailFiles.splice(i, 1)" />
                    </span>
                    <el-button size="mini" type="text" icon="el-icon-paperclip" class="bi-attach-add"
                        :disabled="emailFiles.length >= 5" @click="$refs.emailFile.click()">Attach file</el-button>
                    <input ref="emailFile" type="file" multiple class="bi-file-input" @change="onEmailFiles" />
                </div>
            </div>
            <span slot="footer">
                <el-button size="small" @click="emailVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" icon="el-icon-position" :loading="sendingEmail"
                    :disabled="!emailForm.to.length || !emailForm.subject.trim()"
                    @click="sendEmail">Send</el-button>
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
import { getBlackbeltAccounts, getBlackbeltInvoices, createBlackbeltInvoice, deleteBlackbeltInvoice, setBlackbeltInvoicePayment, emailBlackbeltInvoice } from '@/api/blackbelt'
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
            form: { accountId: '', qty: 1, note: '', dueDate: '' },
            creating: false,
            previewVisible: false,
            previewUrl: '',
            previewDoc: null,
            previewNumber: '',
            emailVisible: false,
            emailRow: null,
            emailForm: { to: [], cc: [], subject: '', body: '' },
            emailFiles: [],
            sendingEmail: false,
            // Addresses typed via allow-create this session — each field keeps
            // its own list (To entries only join the To dropdown, Cc likewise).
            // Deliberately NOT persisted anywhere.
            typedTo: [],
            typedCc: []
        }
    },
    computed: {
        selectedAccount() {
            return this.accounts.find(a => String(a._id) === String(this.form.accountId)) || null
        },
        computedTotal() {
            if (!this.selectedAccount || this.selectedAccount.negotiatedRate == null || !this.form.qty) return 0
            return Math.round(this.selectedAccount.negotiatedRate * this.form.qty * 100) / 100
        },
        // The invoice's linked account, when it has an email — the base
        // suggestion for both fields.
        linkedAccountOption() {
            if (!this.emailRow) return null
            const acc = this.accounts.find(a => String(a._id) === String(this.emailRow.accountId))
            const email = acc && (acc.email || '').trim()
            return email ? { email, name: acc.name } : null
        },
        // To = linked account + addresses typed into To this session.
        toOptions() {
            const base = this.linkedAccountOption ? [this.linkedAccountOption] : []
            for (const e of this.typedTo) {
                if (!base.some(b => b.email.toLowerCase() === e.toLowerCase())) base.push({ email: e, name: '' })
            }
            return base
        },
        // Cc = accounts@ + linked account + addresses typed into Cc.
        ccOptions() {
            const base = [{ email: 'accounts@exyon.com.au', name: 'Exyon Accounts' }]
            if (this.linkedAccountOption &&
                !base.some(b => b.email.toLowerCase() === this.linkedAccountOption.email.toLowerCase())) {
                base.push(this.linkedAccountOption)
            }
            for (const e of this.typedCc) {
                if (!base.some(b => b.email.toLowerCase() === e.toLowerCase())) base.push({ email: e, name: '' })
            }
            return base
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
            this.form = { accountId: this.accountFilter || '', qty: 1, note: '', dueDate: this.defaultDueDate() }
            this.dialogVisible = true
            // Belt-and-braces freshness: re-pull accounts every time the
            // dialog opens, so a just-created account (or freshly negotiated
            // rate) is always selectable.
            this.loadAccounts()
        },
        async create() {
            this.creating = true
            try {
                const r = await createBlackbeltInvoice({
                    accountId: this.form.accountId,
                    qty: this.form.qty,
                    note: (this.form.note || '').trim(),
                    dueDate: this.form.dueDate
                })
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
        // Today + 15 days, local time, as yyyy-MM-dd for the date picker.
        defaultDueDate() {
            const d = new Date(Date.now() + 15 * 86400000)
            const p = n => String(n).padStart(2, '0')
            return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
        },
        onRowCommand(cmd, row) {
            if (cmd === 'paid') this.setPayment(row, 'paid')
            else if (cmd === 'unpaid') this.setPayment(row, 'unpaid')
            else if (cmd === 'delete') this.removeInvoice(row)
            else if (cmd === 'email') this.emailInvoice(row)
        },
        // Open the compose dialog prefilled from the invoice + account.
        emailInvoice(row) {
            const account = this.accounts.find(a => String(a._id) === String(row.accountId))
            const dueStr = row.dueDate
                ? new Date(row.dueDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
                : ''
            this.emailRow = row
            this.emailForm = {
                to: account && (account.email || '').trim() ? [account.email.trim()] : [],
                cc: ['accounts@exyon.com.au'],
                subject: `Invoice ${row.number} — Exyon Pty Ltd`,
                body:
                    `Dear ${this.liveAccountName(row)},\n\n` +
                    `Please find attached invoice ${row.number} for ${this.money(row.total)}.` +
                    (dueStr ? ` Payment is due by ${dueStr}.` : '') +
                    `\n\nBank details are included on the invoice.\n\nKind regards,\nExyon Pty Ltd`
            }
            this.emailFiles = []
            // Typed-address suggestions are per compose dialog — start fresh
            // so addresses from an earlier invoice's email don't carry over.
            this.typedTo = []
            this.typedCc = []
            this.emailVisible = true
        },
        onEmailFiles(e) {
            const files = Array.from(e.target.files || [])
            e.target.value = ''
            for (const f of files) {
                if (this.emailFiles.length >= 5) { this.$message.warning('Up to 5 extra attachments.'); break }
                if (f.size > 3.5 * 1024 * 1024) { this.$message.warning(`"${f.name}" is too large (max 3.5MB).`); continue }
                const reader = new FileReader()
                reader.onload = () => this.emailFiles.push({ filename: f.name, size: f.size, dataBase64: reader.result })
                reader.readAsDataURL(f)
            }
        },
        // Fired on every To/Cc selection change — any value that isn't already
        // an option for THAT field joins that field's session list.
        captureTyped(list, bucket) {
            const options = bucket === 'typedTo' ? this.toOptions : this.ccOptions
            const known = new Set(options.map(o => o.email.toLowerCase()))
            for (const raw of list || []) {
                const addr = String(raw || '').trim()
                if (!addr || known.has(addr.toLowerCase())) continue
                if (!this[bucket].some(e => e.toLowerCase() === addr.toLowerCase())) {
                    this[bucket].push(addr)
                }
            }
        },
        prettySize(bytes) {
            if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + 'MB'
            return Math.max(1, Math.round(bytes / 1024)) + 'KB'
        },
        async sendEmail() {
            const row = this.emailRow
            if (!row) return
            this.sendingEmail = true
            try {
                const doc = buildBlackbeltInvoicePdf({ ...row, accountName: this.liveAccountName(row) })
                const r = await emailBlackbeltInvoice(row._id, {
                    to: this.emailForm.to.join(', '),
                    cc: this.emailForm.cc.join(', '),
                    subject: this.emailForm.subject.trim(),
                    body: this.emailForm.body,
                    pdfBase64: doc.output('datauristring'),
                    attachments: this.emailFiles.map(f => ({ filename: f.filename, dataBase64: f.dataBase64 }))
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(`Invoice ${row.number} emailed to ${r.to}${r.cc ? ' (cc ' + r.cc + ')' : ''}.`)
                this.emailVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to send the email'))
            } finally {
                this.sendingEmail = false
            }
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
.bi-form-col { flex: 1; min-width: 0; }
/* Email compose — mail-client feel: inline labels over underline-only
   inputs, a borderless body, chips + attach at the bottom. */
::v-deep .bi-email-dialog .el-dialog__body { padding: 6px 20px 12px; }
.bi-email-context { font-weight: normal; font-size: 12px; color: #909399; margin-left: 10px; }
.bi-email-field { display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #f0f2f5; }
.bi-email-label { width: 52px; flex-shrink: 0; font-size: 13px; color: #909399; }
.bi-email-field ::v-deep .el-input__inner { border: none; padding-left: 0; }
.bi-email-select { flex: 1; width: 100%; }
.bi-email-select ::v-deep .el-select__tags { margin-left: -6px; }
.bi-email-subject ::v-deep .el-input__inner { font-weight: 600; color: #303133; }
.bi-email-body { margin-top: 10px; }
.bi-email-body ::v-deep .el-textarea__inner {
    border: 1px solid #dcdfe6; border-radius: 6px; padding: 8px 12px;
    font-family: inherit; font-size: 13px; line-height: 1.6; resize: none;
}
.bi-attach-add { padding: 3px 6px; }

.bi-attach-list { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; border-top: 1px solid #f0f2f5; padding-top: 10px; }
.bi-attach {
    display: inline-flex; align-items: center; gap: 5px;
    background: #f4f6f9; border: 1px solid #e4e7ed; border-radius: 6px;
    padding: 3px 9px; font-size: 12px; color: #303133;
}
.bi-attach-fixed { background: #ecf5ff; border-color: #d9ecff; }
.bi-attach-click { cursor: pointer; }
.bi-attach-click:hover { border-color: #409eff; }
.bi-attach-eye { color: #409eff; }
.bi-attach-note { color: #909399; font-size: 11px; }
.bi-attach-x { cursor: pointer; color: #c0c4cc; }
.bi-attach-x:hover { color: #F56C6C; }
.bi-file-input { display: none; }
.bi-form-row ::v-deep .el-form-item__label { white-space: nowrap; }
.bi-form-row ::v-deep .el-date-editor.el-input { width: 100%; }
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
