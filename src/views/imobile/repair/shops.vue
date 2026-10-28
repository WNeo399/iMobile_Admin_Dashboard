<template>
    <!--
        iMobile Repair → Shops (user 2026-10-28): a customer of ours can run
        several shops, each its own customer in RepairDesk. A group puts those
        shops under one name; "View tickets" opens Tickets filtered to them.
        Groups live in the dashboard only — RepairDesk is read, never changed.
    -->
    <div class="app-container repair-shops">
        <div class="toolbar">
            <el-input
                v-model="search"
                placeholder="Search groups or shops"
                size="small"
                clearable
                prefix-icon="el-icon-search"
                class="toolbar-search"
            />
            <el-button v-if="canManage" size="small" type="primary" icon="el-icon-plus" @click="openDialog()">New group</el-button>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">Refresh</el-button>
            <span class="toolbar-spacer" />
            <span class="toolbar-summary">
                <strong>{{ groups.length }}</strong> {{ groups.length === 1 ? 'group' : 'groups' }}
                · {{ shopCount }} {{ shopCount === 1 ? 'shop' : 'shops' }}
                <span v-if="ticketsLoading" class="muted"> · <i class="el-icon-loading" /> counting tickets…</span>
            </span>
        </div>

        <el-table v-loading="loading" :data="shownGroups" size="small" class="shops-table" row-key="id">
            <el-table-column label="Group" min-width="180">
                <template slot-scope="{ row }">
                    <div class="group-name">{{ row.name }}</div>
                    <div class="muted small">{{ row.customers.length }} {{ row.customers.length === 1 ? 'shop' : 'shops' }}</div>
                </template>
            </el-table-column>
            <el-table-column label="Shops (RepairDesk customers)" min-width="380">
                <template slot-scope="{ row }">
                    <div class="shop-tags">
                        <el-tag
                            v-for="c in row.customers"
                            :key="c.id"
                            size="small"
                            effect="plain"
                            :title="shopTitle(c)"
                        >{{ c.name || c.id }}<span v-if="c.organization && c.organization !== c.name" class="tag-org"> · {{ c.organization }}</span></el-tag>
                    </div>
                </template>
            </el-table-column>
            <el-table-column label="Tickets (60 days)" width="150" align="center">
                <template slot-scope="{ row }">
                    <template v-if="counts">
                        <strong>{{ (counts[row.id] || {}).total || 0 }}</strong>
                        <div class="muted small">{{ (counts[row.id] || {}).open || 0 }} open</div>
                    </template>
                    <span v-else class="muted">—</span>
                </template>
            </el-table-column>
            <el-table-column label="Action" width="220" align="center">
                <template slot-scope="{ row }">
                    <el-button size="mini" type="text" icon="el-icon-tickets" @click="viewTickets(row)">View tickets</el-button>
                    <el-button v-if="canManage" size="mini" type="text" icon="el-icon-edit" @click="openDialog(row)">Edit</el-button>
                    <el-button v-if="canManage" size="mini" type="text" icon="el-icon-delete" class="danger" @click="remove(row)">Delete</el-button>
                </template>
            </el-table-column>
            <template slot="empty">
                <div class="empty">
                    <div>No shop groups yet.</div>
                    <div class="muted small">Group a customer's shops to see all their tickets together.</div>
                </div>
            </template>
        </el-table>

        <!-- New / edit group -->
        <el-dialog
            :title="form.id ? 'Edit group' : 'New group'"
            :visible.sync="dialogVisible"
            width="640px"
            append-to-body
            :close-on-click-modal="false"
        >
            <el-form label-width="90px" size="small" @submit.native.prevent>
                <el-form-item label="Name">
                    <el-input v-model="form.name" maxlength="100" placeholder="The customer, e.g. Star Phone" />
                </el-form-item>
                <el-form-item label="Add shops">
                    <el-input
                        v-model="customerQuery"
                        placeholder="Search RepairDesk customers — name, phone, email or organization"
                        clearable
                        prefix-icon="el-icon-search"
                        @input="onCustomerQuery"
                    />
                    <div v-if="customerQuery.trim().length >= 2" v-loading="searching" class="results">
                        <div v-if="!searching && !results.length" class="muted small results-empty">No customers found.</div>
                        <div v-for="c in results" :key="c.id" class="result-row">
                            <div class="result-main">
                                <div>{{ c.name || c.id }} <span v-if="c.organization" class="muted">· {{ c.organization }}</span></div>
                                <div class="muted small">
                                    {{ [c.phone, c.email].filter(Boolean).join(' · ') || 'no contact' }} · {{ c.tickets }} {{ c.tickets === 1 ? 'ticket' : 'tickets' }}
                                    <span v-if="otherGroup(c)" class="warn"> · in "{{ c.group.name }}"</span>
                                </div>
                            </div>
                            <el-button
                                size="mini"
                                :disabled="picked(c) || !!otherGroup(c)"
                                @click="addShop(c)"
                            >{{ picked(c) ? 'Added' : 'Add' }}</el-button>
                        </div>
                    </div>
                </el-form-item>
                <el-form-item :label="`Shops (${form.customers.length})`">
                    <div v-if="!form.customers.length" class="muted small">None yet — search above and add the customer's shops.</div>
                    <div class="shop-tags">
                        <el-tag
                            v-for="c in form.customers"
                            :key="c.id"
                            size="small"
                            closable
                            :title="shopTitle(c)"
                            @close="removeShop(c)"
                        >{{ c.name || c.id }}<span v-if="c.organization && c.organization !== c.name" class="tag-org"> · {{ c.organization }}</span></el-tag>
                    </div>
                </el-form-item>
            </el-form>
            <div slot="footer">
                <el-button size="small" @click="dialogVisible = false">Cancel</el-button>
                <el-button size="small" type="primary" :loading="saving" :disabled="!form.name.trim() || !form.customers.length" @click="save">Save</el-button>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import { listShopGroups, searchRepairCustomers, createShopGroup, updateShopGroup, deleteShopGroup } from '@/api/repair/shops'
