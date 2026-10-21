<template>
    <div class="xp app-container">
        <div class="xp-head">
            <div class="xp-head-text">
                <div class="xp-title">{{ $tp('Pick Lists') }}</div>
                <div class="xp-sub">{{ $tp('One list per day of the orders being processed, ready to print for picking') }}</div>
            </div>
            <span class="xp-flex" />
            <!-- which list an order is on (user 2026-10-20): matches as you type;
                 picking one — or Enter on a full number — opens that list there -->
            <el-autocomplete v-model="findQ" size="small" class="xp-find" clearable prefix-icon="el-icon-search"
                :fetch-suggestions="findOrders" :trigger-on-focus="false" :debounce="250" select-when-unmatched
                popper-class="xp-find-pop" :placeholder="$tp('Find an order number')" @select="goToOrder">
                <template slot-scope="{ item }">
                    <div v-if="item.none" class="xp-find-none">{{ item.none }}</div>
                    <div v-else class="xp-find-item">
                        <b>{{ item.orderId }}</b>
                        <span class="xp-find-day">{{ shortDay(item.day) }}</span>
                        <span :class="['xp-find-st', 'xp-find-st-' + (dstatus(item) || (item.tracking ? 'todo' : 'none'))]">{{ dlabel(item) }}</span>
                    </div>
                </template>
            </el-autocomplete>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="reload">{{ $tp('Refresh') }}</el-button>
        </div>

        <div class="xp-layout">
            <!-- the days -->
            <div v-loading="loading" class="xp-days">
                <div v-for="d in lists" :key="d.day" :class="['xp-day', { on: d.day === day }]" @click="open(d.day)">
                    <div class="xp-day-1">
                        <b>{{ shortDay(d.day) }}</b>
                        <span v-if="d.day === today" class="xp-today">{{ $tp('Today') }}</span>
                    </div>
                    <div class="xp-day-2">{{ d.orders }} {{ $tp('orders') }} · {{ d.units }} {{ $tp('units') }}</div>
                    <!-- batches printed, and the orders waiting for the next print -->
                    <div v-if="d.batches || d.unprinted" class="xp-day-b">
                        <span v-if="d.batches">{{ $tp('{n} batch(es)', { n: d.batches }) }}</span>
                        <span v-if="d.unprinted" class="xp-day-new">{{ $tp('{n} new', { n: d.unprinted }) }}</span>
                    </div>
                    <!-- Confirm dispatch progress -->
                    <div v-if="d.dispatched || d.held" class="xp-day-3">
                        <span v-if="!d.toConfirm && !d.held" class="xp-ok"><i class="el-icon-success" /> {{ $tp('All dispatched') }}</span>
                        <template v-else>
                            <span v-if="d.dispatched" class="xp-ok">{{ $tp('{n} dispatched', { n: d.dispatched }) }}</span>
                            <span v-if="d.held" class="xp-held">{{ $tp('{n} not dispatched', { n: d.held }) }}</span>
                        </template>
                    </div>
                </div>
                <div v-if="!loading && !lists.length" class="xp-days-empty">
                    <i class="el-icon-document" />
                    <div>{{ $tp('No pick lists yet') }}</div>
                    <small>{{ $tp('Orders join the day\'s list when they are processed on the Dispatch page') }}</small>
                </div>
            </div>

            <!-- one day's list -->
            <div v-loading="detailLoading" class="xp-detail">
                <template v-if="list">
                    <div class="xp-detail-head">
                        <div>
                            <div class="xp-day-title">{{ longDay(list.day) }}</div>
                            <div class="xp-sub">{{ $tp('Started {when} by {by}', { when: time(list.createdAt), by: list.createdBy || '—' }) }}</div>
                        </div>
                        <span class="xp-flex" />
                        <!-- the new batch: printing closes it (orders added after go into the
                             next one); a printed batch prints again as it is -->
                        <el-button v-if="view !== 'all' && (view !== 'open' || canEdit)" size="small" type="primary" plain icon="el-icon-printer"
                            :disabled="!viewed.lines.length" @click="openPrint">{{ view === 'open' ? $tp('Print pick list') : $tp('Print again') }}</el-button>
                        <!-- the batch's orders were picked and shipped: confirm → Neto -->
                        <el-button v-if="canEdit && notDispatched.length" size="small" type="primary" icon="el-icon-finished" @click="openConfirm(notDispatched)">
                            {{ $tp('Confirm dispatch') }} ({{ notDispatched.length }})</el-button>
                    </div>

                    <!-- the day's batches (2026-10-21): one per print, then the orders not printed yet -->
                    <div class="xp-batches">
                        <el-radio-group v-model="view" size="small">
                            <el-radio-button v-for="b in batches" :key="b.no" :label="b.no">{{ $tp('Batch {n}', { n: b.no }) }}
                                <span class="xp-b-sub">{{ b.legacy ? $tp('earlier') : time(b.printedAt) }}</span></el-radio-button>
                            <el-radio-button v-if="openBatch.orderIds.length" label="open"><i class="el-icon-plus" /> {{ $tp('New batch') }}
                                <span class="xp-b-sub">{{ openBatch.orderIds.length }}</span></el-radio-button>
                            <el-radio-button v-if="batches.length + (openBatch.orderIds.length ? 1 : 0) > 1" label="all">{{ $tp('Whole day') }}</el-radio-button>
                        </el-radio-group>
                        <span class="xp-dim xp-b-hint">{{ viewHint }}</span>
                    </div>

                    <div class="xp-stats">
                        <div class="xp-stat"><span>{{ $tp('Orders') }}</span><b>{{ vsummary.orders || 0 }}</b>
                            <small>{{ vsummary.singleOrders || 0 }} {{ $tp('single-line') }} · {{ vsummary.multiOrders || 0 }} {{ $tp('multi-line') }}</small></div>
                        <div class="xp-stat"><span>{{ $tp('Units') }}</span><b>{{ vsummary.units || 0 }}</b>
                            <small>{{ vsummary.singleUnits || 0 }} {{ $tp('single-line') }} · {{ vsummary.multiUnits || 0 }} {{ $tp('multi-line') }}</small></div>
                        <div class="xp-stat"><span>SKUs</span><b>{{ vsummary.skus || 0 }}</b></div>
                        <div class="xp-stat"><span>{{ $tp('Dispatched') }}</span><b>{{ vsummary.dispatched || 0 }}</b>
                            <small>{{ vsummary.held || 0 }} {{ $tp('not dispatched') }} · {{ vsummary.toConfirm || 0 }} {{ $tp('to confirm') }}</small></div>
                    </div>

                    <div class="xp-sec">{{ view === 'all' ? $tp('Orders on this list') : $tp('Orders in this batch') }} <span class="xp-dim">({{ viewedOrders.length }})</span></div>
                    <el-table :data="viewedOrders" border size="mini" class="xp-table"
                        :row-class-name="r => (r.row.orderId === foundOrder ? 'xp-row-found' : '')">
                        <el-table-column :label="$tp('Order')" min-width="130">
                            <template slot-scope="s">
                                <div class="xp-order">{{ s.row.orderId }}</div>
                                <span :class="['xp-ch', chClass(s.row.channel)]">{{ s.row.channel || '—' }}</span>
                            </template>
                        </el-table-column>
                        <el-table-column v-if="view === 'all'" :label="$tp('Batch')" width="70" align="center">
                            <template slot-scope="s"><span :class="{ 'xp-day-new': !s.row.batch }">{{ s.row.batch || $tp('new') }}</span></template>
                        </el-table-column>
                        <el-table-column :label="$tp('Customer')" min-width="130" show-overflow-tooltip>
                            <template slot-scope="s">{{ s.row.customerName || '—' }}</template>
                        </el-table-column>
                        <el-table-column :label="$tp('Items')" min-width="260">
                            <template slot-scope="s">
                                <div v-for="it in s.row.items" :key="it.sku" class="xp-item">
                                    <span class="xp-sku" :title="$tp('Neto SKU')">{{ it.sku }}</span><span v-if="it.zohoSku" class="xp-sku xp-sku-zoho" :title="it.zohoName">{{ it.zohoSku }}</span><span class="xp-item-name">{{ it.productName }}</span><b>× {{ it.quantity }}</b>
                                </div>
                            </template>
                        </el-table-column>
                        <el-table-column :label="$tp('Tracking number')" min-width="140">
                            <template slot-scope="s">
                                <span v-if="s.row.tracking" class="xp-tracking" :title="s.row.processedBy ? $tp('Processed by {by}', { by: s.row.processedBy }) : ''">{{ s.row.tracking }}</span>
                                <span v-else class="xp-zero">{{ $tp('Not processed') }}</span>
                            </template>
                        </el-table-column>
                        <el-table-column :label="$tp('Type')" width="95" align="center">
                            <template slot-scope="s">
                                <el-tag size="mini" :type="s.row.multi ? 'warning' : 'info'" effect="plain">{{ s.row.multi ? $tp('Multi-line') : $tp('Single-line') }}</el-tag>
                            </template>
                        </el-table-column>
                        <el-table-column :label="$tp('Placed')" width="95">
                            <template slot-scope="s"><span class="xp-dim">{{ when(s.row.datePlaced) }}</span></template>
                        </el-table-column>
                        <!-- Confirm dispatch: sent to Neto / held back with a reason /
                             the push failed / not confirmed yet -->
                        <el-table-column :label="$tp('Dispatch')" min-width="170">
                            <template slot-scope="s">
                                <template v-if="dstatus(s.row) === 'dispatched'">
                                    <span class="xp-dsp xp-dsp-ok"><i class="el-icon-success" /> {{ $tp('Dispatched') }}</span>
                                    <div class="xp-dsp-sub">{{ s.row.dispatch.neto === 'already' ? $tp('Neto already had it') : $tp('Sent to Neto') }} · {{ time(s.row.dispatch.at) }}{{ s.row.dispatch.by ? ' · ' + s.row.dispatch.by : '' }}</div>
                                </template>
                                <template v-else-if="dstatus(s.row) === 'held'">
                                    <span class="xp-dsp xp-dsp-held"><i class="el-icon-warning" /> {{ $tp('Not dispatched') }}</span>
                                    <div class="xp-dsp-sub">{{ $tp(s.row.dispatch.reason) }}{{ s.row.dispatch.note ? ' — ' + s.row.dispatch.note : '' }}</div>
                                </template>
                                <template v-else-if="dstatus(s.row) === 'failed'">
                                    <span class="xp-dsp xp-dsp-fail"><i class="el-icon-error" /> {{ $tp('Neto update failed') }}</span>
                                    <div class="xp-dsp-sub" :title="s.row.dispatch.error">{{ s.row.dispatch.error }}</div>
                                </template>
                                <span v-else class="xp-zero">{{ $tp('To confirm') }}</span>
                            </template>
                        </el-table-column>
                        <el-table-column v-if="canEdit" width="96" align="center">
                            <template slot-scope="s">
                                <el-button v-if="['held', 'failed'].includes(dstatus(s.row))" type="text" size="mini" @click="openConfirm([s.row])">{{ $tp('Dispatch') }}</el-button>
                                <el-tooltip v-if="dstatus(s.row) !== 'dispatched'" :content="$tp('Take off this list')" placement="top">
                                    <el-button type="text" icon="el-icon-close" class="xp-remove" @click="remove(s.row)" />
                                </el-tooltip>
                            </template>
                        </el-table-column>
                    </el-table>
                </template>
                <div v-else-if="!detailLoading" class="xp-detail-empty">
                    <i class="el-icon-tickets" />
                    <div>{{ lists.length ? $tp('Pick a day') : $tp('No pick lists yet') }}</div>
                </div>
            </div>
        </div>

        <!-- Confirm dispatch: each order dispatched (→ Neto) or held back with a reason -->
        <el-dialog :title="confirmTitle" :visible.sync="confirmVisible" width="1000px" top="5vh" append-to-body :close-on-click-modal="false"
            @opened="focusConfirmSearch">
            <div class="xp-cf-intro">
                <i class="el-icon-info" />
                {{ $tp('Every order on this list is taken as picked and shipped. Switch off an order that is not going out and say why — it stays on the list. The others are set to Dispatched in Neto with their tracking number (Australia Post, no email to the customer).') }}
            </div>
            <!-- scanning an order number (Enter) switches that order over and clears
                 the box (user 2026-10-20: no filtering, just the switch) -->
            <div class="xp-cf-search">
                <el-input ref="confirmSearch" v-model="confirmSearch" size="small" clearable prefix-icon="el-icon-full-screen"
                    :placeholder="$tp('Scan order number')" class="xp-cf-search-input"
                    @keyup.enter.native="scanConfirm" />
                <span class="xp-dim">{{ $tp('Scan an order to switch it to not dispatched (scan again to switch it back)') }}</span>
            </div>
            <el-table :data="confirmShown" border size="mini" max-height="520" :row-class-name="confirmRowClass">
                <el-table-column :label="$tp('Dispatched')" width="96" align="center">
                    <template slot-scope="s"><el-switch v-model="s.row.dispatch" @change="onSwitch(s.row)" /></template>
                </el-table-column>
                <el-table-column :label="$tp('Order')" min-width="150">
                    <template slot-scope="s">
                        <div class="xp-order">{{ s.row.orderId }}</div>
                        <span :class="['xp-ch', chClass(s.row.channel)]">{{ s.row.channel || '—' }}</span>
                        <span class="xp-dim xp-cf-cust">{{ s.row.customerName }}</span>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Items')" min-width="230">
                    <template slot-scope="s">
                        <div v-for="it in s.row.items" :key="it.sku" class="xp-item"><span class="xp-item-name">{{ it.productName }}</span><b>× {{ it.quantity }}</b></div>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Tracking number')" min-width="190">
                    <template slot-scope="s">
                        <span v-if="s.row.had" class="xp-tracking">{{ s.row.had }}</span>
                        <!-- never processed: scan its label here, or switch it off -->
                        <el-input v-else-if="s.row.dispatch" v-model="s.row.tracking" size="mini" clearable
                            :class="{ 'xp-cf-bad': !trackingOk(s.row) }" :placeholder="$tp('Scan tracking number')" prefix-icon="el-icon-full-screen" />
                        <span v-else class="xp-zero">—</span>
                    </template>
                </el-table-column>
                <el-table-column :label="$tp('Why not dispatched')" min-width="250">
                    <template slot-scope="s">
                        <div v-if="!s.row.dispatch" class="xp-cf-why">
                            <el-select v-model="s.row.reason" size="mini" :class="{ 'xp-cf-bad': !s.row.reason }" :placeholder="$tp('Reason')">
                                <el-option v-for="r in holdReasons" :key="r" :label="$tp(r)" :value="r" />
                            </el-select>
                            <el-input v-model="s.row.note" size="mini" maxlength="300" :placeholder="$tp('Note (optional)')" />
                        </div>
                    </template>
                </el-table-column>
            </el-table>
            <span slot="footer" class="xp-cf-foot">
                <span class="xp-cf-count">
                    <b>{{ confirmCounts.dispatch }}</b> {{ $tp('to dispatch') }} · <b>{{ confirmCounts.hold }}</b> {{ $tp('not dispatched') }}
                    <span v-if="confirmProblems" class="xp-cf-warn"><i class="el-icon-warning" /> {{ $tp('{n} need a tracking number, or a reason', { n: confirmProblems }) }}</span>
                </span>
                <span class="xp-flex" />
                <el-button size="small" @click="confirmVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button size="small" type="primary" icon="el-icon-finished" :loading="confirming"
                    :disabled="!!confirmProblems || !confirmRows.length" @click="submitConfirm">{{ $tp('Confirm dispatch') }}</el-button>
            </span>
        </el-dialog>

        <!-- print preview -->
        <el-dialog :title="printTitle" :visible.sync="printVisible" width="60%" top="5vh" custom-class="xp-print-dialog" @close="cleanupPrint">
            <div class="xp-print-wrap"><iframe v-if="printUrl" :src="printUrl" class="xp-print-frame" title="Pick list" /></div>
            <span slot="footer">
                <el-button size="small" type="primary" icon="el-icon-printer" @click="printNow">{{ $tp('Print') }}</el-button>
                <el-button size="small" icon="el-icon-download" @click="download">{{ $tp('Download') }}</el-button>
                <el-button size="small" @click="printVisible = false">{{ $tp('Close') }}</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import { getExyonPickLists, getExyonPickList, removeFromPickList, confirmExyonDispatch, findOnPickLists, printExyonPickList } from '@/api/exyonAccessories'
