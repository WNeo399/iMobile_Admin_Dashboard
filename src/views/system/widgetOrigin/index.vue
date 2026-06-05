<template>
    <div class="app-container widget-origin-page">
        <!--
            Toolbar row — widget filter + search + add. Widget filter is
            populated from the distinct widget names in the collection
            (returned alongside the list response) so the dropdown
            reflects reality without a separate fetch. Falls back to
            KNOWN_WIDGETS when the collection is empty so a fresh
            install still offers the right options.
        -->
        <div class="filter-bar">
            <el-select
                v-model="queryParams.widget"
                placeholder="All widgets"
                clearable
                size="small"
                class="filter-widget"
                @change="handleQuery"
            >
                <el-option
                    v-for="w in widgetOptions"
                    :key="w.value"
                    :value="w.value"
                    :label="w.label"
                />
            </el-select>
            <el-input
                v-model="queryParams.search"
                placeholder="Search origin or label…"
                clearable
                size="small"
                prefix-icon="el-icon-search"
                class="filter-search"
                @keyup.enter.native="handleQuery"
                @clear="handleQuery"
            />
            <el-button size="small" type="primary" icon="el-icon-search" @click="handleQuery">
                Search
            </el-button>
            <el-button
                size="small"
                icon="el-icon-refresh"
                :loading="loading"
                @click="getList"
            >Refresh</el-button>
            <span class="filter-spacer" />
            <el-button
                type="primary"
                size="small"
                icon="el-icon-plus"
                @click="openAdd"
            >Add Origin</el-button>
        </div>

        <el-alert
            type="info"
            :closable="false"
            class="page-help"
            show-icon
        >
            <template slot="title">
                <span>
                    Each row is an origin allowed to submit to one widget's
                    public endpoint. Disabled rows are kept for audit but
                    not honoured. Changes propagate to the widget endpoints
                    within ~60 seconds (or immediately on the next request
                    after invalidation).
                </span>
            </template>
        </el-alert>

        <el-table
            v-loading="loading"
            :data="list"
            stripe
            size="small"
            class="origins-table"
            row-key="_id"
        >
            <el-table-column label="Widget" min-width="140">
                <template slot-scope="scope">
                    <span class="widget-badge">{{ widgetLabel(scope.row.widget) }}</span>
                </template>
            </el-table-column>
            <el-table-column label="Origin" min-width="260">
                <template slot-scope="scope">
                    <code class="origin-text">{{ scope.row.origin }}</code>
                </template>
            </el-table-column>
            <el-table-column label="Label" min-width="180">
                <template slot-scope="scope">
                    <span v-if="scope.row.label">{{ scope.row.label }}</span>
                    <span v-else class="muted">—</span>
                </template>
            </el-table-column>
            <el-table-column label="Enabled" width="100" align="center">
                <template slot-scope="scope">
                    <!--
                        Switch inline so a quick disable doesn't need
                        the edit dialog. `loading` covers the per-row
                        toggle round trip.
                    -->
                    <el-switch
                        :value="scope.row.enabled"
                        :disabled="toggleId === scope.row._id"
                        active-color="#67C23A"
                        inactive-color="#909399"
                        @change="(val) => onToggleEnabled(scope.row, val)"
                    />
                </template>
            </el-table-column>
            <el-table-column label="Updated" min-width="160">
                <template slot-scope="scope">
                    {{ formatDate(scope.row.updatedAt || scope.row.createdAt) || '—' }}
                </template>
            </el-table-column>
            <el-table-column label="Actions" width="140" align="center">
                <template slot-scope="scope">
                    <el-button
                        size="mini"
                        type="text"
                        icon="el-icon-edit"
                        @click="openEdit(scope.row)"
                    >Edit</el-button>
                    <el-button
                        size="mini"
                        type="text"
                        icon="el-icon-delete"
                        class="row-delete"
                        @click="onDelete(scope.row)"
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

        <!--
            Add / Edit dialog. Same dialog handles both modes — the
            difference is whether `form._id` is set (edit) and whether
            the widget select is disabled (edit can't change widget).
        -->
        <el-dialog
            :title="dialogTitle"
            :visible.sync="dialogOpen"
            width="520px"
            append-to-body
            :close-on-click-modal="false"
            @close="onDialogClose"
        >
            <el-form ref="form" :model="form" label-width="100px" size="small">
                <el-form-item
                    label="Widget"
                    :rules="[{ required: true, message: 'Pick a widget' }]"
                    prop="widget"
                >
                    <el-select
                        v-model="form.widget"
                        placeholder="Pick a widget"
                        :disabled="isEdit"
                        class="form-control"
                    >
                        <el-option
                            v-for="w in KNOWN_WIDGETS"
                            :key="w.value"
                            :value="w.value"
                            :label="w.label"
                        />
                    </el-select>
                    <span v-if="isEdit" class="form-help">
                        Widget is immutable — delete + recreate to move an origin.
                    </span>
                </el-form-item>
                <el-form-item
                    label="Origin"
                    :rules="[{ required: true, message: 'Origin is required' }]"
                    prop="origin"
                >
                    <el-input
                        v-model="form.origin"
                        placeholder="https://example.com"
                        class="form-control"
                    />
                    <span class="form-help">
                        Protocol + host (+ port). No path, no trailing slash.
                        The backend normalises whatever you paste.
                    </span>
                </el-form-item>
                <el-form-item label="Label" prop="label">
                    <el-input
                        v-model="form.label"
                        placeholder="Optional — friendly name"
                        class="form-control"
                    />
                </el-form-item>
                <el-form-item label="Enabled" prop="enabled">
                    <el-switch
                        v-model="form.enabled"
                        active-color="#67C23A"
                        inactive-color="#909399"
                    />
                </el-form-item>
            </el-form>
            <div slot="footer">
                <el-button :disabled="saving" @click="dialogOpen = false">Cancel</el-button>
                <el-button
                    type="primary"
                    :loading="saving"
                    @click="onSave"
                >{{ isEdit ? 'Save' : 'Add' }}</el-button>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import {
    listWidgetOrigins,
    createWidgetOrigin,
    updateWidgetOrigin,
    deleteWidgetOrigin
} from '@/api/system/widgetOrigin'

// Widgets the admin can pick from in the dialog. Update this list as
// new widgets ship. The dropdown fallback list also drives the
// pretty-label rendering for table rows whose widget value isn't in
// the live distinct list yet (e.g. an entry created before the
// widget shipped).
const KNOWN_WIDGETS = [
    { value: 'special-order', label: 'Special Order' }
]

export default {
    name: 'SystemWidgetOrigin',
    data() {
        return {
            KNOWN_WIDGETS,
            loading: false,
            list: [],
            total: 0,
            // Distinct widget names returned by the list endpoint —
            // populates the toolbar filter select. Fallback to
            // KNOWN_WIDGETS when empty so the filter still has options
            // on first run.
            distinctWidgets: [],
            queryParams: {
                page: 1,
                pageSize: 50,
                widget: '',
                search: ''
            },
            // Edit/Add dialog state. _id only set in edit mode.
            dialogOpen: false,
            form: {
                _id: null,
                widget: '',
                origin: '',
                label: '',
                enabled: true
            },
            saving: false,
            // Per-row toggle state so a slow round trip doesn't flicker
            // every row's switch at once.
            toggleId: null
        }
    },
    computed: {
        isEdit() {
            return !!this.form._id
        },
        dialogTitle() {
            return this.isEdit ? 'Edit Widget Origin' : 'Add Widget Origin'
        },
        // Filter-dropdown options. Prefer the live distinct list so
        // any unknown widgets in the collection still show up
        // (defensive — should rarely happen since admins pick from
        // KNOWN_WIDGETS in the dialog).
        widgetOptions() {
            const live = this.distinctWidgets || []
            if (live.length === 0) return KNOWN_WIDGETS
            return live.map(name => {
                const known = KNOWN_WIDGETS.find(k => k.value === name)
                return known || { value: name, label: name }
            })
        }
    },
    created() {
        this.getList()
    },
    methods: {
        async getList() {
            this.loading = true
            try {
                const params = {
                    page: this.queryParams.page,
                    pageSize: this.queryParams.pageSize
                }
                if (this.queryParams.widget) params.widget = this.queryParams.widget
                if (this.queryParams.search) params.search = this.queryParams.search

                const res = await listWidgetOrigins(params)
                if (!res || res.success === false) {
                    throw new Error((res && res.message) || 'Failed to load')
                }
                this.list = res.data || []
                this.total = res.total || 0
                this.distinctWidgets = res.widgets || []
            } catch (e) {
                console.error('Widget origin list failed:', e)
                this.$message.error(this.errMsg(e, 'Failed to load widget origins'))
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
        // ── Add / Edit ─────────────────────────────────────────────
        openAdd() {
            // Pre-select the widget if the user is filtering by one
            // — saves a click in the common "add another origin for
            // the widget I'm looking at" flow.
            this.form = {
                _id: null,
                widget: this.queryParams.widget || KNOWN_WIDGETS[0].value,
                origin: '',
                label: '',
                enabled: true
            }
            this.dialogOpen = true
        },
        openEdit(row) {
            this.form = {
                _id: row._id,
                widget: row.widget,
                origin: row.origin,
                label: row.label || '',
                enabled: row.enabled !== false
            }
            this.dialogOpen = true
        },
        onDialogClose() {
            this.form = {
                _id: null, widget: '', origin: '', label: '', enabled: true
            }
            this.saving = false
        },
        async onSave() {
            if (!this.form.widget) {
                this.$message.warning('Pick a widget.')
                return
            }
            if (!this.form.origin || !String(this.form.origin).trim()) {
                this.$message.warning('Origin is required.')
                return
            }
            this.saving = true
            try {
                if (this.isEdit) {
                    // Edit: send only the mutable fields. Widget is
                    // server-side immutable so don't bother.
                    const res = await updateWidgetOrigin(this.form._id, {
                        origin: this.form.origin,
                        label: this.form.label,
                        enabled: this.form.enabled
                    })
                    if (!res || res.success === false) {
                        throw new Error((res && res.message) || 'Save failed')
                    }
                    this.patchListRow(res.data)
                    this.$message.success('Origin updated.')
                } else {
                    const res = await createWidgetOrigin({
                        widget: this.form.widget,
                        origin: this.form.origin,
                        label: this.form.label,
                        enabled: this.form.enabled
                    })
                    if (!res || res.success === false) {
                        throw new Error((res && res.message) || 'Save failed')
                    }
                    // Reload to surface the new row in the correct
                    // sort position and update the distinct widgets
                    // list for the filter dropdown.
                    await this.getList()
                    this.$message.success('Origin added.')
                }
                this.dialogOpen = false
            } catch (e) {
                console.error('Widget origin save failed:', e)
                this.$message.error(this.errMsg(e, 'Save failed'))
            } finally {
                this.saving = false
            }
        },
        // ── Toggle enabled ─────────────────────────────────────────
        async onToggleEnabled(row, val) {
            if (this.toggleId) return
            this.toggleId = row._id
            try {
                const res = await updateWidgetOrigin(row._id, { enabled: val })
                if (!res || res.success === false) {
                    throw new Error((res && res.message) || 'Toggle failed')
                }
                this.patchListRow(res.data)
            } catch (e) {
                console.error('Toggle failed:', e)
                this.$message.error(this.errMsg(e, 'Toggle failed'))
                // No rollback needed — el-switch's `:value` is bound
                // to row.enabled, which we haven't mutated yet, so
                // the visual state stays in sync with the DB.
            } finally {
                this.toggleId = null
            }
        },
        // ── Delete ─────────────────────────────────────────────────
        async onDelete(row) {
            try {
                await this.$confirm(
                    `Delete the allowlist entry for "${row.origin}" on widget "${this.widgetLabel(row.widget)}"?`,
                    'Confirm delete',
                    {
                        confirmButtonText: 'Delete',
                        cancelButtonText: 'Cancel',
                        type: 'warning'
                    }
                )
            } catch {
                // User cancelled — el-message-box rejects on cancel.
                return
            }
            try {
                const res = await deleteWidgetOrigin(row._id)
                if (!res || res.success === false) {
                    throw new Error((res && res.message) || 'Delete failed')
                }
                // Remove locally rather than refetch — the page stays
                // on the same page number even if the deletion empties
                // it (pagination will sort itself out on the next
                // user-initiated paginate).
                const idx = this.list.findIndex(r => String(r._id) === String(row._id))
                if (idx !== -1) {
                    this.list.splice(idx, 1)
                    this.total = Math.max(0, this.total - 1)
                }
                this.$message.success('Origin deleted.')
            } catch (e) {
                console.error('Delete failed:', e)
                this.$message.error(this.errMsg(e, 'Delete failed'))
            }
        },
        // ── Helpers ────────────────────────────────────────────────
        patchListRow(updated) {
            if (!updated || !updated._id) return
            const i = this.list.findIndex(r => String(r._id) === String(updated._id))
            if (i !== -1) this.$set(this.list, i, updated)
        },
        widgetLabel(value) {
            if (!value) return ''
            const known = KNOWN_WIDGETS.find(k => k.value === value)
            return known ? known.label : value
        },
        errMsg(e, fallback) {
            return (
                (e.response && e.response.data && e.response.data.message) ||
                e.message ||
                fallback
            )
        },
        formatDate(value) {
            if (!value) return ''
            const d = new Date(value)
            if (isNaN(d.getTime())) return ''
            return d.toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })
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
    margin-bottom: 10px;
}
.filter-widget { width: 200px; }
.filter-search { width: 260px; max-width: 100%; }
.filter-spacer { flex: 1; }
.page-help {
    margin-bottom: 12px;
}

.origins-table {
    border: 1px solid #ebeef5;
    border-radius: 8px;
    overflow: hidden;
}
.widget-badge {
    color: #2563eb;
    font-weight: 600;
    font-size: 13px;
}
.origin-text {
    background: #f3f4f6;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    color: #303133;
    word-break: break-all;
}
.muted {
    color: #c0c4cc;
    font-style: italic;
}
.row-delete {
    color: #f56c6c;
}
.row-delete:hover {
    color: #c45656;
}

.form-control { width: 100%; }
.form-help {
    display: block;
    margin-top: 4px;
    color: #909399;
    font-size: 12px;
    line-height: 1.4;
}
</style>
