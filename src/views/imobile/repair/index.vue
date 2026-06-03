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
                        :class="data.id === 'all' ? 'el-icon-files' : 'el-icon-collection-tag'"
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
                    <!-- Repaired views swap the ticket-number search for
                         a date-range picker; same behavior for all three
                         repaired sub-groups. -->
                    <template v-if="isRepairedView">
                        <el-date-picker
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
                    </template>
                    <template v-else>
                        <el-input
                            v-model="ticketSearch"
                            placeholder="Ticket Number"
                            clearable
                            size="small"
                            prefix-icon="el-icon-search"
                            class="filter-search"
                            @keyup.enter.native="onSearch"
                            @clear="onSearch"
                        />
                    </template>

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
                            <span :class="{ 'unassigned': !scope.row.devices[0].assigned_to.fullname }">
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
                                <el-tag
                                    :type="statusTagType(scope.row.devices[0].status.name)"
                                    size="mini"
                                    effect="plain"
                                >{{ scope.row.devices[0].status.name }}</el-tag>
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column label="Action" align="center" width="100">
                        <template slot-scope="scope">
                            <el-button
                                size="mini"
                                type="text"
                                icon="el-icon-view"
                                @click.stop="openDetail(scope.row.id)"
                            >Detail</el-button>
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

        <ticket-detail ref="detailDialog" />
        <q-c-generator ref="qcDialog" />
    </div>
</template>

<script>
import { listRepairTickets } from '@/api/repair/tickets'
import TreePanel from '@/components/TreePanel'
import TicketDetail from './components/TicketDetail.vue'
import QCGenerator from './components/QCGenerator.vue'
// xlsx-js-style is the styled fork of SheetJS xlsx, already used by the
// Stock Monitoring export. Keeps headers/widths consistent across the
// dashboard's downloads.
import * as XLSX from 'xlsx-js-style'

// Status group metadata. `color` drives the leaf icon tint; `tagType`
// drives the el-badge color in the tree and the table's status tag.
//
// Lifecycle ordering — active work first, then repaired sub-states
// (green → blue → gray), then unrepairable sub-states (orange → red),
// then the Other catch-all for any RepairDesk status we don't match.
//
// `fullfilled` is the catch-all bucket from groupTickets() — anything
// whose RepairDesk status isn't matched by an explicit branch lands
// here. Surfaced as "Other" so the count's reachable from the UI and
// isn't a phantom in the Full-list Excel download.
const STATUS_GROUPS = [
    { key: 'pending',    label: 'Pending',  tagType: 'info',    color: '#909399' },
    { key: 'inProgress', label: 'Received', tagType: 'primary', color: '#409EFF' },
    { key: 'overDue',    label: 'Over Due', tagType: 'danger',  color: '#F56C6C' },
    { key: 'onHold',     label: 'On Hold',  tagType: 'warning', color: '#E6A23C' },
    { key: 'repaired',                label: 'Repaired',                 tagType: 'success', color: '#67C23A' },
    { key: 'repairedDispatching',     label: 'Repaired and Dispatching', tagType: 'primary', color: '#409EFF' },
    { key: 'repairedCollected',       label: 'Repaired and Collected',   tagType: 'info',    color: '#909399' },
    { key: 'unrepairableDispatching', label: 'Unrepairable and Dispatching', tagType: 'warning', color: '#E6A23C' },
    { key: 'unrepairableReturned',    label: 'Unrepairable & Returned',  tagType: 'danger',  color: '#F56C6C' },
    { key: 'fullfilled',              label: 'Other',                    tagType: 'info',    color: '#909399' }
]

// Group keys whose tickets carry a `repaired_date` rather than a `dueDate`.
// Drives the Date-column header swap and the date-range filter in the
// toolbar.
const REPAIRED_VIEW_KEYS = new Set(['repaired', 'repairedDispatching', 'repairedCollected'])

// Auto-refresh interval — same 10-minute cadence as the original page.
const REFRESH_INTERVAL_MS = 10 * 60 * 1000

