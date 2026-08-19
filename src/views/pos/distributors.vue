<template>
    <div class="pd app-container">
        <div class="pd-filters">
            <el-input v-model="query.search" size="small" clearable class="f-search"
                placeholder="Search name / contact / email / site…" prefix-icon="el-icon-search"
                @keyup.enter.native="load" @clear="load" />
            <el-select v-model="query.status" size="small" clearable placeholder="Status" class="f-sel" @change="load">
                <el-option label="Active" value="active" />
                <el-option label="Inactive" value="inactive" />
            </el-select>
            <span class="pd-spacer" />
            <el-button size="small" type="primary" plain icon="el-icon-plus" @click="openEdit(null)">Add Distributor</el-button>
            <el-button size="small" icon="el-icon-refresh" @click="load">Refresh</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini" height="calc(100vh - 210px)"
            empty-text="No distributors yet — add one to start.">
            <el-table-column prop="name" label="Distributor" min-width="180" show-overflow-tooltip>
                <template slot-scope="s"><b>{{ s.row.name }}</b></template>
            </el-table-column>
            <el-table-column label="Contact" min-width="180" show-overflow-tooltip>
                <template slot-scope="s">
                    <div>{{ s.row.contactName || '—' }}</div>
                    <div class="pd-dim">{{ [s.row.email, s.row.phone].filter(Boolean).join(' · ') || '' }}</div>
                </template>
            </el-table-column>
            <el-table-column label="Widget Sites" min-width="200">
                <template slot-scope="s">
                    <span v-if="!(s.row.origins || []).length" class="pd-dim">— none set</span>
                    <template v-else>
                        <el-tag v-for="o in s.row.origins.slice(0, 2)" :key="o" size="mini" effect="plain"
                            class="pd-origin">{{ hostOf(o) }}</el-tag>
                        <span v-if="s.row.origins.length > 2" class="pd-dim">+{{ s.row.origins.length - 2 }}</span>
                    </template>
                </template>
            </el-table-column>
            <el-table-column label="Zoho Contact" width="130" align="center">
                <template slot-scope="s">
                    <i v-if="s.row.zohoContactId" class="el-icon-success pd-yes" :title="s.row.zohoContactId" />
                    <i v-else class="el-icon-error pd-no" title="Not linked — orders can't reach Zoho yet" />
                </template>
            </el-table-column>
            <el-table-column label="Status" width="100" align="center">
                <template slot-scope="s">
                    <el-tag size="mini" effect="plain" :type="s.row.status === 'inactive' ? 'info' : 'success'">
                        {{ s.row.status === 'inactive' ? 'Inactive' : 'Active' }}
                    </el-tag>
                </template>
            </el-table-column>
            <el-table-column label="" width="150" align="center">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-key" @click="openKey(s.row)">Key</el-button>
                    <el-button size="mini" type="text" icon="el-icon-edit" @click="openEdit(s.row)">Edit</el-button>
                    <el-button size="mini" type="text" icon="el-icon-delete" class="pd-del" @click="remove(s.row)" />
                </template>
            </el-table-column>
        </el-table>

        <!-- ── Add / Edit ─────────────────────────────────────────── -->
        <!-- Labels sit above their inputs so short fields can share a row —
             a 12-row single column made this dialog scroll for no reason. -->
        <el-dialog :title="editRow ? `Edit ${editRow.name}` : 'Add Distributor'" :visible.sync="editVisible"
            width="760px" top="6vh" custom-class="pd-form-dialog" :close-on-click-modal="false">
            <el-form label-position="top" size="small" class="pd-form" @submit.native.prevent>
                <div class="pd-sec">Business</div>
                <el-row :gutter="16">
                    <el-col :span="14">
                        <el-form-item label="Business Name" required>
                            <el-input v-model="form.name" maxlength="140" />
                        </el-form-item>
                    </el-col>
                    <el-col :span="10">
                        <el-form-item label="Status">
                            <el-radio-group v-model="form.status" size="small">
                                <el-radio-button label="active">Active</el-radio-button>
                                <el-radio-button label="inactive">Inactive</el-radio-button>
                            </el-radio-group>
                        </el-form-item>
                    </el-col>
                </el-row>
                <el-row :gutter="16">
                    <el-col :span="8">
                        <el-form-item label="Contact Name">
                            <el-input v-model="form.contactName" maxlength="100" />
                        </el-form-item>
                    </el-col>
                    <el-col :span="9">
                        <el-form-item label="Email">
                            <el-input v-model="form.email" maxlength="140" />
                        </el-form-item>
                    </el-col>
                    <el-col :span="7">
                        <el-form-item label="Phone">
                            <el-input v-model="form.phone" maxlength="40" placeholder="400 000 000">
                                <template slot="prepend">+61</template>
                            </el-input>
                        </el-form-item>
                    </el-col>
                </el-row>

                <div class="pd-sec">Address</div>
                <!-- Stacked, full width — an address line runs longer than
                     half the dialog and shouldn't be cut in two. -->
                <el-form-item label="Address">
                    <el-input v-model="form.address.line1" type="textarea" :rows="2" resize="none"
                        maxlength="200" placeholder="Address line 1" />
                    <el-input v-model="form.address.line2" type="textarea" :rows="2" resize="none"
                        maxlength="200" placeholder="Address line 2" class="pd-line2" />
                </el-form-item>
                <el-row :gutter="16">
                    <el-col :span="8">
                        <el-form-item label="City">
                            <el-input v-model="form.address.city" maxlength="100" />
                        </el-form-item>
                    </el-col>
                    <el-col :span="9">
                        <el-form-item label="State">
                            <el-select v-model="form.address.state" filterable allow-create default-first-option
                                clearable placeholder="Select or type" class="pd-full">
                                <el-option v-for="st in states" :key="st" :label="st" :value="st" />
                            </el-select>
                        </el-form-item>
                    </el-col>
                    <el-col :span="7">
                        <el-form-item label="Zip Code">
                            <el-input v-model="form.address.postcode" maxlength="20" />
                        </el-form-item>
                    </el-col>
                </el-row>

                <div class="pd-sec">Widget &amp; Zoho</div>
                <el-form-item label="Widget Sites">
                    <el-select v-model="form.origins" multiple filterable allow-create default-first-option
                        class="pd-full" placeholder="e.g. https://parts.example.com">
                        <el-option v-for="o in form.origins" :key="o" :label="o" :value="o" />
                    </el-select>
                    <div class="pd-hint">The sites allowed to load this distributor's widget — type a domain and press Enter.</div>
                </el-form-item>
                <el-form-item label="Zoho Contact ID">
                    <el-input v-model="form.zohoContactId" maxlength="60" placeholder="Optional for now" class="pd-half" />
                    <div class="pd-hint">A confirmed order raises its sales order against this contact.</div>
                </el-form-item>
                <el-form-item label="Note">
                    <el-input v-model="form.note" type="textarea" :rows="2" maxlength="500" resize="none" />
                </el-form-item>
            </el-form>
            <div slot="footer">
                <el-button size="small" @click="editVisible = false">Close</el-button>
                <el-button size="small" type="primary" :loading="saving" @click="save">Save</el-button>
            </div>
        </el-dialog>

        <!-- ── Widget key / embed snippet ─────────────────────────── -->
        <el-dialog :title="keyRow ? `${keyRow.name} — Widget` : ''" :visible.sync="keyVisible" width="640px">
            <div v-if="keyRow" class="pd-key">
                <div class="pd-key-label">Public key</div>
                <el-input :value="keyRow.publicKey" readonly size="small">
                    <el-button slot="append" icon="el-icon-document-copy"
                        @click="copy(keyRow.publicKey, 'Key copied')">Copy</el-button>
                </el-input>
                <div class="pd-hint">
                    This sits in their page source, so treat it as an identifier rather than a
                    secret — it only reads this distributor's catalogue and places orders against them.
                </div>

                <div class="pd-key-label">Embed snippet</div>
                <pre class="pd-snippet">{{ snippet }}</pre>
                <el-button size="mini" icon="el-icon-document-copy"
                    @click="copy(snippet, 'Snippet copied')">Copy snippet</el-button>

                <el-alert v-if="!(keyRow.origins || []).length" type="warning" :closable="false" show-icon
                    class="pd-key-alert"
                    title="No widget sites set — add their domain on the Edit form or the widget won't load." />
            </div>
            <div slot="footer">
                <el-button size="small" type="danger" plain :loading="rotating" @click="rotateKey">Issue New Key</el-button>
                <el-button size="small" @click="keyVisible = false">Close</el-button>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import {
    getPosDistributors, createPosDistributor, updatePosDistributor,
    rotatePosDistributorKey, deletePosDistributor
} from '@/api/pos'

