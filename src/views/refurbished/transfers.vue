<template>
    <!-- Refurbished Device → Warehouse → Transfers: the records left when
         devices are moved between our shelves in a batch (Assign To Exyon on
         the Stock page). Each can be printed as a transfer note or
         downloaded as a spreadsheet. -->
    <div class="tr-page app-container">
        <div class="tr-bar">
            <div class="tr-head">
                <div class="tr-title">{{ $tt('Transfers') }}</div>
                <div class="tr-sub">{{ $tp('Devices moved between our shelves in batches — mostly assigned to Exyon') }}</div>
            </div>
            <span class="tr-spacer" />
            <el-select v-model="to" size="small" clearable :placeholder="$tp('All destinations')" class="tr-sel" @change="page = 1; load()">
                <el-option v-for="l in destinations" :key="l" :label="$tenum(l)" :value="l" />
            </el-select>
            <el-input v-model="q" size="small" clearable class="tr-search" prefix-icon="el-icon-search"
                :placeholder="$tp('Transfer no or IMEI')" @input="onSearch" />
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">{{ $tp('Refresh') }}</el-button>
        </div>

        <el-table v-loading="loading" :data="rows" border size="mini"
            :empty-text="$tp('No transfers yet — they are recorded when devices are assigned from the Stock page')">
            <el-table-column :label="$tp('Transfer')" width="110">
                <template slot-scope="s"><el-button type="text" class="tr-link" @click="openDetail(s.row)">{{ s.row.transferNo }}</el-button></template>
            </el-table-column>
            <el-table-column :label="$tp('To')" min-width="150"><template slot-scope="s">{{ $tenum(s.row.to) }}</template></el-table-column>
            <el-table-column :label="$tp('Devices')" width="90" align="center"><template slot-scope="s">{{ s.row.count }}</template></el-table-column>
            <el-table-column :label="$tp('Created')" width="150"><template slot-scope="s">{{ fmt(s.row.createdAt) }}</template></el-table-column>
            <el-table-column :label="$tp('By')" width="130" show-overflow-tooltip><template slot-scope="s">{{ s.row.createdBy || '—' }}</template></el-table-column>
            <el-table-column :label="$tp('Note')" min-width="160" show-overflow-tooltip><template slot-scope="s">{{ s.row.note || '—' }}</template></el-table-column>
            <el-table-column :label="$tp('Actions')" width="200" align="center">
                <template slot-scope="s">
                    <el-button type="text" size="mini" icon="el-icon-view" @click="openDetail(s.row)">{{ $tp('View') }}</el-button>
                    <el-button type="text" size="mini" icon="el-icon-printer" @click="print(s.row)">{{ $tp('Print') }}</el-button>
                    <el-button type="text" size="mini" icon="el-icon-download" @click="download(s.row)">{{ $tp('Download') }}</el-button>
                </template>
            </el-table-column>
        </el-table>
        <el-pagination v-if="total > pageSize" background small class="tr-pager" layout="total, prev, pager, next"
            :total="total" :page-size="pageSize" :current-page="page" @current-change="p => { page = p; load() }" />

        <!-- one transfer in full -->
        <el-dialog :visible.sync="detailVisible" width="900px" top="4vh" custom-class="tr-dialog">
            <div slot="title" class="tr-dlg-title">
                <b>{{ detail ? detail.transferNo : '' }}</b>
                <span v-if="detail" class="tr-dim">{{ $tenum(detail.to) }} · {{ $tp('{n} device(s)', { n: (detail.lines || []).length }) }} · {{ fmt(detail.createdAt) }}<template v-if="detail.createdBy"> · {{ detail.createdBy }}</template></span>
            </div>
            <div v-if="detail && detail.note" class="tr-note">{{ detail.note }}</div>
            <el-table v-if="detail" :data="detail.lines" border size="mini" max-height="520">
                <el-table-column label="#" width="50" align="center"><template slot-scope="s">{{ s.$index + 1 }}</template></el-table-column>
                <el-table-column :label="$tp('IMEI / Serial')" width="160"><template slot-scope="s"><b>{{ s.row.imei || s.row.serialNumber || '—' }}</b></template></el-table-column>
                <el-table-column :label="$tp('Model')" min-width="200" show-overflow-tooltip><template slot-scope="s">{{ [s.row.brand, s.row.model].filter(Boolean).join(' ') || '—' }}</template></el-table-column>
                <el-table-column :label="$tp('Storage')" width="90"><template slot-scope="s">{{ s.row.storage || '—' }}</template></el-table-column>
                <el-table-column :label="$tp('Colour')" width="110"><template slot-scope="s">{{ s.row.color || '—' }}</template></el-table-column>
                <el-table-column :label="$tp('Grade')" width="70" align="center"><template slot-scope="s">{{ s.row.grade || '—' }}</template></el-table-column>
                <el-table-column :label="$tp('From')" width="150"><template slot-scope="s">{{ s.row.from ? $tenum(s.row.from) : '—' }}</template></el-table-column>
            </el-table>
            <span slot="footer">
                <el-button size="small" @click="detailVisible = false">{{ $tp('Close') }}</el-button>
                <el-button size="small" icon="el-icon-download" @click="download(detail)">{{ $tp('Download') }}</el-button>
                <el-button size="small" type="primary" icon="el-icon-printer" @click="print(detail)">{{ $tp('Print') }}</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import { listRefurbTransfers, getRefurbTransfer } from '@/api/refurbished'
