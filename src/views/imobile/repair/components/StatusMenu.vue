<template>
    <!--
        A RepairDesk status as a tag that opens the status list (user
        2026-10-27: change a ticket's status from the Repair page). Emits
        `pick` with the chosen name; the parent confirms and saves.
    -->
    <el-dropdown
        trigger="click"
        placement="bottom"
        :disabled="busy"
        @command="name => $emit('pick', name)"
    >
        <!-- `pill`: the outlined button look of the ticket detail dialog -->
        <span
            v-if="appearance === 'pill'"
            class="status-menu-pill"
            :class="{ 'status-menu-pill--large': large }"
            :title="busy ? 'Saving to RepairDesk…' : 'Change status'"
        >
            {{ value || '—' }}
            <i :class="busy ? 'el-icon-loading' : 'el-icon-arrow-down'" />
        </span>
        <el-tag
            v-else
            :type="tagType"
            size="mini"
            effect="plain"
            class="status-menu-tag"
            :title="busy ? 'Saving to RepairDesk…' : 'Change status'"
        >
            {{ value || '—' }}
            <i :class="busy ? 'el-icon-loading' : 'el-icon-arrow-down'" />
        </el-tag>
        <el-dropdown-menu slot="dropdown" :visible-arrow="false" class="repair-status-menu">
            <template v-for="g in groups">
                <li :key="'h-' + g.label" class="repair-status-menu__group">{{ g.label }}</li>
                <el-dropdown-item
                    v-for="s in g.items"
                    :key="s.name"
                    :command="s.name"
                    :disabled="s.name === value && !mixed"
                >
                    <span class="repair-status-menu__dot" :style="{ background: s.color || '#c0c4cc' }" />{{ s.name }}
                </el-dropdown-item>
            </template>
        </el-dropdown-menu>
    </el-dropdown>
</template>

<script>
// RepairDesk status types in the order the menu lists them; a type not
// named here follows, in the order RepairDesk gives it.
const TYPE_ORDER = [
    { type: 'open', label: 'Open' },
    { type: 'on hold', label: 'On hold' },
    { type: 'warranty repair', label: 'Warranty' },
    { type: 'closed', label: 'Closed' },
    { type: 'cancelled', label: 'Cancelled' }
]

export default {
    name: 'StatusMenu',
    props: {
        // the current status name
        value: { type: String, default: '' },
        // [{ name, type, color }] from GET /repair/statuses
        statuses: { type: Array, default: () => [] },
        // the ticket's device lines don't all share `value`, so it stays pickable
        mixed: { type: Boolean, default: false },
        busy: { type: Boolean, default: false },
        tagType: { type: String, default: '' },
        // 'tag' (the Tickets table) or 'pill' (the ticket detail dialog)
        appearance: { type: String, default: 'tag' },
        // the bigger pill (the dialog's Ticket Details card)
        large: { type: Boolean, default: false }
    },
    computed: {
        groups() {
            const byType = new Map()
            for (const s of this.statuses) {
                const type = String(s.type || '').trim().toLowerCase()
                if (!byType.has(type)) byType.set(type, [])
                byType.get(type).push(s)
            }
            const known = TYPE_ORDER.filter(t => byType.has(t.type))
                .map(t => ({ label: t.label, items: byType.get(t.type) }))
            const rest = Array.from(byType)
                .filter(([type]) => !TYPE_ORDER.some(t => t.type === type))
                .map(([type, items]) => ({ label: type || 'Other', items }))
            return known.concat(rest)
        }
    }
}
</script>

<style scoped>
.status-menu-tag {
    cursor: pointer;
}
.status-menu-tag i {
    margin-left: 2px;
}
.status-menu-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 12px;
    border: 1px solid #409eff;
    border-radius: 6px;
    background: #fff;
    color: #1677ff;
    font-size: 12px;
    line-height: 18px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
}
.status-menu-pill:hover {
    background: #ecf5ff;
}
.status-menu-pill--large {
    padding: 5px 14px;
    font-size: 14px;
    line-height: 20px;
}
</style>

<style>
/* the menu is appended to <body>, outside the scoped styles */
.repair-status-menu {
    max-height: 360px;
    overflow-y: auto;
}
.repair-status-menu__group {
    padding: 6px 16px 2px;
    font-size: 11px;
    font-weight: 600;
    color: #909399;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    list-style: none;
}
.repair-status-menu__dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 8px;
    vertical-align: middle;
}
</style>
