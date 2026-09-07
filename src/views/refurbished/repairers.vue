<template>
    <div class="rp app-container">
        <div class="rp-filters">
            <el-input v-model="query.search" size="small" clearable class="f-search"
                :placeholder="$tp('Search name / contact / email / phone…')" prefix-icon="el-icon-search"
                @keyup.enter.native="load" @clear="load" />
            <el-select v-model="query.status" size="small" clearable :placeholder="$tp('Status')" class="f-sel" @change="load">
                <el-option :label="$tp('Active')" value="active" />
                <el-option :label="$tp('Inactive')" value="inactive" />
            </el-select>
            <span class="rp-spacer" />
            <el-button size="small" type="primary" plain icon="el-icon-plus" @click="openEdit(null)">{{ $tp('Add Repairer') }}</el-button>
            <el-button size="small" icon="el-icon-refresh" @click="load">{{ $tp('Refresh') }}</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini" height="calc(100vh - 210px)"
            :empty-text="$tp('No repairers yet — add the workshops you send devices to.')">
            <el-table-column prop="name" :label="$tp('Repairer')" min-width="200" show-overflow-tooltip>
                <template slot-scope="s"><b>{{ s.row.name }}</b></template>
            </el-table-column>
            <el-table-column :label="$tp('Contact')" min-width="170" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.contactName || '—' }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Phone')" min-width="140">
                <template slot-scope="s">{{ s.row.phone || '—' }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Email')" min-width="190" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.email || '—' }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Address')" min-width="200" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.address || '—' }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Status')" width="100" align="center">
                <template slot-scope="s">
                    <el-tag size="mini" effect="plain" :type="s.row.status === 'inactive' ? 'info' : 'success'">
                        {{ s.row.status === 'inactive' ? $tp('Inactive') : $tp('Active') }}
                    </el-tag>
                </template>
            </el-table-column>
            <el-table-column label="" width="110" align="center">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-edit" @click="openEdit(s.row)">{{ $tp('Edit') }}</el-button>
                    <el-button size="mini" type="text" icon="el-icon-delete" class="rp-del" @click="remove(s.row)" />
                </template>
            </el-table-column>
        </el-table>

        <el-dialog :title="editRow ? $tp('Edit {name}', { name: editRow.name }) : $tp('Add Repairer')" :visible.sync="editVisible" width="520px">
            <el-form label-width="100px" size="small" @submit.native.prevent>
                <el-form-item :label="$tp('Name')" required>
                    <el-input v-model="form.name" maxlength="140" />
                </el-form-item>
                <el-form-item :label="$tp('Contact')">
                    <el-input v-model="form.contactName" maxlength="100" />
                </el-form-item>
                <el-form-item :label="$tp('Phone')">
                    <el-input v-model="form.phone" maxlength="60" />
                </el-form-item>
                <el-form-item :label="$tp('Email')">
                    <el-input v-model="form.email" maxlength="140" />
                </el-form-item>
                <el-form-item :label="$tp('Address')">
                    <el-input v-model="form.address" type="textarea" :rows="2" resize="none" maxlength="300" />
                </el-form-item>
                <el-form-item :label="$tp('Status')">
                    <el-radio-group v-model="form.status" size="small">
                        <el-radio-button label="active">{{ $tp('Active') }}</el-radio-button>
                        <el-radio-button label="inactive">{{ $tp('Inactive') }}</el-radio-button>
                    </el-radio-group>
                </el-form-item>
                <el-form-item :label="$tp('Note')">
                    <el-input v-model="form.note" type="textarea" :rows="2" resize="none" maxlength="500" />
                </el-form-item>
            </el-form>
            <div slot="footer">
                <el-button size="small" @click="editVisible = false">{{ $tp('Close') }}</el-button>
                <el-button size="small" type="primary" :loading="saving" @click="save">{{ $tp('Save') }}</el-button>
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
                this.$message.error(this.msg(e, this.$tp('Failed to load repairers')))
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
            if (!this.form.name.trim()) { this.$message.warning(this.$tp('Repairer name is required')); return }
            this.saving = true
            try {
                if (this.editRow) {
                    await updateRepairer(this.editRow._id, this.form)
                    this.$message.success(this.$tp('Repairer updated'))
                } else {
                    await createRepairer(this.form)
                    this.$message.success(this.$tp('Repairer added'))
                }
                this.editVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Save failed')))
            } finally {
                this.saving = false
            }
        },
        async remove(row) {
            try {
                await this.$confirm(this.$tp('Remove "{name}"?', { name: row.name }), this.$tp('Confirm'), {
                    type: 'warning', confirmButtonText: this.$tp('Remove'), cancelButtonText: this.$tp('Cancel')
                })
            } catch (e) { return }
            try {
                await deleteRepairer(row._id)
                this.$message.success(this.$tp('Repairer removed'))
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to remove the repairer')))
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