const EMPTY = {
    name: '', contactName: '', email: '', phone: '',
    address: { line1: '', line2: '', city: '', state: '', postcode: '' },
    origins: [], zohoContactId: '', status: 'active', note: ''
}

// Offered in the State picker, which stays free-text for anywhere else.
const STATES = [
    'Victoria',
    'New South Wales',
    'Queensland',
    'Western Australia',
    'South Australia',
    'Tasmania',
    'Australian Capital Territory',
    'Northern Territory'
]

function emptyForm() {
    return { ...EMPTY, address: { ...EMPTY.address }, origins: [] }
}

export default {
    name: 'PosDistributors',
    data() {
        return {
            loading: false,
            rows: [],
            query: { search: '', status: '' },
            editVisible: false,
            editRow: null,
            form: { ...EMPTY },
            saving: false,
            keyVisible: false,
            keyRow: null,
            rotating: false,
            states: STATES
        }
    },
    computed: {
        snippet() {
            if (!this.keyRow) return ''
            const base = window.location.origin
            return [
                `<div id="imobile-pos"`,
                `     data-api-base="${base}"`,
                `     data-distributor-key="${this.keyRow.publicKey}"></div>`,
                `<script src="${base}/widget-assets/pos/v1.js" defer><\/script>`
            ].join('\n')
        }
    },
    created() {
        this.load()
    },
    methods: {
        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || fallback
        },
        hostOf(origin) {
            try { return new URL(origin).host } catch (e) { return origin }
        },
        // Strip whatever country-code / trunk-zero shape was typed or pasted
        // so the stored number never ends up as "+61 +61 …" or "+61 0400 …".
        async load() {
            this.loading = true
            try {
                const r = await getPosDistributors(this.query)
                this.rows = r.distributors || []
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load distributors'))
            } finally {
                this.loading = false
            }
        },
        openEdit(row) {
            this.editRow = row
            const a = (row && row.address) || {}
            this.form = row
                ? {
                    name: row.name || '', contactName: row.contactName || '', email: row.email || '',
                    phone: row.phone || '',
                    address: {
                        line1: a.line1 || '', line2: a.line2 || '', city: a.city || '',
                        state: a.state || '', postcode: a.postcode || ''
                    },
                    origins: [...(row.origins || [])], zohoContactId: row.zohoContactId || '',
                    status: row.status || 'active', note: row.note || ''
                }
                : emptyForm()
            this.editVisible = true
        },
        async save() {
            if (!this.form.name.trim()) { this.$message.warning('Distributor name is required'); return }
            this.saving = true
            try {
                if (this.editRow) {
                    await updatePosDistributor(this.editRow._id, this.form)
                    this.$message.success('Distributor updated')
                } else {
                    const r = await createPosDistributor(this.form)
                    this.$message.success('Distributor added')
                    // Straight to the key — it's the thing they need next.
                    this.keyRow = r.distributor
                    this.keyVisible = true
                }
                this.editVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Save failed'))
            } finally {
                this.saving = false
            }
        },
        openKey(row) {
            this.keyRow = row
            this.keyVisible = true
        },
        async rotateKey() {
            try {
                await this.$confirm(
                    'Issue a new key? The current one stops working immediately, so their site will need the new snippet.',
                    'Confirm', { type: 'warning', confirmButtonText: 'Issue New Key', cancelButtonText: 'Cancel' }
                )
            } catch (e) { return }
            this.rotating = true
            try {
                const r = await rotatePosDistributorKey(this.keyRow._id)
                this.keyRow = r.distributor
                this.$message.success('New key issued')
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to issue a new key'))
            } finally {
                this.rotating = false
            }
        },
        copy(text, done) {
            const ta = document.createElement('textarea')
            ta.value = text
            ta.style.position = 'fixed'
            ta.style.opacity = '0'
            document.body.appendChild(ta)
            ta.select()
            try {
                document.execCommand('copy')
                this.$message.success(done)
            } catch (e) {
                this.$message.warning('Copy failed — select the text manually.')
            }
            document.body.removeChild(ta)
        },
        async remove(row) {
            try {
                await this.$confirm(`Remove "${row.name}"?`, 'Confirm', {
                    type: 'warning', confirmButtonText: 'Remove', cancelButtonText: 'Cancel'
                })
            } catch (e) { return }
            try {
                await deletePosDistributor(row._id)
                this.$message.success('Distributor removed')
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to remove the distributor'))
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.pd-filters {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;

    .f-search { width: 300px; }
    .f-sel { width: 130px; }
    .pd-spacer { flex: 1; }
}
.pd-dim { color: #909399; font-size: 12px; }
.pd-del { color: #f56c6c; }
.pd-yes { color: #67c23a; font-size: 16px; }
.pd-no { color: #c0c4cc; font-size: 16px; }
.pd-origin { margin-right: 4px; }
/* Top-aligned labels are tight by default; give each field a little air
   without the 12-row stack the single column produced. */
.pd-form ::v-deep .el-form-item { margin-bottom: 14px; }
.pd-form ::v-deep .el-form-item__label {
    padding-bottom: 2px;
    line-height: 1.4;
    color: #606266;
    font-weight: 600;
}
.pd-sec {
    font-size: 11px;
    font-weight: 700;
    color: #909399;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid #ebeef5;
    padding-bottom: 6px;
    margin: 4px 0 14px;
}
.pd-sec + .el-row { margin-top: 0; }
.pd-full { width: 100%; }
.pd-line2 { margin-top: 8px; }
.pd-half { width: 50%; }
.pd-hint { font-size: 12px; color: #909399; line-height: 1.5; margin-top: 4px; }

.pd-key { display: flex; flex-direction: column; gap: 6px; }
.pd-key-label {
    font-size: 11px;
    font-weight: 600;
    color: #909399;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-top: 8px;
}
.pd-snippet {
    margin: 0;
    padding: 12px;
    background: #f8f9fb;
    border: 1px solid #ebeef5;
    border-radius: 6px;
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-all;
}
.pd-key-alert { margin-top: 10px; }
</style>
