<template>
    <div class="ri-page app-container">
        <div class="ri-bar">
            <span class="ri-title">Incoming Stocks</span>
            <span class="ri-spacer" />
            <el-button size="small" type="primary" plain icon="el-icon-upload2" @click="openUpload">Upload List</el-button>
            <el-button size="small" icon="el-icon-refresh" @click="loadBatches">Refresh</el-button>
        </div>

        <el-table v-loading="loading" :data="batches" border size="mini"
            empty-text="No incoming batches yet — upload a supplier list to start.">
            <el-table-column label="Batch" min-width="200">
                <template slot-scope="s">
                    <el-button type="text" class="ri-link" @click="openBatch(s.row)">{{ s.row.title }}</el-button>
                </template>
            </el-table-column>
            <el-table-column label="Devices" width="90" align="center">
                <template slot-scope="s">{{ s.row.summary.total }}</template>
            </el-table-column>
            <el-table-column label="Received" width="110" align="center">
                <template slot-scope="s">
                    <span :class="s.row.summary.received === s.row.summary.total ? 'ri-ok' : ''">
                        {{ s.row.summary.received }} / {{ s.row.summary.total }}
                    </span>
                </template>
            </el-table-column>
            <el-table-column label="Stock Source" width="120" align="center">
                <template slot-scope="s">{{ s.row.stockSource || '—' }}</template>
            </el-table-column>
            <el-table-column label="Currency" width="90" align="center">
                <template slot-scope="s">{{ s.row.currency }}</template>
            </el-table-column>
            <el-table-column label="Uploaded" width="160">
                <template slot-scope="s">
                    <div>{{ shortDate(s.row.createdAt) }}</div>
                    <div v-if="s.row.createdBy" class="ri-sub">{{ s.row.createdBy }}</div>
                </template>
            </el-table-column>
            <el-table-column label="" width="150" align="center">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-view" @click="openBatch(s.row)">Receive Stock</el-button>
                    <el-button size="mini" type="text" icon="el-icon-delete" class="ri-del" @click="removeBatch(s.row)" />
                </template>
            </el-table-column>
        </el-table>

        <!-- ── Upload a supplier list ───────────────────────────────── -->
        <el-dialog title="Upload Incoming List" :visible.sync="uploadVisible" width="720px">
            <div class="ri-up">
                <el-form label-width="110px" size="small" class="ri-up-form" @submit.native.prevent>
                    <el-form-item label="File">
                        <input ref="uploadFile" type="file" accept=".xlsx,.xls,.csv" class="ri-file"
                            @change="onFile" />
                        <div class="ri-hint">
                            Columns are matched by name: model, color, capacity, IMEI (or serial), battery, price, grade.
                        </div>
                    </el-form-item>
                    <el-form-item label="Title">
                        <el-input v-model="upload.title" placeholder="e.g. AU260804" maxlength="120" />
                    </el-form-item>
                    <el-form-item label="Stock Source">
                        <el-select v-model="upload.stockSource" placeholder="Select a stock source" style="width: 100%">
                            <el-option v-for="s in stockSources" :key="s" :label="s" :value="s" />
                        </el-select>
                        <div class="ri-hint">Fixed for the batch — receiving won't change it.</div>
                    </el-form-item>
                    <el-form-item label="Currency">
                        <el-radio-group v-model="upload.currency" size="small">
                            <el-radio-button v-for="c in currencies" :key="c" :label="c" />
                        </el-radio-group>
                        <span class="ri-hint ri-inline">Applies to the price column for the whole batch.</span>
                    </el-form-item>
                </el-form>

                <div v-if="parsed.rows.length || parsed.bad.length" class="ri-preview">
                    <div class="ri-preview-head">
                        <b>{{ parsed.rows.length }}</b> device{{ parsed.rows.length === 1 ? '' : 's' }} ready
                        <span v-if="parsed.bad.length" class="ri-warn">· {{ parsed.bad.length }} row(s) will be skipped</span>
                    </div>
                    <el-table :data="parsed.rows.slice(0, 8)" size="mini" border>
                        <el-table-column prop="code" label="IMEI / Serial" min-width="150" />
                        <el-table-column prop="model" label="Model" min-width="110" />
                        <el-table-column prop="color" label="Colour" min-width="100" />
                        <el-table-column prop="capacity" label="Capacity" width="90" align="center" />
                        <el-table-column label="Battery" width="80" align="center">
                            <template slot-scope="s">{{ s.row.battery == null ? '—' : s.row.battery + '%' }}</template>
                        </el-table-column>
                        <el-table-column label="Price" width="100" align="right">
                            <template slot-scope="s">{{ money(s.row.price, upload.currency) }}</template>
                        </el-table-column>
                        <el-table-column label="Grade" width="70" align="center">
                            <template slot-scope="s">{{ s.row.grade || '—' }}</template>
                        </el-table-column>
                    </el-table>
                    <div v-if="parsed.rows.length > 8" class="ri-hint">…and {{ parsed.rows.length - 8 }} more.</div>
                    <div v-if="parsed.bad.length" class="ri-bad">
                        <div v-for="b in parsed.bad.slice(0, 5)" :key="b.row">
                            Row {{ b.row }}: {{ b.reason }}<template v-if="b.code"> ({{ b.code }})</template>
                        </div>
                        <div v-if="parsed.bad.length > 5">…and {{ parsed.bad.length - 5 }} more.</div>
                    </div>
                </div>
            </div>
            <span slot="footer">
                <el-button size="small" @click="uploadVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" :loading="uploading"
                    :disabled="!parsed.rows.length || !upload.title" @click="submitUpload">
                    Create Batch
                </el-button>
            </span>
        </el-dialog>

        <!-- ── Stock take ───────────────────────────────────────────── -->
        <el-dialog :title="batch ? batch.title : ''" :visible.sync="takeVisible" width="1080px"
            top="4vh" :before-close="onTakeBeforeClose" @closed="onTakeClosed">
            <div v-if="batch" class="ri-take">
                <div class="ri-stats">
                    <div class="ri-stat"><span>Stock Source</span><b>{{ batch.stockSource || '—' }}</b></div>
                    <div class="ri-stat"><span>Expected</span><b>{{ batch.summary.listed }}</b></div>
                    <div class="ri-stat"><span>Scanned</span><b class="ri-ok">{{ checkedCodes.length }}</b></div>
                    <div class="ri-stat"><span>Remaining</span><b>{{ remaining }}</b></div>
                    <div class="ri-stat"><span>In Blackbelt</span><b>{{ batch.summary.inBlackbelt }}</b></div>
                    <div class="ri-stat"><span>Added to Stock</span><b>{{ batch.summary.committed }}</b></div>
                    <div v-if="unlistedCount" class="ri-stat">
                        <span>Not on list</span><b class="ri-warn">{{ unlistedCount }}</b>
                    </div>
                </div>

                <el-alert v-if="sweepRunning" type="info" :closable="false" show-icon class="ri-alert">
                    Checking Blackbelt — {{ batch.summary.total - batch.summary.blackbeltPending }} of
                    {{ batch.summary.total }} done. You can keep scanning.
                </el-alert>
                <el-alert v-else-if="batch.summary.blackbeltPending" type="info" :closable="false" show-icon
                    class="ri-alert">
                    {{ batch.summary.blackbeltPending }} device(s) haven't been checked against Blackbelt —
                    select rows and use the Check Blackbelt button below.
                </el-alert>

                <div class="ri-scan">
                    <el-input ref="scanInput" v-model="scanCode" size="small" class="ri-scan-input"
                        placeholder="Scan IMEI or serial…" prefix-icon="el-icon-full-screen" clearable
                        @keyup.enter.native="doScan" />
                    <!-- For shipments trusted without a unit-by-unit scan. -->
                    <el-button size="small" plain icon="el-icon-finished" :disabled="!selectableCount"
                        @click="selectAllRemaining">Select All Remaining<template v-if="selectableCount"> ({{ selectableCount }})</template></el-button>
                    <el-button v-if="checkedCodes.length" size="small" plain @click="clearSelection">Clear</el-button>
                    <span class="ri-spacer" />
                    <el-radio-group v-model="lineFilter" size="small">
                        <el-radio-button label="all">All</el-radio-button>
                        <el-radio-button label="remaining">Remaining</el-radio-button>
                        <el-radio-button label="scanned">Scanned</el-radio-button>
                        <el-radio-button label="received">Received</el-radio-button>
                    </el-radio-group>
                </div>
                <div v-if="scanMessage" :class="['ri-scan-msg', 'ri-msg-' + scanTone]">{{ scanMessage }}</div>

                <el-table :data="visibleLines" border size="mini" height="46vh"
                    :row-key="r => r.code" :row-class-name="rowClass" :span-method="lineSpan"
                    empty-text="Nothing to show for this filter." @row-click="onRowClick">
                    <!-- Ticked by scanning or by clicking anywhere on the row;
                         persisted rows are locked. The checkbox is display
                         only — the row click is the single toggle path, which
                         is what keeps its state honest when rows reorder. -->
                    <el-table-column width="44" align="center">
                        <template slot-scope="s">
                            <!-- A group header spans the whole row (lineSpan
                                 collapses the other cells); clicking it folds
                                 the group. -->
                            <div v-if="s.row.__group" class="ri-group">
                                <i :class="s.row.collapsed ? 'el-icon-arrow-right' : 'el-icon-arrow-down'" />
                                {{ s.row.model }}
                                <span class="ri-dim">· {{ s.row.count }} device{{ s.row.count === 1 ? '' : 's' }}</span>
                                <span v-if="s.row.receivedCount" class="ri-group-recv">· {{ s.row.receivedCount }} received</span>
                                <span :class="s.row.remainingCount ? 'ri-group-rem' : 'ri-dim'">· {{ s.row.remainingCount }} remaining</span>
                            </div>
                            <el-checkbox v-else class="ri-row-check" :value="isChecked(s.row)"
                                :disabled="isPersisted(s.row)" />
                        </template>
                    </el-table-column>
                    <el-table-column label="IMEI / Serial" min-width="160">
                        <template slot-scope="s">
                            <b>{{ s.row.code }}</b>
                            <el-tag v-if="s.row.unlisted" size="mini" type="warning" effect="plain">not on list</el-tag>
                        </template>
                    </el-table-column>
                    <!-- Blackbelt owns the identity of a unit it has a report
                         on. Everything else is the supplier's own wording, so
                         it can be corrected here before the stock record is
                         created. Saved at receive, like the grade picks. -->
                    <el-table-column label="Model" min-width="150" show-overflow-tooltip>
                        <template slot-scope="s">
                            <span v-if="bbModel(s.row)">{{ bbModel(s.row) }}</span>
                            <span v-else-if="isPersisted(s.row)">{{ s.row.model || '—' }}</span>
                            <el-input v-else :value="detailValue(s.row, 'model')" size="mini" placeholder="—"
                                @input="v => setDetail(s.row, 'model', v)" />
                        </template>
                    </el-table-column>
                    <el-table-column label="Colour" min-width="115" show-overflow-tooltip>
                        <template slot-scope="s">
                            <span v-if="s.row.bbDevice && s.row.bbDevice.color">{{ s.row.bbDevice.color }}</span>
                            <span v-else-if="isPersisted(s.row)">{{ s.row.color || '—' }}</span>
                            <el-input v-else :value="detailValue(s.row, 'color')" size="mini" placeholder="—"
                                @input="v => setDetail(s.row, 'color', v)" />
                        </template>
                    </el-table-column>
                    <el-table-column label="Capacity" width="100" align="center">
                        <template slot-scope="s">
                            <span v-if="s.row.bbDevice && s.row.bbDevice.storage">{{ s.row.bbDevice.storage }}</span>
                            <span v-else-if="isPersisted(s.row)">{{ s.row.capacity || '—' }}</span>
                            <el-input v-else :value="detailValue(s.row, 'capacity')" size="mini" placeholder="—"
                                @input="v => setDetail(s.row, 'capacity', v)" />
                        </template>
                    </el-table-column>
                    <el-table-column label="Battery" width="80" align="center">
                        <template slot-scope="s">{{ battery(s.row) == null ? '—' : battery(s.row) + '%' }}</template>
                    </el-table-column>
                    <el-table-column label="Price" width="100" align="right">
                        <template slot-scope="s">{{ money(s.row.price, batch.currency) }}</template>
                    </el-table-column>
                    <el-table-column label="Blackbelt" width="95" align="center">
                        <template slot-scope="s">
                            <i v-if="s.row.bbStatus === 'found'" class="el-icon-success ri-yes" title="Report found" />
                            <i v-else-if="s.row.bbStatus === 'none'" class="el-icon-error ri-no" title="No report" />
                            <i v-else-if="s.row.bbStatus === 'error'" class="el-icon-warning ri-warn-i"
                                :title="s.row.bbMessage || 'Lookup failed'" />
                            <!-- Local extras are checked when the batch is committed. -->
                            <span v-else-if="!s.row.bbStatus" class="ri-dim" title="Checked when added to stock">—</span>
                            <i v-else-if="sweepRunning" class="el-icon-loading ri-dim" title="Checking…" />
                            <span v-else class="ri-dim" title="Not checked yet">—</span>
                        </template>
                    </el-table-column>
                    <!-- Sheet-provided grades are fixed; a device without one
                         gets picked here and is saved at commit. -->
                    <el-table-column label="Grade" width="92" align="center">
                        <template slot-scope="s">
                            <el-tag v-if="s.row.grade" size="mini" effect="plain">{{ s.row.grade }}</el-tag>
                            <span v-else-if="isPersisted(s.row)" class="ri-dim">—</span>
                            <el-select v-else :value="gradePicks[s.row.code] || ''" size="mini" class="ri-grade-sel"
                                placeholder="—" clearable @input="v => setGrade(s.row, v)">
                                <el-option v-for="g in grades" :key="g" :label="g" :value="g" />
                            </el-select>
                        </template>
                    </el-table-column>
                    <!-- "Received" only once Add Received to Stock has run —
                         a scan on its own is just the ticked checkbox. -->
                    <el-table-column label="Status" width="130" align="center">
                        <template slot-scope="s">
                            <span v-if="s.row.deviceId" class="ri-ok"><i class="el-icon-check" /> Received</span>
                            <span v-else-if="s.row.alreadyInStock" class="ri-warn" title="This code is already in the register">
                                already in stock
                            </span>
                            <span v-else-if="s.row.received" class="ri-ok"><i class="el-icon-check" /> Received</span>
                            <span v-else class="ri-dim">—</span>
                        </template>
                    </el-table-column>
                </el-table>
            </div>
            <span slot="footer" class="ri-foot">
                <el-button v-if="batch && (checkableCount || sweepRunning)" size="small" icon="el-icon-connection"
                    :loading="rechecking" :disabled="sweepRunning || !checkableCount"
                    @click="recheck">{{ sweepRunning ? 'Checking…' : `Check Blackbelt (${checkableCount})` }}</el-button>
                <el-button size="small" icon="el-icon-download" :loading="exporting"
                    @click="downloadReceived">Download Received</el-button>
                <span class="ri-spacer" />
                <span v-if="checkedCodes.length" class="ri-foot-note">{{ checkedCodes.length }} scanned, not yet added</span>
                <el-button size="small" @click="onTakeBeforeClose(() => { takeVisible = false })">Close</el-button>
                <el-button size="small" type="warning" plain icon="el-icon-sell"
                    :disabled="!checkedCodes.length" @click="openSell">Sell</el-button>
                <el-button type="primary" size="small" :disabled="!checkedCodes.length"
                    @click="openReceive">Received</el-button>
            </span>
        </el-dialog>

        <!-- ── Receive confirmation ─────────────────────────────────── -->
        <!-- The location is asked here, with no preselection, so it's a
             conscious choice rather than a footer control nobody notices. -->
        <el-dialog title="Receive Stock" :visible.sync="receiveVisible" width="380px" append-to-body>
            <div class="ri-recv">
                <div class="ri-recv-line">
                    <b>{{ checkedCodes.length }}</b> device(s) will be added to stock.
                </div>
                <div class="ri-recv-label">Location</div>
                <el-select v-model="receiveLocation" placeholder="Select a location" style="width: 100%">
                    <el-option v-for="l in receiveLocations" :key="l" :label="l" :value="l" />
                </el-select>
            </div>
            <span slot="footer">
                <el-button size="small" @click="receiveVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" :loading="committing" :disabled="!receiveLocation"
                    @click="commit">Confirm</el-button>
            </span>
        </el-dialog>

        <!-- ── Which received stock to download ─────────────────────── -->
        <el-dialog title="Download Received" :visible.sync="exportVisible" width="420px" append-to-body>
            <div class="ri-exp">
                <div class="ri-exp-label">Include</div>
                <el-checkbox-group v-model="exportPicks" class="ri-exp-list">
                    <el-checkbox v-for="b in exportBuckets" :key="b.key" :label="b.key" class="ri-exp-item">
                        {{ b.key }} <span class="ri-dim">({{ b.count }})</span>
                    </el-checkbox>
                </el-checkbox-group>
                <div class="ri-exp-total">
                    <b>{{ exportSelectedRows.length }}</b> of {{ exportRows.length }} device(s) will be exported
                </div>
            </div>
            <span slot="footer">
                <el-button size="small" @click="exportVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" :disabled="!exportSelectedRows.length"
                    icon="el-icon-download" @click="runReceivedExport">Download</el-button>
            </span>
        </el-dialog>

        <!-- ── Sell straight off the shipment ───────────────────────── -->
        <!-- No location question: units sold on arrival are still filed at
             iMobile — "sold" is carried by the status, not the location. -->
        <el-dialog title="Sell Devices" :visible.sync="sellVisible" width="820px" append-to-body
            :close-on-click-modal="false">
            <div class="ri-sell">
                <div class="ri-sell-head">
                    <div class="ri-sell-field ri-grow">
                        <label>Customer</label>
                        <div class="ri-cust-line">
                            <el-select v-model="sellForm.customerId" size="small" filterable class="ri-grow"
                                placeholder="Select a customer…">
                                <el-option v-for="c in customers" :key="c._id" :value="c._id"
                                    :label="c.name + (c.phone ? ' · ' + c.phone : '')" />
                            </el-select>
                            <el-button size="small" icon="el-icon-plus"
                                @click="quickCustomerOpen = !quickCustomerOpen">New</el-button>
                        </div>
                    </div>
                    <div class="ri-sell-field">
                        <label>Currency</label>
                        <el-select v-model="sellForm.currency" size="small" style="width:100px">
                            <el-option v-for="c in ['AUD', 'CNY', 'HKD']" :key="c" :label="c" :value="c" />
                        </el-select>
                    </div>
                </div>

                <div v-if="quickCustomerOpen" class="ri-quick-cust">
                    <el-input v-model="quickCustomer.name" size="small" placeholder="Customer name *" class="qc-name" />
                    <el-input v-model="quickCustomer.phone" size="small" placeholder="Phone" class="qc-small" />
                    <el-input v-model="quickCustomer.email" size="small" placeholder="Email" class="qc-small" />
                    <el-button size="small" type="primary" plain :loading="quickCustomerSaving"
                        @click="saveQuickCustomer">Add</el-button>
                </div>

                <el-table :data="sellRows" border size="mini" max-height="300">
                    <el-table-column label="IMEI / Serial" min-width="150">
                        <template slot-scope="s"><b>{{ s.row.code }}</b></template>
                    </el-table-column>
                    <el-table-column label="Device" min-width="200" show-overflow-tooltip>
                        <template slot-scope="s">
                            {{ [s.row.model, s.row.capacity, s.row.color].filter(Boolean).join(' · ') || '—' }}
                        </template>
                    </el-table-column>
                    <el-table-column label="Grade" width="70" align="center">
                        <template slot-scope="s">{{ gradeOf(s.row) || '—' }}</template>
                    </el-table-column>
                    <el-table-column label="Cost" width="110" align="right">
                        <template slot-scope="s">
                            {{ s.row.price == null ? '—' : (batch ? batch.currency : '') + ' ' + Number(s.row.price).toFixed(2) }}
                        </template>
                    </el-table-column>
                    <el-table-column label="Sale Price" width="140" align="center">
                        <template slot-scope="s">
                            <el-input-number v-model="sellPrices[s.row.code]" size="mini" :min="0" :precision="2"
                                :controls="false" style="width:110px" />
                        </template>
                    </el-table-column>
                </el-table>
                <div class="ri-sell-totals">
                    <div class="ri-total-row">
                        <span>{{ sellRows.length }} device(s) · Sub Total</span>
                        <span>{{ sellForm.currency }} {{ sellSubTotal.toFixed(2) }}</span>
                    </div>
                    <div class="ri-total-row">
                        <span><el-checkbox v-model="sellForm.gst">GST (10%)</el-checkbox></span>
                        <span>{{ sellForm.currency }} {{ sellGst.toFixed(2) }}</span>
                    </div>
                    <div class="ri-total-row ri-total-grand">
                        <span>Total</span>
                        <span>{{ sellForm.currency }} {{ (sellSubTotal + sellGst).toFixed(2) }}</span>
                    </div>
                </div>

                <div class="ri-sell-field">
                    <label>Notes</label>
                    <el-input v-model="sellForm.notes" type="textarea" :rows="2" maxlength="1000" size="small" />
                </div>
            </div>
            <span slot="footer">
                <el-button size="small" @click="sellVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" :loading="selling" :disabled="!sellForm.customerId"
                    @click="sell">Create Sale</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import {
    getIncomingBatches, createIncomingBatch, getIncomingBatch,
    commitIncoming, sellIncoming, recheckIncoming, deleteIncomingBatch,
    getIncomingReceived, getRefurbCustomers, createRefurbCustomer
} from '@/api/refurbished'
// xlsx-js-style — the styled SheetJS fork the other dashboard exports use,
// so the download looks like the rest of them.
import * as XLSX from 'xlsx-js-style'