export default {
    name: 'ImobileRepair',
    components: { TreePanel, TicketDetail, 'q-c-generator': QCGenerator },
    data() {
        return {
            loading: false,
            // Whole grouped payload from the backend.
            ticketGrouped: {
                pending: [], inProgress: [], onHold: [], overDue: [],
                repaired: [], repairedDispatching: [], repairedCollected: [],
                unrepairableDispatching: [], unrepairableReturned: [],
                fullfilled: [], notYetRecive: []
            },
            // '' = All; otherwise one of the STATUS_GROUPS keys.
            currentGroup: '',

            ticketSearch: '',
            assignedFilter: '__all',
            repairedDateRange: null,

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
        // True iff the active group renders a Repaired-style column
        // (repaired_date + date-range filter) instead of the due-date
        // default. Shared across the template, filter pipeline, and the
        // toolbar so the three repaired sub-groups all behave the same.
        isRepairedView() {
            return REPAIRED_VIEW_KEYS.has(this.currentGroup)
        },
        // TreePanel data shape: a single root "All" node whose children
        // are the status leaves (one per STATUS_GROUPS entry). Counts
        // live on each node and feed the el-badge in the slot template.
        treeData() {
            const grouped = this.ticketGrouped
            // Sum every visible status, not a hand-listed set, so adding a
            // bucket to STATUS_GROUPS automatically rolls into the total.
            const total = STATUS_GROUPS.reduce(
                (sum, g) => sum + ((grouped[g.key] || []).length), 0
            )
            return [
                {
                    id: 'all',
                    label: 'All Tickets',
                    count: total,
                    children: STATUS_GROUPS.map(g => ({
                        id: g.key,
                        label: g.label,
                        count: (grouped[g.key] || []).length
                    }))
                }
            ]
        },
        currentGroupLabel() {
            if (!this.currentGroup) return 'All Tickets'
            const g = STATUS_GROUPS.find(x => x.key === this.currentGroup)
            return g ? g.label : ''
        },
        // The list before pagination — applies the active group + the
        // filter-bar filters in sequence.
        filteredTickets() {
            let pool
            if (!this.currentGroup) {
                // "All Tickets" — concatenate every bucket that has a
                // tree node, in priority order: overdue first, then
                // on-hold, then the working states, then the repaired
                // sub-states, then the unrepairable sub-states, then
                // the Other catch-all. Lets the table read most-urgent
                // first when nothing's filtered.
                pool = [
                    ...this.ticketGrouped.overDue,
                    ...this.ticketGrouped.onHold,
                    ...this.ticketGrouped.inProgress,
                    ...this.ticketGrouped.pending,
                    ...this.ticketGrouped.repaired,
                    ...this.ticketGrouped.repairedDispatching,
                    ...this.ticketGrouped.repairedCollected,
                    ...this.ticketGrouped.unrepairableDispatching,
                    ...this.ticketGrouped.unrepairableReturned,
                    ...this.ticketGrouped.fullfilled
                ]
            } else {
                pool = this.ticketGrouped[this.currentGroup] || []
            }

            // Ticket-number search is suppressed in the repaired views in
            // favour of the date range — same as the original page.
            if (!this.isRepairedView && this.ticketSearch) {
                const q = this.ticketSearch.trim().toLowerCase()
                if (q) {
                    pool = pool.filter(t =>
                        String(t.ticketNumber || '').toLowerCase().includes(q)
                    )
                }
            }

            if (this.assignedFilter && this.assignedFilter !== '__all') {
                if (this.assignedFilter === '__unassigned') {
                    pool = pool.filter(t =>
                        !(t.devices[0] && t.devices[0].assigned_to && t.devices[0].assigned_to.fullname)
                    )
                } else {
                    const target = this.assignedFilter
                    pool = pool.filter(t =>
                        t.devices[0] &&
                        t.devices[0].assigned_to &&
                        t.devices[0].assigned_to.fullname &&
                        t.devices[0].assigned_to.fullname.includes(target)
                    )
                }
            }

            // Date range applies to every repaired sub-group since they
            // all carry a `repaired_date` from the invoice join.
            if (
                this.isRepairedView &&
                Array.isArray(this.repairedDateRange) &&
                this.repairedDateRange.length === 2
            ) {
                const [fromMs, toMs] = this.repairedDateRange
                const fromSec = fromMs ? Math.floor(fromMs / 1000) : null
                const toSec = toMs ? Math.floor(toMs / 1000) : null
                pool = pool.filter(t => {
                    const d = t.repaired_date
                    if (!d) return false
                    if (fromSec !== null && d < fromSec) return false
                    if (toSec !== null && d > toSec) return false
                    return true
                })
            }

            return pool
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
            return [
                ...g.overDue,
                ...g.onHold,
                ...g.inProgress,
                ...g.pending,
                ...g.repaired,
                ...g.repairedDispatching,
                ...g.repairedCollected,
                ...g.unrepairableDispatching,
                ...g.unrepairableReturned,
                ...g.fullfilled,
                ...g.notYetRecive
            ]
        },
        // Live count for the dropdown badge. Cheaper than building a
        // throwaway array via allTickets just to read its length.
        allTicketsCount() {
            const g = this.ticketGrouped
            return g.overDue.length + g.onHold.length + g.inProgress.length +
                g.pending.length + g.repaired.length +
                g.repairedDispatching.length + g.repairedCollected.length +
                g.unrepairableDispatching.length + g.unrepairableReturned.length +
                g.fullfilled.length + g.notYetRecive.length
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
        }
    },
    created() {
        this.getTickets()
        // Background refresh keeps the page in sync with RepairDesk without
        // the user having to mash the Refresh button.
        this.refreshTimer = setInterval(() => {
            this.getTickets({ silent: true })
        }, REFRESH_INTERVAL_MS)
    },
    beforeDestroy() {
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
            // A user-initiated scope change resets cross-group filters
            // and page number. Page resets only ever happen here and in
            // the filter handlers below — never on data refresh, so the
            // 10-min auto-refresh doesn't yank the user back to page 1.
            this.ticketSearch = ''
            this.repairedDateRange = null
            this.pageNum = 1
        },
        // ── Filters ───────────────────────────────────────────────
        onSearch() { this.pageNum = 1 },
        onAssignedChange() { this.pageNum = 1 },
        onDateRangeChange() { this.pageNum = 1 },
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
            const g = STATUS_GROUPS.find(x => x.key === id)
            return g ? g.color : '#909399'
        },
        badgeType(id) {
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