import { buildPickListPdf, pickListFileName } from '@/utils/exyonPickListPdf'
import { hasPermission } from '@/utils/permission'

// why an order isn't going out (the backend's HOLD_REASONS)
const HOLD_REASONS = ['Insufficient stock', 'Damaged item', 'Address issue', 'Customer cancelled', 'Other']
const TRACKING_RE = /^[A-Za-z0-9._/-]{4,60}$/

export default {
    name: 'ExyonAccessoryPickLists',
    data() {
        return {
            loading: false,
            lists: [],
            today: '',
            day: '',
            detailLoading: false,
            list: null,
            lines: [],
            summary: {},
            // the day's batches (printed) and the orders not printed yet — the
            // one shown: a batch number, 'open' (the new batch) or 'all'
            batches: [],
            openBatch: { orderIds: [], lines: [], summary: {} },
            view: 'open',
            // the print preview: which batch it prints, and whether this
            // preview's print is recorded (the new batch closed / a reprint noted)
            printBatch: null,
            printRecorded: false,
            printVisible: false,
            printUrl: '',
            printTitle: '',
            holdReasons: HOLD_REASONS,
            // Find an order number: the box, and the order found (highlighted)
            findQ: '',
            foundOrder: '',
            // the Confirm dispatch popup
            confirmVisible: false,
            confirmRows: [],
            confirmSearch: '',
            // switched-off order: the newest goes first; the one scanned last is highlighted
            confirmSeq: 0,
            confirmLast: '',
            confirming: false
        }
    },
    computed: {
        canEdit() {
            return hasPermission(this.$store.getters.permissions, 'exyon:accessory:picklist')
        },
        // what is shown: one batch, the new orders, or the whole day
        viewed() {
            if (this.view === 'all') return { orderIds: ((this.list && this.list.orders) || []).map(o => o.orderId), lines: this.lines, summary: this.summary }
            if (this.view === 'open') return this.openBatch
            return this.batches.find(b => b.no === this.view) || { orderIds: [], lines: [], summary: {} }
        },
        vsummary() {
            return this.viewed.summary || {}
        },
        viewedOrders() {
            const ids = new Set(this.viewed.orderIds)
            return ((this.list && this.list.orders) || []).filter(o => ids.has(o.orderId))
        },
        viewHint() {
            if (this.view === 'open') return this.$tp('Not printed yet — printing makes it batch {n}; orders added after go into the next batch', { n: this.nextBatchNo })
            if (this.view === 'all') return this.$tp('Every batch of the day')
            const b = this.batches.find(x => x.no === this.view)
            if (!b) return ''
            if (b.legacy) return this.$tp('The orders from before batches')
            return this.$tp('Printed {when} by {by}', { when: this.time(b.printedAt), by: b.printedBy || '—' }) + (b.reprints ? ' · ' + this.$tp('printed again {n}×', { n: b.reprints }) : '')
        },
        nextBatchNo() {
            return Math.max(0, ...this.batches.map(b => b.no)) + 1
        },
        // the shown orders still to go out — to confirm, held back, or a failed push
        notDispatched() {
            return this.viewedOrders.filter(o => this.dstatus(o) !== 'dispatched')
        },
        viewLabel() {
            if (this.view === 'open') return this.$tp('New batch')
            if (this.view === 'all') return ''
            return this.$tp('Batch {n}', { n: this.view })
        },
        confirmTitle() {
            return this.list ? `${this.$tp('Confirm dispatch')} — ${this.longDay(this.list.day)}${this.viewLabel ? ' · ' + this.viewLabel : ''}` : ''
        },
        // the popup's rows: the not dispatched ones first (user 2026-10-20) —
        // the one switched off last on top — then the rest in list order
        confirmShown() {
            return this.confirmRows.slice().sort((a, b) =>
                (a.dispatch ? 1 : 0) - (b.dispatch ? 1 : 0) ||
                (a.dispatch ? 0 : b.offSeq - a.offSeq) ||
                a.idx - b.idx)
        },
        confirmCounts() {
            const dispatch = this.confirmRows.filter(r => r.dispatch).length
            return { dispatch, hold: this.confirmRows.length - dispatch }
        },
        // rows that can't be confirmed yet: going out with no tracking number,
        // or held back with no reason
        confirmProblems() {
            return this.confirmRows.filter(r => (r.dispatch ? !this.trackingOk(r) : !r.reason)).length
        }
    },
    created() {
        this.reload()
    },
    beforeDestroy() {
        this.cleanupPrint()
    },
    methods: {
        async reload() {
            await this.loadLists()
            const want = this.day && this.lists.some(d => d.day === this.day) ? this.day : (this.lists[0] && this.lists[0].day)
            if (want) await this.open(want)
            else { this.list = null; this.day = '' }
        },
        async loadLists() {
            this.loading = true
            try {
                const r = await getExyonPickLists()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.lists = r.lists || []
                this.today = r.today || ''
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load the pick lists')))
            } finally {
                this.loading = false
            }
        },
        async open(day) {
            this.day = day
            this.detailLoading = true
            try {
                const r = await getExyonPickList(day)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                const sameDay = this.list && this.list.day === r.list.day
                this.list = r.list
                this.lines = r.lines || []
                this.summary = r.summary || {}
                this.batches = r.batches || []
                this.openBatch = r.open || { orderIds: [], lines: [], summary: {} }
                // the same day again: the same view while it still exists; else
                // the new orders, the last batch, or the whole day
                const has = v => v === 'all' || (v === 'open' ? this.openBatch.orderIds.length > 0 : this.batches.some(b => b.no === v))
                if (!(sameDay && has(this.view))) {
                    this.view = this.openBatch.orderIds.length ? 'open' : this.batches.length ? this.batches[this.batches.length - 1].no : 'all'
                }
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load the pick list')))
            } finally {
                this.detailLoading = false
            }
        },
        async remove(order) {
            try {
                await this.$confirm(this.$tp('Take {no} off this pick list? It goes back to the open orders.', { no: order.orderId }),
                    this.$tp('Take off this list'), { type: 'warning', confirmButtonText: this.$tp('Take off'), cancelButtonText: this.$tp('Cancel') })
            } catch (e) { return }
            try {
                const r = await removeFromPickList(this.list.day, order.orderId)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('{no} taken off the list', { no: order.orderId }))
                await this.reload()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to remove the order')))
            }
        },
        // ── Find an order number ──
        async findOrders(q, cb) {
            const text = String(q || '').replace(/\s+/g, '')
            if (text.length < 3) { cb([]); return }
            try {
                const r = await findOnPickLists(text)
                const matches = (r && r.matches) || []
                cb(matches.length ? matches.map(m => ({ ...m, value: m.orderId }))
                    : [{ none: this.$tp('Not on any pick list'), value: q }])
            } catch (e) {
                cb([])
            }
        },
        // a picked match — or Enter on what was typed (a scan): the one list
        // holding exactly that number, or the only match
        async goToOrder(item) {
            if (!item || item.none) return
            let hit = item.day ? item : null
            if (!hit) {
                const text = String(item.value || '').replace(/\s+/g, '')
                if (text.length < 3) return
                try {
                    const r = await findOnPickLists(text)
                    const matches = (r && r.matches) || []
                    const exact = matches.filter(m => m.orderId.toLowerCase() === text.toLowerCase())
                    hit = exact[0] || (matches.length === 1 ? matches[0] : null)
                    if (!hit) {
                        this.$message.warning(matches.length
                            ? this.$tp('{n} orders match "{q}" — pick one from the list', { n: matches.length, q: text })
                            : this.$tp('{q} is not on any pick list', { q: text }))
                        return
                    }
                } catch (e) {
                    this.$message.error(this.msg(e, this.$tp('Failed to search the pick lists')))
                    return
                }
            }
            this.foundOrder = hit.orderId
            this.findQ = hit.orderId
            if (this.day !== hit.day || !this.list) await this.open(hit.day)
            const on = ((this.list && this.list.orders) || []).find(o => o.orderId === hit.orderId)
            if (on) this.view = on.batch || 'open'
            // a moment's wait: the dropdown closing would cut a scroll short
            setTimeout(() => {
                const row = this.$el.querySelector('.xp-row-found')
                if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' })
            }, 80)
        },
        // an order's state on its list, in words
        dlabel(o) {
            const st = this.dstatus(o)
            if (st === 'dispatched') return this.$tp('Dispatched')
            if (st === 'held') return this.$tp('Not dispatched')
            if (st === 'failed') return this.$tp('Neto update failed')
            return o.tracking ? this.$tp('To confirm') : this.$tp('Not processed')
        },
        // ── Confirm dispatch ──
        dstatus(o) {
            return (o && o.dispatch && o.dispatch.status) || ''
        },
        trackingOk(r) {
            return TRACKING_RE.test(String(r.had || r.tracking || '').replace(/\s+/g, ''))
        },
        // every order goes out unless switched off; one held back before
        // opens held, with its reason
        openConfirm(orders) {
            this.confirmRows = orders.map((o, idx) => {
                const held = this.dstatus(o) === 'held'
                return {
                    idx,
                    offSeq: 0,
                    orderId: o.orderId,
                    channel: o.channel,
                    customerName: o.customerName,
                    items: o.items || [],
                    had: o.tracking || '',
                    tracking: '',
                    // a held order opened on its own (its Dispatch button) is going out now
                    dispatch: !held || orders.length === 1,
                    reason: held ? o.dispatch.reason : '',
                    note: held ? (o.dispatch.note || '') : ''
                }
            })
            this.confirmSearch = ''
            this.confirmSeq = 0
            this.confirmLast = ''
            this.confirmVisible = true
        },
        // ready for the scanner as soon as the popup is up
        focusConfirmSearch() {
            const el = this.$refs.confirmSearch
            if (el && el.focus) el.focus()
        },
        // a switch turned off: to the top of the not dispatched ones
        onSwitch(row) {
            if (!row.dispatch) row.offSeq = ++this.confirmSeq
        },
        // A scanned (or typed + Enter) order number: the order with exactly
        // that number — or the only one containing it — switches over; the box
        // clears for the next scan.
        scanConfirm() {
            const q = this.confirmSearch.replace(/\s+/g, '').toLowerCase()
            if (!q) return
            const exact = this.confirmRows.find(r => String(r.orderId).toLowerCase() === q)
            const partial = this.confirmRows.filter(r => String(r.orderId).toLowerCase().includes(q))
            const row = exact || (partial.length === 1 ? partial[0] : null)
            if (!row) {
                this.$message.warning(partial.length
                    ? this.$tp('{n} orders match "{q}" — scan the full order number', { n: partial.length, q: this.confirmSearch.trim() })
                    : this.$tp('{q} is not on this list', { q: this.confirmSearch.trim() }))
                return
            }
            row.dispatch = !row.dispatch
            this.onSwitch(row)
            this.confirmLast = row.orderId
            this.confirmSearch = ''
            this.$message({
                type: row.dispatch ? 'success' : 'warning',
                message: row.dispatch
                    ? this.$tp('{no} back to dispatched', { no: row.orderId })
                    : this.$tp('{no} switched to not dispatched — pick a reason', { no: row.orderId })
            })
            this.focusConfirmSearch()
        },
        confirmRowClass({ row }) {
            return [row.dispatch ? '' : 'xp-cf-held', row.orderId === this.confirmLast ? 'xp-cf-last' : ''].filter(Boolean).join(' ')
        },
        async submitConfirm() {
            const go = this.confirmRows.filter(r => r.dispatch)
            const hold = this.confirmRows.filter(r => !r.dispatch)
            try {
                await this.$confirm(
                    (go.length ? this.$tp('Set {n} order(s) to Dispatched in Neto, with their tracking numbers? No email goes to the customers.', { n: go.length }) : '') +
                    (hold.length ? ' ' + this.$tp('{n} stay on the list as not dispatched.', { n: hold.length }) : ''),
                    this.$tp('Confirm dispatch'),
                    { type: 'warning', confirmButtonText: this.$tp('Confirm'), cancelButtonText: this.$tp('Cancel') })
            } catch (e) { return }
            this.confirming = true
            try {
                const orders = this.confirmRows.map(r => r.dispatch
                    ? { orderId: r.orderId, dispatch: true, ...(r.had ? {} : { tracking: String(r.tracking || '').replace(/\s+/g, '') }) }
                    : { orderId: r.orderId, dispatch: false, reason: r.reason, note: r.note })
                const res = await confirmExyonDispatch(this.list.day, orders)
                if (!res || res.success === false) throw new Error((res && res.message) || 'Failed')
                const by = o => (res.results || []).filter(x => x.outcome === o)
                const failed = by('failed')
                const done = by('dispatched').length + by('already').length
                const msg = [
                    done ? this.$tp('{n} dispatched', { n: done }) : '',
                    by('held').length ? this.$tp('{n} not dispatched', { n: by('held').length }) : ''
                ].filter(Boolean).join(' · ')
                if (failed.length) {
                    this.$notify({
                        type: 'error',
                        title: this.$tp('{n} could not be updated in Neto', { n: failed.length }),
                        message: failed.map(f => `${f.orderId}: ${f.message || ''}`).join('\n'),
                        duration: 0
                    })
                }
                if (msg) this.$message.success(msg)
                this.confirmVisible = false
                await this.reload()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to confirm the dispatch')))
            } finally {
                this.confirming = false
            }
        },
        // ── printing ──
        // the shown batch (the new one is numbered as it will be once printed)
        buildPdf() {
            return buildPickListPdf({ day: this.list.day, lines: this.viewed.lines, summary: this.viewed.summary, batch: this.printBatch })
        },
        openPrint() {
            this.cleanupPrint()
            this.printBatch = this.view === 'open' ? this.nextBatchNo : this.view
            this.printRecorded = false
            this.printUrl = this.buildPdf().output('bloburl') + '#toolbar=0'
            this.printTitle = `${this.$tp('Pick list')} — ${this.longDay(this.list.day)} · ${this.$tp('Batch {n}', { n: this.printBatch })}`
            this.printVisible = true
        },
        // Print / Download count as printed (user 2026-10-21): the new batch
        // closes — exactly the orders in this preview — or a reprint is noted.
        // false = not printed (the reason shown).
        async recordPrint() {
            if (this.printRecorded) return true
            const day = this.list.day
            try {
                if (this.view === 'open') {
                    const r = await printExyonPickList(day, { orderIds: this.openBatch.orderIds })
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    this.printRecorded = true
                    this.printBatch = r.batch
                    this.$message.success(this.$tp('Batch {n} printed — orders added from now go into the next batch', { n: r.batch }))
                    // the list again, on the batch just made (the preview stays)
                    await this.loadLists()
                    await this.open(day)
                    this.view = r.batch
                    return true
                }
                if (this.canEdit) await printExyonPickList(day, { batch: this.view })
                this.printRecorded = true
                return true
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Could not record the print')))
                // a batch closed elsewhere meanwhile: show the list as it is now
                await this.reload()
                return false
            }
        },
        async printNow() {
            // the window opens on the click (a pop-up blocker would stop it after the wait)
            const w = window.open('', '_blank')
            if (!(await this.recordPrint())) { if (w) w.close(); return }
            const doc = this.buildPdf()
            doc.autoPrint()
            if (w) w.location.href = doc.output('bloburl')
            else this.$message.warning(this.$tp('Pop-up blocked — use Download instead'))
        },
        async download() {
            if (!(await this.recordPrint())) return
            this.buildPdf().save(pickListFileName(this.list.day, this.printBatch))
        },
        cleanupPrint() {
            if (this.printUrl) {
                try { URL.revokeObjectURL(this.printUrl.replace('#toolbar=0', '')) } catch (e) { /* ignore */ }
            }
            this.printUrl = ''
        },
        // ── formatting ──
        dateOf(day) {
            const [y, m, d] = String(day || '').split('-').map(Number)
            return new Date(y, (m || 1) - 1, d || 1)
        },
        shortDay(day) {
            return this.dateOf(day).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
        },
        longDay(day) {
            return this.dateOf(day).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        },
        time(v) {
            const d = new Date(v)
            return isNaN(d) ? '—' : d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
        },
        // "2026-10-08 00:09:54" (as written in Exyon's table) → "08/10 00:09"
        when(v) {
            const m = /^\d{4}-(\d{2})-(\d{2})\s(\d{2}:\d{2})/.exec(v || '')
            return m ? `${m[2]}/${m[1]} ${m[3]}` : '—'
        },
        chClass(c) {
            const v = String(c || '').toLowerCase()
            if (v.includes('reebelo')) return 'ch-reebelo'
            if (v.includes('backmarket') || v.includes('back market')) return 'ch-backmarket'
            if (v.includes('jb hi-fi')) return 'ch-jb'
            if (v.includes('kogan')) return 'ch-kogan'
            return ''
        },
        msg(e, fallback) { return (e.response && e.response.data && e.response.data.message) || e.message || fallback }
    }
}
</script>