const GRADES = ['A++', 'A+', 'A', 'B+', 'B', 'C+', 'C']
const CURRENCIES = ['AUD', 'CNY', 'HKD']
// Australian GST — sale prices are entered ex-GST and GST is added on top.
const GST_RATE = 0.1
// Where the batch's stock comes from — fixed at upload, stamped on every
// device received against it.
const STOCK_SOURCES = ['HK', 'iMobile', 'DICO', 'Exyon']
const SYMBOLS = { AUD: '$', CNY: '¥', HKD: 'HK$' }
const CODE_RE = /^[A-Z0-9]{10,20}$/

// Supplier sheets never agree on header spelling or padding, so match on a
// squashed lowercase form rather than an exact key.
const COLUMNS = {
    code: ['imei', 'imeiserial', 'serial', 'serialnumber', 'imeisn', 'sn'],
    model: ['model', 'modelname', 'device', 'description'],
    color: ['color', 'colour'],
    capacity: ['capacity', 'storage', 'memory', 'size'],
    battery: ['battery', 'batteryhealth', 'bh'],
    price: ['price', 'cost', 'costprice', 'unitprice'],
    grade: ['grade', 'condition'],
    no: ['no', 'number', 'item', 'sn.']
}

function squash(k) {
    return String(k == null ? '' : k).toLowerCase().replace(/[^a-z0-9]/g, '')
}