import { listRepairTickets } from '@/api/repair/tickets'
import { checkPermi } from '@/utils/permission'

// status buckets that count as still open (the rest are repaired / returned / other)
const OPEN_BUCKETS = ['notYetRecive', 'overDue', 'pending', 'inProgress', 'underTesting', 'onHold', 'warrantyRepair']

export default {
    name: 'ImobileRepairShops',
    data() {
        return {
            loading: false,
            groups: [],
            search: '',
            // { groupId: { total, open } } from the Tickets list (60-day window)
            counts: null,
            ticketsLoading: false,

            dialogVisible: false,
            saving: false,
            form: { id: '', name: '', customers: [] },
            customerQuery: '',
            searching: false,
            results: [],
            searchSeq: 0
        }
    },
    computed: {
        canManage() {
            return checkPermi(['repair:shop:manage'])
        },
        shopCount() {
            return this.groups.reduce((n, g) => n + g.customers.length, 0)
        },
        shownGroups() {
            const q = this.search.trim().toLowerCase()
            if (!q) return this.groups
            return this.groups.filter(g => g.name.toLowerCase().includes(q) ||
                g.customers.some(c => `${c.name} ${c.organization}`.toLowerCase().includes(q)))
        }
    },
    created() {
        this.load()
    },
    // back to the tab (kept alive): the groups and counts again
    activated() {
        if (this.wasShown) this.load()
        this.wasShown = true
    },
    beforeDestroy() {
        clearTimeout(this.searchTimer)
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const res = await listShopGroups()
                this.groups = (res && res.data) || []
            } catch (e) {
                console.warn('Shop groups failed:', e)
            } finally {
                this.loading = false
            }
            this.countTickets()
        },
        // each group's tickets in the Tickets list, by RepairDesk customer id
        async countTickets() {
            if (this.ticketsLoading || !checkPermi(['repair:ticket:list'])) return
            this.ticketsLoading = true
            try {
                const res = await listRepairTickets()
                const grouped = (res && res.data && res.data.ticketGrouped) || {}
                const groupOf = new Map()
                for (const g of this.groups) for (const c of g.customers) groupOf.set(String(c.id), g.id)
                const counts = {}
                for (const [bucket, list] of Object.entries(grouped)) {
                    for (const t of list || []) {
                        const gid = groupOf.get(String(t.customerId || ''))
                        if (!gid) continue
                        const c = counts[gid] || (counts[gid] = { total: 0, open: 0 })
                        c.total++
                        if (OPEN_BUCKETS.includes(bucket)) c.open++
                    }
                }
                this.counts = counts
            } catch (e) {
                console.warn('Ticket counts failed:', e)
            } finally {
                this.ticketsLoading = false
            }
        },
        viewTickets(row) {
            this.$router.push({ path: '/imobileRepair/tickets', query: { shopGroup: row.id } })
        },
        shopTitle(c) {
            return [c.name, c.organization, `RepairDesk customer ${c.id}`].filter(Boolean).join(' · ')
        },
        // ── dialog ────────────────────────────────────────────────
        openDialog(row) {
            this.form = row
                ? { id: row.id, name: row.name, customers: row.customers.map(c => ({ ...c })) }
                : { id: '', name: '', customers: [] }
            this.customerQuery = ''
            this.results = []
            this.dialogVisible = true
        },
        onCustomerQuery() {
            clearTimeout(this.searchTimer)
            const q = this.customerQuery.trim()
            if (q.length < 2) { this.results = []; return }
            this.searchTimer = setTimeout(() => this.searchCustomers(q), 400)
        },
        async searchCustomers(q) {
            const seq = ++this.searchSeq
            this.searching = true
            try {
                const res = await searchRepairCustomers(q)
                if (seq === this.searchSeq) this.results = (res && res.data) || []
            } catch (e) {
                if (seq === this.searchSeq) this.results = []
            } finally {
                if (seq === this.searchSeq) this.searching = false
            }
        },
        picked(c) {
            return this.form.customers.some(x => x.id === c.id)
        },
        // the group a shop is in, when that isn't the one being edited
        otherGroup(c) {
            return c.group && c.group.id !== this.form.id ? c.group : null
        },
        addShop(c) {
            if (this.picked(c) || this.otherGroup(c)) return
            this.form.customers.push({ id: c.id, name: c.name, organization: c.organization })
            if (!this.form.name.trim() && c.organization) this.form.name = c.organization
        },
        removeShop(c) {
            this.form.customers = this.form.customers.filter(x => x.id !== c.id)
        },
        async save() {
            if (this.saving) return
            this.saving = true
            const data = { name: this.form.name, customers: this.form.customers }
            try {
                if (this.form.id) await updateShopGroup(this.form.id, data)
                else await createShopGroup(data)
                this.$message.success(this.form.id ? 'Group saved' : 'Group created')
                this.dialogVisible = false
                this.load()
            } catch (e) {
                // the request helper has already shown the server's message
                console.warn('Save group failed:', e)
            } finally {
                this.saving = false
            }
        },
        async remove(row) {
            try {
                await this.$confirm(
                    `Delete the group "${row.name}"? Its ${row.customers.length} shop(s) stay in RepairDesk — only the grouping is removed.`,
                    'Delete group',
                    { confirmButtonText: 'Delete', cancelButtonText: 'Cancel', type: 'warning' }
                )
            } catch (e) {
                return
            }
            try {
                await deleteShopGroup(row.id)
                this.$message.success('Group deleted')
                this.load()
            } catch (e) {
                console.warn('Delete group failed:', e)
            }
        }
    }
}
</script>

<style scoped>
.toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
}
.toolbar-search { width: 260px; max-width: 100%; }
.toolbar-spacer { flex: 1; }
.toolbar-summary { color: #606266; font-size: 13px; }
.toolbar-summary strong { color: #303133; }
.shops-table {
    border: 1px solid #ebeef5;
    border-radius: 8px;
    overflow: hidden;
}
.group-name { font-weight: 600; color: #303133; }
.shop-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.tag-org { color: #909399; }
.muted { color: #909399; }
.small { font-size: 12px; }
.warn { color: #e6a23c; }
.danger { color: #f56c6c; }
.empty { padding: 24px 0; line-height: 1.8; }
.results {
    margin-top: 6px;
    max-height: 240px;
    overflow-y: auto;
    border: 1px solid #ebeef5;
    border-radius: 6px;
    min-height: 40px;
}
.results-empty { padding: 10px 12px; }
.result-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    border-bottom: 1px solid #f2f3f5;
    line-height: 1.5;
}
.result-row:last-child { border-bottom: none; }
.result-main { flex: 1; min-width: 0; }
</style>
