<template>
    <!-- Customer stock chat (2026-11-16): who may use it (by phone number),
         the price list it quotes, and exactly what customers see. -->
    <div class="app-container sch">
        <el-tabs v-model="tab">
            <!-- ── customers ─────────────────────────────────────────── -->
            <el-tab-pane :label="$tp('Customers')" name="customers">
                <div class="sch-bar">
                    <el-button type="primary" size="small" icon="el-icon-plus" @click="openCustomer()">{{ $tp('Add customer') }}</el-button>
                    <el-button size="small" icon="el-icon-setting" @click="openSettings">{{ $tp('Settings') }}</el-button>
                    <el-button size="small" icon="el-icon-refresh" :loading="custLoading" @click="loadCustomers">{{ $tp('Refresh') }}</el-button>
                    <el-input v-model="custSearch" size="small" clearable class="sch-search" prefix-icon="el-icon-search" :placeholder="$tp('Name or phone')" />
                </div>
                <div class="sch-hint">
                    <i class="el-icon-info" />
                    {{ $tp('When a customer on this list messages us on WhatsApp, click Send on WhatsApp — your WhatsApp opens with their stock link ready to send. Turning a customer off, or making a new link, stops the old link at once.') }}
                </div>
                <el-table v-loading="custLoading" :data="customersShown" size="small" border>
                    <el-table-column :label="$tp('Name')" prop="name" min-width="150" />
                    <el-table-column :label="$tp('Phone')" min-width="130">
                        <template slot-scope="s">+{{ s.row.phone }}</template>
                    </el-table-column>
                    <el-table-column :label="$tp('Enabled')" width="90" align="center">
                        <template slot-scope="s">
                            <el-switch :value="s.row.enabled" :disabled="s.row._saving" @change="v => toggle(s.row, v)" />
                        </template>
                    </el-table-column>
                    <el-table-column :label="$tp('Questions')" width="120" align="center">
                        <template slot-scope="s">
                            <span :title="$tp('Today / all time')">{{ s.row.questionsToday }} / {{ s.row.questionsTotal }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column :label="$tp('Last asked')" width="140">
                        <template slot-scope="s">{{ s.row.lastAskedAt ? fmt(s.row.lastAskedAt) : '—' }}</template>
                    </el-table-column>
                    <el-table-column :label="$tp('Note')" prop="note" min-width="160" show-overflow-tooltip />
                    <!-- not fixed="right": a pinned column is a separate overlay table whose
                         rows drifted out of line with the rest (user 2026-11-17) -->
                    <el-table-column :label="$tp('Actions')" min-width="340">
                        <template slot-scope="s">
                            <div class="sch-acts">
                            <el-button size="mini" type="success" icon="el-icon-chat-dot-round" :disabled="!s.row.enabled" @click="sendWhatsApp(s.row)">{{ $tp('Send on WhatsApp') }}</el-button>
                            <el-button size="mini" icon="el-icon-document-copy" :disabled="!s.row.enabled" @click="copyLink(s.row)">{{ $tp('Copy link') }}</el-button>
                            <el-dropdown trigger="click" size="small" @command="c => more(c, s.row)">
                                <el-button size="mini" icon="el-icon-more" />
                                <el-dropdown-menu slot="dropdown">
                                    <el-dropdown-item command="log" icon="el-icon-chat-line-square">{{ $tp('Questions asked') }}</el-dropdown-item>
                                    <el-dropdown-item command="edit" icon="el-icon-edit">{{ $tp('Edit') }}</el-dropdown-item>
                                    <el-dropdown-item command="open" icon="el-icon-view">{{ $tp('Open their page') }}</el-dropdown-item>
                                    <el-dropdown-item command="newLink" icon="el-icon-refresh-right">{{ $tp('New link (old one stops working)') }}</el-dropdown-item>
                                    <el-dropdown-item command="delete" icon="el-icon-delete" divided>{{ $tp('Remove') }}</el-dropdown-item>
                                </el-dropdown-menu>
                            </el-dropdown>
                            </div>
                        </template>
                    </el-table-column>
                </el-table>
            </el-tab-pane>

            <!-- ── price list ────────────────────────────────────────── -->
            <el-tab-pane :label="$tp('Price list')" name="prices">
                <div class="sch-bar">
                    <el-button type="primary" size="small" icon="el-icon-plus" @click="openPrice()">{{ $tp('Add price') }}</el-button>
                    <el-button size="small" icon="el-icon-upload2" @click="$refs.file.click()">{{ $tp('Import Excel') }}</el-button>
                    <el-button size="small" icon="el-icon-download" @click="exportPrices">{{ $tp('Download') }}</el-button>
                    <input ref="file" type="file" accept=".xlsx,.xls,.csv" class="sch-file" @change="pickFile">
                    <el-input v-model="priceSearch" size="small" clearable class="sch-search" prefix-icon="el-icon-search" :placeholder="$tp('Model')" />
                    <span class="sch-count">{{ $tp('{n} prices', { n: prices.length }) }}</span>
                </div>
                <div class="sch-hint">
                    <i class="el-icon-info" />
                    {{ $tp('One price per Model + Storage + Grade, written as in the stock register. Leave Storage or Grade empty to cover all of them. Models with no price show Contact us.') }}
                </div>
                <el-table v-loading="priceLoading" :data="pricesShown" size="small" border>
                    <el-table-column :label="$tp('Model')" prop="model" min-width="200" />
                    <el-table-column :label="$tp('Storage')" width="110">
                        <template slot-scope="s">{{ s.row.storage || $tp('All') }}</template>
                    </el-table-column>
                    <el-table-column :label="$tp('Grade')" width="100">
                        <template slot-scope="s">{{ s.row.grade || $tp('All') }}</template>
                    </el-table-column>
                    <el-table-column :label="$tp('Price')" width="140" align="right">
                        <template slot-scope="s">{{ s.row.currency }} {{ money(s.row.price) }}</template>
                    </el-table-column>
                    <el-table-column :label="$tp('Updated')" width="190">
                        <template slot-scope="s">{{ fmt(s.row.updatedAt) }} · {{ s.row.updatedBy || '' }}</template>
                    </el-table-column>
                    <el-table-column :label="$tp('Actions')" width="130">
                        <template slot-scope="s">
                            <el-button size="mini" type="text" icon="el-icon-edit" @click="openPrice(s.row)">{{ $tp('Edit') }}</el-button>
                            <el-button size="mini" type="text" icon="el-icon-delete" class="sch-danger" @click="removePrice(s.row)">{{ $tp('Delete') }}</el-button>
                        </template>
                    </el-table-column>
                </el-table>
            </el-tab-pane>

            <!-- ── preview ───────────────────────────────────────────── -->
            <el-tab-pane :label="$tp('What customers see')" name="preview">
                <div class="sch-bar">
                    <el-button size="small" icon="el-icon-refresh" :loading="prevLoading" @click="loadPreview(true)">{{ $tp('Refresh stock') }}</el-button>
                    <el-input v-model="prevSearch" size="small" clearable class="sch-search" prefix-icon="el-icon-search" :placeholder="$tp('Model')" />
                    <el-checkbox v-model="prevUnpriced">{{ $tp('No price only') }}</el-checkbox>
                </div>
                <el-alert v-if="preview && !preview.exyonOk" type="warning" :closable="false" show-icon class="sch-alert" :title="$tp('Exyon could not be checked — units it may have sold are still shown')" />
                <div v-if="preview" class="sch-stats">
                    <span>{{ $tp('{n} units', { n: preview.units }) }}</span>
                    <span>{{ $tp('{n} rows', { n: preview.rows }) }}</span>
                    <span>{{ $tp('{n} rows priced ({u} units)', { n: preview.pricedRows, u: preview.pricedUnits }) }}</span>
                    <span :title="$tp('In Stock in our register at Assigned To Exyon, but sold, being picked or in a non-sellable zone in Exyon')">{{ $tp('{n} hidden: sold or unavailable at Exyon', { n: preview.hiddenAtExyon }) }}</span>
                    <span v-if="preview.unconfirmedAtExyon" :title="$tp('In Stock at Assigned To Exyon in our register, but Exyon never received it or has no record of it')">{{ $tp('{n} shown: not yet received at Exyon', { n: preview.unconfirmedAtExyon }) }}</span>
                    <span v-if="preview.hiddenUnits">{{ $tp('{n} hidden: hidden models', { n: preview.hiddenUnits }) }}</span>
                    <span v-if="preview.belowCostUnits" class="sch-contact">{{ $tp('{n} units below cost: Contact us', { n: preview.belowCostUnits }) }}</span>
                    <span class="sch-muted">{{ $tp('Stock as of {t}', { t: fmt(preview.at, true) }) }}</span>
                </div>
                <el-table v-loading="prevLoading" :data="previewShown" size="small" border :max-height="600">
                    <el-table-column :label="$tp('Model')" prop="model" min-width="200" />
                    <el-table-column :label="$tp('Storage')" prop="storage" width="100" />
                    <el-table-column :label="$tp('Grade')" width="100">
                        <template slot-scope="s">{{ s.row.grade || $tp('Ungraded') }}</template>
                    </el-table-column>
                    <el-table-column :label="$tp('Colour')" prop="color" width="140" />
                    <el-table-column :label="$tp('Qty')" prop="qty" width="70" align="right" />
                    <el-table-column :label="$tp('Price')" width="160" align="right">
                        <template slot-scope="s">
                            <span v-if="s.row.price != null">{{ s.row.currency }} {{ money(s.row.price) }}</span>
                            <span v-else class="sch-contact">{{ $tp('Contact us') }}</span>
                            <el-tag v-if="s.row.belowCost" size="mini" type="warning" class="sch-below">{{ $tp('Below cost') }}</el-tag>
                        </template>
                    </el-table-column>
                    <el-table-column width="110">
                        <template slot-scope="s">
                            <el-button v-if="s.row.price == null && !s.row.belowCost" size="mini" type="text" icon="el-icon-plus" @click="openPrice(null, s.row)">{{ $tp('Add price') }}</el-button>
                        </template>
                    </el-table-column>
                </el-table>
            </el-tab-pane>
        </el-tabs>

        <!-- customer -->
        <el-dialog :title="custForm._id ? $tp('Edit customer') : $tp('Add customer')" :visible.sync="custDialog" width="460px" append-to-body>
            <el-form label-width="110px" size="small" @submit.native.prevent>
                <el-form-item :label="$tp('Name')" required>
                    <el-input v-model="custForm.name" maxlength="80" />
                </el-form-item>
                <el-form-item :label="$tp('Phone')" required>
                    <el-input v-model="custForm.phone" maxlength="30" :placeholder="$tp('e.g. 0412 345 678 or +852 9123 4567')" />
                </el-form-item>
                <el-form-item :label="$tp('Note')">
                    <el-input v-model="custForm.note" maxlength="300" />
                </el-form-item>
                <el-form-item :label="$tp('Enabled')">
                    <el-switch v-model="custForm.enabled" />
                </el-form-item>
            </el-form>
            <span slot="footer">
                <el-button size="small" @click="custDialog = false">{{ $tp('Cancel') }}</el-button>
                <el-button size="small" type="primary" :loading="saving" @click="saveCustomer">{{ $tp('Save') }}</el-button>
            </span>
        </el-dialog>

        <!-- price -->
        <el-dialog :title="priceForm._id ? $tp('Edit price') : $tp('Add price')" :visible.sync="priceDialog" width="480px" append-to-body>
            <el-form label-width="90px" size="small" @submit.native.prevent>
                <el-form-item :label="$tp('Model')" required>
                    <el-autocomplete v-model="priceForm.model" class="sch-full" :fetch-suggestions="modelSuggest" :trigger-on-focus="false" />
                </el-form-item>
                <el-form-item :label="$tp('Storage')">
                    <el-input v-model="priceForm.storage" :placeholder="$tp('Empty = all storages')" />
                </el-form-item>
                <el-form-item :label="$tp('Grade')">
                    <el-input v-model="priceForm.grade" :placeholder="$tp('Empty = all grades')" />
                </el-form-item>
                <el-form-item :label="$tp('Price')" required>
                    <div class="sch-price">
                        <el-select v-model="priceForm.currency" class="sch-cur">
                            <el-option v-for="c in currencies" :key="c" :label="c" :value="c" />
                        </el-select>
                        <el-input-number v-model="priceForm.price" :min="0" :precision="2" :controls="false" class="sch-num" />
                    </div>
                </el-form-item>
            </el-form>
            <span slot="footer">
                <el-button size="small" @click="priceDialog = false">{{ $tp('Cancel') }}</el-button>
                <el-button size="small" type="primary" :loading="saving" @click="savePrice">{{ $tp('Save') }}</el-button>
            </span>
        </el-dialog>

        <!-- import -->
        <el-dialog :title="$tp('Import price list')" :visible.sync="importDialog" width="720px" append-to-body>
            <div class="sch-hint">
                <i class="el-icon-info" />
                {{ $tp('Read {n} rows from {file}. Columns found: {cols}.', { n: importRows.length, file: importFile, cols: importCols.join(', ') }) }}
            </div>
            <el-table :data="importRows.slice(0, 8)" size="mini" border>
                <el-table-column :label="$tp('Model')" prop="model" min-width="180" />
                <el-table-column :label="$tp('Storage')" prop="storage" width="90" />
                <el-table-column :label="$tp('Grade')" prop="grade" width="80" />
                <el-table-column :label="$tp('Price')" prop="price" width="90" align="right" />
                <el-table-column :label="$tp('Currency')" prop="currency" width="80" />
            </el-table>
            <div v-if="importRows.length > 8" class="sch-muted sch-gap">{{ $tp('…and {n} more', { n: importRows.length - 8 }) }}</div>
            <el-radio-group v-model="importMode" class="sch-gap">
                <el-radio label="replace">{{ $tp('Replace the whole price list') }}</el-radio>
                <el-radio label="merge">{{ $tp('Update matching rows, add new ones') }}</el-radio>
            </el-radio-group>
            <ul v-if="importErrors.length" class="sch-errors">
                <li v-for="(e, i) in importErrors" :key="i">{{ e }}</li>
            </ul>
            <span slot="footer">
                <el-button size="small" @click="importDialog = false">{{ $tp('Cancel') }}</el-button>
                <el-button size="small" type="primary" :loading="saving" :disabled="!importRows.length" @click="runImport">{{ $tp('Import') }}</el-button>
            </span>
        </el-dialog>

        <!-- questions asked -->
        <el-dialog :title="$tp('Questions asked — {name}', { name: logFor ? logFor.name : '' })" :visible.sync="logDialog" width="720px" append-to-body>
            <div v-loading="logLoading" class="sch-log">
                <div v-if="!log.length && !logLoading" class="sch-muted">{{ $tp('No questions yet') }}</div>
                <div v-for="l in log" :key="l._id" class="sch-log-item">
                    <div class="sch-log-q"><b>{{ fmt(l.at) }}</b> · {{ l.question }}</div>
                    <div v-if="l.error" class="sch-log-a sch-danger">{{ $tp('Failed') }}: {{ l.error }}</div>
                    <div v-else class="sch-log-a">{{ l.answer }}<span v-if="l.rows" class="sch-muted"> · {{ $tp('{n} rows shown', { n: l.rows }) }}</span></div>
                </div>
            </div>
        </el-dialog>

        <!-- settings -->
        <el-dialog :title="$tp('Stock chat settings')" :visible.sync="settingsDialog" width="560px" append-to-body>
            <el-form label-width="150px" size="small" @submit.native.prevent>
                <el-form-item :label="$tp('Price note')">
                    <el-input v-model="settings.priceNote" maxlength="120" :placeholder="$tp('e.g. Prices in AUD, ex GST')" />
                </el-form-item>
                <el-form-item :label="$tp('Questions per day')">
                    <el-input-number v-model="settings.dailyLimit" :min="0" :max="500" />
                    <div class="sch-muted">{{ $tp('Per customer, resets at midnight Melbourne time') }} · {{ $tp('0 = no limit') }}</div>
                </el-form-item>
                <el-form-item :label="$tp('Hidden models')">
                    <el-select v-model="settings.hiddenModels" multiple filterable allow-create default-first-option class="sch-full"
                        :placeholder="$tp('Models customers never see')">
                        <el-option v-for="m in modelNames" :key="m" :label="m" :value="m" />
                    </el-select>
                    <div class="sch-muted">{{ $tp('The whole model name as in the stock register') }}</div>
                </el-form-item>
                <el-form-item :label="$tp('Cost exchange rates')">
                    <div class="sch-fx">
                        <span>1 HKD =</span>
                        <el-input-number v-model="settings.fxToAud.HKD" :min="0.0001" :max="10" :precision="4" :step="0.01" :controls="false" class="sch-fx-num" />
                        <span>AUD</span>
                    </div>
                    <div class="sch-fx">
                        <span>1 CNY =</span>
                        <el-input-number v-model="settings.fxToAud.CNY" :min="0.0001" :max="10" :precision="4" :step="0.01" :controls="false" class="sch-fx-num" />
                        <span>AUD</span>
                    </div>
                    <div class="sch-muted">{{ $tp('A unit whose cost is above its listed price shows Contact us; HKD / CNY costs are converted with these') }}</div>
                </el-form-item>
            </el-form>
            <span slot="footer">
                <el-button size="small" @click="settingsDialog = false">{{ $tp('Cancel') }}</el-button>
                <el-button size="small" type="primary" :loading="saving" @click="saveSettings">{{ $tp('Save') }}</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import * as XLSX from 'xlsx-js-style'
import {
    listStockChatCustomers, addStockChatCustomer, updateStockChatCustomer, newStockChatLink, deleteStockChatCustomer,
    getStockChatLog, listStockChatPrices, addStockChatPrice, updateStockChatPrice, deleteStockChatPrice,
    importStockChatPrices, getStockChatSettings, saveStockChatSettings, getStockChatPreview
} from '@/api/stockChat'

const CURRENCIES = ['AUD', 'HKD', 'CNY', 'USD']
const blankCustomer = () => ({ _id: null, name: '', phone: '', note: '', enabled: true })
const blankPrice = () => ({ _id: null, model: '', storage: '', grade: '', price: undefined, currency: 'AUD' })

// Spreadsheet header → field (English or Chinese headers).
const HEADERS = [
    ['model', /^(model|device|item|product|型号|机型|产品)/i],
    ['storage', /^(storage|capacity|容量|内存|存储)/i],
    ['grade', /^(grade|condition|等级|成色)/i],
    ['currency', /^(currency|币种|货币)/i],
    ['price', /(price|价格|单价)/i]
]

export default {
    name: 'RefurbishedStockChat',
    data() {
        return {
            tab: 'customers',
            currencies: CURRENCIES,
            saving: false,
            // customers
            customers: [],
            custLoading: false,
            custSearch: '',
            custDialog: false,
            custForm: blankCustomer(),
            // prices
            prices: [],
            priceLoading: false,
            priceSearch: '',
            priceDialog: false,
            priceForm: blankPrice(),
            // import
            importDialog: false,
            importRows: [],
            importCols: [],
            importFile: '',
            importMode: 'replace',
            importErrors: [],
            // preview
            preview: null,
            prevLoading: false,
            prevSearch: '',
            prevUnpriced: false,
            // log
            logDialog: false,
            logFor: null,
            log: [],
            logLoading: false,
            // settings
            settingsDialog: false,
            settings: { priceNote: '', dailyLimit: 0, hiddenModels: [], fxToAud: { HKD: 0.19, CNY: 0.2128 } }
        }
    },
    computed: {
        customersShown() {
            const q = this.custSearch.trim().toLowerCase()
            const digits = q.replace(/\D/g, '')
            if (!q) return this.customers
            return this.customers.filter(c => (c.name || '').toLowerCase().includes(q) || (digits && c.phone.includes(digits)))
        },
        pricesShown() {
            const q = this.priceSearch.trim().toLowerCase()
            return q ? this.prices.filter(p => p.model.toLowerCase().includes(q)) : this.prices
        },
        modelNames() {
            const names = new Set(this.settings.hiddenModels || [])
            if (this.preview) this.preview.groups.forEach(g => names.add(g.model))
            this.prices.forEach(p => names.add(p.model))
            return [...names].sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }))
        },
        previewShown() {
            if (!this.preview) return []
            const q = this.prevSearch.trim().toLowerCase()
            return this.preview.groups.filter(g =>
                (!q || `${g.brand} ${g.model}`.toLowerCase().includes(q)) && (!this.prevUnpriced || g.price == null))
        }
    },
    watch: {
        tab(t) {
            if (t === 'prices' && !this.prices.length) this.loadPrices()
            if (t === 'preview' && !this.preview) this.loadPreview(false)
        }
    },
    created() {
        this.loadCustomers()
    },
    methods: {
        fmt(d, withTime) {
            if (!d) return ''
            const x = new Date(d)
            const opts = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }
            if (withTime === true) opts.second = '2-digit'
            return x.toLocaleString('en-AU', opts)
        },
        money(n) {
            return Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        },
        // ── customers ──
        async loadCustomers() {
            this.custLoading = true
            try {
                const r = await listStockChatCustomers()
                this.customers = (r.customers || []).map(c => ({ ...c, _saving: false }))
            } finally {
                this.custLoading = false
            }
        },
        linkFor(c) {
            return window.location.origin + this.$router.resolve({ path: '/stock/' + c.token }).href
        },
        sendWhatsApp(c) {
            const first = String(c.name || '').trim().split(/\s+/)[0]
            const text = `Hi${first ? ' ' + first : ''}, here's your link to check iMobile's current stock and prices:\n${this.linkFor(c)}\n\nOpen it and ask, e.g. "iPhone 13 128GB in A grade?"`
            window.open(`https://wa.me/${c.phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
        },
        async copyLink(c) {
            const link = this.linkFor(c)
            try {
                await navigator.clipboard.writeText(link)
                this.$message.success(this.$tp('Link copied'))
            } catch (e) {
                this.$alert(link, this.$tp('Stock link'))
            }
        },
        async toggle(c, v) {
            c._saving = true
            try {
                await updateStockChatCustomer(c._id, { enabled: v })
                c.enabled = v
                this.$message.success(v ? this.$tp('Enabled') : this.$tp('Turned off — their link no longer works'))
            } finally {
                c._saving = false
            }
        },
        openCustomer(c) {
            this.custForm = c
                ? { _id: c._id, name: c.name, phone: '+' + c.phone, note: c.note || '', enabled: c.enabled }
                : blankCustomer()
            this.custDialog = true
        },
        async saveCustomer() {
            const f = this.custForm
            if (!f.name.trim() || !f.phone.trim()) { this.$message.warning(this.$tp('Enter the name and phone number')); return }
            this.saving = true
            try {
                const data = { name: f.name, phone: f.phone, note: f.note, enabled: f.enabled }
                if (f._id) await updateStockChatCustomer(f._id, data)
                else await addStockChatCustomer(data)
                this.custDialog = false
                this.$message.success(this.$tp('Saved'))
                this.loadCustomers()
            } finally {
                this.saving = false
            }
        },
        async more(cmd, c) {
            if (cmd === 'edit') return this.openCustomer(c)
            if (cmd === 'open') return window.open(this.linkFor(c), '_blank', 'noopener')
            if (cmd === 'log') return this.openLog(c)
            const ok = (msg, title) => this.$confirm(msg, title, { type: 'warning' }).then(() => true, () => false)
            if (cmd === 'newLink') {
                if (!(await ok(this.$tp('Make a new link for {name}? The link they have now stops working.', { name: c.name }), this.$tp('New link')))) return
                const r = await newStockChatLink(c._id)
                c.token = r.customer.token
                this.$message.success(this.$tp('New link made — send it with Send on WhatsApp'))
                return
            }
            if (cmd === 'delete') {
                if (!(await ok(this.$tp('Remove {name} from the list? Their link stops working.', { name: c.name }), this.$tp('Remove')))) return
                await deleteStockChatCustomer(c._id)
                this.$message.success(this.$tp('Removed'))
                this.loadCustomers()
            }
        },
        async openLog(c) {
            this.logFor = c
            this.log = []
            this.logDialog = true
            this.logLoading = true
            try {
                const r = await getStockChatLog(c._id, 100)
                this.log = r.log || []
            } finally {
                this.logLoading = false
            }
        },
        // ── settings ──
        async openSettings() {
            const r = await getStockChatSettings()
            const s = r.settings || {}
            this.settings = {
                priceNote: s.priceNote || '',
                dailyLimit: s.dailyLimit,
                hiddenModels: (s.hiddenModels || []).slice(),
                fxToAud: { HKD: (s.fxToAud && s.fxToAud.HKD) || 0.19, CNY: (s.fxToAud && s.fxToAud.CNY) || 0.2128 }
            }
            this.settingsDialog = true
            // model names to pick from (the stock as customers see it + the price list)
            if (!this.preview) this.loadPreview(false)
        },
        async saveSettings() {
            this.saving = true
            try {
                await saveStockChatSettings(this.settings)
                this.settingsDialog = false
                this.$message.success(this.$tp('Saved'))
                // hidden models / rates change what customers see
                if (this.preview) this.loadPreview(false)
            } finally {
                this.saving = false
            }
        },
        // ── prices ──
        async loadPrices() {
            this.priceLoading = true
            try {
                const r = await listStockChatPrices()
                this.prices = r.prices || []
            } finally {
                this.priceLoading = false
            }
        },
        openPrice(p, fromStock) {
            if (p) this.priceForm = { _id: p._id, model: p.model, storage: p.storage, grade: p.grade, price: p.price, currency: p.currency }
            else if (fromStock) this.priceForm = { ...blankPrice(), model: fromStock.model, storage: fromStock.storage, grade: fromStock.grade }
            else this.priceForm = blankPrice()
            this.priceDialog = true
        },
        modelSuggest(q, cb) {
            const s = String(q || '').toLowerCase()
            const names = new Set()
            if (this.preview) this.preview.groups.forEach(g => names.add(g.model))
            this.prices.forEach(p => names.add(p.model))
            cb([...names].filter(n => n.toLowerCase().includes(s)).slice(0, 30).map(value => ({ value })))
        },
        async savePrice() {
            const f = this.priceForm
            if (!f.model.trim() || !(f.price > 0)) { this.$message.warning(this.$tp('Enter the model and a price')); return }
            this.saving = true
            try {
                const data = { model: f.model, storage: f.storage, grade: f.grade, price: f.price, currency: f.currency }
                if (f._id) await updateStockChatPrice(f._id, data)
                else await addStockChatPrice(data)
                this.priceDialog = false
                this.$message.success(this.$tp('Saved'))
                this.loadPrices()
                if (this.preview) this.loadPreview(false)
            } finally {
                this.saving = false
            }
        },
        async removePrice(p) {
            const what = [p.model, p.storage, p.grade].filter(Boolean).join(' · ')
            const yes = await this.$confirm(this.$tp('Delete the price for {what}?', { what }), this.$tp('Delete'), { type: 'warning' }).then(() => true, () => false)
            if (!yes) return
            await deleteStockChatPrice(p._id)
            this.prices = this.prices.filter(x => x._id !== p._id)
            if (this.preview) this.loadPreview(false)
        },
        exportPrices() {
            const rows = (this.prices.length ? this.prices : [{ model: 'iPhone 13', storage: '128GB', grade: 'A++', price: 0, currency: 'AUD' }])
                .map(p => ({ Model: p.model, Storage: p.storage, Grade: p.grade, Price: p.price, Currency: p.currency }))
            const ws = XLSX.utils.json_to_sheet(rows, { header: ['Model', 'Storage', 'Grade', 'Price', 'Currency'] })
            ws['!cols'] = [{ wch: 32 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 9 }]
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, 'Price list')
            XLSX.writeFile(wb, `Stock chat price list ${new Date().toISOString().slice(0, 10)}.xlsx`)
        },
        pickFile(ev) {
            const file = ev.target.files && ev.target.files[0]
            ev.target.value = ''
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
                try {
                    const wb = XLSX.read(new Uint8Array(reader.result), { type: 'array' })
                    const ws = wb.Sheets[wb.SheetNames[0]]
                    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })
                    // the header row: the first row naming a Model and a Price column
                    let head = -1
                    let map = {}
                    for (let i = 0; i < Math.min(grid.length, 15) && head < 0; i++) {
                        const m = {}
                        grid[i].forEach((h, col) => {
                            const t = String(h || '').trim()
                            for (const [field, re] of HEADERS) {
                                if (m[field] === undefined && re.test(t)) { m[field] = col; break }
                            }
                        })
                        if (m.model !== undefined && m.price !== undefined) { head = i; map = m }
                    }
                    if (head < 0) { this.$message.error(this.$tp('Could not find Model and Price columns in the first sheet')); return }
                    const rows = []
                    for (const r of grid.slice(head + 1)) {
                        const model = String(r[map.model] || '').trim()
                        const price = r[map.price]
                        if (!model && (price === '' || price == null)) continue
                        rows.push({
                            model,
                            storage: map.storage !== undefined ? String(r[map.storage] || '').trim() : '',
                            grade: map.grade !== undefined ? String(r[map.grade] || '').trim() : '',
                            price,
                            currency: map.currency !== undefined ? String(r[map.currency] || '').trim().toUpperCase() || 'AUD' : 'AUD'
                        })
                    }
                    this.importRows = rows
                    this.importCols = Object.keys(map)
                    this.importFile = file.name
                    this.importErrors = []
                    this.importMode = this.prices.length ? 'merge' : 'replace'
                    this.importDialog = true
                } catch (e) {
                    this.$message.error(this.$tp('Could not read that file'))
                }
            }
            reader.readAsArrayBuffer(file)
        },
        async runImport() {
            this.saving = true
            this.importErrors = []
            try {
                const r = await importStockChatPrices(this.importRows, this.importMode)
                this.importDialog = false
                this.$message.success(this.$tp('{n} prices imported', { n: r.imported }))
                this.loadPrices()
                if (this.preview) this.loadPreview(false)
            } catch (e) {
                // the request layer showed the message; list the rows
                const body = e && e.response && e.response.data
                if (body && body.errors) this.importErrors = body.errors
            } finally {
                this.saving = false
            }
        },
        // ── preview ──
        async loadPreview(fresh) {
            this.prevLoading = true
            try {
                const r = await getStockChatPreview(fresh)
                this.preview = r
                if (!this.prices.length) this.loadPrices()
            } finally {
                this.prevLoading = false
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.sch-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
.sch-bar .el-button + .el-button { margin-left: 0; }
.sch-search { width: 220px; }
.sch-file { display: none; }
.sch-count { color: #909399; font-size: 12px; }
.sch-hint { font-size: 12px; color: #606266; background: #f4f6fa; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; line-height: 1.5; }
.sch-stats { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13px; margin-bottom: 10px; }
.sch-muted { color: #909399; font-size: 12px; }
.sch-alert { margin-bottom: 10px; }
.sch-contact { color: #b45309; }
.sch-below { margin-left: 6px; }
/* the row's buttons on one line, so every row keeps the same height */
.sch-acts { display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; white-space: nowrap; }
.sch-acts .el-button + .el-button { margin-left: 0; }
.sch-fx { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.sch-fx-num { width: 110px; }
.sch-danger { color: #f56c6c; }
.sch-full { width: 100%; }
.sch-price { display: flex; gap: 8px; }
.sch-cur { width: 90px; }
.sch-num { flex: 1; }
.sch-gap { margin-top: 12px; }
.sch-errors { color: #f56c6c; font-size: 12px; max-height: 160px; overflow: auto; padding-left: 18px; }
.sch-log { max-height: 60vh; overflow: auto; min-height: 80px; }
.sch-log-item { border-bottom: 1px solid #ebeef5; padding: 8px 0; }
.sch-log-q { font-size: 13px; }
.sch-log-a { font-size: 13px; color: #606266; margin-top: 4px; white-space: pre-wrap; }
</style>
