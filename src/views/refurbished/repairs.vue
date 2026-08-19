<template>
    <div class="fr-page app-container">
        <div class="fr-bar">
            <span class="fr-title">For Repair</span>
            <span class="fr-spacer" />
            <el-button size="small" type="primary" plain icon="el-icon-upload2" @click="openUpload">Upload List</el-button>
            <el-button size="small" icon="el-icon-refresh" @click="loadBatches">Refresh</el-button>
        </div>

        <el-table v-loading="loading" :data="batches" border size="mini"
            empty-text="No repair batches yet — upload a list to start.">
            <el-table-column label="Batch" min-width="190">
                <template slot-scope="s">
                    <el-button type="text" class="fr-link" @click="openBatch(s.row)">{{ s.row.title }}</el-button>
                </template>
            </el-table-column>
            <el-table-column label="Repairer" min-width="160" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.repairerName || '—' }}</template>
            </el-table-column>
            <el-table-column label="Devices" width="90" align="center">
                <template slot-scope="s">{{ s.row.summary.total }}</template>
            </el-table-column>
            <el-table-column label="Sent" width="100" align="center">
                <template slot-scope="s">{{ s.row.summary.sent }} / {{ s.row.summary.total }}</template>
            </el-table-column>
            <el-table-column label="Returned" width="110" align="center">
                <template slot-scope="s">
                    <span :class="s.row.summary.returned === s.row.summary.sent && s.row.summary.sent ? 'fr-ok' : ''">
                        {{ s.row.summary.returned }} / {{ s.row.summary.sent }}
                    </span>
                </template>
            </el-table-column>
            <el-table-column label="In Register" width="110" align="center">
                <template slot-scope="s">{{ s.row.summary.inRegister }}</template>
            </el-table-column>
            <el-table-column label="Uploaded" width="160">
                <template slot-scope="s">
                    <div>{{ shortDate(s.row.createdAt) }}</div>
                    <div v-if="s.row.createdBy" class="fr-sub">{{ s.row.createdBy }}</div>
                </template>
            </el-table-column>
            <el-table-column label="" width="140" align="center">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-view" @click="openBatch(s.row)">Open</el-button>
                    <el-button size="mini" type="text" icon="el-icon-delete" class="fr-del" @click="removeBatch(s.row)" />
                </template>
            </el-table-column>
        </el-table>

        <!-- ── Upload a repair list ─────────────────────────────────── -->
        <el-dialog title="Upload Repair List" :visible.sync="uploadVisible" width="760px">
            <div class="fr-up">
                <el-form label-width="110px" size="small" @submit.native.prevent>
                    <el-form-item label="File">
                        <input ref="uploadFile" type="file" accept=".xlsx,.xls,.csv" class="fr-file" @change="onFile" />
                        <div class="fr-hint">
                            Columns matched by name: IMEI/Serial, Stock ID, SKU, Product Name, Grade,
                            Device Cost, System Price, Issues.
                        </div>
                    </el-form-item>
                    <el-form-item label="Title">
                        <el-input v-model="upload.title" placeholder="e.g. Repair 19/08/2026" maxlength="120" />
                    </el-form-item>
                    <el-form-item label="Repairer">
                        <el-select v-model="upload.repairerId" filterable placeholder="Select a repairer" style="width:100%">
                            <el-option v-for="r in repairers" :key="r._id" :label="r.name" :value="r._id" />
                        </el-select>
                        <div v-if="!repairers.length" class="fr-hint fr-warn">
                            No repairers yet — add one on the Repairers page first.
                        </div>
                    </el-form-item>
                    <el-form-item label="Stock Source">
                        <el-select v-model="upload.stockSource" style="width:100%">
                            <el-option v-for="s in stockSources" :key="s" :label="s" :value="s" />
                        </el-select>
                        <div class="fr-hint">Used for any device this batch has to create when it comes back.</div>
                    </el-form-item>
                    <el-form-item label="Currency">
                        <el-radio-group v-model="upload.currency" size="small">
                            <el-radio-button v-for="c in currencies" :key="c" :label="c" />
                        </el-radio-group>
                    </el-form-item>
                </el-form>

                <div v-if="parsed.rows.length || parsed.bad.length" class="fr-preview">
                    <div class="fr-preview-head">
                        <b>{{ parsed.rows.length }}</b> device{{ parsed.rows.length === 1 ? '' : 's' }} ready
                        <span v-if="parsed.bad.length" class="fr-warn">· {{ parsed.bad.length }} row(s) skipped</span>
                    </div>
                    <el-table :data="parsed.rows.slice(0, 8)" size="mini" border>
                        <el-table-column prop="code" label="IMEI / Serial" min-width="150" />
                        <el-table-column prop="productName" label="Product" min-width="220" show-overflow-tooltip />
                        <el-table-column prop="grade" label="Grade" width="70" align="center" />
                        <el-table-column prop="issues" label="Issues" min-width="160" show-overflow-tooltip />
                    </el-table>
                    <div v-if="parsed.rows.length > 8" class="fr-hint">…and {{ parsed.rows.length - 8 }} more.</div>
                </div>
            </div>
            <span slot="footer">
                <el-button size="small" @click="uploadVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" :loading="uploading"
                    :disabled="!parsed.rows.length || !upload.title || !upload.repairerId" @click="submitUpload">
                    Create Batch
                </el-button>
            </span>
        </el-dialog>

        <!-- ── Batch detail ─────────────────────────────────────────── -->
        <el-dialog :title="batch ? batch.title : ''" :visible.sync="batchVisible" width="1120px" top="4vh"
            :before-close="beforeBatchClose" @closed="onBatchClosed">
            <div v-if="batch" class="fr-take">
                <div class="fr-stats">
                    <div class="fr-stat"><span>Repairer</span><b>{{ batch.repairerName }}</b></div>
                    <div class="fr-stat"><span>Devices</span><b>{{ stats.total }}</b></div>
                    <div class="fr-stat"><span>Sent</span><b>{{ stats.sent }}</b></div>
                    <div class="fr-stat"><span>Returned</span><b class="fr-ok">{{ stats.returned }}</b></div>
                    <div class="fr-stat"><span>In Register</span><b>{{ stats.inRegister }}</b></div>
                    <div class="fr-stat"><span>In Blackbelt</span><b>{{ stats.inBlackbelt }}</b></div>
                </div>

                <el-alert v-if="blackbeltPending" type="info" :closable="false" show-icon class="fr-alert">
                    {{ blackbeltPending }} device(s) haven't been checked against Blackbelt —
                    select rows and use the Check Blackbelt button below.
                </el-alert>

                <div class="fr-scan">
                    <el-input ref="scanInput" v-model="scanCode" size="small" class="fr-scan-input"
                        placeholder="Scan IMEI or serial…" prefix-icon="el-icon-full-screen" clearable
                        @keyup.enter.native="doScan" />
                    <el-button size="small" plain icon="el-icon-finished" :disabled="!selectableCount"
                        @click="selectAllRemaining">
                        Select All Remaining<template v-if="selectableCount"> ({{ selectableCount }})</template>
                    </el-button>
                    <el-button v-if="checked.length" size="small" plain @click="clearSelection">Clear</el-button>
                    <span class="fr-spacer" />
                    <el-radio-group v-model="lineFilter" size="small">
                        <el-radio-button label="all">All</el-radio-button>
                        <el-radio-button label="pending">To send</el-radio-button>
                        <el-radio-button label="out">Out</el-radio-button>
                        <el-radio-button label="back">Back</el-radio-button>
                    </el-radio-group>
                </div>
                <div v-if="scanMessage" :class="['fr-scan-msg', 'fr-msg-' + scanTone]">{{ scanMessage }}</div>

                <el-table :data="visibleLines" border size="mini" height="46vh" :row-key="r => r.code"
                    @row-click="onRowClick">
                    <el-table-column width="44" align="center">
                        <template slot-scope="s">
                            <el-checkbox class="fr-row-check" :value="isChecked(s.row)" :disabled="!selectable(s.row)" />
                        </template>
                    </el-table-column>
                    <el-table-column label="IMEI / Serial" min-width="150">
                        <template slot-scope="s">
                            <b>{{ s.row.code }}</b>
                            <el-tag v-if="s.row.draft" size="mini" type="info" effect="plain">unsaved</el-tag>
                            <el-tag v-else-if="s.row.unlisted" size="mini" type="warning" effect="plain">not on list</el-tag>
                            <div v-if="s.row.stockId" class="fr-sub">{{ s.row.stockId }}</div>
                        </template>
                    </el-table-column>
                    <!-- Editable until a device leaves: a scanned extra
                         arrives with nothing but its code, and a sheet line
                         may need correcting before it goes out. Blackbelt's
                         answer wins the display once it has one. -->
                    <el-table-column label="Product" min-width="210" show-overflow-tooltip>
                        <template slot-scope="s">
                            <span v-if="bbName(s.row)">{{ bbName(s.row) }}</span>
                            <span v-else-if="s.row.sent">{{ s.row.productName || '—' }}</span>
                            <el-input v-else :value="s.row.productName" size="mini" placeholder="Product"
                                @input="v => stageEdit(s.row, 'productName', v)" />
                        </template>
                    </el-table-column>
                    <el-table-column label="Grade" width="90" align="center">
                        <template slot-scope="s">
                            <span v-if="s.row.returnGrade">{{ s.row.returnGrade }}</span>
                            <span v-else-if="s.row.sent">{{ s.row.grade || '—' }}</span>
                            <el-select v-else :value="s.row.grade" size="mini" clearable placeholder="—"
                                class="fr-full" @input="v => stageEdit(s.row, 'grade', v)">
                                <el-option v-for="g in grades" :key="g" :label="g" :value="g" />
                            </el-select>
                        </template>
                    </el-table-column>
                    <el-table-column label="Issues" min-width="170" show-overflow-tooltip>
                        <template slot-scope="s">
                            <span v-if="s.row.sent">{{ s.row.issues || '—' }}</span>
                            <el-input v-else :value="s.row.issues" size="mini" placeholder="Fault"
                                @input="v => stageEdit(s.row, 'issues', v)" />
                        </template>
                    </el-table-column>
                    <el-table-column label="Blackbelt" width="90" align="center">
                        <template slot-scope="s">
                            <!-- Rows in the current lookup spin until it lands. -->
                            <i v-if="isChecking(s.row)" class="el-icon-loading fr-dim" title="Checking…" />
                            <i v-else-if="s.row.bbStatus === 'found'" class="el-icon-success fr-yes" title="Report found" />
                            <i v-else-if="s.row.bbStatus === 'none'" class="el-icon-error fr-no" title="No report" />
                            <i v-else-if="s.row.bbStatus === 'error'" class="el-icon-warning fr-warn-i"
                                :title="s.row.bbMessage || 'Lookup failed'" />
                            <i v-else-if="s.row.bbStatus === 'skipped'" class="el-icon-remove-outline fr-dim"
                                :title="s.row.bbMessage || 'Skipped'" />
                            <span v-else class="fr-dim" title="Not checked yet">—</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="In Register" width="95" align="center">
                        <template slot-scope="s">
                            <i v-if="s.row.deviceId" class="el-icon-success fr-yes" title="Matched to a stock record" />
                            <span v-else class="fr-dim" title="Not in our register">—</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="Repair Cost" width="100" align="right">
                        <template slot-scope="s">{{ s.row.repairCost == null ? '—' : money(s.row.repairCost) }}</template>
                    </el-table-column>
                    <el-table-column label="Status" width="120" align="center">
                        <template slot-scope="s">
                            <el-tag v-if="s.row.returned" size="mini" :type="outcomeTag(s.row.outcome)" effect="plain">
                                {{ outcomeLabel(s.row.outcome) }}
                            </el-tag>
                            <span v-else-if="s.row.sent" class="fr-out"><i class="el-icon-top-right" /> Out</span>
                            <span v-else class="fr-dim">—</span>
                        </template>
                    </el-table-column>
                    <!-- A line can only be dropped before its device leaves. -->
                    <el-table-column label="" width="50" align="center">
                        <template slot-scope="s">
                            <el-button v-if="!s.row.sent" size="mini" type="text" icon="el-icon-close"
                                class="fr-del" title="Remove from this batch"
                                @click.stop="removeLine(s.row)" />
                        </template>
                    </el-table-column>
                </el-table>
            </div>
            <span slot="footer" class="fr-foot">
                <!-- Scoped to the selection, like Incoming Stocks — lookups
                     are only spent on the devices actually being handled, so
                     with nothing selected there is nothing to check. -->
                <el-button v-if="batch && checkableCount" size="small" icon="el-icon-connection"
                    :loading="rechecking" :disabled="!checkableCount"
                    @click="recheck">Check Blackbelt ({{ checkableCount }})</el-button>
                <el-button v-if="batch && batch.lines.length" size="small" icon="el-icon-printer"
                    @click="openPrint">Print List</el-button>
                <span class="fr-spacer" />
                <span v-if="dirtyCount" class="fr-foot-note fr-warn">
                    {{ dirtyCount }} unsaved change{{ dirtyCount === 1 ? '' : 's' }}
                </span>
                <span v-if="checked.length" class="fr-foot-note">{{ checked.length }} selected</span>
                <!-- Scans, corrections and removals are worked locally and
                     written down here. Sending saves them first anyway. -->
                <el-button v-if="mode === 'send'" size="small" icon="el-icon-check" :loading="savingLines"
                    :disabled="!dirtyCount" @click="saveLines()">
                    Save<template v-if="dirtyCount"> ({{ dirtyCount }})</template>
                </el-button>
                <el-button size="small" @click="closeBatch">Close</el-button>
                <el-button v-if="mode === 'send'" type="primary" size="small" :loading="sending"
                    :disabled="!checked.length" @click="sendSelected">Send to Repairer</el-button>
                <el-button v-else type="primary" size="small" :disabled="!checked.length"
                    @click="openReturn">Return to Stock</el-button>
            </span>
        </el-dialog>

        <!-- ── Print a list ─────────────────────────────────────────── -->
        <!-- The groups are the filter tabs: what's still to go, what's at
             the repairer, what came back. Ticking rebuilds the preview, so
             the paper is always what you are looking at. -->
        <el-dialog title="Repair List" :visible.sync="printVisible" width="70%" top="4vh" append-to-body
            @closed="cleanupPrint">
            <div class="fr-print">
                <div class="fr-print-bar">
                    <span class="fr-print-label">Include</span>
                    <el-checkbox-group v-model="printPicks" size="small" @change="buildPrint">
                        <el-checkbox v-for="g in printBuckets" :key="g.key" :label="g.key" border>
                            {{ g.label }} <span class="fr-dim">({{ g.count }})</span>
                        </el-checkbox>
                    </el-checkbox-group>
                </div>
                <div class="fr-print-wrap">
                    <iframe v-if="printUrl" :src="printUrl" class="fr-print-frame" title="Repair list" />
                    <div v-else class="fr-print-empty">Tick at least one group to build the list.</div>
                </div>
            </div>
            <span slot="footer">
                <el-button size="small" icon="el-icon-printer" :disabled="!printUrl" @click="printList">Print</el-button>
                <el-button size="small" icon="el-icon-download" :disabled="!printUrl"
                    @click="downloadList">Download</el-button>
                <el-button size="small" @click="printVisible = false">Close</el-button>
            </span>
        </el-dialog>

        <!-- ── Return ───────────────────────────────────────────────── -->
        <el-dialog title="Return from Repair" :visible.sync="returnVisible" width="900px" top="5vh" append-to-body>
            <div class="fr-ret">
                <el-table :data="returnRows" border size="mini" max-height="320">
                    <el-table-column label="IMEI / Serial" min-width="140">
                        <template slot-scope="s"><b>{{ s.row.code }}</b></template>
                    </el-table-column>
                    <el-table-column label="Issues" min-width="150" show-overflow-tooltip>
                        <template slot-scope="s">{{ s.row.issues || '—' }}</template>
                    </el-table-column>
                    <el-table-column label="Outcome" width="150" align="center">
                        <template slot-scope="s">
                            <el-select :value="detail(s.row.code).outcome" size="mini" class="fr-full"
                                @input="v => setDetail(s.row.code, 'outcome', v)">
                                <el-option label="Repaired" value="repaired" />
                                <el-option label="Not repaired" value="not-repaired" />
                                <el-option label="Written off" value="written-off" />
                            </el-select>
                        </template>
                    </el-table-column>
                    <el-table-column label="Grade" width="100" align="center">
                        <template slot-scope="s">
                            <el-select :value="detail(s.row.code).grade" size="mini" clearable placeholder="—"
                                class="fr-full" @input="v => setDetail(s.row.code, 'grade', v)">
                                <el-option v-for="g in grades" :key="g" :label="g" :value="g" />
                            </el-select>
                        </template>
                    </el-table-column>
                    <el-table-column label="Repair Cost" width="130" align="center">
                        <template slot-scope="s">
                            <el-input-number :value="detail(s.row.code).repairCost" size="mini" :min="0" :precision="2"
                                :controls="false" class="fr-cost"
                                @input="v => setDetail(s.row.code, 'repairCost', v)" />
                        </template>
                    </el-table-column>
                </el-table>

                <div class="fr-ret-foot">
                    <div class="fr-ret-field">
                        <label>Return to</label>
                        <el-select v-model="returnLocation" size="small" placeholder="Select a location" class="fr-loc">
                            <el-option v-for="l in receiveLocations" :key="l" :label="l" :value="l" />
                        </el-select>
                    </div>
                    <span class="fr-spacer" />
                    <div class="fr-ret-total">
                        Repair cost total <b>{{ money(repairTotal) }}</b>
                    </div>
                </div>

                <el-checkbox v-model="sellOnReturn" class="fr-sell-toggle">
                    Sell these devices straight away
                </el-checkbox>
                <div v-if="sellOnReturn" class="fr-sell">
                    <div class="fr-sell-row">
                        <div class="fr-ret-field fr-grow">
                            <label>Customer</label>
                            <el-select v-model="sellForm.customerId" size="small" filterable class="fr-full"
                                placeholder="Select a customer…">
                                <el-option v-for="c in customers" :key="c._id" :value="c._id" :label="c.name" />
                            </el-select>
                        </div>
                        <div class="fr-ret-field">
                            <label>Currency</label>
                            <el-select v-model="sellForm.currency" size="small" style="width:100px">
                                <el-option v-for="c in currencies" :key="c" :label="c" :value="c" />
                            </el-select>
                        </div>
                    </div>
                    <el-table :data="sellableRows" border size="mini" max-height="200">
                        <el-table-column label="IMEI / Serial" min-width="150">
                            <template slot-scope="s"><b>{{ s.row.code }}</b></template>
                        </el-table-column>
                        <el-table-column label="Sale Price" width="150" align="center">
                            <template slot-scope="s">
                                <el-input-number v-model="sellPrices[s.row.code]" size="mini" :min="0" :precision="2"
                                    :controls="false" class="fr-cost" />
                            </template>
                        </el-table-column>
                    </el-table>
                    <div class="fr-hint">Only devices marked <b>Repaired</b> can be sold.</div>
                </div>
            </div>
            <span slot="footer">
                <el-button size="small" @click="returnVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" :loading="returning" :disabled="!returnLocation"
                    @click="submitReturn">{{ sellOnReturn ? 'Return & Sell' : 'Return to Stock' }}</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import {
    getRepairBatches, createRepairBatch, getRepairBatch, sendRepairBatch,
    returnRepairBatch, recheckRepairBatch, deleteRepairBatch,
    getRepairers, getRefurbCustomers,
    saveRepairLines
} from '@/api/refurbished'
import { buildRepairListPdf, repairListFileName, REPAIR_LIST_GROUPS } from '@/utils/repairListPdf'
import * as XLSX from 'xlsx-js-style'

