<template>
    <div class="tools-page">
        <!--
            Page header — short greeting + tool count. Matches the visual
            language of the role-aware Home dashboard so the two pages feel
            like siblings rather than mismatched.
        -->
        <div class="tools-header">
            <div>
                <h2 class="tools-title">Tools</h2>
                <p class="tools-sub">
                    Small utilities for the admin team. Click a card to launch.
                </p>
            </div>
            <div class="tools-actions">
                <el-input
                    v-model="search"
                    size="small"
                    clearable
                    placeholder="Search tools…"
                    prefix-icon="el-icon-search"
                    class="tools-search"
                />
            </div>
        </div>

        <div class="tools-count-row">
            <span class="tools-count-label">All Tools</span>
            <el-tag size="small" type="info" effect="plain">{{ filteredTools.length }}</el-tag>
        </div>

        <!--
            Card grid. CSS Grid with auto-fill so the layout flexes from
            phone (1 col) through tablet (2-3 col) up to desktop (4 col)
            without needing per-breakpoint configuration.
        -->
        <div class="tools-grid">
            <div
                v-for="tool in filteredTools"
                :key="tool.id"
                :class="['tool-card', { 'is-disabled': tool.status === 'coming-soon' }]"
                @click="handleToolClick(tool)"
            >
                <div :class="['tool-icon', `tool-icon-${tool.color}`]">
                    <i :class="tool.icon" />
                </div>
                <div class="tool-body">
                    <div class="tool-name">{{ tool.name }}</div>
                    <div class="tool-desc">{{ tool.description }}</div>
                </div>
                <div class="tool-footer">
                    <el-tag
                        v-if="tool.status === 'coming-soon'"
                        size="mini"
                        type="info"
                        effect="plain"
                    >Coming soon</el-tag>
                    <el-tag
                        v-else-if="tool.status === 'beta'"
                        size="mini"
                        type="warning"
                        effect="plain"
                    >Beta</el-tag>
                    <span v-else class="tool-ready">
                        <i class="el-icon-arrow-right" /> Launch
                    </span>
                </div>
            </div>

            <div v-if="filteredTools.length === 0" class="tools-empty">
                No tools match “{{ search }}”.
            </div>
        </div>

        <!--
            Shared dialog for "simple" tools. The active tool's component is
            mounted via <component :is="..."> so new dialog-based tools can
            be added by dropping a component into ./components and adding an
            entry to TOOLS below with entry: 'dialog'.
        -->
        <el-dialog
            :title="activeTool ? activeTool.name : ''"
            :visible.sync="dialogOpen"
            :width="activeTool && activeTool.dialogWidth || '640px'"
            append-to-body
            :close-on-click-modal="false"
            custom-class="tool-dialog"
            @close="onDialogClose"
        >
            <component
                v-if="dialogOpen && activeTool && activeTool.component"
                :is="activeTool.component"
            />
        </el-dialog>
    </div>
</template>

<script>
import CreateCreditNote from './components/CreateCreditNote'

// Tools registry — single source of truth for what shows on this page.
//
// `entry` determines what happens when the card is clicked:
//   - 'dialog' : load `component` into the shared el-dialog above
//   - 'route'  : $router.push(`route`) — for larger tools that earn their
//                own page (and deep-linkable URL)
//   - 'coming-soon' / undefined : non-clickable placeholder
//
// To add a new tool: append a row here, then either create the dialog
// component under ./components/ or register the route in router/index.js.
const TOOLS = [
    {
        id: 'create-credit-note',
        name: 'Create Credit Note',
        description: 'Photograph or upload a credit note image and submit it for processing.',
        icon: 'el-icon-receiving',
        color: 'green',
        entry: 'dialog',
        component: CreateCreditNote,
        dialogWidth: '560px'
    },
    {
        id: 'json-formatter',
        name: 'JSON Formatter',
        description: 'Format, validate and beautify your JSON.',
        icon: 'el-icon-document',
        color: 'blue',
        status: 'coming-soon'
    },
    {
        id: 'sku-lookup',
        name: 'SKU Lookup',
        description: 'Resolve a Commerce SKU to its Inventory item id and Wholesale price.',
        icon: 'el-icon-search',
        color: 'teal',
        status: 'coming-soon'
    },
    {
        id: 'inventory-csv-export',
        name: 'Inventory CSV Export',
        description: 'Export a stock snapshot for a collection as CSV.',
        icon: 'el-icon-download',
        color: 'green',
        status: 'coming-soon'
    },
    {
        id: 'bulk-status-change',
        name: 'Bulk Status Change',
        description: 'Move many SQT cases between statuses in one go.',
        icon: 'el-icon-sort',
        color: 'orange',
        status: 'coming-soon'
    },
    {
        id: 'password-generator',
        name: 'Password Generator',
        description: 'Generate a strong password for new user accounts.',
        icon: 'el-icon-key',
        color: 'purple',
        status: 'coming-soon'
    },
    {
        id: 'repairdesk-probe',
        name: 'RepairDesk Probe',
        description: 'Look up a RepairDesk ticket by caseId to debug status sync.',
        icon: 'el-icon-connection',
        color: 'red',
        status: 'coming-soon'
    }
]

