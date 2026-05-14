<template>
    <div class="app-container tree-sidebar-manage-wrap">
        <tree-panel title="Category" :tree-data="treeData" search-placeholder="Please Enter Categiry"
            storage-key="dept-sidebar-width" :defaultExpandAll="true" ref="deptTreeRef" @node-click="handleNodeClick" />
        <div class="tree-sidebar-content">
            <div class="content-inner">
                <el-form :model="queryParams" ref="queryForm" size="small" :inline="true">
                    <el-form-item label="SKU" prop="sku">
                        <el-input v-model="queryParams.sku" placeholder="Please Enter SKU" clearable
                            style="width: 240px" @keyup.enter.native="handleQuery" />
                    </el-form-item>
                    <el-form-item label="Product Name" prop="productName">
                        <el-input v-model="queryParams.productName" placeholder="Please Enter Product Name" clearable
                            style="width: 240px" @keyup.enter.native="handleQuery" />
                    </el-form-item>
                    <el-form-item>
                        <el-button type="primary" icon="el-icon-search" size="mini"
                            @click="handleQuery">Search</el-button>
                        <el-button icon="el-icon-refresh" size="mini" @click="resetQuery">Reset</el-button>
                    </el-form-item>
                </el-form>

                <el-row :gutter="10" class="mb8">
                    <!-- <el-col :span="1.5">
                        <el-dropdown trigger="click" @command="handleFilterPurchases">

                            <el-button type="primary" :plain="!applyPurchaseFilter" size="mini">Highlight Understocked
                                <i class="el-icon-arrow-down el-icon--right"></i>
                            </el-button>


                            <el-dropdown-menu slot="dropdown">
                                <el-dropdown-item  command="air">Air shipping</el-dropdown-item>
                                <el-dropdown-item  command="sea">Sea shipping</el-dropdown-item>
                            </el-dropdown-menu>

                        </el-dropdown>

                    </el-col> -->
                    <el-col :span="1.5">
                        <el-button type="success" plain icon="el-icon-download" size="mini" @click="handleExport">Export
                            {{
                                multipleSelection.length > 0 ? `${multipleSelection.length} Selection` : 'Full List'
                            }}</el-button>
                    </el-col>
                    <el-col :span="1.5" v-show="multipleSelection.length > 0">
                        <el-button type="info" plain icon="el-icon-close" size="mini"
                            @click="() => { $refs.table.clearSelection() }">Clear Selection</el-button>
                    </el-col>
                </el-row>

                <el-table v-loading="loading" :data="showProductList" @selection-change="handleSelectionChange"
                    @sort-change="handleSorting" ref="table" empty-text="No Data" stripe border row-key="id">
                    <el-table-column type="selection" width="50" align="center" :reserve-selection="true" />
                    <el-table-column label="SKU" align="center" key="sku" width="150" prop="sku" />
                    <el-table-column label="Product Name" align="center" key="productName" min-width="250"
                        sortable="custom" prop="productName" :show-overflow-tooltip="true">
                    </el-table-column>
                    <el-table-column label="Location" align="center" key="location" width="150" prop="location"
                        :show-overflow-tooltip="true" />
                    <el-table-column label="Current Stock" align="center" key="stock" prop="stock" width="140"
                        sortable="custom" :show-overflow-tooltip="true" />

                    <el-table-column align="center" key="sales30Day" prop="sales30Day" width="170"
                        :show-overflow-tooltip="true">
                        <template #header>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span>Sales</span>

                                <el-select v-model="duration" placeholder="Filter" size="mini" style="width:60px">
                                    <el-option label="15" :value="15" />
                                    <el-option label="30" :value="30" />
                                    <el-option label="45" :value="45" />
                                    <el-option label="60" :value="60" />
                                    <el-option label="90" :value="90" />

                                </el-select>
                                days
                            </div>
                        </template>
                        <template slot-scope="scope">
                            <i v-if="salesLoading" class="el-icon-loading"></i>
                            <div class="stock-cell" v-else>
                                <div class="sales-total">
                                    {{ Number(scope.row.zohoSales || 0) + Number(scope.row.offlineSales || 0) }}
                                </div>

                                <div class="sales-breakdown">
                                    <span>Zoho: {{ scope.row.zohoSales || 0 }}</span>
                                    <span>InFlow: {{ scope.row.offlineSales || 0 }}</span>
                                </div>
                            </div>
                        </template>
                    </el-table-column>

                    <el-table-column label="Operation" align="center" width="160"
                        class-name="small-padding fixed-width">
                        <template slot-scope="scope" v-if="scope.row.userId !== 1">
                            <el-button size="mini" type="text" icon="el-icon-edit"
                                @click="handleGetProductDetail(scope.row.id)">View Detail</el-button>
                            <!-- <el-button size="mini" type="text" icon="el-icon-delete" @click="handleDelete(scope.row)" v-hasPermi="['system:user:remove']">删除</el-button>
              <el-dropdown size="mini" @command="(command) => handleCommand(command, scope.row)" v-hasPermi="['system:user:resetPwd', 'system:user:edit']">
                <el-button size="mini" type="text" icon="el-icon-d-arrow-right">更多</el-button>
                <el-dropdown-menu slot="dropdown">
                  <el-dropdown-item command="handleResetPwd" icon="el-icon-key" v-hasPermi="['system:user:resetPwd']">重置密码</el-dropdown-item>
                  <el-dropdown-item command="handleAuthRole" icon="el-icon-circle-check" v-hasPermi="['system:user:edit']">分配角色</el-dropdown-item>
                </el-dropdown-menu>
              </el-dropdown> -->
                        </template>
                    </el-table-column>
                </el-table>
                <pagination v-show="total > 0" :total="total" :page.sync="queryParams.pageNum"
                    :limit.sync="queryParams.pageSize" @pagination="handlePagination" prev-text="Prev"
                    next-text="Next" />
            </div>
        </div>
        <ProductDetailDialog :open.sync="open" :product="product"></ProductDetailDialog>
    </div>
