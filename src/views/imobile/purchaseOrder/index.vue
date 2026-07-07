<template>
    <div class="po-page">
        <tree-panel
            ref="treeRef"
            :tree-data="treeData"
            title="Purchase Order"
            title-icon-class="el-icon-shopping-bag-1"
            node-key="id"
            :default-expand-all="true"
            :show-search="false"
            @node-click="onNodeClick"
        >
            <template #node="{ data }">
                <span class="po-node">
                    <i :class="data.id === 'root' ? 'el-icon-notebook-2' : 'el-icon-document'" class="po-node-icon" />
                    <span class="po-node-label" :title="data.label">{{ data.label }}</span>
                    <span v-if="data.count != null" class="po-node-count">{{ data.count }}</span>
                </span>
            </template>
        </tree-panel>

        <div class="po-main">
            <div class="po-toolbar">
                <span class="po-title"><i class="el-icon-tickets" /> {{ activeTitle || 'Purchase Order' }}</span>
                <span v-if="activeTitle" class="po-meta">{{ filteredRows.length.toLocaleString() }} rows</span>
                <span class="po-spacer" />
                <el-checkbox
                    v-if="activeTitle && receivedDateCol !== -1"
                    v-model="onlyUnreceived"
                    class="po-toggle"
                    @change="page = 1"
                >Not-yet-received only</el-checkbox>
                <el-input
                    v-if="activeTitle"
                    v-model="search"
                    size="small"
                    clearable
                    prefix-icon="el-icon-search"
                    placeholder="Filter rows…"
                    class="po-search"
                    @input="page = 1"
                />
                <el-button size="small" icon="el-icon-refresh" :loading="refreshing" @click="onRefresh">Refresh</el-button>
            </div>

            <el-table
                v-loading="loading"
                :element-loading-text="loadingText"
                :data="pagedRows"
                border
                size="mini"
                height="calc(100vh - 220px)"
                class="po-table"
            >
                <el-table-column type="index" :index="indexBase" width="52" fixed align="center" />
                <el-table-column
                    v-for="(col, i) in columns"
                    :key="i"
                    :prop="'c' + i"
                    :label="col || ('Col ' + (i + 1))"
                    :min-width="colWidth(col)"
                    show-overflow-tooltip
                />
                <template slot="empty">
                    <span class="po-empty">{{ activeTitle ? 'No rows in this tab.' : 'Pick a tab on the left to load its data.' }}</span>
                </template>
            </el-table>

            <div class="po-pager">
                <el-pagination
                    background
                    layout="total, sizes, prev, pager, next, jumper"
                    :total="filteredRows.length"
                    :page-size="pageSize"
                    :page-sizes="[50, 100, 200, 500]"
                    :current-page="page"
                    @current-change="p => page = p"
                    @size-change="onSizeChange"
                />
            </div>
        </div>
    </div>
</template>

<script>
import TreePanel from '@/components/TreePanel'
import { getPoTabs, getPoTab, refreshPo } from '@/api/purchaseOrder'

