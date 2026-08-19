<template>
    <div class="rp app-container">
        <div class="rp-filters">
            <el-input v-model="query.search" size="small" clearable class="f-search"
                placeholder="Search name / contact / email / phone…" prefix-icon="el-icon-search"
                @keyup.enter.native="load" @clear="load" />
            <el-select v-model="query.status" size="small" clearable placeholder="Status" class="f-sel" @change="load">
                <el-option label="Active" value="active" />
                <el-option label="Inactive" value="inactive" />
            </el-select>
            <span class="rp-spacer" />
            <el-button size="small" type="primary" plain icon="el-icon-plus" @click="openEdit(null)">Add Repairer</el-button>
            <el-button size="small" icon="el-icon-refresh" @click="load">Refresh</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini" height="calc(100vh - 210px)"
            empty-text="No repairers yet — add the workshops you send devices to.">
            <el-table-column prop="name" label="Repairer" min-width="200" show-overflow-tooltip>
                <template slot-scope="s"><b>{{ s.row.name }}</b></template>
            </el-table-column>
            <el-table-column label="Contact" min-width="170" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.contactName || '—' }}</template>
            </el-table-column>
            <el-table-column label="Phone" min-width="140">
                <template slot-scope="s">{{ s.row.phone || '—' }}</template>
            </el-table-column>
            <el-table-column label="Email" min-width="190" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.email || '—' }}</template>
            </el-table-column>
            <el-table-column label="Address" min-width="200" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.address || '—' }}</template>
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
                    <el-button size="mini" type="text" icon="el-icon-delete" class="rp-del" @click="remove(s.row)" />
                </template>
            </el-table-column>
        </el-table>

        <el-dialog :title="editRow ? `Edit ${editRow.name}` : 'Add Repairer'" :visible.sync="editVisible" width="520px">
            <el-form label-width="100px" size="small" @submit.native.prevent>
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
                    <el-input v-model="form.address" type="textarea" :rows="2" resize="none" maxlength="300" />
                </el-form-item>
                <el-form-item label="Status">
                    <el-radio-group v-model="form.status" size="small">
                        <el-radio-button label="active">Active</el-radio-button>
                        <el-radio-button label="inactive">Inactive</el-radio-button>
                    </el-radio-group>
                </el-form-item>
                <el-form-item label="Note">
                    <el-input v-model="form.note" type="textarea" :rows="2" resize="none" maxlength="500" />
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
import { getRepairers, createRepairer, updateRepairer, deleteRepairer } from '@/api/refurbished'

const EMPTY = { name: '', contactName: '', phone: '', email: '', address: '', status: 'active', note: '' }

export default {
    name: 'RefurbRepairers',
    data() {
        return {
            loading: false,
            rows: [],
            query: { search: '', status: '' },
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
                const r = await getRepairers(this.query)
                this.rows = r.repairers || []
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load repairers'))
            } finally {
                this.loading = false
            }
        },
        openEdit(row) {
            this.editRow = row
            this.form = row
                ? {
                    name: row.name || '', contactName: row.contactName || '', phone: row.phone || '',
                    email: row.email || '', address: row.address || '',
                    status: row.status || 'active', note: row.note || ''
                }
                : { ...EMPTY }
            this.editVisible = true
        },
        async save() {
            if (!this.form.name.trim()) { this.$message.warning('Repairer name is required'); return }
            this.saving = true
            try {
                if (this.editRow) {
                    await updateRepairer(this.editRow._id, this.form)
                    this.$message.success('Repairer updated')
                } else {
                    await createRepairer(this.form)
                    this.$message.success('Repairer added')
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
                await deleteRepairer(row._id)
                this.$message.success('Repairer removed')
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to remove the repairer'))
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.rp-filters {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;

    .f-search { width: 300px; }
    .f-sel { width: 130px; }
    .rp-spacer { flex: 1; }
}
.rp-del { color: #f56c6c; }
</style>
