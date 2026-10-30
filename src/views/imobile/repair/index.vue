<template>
    <div class="app-container tree-sidebar-manage-wrap repair-page">
        <!--
            Left: shared TreePanel — same component the SQT Cases page uses,
            so the look + collapse/resize behavior stays consistent across
            pages. Nodes carry id/label/count; the slot template renders an
            icon + label + el-badge per row.
        -->
        <tree-panel
            title="Status"
            title-icon-class="el-icon-s-flag"
            :tree-data="treeData"
            :default-expand-all="true"
            :show-search="false"
            storage-key="repair-status-sidebar-width"
            ref="statusTreeRef"
            @node-click="handleStatusClick"
        >
            <template #node="{ data }">
                <span class="status-node">
                    <i
                        :class="data.id === 'all' ? 'el-icon-files' : data.children ? 'el-icon-folder-opened' : 'el-icon-collection-tag'"
                        class="status-node-icon"
                        :style="{ color: statusColor(data.id) }"
                    />
                    <span class="status-node-label" :title="data.label">{{ data.label }}</span>
                    <el-badge
                        v-if="data.count !== undefined"
                        :value="data.count"
                        :max="999"
                        :type="data.id === 'all' ? 'primary' : badgeType(data.id)"
                        class="status-node-badge"
                    />
                </span>
            </template>
        </tree-panel>

        <div class="tree-sidebar-content">
            <div class="content-inner">
                <div class="filter-bar">
                    <!-- The ticket search on every status (2026-10-27: the
                         tree counts follow it, so it stays put); the repaired
                         sub-groups add a date-range picker beside it. -->
                    <el-input
                        v-model="ticketSearch"
                        placeholder="Ticket Number"
                        clearable
                        size="small"
                        prefix-icon="el-icon-search"
                        class="filter-search"
                        @keyup.enter.native="onSearch"
                        @clear="onSearch"
                        @input="onSearch"
                    />
                    <el-date-picker
                        v-if="isRepairedView"
                        v-model="repairedDateRange"
                        type="daterange"
                        range-separator="to"
                        start-placeholder="Repaired from"
                        end-placeholder="Repaired to"
                        value-format="timestamp"
                        size="small"
                        class="filter-date"
                        @change="onDateRangeChange"
                    />

                    <el-select
                        v-model="assignedFilter"
                        placeholder="Assigned to"
                        size="small"
                        clearable
                        class="filter-assigned"
                        @change="onAssignedChange"
                    >
                        <el-option label="All" value="__all" />
                        <el-option label="Not Yet Assign" value="__unassigned" />
                        <el-option
                            v-for="name in assigneeOptions"
                            :key="name"
                            :label="name"
                            :value="name"
                        />
                    </el-select>

                    <!-- by shop group (user ask 2026-10-28): every shop of one
                         customer — the groups are made on iMobile Repair → Shops -->
                    <el-select
                        v-if="shopGroups.length"
                        v-model="shopGroupId"
                        placeholder="Shop group"
                        size="small"
                        clearable
                        filterable
                        class="filter-group"
                        @change="onShopGroupChange"
                    >
                        <el-option
                            v-for="g in shopGroups"
                            :key="g.id"
                            :label="g.name"
                            :value="g.id"
                        >
                            <span>{{ g.name }}</span>
                            <span class="customer-count">{{ g.customers.length }} {{ g.customers.length === 1 ? 'shop' : 'shops' }}</span>
                        </el-option>
                    </el-select>

                    <!-- by customer (user ask 2026-10-27): type to find one;
                         kept across status clicks, like Assigned to -->
                    <el-select
                        v-model="customerFilter"
                        placeholder="Customer"
                        size="small"
                        clearable
                        filterable
                        class="filter-customer"
                        @change="onCustomerChange"
                    >
                        <el-option
                            v-for="c in customerOptions"
                            :key="c.name"
                            :label="c.name"
                            :value="c.name"
                        >
                            <span>{{ c.name }}</span>
                            <span class="customer-count">{{ c.count }}</span>
                        </el-option>
                    </el-select>

                    <div class="filter-actions">
                        <el-button
                            size="small"
                            icon="el-icon-refresh"
                            :loading="loading"
                            @click="getTickets"
                        >Refresh</el-button>
                        <!--
                            Download dropdown — primary "Download Excel"
                            button opens a menu so the user explicitly
                            picks Current view vs Full list each time.
                            Item counts in parentheses are live, so the
                            cost of each export is visible up front.
                        -->
                        <el-dropdown
                            size="small"
                            trigger="click"
                            placement="bottom-end"
                            @command="downloadExcel"
                        >
                            <el-button size="small" icon="el-icon-download">
                                Download Excel<i class="el-icon-arrow-down el-icon--right" />
                            </el-button>
                            <el-dropdown-menu slot="dropdown">
                                <el-dropdown-item command="current">
                                    <i class="el-icon-document" />
                                    Current view
                                    <span class="dropdown-count">({{ filteredTickets.length }})</span>
                                </el-dropdown-item>
                                <el-dropdown-item command="all">
                                    <i class="el-icon-files" />
                                    Full list
                                    <span class="dropdown-count">({{ allTicketsCount }})</span>
                                </el-dropdown-item>
                            </el-dropdown-menu>
                        </el-dropdown>
                        <el-button
                            size="small"
                            icon="el-icon-printer"
                            @click="openQC()"
                        >Generate Checklist</el-button>
                    </div>

                    <span class="filter-spacer" />
                    <span class="filter-summary">
                        <strong>{{ filteredTickets.length }}</strong>
                        {{ filteredTickets.length === 1 ? 'ticket' : 'tickets' }}
                        <span v-if="currentGroupLabel" class="filter-summary-scope">
                            · {{ currentGroupLabel }}
                        </span>
                        <span v-if="shopGroup" class="filter-summary-scope">
                            · {{ shopGroup.name }}
                        </span>
                        <span v-if="remoteSearching" class="filter-summary-refresh">
                            · <i class="el-icon-loading" /> searching RepairDesk…
                        </span>
                        <span v-else-if="olderShown" class="filter-summary-refresh">
                            · {{ olderShown }} older from RepairDesk
                        </span>
                        <span v-if="lastRefreshLabel" class="filter-summary-refresh">
                            · updated {{ lastRefreshLabel }}
                        </span>
                    </span>
                </div>

                <el-table
                    v-loading="loading"
                    :data="ticketsDisplay"
                    stripe
                    size="small"
                    class="repair-table"
                    row-key="id"
                >
                    <el-table-column label="Ticket #" min-width="110">
                        <template slot-scope="scope">
                            <a
                                :href="`https://imobilestore.repairdesk.co/index.php?r=ticket/view&id=${scope.row.id}`"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="row-link"
                            >{{ scope.row.ticketNumber }}</a>
                            <el-tag v-if="scope.row.older" size="mini" type="info" effect="plain" class="older-tag"
                                title="Older than the 60-day list — found by searching RepairDesk">older</el-tag>
                        </template>
                    </el-table-column>
                    <el-table-column label="Device" min-width="220">
                        <template slot-scope="scope">
                            <div class="device-cell">
                                <span class="device-name">{{ scope.row.devices[0].device.name }}</span>
                                <span class="device-issue">{{ deviceIssue(scope.row) }}</span>
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column label="Customer" prop="customer" min-width="140" show-overflow-tooltip />
                    <el-table-column label="Assigned To" min-width="120">
                        <template slot-scope="scope">
                            <!-- click to assign it in RepairDesk (repair:ticket:status) -->
                            <assign-menu
                                v-if="canChangeStatus && employees.length"
                                :value="scope.row.devices[0].assigned_to.fullname || ''"
                                :value-id="String(scope.row.devices[0].assigned_to.id || '')"
                                :employees="employees"
                                :mixed="hasMixedAssignee(scope.row)"
                                :busy="assignBusy === String(scope.row.id)"
                                @pick="e => changeAssignee(scope.row, e)"
                            />
                            <span v-else :class="{ 'unassigned': !scope.row.devices[0].assigned_to.fullname }">
                                {{ scope.row.devices[0].assigned_to.fullname || 'Unassigned' }}
                            </span>
                        </template>
                    </el-table-column>
                    <el-table-column label="Created" min-width="170">
                        <template slot-scope="scope">
                            {{ formatCreatedDate(scope.row.createDate) }}
                        </template>
                    </el-table-column>
                    <el-table-column
                        :label="isRepairedView ? 'Repaired' : 'Due'"
                        min-width="170"
                    >
                        <template slot-scope="scope">
                            <span v-if="isRepairedView">
                                {{ scope.row.repaired_date ? formatRepairedDate(scope.row.repaired_date) : '—' }}
                            </span>
                            <span v-else>
                                {{ scope.row.devices[0].status.name !== 'Pending' ? scope.row.dueDate : '—' }}
                            </span>
                        </template>
                    </el-table-column>
                    <el-table-column label="Status" min-width="160" align="center">
                        <template slot-scope="scope">
                            <div class="status-cell">
                                <el-tag
                                    v-if="scope.row.overDue"
                                    type="danger"
                                    size="mini"
                                    effect="dark"
                                >Overdue</el-tag>
                                <!-- click to change it in RepairDesk (repair:ticket:status) -->
                                <status-menu
                                    v-if="canChangeStatus && statuses.length"
                                    :value="scope.row.devices[0].status.name"
                                    :statuses="statuses"
                                    :mixed="hasMixedStatus(scope.row)"
                                    :tag-type="statusTagType(scope.row.devices[0].status.name)"
                                    :busy="statusBusy === String(scope.row.id)"
                                    @pick="name => changeStatus(scope.row, name)"
                                />
                                <el-tag
                                    v-else
                                    :type="statusTagType(scope.row.devices[0].status.name)"
                                    size="mini"
                                    effect="plain"
                                >{{ scope.row.devices[0].status.name }}</el-tag>
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column label="Action" align="center" :width="canAddNote ? 150 : 100">
                        <template slot-scope="scope">
                            <el-button
                                size="mini"
                                type="text"
                                icon="el-icon-view"
                                @click.stop="openDetail(scope.row.id)"
                            >Detail</el-button>
                            <!-- a note on the RepairDesk ticket (repair:ticket:note) -->
                            <el-button
                                v-if="canAddNote"
                                size="mini"
                                type="text"
                                icon="el-icon-edit-outline"
                                @click.stop="openNote(scope.row)"
                            >Note</el-button>
                        </template>
                    </el-table-column>
                </el-table>

                <pagination
                    v-show="filteredTickets.length > 0"
                    :total="filteredTickets.length"
                    :page.sync="pageNum"
                    :limit.sync="pageSize"
                />
            </div>
        </div>

        <ticket-detail
            ref="detailDialog"
            :statuses="canChangeStatus ? statuses : []"
            :busy-id="statusBusy"
            :employees="canChangeStatus ? employees : []"
            :assign-busy-id="assignBusy"
            :can-add-note="canAddNote"
            @change-status="onDetailStatus"
            @change-assignee="onDetailAssignee"
            @checklist="openQC"
            @add-note="t => $refs.noteDialog.open(t)"
        />
        <note-dialog ref="noteDialog" @saved="onNoteSaved" />
        <q-c-generator ref="qcDialog" />
    </div>
