<template>
    <div class="rso app-container">
        <div class="rso-filters">
            <el-input v-model="query.search" size="small" clearable class="f-search"
                placeholder="Search order no / customer / IMEI…" prefix-icon="el-icon-search"
                @keyup.enter.native="reload" @clear="reload" />
            <el-select v-model="query.status" size="small" clearable placeholder="Status" class="f-sel" @change="reload">
                <el-option label="Pending" value="Pending" />
                <el-option label="Confirmed" value="Confirmed" />
            </el-select>
            <span class="rso-spacer" />
            <el-button size="small" type="primary" plain icon="el-icon-plus" @click="openCreate">New Sales Order</el-button>
            <el-button size="small" icon="el-icon-refresh" @click="load">Refresh</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini" height="calc(100vh - 210px)"
            empty-text="No sales orders yet.">
            <el-table-column prop="orderNo" label="Order No" width="110">
                <template slot-scope="s">
                    <a class="rso-link" @click="openDetail(s.row)">{{ s.row.orderNo }}</a>
                </template>
            </el-table-column>
            <el-table-column prop="customerName" label="Customer" min-width="160" show-overflow-tooltip />
            <el-table-column label="Devices" width="80" align="center">
                <template slot-scope="s">{{ (s.row.lines || []).length }}</template>
            </el-table-column>
            <el-table-column label="Sub Total (Ex GST)" width="140" align="right">
                <template slot-scope="s">{{ amount(orderSubTotal(s.row)) }}</template>
            </el-table-column>
            <el-table-column label="GST" width="110" align="right">
                <template slot-scope="s">{{ amount(s.row.gstAmount || 0) }}</template>
            </el-table-column>
            <el-table-column label="Total" width="140" align="right">
                <template slot-scope="s"><b>{{ money(s.row.total, s.row.currency) }}</b></template>
            </el-table-column>
            <el-table-column label="Created" min-width="150">
                <template slot-scope="s">
                    <div>{{ formatDateTime(s.row.createdAt) }}</div>
                    <div class="rso-dim">{{ s.row.createdBy || '—' }}</div>
                </template>
            </el-table-column>
            <el-table-column label="Status" width="110" align="center">
                <template slot-scope="s">
                    <el-tag size="mini" effect="plain" :type="statusTag(s.row.status)">{{ s.row.status }}</el-tag>
                </template>
            </el-table-column>
            <!-- A pending order opens straight into the editor, so it has no
                 separate View; confirmed / cancelled ones are read-only. -->
            <el-table-column label="" width="200" align="center">
                <template slot-scope="s">
                    <el-button v-if="!isPending(s.row)" size="mini" type="text" icon="el-icon-view"
                        @click="openDetail(s.row)">View</el-button>
                    <el-button v-if="editable(s.row)" size="mini" type="text"
                        icon="el-icon-edit" @click="openEdit(s.row)">Edit</el-button>
                    <el-button v-if="isPending(s.row)" size="mini" type="text"
                        icon="el-icon-check" @click="confirmOrder(s.row)">Confirm</el-button>
                </template>
            </el-table-column>
        </el-table>

        <div class="rso-pager">
            <el-pagination background layout="total, sizes, prev, pager, next"
                :total="total" :page-size="query.pageSize" :page-sizes="[25, 50, 100]"
                :current-page="query.page" @current-change="onPage" @size-change="onSize" />
        </div>

        <!-- ── Create / Edit ──────────────────────────────────────── -->
        <el-dialog :title="editing ? `Edit ${editing.orderNo}` : 'New Sales Order'"
            :visible.sync="createVisible" width="920px" :close-on-click-modal="false">
            <div class="rso-form">
                <div class="rso-row">
                    <div class="rso-field rso-grow">
                        <label>Customer</label>
                        <div class="rso-cust-line">
                            <el-select v-model="form.customerId" size="small" filterable class="rso-grow"
                                placeholder="Select a customer…">
                                <el-option v-for="c in customers" :key="c._id" :value="c._id"
                                    :label="c.name + (c.phone ? ' · ' + c.phone : '')" />
                            </el-select>
                            <el-button size="small" icon="el-icon-plus" @click="quickCustomerOpen = !quickCustomerOpen">New</el-button>
                        </div>
                    </div>
                    <div class="rso-field">
                        <label>Currency</label>
                        <el-select v-model="form.currency" size="small" style="width:100px">
                            <el-option v-for="c in ['AUD', 'CNY', 'HKD']" :key="c" :label="c" :value="c" />
                        </el-select>
                    </div>
                </div>

                <div v-if="quickCustomerOpen" class="rso-quick-cust">
                    <el-input v-model="quickCustomer.name" size="small" placeholder="Customer name *" class="qc-name" />
                    <el-input v-model="quickCustomer.phone" size="small" placeholder="Phone" class="qc-small" />
                    <el-input v-model="quickCustomer.email" size="small" placeholder="Email" class="qc-small" />
                    <el-button size="small" type="primary" plain :loading="quickCustomerSaving"
                        @click="saveQuickCustomer">Add</el-button>
                </div>

                <div class="rso-field">
                    <label>Add devices <span class="rso-dim">— search In&nbsp;Stock by IMEI / serial / model</span></label>
                    <el-input v-model="pickerSearch" size="small" clearable placeholder="Scan or type, then Enter…"
                        prefix-icon="el-icon-search" @keyup.enter.native="searchDevices" @clear="pickerResults = []">
                        <el-button slot="append" icon="el-icon-search" :loading="pickerLoading" @click="searchDevices" />
                    </el-input>
                    <div v-if="pickerResults.length" class="rso-picker">
                        <div v-for="d in pickerResults" :key="d._id" class="rso-pick-row">
                            <div class="rso-pick-info">
                                <b>{{ d.imei }}</b>
                                <span>{{ [d.model, d.storage, d.color, d.grade].filter(Boolean).join(' · ') || '—' }}</span>
                            </div>
                            <el-button size="mini" type="primary" plain icon="el-icon-plus"
                                :disabled="isPicked(d)" @click="addLine(d)">
                                {{ isPicked(d) ? 'Added' : 'Add' }}
                            </el-button>
                        </div>
                    </div>
                    <div v-else-if="pickerSearched && !pickerLoading" class="rso-dim rso-noresult">
                        No In Stock devices match.
                    </div>
                </div>

                <el-table v-if="form.lines.length" :data="form.lines" border size="mini" max-height="300"
                    :row-class-name="lineRowClass">
                    <el-table-column label="IMEI" min-width="150">
                        <template slot-scope="s">
                            <div><b>{{ s.row.imei }}</b></div>
                            <!-- A row scanned in but not yet in the register:
                                 created in stock when the order is saved. -->
                            <div v-if="s.row.bbChecking" class="rso-li-sub rso-dim">
                                <i class="el-icon-loading" /> checking Blackbelt…
                            </div>
                            <div v-else-if="s.row.isNew" :class="['rso-li-sub', s.row.bbFound ? 'rso-li-ok' : 'rso-li-warn']">
                                <i :class="s.row.bbFound ? 'el-icon-success' : 'el-icon-warning'" />
                                new — {{ s.row.bbFound ? 'Blackbelt found' : 'no Blackbelt report' }}
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column label="Device" min-width="300">
                        <template slot-scope="s">
                            <!-- With a Blackbelt report the identity is its
                                 answer — typing only remains for devices it
                                 doesn't know. -->
                            <div v-if="s.row.isNew && !s.row.bbFound && !s.row.bbChecking" class="rso-line-edit">
                                <el-input :value="s.row.model" size="mini" placeholder="Model *" class="le-model"
                                    @input="v => s.row.model = v.toUpperCase()" />
                                <el-input :value="s.row.color" size="mini" placeholder="Colour" class="le-small"
                                    @input="v => s.row.color = v.toUpperCase()" />
                                <el-select v-model="s.row.storage" size="mini" clearable filterable allow-create
                                    default-first-option placeholder="Storage" class="le-small">
                                    <el-option v-for="o in storageOptions" :key="o" :label="o" :value="o" />
                                </el-select>
                            </div>
                            <template v-else>
                                {{ [s.row.model, s.row.storage, s.row.color].filter(Boolean).join(' · ') || '—' }}
                            </template>
                        </template>
                    </el-table-column>
                    <el-table-column label="Grade" width="95" align="center">
                        <template slot-scope="s">
                            <el-select v-if="s.row.isNew" v-model="s.row.grade" size="mini" clearable placeholder="—"
                                class="le-grade">
                                <el-option v-for="g in gradeOptions" :key="g" :label="g" :value="g" />
                            </el-select>
                            <template v-else>{{ s.row.grade || '—' }}</template>
                        </template>
                    </el-table-column>
                    <!-- Cost comes off the register, not the order — an
                         order snapshot never stores it. A scanned-in device
                         has no cost yet, so its cell is the place to type
                         one; it lands on the register record at save. -->
                    <el-table-column label="Cost" width="110" align="right">
                        <template slot-scope="s">
                            <el-input-number v-if="s.row.isNew" v-model="s.row.costPrice" size="mini" :min="0"
                                :precision="2" :controls="false" class="le-cost" placeholder="Cost" />
                            <span v-else-if="s.row.costPrice != null">{{ money(s.row.costPrice, s.row.costCurrency) }}</span>
                            <span v-else class="rso-dim">—</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="Sale Price" width="150" align="center">
                        <template slot-scope="s">
                            <el-input-number v-model="s.row.price" size="mini" :min="0" :precision="2"
                                :controls="false" style="width:120px" />
                        </template>
                    </el-table-column>
                    <el-table-column label="" width="50" align="center">
                        <template slot-scope="s">
                            <el-button size="mini" type="text" icon="el-icon-close" class="rso-cancel"
                                @click="removeLine(s.$index)" />
                        </template>
                    </el-table-column>
                </el-table>
                <div v-if="form.lines.length" class="rso-totals">
                    <div class="rso-total-row">
                        <span>{{ form.lines.length }} device{{ form.lines.length === 1 ? '' : 's' }} · Sub Total</span>
                        <span>{{ money(formSubTotal, form.currency) }}</span>
                    </div>
                    <div class="rso-total-row">
                        <span>
                            <el-checkbox v-model="form.gst">GST (10%)</el-checkbox>
                        </span>
                        <span>{{ money(formGst, form.currency) }}</span>
                    </div>
                    <div class="rso-total-row rso-total-grand">
                        <span>Total</span>
                        <span>{{ money(formSubTotal + formGst, form.currency) }}</span>
                    </div>
                </div>

                <div class="rso-field">
                    <label>Notes</label>
                    <el-input v-model="form.notes" type="textarea" :rows="2" maxlength="1000" size="small" />
                </div>
            </div>
            <div slot="footer">
                <el-button size="small" @click="createVisible = false">Close</el-button>
                <el-button size="small" type="primary" :loading="creating" @click="save">
                    {{ editing ? 'Save Changes' : 'Create Order' }}
                </el-button>
            </div>
        </el-dialog>

        <!-- ── Detail ─────────────────────────────────────────────── -->
        <el-dialog :title="detail ? detail.orderNo : ''" :visible.sync="detailVisible" width="720px">
            <div v-if="detail" class="rso-detail">
                <div class="rso-detail-grid">
                    <div><label>Customer</label><div>{{ detail.customerName }}</div></div>
                    <div>
                        <label>Status</label>
                        <div>
                            <el-tag size="mini" effect="plain" :type="statusTag(detail.status)">{{ detail.status }}</el-tag>
                        </div>
                    </div>
                    <div><label>Created</label><div>{{ formatDateTime(detail.createdAt) }} · {{ detail.createdBy || '—' }}</div></div>
                    <div v-if="detail.confirmedAt">
                        <label>Confirmed</label>
                        <div>{{ formatDateTime(detail.confirmedAt) }} · {{ detail.confirmedBy || '—' }}</div>
                    </div>
                    <div v-if="detail.incomingBatchTitle">
                        <label>From Shipment</label>
                        <div>{{ detail.incomingBatchTitle }}</div>
                    </div>
                    <div v-if="detail.status === 'Cancelled'">
                        <label>Cancelled</label>
                        <div>{{ formatDateTime(detail.cancelledAt) }} · {{ detail.cancelledBy || '—' }}</div>
                    </div>
                </div>
                <el-table :data="detail.lines" border size="mini" max-height="320">
                    <el-table-column label="IMEI" min-width="150">
                        <template slot-scope="s">
                            <div><b>{{ s.row.imei }}</b></div>
                            <div class="rso-dim">{{ s.row.serialNumber || '' }}</div>
                        </template>
                    </el-table-column>
                    <el-table-column label="Device" min-width="200" show-overflow-tooltip>
                        <template slot-scope="s">
                            {{ [s.row.model, s.row.storage, s.row.color].filter(Boolean).join(' · ') || '—' }}
                        </template>
                    </el-table-column>
                    <el-table-column label="Grade" width="70" align="center">
                        <template slot-scope="s">{{ s.row.grade || '—' }}</template>
                    </el-table-column>
                    <el-table-column label="Battery" width="80" align="center">
                        <template slot-scope="s">{{ s.row.batteryHealth == null ? '—' : s.row.batteryHealth + '%' }}</template>
                    </el-table-column>
                    <el-table-column label="Price" width="110" align="right">
                        <template slot-scope="s">{{ s.row.price == null ? '—' : money(s.row.price, detail.currency) }}</template>
                    </el-table-column>
                    <!-- The record of a return (the action itself lives on
                         the Stock page, on the Sold device). -->
                    <el-table-column v-if="returnedCount" label="" width="95" align="center">
                        <template slot-scope="s">
                            <el-tooltip v-if="s.row.returned" placement="top"
                                :content="returnTitle(s.row)">
                                <el-tag size="mini" type="info" effect="plain">Returned</el-tag>
                            </el-tooltip>
                        </template>
                    </el-table-column>
                </el-table>
                <div v-if="returnedCount" class="rso-returned-note">
                    {{ returnedCount }} of {{ detail.lines.length }} device{{ detail.lines.length === 1 ? '' : 's' }}
                    returned — the order keeps its lines; the devices are back in stock.
                    Returns are made from the Stock page.
                </div>
                <div class="rso-totals">
                    <div class="rso-total-row">
                        <span>Sub Total</span>
                        <span>{{ money(orderSubTotal(detail), detail.currency) }}</span>
                    </div>
                    <div class="rso-total-row">
                        <span>GST{{ detail.gstRate ? ` (${Math.round(detail.gstRate * 100)}%)` : '' }}</span>
                        <span>{{ money(detail.gstAmount || 0, detail.currency) }}</span>
                    </div>
                    <div class="rso-total-row rso-total-grand">
                        <span>Total</span>
                        <span>{{ money(detail.total, detail.currency) }}</span>
                    </div>
                </div>
                <!-- The remark stays editable after confirmation — it's
                     commentary, not part of the sale. -->
                <div v-if="detail.status !== 'Cancelled'" class="rso-note-edit">
                    <div class="rso-note-head">
                        <label>Remark</label>
                        <el-button v-if="noteDirty" size="mini" type="primary" plain
                            :loading="savingNote" @click="saveNote">Save Remark</el-button>
                    </div>
                    <el-input v-model="noteDraft" type="textarea" :rows="2" maxlength="1000"
                        size="small" placeholder="Add a remark…" />
                </div>
                <div v-else-if="detail.notes" class="rso-notes">{{ detail.notes }}</div>
            </div>
            <div slot="footer">
                <el-button v-if="detail && detail.status !== 'Cancelled'" size="small"
                    icon="el-icon-refresh" :loading="refreshingLines"
                    title="Re-read model / colour / storage from the device register"
                    @click="refreshLines">Refresh Device Details</el-button>
                <el-button v-if="detail" size="small" icon="el-icon-document"
                    @click="previewInvoice(detail)">Invoice</el-button>
                <el-button v-if="detail && editable(detail)" size="small" icon="el-icon-edit"
                    @click="openEdit(detail)">Edit</el-button>
                <el-button v-if="detail && isPending(detail)" size="small" type="success" plain
                    icon="el-icon-check" @click="confirmOrder(detail)">Confirm</el-button>
                <el-button size="small" @click="detailVisible = false">Close</el-button>
            </div>
        </el-dialog>

        <!-- ── Invoice preview ────────────────────────────────────── -->
        <el-dialog :visible.sync="invoiceVisible" width="780px" top="4vh" append-to-body
            custom-class="rso-invoice-dialog" @closed="cleanupInvoice">
            <div slot="title" class="rso-invoice-title">
                <i class="el-icon-document" /> {{ invoiceNumber }}
            </div>
            <iframe v-if="invoiceUrl" ref="invoiceFrame" :src="invoiceUrl" class="rso-invoice-frame" />
            <span slot="footer">
                <el-button size="small" @click="invoiceVisible = false">Close</el-button>
                <el-button size="small" icon="el-icon-printer" @click="printInvoice">Print</el-button>
                <el-button type="primary" size="small" icon="el-icon-download"
                    @click="downloadInvoice">Download</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import {
    getRefurbSalesOrders, createRefurbSalesOrder, updateRefurbSalesOrder,
    confirmRefurbSalesOrder, updateRefurbSalesOrderNotes, refreshRefurbSalesOrderLines,
    getRefurbCustomers, createRefurbCustomer, getRefurbDevices,
    lookupRefurbDevice, createRefurbDevice
} from '@/api/refurbished'
import { buildRefurbSalesOrderPdf, salesOrderPdfFileName } from '@/utils/refurbSalesOrderPdf'

