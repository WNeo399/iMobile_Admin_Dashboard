<template>
    <!--
        Consignment devices sold but not on an invoice yet, per shop — and
        raising the invoices: one per shop, each billing everything that shop
        has sold and not been invoiced for (Shop Price + 10% GST). Tick the
        shops and "Raise invoices" does them in one go, or raise one shop from
        its row. Used on iMobile Accountant → Dashboard and Consignment →
        Invoices; emits "raised" with the server's answer. `compact` (the
        Dashboard's half-width column) folds the sold dates under the shop and
        the Sub Total / GST under the Total.
    -->
    <div class="cr" v-loading="loading">
        <div class="cr-head">
            <span class="cr-title">{{ title || $tp('Sold, not invoiced yet') }}</span>
            <span v-if="count" class="cr-sum">
                {{ $tp('{n} device(s)', { n: count }) }} · {{ $tp('{n} shop(s)', { n: shops.length }) }} · <b>{{ money(total) }}</b> {{ $tp('inc GST') }}
            </span>
            <span class="cr-spacer" />
            <el-button v-if="shops.length" size="small" type="primary" icon="el-icon-document-add" :disabled="!selected.length" :loading="batching"
                @click="raiseSelected">
                {{ selected.length === shops.length ? $tp('Raise invoices for all shops ({n})', { n: selected.length }) : $tp('Raise invoices ({n} shops)', { n: selected.length }) }}
            </el-button>
        </div>
        <el-table v-if="shops.length" ref="table" :data="shops" size="small" class="cr-table" row-key="shopId" @selection-change="rows => (selected = rows)">
            <el-table-column type="selection" width="44" align="center" />
            <el-table-column type="expand" width="32">
                <template slot-scope="s">
                    <el-table :data="s.row.lines" size="mini" border class="cr-lines">
                        <el-table-column :label="$tp('Sold')" width="110">
                            <template slot-scope="l">{{ fmtDate(l.row.soldAt) }}</template>
                        </el-table-column>
                        <el-table-column :label="$tp('Device')" min-width="240">
                            <template slot-scope="l">{{ l.row.productName }} <el-tag v-if="l.row.grade" size="mini" effect="plain">{{ l.row.grade }}</el-tag></template>
                        </el-table-column>
                        <el-table-column :label="$tp('IMEI / Serial')" width="160">
                            <template slot-scope="l"><span class="cr-mono">{{ l.row.imei }}</span></template>
                        </el-table-column>
                        <el-table-column :label="$tp('Shop Price')" width="110" align="right">
                            <template slot-scope="l">{{ money(l.row.shopPrice) }}</template>
                        </el-table-column>
                    </el-table>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Shop')" prop="shopName" :min-width="compact ? 150 : 130">
                <template slot-scope="s">
                    <div>{{ s.row.shopName }}</div>
                    <div v-if="compact && s.row.sold" class="cr-dim">{{ $tp('sold') }} {{ fmtSpan(s.row.sold.from, s.row.sold.to) }}</div>
                </template>
            </el-table-column>
            <el-table-column :label="$tp('Devices')" prop="count" :width="compact ? 70 : 80" align="center" />
            <el-table-column v-if="!compact" key="sold" :label="$tp('Sold between')" min-width="190">
                <template slot-scope="s">{{ s.row.sold ? fmtSpan(s.row.sold.from, s.row.sold.to) : '—' }}</template>
            </el-table-column>
            <el-table-column v-if="!compact" key="sub" :label="$tp('Sub Total')" width="105" align="right">
                <template slot-scope="s">{{ money(s.row.subTotal) }}</template>
            </el-table-column>
            <el-table-column v-if="!compact" key="gst" :label="$tp('GST')" width="90" align="right">
                <template slot-scope="s">{{ money(s.row.gstAmount) }}</template>
            </el-table-column>
            <el-table-column :label="$tp('Total')" :width="compact ? 135 : 110" align="right">
                <template slot-scope="s">
                    <b>{{ money(s.row.total) }}</b>
                    <div v-if="compact" class="cr-dim">{{ money(s.row.subTotal) }} + {{ money(s.row.gstAmount) }} {{ $tp('GST') }}</div>
                </template>
            </el-table-column>
            <el-table-column :width="compact ? 90 : 130" align="right">
                <template slot-scope="s">
                    <el-button size="mini" plain icon="el-icon-document-add" :loading="raising === s.row.shopId" :disabled="batching" @click="raiseOne(s.row)">{{ $tp('Raise') }}</el-button>
                </template>
            </el-table-column>
        </el-table>
        <div v-else-if="!loading" class="cr-empty">
            <i class="el-icon-circle-check" /> {{ $tp('Nothing to invoice — every sold device is on an invoice.') }}
        </div>
    </div>