export default {
    name: 'ImobilePurchaseOrder',
    components: { TreePanel },
    data() {
        return {
            tabs: [],
            activeTitle: '',
            columns: [],
            allRows: [],
            search: '',
            onlyUnreceived: true,
            page: 1,
            pageSize: 100,
            loading: false,
            loadingText: 'Loading…',
            refreshing: false
        }
    },
    computed: {
        treeData() {
            return [{
                id: 'root',
                label: 'Purchase Order',
                children: this.tabs.map(t => ({
                    id: t.sheetId,
                    label: t.title,
                    count: t.rowCount != null ? t.rowCount : null
                }))
            }]
        },
        // Index of the received-date column (收到日期 / 收货日期); -1 if absent.
        receivedDateCol() {
            for (let i = 0; i < this.columns.length; i++) {
                const h = String(this.columns[i] || '')
                if (h.indexOf('收到日期') !== -1 || h.indexOf('收货日期') !== -1) return i
            }
            return -1
        },
        filteredRows() {
            let rows = this.allRows
            // Only not-yet-received: keep rows whose received-date cell is empty.
            if (this.onlyUnreceived && this.receivedDateCol !== -1) {
                const key = 'c' + this.receivedDateCol
                rows = rows.filter(r => String(r[key] || '').trim() === '')
            }
            const q = (this.search || '').trim().toLowerCase()
            if (q) {
                const n = this.columns.length
                rows = rows.filter(r => {
                    for (let i = 0; i < n; i++) {
                        if (String(r['c' + i] || '').toLowerCase().indexOf(q) !== -1) return true
                    }
                    return false
                })
            }
            return rows
        },
        pagedRows() {
            const start = (this.page - 1) * this.pageSize
            return this.filteredRows.slice(start, start + this.pageSize)
        },
        indexBase() {
            return (this.page - 1) * this.pageSize + 1
        }
    },
    created() {
        this.loadTabs()
    },
    methods: {
        async loadTabs() {
            try {
                const res = await getPoTabs()
                if (!res || res.success === false) throw new Error((res && res.message) || 'Failed to load tabs')
                this.tabs = res.tabs || []
                if (this.tabs.length) {
                    const first = this.tabs[0]
                    this.$nextTick(() => {
                        if (this.$refs.treeRef && this.$refs.treeRef.setCurrentKey) {
                            this.$refs.treeRef.setCurrentKey(first.sheetId)
                        }
                    })
                    this.loadTab(first.title)
                }
            } catch (e) {
                console.error('PO tabs load failed:', e)
                this.$message.error(this.msg(e, 'Failed to load tabs'))
            }
        },
        onNodeClick(data) {
            if (!data || data.id === 'root') return
            if (data.label === this.activeTitle) return
            this.loadTab(data.label)
        },
        async loadTab(title) {
            this.loading = true
            this.loadingText = 'Loading from Tencent Docs… (first load exports the sheet, ~10s)'
            try {
                const res = await getPoTab(title)
                if (!res || res.success === false) throw new Error((res && res.message) || 'Failed to load tab')
                const header = res.columns || []
                const rows = res.rows || []
                // Some data rows can be wider than the (trailing-trimmed) header,
                // so size the columns to the widest of header + a sample of rows.
                let nCols = header.length
                for (let i = 0; i < rows.length && i < 200; i++) {
                    if (rows[i].length > nCols) nCols = rows[i].length
                }
                nCols = Math.max(nCols, 1)
                this.columns = Array.from({ length: nCols }, (_, i) => (header[i] != null ? String(header[i]) : ''))
                this.allRows = rows.map(r => {
                    const o = {}
                    for (let i = 0; i < nCols; i++) o['c' + i] = r[i] != null ? r[i] : ''
                    return o
                })
                this.activeTitle = title
                // Reflect the real (blank-filtered) data count in the tree node.
                const tabMeta = this.tabs.find(t => t.title === title)
                if (tabMeta) this.$set(tabMeta, 'rowCount', this.allRows.length)
                this.page = 1
                this.search = ''
            } catch (e) {
                console.error('PO tab load failed:', e)
                this.$message.error(this.msg(e, 'Failed to load tab'))
            } finally {
                this.loading = false
            }
        },
        async onRefresh() {
            this.refreshing = true
            try {
                const res = await refreshPo()
                if (!res || res.success === false) throw new Error((res && res.message) || 'Refresh failed')
                this.$message.success('Refreshed from Tencent Docs')
                if (this.activeTitle) await this.loadTab(this.activeTitle)
            } catch (e) {
                console.error('PO refresh failed:', e)
                this.$message.error(this.msg(e, 'Refresh failed'))
            } finally {
                this.refreshing = false
            }
        },
        onSizeChange(size) {
            this.pageSize = size
            this.page = 1
        },
        colWidth(col) {
            const h = String(col || '')
            // 品名 (product name) is long free text — give it plenty of room.
            if (h.indexOf('品名') !== -1) return 380
            const len = h.length
            return Math.min(Math.max(90, len * 12 + 24), 320)
        },
        msg(e, fallback) {
            return (e.response && e.response.data && e.response.data.message) || e.message || fallback
        }
    }
}
</script>

<style lang="scss" scoped>
.po-page {
    display: flex;
    height: calc(100vh - 84px);
    background: #fff;
}
.po-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding: 12px 14px;
}
.po-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
}
.po-title {
    font-size: 15px;
    font-weight: 600;
    color: #303133;
    white-space: nowrap;
    i { color: #409eff; margin-right: 4px; }
}
.po-meta { font-size: 12px; color: #909399; }
.po-spacer { flex: 1; }
.po-search { width: 220px; max-width: 40vw; }
.po-table { flex: 1; }
.po-pager { margin-top: 10px; text-align: right; }
.po-empty { color: #909399; font-size: 13px; }

.po-node {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 13px;
    overflow: hidden;
    width: 100%;
}
.po-node-icon { color: #E6A23C; flex-shrink: 0; }
.po-node-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.po-node-count {
    flex-shrink: 0;
    margin-left: auto;
    font-size: 11px;
    color: #909399;
    background: #f4f4f5;
    padding: 0 6px;
    border-radius: 8px;
}
</style>
