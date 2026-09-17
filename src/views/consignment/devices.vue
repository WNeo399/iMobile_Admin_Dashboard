<template>
    <div class="cd-page" v-loading="loading">
        <div class="cd-header">
            <div>
                <div class="cd-title">{{ $tp('Consignment Devices') }}</div>
                <div class="cd-sub">{{ $tp('Devices placed with partner shops — track them from dispatch to sold or returned.') }}</div>
            </div>
            <div class="cd-actions">
                <el-button v-hasPermi="['consign:device:assign']" type="success" size="small" icon="el-icon-plus" @click="openAssign">{{ $tp('Assign Batch') }}</el-button>
                <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">{{ $tp('Refresh') }}</el-button>
            </div>
        </div>

        <!-- Status filter chips with counts -->
        <div class="cd-status-row">
            <div v-for="s in STATUS_LIST" :key="s.value"
                class="cd-chip" :class="{ active: statusFilter === s.value }"
                :style="statusFilter === s.value ? { borderColor: s.color } : {}"
                @click="toggleStatus(s.value)">
                <span class="cd-chip-dot" :style="{ background: s.color }" />
                {{ $tp(s.label) }} <b>{{ counts[s.value] || 0 }}</b>
            </div>
        </div>

        <div class="cd-toolbar">
            <el-select v-if="isAdmin" v-model="shopFilter" size="small" :placeholder="$tp('All shops')" clearable filterable
                style="width: 200px" @change="reload">
                <el-option v-for="s in shops" :key="s._id" :label="s.name" :value="s._id" />
            </el-select>
            <!-- The send a device went out on. Picking one narrows the list
                 to that batch; Print List prints it as a delivery list. -->
            <el-select v-model="batchFilter" size="small" :placeholder="$tp('Batch')" clearable filterable
                style="width: 230px" @change="reload">
                <el-option v-for="b in batches" :key="b.batchId" :label="batchLabel(b)" :value="b.batchId" />
            </el-select>
            <el-input v-model="search" size="small" clearable prefix-icon="el-icon-search"
                :placeholder="$tp('IMEI / serial / product…')" style="width: 240px" @keyup.enter.native="reload" @clear="reload" />
            <span class="cd-spacer" />
            <!-- Bulk workflow actions (selection-based) -->
            <el-button v-hasPermi="['consign:device:receive']" size="small" type="primary" plain
                :disabled="!eligible('in-transit').length" @click="doAction('receive', 'in-transit', $tp('Mark the selected devices as received?'))">
                {{ $tp('Mark Received') }} ({{ eligible('in-transit').length }})
            </el-button>
            <el-button v-hasPermi="['consign:device:sell']" size="small" type="success" plain
                :disabled="!eligible('received').length" @click="doAction('sell', 'received', $tp('Mark the selected devices as sold?'))">
                {{ $tp('Mark Sold') }} ({{ eligible('received').length }})
            </el-button>
            <el-button v-hasPermi="['consign:device:return']" size="small" type="warning" plain
                :disabled="!eligible('received').length" @click="doAction('return', 'received', $tp('Initiate a return for the selected devices?'))">
                {{ $tp('Return') }} ({{ eligible('received').length }})
            </el-button>
            <el-button v-hasPermi="['consign:device:markReturned']" size="small" plain
                :disabled="!eligible('returning').length" @click="doAction('markReturned', 'returning', $tp('Confirm the selected devices arrived back?'))">
                {{ $tp('Mark Returned') }} ({{ eligible('returning').length }})
            </el-button>
        </div>

        <el-table :data="rows" size="mini" class="cd-table" height="calc(100vh - 320px)" @selection-change="onSelection">
            <!-- 40px was too tight for the checkbox plus cell padding, so
                 the cell overflowed and printed its "…" ellipsis. -->
            <el-table-column type="selection" width="50" align="center" />
            <!-- The IMEI leads: it is the scan key, and register-sourced
                 records have no separate stock id (older EX_DB-era rows
                 fall back to theirs). -->
            <el-table-column :label="$tp('IMEI / Serial')" prop="imei" width="145" show-overflow-tooltip>
                <template slot-scope="s"><span class="cd-mono">{{ s.row.imei || s.row.stockId || '—' }}</span></template>
            </el-table-column>
            <el-table-column :label="$tp('Product')" min-width="240">
                <template slot-scope="s">
                    <div class="cd-prod">
                        {{ s.row.productName }}
                        <el-tag v-if="s.row.grade" size="mini" effect="plain" class="cd-grade">{{ s.row.grade }}</el-tag>
                    </div>
                    <div v-if="s.row.sku" class="cd-sub">SKU: {{ s.row.sku }}</div>
                </template>
            </el-table-column>
            <!-- The status carries its own date. The old Received and Sold
                 columns were mostly dashes — a row only ever fills the one
                 matching where it is — so the pill says where, and the line
                 under it says since when. -->
            <el-table-column :label="$tp('Status')" width="130" align="center">
                <template slot-scope="s">
                    <span class="cd-status" :style="statusStyle(s.row.status)">{{ statusLabel(s.row.status) }}</span>
                    <div class="cd-status-date">{{ statusDate(s.row) }}</div>
                </template>
            </el-table-column>
            <el-table-column v-if="isAdmin" :label="$tp('Our Cost')" width="100" align="right">
                <template slot-scope="s">{{ money(s.row.costPrice) }}</template>
            </el-table-column>
            <!-- The shop's cost — what the weekly invoice bills. Their own
                 retail price comes later, once shops set it. -->
            <el-table-column :label="$tp('Shop Price')" width="100" align="right">
                <template slot-scope="s"><b>{{ money(s.row.shopPrice) }}</b></template>
            </el-table-column>
            <el-table-column v-if="isAdmin" :label="$tp('Shop')" prop="shopName" width="140" show-overflow-tooltip />
            <!-- The assignment batch the device went out on — click for the
                 batch detail (and its printable delivery list). -->
            <el-table-column :label="$tp('Batch')" width="95" align="center">
                <template slot-scope="s">
                    <el-button v-if="s.row.batchId" type="text" class="cd-batch-link"
                        @click="openBatchDetail(s.row.batchId, s.row)">{{ s.row.batchNo || $tp('View') }}</el-button>
                    <span v-else class="cd-dash">—</span>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Received')" width="95" align="center">
                <template slot-scope="s">{{ dateStr(s.row.receivedAt) }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Sold')" width="95" align="center">
                <template slot-scope="s">{{ dateStr(s.row.soldAt) }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Invoiced')" width="80" align="center">
                <template slot-scope="s">
                    <i v-if="s.row.invoiceId" class="el-icon-check cd-invoiced" />
                    <span v-else class="cd-dash">—</span>
                </template>
            </el-table-column>
            <template slot="empty"><span class="cd-empty">{{ statusFilter || search ? $tp('No devices match the current filters.') : $tp('No devices yet.') }}</span></template>
        </el-table>

        <div class="cd-pager">
            <el-pagination background layout="total, sizes, prev, pager, next"
                :total="total" :page-size="pageSize" :page-sizes="[50, 100, 200]" :current-page="page"
                @current-change="p => { page = p; load() }"
                @size-change="s => { pageSize = s; page = 1; load() }" />
        </div>

        <!-- Batch detail — opened from a batch number; Print lives here. -->
        <el-dialog :visible.sync="batchDlgVisible" width="720px" top="8vh" append-to-body>
            <div slot="title" class="cd-dialog-title">
                <i class="el-icon-box" /> {{ (batchDlg.meta && batchDlg.meta.batchNo) || $tp('Batch') }}
                <span v-if="isAdmin && batchDlg.meta && batchDlg.meta.shopName" class="cd-batch-shop">{{ batchDlg.meta.shopName }}</span>
            </div>
            <div v-if="batchDlg.meta" class="cd-batch-meta">
                {{ $tp('Assigned') }} {{ dateStr(batchDlg.meta.assignedAt) }}<template
                    v-if="batchDlg.meta.assignedBy"> · {{ batchDlg.meta.assignedBy }}</template>
                · {{ $tp('{n} device(s)', { n: batchDlg.rows.length }) }}
            </div>
            <el-table :data="batchDlg.rows" v-loading="batchDlg.loading" size="mini" border max-height="380">
                <el-table-column type="index" width="42" align="center" />
                <el-table-column :label="$tp('Product')" min-width="220">
                    <template slot-scope="s">
                        {{ s.row.productName }}
                        <el-tag v-if="s.row.grade" size="mini" effect="plain" class="cd-grade">{{ s.row.grade }}</el-tag>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('IMEI / Serial')" width="150">
                    <template slot-scope="s"><span class="cd-mono">{{ s.row.imei || s.row.stockId || '—' }}</span></template>
                </el-table-column>
                <el-table-column :label="$tp('Shop Price')" width="95" align="right">
                    <template slot-scope="s"><b>{{ money(s.row.shopPrice) }}</b></template>
                </el-table-column>
                <el-table-column :label="$tp('Status')" width="110" align="center">
                    <template slot-scope="s"><span class="cd-status" :style="statusStyle(s.row.status)">{{ statusLabel(s.row.status) }}</span></template>
                </el-table-column>
            </el-table>
            <span slot="footer">
                <el-button size="small" icon="el-icon-printer" :disabled="!batchDlg.rows.length"
                    @click="printBatch">{{ $tp('Print List') }}</el-button>
                <el-button size="small" type="primary" @click="batchDlgVisible = false">{{ $tp('Close') }}</el-button>
            </span>
        </el-dialog>

        <!-- Assign batch dialog — resolve Stock IDs / IMEIs from the ExEngine DB -->
        <el-dialog :visible.sync="assignVisible" width="780px" append-to-body :close-on-click-modal="false">
            <div slot="title" class="cd-dialog-title"><i class="el-icon-box" /> {{ $tp('Assign Devices to a Shop') }}</div>
            <el-form label-position="top" size="small" @submit.native.prevent>
                <el-form-item :label="$tp('Shop')" required>
                    <el-select v-model="assignShopId" :placeholder="$tp('Select shop')" filterable style="width: 100%">
                        <el-option v-for="s in shops.filter(x => x.active !== false)" :key="s._id" :label="s.name" :value="s._id" />
                    </el-select>
                </el-form-item>
                <el-form-item :label="$tp('IMEI or serial — press Enter to add')">
                    <div class="cd-code-row">
                        <el-input ref="codeInput" v-model="assignCode" :placeholder="$tp('Scan or type an IMEI / serial from Stock')" clearable
                            :disabled="resolving" @keyup.enter.native="addCode" />
                        <el-button type="primary" plain icon="el-icon-search" :loading="resolving"
                            :disabled="!assignCode.trim()" @click="addCode">{{ $tp('Add') }}</el-button>
                    </div>
                </el-form-item>
            </el-form>

            <template v-if="resolved.length">
                <div class="cd-resolve-note">
                    <span class="ok">{{ $tp('{n} ready', { n: assignable.length }) }}</span>
                    <span v-if="resolvedOut.length" class="warn"> · {{ $tp('{n} already out on consignment (excluded)', { n: resolvedOut.length }) }}</span>
                    <span v-if="missingPriceCount" class="err"> · {{ $tp('{n} missing a Shop Price', { n: missingPriceCount }) }}</span>
                </div>
                <el-table :data="resolved" size="mini" border max-height="280" class="cd-resolve-table" :row-class-name="resolveRowClass">
                    <el-table-column :label="$tp('IMEI / Serial')" width="145">
                        <template slot-scope="s"><span class="cd-mono">{{ s.row.imei || s.row.stockId }}</span></template>
                    </el-table-column>
                    <el-table-column :label="$tp('Product')" min-width="220">
                        <template slot-scope="s">
                            <div class="cd-prod">{{ s.row.productName }}</div>
                            <div v-if="s.row.sku" class="cd-sub">SKU: {{ s.row.sku }}</div>
                        </template>
                    </el-table-column>
                    <el-table-column :label="$tp('Grade')" width="65" align="center"><template slot-scope="s">{{ s.row.grade || '—' }}</template></el-table-column>
                    <el-table-column :label="$tp('Our Cost')" width="85" align="right"><template slot-scope="s">{{ money(s.row.costPrice) }}</template></el-table-column>
                    <el-table-column :label="$tp('Shop Price')" width="120">
                        <template slot-scope="s">
                            <el-input v-model="s.row.shopPrice" size="mini" type="number" min="0"
                                :disabled="s.row.alreadyOut" placeholder="0.00"
                                :class="{ 'cd-price-missing': !s.row.alreadyOut && !validPrice(s.row.shopPrice) }">
                                <template slot="prefix">$</template>
                            </el-input>
                        </template>
                    </el-table-column>
                    <el-table-column label="" width="46" align="center">
                        <template slot-scope="s">
                            <i class="el-icon-close cd-remove" @click="removeResolved(s.$index)" />
                        </template>
                    </el-table-column>
                </el-table>
            </template>

            <span slot="footer">
                <el-button size="small" @click="assignVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button type="primary" size="small" icon="el-icon-position" :loading="assigning"
                    :disabled="!assignShopId || !assignable.length || missingPriceCount > 0"
                    @click="submitAssign">{{ $tp('Assign {n} device(s)', { n: assignable.length }) }}</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import auth from '@/plugins/auth'
import { getConsignDevices, getConsignShops, getConsignBatches, assignConsignDevices, updateConsignDeviceStatus, lookupConsignDevices } from '@/api/consignment'

const STATUS_LIST = [
    { value: 'in-transit', label: 'In Transit', color: '#E6A23C', bg: '#FDF6EC' },
    { value: 'received', label: 'Received', color: '#409EFF', bg: '#ECF5FF' },
    { value: 'sold', label: 'Sold', color: '#67C23A', bg: '#F0F9EB' },
    { value: 'returning', label: 'Returning', color: '#8B5CF6', bg: '#F3EFFF' },
    { value: 'returned', label: 'Returned', color: '#909399', bg: '#F4F4F5' }
]
const STATUS_META = STATUS_LIST.reduce((m, s) => ((m[s.value] = s), m), {})

export default {
    name: 'ConsignmentDevices',
    data() {
        return {
            STATUS_LIST,
            loading: false,
            rows: [],
            counts: {},
            total: 0,
            page: 1,
            pageSize: 50,
            statusFilter: '',
            shopFilter: '',
            batchFilter: '',
            batches: [],
            batchDlgVisible: false,
            batchDlg: { meta: null, rows: [], loading: false },
            search: '',
            shops: [],
            selection: [],
            assignVisible: false,
            assignShopId: '',
            assignCode: '',
            assigning: false,
            resolving: false,
            resolved: []
        }
    },
    computed: {
        isAdmin() {
            return auth.hasPermi('consign:shop:manage')
        },
        assignable() {
            return this.resolved.filter(d => !d.alreadyOut)
        },
        resolvedOut() {
            return this.resolved.filter(d => d.alreadyOut)
        },
        missingPriceCount() {
            return this.assignable.filter(d => !this.validPrice(d.shopPrice)).length
        }
    },
    created() {
        this.load()
        this.loadBatches()
        if (this.isAdmin) {
            getConsignShops().then(r => { if (r && r.success) this.shops = r.shops || [] }).catch(() => {})
        }
    },
    // Keep-alive revisits skip created() — refresh devices + shop options.
    activated() {
        this.load()
        this.loadBatches()
        if (this.isAdmin) {
            getConsignShops().then(r => { if (r && r.success) this.shops = r.shops || [] }).catch(() => {})
        }
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await getConsignDevices({
                    page: this.page,
                    pageSize: this.pageSize,
                    status: this.statusFilter || undefined,
                    shopId: this.shopFilter || undefined,
                    batchId: this.batchFilter || undefined,
                    search: this.search || undefined
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.rows || []
                this.total = r.total || 0
                this.counts = r.counts || {}
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load devices')))
            } finally {
                this.loading = false
            }
        },
        reload() { this.page = 1; this.load() },
        // ── Batches (one per Assign — one per send to a shop) ──
        async loadBatches() {
            try {
                const r = await getConsignBatches()
                if (r && r.success !== false) this.batches = r.batches || []
            } catch (e) { /* non-fatal — the dropdown just stays empty */ }
        },
        batchLabel(b) {
            const parts = [b.batchNo || this.dateStr(b.assignedAt)]
            if (this.isAdmin && b.shopName) parts.push(b.shopName)
            parts.push(this.$tp('{n} device(s)', { n: b.count }))
            return parts.join(' · ')
        },
        // Open a batch's detail from its number: the batch meta plus every
        // device on it (assigns cap at 500, one page covers it).
        async openBatchDetail(batchId, row) {
            const meta = this.batches.find(b => b.batchId === batchId)
                || (row ? {
                    batchId, batchNo: row.batchNo || '', shopName: row.shopName || '',
                    assignedAt: row.assignedAt, assignedBy: row.assignedBy || ''
                } : null)
            this.batchDlg = { meta, rows: [], loading: true }
            this.batchDlgVisible = true
            try {
                const r = await getConsignDevices({ batchId, page: 1, pageSize: 500 })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.batchDlg.rows = r.rows || []
            } catch (e) {
                this.batchDlgVisible = false
                this.$message.error(this.msg(e, this.$tp('Failed to load the batch')))
            } finally {
                this.batchDlg.loading = false
            }
        },
        // Print the open batch as a delivery list: render a plain print
        // document into a hidden iframe (no popup for blockers to eat)
        // and hand it to the browser's print dialog.
        printBatch() {
            const rows = this.batchDlg.rows
            if (!rows.length) return
            try {
                const b = this.batchDlg.meta || {}
                const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                const line = (d, i) => `<tr>
                    <td class="n">${i + 1}</td>
                    <td>${esc(d.productName)}${d.sku ? `<div class="sub">SKU: ${esc(d.sku)}</div>` : ''}</td>
                    <td class="mono">${esc(d.imei || d.stockId || '—')}</td>
                    <td class="c">${esc(d.grade || '—')}</td>
                    <td class="r">${d.shopPrice == null ? '—' : '$' + Number(d.shopPrice).toFixed(2)}</td>
                </tr>`
                const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
                    <title>${esc(b.batchNo || 'Consignment')} ${esc(b.shopName || '')} ${esc(this.dateStr(b.assignedAt))}</title>
                    <style>
                        body { font: 12px/1.5 Arial, sans-serif; color: #111; margin: 28px; }
                        h1 { font-size: 18px; margin: 0 0 2px; }
                        .meta { color: #555; margin-bottom: 14px; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #999; padding: 5px 8px; text-align: left; vertical-align: top; }
                        th { background: #f0f0f0; }
                        .n { width: 30px; text-align: right; color: #555; }
                        .c { text-align: center; width: 55px; }
                        .r { text-align: right; width: 80px; white-space: nowrap; }
                        .mono { font-family: Consolas, monospace; white-space: nowrap; }
                        .sub { color: #777; font-size: 11px; }
                        /* The browser prints its own date/title header and
                           URL footer INTO the page margins — zero those and
                           pad the body instead, so only the list lands on
                           paper. */
                        @page { margin: 0; }
                        @media print { body { margin: 14mm 12mm; } }
                    </style></head><body>
                    <h1>Consignment Delivery List${b.batchNo ? ' — ' + esc(b.batchNo) : ''}${b.shopName ? ' — ' + esc(b.shopName) : ''}</h1>
                    <div class="meta">
                        Assigned ${esc(this.dateStr(b.assignedAt))}${b.assignedBy ? ' by ' + esc(b.assignedBy) : ''}
                        · ${rows.length} device${rows.length === 1 ? '' : 's'}
                    </div>
                    <table><thead><tr>
                        <th class="n">#</th><th>Product</th><th>IMEI / Serial</th>
                        <th class="c">Grade</th><th class="r">Price</th>
                    </tr></thead><tbody>${rows.map(line).join('')}</tbody></table>
                    </body></html>`
                // A hidden iframe instead of window.open: popup blockers
                // (and embedded browsers) can't interfere, and the print
                // dialog carries only the list.
                const old = document.getElementById('cd-print-frame')
                if (old) old.remove()
                const frame = document.createElement('iframe')
                frame.id = 'cd-print-frame'
                frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
                document.body.appendChild(frame)
                const doc = frame.contentDocument || frame.contentWindow.document
                doc.open()
                doc.write(html)
                doc.close()
                setTimeout(() => {
                    try { frame.contentWindow.focus(); frame.contentWindow.print() } catch (e) { /* dialog dismissed */ }
                }, 350)
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Could not build the print list')))
            }
        },
        toggleStatus(v) {
            this.statusFilter = this.statusFilter === v ? '' : v
            this.reload()
        },
        onSelection(rows) { this.selection = rows },
        eligible(status) {
            return this.selection.filter(r => r.status === status)
        },
        async doAction(action, fromStatus, confirmText) {
            const targets = this.eligible(fromStatus)
            if (!targets.length) return
            try {
                await this.$confirm(confirmText + ' (' + this.$tp('{n} device(s)', { n: targets.length }) + ')', this.$tp('Confirm'),
                    { confirmButtonText: this.$tp('Confirm'), cancelButtonText: this.$tp('Cancel'), type: 'info' })
            } catch (e) { return }
            try {
                const r = await updateConsignDeviceStatus(action, targets.map(t => t._id))
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                let text = this.$tp('{n} device(s) updated', { n: r.updated })
                if (r.skipped) text += ' · ' + this.$tp('{n} skipped (status changed elsewhere)', { n: r.skipped })
                this.$message.success(text)
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Update failed')))
            }
        },
        // ── Assign batch (look up one Stock ID / IMEI at a time) ──
        openAssign() {
            this.assignShopId = this.shopFilter || ''
            this.assignCode = ''
            this.resolved = []
            this.assignVisible = true
            this.$nextTick(() => {
                const ref = this.$refs.codeInput
                if (ref && typeof ref.focus === 'function') ref.focus()
            })
        },
        async addCode() {
            const code = (this.assignCode || '').trim()
            if (!code || this.resolving) return
            // Already in the list? (matches stock id or IMEI, padded-aware)
            const norm = v => String(v || '').trim().toLowerCase()
            const padded = /^\d{1,10}$/.test(code) ? code.padStart(10, '0') : code
            const dup = this.resolved.find(d =>
                norm(d.stockId) === norm(code) || norm(d.stockId) === norm(padded) || (d.imei && norm(d.imei) === norm(code)))
            if (dup) {
                this.$message.info(this.$tp('{code} is already on the list', { code: dup.imei || dup.stockId }))
                this.assignCode = ''
                return
            }
            this.resolving = true
            try {
                const r = await lookupConsignDevices([code])
                if (!r || r.success === false) throw new Error((r && r.message) || 'Lookup failed')
                const device = (r.devices || [])[0]
                if (!device) {
                    // In the register but not assignable (sold, away at a
                    // repairer…) — say which, not just "not found".
                    const rej = (r.rejected || [])[0]
                    this.$message.warning(rej ? rej.reason : this.$tp('"{code}" is not in the stock register', { code }))
                    return
                }
                // Shop Price — the shop's cost, what we invoice. Typed per
                // device when the batch is built.
                device.shopPrice = null
                this.resolved.push(device)
                if (device.alreadyOut) this.$message.warning(this.$tp('{code} is already out on consignment — excluded from this batch', { code: device.stockId }))
                this.assignCode = ''
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Stock lookup failed')))
            } finally {
                this.resolving = false
                this.$nextTick(() => {
                    const ref = this.$refs.codeInput
                    if (ref && typeof ref.focus === 'function') ref.focus()
                })
            }
        },
        removeResolved(index) {
            this.resolved.splice(index, 1)
        },
        validPrice(v) {
            const n = Number(v)
            return v !== '' && v != null && Number.isFinite(n) && n >= 0
        },
        // Dim rows that are excluded (already out on consignment).
        resolveRowClass({ row }) {
            return row.alreadyOut ? 'cd-row-out' : ''
        },
        async submitAssign() {
            this.assigning = true
            try {
                const devices = this.assignable.map(d => ({
                    stockId: d.stockId, imei: d.imei, refurbDeviceId: d.refurbDeviceId,
                    sku: d.sku, productName: d.productName,
                    grade: d.grade, costPrice: d.costPrice,
                    shopPrice: Number(d.shopPrice)
                }))
                const r = await assignConsignDevices({ shopId: this.assignShopId, devices })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('{n} device(s) assigned to {shop} (in transit)', { n: r.assigned, shop: r.shopName }))
                this.assignVisible = false
                this.reload()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Assign failed')))
            } finally {
                this.assigning = false
            }
        },
        // ── Formatting ──
        statusLabel(v) { return this.$tp((STATUS_META[v] && STATUS_META[v].label) || v) },
        // The date that belongs to the row's current status — assigned for
        // in-transit, received once it lands, and so on.
        statusDate(row) {
            const field = {
                'in-transit': 'assignedAt',
                received: 'receivedAt',
                sold: 'soldAt',
                returning: 'returnAt',
                returned: 'returnedAt'
            }[row.status]
            return this.dateStr(field ? row[field] : null)
        },
        statusStyle(v) {
            const m = STATUS_META[v]
            return m ? { color: m.color, background: m.bg } : {}
        },
        money(v) {
            if (v == null || v === '') return '—'
            return '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        },
        dateStr(d) {
            if (!d) return '—'
            const x = new Date(d)
            if (isNaN(x.getTime())) return '—'
            const p = n => String(n).padStart(2, '0')
            return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${String(x.getFullYear()).slice(2)}`
        },
        msg(e, fallback) {
            return (e.response && e.response.data && e.response.data.message) || e.message || fallback
        }
    }
}
</script>

<style scoped>
.cd-page { padding: 16px 20px; min-height: calc(100vh - 84px); background: #f6f8fb; }
.cd-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.cd-title { font-size: 20px; font-weight: 700; color: #1f2937; line-height: 1.2; }
.cd-sub { font-size: 13px; color: #909399; margin-top: 3px; }
.cd-actions { display: flex; gap: 8px; }

.cd-status-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.cd-chip {
    display: inline-flex; align-items: center; gap: 6px;
    background: #fff; border: 1px solid #ebeef5; border-radius: 16px;
    padding: 5px 12px; font-size: 12.5px; color: #606266; cursor: pointer; user-select: none;
}
.cd-chip:hover { border-color: #c0c4cc; }
.cd-chip.active { color: #303133; font-weight: 600; }
.cd-chip-dot { width: 8px; height: 8px; border-radius: 50%; }
.cd-chip b { font-weight: 600; }

.cd-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.cd-spacer { flex: 1; }

.cd-table { width: 100%; background: #fff; border: 1px solid #ebeef5; border-radius: 8px; }
.cd-status { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 12px; font-weight: 500; white-space: nowrap; }
.cd-status-date { font-size: 11px; color: #909399; margin-top: 2px; }
/* A selection cell can never usefully truncate — never show "…" in it. */
.cd-table ::v-deep .el-table-column--selection .cell { text-overflow: clip; padding-left: 0; padding-right: 0; }
.cd-grade { margin-left: 6px; vertical-align: 1px; }
.cd-invoiced { color: #67C23A; font-weight: 700; }
.cd-dash { color: #c0c4cc; }
.cd-empty { color: #909399; font-size: 13px; }
.cd-pager { margin-top: 10px; text-align: right; }

.cd-dialog-title { font-size: 15px; font-weight: 600; color: #303133; }
.cd-dialog-title i { color: #67c23a; margin-right: 6px; }
.cd-batch-link { padding: 0; font-size: 12px; font-weight: 600; }
.cd-batch-shop { margin-left: 8px; font-weight: 400; color: #909399; font-size: 13px; }
.cd-batch-meta { color: #606266; font-size: 12px; margin-bottom: 10px; }

.cd-mono { font-family: Consolas, Menlo, monospace; font-size: 12px; }
.cd-prod { font-weight: 600; color: #303133; line-height: 1.3; }
.cd-table .cd-sub, .cd-resolve-table .cd-sub { font-size: 11px; color: #909399; margin-top: 1px; }
.cd-code-row { display: flex; gap: 8px; }
.cd-code-row .el-input { flex: 1; }
.cd-remove { color: #c0c4cc; cursor: pointer; font-size: 14px; }
.cd-remove:hover { color: #F56C6C; }
.cd-resolve-note { font-size: 12.5px; margin: 12px 0 8px; }
.cd-resolve-note .ok { color: #67C23A; font-weight: 600; }
.cd-resolve-note .warn { color: #E6A23C; }
.cd-resolve-note .err { color: #F56C6C; }
.cd-resolve-table { width: 100%; }
.cd-resolve-table ::v-deep .cd-row-out { opacity: 0.45; text-decoration: line-through; }
.cd-resolve-table ::v-deep .el-input__prefix { left: 7px; line-height: 28px; color: #909399; }
.cd-resolve-table ::v-deep .el-input--prefix .el-input__inner { padding-left: 18px; }
.cd-price-missing ::v-deep .el-input__inner { border-color: #F56C6C; }
</style>
