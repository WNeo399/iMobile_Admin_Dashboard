<template>
    <div class="pc app-container">
        <div class="pc-filters">
            <el-select v-model="query.distributorId" size="small" clearable filterable
                placeholder="All distributors" class="f-dist" @change="load">
                <el-option v-for="d in distributors" :key="d._id" :label="d.name" :value="d._id" />
            </el-select>
            <el-input v-model="query.search" size="small" clearable class="f-search"
                placeholder="Search name / email / phone…" prefix-icon="el-icon-search"
                @keyup.enter.native="load" @clear="load" />
            <el-select v-model="query.status" size="small" clearable placeholder="Status" class="f-sel" @change="load">
                <el-option label="Active" value="active" />
                <el-option label="Inactive" value="inactive" />
            </el-select>
            <span class="pc-spacer" />
            <el-button size="small" type="primary" plain icon="el-icon-plus"
                :disabled="!distributors.length" @click="openEdit(null)">Add Customer</el-button>
            <el-button size="small" icon="el-icon-refresh" @click="load">Refresh</el-button>
        </div>

        <el-alert v-if="!loading && !distributors.length" type="info" :closable="false" show-icon
            class="pc-alert" title="Add a distributor first — every customer belongs to one." />

        <el-table v-loading="loading" :data="rows" border size="mini" height="calc(100vh - 210px)"
            empty-text="No customers yet.">
            <el-table-column prop="name" label="Customer" min-width="180" show-overflow-tooltip>
                <template slot-scope="s"><b>{{ s.row.name }}</b></template>
            </el-table-column>
            <el-table-column label="Distributor" min-width="160" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.distributorName || '—' }}</template>
            </el-table-column>
            <el-table-column label="Email" min-width="190" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.email || '—' }}</template>
            </el-table-column>
            <el-table-column label="Phone" min-width="140" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.phone || '—' }}</template>
            </el-table-column>
            <el-table-column label="Location" min-width="150" show-overflow-tooltip>
                <template slot-scope="s">{{ locationOf(s.row) }}</template>
            </el-table-column>
            <el-table-column label="Status" width="100" align="center">
                <template slot-scope="s">
                    <el-tag size="mini" effect="plain" :type="s.row.status === 'inactive' ? 'info' : 'success'">
                        {{ s.row.status === 'inactive' ? 'Inactive' : 'Active' }}
                    </el-tag>
                </template>
            </el-table-column>
            <el-table-column label="" width="110" align="center">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-edit" @click="openEdit(s.row)">Edit</el-button>
                    <el-button size="mini" type="text" icon="el-icon-delete" class="pc-del" @click="remove(s.row)" />
                </template>
            </el-table-column>
        </el-table>

        <!-- ── Add / Edit ─────────────────────────────────────────── -->
        <el-dialog :title="editRow ? `Edit ${editRow.name}` : 'Add Customer'" :visible.sync="editVisible"
            width="760px" top="6vh" :close-on-click-modal="false">
            <el-form label-position="top" size="small" class="pc-form" @submit.native.prevent>
                <div class="pc-sec">Account</div>
                <el-row :gutter="16">
                    <el-col :span="9">
                        <el-form-item label="Distributor" required>
                            <el-select v-model="form.distributorId" filterable class="pc-full"
                                :disabled="!!editRow" placeholder="Select a distributor">
                                <el-option v-for="d in distributors" :key="d._id" :label="d.name" :value="d._id" />
                            </el-select>
                            <div v-if="editRow" class="pc-hint">
                                A customer stays with the distributor who created them.
                            </div>
                        </el-form-item>
                    </el-col>
                    <el-col :span="9">
                        <el-form-item label="Email" required>
                            <el-input v-model="form.email" maxlength="140" />
                            <div class="pc-hint">Unique per distributor — the account identifier.</div>
                        </el-form-item>
                    </el-col>
                    <el-col :span="6">
                        <el-form-item label="Status">
                            <el-radio-group v-model="form.status" size="small">
                                <el-radio-button label="active">Active</el-radio-button>
                                <el-radio-button label="inactive">Inactive</el-radio-button>
                            </el-radio-group>
                        </el-form-item>
                    </el-col>
                </el-row>
                <el-row :gutter="16">
                    <el-col :span="16">
                        <el-form-item label="Customer Name" required>
                            <el-input v-model="form.name" maxlength="140" />
                        </el-form-item>
                    </el-col>
                    <el-col :span="8">
                        <el-form-item label="Phone">
                            <el-input v-model="form.phone" maxlength="40" placeholder="400 000 000">
                                <template slot="prepend">+61</template>
                            </el-input>
                        </el-form-item>
                    </el-col>
                </el-row>

                <div class="pc-sec">Address</div>
                <el-form-item label="Address">
                    <el-input v-model="form.address.line1" type="textarea" :rows="2" resize="none"
                        maxlength="200" placeholder="Address line 1" />
                    <el-input v-model="form.address.line2" type="textarea" :rows="2" resize="none"
                        maxlength="200" placeholder="Address line 2" class="pc-line2" />
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
                                clearable placeholder="Select or type" class="pc-full">
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

                <el-form-item label="Note">
                    <el-input v-model="form.note" type="textarea" :rows="2" maxlength="500" resize="none" />
                </el-form-item>
            </el-form>
            <div slot="footer">
                <el-button size="small" @click="editVisible = false">Close</el-button>
                <el-button size="small" type="primary" :loading="saving" @click="save">Save</el-button>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import {
    getPosCustomers, createPosCustomer, updatePosCustomer, deletePosCustomer,
    getPosDistributors
} from '@/api/pos'

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