</template>

<script>
import { previewConsignInvoices, generateConsignInvoice, generateConsignInvoicesBatch } from '@/api/consignment'

export default {
    name: 'ConsignReadyToInvoice',
    props: {
        title: { type: String, default: '' },
        compact: { type: Boolean, default: false }
    },
    data() {
        return { loading: false, shops: [], count: 0, total: 0, selected: [], raising: null, batching: false }
    },
    created() {
        this.load()
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await previewConsignInvoices()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.shops = r.shops || []
                this.count = r.count || 0
                this.total = r.total || 0
                this.$emit('loaded', { count: this.count, total: this.total, shops: this.shops.length })
                // every shop ticked to start with — "raise them all" is one click
                this.$nextTick(() => {
                    const t = this.$refs.table
                    if (t) this.shops.forEach(s => t.toggleRowSelection(s, true))
                })
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Could not work out what to invoice')))
            } finally {
                this.loading = false
            }
        },
        async raiseSelected() {
            const rows = this.selected
            if (!rows.length) return
            const sum = rows.reduce((t, r) => t + r.total, 0)
            try {
                await this.$confirm(
                    this.$tp('Raise {n} invoice(s) — one per shop ({shops}) — for {d} device(s), {amount} inc GST?', {
                        n: rows.length, shops: rows.map(r => r.shopName).join(', '), d: rows.reduce((t, r) => t + r.count, 0), amount: this.money(sum)
                    }),
                    this.$tp('Raise invoices'), { confirmButtonText: this.$tp('Raise invoices'), cancelButtonText: this.$tp('Cancel'), type: 'info' })
            } catch (e) { return }
            this.batching = true
            try {
                const r = await generateConsignInvoicesBatch(rows.map(x => x.shopId))
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                const nums = (r.invoices || []).map(i => i.number)
                if (nums.length) this.$message.success(this.$tp('{n} invoice(s) raised: {numbers}', { n: nums.length, numbers: nums.join(', ') }))
                else this.$message.info(this.$tp('Nothing to invoice'))
                if (r.failed && r.failed.length) this.$message.warning(this.$tp('Could not raise for: {shops}', { shops: r.failed.join(', ') }))
                this.$emit('raised', r)
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to raise the invoices')))
            } finally {
                this.batching = false
            }
        },
        async raiseOne(row) {
            try {
                await this.$confirm(
                    this.$tp('Raise an invoice to {shop} for {n} device(s) — {amount} inc GST?', { shop: row.shopName, n: row.count, amount: this.money(row.total) }),
                    this.$tp('Raise invoice'), { confirmButtonText: this.$tp('Raise invoice'), cancelButtonText: this.$tp('Cancel'), type: 'info' })
            } catch (e) { return }
            this.raising = row.shopId
            try {
                const r = await generateConsignInvoice(row.shopId)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                if (r.created) this.$message.success(this.$tp('{number} raised', { number: r.invoice.number }))
                else this.$message.info(r.message || this.$tp('Nothing to invoice'))
                this.$emit('raised', { created: r.created ? 1 : 0, invoices: r.created ? [r.invoice] : [] })
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to raise the invoice')))
            } finally {
                this.raising = null
            }
        },
        money(v) {
            if (v == null || v === '') return '—'
            return '$' + Number(v).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        },
        fmtDate(d) {
            if (!d) return '—'
            const x = new Date(d)
            return isNaN(x.getTime()) ? '—' : x.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
        },
        fmtYmd(ymd) {
            const [y, m, d] = String(ymd || '').split('-').map(Number)
            return y ? new Date(y, m - 1, d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
        },
        fmtSpan(from, to) {
            return from === to ? this.fmtYmd(from) : `${this.fmtYmd(from)} – ${this.fmtYmd(to)}`
        },
        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback
        }
    }
}
</script>

<style scoped>
.cr-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.cr-title { font-size: 14px; font-weight: 600; color: #303133; }
.cr-sum { font-size: 13px; color: #606266; }
.cr-sum b { color: #303133; }
.cr-spacer { flex: 1; }
.cr-lines { margin: 0 8px; width: auto; }
.cr-mono { font-family: Consolas, Menlo, monospace; font-size: 12px; }
.cr-dim { font-size: 11px; color: #909399; }
.cr-empty { color: #606266; font-size: 13px; padding: 6px 2px; }
.cr-empty i { color: #67c23a; margin-right: 4px; }
</style>