const GRADES = ['A++', 'A+', 'A', 'B+', 'B', 'C+', 'C']
const CURRENCIES = ['AUD', 'CNY', 'HKD']
const STOCK_SOURCES = ['HK', 'iMobile', 'DICO', 'Exyon']
const RECEIVE_LOCATIONS = ['iMobile', 'Assigned To Exyon']
const CODE_RE = /^[A-Z0-9]{10,20}$/

// Supplier exports never agree on header spelling, so match on a squashed
// lowercase form rather than an exact key — same approach as Incoming Stocks.
const COLUMNS = {
    code: ['imeiserial', 'imei', 'serial', 'serialnumber', 'imeisn', 'sn'],
    stockId: ['stockid', 'stockno', 'id'],
    sku: ['sku'],
    productName: ['productname', 'product', 'description', 'name'],
    grade: ['grade', 'condition'],
    deviceCost: ['devicecost', 'cost', 'costprice'],
    systemPrice: ['systemprice', 'price'],
    issues: ['issues', 'issue', 'fault', 'faults', 'problem', 'problems']
}

function squash(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '')
}

export default {
    name: 'RefurbRepairs',
    data() {
        return {
            loading: false,
            batches: [],
            repairers: [],
            customers: [],
            grades: GRADES,
            currencies: CURRENCIES,
            stockSources: STOCK_SOURCES,
            receiveLocations: RECEIVE_LOCATIONS,

            uploadVisible: false,
            uploading: false,
            upload: { title: '', repairerId: '', stockSource: 'iMobile', currency: 'AUD' },
            parsed: { rows: [], bad: [] },

            batchVisible: false,
            batch: null,
            lineFilter: 'all',
            checked: [],
            scanCode: '',
            scanMessage: '',
            scanTone: 'ok',
            sending: false,
            rechecking: false,
            checkingCodes: [],
            // Local edits, held until Save (or Send, which saves first):
            // codes scanned in, codes whose detail was typed, codes dropped.
            savingLines: false,
            draftAdds: [],
            draftEdits: [],
            draftRemoves: [],

            printVisible: false,
            printPicks: [],
            printUrl: '',

            returnVisible: false,
            returning: false,
            returnLocation: '',
            returnDetails: {},
            sellOnReturn: false,
            sellForm: { customerId: '', currency: 'AUD' },
            sellPrices: {}
        }
    },
    computed: {
        // Before anything has been sent the dialog is a send list; once
        // devices are out it becomes a return list.
        mode() {
            if (!this.batch) return 'send'
            const anyToSend = (this.batch.lines || []).some(l => !l.sent)
            return anyToSend ? 'send' : 'return'
        },
        // Scanned rows float to the top, most recent first, so the last
        // thing scanned is always in view.
        visibleLines() {
            const all = (this.batch && this.batch.lines) || []
            const pos = l => this.checked.indexOf(l.code)
            const picked = all.filter(l => pos(l) >= 0).sort((a, b) => pos(a) - pos(b))
            const rest = all.filter(l => pos(l) < 0)
            const rows = [...picked, ...rest]
            if (this.lineFilter === 'pending') return rows.filter(l => !l.sent)
            if (this.lineFilter === 'out') return rows.filter(l => l.sent && !l.returned)
            if (this.lineFilter === 'back') return rows.filter(l => l.returned)
            return rows
        },
        // Lines that can still be ticked in the current mode.
        selectableCount() {
            return ((this.batch && this.batch.lines) || [])
                .filter(l => this.selectable(l) && !this.checked.includes(l.code)).length
        },
        // Selected rows Blackbelt hasn't answered "found" for — exactly what
        // a Check Blackbelt click looks up, same as Incoming Stocks. Nothing
        // selected means nothing to check, and the button hides.
        checkableCodes() {
            if (!this.batch) return []
            const byCode = new Map((this.batch.lines || []).map(l => [l.code, l]))
            return this.checked.filter(c => {
                const l = byCode.get(c)
                return l && l.bbStatus !== 'found'
            })
        },
        checkableCount() {
            return this.checkableCodes.length
        },
        // Counted off the visible lines rather than the server's summary so
        // unsaved scans and removals show in the totals straight away.
        stats() {
            const lines = (this.batch && this.batch.lines) || []
            return {
                total: lines.length,
                sent: lines.filter(l => l.sent).length,
                returned: lines.filter(l => l.returned).length,
                inRegister: lines.filter(l => l.deviceId).length,
                inBlackbelt: lines.filter(l => l.bbStatus === 'found').length
            }
        },
        dirtyCount() {
            return this.draftAdds.length + this.draftEdits.length + this.draftRemoves.length
        },
        blackbeltPending() {
            return ((this.batch && this.batch.lines) || []).filter(l => l.bbStatus !== "found").length
        },
        // Only groups this batch actually has — an empty one never shows.
        printBuckets() {
            const lines = (this.batch && this.batch.lines) || []
            return REPAIR_LIST_GROUPS
                .map(g => ({ key: g.key, label: g.label, count: lines.filter(g.test).length }))
                .filter(g => g.count)
        },
        returnRows() {
            const lines = (this.batch && this.batch.lines) || []
            return lines.filter(l => this.checked.includes(l.code))
        },
        sellableRows() {
            return this.returnRows.filter(r => this.detail(r.code).outcome === 'repaired')
        },
        repairTotal() {
            return this.returnRows.reduce((s, r) => s + (Number(this.detail(r.code).repairCost) || 0), 0)
        }
    },
    created() {
        this.loadBatches()
        this.loadRepairers()
    },
    methods: {
        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || fallback
        },
        money(v) {
            return (Number(v) || 0).toFixed(2)
        },
        shortDate(v) {
            if (!v) return '—'
            const d = new Date(v)
            return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-AU')
        },
        bbName(l) {
            const bb = l.bbDevice || {}
            return [bb.model, bb.storage, bb.color].filter(Boolean).join(' ')
        },
        outcomeLabel(o) {
            return { repaired: 'Repaired', 'not-repaired': 'Not repaired', 'written-off': 'Written off' }[o] || 'Returned'
        },
        outcomeTag(o) {
            if (o === 'repaired') return 'success'
            if (o === 'written-off') return 'danger'
            return 'warning'
        },

        // ── batches ──────────────────────────────────────────────────
        async loadBatches() {
            this.loading = true
            try {
                const r = await getRepairBatches()
                this.batches = r.rows || []
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load repair batches'))
            } finally {
                this.loading = false
            }
        },
        async loadRepairers() {
            try {
                const r = await getRepairers({ status: 'active' })
                this.repairers = r.repairers || []
            } catch (e) {
                this.repairers = []
            }
        },

        // ── upload ───────────────────────────────────────────────────
        openUpload() {
            this.upload = { title: '', repairerId: '', stockSource: 'iMobile', currency: 'AUD' }
            this.parsed = { rows: [], bad: [] }
            if (this.$refs.uploadFile) this.$refs.uploadFile.value = ''
            this.uploadVisible = true
            this.loadRepairers()
        },
        onFile(e) {
            const file = e.target.files && e.target.files[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = ev => {
                try {
                    const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' })
                    // The sample workbook carries a scratch sheet alongside the
                    // export, so prefer a sheet that actually has an IMEI column.
                    let rows = []
                    for (const name of wb.SheetNames) {
                        const sheet = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' })
                        if (!sheet.length) continue
                        const keys = Object.keys(sheet[0]).map(squash)
                        if (COLUMNS.code.some(c => keys.includes(c))) { rows = sheet; break }
                    }
                    this.parsed = this.parseRows(rows)
                    if (!this.upload.title) {
                        this.upload.title = String(file.name).replace(/\.(xlsx|xls|csv)$/i, '')
                    }
                } catch (err) {
                    console.error(err)
                    this.$message.error('Could not read that file.')
                }
            }
            reader.readAsArrayBuffer(file)
        },
        parseRows(sheet) {
            const rows = []
            const bad = []
            const seen = new Set()
            sheet.forEach((raw, i) => {
                const map = {}
                for (const k of Object.keys(raw)) map[squash(k)] = raw[k]
                const pick = names => {
                    for (const n of names) if (map[n] !== undefined && map[n] !== '') return map[n]
                    return ''
                }
                const code = String(pick(COLUMNS.code)).replace(/[\s-]/g, '').trim().toUpperCase()
                if (!CODE_RE.test(code)) { bad.push({ row: i + 2, reason: 'No usable IMEI / serial', code }); return }
                if (seen.has(code)) { bad.push({ row: i + 2, reason: 'Duplicate', code }); return }
                seen.add(code)
                rows.push({
                    code,
                    stockId: String(pick(COLUMNS.stockId) || '').trim(),
                    sku: String(pick(COLUMNS.sku) || '').trim().toUpperCase(),
                    productName: String(pick(COLUMNS.productName) || '').trim(),
                    grade: String(pick(COLUMNS.grade) || '').trim().toUpperCase(),
                    deviceCost: Number(pick(COLUMNS.deviceCost)) || null,
                    systemPrice: Number(pick(COLUMNS.systemPrice)) || null,
                    issues: String(pick(COLUMNS.issues) || '').trim()
                })
            })
            return { rows, bad }
        },
        async submitUpload() {
            this.uploading = true
            try {
                const r = await createRepairBatch({ ...this.upload, rows: this.parsed.rows })
                this.$message.success(
                    `${this.parsed.rows.length} device(s) added` +
                    (r.inRegister ? ` · ${r.inRegister} already in the register` : '')
                )
                this.uploadVisible = false
                this.loadBatches()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to create the batch'))
            } finally {
                this.uploading = false
            }
        },
        async removeBatch(row) {
            // Devices still at the repairer would be left stranded, so the
            // warning says what will happen to them rather than refusing.
            const out = Math.max(0, (row.summary.sent || 0) - (row.summary.returned || 0))
            const message = out
                ? `"${row.title}" still has ${out} device(s) out for repair. ` +
                  'Removing the batch puts them back where they were and loses the repair record.'
                : `Remove "${row.title}"?`
            try {
                await this.$confirm(message, out ? 'Devices are still out' : 'Confirm', {
                    type: 'warning',
                    confirmButtonText: out ? 'Remove anyway' : 'Remove',
                    cancelButtonText: 'Cancel'
                })
            } catch (e) { return }
            try {
                const r = await deleteRepairBatch(row._id, out > 0)
                this.$message.success(r.message || 'Batch removed')
                this.loadBatches()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to remove the batch'))
            }
        },

        // ── batch dialog ─────────────────────────────────────────────
        async openBatch(row) {
            this.checked = []
            this.draftAdds = []
            this.draftEdits = []
            this.draftRemoves = []
            this.lineFilter = 'all'
            this.scanCode = ""
            this.scanMessage = ""
            this.batchVisible = true
            await this.refreshBatch(row._id)
            this.focusScan()
        },
        async refreshBatch(id) {
            try {
                const r = await getRepairBatch(id || this.batch._id)
                this.batch = r.batch
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load the batch'))
            }
        },
        onBatchClosed() {
            this.printVisible = false
            this.batch = null
            this.checked = []
            this.draftAdds = []
            this.draftEdits = []
            this.draftRemoves = []
            this.scanCode = ""
            this.scanMessage = ""
        },
        // Unsaved work only lives in the page, so closing has to say so.
        beforeBatchClose(done) {
            if (!this.dirtyCount) { done(); return }
            this.$confirm(
                `This list has ${this.dirtyCount} unsaved change(s). Close and lose them?`,
                'Unsaved changes',
                { type: 'warning', confirmButtonText: 'Discard', cancelButtonText: 'Keep editing' }
            ).then(() => done()).catch(() => {})
        },
        closeBatch() {
            this.beforeBatchClose(() => { this.batchVisible = false })
        },
        // Only lines that can still move in the current mode are tickable.
        selectable(row) {
            return this.mode === 'send' ? !row.sent : row.sent && !row.returned
        },
        isChecked(row) {
            return this.checked.includes(row.code)
        },
        onRowClick(row, column, event) {
            if (!this.selectable(row)) return
            if (event && event.target && event.target.closest &&
                event.target.closest('.el-select, .el-select-dropdown, input, textarea, button, a')) return
            const i = this.checked.indexOf(row.code)
            if (i >= 0) this.checked.splice(i, 1)
            else this.checked.unshift(row.code)
        },
        // Which rows the in-flight Check Blackbelt is looking up. Frozen at
        // click time so the spinners do not vanish as answers land.
        isChecking(row) {
            return this.rechecking && this.checkingCodes.includes(row.code)
        },
        say(tone, message) {
            this.scanTone = tone
            this.scanMessage = message
        },
        focusScan() {
            this.$nextTick(() => {
                const el = this.$refs.scanInput
                if (el && el.focus) el.focus()
            })
        },
        // Scanning is entirely local — an unlisted code joins the list as a
        // draft row, and nothing reaches the server until Save or Send.
        doScan() {
            const code = String(this.scanCode || '').replace(/[\s-]/g, '').trim().toUpperCase()
            this.scanCode = ''
            this.focusScan()
            if (!code) return
            if (!CODE_RE.test(code)) {
                this.say('error', `"${code}" isn't a valid IMEI or serial`)
                return
            }
            const line = ((this.batch && this.batch.lines) || []).find(l => l.code === code)
            if (!line) {
                // Not on the uploaded list — add it as an extra so the
                // operator can type the detail in the row.
                if (this.mode !== 'send') {
                    this.say('error', `${code} isn't on this repair list`)
                    return
                }
                this.addExtra(code)
                return
            }
            if (this.checked.includes(code)) {
                this.say('warn', `${code} was already scanned`)
                return
            }
            if (!this.selectable(line)) {
                this.say('warn', line.returned ? `${code} is already back` : `${code} has already been sent`)
                return
            }
            this.checked.unshift(code)
            this.say('ok', this.mode === 'send' ? `${code} scanned to send` : `${code} scanned to return`)
        },
        // A scanned-but-unlisted code joins the list on the spot, ticked and
        // ready for its detail to be typed. Every field it will ever need is
        // seeded now — Vue 2 can't track keys added to a row later.
        addExtra(code) {
            this.batch.lines.push({
                no: (this.batch.lines || []).length + 1,
                code,
                stockId: '', sku: '', productName: '', model: '', color: '', storage: '',
                grade: '', deviceCost: null, systemPrice: null, issues: '',
                bbStatus: '', bbMessage: '', bbReportId: '', bbDevice: null,
                deviceId: null, previousStatus: '', previousLocation: '',
                unlisted: true,
                // Not written down yet — cleared when the save comes back.
                draft: true,
                sent: false, sentAt: null, sentBy: null,
                returned: false, returnedAt: null, returnedBy: null,
                outcome: '', repairCost: null, returnGrade: '', committedAt: null
            })
            if (!this.draftAdds.includes(code)) this.draftAdds.push(code)
            if (!this.checked.includes(code)) this.checked.unshift(code)
            this.say('warn', `${code} isn't on the list — added, fill in its details`)
        },
        // Typed edits land on the row and flag it for the next save; a draft
        // row carries its own detail, so it needs no separate flag.
        stageEdit(row, field, value) {
            this.$set(row, field, value)
            if (!row.draft && !this.draftEdits.includes(row.code)) this.draftEdits.push(row.code)
        },
        // Dropping a row is local too. A draft was never written down, so
        // there is nothing to confirm — it is just undoing a scan.
        async removeLine(row) {
            if (!row.draft) {
                try {
                    await this.$confirm(`Remove ${row.code} from this batch?`, 'Confirm', {
                        type: 'warning', confirmButtonText: 'Remove', cancelButtonText: 'Cancel'
                    })
                } catch (e) { return }
            }
            const drop = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1) }
            const i = this.batch.lines.findIndex(l => l.code === row.code)
            if (i >= 0) this.batch.lines.splice(i, 1)
            drop(this.checked, row.code)
            drop(this.draftEdits, row.code)
            if (this.draftAdds.includes(row.code)) drop(this.draftAdds, row.code)
            else if (!this.draftRemoves.includes(row.code)) this.draftRemoves.push(row.code)
            this.say('ok', row.draft ? `${row.code} dropped` : `${row.code} removed — save to confirm`)
        },
        // Writes the whole set of local changes down in one call. Returns
        // false if it failed, so the callers that save first can stop.
        async saveLines(opts) {
            if (!this.dirtyCount) return true
            const quiet = !!(opts && opts.quiet)
            const byCode = new Map((this.batch.lines || []).map(l => [l.code, l]))
            const detail = code => {
                const l = byCode.get(code)
                return l && { code, productName: l.productName, grade: l.grade, issues: l.issues }
            }
            const payload = {
                add: this.draftAdds.map(detail).filter(Boolean),
                update: this.draftEdits.map(detail).filter(Boolean),
                remove: this.draftRemoves.slice()
            }
            this.savingLines = true
            try {
                const r = await saveRepairLines(this.batch._id, payload)
                this.draftAdds = []
                this.draftEdits = []
                this.draftRemoves = []
                const skipped = r.skipped || []
                if (skipped.length) {
                    this.$notify.warning({
                        title: 'Some rows were skipped',
                        message: skipped.map(s => `${s.code}: ${s.reason}`).join('\n'),
                        duration: 0
                    })
                }
                await this.refreshBatch()
                this.loadBatches()
                if (!quiet) this.$message.success(r.message || 'Saved')
                return true
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to save the list'))
                return false
            } finally {
                this.savingLines = false
            }
        },
        selectAllRemaining() {
            const add = ((this.batch && this.batch.lines) || [])
                .filter(l => this.selectable(l) && !this.checked.includes(l.code))
                .map(l => l.code)
            if (!add.length) return
            this.checked = this.checked.concat(add)
            this.say('ok', `${add.length} device(s) selected`)
        },
        clearSelection() {
            this.checked = []
            this.scanMessage = ''
        },
        async recheck() {
            if (this.dirtyCount && !(await this.saveLines({ quiet: true }))) return
            this.checkingCodes = this.checkableCodes.slice()
            this.rechecking = true
            try {
                const r = await recheckRepairBatch(this.batch._id, { codes: this.checkingCodes })
                this.$message.success(r.queued ? `Checked ${r.queued} device(s)` : (r.message || 'Nothing to check'))
                await this.refreshBatch()
            } catch (e) {
                this.$message.error(this.msg(e, 'Blackbelt check failed'))
            } finally {
                this.rechecking = false
                this.checkingCodes = []
            }
        },
        async sendSelected() {
            if (!this.checked.length) return
            this.sending = true
            try {
                // Anything scanned in or corrected goes down first — a batch
                // must never leave carrying edits that were never saved.
                if (this.dirtyCount && !(await this.saveLines({ quiet: true }))) return
                const r = await sendRepairBatch(this.batch._id, { codes: this.checked })
                const skipped = (r.skipped || []).length
                this.$message.success(`${r.sent} device(s) sent` + (skipped ? ` · ${skipped} skipped` : ''))
                if (skipped) {
                    this.$notify.warning({
                        title: 'Some devices were skipped',
                        message: r.skipped.map(s => `${s.code}: ${s.reason}`).join('\n'),
                        duration: 0
                    })
                }
                this.checked = []
                await this.refreshBatch()
                this.loadBatches()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to send the devices'))
            } finally {
                this.sending = false
            }
        },

        // ── print ────────────────────────────────────────────────────
        openPrint() {
            // Opens on whatever tab is showing, so the button prints what
            // the operator is already looking at.
            const fromTab = { pending: 'remaining', out: 'out', back: 'back' }[this.lineFilter]
            const present = this.printBuckets.map(g => g.key)
            const picked = fromTab && present.includes(fromTab) ? [fromTab] : present
            this.printPicks = picked
            this.printVisible = true
            this.buildPrint()
        },
        buildPrint() {
            this.revokePrintUrl()
            if (!this.printPicks.length) return
            try {
                // #toolbar=0 hides the browser viewer chrome — the footer
                // buttons cover print and download.
                this.printUrl = this.printDoc().output('bloburl') + '#toolbar=0'
            } catch (e) {
                console.error('Repair list PDF failed:', e)
                this.$message.error('Could not build the list.')
            }
        },
        printDoc() {
            return buildRepairListPdf({ batch: this.batch, picks: this.printPicks })
        },
        printList() {
            if (!this.printPicks.length) return
            const doc = this.printDoc()
            doc.autoPrint()
            const w = window.open(doc.output('bloburl'))
            if (!w) this.$message.warning('Pop-up blocked — use Download instead.')
        },
        downloadList() {
            if (!this.printPicks.length) return
            this.printDoc().save(repairListFileName(this.batch, this.printPicks))
        },
        revokePrintUrl() {
            if (this.printUrl) {
                try { URL.revokeObjectURL(this.printUrl.split('#')[0]) } catch (e) { /* ignore */ }
            }
            this.printUrl = ''
        },
        cleanupPrint() {
            this.revokePrintUrl()
            this.printPicks = []
        },

        // ── return ───────────────────────────────────────────────────
        detail(code) {
            return this.returnDetails[code] || { outcome: 'repaired', grade: '', repairCost: undefined }
        },
        setDetail(code, field, v) {
            const d = { ...this.detail(code) }
            d[field] = v
            this.$set(this.returnDetails, code, d)
        },
        async openReturn() {
            if (!this.checked.length) return
            // Seed a row per selected device so the running total tracks edits.
            const seededDetails = {}
            const seededPrices = {}
            for (const code of this.checked) {
                seededDetails[code] = { outcome: 'repaired', grade: '', repairCost: undefined }
                seededPrices[code] = undefined
            }
            this.returnDetails = seededDetails
            this.sellPrices = seededPrices
            this.returnLocation = ''
            this.sellOnReturn = false
            this.sellForm = { customerId: '', currency: this.batch.currency || 'AUD' }
            this.returnVisible = true
            try {
                const r = await getRefurbCustomers()
                this.customers = r.customers || []
            } catch (e) {
                this.customers = []
            }
        },
        async submitReturn() {
            if (!this.returnLocation) { this.$message.warning('Choose where they go back to'); return }
            if (this.sellOnReturn && !this.sellForm.customerId) {
                this.$message.warning('Select a customer')
                return
            }
            this.returning = true
            try {
                const payload = {
                    codes: this.checked,
                    location: this.returnLocation,
                    details: this.returnDetails
                }
                if (this.sellOnReturn) {
                    const prices = {}
                    for (const r of this.sellableRows) {
                        if (this.sellPrices[r.code] != null && this.sellPrices[r.code] !== '') {
                            prices[r.code] = this.sellPrices[r.code]
                        }
                    }
                    payload.sell = {
                        customerId: this.sellForm.customerId,
                        currency: this.sellForm.currency,
                        gstRate: 0.1,
                        prices
                    }
                }
                const r = await returnRepairBatch(this.batch._id, payload)
                const skipped = (r.skipped || []).length
                this.$message.success(
                    `${r.returned} device(s) returned` +
                    (r.order ? ` · ${r.order.orderNo} created` : '') +
                    (skipped ? ` · ${skipped} skipped` : '')
                )
                this.returnVisible = false
                this.checked = []
                await this.refreshBatch()
                this.loadBatches()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to return the devices'))
            } finally {
                this.returning = false
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.fr-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.fr-title { font-size: 16px; font-weight: 600; color: #303133; }
.fr-spacer { flex: 1; }
.fr-link { font-weight: 600; padding: 0; }
.fr-sub { font-size: 11px; color: #909399; line-height: 1.3; }
.fr-dim { color: #c0c4cc; }
.fr-ok { color: #67c23a; font-weight: 600; }
.fr-out { color: #e6a23c; font-weight: 600; }
.fr-yes { color: #67c23a; font-size: 15px; }
.fr-no { color: #f56c6c; font-size: 15px; }
.fr-warn-i { color: #e6a23c; font-size: 15px; }
.fr-warn { color: #e6a23c; }
.fr-del { color: #f56c6c; }
.fr-hint { font-size: 12px; color: #909399; line-height: 1.5; margin-top: 4px; }
.fr-file { font-size: 13px; }

.fr-stats { display: flex; align-items: center; gap: 18px; margin-bottom: 10px; flex-wrap: wrap; }
.fr-stat {
    display: flex;
    flex-direction: column;
    span { font-size: 11px; color: #909399; text-transform: uppercase; letter-spacing: .04em; }
    b { font-size: 15px; color: #303133; }
}
.fr-preview { margin-top: 12px; }
.fr-preview-head { font-size: 13px; margin-bottom: 6px; }
.fr-foot { display: flex; align-items: center; gap: 10px; }
.fr-foot-note { font-size: 12px; color: #909399; }
.fr-row-check { pointer-events: none; }
.fr-take ::v-deep .el-table__row { cursor: pointer; }

.fr-alert { margin-bottom: 10px; }
.fr-scan { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.fr-scan-input { width: 260px; }
.fr-scan-msg { font-size: 12px; margin-bottom: 8px; padding: 5px 10px; border-radius: 4px; }
.fr-msg-ok { background: #f0f9eb; color: #67c23a; }
.fr-msg-warn { background: #fdf6ec; color: #e6a23c; }
.fr-msg-error { background: #fef0f0; color: #f56c6c; }

.fr-print { display: flex; flex-direction: column; gap: 12px; }
.fr-print-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.fr-print-label { font-size: 12px; font-weight: 600; color: #909399; text-transform: uppercase; letter-spacing: .04em; }
.fr-print-wrap { height: 62vh; border: 1px solid #ebeef5; border-radius: 4px; background: #f5f7fa; }
.fr-print-frame { width: 100%; height: 100%; border: 0; }
.fr-print-empty { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 13px; color: #909399; }

.fr-ret { display: flex; flex-direction: column; gap: 12px; }
.fr-ret-foot { display: flex; align-items: flex-end; gap: 16px; }
.fr-ret-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    label { font-size: 12px; font-weight: 600; color: #606266; }
}
.fr-grow { flex: 1; }
.fr-full { width: 100%; }
.fr-loc { width: 220px; }
.fr-cost { width: 110px; }
.fr-ret-total { font-size: 13px; color: #606266; }
.fr-sell-toggle { margin-top: 4px; }
.fr-sell {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: #f8f9fb;
    border: 1px dashed #dcdfe6;
    border-radius: 6px;
}
.fr-sell-row { display: flex; gap: 14px; align-items: flex-end; }
</style>
