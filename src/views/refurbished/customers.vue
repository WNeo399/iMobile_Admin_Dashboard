<template>
    <div class="rcu app-container">
        <div class="rcu-filters">
            <el-input v-model="search" size="small" clearable class="f-search"
                placeholder="Search name / contact / email / phone…" prefix-icon="el-icon-search"
                @keyup.enter.native="load" @clear="load" />
            <span class="rcu-spacer" />
            <el-button size="small" type="primary" plain icon="el-icon-plus" @click="openEdit(null)">Add Customer</el-button>
            <el-button size="small" icon="el-icon-refresh" @click="load">Refresh</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini" height="calc(100vh - 170px)"
            empty-text="No customers yet — add one to start.">
            <el-table-column prop="name" label="Name" min-width="180" show-overflow-tooltip>
                <template slot-scope="s"><b>{{ s.row.name }}</b></template>
            </el-table-column>
            <el-table-column prop="contactName" label="Contact" min-width="130" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.contactName || '—' }}</template>
            </el-table-column>
            <el-table-column prop="phone" label="Phone" min-width="130">
                <template slot-scope="s">{{ s.row.phone || '—' }}</template>
            </el-table-column>
            <el-table-column prop="email" label="Email" min-width="180" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.email || '—' }}</template>
            </el-table-column>
            <el-table-column prop="address" label="Address" min-width="220" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.address || '—' }}</template>
            </el-table-column>
            <el-table-column prop="note" label="Note" min-width="160" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.note || '—' }}</template>
            </el-table-column>
            <el-table-column label="" width="110" align="center">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-edit" @click="openEdit(s.row)">Edit</el-button>
                    <el-button size="mini" type="text" icon="el-icon-delete" class="rcu-del" @click="remove(s.row)" />
                </template>
            </el-table-column>
        </el-table>

        <el-dialog :title="editRow ? 'Edit Customer' : 'Add Customer'" :visible.sync="editVisible" width="460px">
            <el-form label-width="90px" size="small">
                <el-form-item label="Name" required>
                    <el-input v-model="form.name" maxlength="140" />
                </el-form-item>
                <el-form-item label="Contact">
                    <el-input v-model="form.contactName" maxlength="100" />
                </el-form-item>
                <el-form-item label="Phone">
                    <el-input v-model="form.phone" maxlength="60" />
                </el-form-item>
                <el-form-item label="Email">
                    <el-input v-model="form.email" maxlength="140" />
                </el-form-item>
                <el-form-item label="Address">
                    <el-input v-model="form.address" maxlength="300" />
                </el-form-item>
                <el-form-item label="Note">
                    <el-input v-model="form.note" type="textarea" :rows="2" maxlength="500" />
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
import { getRefurbCustomers, createRefurbCustomer, updateRefurbCustomer, deleteRefurbCustomer } from '@/api/refurbished'

const EMPTY = { name: '', contactName: '', phone: '', email: '', address: '', note: '' }

export default {
    name: 'RefurbCustomers',
    data() {
        return {
            loading: false,
            rows: [],
            search: '',
            editVisible: false,
            editRow: null,
            form: { ...EMPTY },
            saving: false
        }
    },
    created() {
        this.load()
    },
    methods: {
        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || fallback
        },
        async load() {
            this.loading = true
            try {
                const r = await getRefurbCustomers({ search: this.search })
                this.rows = r.customers || []
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load customers'))
            } finally {
                this.loading = false
            }
        },
        openEdit(row) {
            this.editRow = row
            this.form = row
                ? {
                    name: row.name || '', contactName: row.contactName || '', phone: row.phone || '',
                    email: row.email || '', address: row.address || '', note: row.note || ''
                }
                : { ...EMPTY }
            this.editVisible = true
        },
        async save() {
            if (!this.form.name.trim()) { this.$message.warning('Customer name is required'); return }
            this.saving = true
            try {
                if (this.editRow) {
                    await updateRefurbCustomer(this.editRow._id, this.form)
                    this.$message.success('Customer updated')
                } else {
                    await createRefurbCustomer(this.form)
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
                await this.$confirm(`Remove customer "${row.name}"?`, 'Confirm', {
                    type: 'warning', confirmButtonText: 'Remove', cancelButtonText: 'Cancel'
                })
            } catch (e) { return }
            try {
                await deleteRefurbCustomer(row._id)
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
.rcu-filters {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;

    .f-search { width: 300px; }
    .rcu-spacer { flex: 1; }
}
.rcu-del { color: #f56c6c; }
</style>
