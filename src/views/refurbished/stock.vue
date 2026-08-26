<template>
    <div class="rs-stock app-container">
        <div class="rs-filters">
            <el-input v-model="query.search" size="small" clearable class="f-search"
                placeholder="Search IMEI / serial / model / colour…" prefix-icon="el-icon-search"
                @keyup.enter.native="reload" @clear="reload" />
            <el-select v-model="query.grade" size="small" clearable placeholder="Grade" class="f-sel" @change="reload">
                <el-option v-for="g in gradeFilterOptions" :key="g" :label="g" :value="g" />
            </el-select>
            <!-- A supplier's register is all one source, so that filter
                 stays ours — but their devices move between shelf, road and
                 iMobile, so location is worth filtering for everyone. -->
            <el-select v-if="!isSupplier" v-model="query.stockSource" size="small" clearable filterable placeholder="Stock Source" class="f-sel-w" @change="reload">
                <el-option v-for="l in filters.stockSources" :key="l" :label="l" :value="l" />
            </el-select>
            <el-select v-model="query.location" size="small" clearable placeholder="Location" class="f-sel-w" @change="reload">
                <el-option v-for="l in filters.locations" :key="l" :label="l" :value="l" />
            </el-select>
            <!-- Suppliers work one undifferentiated shelf — status is an
                 internal view, so the filter and column stay ours. -->
            <el-select v-if="!isSupplier" v-model="query.status" size="small" clearable placeholder="Status" class="f-sel" @change="reload">
                <el-option label="In Stock" value="In Stock" />
                <el-option label="With Supplier" value="With Supplier" />
                <el-option label="Sold" value="Sold" />
                <el-option label="Out for Repair" value="Out for Repair" />
                <el-option label="Not Yet Received" value="Not Yet Received" />
                <el-option label="Repairing" value="Repairing" />
            </el-select>
            <span class="rs-spacer" />
            <!-- Single-device add stays its own button; the menu's Add
                 Device is the bulk version (scan many, create together). -->
            <el-button size="small" type="primary" plain icon="el-icon-plus" @click="openEdit(null)">Add Device</el-button>
            <!-- One entry point for the flows that start from stock. The
                 menu is role-shaped: staff get the full set, suppliers get
                 what their permissions can actually do. -->
            <el-dropdown size="small" trigger="click" @command="bulkCommand">
                <el-button size="small" type="primary" plain>
                    Bulk Action <i class="el-icon-arrow-down el-icon--right" />
                </el-button>
                <el-dropdown-menu slot="dropdown">
                    <el-dropdown-item command="bulk-add" icon="el-icon-plus">Add Device</el-dropdown-item>
                    <template v-if="!isSupplier">
                        <el-dropdown-item command="sale" icon="el-icon-sell">Create Sales Order</el-dropdown-item>
                        <el-dropdown-item command="exyon" icon="el-icon-position">Assign To Exyon</el-dropdown-item>
                        <el-dropdown-item command="repair" icon="el-icon-set-up">Create Repair Batch</el-dropdown-item>
                    </template>
                    <el-dropdown-item v-else command="supply" icon="el-icon-truck">Create Supply Batch</el-dropdown-item>
                </el-dropdown-menu>
            </el-dropdown>
            <el-button size="small" icon="el-icon-refresh" @click="load">Refresh</el-button>
            <el-button size="small" type="primary" icon="el-icon-search" @click="reload">Search</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini" height="calc(100vh - 210px)"
            empty-text="No devices yet — add one to start the register.">
            <el-table-column prop="imei" label="IMEI" min-width="170">
                <template slot-scope="s">
                    <div class="rs-imei"><b>{{ s.row.imei }}</b></div>
                    <div class="rs-serial">{{ s.row.serialNumber || '—' }}</div>
                </template>
            </el-table-column>
            <el-table-column prop="model" label="Model" min-width="170" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.model || '—' }}</template>
            </el-table-column>
            <el-table-column prop="color" label="Colour" min-width="110" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.color || '—' }}</template>
            </el-table-column>
            <el-table-column prop="storage" label="Storage" width="100" align="center">
                <template slot-scope="s">{{ s.row.storage || '—' }}</template>
            </el-table-column>
            <el-table-column prop="grade" label="Grade" width="100" align="center">
                <template slot-scope="s">
                    <el-tag v-if="s.row.grade" size="mini" :type="gradeTag(s.row.grade)" effect="plain">{{ s.row.grade }}</el-tag>
                    <span v-else class="rs-dim">—</span>
                </template>
            </el-table-column>
            <el-table-column label="Battery" width="100" align="center">
                <template slot-scope="s">
                    <span v-if="s.row.batteryHealth == null" class="rs-dim">—</span>
                    <span v-else :class="batteryClass(s.row.batteryHealth)"
                        :title="s.row.batteryCycleCount != null ? s.row.batteryCycleCount + ' cycles' : ''">
                        {{ s.row.batteryHealth }}%
                    </span>
                </template>
            </el-table-column>
            <el-table-column prop="costPrice" label="Cost Price" width="120" align="right">
                <template slot-scope="s">{{ s.row.costPrice == null ? '—' : money(s.row.costPrice, s.row.currency) }}</template>
            </el-table-column>
            <el-table-column prop="stockSource" label="Stock Source" min-width="130" show-overflow-tooltip>
                <template slot-scope="s">{{ s.row.stockSource || '—' }}</template>
            </el-table-column>
            <!-- Set by who recorded the device (supplier vs our staff) or
                 picked when receiving through Incoming Stocks. -->
            <el-table-column prop="location" label="Location" width="140" align="center">
                <template slot-scope="s">
                    <el-tag v-if="s.row.location" size="mini" effect="plain"
                        :type="locationTag(s.row.location)">{{ s.row.location }}</el-tag>
                    <span v-else class="rs-dim">—</span>
                </template>
            </el-table-column>
            <el-table-column label="Blackbelt" width="100" align="center">
                <template slot-scope="s">
                    <!-- Read-only: the flag follows the Blackbelt lookup.
                         The tooltip carries the report's verdict. -->
                    <i v-if="s.row.blackbeltChecked === true" class="el-icon-success rs-bb-yes"
                        :title="s.row.blackbeltStatus || 'Blackbelt report found'" />
                    <i v-else class="el-icon-error rs-bb-no" title="No Blackbelt report" />
                </template>
            </el-table-column>
            <!-- Sale status — devices recorded before the field existed are
                 unsold, so an empty status renders as In Stock. -->
            <el-table-column v-if="!isSupplier" label="Status" width="110" align="center">
                <template slot-scope="s">
                    <el-tag v-if="s.row.status === 'Sold'" size="mini" type="danger" effect="plain"
                        :title="soldTitle(s.row)">Sold</el-tag>
                    <el-tag v-else-if="s.row.status === 'With Supplier'" size="mini" type="info"
                        effect="plain">With Supplier</el-tag>
                    <el-tag v-else-if="s.row.status === 'Out for Repair'" size="mini" type="warning"
                        effect="plain">Out for Repair</el-tag>
                    <el-tag v-else-if="s.row.status === 'Not Yet Received'" size="mini" type="info"
                        effect="plain">Not Yet Received</el-tag>
                    <el-tag v-else-if="s.row.status === 'Repairing'" size="mini" type="warning"
                        effect="plain">Repairing</el-tag>
                    <el-tag v-else size="mini" type="success" effect="plain">In Stock</el-tag>
                </template>
            </el-table-column>
            <el-table-column label="" width="130" align="center">
                <template slot-scope="s">
                    <el-button size="mini" type="text" icon="el-icon-view" @click="openEdit(s.row)">View</el-button>
                    <!-- A sold unit that came back: record-only return — the
                         order keeps its line, the device rejoins stock. -->
                    <el-button v-if="s.row.status === 'Sold' && s.row.salesOrder && !isSupplier"
                        size="mini" type="text" icon="el-icon-back"
                        @click="openReturn(s.row)">Return</el-button>
                    <!-- A supplier's shelf is named after their source, so
                         location === stockSource means it's still with them. -->
                    <el-button v-if="s.row.status !== 'Sold' && (!isSupplier || s.row.location === s.row.stockSource)"
                        size="mini" type="text"
                        icon="el-icon-delete" class="rs-del" @click="remove(s.row)" />
                </template>
            </el-table-column>
        </el-table>

        <div class="rs-pager">
            <el-pagination background layout="total, sizes, prev, pager, next, jumper"
                :total="total" :page-size="query.pageSize" :page-sizes="[25, 50, 100, 200]"
                :current-page="query.page" @current-change="onPage" @size-change="onSize" />
        </div>

        <!-- ── Bulk Add Devices ──────────────────────────────────────
             Scan codes one after another; each is checked against the
             register (duplicates refused) and Blackbelt (identity filled
             where it has a report, typed where it doesn't), then the whole
             list is created in one go. -->
        <el-dialog title="Bulk Add Devices" :visible.sync="baVisible" width="980px" top="5vh"
            :close-on-click-modal="false" @closed="baRows = []">
            <div class="rs-exy">
                <div class="rs-exy-bar">
                    <el-input ref="baInput" v-model="baCode" size="small" class="rs-exy-input"
                        placeholder="Scan or type IMEI / serial, then Enter…" prefix-icon="el-icon-full-screen"
                        clearable :disabled="baSaving" @keyup.enter.native="baScan" />
                    <el-select v-model="baCurrency" size="small" style="width:90px" :disabled="baSaving">
                        <el-option v-for="c in currencies" :key="c" :label="c" :value="c" />
                    </el-select>
                    <el-button v-if="baRows.length" size="small" plain :disabled="baSaving"
                        @click="baRows = []">Clear</el-button>
                </div>
                <div v-if="baMsg" :class="['rs-exy-msg', 'rs-exy-' + baTone]">{{ baMsg }}</div>
                <el-table :data="baRows" border size="mini" max-height="400"
                    empty-text="Nothing yet — scan a device to start the list.">
                    <el-table-column label="IMEI" min-width="150">
                        <template slot-scope="s">
                            <div><b>{{ s.row.imei }}</b></div>
                            <div v-if="s.row.bbChecking" class="rs-ba-sub rs-dim">
                                <i class="el-icon-loading" /> checking Blackbelt…
                            </div>
                            <div v-else :class="['rs-ba-sub', s.row.bbFound ? 'rs-ba-ok' : 'rs-ba-warn']">
                                <i :class="s.row.bbFound ? 'el-icon-success' : 'el-icon-warning'" />
                                {{ s.row.bbFound ? 'Blackbelt found' : 'no Blackbelt report' }}
                            </div>
                            <div v-if="s.row.err" class="rs-ba-sub rs-ba-err">{{ s.row.err }}</div>
                        </template>
                    </el-table-column>
                    <el-table-column label="Device" min-width="300">
                        <template slot-scope="s">
                            <!-- Blackbelt's answer is the identity; typing is
                                 only for devices it doesn't know. -->
                            <div v-if="!s.row.bbFound && !s.row.bbChecking" class="rs-ba-edit">
                                <el-input :value="s.row.model" size="mini" placeholder="Model *" class="bae-model"
                                    @input="v => s.row.model = v.toUpperCase()" />
                                <el-input :value="s.row.color" size="mini" placeholder="Colour" class="bae-small"
                                    @input="v => s.row.color = v.toUpperCase()" />
                                <el-select v-model="s.row.storage" size="mini" clearable filterable allow-create
                                    default-first-option placeholder="Storage" class="bae-small">
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
                            <el-select v-model="s.row.grade" size="mini" clearable placeholder="—" class="rs-full">
                                <el-option v-for="g in grades" :key="g" :label="g" :value="g" />
                            </el-select>
                        </template>
                    </el-table-column>
                    <el-table-column label="Cost" width="100" align="center">
                        <template slot-scope="s">
                            <el-input-number v-model="s.row.costPrice" size="mini" :min="0" :precision="2"
                                :controls="false" class="bae-cost" />
                        </template>
                    </el-table-column>
                    <el-table-column label="" width="46" align="center">
                        <template slot-scope="s">
                            <el-button size="mini" type="text" icon="el-icon-close" class="rs-del"
                                :disabled="baSaving" @click="baRows.splice(s.$index, 1)" />
                        </template>
                    </el-table-column>
                </el-table>
            </div>
            <span slot="footer">
                <span v-if="baRows.length" class="rs-exy-count">
                    {{ baRows.length }} device{{ baRows.length === 1 ? '' : 's' }}
                </span>
                <el-button size="small" :disabled="baSaving" @click="baVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" :loading="baSaving" :disabled="!baRows.length"
                    @click="submitBulkAdd">Add to Stock</el-button>
            </span>
        </el-dialog>

        <!-- ── Assign To Exyon ───────────────────────────────────────
             Scan In Stock devices into a list, then move the lot in one
             call. Sold / away devices are refused at scan time. -->
        <el-dialog title="Assign To Exyon" :visible.sync="exyonVisible" width="720px" top="6vh"
            @closed="exyonRows = []">
            <div class="rs-exy">
                <div class="rs-exy-bar">
                    <el-input ref="exyonInput" v-model="exyonCode" size="small" class="rs-exy-input"
                        placeholder="Scan or type IMEI / serial, then Enter…" prefix-icon="el-icon-full-screen"
                        clearable @keyup.enter.native="exyonScan" />
                    <el-button v-if="exyonRows.length" size="small" plain @click="exyonRows = []">Clear</el-button>
                </div>
                <div v-if="exyonMsg" :class="['rs-exy-msg', 'rs-exy-' + exyonTone]">{{ exyonMsg }}</div>
                <el-table :data="exyonRows" border size="mini" max-height="340"
                    empty-text="Nothing yet — scan a device to start the list.">
                    <el-table-column label="IMEI" min-width="150">
                        <template slot-scope="s"><b>{{ s.row.imei }}</b></template>
                    </el-table-column>
                    <el-table-column label="Device" min-width="200" show-overflow-tooltip>
                        <template slot-scope="s">
                            {{ [s.row.model, s.row.storage, s.row.color].filter(Boolean).join(' · ') || '—' }}
                        </template>
                    </el-table-column>
                    <el-table-column label="Current Location" width="150" align="center">
                        <template slot-scope="s">{{ s.row.location || '—' }}</template>
                    </el-table-column>
                    <el-table-column label="" width="50" align="center">
                        <template slot-scope="s">
                            <el-button size="mini" type="text" icon="el-icon-close" class="rs-del"
                                @click="exyonRows.splice(s.$index, 1)" />
                        </template>
                    </el-table-column>
                </el-table>
            </div>
            <span slot="footer">
                <span v-if="exyonRows.length" class="rs-exy-count">
                    {{ exyonRows.length }} device{{ exyonRows.length === 1 ? '' : 's' }}
                </span>
                <el-button size="small" @click="exyonVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" :loading="exyonSaving" :disabled="!exyonRows.length"
                    @click="submitExyon">Assign To Exyon</el-button>
            </span>
        </el-dialog>

        <!-- ── Return a sold device ──────────────────────────────────
             Record-only: the device goes back In Stock; its sales order
             stays Confirmed with the line flagged returned. -->
        <el-dialog title="Return Device" :visible.sync="returnVisible" width="440px">
            <div v-if="returnRow" class="rs-ret">
                <div class="rs-ret-dev">
                    <b>{{ returnRow.imei }}</b>
                    <span class="rs-dim">
                        {{ [returnRow.model, returnRow.storage, returnRow.color].filter(Boolean).join(' · ') }}
                    </span>
                    <span class="rs-dim">
                        Sold on <b>{{ returnRow.salesOrder.orderNo }}</b> to {{ returnRow.salesOrder.customerName }}
                    </span>
                </div>
                <div class="rs-ret-field">
                    <label>Reason *</label>
                    <el-select v-model="returnForm.reason" size="small" filterable allow-create
                        default-first-option placeholder="Pick or type a reason" class="rs-full">
                        <el-option v-for="r in returnReasons" :key="r" :label="r" :value="r" />
                    </el-select>
                </div>
                <div class="rs-ret-field">
                    <label>Note</label>
                    <el-input v-model="returnForm.note" type="textarea" :rows="2" maxlength="500" size="small"
                        placeholder="Optional detail" />
                </div>
                <div class="rs-ret-hint">
                    The device goes back In Stock and can be sold again. {{ returnRow.salesOrder.orderNo }}
                    keeps its line, marked returned — totals and the invoice are unchanged.
                </div>
            </div>
            <span slot="footer">
                <el-button size="small" @click="returnVisible = false">Cancel</el-button>
                <el-button size="small" type="primary" :loading="returning" :disabled="!returnForm.reason"
                    @click="submitReturn">Return to Stock</el-button>
            </span>
        </el-dialog>

        <!-- Add / Edit a device. Staff type only IMEI, grade and cost —
             model / colour / storage are resolved from the IMEI. -->
        <!-- The report tab reproduces an A4-ish document, so it gets a wider
             dialog than the entry form needs. -->
        <el-dialog :title="editRow ? 'Device Detail' : 'Add Device'" :visible.sync="editVisible"
            :width="dlgTab === 'report' ? '780px' : '520px'">
            <div class="rs-dlg">
                <!-- Existing devices split into Detail / History tabs; a new
                     device has nothing to audit yet, so no tabs. -->
                <el-tabs v-if="editRow" v-model="dlgTab" class="rs-tabs">
                    <el-tab-pane label="Detail" name="detail" />
                    <el-tab-pane v-if="editRow.blackbeltReportId" label="Blackbelt Report" name="report" />
                    <el-tab-pane name="history">
                        <span slot="label">
                            History
                            <span v-if="deviceHistory.length" class="rs-tab-count">({{ deviceHistory.length }})</span>
                        </span>
                    </el-tab-pane>
                </el-tabs>

                <template v-if="!editRow || dlgTab === 'detail'">
                <!-- Existing device: the IMEI / serial is the register's key
                     and can't be changed, so it renders as a header, not an
                     input. -->
                <template v-if="editRow">
                    <div class="rs-view-head">
                        <div class="rs-view-imei">
                            <b>{{ form.imei }}</b>
                            <el-tag v-if="editRow.location" size="mini" effect="plain"
                                :type="locationTag(editRow.location)">{{ editRow.location }}</el-tag>
                            <el-tag v-if="form.stockSource" size="mini" effect="plain" type="info">{{ form.stockSource }}</el-tag>
                        </div>
                        <div class="rs-view-sub">
                            {{ identModel || 'Unknown model' }}<template v-if="form.color"> · {{ form.color }}</template><template v-if="form.storage"> · {{ form.storage }}</template>
                        </div>
                        <!-- Report availability — the verdict itself lives in
                             the Blackbelt Report tab. -->
                        <div class="rs-bb-line">
                            <template v-if="editRow.blackbeltReportId">
                                <i class="el-icon-success rs-bb-yes" />
                                <span class="rs-bb-ok-text">Blackbelt report ready</span>
                            </template>
                            <template v-else>
                                <i class="el-icon-error rs-bb-no" />
                                <span class="rs-dim">No Blackbelt report</span>
                                <el-button size="mini" type="primary" plain class="rs-bb-check-btn"
                                    :loading="bbChecking" @click="bbCheck">Check Blackbelt</el-button>
                            </template>
                        </div>
                    </div>
                    <div class="rs-ident">
                        <div class="rs-ident-grid">
                            <div class="rs-ident-cell"><span>Serial</span><b>{{ form.serialNumber || '—' }}</b></div>
                            <div class="rs-ident-cell">
                                <span>Battery</span>
                                <b :class="batteryClass(form.batteryHealth)">
                                    {{ form.batteryHealth == null ? '—' : form.batteryHealth + '%' }}
                                    <span v-if="form.batteryCycleCount != null" class="rs-cycles">· {{ form.batteryCycleCount }} cycles</span>
                                </b>
                            </div>
                            <div class="rs-ident-cell"><span>A Number</span><b>{{ form.aNumber || '—' }}</b></div>
                            <div class="rs-ident-cell">
                                <span>Added</span>
                                <b>{{ histDate(editRow.createdAt) }}<span v-if="editRow.createdBy" class="rs-cycles"> · {{ editRow.createdBy }}</span></b>
                            </div>
                        </div>
                    </div>
                </template>

                <!-- New device: IMEI-first entry with Blackbelt lookup -->
                <template v-else>
                <div class="rs-step-label">IMEI</div>
                <div class="rs-imei-row">
                    <el-input
                        ref="imeiInput"
                        v-model="form.imei"
                        size="small"
                        placeholder="Scan or type the IMEI / serial"
                        prefix-icon="el-icon-cpu"
                        clearable
                        @keyup.enter.native="lookupImei"
                        @input="onImeiInput"
                    />
                    <el-button size="small" type="primary" plain icon="el-icon-search"
                        :loading="lookingUp" :disabled="!imeiReady" @click="lookupImei">Look up</el-button>
                </div>

                <!-- resolved device identity (read-only) -->
                <div v-if="lookupState === 'ok' || lookupState === 'known'" class="rs-ident">
                    <div v-if="lookupState === 'known'" class="rs-ident-warn">
                        <i class="el-icon-warning-outline" /> This IMEI is already in stock — saving will fail. Edit the existing device instead.
                    </div>
                    <div v-else-if="form.blackbeltChecked" class="rs-ident-ok">
                        <i class="el-icon-circle-check" /> Blackbelt report found
                    </div>
                    <div class="rs-ident-grid">
                        <!-- Without a Blackbelt report these are typed in the
                             Details form below instead of shown here. -->
                        <template v-if="!canEditIdentity">
                            <div class="rs-ident-cell"><span>Model</span><b>{{ identModel || '—' }}</b></div>
                            <div class="rs-ident-cell"><span>Colour</span><b>{{ form.color || '—' }}</b></div>
                            <div class="rs-ident-cell"><span>Storage</span><b>{{ form.storage || '—' }}</b></div>
                        </template>
                        <div class="rs-ident-cell">
                            <span>Battery</span>
                            <b :class="batteryClass(form.batteryHealth)">
                                {{ form.batteryHealth == null ? '—' : form.batteryHealth + '%' }}
                                <span v-if="form.batteryCycleCount != null" class="rs-cycles">· {{ form.batteryCycleCount }} cycles</span>
                            </b>
                        </div>
                        <div v-if="form.serialNumber" class="rs-ident-cell"><span>Serial</span><b>{{ form.serialNumber }}</b></div>
                        <div v-if="form.stockSource" class="rs-ident-cell"><span>Stock Source</span><b>{{ form.stockSource }}</b></div>
                    </div>
                </div>
                <el-alert v-else-if="lookupState === 'notConfigured'" type="info" :closable="false" show-icon
                    class="rs-ident-alert" :title="lookupMessage" />
                <el-alert v-else-if="lookupState === 'notFound'" type="warning" :closable="false" show-icon
                    class="rs-ident-alert" :title="lookupMessage" />
                <el-alert v-else-if="lookupState === 'error'" type="error" :closable="false" show-icon
                    class="rs-ident-alert" :title="lookupMessage" />
                <div v-else class="rs-ident-idle">
                    Enter IMEI to look up device detail
                </div>
                </template>

                <!-- what staff actually enter -->
                <div class="rs-step-label">Details</div>
                <el-form label-width="120px" size="small" class="rs-form" @submit.native.prevent>
                    <!-- Blackbelt owns the identity when it has a report on the
                         unit; without one these are entered by hand. -->
                    <template v-if="canEditIdentity">
                        <el-form-item label="Model">
                            <el-input :value="form.model" placeholder="e.g. IPHONE 13"
                                @input="v => form.model = upper(v)" />
                        </el-form-item>
                        <el-form-item label="Colour">
                            <el-input :value="form.color" placeholder="e.g. BLACK"
                                @input="v => form.color = upper(v)" />
                        </el-form-item>
                        <el-form-item label="Storage">
                            <!-- allow-create keeps an odd size from Blackbelt
                                 (or an old record) selectable, not wiped. -->
                            <el-select v-model="form.storage" clearable filterable allow-create
                                default-first-option placeholder="Select storage" class="rs-full">
                                <el-option v-for="s in storageOptions" :key="s" :label="s" :value="s" />
                            </el-select>
                        </el-form-item>
                    </template>
                    <el-form-item label="Grade">
                        <el-radio-group v-model="form.grade" size="small" class="rs-grades">
                            <el-radio-button v-for="g in gradeOptions" :key="g" :label="g" />
                        </el-radio-group>
                    </el-form-item>
                    <el-form-item label="Cost Price">
                        <el-input v-model="form.costPrice" class="rs-cost" placeholder="0.00"
                            @input="onCostInput">
                            <el-select slot="prepend" v-model="form.currency" class="rs-cur">
                                <el-option v-for="c in currencies" :key="c" :label="c" :value="c" />
                            </el-select>
                        </el-input>
                    </el-form-item>
                    <el-form-item label="Note">
                        <el-input v-model="form.note" type="textarea" :rows="2" resize="none" placeholder="Optional" />
                    </el-form-item>
                </el-form>
                </template>

                <!-- Audit trail — every edit, newest first. Mirrors the SQT
                     case Status History timeline. -->
                <div v-if="editRow && dlgTab === 'history'" class="rs-history">
                    <!-- Most entries carry their whole story in the action
                         text ("Sold on RSO-10010 to …", "Sent for repair —
                         …"); histMeta turns that into a category tag and
                         keeps the full sentence underneath. -->
                    <el-timeline v-if="deviceHistory.length">
                        <el-timeline-item v-for="(h, i) in deviceHistory" :key="i"
                            :timestamp="histDate(h.at)" placement="top"
                            :color="histMeta(h).color">
                            <div class="rs-hist-card">
                                <div>
                                    <el-tag size="mini" :type="histMeta(h).type" effect="light">
                                        {{ histMeta(h).label }}
                                    </el-tag>
                                    <span class="rs-hist-by"><i class="el-icon-user" /> {{ h.by || 'system' }}</span>
                                </div>
                                <div v-if="histMeta(h).text" class="rs-hist-note">{{ histMeta(h).text }}</div>
                                <div v-if="h.changes && h.changes.length" class="rs-hist-note">
                                    <div v-for="(c, j) in h.changes" :key="j">{{ changeLine(c) }}</div>
                                </div>
                            </div>
                        </el-timeline-item>
                    </el-timeline>
                    <div v-else class="rs-hist-empty">No history recorded for this device yet.</div>
                </div>

                <!-- Full Blackbelt report, fetched live by the stored id and
                     laid out like Blackbelt's own Analyst Report PDF -->
                <div v-if="editRow && dlgTab === 'report'" v-loading="reportLoading" class="rs-report">
                    <template v-if="report">
                        <div class="rs-report-head">
                            <div>
                                <div class="rs-report-title">Analyst Report</div>
                                <div class="rs-report-id">
                                    Report #{{ report.analyst.reportId || editRow.blackbeltReportId }}<template
                                        v-if="report.analyst.finishDate"> · {{ report.analyst.finishDate }}</template>
                                </div>
                            </div>
                        </div>

                        <div class="rs-rep-sec">Device Information</div>
                        <div class="rs-rep-grid">
                            <div v-for="c in reportDeviceRows" :key="c[0]"
                                :class="['rs-rep-cell', c[2] && 'rs-rep-wide']">
                                <span class="rs-rep-label">{{ c[0] }}:</span>
                                <span class="rs-rep-value" :title="c[1]">{{ c[1] }}</span>
                            </div>
                        </div>

                        <div class="rs-rep-sec">Battery Information</div>
                        <div class="rs-rep-grid">
                            <div v-for="c in reportBatteryRows" :key="c[0]" class="rs-rep-cell">
                                <span class="rs-rep-label">{{ c[0] }}:</span>
                                <span class="rs-rep-value"
                                    :class="c[0] === 'Health' ? batteryClass(parseInt(c[1])) : ''"
                                    :title="c[1]">{{ c[1] }}</span>
                            </div>
                        </div>

                        <div class="rs-rep-sec">Device Testing Information</div>
                        <div class="rs-rep-grid rs-rep-tests">
                            <div v-for="t in report.tests" :key="t.name" class="rs-rep-cell">
                                <span class="rs-rep-label">{{ prettyName(t.name) }}:</span>
                                <i :class="['rs-rep-vicon', testIcon(t.result), testClass(t.result)]" :title="t.result" />
                            </div>
                        </div>
                        <div class="rs-legend">
                            <span><i class="el-icon-success rs-verdict-pass" /> PASS</span>
                            <span><i class="el-icon-error rs-verdict-fail" /> FAIL</span>
                            <span><i class="el-icon-question rs-verdict-na" /> NOT TESTED</span>
                        </div>

                        <template v-if="report.parts.length">
                            <div class="rs-rep-sec">Genuine Parts</div>
                            <div class="rs-rep-grid rs-rep-tests">
                                <div v-for="p in report.parts" :key="p.name" class="rs-rep-cell">
                                    <span class="rs-rep-label">{{ prettyName(p.name) }}:</span>
                                    <span :class="['rs-rep-verdict', p.status === 'Genuine' ? 'rs-verdict-pass' : 'rs-verdict-warn']">
                                        {{ p.status || p.result || '—' }}
                                    </span>
                                </div>
                            </div>
                        </template>

                        <div class="rs-rep-sec">Analyst Information</div>
                        <div class="rs-rep-grid">
                            <div v-for="c in reportAnalystRows" :key="c[0]" class="rs-rep-cell">
                                <span class="rs-rep-label">{{ c[0] }}:</span>
                                <span class="rs-rep-value" :title="c[1]">{{ c[1] }}</span>
                            </div>
                        </div>
                    </template>
                    <div v-else-if="!reportLoading" class="rs-hist-empty">{{ reportError || 'No report loaded.' }}</div>
                </div>
            </div>
            <span slot="footer">
                <el-button size="small" @click="editVisible = false">Cancel</el-button>
                <el-button v-if="!editRow || dlgTab === 'detail'" type="primary" size="small"
                    :loading="saving" :disabled="!imeiReady" @click="save">Save</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import {
    getRefurbDevices, getRefurbDeviceFilters, createRefurbDevice, updateRefurbDevice,
    deleteRefurbDevice, lookupRefurbDevice, getRefurbDeviceReport, checkRefurbDeviceBlackbelt,
    returnRefurbSalesOrderDevice, bulkAssignLocation
} from '@/api/refurbished'

// The grading scale we actually use.
const GRADES = ['A++', 'A+', 'A', 'B+', 'B', 'C+', 'C']
// The sizes phones and tablets actually ship in, 16GB to 2TB. The picker
// also accepts a typed value for anything outside the ladder.
const STORAGES = ['16GB', '32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB']
// Stock gets bought in several markets — cost is stored with its currency.
const CURRENCIES = ['AUD', 'CNY', 'HKD']
const SYMBOLS = { AUD: '$', CNY: '¥', HKD: 'HK$' }
// Readable names for the fields a history entry can touch.
const FIELD_LABELS = {
    imei: 'IMEI', model: 'Model', color: 'Colour', storage: 'Storage', grade: 'Grade',
    costPrice: 'Cost Price', currency: 'Currency', stockSource: 'Stock Source', location: 'Location',
    blackbeltChecked: 'Blackbelt', note: 'Note', brand: 'Brand', serialNumber: 'Serial Number',
    batteryHealth: 'Battery Health', batteryCycleCount: 'Battery Cycles',
    batteryCapacity: 'Battery Capacity', aNumber: 'A Number', blackbeltReportId: 'Blackbelt Report'
}

export default {
    name: 'RefurbishedStock',
    data() {
        return {
            loading: false,
            rows: [],
            total: 0,
            currencies: CURRENCIES,
            grades: GRADES,
            storageOptions: STORAGES,
            filters: { models: [], grades: [], stockSources: [], storages: [], colors: [], locations: [] },
            query: {
                page: 1, pageSize: 25, search: '',
                grade: '', stockSource: '', location: '', status: '',
                sort: 'createdAt', order: 'desc'
            },
            // Bulk Add — scan many codes, create them together.
            baVisible: false,
            baCode: '',
            baRows: [],
            baCurrency: 'AUD',
            baMsg: '',
            baTone: 'ok',
            baSaving: false,

            // Assign To Exyon — scan a list, move it in one call.
            exyonVisible: false,
            exyonCode: '',
            exyonRows: [],
            exyonMsg: '',
            exyonTone: 'ok',
            exyonSaving: false,

            // Returning a sold device off its order (record only).
            returnVisible: false,
            returnRow: null,
            returning: false,
            returnForm: { reason: '', note: '' },
            returnReasons: ['Change of mind', 'Faulty on arrival', 'Wrong device', 'Customer dispute'],

            // Add/Edit dialog
            editVisible: false,
            editRow: null,
            dlgTab: 'detail',
            // Blackbelt report (Report tab) — fetched lazily per device.
            report: null,
            reportLoading: false,
            reportError: '',
            // Per-device Blackbelt re-check in flight
            bbChecking: false,
            form: {
                imei: '', model: '', color: '', storage: '', grade: '',
                costPrice: '', currency: 'AUD',
                stockSource: '', blackbeltChecked: false, note: '',
                brand: '', serialNumber: '', batteryHealth: null, batteryCycleCount: null,
                batteryCapacity: '', aNumber: '', blackbeltReportId: '', blackbeltStatus: ''
            },
            saving: false,
            // IMEI lookup: idle | ok | known (already in stock) |
            // notConfigured (API not wired yet) | error
            lookupState: 'idle',
            lookupMessage: '',
            lookingUp: false
        }
    },
    computed: {
        isSupplier() {
            return (this.$store.getters.roles || []).includes('phone-supplier')
        },
        // A plausible code is enough to enable lookup / save; the backend
        // does the authoritative check. Letters are allowed because iPads
        // and Watches only have an alphanumeric Apple serial.
        imeiReady() {
            return /^[A-Z0-9]{10,20}$/.test(String(this.form.imei || '').replace(/[\s-]/g, '').toUpperCase())
        },
        // Blackbelt reports brand and model separately ("Apple" +
        // "iPhone 14 Pro"); show them as one line without repeating the brand.
        identModel() {
            const brand = String(this.form.brand || '').trim()
            const model = String(this.form.model || '').trim()
            if (!brand) return model
            if (!model) return brand
            return model.toLowerCase().startsWith(brand.toLowerCase()) ? model : `${brand} ${model}`
        },
        // Blackbelt is the source of truth for a unit it holds a report on.
        // Everything else — no report, or a lookup that came back empty —
        // gets model / colour / storage typed in by hand.
        canEditIdentity() {
            return this.editRow ? !this.editRow.blackbeltReportId : !this.form.blackbeltChecked
        },
        // Fixed scale, plus whatever an older record happens to carry so
        // editing it doesn't silently reassign the grade.
        gradeOptions() {
            const g = String(this.form.grade || '').trim()
            return g && !GRADES.includes(g) ? GRADES.concat(g) : GRADES
        },
        gradeFilterOptions() {
            return [...new Set(GRADES.concat(this.filters.grades))]
        },
        deviceHistory() {
            const h = (this.editRow && this.editRow.history) || []
            return h.slice().reverse() // newest first
        },
        // Rows mirror Blackbelt's Analyst Report PDF; the third element
        // marks values too long for half a row (they span the full width).
        reportDeviceRows() {
            const d = (this.report && this.report.device) || {}
            return [
                ['Manufacturer', d.manufacturer],
                ['Model', d.model && d.modelNumber ? `${d.model} (${d.modelNumber})` : (d.model || d.modelNumber)],
                ['Operating System', d.os], ['Version', d.osVersion],
                ['Serial Number', d.serialNumber], ['IMEI/MEID', d.imei],
                ['IMEI 2', d.imei2],
                ['A Number', d.aNumber], ['Device Storage', d.storage],
                ['RAM', d.ram], ['Device Color', d.color],
                ['MLB Serial Number', d.mlbSerial], ['Region Info', d.region],
                ['FMIP', d.fmip], ['MDM Status', d.mdmStatus],
                ['CPU Name', d.cpuName], ['CPU Speed', d.cpuSpeed],
                ['Country Origin', d.countryOrigin],
                ['EID', d.eid, true],
                ['Manufacture Date', d.manufactureDate],
                ['Device ID', d.deviceId, true]
            ].filter(c => c[1])
        },
        reportBatteryRows() {
            const b = (this.report && this.report.battery) || {}
            return [
                ['Serial', b.serial], ['Manufacturer Date', b.manufacturerDate],
                ['Temperature', b.temperature], ['Design Capacity', b.designCapacity],
                ['Actual Design Capacity', b.actualDesignCapacity], ['Full Charge Capacity', b.fullChargeCapacity],
                ['Cycle Count', b.cycleCount], ['Health', b.health]
            ].filter(c => c[1])
        },
        reportAnalystRows() {
            const a = (this.report && this.report.analyst) || {}
            return [
                ['Start Date', a.startDate], ['Start Time', a.startTime],
                ['Finish Date', a.finishDate], ['Finish Time', a.finishTime],
                ['Device Analyst Version', a.deviceAnalystVersion],
                ['Analyst Application Version', a.appVersion],
                ['Operator/User Name', a.operator], ['License Id', a.licenseId],
                ['Profile Name', a.profileName],
                ['Status', (this.report && this.report.status) || '']
            ].filter(c => c[1])
        }
    },
    watch: {
        dlgTab(tab) {
            if (tab === 'report') this.loadReport()
        }
    },
    created() {
        this.loadFilters()
        this.load()
    },
    activated() {
        this.load()
    },
    methods: {
        blankForm() {
            return {
                imei: '', model: '', color: '', storage: '', grade: '',
                costPrice: '', currency: 'AUD',
                stockSource: '', blackbeltChecked: false, note: '',
                brand: '', serialNumber: '', batteryHealth: null, batteryCycleCount: null,
                batteryCapacity: '', aNumber: '', blackbeltReportId: '', blackbeltStatus: ''
            }
        },
        async load() {
            this.loading = true
            try {
                const r = await getRefurbDevices(this.query)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.rows || []
                this.total = r.total || 0
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load devices'))
            } finally {
                this.loading = false
            }
        },
        async loadFilters() {
            try {
                const r = await getRefurbDeviceFilters()
                if (r && r.success !== false) {
                    this.filters = {
                        models: r.models || [], grades: r.grades || [], stockSources: r.stockSources || [],
                        storages: r.storages || [], colors: r.colors || [], locations: r.locations || []
                    }
                }
            } catch (e) { /* non-fatal — the dropdowns just stay empty */ }
        },
        reload() { this.query.page = 1; this.load() },

        // ── bulk action menu ─────────────────────────────────────────
        bulkCommand(cmd) {
            if (cmd === 'bulk-add') this.openBulkAdd()
            else if (cmd === 'exyon') this.openExyon()
            // The create dialogs live on their own pages — land there with
            // the dialog already open.
            else if (cmd === 'sale') this.$router.push({ path: '/refurbished/sales-orders', query: { create: '1' } })
            else if (cmd === 'repair') this.$router.push({ path: '/refurbished/repairs', query: { create: '1' } })
            else if (cmd === 'supply') this.$router.push({ path: '/refurbished/supply', query: { create: '1' } })
        },
        // ── bulk add ─────────────────────────────────────────────────
        openBulkAdd() {
            this.baRows = []
            this.baCode = ''
            this.baMsg = ''
            this.baCurrency = 'AUD'
            this.baVisible = true
            this.$nextTick(() => {
                const el = this.$refs.baInput
                if (el && el.focus) el.focus()
            })
        },
        baSay(tone, msg) {
            this.baTone = tone
            this.baMsg = msg
        },
        async baScan() {
            const code = String(this.baCode || '').replace(/[\s-]/g, '').trim().toUpperCase()
            this.baCode = ''
            if (!code) return
            if (!/^[A-Z0-9]{10,20}$/.test(code)) {
                this.baSay('error', '"' + code + '" is not a valid IMEI or serial')
                return
            }
            if (this.baRows.some(r => String(r.imei).toUpperCase() === code)) {
                this.baSay('warn', code + ' is already on the list')
                return
            }
            // Seeded in full — Vue 2 can't track keys added later.
            const row = {
                imei: code,
                model: '', color: '', storage: '', grade: '',
                costPrice: undefined,
                bbChecking: true,
                bbFound: false,
                err: '',
                bb: {}
            }
            this.baRows.unshift(row)
            this.baSay('ok', code + ' added — checking Blackbelt…')
            try {
                const r = await lookupRefurbDevice(code)
                if (r && r.alreadyInStock) {
                    const i = this.baRows.indexOf(row)
                    if (i >= 0) this.baRows.splice(i, 1)
                    this.baSay('error', code + ' is already in the stock register')
                    return
                }
                const d = (r && r.device) || {}
                row.model = d.model || ''
                row.color = d.color || ''
                row.storage = d.storage || ''
                // Passed through to the create so the record matches one
                // added from the single-device dialog.
                row.bb = {
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
                row.bbFound = !!(r && r.found)
                if (row.bbFound) this.baSay('ok', code + ' — ' + (d.model || 'report found'))
                else this.baSay('warn', code + ' — no Blackbelt report, enter the details')
            } catch (e) {
                this.baSay('error', 'Lookup failed for ' + code + ' — details can be typed in')
            } finally {
                row.bbChecking = false
                this.$nextTick(() => {
                    const el = this.$refs.baInput
                    if (el && el.focus) el.focus()
                })
            }
        },
        // Creates the list one record at a time — a failure keeps its row
        // (with the reason on it) while the successes leave the list, so a
        // retry only touches what actually failed.
        async submitBulkAdd() {
            const checking = this.baRows.find(r => r.bbChecking)
            if (checking) {
                this.$message.warning(`Still checking ${checking.imei} against Blackbelt — one moment`)
                return
            }
            const noModel = this.baRows.find(r => !String(r.model || '').trim())
            if (noModel) {
                this.$message.warning(`Enter a model for ${noModel.imei}`)
                return
            }
            this.baSaving = true
            let created = 0
            const failed = []
            for (const row of this.baRows) {
                try {
                    const r = await createRefurbDevice({
                        imei: row.imei,
                        model: row.model,
                        color: row.color,
                        storage: row.storage,
                        grade: row.grade,
                        costPrice: row.costPrice,
                        currency: this.baCurrency,
                        ...row.bb
                    })
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    created++
                } catch (e) {
                    row.err = this.msg(e, 'Failed to add')
                    failed.push(row)
                }
            }
            this.baSaving = false
            this.baRows = failed
            if (created) this.$message.success(`${created} device(s) added to stock`)
            if (failed.length) {
                this.baSay('error', `${failed.length} device(s) failed — fix and press Add to Stock again`)
            } else {
                this.baVisible = false
            }
            this.load()
        },

        openExyon() {
            this.exyonRows = []
            this.exyonCode = ''
            this.exyonMsg = ''
            this.exyonVisible = true
            this.$nextTick(() => {
                const el = this.$refs.exyonInput
                if (el && el.focus) el.focus()
            })
        },
        exySay(tone, msg) {
            this.exyonTone = tone
            this.exyonMsg = msg
        },
        async exyonScan() {
            const code = String(this.exyonCode || '').replace(/[\s-]/g, '').trim().toUpperCase()
            this.exyonCode = ''
            if (!code) return
            if (this.exyonRows.some(r =>
                String(r.imei).toUpperCase() === code ||
                String(r.serialNumber || '').toUpperCase() === code)) {
                this.exySay('warn', code + ' is already on the list')
                return
            }
            try {
                const r = await getRefurbDevices({ search: code, pageSize: 10 })
                const hit = (r.rows || []).find(d =>
                    String(d.imei).toUpperCase() === code ||
                    String(d.serialNumber || '').toUpperCase() === code)
                if (!hit) { this.exySay('error', code + ' is not in the stock register'); return }
                if (hit.status && hit.status !== 'In Stock') {
                    this.exySay('error', code + ' is ' + hit.status + ' — only In Stock devices can move')
                    return
                }
                if (hit.location === 'Assigned To Exyon') {
                    this.exySay('warn', code + ' is already at Assigned To Exyon')
                    return
                }
                this.exyonRows.unshift(hit)
                this.exySay('ok', code + ' added — ' + (hit.model || 'unknown model'))
            } catch (e) {
                this.exySay('error', 'Lookup failed — try again')
            }
        },
        async submitExyon() {
            this.exyonSaving = true
            try {
                const r = await bulkAssignLocation({
                    location: 'Assigned To Exyon',
                    deviceIds: this.exyonRows.map(d => d._id)
                })
                this.$message.success(r.message || 'Moved')
                if ((r.skipped || []).length) {
                    this.$notify.warning({
                        title: 'Some devices were skipped',
                        message: r.skipped.map(s => `${s.imei}: ${s.reason}`).join('\n'),
                        duration: 0
                    })
                }
                this.exyonVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to move the devices'))
            } finally {
                this.exyonSaving = false
            }
        },

        // ── return a sold device ─────────────────────────────────────
        openReturn(row) {
            this.returnRow = row
            this.returnForm = { reason: '', note: '' }
            this.returnVisible = true
        },
        async submitReturn() {
            this.returning = true
            try {
                const r = await returnRefurbSalesOrderDevice(this.returnRow.salesOrder.id, {
                    deviceId: this.returnRow._id,
                    reason: this.returnForm.reason,
                    note: this.returnForm.note
                })
                this.$message.success(r.message || 'Returned to stock')
                this.returnVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to return the device'))
            } finally {
                this.returning = false
            }
        },
        onPage(p) { this.query.page = p; this.load() },
        onSize(s) { this.query.pageSize = s; this.query.page = 1; this.load() },
        // ── Add / Edit ───────────────────────────────────────────────
        openEdit(row) {
            this.editRow = row
            this.dlgTab = 'detail'
            this.report = null
            this.reportError = ''
            this.form = row
                ? {
                    imei: row.imei || '', model: row.model || '', color: row.color || '',
                    storage: row.storage || '', grade: row.grade || '',
                    costPrice: row.costPrice == null ? '' : String(row.costPrice),
                    currency: row.currency || 'AUD',
                    stockSource: row.stockSource || '', blackbeltChecked: row.blackbeltChecked === true,
                    note: row.note || '',
                    brand: row.brand || '', serialNumber: row.serialNumber || '',
                    batteryHealth: row.batteryHealth == null ? null : row.batteryHealth,
                    batteryCycleCount: row.batteryCycleCount == null ? null : row.batteryCycleCount,
                    batteryCapacity: row.batteryCapacity || '', aNumber: row.aNumber || '',
                    blackbeltReportId: row.blackbeltReportId || '',
                    blackbeltStatus: row.blackbeltStatus || ''
                }
                : this.blankForm()
            // An existing device already has its identity — show it as
            // resolved rather than asking the user to look it up again.
            this.lookupState = row ? 'ok' : 'idle'
            this.lookupMessage = ''
            this.editVisible = true
            if (!row) {
                this.$nextTick(() => {
                    const el = this.$refs.imeiInput
                    if (el && el.focus) el.focus()
                })
            }
        },
        // Typing a different IMEI invalidates whatever was resolved before.
        onImeiInput() {
            if (this.editRow) return
            if (this.lookupState !== 'idle') {
                this.lookupState = 'idle'
                this.lookupMessage = ''
                Object.assign(this.form, {
                    model: '', color: '', storage: '', stockSource: '', brand: '', serialNumber: '',
                    batteryHealth: null, batteryCycleCount: null, batteryCapacity: '',
                    aNumber: '', blackbeltReportId: '', blackbeltStatus: '', blackbeltChecked: false
                })
            }
        },
        async lookupImei() {
            if (!this.imeiReady || this.lookingUp) return
            this.lookingUp = true
            try {
                const r = await lookupRefurbDevice(String(this.form.imei || '').replace(/[\s-]/g, ''))
                if (!r || r.success === false) throw new Error((r && r.message) || 'Lookup failed')
                const d = r.device || {}
                Object.assign(this.form, {
                    imei: d.imei || this.form.imei,
                    model: d.model || '',
                    color: d.color || '',
                    storage: d.storage || '',
                    stockSource: d.stockSource || '',
                    brand: d.brand || '',
                    serialNumber: d.serialNumber || '',
                    batteryHealth: d.batteryHealth == null ? null : d.batteryHealth,
                    batteryCycleCount: d.batteryCycleCount == null ? null : d.batteryCycleCount,
                    batteryCapacity: d.batteryCapacity || '',
                    aNumber: d.aNumber || '',
                    blackbeltReportId: r.blackbeltReportId || '',
                    blackbeltStatus: r.blackbeltStatus || ''
                })
                if (r.alreadyInStock) {
                    this.lookupState = 'known'
                } else if (r.notConfigured) {
                    this.lookupState = 'notConfigured'
                    this.lookupMessage = r.message || 'Blackbelt lookup isn\'t configured.'
                } else if (r.lookupError) {
                    this.lookupState = 'error'
                    this.lookupMessage = r.lookupError
                } else if (r.found === false) {
                    this.lookupState = 'notFound'
                    this.lookupMessage = r.message || 'Blackbelt has no report for this device — enter the details manually or save as is.'
                } else {
                    this.lookupState = 'ok'
                    // A Blackbelt report IS the check — tick it off.
                    if (r.blackbeltChecked) this.form.blackbeltChecked = true
                }
            } catch (e) {
                this.lookupState = 'error'
                this.lookupMessage = this.msg(e, 'IMEI lookup failed')
            } finally {
                this.lookingUp = false
            }
        },
        async save() {
            const imei = String(this.form.imei || '').replace(/[\s-]/g, '').trim()
            if (!imei) { this.$message.warning('IMEI is required.'); return }
            this.saving = true
            try {
                const cost = String(this.form.costPrice || '').trim()
                const payload = { ...this.form, imei, costPrice: cost === '' ? null : Number(cost) }
                const r = this.editRow
                    ? await updateRefurbDevice(this.editRow._id, payload)
                    : await createRefurbDevice(payload)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.editRow ? 'Device updated' : 'Device added')
                this.editVisible = false
                this.loadFilters()
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to save device'))
            } finally {
                this.saving = false
            }
        },
        remove(row) {
            this.$confirm(`Remove device ${row.imei} from stock?`, 'Delete device', {
                type: 'warning', confirmButtonText: 'Delete', cancelButtonText: 'Cancel'
            }).then(async () => {
                try {
                    const r = await deleteRefurbDevice(row._id)
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    this.$message.success('Device removed')
                    this.load()
                } catch (e) {
                    this.$message.error(this.msg(e, 'Failed to delete device'))
                }
            }).catch(() => {})
        },
        // Apple treats <80% as "service recommended"; 80-89 is worth a warning.
        batteryClass(v) {
            if (v == null) return ''
            if (v >= 90) return 'rs-batt-good'
            if (v >= 80) return 'rs-batt-ok'
            return 'rs-batt-low'
        },
        // Re-ask Blackbelt for a device added before its report existed.
        async bbCheck() {
            if (this.bbChecking || !this.editRow) return
            this.bbChecking = true
            try {
                const r = await checkRefurbDeviceBlackbelt(this.editRow._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                if (!r.found) {
                    this.$message.info(r.message || 'Blackbelt still has no report for this device.')
                    return
                }
                this.$message.success(r.message || 'Blackbelt report found')
                // Blackbelt wins, so anything it replaced is worth naming —
                // a model or colour changing under you needs an explanation.
                if ((r.corrected || []).length) {
                    this.$notify.info({
                        title: 'Corrected from Blackbelt',
                        message: r.corrected
                            .map(c => `${c.label}: "${c.from}" -> "${c.to}"`)
                            .join('\n'),
                        duration: 0
                    })
                }
                // Fresh doc from the server; replacing the reference keeps
                // every new field reactive.
                this.editRow = { ...this.editRow, ...r.device }
                Object.assign(this.form, {
                    blackbeltChecked: true,
                    blackbeltStatus: r.device.blackbeltStatus || '',
                    brand: r.device.brand || this.form.brand,
                    model: r.device.model || this.form.model,
                    color: r.device.color || this.form.color,
                    storage: r.device.storage || this.form.storage,
                    serialNumber: r.device.serialNumber || this.form.serialNumber,
                    batteryHealth: r.device.batteryHealth != null ? r.device.batteryHealth : this.form.batteryHealth,
                    batteryCycleCount: r.device.batteryCycleCount != null ? r.device.batteryCycleCount : this.form.batteryCycleCount,
                    aNumber: r.device.aNumber || this.form.aNumber,
                    blackbeltReportId: r.device.blackbeltReportId || ''
                })
                this.report = null // the Report tab should fetch fresh
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Blackbelt check failed'))
            } finally {
                this.bbChecking = false
            }
        },
        async loadReport() {
            if (this.report || this.reportLoading || !this.editRow) return
            this.reportLoading = true
            this.reportError = ''
            try {
                const r = await getRefurbDeviceReport(this.editRow._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                if (!r.hasReport) {
                    this.reportError = r.message || 'No Blackbelt report for this device.'
                    return
                }
                this.report = r.report
            } catch (e) {
                this.reportError = this.msg(e, 'Failed to load the report')
            } finally {
                this.reportLoading = false
            }
        },
        testClass(result) {
            const v = String(result || '').toUpperCase()
            if (v === 'PASS') return 'rs-verdict-pass'
            if (v === 'FAIL') return 'rs-verdict-fail'
            if (v === 'WARNING') return 'rs-verdict-warn'
            return 'rs-verdict-na'
        },
        // NOT TESTED and NOT SUPPORTED ON DEVICE both read as "no answer".
        testIcon(result) {
            const v = String(result || '').toUpperCase()
            if (v === 'PASS') return 'el-icon-success'
            if (v === 'FAIL') return 'el-icon-error'
            if (v === 'WARNING') return 'el-icon-warning'
            return 'el-icon-question'
        },
        // "MultiTouchScreen" → "Multi Touch Screen"; all-caps names stay.
        prettyName(name) {
            return String(name || '').replace(/([a-z])([A-Z])/g, '$1 $2')
        },
        changeLine(c) {
            return `${FIELD_LABELS[c.field] || c.field}: ${this.histVal(c.field, c.from)} → ${this.histVal(c.field, c.to)}`
        },
        histVal(field, v) {
            if (field === 'blackbeltChecked') return v ? 'Checked' : 'Not checked'
            if (v === null || v === undefined || v === '') return '—'
            return String(v)
        },
        // Category, colour and display text for one history entry. The
        // writers put the specifics in `action` ("Sold on RSO-10010 to …"),
        // so the full sentence is always shown; the tag is just a scent.
        histMeta(h) {
            const a = String(h.action || '')
            if (a === 'created') {
                return { label: 'Created', type: 'success', color: '#67C23A', text: h.note || '' }
            }
            if (a === 'updated') {
                return { label: 'Updated', type: '', color: '#409EFF', text: h.note || '' }
            }
            const rules = [
                [/^Sold on/i, 'Sold', 'danger', '#F56C6C'],
                [/^Returned from repair/i, 'Back from Repair', 'warning', '#E6A23C'],
                [/^Returned from/i, 'Customer Return', 'warning', '#E6A23C'],
                [/^Removed from/i, 'Off Order', 'info', '#909399'],
                [/^Sent for repair/i, 'To Repairer', 'warning', '#E6A23C'],
                [/^Sent to iMobile/i, 'Supply Sent', 'warning', '#E6A23C'],
                [/^Received/i, 'Received', 'success', '#67C23A'],
                [/^Moved to/i, 'Moved', 'info', '#909399'],
                [/cancelled/i, 'Cancelled', 'info', '#909399'],
                [/^Repair batch/i, 'Repair', 'info', '#909399'],
                [/reassigned/i, 'Reassigned', 'info', '#909399']
            ]
            for (const [re, label, type, color] of rules) {
                if (re.test(a)) {
                    return { label, type, color, text: a + (h.note ? ' · ' + h.note : '') }
                }
            }
            return { label: 'Updated', type: '', color: '#409EFF', text: a + (h.note ? ' · ' + h.note : '') }
        },
        histDate(v) {
            const d = new Date(v)
            return isNaN(d) ? '—' : d.toLocaleString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            })
        },
        locationTag(loc) {
            if (loc === 'iMobile') return 'success'
            if (loc === 'Supplier Stock') return 'warning'
            return '' // Assigned To Exyon — blue
        },
        soldTitle(row) {
            const so = row.salesOrder || {}
            return [so.orderNo, so.customerName].filter(Boolean).join(' — ') || 'Sold'
        },
        gradeTag(g) {
            const k = String(g).trim().toUpperCase().charAt(0)
            if (k === 'A') return 'success'
            if (k === 'B') return ''
            if (k === 'C') return 'warning'
            return 'info'
        },
        money(v, cur) {
            const n = Number(v)
            if (!isFinite(n)) return '—'
            const symbol = SYMBOLS[cur] || SYMBOLS.AUD
            return symbol + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        },
        // Free-typed amount — keep it to digits and a single decimal point.
        onCostInput(v) {
            const clean = String(v == null ? '' : v).replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
            if (clean !== v) this.form.costPrice = clean
        },
        // Identity fields are stored uppercase across the module (Blackbelt
        // reports them that way, and incoming sheets are uppercased on
        // import), so typed values follow the same shape.
        upper(v) {
            return String(v == null ? '' : v).toUpperCase()
        },
        msg(e, fallback) { return (e.response && e.response.data && e.response.data.message) || e.message || fallback }
    }
}
</script>

<style lang="scss" scoped>
.rs-stock { padding: 12px 16px; }
.rs-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.f-search { width: 250px; }
.f-sel { width: 130px; }
.f-sel-w { width: 170px; }
.rs-spacer { flex: 1; }
.rs-pager { margin-top: 10px; text-align: right; }
.rs-full { width: 100%; }
.rs-ba-sub { font-size: 11px; line-height: 1.4; margin-top: 1px; }
.rs-ba-ok { color: #67c23a; }
.rs-ba-warn { color: #e6a23c; }
.rs-ba-err { color: #f56c6c; }
.rs-ba-edit { display: flex; gap: 6px; }
.bae-model { flex: 1; min-width: 120px; }
.bae-small { width: 100px; }
.bae-cost { width: 84px; }

.rs-exy { display: flex; flex-direction: column; gap: 10px; }
.rs-exy-bar { display: flex; align-items: center; gap: 10px; }
.rs-exy-input { width: 300px; }
.rs-exy-msg { font-size: 12px; padding: 5px 10px; border-radius: 4px; }
.rs-exy-ok { background: #f0f9eb; color: #67c23a; }
.rs-exy-warn { background: #fdf6ec; color: #e6a23c; }
.rs-exy-error { background: #fef0f0; color: #f56c6c; }
.rs-exy-count { font-size: 12px; color: #909399; margin-right: 10px; }

.rs-ret { display: flex; flex-direction: column; gap: 12px; }
.rs-ret-dev { display: flex; flex-direction: column; gap: 2px; font-size: 14px; }
.rs-ret-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    label { font-size: 12px; font-weight: 600; color: #606266; }
}
.rs-ret-hint { font-size: 12px; color: #909399; line-height: 1.5; }
.rs-dim { color: #C0C4CC; }
.rs-del { color: #F56C6C; }
.rs-form ::v-deep .el-form-item__label { white-space: nowrap; }
/* Add / Edit dialog */
.rs-step-label { font-size: 12px; font-weight: 600; color: #909399; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 6px; }
.rs-imei-row { display: flex; gap: 8px; margin-bottom: 12px; }
.rs-imei-row .el-input { flex: 1; }
.rs-ident {
    border: 1px solid #ebeef5; border-radius: 8px; background: #fafbfc;
    padding: 10px 12px; margin-bottom: 16px;
}
.rs-ident-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
.rs-ident-cell { display: flex; flex-direction: column; line-height: 1.4; min-width: 0; }
.rs-ident-cell span { font-size: 11px; color: #909399; }
.rs-ident-cell b { font-size: 13px; color: #303133; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rs-ident-warn { font-size: 12px; color: #E6A23C; margin-bottom: 8px; line-height: 1.5; }
.rs-ident-ok { font-size: 12px; color: #67C23A; margin-bottom: 8px; line-height: 1.5; }
.rs-cycles { font-weight: normal; color: #909399; font-size: 11px; }
/* IMEI over serial number in one column */
.rs-imei { line-height: 1.35; }
.rs-serial { font-size: 11px; color: #909399; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; }
.rs-grades ::v-deep .el-radio-button__inner { padding: 7px 14px; }
/* Cost price: currency picker sits in the input's prepend slot. Element
   already positions a select there, via negative margins that offset the
   prepend's own padding — overriding that padding breaks the layout, so
   only the widths belong here. */
.rs-cost { width: 240px; }
.rs-cur { width: 92px; }
.rs-bb-yes { color: #67C23A; font-size: 17px; }
.rs-bb-no { color: #F56C6C; font-size: 17px; }
.rs-batt-good { color: #67C23A; font-weight: 600; }
.rs-batt-ok { color: #E6A23C; font-weight: 600; }
.rs-batt-low { color: #F56C6C; font-weight: 600; }
.rs-ident-alert { margin-bottom: 16px; }
/* Existing-device header: IMEI is the key, shown, never edited */
.rs-view-head { margin-bottom: 12px; }
.rs-view-imei { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rs-view-imei b { font-size: 17px; letter-spacing: .02em; color: #303133; }
.rs-view-sub { font-size: 13px; color: #606266; margin-top: 3px; }
.rs-bb-line { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 12px; }
.rs-bb-line i { font-size: 15px; }
.rs-bb-line .el-button { margin-left: 6px; }
.rs-bb-ok-text { color: #67C23A; font-weight: 600; }
.rs-bb-check-btn { padding: 3px 8px; font-size: 11px; }
/* Blackbelt report tab — laid out like the Analyst Report PDF */
.rs-report { min-height: 160px; max-height: 66vh; overflow-y: auto; padding-right: 6px; }
.rs-report-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.rs-report-title { font-size: 16px; font-weight: 700; color: #303133; }
.rs-report-id { font-size: 12px; color: #909399; margin-top: 2px; }
.rs-rep-sec {
    font-size: 13px; font-weight: 700; color: #303133;
    border-bottom: 2px solid #303133; padding-bottom: 4px; margin: 18px 0 10px;
}
.rs-rep-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 28px; }
.rs-rep-tests { grid-template-columns: 1fr 1fr 1fr; }
.rs-rep-cell { display: flex; gap: 6px; font-size: 12px; line-height: 1.8; min-width: 0; }
.rs-rep-wide { grid-column: 1 / -1; }
.rs-rep-label { color: #909399; white-space: nowrap; }
.rs-rep-value {
    color: #303133; font-weight: 600;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rs-rep-verdict { font-weight: 700; font-size: 11px; align-self: center; white-space: nowrap; }
.rs-verdict-pass { color: #67C23A; }
.rs-verdict-fail { color: #F56C6C; }
.rs-verdict-warn { color: #E6A23C; }
.rs-verdict-na { color: #909399; }
.rs-rep-vicon { font-size: 14px; align-self: center; cursor: default; }
.rs-legend { display: flex; gap: 18px; margin-top: 10px; font-size: 11px; color: #606266; }
.rs-legend span { display: inline-flex; align-items: center; gap: 5px; }
.rs-legend i { font-size: 13px; }
/* Dialog tabs (Detail / History) */
.rs-tabs { margin-top: -8px; }
.rs-tabs ::v-deep .el-tabs__header { margin-bottom: 14px; }
.rs-tab-count { color: #909399; font-weight: normal; }
/* History — audit-trail timeline, same look as SQT case Status History */
.rs-history { max-height: 380px; min-height: 120px; overflow-y: auto; padding: 4px 4px 0 4px; }
.rs-hist-by { margin-left: 10px; color: #909399; font-size: 12px; }
.rs-hist-note { margin-top: 4px; color: #606266; font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.rs-hist-empty { padding: 20px; text-align: center; color: #909399; font-size: 12px; }
.rs-ident-idle {
    font-size: 12px; color: #909399; line-height: 1.6;
    border: 1px dashed #dcdfe6; border-radius: 8px;
    padding: 12px; margin-bottom: 16px; text-align: center;
}
</style>
