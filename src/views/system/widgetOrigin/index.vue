<template>
    <div class="app-container widget-setting-page">
        <!--
            Toolbar — just a refresh. No global add button anymore;
            origins are managed inside each widget's Edit dialog so
            you can't add an origin without picking a widget first
            (which was the previous flow's footgun).
        -->
        <div class="filter-bar">
            <span class="filter-spacer" />
            <el-button
                size="small"
                icon="el-icon-refresh"
                :loading="loading"
                @click="getList"
            >Refresh</el-button>
        </div>

        <el-alert
            type="info"
            :closable="false"
            class="page-help"
            show-icon
        >
            <template slot="title">
                <span>
                    Each row is a widget shipped from the iMobile_Widget
                    repo. Click Edit to manage the origins allowed to
                    submit to that widget's public endpoint. Changes
                    propagate to the widget backend within ~60 seconds
                    (or immediately on the next request after each
                    add / toggle / delete).
                </span>
            </template>
        </el-alert>

        <!--
            Widget catalogue. One row per known widget (see
            KNOWN_WIDGETS below). The Allowed Origins column reflects
            what's currently enabled; disabled-but-not-deleted rows
            are shown in a subdued chip so it's clear the bucket
            isn't empty if everything's been paused.
        -->
        <el-table
            v-loading="loading"
            :data="KNOWN_WIDGETS"
            stripe
            size="small"
            class="widgets-table"
            row-key="value"
        >
            <el-table-column label="Widget" min-width="160">
                <template slot-scope="scope">
                    <span class="widget-name">{{ scope.row.label }}</span>
                    <div class="widget-id">{{ scope.row.value }}</div>
                </template>
            </el-table-column>
            <el-table-column label="Description" min-width="340">
                <template slot-scope="scope">
                    <span class="widget-description">{{ scope.row.description }}</span>
                </template>
            </el-table-column>
            <el-table-column label="Allowed Origins" width="180" align="center">
                <template slot-scope="scope">
                    <span class="origin-count">
                        <strong>{{ countEnabled(scope.row.value) }}</strong> enabled
                        <span
                            v-if="countDisabled(scope.row.value) > 0"
                            class="origin-count-sub"
                        >
                            · {{ countDisabled(scope.row.value) }} disabled
                        </span>
                    </span>
                </template>
            </el-table-column>
            <el-table-column label="Actions" width="100" align="center">
                <template slot-scope="scope">
                    <el-button
                        size="mini"
                        type="text"
                        icon="el-icon-edit"
                        @click="openEdit(scope.row)"
                    >Edit</el-button>
                </template>
            </el-table-column>
        </el-table>

        <!--
            Widget detail / origin editor dialog. Scoped to one
            widget: shows that widget's identity at the top, the
            current origin list in the middle (with per-row enabled
            toggle + delete), and an inline add form at the bottom.
            All mutations route through the existing /widgetOrigin
            endpoints and update the in-memory list directly so
            edits feel immediate without a full refetch.
        -->
        <el-dialog
            :title="dialogTitle"
            :visible.sync="dialogOpen"
            width="760px"
            top="6vh"
            append-to-body
            :close-on-click-modal="false"
            @close="onDialogClose"
        >
            <div v-if="editingWidget">
                <!-- Widget identity strip -->
                <div class="widget-info">
                    <div class="widget-info-id">
                        <span class="widget-info-label">Widget</span>
                        <code class="widget-info-name">{{ editingWidget.value }}</code>
                    </div>
                    <p class="widget-info-description">
                        {{ editingWidget.description }}
                    </p>
                </div>

                <!-- Existing origins -->
                <div class="origins-section">
                    <div class="origins-section-head">
                        <span class="section-title">
                            <i class="el-icon-link" />
                            Allowed Origins
                            <span class="section-title-count">
                                ({{ currentOrigins.length }})
                            </span>
                        </span>
                    </div>
                    <div v-if="currentOrigins.length === 0" class="origins-empty">
                        No origins configured yet. Add the first one below.
                    </div>
                    <el-table
                        v-else
                        :data="currentOrigins"
                        size="small"
                        class="origins-inline-table"
                        row-key="_id"
                    >
                        <el-table-column label="Origin" min-width="240">
                            <template slot-scope="scope">
                                <code class="origin-text">{{ scope.row.origin }}</code>
                            </template>
                        </el-table-column>
                        <el-table-column label="Label" min-width="140">
                            <template slot-scope="scope">
                                <span v-if="scope.row.label">{{ scope.row.label }}</span>
                                <span v-else class="muted">—</span>
                            </template>
                        </el-table-column>
                        <el-table-column label="Enabled" width="100" align="center">
                            <template slot-scope="scope">
                                <el-switch
                                    :value="scope.row.enabled"
                                    :disabled="toggleId === scope.row._id"
                                    active-color="#67C23A"
                                    inactive-color="#909399"
                                    @change="(val) => onToggleEnabled(scope.row, val)"
                                />
                            </template>
                        </el-table-column>
                        <el-table-column label="" width="60" align="center">
                            <template slot-scope="scope">
                                <el-button
                                    size="mini"
                                    type="text"
                                    icon="el-icon-delete"
                                    class="row-delete"
                                    :title="`Delete ${scope.row.origin}`"
                                    @click="onDelete(scope.row)"
                                />
                            </template>
                        </el-table-column>
                    </el-table>
                </div>

                <!--
                    Inline add form. Pessimistic save (round trip
                    finishes before the row appears) so server-side
                    validation errors land back in the input that
                    caused them rather than rolling back a row
                    that already rendered.
                -->
                <div class="add-section">
                    <div class="add-section-head">
                        <span class="section-title">
                            <i class="el-icon-plus" />
                            Add Origin
                        </span>
                    </div>
                    <div class="add-form">
                        <el-input
                            v-model="addForm.origin"
                            size="small"
                            placeholder="https://example.com"
                            class="add-origin-input"
                            :disabled="adding"
                            @keyup.enter.native="onAdd"
                        />
                        <el-input
                            v-model="addForm.label"
                            size="small"
                            placeholder="Label (optional)"
                            class="add-label-input"
                            :disabled="adding"
                            @keyup.enter.native="onAdd"
                        />
                        <el-button
                            type="primary"
                            size="small"
                            icon="el-icon-plus"
                            :loading="adding"
                            @click="onAdd"
                        >Add</el-button>
                    </div>
                    <span class="add-help">
                        Protocol + host (+ port). No path, no trailing
                        slash. The backend normalises whatever you paste,
                        so https://Example.com/ and https://example.com
                        won't double up.
                    </span>
                </div>
            </div>
            <div slot="footer">
                <el-button @click="dialogOpen = false">Close</el-button>
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

// Widgets the admin can manage. This is the single source of truth
// for the page — update when new widgets ship out of the
// iMobile_Widget repo. The `value` must match the widget folder
// name + the WIDGET_NAME constant in the corresponding backend
// route file (e.g. routes/widgetRoutes/specialOrder.js) — that's
// the key the backend uses to look up the origin allowlist.
const KNOWN_WIDGETS = [
    {
        value: 'special-order',
        label: 'Special Order',
        description:
            "Embeddable form on customer-facing sites where shoppers can submit special-order requests (name, description, images). Submissions land in the imb_special_orders collection and show up under iMobile → Special Order for triage."
    }
]

export default {
    name: 'SystemWidgetOrigin',
    data() {
        return {
            KNOWN_WIDGETS,
            loading: false,
            // All origins fetched in one pass and grouped client-side.
            // Map of widget value → array of origin rows. Recalculated
            // on every getList / mutation that needs it.
            originsByWidget: {},

            // Dialog state — single dialog scoped to one widget at
            // a time. `currentOrigins` is a computed off
            // originsByWidget[editingWidget.value].
            dialogOpen: false,
            editingWidget: null,
            addForm: { origin: '', label: '' },
            adding: false,
            // Set to the row id whose enabled toggle is mid-flight,
            // so other rows' switches stay responsive.
            toggleId: null
        }
    },
    computed: {
        dialogTitle() {
            return this.editingWidget
                ? `${this.editingWidget.label} — Origin Allowlist`
                : 'Widget Setting'
        },
        // Origins for the currently-edited widget. Reading this
        // off the same `originsByWidget` map the table reads keeps
        // the dialog's counts and the catalogue's counts in lockstep.
        currentOrigins() {
            if (!this.editingWidget) return []
            return this.originsByWidget[this.editingWidget.value] || []
        }
    },
    created() {
        this.getList()
    },
    methods: {
        async getList() {
            this.loading = true
            try {
                // Fetch every origin in one call — there will never be
                // anywhere close to 1000 widget-origin rows across
                // all widgets combined, so pagination is overkill.
                // If we ever do hit that ceiling, refactor to one
                // call per widget keyed off KNOWN_WIDGETS.
                const res = await listWidgetOrigins({ pageSize: 1000 })
                if (!res || res.success === false) {
                    throw new Error((res && res.message) || 'Failed to load')
                }
                this.originsByWidget = groupByWidget(res.data || [])
            } catch (e) {
                console.error('Widget origin list failed:', e)
                this.$message.error(this.errMsg(e, 'Failed to load widget origins'))
                this.originsByWidget = {}
            } finally {
                this.loading = false
            }
        },
        // ── Catalogue helpers ─────────────────────────────────────
        countEnabled(widgetValue) {
            const rows = this.originsByWidget[widgetValue] || []
            return rows.filter(r => r.enabled !== false).length
        },
        countDisabled(widgetValue) {
            const rows = this.originsByWidget[widgetValue] || []
            return rows.filter(r => r.enabled === false).length
        },
        // ── Edit dialog ───────────────────────────────────────────
        openEdit(widget) {
            this.editingWidget = widget
            this.addForm = { origin: '', label: '' }
            this.dialogOpen = true
        },
        onDialogClose() {
            this.editingWidget = null
            this.addForm = { origin: '', label: '' }
            this.adding = false
            this.toggleId = null
        },
        // ── Add ────────────────────────────────────────────────────
        async onAdd() {
            if (this.adding) return
            if (!this.editingWidget) return
            const origin = String(this.addForm.origin || '').trim()
            if (!origin) {
                this.$message.warning('Origin is required.')
                return
            }
            this.adding = true
            try {
                const res = await createWidgetOrigin({
                    widget: this.editingWidget.value,
                    origin,
                    label: this.addForm.label,
                    enabled: true
                })
                if (!res || res.success === false) {
                    throw new Error((res && res.message) || 'Add failed')
                }
                // Insert into the local map so the dialog's table
                // and the catalogue's count both pick it up.
                const w = this.editingWidget.value
                const list = this.originsByWidget[w] || []
                const next = list.concat(res.data)
                this.$set(this.originsByWidget, w, next)
                // Reset the form so the user can paste the next
                // origin without clearing manually.
                this.addForm = { origin: '', label: '' }
                this.$message.success('Origin added.')
            } catch (e) {
                console.error('Add origin failed:', e)
                this.$message.error(this.errMsg(e, 'Add failed'))
            } finally {
                this.adding = false
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
                this.patchLocalRow(row.widget, res.data)
            } catch (e) {
                console.error('Toggle failed:', e)
                this.$message.error(this.errMsg(e, 'Toggle failed'))
                // No manual revert: el-switch's :value reads
                // row.enabled, which we haven't mutated yet, so the
                // visual state stays in sync with the DB.
            } finally {
                this.toggleId = null
            }
        },
        // ── Delete ─────────────────────────────────────────────────
        async onDelete(row) {
            try {
                await this.$confirm(
                    `Delete the allowlist entry for "${row.origin}"?`,
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
                const w = row.widget
                const list = this.originsByWidget[w] || []
                const next = list.filter(r => String(r._id) !== String(row._id))
                this.$set(this.originsByWidget, w, next)
                this.$message.success('Origin deleted.')
            } catch (e) {
                console.error('Delete failed:', e)
                this.$message.error(this.errMsg(e, 'Delete failed'))
            }
        },
        // ── Helpers ────────────────────────────────────────────────
        patchLocalRow(widgetValue, updated) {
            if (!updated || !updated._id) return
            const list = this.originsByWidget[widgetValue] || []
            const i = list.findIndex(r => String(r._id) === String(updated._id))
            if (i === -1) return
            const next = list.slice()
            next[i] = updated
            this.$set(this.originsByWidget, widgetValue, next)
        },
        errMsg(e, fallback) {
            return (
                (e.response && e.response.data && e.response.data.message) ||
                e.message ||
                fallback
            )
        }
    }
}

// Group an array of origin rows by their widget value. Used by
// getList() to build the originsByWidget map in one pass; pulled
// out of the component so it's testable independently.
function groupByWidget(rows) {
    const out = {}
    for (const r of rows || []) {
        if (!r || !r.widget) continue
        if (!out[r.widget]) out[r.widget] = []
        out[r.widget].push(r)
    }
    return out
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
.filter-spacer { flex: 1; }
.page-help {
    margin-bottom: 12px;
}

/* Widget catalogue */
.widgets-table {
    border: 1px solid #ebeef5;
    border-radius: 8px;
    overflow: hidden;
}
.widget-name {
    color: #303133;
    font-weight: 600;
    font-size: 14px;
}
.widget-id {
    color: #909399;
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    margin-top: 2px;
}
.widget-description {
    color: #606266;
    font-size: 13px;
    line-height: 1.5;
}
.origin-count {
    color: #303133;
    font-size: 13px;
    strong {
        color: #2563eb;
        font-size: 16px;
        font-weight: 600;
    }
}
.origin-count-sub {
    color: #909399;
    font-size: 11px;
    margin-left: 2px;
}

/* ── Dialog ──────────────────────────────────────────────────────── */
.widget-info {
    padding: 10px 12px;
    background: #f9fafb;
    border: 1px solid #ebeef5;
    border-radius: 6px;
    margin-bottom: 16px;
}
.widget-info-id {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
}
.widget-info-label {
    color: #909399;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.4px;
}
.widget-info-name {
    background: #eef0f3;
    padding: 2px 8px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    color: #303133;
}
.widget-info-description {
    margin: 0;
    color: #606266;
    font-size: 13px;
    line-height: 1.5;
}

.origins-section,
.add-section {
    margin-bottom: 16px;
}
.origins-section-head,
.add-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
}
.section-title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #303133;
    font-size: 13px;
    font-weight: 600;
}
.section-title i {
    color: #2563eb;
    font-size: 14px;
}
.section-title-count {
    color: #909399;
    font-weight: 500;
    margin-left: 2px;
}

.origins-empty {
    padding: 16px;
    color: #909399;
    font-style: italic;
    font-size: 13px;
    text-align: center;
    border: 1px dashed #ebeef5;
    border-radius: 6px;
}
.origins-inline-table {
    border: 1px solid #ebeef5;
    border-radius: 6px;
    overflow: hidden;
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
    padding: 4px !important;
    color: #909399;
}
.row-delete:hover {
    color: #f56c6c;
}

/* Inline add form — origin input grows, label is fixed width,
   button is at the end. Wraps onto two lines on narrow dialogs
   so the inputs don't get squeezed too small to type into. */
.add-form {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}
.add-origin-input {
    flex: 2 1 220px;
    min-width: 180px;
}
.add-label-input {
    flex: 1 1 160px;
    min-width: 140px;
}
.add-help {
    display: block;
    margin-top: 6px;
    color: #909399;
    font-size: 11px;
    line-height: 1.4;
}
</style>
