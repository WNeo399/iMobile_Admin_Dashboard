<template>
    <div class="recent-cases">
        <el-table :data="rows" size="small" stripe :empty-text="emptyText">
            <el-table-column label="Case" min-width="160">
                <template slot-scope="scope">
                    <a class="case-link" @click="openCase(scope.row)">
                        {{ scope.row.serviceRequestId || scope.row.caseId || '—' }}
                    </a>
                </template>
            </el-table-column>

            <el-table-column v-if="showShop" label="Shop" prop="shopName" min-width="140" show-overflow-tooltip />

            <el-table-column label="Customer" min-width="160" show-overflow-tooltip>
                <template slot-scope="scope">
                    {{ customerName(scope.row) }}
                </template>
            </el-table-column>

            <el-table-column label="Device" min-width="160" show-overflow-tooltip>
                <template slot-scope="scope">
                    {{ (scope.row.device && (scope.row.device.modelName || scope.row.device.description)) || '—' }}
                </template>
            </el-table-column>

            <el-table-column label="Status" width="160">
                <template slot-scope="scope">
                    <el-tag size="mini" :type="statusTag(scope.row.status)">
                        {{ statusLabel(scope.row.status) }}
                    </el-tag>
                </template>
            </el-table-column>

            <el-table-column label="Created" width="160">
                <template slot-scope="scope">
                    {{ formatDate(scope.row.createdAt) }}
                </template>
            </el-table-column>
        </el-table>
    </div>
</template>

<script>
import { statusLabel, statusTag } from './caseStatus'

// Compact recent-cases table reused by Admin / TechElite / Shop Owner dashboards.
// Clicking the case id navigates to the Cases page with ?openCase=<id>, which
// pops the existing detail dialog.
export default {
    name: 'RecentCasesTable',
    props: {
        rows: { type: Array, default: () => [] },
        showShop: { type: Boolean, default: true },
        emptyText: { type: String, default: 'No cases yet' }
    },
    methods: {
        statusLabel, statusTag,
        customerName(row) {
            const c = row.customer || {}
            const n = [c.firstName, c.lastName].filter(Boolean).join(' ')
            return n || '—'
        },
        formatDate(d) {
            if (!d) return '—'
            const date = new Date(d)
            if (isNaN(date.getTime())) return '—'
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        },
        openCase(row) {
            this.$router.push({ path: '/sqt/cases', query: { openCase: row._id } })
        }
    }
}
</script>

<style scoped>
.recent-cases ::v-deep .el-table { border-radius: 8px; }
.case-link { color: #409eff; cursor: pointer; font-weight: 500; }
.case-link:hover { text-decoration: underline; }
</style>