<style lang="scss" scoped>
.xp { padding: 14px 16px; }
.xp-flex { flex: 1; }
.xp-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.xp-head-text { min-width: 0; }
.xp-title { font-size: 17px; font-weight: 600; color: #303133; }
.xp-sub { font-size: 13px; color: #909399; margin-top: 3px; }
.xp-dim { color: #909399; font-weight: normal; }

.xp-layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 14px; align-items: start; }
.xp-days { min-height: 120px; display: flex; flex-direction: column; gap: 6px; }
.xp-day { padding: 9px 12px; border: 1px solid #ebeef5; border-radius: 6px; background: #fff; cursor: pointer;
    &:hover { border-color: #b3d8ff; }
    &.on { border-color: #409eff; background: #ecf5ff; } }
.xp-day-1 { display: flex; align-items: center; gap: 6px; b { font-size: 13px; color: #303133; } }
.xp-day-2 { margin-top: 2px; font-size: 12px; color: #909399; }
/* batches (2026-10-21): printed ones, and the orders waiting for the next print */
.xp-day-b { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 3px; font-size: 12px; color: #606266; }
.xp-day-new { color: #e6a23c; font-weight: 600; }
.xp-batches { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 12px; }
.xp-b-sub { margin-left: 4px; font-size: 11px; opacity: .75; }
.xp-b-hint { font-size: 12px; }
.xp-today { padding: 0 6px; border-radius: 9px; background: #67c23a; color: #fff; font-size: 11px; line-height: 17px; }
.xp-days-empty, .xp-detail-empty { padding: 40px 10px; text-align: center; color: #909399; font-size: 13px;
    i { display: block; font-size: 32px; color: #c0c4cc; margin-bottom: 8px; }
    small { display: block; margin-top: 4px; font-size: 12px; } }

.xp-detail { min-height: 200px; padding: 14px 16px; border: 1px solid #ebeef5; border-radius: 8px; background: #fff; }
.xp-detail-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.xp-day-title { font-size: 16px; font-weight: 600; color: #303133; }
.xp-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-bottom: 6px; }
.xp-stat { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; padding: 8px 12px; border-radius: 6px; background: #f5f7fa;
    span { width: 100%; font-size: 12px; color: #909399; }
    b { font-size: 20px; color: #303133; }
    small { font-size: 12px; color: #909399; } }
.xp-sec { margin: 16px 0 8px; font-size: 13px; font-weight: 600; color: #303133; }
.xp-table { width: 100%; }
.xp-sku { display: inline-block; padding: 0 6px; border-radius: 4px; background: #f0f2f5; color: #303133; font-family: Menlo, Consolas, monospace; font-size: 11px; line-height: 18px; white-space: nowrap; }
.xp-sku-zoho { background: #ecf5ff; color: #1f6fd1; }
.xp-tracking { font-family: Menlo, Consolas, monospace; font-size: 12px; color: #529b2e; }
.xp-zero { color: #c0c4cc; }
.xp-order { font-weight: 600; color: #303133; }
.xp-ch { display: inline-block; padding: 0 6px; border-radius: 3px; font-size: 11px; line-height: 17px; white-space: nowrap; color: #606266; background: #f4f4f5;
    &.ch-reebelo { color: #409eff; background: #ecf5ff; }
    &.ch-backmarket { color: #67c23a; background: #f0f9eb; }
    &.ch-jb { color: #b88200; background: #fdf6ec; }
    &.ch-kogan { color: #c45656; background: #fef0f0; } }
.xp-item { display: flex; align-items: baseline; gap: 6px; padding: 1px 0; font-size: 12px;
    b { flex-shrink: 0; margin-left: auto; } }
.xp-item-name { min-width: 0; color: #606266; line-height: 1.35; word-break: normal; }
.xp-remove { color: #c0c4cc; &:hover { color: #f56c6c; } }
/* Find an order number */
.xp-find { width: 260px; max-width: 100%; }
::v-deep .xp-row-found > td { background: #ecf5ff !important; }
::v-deep .xp-row-found > td:first-child { box-shadow: inset 4px 0 0 #409eff; }
/* Confirm dispatch */
.xp-day-3 { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 3px; font-size: 12px; }
.xp-ok { color: #529b2e; }
.xp-held { color: #d48806; }
.xp-dsp { font-size: 12px; font-weight: 600; white-space: nowrap; }
.xp-dsp-ok { color: #529b2e; }
.xp-dsp-held { color: #d48806; }
.xp-dsp-fail { color: #f56c6c; }
.xp-dsp-sub { font-size: 11px; color: #909399; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.xp-cf-intro { display: flex; gap: 6px; margin-bottom: 10px; padding: 8px 12px; border-radius: 6px; background: #f4f8ff; color: #4b5563; font-size: 13px; line-height: 1.5;
    i { margin-top: 3px; color: #409eff; } }
.xp-cf-cust { margin-left: 6px; font-size: 12px; }
.xp-cf-search { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.xp-cf-search-input { width: 280px; max-width: 100%; }
.xp-cf-why { display: flex; flex-direction: column; gap: 4px; }
.xp-cf-bad ::v-deep .el-input__inner { border-color: #f56c6c; }
::v-deep .el-table .xp-cf-held > td { background: #fdf6ec; }
/* the order scanned last — a blue bar down its left */
::v-deep .el-table .xp-cf-last > td:first-child { box-shadow: inset 4px 0 0 #409eff; }
.xp-cf-foot { display: flex; align-items: center; gap: 8px; }
.xp-cf-count { font-size: 13px; color: #606266; b { color: #303133; } }
.xp-cf-warn { margin-left: 10px; color: #e6a23c; }
.xp-print-wrap { height: 72vh; background: #f2f3f5; }
.xp-print-frame { width: 100%; height: 100%; border: none; display: block; }

@media (max-width: 760px) {
    .xp-layout { grid-template-columns: minmax(0, 1fr); }
    .xp-days { flex-direction: row; overflow-x: auto; min-height: 0; padding-bottom: 2px; }
    .xp-day { flex-shrink: 0; }
    .xp-detail { padding: 10px; }
}
</style>

<style lang="scss">
/* the Find an order number dropdown — appended to <body>, so outside the
   scoped styles above */
.xp-find-pop {
    .xp-find-item { display: flex; align-items: center; gap: 8px; font-size: 13px;
        b { color: #303133; } }
    .xp-find-day { color: #909399; font-size: 12px; }
    .xp-find-st { margin-left: auto; padding: 0 6px; border-radius: 3px; font-size: 11px; line-height: 18px; white-space: nowrap; color: #909399; background: #f4f4f5; }
    .xp-find-st-dispatched { color: #529b2e; background: #f0f9eb; }
    .xp-find-st-held { color: #d48806; background: #fdf6ec; }
    .xp-find-st-failed { color: #f56c6c; background: #fef0f0; }
    .xp-find-st-todo { color: #409eff; background: #ecf5ff; }
    .xp-find-none { color: #909399; font-size: 13px; }
}
</style>