</template>

<script>
import { listRepairTickets, searchRepairTickets, listRepairStatuses, setRepairTicketStatus, listRepairEmployees, setRepairTicketAssignee } from '@/api/repair/tickets'
import { listShopGroups } from '@/api/repair/shops'
import { checkPermi } from '@/utils/permission'
import TreePanel from '@/components/TreePanel'
import TicketDetail from './components/TicketDetail.vue'
import QCGenerator from './components/QCGenerator.vue'
import StatusMenu from './components/StatusMenu.vue'
import AssignMenu from './components/AssignMenu.vue'
import NoteDialog from './components/NoteDialog.vue'
// xlsx-js-style is the styled fork of SheetJS xlsx, already used by the
// Stock Monitoring export. Keeps headers/widths consistent across the
// dashboard's downloads.
import * as XLSX from 'xlsx-js-style'

// Status group metadata. `color` drives the leaf icon tint; `tagType`
// drives the el-badge color in the tree and the table's status tag.
//
// Lifecycle ordering — active work first, then repaired sub-states
// (green → blue → gray), then unrepairable sub-states (orange → red), then
// warranty, then the Other catch-all for any RepairDesk status we don't match.
// The order is also the tree's: a status under a parent (TREE_PARENTS) puts
// the parent where the first of its statuses would be, and is named there by
// `treeLabel`.
//
// `fullfilled` is the catch-all bucket from groupTickets() — anything
// whose RepairDesk status isn't matched by an explicit branch lands
// here. Surfaced as "Other" so the count's reachable from the UI and
// isn't a phantom in the Full-list Excel download.
const STATUS_GROUPS = [
    { key: 'pending',      label: 'Pending',       tagType: 'info',    color: '#909399' },
    { key: 'inProgress',   label: 'Received',      tagType: 'primary', color: '#409EFF' },
    // Under Testing: its own node since 2026-10-28 (was in Other)
    { key: 'underTesting', label: 'Under Testing', tagType: 'primary', color: '#17B5D7' },
    { key: 'overDue',      label: 'Over Due',      tagType: 'danger',  color: '#F56C6C' },
    { key: 'onHold',       label: 'On Hold',       tagType: 'warning', color: '#E6A23C' },
    { key: 'repaired',                label: 'Repaired',                     treeLabel: 'Repaired',     tagType: 'success', color: '#67C23A' },
    { key: 'repairedDispatching',     label: 'Repaired and Dispatching',     treeLabel: 'Dispatching',  tagType: 'primary', color: '#409EFF' },
    { key: 'repairedCollected',       label: 'Repaired and Collected',       treeLabel: 'Collected',    tagType: 'info',    color: '#909399' },
    { key: 'unrepairable',            label: 'Unrepairable',                 treeLabel: 'Unrepairable', tagType: 'danger',  color: '#F56C6C' },
    { key: 'unrepairableDispatching', label: 'Unrepairable and Dispatching', treeLabel: 'Dispatching',  tagType: 'warning', color: '#E6A23C' },
    { key: 'unrepairableReturned',    label: 'Unrepairable & Returned',      treeLabel: 'Returned',     tagType: 'danger',  color: '#F56C6C' },
    { key: 'warrantyRepair',          label: 'Warranty Repair',              treeLabel: 'In Repair',    tagType: 'primary', color: '#17B5D7' },
    { key: 'warrantyRepaired',        label: 'Warranty Repaired',            treeLabel: 'Repaired',     tagType: 'success', color: '#67C23A' },
    { key: 'warrantyDispatching',     label: 'Warranty And Dispatching',     treeLabel: 'Dispatching',  tagType: 'primary', color: '#3498DB' },
    { key: 'warrantyCollected',       label: 'Warranty And Collected',       treeLabel: 'Collected',    tagType: 'info',    color: '#909399' },
    { key: 'fullfilled',              label: 'Other',                        tagType: 'info',    color: '#909399' }
]