// Australian GST. Line prices are entered ex-GST and GST is added on top;
// the rate actually used is stored on each order by the server.
const GST_RATE = 0.1
// Mirrors the Stock page's pickers for the quick-add path.
const GRADES = ['A++', 'A+', 'A', 'B+', 'B', 'C+', 'C']
const STORAGES = ['16GB', '32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB']
const CODE_RE = /^[A-Z0-9]{10,20}$/

export default {
    name: 'RefurbSalesOrders',
    data() {
        return {
            loading: false,
            rows: [],
            total: 0,
            query: { search: '', status: '', page: 1, pageSize: 25 },

            createVisible: false,
            creating: false,
            // The order being edited, or null when creating a new one.
            editing: null,
            // Lines taken off during this edit session. They're still Sold in
            // the database until save, so the picker can't find them — keep
            // them here so an accidental removal can be undone.
            detached: [],
            // Line prices are ex-GST; GST is added on top at 10%.
            form: { customerId: '', currency: 'AUD', notes: '', gst: true, lines: [] },
            customers: [],
            quickCustomerOpen: false,
            quickCustomer: { name: '', phone: '', email: '' },
            quickCustomerSaving: false,
            pickerSearch: '',
            pickerResults: [],
            pickerLoading: false,
            pickerSearched: false,
            gradeOptions: GRADES,
            storageOptions: STORAGES,

            detailVisible: false,
            detail: null,
            // Remark editing from the detail dialog (allowed once confirmed).
            noteDraft: '',
            savingNote: false,
            refreshingLines: false,

            // Invoice preview (jsPDF blob in an iframe — print / download
            // from the footer, same pattern as the Blackbelt invoices page).
            invoiceVisible: false,
            invoiceUrl: '',
            invoiceDoc: null,
            invoiceNumber: ''
        }
    },
    computed: {
        // How many of the open order's lines were returned — drives the
        // Returned column and the note under the table.
        returnedCount() {
            return ((this.detail && this.detail.lines) || []).filter(l => l.returned).length
        },
        formSubTotal() {
            return Math.round(this.form.lines.reduce((s, l) => s + (Number(l.price) || 0), 0) * 100) / 100
        },
        formGst() {
            return this.form.gst ? Math.round(this.formSubTotal * GST_RATE * 100) / 100 : 0
        },
        noteDirty() {
            return !!this.detail && this.noteDraft !== (this.detail.notes || '')
        }
    },
    created() {
        this.load()
        // Landed here from the Stock page's Bulk Action.
        if (this.$route.query.create) {
            this.$router.replace({ query: {} })
            this.openCreate()
        }
    },
    methods: {
        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || fallback
        },
        money(v, cur) {
            return `${cur || 'AUD'} ${this.amount(v)}`
        },
        // Bare 2dp amount — the row's currency is stated once, on the Total.
        amount(v) {
            return (Number(v) || 0).toFixed(2)
        },
        formatDateTime(v) {
            if (!v) return '—'
            const d = new Date(v)
            if (isNaN(d.getTime())) return '—'
            const p = x => String(x).padStart(2, '0')
            return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
        },
        async load() {
            this.loading = true
            try {
                const r = await getRefurbSalesOrders(this.query)
                this.rows = r.orders || []
                this.total = r.total || 0
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load sales orders'))
            } finally {
                this.loading = false
            }
        },
        reload() { this.query.page = 1; this.load() },
        onPage(p) { this.query.page = p; this.load() },
        onSize(s) { this.query.pageSize = s; this.reload() },

        // ── create ──────────────────────────────────────────────────
        // Orders raised before GST was recorded have no subTotal — their
        // stored total was the ex-GST sum.
        orderSubTotal(o) {
            return o.subTotal == null ? o.total : o.subTotal
        },
        // Only a pending order can be confirmed. Editing also reaches
        // Confirmed orders — at the price of reopening them.
        isPending(o) {
            return !!o && o.status === 'Pending'
        },
        editable(o) {
            return !!o && o.status !== 'Cancelled'
        },
        statusTag(status) {
            if (status === 'Confirmed') return 'success'
            if (status === 'Cancelled') return 'info'
            return 'warning' // Pending
        },
        async confirmOrder(row) {
            try {
                await this.$confirm(
                    `Confirm ${row.orderNo}? It can't be edited afterwards.`,
                    'Confirm order',
                    { type: 'warning', confirmButtonText: 'Confirm', cancelButtonText: 'Not yet' }
                )
            } catch (e) { return }
            try {
                const r = await confirmRefurbSalesOrder(row._id)
                this.$message.success(`${row.orderNo} confirmed`)
                if (this.detail && this.detail._id === row._id) this.detail = r.order
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to confirm the order'))
            }
        },
        async openCreate() {
            this.editing = null
            this.form = { customerId: '', currency: 'AUD', notes: '', gst: true, lines: [] }
            this.openOrderDialog()
        },
        async openEdit(order) {
            if (!this.editable(order)) return
            // Editing a confirmed order reopens it — make sure that's
            // wanted before the form even opens.
            if (order.status === 'Confirmed') {
                try {
                    await this.$confirm(
                        `${order.orderNo} is confirmed. Editing reopens it — it goes back to Pending and must be confirmed again.`,
                        'Reopen this order?',
                        { type: 'warning', confirmButtonText: 'Edit anyway', cancelButtonText: 'Cancel' }
                    )
                } catch (e) { return }
            }
            this.editing = order
            this.form = {
                customerId: String(order.customerId),
                currency: order.currency || 'AUD',
                notes: order.notes || '',
                gst: !!order.gstRate,
                lines: (order.lines || []).filter(l => !l.returned).map(l => ({
                    deviceId: String(l.deviceId),
                    imei: l.imei,
                    model: l.model,
                    storage: l.storage,
                    color: l.color,
                    grade: l.grade,
                    // Filled from the register just below — the order's own
                    // snapshot never carries cost.
                    costPrice: null,
                    costCurrency: '',
                    price: l.price == null ? undefined : l.price
                }))
            }
            this.fillLineCosts()
            this.detailVisible = false
            this.openOrderDialog()
        },
        async openOrderDialog() {
            this.detached = []
            this.pickerSearch = ''
            this.pickerResults = []
            this.pickerSearched = false
            this.quickCustomerOpen = false
            this.quickCustomer = { name: '', phone: '', email: '' }
            this.createVisible = true
            try {
                const r = await getRefurbCustomers()
                this.customers = r.customers || []
            } catch (e) {
                this.customers = []
            }
        },
        async saveQuickCustomer() {
            const name = this.quickCustomer.name.trim()
            if (!name) { this.$message.warning('Customer name is required'); return }
            this.quickCustomerSaving = true
            try {
                const r = await createRefurbCustomer(this.quickCustomer)
                this.customers.push(r.customer)
                this.customers.sort((a, b) => String(a.name).localeCompare(String(b.name)))
                this.form.customerId = r.customer._id
                this.quickCustomerOpen = false
                this.quickCustomer = { name: '', phone: '', email: '' }
                this.$message.success(`Customer "${r.customer.name}" added`)
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to add the customer'))
            } finally {
                this.quickCustomerSaving = false
            }
        },
        async searchDevices() {
            const q = this.pickerSearch.trim()
            if (!q) { this.pickerResults = []; this.pickerSearched = false; return }
            this.pickerLoading = true
            try {
                const r = await getRefurbDevices({ search: q, status: 'In Stock', page: 1, pageSize: 20 })
                // Devices taken off this order during this session are still
                // Sold server-side, so offer them alongside the search hits.
                const ql = q.toLowerCase()
                const back = this.detached.filter(d =>
                    [d.imei, d.model, d.color, d.storage].some(v => String(v || '').toLowerCase().includes(ql))
                )
                this.pickerResults = [...back, ...(r.rows || [])]
                this.pickerSearched = true
                // A code-shaped scan with no hit joins the order straight
                // away as a new stock record: Blackbelt is asked in the
                // background and the details are edited on the line itself.
                if (!this.pickerResults.length) {
                    const code = q.replace(/[\s-]/g, '').toUpperCase()
                    if (CODE_RE.test(code)) {
                        this.addDraftLine(code)
                        this.pickerSearch = ''
                        this.pickerSearched = false
                    }
                }
                // A scan that matches exactly one device goes straight in.
                if (this.pickerResults.length === 1 && !this.isPicked(this.pickerResults[0])) {
                    this.addLine(this.pickerResults[0])
                    this.pickerSearch = ''
                    this.pickerResults = []
                    this.pickerSearched = false
                }
            } catch (e) {
                this.$message.error(this.msg(e, 'Search failed'))
            } finally {
                this.pickerLoading = false
            }
        },
        // ── returns ─────────────────────────────────────────────────
        returnTitle(line) {
            const bits = [this.formatDateTime(line.returnedAt)]
            if (line.returnedBy) bits.push(line.returnedBy)
            if (line.returnReason) bits.push(line.returnReason)
            if (line.returnNote) bits.push(line.returnNote)
            return bits.filter(Boolean).join(' · ')
        },
        // Cost lives on the register record, so an opened order re-reads it
        // for its lines in one ids= call. Best-effort: a failure just leaves
        // the column blank.
        async fillLineCosts() {
            const ids = this.form.lines.map(l => l.deviceId).filter(Boolean)
            if (!ids.length) return
            try {
                const r = await getRefurbDevices({ ids: ids.join(','), pageSize: 200 })
                const byId = new Map((r.rows || []).map(d => [String(d._id), d]))
                for (const l of this.form.lines) {
                    const d = byId.get(String(l.deviceId))
                    if (d) {
                        l.costPrice = d.costPrice == null ? null : d.costPrice
                        l.costCurrency = d.currency || ''
                    }
                }
            } catch (e) { /* cost column stays blank */ }
        },
        // A scanned code that isn't in the register joins the order as a
        // draft line: Blackbelt is asked immediately, the details are typed
        // on the line if it has no report, and the stock record is created
        // when the order is saved.
        async addDraftLine(code) {
            if (this.form.lines.some(l => String(l.imei).toUpperCase() === code)) {
                this.$message.warning(code + ' is already on the order')
                return
            }
            // Every field seeded now — Vue 2 can't track keys added later.
            const line = {
                deviceId: null,
                isNew: true,
                imei: code,
                model: '', color: '', storage: '', grade: '',
                costPrice: undefined,
                costCurrency: '',
                price: undefined,
                bbChecking: true,
                bbFound: false,
                bb: {}
            }
            this.form.lines.push(line)
            try {
                const r = await lookupRefurbDevice(code)
                if (r && r.alreadyInStock) {
                    // In the register but not In Stock — sold, or away at a
                    // repairer. A duplicate record must not be created.
                    const i = this.form.lines.indexOf(line)
                    if (i >= 0) this.form.lines.splice(i, 1)
                    this.$message.warning(code + ' is already in the register but not In Stock — check it on the Stock page.')
                    return
                }
                const d = (r && r.device) || {}
                line.model = d.model || ''
                line.color = d.color || ''
                line.storage = d.storage || ''
                // Passed through to the create so the register record comes
                // out the same as one added from the Stock page.
                line.bb = {
                    brand: d.brand || '',
                    serialNumber: d.serialNumber || '',
                    batteryHealth: d.batteryHealth == null ? null : d.batteryHealth,
                    batteryCycleCount: d.batteryCycleCount == null ? null : d.batteryCycleCount,
                    batteryCapacity: d.batteryCapacity || '',
                    aNumber: d.aNumber || '',
                    blackbeltChecked: (r && r.blackbeltChecked) === true,
                    blackbeltReportId: (r && r.blackbeltReportId) || '',
                    blackbeltStatus: (r && r.blackbeltStatus) || ''
                }
                line.bbFound = !!(r && r.found)
            } catch (e) {
                // Lookup failing is not fatal — the line stays editable.
            } finally {
                line.bbChecking = false
            }
        },
        // Draft rows get a warm wash so what's about to be created in the
        // register is visible at a glance.
        lineRowClass({ row }) {
            return row.isNew ? 'rso-row-new' : ''
        },
        isPicked(d) {
            return this.form.lines.some(l => String(l.deviceId) === String(d._id))
        },
        addLine(d) {
            if (this.isPicked(d)) return
            // Re-adding one that was removed in this session restores its price.
            const wasIdx = this.detached.findIndex(x => String(x._id) === String(d._id))
            const prev = wasIdx >= 0 ? this.detached.splice(wasIdx, 1)[0] : null
            this.form.lines.push({
                deviceId: String(d._id),
                imei: d.imei,
                model: d.model,
                storage: d.storage,
                color: d.color,
                grade: d.grade,
                costPrice: d.costPrice == null ? null : d.costPrice,
                costCurrency: d.currency || '',
                price: prev ? prev.price : undefined
            })
        },
        removeLine(index) {
            const [line] = this.form.lines.splice(index, 1)
            // Only lines that were already on the saved order need stashing —
            // a freshly added one is In Stock again the moment it's dropped.
            if (line && this.editing && (this.editing.lines || []).some(l => String(l.deviceId) === String(line.deviceId))) {
                this.detached.push({ ...line, _id: line.deviceId })
            }
        },
        async save() {
            if (!this.form.customerId) { this.$message.warning('Select a customer'); return }
            if (!this.form.lines.length) { this.$message.warning('Add at least one device'); return }
            const stillChecking = this.form.lines.find(l => l.bbChecking)
            if (stillChecking) { this.$message.warning(`Still checking ${stillChecking.imei} against Blackbelt — one moment`); return }
            const drafts = this.form.lines.filter(l => l.isNew && !l.deviceId)
            for (const l of drafts) {
                if (!String(l.model || '').trim()) {
                    this.$message.warning(`Enter a model for ${l.imei}`)
                    return
                }
            }
            const payload = {
                customerId: this.form.customerId,
                currency: this.form.currency,
                notes: this.form.notes,
                gstRate: this.form.gst ? GST_RATE : 0,
                lines: this.form.lines.map(l => ({ deviceId: l.deviceId, price: l.price }))
            }
            this.creating = true
            try {
                // Scanned-in devices go into the register first, so the
                // order only ever references real stock records. A line
                // that gets its id keeps it — if a later step fails, the
                // retry doesn't create the device twice.
                for (const l of drafts) {
                    const r = await createRefurbDevice({
                        imei: l.imei,
                        model: l.model,
                        color: l.color,
                        storage: l.storage,
                        grade: l.grade,
                        costPrice: l.costPrice,
                        currency: this.form.currency,
                        ...l.bb
                    })
                    if (!r || r.success === false) throw new Error((r && r.message) || `Could not add ${l.imei} to stock`)
                    l.deviceId = String(r.id)
                }
                // Rebuilt after the creates so every draft line carries its
                // new register id.
                payload.lines = this.form.lines.map(l => ({ deviceId: l.deviceId, price: l.price }))
                if (this.editing) {
                    const r = await updateRefurbSalesOrder(this.editing._id, payload)
                    this.$message.success(`${r.order.orderNo} updated`)
                    if (this.detail && this.detail._id === r.order._id) this.detail = r.order
                } else {
                    const r = await createRefurbSalesOrder(payload)
                    this.$message.success(`${r.order.orderNo} created`)
                }
                this.createVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.editing ? 'Failed to update the order' : 'Failed to create the sales order'))
            } finally {
                this.creating = false
            }
        },

        // ── invoice ─────────────────────────────────────────────────
        previewInvoice(order) {
            try {
                const doc = buildRefurbSalesOrderPdf(order)
                this.invoiceDoc = doc
                this.invoiceNumber = order.orderNo || 'Sales Order'
                // #toolbar=0 hides the browser viewer chrome — the footer
                // buttons cover print and download.
                this.invoiceUrl = doc.output('bloburl') + '#toolbar=0'
                this.invoiceVisible = true
            } catch (e) {
                console.error('Sales order invoice PDF failed:', e)
                this.$message.error('Could not build the invoice PDF.')
            }
        },
        downloadInvoice() {
            if (this.invoiceDoc) this.invoiceDoc.save(salesOrderPdfFileName({ orderNo: this.invoiceNumber }))
        },
        printInvoice() {
            const frame = this.$refs.invoiceFrame
            try {
                frame.contentWindow.focus()
                frame.contentWindow.print()
            } catch (e) {
                // Cross-origin / viewer quirks — fall back to a tab that
                // opens the print dialog itself.
                if (this.invoiceDoc) {
                    this.invoiceDoc.autoPrint()
                    window.open(this.invoiceDoc.output('bloburl'), '_blank')
                }
            }
        },
        cleanupInvoice() {
            if (this.invoiceUrl) {
                try { URL.revokeObjectURL(this.invoiceUrl.split('#')[0]) } catch (e) { /* ignore */ }
            }
            this.invoiceUrl = ''
            this.invoiceDoc = null
            this.invoiceNumber = ''
        },
        // ── detail / cancel ─────────────────────────────────────────
        openDetail(row) {
            this.detail = row
            this.noteDraft = row.notes || ''
            this.detailVisible = true
        },
        // Pull corrected device details (model / colour / storage …) onto the
        // order's lines — an order carries a snapshot from when it was
        // raised, so Stock edits made afterwards don't reach it by themselves.
        async refreshLines() {
            if (!this.detail || this.refreshingLines) return
            this.refreshingLines = true
            try {
                const r = await refreshRefurbSalesOrderLines(this.detail._id)
                this.detail = r.order
                if (r.updated) this.$message.success(`${r.updated} line(s) updated from the device register`)
                else this.$message.info('Already up to date')
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to refresh the device details'))
            } finally {
                this.refreshingLines = false
            }
        },
        async saveNote() {
            if (!this.detail || !this.noteDirty) return
            this.savingNote = true
            try {
                const r = await updateRefurbSalesOrderNotes(this.detail._id, this.noteDraft)
                this.detail = r.order
                this.noteDraft = r.order.notes || ''
                this.$message.success('Remark saved')
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to save the remark'))
            } finally {
                this.savingNote = false
            }
        },
    }
}
</script>