</template>

<script>
import * as XLSX from 'xlsx-js-style'
import TreePanel from "@/components/TreePanel"
import { getCurrentStock, getSalesTotal } from "../../api/zoho/stockMonitoring";
import { getCollectionGroups } from "../../api/zoho/products/collection";
import { getProductDetail } from "../../api/zoho/products/product";
import ProductDetailDialog from "@/components/ProductDetailDialog"
export default {
    name: "StockMonitoring",
    components: { TreePanel, ProductDetailDialog },
    data() {
        return {

            open: false,
            loading: false,
            salesLoading: false,
            total: 0,
            showSearch: true,
            applyPurchaseFilter: false,
            purchaseFilterType: "",
            currentTab: "",
            duration: 30,
            treeData: [],
            currentCollection: "",
            queryParams: {
                pageNum: 1,
                pageSize: 20,
                sku: undefined,
                productName: undefined,
            },
            productList: [],
            showProductList: [],
            product: {},
            multipleSelection: [],
        }
    },
    created() {

        this.getCollectionGroup()
    },
    watch: {
        duration() {
            this.handleGetSalesTotal()
        }
    },
    methods: {
        handleGetProductDetail(id) {
            this.loading = true
            const that = this
            getProductDetail(id).then(res => {
                that.product = res
                that.open = true
                that.loading = false
            })
        },
        getCollectionGroup() {
            getCollectionGroups().then(res => {
                const groups = res.data || []

                const buildTree = categories => {
                    return categories.map(category => {
                        const node = {
                            label: category.title,
                            children: []
                        }

                        const collectionChildren = (category.collections || []).map(item => ({
                            label: item.title,
                            value: item._id
                        }))

                        const subCategoryChildren = buildTree(category.children || [])

                        node.children = [
                            ...collectionChildren,
                            ...subCategoryChildren
                        ]

                        return node
                    })
                }

                const findFirstCollectionId = categories => {
                    for (const category of categories) {
                        if (category.collections && category.collections.length > 0) {
                            return category.collections[0]._id
                        }

                        if (category.children && category.children.length > 0) {
                            const found = findFirstCollectionId(category.children)

                            if (found) {
                                return found
                            }
                        }
                    }

                    return ''
                }

                this.treeData = buildTree(groups)

                this.currentCollection = this.$route.query.collection ? this.$route.query.collection : findFirstCollectionId(groups)
                this.$router.replace({
                    query: {
                        collection: this.currentCollection
                    }
                })
                this.$nextTick(() => {
                    this.getList()
                })
            })
        },
        handleNodeClick(data) {
            if (!data.children) {
                this.currentTab = data.label
                this.currentCollection = data.value
                this.queryParams = {
                    pageNum: 1,
                    pageSize: 20,
                    sku: undefined,
                    productName: undefined,
                },
                    this.$router.replace({
                        query: {
                            collection: data.value
                        }
                    })
                this.$nextTick(() => {
                    this.$refs.table.clearSort()
                    this.clearSelection()
                    this.getList()
                })
            }
        },
        handleSelectionChange(val) {
            this.multipleSelection = val;
        },
        clearSelection() {
            this.multipleSelection = []

            this.$nextTick(() => {
                this.$refs.productTable && this.$refs.productTable.clearSelection()
            })
        },
        handleGetSalesTotal() {
            const that = this
            that.salesLoading = true
            let itemIds = []
            if (that.productList.length > 300) {
                itemIds = that.showProductList.map(product => product.id)
            } else {
                itemIds = that.productList.map(product => product.id)
            }

            getSalesTotal({ itemIds: itemIds, duration: that.duration }).then(resp => {

                const salesMap = Object.fromEntries(
                    resp.result.map(item => [
                        item.id,
                        {
                            zohoSales: item.zohoSales || 0,
                            offlineSales: item.offlineSales || 0,
                        }
                    ])
                );

                that.showProductList = that.showProductList.map(item => {
                    const sales = salesMap[item.id] || {
                        zohoSales: 0,
                        offlineSales: 0,
                    };

                    return {
                        ...item,
                        zohoSales: sales.zohoSales,
                        offlineSales: sales.offlineSales,
                    };
                });

                that.productList = that.productList.map(item => {
                    const sales = salesMap[item.id] || {
                        zohoSales: 0,
                        offlineSales: 0,
                    };

                    return {
                        ...item,
                        zohoSales: sales.zohoSales,
                        offlineSales: sales.offlineSales,
                    };
                });

                that.salesLoading = false;

            }).catch(err => {
                that.salesLoading = false
            })
        },
        getList() {
            const that = this
            this.loading = true
            const page = this.queryParams.pageNum
            const pageSize = this.queryParams.pageSize
            getCurrentStock({ collection: that.currentCollection }).then(resp => {
                that.productList = resp
                that.total = resp.length
                that.showProductList = resp.slice(
                    (page - 1) * pageSize,
                    page * pageSize
                )
                that.loading = false
                that.$nextTick(() => {
                    that.handleGetSalesTotal()
                })
            }).catch(err => {
                that.loading = false
            })
        },
        handleFilterPurchases(type) {
            this.duration = 60
            this.applyPurchaseFilter = true
            this.purchaseFilterType = type
        },
        handlePagination() {
            const that = this
            const page = this.queryParams.pageNum
            const pageSize = this.queryParams.pageSize
            this.showProductList = this.productList.slice(
                (page - 1) * pageSize,
                page * pageSize
            )
            this.$nextTick(() => {
                that.productList.length > 300 && that.handleGetSalesTotal()
            })
        },
        handleSorting({ prop, order }) {
            if (!order) {
                this.queryParams.pageNum = 1
                this.handlePagination()
                return
            }

            this.productList.sort((a, b) => {
                let aValue
                let bValue

                if (prop === 'stock') {
                    aValue = Number(a.stock || 0)
                    bValue = Number(b.stock || 0)
                } else {
                    aValue = String(a[prop] || '').toLowerCase()
                    bValue = String(b[prop] || '').toLowerCase()
                }

                if (aValue > bValue) return order === 'ascending' ? 1 : -1
                if (aValue < bValue) return order === 'ascending' ? -1 : 1

                return 0
            })

            this.queryParams.pageNum = 1

            this.handlePagination()
        },
        handleExport() {
            const exportList = this.multipleSelection.length > 0
                ? this.multipleSelection
                : this.productList

            if (!exportList.length) {
                this.$message.warning('No data to export')
                return
            }

            const data = exportList.map(item => ({
                SKU: item.sku || '',
                'Product Name': item.productName || '',
                Location: item.location || '',
                'Current Stock': item.stock || 0,
                [`Total Sales (${this.duration} Days)`]: Number(item.zohoSales || 0) + Number(item.offlineSales || 0),
                'Zoho': item.zohoSales || 0,
                'InFlow': item.offlineSales || 0,
            }))

            const worksheet = XLSX.utils.json_to_sheet(data)

            // Header style
            const headerStyle = {
                font: {
                    bold: true,
                    color: { rgb: 'FFFFFF' },
                    sz: 12
                },
                fill: {
                    fgColor: { rgb: '409EFF' }
                },
                alignment: {
                    horizontal: 'center',
                    vertical: 'center'
                },
                border: {
                    top: { style: 'thin', color: { rgb: 'DCDCDC' } },
                    bottom: { style: 'thin', color: { rgb: 'DCDCDC' } },
                    left: { style: 'thin', color: { rgb: 'DCDCDC' } },
                    right: { style: 'thin', color: { rgb: 'DCDCDC' } },
                }
            }

            // Apply style to first row
            const range = XLSX.utils.decode_range(worksheet['!ref'])

            for (let col = range.s.c; col <= range.e.c; col++) {
                const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })

                if (worksheet[cellAddress]) {
                    worksheet[cellAddress].s = headerStyle
                }
            }

            // Column widths
            worksheet['!cols'] = [
                { wch: 20 },
                { wch: 60 },
                { wch: 20 },
                { wch: 15 },
                { wch: 15 },
                { wch: 15 },
                { wch: 15 },
            ]

            const workbook = XLSX.utils.book_new()

            XLSX.utils.book_append_sheet(
                workbook,
                worksheet,
                'Stock Monitoring'
            )
            const today = new Date().toISOString().split('T')[0]

            const fileName = `${this.currentTab || 'stock-monitoring'}_${today}.xlsx`
            XLSX.writeFile(workbook, fileName)
        },
        handleQuery() {
            const { sku, productName } = this.queryParams

            const filteredList = this.productList.filter(item => {
                const matchSku = !sku || String(item.sku || '')
                    .toLowerCase()
                    .includes(String(sku).toLowerCase())

                const matchProductName = !productName || String(item.productName || '')
                    .toLowerCase()
                    .includes(String(productName).toLowerCase())

                return matchSku && matchProductName
            })

            this.queryParams.pageNum = 1
            this.total = filteredList.length

            this.showProductList = filteredList.slice(
                0,
                this.queryParams.pageSize
            )
        },
        resetQuery() {
            this.queryParams = {
                pageNum: 1,
                pageSize: 20,
                sku: undefined,
                productName: undefined,
            }

            this.total = this.productList.length

            this.showProductList = this.productList.slice(
                0,
                this.queryParams.pageSize
            )
        }
    }
}
</script>

<style scoped>
.app-container {
    height: 100%;
}

.content-inner {
    /* display: flex; */
    /* flex-direction: column; */
}

.tree-sidebar-content>>>.el-table {
    overflow-y: scroll;
    position: relative;
}

.tree-sidebar-content>>>.el-table__header-wrapper {
    position: sticky;
    top: 0;
    z-index: 999;
}

.sales-cell {
    padding: 6px 0;
    text-align: center;
}

.sales-total {
    font-size: 20px;
    font-weight: 700;
    color: #303133;
    line-height: 1.2;
}

.sales-breakdown {
    margin-top: 4px;
    display: flex;
    justify-content: center;
    gap: 8px;
    font-size: 12px;
    color: #909399;
    white-space: nowrap;
}

.sales-breakdown span {
    background: #f5f7fa;
    border: 1px solid #ebeef5;
    border-radius: 4px;
    padding: 2px 6px;
}

.el-dropdown {
    vertical-align: top;
}

.el-dropdown+.el-dropdown {
    margin-left: 15px;
}

.el-icon-arrow-down {
    font-size: 12px;
}
</style>