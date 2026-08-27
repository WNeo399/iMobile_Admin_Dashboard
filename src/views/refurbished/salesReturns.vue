<template>
    <div class="sr-page app-container">
        <div class="sr-filters">
            <el-input v-model="query.search" size="small" clearable class="f-search"
                placeholder="Search return no / customer / IMEI / order…" prefix-icon="el-icon-search"
                @keyup.enter.native="reload" @clear="reload" />
            <span class="sr-spacer" />
            <el-button size="small" type="primary" plain icon="el-icon-plus" @click="openCreate">New Return</el-button>
            <el-button size="small" icon="el-icon-refresh" @click="load">Refresh</el-button>
            <el-button size="small" type="primary" icon="el-icon-search" @click="reload">Search</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini"
            empty-text="No sales returns yet — raise one when a customer sends devices back.">
            <el-table-column label="Return No" width="120">
                <template slot-scope="s">
                    <el-button type="text" class="sr-link" @click="openDetail(s.row)">{{ s.row.returnNo }}</el-button>
                </template>
            </el-table-column>
            <el-table-column label="Customer" min-width="180" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.customerName }}</template>
            </el-table-column>
            <el-table-column label="Devices" width="90" align="center">
                <template slot-scope="s">{{ (s.row.lines || []).length }}</template>
            </el-table-column>
            <el-table-column label="Orders" min-width="150" show-overflow-tooltip>
                <template slot-scope="s">{{ orderList(s.row) }}</template>
            </el-table-column>
            <el-table-column label="Returned To" width="140" align="center">
                <template slot-scope="s">
                    <el-tag size="mini" effect="plain"
                        :type="s.row.location === 'Assigned To Exyon' ? 'warning' : 'success'">
                        {{ s.row.location || 'iMobile' }}
                    </el-tag>
                </template>
            </el-table-column>
            <el-table-column label="Sale Value" width="130" align="right">
                <template slot-scope="s">{{ money(s.row.total, s.row.currency) }}</template>
            </el-table-column>
            <el-table-column label="Created" width="160">
                <template slot-scope="s">
                    <div>{{ formatDateTime(s.row.createdAt) }}</div>
                    <div v-if="s.row.createdBy" class="sr-sub">{{ s.row.createdBy }}</div>
                </template>
            </el-table-column>
            <el-table-column label="" width="80" align="center">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-view" @click="openDetail(s.row)">View</el-button>
                </template>
            </el-table-column>
        </el-table>

        <div class="sr-pager">
            <el-pagination background layout="total, sizes, prev, pager, next"
                :total="total" :page-size="query.pageSize" :page-sizes="[25, 50, 100]"
                :current-page="query.page" @current-change="onPage" @size-change="onSize" />
        </div>

        <!-- ── Create ───────────────────────────────────────────────── -->
        <el-dialog title="New Sales Return" :visible.sync="createVisible" width="860px" top="6vh"
            :close-on-click-modal="false" @closed="onCreateClosed">
            <div class="sr-form">
                <!-- Either direction: scan the box and the customer follows,
                     or pick the customer and tick from what they hold. -->
                <div class="sr-field">
                    <label>
                        Scan a returned device
                        <span class="sr-dim">— the customer fills itself in; typing also filters the list below</span>
                    </label>
                    <el-input ref="scanInput" v-model="scanCode" size="small" clearable
                        placeholder="Scan or type IMEI / serial, then Enter…" prefix-icon="el-icon-full-screen"
                        :disabled="scanning" @keyup.enter.native="scan" />
                    <div v-if="scanMsg" :class="['sr-scan-msg', 'sr-scan-' + scanTone]">{{ scanMsg }}</div>
                </div>

                <div class="sr-row">
                    <div class="sr-field sr-grow">
                        <label>Customer *</label>
                        <el-select v-model="form.customerId" size="small" filterable class="sr-full"
                            placeholder="Select a customer…" @change="onCustomerChange">
                            <el-option v-for="c in customers" :key="c._id" :value="c._id"
                                :label="c.name + (c.phone ? ' · ' + c.phone : '')" />
                        </el-select>
                    </div>
                    <div class="sr-field">
                        <label>Return to</label>
                        <el-select v-model="form.location" size="small" class="sr-loc">
                            <el-option v-for="l in locations" :key="l" :label="l" :value="l" />
                        </el-select>
                    </div>
                </div>

                <!-- The picker only ever offers what this customer holds. -->
                <div v-if="form.customerId" class="sr-field">
                    <label>
                        Devices sold to this customer
                        <span class="sr-dim">— tick what came back</span>
                    </label>
                    <div v-if="picked.length || scanCode" class="sr-pick-bar">
                        <span v-if="scanCode" class="sr-dim">
                            Filtered by "{{ scanCode }}" — {{ visibleSold.length }} of {{ sold.length }}
                        </span>
                        <span class="sr-spacer" />
                        <span v-if="picked.length" class="sr-dim">{{ picked.length }} selected</span>
                        <el-button v-if="picked.length" size="mini" plain @click="picked = []">Clear</el-button>
                    </div>
                    <el-table v-loading="soldLoading" :data="visibleSold" border size="mini" max-height="340"
                        :row-key="r => String(r._id)" :row-class-name="rowClass"
                        :empty-text="soldEmptyText"
                        @row-click="toggleRow">
                        <el-table-column width="44" align="center">
                            <template slot-scope="s">
                                <el-checkbox class="sr-row-check" :value="isPicked(s.row)" />
                            </template>
                        </el-table-column>
                        <el-table-column label="IMEI" min-width="150">
                            <template slot-scope="s">
                                <div><b>{{ s.row.imei }}</b></div>
                                <div v-if="s.row.serialNumber" class="sr-sub">{{ s.row.serialNumber }}</div>
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
                        <el-table-column label="Order" width="110">
                            <template slot-scope="s">{{ s.row.orderNo || '—' }}</template>
                        </el-table-column>
                        <el-table-column label="Sold" width="105">
                            <template slot-scope="s">{{ shortDate(s.row.soldAt) }}</template>
                        </el-table-column>
                        <el-table-column label="Cost" width="105" align="right">
                            <template slot-scope="s">
                                {{ s.row.costPrice == null ? '—' : money(s.row.costPrice, s.row.costCurrency) }}
                            </template>
                        </el-table-column>
                        <el-table-column label="Price" width="110" align="right">
                            <template slot-scope="s">
                                {{ s.row.price == null ? '—' : money(s.row.price, s.row.currency) }}
                            </template>
                        </el-table-column>
                    </el-table>
                </div>
                <div v-else class="sr-dim sr-empty">Pick a customer to see the devices they hold.</div>

                <div class="sr-field">
                    <label>Notes</label>
                    <el-input v-model="form.notes" type="textarea" :rows="2" maxlength="1000" size="small"
                        placeholder="Optional — condition on arrival, courier, anything worth recording" />
                </div>
            </div>
            <span slot="footer">
                <span v-if="picked.length" class="sr-foot-note">
                    {{ picked.length }} device{{ picked.length === 1 ? '' : 's' }} · {{ money(pickedTotal, pickedCurrency) }}
                </span>
                <el-button size="small" @click="createVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" :loading="creating"
                    :disabled="!form.customerId || !picked.length"
                    @click="save">Create Return</el-button>
            </span>
        </el-dialog>

        <!-- ── Detail ───────────────────────────────────────────────── -->
        <el-dialog :title="detail ? detail.returnNo : ''" :visible.sync="detailVisible" width="760px">
            <div v-if="detail" class="sr-detail">
                <div class="sr-detail-grid">
                    <div><label>Customer</label><div>{{ detail.customerName }}</div></div>
                    <div v-if="detail.reason"><label>Reason</label><div>{{ detail.reason }}</div></div>
                    <div><label>Returned To</label><div>{{ detail.location || 'iMobile' }}</div></div>
                    <div>
                        <label>Created</label>
                        <div>{{ formatDateTime(detail.createdAt) }} · {{ detail.createdBy || '—' }}</div>
                    </div>
                </div>
                <el-table :data="detail.lines" border size="mini" max-height="340">
                    <el-table-column label="IMEI" min-width="150">
                        <template slot-scope="s"><b>{{ s.row.imei }}</b></template>
                    </el-table-column>
                    <el-table-column label="Device" min-width="200" show-overflow-tooltip>
                        <template slot-scope="s">
                            {{ [s.row.model, s.row.storage, s.row.color].filter(Boolean).join(' · ') || '—' }}
                        </template>
                    </el-table-column>
                    <el-table-column label="Grade" width="70" align="center">
                        <template slot-scope="s">{{ s.row.grade || '—' }}</template>
                    </el-table-column>
                    <el-table-column label="Order" width="110">
                        <template slot-scope="s">{{ s.row.orderNo || '—' }}</template>
                    </el-table-column>
                    <el-table-column label="Cost" width="110" align="right">
                        <template slot-scope="s">
                            {{ s.row.costPrice == null ? '—' : money(s.row.costPrice, s.row.costCurrency) }}
                        </template>
                    </el-table-column>
                    <el-table-column label="Price" width="120" align="right">
                        <template slot-scope="s">
                            {{ s.row.price == null ? '—' : money(s.row.price, s.row.currency) }}
                        </template>
                    </el-table-column>
                </el-table>
                <div class="sr-totals">
                    <span>{{ (detail.lines || []).length }} device{{ (detail.lines || []).length === 1 ? '' : 's' }} · sale value</span>
                    <b>{{ money(detail.total, detail.currency) }}</b>
                </div>
                <div v-if="detail.notes" class="sr-notes">{{ detail.notes }}</div>
                <div class="sr-dim sr-hint">
                    The devices are back In Stock at {{ detail.location || 'iMobile' }}. Each order keeps its
                    line, marked returned — totals and invoices are unchanged.
                </div>
            </div>
            <span slot="footer">
                <el-button size="small" icon="el-icon-download" @click="downloadXlsx">Excel</el-button>
                <el-button size="small" icon="el-icon-document" @click="previewPdf">PDF</el-button>
                <el-button size="small" @click="detailVisible = false">Close</el-button>
            </span>
        </el-dialog>

        <!-- ── PDF preview ──────────────────────────────────────────
             Shown before it leaves — print straight from here or save. -->
        <el-dialog :title="pdfTitle" :visible.sync="pdfVisible" width="70%" top="4vh" append-to-body
            @closed="cleanupPdf">
            <div class="sr-pdf-wrap">
                <iframe v-if="pdfUrl" ref="pdfFrame" :src="pdfUrl" class="sr-pdf-frame" title="Sales return" />
            </div>
            <span slot="footer">
                <el-button size="small" icon="el-icon-printer" @click="printPdf">Print</el-button>
                <el-button size="small" icon="el-icon-download" @click="downloadPdf">Download</el-button>
                <el-button size="small" @click="pdfVisible = false">Close</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import {
    getSalesReturns, getSalesReturn, createSalesReturn, getCustomerSoldDevices,
    lookupSoldDevice, getRefurbCustomers
} from '@/api/refurbished'
import { buildSalesReturnPdf, salesReturnPdfFileName } from '@/utils/salesReturnPdf'
import * as XLSX from 'xlsx-js-style'

