<template>
    <div class="app-container tree-sidebar-manage-wrap">
        <tree-panel title="Category" :tree-data="treeData" search-placeholder="Please Enter Categiry"
            storage-key="dept-sidebar-width" :defaultExpandAll="true" ref="deptTreeRef"
            @node-click="handleNodeClick" />
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
                    <!-- <el-form-item label="状态" prop="status">
            <el-select v-model="queryParams.status" placeholder="用户状态" clearable style="width: 240px">
              <el-option v-for="dict in dict.type.sys_normal_disable" :key="dict.value" :label="dict.label" :value="dict.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="创建时间">
            <el-date-picker v-model="dateRange" style="width: 240px" value-format="yyyy-MM-dd" type="daterange" range-separator="-" start-placeholder="开始日期" end-placeholder="结束日期"></el-date-picker>
          </el-form-item> -->
                    <el-form-item>
                        <el-button type="primary" icon="el-icon-search" size="mini"
                            @click="handleQuery">Search</el-button>
                        <el-button icon="el-icon-refresh" size="mini" @click="resetQuery">Reset</el-button>
                    </el-form-item>
                </el-form>
                <el-table v-loading="loading" :data="productList" @selection-change="handleSelectionChange"
                    empty-text="No Data">
                    <el-table-column type="selection" width="50" align="center" />
                    <el-table-column label="SKU" align="center" key="sku" prop="sku" />
                    <el-table-column label="Product Name" align="center" key="productName" prop="productName"
                        :show-overflow-tooltip="true">
                    </el-table-column>
                    <el-table-column label="Location" align="center" key="location" prop="location"
                        :show-overflow-tooltip="true" />
                    <el-table-column label="Stock" align="center" key="stock" prop="stock"
                        :show-overflow-tooltip="true" />

                    <el-table-column label="Operation" align="center" width="160"
                        class-name="small-padding fixed-width">
                        <template slot-scope="scope" v-if="scope.row.userId !== 1">
                            <el-button size="mini" type="text" icon="el-icon-edit">View Detail</el-button>
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
                <pagination v-show="total > 0" :total="total" :page.sync="queryParams.pageNum" layout="prev,pager,next"
                    :limit.sync="queryParams.pageSize" @pagination="getList" prev-text="Prev" next-text="Next" />
            </div>
        </div>
    </div>
</template>

<script>
import TreePanel from "@/components/TreePanel"

export default {
    name: "StockMonitoring",
    components: { TreePanel },
    data() {
        return {
            loading: false,
            total: 20,
           showSearch: true,
            currentTab: "",
            treeData: [
                {
                    label: "Screen",
                    children: [{
                        label: "iPad Screen"
                    }, {
                        label: "Macbook Screen"
                    }, {
                        label: "iPhone Screen", children: [
                            {
                                label: "JK+ Screen"
                            }, {
                                label: "JK Screen"
                            }, {
                                label: "IMB Soft Oled"
                            }
                        ]
                    }, {
                        label: "Samsung Screen", children: [
                            {
                                label: "Aftermarket Screen"
                            }, {
                                label: "IMB Screen"
                            }
                        ]
                    }]
                }, {
                    label: "Battery",
                    children: [{
                        label: "iPhone Battery"
                    }, {
                        label: "Samsung Battery"
                    }, {
                        label: "Other Battery"
                    },]
                }
                , {
                    label: "Vendor",
                    children: [{
                        label: "IMB-P01 CNY"
                    }]
                }
            ],
 
            queryParams: {
                pageNum: 1,
                pageSize: 10,

                sku: undefined,
                productName: undefined,

            },
            productList: []
        }
    },
    methods: {
        handleNodeClick(data) {
            if (!data.children) this.currentTab = data.label
        },
        handleSelectionChange() { },
        resetQuery() {
            this.queryParams = {
                pageNum: 1,
                pageSize: 10,
                sku: undefined,
                productName: undefined,
            }
        },
        getList() { },
        handleQuery() { }
    }
}
</script>

<style scoped></style>