<template>
    <!--
        Refurbished Device → Repairers, for phone suppliers (user ask
        2026-11-04): who their Pending Stock devices go to for repair, picked
        on a repair batch. Their own list, scoped to their stock source like
        Suppliers. Not the staff Repairers page (views/refurbished/repairers).
    -->
    <div class="rpr app-container">
        <div class="rpr-filters">
            <el-input v-model="query.search" size="small" clearable class="f-search"
                :placeholder="$tp('Search name / phone / note…')" prefix-icon="el-icon-search"
                @keyup.enter.native="load" @clear="load" />
            <span class="rpr-spacer" />
            <el-button v-if="canManage" size="small" type="primary" plain icon="el-icon-plus" @click="openEdit(null)">{{ $tp('Add Repairer') }}</el-button>
            <el-button size="small" icon="el-icon-refresh" @click="load">{{ $tp('Refresh') }}</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini" height="calc(100vh - 210px)"
            :empty-text="$tp('No repairers yet — add who repairs your devices.')">
            <el-table-column :label="$tp('Repairer')" min-width="200" show-overflow-tooltip>
                <template slot-scope="s"><b>{{ s.row.name }}</b></template>
            </el-table-column>
            <el-table-column :label="$tp('Phone')" min-width="140">
                <template slot-scope="s">{{ s.row.phone || '—' }}</template>
            </el-table-column>
            <el-table-column :label="$tp('In repair')" width="110" align="center">
                <template slot-scope="s">
                    <router-link v-if="s.row.inRepair" :to="{ path: '/refurbished/repair-batches', query: { repairerId: s.row._id } }" class="rpr-link">{{ s.row.inRepair }}</router-link>
                    <span v-else class="rpr-dim">0</span>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Note')" min-width="220" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.note || '—' }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Status')" width="100" align="center">
                <template slot-scope="s">
                    <el-tag size="mini" :type="s.row.active ? 'success' : 'info'">{{ s.row.active ? $tp('Active') : $tp('Inactive') }}</el-tag>
                </template>
            </el-table-column>
            <el-table-column v-if="canManage" label="" width="110" align="center">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-edit" @click="openEdit(s.row)">{{ $tp('Edit') }}</el-button>
                    <el-button size="mini" type="text" icon="el-icon-delete" class="rpr-del" :title="$tp('Remove')" @click="remove(s.row)" />
                </template>
            </el-table-column>
        </el-table>

        <el-dialog :title="editRow ? $tp('Edit {name}', { name: editRow.name }) : $tp('Add Repairer')" :visible.sync="editVisible"
            :width="narrow ? '94%' : '480px'" append-to-body :close-on-click-modal="false">
            <el-form label-width="90px" size="small" @submit.native.prevent>
                <el-form-item :label="$tp('Name')" required>
                    <el-input ref="name" v-model="form.name" maxlength="100" @keyup.enter.native="save" />
                </el-form-item>
                <el-form-item :label="$tp('Phone')">
                    <el-input v-model="form.phone" maxlength="60" />
                </el-form-item>
                <el-form-item :label="$tp('Note')">
                    <el-input v-model="form.note" type="textarea" :rows="2" resize="none" maxlength="500" />
                </el-form-item>
                <el-form-item v-if="editRow" :label="$tp('Active')">
                    <el-switch v-model="form.active" />
                    <span class="rpr-hint">{{ $tp('A repairer switched off gets no new batches; its batches stay.') }}</span>
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
import { getPrecheckRepairers, addPrecheckRepairer, updatePrecheckRepairer, deletePrecheckRepairer } from '@/api/refurbished'
import { hasPermission } from '@/utils/permission'

const blankForm = () => ({ name: '', phone: '', note: '', active: true })

export default {
    name: 'RefurbishedPrecheckRepairers',
    data() {
        return {
            loading: false,
            rows: [],
            query: { search: '' },
            editVisible: false,
            editRow: null,
            form: blankForm(),
            saving: false,
            narrow: false
        }
    },
    computed: {
        canManage() {
            return hasPermission(this.$store.getters.permissions, 'refurb:precheck:manage')
        }
    },
    created() {
        this.load()
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await getPrecheckRepairers(this.query)
                this.rows = r.repairers || []
            } catch (e) {
                // the request layer has said why
            } finally {
                this.loading = false
            }
        },
        openEdit(row) {
            this.editRow = row
            this.form = row ? { name: row.name || '', phone: row.phone || '', note: row.note || '', active: row.active !== false } : blankForm()
            this.narrow = window.innerWidth < 600
            this.editVisible = true
            this.$nextTick(() => this.$refs.name && this.$refs.name.focus())
        },
        async save() {
            if (!this.form.name.trim()) { this.$message.warning(this.$tp('Repairer name is required')); return }
            if (this.saving) return
            this.saving = true
            try {
                if (this.editRow) await updatePrecheckRepairer(this.editRow._id, this.form)
                else await addPrecheckRepairer(this.form)
                this.$message.success(this.$tp('Saved'))
                this.editVisible = false
                this.load()
            } catch (e) {
                // the request layer has said why; the dialog stays open
            } finally {
                this.saving = false
            }
        },
        async remove(row) {
            try {
                await this.$confirm(this.$tp('Remove {name}?', { name: row.name }), this.$tp('Remove'), {
                    type: 'warning', confirmButtonText: this.$tp('Remove'), cancelButtonText: this.$tp('Cancel')
                })
            } catch (e) { return }
            try {
                await deletePrecheckRepairer(row._id)
                this.$message.success(this.$tp('Removed'))
                this.load()
            } catch (e) {
                // the request layer has said why
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.rpr-filters {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px;
    .f-search { width: 300px; }
    .rpr-spacer { flex: 1; }
    .el-button + .el-button { margin-left: 0; }
}
.rpr-del { color: #f56c6c; }
.rpr-dim { color: #c0c4cc; }
.rpr-link { color: #409eff; font-weight: 600; }
.rpr-hint { margin-left: 10px; font-size: 12px; color: #909399; word-break: normal; }
@media (max-width: 767px) {
    .rpr-filters .f-search { width: 100%; }
}
</style>
