<template>
    <!--
        Who a ticket (or one device line) is assigned to, as text that opens
        RepairDesk's employee list (user 2026-10-30). Emits `pick` with the
        chosen employee; the parent confirms and saves.
    -->
    <el-dropdown
        trigger="click"
        placement="bottom-start"
        :disabled="busy"
        @command="id => $emit('pick', employees.find(e => e.id === id))"
    >
        <span
            class="assign-menu-label"
            :class="{ 'assign-menu-label--none': !value }"
            :title="busy ? 'Saving to RepairDesk…' : 'Change who it is assigned to'"
        >
            {{ value || 'Unassigned' }}
            <i :class="busy ? 'el-icon-loading' : 'el-icon-arrow-down'" />
        </span>
        <el-dropdown-menu slot="dropdown" :visible-arrow="false" class="repair-assign-menu">
            <el-dropdown-item
                v-for="e in employees"
                :key="e.id"
                :command="e.id"
                :disabled="e.id === valueId && !mixed"
            >
                {{ e.name }}
            </el-dropdown-item>
        </el-dropdown-menu>
    </el-dropdown>
</template>

<script>
export default {
    name: 'AssignMenu',
    props: {
        // the current assignee's name and RepairDesk employee id ('' = none)
        value: { type: String, default: '' },
        valueId: { type: String, default: '' },
        // [{ id, name }] from GET /repair/employees — the menu lists names only
        employees: { type: Array, default: () => [] },
        // the ticket's device lines aren't all with `value`, so it stays pickable
        mixed: { type: Boolean, default: false },
        busy: { type: Boolean, default: false }
    }
}
</script>

<style scoped>
.assign-menu-label {
    cursor: pointer;
    color: #303133;
}
.assign-menu-label:hover {
    color: #409eff;
}
.assign-menu-label--none {
    color: #c0c4cc;
    font-style: italic;
}
.assign-menu-label i {
    margin-left: 2px;
    font-size: 12px;
}
</style>

<style>
/* the menu is appended to <body>, outside the scoped styles */
.repair-assign-menu {
    max-height: 360px;
    overflow-y: auto;
}
</style>
