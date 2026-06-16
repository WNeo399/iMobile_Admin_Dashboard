<template>
    <div :class="['app-container tree-sidebar-manage-wrap', { 'is-phone': isPhone, 'is-compact': isCompact }]">
        <!--
            Desktop / tablet: TreePanel sidebar is inline.
            Phone: the tree is moved into an off-canvas drawer (opened by the
            "Status" button in the toolbar) so the table gets the full width.
        -->
        <tree-panel
            v-if="!isPhone"
            title="Status"
            title-icon-class="el-icon-s-flag"
            :tree-data="treeData"
            :default-expand-all="true"
            :default-collapsed="isCompact"
            :show-search="false"
            storage-key="sqt-cases-sidebar-width"
            ref="statusTreeRef"
            @node-click="handleStatusClick"
        >
            <template #node="{ data }">
                <span class="status-node">
                    <i
                        :class="data.id === 'all' ? 'el-icon-files' : 'el-icon-collection-tag'"
                        class="status-node-icon"
                        :style="{ color: statusColor(data.id) }"
                    />
                    <span class="status-node-label" :title="data.label">{{ data.label }}</span>
                    <el-badge
                        v-if="data.count !== undefined"
                        :value="data.count"
                        :max="999"
                        :type="data.id === 'all' ? 'primary' : badgeType(data.id)"
                        class="status-node-badge"
                    />
                </span>
            </template>
        </tree-panel>

        <!-- Mobile-only off-canvas Status drawer (left side, narrow) -->
        <el-drawer
            v-if="isPhone"
            title="Status"
            :visible.sync="mobileFilterOpen"
            direction="ltr"
            size="80%"
            :wrapper-closable="true"
            custom-class="mobile-status-drawer"
        >
            <div class="drawer-status-list">
                <div
                    v-for="node in mobileStatusList"
                    :key="node.id"
                    :class="['drawer-status-item', { active: (node.id === 'all' && !activeStatus) || node.id === activeStatus }]"
                    @click="handleStatusClick(node)"
                >
                    <i
                        :class="node.id === 'all' ? 'el-icon-files' : 'el-icon-collection-tag'"
                        :style="{ color: statusColor(node.id) }"
                    />
                    <span class="drawer-status-label">{{ node.label }}</span>
                    <el-badge
                        v-if="node.count !== undefined"
                        :value="node.count"
                        :max="999"
                        :type="node.id === 'all' ? 'primary' : badgeType(node.id)"
                    />
                </div>
            </div>
        </el-drawer>

        <div class="tree-sidebar-content">
            <div class="content-inner">
                <!--
                    Filter toolbar. Inline on desktop, stacked full-width on
                    phones. The "Status" button only appears on phone (it opens
                    the drawer above); on desktop the tree is always visible.
                -->
                <div :class="['filter-bar', { stacked: isPhone }]">
                    <el-button
                        v-if="isPhone"
                        size="small"
                        icon="el-icon-s-flag"
                        @click="mobileFilterOpen = true"
                        class="filter-status-btn"
                    >
                        Status<span v-if="activeStatus">: {{ statusLabel(activeStatus) }}</span>
                    </el-button>

                    <el-input
                        v-model="queryParams.search"
                        placeholder="Case ID, name, IMEI, email…"
                        clearable
                        size="small"
                        prefix-icon="el-icon-search"
                        class="filter-search"
                        @keyup.enter.native="handleQuery"
                        @clear="handleQuery"
                    />

                    <el-select
                        v-model="queryParams.shopId"
                        placeholder="Any shop"
                        clearable
                        filterable
                        size="small"
                        class="filter-shop"
                        @change="handleShopChange"
                    >
                        <el-option
                            v-for="s in shops"
                            :key="s._id"
                            :label="s.storeName"
                            :value="s._id"
                        />
                    </el-select>

                    <div class="filter-actions">
                        <el-button type="primary" icon="el-icon-search" size="small" @click="handleQuery">
                            Search
                        </el-button>
                        <el-button icon="el-icon-refresh" size="small" @click="resetQuery">
                            Reset
                        </el-button>
                        <el-button plain icon="el-icon-refresh-right" size="small" @click="refreshAll">
                            Refresh
                        </el-button>
                        <!--
                            Export the full current-status list to Excel.
                            Fetches every page for the active filters (not
                            just the page on screen), so the download is the
                            complete set the user is looking at.
                        -->
                        <el-button
                            type="success"
                            plain
                            icon="el-icon-download"
                            size="small"
                            :loading="exporting"
                            @click="exportExcel"
                        >Export</el-button>

                        <!--
                            Table / card view toggle. Only shown on desktop
                            (≥992); below that, card view is forced and the
                            toggle would have no effect.
                        -->
                        <el-tooltip v-if="!isCompact" content="Toggle view" placement="top">
                            <el-radio-group
                                :value="viewMode"
                                size="small"
                                class="view-toggle"
                                @input="setViewMode"
                            >
                                <el-radio-button label="table">
                                    <i class="el-icon-tickets" />
                                </el-radio-button>
                                <el-radio-button label="card">
                                    <i class="el-icon-menu" />
                                </el-radio-button>
                            </el-radio-group>
                        </el-tooltip>
                    </div>
                </div>

                <div class="active-filter" v-if="activeStatus">
                    <el-tag closable size="small" @close="clearStatusFilter">
                        Status: {{ statusLabel(activeStatus) }}
                    </el-tag>
                </div>

                <!--
                    Desktop / tablet table view. Shop + Created columns hide
                    under 1100px to avoid a horizontal scrollbar; the same
                    data is still visible in the Case detail dialog.
                -->
                <el-table v-if="!useCardView" v-loading="loading" :data="list">
                    <el-table-column label="Case" min-width="190">
                        <template slot-scope="scope">
                            <div>
                                <a class="case-link" @click="openDetail(scope.row)">
                                    Case {{ scope.row.caseId || '—' }}
                                </a>
                                <div class="case-sub">
                                    SR {{ scope.row.serviceRequestId || '—' }}
                                </div>
                                <div class="case-sub case-shop" v-if="scope.row.shopName">
                                    <i class="el-icon-office-building" />
                                    {{ scope.row.shopName }}
                                </div>
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column label="Customer" min-width="180">
                        <template slot-scope="scope">
                            <div v-if="scope.row.customer">
                                <div>
                                    {{ scope.row.customer.firstName || '' }}
                                    {{ scope.row.customer.lastName || '' }}
                                </div>
                                <div class="case-sub">
                                    {{ scope.row.customer.phone || '—' }}
                                </div>
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column label="Device" min-width="220">
                        <template slot-scope="scope">
                            <div v-if="scope.row.device">
                                <div>
                                    {{ scope.row.device.description || '—' }}
                                </div>
                                <div class="case-sub">
                                    IMEI: {{ scope.row.device.imei || '—' }}
                                </div>
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column label="Status" width="180" align="center">
                        <template slot-scope="scope">
                            <el-tag
                                size="mini"
                                :type="badgeType(scope.row.status)"
                                effect="light"
                            >
                                {{ statusLabel(scope.row.status) }}
                            </el-tag>
                            <!--
                                For on-hold cases, show the reason captured in
                                the status-history entry. Truncated with CSS;
                                full text in the tooltip on hover.
                            -->
                            <div
                                v-if="onHoldNote(scope.row)"
                                class="on-hold-note"
                                :title="onHoldNote(scope.row)"
                            >
                                <i class="el-icon-warning-outline" />
                                {{ onHoldNote(scope.row) }}
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column v-if="showSecondaryColumns" label="Created" width="150" align="center">
                        <template slot-scope="scope">
                            {{ formatDate(scope.row.createdAt) }}
                        </template>
                    </el-table-column>
                    <el-table-column label="Action" align="center" width="220" class-name="small-padding fixed-width">
                        <template slot-scope="scope">
                            <!--
                                Primary action(s): only the buttons relevant to
                                this row's current status. Change Status + Notes
                                moved into the ⋯ dropdown so each row stays one
                                line tall.
                            -->
                            <el-button
                                v-for="(a, i) in primaryActions(scope.row)"
                                v-if="canDo(a)"
                                :key="i"
                                size="mini"
                                type="text"
                                :icon="a.icon"
                                @click="a.click()"
                            >{{ a.label }}</el-button>

                            <el-dropdown trigger="click" @command="(cmd) => cmd()">
                                <el-button size="mini" type="text" icon="el-icon-more" class="more-btn" />
                                <el-dropdown-menu slot="dropdown">
                                    <el-dropdown-item
                                        v-hasPermi="['sqt:case:changeStatus']"
                                        :command="() => handleChangeStatus(scope.row)"
                                        icon="el-icon-sort"
                                    >Change Status</el-dropdown-item>
                                    <el-dropdown-item
                                        :command="() => handleNotes(scope.row)"
                                        icon="el-icon-chat-line-square"
                                    >
                                        Notes<span v-if="scope.row.notes && scope.row.notes.length"
                                            style="color: #909399"> ({{ scope.row.notes.length }})</span>
                                    </el-dropdown-item>
                                </el-dropdown-menu>
                            </el-dropdown>
                        </template>
                    </el-table-column>
                </el-table>

                <!--
                    Phone card list. Each card shows the same info as the table
                    row, vertically stacked, with one tap target per card to
                    open the detail dialog and the same action set as the table.
                -->
                <div v-if="useCardView" v-loading="loading" class="case-card-list">
                    <div v-if="!loading && list.length === 0" class="card-empty">
                        No cases found.
                    </div>
                    <div v-for="row in list" :key="row._id" class="case-card">
                        <div class="card-head" @click="openDetail(row)">
                            <div class="card-id">
                                <span class="card-id-main">Case {{ row.caseId || '—' }}</span>
                                <span class="card-id-sub">SR {{ row.serviceRequestId || '—' }}</span>
                            </div>
                            <el-tag size="mini" :type="badgeType(row.status)" effect="light">
                                {{ statusLabel(row.status) }}
                            </el-tag>
                        </div>
                        <div class="card-body" @click="openDetail(row)">
                            <div class="card-line">
                                <i class="el-icon-user" />
                                <span>
                                    {{ (row.customer && (row.customer.firstName || '') + ' ' + (row.customer.lastName || '')).trim() || '—' }}
                                    <span class="card-line-sub" v-if="row.customer && row.customer.phone">
                                        · {{ row.customer.phone }}
                                    </span>
                                </span>
                            </div>
                            <div class="card-line">
                                <i class="el-icon-mobile-phone" />
                                <span>{{ (row.device && row.device.description) || '—' }}</span>
                            </div>
                            <div class="card-line muted">
                                <i class="el-icon-office-building" />
                                <span>{{ row.shopName || '—' }}</span>
                                <span class="card-line-sub">· {{ formatDate(row.createdAt) }}</span>
                            </div>
                            <!-- On-hold reason, wrapped so the full note is visible on cards -->
                            <div v-if="onHoldNote(row)" class="card-line on-hold-note-card">
                                <i class="el-icon-warning-outline" />
                                <span>{{ onHoldNote(row) }}</span>
                            </div>
                        </div>
                        <div class="card-actions">
                            <el-button
                                v-for="(a, i) in primaryActions(row)"
                                v-if="canDo(a)"
                                :key="i"
                                size="mini"
                                type="primary"
                                plain
                                :icon="a.icon"
                                @click="a.click()"
                            >{{ a.label }}</el-button>
                            <el-dropdown trigger="click" @command="(cmd) => cmd()">
                                <el-button size="mini" icon="el-icon-more" />
                                <el-dropdown-menu slot="dropdown">
                                    <el-dropdown-item
                                        v-hasPermi="['sqt:case:changeStatus']"
                                        :command="() => handleChangeStatus(row)"
                                        icon="el-icon-sort"
                                    >Change Status</el-dropdown-item>
                                    <el-dropdown-item
                                        :command="() => handleNotes(row)"
                                        icon="el-icon-chat-line-square"
                                    >
                                        Notes<span v-if="row.notes && row.notes.length"
                                            style="color: #909399"> ({{ row.notes.length }})</span>
                                    </el-dropdown-item>
                                </el-dropdown-menu>
                            </el-dropdown>
                        </div>
                    </div>
                </div>

                <pagination
                    v-show="total > 0"
                    :total="total"
                    :page.sync="queryParams.page"
                    :limit.sync="queryParams.pageSize"
                    @pagination="getList"
                />
            </div>
        </div>

        <!-- Notes dialog -->
        <el-dialog
            :title="notesDialogTitle"
            :visible.sync="notesDialogOpen"
            width="620px"
            append-to-body
            :close-on-click-modal="false"
        >
            <div class="notes-list" v-if="notesList.length">
                <div v-for="(n, idx) in notesList" :key="idx" class="note-item">
                    <div class="note-text">{{ n.text }}</div>
                    <div class="note-meta">
                        <i class="el-icon-user" />
                        {{ n.addedBy || 'Admin' }}
                        <span class="note-meta-sep">·</span>
                        <i class="el-icon-time" />
                        {{ formatDateTime(n.at) }}
                    </div>
                </div>
            </div>
            <div v-else class="notes-empty">
                <i class="el-icon-document" /> No notes yet.
            </div>

            <el-divider content-position="left">Add a note</el-divider>
            <el-form :model="noteForm" size="small">
                <el-form-item required style="margin-bottom: 0">
                    <el-input
                        v-model="noteForm.text"
                        type="textarea"
                        :rows="3"
                        placeholder="Leave a note for this case"
                    />
                </el-form-item>
            </el-form>
            <div slot="footer">
                <el-button type="primary" :loading="noteSubmitting" @click="submitNote">
                    Add Note
                </el-button>
                <el-button @click="notesDialogOpen = false">Close</el-button>
            </div>
        </el-dialog>

        <!-- Change Status dialog (Admin / TechElite — set any status) -->
        <el-dialog
            :title="changeStatusDialogTitle"
            :visible.sync="changeStatusDialogOpen"
            width="480px"
            append-to-body
            :close-on-click-modal="false"
        >
            <el-form :model="changeStatusForm" label-width="90px" size="small">
                <el-form-item label="Status" required>
                    <el-select v-model="changeStatusForm.status" placeholder="Select a status"
                        style="width: 100%">
                        <el-option v-for="s in statusOptions" :key="s.value" :label="s.label"
                            :value="s.value" />
                    </el-select>
                </el-form-item>
                <el-form-item label="Note" required>
                    <el-input v-model="changeStatusForm.note" type="textarea" :rows="3"
                        placeholder="Reason for this status change (required)" />
                </el-form-item>
            </el-form>
            <div slot="footer">
                <el-button type="primary" :loading="changeStatusSubmitting" @click="submitChangeStatus">
                    Save
                </el-button>
                <el-button @click="changeStatusDialogOpen = false">Cancel</el-button>
            </div>
        </el-dialog>

        <!-- Select Parts dialog (Repaired & Collected — Admin / TechElite) -->
        <el-dialog
            :title="selectPartsDialogTitle"
            :visible.sync="selectPartsDialogOpen"
            width="780px"
            append-to-body
            top="calc(15vh - 50px)"
            :close-on-click-modal="false"
            @close="resetSelectParts"
        >
            <div v-if="selectPartsCase" class="select-parts-scroll">
                <el-card shadow="never" class="send-parts-device">
                    <div slot="header" class="send-parts-card-header">
                        <i class="el-icon-mobile-phone" /> Device Info
                    </div>
                    <el-descriptions
                        v-if="selectPartsCase.device"
                        :column="2"
                        size="small"
                        border
                        :label-style="{ width: '130px', whiteSpace: 'nowrap' }"
                    >
                        <el-descriptions-item label="Brand">
                            {{ selectPartsCase.device.brand || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="Category">
                            {{ selectPartsCase.device.category || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="IMEI">
                            {{ selectPartsCase.device.imei || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="Model" :span="2">
                            <el-select
                                v-model="modelSelectValue"
                                placeholder="Select a model"
                                filterable
                                clearable
                                :loading="modelsLoading"
                                style="width: 100%"
                                @change="onSelectPartsModelChange"
                            >
                                <el-option
                                    v-for="m in modelOptions"
                                    :key="m._id"
                                    :label="m.brandName ? (m.brandName + ' — ' + m.name) : m.name"
                                    :value="m._id"
                                />
                            </el-select>
                        </el-descriptions-item>
                        <el-descriptions-item label="Description" :span="2">
                            <div class="multiline">{{ selectPartsCase.device.description || '—' }}</div>
                        </el-descriptions-item>
                        <el-descriptions-item label="Described Fault" :span="2">
                            <div class="multiline">{{ selectPartsCase.describedFault || '—' }}</div>
                        </el-descriptions-item>
                        <el-descriptions-item label="Repair Budget">
                            <span v-if="repairBudget > 0">AUD {{ repairBudget.toFixed(2) }}</span>
                            <span v-else>—</span>
                            <span class="repair-budget-hint">(60% of purchase price)</span>
                        </el-descriptions-item>
                        <el-descriptions-item label="Purchase Price">
                            <span v-if="selectPurchasePrice > 0">
                                AUD {{ selectPurchasePrice.toFixed(2) }}
                            </span>
                            <span v-else>—</span>
                        </el-descriptions-item>
                    </el-descriptions>
                    <div v-else class="empty-block">No device info recorded.</div>
                </el-card>

                <div class="select-parts-header">
                    <span style="font-weight: 500">Available Parts</span>
                    <el-button
                        v-if="selectPartsModelId"
                        size="mini"
                        type="primary"
                        plain
                        icon="el-icon-plus"
                        @click="openAddPart"
                    >Add New Part</el-button>
                </div>

                <div v-if="!selectPartsModelId" class="empty-block">
                    Select a model above to choose its parts.
                </div>
                <div v-else v-loading="selectPartsLoading" class="select-parts-body">
                    <el-alert
                        v-if="budgetWarning && chosenParts.length"
                        type="warning"
                        show-icon
                        :closable="false"
                        class="select-parts-warning"
                        :title="`Estimated charge (parts + 70) × 1.1 = AUD ${estimatedCharge.toFixed(2)} exceeds the repair budget of AUD ${repairBudget.toFixed(2)}.`"
                    />
                    <div v-if="!nonGenuineParts.length && !selectPartsLoading" class="empty-block">
                        No non-genuine parts available for this model yet. Use 'Add New Part'.
                    </div>
                    <el-table v-else :data="nonGenuineParts" size="small" border>
                        <el-table-column width="46" align="center">
                            <template slot-scope="scope">
                                <el-checkbox v-model="scope.row._selected" />
                            </template>
                        </el-table-column>
                        <el-table-column label="Item" min-width="220">
                            <template slot-scope="scope">
                                <div class="part-item-row">
                                    <span class="part-item-name">{{ scope.row.partName }}</span>
                                    <span class="part-item-code">
                                        {{ (scope.row.identifiers && (scope.row.identifiers.partNumber || scope.row.identifiers.sku)) || '—' }}
                                    </span>
                                </div>
                            </template>
                        </el-table-column>
                        <el-table-column v-if="canViewPrice" label="Price" width="120" align="right">
                            <template slot-scope="scope">
                                <span v-if="scope.row.price">AUD {{ Number(scope.row.price).toFixed(2) }}</span>
                                <span v-else style="color: #c0c4cc">—</span>
                            </template>
                        </el-table-column>
                    </el-table>

                    <div v-if="chosenParts.length" class="select-parts-summary">
                        <div class="summary-line">
                            <span>Selected parts total:</span>
                            <strong>AUD {{ chosenPartsTotal.toFixed(2) }}</strong>
                        </div>
                        <div class="summary-line">
                            <span>Labor:</span>
                            <strong>AUD {{ laborCost.toFixed(2) }}</strong>
                        </div>
                        <div class="summary-line">
                            <span>GST (10%):</span>
                            <strong>AUD {{ chosenGst.toFixed(2) }}</strong>
                        </div>
                        <div class="summary-line summary-total">
                            <span>Total:</span>
                            <strong>AUD {{ chosenGrandTotal.toFixed(2) }}</strong>
                        </div>
                    </div>
                </div>
            </div>

            <div slot="footer">
                <el-button
                    type="primary"
                    :loading="selectPartsSubmitting"
                    :disabled="!selectPartsModelId"
                    @click="submitSelectParts"
                >Save</el-button>
                <el-button @click="selectPartsDialogOpen = false">Cancel</el-button>
            </div>
        </el-dialog>

        <!-- Add New Part dialog (nested in Select Parts) -->
        <el-dialog
            title="Add Part"
            :visible.sync="addPartDialogOpen"
            width="560px"
            append-to-body
            :close-on-click-modal="false"
            @close="resetAddPartForm"
        >
            <el-form ref="addPartForm" :model="addPartForm" :rules="addPartRules" label-width="120px" size="small">
                <el-row :gutter="16">
                    <el-col :span="12">
                        <el-form-item label="Part Name" prop="partName">
                            <el-input v-model="addPartForm.partName" placeholder="OCTA, Screen, Battery..." />
                        </el-form-item>
                    </el-col>
                    <el-col :span="12">
                        <el-form-item label="Price (AUD)" prop="price">
                            <el-input-number v-model="addPartForm.price" :min="0" :precision="2" :step="1"
                                style="width: 100%" />
                        </el-form-item>
                    </el-col>
                </el-row>
                <el-divider content-position="left">Identifiers (optional)</el-divider>
                <el-form-item label="SKU">
                    <el-input v-model="addPartForm.identifiers.sku" placeholder="21077" />
                </el-form-item>
                <el-form-item label="Part Number">
                    <el-input v-model="addPartForm.identifiers.partNumber" placeholder="GH82-24544A" />
                </el-form-item>
                <el-form-item label="Zoho Name">
                    <el-input v-model="addPartForm.identifiers.zohoName" />
                </el-form-item>
            </el-form>
            <div slot="footer">
                <el-button type="primary" :loading="addPartSubmitting" @click="submitAddPart">Add</el-button>
                <el-button @click="addPartDialogOpen = false">Cancel</el-button>
            </div>
        </el-dialog>

        <!-- Send Parts dialog (Pending action) -->
        <el-dialog
            :title="sendPartsDialogTitle"
            :visible.sync="sendPartsDialogOpen"
            width="880px"
            append-to-body
            top="calc(12.5vh - 50px)"
            :close-on-click-modal="false"
            @close="resetSendParts"
        >
            <div v-if="sendPartsCase" class="send-parts-scroll">
                <el-card shadow="never" class="send-parts-device">
                    <div slot="header" class="send-parts-card-header">
                        <i class="el-icon-mobile-phone" /> Device Info
                    </div>
                    <el-descriptions
                        v-if="sendPartsCase.device"
                        :column="2"
                        size="small"
                        border
                        :label-style="{ width: '130px', whiteSpace: 'nowrap' }"
                    >
                        <el-descriptions-item label="Brand">
                            {{ sendPartsCase.device.brand || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="Category">
                            {{ sendPartsCase.device.category || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="Model">
                            {{ sendPartsCase.device.modelName || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="IMEI">
                            {{ sendPartsCase.device.imei || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="Purchase Price">
                            <span v-if="devicePurchasePrice > 0">AUD {{ devicePurchasePrice.toFixed(2) }}</span>
                            <span v-else>—</span>
                        </el-descriptions-item>
                        <el-descriptions-item label="Repair Budget">
                            <span v-if="sendPartsBudget > 0">AUD {{ sendPartsBudget.toFixed(2) }}</span>
                            <span v-else>—</span>
                            <span class="repair-budget-hint">(60% of purchase price)</span>
                        </el-descriptions-item>
                        <el-descriptions-item label="Description" :span="2">
                            <div class="multiline">{{ sendPartsCase.device.description || '—' }}</div>
                        </el-descriptions-item>
                        <el-descriptions-item label="Described Fault" :span="2">
                            <div class="multiline">{{ sendPartsCase.describedFault || '—' }}</div>
                        </el-descriptions-item>
                    </el-descriptions>
                    <div v-else class="empty-block">No device info recorded.</div>
                </el-card>

                <div class="send-parts-search">
                    <label class="send-parts-label">Search Zoho products</label>
                    <el-autocomplete
                        v-model="partsSearchKeyword"
                        :fetch-suggestions="fetchProductSuggestions"
                        :debounce="400"
                        :disabled="partsLookupLoading"
                        placeholder="Type product name, SKU, or part to search..."
                        style="width: 100%"
                        value-key="name"
                        :trigger-on-focus="false"
                        clearable
                        prefix-icon="el-icon-search"
                        popper-class="send-parts-suggestions"
                        @select="onProductSelected"
                    >
                        <template slot-scope="{ item }">
                            <div class="product-suggestion">
                                <img
                                    v-if="item.imgUrl"
                                    :src="item.imgUrl"
                                    class="product-suggestion-img"
                                    @error="onSuggestionImgError($event)"
                                />
                                <div v-else class="product-suggestion-img product-suggestion-img-placeholder">
                                    <i class="el-icon-picture-outline" />
                                </div>
                                <div class="product-suggestion-info">
                                    <div class="product-suggestion-name">{{ item.name }}</div>
                                    <div class="product-suggestion-meta">
                                        <span v-if="item.sku">SKU: {{ item.sku }}</span>
                                    </div>
                                </div>
                            </div>
                        </template>
                    </el-autocomplete>
                </div>

                <el-alert
                    v-if="sendPartsWarning && selectedParts.length"
                    type="warning"
                    show-icon
                    :closable="false"
                    class="send-parts-warning"
                    :title="`Estimated charge with GST (AUD ${sendPartsEstimated.toFixed(2)}) exceeds the repair budget of AUD ${sendPartsBudget.toFixed(2)}.`"
                />

                <el-table
                    :data="selectedParts"
                    empty-text="No parts added yet. Use the search above to add parts."
                    size="small"
                    border
                    class="send-parts-table"
                >
                    <el-table-column label="Product" min-width="320">
                        <template slot-scope="scope">
                            <a
                                v-if="scope.row.product_id"
                                :href="`https://inventory.zoho.com/app/746138234#/inventory/items/${scope.row.product_id}`"
                                target="_blank"
                                rel="noopener"
                                class="product-link"
                            >{{ scope.row.name }}</a>
                            <span v-else style="font-weight: 500">{{ scope.row.name }}</span>
                            <div v-if="scope.row.sku" class="product-sub-sku">
                                SKU: {{ scope.row.sku }}
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column v-if="canViewPrice" label="Wholesale Price" width="140" align="right">
                        <template slot-scope="scope">
                            <span v-if="scope.row.price !== null && scope.row.price !== undefined">
                                AUD {{ Number(scope.row.price).toFixed(2) }}
                            </span>
                            <span v-else style="color: #c0c4cc">—</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="Action" width="100" align="center">
                        <template slot-scope="scope">
                            <el-button
                                size="mini"
                                type="text"
                                icon="el-icon-delete"
                                @click="removeSelectedPart(scope.$index)"
                            >Remove</el-button>
                        </template>
                    </el-table-column>
                </el-table>

                <div v-if="canViewPrice && selectedParts.length" class="send-parts-summary">
                    <div class="summary-line">
                        <span>Wholesale total:</span>
                        <strong>AUD {{ sendPartsTotal.toFixed(2) }}</strong>
                    </div>
                    <div class="summary-line summary-line-muted">
                        <span>With GST (×1.1):</span>
                        <strong :class="{ 'over-threshold': sendPartsWarning }">
                            AUD {{ sendPartsEstimated.toFixed(2) }}
                        </strong>
                    </div>
                </div>

                <div v-if="sendPartsExistingOrders.length" class="sent-orders-section">
                    <div class="sent-orders-title">
                        <i class="el-icon-document-checked" />
                        Previously Sent Parts
                        <span class="sent-orders-count">({{ sendPartsExistingOrders.length }} order{{ sendPartsExistingOrders.length === 1 ? '' : 's' }})</span>
                    </div>
                    <div
                        v-for="(order, idx) in sendPartsExistingOrders"
                        :key="order.zohoSalesOrderId || idx"
                        class="sent-order-card"
                    >
                        <div class="sent-order-header">
                            <i class="el-icon-truck" />
                            <a
                                v-if="order.zohoSalesOrderId"
                                :href="`https://inventory.zoho.com/app/746138234#/salesorders/${order.zohoSalesOrderId}`"
                                target="_blank"
                                rel="noopener"
                                class="product-link"
                            >{{ order.zohoSalesOrderNumber || order.zohoSalesOrderId }}</a>
                            <span v-else>{{ order.zohoSalesOrderNumber || '—' }}</span>
                            <span class="sent-order-date">{{ formatDate(order.orderedAt) }}</span>
                            <el-tag
                                size="mini"
                                :type="order.receivedAt ? 'success' : 'info'"
                                effect="light"
                                class="sent-order-status"
                            >
                                <i :class="order.receivedAt ? 'el-icon-check' : 'el-icon-time'" />
                                {{ order.receivedAt ? `Received ${formatDate(order.receivedAt)}` : 'Awaiting receipt' }}
                            </el-tag>
                            <span class="sent-order-parts-count">
                                {{ (order.lineItems || []).length }} part{{ (order.lineItems || []).length === 1 ? '' : 's' }}
                            </span>
                        </div>
                        <el-table :data="order.lineItems || []" size="mini" border class="sent-order-table">
                            <el-table-column label="Part" prop="partName" min-width="180" />
                            <el-table-column label="SKU" prop="sku" width="130">
                                <template slot-scope="scope">
                                    {{ scope.row.sku || '—' }}
                                </template>
                            </el-table-column>
                            <el-table-column v-if="canViewPrice" label="Unit Price" width="120" align="right">
                                <template slot-scope="scope">
                                    <span v-if="scope.row.unitPrice">AUD {{ Number(scope.row.unitPrice).toFixed(2) }}</span>
                                    <span v-else>—</span>
                                </template>
                            </el-table-column>
                            <el-table-column label="Sent" prop="quantitySent" width="70" align="center" />
                        </el-table>
                    </div>
                </div>
            </div>

            <div slot="footer">
                <el-button
                    type="primary"
                    :loading="sendPartsSubmitting"
                    :disabled="!selectedParts.length"
                    @click="submitSendParts"
                >Submit</el-button>
                <el-button @click="sendPartsDialogOpen = false">Cancel</el-button>
            </div>
        </el-dialog>

        <!--
            Send Parts success popup — confirms the order, shows whether
            the URGENT label PDF was attached, and offers a Preview.
        -->
        <el-dialog
            title="Parts Sent"
            :visible.sync="sendPartsSuccessOpen"
            width="420px"
            append-to-body
        >
            <div class="send-success">
                <i class="el-icon-circle-check send-success-icon" />
                <div class="send-success-title">
                    <span v-if="sendPartsSuccessInfo.soNumber">
                        Sales order {{ sendPartsSuccessInfo.soNumber }} created
                    </span>
                    <span v-else>Order created</span>
                </div>
                <div class="send-success-sub">Case moved to Waiting for Parts.</div>

                <div
                    v-if="labelAttachResult"
                    :class="['send-success-attach', labelAttachResult.ok ? 'ok' : 'fail']"
                >
                    <i :class="labelAttachResult.ok ? 'el-icon-document-checked' : 'el-icon-warning-outline'" />
                    <span v-if="labelAttachResult.ok">URGENT label attached to the order.</span>
                    <span v-else>Couldn't attach the label: {{ labelAttachResult.message }}. You can still preview + print it.</span>
                </div>
            </div>
            <div slot="footer">
                <el-button icon="el-icon-view" @click="previewCaseLabel">Preview Label</el-button>
                <el-button type="primary" @click="sendPartsSuccessOpen = false">Done</el-button>
            </div>
        </el-dialog>

        <!-- Parts Received dialog (Waiting-for-parts action) -->
        <el-dialog
            :title="partsReceivedDialogTitle"
            :visible.sync="partsReceivedDialogOpen"
            width="460px"
            append-to-body
        >
            <div class="parts-received-question">
                Has the customer been informed to drop off the device?
            </div>
            <el-radio-group v-model="partsReceivedForm.customerNotified">
                <el-radio :label="true">Yes</el-radio>
                <el-radio :label="false">No</el-radio>
            </el-radio-group>

            <div slot="footer">
                <el-button
                    type="primary"
                    :loading="partsReceivedSubmitting"
                    :disabled="partsReceivedForm.customerNotified === null"
                    @click="submitPartsReceived"
                >Confirm</el-button>
                <el-button @click="partsReceivedDialogOpen = false">Cancel</el-button>
            </div>
        </el-dialog>

        <!-- Customer Notified dialog (Parts-arrived action) -->
        <el-dialog
            :title="customerNotifiedDialogTitle"
            :visible.sync="customerNotifiedDialogOpen"
            width="460px"
            append-to-body
        >
            <div class="parts-received-question">
                Move this case to <b>Waiting for Drop-off</b>?
            </div>

            <div slot="footer">
                <el-button
                    type="primary"
                    :loading="customerNotifiedSubmitting"
                    @click="submitCustomerNotified"
                >Confirm</el-button>
                <el-button @click="customerNotifiedDialogOpen = false">Cancel</el-button>
            </div>
        </el-dialog>

        <!-- Start Repair dialog (Waiting-for-drop-off action) -->
        <el-dialog
            :title="startRepairDialogTitle"
            :visible.sync="startRepairDialogOpen"
            width="460px"
            append-to-body
        >
            <div class="parts-received-question">
                Move this case to <b>Repairing</b>?
            </div>

            <div slot="footer">
                <el-button
                    type="primary"
                    :loading="startRepairSubmitting"
                    @click="submitStartRepair"
                >Confirm</el-button>
                <el-button @click="startRepairDialogOpen = false">Cancel</el-button>
            </div>
        </el-dialog>

        <!-- Mark Repaired dialog (Repairing action) -->
        <el-dialog
            :title="markRepairedDialogTitle"
            :visible.sync="markRepairedDialogOpen"
            width="680px"
            append-to-body
        >
            <div class="parts-received-question">Select items used for this repair:</div>
            <el-table
                :data="markRepairedForm.items"
                size="small"
                border
                empty-text="No items linked to this case."
                class="repaired-items-table"
            >
                <el-table-column width="50" align="center">
                    <template slot-scope="scope">
                        <el-checkbox v-model="markRepairedForm.items[scope.$index].used" />
                    </template>
                </el-table-column>
                <el-table-column label="Part" prop="partName" min-width="180">
                    <template slot-scope="scope">
                        {{ scope.row.partName || '—' }}
                    </template>
                </el-table-column>
                <el-table-column label="SKU" prop="sku" width="120">
                    <template slot-scope="scope">
                        {{ scope.row.sku || '—' }}
                    </template>
                </el-table-column>
                <el-table-column label="Qty Sent" prop="quantitySent" width="80" align="center" />
                <el-table-column label="Order" width="140">
                    <template slot-scope="scope">
                        <span style="color: #909399; font-size: 12px">
                            {{ scope.row.zohoSalesOrderNumber || '—' }}
                        </span>
                    </template>
                </el-table-column>
            </el-table>

            <div class="parts-received-question" style="margin-top: 18px">
                Has the customer picked up the device?
            </div>
            <el-radio-group v-model="markRepairedForm.collected">
                <el-radio :label="true">Yes</el-radio>
                <el-radio :label="false">No</el-radio>
            </el-radio-group>

            <div slot="footer">
                <el-button
                    type="primary"
                    :loading="markRepairedSubmitting"
                    :disabled="markRepairedForm.collected === null"
                    @click="submitMarkRepaired"
                >Confirm</el-button>
                <el-button @click="markRepairedDialogOpen = false">Cancel</el-button>
            </div>
        </el-dialog>

        <!-- Mark Collected dialog (Repaired action) -->
        <el-dialog
            :title="markCollectedDialogTitle"
            :visible.sync="markCollectedDialogOpen"
            width="460px"
            append-to-body
        >
            <div class="parts-received-question">
                Move this case to <b>Repaired &amp; Collected</b>?
            </div>

            <div slot="footer">
                <el-button
                    type="primary"
                    :loading="markCollectedSubmitting"
                    @click="submitMarkCollected"
                >Confirm</el-button>
                <el-button @click="markCollectedDialogOpen = false">Cancel</el-button>
            </div>
        </el-dialog>

        <!-- Mark Unrepairable dialog (Repairing action) -->
        <el-dialog
            :title="markUnrepairableDialogTitle"
            :visible.sync="markUnrepairableDialogOpen"
            width="460px"
            append-to-body
        >
            <div class="parts-received-question">
                Mark this case as <b>Unrepairable</b>?
            </div>

            <div slot="footer">
                <el-button
                    type="primary"
                    :loading="markUnrepairableSubmitting"
                    @click="submitMarkUnrepairable"
                >Confirm</el-button>
                <el-button @click="markUnrepairableDialogOpen = false">Cancel</el-button>
            </div>
        </el-dialog>

        <!-- Mark BER dialog (Unrepairable action) -->
        <el-dialog
            :title="markBerDialogTitle"
            :visible.sync="markBerDialogOpen"
            width="460px"
            append-to-body
        >
            <div class="parts-received-question">
                Mark this unrepairable case as <b>BER</b> (handled)?
            </div>

            <div slot="footer">
                <el-button
                    type="primary"
                    :loading="markBerSubmitting"
                    @click="submitMarkBer"
                >Confirm</el-button>
                <el-button @click="markBerDialogOpen = false">Cancel</el-button>
            </div>
        </el-dialog>

        <!-- Case detail dialog -->
        <el-dialog
            :title="detailDialogTitle"
            :visible.sync="detailDialogOpen"
            width="820px"
            append-to-body
            top="6vh"
        >
            <el-tabs v-if="detailCase" v-model="detailActiveTab" class="detail-tabs">
                <el-tab-pane label="Basic Info" name="basic">
                    <el-descriptions :column="2" size="small" border>
                        <el-descriptions-item label="Service Request ID">
                            {{ detailCase.serviceRequestId || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="Case ID">
                            {{ detailCase.caseId || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="RepairDesk Ticket #">
                            {{ detailCase.repairDeskTicketNumber || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="RepairDesk ID">
                            {{ detailCase.repairDeskTicketId || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="Status">
                            <el-tag size="mini" :type="badgeType(detailCase.status)" effect="light">
                                {{ statusLabel(detailCase.status) }}
                            </el-tag>
                        </el-descriptions-item>
                        <el-descriptions-item label="Shop">
                            {{ detailCase.shopName || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="Retailer" :span="2">
                            {{ detailCase.retailer || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="Created">
                            {{ formatDateTime(detailCase.createdAt) }}
                        </el-descriptions-item>
                        <el-descriptions-item label="Updated">
                            {{ formatDateTime(detailCase.updatedAt) }}
                        </el-descriptions-item>
                    </el-descriptions>

                    <el-divider content-position="left">Source</el-divider>
                    <el-descriptions v-if="detailCase.source" :column="1" size="small" border>
                        <el-descriptions-item label="Email Subject">
                            {{ detailCase.source.emailSubject || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="From">
                            {{ detailCase.source.emailFrom || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="To">
                            {{ detailCase.source.emailTo || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="Received At">
                            {{ formatDateTime(detailCase.source.receivedAt) }}
                        </el-descriptions-item>
                    </el-descriptions>
                    <div v-else class="empty-block">No source info recorded.</div>
                </el-tab-pane>

                <el-tab-pane label="Customer" name="customer">
                    <el-descriptions v-if="detailCase.customer" :column="2" size="small" border>
                        <el-descriptions-item label="First Name">
                            {{ detailCase.customer.firstName || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="Last Name">
                            {{ detailCase.customer.lastName || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="Email">
                            {{ detailCase.customer.email || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="Phone">
                            {{ detailCase.customer.phone || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="Address" :span="2">
                            <div class="multiline">{{ detailCase.customer.address || '—' }}</div>
                        </el-descriptions-item>
                    </el-descriptions>
                    <div v-else class="empty-block">No customer info recorded.</div>
                </el-tab-pane>

                <el-tab-pane label="Device" name="device">
                    <el-descriptions
                        v-if="detailCase.device"
                        :column="2"
                        size="small"
                        border
                        :label-style="{ width: '140px', whiteSpace: 'nowrap' }"
                    >
                        <el-descriptions-item label="Description" :span="2">
                            <el-input
                                v-model="deviceEdit.description"
                                type="textarea"
                                :autosize="{ minRows: 1, maxRows: 4 }"
                                placeholder="Device description"
                                size="small"
                            />
                        </el-descriptions-item>
                        <el-descriptions-item label="Brand">
                            {{ detailCase.device.brand || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="Category">
                            {{ detailCase.device.category || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="IMEI">
                            <el-input
                                v-model="deviceEdit.imei"
                                placeholder="IMEI"
                                size="small"
                            />
                        </el-descriptions-item>
                        <el-descriptions-item label="Model">
                            {{ detailCase.device.modelName || '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="Purchase Price">
                            <span v-if="detailCase.device.purchasePrice !== null && detailCase.device.purchasePrice !== undefined">
                                AUD {{ Number(detailCase.device.purchasePrice).toFixed(2) }}
                            </span>
                            <span v-else>—</span>
                        </el-descriptions-item>
                        <el-descriptions-item label="Purchase Date">
                            {{ formatDate(detailCase.device.purchaseDate) }}
                        </el-descriptions-item>
                        <el-descriptions-item label="Described Fault" :span="2">
                            <div class="multiline">{{ detailCase.describedFault || '—' }}</div>
                        </el-descriptions-item>
                    </el-descriptions>
                    <div v-if="detailCase.device" class="device-edit-actions">
                        <el-button
                            type="primary"
                            size="mini"
                            :loading="deviceSubmitting"
                            :disabled="!deviceEditDirty"
                            @click="saveDeviceEdits"
                        >
                            Save
                        </el-button>
                        <el-button
                            size="mini"
                            :disabled="!deviceEditDirty || deviceSubmitting"
                            @click="resetDeviceEdits"
                        >
                            Reset
                        </el-button>
                        <span v-if="deviceEditDirty" class="device-edit-hint">Unsaved changes</span>
                    </div>
                    <div v-else class="empty-block">No device info recorded.</div>
                </el-tab-pane>

                <el-tab-pane name="sent-parts">
                    <span slot="label">
                        Sent Parts
                        <span v-if="detailSentOrders.length" class="tab-count">
                            ({{ detailSentOrders.length }})
                        </span>
                    </span>
                    <div v-if="detailSentOrders.length">
                        <div
                            v-for="(order, idx) in detailSentOrders"
                            :key="order.zohoSalesOrderId || idx"
                            class="sent-order-card"
                        >
                            <div class="sent-order-header">
                                <i class="el-icon-truck" />
                                <a
                                    v-if="order.zohoSalesOrderId"
                                    :href="`https://inventory.zoho.com/app/746138234#/salesorders/${order.zohoSalesOrderId}`"
                                    target="_blank"
                                    rel="noopener"
                                    class="product-link"
                                >{{ order.zohoSalesOrderNumber || order.zohoSalesOrderId }}</a>
                                <span v-else>{{ order.zohoSalesOrderNumber || '—' }}</span>
                                <span class="sent-order-date">{{ formatDateTime(order.orderedAt) }}</span>
                                <span class="sent-order-parts-count">
                                    {{ (order.lineItems || []).length }} part{{ (order.lineItems || []).length === 1 ? '' : 's' }}
                                </span>
                            </div>
                            <el-table :data="order.lineItems || []" size="mini" border class="sent-order-table">
                                <el-table-column label="Part" prop="partName" min-width="180" />
                                <el-table-column label="SKU" prop="sku" width="130">
                                    <template slot-scope="scope">
                                        {{ scope.row.sku || '—' }}
                                    </template>
                                </el-table-column>
                                <el-table-column v-if="canViewPrice" label="Unit Price" width="120" align="right">
                                    <template slot-scope="scope">
                                        <span v-if="scope.row.unitPrice">AUD {{ Number(scope.row.unitPrice).toFixed(2) }}</span>
                                        <span v-else>—</span>
                                    </template>
                                </el-table-column>
                                <el-table-column label="Sent" prop="quantitySent" width="70" align="center" />
                                <el-table-column label="Used" prop="quantityUsed" width="70" align="center" />
                                <el-table-column label="Returned" prop="quantityReturned" width="90" align="center" />
                            </el-table>
                            <div v-if="order.trackingNumber" class="sent-order-tracking">
                                Tracking: {{ order.trackingNumber }}
                            </div>
                        </div>
                    </div>
                    <div v-else class="empty-block">
                        <i class="el-icon-truck" /> No parts have been sent yet.
                    </div>
                </el-tab-pane>

                <el-tab-pane name="status">
                    <span slot="label">
                        Status History
                        <span v-if="detailStatusHistory.length" class="tab-count">
                            ({{ detailStatusHistory.length }})
                        </span>
                    </span>
                    <el-timeline v-if="detailStatusHistory.length">
                        <el-timeline-item
                            v-for="(h, idx) in detailStatusHistory"
                            :key="idx"
                            :timestamp="formatDateTime(h.at)"
                            placement="top"
                            :color="statusColor(h.status)"
                        >
                            <div class="history-card">
                                <div>
                                    <el-tag size="mini" :type="badgeType(h.status)" effect="light">
                                        {{ statusLabel(h.status) }}
                                    </el-tag>
                                    <span class="history-by">
                                        <i class="el-icon-user" /> {{ h.updatedBy || 'system' }}
                                    </span>
                                </div>
                                <div v-if="h.note" class="history-note">{{ h.note }}</div>
                            </div>
                        </el-timeline-item>
                    </el-timeline>
                    <div v-else class="empty-block">No status history.</div>
                </el-tab-pane>

                <el-tab-pane name="notes">
                    <span slot="label">
                        Note History
                        <span v-if="detailNotes.length" class="tab-count">
                            ({{ detailNotes.length }})
                        </span>
                    </span>
                    <div class="notes-list" v-if="detailNotes.length">
                        <div v-for="(n, idx) in detailNotes" :key="idx" class="note-item">
                            <div class="note-text">{{ n.text }}</div>
                            <div class="note-meta">
                                <i class="el-icon-user" />
                                {{ n.addedBy || 'Admin' }}
                                <span class="note-meta-sep">·</span>
                                <i class="el-icon-time" />
                                {{ formatDateTime(n.at) }}
                            </div>
                        </div>
                    </div>
                    <div v-else class="empty-block">
                        <i class="el-icon-document" /> No notes yet.
                    </div>
                </el-tab-pane>
            </el-tabs>

            <div slot="footer">
                <el-button @click="detailDialogOpen = false">Close</el-button>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import TreePanel from '@/components/TreePanel'
import { listCases, getCaseCounts, getCase, addCaseNote, updateCaseDevice, sendCaseParts, markPartsReceived, changeCaseStatus, markCaseRepaired, selectCaseParts, attachCaseOrderFile } from '@/api/sqt/cases'
import { buildCaseLabelDoc } from '@/utils/sqtCaseLabel'
import { listShops } from '@/api/sqt/shops'
import { listParts, createPart } from '@/api/sqt/parts'
import { listModels } from '@/api/sqt/models'
import { searchProducts, lookupProductBySku } from '@/api/zoho/products/product'
// xlsx-js-style — same styled SheetJS fork the Repair + Stock Monitoring
// exports use, so the downloads look consistent across the dashboard.
import * as XLSX from 'xlsx-js-style'

const STATUS_META = [
    // First entry → first child node in the Status tree (above Pending).
    // Sienna icon distinguishes it from the bright-orange "waiting" cluster.
    { value: 'on-hold', label: 'On Hold', tag: 'warning', color: '#a0522d' },
    { value: 'pending', label: 'Pending', tag: 'info', color: '#909399' },
    { value: 'waiting-for-parts', label: 'Waiting for Parts', tag: 'warning', color: '#E6A23C' },
    { value: 'parts-arrived', label: 'Parts Arrived', tag: 'warning', color: '#E6A23C' },
    { value: 'waiting-for-drop-off', label: 'Waiting for Drop-off', tag: 'warning', color: '#E6A23C' },
    { value: 'repairing', label: 'Repairing', tag: '', color: '#409EFF' },
    { value: 'repaired', label: 'Repaired', tag: 'success', color: '#67C23A' },
    { value: 'repaired-and-collected', label: 'Repaired & Collected', tag: 'success', color: '#67C23A' },
    { value: 'waiting-solvup', label: 'Waiting Solvup', tag: 'warning', color: '#E6A23C' },
    { value: 'unrepairable', label: 'Unrepairable', tag: 'danger', color: '#F56C6C' },
    { value: 'ber', label: 'BER', tag: 'danger', color: '#F56C6C' },
    { value: 'completed', label: 'Completed', tag: 'success', color: '#67C23A' },
    { value: 'cancelled', label: 'Cancelled', tag: 'info', color: '#C0C4CC' }
]

// Statuses that only Admin / TechElite Admin should see in the tree and the
// Change Status dropdown — they represent internal admin-side work (paused
// or sent to Solvup) and shouldn't be visible to shop roles. The backend
// also filters them out of /list and /counts for shop-scoped users, so
// counts here will always be 0 for non-admins anyway.
const ADMIN_ONLY_STATUSES = ['on-hold', 'waiting-solvup']

const LABOR_COST = 70
const GST_RATE = 0.1

export default {
    name: 'SqtCases',
    components: { TreePanel },
    data() {
        return {
            // Reactive viewport width — drives the responsive switches below.
            // Updated by a `resize` listener set up in mounted().
            viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1200,
            // Mobile-only off-canvas drawer for the Status filter tree.
            mobileFilterOpen: false,
            // User-chosen view mode (table | card). Persisted in localStorage
            // so the preference sticks across reloads. Ignored on phone — there
            // the card view is forced regardless.
            viewMode: (typeof localStorage !== 'undefined' && localStorage.getItem('sqt-cases-view-mode')) || 'table',
            loading: false,
            exporting: false,
            list: [],
            total: 0,
            counts: { total: 0, byStatus: {} },
            activeStatus: null,
            queryParams: { page: 1, pageSize: 20, search: '', shopId: '' },
            shops: [],

            sendPartsDialogOpen: false,
            sendPartsCase: null,
            // Send Parts success popup — shows the created SO number, the
            // label-attach outcome, and a Preview button for the URGENT
            // label PDF (kept on caseLabelDoc so Preview can open it).
            sendPartsSuccessOpen: false,
            sendPartsSuccessInfo: { soNumber: '' },
            caseLabelDoc: null,
            labelAttachResult: null,
            partsSearchKeyword: '',
            selectedParts: [],
            sendPartsSubmitting: false,
            partsLookupLoading: false,

            partsReceivedDialogOpen: false,
            partsReceivedCase: null,
            partsReceivedSubmitting: false,
            partsReceivedForm: { customerNotified: null },

            customerNotifiedDialogOpen: false,
            customerNotifiedCase: null,
            customerNotifiedSubmitting: false,

            startRepairDialogOpen: false,
            startRepairCase: null,
            startRepairSubmitting: false,

            markRepairedDialogOpen: false,
            markRepairedCase: null,
            markRepairedSubmitting: false,
            markRepairedForm: { collected: null, items: [] },

            markCollectedDialogOpen: false,
            markCollectedCase: null,
            markCollectedSubmitting: false,

            markUnrepairableDialogOpen: false,
            markUnrepairableCase: null,
            markUnrepairableSubmitting: false,

            markBerDialogOpen: false,
            markBerCase: null,
            markBerSubmitting: false,

            notesDialogOpen: false,
            notesCaseRef: null,
            notesList: [],
            noteForm: { text: '' },
            noteSubmitting: false,

            // Admin / TechElite: change a case to any status (requires a note)
            changeStatusDialogOpen: false,
            changeStatusCase: null,
            changeStatusSubmitting: false,
            changeStatusForm: { status: '', note: '' },

            // Select Parts (Repaired & Collected — Admin / TechElite)
            selectPartsDialogOpen: false,
            selectPartsCase: null,
            selectPartsLoading: false,
            selectPartsSubmitting: false,
            availableParts: [],
            modelSelectValue: '',
            modelOptions: [],
            modelsLoading: false,
            addPartDialogOpen: false,
            addPartSubmitting: false,
            addPartForm: { partName: '', price: 0, genuine: false, identifiers: { sku: '', partNumber: '', zohoName: '' } },
            addPartRules: {
                partName: [{ required: true, message: 'Part name is required', trigger: 'blur' }],
                price: [{ required: true, type: 'number', message: 'Price is required', trigger: 'blur' }]
            },

            detailDialogOpen: false,
            detailCase: null,
            detailActiveTab: 'basic',
            deviceEdit: { description: '', imei: '' },
            deviceSubmitting: false
        }
    },
    computed: {
        // Responsive breakpoints — mirrors Element UI's xs (<768) and md (<992).
        // `isPhone` switches the whole table to a card list; `isCompact` is the
        // wider "shrink everything sensibly" band (tablets / split-screen).
        isPhone() {
            return this.viewportWidth < 768
        },
        isCompact() {
            return this.viewportWidth < 992
        },
        // Hide the lower-priority columns (Shop, Created) below ~1100px so the
        // table no longer needs a horizontal scrollbar in normal use.
        showSecondaryColumns() {
            return this.viewportWidth >= 1100
        },
        // Single switch the template uses to decide between table and card
        // markup. Anything below the desktop breakpoint (<992) is locked to
        // cards because the 7-column table doesn't fit comfortably; ≥992
        // honours the user's `viewMode` preference.
        useCardView() {
            return this.isCompact || this.viewMode === 'card'
        },
        // Flat list rendered inside the mobile Status drawer — mirrors the
        // desktop tree (All Cases + every status), in the same display order.
        mobileStatusList() {
            const td = this.treeData[0] || { children: [] }
            return [
                { id: td.id, label: td.label, count: td.count },
                ...(td.children || []).map(c => ({ id: c.id, label: c.label, count: c.count }))
            ]
        },
        canViewPrice() {
            const roles = this.$store.getters.roles || []
            return roles.includes('admin') || roles.includes('techelite-admin')
        },
        devicePurchasePrice() {
            const p = this.sendPartsCase && this.sendPartsCase.device && this.sendPartsCase.device.purchasePrice
            return Number(p) > 0 ? Number(p) : 0
        },
        sendPartsBudget() {
            return this.devicePurchasePrice * 0.6
        },
        sendPartsTotal() {
            return this.selectedParts.reduce((sum, p) => sum + (Number(p.price) || 0), 0)
        },
        // Add 10% GST to the wholesale total for the budget check
        sendPartsEstimated() {
            return this.sendPartsTotal * 1.1
        },
        sendPartsWarning() {
            return this.sendPartsBudget > 0 && this.sendPartsEstimated > this.sendPartsBudget
        },
        // Admin + TechElite Admin see the full status list (incl. On Hold &
        // Waiting Solvup); shop roles do not.
        canSeeAdminOnlyStatuses() {
            const roles = (this.$store && this.$store.state.user.roles) || []
            return roles.includes('admin') || roles.includes('techelite-admin')
        },
        visibleStatusMeta() {
            return this.canSeeAdminOnlyStatuses
                ? STATUS_META
                : STATUS_META.filter(s => !ADMIN_ONLY_STATUSES.includes(s.value))
        },
        statusOptions() {
            return this.visibleStatusMeta.map(s => ({ value: s.value, label: s.label }))
        },
        treeData() {
            const byStatus = this.counts.byStatus || {}
            return [
                {
                    id: 'all',
                    label: 'All Cases',
                    count: this.counts.total || 0,
                    children: this.visibleStatusMeta.map(s => ({
                        id: s.value,
                        label: s.label,
                        count: byStatus[s.value] || 0
                    }))
                }
            ]
        },
        notesDialogTitle() {
            if (!this.notesCaseRef) return 'Notes'
            return `Notes — ${this.caseLabel(this.notesCaseRef)}`
        },
        changeStatusDialogTitle() {
            if (!this.changeStatusCase) return 'Change Status'
            return `Change Status — ${this.caseLabel(this.changeStatusCase)}`
        },
        selectPartsDialogTitle() {
            if (!this.selectPartsCase) return 'Select Parts'
            return `Select Parts — ${this.caseLabel(this.selectPartsCase)}`
        },
        selectPartsModelId() {
            return this.selectPartsCase && this.selectPartsCase.device && this.selectPartsCase.device.modelId
        },
        // Only non-genuine parts can be selected for a case (price high → low)
        nonGenuineParts() {
            return this.availableParts
                .filter(p => !p.genuine)
                .sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0))
        },
        chosenParts() {
            return this.availableParts.filter(p => p._selected)
        },
        chosenPartsTotal() {
            return this.chosenParts.reduce((sum, p) => sum + (Number(p.price) || 0), 0)
        },
        laborCost() {
            return LABOR_COST
        },
        chosenSubtotal() {
            return this.chosenPartsTotal + this.laborCost
        },
        chosenGst() {
            return this.chosenSubtotal * GST_RATE
        },
        chosenGrandTotal() {
            return this.chosenSubtotal + this.chosenGst
        },
        selectPurchasePrice() {
            const p = this.selectPartsCase && this.selectPartsCase.device && this.selectPartsCase.device.purchasePrice
            return Number(p) > 0 ? Number(p) : 0
        },
        repairBudget() {
            return this.selectPurchasePrice * 0.6
        },
        // Estimated charge: (parts + labor) with GST applied
        estimatedCharge() {
            return this.chosenGrandTotal
        },
        budgetWarning() {
            return this.repairBudget > 0 && this.estimatedCharge > this.repairBudget
        },
        sendPartsDialogTitle() {
            if (!this.sendPartsCase) return 'Send Parts'
            return `Send Parts — ${this.caseLabel(this.sendPartsCase)}`
        },
        partsReceivedDialogTitle() {
            if (!this.partsReceivedCase) return 'Parts Received'
            return `Parts Received — ${this.caseLabel(this.partsReceivedCase)}`
        },
        customerNotifiedDialogTitle() {
            if (!this.customerNotifiedCase) return 'Customer Notified'
            return `Customer Notified — ${this.caseLabel(this.customerNotifiedCase)}`
        },
        startRepairDialogTitle() {
            if (!this.startRepairCase) return 'Start Repair'
            return `Start Repair — ${this.caseLabel(this.startRepairCase)}`
        },
        markRepairedDialogTitle() {
            if (!this.markRepairedCase) return 'Mark Repaired'
            return `Mark Repaired — ${this.caseLabel(this.markRepairedCase)}`
        },
        markCollectedDialogTitle() {
            if (!this.markCollectedCase) return 'Mark Collected'
            return `Mark Collected — ${this.caseLabel(this.markCollectedCase)}`
        },
        markUnrepairableDialogTitle() {
            if (!this.markUnrepairableCase) return 'Mark Unrepairable'
            return `Mark Unrepairable — ${this.caseLabel(this.markUnrepairableCase)}`
        },
        markBerDialogTitle() {
            if (!this.markBerCase) return 'Mark BER'
            return `Mark BER — ${this.caseLabel(this.markBerCase)}`
        },
        detailDialogTitle() {
            if (!this.detailCase) return 'Case Detail'
            return `Case — ${this.caseLabel(this.detailCase)}`
        },
        detailStatusHistory() {
            if (!this.detailCase || !Array.isArray(this.detailCase.statusHistory)) return []
            // newest first
            return [...this.detailCase.statusHistory].reverse()
        },
        detailNotes() {
            if (!this.detailCase || !Array.isArray(this.detailCase.notes)) return []
            // newest first
            return [...this.detailCase.notes].reverse()
        },
        detailSentOrders() {
            if (!this.detailCase || !Array.isArray(this.detailCase.zohoOrders)) return []
            // newest first
            return [...this.detailCase.zohoOrders].reverse()
        },
        sendPartsExistingOrders() {
            if (!this.sendPartsCase || !Array.isArray(this.sendPartsCase.zohoOrders)) return []
            // newest first
            return [...this.sendPartsCase.zohoOrders].reverse()
        },
        deviceEditDirty() {
            if (!this.detailCase || !this.detailCase.device) return false
            const orig = {
                description: this.detailCase.device.description || '',
                imei: this.detailCase.device.imei || ''
            }
            return (
                (this.deviceEdit.description || '') !== orig.description ||
                (this.deviceEdit.imei || '') !== orig.imei
            )
        }
    },
    created() {
        // Support deep-linking from the Home dashboard / external links:
        //   /sqt/cases?shopId=<id>     pre-scopes the table to one shop
        //   /sqt/cases?openCase=<id>   pops the detail dialog for that case
        const q = this.$route.query || {}
        if (q.shopId) this.queryParams.shopId = String(q.shopId)
        this.refreshAll().then(() => {
            if (q.openCase) this.openCaseById(String(q.openCase))
        })
        this.loadShops()
    },
    mounted() {
        // Keep `viewportWidth` reactive so the responsive computeds re-evaluate
        // when the user rotates / resizes their window.
        window.addEventListener('resize', this.handleResize)
    },
    beforeDestroy() {
        window.removeEventListener('resize', this.handleResize)
    },
    watch: {
        // If the user navigates here again with a different openCase id while
        // already mounted, honour it.
        '$route.query.openCase'(id) {
            if (id) this.openCaseById(String(id))
        }
    },
    methods: {
        handleResize() {
            this.viewportWidth = window.innerWidth
        },
        // Return the note attached to the most recent status-history entry
        // that put this case into On Hold. Used to surface the reason inline
        // in both the table and the card view. Empty string if no note.
        onHoldNote(row) {
            if (!row || row.status !== 'on-hold') return ''
            const history = Array.isArray(row.statusHistory) ? row.statusHistory : []
            for (let i = history.length - 1; i >= 0; i--) {
                if (history[i] && history[i].status === 'on-hold' && history[i].note) {
                    return String(history[i].note)
                }
            }
            return ''
        },
        setViewMode(mode) {
            if (mode !== 'table' && mode !== 'card') return
            this.viewMode = mode
            try { localStorage.setItem('sqt-cases-view-mode', mode) } catch (e) { /* ignore */ }
        },
        // Return the primary status-transition button(s) for a row. Each item:
        //   { label, icon, type, permission?, click }
        // `permission` is read by the template to apply v-hasPermi-style gating.
        // Used by both the desktop action column and the mobile card list.
        primaryActions(row) {
            const a = []
            switch (row.status) {
                case 'pending':
                    a.push({ label: 'Send Parts', icon: 'el-icon-box', permission: 'sqt:case:sendParts', click: () => this.handleSendParts(row) })
                    break
                case 'waiting-for-parts':
                    a.push({ label: 'Parts Received', icon: 'el-icon-receiving', click: () => this.handlePartsReceived(row) })
                    break
                case 'parts-arrived':
                    a.push({ label: 'Customer Notified', icon: 'el-icon-bell', click: () => this.handleCustomerNotified(row) })
                    break
                case 'waiting-for-drop-off':
                    a.push({ label: 'Start Repair', icon: 'el-icon-setting', click: () => this.handleStartRepair(row) })
                    break
                case 'repairing':
                    a.push({ label: 'Mark Repaired', icon: 'el-icon-circle-check', click: () => this.handleMarkRepaired(row) })
                    a.push({ label: 'Mark Unrepairable', icon: 'el-icon-warning-outline', click: () => this.handleMarkUnrepairable(row) })
                    break
                case 'repaired':
                    a.push({ label: 'Mark Collected', icon: 'el-icon-finished', click: () => this.handleMarkCollected(row) })
                    break
                case 'unrepairable':
                    a.push({ label: 'Mark BER', icon: 'el-icon-refresh-right', permission: 'sqt:case:markBer', click: () => this.handleMarkBer(row) })
                    break
                case 'repaired-and-collected':
                    a.push({ label: 'Select Parts', icon: 'el-icon-shopping-cart-2', permission: 'sqt:case:selectParts', click: () => this.handleSelectParts(row) })
                    break
            }
            return a
        },
        // Permission helper for action items — uses $auth (same source as the
        // v-hasPermi directive). When no `permission` is required, returns true.
        canDo(actionItem) {
            if (!actionItem || !actionItem.permission) return true
            const perms = (this.$store && this.$store.getters && this.$store.getters.permissions) || []
            // Mirror the matcher used by v-hasPermi: literal match, "*:*:*",
            // or the per-segment wildcard form. Keeping this local avoids
            // pulling in the directive utility for a one-off check.
            return perms.some(p => {
                if (p === '*:*:*' || p === actionItem.permission) return true
                const g = p.split(':')
                const r = actionItem.permission.split(':')
                if (g.length !== r.length) return false
                return g.every((seg, i) => seg === '*' || seg === r[i])
            })
        },
        async refreshAll() {
            await Promise.all([this.getList(), this.loadCounts()])
        },
        async openCaseById(id) {
            // Prefer the row already in the loaded list to avoid a round-trip.
            const found = this.list.find(c => c._id === id)
            if (found) {
                this.openDetail(found)
                return
            }
            try {
                const res = await getCase(id)
                if (res && res.data) this.openDetail(res.data)
            } catch (e) {
                console.error(e)
                this.$message.error('Could not open that case')
            }
        },
        async getList() {
            this.loading = true
            try {
                const params = {
                    page: this.queryParams.page,
                    pageSize: this.queryParams.pageSize
                }
                if (this.queryParams.search) params.search = this.queryParams.search
                if (this.queryParams.shopId) params.shopId = this.queryParams.shopId
                if (this.activeStatus) params.status = this.activeStatus

                const res = await listCases(params)
                this.list = res.data || []
                this.total = res.totalDocs || 0
            } catch (e) {
                console.error(e)
                this.$message.error('Failed to load cases')
            } finally {
                this.loading = false
            }
        },
        async loadCounts() {
            try {
                const params = {}
                // When a shop is selected, scope the status counts to it too so
                // the tree shows exactly what that shop would see.
                if (this.queryParams.shopId) params.shopId = this.queryParams.shopId
                const res = await getCaseCounts(params)
                this.counts = res.data || { total: 0, byStatus: {} }
            } catch (e) {
                console.error(e)
            }
        },
        // Download the full current-status list as a styled .xlsx.
        // Respects the active filters (status + shop + search) but pulls
        // EVERY page, not just the one on screen, so the file is the
        // complete set the user is viewing.
        async exportExcel() {
            if (this.exporting) return
            this.exporting = true
            try {
                // Page through the list with the active filters until we've
                // collected every row. Fixed page size keeps each request
                // sane regardless of how big the status bucket is.
                const baseParams = {}
                if (this.queryParams.search) baseParams.search = this.queryParams.search
                if (this.queryParams.shopId) baseParams.shopId = this.queryParams.shopId
                if (this.activeStatus) baseParams.status = this.activeStatus

                const PAGE = 500
                let page = 1
                let collected = []
                let totalDocs = 0
                // Safety bound — stop after 200 pages (100k rows) so a
                // backend that ignored paging can't spin forever.
                for (let guard = 0; guard < 200; guard++) {
                    const res = await listCases({ ...baseParams, page, pageSize: PAGE })
                    const batch = (res && res.data) || []
                    totalDocs = (res && res.totalDocs) || 0
                    collected = collected.concat(batch)
                    if (batch.length < PAGE || collected.length >= totalDocs) break
                    page += 1
                }

                if (collected.length === 0) {
                    this.$message.warning('Nothing to export — the list is empty.')
                    return
                }

                const rows = collected.map(c => this.caseToRow(c))
                const worksheet = XLSX.utils.json_to_sheet(rows, {
                    header: [
                        'Case ID', 'Service Request ID', 'Status', 'Assigned To',
                        'Created Date', 'Customer', 'Mobile', 'Email'
                    ]
                })

                // Primary-blue header band — same look as the Repair /
                // Stock Monitoring exports.
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
                const range = XLSX.utils.decode_range(worksheet['!ref'])
                for (let col = range.s.c; col <= range.e.c; col++) {
                    const addr = XLSX.utils.encode_cell({ r: 0, c: col })
                    if (worksheet[addr]) worksheet[addr].s = headerStyle
                }
                worksheet['!cols'] = [
                    { wch: 14 }, // Case ID
                    { wch: 20 }, // Service Request ID
                    { wch: 22 }, // Status
                    { wch: 24 }, // Assigned To
                    { wch: 22 }, // Created Date
                    { wch: 24 }, // Customer
                    { wch: 18 }, // Mobile
                    { wch: 28 }  // Email
                ]

                const label = this.activeStatus ? this.statusLabel(this.activeStatus) : 'All Cases'
                const sheetName = String(label).slice(0, 31)
                const workbook = XLSX.utils.book_new()
                XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

                const today = new Date().toISOString().split('T')[0]
                const scopeSlug = (this.activeStatus || 'all').replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'all'
                XLSX.writeFile(workbook, `sqt-cases_${scopeSlug}_${today}.xlsx`)
            } catch (e) {
                console.error('Export failed:', e)
                this.$message.error('Failed to export cases')
            } finally {
                this.exporting = false
            }
        },
        // Map a case document → the export row. Column keys here become
        // the Excel headers (in the order given to json_to_sheet).
        caseToRow(c) {
            const cust = c.customer || {}
            const fullName = [cust.firstName, cust.lastName].filter(Boolean).join(' ').trim()
            return {
                'Case ID': c.caseId || '',
                'Service Request ID': c.serviceRequestId || '',
                'Status': this.statusLabel(c.status),
                'Assigned To': c.shopName || '',
                'Created Date': this.formatDateTime ? this.formatDateTime(c.createdAt) : this.formatDate(c.createdAt),
                'Customer': fullName,
                'Mobile': cust.phone || '',
                'Email': cust.email || ''
            }
        },
        handleShopChange() {
            // Switching shop re-scopes both the table and the status counts.
            this.queryParams.page = 1
            this.refreshAll()
        },
        async loadShops() {
            // Shop-scoped users can't hit the admin shop list endpoint (403);
            // use the accessible shops returned with their profile instead.
            const accessible = this.$store.getters.accessibleShopIds
            if (Array.isArray(accessible)) {
                this.shops = this.$store.getters.shops || []
                return
            }
            try {
                const res = await listShops({ page: 1, pageSize: 200 })
                this.shops = res.data || []
            } catch (e) {
                console.error(e)
            }
        },
        handleStatusClick(data) {
            if (!data) return
            this.activeStatus = data.id === 'all' ? null : data.id
            this.queryParams.page = 1
            this.getList()
            // On mobile the tree lives inside a drawer; close it once a status
            // is picked so the user sees the filtered table immediately.
            if (this.isPhone) this.mobileFilterOpen = false
        },
        clearStatusFilter() {
            this.activeStatus = null
            this.$refs.statusTreeRef && this.$refs.statusTreeRef.setCurrentKey('all')
            this.queryParams.page = 1
            this.getList()
        },
        handleQuery() {
            this.queryParams.page = 1
            this.getList()
        },
        resetQuery() {
            this.queryParams = { page: 1, pageSize: 20, search: '', shopId: '' }
            this.activeStatus = null
            this.$refs.statusTreeRef && this.$refs.statusTreeRef.setCurrentKey('all')
            this.getList()
        },
        openDetail(row) {
            this.detailCase = row
            this.detailActiveTab = 'basic'
            this.resetDeviceEdits()
            this.detailDialogOpen = true
        },
        resetDeviceEdits() {
            const d = (this.detailCase && this.detailCase.device) || {}
            this.deviceEdit = {
                description: d.description || '',
                imei: d.imei || ''
            }
        },
        async saveDeviceEdits() {
            if (!this.detailCase || !this.deviceEditDirty) return
            this.deviceSubmitting = true
            try {
                const res = await updateCaseDevice(this.detailCase._id, {
                    description: this.deviceEdit.description,
                    imei: this.deviceEdit.imei
                })
                const updated = res.data
                // sync local row + dialog binding
                const idx = this.list.findIndex(c => c._id === this.detailCase._id)
                if (idx !== -1) this.$set(this.list, idx, updated)
                this.detailCase = updated
                this.resetDeviceEdits()
                this.$message.success('Device info updated')
            } catch (e) {
                console.error(e)
                const msg = (e.response && e.response.data && e.response.data.message) || 'Save failed'
                this.$message.error(msg)
            } finally {
                this.deviceSubmitting = false
            }
        },
        handleSendParts(row) {
            this.sendPartsCase = row
            this.partsSearchKeyword = ''
            this.selectedParts = []
            this.sendPartsDialogOpen = true
        },
        resetSendParts() {
            this.sendPartsCase = null
            this.partsSearchKeyword = ''
            this.selectedParts = []
        },
        async fetchProductSuggestions(query, cb) {
            const q = (query || '').trim()
            if (!q) {
                cb([])
                return
            }
            try {
                const res = await searchProducts(q)
                if (!res || !res.success) {
                    cb([])
                    return
                }
                const products = Array.isArray(res.data) ? res.data : []
                // Normalize fields so the picker + table can rely on a stable shape
                const suggestions = products.map(p => ({
                    ...p,
                    name: p.name || p.product_name || p.title || '',
                    sku: p.sku
                        || (Array.isArray(p.skus) && p.skus[0] && p.skus[0].sku)
                        || (p.variants && p.variants[0] && p.variants[0].sku)
                        || '',
                    product_id: p.product_id || p.id || '',
                    imgUrl: this.extractProductImage(p)
                }))
                cb(suggestions)
            } catch (e) {
                console.error('Product search failed:', e)
                cb([])
            }
        },
        extractProductImage(p) {
            const BASE = 'https://www.imobilestore.com.au'
            const toAbsolute = (path) => {
                if (!path) return ''
                if (/^https?:\/\//i.test(path)) return path
                return BASE + (path.startsWith('/') ? '' : '/') + path
            }

            // Try several known Zoho shapes — first hit wins
            if (Array.isArray(p.documents) && p.documents[0]) {
                const d = p.documents[0]
                if (d.file_name && d.document_id) {
                    return `${BASE}/product-images/${d.file_name}/${d.document_id}/100x100`
                }
            }
            if (Array.isArray(p.images) && p.images[0]) {
                const i = p.images[0]
                return toAbsolute(i.image_url || i.url || i.path || i.image_path || '')
            }
            return toAbsolute(p.image_url || p.image || p.image_path || '')
        },
        onSuggestionImgError(e) {
            // Hide broken images so the placeholder layout still works
            if (e && e.target) e.target.style.display = 'none'
        },
        async onProductSelected(item) {
            if (!item) return
            // SKU is required — Commerce product_id ≠ Inventory item_id, so we
            // translate via SKU. Without a SKU we can't resolve the real id.
            if (!item.sku) {
                this.$message.error(
                    `"${item.name || 'This product'}" has no SKU — add one in Zoho before sending parts.`
                )
                this.partsSearchKeyword = ''
                return
            }
            // Dedupe by SKU (the natural key now that we look up the inventory id)
            const existing = this.selectedParts.find(p => p.sku === item.sku)
            if (existing) {
                this.$message.info(`"${item.name}" is already in the list`)
                this.partsSearchKeyword = ''
                return
            }
            this.partsLookupLoading = true
            try {
                const res = await lookupProductBySku(item.sku)
                if (!res || !res.success || !res.data || !res.data.itemId) {
                    throw new Error('No inventory item returned for this SKU')
                }
                this.selectedParts.push({
                    product_id: res.data.itemId, // real Zoho Inventory item_id
                    name: item.name || '',
                    sku: item.sku,
                    price: res.data.wholesalePrice, // may be null
                    raw: item
                })
            } catch (e) {
                console.error(e)
                const msg = (e.response && e.response.data && e.response.data.message)
                    || e.message || 'SKU lookup failed'
                this.$message.error(msg)
            } finally {
                this.partsLookupLoading = false
                this.partsSearchKeyword = ''
            }
        },
        removeSelectedPart(idx) {
            this.selectedParts.splice(idx, 1)
        },
        async submitSendParts() {
            if (!this.selectedParts.length || !this.sendPartsCase) return
            this.sendPartsSubmitting = true
            try {
                const payload = {
                    products: this.selectedParts.map(p => ({
                        product_id: p.product_id,
                        name: p.name,
                        sku: p.sku
                    }))
                }
                // Snapshot the case for the label before any refresh
                // swaps sendPartsCase out from under us.
                const labelCase = this.sendPartsCase
                const res = await sendCaseParts(this.sendPartsCase._id, payload)
                const soNumber = res && res.data && res.data.salesOrderNumber
                const soId = res && res.data && res.data.salesOrderId
                // RepairDesk status mirror is best-effort — warn if it didn't take
                const rd = res && res.data && res.data.repairDesk
                if (rd && rd.success === false) {
                    this.$message.warning(
                        'Case updated, but the RepairDesk ticket status could not be updated. Please update it manually.'
                    )
                    console.warn('RepairDesk update failed:', rd.error)
                }
                // Reflect the updated case in the table immediately, then refresh counts/list
                const updatedCase = res && res.data && res.data.case
                if (updatedCase) {
                    const idx = this.list.findIndex(c => c._id === updatedCase._id)
                    if (idx !== -1) this.$set(this.list, idx, updatedCase)
                }

                // Generate the URGENT label PDF from the case, attach it
                // to the new Zoho order (best-effort), and surface a
                // success popup with a Preview button.
                const src = updatedCase || labelCase || {}
                this.caseLabelDoc = buildCaseLabelDoc({
                    shopName: src.shopName || '',
                    caseId: src.caseId || '',
                    serviceRequestId: src.serviceRequestId || ''
                })
                this.labelAttachResult = soId
                    ? await this.attachCaseLabel(soId)
                    : { ok: false, message: 'No sales order id returned' }
                this.sendPartsSuccessInfo = { soNumber: soNumber || '' }

                this.sendPartsDialogOpen = false
                this.sendPartsSuccessOpen = true
                this.refreshAll()
            } catch (e) {
                console.error(e)
                const msg = (e.response && e.response.data && e.response.data.message) || 'Submit failed'
                this.$message.error(msg)
            } finally {
                this.sendPartsSubmitting = false
            }
        },
        // Attach the generated label PDF to the Zoho sales order.
        // Best-effort — failure doesn't undo the order; the outcome is
        // shown on the success popup and the user can still preview /
        // attach manually.
        async attachCaseLabel(salesOrderId) {
            if (!this.caseLabelDoc) return { ok: false, message: 'No label generated' }
            try {
                const blob = this.caseLabelDoc.output('blob')
                const form = new FormData()
                form.append('salesOrderId', String(salesOrderId))
                form.append('file', blob, 'urgent-label.pdf')
                const res = await attachCaseOrderFile(form)
                if (res && res.success) return { ok: true }
                return { ok: false, message: (res && res.message) || 'Attach failed' }
            } catch (e) {
                console.error('Label attach failed:', e)
                return {
                    ok: false,
                    message: (e.response && e.response.data && e.response.data.message) || e.message || 'Attach failed'
                }
            }
        },
        // Open the generated label in a new tab. bloburl is created on
        // demand (user gesture) so popup blockers leave it alone.
        previewCaseLabel() {
            if (!this.caseLabelDoc) {
                this.$message.warning('No label to preview.')
                return
            }
            window.open(this.caseLabelDoc.output('bloburl'), '_blank', 'noopener,noreferrer')
        },
        handleCustomerNotified(row) {
            this.customerNotifiedCase = row
            this.customerNotifiedDialogOpen = true
        },
        handleStartRepair(row) {
            this.startRepairCase = row
            this.startRepairDialogOpen = true
        },
        handleMarkRepaired(row) {
            this.markRepairedCase = row
            // Flatten line items across every zohoOrder so the shop can tick what was used
            const items = []
            const orders = Array.isArray(row.zohoOrders) ? row.zohoOrders : []
            for (const order of orders) {
                const lineItems = Array.isArray(order.lineItems) ? order.lineItems : []
                for (let i = 0; i < lineItems.length; i++) {
                    const li = lineItems[i]
                    items.push({
                        zohoSalesOrderId: order.zohoSalesOrderId,
                        zohoSalesOrderNumber: order.zohoSalesOrderNumber,
                        lineItemIdx: i,
                        partName: li.partName || '',
                        sku: li.sku || '',
                        quantitySent: Number(li.quantitySent) || 1,
                        // Pre-tick if it was already marked used previously
                        used: Number(li.quantityUsed) > 0
                    })
                }
            }
            this.markRepairedForm = { collected: null, items }
            this.markRepairedDialogOpen = true
        },
        async submitMarkRepaired() {
            if (this.markRepairedForm.collected === null || !this.markRepairedCase) return
            this.markRepairedSubmitting = true
            try {
                const usage = this.markRepairedForm.items.map(item => ({
                    zohoSalesOrderId: item.zohoSalesOrderId,
                    lineItemIdx: item.lineItemIdx,
                    quantityUsed: item.used ? item.quantitySent : 0
                }))
                const res = await markCaseRepaired(this.markRepairedCase._id, {
                    collected: this.markRepairedForm.collected,
                    usage,
                    updatedBy: 'Admin'
                })
                const updated = res && res.data
                const newStatus = (updated && updated.status) ||
                    (this.markRepairedForm.collected ? 'repaired-and-collected' : 'repaired')
                this.$message.success(`Moved to ${this.statusLabel(newStatus)}`)
                if (updated) {
                    const idx = this.list.findIndex(c => c._id === updated._id)
                    if (idx !== -1) this.$set(this.list, idx, updated)
                }
                this.markRepairedDialogOpen = false
                this.refreshAll()
            } catch (e) {
                console.error(e)
                const msg = (e.response && e.response.data && e.response.data.message) || 'Failed to update'
                this.$message.error(msg)
            } finally {
                this.markRepairedSubmitting = false
            }
        },
        handleMarkCollected(row) {
            this.markCollectedCase = row
            this.markCollectedDialogOpen = true
        },
        handleMarkUnrepairable(row) {
            this.markUnrepairableCase = row
            this.markUnrepairableDialogOpen = true
        },
        async submitMarkUnrepairable() {
            if (!this.markUnrepairableCase) return
            this.markUnrepairableSubmitting = true
            try {
                const res = await changeCaseStatus(this.markUnrepairableCase._id, {
                    status: 'unrepairable',
                    note: 'Shop marked the device as unrepairable',
                    updatedBy: 'Admin'
                })
                this.$message.success('Moved to Unrepairable')
                const updated = res && res.data
                if (updated) {
                    const idx = this.list.findIndex(c => c._id === updated._id)
                    if (idx !== -1) this.$set(this.list, idx, updated)
                }
                this.markUnrepairableDialogOpen = false
                this.refreshAll()
            } catch (e) {
                console.error(e)
                const msg = (e.response && e.response.data && e.response.data.message) || 'Failed to update'
                this.$message.error(msg)
            } finally {
                this.markUnrepairableSubmitting = false
            }
        },
        handleMarkBer(row) {
            this.markBerCase = row
            this.markBerDialogOpen = true
        },
        async submitMarkBer() {
            if (!this.markBerCase) return
            this.markBerSubmitting = true
            try {
                const res = await changeCaseStatus(this.markBerCase._id, {
                    status: 'ber',
                    note: 'Unrepairable case handled — moved to BER',
                    updatedBy: 'Admin'
                })
                this.$message.success('Moved to BER')
                const updated = res && res.data
                if (updated) {
                    const idx = this.list.findIndex(c => c._id === updated._id)
                    if (idx !== -1) this.$set(this.list, idx, updated)
                }
                this.markBerDialogOpen = false
                this.refreshAll()
            } catch (e) {
                console.error(e)
                const msg = (e.response && e.response.data && e.response.data.message) || 'Failed to update'
                this.$message.error(msg)
            } finally {
                this.markBerSubmitting = false
            }
        },
        handleSelectParts(row) {
            this.selectPartsCase = row
            this.availableParts = []
            const mId = (row.device && row.device.modelId) || ''
            this.modelSelectValue = mId
            // Seed the dropdown with the current model so its label shows instantly
            this.modelOptions = mId
                ? [{ _id: mId, name: (row.device && row.device.modelName) || '', brandName: (row.device && row.device.brand) || '' }]
                : []
            this.selectPartsDialogOpen = true
            this.loadModels()
            this.loadAvailableParts()
        },
        // Load the full model catalogue from sqt_models (small collection),
        // ensuring the case's current model is always present in the options.
        async loadModels() {
            this.modelsLoading = true
            try {
                const res = await listModels({ page: 1, pageSize: 500 })
                let opts = res.data || []
                const cur = this.selectPartsCase && this.selectPartsCase.device
                if (cur && cur.modelId && !opts.some(m => String(m._id) === String(cur.modelId))) {
                    opts = [{ _id: cur.modelId, name: cur.modelName || '', brandName: cur.brand || '' }, ...opts]
                }
                this.modelOptions = opts
            } catch (e) {
                console.error(e)
            } finally {
                this.modelsLoading = false
            }
        },
        async onSelectPartsModelChange(modelId) {
            if (!this.selectPartsCase) return
            const prev = (this.selectPartsCase.device && this.selectPartsCase.device.modelId) || ''
            try {
                const res = await updateCaseDevice(this.selectPartsCase._id, { modelId: modelId || null })
                const updated = res && res.data
                if (updated) {
                    this.selectPartsCase = updated
                    const idx = this.list.findIndex(c => c._id === updated._id)
                    if (idx !== -1) this.$set(this.list, idx, updated)
                }
                this.$message.success('Model updated')
                await this.loadAvailableParts()
            } catch (e) {
                console.error(e)
                this.modelSelectValue = prev // revert on failure
                const msg = (e.response && e.response.data && e.response.data.message) || 'Failed to update model'
                this.$message.error(msg)
            }
        },
        async loadAvailableParts() {
            const modelId = this.selectPartsModelId
            if (!modelId) {
                this.availableParts = []
                return
            }
            this.selectPartsLoading = true
            try {
                const res = await listParts(modelId)
                const existing = (this.selectPartsCase && this.selectPartsCase.partsForInvoice) || []
                this.availableParts = (res.data || []).map(p => {
                    const sel = existing.find(e => String(e.partPriceId) === String(p._id))
                    return { ...p, _selected: !!sel }
                })
            } catch (e) {
                console.error(e)
                this.$message.error('Failed to load parts')
            } finally {
                this.selectPartsLoading = false
            }
        },
        async submitSelectParts() {
            if (!this.selectPartsCase) return
            const parts = this.availableParts
                .filter(p => p._selected)
                .map(p => ({ partPriceId: p._id }))
            this.selectPartsSubmitting = true
            try {
                const res = await selectCaseParts(this.selectPartsCase._id, { parts })
                const updated = res && res.data
                if (updated) {
                    const idx = this.list.findIndex(c => c._id === updated._id)
                    if (idx !== -1) this.$set(this.list, idx, updated)
                }
                if (parts.length > 0) {
                    this.$message.success(`Saved ${parts.length} part(s) — moved to Waiting Solvup`)
                } else {
                    this.$message.success('Part selection cleared')
                }
                this.selectPartsDialogOpen = false
                // Status may have moved to "waiting-solvup" — re-pull list + tree counts.
                this.refreshAll()
            } catch (e) {
                console.error(e)
                const msg = (e.response && e.response.data && e.response.data.message) || 'Save failed'
                this.$message.error(msg)
            } finally {
                this.selectPartsSubmitting = false
            }
        },
        resetSelectParts() {
            this.selectPartsCase = null
            this.availableParts = []
            this.modelSelectValue = ''
            this.modelOptions = []
        },
        openAddPart() {
            this.addPartForm = { partName: '', price: 0, genuine: false, identifiers: { sku: '', partNumber: '', zohoName: '' } }
            this.addPartDialogOpen = true
            this.$nextTick(() => this.$refs.addPartForm && this.$refs.addPartForm.clearValidate())
        },
        submitAddPart() {
            this.$refs.addPartForm.validate(async valid => {
                if (!valid) return
                this.addPartSubmitting = true
                try {
                    const payload = {
                        partName: this.addPartForm.partName,
                        genuine: false, // parts added here are non-genuine
                        price: this.addPartForm.price,
                        active: true,
                        identifiers: {
                            sku: this.addPartForm.identifiers.sku || null,
                            partNumber: this.addPartForm.identifiers.partNumber || null,
                            zohoName: this.addPartForm.identifiers.zohoName || null
                        }
                    }
                    const res = await createPart(this.selectPartsModelId, payload)
                    this.$message.success('Part added')
                    // Append and auto-select the new part
                    if (res && res.data) {
                        this.availableParts.push({ ...res.data, _selected: true })
                    } else {
                        this.loadAvailableParts()
                    }
                    this.addPartDialogOpen = false
                } catch (e) {
                    console.error(e)
                    const msg = (e.response && e.response.data && e.response.data.message) || 'Failed to add part'
                    this.$message.error(msg)
                } finally {
                    this.addPartSubmitting = false
                }
            })
        },
        resetAddPartForm() {
            this.addPartForm = { partName: '', price: 0, genuine: false, identifiers: { sku: '', partNumber: '', zohoName: '' } }
            this.$nextTick(() => this.$refs.addPartForm && this.$refs.addPartForm.clearValidate())
        },
        async submitMarkCollected() {
            if (!this.markCollectedCase) return
            this.markCollectedSubmitting = true
            try {
                const res = await changeCaseStatus(this.markCollectedCase._id, {
                    status: 'repaired-and-collected',
                    note: 'Customer collected the device',
                    updatedBy: 'Admin'
                })
                this.$message.success('Moved to Repaired & Collected')
                const updated = res && res.data
                if (updated) {
                    const idx = this.list.findIndex(c => c._id === updated._id)
                    if (idx !== -1) this.$set(this.list, idx, updated)
                }
                this.markCollectedDialogOpen = false
                this.refreshAll()
            } catch (e) {
                console.error(e)
                const msg = (e.response && e.response.data && e.response.data.message) || 'Failed to update'
                this.$message.error(msg)
            } finally {
                this.markCollectedSubmitting = false
            }
        },
        async submitStartRepair() {
            if (!this.startRepairCase) return
            this.startRepairSubmitting = true
            try {
                const res = await changeCaseStatus(this.startRepairCase._id, {
                    status: 'repairing',
                    note: 'Device received from customer — repair started',
                    updatedBy: 'Admin'
                })
                this.$message.success('Moved to Repairing')
                const updated = res && res.data
                if (updated) {
                    const idx = this.list.findIndex(c => c._id === updated._id)
                    if (idx !== -1) this.$set(this.list, idx, updated)
                }
                this.startRepairDialogOpen = false
                this.refreshAll()
            } catch (e) {
                console.error(e)
                const msg = (e.response && e.response.data && e.response.data.message) || 'Failed to update'
                this.$message.error(msg)
            } finally {
                this.startRepairSubmitting = false
            }
        },
        async submitCustomerNotified() {
            if (!this.customerNotifiedCase) return
            this.customerNotifiedSubmitting = true
            try {
                const res = await changeCaseStatus(this.customerNotifiedCase._id, {
                    status: 'waiting-for-drop-off',
                    note: 'Customer informed of parts arrival',
                    updatedBy: 'Admin'
                })
                this.$message.success('Moved to Waiting for Drop-off')
                const updated = res && res.data
                if (updated) {
                    const idx = this.list.findIndex(c => c._id === updated._id)
                    if (idx !== -1) this.$set(this.list, idx, updated)
                }
                this.customerNotifiedDialogOpen = false
                this.refreshAll()
            } catch (e) {
                console.error(e)
                const msg = (e.response && e.response.data && e.response.data.message) || 'Failed to update'
                this.$message.error(msg)
            } finally {
                this.customerNotifiedSubmitting = false
            }
        },
        handlePartsReceived(row) {
            this.partsReceivedCase = row
            this.partsReceivedForm = { customerNotified: null }
            this.partsReceivedDialogOpen = true
        },
        async submitPartsReceived() {
            if (this.partsReceivedForm.customerNotified === null || !this.partsReceivedCase) return
            this.partsReceivedSubmitting = true
            try {
                const res = await markPartsReceived(this.partsReceivedCase._id, {
                    customerNotified: this.partsReceivedForm.customerNotified
                })
                const newStatus = res && res.data && res.data.status
                this.$message.success(
                    newStatus
                        ? `Case moved to "${this.statusLabel(newStatus)}"`
                        : 'Case updated'
                )
                const updated = res && res.data
                if (updated) {
                    const idx = this.list.findIndex(c => c._id === updated._id)
                    if (idx !== -1) this.$set(this.list, idx, updated)
                }
                this.partsReceivedDialogOpen = false
                this.refreshAll()
            } catch (e) {
                console.error(e)
                const msg = (e.response && e.response.data && e.response.data.message) || 'Submit failed'
                this.$message.error(msg)
            } finally {
                this.partsReceivedSubmitting = false
            }
        },
        handleNotes(row) {
            this.notesCaseRef = row
            this.notesList = Array.isArray(row.notes) ? row.notes.slice() : []
            this.noteForm = { text: '' }
            this.notesDialogOpen = true
        },
        handleChangeStatus(row) {
            this.changeStatusCase = row
            this.changeStatusForm = { status: row.status, note: '' }
            this.changeStatusDialogOpen = true
        },
        async submitChangeStatus() {
            if (!this.changeStatusCase) return
            if (!this.changeStatusForm.status) {
                this.$message.warning('Please select a status')
                return
            }
            if (!this.changeStatusForm.note.trim()) {
                this.$message.warning('A note is required to change the status')
                return
            }
            this.changeStatusSubmitting = true
            try {
                const res = await changeCaseStatus(this.changeStatusCase._id, {
                    status: this.changeStatusForm.status,
                    note: this.changeStatusForm.note.trim()
                })
                const updated = res && res.data
                const newStatus = (updated && updated.status) || this.changeStatusForm.status
                this.$message.success(`Status changed to "${this.statusLabel(newStatus)}"`)
                if (updated) {
                    const idx = this.list.findIndex(c => c._id === updated._id)
                    if (idx !== -1) this.$set(this.list, idx, updated)
                }
                this.changeStatusDialogOpen = false
                this.refreshAll()
            } catch (e) {
                console.error(e)
                const msg = (e.response && e.response.data && e.response.data.message) || 'Failed to change status'
                this.$message.error(msg)
            } finally {
                this.changeStatusSubmitting = false
            }
        },
        async submitNote() {
            const text = (this.noteForm.text || '').trim()
            if (!text) {
                this.$message.warning('Note cannot be empty')
                return
            }
            this.noteSubmitting = true
            try {
                const res = await addCaseNote(this.notesCaseRef._id, { text })
                const updated = res.data
                // refresh dialog state from server response
                this.notesList = Array.isArray(updated.notes) ? updated.notes.slice() : []
                this.noteForm.text = ''
                // sync the row in the table so the count badge updates immediately
                const idx = this.list.findIndex(c => c._id === this.notesCaseRef._id)
                if (idx !== -1) this.$set(this.list, idx, updated)
                this.$message.success('Note added')
            } catch (e) {
                console.error(e)
                const msg = (e.response && e.response.data && e.response.data.message) || 'Failed to add note'
                this.$message.error(msg)
            } finally {
                this.noteSubmitting = false
            }
        },
        caseLabel(c) {
            if (!c) return '—'
            if (c.caseId) return `Case ${c.caseId}`
            if (c.serviceRequestId) return `SR ${c.serviceRequestId}`
            return String(c._id || '—')
        },
        statusLabel(s) {
            const meta = STATUS_META.find(x => x.value === s)
            return meta ? meta.label : s
        },
        badgeType(s) {
            const meta = STATUS_META.find(x => x.value === s)
            return meta ? meta.tag : ''
        },
        statusColor(s) {
            if (s === 'all') return '#409EFF'
            const meta = STATUS_META.find(x => x.value === s)
            return meta ? meta.color : '#909399'
        },
        formatDate(d) {
            if (!d) return '—'
            const dt = new Date(d)
            if (isNaN(dt.getTime())) return '—'
            return dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        },
        formatDateTime(d) {
            if (!d) return '—'
            const dt = new Date(d)
            if (isNaN(dt.getTime())) return '—'
            return dt.toLocaleString()
        }
    }
}
</script>

<style lang="scss" scoped>
/* Send Parts success popup */
.send-success {
    text-align: center;
    padding: 8px 0 4px;
}
.send-success-icon { color: #67C23A; font-size: 44px; }
.send-success-title { font-size: 16px; font-weight: 600; color: #111827; margin-top: 8px; }
.send-success-sub { color: #606266; font-size: 13px; margin-top: 4px; }
.send-success-attach {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.4;
    text-align: left;
    margin-top: 14px;
    max-width: 360px;
    i { font-size: 16px; flex-shrink: 0; }
    &.ok { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
    &.fail { background: #fffaf0; border: 1px solid #fde68a; color: #92400e; }
}
.active-filter {
    margin: 0 0 8px 4px;
}
.status-node {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    padding-right: 6px;
}
.status-node-icon {
    font-size: 14px;
    flex-shrink: 0;
}
.status-node-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
}
.status-node-badge {
    flex-shrink: 0;
    margin-left: 4px;
    ::v-deep .el-badge__content {
        font-weight: normal;
    }
}

.notes-list {
    max-height: 320px;
    overflow-y: auto;
    border: 1px solid #ebeef5;
    border-radius: 4px;
    background: #fafafa;
}
.note-item {
    padding: 10px 12px;
    border-bottom: 1px solid #ebeef5;
    &:last-child {
        border-bottom: none;
    }
}
.note-text {
    color: #303133;
    white-space: pre-wrap;
    line-height: 1.5;
}
.note-meta {
    margin-top: 6px;
    font-size: 12px;
    color: #909399;
    display: flex;
    align-items: center;
    gap: 4px;
}
.note-meta-sep {
    margin: 0 4px;
}
.notes-empty {
    padding: 20px;
    text-align: center;
    color: #909399;
    background: #fafafa;
    border-radius: 4px;
}

.case-link {
    color: #409EFF;
    cursor: pointer;
    font-weight: 500;
    &:hover {
        text-decoration: underline;
    }
}
/* Secondary lines stacked under the Case ID in the Case column —
   SR id, shop name, customer phone, IMEI. Kept consistent so the column
   reads as one logical block per row. */
.case-sub {
    color: #999;
    font-size: 12px;
    line-height: 1.5;
}
.case-shop {
    display: flex;
    align-items: center;
    gap: 4px;
    i { font-size: 12px; color: #909399; }
}

.detail-tabs {
    ::v-deep .el-tabs__content {
        padding-top: 4px;
        max-height: 65vh;
        overflow-y: auto;
    }
    .tab-count {
        color: #909399;
        font-weight: normal;
    }
}

.multiline {
    white-space: pre-wrap;
    word-break: break-word;
}

.empty-block {
    padding: 20px;
    text-align: center;
    color: #909399;
    background: #fafafa;
    border-radius: 4px;
}

.history-card {
    .history-by {
        margin-left: 10px;
        color: #909399;
        font-size: 12px;
    }
    .history-note {
        margin-top: 4px;
        color: #606266;
        white-space: pre-wrap;
    }
}

.device-edit-actions {
    margin-top: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
}
.device-edit-hint {
    color: #E6A23C;
    font-size: 12px;
}

.send-parts-device {
    margin-bottom: 18px;
}
.send-parts-card-header {
    font-weight: 500;
    font-size: 13px;
    i {
        color: #409EFF;
        margin-right: 4px;
    }
}
.select-parts-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    font-size: 13px;
    color: #606266;
}
.select-parts-scroll {
    max-height: 70vh;
    overflow-y: auto;
    padding-right: 4px;
}
.repair-budget-hint {
    margin-left: 6px;
    color: #909399;
    font-size: 12px;
}
.select-parts-summary {
    margin-top: 12px;
    .summary-line {
        text-align: right;
        font-size: 13px;
        color: #606266;
        strong {
            margin-left: 6px;
            color: #303133;
        }
    }
    .summary-total {
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px solid #ebeef5;
        font-size: 14px;
        strong {
            font-size: 15px;
        }
    }
}
.select-parts-warning {
    margin-bottom: 10px;
}
.send-parts-warning {
    margin-bottom: 10px;
}
.send-parts-summary {
    margin-top: 12px;
    .summary-line {
        text-align: right;
        font-size: 13px;
        color: #606266;
        strong {
            margin-left: 6px;
            color: #303133;
            &.over-threshold {
                color: #E6A23C;
            }
        }
    }
    .summary-line-muted {
        color: #909399;
    }
}
.send-parts-search {
    margin-bottom: 12px;
}
.send-parts-label {
    display: block;
    font-size: 13px;
    color: #606266;
    font-weight: 500;
    margin-bottom: 6px;
}
.send-parts-table {
    margin-top: 4px;
}
.product-suggestion {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
    line-height: 1.4;
    min-width: 0;
}
.product-suggestion-img {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 4px;
    object-fit: cover;
    background: #f5f7fa;
    border: 1px solid #ebeef5;
}
.product-suggestion-img-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #c0c4cc;
    font-size: 18px;
}
.product-suggestion-info {
    flex: 1;
    min-width: 0;
    overflow: hidden;
}
.product-suggestion-name {
    font-size: 13px;
    color: #303133;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.product-suggestion-meta {
    font-size: 12px;
    color: #909399;
}

.product-link {
    color: #409EFF;
    font-weight: 500;
    text-decoration: none;
    &:hover {
        text-decoration: underline;
    }
}
.product-sub-sku {
    color: #909399;
    font-size: 12px;
    margin-top: 2px;
}
.part-item-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}
.part-item-name {
    font-weight: 500;
}
.part-item-code {
    color: #909399;
    font-size: 12px;
}

.sent-orders-section {
    margin-bottom: 18px;
    padding: 12px;
    background: #fafbfc;
    border: 1px solid #ebeef5;
    border-radius: 4px;
}
.sent-orders-title {
    font-size: 13px;
    font-weight: 500;
    color: #303133;
    margin-bottom: 10px;
    i {
        color: #67c23a;
        margin-right: 4px;
    }
}
.sent-orders-count {
    margin-left: 6px;
    color: #909399;
    font-weight: normal;
    font-size: 12px;
}
.sent-order-card {
    margin-bottom: 12px;
    &:last-child {
        margin-bottom: 0;
    }
}
.sent-order-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 13px;
    i {
        color: #409eff;
    }
}
.sent-order-date {
    color: #909399;
    font-size: 12px;
}
.sent-order-parts-count {
    margin-left: auto;
    color: #909399;
    font-size: 12px;
}
.sent-order-table {
    width: 100%;
}
.sent-order-tracking {
    margin-top: 6px;
    color: #606266;
    font-size: 12px;
}

.send-parts-scroll {
    max-height: 75vh;
    overflow-y: auto;
    /* leave room for the dialog body's right padding so the scrollbar doesn't crowd it */
    padding-right: 4px;
}

.parts-received-question {
    color: #303133;
    font-size: 14px;
    margin-bottom: 14px;
}

.repaired-items-table {
    width: 100%;
}

.sent-order-status {
    margin-left: 6px;
    i {
        margin-right: 2px;
    }
}

/* ──────────────────────────────────────────────────────────────────────────
   Responsive layout — filter bar, mobile Status drawer, card list.
   ────────────────────────────────────────────────────────────────────────── */

/* Filter bar — flex wrap on desktop, vertical stack on phone */
.filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
}
.filter-search { width: 260px; max-width: 100%; }
.filter-shop { width: 220px; max-width: 100%; }
.filter-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
}
/* Compact icon-only buttons inside the table/card view toggle */
.view-toggle ::v-deep .el-radio-button__inner {
    padding: 7px 11px;
    line-height: 1;
    i { font-size: 14px; }
}
.filter-bar.stacked {
    flex-direction: column;
    align-items: stretch;
    .filter-search,
    .filter-shop,
    .filter-status-btn {
        width: 100%;
    }
    .filter-actions { justify-content: flex-end; }
}

/* Phone: tighter page padding so the cards can use the full screen */
.tree-sidebar-manage-wrap.is-phone {
    height: auto;
    min-height: calc(100vh - 100px);
    .tree-sidebar-content .content-inner {
        padding: 10px;
    }
}

/* "More actions" button — keep it compact in the table action column */
.more-btn {
    padding: 4px 4px !important;
    color: #909399;
    &:hover { color: #409eff; }
}

/* ── Mobile status drawer (left off-canvas) ───────────────────────────── */
::v-deep .mobile-status-drawer {
    .el-drawer__header {
        margin-bottom: 0;
        padding: 14px 16px;
        border-bottom: 1px solid #ebeef5;
        font-weight: 600;
    }
    .el-drawer__body {
        padding: 6px 0;
        overflow-y: auto;
    }
}
.drawer-status-list {
    display: flex;
    flex-direction: column;
}
.drawer-status-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    cursor: pointer;
    border-bottom: 1px solid #f5f7fa;
    transition: background 0.15s ease;
    i { font-size: 16px; flex-shrink: 0; }
    .drawer-status-label {
        flex: 1;
        font-size: 14px;
        color: #303133;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    &:hover { background: #f5f7fa; }
    &.active {
        background: #ecf5ff;
        color: #409eff;
        font-weight: 600;
    }
}

/* ── Card list (mobile only) ──────────────────────────────────────────── */
.case-card-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-bottom: 12px;
}
.card-empty {
    padding: 32px 0;
    text-align: center;
    color: #909399;
    background: #fafafa;
    border-radius: 8px;
}
.case-card {
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 10px;
    padding: 12px 14px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}
.card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
    cursor: pointer;
}
.card-id { display: flex; flex-direction: column; min-width: 0; }
.card-id-main {
    color: #409eff;
    font-weight: 600;
    font-size: 14px;
    line-height: 1.2;
}
.card-id-sub {
    color: #909399;
    font-size: 12px;
    margin-top: 2px;
}
.card-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 10px;
    cursor: pointer;
}
.card-line {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #303133;
    font-size: 13px;
    line-height: 1.4;
    i { color: #909399; flex-shrink: 0; }
    span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
    }
    &.muted { color: #909399; font-size: 12px; }
}
.card-line-sub { color: #909399; }
.card-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    padding-top: 8px;
    border-top: 1px dashed #ebeef5;
    .el-button { margin-left: 0 !important; }
}

/* On-hold note inline under the Status tag in the desktop table column.
   Truncated to a single line; full text in the tooltip on hover. */
.on-hold-note {
    margin-top: 4px;
    font-size: 12px;
    color: #a0522d;
    line-height: 1.4;
    display: flex;
    align-items: flex-start;
    gap: 4px;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: help;
    i { flex-shrink: 0; margin-top: 2px; }
}
/* Card variant — same colour, but wraps so the full note shows */
.on-hold-note-card {
    color: #a0522d !important;
    background: #fdf6f0;
    border-left: 2px solid #a0522d;
    padding: 6px 8px;
    border-radius: 4px;
    margin-top: 4px;
    span { white-space: normal !important; overflow: visible !important; }
    i { color: #a0522d !important; }
}
</style>