// Parent nodes in the tree (user 2026-10-28): clicking one lists all of its
// statuses together.
const TREE_PARENTS = [
    { key: 'repairedAll', label: 'Repaired', summaryLabel: 'All repaired', tagType: 'success', color: '#67C23A',
        children: ['repaired', 'repairedDispatching', 'repairedCollected'] },
    { key: 'unrepairableAll', label: 'Unrepairable', summaryLabel: 'All unrepairable', tagType: 'danger', color: '#F56C6C',
        children: ['unrepairable', 'unrepairableDispatching', 'unrepairableReturned'] },
    { key: 'warrantyAll', label: 'Warranty', summaryLabel: 'All warranty', tagType: 'primary', color: '#17B5D7',
        children: ['warrantyRepair', 'warrantyRepaired', 'warrantyDispatching', 'warrantyCollected'] }
]
const parentByKey = key => TREE_PARENTS.find(p => p.key === key) || null
const parentOfStatus = key => TREE_PARENTS.find(p => p.children.includes(key)) || null

// "All Tickets" lists the buckets most urgent first
const ALL_TICKETS_ORDER = [
    'overDue', 'onHold', 'inProgress', 'underTesting', 'pending',
    'repaired', 'repairedDispatching', 'repairedCollected',
    'unrepairable', 'unrepairableDispatching', 'unrepairableReturned',
    'warrantyRepair', 'warrantyRepaired', 'warrantyDispatching', 'warrantyCollected',
    'fullfilled'
]

// Group keys whose tickets carry a `repaired_date` rather than a `dueDate`.
// Drives the Date-column header swap and the date-range filter in the
// toolbar.
const REPAIRED_VIEW_KEYS = new Set([...parentByKey('repairedAll').children, 'repairedAll'])

// Auto-refresh interval — same 10-minute cadence as the original page.
const REFRESH_INTERVAL_MS = 10 * 60 * 1000

