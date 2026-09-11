<template>
    <div class="rsu app-container">
        <div class="rsu-filters">
            <el-input v-model="query.search" size="small" clearable class="f-search"
                :placeholder="$tp('Search name / contact / email / phone…')" prefix-icon="el-icon-search"
                @keyup.enter.native="load" @clear="load" />
            <span class="rsu-spacer" />
            <el-button size="small" type="primary" plain icon="el-icon-plus" @click="openEdit(null)">{{ $tp('Add Supplier') }}</el-button>
            <el-button size="small" icon="el-icon-refresh" @click="load">{{ $tp('Refresh') }}</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini" height="calc(100vh - 210px)"
            :empty-text="$tp('No suppliers yet — add where your stock comes from.')">
            <el-table-column prop="name" :label="$tp('Supplier')" min-width="200" show-overflow-tooltip>
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
            <el-table-column :label="$tp('Note')" min-width="200" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.note || '—' }}</template>
            </el-table-column>
            <el-table-column label="" width="110" align="center">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-edit" @click="openEdit(s.row)">{{ $tp('Edit') }}</el-button>
                    <el-button size="mini" type="text" icon="el-icon-delete" class="rsu-del" @click="remove(s.row)" />
                </template>
            </el-table-column>
        </el-table>

        <el-dialog :title="editRow ? $tp('Edit {name}', { name: editRow.name }) : $tp('Add Supplier')" :visible.sync="editVisible" width="520px">
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
import { getRefurbSuppliers, createRefurbSupplier, updateRefurbSupplier, deleteRefurbSupplier } from '@/api/refurbished'

const EMPTY = { name: '', contactName: '', phone: '', email: '', note: '' }

export default {
    name: 'RefurbSuppliers',
    data() {
        return {
            loading: false,
            rows: [],
            query: { search: '' },
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
                const r = await getRefurbSuppliers(this.query)
                this.rows = r.suppliers || []
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load suppliers')))
            } finally {
                this.loading = false
            }
        },
        openEdit(row) {
            this.editRow = row
            this.form = row
                ? {
                    name: row.name || '', contactName: row.contactName || '',
                    phone: row.phone || '', email: row.email || '', note: row.note || ''
                }
                : { ...EMPTY }
            this.editVisible = true
        },
        async save() {
            if (!this.form.name.trim()) { this.$message.warning(this.$tp('Supplier name is required')); return }
            this.saving = true
            try {
                if (this.editRow) {
                    await updateRefurbSupplier(this.editRow._id, this.form)
                    this.$message.success(this.$tp('Supplier updated'))
                } else {
                    await createRefurbSupplier(this.form)
                    this.$message.success(this.$tp('Supplier added'))
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
                await deleteRefurbSupplier(row._id)
                this.$message.success(this.$tp('Supplier removed'))
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to remove the supplier')))
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.rsu-filters {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;

    .f-search { width: 300px; }
    .rsu-spacer { flex: 1; }
}
.rsu-del { color: #f56c6c; }
</style>