export default {
    name: 'RefurbishedIncoming',
    data() {
        return {
            loading: false,
            batches: [],
            grades: GRADES,
            currencies: CURRENCIES,
            stockSources: STOCK_SOURCES,
            // Upload dialog
            uploadVisible: false,
            uploading: false,
            upload: { title: '', currency: 'AUD', stockSource: 'iMobile' },
            parsed: { rows: [], bad: [] },
            // Stock take dialog. Scanning is purely local: `checkedCodes`
            // holds what's been scanned (newest first — the table surfaces
            // them in this order) and `localExtras` holds rows scanned that
            // aren't on the supplier's list. Nothing touches the server
            // until Add Received to Stock.
            takeVisible: false,
            batch: null,
            scanCode: '',
            scanMessage: '',
            scanTone: 'ok',
            lineFilter: 'all',
            checkedCodes: [],
            localExtras: [],
            // Grades picked in the dialog for lines the sheet left blank,
            // keyed by code. Saved at commit.
            gradePicks: {},
            // Model / colour / capacity corrections for lines Blackbelt has
            // no report on, keyed by code. Saved at commit, same as grades.
            detailPicks: {},
            // Model groups folded shut in the receive dialog, by name.
            collapsedGroups: {},
            // Receive confirmation popup — the location is deliberately not
            // preselected so it's always an explicit choice.
            receiveVisible: false,
            receiveLocation: '',
            receiveLocations: ['iMobile', 'Assigned To Exyon'],
            committing: false,
            rechecking: false,
            exporting: false,
            // Received export — rows are fetched first so the picker can show
            // a real count per group before anything is written to a file.
            exportVisible: false,
            exportRows: [],
            exportTitle: '',
            exportPicks: [],
            pollTimer: null,

            // Sell straight off the shipment — creates the stock records and
            // the sales order together. No location question: sold units are
            // still filed at iMobile.
            sellVisible: false,
            selling: false,
            sellForm: { customerId: '', currency: 'AUD', notes: '', gst: true },
            sellPrices: {},
            customers: [],
            quickCustomerOpen: false,
            quickCustomer: { name: '', phone: '', email: '' },
            quickCustomerSaving: false
        }
    },
    computed: {
        remaining() {
            if (!this.batch) return 0
            return (this.batch.lines || [])
                .filter(l => !l.unlisted && !l.received && !l.deviceId && !this.checkedCodes.includes(l.code))
                .length
        },
        unlistedCount() {
            if (!this.batch) return 0
            return this.batch.summary.unlisted + this.localExtras.length
        },
        sweepRunning() {
            return !!(this.batch && this.batch.blackbelt && this.batch.blackbelt.running)
        },
        // Selected rows that Blackbelt hasn't answered "found" for — what a
        // Check Blackbelt click will actually look up. Local extras are
        // excluded: they don't exist server-side until commit.
        checkableCount() {
            if (!this.batch) return 0
            const byCode = new Map((this.batch.lines || []).map(l => [l.code, l]))
            return this.checkedCodes.filter(c => {
                const l = byCode.get(c)
                return l && l.bbStatus !== 'found'
            }).length
        },
        // Listed devices that are neither received nor selected yet.
        selectableCount() {
            if (!this.batch) return 0
            return (this.batch.lines || [])
                .filter(l => !this.isPersisted(l) && !this.checkedCodes.includes(l.code))
                .length
        },
        // Scanned-but-uncommitted rows float to the top, most recent scan
        // first; everything else keeps the list's own order.
        visibleLines() {
            const all = [...this.localExtras, ...((this.batch && this.batch.lines) || [])]
            let rows = all
            if (this.lineFilter === 'remaining') rows = rows.filter(l => !this.isChecked(l))
            // Scanned = ticked this session, not yet committed; Received =
            // already persisted by an earlier Add Received to Stock.
            else if (this.lineFilter === 'scanned') rows = rows.filter(l => this.isChecked(l) && !this.isPersisted(l))
            else if (this.lineFilter === 'received') rows = rows.filter(l => this.isPersisted(l))

            // Grouped by model (Blackbelt's name winning, like the Model
            // cell), each group under a full-width header row; the most
            // recent scans still float to the top of their own group. The
            // header's counts come off ALL of the model's lines, whatever
            // the filter is showing, so they always describe the batch.
            const groups = new Map()
            for (const l of rows) {
                const k = this.groupKey(l)
                if (!groups.has(k)) groups.set(k, [])
                groups.get(k).push(l)
            }
            const stats = new Map()
            for (const l of all) {
                const k = this.groupKey(l)
                if (!stats.has(k)) stats.set(k, { received: 0, remaining: 0 })
                const st = stats.get(k)
                if (this.isPersisted(l)) st.received += 1
                else if (!this.isChecked(l)) st.remaining += 1
            }
            const names = [...groups.keys()].sort((a, b) => {
                if (a === '(No model)') return 1
                if (b === '(No model)') return -1
                return a.localeCompare(b)
            })
            const pos = l => (this.isPersisted(l) ? -1 : this.checkedCodes.indexOf(l.code))
            const out = []
            for (const name of names) {
                const members = groups.get(name)
                const st = stats.get(name) || { received: 0, remaining: 0 }
                const collapsed = !!this.collapsedGroups[name]
                out.push({
                    __group: true,
                    code: '__group__' + name,
                    model: name,
                    count: members.length,
                    receivedCount: st.received,
                    remainingCount: st.remaining,
                    collapsed
                })
                if (collapsed) continue
                const scanned = members.filter(l => pos(l) >= 0).sort((a, b) => pos(a) - pos(b))
                const rest = members.filter(l => pos(l) < 0)
                out.push(...scanned, ...rest)
            }
            return out
        },
        // The scanned lines being sold, oldest scan first — the same order
        // the sale is submitted in.
        sellRows() {
            const all = [...this.localExtras, ...((this.batch && this.batch.lines) || [])]
            const byCode = new Map(all.map(l => [l.code, l]))
            return [...this.checkedCodes].reverse().map(c => byCode.get(c) || { code: c })
        },
        sellSubTotal() {
            const n = this.sellRows.reduce((s, r) => s + (Number(this.sellPrices[r.code]) || 0), 0)
            return Math.round(n * 100) / 100
        },
        sellGst() {
            return this.sellForm.gst ? Math.round(this.sellSubTotal * GST_RATE * 100) / 100 : 0
        },
        // The groups actually present in this batch's received stock, each
        // with its count — built from the rows so an empty group never shows.
        exportBuckets() {
            const counts = new Map()
            for (const x of this.exportRows) {
                const k = this.receivedBucket(x)
                counts.set(k, (counts.get(k) || 0) + 1)
            }
            // Sold first, then the shelves in the order they're offered at
            // receive, then anything unexpected.
            const order = ['Sold', 'iMobile', 'Assigned To Exyon']
            return [...counts.keys()]
                .sort((a, b) => {
                    const ia = order.indexOf(a), ib = order.indexOf(b)
                    return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib) || a.localeCompare(b)
                })
                .map(k => ({ key: k, count: counts.get(k) }))
        },
        exportSelectedRows() {
            return this.exportRows.filter(x => this.exportPicks.includes(this.receivedBucket(x)))
        }
    },
    created() {
        this.loadBatches()
    },
    activated() {
        this.loadBatches()
    },
    beforeDestroy() {
        this.stopPolling()
    },
    methods: {
        // ── Batch list ───────────────────────────────────────────────
        async loadBatches() {
            this.loading = true
            try {
                const r = await getIncomingBatches()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.batches = r.rows || []
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load batches'))
            } finally {
                this.loading = false
            }
        },
        removeBatch(row) {
            const inStock = row.summary.committed
            const warn = inStock
                ? `${inStock} device(s) from this batch are already in stock and will stay there; ` +
                  'unreceived ones leave the register with the batch. Delete the batch record?'
                : `Delete "${row.title}"? Unreceived devices it put on the register are removed too.`
            this.$confirm(warn, 'Delete batch', {
                type: 'warning', confirmButtonText: 'Delete', cancelButtonText: 'Cancel'
            }).then(async () => {
                try {
                    const r = await deleteIncomingBatch(row._id)
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    this.$message.success('Batch deleted')
                    this.loadBatches()
                } catch (e) {
                    this.$message.error(this.msg(e, 'Failed to delete'))
                }
            }).catch(() => {})
        },

        // ── Upload ───────────────────────────────────────────────────
        openUpload() {
            this.upload = { title: '', currency: 'AUD', stockSource: 'iMobile' }
            this.parsed = { rows: [], bad: [] }
            this.uploadVisible = true
            this.$nextTick(() => {
                if (this.$refs.uploadFile) this.$refs.uploadFile.value = ''
            })
        },
        async onFile(e) {
            const file = e.target.files && e.target.files[0]
            if (!file) return
            try {
                const XLSX = await import('xlsx')
                const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
                const sheet = wb.Sheets[wb.SheetNames[0]]
                const rows = sheet ? XLSX.utils.sheet_to_json(sheet, { defval: '' }) : []
                this.parsed = this.mapRows(rows)
                if (!this.upload.title) {
                    // "stock AU260804(1).xlsx" → "stock AU260804"
                    this.upload.title = String(file.name)
                        .replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)\s*$/, '').trim()
                }
                if (!this.parsed.rows.length) {
                    this.$message.warning('No usable rows found — check the column headings.')
                }
            } catch (err) {
                this.$message.error('Could not read that file')
            }
        },
        // Header names vary between suppliers, so resolve each column once
        // and then read every row through that map.
        mapRows(rows) {
            const out = { rows: [], bad: [] }
            if (!rows.length) return out
            const keys = Object.keys(rows[0])
            const map = {}
            for (const field of Object.keys(COLUMNS)) {
                map[field] = keys.find(k => COLUMNS[field].includes(squash(k))) || null
            }
            if (!map.code) {
                out.bad.push({ row: 0, code: '', reason: 'No IMEI / serial column found' })
                return out
            }
            const seen = new Set()
            rows.forEach((r, i) => {
                const raw = map.code ? r[map.code] : ''
                const code = String(raw == null ? '' : raw).replace(/[\s-]/g, '').trim().toUpperCase()
                if (!code) return // blank filler row — not worth reporting
                if (!CODE_RE.test(code)) {
                    out.bad.push({ row: i + 2, code, reason: 'Not a valid IMEI or serial' })
                    return
                }
                if (seen.has(code)) {
                    out.bad.push({ row: i + 2, code, reason: 'Duplicated in this file' })
                    return
                }
                seen.add(code)
                out.rows.push({
                    no: map.no ? this.toNum(r[map.no]) : i + 1,
                    code,
                    // Suppliers mix casings ("iphone 13", "space Grey") —
                    // uppercase so the register reads uniformly.
                    model: map.model ? String(r[map.model] || '').trim().toUpperCase() : '',
                    color: map.color ? String(r[map.color] || '').trim().toUpperCase() : '',
                    capacity: map.capacity ? String(r[map.capacity] || '').trim().toUpperCase() : '',
                    battery: map.battery ? this.batteryPercent(r[map.battery]) : null,
                    price: map.price ? this.toNum(r[map.price]) : null,
                    grade: map.grade ? this.parseGrade(r[map.grade]) : ''
                })
            })
            return out
        },
        toNum(v) {
            if (v === '' || v == null) return null
            const n = Number(String(v).replace(/[^0-9.-]/g, ''))
            return isFinite(n) ? n : null
        },
        // Sheets mix fractions (0.93, 1) with whole percentages (93, 100).
        batteryPercent(v) {
            const n = this.toNum(v)
            if (n === null || n <= 0) return null
            const pct = n <= 1 ? Math.round(n * 100) : Math.round(n)
            return pct > 0 && pct <= 100 ? pct : null
        },
        // Grades on our scale come through; anything else stays blank for
        // the Stock page to fill in later.
        parseGrade(v) {
            const g = String(v == null ? '' : v).toUpperCase().replace(/\s+/g, '')
            return GRADES.includes(g) ? g : ''
        },
        async submitUpload() {
            this.uploading = true
            try {
                const r = await createIncomingBatch({
                    title: this.upload.title,
                    currency: this.upload.currency,
                    stockSource: this.upload.stockSource,
                    rows: this.parsed.rows
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(
                    `Batch created with ${r.accepted} device(s)` +
                    (r.onRegister ? ` · ${r.onRegister} added to Stock as Not Yet Received` : '')
                )
                this.uploadVisible = false
                await this.loadBatches()
                const created = this.batches.find(b => String(b._id) === String(r.id))
                if (created) this.openBatch(created)
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to create the batch'))
            } finally {
                this.uploading = false
            }
        },

        // ── Stock take ───────────────────────────────────────────────
        async openBatch(row) {
            this.scanCode = ''
            this.scanMessage = ''
            this.lineFilter = 'all'
            this.collapsedGroups = {}
            this.checkedCodes = []
            this.localExtras = []
            this.gradePicks = {}
            this.detailPicks = {}
            this.takeVisible = true
            await this.refreshBatch(row._id)
            this.focusScan()
            this.startPolling()
        },
        async refreshBatch(id) {
            try {
                const r = await getIncomingBatch(id || this.batch._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.batch = r.batch
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load the batch'))
            }
        },
        // Only while a Blackbelt sweep is actually running.
        startPolling() {
            this.stopPolling()
            this.pollTimer = setInterval(async () => {
                if (!this.batch || !this.takeVisible) return this.stopPolling()
                if (!this.sweepRunning) return this.stopPolling()
                await this.refreshBatch()
            }, 4000)
        },
        stopPolling() {
            if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
        },
        // Scans live only in this dialog — warn before throwing them away.
        onTakeBeforeClose(done) {
            if (!this.checkedCodes.length) return done()
            this.$confirm(
                `${this.checkedCodes.length} scanned device(s) haven't been added to stock yet — close anyway?`,
                'Unsaved scans',
                { type: 'warning', confirmButtonText: 'Close', cancelButtonText: 'Stay' }
            ).then(() => done()).catch(() => {})
        },
        onTakeClosed() {
            this.stopPolling()
            this.batch = null
            this.checkedCodes = []
            this.localExtras = []
            this.gradePicks = {}
            this.detailPicks = {}
            this.loadBatches()
        },
        focusScan() {
            this.$nextTick(() => {
                const el = this.$refs.scanInput
                if (el && el.focus) el.focus()
            })
        },
        // A scan is entirely local: tick the row's checkbox and float it to
        // the top. The server hears about it at Add Received to Stock.
        doScan() {
            const code = String(this.scanCode || '').replace(/[\s-]/g, '').trim().toUpperCase()
            this.scanCode = ''
            this.focusScan()
            if (!code) return
            if (!CODE_RE.test(code)) {
                this.say('error', `"${code}" isn't a valid IMEI or serial`)
                return
            }
            const line = (this.batch.lines || []).find(l => l.code === code)
            if (line && this.isPersisted(line)) {
                this.say('warn', `${code} was already received`)
                return
            }
            if (this.checkedCodes.includes(code)) {
                this.say('warn', `${code} was already scanned`)
                return
            }
            this.checkedCodes.unshift(code)
            if (line) {
                if (line.alreadyInStock) this.say('warn', `${code} scanned — but it's already in stock, so it will be skipped`)
                else this.say('ok', `${code} scanned`)
            } else if (this.localExtras.some(l => l.code === code)) {
                this.say('warn', `${code} was already scanned`)
            } else {
                this.localExtras.unshift({
                    no: null, code, model: '', color: '', capacity: '',
                    battery: null, price: null, grade: '', bbStatus: '',
                    bbMessage: '', bbReportId: '', bbDevice: null,
                    received: false, unlisted: true, alreadyInStock: false,
                    deviceId: null, __local: true
                })
                this.say('warn', `${code} isn't on the supplier's list — added as an extra`)
            }
        },
        // Persisted = the server already knows (committed or received) —
        // the checkbox is locked for those.
        isPersisted(row) {
            return !!(row.deviceId || row.received)
        },
        isChecked(row) {
            return this.isPersisted(row) || this.checkedCodes.includes(row.code)
        },
        setGrade(row, v) {
            this.$set(this.gradePicks, row.code, v || '')
        },
        // Identity corrections for lines Blackbelt has nothing on. The cell
        // starts on the supplier's own wording and is only overridden once
        // someone types; stored uppercase like the rest of the module.
        detailValue(row, field) {
            const pick = this.detailPicks[row.code]
            if (pick && pick[field] !== undefined) return pick[field]
            return row[field] || ''
        },
        setDetail(row, field, v) {
            const pick = { ...(this.detailPicks[row.code] || {}) }
            pick[field] = String(v == null ? '' : v).toUpperCase()
            this.$set(this.detailPicks, row.code, pick)
        },
        // Only the codes being received, and only fields actually typed.
        pickedDetails(codes) {
            const out = {}
            for (const c of codes) {
                const pick = this.detailPicks[c]
                if (!pick) continue
                const kept = {}
                for (const k of ['model', 'color', 'capacity']) {
                    if (pick[k] !== undefined) kept[k] = pick[k]
                }
                if (Object.keys(kept).length) out[c] = kept
            }
            return out
        },
        // Tick every unreceived listed device at once. Appended after any
        // hand-scanned rows, in list order, so real scans keep the top.
        selectAllRemaining() {
            const add = (this.batch.lines || [])
                .filter(l => !this.isPersisted(l) && !this.checkedCodes.includes(l.code))
                .map(l => l.code)
            if (!add.length) return
            this.checkedCodes = this.checkedCodes.concat(add)
            this.say('ok', `${add.length} device(s) selected`)
        },
        clearSelection() {
            this.checkedCodes = []
            this.localExtras = []
            this.scanMessage = ''
        },
        toggleCheck(row, v) {
            if (this.isPersisted(row)) return
            if (v) {
                if (!this.checkedCodes.includes(row.code)) this.checkedCodes.unshift(row.code)
                // A scan into a folded group unfolds it, so the scanned row
                // is where the eye lands.
                const k = this.groupKey(row)
                if (this.collapsedGroups[k]) this.$set(this.collapsedGroups, k, false)
            } else {
                const i = this.checkedCodes.indexOf(row.code)
                if (i >= 0) this.checkedCodes.splice(i, 1)
                // An unchecked extra has no reason to stay on the list.
                const x = this.localExtras.findIndex(l => l.code === row.code)
                if (x >= 0) this.localExtras.splice(x, 1)
            }
        },
        onRowClick(row, column, event) {
            if (row.__group) {
                this.$set(this.collapsedGroups, row.model, !this.collapsedGroups[row.model])
                return
            }
            if (this.isPersisted(row)) return
            // Clicks inside real controls (the grade select) keep their own
            // behavior; everywhere else on the row toggles the selection.
            if (event && event.target && event.target.closest &&
                event.target.closest('.el-select, .el-select-dropdown, input:not(.el-checkbox__original), button, a')) {
                return
            }
            this.toggleCheck(row, !this.checkedCodes.includes(row.code))
        },
        openReceive() {
            if (!this.checkedCodes.length) return
            this.receiveLocation = ''
            this.receiveVisible = true
        },
        // The grade a line will be stocked under: the sheet's value wins,
        // then whatever was picked in the dialog (same rule as the server).
        gradeOf(row) {
            return (row && row.grade) || this.gradePicks[row && row.code] || ''
        },
        async openSell() {
            if (!this.checkedCodes.length) return
            this.sellForm = { customerId: '', currency: 'AUD', notes: '', gst: true }
            // Seed a key per code: Vue 2 can't track keys added to an object
            // after the fact, so the running total would ignore later edits.
            const seeded = {}
            for (const c of this.checkedCodes) seeded[c] = undefined
            this.sellPrices = seeded
            this.quickCustomerOpen = false
            this.quickCustomer = { name: '', phone: '', email: '' }
            this.sellVisible = true
            try {
                const r = await getRefurbCustomers()
                this.customers = r.customers || []
            } catch (e) {
                this.customers = []
            }
        },
        async saveQuickCustomer() {
            const name = (this.quickCustomer.name || '').trim()
            if (!name) { this.$message.warning('Customer name is required'); return }
            this.quickCustomerSaving = true
            try {
                const r = await createRefurbCustomer(this.quickCustomer)
                this.customers.push(r.customer)
                this.customers.sort((a, b) => String(a.name).localeCompare(String(b.name)))
                this.sellForm.customerId = r.customer._id
                this.quickCustomerOpen = false
                this.quickCustomer = { name: '', phone: '', email: '' }
                this.$message.success(`Customer "${r.customer.name}" added`)
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to add the customer'))
            } finally {
                this.quickCustomerSaving = false
            }
        },
        async sell() {
            if (!this.checkedCodes.length || this.selling || !this.sellForm.customerId) return
            this.selling = true
            try {
                // Oldest scan first, matching the receive flow.
                const codes = [...this.checkedCodes].reverse()
                const grades = {}
                const prices = {}
                for (const c of codes) {
                    if (this.gradePicks[c]) grades[c] = this.gradePicks[c]
                    if (this.sellPrices[c] != null && this.sellPrices[c] !== '') prices[c] = this.sellPrices[c]
                }
                const r = await sellIncoming(this.batch._id, {
                    codes,
                    grades,
                    details: this.pickedDetails(codes),
                    prices,
                    customerId: this.sellForm.customerId,
                    currency: this.sellForm.currency,
                    notes: this.sellForm.notes,
                    gstRate: this.sellForm.gst ? GST_RATE : 0
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                const skipped = (r.skipped || []).length
                this.$message.success(
                    `${r.order.orderNo} created — ${r.created} device(s) sold` +
                    (skipped ? ` · ${skipped} skipped` : '')
                )
                if (skipped) {
                    this.$notify.warning({
                        title: 'Some devices were skipped',
                        message: r.skipped.map(s => `${s.code}: ${s.reason}`).join('\n'),
                        duration: 0
                    })
                }
                this.sellVisible = false
                this.checkedCodes = []
                this.localExtras = []
                this.gradePicks = {}
                this.detailPicks = {}
            this.detailPicks = {}
                this.sellPrices = {}
                await this.refreshBatch()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to create the sale'))
            } finally {
                this.selling = false
            }
        },
        async commit() {
            if (!this.checkedCodes.length || this.committing || !this.receiveLocation) return
            this.committing = true
            try {
                // Oldest scan first, so stock records are created in the
                // order the devices physically went through.
                const codes = [...this.checkedCodes].reverse()
                const grades = {}
                for (const c of codes) {
                    if (this.gradePicks[c]) grades[c] = this.gradePicks[c]
                }
                const r = await commitIncoming(this.batch._id, {
                    codes, grades, details: this.pickedDetails(codes), location: this.receiveLocation
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                const skipped = (r.skipped || []).length
                this.$message.success(
                    `${r.created} device(s) received to ${this.receiveLocation}` +
                    (skipped ? ` · ${skipped} skipped` : '')
                )
                if (skipped) {
                    this.$notify.warning({
                        title: 'Some devices were skipped',
                        message: r.skipped.map(s => `${s.code}: ${s.reason}`).join('\n'),
                        duration: 0
                    })
                }
                this.receiveVisible = false
                this.checkedCodes = []
                this.localExtras = []
                this.gradePicks = {}
                this.detailPicks = {}
            this.detailPicks = {}
                await this.refreshBatch()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to add to stock'))
            } finally {
                this.committing = false
            }
        },
        // Everything counted in against this batch, with where it ended up:
        // location, and the sales order / customer if it has been sold. The
        // picker chooses which of those groups end up in the file.
        async downloadReceived() {
            if (!this.batch || this.exporting) return
            this.exporting = true
            try {
                const r = await getIncomingReceived(this.batch._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                const rows = r.rows || []
                if (!rows.length) {
                    this.$message.warning('Nothing has been received against this batch yet.')
                    return
                }
                this.exportRows = rows
                this.exportTitle = r.title || this.batch.title || 'batch'
                // Everything ticked to start, so the plain download is the
                // whole batch — what the button did before the picker existed.
                this.exportPicks = this.exportBuckets.map(b => b.key)
                this.exportVisible = true
            } catch (e) {
                console.error('Received export failed:', e)
                this.$message.error(this.msg(e, 'Failed to load the received list'))
            } finally {
                this.exporting = false
            }
        },
        // Which group a received device falls in. Sold wins over its shelf —
        // "iMobile" means still sitting there, not sold from there.
        receivedBucket(x) {
            if (x.status === 'Sold') return 'Sold'
            if (x.location) return x.location
            return 'Other'
        },
        runReceivedExport() {
            const rows = this.exportSelectedRows
            if (!rows.length) return
            try {
                const header = [
                    'IMEI / Serial', 'Model', 'Colour', 'Capacity', 'Grade', 'Battery',
                    'Cost Price', 'Currency', 'Stock Source', 'Location', 'Status',
                    'Sales Order', 'Customer', 'Received', 'Received By', 'Note'
                ]
                const data = rows.map(x => ({
                    'IMEI / Serial': x.code,
                    Model: x.model || '',
                    Colour: x.color || '',
                    Capacity: x.storage || '',
                    Grade: x.grade || '',
                    Battery: x.batteryHealth == null ? '' : `${x.batteryHealth}%`,
                    'Cost Price': x.costPrice == null ? '' : Number(x.costPrice),
                    Currency: x.currency || '',
                    'Stock Source': x.stockSource || '',
                    Location: x.location || '',
                    Status: x.status || '',
                    'Sales Order': x.orderNo || '',
                    Customer: x.customerName || '',
                    Received: this.shortDate(x.receivedAt),
                    'Received By': x.receivedBy || '',
                    Note: [
                        x.unlisted ? 'not on list' : '',
                        x.alreadyInStock ? 'already in stock' : '',
                        x.inRegister ? '' : 'not in register'
                    ].filter(Boolean).join(', ')
                }))

                const ws = XLSX.utils.json_to_sheet(data, { header })
                const headerStyle = {
                    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 },
                    fill: { fgColor: { rgb: '409EFF' } },
                    alignment: { horizontal: 'center', vertical: 'center' },
                    border: {
                        top: { style: 'thin', color: { rgb: 'DCDCDC' } },
                        bottom: { style: 'thin', color: { rgb: 'DCDCDC' } },
                        left: { style: 'thin', color: { rgb: 'DCDCDC' } },
                        right: { style: 'thin', color: { rgb: 'DCDCDC' } }
                    }
                }
                const range = XLSX.utils.decode_range(ws['!ref'])
                for (let col = range.s.c; col <= range.e.c; col++) {
                    const addr = XLSX.utils.encode_cell({ r: 0, c: col })
                    if (ws[addr]) ws[addr].s = headerStyle
                }
                ws['!cols'] = [
                    { wch: 20 }, { wch: 22 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 9 },
                    { wch: 11 }, { wch: 9 }, { wch: 13 }, { wch: 18 }, { wch: 10 },
                    { wch: 13 }, { wch: 26 }, { wch: 18 }, { wch: 16 }, { wch: 20 }
                ]

                const wb = XLSX.utils.book_new()
                XLSX.utils.book_append_sheet(wb, ws, 'Received')
                // Batch titles carry dates ("… 13/08/2026"), so strip what a
                // filesystem won't take before naming the file.
                const name = String(this.exportTitle || 'Batch').replace(/[\/:*?"<>|]+/g, '-').trim()
                XLSX.writeFile(wb, `${name} Received.xlsx`)
                this.$message.success(`${rows.length} device(s) exported`)
                this.exportVisible = false
            } catch (e) {
                console.error('Received export failed:', e)
                this.$message.error(this.msg(e, 'Failed to build the received list'))
            }
        },
        async recheck() {
            if (!this.checkableCount) return
            this.rechecking = true
            try {
                const r = await recheckIncoming(this.batch._id, { codes: this.checkedCodes })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(r.queued ? `Checking ${r.queued} device(s) against Blackbelt` : (r.message || 'Nothing to check'))
                await this.refreshBatch()
                this.startPolling()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to re-check'))
            } finally {
                this.rechecking = false
            }
        },

        // ── Presentation ─────────────────────────────────────────────
        say(tone, message) {
            this.scanTone = tone
            this.scanMessage = message
        },
        money(v, cur) {
            const n = Number(v)
            if (v == null || !isFinite(n)) return '—'
            const symbol = SYMBOLS[cur] || SYMBOLS.AUD
            return symbol + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        },
        bbModel(row) {
            const bb = row.bbDevice
            if (!bb) return ''
            const brand = String(bb.brand || '').trim()
            const model = String(bb.model || '').trim()
            if (!brand) return model
            if (!model) return brand
            return model.toLowerCase().startsWith(brand.toLowerCase()) ? model : `${brand} ${model}`
        },
        battery(row) {
            const bb = row.bbDevice
            if (bb && bb.batteryHealth != null) return bb.batteryHealth
            return row.battery
        },
        // One definition of a line's model group — the header, the stats
        // and the auto-unfold all key on it.
        groupKey(l) {
            return this.bbModel(l) || String(l.model || '').trim() || '(No model)'
        },
        // A group header's first cell swallows the whole row.
        lineSpan({ row, columnIndex }) {
            if (!row.__group) return [1, 1]
            return columnIndex === 0 ? [1, 99] : [0, 0]
        },
        rowClass({ row }) {
            if (row.__group) return 'ri-row-group'
            if (this.isPersisted(row)) return 'ri-row-stock'
            if (this.checkedCodes.includes(row.code)) return 'ri-row-got'
            if (row.alreadyInStock) return 'ri-row-warn'
            return ''
        },
        shortDate(v) {
            if (!v) return '—'
            const d = new Date(v)
            return isNaN(d) ? '—' : d.toLocaleString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            })
        },
        msg(e, fallback) { return (e.response && e.response.data && e.response.data.message) || e.message || fallback }
    }
}
</script>

<style lang="scss" scoped>
.ri-page { padding: 12px 16px; }
.ri-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.ri-title { font-size: 15px; font-weight: 600; color: #303133; }
.ri-spacer { flex: 1; }
.ri-sub { font-size: 11px; color: #909399; }
.ri-dim { color: #C0C4CC; }
.ri-ok { color: #67C23A; font-weight: 600; }
.ri-warn { color: #E6A23C; font-weight: 600; }
.ri-del { color: #F56C6C; }
.ri-link { padding: 0; font-weight: 600; }
/* Upload dialog */
.ri-up-form ::v-deep .el-form-item__label { white-space: nowrap; }
.ri-file { font-size: 12px; }
.ri-hint { font-size: 11px; color: #909399; line-height: 1.6; }
.ri-inline { margin-left: 10px; }
.ri-preview { border-top: 1px solid #ebeef5; padding-top: 12px; margin-top: 4px; }
.ri-preview-head { font-size: 12px; color: #606266; margin-bottom: 8px; }
.ri-bad {
    margin-top: 8px; padding: 8px 10px; border-radius: 4px; background: #fdf6ec;
    font-size: 11px; color: #E6A23C; line-height: 1.7;
}
/* Stock take */
.ri-stats { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 10px; }
.ri-stat { display: flex; flex-direction: column; line-height: 1.4; }
.ri-stat span { font-size: 11px; color: #909399; }
.ri-stat b { font-size: 18px; color: #303133; }
.ri-alert { margin-bottom: 10px; }
.ri-scan { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.ri-scan-input { width: 260px; }
.ri-scan-msg { font-size: 12px; margin-bottom: 8px; padding: 5px 10px; border-radius: 4px; }
.ri-msg-ok { background: #f0f9eb; color: #67C23A; }
.ri-msg-warn { background: #fdf6ec; color: #E6A23C; }
.ri-msg-error { background: #fef0f0; color: #F56C6C; }
.ri-yes { color: #67C23A; font-size: 16px; }
.ri-no { color: #F56C6C; font-size: 16px; }
.ri-warn-i { color: #E6A23C; font-size: 16px; }
.ri-foot { display: flex; align-items: center; gap: 10px; }
/* Receive confirmation popup */
.ri-recv-line { font-size: 13px; color: #303133; margin-bottom: 14px; }
.ri-recv-label { font-size: 12px; font-weight: 600; color: #909399; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 8px; }
.ri-foot-note { font-size: 12px; color: #909399; }
/* Sell-off-the-shipment dialog */
.ri-sell { display: flex; flex-direction: column; gap: 14px; }
.ri-sell-head { display: flex; gap: 14px; align-items: flex-end; }
.ri-sell-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    label { font-size: 12px; font-weight: 600; color: #606266; }
}
.ri-grow { flex: 1; }
.ri-cust-line { display: flex; gap: 8px; }
.ri-quick-cust {
    display: flex;
    gap: 8px;
    padding: 10px;
    background: #f8f9fb;
    border: 1px dashed #dcdfe6;
    border-radius: 6px;

    .qc-name { flex: 1.4; }
    .qc-small { flex: 1; }
}
.ri-exp { display: flex; flex-direction: column; gap: 10px; }
.ri-exp-label { font-size: 12px; font-weight: 600; color: #909399; text-transform: uppercase; letter-spacing: .04em; }
.ri-exp-list { display: flex; flex-direction: column; gap: 8px; }
.ri-exp-item { margin-left: 0 !important; }
.ri-exp-total { font-size: 12px; color: #606266; border-top: 1px solid #ebeef5; padding-top: 10px; }
.ri-sell-totals { margin-left: auto; width: 280px; font-size: 13px; color: #606266; }
.ri-total-row { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 3px 0; }
.ri-total-grand {
    border-top: 1px solid #ebeef5;
    margin-top: 4px;
    padding-top: 6px;
    font-size: 15px;
    font-weight: 700;
    color: #303133;
}
/* Row click is the toggle — the checkbox only displays the state, and the
   pointer cursor advertises the click. */
.ri-row-check { pointer-events: none; }
.ri-group { font-size: 12px; font-weight: 700; color: #303133; text-align: left; padding-left: 6px; white-space: nowrap; }
.ri-group-recv { color: #67c23a; font-weight: 600; }
.ri-group-rem { color: #e6a23c; font-weight: 600; }
::v-deep .el-table .ri-row-group > td { background: #f4f6fa; cursor: pointer; }
::v-deep .el-table .ri-row-group:hover > td { background: #eef1f7; }
.ri-take ::v-deep .el-table__row { cursor: pointer; }
.ri-take ::v-deep .ri-row-got td { background: #f0f9eb !important; }
.ri-take ::v-deep .ri-row-stock td { background: #ecf5ff !important; }
.ri-take ::v-deep .ri-row-warn td { background: #fdf6ec !important; }
</style>