export default {
    name: 'ImobileRepair',
    components: { TreePanel, TicketDetail, StatusMenu, AssignMenu, NoteDialog, 'q-c-generator': QCGenerator },
    data() {
        return {
            loading: false,
            // Whole grouped payload from the backend.
            ticketGrouped: {
                ...Object.fromEntries(STATUS_GROUPS.map(g => [g.key, []])),
                notYetRecive: []
            },
            // '' = All; otherwise one of the STATUS_GROUPS keys.
            currentGroup: '',

            ticketSearch: '',
            assignedFilter: '__all',
            // '' = every customer; otherwise a customer's full name
            customerFilter: '',
            // the Shops page's groups, and the one picked ('' = none)
            shopGroups: [],
            shopGroupId: '',
            // the RepairDesk-wide ticket search (2026-10-27) in flight, and its order
            remoteSearching: false,
            remoteSeq: 0,
            repairedDateRange: null,
            // RepairDesk's statuses for the status menu, and the ticket id
            // whose change is being saved ('' = none)
            statuses: [],
            statusBusy: '',
            // RepairDesk's employees for the Assigned To menu, and the ticket
            // id whose assignment is being saved ('' = none)
            employees: [],
            assignBusy: '',

            pageNum: 1,
            pageSize: 20,

            lastRefreshAt: null,
            refreshTimer: null,
            // Skip a refresh when one is already in flight — the API walk
            // can take 15–20s on a cold cache and the 10-min timer + a
            // manual click can race otherwise. Plain instance flag (not
            // reactive — Vue 2 wouldn't observe a late-added property
            // anyway, and we don't need reactivity for a guard).
            _refreshInFlight: false
        }
    },
    computed: {
        // Status changes write to RepairDesk — Admin, iMobile Admin, iMobile
        // Repair Admin, Front Desk (repair:*:*) and iMobile Repair
        canChangeStatus() {
            return checkPermi(['repair:ticket:status'])
        },
        // adding a note writes to RepairDesk too — same roles
        canAddNote() {
            return checkPermi(['repair:ticket:note'])
        },
        // True iff the active group renders a Repaired-style column
        // (repaired_date + date-range filter) instead of the due-date
        // default. Shared across the template, filter pipeline, and the
        // toolbar so the three repaired sub-groups all behave the same.
        isRepairedView() {
            return REPAIRED_VIEW_KEYS.has(this.currentGroup)
        },
        // TreePanel data shape: a single root "All" node whose children
        // are the status leaves (one per STATUS_GROUPS entry), the repaired,
        // unrepairable and warranty ones under their parent (TREE_PARENTS).
        // Counts live on each node and feed the el-badge in the slot template.
        treeData() {
            const grouped = this.ticketGrouped
            // Each status counts what its table would show with the filter
            // bar as it stands — search, Assigned to, Customer, and (repaired
            // statuses) the date range (user 2026-10-27)
            const counts = Object.fromEntries(STATUS_GROUPS.map(g => [
                g.key, (grouped[g.key] || []).filter(this.ticketFilter(g.key)).length
            ]))
            // Sum every visible status, not a hand-listed set, so adding a
            // bucket to STATUS_GROUPS automatically rolls into the total.
            const total = STATUS_GROUPS.reduce((sum, g) => sum + counts[g.key], 0)
            const leaf = g => ({ id: g.key, label: g.treeLabel || g.label, count: counts[g.key] })
            const children = []
            for (const g of STATUS_GROUPS) {
                const parent = parentOfStatus(g.key)
                if (!parent) children.push(leaf(g))
                else if (g.key === parent.children[0]) {
                    const kids = parent.children.map(k => leaf(STATUS_GROUPS.find(x => x.key === k)))
                    children.push({
                        id: parent.key,
                        label: parent.label,
                        count: kids.reduce((sum, k) => sum + k.count, 0),
                        children: kids
                    })
                }
            }
            return [{ id: 'all', label: 'All Tickets', count: total, children }]
        },
        // The filter bar as one test, for a status group ('' = All): the
        // table and the tree counts both use it. The repaired date range
        // only narrows the repaired groups (the others have no repaired date).
        shopGroup() {
            return this.shopGroups.find(g => g.id === this.shopGroupId) || null
        },
        ticketFilter() {
            const q = String(this.ticketSearch || '').trim().toLowerCase()
            const assigned = this.assignedFilter && this.assignedFilter !== '__all' ? this.assignedFilter : ''
            const who = this.customerFilter
            const shops = this.shopGroup ? new Set(this.shopGroup.customers.map(c => String(c.id))) : null
            const range = Array.isArray(this.repairedDateRange) && this.repairedDateRange.length === 2 ? this.repairedDateRange : null
            const fromSec = range && range[0] ? Math.floor(range[0] / 1000) : null
            const toSec = range && range[1] ? Math.floor(range[1] / 1000) : null
            const assigneeOf = t => (t.devices[0] && t.devices[0].assigned_to && t.devices[0].assigned_to.fullname) || ''
            return groupKey => {
                const byDate = range && REPAIRED_VIEW_KEYS.has(groupKey)
                return t => {
                    if (q && !String(t.ticketNumber || '').toLowerCase().includes(q)) return false
                    if (assigned === '__unassigned' && assigneeOf(t)) return false
                    if (assigned && assigned !== '__unassigned' && !assigneeOf(t).includes(assigned)) return false
                    if (who && String(t.customer || '').trim() !== who) return false
                    if (shops && !shops.has(String(t.customerId || ''))) return false
                    if (byDate) {
                        const d = t.repaired_date
                        if (!d) return false
                        if (fromSec !== null && d < fromSec) return false
                        if (toSec !== null && d > toSec) return false
                    }
                    return true
                }
            }
        },
        currentGroupLabel() {
            if (!this.currentGroup) return 'All Tickets'
            const parent = parentByKey(this.currentGroup)
            if (parent) return parent.summaryLabel
            const g = STATUS_GROUPS.find(x => x.key === this.currentGroup)
            return g ? g.label : ''
        },
        // The list before pagination — applies the active group + the
        // filter-bar filters in sequence.
        filteredTickets() {
            let pool
            const parent = parentByKey(this.currentGroup)
            if (!this.currentGroup) {
                // "All Tickets" — every bucket that has a tree node, most
                // urgent first (ALL_TICKETS_ORDER): overdue, on hold, the
                // working states, then repaired, unrepairable, warranty and
                // the Other catch-all.
                pool = ALL_TICKETS_ORDER.flatMap(k => this.ticketGrouped[k] || [])
            } else if (parent) {
                // a parent node: its statuses, in tree order
                pool = parent.children.flatMap(k => this.ticketGrouped[k] || [])
            } else {
                pool = this.ticketGrouped[this.currentGroup] || []
            }
            return pool.filter(this.ticketFilter(this.currentGroup))
        },
        lastRefreshLabel() {
            if (!this.lastRefreshAt) return ''
            const diff = Date.now() - this.lastRefreshAt
            if (diff < 60_000) return 'just now'
            const mins = Math.floor(diff / 60_000)
            return mins === 1 ? '1 min ago' : `${mins} mins ago`
        },
        // Unique assignee names drawn from the loaded tickets. Beats the
        // hardcoded staff list which silently drops names when a new
        // person starts and keeps stale ones after they leave. Sorted
        // alphabetically; the "All" and "Not Yet Assign" options live in
        // the template, so this is just the real names. Walks every
        // bucket — including unrepairable and Other — so a name that
        // only ever shows up on closed/odd tickets still appears in the
        // dropdown.
        assigneeOptions() {
            const set = new Set()
            for (const t of this.allTickets) {
                const name =
                    t.devices[0] &&
                    t.devices[0].assigned_to &&
                    t.devices[0].assigned_to.fullname
                if (name) set.add(name)
            }
            return Array.from(set).sort((a, b) => a.localeCompare(b))
        },
        // Every customer on the loaded tickets with how many tickets they
        // have (all statuses), A–Z — the Customer filter's options; with a
        // shop group picked, only that group's shops (user 2026-10-28)
        customerOptions() {
            const counts = new Map()
            const shops = this.shopGroup ? new Set(this.shopGroup.customers.map(c => String(c.id))) : null
            for (const t of this.allTickets) {
                if (shops && !shops.has(String(t.customerId || ''))) continue
                const name = String(t.customer || '').trim()
                if (name) counts.set(name, (counts.get(name) || 0) + 1)
            }
            return Array.from(counts, ([name, count]) => ({ name, count }))
                .sort((a, b) => a.name.localeCompare(b.name))
        },
        // tickets on screen found by the RepairDesk search (older than the list)
        olderShown() {
            return this.filteredTickets.filter(t => t.older).length
        },
        // Current page of `filteredTickets`. Computed so any change to
        // pageNum, pageSize, or the underlying filtered set auto-renders
        // without an imperative updateDisplay() / sync method.
        ticketsDisplay() {
            const start = (this.pageNum - 1) * this.pageSize
            return this.filteredTickets.slice(start, start + this.pageSize)
        },
        // Flat list of every ticket we know about — used by the "Full
        // list" Excel export and by `assigneeOptions`. Includes
        // `notYetRecive` (currently always empty, defensive include).
        allTickets() {
            const g = this.ticketGrouped
            return [...ALL_TICKETS_ORDER, 'notYetRecive'].flatMap(k => g[k] || [])
        },
        // Live count for the dropdown badge. Cheaper than building a
        // throwaway array via allTickets just to read its length.
        allTicketsCount() {
            const g = this.ticketGrouped
            return [...ALL_TICKETS_ORDER, 'notYetRecive'].reduce((n, k) => n + ((g[k] || []).length), 0)
        }
    },
    watch: {
        // If the data shrinks under the user (e.g. a silent auto-refresh
        // pulled in fewer tickets than before), clamp pageNum so we don't
        // end up showing an empty current page. Stays where they are
        // whenever the page still exists — a refresh shouldn't yank the
        // user back to page 1 while they're reading.
        'filteredTickets.length'(newLength) {
            const maxPage = Math.max(1, Math.ceil(newLength / this.pageSize))
            if (this.pageNum > maxPage) this.pageNum = maxPage
        },
        // "View tickets" on the Shops page opens this page with ?shopGroup=
        '$route.query.shopGroup'() {
            this.applyShopGroupQuery()
        }
    },
    created() {
        this.getTickets()
        if (this.canChangeStatus) {
            this.loadStatuses()
            this.loadEmployees()
        }
        this.loadShopGroups()
        // Background refresh keeps the page in sync with RepairDesk without
        // the user having to mash the Refresh button.
        this.refreshTimer = setInterval(() => {
            this.getTickets({ silent: true })
        }, REFRESH_INTERVAL_MS)
    },
    // back to the tab (kept alive): the groups may have changed on Shops
    activated() {
        if (this.wasShown) this.loadShopGroups()
        this.wasShown = true
    },
    beforeDestroy() {
        clearTimeout(this.searchTimer)
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer)
            this.refreshTimer = null
        }
    },
    methods: {
        async getTickets({ silent = false } = {}) {
            // Concurrent-refresh guard. A cold-cache RepairDesk walk can
            // take 15–20s; the 10-min auto-refresh + a manual click can
            // overlap. Two simultaneous setData calls race and one of
            // them ends up overwriting the other after a delay. Skip when
            // a request is already in flight.
            if (this._refreshInFlight) return
            this._refreshInFlight = true
            if (!silent) this.loading = true
            try {
                const res = await listRepairTickets()
                const data = (res && res.data) || {}
                this.ticketGrouped = data.ticketGrouped || this.ticketGrouped
                this.lastRefreshAt = Date.now()
                // a refresh replaces the list — find an older searched ticket again
                if (String(this.ticketSearch || '').trim().length >= 3) this.remoteSearch(this.ticketSearch.trim())
            } catch (e) {
                console.error('Failed to load repair tickets:', e)
                const msg = (e.response && e.response.data && e.response.data.message)
                    || 'Failed to load tickets'
                if (!silent) this.$message.error(msg)
            } finally {
                this._refreshInFlight = false
                if (!silent) this.loading = false
            }
        },
        // ── Tree ──────────────────────────────────────────────────
        handleStatusClick(data) {
            if (!data) return
            this.currentGroup = data.id === 'all' ? '' : data.id
            // A user-initiated scope change resets the repaired date range
            // and page number; the search stays (2026-10-27: the tree counts
            // follow it, so the number clicked is what the table shows).
            // Page resets only ever happen here and in the filter handlers
            // below — never on data refresh, so the 10-min auto-refresh
            // doesn't yank the user back to page 1.
            this.repairedDateRange = null
            this.pageNum = 1
        },
        // ── Filters ───────────────────────────────────────────────
        onSearch() {
            this.pageNum = 1
            // and, after a pause, RepairDesk's own search over every ticket
            clearTimeout(this.searchTimer)
            const q = String(this.ticketSearch || '').trim()
            if (q.length >= 3) this.searchTimer = setTimeout(() => this.remoteSearch(q), 600)
        },
        // A ticket-number search over every RepairDesk ticket (user
        // 2026-10-27: "in case it is older than 60 days but is in
        // RepairDesk"): what it finds that the list doesn't hold joins its
        // status group, tagged older — so the table, the tree counts and the
        // detail dialog take it like any other ticket (until the next refresh).
        async remoteSearch(q) {
            const seq = ++this.remoteSeq
            this.remoteSearching = true
            try {
                const res = await searchRepairTickets(q)
                if (seq !== this.remoteSeq) return
                const found = (res && res.data && res.data.ticketGrouped) || {}
                const have = new Set(this.allTickets.map(t => String(t.id)))
                for (const [key, list] of Object.entries(found)) {
                    const bucket = this.ticketGrouped[key] || this.ticketGrouped.fullfilled
                    for (const t of list || []) {
                        if (have.has(String(t.id))) continue
                        have.add(String(t.id))
                        bucket.push({ ...t, older: true })
                    }
                }
            } catch (e) {
                if (seq === this.remoteSeq) console.warn('RepairDesk search failed:', e)
            } finally {
                if (seq === this.remoteSeq) this.remoteSearching = false
            }
        },
        onAssignedChange() { this.pageNum = 1 },
        onCustomerChange() { this.pageNum = 1 },
        // ── Shop groups (iMobile Repair → Shops) ──────────────────
        async loadShopGroups() {
            if (!checkPermi(['repair:shop:view'])) return
            try {
                const res = await listShopGroups()
                this.shopGroups = (res && res.data) || []
            } catch (e) {
                console.warn('Shop groups failed:', e)
            }
            this.applyShopGroupQuery()
        },
        applyShopGroupQuery() {
            const id = String((this.$route.query && this.$route.query.shopGroup) || '')
            if (id && id !== this.shopGroupId && this.shopGroups.some(g => g.id === id)) {
                this.shopGroupId = id
                this.customerFilter = ''
                this.pageNum = 1
            }
            // a group deleted meanwhile
            if (this.shopGroupId && !this.shopGroups.some(g => g.id === this.shopGroupId)) this.shopGroupId = ''
        },
        onShopGroupChange() {
            this.pageNum = 1
            // a customer picked before that isn't one of the group's shops
            if (this.customerFilter && !this.customerOptions.some(c => c.name === this.customerFilter)) this.customerFilter = ''
            // the address stops naming a group once another (or none) is picked
            if (this.$route.query.shopGroup && this.$route.query.shopGroup !== this.shopGroupId) {
                const query = { ...this.$route.query }
                delete query.shopGroup
                this.$router.replace({ path: this.$route.path, query }).catch(() => {})
            }
        },
        onDateRangeChange() { this.pageNum = 1 },
        // ── Status changes (pushed to RepairDesk) ─────────────────
        async loadStatuses() {
            try {
                const res = await listRepairStatuses()
                this.statuses = (res && res.data) || []
            } catch (e) {
                // without them the status stays a plain tag
                console.warn('RepairDesk statuses failed:', e)
            }
        },
        hasMixedStatus(ticket) {
            return new Set((ticket.devices || []).map(d => d.status && d.status.name)).size > 1
        },
        // Set a ticket's status in RepairDesk — every device line, or only
        // deviceIds (the detail dialog's per-line menu) — after a confirm,
        // then move it to the status group RepairDesk now puts it in.
        // Resolves true when something changed.
        async changeStatus(ticket, status, deviceIds, lineName) {
            const lines = (ticket.devices || []).length
            const which = lineName ? `the ${lineName} line of ticket`
                : lines > 1 ? `all ${lines} device lines of ticket` : 'ticket'
            try {
                await this.$confirm(
                    `Set ${which} ${ticket.ticketNumber} to "${status}" in RepairDesk? ` +
                    'RepairDesk may text or email the customer, depending on its status notification settings. ' +
                    'A note saying you made the change is added to the ticket.',
                    'Change status',
                    { confirmButtonText: 'Change', cancelButtonText: 'Cancel', type: 'warning' }
                )
            } catch (e) {
                return false
            }
            this.statusBusy = String(ticket.id)
            try {
                const res = await setRepairTicketStatus(ticket.id, status, deviceIds)
                const d = (res && res.data) || {}
                if (d.ticket && d.group) this.placeTicket(ticket, d.group, d.ticket)
                if (d.unchanged) {
                    this.$message.info(`Ticket ${ticket.ticketNumber} is already "${status}"`)
                    return false
                }
                const failed = d.failed || []
                if (failed.length) {
                    this.$message.warning(
                        `Changed ${(d.changed || []).length} of ${(d.changed || []).length + failed.length} device lines — ` +
                        `RepairDesk refused ${failed[0].name}: ${failed[0].message}`
                    )
                } else if (!d.noteAdded) {
                    this.$message.warning(`Ticket ${ticket.ticketNumber} → "${status}", but the note couldn't be added`)
                } else {
                    this.$message.success(`Ticket ${ticket.ticketNumber} → "${status}"`)
                }
                return true
            } catch (e) {
                // the request helper has already shown the server's message
                console.warn('Status change failed:', e)
                return false
            } finally {
                this.statusBusy = ''
            }
        },
        // The ticket re-read from RepairDesk replaces the old copy, in the
        // group it now falls in (on top, so it's easy to find there)
        placeTicket(old, group, fresh) {
            const g = this.ticketGrouped
            for (const key of Object.keys(g)) {
                const i = g[key].findIndex(t => String(t.id) === String(old.id))
                if (i >= 0) g[key].splice(i, 1)
            }
            const bucket = g[group] || g.fullfilled
            bucket.unshift({
                ...fresh,
                repaired_date: fresh.repaired_date || old.repaired_date || null,
                older: old.older
            })
        },
        // the Detail dialog's menus: a device line's, or the whole ticket's
        // (its Ticket Details card — no deviceId)
        async onDetailStatus({ id, ticketNumber, deviceId, deviceName, status }) {
            const ticket = this.allTickets.find(t => String(t.id) === String(id)) ||
                { id, ticketNumber, devices: [] }
            const changed = deviceId
                ? await this.changeStatus(ticket, status, [deviceId], deviceName)
                : await this.changeStatus(ticket, status)
            if (changed && this.$refs.detailDialog) this.$refs.detailDialog.reload()
        },
        // ── Assignee changes (pushed to RepairDesk) ───────────────
        async loadEmployees() {
            try {
                const res = await listRepairEmployees()
                this.employees = (res && res.data) || []
            } catch (e) {
                // without them Assigned To stays plain text
                console.warn('RepairDesk employees failed:', e)
            }
        },
        hasMixedAssignee(ticket) {
            return new Set((ticket.devices || []).map(d => String((d.assigned_to && d.assigned_to.id) || ''))).size > 1
        },
        // Assign a ticket in RepairDesk — every device line, or only
        // deviceIds (the detail dialog's per-line menu) — after a confirm.
        // RepairDesk has no assign call, so the backend goes through its
        // general ticket update and compares the ticket before / after:
        // anything else RepairDesk changed is shown here. Resolves true
        // when the assignee changed.
        async changeAssignee(ticket, employee, deviceIds, lineName) {
            if (!employee) return false
            const lines = (ticket.devices || []).length
            const which = lineName ? `the ${lineName} line of ticket`
                : lines > 1 ? `all ${lines} device lines of ticket` : 'ticket'
            try {
                await this.$confirm(
                    `Assign ${which} ${ticket.ticketNumber} to ${employee.name} in RepairDesk? ` +
                    'A note saying you made the change is added to the ticket.',
                    'Assign ticket',
                    { confirmButtonText: 'Assign', cancelButtonText: 'Cancel', type: 'warning' }
                )
            } catch (e) {
                return false
            }
            this.assignBusy = String(ticket.id)
            try {
                const res = await setRepairTicketAssignee(ticket.id, employee.id, deviceIds)
                const d = (res && res.data) || {}
                if (d.ticket && d.group) this.placeTicket(ticket, d.group, d.ticket)
                if (d.unchanged) {
                    this.$message.info(`Ticket ${ticket.ticketNumber} is already assigned to ${employee.name}`)
                    return false
                }
                const side = d.sideEffects || []
                if (side.length) {
                    // RepairDesk changed more than the assignee — say exactly what
                    const h = this.$createElement
                    this.$alert(
                        h('div', null, [
                            h('p', null, `Ticket ${ticket.ticketNumber} is now assigned to ${employee.name}, but RepairDesk also changed:`),
                            h('ul', { style: 'margin: 8px 0 0; padding-left: 18px' },
                                side.map(s => h('li', null, `${s.field}: "${s.from}" → "${s.to}"`))),
                            h('p', { style: 'margin-top: 8px' }, 'Check the ticket in RepairDesk.')
                        ]),
                        'Check this ticket',
                        { type: 'warning', confirmButtonText: 'OK' }
                    )
                } else if ((d.failed || []).length) {
                    this.$message.warning(
                        `Assigned ${(d.changed || []).length} of ${(d.changed || []).length + d.failed.length} device lines to ${employee.name} — ` +
                        `RepairDesk kept ${d.failed[0].name} as it was`
                    )
                } else if (!d.noteAdded) {
                    this.$message.warning(`Ticket ${ticket.ticketNumber} → ${employee.name}, but the note couldn't be added`)
                } else {
                    this.$message.success(`Ticket ${ticket.ticketNumber} → ${employee.name}`)
                }
                return true
            } catch (e) {
                // the request helper has already shown the server's message
                console.warn('Assign failed:', e)
                return false
            } finally {
                this.assignBusy = ''
            }
        },
        // a device line's menu in the Detail dialog
        async onDetailAssignee({ id, ticketNumber, deviceId, deviceName, employee }) {
            const ticket = this.allTickets.find(t => String(t.id) === String(id)) ||
                { id, ticketNumber, devices: [] }
            const changed = await this.changeAssignee(ticket, employee, [deviceId], deviceName)
            if (changed && this.$refs.detailDialog) this.$refs.detailDialog.reload()
        },
        // ── Notes (added to the RepairDesk ticket) ────────────────
        openNote(ticket) {
            this.$refs.noteDialog.open({ id: ticket.id, ticketNumber: ticket.ticketNumber, devices: ticket.devices })
        },
        // an open Detail dialog on that ticket shows the new note
        onNoteSaved({ id }) {
            if (this.$refs.detailDialog) this.$refs.detailDialog.reload(id)
        },
        // ── Row actions ───────────────────────────────────────────
        openDetail(id) {
            if (this.$refs.detailDialog) {
                this.$refs.detailDialog.openDialog(id)
            }
        },
        openQC(seed) {
            if (this.$refs.qcDialog) {
                this.$refs.qcDialog.open(seed || null)
            }
        },
        // ── Excel export ──────────────────────────────────────────
        // Shape a single ticket into a row object whose keys become the
        // sheet's column headers. Centralised so "current" and "all"
        // exports produce identical columns regardless of which view
        // the user is on.
        ticketToRow(t) {
            const d0 = (t.devices && t.devices[0]) || {}
            return {
                'Ticket Number': t.ticketNumber || '',
                'Device': (d0.device && d0.device.name) || '',
                'Issue': (d0.repairProdItems && d0.repairProdItems[0] && d0.repairProdItems[0].name) || '',
                'Customer': t.customer || '',
                'Assigned To': (d0.assigned_to && d0.assigned_to.fullname) || '',
                'Created Date': this.formatCreatedDate(t.createDate),
                // Both date columns are always present — leave the one
                // that doesn't apply blank so spreadsheets can sort the
                // other cleanly.
                'Due Date': t.dueDate || '',
                'Repaired Date': t.repaired_date ? this.formatRepairedDate(t.repaired_date) : '',
                'Status': (d0.status && d0.status.name) || '',
                'Overdue': t.overDue ? 'Yes' : ''
            }
        },
        downloadExcel(scope) {
            // scope: 'current' (filtered view) or 'all' (everything we have).
            const source = scope === 'all' ? this.allTickets : this.filteredTickets
            if (!source || source.length === 0) {
                this.$message.warning('Nothing to export — the list is empty.')
                return
            }
            const rows = source.map(t => this.ticketToRow(t))

            const worksheet = XLSX.utils.json_to_sheet(rows)

            // Header styling — same primary-blue band the Stock Monitoring
            // export uses, so the two downloads look like siblings.
            const headerStyle = {
                font:   { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 },
                fill:   { fgColor: { rgb: '409EFF' } },
                alignment: { horizontal: 'center', vertical: 'center' },
                border: {
                    top:    { style: 'thin', color: { rgb: 'DCDCDC' } },
                    bottom: { style: 'thin', color: { rgb: 'DCDCDC' } },
                    left:   { style: 'thin', color: { rgb: 'DCDCDC' } },
                    right:  { style: 'thin', color: { rgb: 'DCDCDC' } }
                }
            }
            const range = XLSX.utils.decode_range(worksheet['!ref'])
            for (let col = range.s.c; col <= range.e.c; col++) {
                const addr = XLSX.utils.encode_cell({ r: 0, c: col })
                if (worksheet[addr]) worksheet[addr].s = headerStyle
            }
            // Column widths matched to the data shape — long-text columns
            // (Device, Issue) get more room than short ones (Overdue).
            worksheet['!cols'] = [
                { wch: 16 }, // Ticket Number
                { wch: 32 }, // Device
                { wch: 36 }, // Issue
                { wch: 22 }, // Customer
                { wch: 16 }, // Assigned To
                { wch: 22 }, // Created Date
                { wch: 26 }, // Due Date
                { wch: 22 }, // Repaired Date
                { wch: 18 }, // Status
                { wch: 10 }  // Overdue
            ]

            // Sheet name reflects the scope so a saved file's tab gives
            // immediate context. Excel sheet names cap at 31 chars.
            const sheetName = scope === 'all'
                ? 'All Tickets'
                : (this.currentGroupLabel || 'Tickets').slice(0, 31)

            const workbook = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

            const today = new Date().toISOString().split('T')[0]
            const scopeSlug = scope === 'all'
                ? 'all'
                : (this.currentGroup || 'all').replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'all'
            const filename = `repair-tickets_${scopeSlug}_${today}.xlsx`
            XLSX.writeFile(workbook, filename)

            this.$message.success(
                `Exported ${rows.length} ticket${rows.length === 1 ? '' : 's'}`
            )
        },
        // ── Tree helpers (parity with SQT Cases) ──────────────────
        statusColor(id) {
            if (id === 'all') return '#409EFF'
            const parent = parentByKey(id)
            if (parent) return parent.color
            const g = STATUS_GROUPS.find(x => x.key === id)
            return g ? g.color : '#909399'
        },
        badgeType(id) {
            const parent = parentByKey(id)
            if (parent) return parent.tagType
            const g = STATUS_GROUPS.find(x => x.key === id)
            return g ? g.tagType : 'info'
        },
        // ── Cell formatters ───────────────────────────────────────
        deviceIssue(ticket) {
            const items = ticket.devices[0] && ticket.devices[0].repairProdItems
            return items && items[0] ? items[0].name : ''
        },
        formatCreatedDate(ms) {
            if (!ms) return ''
            return new Date(ms).toLocaleString('en-AU', {
                timeZone: 'Australia/Melbourne'
            })
        },
        // Repaired date arrives as unix seconds. Format with the same
        // en-AU / Melbourne settings as Created so the two date columns
        // read the same when both are present in the table.
        formatRepairedDate(sec) {
            if (!sec) return ''
            return new Date(sec * 1000).toLocaleString('en-AU', {
                timeZone: 'Australia/Melbourne'
            })
        },
        statusTagType(name) {
            if (!name) return 'info'
            if (name.includes('Repaired')) return 'success'
            if (name === 'Pending') return 'info'
            if (name === 'Received') return 'primary'
            if (name === 'Waiting for Parts' || name === 'Awaiting reply') return 'warning'
            return ''
        }
    }
}
</script>