export default {
    name: 'ToolsIndex',
    data() {
        return {
            search: '',
            tools: TOOLS,
            dialogOpen: false,
            activeTool: null
        }
    },
    computed: {
        filteredTools() {
            const q = this.search.trim().toLowerCase()
            if (!q) return this.tools
            return this.tools.filter(t =>
                t.name.toLowerCase().includes(q) ||
                t.description.toLowerCase().includes(q)
            )
        }
    },
    methods: {
        handleToolClick(tool) {
            if (!tool || tool.status === 'coming-soon') {
                this.$message.info(`${tool.name} is coming soon`)
                return
            }
            if (tool.entry === 'route' && tool.route) {
                this.$router.push(tool.route)
                return
            }
            if (tool.entry === 'dialog' && tool.component) {
                this.activeTool = tool
                this.dialogOpen = true
                return
            }
            // Defensive fallback — shouldn't reach here once registered properly.
            this.$message.warning(`No entry configured for "${tool.name}"`)
        },
        onDialogClose() {
            this.activeTool = null
        }
    }
}
</script>

<style scoped>
.tools-page {
    padding: 18px 20px;
    background: #f5f7fb;
    min-height: 100%;
}

/* Header */
.tools-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
}
.tools-title {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
    color: #111827;
    line-height: 1.2;
}
.tools-sub {
    margin: 6px 0 0;
    color: #909399;
    font-size: 13px;
}
.tools-search { width: 240px; }

/* Count row above the grid */
.tools-count-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 10px 0 14px;
}
.tools-count-label {
    font-size: 15px;
    font-weight: 600;
    color: #303133;
}

/* Card grid */
.tools-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
}

/* Tool card */
.tool-card {
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 12px;
    padding: 18px 18px 14px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 158px;
    transition: box-shadow 0.18s ease, transform 0.18s ease, border-color 0.18s ease;
}
.tool-card:hover {
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06);
    transform: translateY(-1px);
    border-color: #c6cef0;
}
.tool-card.is-disabled {
    cursor: not-allowed;
    opacity: 0.72;
}
.tool-card.is-disabled:hover {
    box-shadow: none;
    transform: none;
    border-color: #ebeef5;
}

/* Coloured icon tile — palette mirrors the home dashboard's KpiTile */
.tool-icon {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
}
.tool-icon-blue   { background: #eff6ff; color: #1d4ed8; }
.tool-icon-green  { background: #f0fdf4; color: #15803d; }
.tool-icon-orange { background: #fff7ed; color: #c2410c; }
.tool-icon-purple { background: #f5f3ff; color: #6d28d9; }
.tool-icon-red    { background: #fef2f2; color: #b91c1c; }
.tool-icon-teal   { background: #f0fdfa; color: #0f766e; }

.tool-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}
.tool-name {
    font-weight: 600;
    color: #111827;
    font-size: 15px;
    line-height: 1.3;
}
.tool-desc {
    color: #6b7280;
    font-size: 13px;
    line-height: 1.4;
}

/* Footer — status tag for placeholders or a quiet "Launch" hint for ready tools */
.tool-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
}
.tool-ready {
    color: #409eff;
    font-size: 12px;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

/* Empty state when search returns nothing */
.tools-empty {
    grid-column: 1 / -1;
    padding: 32px 0;
    text-align: center;
    color: #909399;
}

/*
 * Tool dialog responsive overrides.
 * Element UI dialogs use a fixed pixel width from the `width` prop, which
 * overflows on phones. We override it via ::v-deep + custom-class so the
 * dialog still scales gracefully without each tool needing to know about
 * the viewport. Targets the body-teleported wrapper (append-to-body).
 */
::v-deep .tool-dialog {
    /* Cap at the configured pixel width on desktop, but never exceed
       92% of the viewport so small screens don't horizontally overflow. */
    max-width: 92vw;
}
@media (max-width: 600px) {
    ::v-deep .tool-dialog {
        width: 96vw !important;
        margin-top: 6vh !important;
    }
    ::v-deep .tool-dialog .el-dialog__header {
        padding: 14px 16px 10px;
    }
    ::v-deep .tool-dialog .el-dialog__body {
        padding: 14px 16px;
    }
}
</style>
