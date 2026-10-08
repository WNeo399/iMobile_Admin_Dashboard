<template>
    <!--
        One purchase line as a card — the stage board's cards and the phone
        list of the Purchase Order page (user ask 2026-10-06). The main button
        is the step that moves the line on (the same rules as the table's
        actions); everything else sits under "…". The page runs the actions.
    -->
    <div :class="['oc', { urgent: row.urgent }]">
        <div class="oc-top">
            <el-image v-if="row.images && row.images.length" :src="row.images[0].url" fit="cover" class="oc-img"
                :preview-src-list="row.images.map(i => i.url)" />
            <div v-else-if="placeholder" class="oc-img oc-img-none"><i :class="row.category === 'Special Order' ? 'el-icon-star-off' : 'el-icon-picture-outline'" /></div>
            <div class="oc-main">
                <div class="oc-name" :title="row.productName" @click="$emit('action', 'detail', row)">{{ row.productName }}</div>
                <div class="oc-facts">
                    <span v-if="showStatus" class="oc-status" :style="statusStyle">{{ statusLabel }}</span>
                    <b>× {{ row.orderQty }}</b>
                    <span v-if="row.requestedFor" class="oc-for"><i class="el-icon-user" /> {{ row.requestedFor }}</span>
                    <span v-if="row.urgent" class="oc-urgent">{{ $tp('Urgent') }}</span>
                    <span v-if="row.images && row.images.length > 1" class="oc-dim"><i class="el-icon-picture" /> {{ row.images.length }}</span>
                    <span v-if="awaits" class="oc-needs"><i class="el-icon-price-tag" /> {{ $tp('Needs a quote') }}</span>
                    <span v-else-if="row.confirmed && ['pending', 'shortage'].includes(row.status)" class="oc-ok"><i class="el-icon-circle-check" /> {{ $tp('Confirmed') }}</span>
                </div>
                <!-- the phone list: SKU · category · supplier on one line -->
                <div v-if="detailed && (row.sku || row.category || row.supplier)" class="oc-dim oc-line">{{ idLine }}</div>
            </div>
        </div>
        <div v-if="price != null || (row.supplier && !detailed)" class="oc-price">
            <template v-if="price != null">
                <b>{{ yuan(price) }}</b><span v-if="row.unitPrice == null" class="oc-quote-tag">{{ $tp('quote') }}</span>
                <span v-if="row.orderQty > 1" class="oc-dim"> · {{ yuan(price * row.orderQty) }}</span>
            </template>
            <span v-if="row.supplier && !detailed" class="oc-dim oc-supplier">{{ row.supplier }}</span>
        </div>
        <div v-if="detailed && row.shippedQty != null" class="oc-dim oc-line">
            <i class="el-icon-truck" /> {{ $tp('Shipped') }} {{ row.shippedQty }}<span v-if="row.shippedAt"> · {{ fmtDay(row.shippedAt) }}</span>
            <router-link v-if="row.batchNo" class="oc-link" :to="{ path: '/sparePartsPurchase/batches', query: { batch: row.batchNo } }">{{ row.batchNo }}</router-link>
            <a v-if="row.tracking" class="oc-link" :href="dhlLink(row.tracking)" target="_blank" rel="noopener">{{ row.tracking }}</a>
        </div>
        <div v-if="row.status === 'toConfirm' && row.confirmNote" class="oc-ask"><i class="el-icon-question" /> {{ row.confirmNote }}</div>
        <div v-if="row.status === 'shortage' && row.shortageNote" class="oc-short">{{ row.shortageNote }}</div>
        <div v-if="row.note" class="oc-note" :title="row.note">{{ row.note }}</div>
        <div class="oc-foot">
            <span class="oc-dim oc-stamp" :title="stamp.title">{{ stamp.text }}</span>
            <span class="oc-spacer" />
            <el-button v-if="main" size="mini" :type="main.type" :icon="main.icon" class="oc-act"
                @click="$emit('action', main.key, row)">{{ $tp(main.label) }}</el-button>
            <router-link v-else-if="row.batchNo && !detailed" class="oc-link" :to="{ path: '/sparePartsPurchase/batches', query: { batch: row.batchNo } }">{{ row.batchNo }}</router-link>
            <el-dropdown trigger="click" placement="bottom-end" @command="(k) => $emit('action', k, row)">
                <el-button type="text" size="mini" icon="el-icon-more" class="oc-more" :aria-label="$tp('More')" />
                <el-dropdown-menu slot="dropdown">
                    <el-dropdown-item v-for="m in menu" :key="m.key" :command="m.key" :icon="m.icon" :divided="m.divided">{{ $tp(m.label) }}</el-dropdown-item>
                </el-dropdown-menu>
            </el-dropdown>
        </div>
    </div>