<style lang="scss" scoped>
/* Filter bar — flex wrap with summary on the right. Mirrors SQT Cases. */
.filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
}
.filter-search { width: 220px; max-width: 100%; }
.filter-date { width: 320px; max-width: 100%; }
.filter-assigned { width: 160px; max-width: 100%; }
.filter-customer { width: 200px; max-width: 100%; }
.filter-group { width: 180px; max-width: 100%; }
.older-tag { margin-left: 6px; }
.customer-count { float: right; margin-left: 12px; color: #909399; font-size: 12px; }
.filter-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
}
/* Quiet trailing "(N)" counts inside the download dropdown — same
   purpose as the muted "scope" hint in the filter-summary above. */
::v-deep .el-dropdown-menu .dropdown-count {
    color: #909399;
    margin-left: 4px;
    font-size: 12px;
}
.filter-spacer { flex: 1; }
.filter-summary {
    color: #606266;
    font-size: 13px;
}
.filter-summary strong {
    color: #303133;
    font-weight: 600;
}
.filter-summary-scope,
.filter-summary-refresh {
    color: #909399;
}

/* ── Tree node template (matches SQT Cases) ─────────────────────────── */
.status-node {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    padding-right: 6px;
}
.status-node-icon {
    font-size: 14px;
    flex-shrink: 0;
}
.status-node-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
}
.status-node-badge {
    flex-shrink: 0;
    margin-left: 4px;
}

/* ── Table styling ──────────────────────────────────────────────────── */
.repair-table {
    border: 1px solid #ebeef5;
    border-radius: 8px;
    overflow: hidden;
}
.row-link {
    color: #2563eb;
    text-decoration: none;
}
.row-link:hover {
    text-decoration: underline;
}
.device-cell {
    display: flex;
    flex-direction: column;
    line-height: 1.35;
}
.device-name {
    color: #303133;
    font-weight: 500;
}
.device-issue {
    color: #909399;
    font-size: 12px;
}
.unassigned {
    color: #c0c4cc;
    font-style: italic;
}
.status-cell {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}
</style>
