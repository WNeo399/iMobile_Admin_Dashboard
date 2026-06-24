<template>
    <div class="app-container svp-enquiries-page">
        <!-- Filter bar: status segments (with counts) + search -->
        <div class="filter-bar">
            <el-radio-group v-model="queryParams.status" size="small" @change="handleStatusFilter">
                <el-radio-button label="">All ({{ counts.all || 0 }})</el-radio-button>
                <el-radio-button
                    v-for="s in STATUS_META"
                    :key="s.value"
                    :label="s.value"
                >{{ s.label }} ({{ counts[s.value] || 0 }})</el-radio-button>
            </el-radio-group>

            <span class="filter-spacer" />

            <el-input
                v-model="queryParams.search"
                placeholder="Serial, name, contact…"
                clearable
                size="small"
                prefix-icon="el-icon-search"
                class="filter-search"
                @keyup.enter.native="handleQuery"
                @clear="handleQuery"
            />
            <el-button size="small" type="primary" icon="el-icon-search" @click="handleQuery">Search</el-button>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="getList">Refresh</el-button>
        </div>

        <el-table v-loading="loading" :data="list" stripe size="small" class="svp-table" row-key="_id">
            <el-table-column label="Serial" min-width="150">
                <template slot-scope="scope">
                    <span class="serial-chip">{{ scope.row.serial || '—' }}</span>
                </template>
            </el-table-column>
            <el-table-column label="Customer" min-width="170">
                <template slot-scope="scope">
                    <div>{{ scope.row.name || '—' }}</div>
                    <div class="sub">
                        <i class="el-icon-phone-outline" /> {{ scope.row.contact || '—' }}
                    </div>
                </template>
            </el-table-column>
            <el-table-column label="Note" min-width="220">
                <template slot-scope="scope">
                    <span v-if="scope.row.note" class="note-cell" :title="scope.row.note">{{ scope.row.note }}</span>
                    <span v-else class="muted">—</span>
                </template>
            </el-table-column>
            <el-table-column label="Status" width="130" align="center">
                <template slot-scope="scope">
                    <el-tag size="mini" :type="statusType(scope.row.status)" effect="plain">
                        {{ statusLabel(scope.row.status) }}
                    </el-tag>
                </template>
            </el-table-column>
            <el-table-column label="Submitted" width="160" align="center">
                <template slot-scope="scope">{{ formatDate(scope.row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="Action" width="150" align="center">
                <template slot-scope="scope">
                    <el-button
                        size="mini"
                        type="text"
                        icon="el-icon-edit"
                        v-hasPermi="['svp:enquiry:manage']"
                        @click="openEdit(scope.row)"
                    >Update</el-button>
                    <el-button
                        size="mini"
                        type="text"
                        icon="el-icon-delete"
                        class="row-delete"
                        v-hasPermi="['svp:enquiry:manage']"
                        :loading="deletingId === scope.row._id"
                        @click="confirmDelete(scope.row)"
                    >Delete</el-button>
                </template>
            </el-table-column>
        </el-table>

        <pagination
            v-show="total > 0"
            :total="total"
            :page.sync="queryParams.page"
            :limit.sync="queryParams.pageSize"
            @pagination="getList"
        />

        <!-- Update dialog -->
        <el-dialog
            :title="editTitle"
            :visible.sync="editOpen"
            width="520px"
            append-to-body
            :close-on-click-modal="false"
        >
            <div v-if="editRow" class="edit-body">
                <dl class="edit-detail">
                    <dt>Serial</dt>
                    <dd><span class="serial-chip">{{ editRow.serial || '—' }}</span></dd>
                    <dt>Name</dt>
                    <dd>{{ editRow.name || '—' }}</dd>
                    <dt>Contact</dt>
                    <dd>{{ editRow.contact || '—' }}</dd>
                    <dt>Note</dt>
                    <dd class="multiline">{{ editRow.note || '—' }}</dd>
                    <dt>Submitted</dt>
                    <dd>{{ formatDate(editRow.createdAt) }}</dd>
                </dl>

                <el-form :model="editForm" label-width="90px" size="small" class="edit-form">
                    <el-form-item label="Status">
                        <el-select v-model="editForm.status" class="full">
                            <el-option
                                v-for="s in STATUS_META"
                                :key="s.value"
                                :value="s.value"
                                :label="s.label"
                            />
                        </el-select>
                    </el-form-item>
                    <el-form-item label="Admin note">
                        <el-input
                            v-model="editForm.adminNote"
                            type="textarea"
                            :rows="3"
                            maxlength="1000"
                            show-word-limit
                            placeholder="Internal note — e.g. supplier's confirmation"
                        />
                    </el-form-item>
                </el-form>
            </div>
            <div slot="footer">
                <el-button :disabled="saving" @click="editOpen = false">Cancel</el-button>
                <el-button type="primary" :loading="saving" @click="saveEdit">Save</el-button>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import { listSvpEnquiries, updateSvpEnquiry, deleteSvpEnquiry } from '@/api/svp/enquiry'

const STATUS_META = [
    { value: 'pending', label: 'Pending', type: 'warning' },
    { value: 'genuine', label: 'Genuine', type: 'success' },
    { value: 'not-genuine', label: 'Not Genuine', type: 'danger' },
    { value: 'closed', label: 'Closed', type: 'info' }
]

export default {
    name: 'ImobileSvpEnquiry',
    data() {
        return {
            loading: false,
            list: [],
            total: 0,
            counts: { all: 0, pending: 0, genuine: 0, 'not-genuine': 0, closed: 0 },
            STATUS_META,
            queryParams: { page: 1, pageSize: 20, status: '', search: '' },
            // Update dialog
            editOpen: false,
            editRow: null,
            editForm: { status: 'pending', adminNote: '' },
            saving: false,
            deletingId: null
        }
    },
    computed: {
        editTitle() {
            return this.editRow ? `Enquiry — ${this.editRow.serial || ''}` : 'Update Enquiry'
        }
    },
    created() {
        this.getList()
    },
    methods: {
        async getList() {
            this.loading = true
            try {
                const params = { page: this.queryParams.page, pageSize: this.queryParams.pageSize }
                if (this.queryParams.status) params.status = this.queryParams.status
                if (this.queryParams.search) params.search = this.queryParams.search
                const res = await listSvpEnquiries(params)
                if (!res || res.success === false) throw new Error((res && res.message) || 'Failed to load')
                this.list = res.data || []
                this.total = res.total || 0
                this.counts = res.counts || { all: 0 }
            } catch (e) {
                console.error('Load SVP enquiries failed:', e)
                this.$message.error(this.msg(e, 'Failed to load enquiries'))
                this.list = []
                this.total = 0
            } finally {
                this.loading = false
            }
        },
        handleQuery() {
            this.queryParams.page = 1
            this.getList()
        },
        handleStatusFilter() {
            this.queryParams.page = 1
            this.getList()
        },
        openEdit(row) {
            this.editRow = row
            this.editForm = { status: row.status || 'pending', adminNote: row.adminNote || '' }
            this.editOpen = true
        },
        async saveEdit() {
            if (!this.editRow) return
            this.saving = true
            try {
                const res = await updateSvpEnquiry(this.editRow._id, {
                    status: this.editForm.status,
                    adminNote: this.editForm.adminNote
                })
                const updated = res && res.data
                if (!updated) throw new Error((res && res.message) || 'Save failed')
                const idx = this.list.findIndex(r => r._id === updated._id)
                if (idx !== -1) this.$set(this.list, idx, updated)
                this.$message.success('Enquiry updated')
                this.editOpen = false
                // Status may have changed — refresh counts.
                this.getList()
            } catch (e) {
                console.error('Update SVP enquiry failed:', e)
                this.$message.error(this.msg(e, 'Save failed'))
            } finally {
                this.saving = false
            }
        },
        async confirmDelete(row) {
            if (!row || !row._id || this.deletingId) return
            try {
                await this.$confirm(
                    `Delete the enquiry from ${row.name || 'this customer'}? This cannot be undone.`,
                    'Confirm delete',
                    { confirmButtonText: 'Delete', cancelButtonText: 'Cancel', type: 'warning' }
                )
            } catch {
                return
            }
            this.deletingId = row._id
            try {
                const res = await deleteSvpEnquiry(row._id)
                if (!res || res.success === false) throw new Error((res && res.message) || 'Delete failed')
                this.$message.success('Enquiry deleted')
                this.getList()
            } catch (e) {
                console.error('Delete SVP enquiry failed:', e)
                this.$message.error(this.msg(e, 'Delete failed'))
            } finally {
                this.deletingId = null
            }
        },
        statusType(value) {
            const m = STATUS_META.find(s => s.value === value)
            return m ? m.type : 'info'
        },
        statusLabel(value) {
            const m = STATUS_META.find(s => s.value === value)
            return m ? m.label : (value || 'Unknown')
        },
        formatDate(value) {
            if (!value) return '—'
            const d = new Date(value)
            if (isNaN(d.getTime())) return '—'
            return d.toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })
        },
        msg(e, fallback) {
            return (e.response && e.response.data && e.response.data.message) || e.message || fallback
        }
    }
}
</script>

<style lang="scss" scoped>
.filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
}
.filter-spacer { flex: 1; }
.filter-search { width: 240px; max-width: 100%; }

.svp-table {
    border: 1px solid #ebeef5;
    border-radius: 8px;
    overflow: hidden;
}
.serial-chip {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-weight: 600;
    color: #303133;
}
.sub { color: #909399; font-size: 12px; margin-top: 2px; }
.note-cell {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: bottom;
}
.muted { color: #c0c4cc; font-style: italic; }
.row-delete { color: #f56c6c; &:hover { color: #c45656; } }

.edit-detail {
    display: grid;
    grid-template-columns: 90px 1fr;
    gap: 8px 12px;
    margin: 0 0 16px;
    padding-bottom: 14px;
    border-bottom: 1px solid #ebeef5;
    font-size: 13px;
}
.edit-detail dt { color: #909399; }
.edit-detail dd { margin: 0; color: #303133; font-weight: 500; }
.multiline { white-space: pre-wrap; word-break: break-word; }
.edit-form .full { width: 100%; }
</style>