import { buildTransferPdf, buildTransferWorkbook, transferFileBase } from '@/utils/refurbTransferPdf'
import * as XLSX from 'xlsx-js-style'

export default {
    name: 'RefurbishedTransfers',
    data() {
        return { loading: false, rows: [], total: 0, page: 1, pageSize: 24, to: '', q: '', timer: null, destinations: [], detail: null, detailVisible: false }
    },
    created() { this.load() },
    beforeDestroy() { clearTimeout(this.timer) },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await listRefurbTransfers({ to: this.to || undefined, q: this.q.trim() || undefined, page: this.page, pageSize: this.pageSize })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.rows || []; this.total = r.total || 0
                if (r.destinations) this.destinations = r.destinations
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load the transfers')))
            } finally { this.loading = false }
        },
        onSearch() { clearTimeout(this.timer); this.timer = setTimeout(() => { this.page = 1; this.load() }, 350) },
        // the list rows carry no lines — fetch the full record once
        async full(row) {
            if (row && row.lines) return row
            const r = await getRefurbTransfer(row._id)
            if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
            return r.transfer
        },
        async openDetail(row) {
            try { this.detail = await this.full(row); this.detailVisible = true } catch (e) { this.$message.error(this.msg(e, this.$tp('Failed to load the transfer'))) }
        },
        async print(row) {
            try {
                const t = await this.full(row)
                const doc = buildTransferPdf(t)
                doc.autoPrint()
                const w = window.open(doc.output('bloburl'))
                if (!w) doc.save(transferFileBase(t) + '.pdf')
            } catch (e) { this.$message.error(this.msg(e, this.$tp('Failed to build the PDF'))) }
        },
        async download(row) {
            try {
                const t = await this.full(row)
                XLSX.writeFile(buildTransferWorkbook(t), transferFileBase(t) + '.xlsx')
            } catch (e) { this.$message.error(this.msg(e, this.$tp('Failed to build the spreadsheet'))) }
        },
        fmt(d) { const x = new Date(d); return isNaN(x) ? '' : x.toLocaleString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Australia/Melbourne' }) },
        msg(e, fallback) { return (e.response && e.response.data && e.response.data.message) || e.message || fallback }
    }
}
</script>

<style lang="scss" scoped>
.tr-page { padding: 14px 16px; }
.tr-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.tr-head { min-width: 0; }
.tr-title { font-size: 17px; font-weight: 600; color: #303133; }
.tr-sub { font-size: 13px; color: #909399; margin-top: 3px; }
.tr-spacer { flex: 1; }
.tr-sel { width: 190px; }
.tr-search { width: 220px; }
.tr-link { padding: 0; font-weight: 600; }
.tr-pager { margin-top: 12px; text-align: right; }
.tr-dlg-title { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; b { font-size: 16px; } }
.tr-dim { font-size: 12px; color: #909399; }
.tr-note { margin-bottom: 10px; padding: 6px 10px; border-radius: 4px; background: #f5f7fa; font-size: 13px; color: #606266; }
@media (max-width: 760px) { .tr-sel, .tr-search { width: 100%; } }
</style>