// Mirrors the backend whitelist; the same shelves the receive dialog offers.
const LOCATIONS = ['iMobile', 'Assigned To Exyon']

export default {
    name: 'RefurbSalesReturns',
    data() {
        return {
            loading: false,
            rows: [],
            total: 0,
            query: { page: 1, pageSize: 25, search: '' },
            locations: LOCATIONS,

            createVisible: false,
            creating: false,
            customers: [],
            form: { customerId: '', notes: '', location: LOCATIONS[0] },
            // What the chosen customer currently holds, and the ticks.
            sold: [],
            soldLoading: false,
            picked: [],
            // Scan-first entry: the code decides the customer.
            scanCode: '',
            scanning: false,
            scanMsg: '',
            scanTone: 'ok',

            detailVisible: false,
            detail: null,

            // PDF preview — the doc is kept so Print and Download work off
            // the same build rather than re-rendering.
            pdfVisible: false,
            pdfUrl: '',
            pdfTitle: '',
            pdfDoc: null
        }
    },
    computed: {
        visibleSold() {
            const q = this.scanCode.trim().toLowerCase()
            const rows = q
                ? this.sold.filter(d =>
                    [d.imei, d.serialNumber, d.model, d.color, d.storage, d.orderNo]
                        .some(v => String(v || '').toLowerCase().includes(q)))
                : this.sold
            // Ticked rows float to the top, most recently ticked first — the
            // last thing scanned is always the first thing in view.
            const pos = d => this.picked.indexOf(String(d._id))
            const ticked = rows.filter(d => pos(d) >= 0).sort((a, b) => pos(a) - pos(b))
            const rest = rows.filter(d => pos(d) < 0)
            return [...ticked, ...rest]
        },
        // An empty table is either a customer with nothing out or a filter
        // that matched nothing — saying which is the difference between
        // "there's nothing to do" and "that code isn't theirs".
        soldEmptyText() {
            if (this.soldLoading) return 'Loading…'
            if (!this.sold.length) return 'This customer has no devices out — nothing to return.'
            return `No device here matches "${this.scanCode.trim()}" — it may belong to another customer.`
        },
        pickedRows() {
            return this.sold.filter(d => this.picked.includes(String(d._id)))
        },
        pickedTotal() {
            return this.pickedRows.reduce((s, d) => s + (Number(d.price) || 0), 0)
        },
        pickedCurrency() {
            return (this.pickedRows[0] && this.pickedRows[0].currency) || 'AUD'
        }
    },
    created() {
        this.load()
    },
    methods: {
        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || fallback
        },
        money(v, cur) {
            return `${cur || 'AUD'} ${(Number(v) || 0).toFixed(2)}`
        },
        formatDateTime(v) {
            if (!v) return '—'
            const d = new Date(v)
            if (isNaN(d.getTime())) return '—'
            const p = x => String(x).padStart(2, '0')
            return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
        },
        shortDate(v) {
            if (!v) return '—'
            const d = new Date(v)
            return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-AU')
        },
        orderList(row) {
            const nos = [...new Set((row.lines || []).map(l => l.orderNo).filter(Boolean))]
            return nos.join(', ') || '—'
        },
        async load() {
            this.loading = true
            try {
                const r = await getSalesReturns(this.query)
                this.rows = r.returns || []
                this.total = r.total || 0
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load sales returns'))
            } finally {
                this.loading = false
            }
        },
        reload() { this.query.page = 1; this.load() },
        onPage(p) { this.query.page = p; this.load() },
        onSize(s) { this.query.pageSize = s; this.reload() },

        // ── create ───────────────────────────────────────────────────
        async openCreate() {
            this.form = { customerId: '', notes: '', location: LOCATIONS[0] }
            this.sold = []
            this.picked = []
            this.scanCode = ''
            this.scanMsg = ''
            this.createVisible = true
            this.focusScan()
            try {
                const r = await getRefurbCustomers()
                this.customers = r.customers || []
            } catch (e) {
                this.customers = []
            }
        },
        onCreateClosed() {
            this.sold = []
            this.picked = []
        },
        // Changing the customer changes the whole device set, so the ticks
        // can't survive it.
        async onCustomerChange(id) {
            this.picked = []
            this.sold = []
            this.scanMsg = ''
            if (!id) return
            this.soldLoading = true
            try {
                const r = await getCustomerSoldDevices(id)
                this.sold = r.devices || []
                if (!this.sold.length) {
                    this.$message.info('This customer has no devices out on a confirmed order.')
                }
            } catch (e) {
                this.$message.error(this.msg(e, "Failed to load the customer's devices"))
            } finally {
                this.soldLoading = false
            }
        },
        focusScan() {
            this.$nextTick(() => {
                const el = this.$refs.scanInput
                if (el && el.focus) el.focus()
            })
        },
        say(tone, msg) {
            this.scanTone = tone
            this.scanMsg = msg
        },
        // The first scan sets the customer and loads their devices; later
        // scans just tick within that customer.
        async scan() {
            const raw = String(this.scanCode || '').trim()
            const code = raw.replace(/[\s-]/g, '').toUpperCase()
            if (!code) return
            // Enter on a partial word (someone narrowing the list by model)
            // isn't a scan — leave it filtering rather than reporting that
            // "IPHONE" isn't in the register.
            if (!/^[A-Z0-9]{6,20}$/.test(code)) {
                this.say('warn', `"${raw}" isn't a full IMEI or serial — the list is filtered by it instead`)
                return
            }
            this.scanCode = ''
            this.focusScan()

            // Already on the loaded list? Tick it without a round trip.
            const known = this.sold.find(d =>
                String(d.imei).toUpperCase() === code || String(d.serialNumber || '').toUpperCase() === code)
            if (known) {
                if (this.isPicked(known)) this.say('warn', code + ' is already ticked')
                else {
                    this.picked.unshift(String(known._id))
                    this.say('ok', code + ' added — ' + (known.model || 'device'))
                }
                return
            }

            this.scanning = true
            try {
                const r = await lookupSoldDevice(code)
                if (!r || r.found === false) {
                    this.say('error', (r && r.message) || code + ' could not be matched')
                    return
                }
                if (this.form.customerId && String(this.form.customerId) !== String(r.customerId)) {
                    // One return belongs to one customer. This is the scan
                    // that must not be shrugged off — the device is in the
                    // wrong pile — so it raises a warning that stays up
                    // until it's dismissed, not just a line that scrolls by.
                    const mine =
                        (this.customers.find(c => String(c._id) === String(this.form.customerId)) || {}).name ||
                        'the selected customer'
                    this.say('error', `${code} belongs to ${r.customerName} — not ${mine}`)
                    this.$notify.warning({
                        title: 'Wrong customer',
                        message:
                            `${code} (${r.device.model || 'device'}) was sold to ${r.customerName} ` +
                            `on ${r.device.orderNo}, but this return is for ${mine}. Set it aside — ` +
                            `it needs its own return.`,
                        duration: 0
                    })
                    return
                }
                if (!this.form.customerId) {
                    this.form.customerId = String(r.customerId)
                    await this.onCustomerChange(this.form.customerId)
                }
                const row = this.sold.find(d => String(d._id) === String(r.device._id))
                if (row) {
                    if (!this.isPicked(row)) this.picked.unshift(String(row._id))
                    this.say('ok', `${code} added — ${r.customerName} · ${row.model || 'device'}`)
                } else {
                    this.say('warn', code + ' was found but is no longer on this list — refresh and try again')
                }
            } catch (e) {
                this.say('error', this.msg(e, 'Lookup failed — try again'))
            } finally {
                this.scanning = false
                this.focusScan()
            }
        },
        isPicked(row) {
            return this.picked.includes(String(row._id))
        },
        rowClass({ row }) {
            return this.isPicked(row) ? 'sr-row-picked' : ''
        },
        toggleRow(row, column, event) {
            if (event && event.target && event.target.closest &&
                event.target.closest('.el-select, input:not(.el-checkbox__original), button, a')) return
            const id = String(row._id)
            const i = this.picked.indexOf(id)
            if (i >= 0) this.picked.splice(i, 1)
            else this.picked.unshift(id)
        },
        async save() {
            this.creating = true
            try {
                const r = await createSalesReturn({
                    customerId: this.form.customerId,
                    notes: this.form.notes,
                    location: this.form.location,
                    deviceIds: this.picked
                })
                this.$message.success(r.message || 'Sales return created')
                if ((r.skipped || []).length) {
                    this.$notify.warning({
                        title: 'Some devices were skipped',
                        message: r.skipped.map(s => `${s.imei}: ${s.reason}`).join('\n'),
                        duration: 0
                    })
                }
                this.createVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to create the sales return'))
            } finally {
                this.creating = false
            }
        },

        // ── downloads ────────────────────────────────────────────────
        previewPdf() {
            try {
                const doc = buildSalesReturnPdf({ salesReturn: this.detail })
                this.pdfDoc = doc
                this.pdfTitle = `${this.detail.returnNo} — ${this.detail.customerName}`
                // #toolbar=0 hides the browser viewer chrome; the footer
                // buttons cover print and download.
                this.pdfUrl = doc.output('bloburl') + '#toolbar=0'
                this.pdfVisible = true
            } catch (e) {
                console.error('Sales return PDF failed:', e)
                this.$message.error('Could not build the PDF.')
            }
        },
        downloadPdf() {
            if (this.pdfDoc) this.pdfDoc.save(salesReturnPdfFileName(this.detail))
        },
        printPdf() {
            const frame = this.$refs.pdfFrame
            try {
                frame.contentWindow.focus()
                frame.contentWindow.print()
            } catch (e) {
                // Cross-origin / viewer quirks — fall back to a tab that
                // opens the print dialog itself.
                if (this.pdfDoc) {
                    this.pdfDoc.autoPrint()
                    const w = window.open(this.pdfDoc.output('bloburl'))
                    if (!w) this.$message.warning('Pop-up blocked — use Download instead.')
                }
            }
        },
        cleanupPdf() {
            if (this.pdfUrl) {
                try { URL.revokeObjectURL(this.pdfUrl.split('#')[0]) } catch (e) { /* ignore */ }
            }
            this.pdfUrl = ''
            this.pdfDoc = null
        },
        downloadXlsx() {
            try {
                const d = this.detail
                const head = { font: { bold: true } }
                const rows = [
                    [{ v: d.returnNo, s: { font: { bold: true, sz: 14 } } }],
                    ['Customer', d.customerName || ''],
                    ['Returned To', d.location || 'iMobile'],
                    ['Created', this.formatDateTime(d.createdAt) + (d.createdBy ? ' · ' + d.createdBy : '')],
                    ['Notes', d.notes || ''],
                    [],
                    ['IMEI', 'Serial', 'Model', 'Colour', 'Storage', 'Grade', 'Order',
                        'Cost', 'Cost Currency', 'Price', 'Currency'].map(v => ({ v, s: head }))
                ]
                for (const l of d.lines || []) {
                    rows.push([
                        l.imei || '', l.serialNumber || '', l.model || '', l.color || '', l.storage || '',
                        l.grade || '', l.orderNo || '',
                        l.costPrice == null ? '' : Number(l.costPrice), l.costCurrency || '',
                        l.price == null ? '' : Number(l.price), l.currency || d.currency || 'AUD'
                    ])
                }
                const costCurrencies = [...new Set((d.lines || [])
                    .filter(l => l.costPrice != null)
                    .map(l => l.costCurrency || 'AUD'))]
                const costTotal = (d.lines || []).reduce((s, l) => s + (Number(l.costPrice) || 0), 0)
                rows.push([])
                rows.push([
                    { v: `${(d.lines || []).length} device(s)`, s: head },
                    '', '', '', '', '', '',
                    // Costs across mixed currencies can't be added up.
                    costCurrencies.length === 1 ? { v: costTotal, s: head } : '',
                    costCurrencies.length === 1 ? { v: costCurrencies[0], s: head } : '',
                    { v: Number(d.total) || 0, s: head },
                    { v: d.currency || 'AUD', s: head }
                ])
                const ws = XLSX.utils.aoa_to_sheet(rows)
                ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 10 },
                    { wch: 8 }, { wch: 12 }, { wch: 11 }, { wch: 13 }, { wch: 11 }, { wch: 9 }]
                const wb = XLSX.utils.book_new()
                XLSX.utils.book_append_sheet(wb, ws, d.returnNo)
                XLSX.writeFile(wb, `sales-return_${String(d.returnNo).replace(/[^\w.-]+/g, '_')}.xlsx`)
            } catch (e) {
                console.error('Sales return xlsx failed:', e)
                this.$message.error('Could not build the spreadsheet.')
            }
        },

        // ── detail ───────────────────────────────────────────────────
        async openDetail(row) {
            try {
                const r = await getSalesReturn(row._id)
                this.detail = r.salesReturn
                this.detailVisible = true
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load the return'))
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.sr-filters { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.f-search { width: 320px; }
.sr-spacer { flex: 1; }
.sr-link { font-weight: 600; padding: 0; }
.sr-sub { font-size: 11px; color: #909399; line-height: 1.3; }
.sr-dim { color: #909399; }
.sr-pager { margin-top: 12px; text-align: right; }
.sr-foot-note { font-size: 12px; color: #909399; margin-right: 10px; }

.sr-form { display: flex; flex-direction: column; gap: 14px; }
.sr-row { display: flex; gap: 14px; align-items: flex-end; }
.sr-grow { flex: 1; }
.sr-full { width: 100%; }
.sr-loc { width: 180px; }
.sr-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    label { font-size: 12px; font-weight: 600; color: #606266; }
}
.sr-scan-msg { font-size: 12px; margin-top: 6px; padding: 5px 10px; border-radius: 4px; }
.sr-scan-ok { background: #f0f9eb; color: #67c23a; }
.sr-scan-warn { background: #fdf6ec; color: #e6a23c; }
.sr-scan-error { background: #fef0f0; color: #f56c6c; }
.sr-pick-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.sr-row-check { pointer-events: none; }
.sr-empty { font-size: 13px; padding: 18px; text-align: center; border: 1px dashed #dcdfe6; border-radius: 6px; }
::v-deep .el-table__row { cursor: pointer; }
::v-deep .el-table .sr-row-picked > td { background: #f0f9eb; }
::v-deep .el-table .sr-row-picked:hover > td { background: #e7f5da; }

.sr-detail { display: flex; flex-direction: column; gap: 12px; }
.sr-detail-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px 16px;
    label { font-size: 11px; color: #909399; text-transform: uppercase; letter-spacing: .04em; }
    div > div { font-size: 13px; color: #303133; }
}
.sr-totals {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 13px; color: #606266; border-top: 1px solid #ebeef5; padding-top: 8px;
    b { font-size: 15px; color: #303133; }
}
.sr-notes {
    font-size: 12px; color: #606266; background: #f8f9fb;
    border: 1px solid #ebeef5; border-radius: 6px; padding: 8px 10px; white-space: pre-wrap;
}
.sr-hint { font-size: 12px; line-height: 1.5; }
.sr-pdf-wrap { height: 66vh; border: 1px solid #ebeef5; border-radius: 4px; background: #f5f7fa; }
.sr-pdf-frame { width: 100%; height: 100%; border: 0; }
</style>