const EMPTY = {
    distributorId: '', name: '', email: '', phone: '',
    address: { line1: '', line2: '', city: '', state: '', postcode: '' },
    status: 'active', note: ''
}

function emptyForm() {
    return { ...EMPTY, address: { ...EMPTY.address } }
}

export default {
    name: 'PosCustomers',
    data() {
        return {
            loading: false,
            rows: [],
            distributors: [],
            query: { distributorId: '', search: '', status: '' },
            editVisible: false,
            editRow: null,
            form: emptyForm(),
            saving: false,
            states: STATES
        }
    },
    created() {
        this.loadDistributors()
        this.load()
    },
    methods: {
        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || fallback
        },
        locationOf(row) {
            const a = row.address || {}
            return [a.city, a.state].filter(Boolean).join(', ') || '—'
        },
        async loadDistributors() {
            try {
                const r = await getPosDistributors()
                this.distributors = r.distributors || []
            } catch (e) {
                this.distributors = []
            }
        },
        async load() {
            this.loading = true
            try {
                const r = await getPosCustomers(this.query)
                this.rows = r.customers || []
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load customers'))
            } finally {
                this.loading = false
            }
        },
        openEdit(row) {
            this.editRow = row
            if (row) {
                const a = row.address || {}
                this.form = {
                    distributorId: String(row.distributorId), name: row.name || '',
                    email: row.email || '', phone: row.phone || '',
                    address: {
                        line1: a.line1 || '', line2: a.line2 || '', city: a.city || '',
                        state: a.state || '', postcode: a.postcode || ''
                    },
                    status: row.status || 'active', note: row.note || ''
                }
            } else {
                // Adding from a filtered view keeps that distributor selected.
                this.form = { ...emptyForm(), distributorId: this.query.distributorId || '' }
            }
            this.editVisible = true
        },
        async save() {
            if (!this.form.distributorId) { this.$message.warning('Select a distributor'); return }
            if (!this.form.name.trim()) { this.$message.warning('Customer name is required'); return }
            if (!this.form.email.trim()) { this.$message.warning('Email is required'); return }
            this.saving = true
            try {
                if (this.editRow) {
                    await updatePosCustomer(this.editRow._id, this.form)
                    this.$message.success('Customer updated')
                } else {
                    await createPosCustomer(this.form)
                    this.$message.success('Customer added')
                }
                this.editVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Save failed'))
            } finally {
                this.saving = false
            }
        },
        async remove(row) {
            try {
                await this.$confirm(`Remove "${row.name}"?`, 'Confirm', {
                    type: 'warning', confirmButtonText: 'Remove', cancelButtonText: 'Cancel'
                })
            } catch (e) { return }
            try {
                await deletePosCustomer(row._id)
                this.$message.success('Customer removed')
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to remove the customer'))
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.pc-filters {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;

    .f-dist { width: 200px; }
    .f-search { width: 280px; }
    .f-sel { width: 130px; }
    .pc-spacer { flex: 1; }
}
.pc-alert { margin-bottom: 12px; }
.pc-dim { color: #909399; font-size: 12px; }
.pc-del { color: #f56c6c; }

.pc-form ::v-deep .el-form-item { margin-bottom: 14px; }
.pc-form ::v-deep .el-form-item__label {
    padding-bottom: 2px;
    line-height: 1.4;
    color: #606266;
    font-weight: 600;
}
.pc-sec {
    font-size: 11px;
    font-weight: 700;
    color: #909399;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid #ebeef5;
    padding-bottom: 6px;
    margin: 4px 0 14px;
}
.pc-full { width: 100%; }
.pc-line2 { margin-top: 8px; }
.pc-hint { font-size: 12px; color: #909399; line-height: 1.5; margin-top: 4px; }
</style>