<style lang="scss" scoped>
.rso-filters {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;

    .f-search { width: 280px; }
    .f-sel { width: 130px; }
    .rso-spacer { flex: 1; }
}
.rso-link { color: #409eff; cursor: pointer; font-weight: 600; }
.rso-dim { color: #909399; font-size: 12px; }
.rso-cancel { color: #f56c6c; }
.rso-pager { margin-top: 12px; text-align: right; }

.rso-form {
    display: flex;
    flex-direction: column;
    gap: 14px;

    .rso-row { display: flex; gap: 14px; align-items: flex-end; }
    .rso-grow { flex: 1; }
    .rso-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        label { font-size: 12px; font-weight: 600; color: #606266; }
    }
    .rso-cust-line { display: flex; gap: 8px; }
}
.rso-quick-cust {
    display: flex;
    gap: 8px;
    padding: 10px;
    background: #f8f9fb;
    border: 1px dashed #dcdfe6;
    border-radius: 6px;

    .qc-name { flex: 1.4; }
    .qc-small { flex: 1; }
}
.rso-picker {
    margin-top: 8px;
    border: 1px solid #ebeef5;
    border-radius: 6px;
    max-height: 180px;
    overflow: auto;
}
.rso-pick-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 7px 10px;

    + .rso-pick-row { border-top: 1px solid #f2f4f7; }

    .rso-pick-info {
        display: flex;
        flex-direction: column;
        min-width: 0;
        span { font-size: 12px; color: #909399; }
    }
}
.rso-line-edit { display: flex; gap: 6px; }
.le-model { flex: 1; min-width: 120px; }
.le-small { width: 100px; }
.le-grade { width: 100%; }
.le-cost { width: 74px; }
.rso-li-sub { font-size: 11px; line-height: 1.4; margin-top: 1px; }
.rso-returned-note { font-size: 12px; color: #909399; margin-top: 6px; }
.rso-li-ok { color: #67c23a; }
.rso-li-warn { color: #e6a23c; }
// Row wash for lines that will create a register record on save. Element
// paints cell backgrounds per <td>, so the override lands there.
::v-deep .el-table .rso-row-new > td { background: #fdf9ee; }
::v-deep .el-table .rso-row-new:hover > td { background: #faf3e0; }
.rso-noresult { padding: 8px 2px; }
.rso-totals {
    margin-left: auto;
    width: 280px;
    font-size: 13px;
    color: #606266;
}
.rso-total-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    padding: 3px 0;
}
.rso-total-grand {
    border-top: 1px solid #ebeef5;
    margin-top: 4px;
    padding-top: 6px;
    font-size: 15px;
    font-weight: 700;
    color: #303133;
}
.rso-detail {
    display: flex;
    flex-direction: column;
    gap: 14px;
}
.rso-detail-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px 20px;

    label { font-size: 11px; font-weight: 600; color: #909399; text-transform: uppercase; letter-spacing: 0.04em; }
}
.rso-note-edit {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.rso-note-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 28px;

    label { font-size: 11px; font-weight: 600; color: #909399; text-transform: uppercase; letter-spacing: 0.04em; }
}
.rso-invoice-title { font-size: 14px; font-weight: 600; }
.rso-invoice-frame {
    width: 100%;
    height: 72vh;
    border: 1px solid #ebeef5;
    border-radius: 4px;
    display: block;
}
.rso-notes {
    padding: 10px;
    background: #f8f9fb;
    border-radius: 6px;
    white-space: pre-wrap;
    font-size: 13px;
}
</style>
