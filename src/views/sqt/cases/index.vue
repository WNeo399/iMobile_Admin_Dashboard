<template>
    <div class="app-container tree-sidebar-manage-wrap">
        <tree-panel
            title="Status"
            title-icon-class="el-icon-s-flag"
            :tree-data="treeData"
            :default-expand-all="true"
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

        <div class="tree-sidebar-content">
            <div class="content-inner">
                <el-form :model="queryParams" ref="queryForm" size="small" :inline="true">
                    <el-form-item label="Search" prop="search">
                        <el-input
                            v-model="queryParams.search"
                            placeholder="Case ID, name, IMEI, email…"
                            clearable
                            style="width: 260px"
                            @keyup.enter.native="handleQuery"
                        />
                    </el-form-item>
                    <el-form-item label="Shop" prop="shopId">
                        <el-select
                            v-model="queryParams.shopId"
                            placeholder="Any shop"
                            clearable
                            filterable
                            style="width: 220px"
                            @change="handleShopChange"
                        >
                            <el-option
                                v-for="s in shops"
                                :key="s._id"
                                :label="s.storeName"
                                :value="s._id"
                            />
                        </el-select>
                    </el-form-item>
                    <el-form-item>
                        <el-button type="primary" icon="el-icon-search" size="mini" @click="handleQuery">
                            Search
                        </el-button>
                        <el-button icon="el-icon-refresh" size="mini" @click="resetQuery">
                            Reset
                        </el-button>
                    </el-form-item>
                </el-form>

                <el-row :gutter="10" class="mb8">
                    <el-col :span="1.5">
                        <el-button plain icon="el-icon-refresh" size="mini" @click="refreshAll">
                            Refresh
                        </el-button>
                    </el-col>
                </el-row>

                <div class="active-filter" v-if="activeStatus">
                    <el-tag closable size="small" @close="clearStatusFilter">
                        Status: {{ statusLabel(activeStatus) }}
                    </el-tag>
                </div>

                <el-table v-loading="loading" :data="list">
                    <el-table-column label="Case" min-width="170">
                        <template slot-scope="scope">
                            <div>
                                <a class="case-link" @click="openDetail(scope.row)">
                                    Case {{ scope.row.caseId || '—' }}
                                </a>
                                <div style="color: #999; font-size: 12px">
                                    SR {{ scope.row.serviceRequestId || '—' }}
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
                                <div style="color: #999; font-size: 12px">
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
                                <div style="color: #999; font-size: 12px">
                                    IMEI: {{ scope.row.device.imei || '—' }}
                                </div>
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column label="Shop" prop="shopName" min-width="160">
                        <template slot-scope="scope">
                            {{ scope.row.shopName || '—' }}
                        </template>
                    </el-table-column>
                    <el-table-column label="Status" width="160" align="center">
                        <template slot-scope="scope">
                            <el-tag
                                size="mini"
                                :type="badgeType(scope.row.status)"
                                effect="light"
                            >
                                {{ statusLabel(scope.row.status) }}
                            </el-tag>
                        </template>
                    </el-table-column>
                    <el-table-column label="Created" width="150" align="center">
                        <template slot-scope="scope">
                            {{ formatDate(scope.row.createdAt) }}
                        </template>
                    </el-table-column>
                    <el-table-column label="Action" align="center" width="220" class-name="small-padding fixed-width">
                        <template slot-scope="scope">
                            <el-button
                                v-if="scope.row.status === 'pending'"
                                v-hasPermi="['sqt:case:sendParts']"
                                size="mini"
                                type="text"
                                icon="el-icon-box"
                                @click="handleSendParts(scope.row)"
                            >Send Parts</el-button>
                            <el-button
                                v-if="scope.row.status === 'waiting-for-parts'"
                                size="mini"
                                type="text"
                                icon="el-icon-receiving"
                                @click="handlePartsReceived(scope.row)"
                            >Parts Received</el-button>
                            <el-button
                                v-if="scope.row.status === 'parts-arrived'"
                                size="mini"
                                type="text"
                                icon="el-icon-bell"
                                @click="handleCustomerNotified(scope.row)"
                            >Customer Notified</el-button>
                            <el-button
                                v-if="scope.row.status === 'waiting-for-drop-off'"
                                size="mini"
                                type="text"
                                icon="el-icon-setting"
                                @click="handleStartRepair(scope.row)"
                            >Start Repair</el-button>
                            <el-button
                                v-if="scope.row.status === 'repairing'"
                                size="mini"
                                type="text"
                                icon="el-icon-circle-check"
                                @click="handleMarkRepaired(scope.row)"
                            >Mark Repaired</el-button>
                            <el-button
                                v-if="scope.row.status === 'repairing'"
                                size="mini"
                                type="text"
                                icon="el-icon-warning-outline"
                                @click="handleMarkUnrepairable(scope.row)"
                            >Mark Unrepairable</el-button>
                            <el-button
                                v-if="scope.row.status === 'repaired'"
                                size="mini"
                                type="text"
                                icon="el-icon-finished"
                                @click="handleMarkCollected(scope.row)"
                            >Mark Collected</el-button>
                            <el-button
                                v-if="scope.row.status === 'unrepairable'"
                                v-hasPermi="['sqt:case:markBer']"
                                size="mini"
                                type="text"
                                icon="el-icon-refresh-right"
                                @click="handleMarkBer(scope.row)"
                            >Mark BER</el-button>
                            <el-button
                                v-if="scope.row.status === 'repaired-and-collected'"
                                v-hasPermi="['sqt:case:selectParts']"
                                size="mini"
                                type="text"
                                icon="el-icon-shopping-cart-2"
                                @click="handleSelectParts(scope.row)"
                            >Select Parts</el-button>
                            <el-button
                                v-hasPermi="['sqt:case:changeStatus']"
                                size="mini"
                                type="text"
                                icon="el-icon-sort"
                                @click="handleChangeStatus(scope.row)"
                            >Change Status</el-button>
                            <el-button size="mini" type="text" icon="el-icon-chat-line-square"
                                @click="handleNotes(scope.row)">
                                Notes
                                <span v-if="scope.row.notes && scope.row.notes.length"
                                    style="color: #909399">({{ scope.row.notes.length }})</span>
                            </el-button>
                        </template>
                    </el-table-column>
                </el-table>

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

                <el-table
                    :data="selectedParts"
                    empty-text="No parts added yet. Use the search above to add parts."
                    size="small"
                    border
                    class="send-parts-table"
                >
                    <el-table-column label="Product" min-width="360">
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
import { listCases, getCaseCounts, addCaseNote, updateCaseDevice, sendCaseParts, markPartsReceived, changeCaseStatus, markCaseRepaired, selectCaseParts } from '@/api/sqt/cases'
import { listShops } from '@/api/sqt/shops'
import { listParts, createPart } from '@/api/sqt/parts'
import { listModels } from '@/api/sqt/models'
import { searchProducts } from '@/api/zoho/products/product'