</template>

<script>
import { STATUS_META, awaitsQuote, fmtDay, yuan, dhlLink } from '../shared'

const ACT = {
    quote: { key: 'quote', label: 'Quote', icon: 'el-icon-price-tag', type: 'warning' },
    place: { key: 'place', label: 'Place order', icon: 'el-icon-document-checked', type: 'primary' },
    confirm: { key: 'confirm', label: 'Confirm', icon: 'el-icon-check', type: 'success' },
    reopen: { key: 'reopen', label: 'Reopen', icon: 'el-icon-refresh-left', type: 'default' }
}

export default {
    name: 'OrderCard',
    props: {
        row: { type: Object, required: true },
        can: { type: Function, required: true },
        canEither: { type: Boolean, default: false },
        // the phone list: status pill, SKU / category, shipping facts
        showStatus: { type: Boolean, default: false },
        detailed: { type: Boolean, default: false },
        // an empty picture box when the line has no photo (the board)
        placeholder: { type: Boolean, default: true }
    },
    computed: {
        supply() { return this.can('spp:order:supply') },
        awaits() { return awaitsQuote(this.row) },
        price() { return this.row.unitPrice != null ? this.row.unitPrice : this.row.quotedPrice },
        idLine() { const r = this.row; return [r.sku ? 'SKU ' + r.sku : '', r.category ? this.$tp(r.category) : '', r.supplier].filter(Boolean).join(' · ') },
        statusLabel() { const m = STATUS_META[this.row.status]; return m ? this.$tp(m.label) : this.row.status },
        statusStyle() { const m = STATUS_META[this.row.status]; return m ? { color: m.color, background: m.bg } : {} },
        // the step that moves the line on — the table's rules
        main() {
            const s = this.row.status
            if (this.supply && this.awaits) return ACT.quote
            if (this.supply && (s === 'pending' || s === 'shortage')) return ACT.place
            if (this.canEither && s === 'toConfirm') return ACT.confirm
            if (this.canEither && (s === 'shortage' || s === 'cancelled')) return ACT.reopen
            return null
        },
        menu() {
            const s = this.row.status
            const main = this.main && this.main.key
            const m = [
                { key: 'detail', label: 'Details', icon: 'el-icon-view' },
                { key: 'label', label: 'Print label', icon: 'el-icon-printer' }
            ]
            // a New Product not in Zoho yet → make the item there
            if (this.row.category === 'New Product' && !this.row.itemId && s !== 'cancelled' && this.can('spp:product:create')) m.push({ key: 'zoho', label: 'Create in Zoho', icon: 'el-icon-upload2' })
            if (this.supply && ['pending', 'shortage', 'ordered', 'toConfirm'].includes(s) && main !== 'quote') m.push({ key: 'quote', label: 'Quote', icon: 'el-icon-price-tag' })
            if (this.supply && s === 'ordered') m.push({ key: 'price', label: 'Set unit price', icon: 'el-icon-edit' })
            if (this.canEither && ['pending', 'ordered', 'shortage'].includes(s) && !this.awaits) m.push({ key: 'toConfirm', label: 'To Confirm', icon: 'el-icon-question' })
            if (this.supply && (s === 'pending' || s === 'ordered')) m.push({ key: 'shortage', label: 'Shortage', icon: 'el-icon-remove-outline' })
            if (this.canEither && ['shortage', 'cancelled'].includes(s) && main !== 'reopen') m.push({ key: 'reopen', label: 'Reopen', icon: 'el-icon-refresh-left' })
            if (this.canEither && ['pending', 'shortage', 'toConfirm'].includes(s)) m.push({ key: 'cancel', label: 'Cancel order', icon: 'el-icon-circle-close', divided: true })
            return m
        },
        // the date that matters at this step
        stamp() {
            const r = this.row
            if (r.status === 'received') return { text: fmtDay(r.receivedAt), title: this.$tp('Received') }
            if (r.status === 'shipped') return { text: fmtDay(r.shippedAt), title: this.$tp('Shipped') }
            if (r.status === 'ordered') return { text: fmtDay(r.orderedAt), title: this.$tp('Ordered') }
            return { text: fmtDay(r.createdAt), title: this.$tp('Created') }
        }
    },
    methods: { yuan, fmtDay, dhlLink }
}
</script>

