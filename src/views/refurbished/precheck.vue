<template>
    <!--
        Refurbished Device → Pending Stock 待入库 (user ask 2026-10-20; first
        named Pre-Check): a phone
        supplier's devices listed before they are checked in Blackbelt and
        loaded into Stock — IMEI (required), Device, Supplier, Assign, Note. Its own
        records (refurb_precheck); "Added to Stock" is ticked once the IMEI is
        in their Stock — from the row's Add to Stock (Blackbelt lookup, then
        the Stock page's own add) or typed in on the Stock page. Phone
        suppliers only, each seeing just their own list.
    -->
    <div class="rpc app-container">
        <div class="rpc-filters">
            <el-input v-model="query.search" size="small" clearable class="f-search"
                :placeholder="$tp('Search IMEI / device / supplier / assign / note…')" prefix-icon="el-icon-search"
                @keyup.enter.native="reload" @clear="reload" />
            <el-select v-if="mySuppliers.length" v-model="query.supplierId" size="small" clearable filterable
                class="f-supplier" :placeholder="$tp('All suppliers')" @change="reload">
                <el-option v-for="s in mySuppliers" :key="s._id" :label="s.name" :value="s._id" />
            </el-select>
            <el-radio-group v-model="query.added" size="small" @change="reload">
                <el-radio-button label="">{{ $tp('All') }}</el-radio-button>
                <el-radio-button label="no">{{ $tp('Not in Stock yet') }}</el-radio-button>
                <el-radio-button label="yes">{{ $tp('Added to Stock') }}</el-radio-button>
            </el-radio-group>
            <span class="rpc-count">{{ $tp('{n} device(s)', { n: total }) }}</span>
            <span class="rpc-spacer" />
            <el-button v-if="canManage && selected.length" size="small" type="danger" plain icon="el-icon-delete" @click="removeSelected">
                {{ $tp('Remove {n}', { n: selected.length }) }}</el-button>
            <el-button v-if="canManage" size="small" type="primary" icon="el-icon-plus" @click="openAdd">{{ $tp('Add Device') }}</el-button>
            <el-button size="small" icon="el-icon-refresh" @click="load">{{ $tp('Refresh') }}</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini" height="calc(100vh - 214px)" row-key="_id"
            :row-class-name="rowClass" :empty-text="$tp('No devices yet — add them with Add Device.')"
            @selection-change="v => (selected = v)">
            <el-table-column v-if="canManage" type="selection" width="38" align="center" />
            <el-table-column :label="$tp('IMEI')" min-width="170">
                <template slot-scope="s"><b class="rpc-mono">{{ s.row.imei }}</b></template>
            </el-table-column>
            <el-table-column :label="$tp('Device')" min-width="190" show-overflow-tooltip>
                <template slot-scope="s">{{ oneLine(s.row.device) || '—' }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Supplier')" min-width="140" show-overflow-tooltip>
                <template slot-scope="s">{{ (s.row.supplier && s.row.supplier.name) || '—' }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Assign')" min-width="120" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.assign || '—' }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Note')" min-width="200" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.note || '—' }}</template>
            </el-table-column>
            <!-- ticked once the IMEI is in their Stock (2026-10-20) -->
            <el-table-column :label="$tp('Added to Stock')" width="120" align="center">
                <template slot-scope="s">
                    <el-tooltip :disabled="!s.row.addedToStock" placement="top"
                        :content="s.row.addedToStock ? fmtWhen(s.row.addedToStock.at) + (s.row.addedToStock.by ? ' · ' + s.row.addedToStock.by : '') : ''">
                        <el-checkbox :value="!!s.row.addedToStock" disabled class="rpc-added-box" />
                    </el-tooltip>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Added')" width="140">
                <template slot-scope="s">
                    <div>{{ fmtWhen(s.row.createdAt) }}</div>
                    <div class="rpc-dim">{{ s.row.createdBy || '' }}</div>
                </template>
            </el-table-column>
            <el-table-column v-if="canManage" label="" width="190" align="center">
                <template slot-scope="s">
                    <el-button v-if="!s.row.addedToStock" size="mini" type="primary" plain class="rpc-tostock" icon="el-icon-box"
                        @click="openToStock(s.row)">{{ $tp('Add to Stock') }}</el-button>
                    <el-button size="mini" type="text" icon="el-icon-edit" :title="$tp('Edit')" @click="openEdit(s.row)" />
                    <el-button size="mini" type="text" icon="el-icon-delete" class="rpc-del" :title="$tp('Remove')" @click="remove(s.row)" />
                </template>
            </el-table-column>
        </el-table>
        <el-pagination v-if="total > query.pageSize" class="rpc-pager" small background layout="total, prev, pager, next"
            :total="total" :page-size="query.pageSize" :current-page.sync="query.page" @current-change="load" />

        <!-- Add Device / Edit (user 2026-10-20: "make the add device a dialog").
             Adding keeps the dialog open for the next one — scan or type the
             IMEI, Enter adds; then every field clears (user 2026-10-21). -->
        <el-dialog :title="editRow ? $tp('Edit {name}', { name: editRow.imei }) : $tp('Add Device')" :visible.sync="dialogVisible"
            :width="narrow ? '94%' : '520px'" append-to-body :close-on-click-modal="false" @opened="focusImei" @closed="onClosed">
            <el-form label-width="90px" size="small" @submit.native.prevent>
                <el-form-item :label="$tp('IMEI')" required>
                    <el-input ref="imei" v-model="form.imei" maxlength="24" clearable :placeholder="$tp('IMEI or serial')"
                        @keyup.enter.native="save" />
                </el-form-item>
                <el-form-item :label="$tp('Device')">
                    <el-input v-model="form.device" type="textarea" :autosize="{ minRows: 2, maxRows: 5 }" resize="none" maxlength="300"
                        :placeholder="$tp('e.g. iPhone 13 Pro 128GB Blue')" />
                </el-form-item>
                <el-form-item :label="$tp('Supplier')">
                    <el-select v-model="form.supplierId" clearable filterable style="width:100%" :placeholder="$tp('None')"
                        :no-data-text="$tp('No suppliers yet — add them on the Suppliers page')">
                        <el-option v-for="s in mySuppliers" :key="s._id" :label="s.name" :value="s._id" />
                    </el-select>
                </el-form-item>
                <!-- who it is assigned to — plain text (2026-10-20) -->
                <el-form-item :label="$tp('Assign')">
                    <el-input v-model="form.assign" maxlength="100" clearable />
                </el-form-item>
                <el-form-item :label="$tp('Note')">
                    <el-input v-model="form.note" type="textarea" :rows="2" resize="none" maxlength="500" />
                </el-form-item>
            </el-form>
            <div v-if="!editRow && addedHere.length" class="rpc-added">
                <i class="el-icon-success" /> {{ $tp('{n} added', { n: addedHere.length }) }}:
                <span class="rpc-mono">{{ addedHere.slice(-3).reverse().join(' · ') }}</span><template v-if="addedHere.length > 3"> …</template>
            </div>
            <div slot="footer">
                <el-button size="small" @click="dialogVisible = false">{{ $tp(editRow || !addedHere.length ? 'Close' : 'Done') }}</el-button>
                <el-button size="small" type="primary" :icon="editRow ? 'el-icon-check' : 'el-icon-plus'" :loading="saving" @click="save">
                    {{ editRow ? $tp('Save') : $tp('Add') }}</el-button>
            </div>
        </el-dialog>

        <!-- Add to Stock (user 2026-10-20): the IMEI checked in Blackbelt
             first (the Stock page's lookup), then the details the Stock page
             asks for; saved through the Stock page's own add, which ticks
             "Added to Stock" here. -->
        <el-dialog :title="$tp('Add to Stock')" :visible.sync="stockVisible" :width="narrow ? '94%' : '600px'"
            append-to-body :close-on-click-modal="false" custom-class="rpc-stock-dlg">
            <template v-if="stockRow">
                <div class="rpc-st-head">
                    <b class="rpc-mono">{{ stockRow.imei }}</b>
                    <span v-if="stockRow.device" class="rpc-dim"> · {{ stockRow.device }}</span>
                </div>

                <!-- the Blackbelt check -->
                <div v-if="lookupState === 'checking'" class="rpc-st-checking"><i class="el-icon-loading" /> {{ $tp('Checking Blackbelt…') }}</div>
                <div v-else-if="lookupState === 'ok'" class="rpc-st-ident">
                    <div class="rpc-st-ok"><i class="el-icon-circle-check" /> {{ $tp('Blackbelt report found') }}
                        <span v-if="stockForm.blackbeltStatus" class="rpc-dim"> · {{ stockForm.blackbeltStatus }}</span></div>
                    <div class="rpc-st-grid">
                        <div v-if="!modelUnlocked"><span>{{ $tp('Model') }}</span><b>{{ identModel || '—' }}</b></div>
                        <div><span>{{ $tp('Colour') }}</span><b>{{ stockForm.color || '—' }}</b></div>
                        <div><span>{{ $tp('Storage') }}</span><b>{{ stockForm.storage || '—' }}</b></div>
                        <div><span>{{ $tp('Battery') }}</span><b>{{ Number(stockForm.batteryHealth) > 0 ? stockForm.batteryHealth + '%' : '—' }}<template v-if="stockForm.batteryCycleCount != null"> · {{ $tp('{n} cycles', { n: stockForm.batteryCycleCount }) }}</template></b></div>
                        <div v-if="stockForm.serialNumber"><span>{{ $tp('Serial') }}</span><b>{{ stockForm.serialNumber }}</b></div>
                    </div>
                </div>
                <el-alert v-else-if="lookupState === 'known'" type="warning" :closable="false" show-icon
                    :title="$tp('This IMEI is already in Stock.')" class="rpc-st-alert" />
                <el-alert v-else-if="lookupState" :type="lookupState === 'error' ? 'error' : lookupState === 'notFound' ? 'warning' : 'info'"
                    :closable="false" show-icon :title="lookupMessage" class="rpc-st-alert">
                    <el-button type="text" size="mini" icon="el-icon-refresh" @click="lookup">{{ $tp('Check again') }}</el-button>
                </el-alert>

                <el-form v-if="lookupState && lookupState !== 'checking' && lookupState !== 'known'" label-width="100px" size="small"
                    class="rpc-st-form" @submit.native.prevent>
                    <!-- no Blackbelt report (or one without a model): typed, as on the Stock page -->
                    <el-form-item v-if="canEditModel" :label="$tp('Model')">
                        <el-input v-model="stockForm.model" :placeholder="$tp('e.g. iPhone 13')" />
                    </el-form-item>
                    <template v-if="canEditIdentity">
                        <el-form-item :label="$tp('Colour')">
                            <el-input :value="stockForm.color" :placeholder="$tp('e.g. BLACK')" @input="v => stockForm.color = String(v || '').toUpperCase()" />
                        </el-form-item>
                        <el-form-item :label="$tp('Storage')">
                            <el-select v-model="stockForm.storage" clearable filterable allow-create default-first-option
                                :placeholder="$tp('Select storage')" style="width:100%">
                                <el-option v-for="x in STORAGES" :key="x" :label="x" :value="x" />
                            </el-select>
                        </el-form-item>
                    </template>
                    <el-form-item :label="$tp('Grade')">
                        <el-radio-group v-model="stockForm.grade" size="small" class="rpc-grades">
                            <el-radio-button v-for="g in GRADES" :key="g" :label="g" />
                        </el-radio-group>
                    </el-form-item>
                    <el-form-item :label="$tp('Price')">
                        <el-input v-model="stockForm.costPrice" placeholder="0.00" class="rpc-cost" @input="onCostInput">
                            <el-select slot="prepend" v-model="stockForm.currency" class="rpc-cur">
                                <el-option v-for="c in CURRENCIES" :key="c" :label="c" :value="c" />
                            </el-select>
                        </el-input>
                    </el-form-item>
                    <el-form-item :label="$tp('Supplier')">
                        <el-select v-model="stockForm.supplierId" clearable filterable style="width:100%" :placeholder="$tp('Optional')">
                            <el-option v-for="s in mySuppliers" :key="s._id" :label="s.name" :value="s._id" />
                        </el-select>
                    </el-form-item>
                    <el-form-item :label="$tp('Note')">
                        <el-input v-model="stockForm.note" type="textarea" :rows="2" resize="none" :placeholder="$tp('Optional')" />
                    </el-form-item>
                </el-form>
            </template>
            <div slot="footer">
                <el-button size="small" @click="stockVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button size="small" type="primary" icon="el-icon-box" :loading="stocking"
                    :disabled="!lookupState || lookupState === 'checking' || lookupState === 'known'" @click="addToStock">{{ $tp('Add to Stock') }}</el-button>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import { getPrecheck, addPrecheck, updatePrecheck, deletePrecheck, deletePrechecks, getRefurbSuppliers,
    lookupRefurbDevice, createRefurbDevice } from '@/api/refurbished'
import { hasPermission } from '@/utils/permission'

const blankForm = () => ({ imei: '', device: '', supplierId: '', assign: '', note: '' })
// as on the Stock page's add form (views/refurbished/stock.vue)
const GRADES = ['A++', 'A+', 'A', 'B+', 'B', 'C+', 'C']
const STORAGES = ['16GB', '32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB']
const CURRENCIES = ['AUD', 'CNY', 'HKD']
const CURRENCY_KEY = 'refurb-precheck-currency' // the last one used, per browser
const lastCurrency = () => {
    try { const v = localStorage.getItem(CURRENCY_KEY); if (CURRENCIES.includes(v)) return v } catch (e) { /* default */ }
    return 'AUD'
}

export default {
    name: 'RefurbishedPrecheck',
    data() {
        return {
            loading: false,
            rows: [],
            total: 0,
            selected: [],
            query: { search: '', supplierId: '', added: '', page: 1, pageSize: 50 },
            justAdded: '',
            mySuppliers: [],
            // the Add Device / Edit dialog
            dialogVisible: false,
            editRow: null,
            form: blankForm(),
            addedHere: [],
            saving: false,
            narrow: false,
            // the Add to Stock dialog
            GRADES,
            STORAGES,
            CURRENCIES,
            stockVisible: false,
            stockRow: null,
            stockForm: {},
            lookupState: '',
            lookupMessage: '',
            modelUnlocked: false,
            stocking: false
        }
    },
    computed: {
        canManage() {
            return hasPermission(this.$store.getters.permissions, 'refurb:precheck:manage')
        },
        // brand + model as one line, as on the Stock page
        identModel() {
            const brand = String(this.stockForm.brand || '').trim()
            const model = String(this.stockForm.model || '').trim()
            if (!brand) return model
            if (!model) return brand
            return model.toLowerCase().startsWith(brand.toLowerCase()) ? model : `${brand} ${model}`
        },
        // Blackbelt owns model / colour / storage when it has a report
        canEditIdentity() {
            return !this.stockForm.blackbeltChecked
        },
        canEditModel() {
            return this.canEditIdentity || this.modelUnlocked
        }
    },
    created() {
        this.load()
        this.loadLists()
    },
    methods: {
        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback
        },
        fmtWhen(v) {
            if (!v) return '—'
            const d = new Date(v)
            return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
        },
        async load() {
            this.loading = true
            try {
                const r = await getPrecheck(this.query)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.rows || []
                this.total = r.total || 0
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load the list')))
            } finally {
                this.loading = false
            }
        },
        reload() {
            this.query.page = 1
            this.load()
        },
        // the supplier's own suppliers (Suppliers page), for the pickers
        async loadLists() {
            try {
                const r = await getRefurbSuppliers({})
                this.mySuppliers = (r && r.suppliers) || []
            } catch (e) { this.mySuppliers = [] }
        },
        // a multi-line Device on one table line
        oneLine(v) {
            return String(v || '').split(/\n+/).map(x => x.trim()).filter(Boolean).join(' · ')
        },
        focusImei() {
            const el = this.$refs.imei
            if (el && el.focus) el.focus()
        },
        rowClass({ row }) {
            return row.imei === this.justAdded ? 'rpc-just' : ''
        },
        openAdd() {
            this.editRow = null
            this.form = blankForm()
            this.addedHere = []
            this.narrow = window.innerWidth < 600
            this.dialogVisible = true
        },
        openEdit(row) {
            this.editRow = row
            this.form = { imei: row.imei, device: row.device || '', supplierId: row.supplier && row.supplier.id ? String(row.supplier.id) : '', assign: row.assign || '', note: row.note || '' }
            this.narrow = window.innerWidth < 600
            this.dialogVisible = true
        },
        onClosed() {
            this.editRow = null
            this.addedHere = []
        },
        // Add: the dialog stays for the next device with the whole form
        // cleared (user 2026-10-21). Edit: saved and closed.
        async save() {
            const imei = String(this.form.imei || '').replace(/\s+/g, '')
            if (!imei) { this.$message.warning(this.$tp('Enter the IMEI')); this.focusImei(); return }
            if (this.saving) return
            this.saving = true
            try {
                if (this.editRow) {
                    const r = await updatePrecheck(this.editRow._id, { ...this.form, imei })
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    this.$message.success(this.$tp('Saved'))
                    this.dialogVisible = false
                    this.load()
                    return
                }
                const r = await addPrecheck({ ...this.form, imei })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.justAdded = r.row.imei
                this.addedHere.push(r.row.imei)
                this.$message({ type: 'success', duration: 1400, message: this.$tp('{imei} added', { imei: r.row.imei }) + (r.row.addedToStock ? ' · ' + this.$tp('Added to Stock') : '') })
                this.form = blankForm()
                this.query.page = 1
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.editRow ? this.$tp('Failed to save the record') : this.$tp('Failed to add the record')))
            } finally {
                this.saving = false
                if (this.dialogVisible) this.$nextTick(this.focusImei)
            }
        },
        // ── Add to Stock ──
        openToStock(row) {
            this.stockRow = row
            this.stockForm = {
                model: String(row.device || '').split('\n')[0].trim().slice(0, 120), color: '', storage: '', grade: '', costPrice: '', currency: lastCurrency(),
                supplierId: row.supplier && row.supplier.id ? String(row.supplier.id) : '', note: row.note || '',
                blackbeltChecked: false, brand: '', serialNumber: '', batteryHealth: null, batteryCycleCount: null,
                batteryCapacity: '', aNumber: '', blackbeltReportId: '', blackbeltStatus: ''
            }
            this.modelUnlocked = false
            this.narrow = window.innerWidth < 600
            this.stockVisible = true
            this.lookup()
        },
        // the Stock page's lookup: the register first, else Blackbelt's report
        async lookup() {
            const row = this.stockRow
            if (!row) return
            this.lookupState = 'checking'
            this.lookupMessage = ''
            try {
                const r = await lookupRefurbDevice(row.imei)
                if (this.stockRow !== row) return
                if (!r || r.success === false) throw new Error((r && r.message) || 'Lookup failed')
                const d = r.device || {}
                if (r.alreadyInStock) {
                    this.lookupState = 'known'
                    this.load() // its mark shows on the list
                    return
                }
                if (r.found) {
                    Object.assign(this.stockForm, {
                        // Blackbelt's model; the record's Device only when the report has none
                        model: d.model || this.stockForm.model,
                        color: d.color || '', storage: d.storage || '', brand: d.brand || '', serialNumber: d.serialNumber || '',
                        batteryHealth: d.batteryHealth == null ? null : d.batteryHealth,
                        batteryCycleCount: d.batteryCycleCount == null ? null : d.batteryCycleCount,
                        batteryCapacity: d.batteryCapacity || '', aNumber: d.aNumber || '',
                        blackbeltReportId: r.blackbeltReportId || '', blackbeltStatus: r.blackbeltStatus || '',
                        blackbeltChecked: !!r.blackbeltChecked
                    })
                    this.modelUnlocked = !d.model
                    this.lookupState = 'ok'
                } else if (r.notConfigured) {
                    this.lookupState = 'notConfigured'
                    this.lookupMessage = r.message || this.$tp('Blackbelt lookup isn\'t configured.')
                } else if (r.lookupError) {
                    this.lookupState = 'error'
                    this.lookupMessage = r.lookupError
                } else {
                    this.lookupState = 'notFound'
                    this.lookupMessage = r.message || this.$tp('Blackbelt has no report for this device — enter the details manually or save as is.')
                }
            } catch (e) {
                if (this.stockRow !== row) return
                this.lookupState = 'error'
                this.lookupMessage = this.msg(e, this.$tp('IMEI lookup failed'))
            }
        },
        onCostInput(v) {
            const clean = String(v == null ? '' : v).replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
            if (clean !== v) this.stockForm.costPrice = clean
        },
        // saved through the Stock page's own add — it ticks Added to Stock here
        async addToStock() {
            const row = this.stockRow
            if (!row || this.stocking) return
            this.stocking = true
            try {
                const cost = String(this.stockForm.costPrice || '').trim()
                const r = await createRefurbDevice({ ...this.stockForm, imei: row.imei, costPrice: cost === '' ? null : Number(cost) })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                try { localStorage.setItem(CURRENCY_KEY, this.stockForm.currency) } catch (e) { /* not remembered */ }
                this.$message.success(this.$tp('{imei} added to Stock', { imei: row.imei }))
                this.stockVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to add to Stock')))
            } finally {
                this.stocking = false
            }
        },
        async remove(row) {
            try {
                await this.$confirm(this.$tp('Remove {imei} from the list?', { imei: row.imei }), this.$tp('Remove'), { type: 'warning', confirmButtonText: this.$tp('Remove'), cancelButtonText: this.$tp('Cancel') })
            } catch (e) { return }
            try {
                const r = await deletePrecheck(row._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to remove the record')))
            }
        },
        async removeSelected() {
            const ids = this.selected.map(r => r._id)
            if (!ids.length) return
            try {
                await this.$confirm(this.$tp('Remove {n} device(s) from the list?', { n: ids.length }), this.$tp('Remove'), { type: 'warning', confirmButtonText: this.$tp('Remove'), cancelButtonText: this.$tp('Cancel') })
            } catch (e) { return }
            try {
                const r = await deletePrechecks(ids)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('{n} removed', { n: r.removed }))
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to remove the records')))
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.rpc-filters {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px;
    .f-search { width: 260px; }
    .f-supplier { width: 170px; }
    .rpc-spacer { flex: 1; }
    .el-button + .el-button { margin-left: 0; }
}
.rpc-count { font-size: 12px; color: #909399; }
.rpc-mono { font-variant-numeric: tabular-nums; letter-spacing: .2px; }
.rpc-dim { font-size: 11px; color: #909399; }
.rpc-del { color: #f56c6c; }
.rpc-tostock { padding: 5px 8px; }
.rpc-pager { margin-top: 10px; text-align: right; }
.rpc-added { margin: -4px 0 0 90px; font-size: 12px; color: #67c23a; word-break: normal; .rpc-mono { color: #606266; } }
/* the ticked box reads as done, not as greyed out */
.rpc-added-box ::v-deep .el-checkbox__input.is-disabled.is-checked .el-checkbox__inner { background: #67c23a; border-color: #67c23a; }
.rpc-added-box ::v-deep .el-checkbox__input.is-disabled.is-checked .el-checkbox__inner::after { border-color: #fff; }
::v-deep .rpc-just td { background: #ecf5ff !important; }
/* Add to Stock */
.rpc-st-head { font-size: 14px; margin-bottom: 10px; word-break: normal; }
.rpc-st-checking { padding: 14px; text-align: center; color: #909399; background: #f5f7fa; border-radius: 6px; }
.rpc-st-ident { padding: 10px 12px; border: 1px solid #e1f3d8; border-radius: 6px; background: #f0f9eb; word-break: normal; }
.rpc-st-ok { color: #67c23a; font-weight: 600; margin-bottom: 8px; }
.rpc-st-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px 12px;
    span { display: block; font-size: 11px; color: #909399; } b { font-size: 13px; color: #303133; } }
.rpc-st-alert { margin-bottom: 4px; word-break: normal; }
.rpc-st-form { margin-top: 14px; }
.rpc-grades ::v-deep .el-radio-button__inner { padding: 7px 11px; }
.rpc-cost { width: 260px; max-width: 100%; }
.rpc-cur { width: 82px; }
/* notes in the page's font, not the browser's monospace default */
::v-deep .el-textarea__inner { font-family: Arial, Helvetica, sans-serif; }
@media (max-width: 767px) {
    .rpc-filters .f-search, .rpc-filters .f-supplier { width: 100%; }
    .rpc-added { margin-left: 0; }
}
</style>