const STATUS_META = [
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

const LABOR_COST = 70
const GST_RATE = 0.1

export default {
    name: 'SqtCases',
    components: { TreePanel },
    data() {
        return {
            loading: false,
            list: [],
            total: 0,
            counts: { total: 0, byStatus: {} },
            activeStatus: null,
            queryParams: { page: 1, pageSize: 20, search: '', shopId: '' },
            shops: [],

            sendPartsDialogOpen: false,
            sendPartsCase: null,
            partsSearchKeyword: '',
            selectedParts: [],
            sendPartsSubmitting: false,

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
            statusOptions: STATUS_META.map(s => ({ value: s.value, label: s.label })),

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
        canViewPrice() {
            const roles = this.$store.getters.roles || []
            return roles.includes('admin') || roles.includes('techelite-admin')
        },
        devicePurchasePrice() {
            const p = this.sendPartsCase && this.sendPartsCase.device && this.sendPartsCase.device.purchasePrice
            return Number(p) > 0 ? Number(p) : 0
        },
        treeData() {
            const byStatus = this.counts.byStatus || {}
            return [
                {
                    id: 'all',
                    label: 'All Cases',
                    count: this.counts.total || 0,
                    children: STATUS_META.map(s => ({
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
        // Only non-genuine parts can be selected for a case
        nonGenuineParts() {
            return this.availableParts.filter(p => !p.genuine)
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
        this.refreshAll()
        this.loadShops()
    },
    methods: {
        async refreshAll() {
            await Promise.all([this.getList(), this.loadCounts()])
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
        onProductSelected(item) {
            if (!item) return
            const key = item.product_id || item.sku || item.name
            const existing = this.selectedParts.find(
                p => (p.product_id || p.sku || p.name) === key
            )
            if (existing) {
                this.$message.info(`"${item.name}" is already in the list`)
                this.partsSearchKeyword = ''
                return
            }
            this.selectedParts.push({
                product_id: item.product_id || '',
                name: item.name || '',
                sku: item.sku || '',
                raw: item // keep the original Zoho payload for the eventual submit
            })
            // Clear input so the user can search the next part
            this.partsSearchKeyword = ''
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
                const res = await sendCaseParts(this.sendPartsCase._id, payload)
                const soNumber = res && res.data && res.data.salesOrderNumber
                this.$message.success(
                    soNumber
                        ? `Sales order ${soNumber} created — case moved to Waiting for Parts`
                        : 'Order created — case updated'
                )
                // Reflect the updated case in the table immediately, then refresh counts/list
                const updatedCase = res && res.data && res.data.case
                if (updatedCase) {
                    const idx = this.list.findIndex(c => c._id === updatedCase._id)
                    if (idx !== -1) this.$set(this.list, idx, updatedCase)
                }
                this.sendPartsDialogOpen = false
                this.refreshAll()
            } catch (e) {
                console.error(e)
                const msg = (e.response && e.response.data && e.response.data.message) || 'Submit failed'
                this.$message.error(msg)
            } finally {
                this.sendPartsSubmitting = false
            }
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
</style>