<style lang="scss" scoped>
.oc { background: #fff; border: 1px solid #e4e7ed; border-radius: 6px; padding: 8px; box-shadow: 0 1px 2px rgba(0, 0, 0, .04); transition: box-shadow .15s, border-color .15s;
    &:hover { border-color: #d3dce6; box-shadow: 0 2px 8px rgba(0, 0, 0, .08); }
    &.urgent { border-left: 3px solid #f56c6c; } }
.oc-top { display: flex; gap: 8px; }
.oc-img { flex: 0 0 52px; width: 52px; height: 52px; border-radius: 4px; background: #f5f7fa; overflow: hidden; }
.oc-img-none { display: flex; align-items: center; justify-content: center; color: #c0c4cc; font-size: 20px; }
.oc-main { flex: 1; min-width: 0; }
.oc-name { font-size: 12px; font-weight: 600; color: #303133; line-height: 1.35; cursor: pointer; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    &:hover { color: #409eff; } }
.oc-facts { margin-top: 4px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; font-size: 11px; color: #606266; }
.oc-status { padding: 0 7px; border-radius: 10px; white-space: nowrap; }
.oc-for { color: #409eff; background: #ecf5ff; border-radius: 10px; padding: 0 6px; white-space: nowrap; }
.oc-urgent { color: #fff; background: #f56c6c; border-radius: 10px; padding: 0 6px; font-weight: 600; }
.oc-needs { color: #e6a23c; background: #fdf6ec; border-radius: 10px; padding: 0 6px; white-space: nowrap; }
.oc-ok { color: #67c23a; background: #f0f9eb; border-radius: 10px; padding: 0 6px; white-space: nowrap; }
.oc-dim { font-size: 11px; color: #909399; }
.oc-line { margin-top: 3px; }
.oc-price { margin-top: 6px; font-size: 12px; color: #303133; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.oc-quote-tag { font-size: 10px; color: #e6a23c; border: 1px solid #f5dab1; border-radius: 3px; padding: 0 3px; }
.oc-supplier { margin-left: auto; }
.oc-ask { margin-top: 6px; font-size: 11px; color: #0ea5a5; line-height: 1.35; }
.oc-short { margin-top: 6px; font-size: 11px; color: #f56c6c; }
.oc-note { margin-top: 4px; font-size: 11px; color: #e6a23c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.oc-foot { margin-top: 8px; display: flex; align-items: center; gap: 4px; }
.oc-stamp { white-space: nowrap; }
.oc-spacer { flex: 1; }
.oc-act { padding: 5px 9px; }
.oc-more { padding: 4px 6px; color: #909399; }
.oc-link { font-size: 12px; color: #409eff; text-decoration: none; margin-left: 6px; &:hover { text-decoration: underline; } }
/* touch screens: bigger targets */
@media (hover: none) {
    .oc-act { padding: 7px 12px; }
    .oc-more { padding: 7px 10px; font-size: 16px; }
}
</style>
