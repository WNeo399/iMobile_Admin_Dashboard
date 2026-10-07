<template>
    <!--
        One editable price cell — Price Monitoring and Browse Items (moved out
        of priceMonitoring.vue 2026-10-07, unchanged). `pm` is the page with
        the price-editing mixin (../priceEditing.js): it holds the edit, the
        queue and the push; this only draws the cell in its current state.
    -->
    <div :class="['pc', { 'pc-compact': compact }]">
        <!-- Row edit: all the prices of this product at once
             (✓ in the action column pushes the changed ones). -->
        <div v-if="pm.rowEdit.itemId === row.itemId && !pm.pushing[key]" class="pm-edit-wrap" @click.stop>
            <el-input-number v-model="pm.rowEdit.values[col.list]" size="mini" :min="0" :precision="2"
                :controls="false" :class="['pm-input', { changed: pm.rowChanged(col) }]"
                @keyup.enter.native="pm.rowEnter" @keyup.esc.native="pm.cancelRowEdit" />
            <div v-if="ref != null" class="pm-ref pm-ref-use" title="Use the formula price" @click="pm.rowUseRef(col)">
                ref {{ pm.money(ref) }} <i class="el-icon-document-copy" />
            </div>
        </div>
        <div v-else-if="pm.pEdit.itemId === row.itemId && pm.pEdit.list === col.list" class="pm-edit-wrap" @click.stop>
            <div class="pm-edit">
                <el-input-number v-model="pm.pEdit.value" size="mini" :min="0" :precision="2"
                    :controls="false" class="pm-input"
                    @keyup.enter.native="pm.priceEnter($event, row)" />
                <!-- Timing matters: the number input commits on blur/enter,
                     so SAVE runs on click (after the blur) and CANCEL on
                     mousedown (before a re-render can swallow the click). -->
                <el-button type="text" size="mini" icon="el-icon-check" class="pm-save" @click="pm.savePriceEdit(row)" />
                <el-button type="text" size="mini" icon="el-icon-close" class="pm-cancel" @mousedown.native.prevent="pm.cancelPriceEdit" />
            </div>
            <!-- The formula's target, click to copy it into the input (a
                 click, so the input's blur commits first). -->
            <div v-if="ref != null" class="pm-ref pm-ref-use" title="Use the formula price" @click="pm.useRefPrice(row, col)">
                ref {{ pm.money(ref) }} <i class="el-icon-document-copy" />
            </div>
        </div>
        <!-- Being pushed: the cell locks. -->
        <div v-else-if="pm.pushing[key]" class="pm-view">
            <div class="pm-val"><span>{{ pm.money(pm.pushing[key].rate) }}</span></div>
            <div class="pm-pushing"><i class="el-icon-loading" /> pushing to Zoho…</div>
        </div>
        <!-- Queued: the new rate waits in the loading zone until it is
             pushed. Click to change it, × to drop it. (mousedown, not click:
             the ✓ that queued the value re-renders this cell before its
             click finishes bubbling.) -->
        <div v-else-if="pm.queue[key]" :class="['pm-view', pm.canEditPrices ? 'pm-editable' : '']"
            title="Queued for Zoho — click to change"
            @mousedown="pm.canEditPrices && pm.startPriceEdit(row, col, pm.queue[key].rate)">
            <div class="pm-val">
                <span class="pm-queued-val">{{ pm.money(pm.queue[key].rate) }}</span>
                <i v-if="pm.canEditPrices" class="el-icon-close pm-queued-x" title="Remove from the queue"
                    @mousedown.stop @click.stop="pm.dequeue(key)" />
            </div>
            <div class="pm-queued">
                <span v-if="pm.queue[key].error" class="pm-queued-err"><i class="el-icon-warning" /> {{ pm.queue[key].error }}</span>
                <template v-else><i class="el-icon-upload2" /> was {{ pm.money(pm.queue[key].from) }}</template>
            </div>
        </div>
        <div v-else :class="['pm-view', pm.canEditPrices ? 'pm-editable' : '']" :title="pm.cellTitle(row, col)"
            @click="pm.canEditPrices && pm.startPriceEdit(row, col)">
            <div class="pm-val">
                <span :class="pm.priceClass(row, row[col.prop])">{{ pm.money(row[col.prop]) }}</span>
                <i v-if="pm.canEditPrices" class="el-icon-edit pm-pencil" />
            </div>
            <!-- Off-formula rows carry the formula's reference under each
                 rate, with the signed deviation on the cells that breach the
                 ±5% band: red = under formula (margin lost), amber = over. -->
            <div v-if="row.priceRuleBroken && ref != null"
                :class="['pm-ref', pm.refDevClass(row, col), { 'pm-ref-click': pm.canEditPrices }]"
                :title="pm.canEditPrices ? 'Edit with the formula price filled in' : ''"
                @click.stop="pm.canEditPrices && pm.startPriceEdit(row, col, ref)">
                ref {{ pm.money(ref) }}<span v-if="pm.refDevText(row, col)" class="pm-ref-dev">&nbsp;{{ pm.refDevText(row, col) }}</span>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    name: 'PriceCell',
    props: {
        row: { type: Object, required: true },
        // { prop, label, list } — a price list or the purchase price
        col: { type: Object, required: true },
        // the page with the price-editing mixin
        pm: { type: Object, required: true },
        // a narrower input (Browse Items' tighter price columns)
        compact: { type: Boolean, default: false }
    },
    computed: {
        key() { return this.pm.pushKey(this.row, this.col) },
        ref() { return this.pm.refPrice(this.row, this.col) }
    }
}
</script>

<style lang="scss" scoped>
.pc { display: flex; justify-content: center; }
.sd-dim { color: #909399; font-size: 12px; }
.sd-warn { color: #e6a23c; }
.sd-bad { color: #ff4949; }
.sd-mono { font-variant-numeric: tabular-nums; }
.pm-view { display: flex; flex-direction: column; align-items: center; line-height: 1.4; }
/* The hover pencil floats beside the value instead of occupying layout
   space, so the price text itself sits dead centre. */
.pm-val { position: relative; display: inline-flex; align-items: center; }
.pm-ref {
    font-size: 11px; color: #c0c4cc; white-space: nowrap;
    font-variant-numeric: tabular-nums;
    &.pm-ref-high { color: #e6a23c; }
    &.pm-ref-low { color: #f56c6c; }
    .pm-ref-dev { font-weight: 600; }
}
.pm-editable { cursor: pointer; }
.pm-pencil {
    position: absolute; right: -16px; top: 50%; transform: translateY(-50%);
    font-size: 11px; color: #c0c4cc; opacity: 0; transition: opacity .15s;
}
.pm-editable:hover .pm-pencil { opacity: 1; color: #409eff; }
.pm-edit-wrap { display: flex; flex-direction: column; align-items: center; gap: 2px; }
/* Clickable reference price: in the editor it copies into the input; on an
   off-formula cell it opens the editor pre-filled. */
.pm-ref-use { cursor: pointer; color: #409eff; &:hover { text-decoration: underline; } }
/* Row edit: a value that will be pushed. */
.pm-input.changed ::v-deep .el-input__inner { border-color: #409eff; background: #ecf5ff; }
.pm-ref-click { cursor: pointer; &:hover { text-decoration: underline; } }
.pm-edit { display: inline-flex; align-items: center; gap: 2px; }
.pm-pushing { font-size: 11px; color: #e6a23c; white-space: nowrap; }
/* Queued cells */
.pm-queued { font-size: 11px; color: #e6a23c; white-space: nowrap; }
.pm-queued-val { color: #e6a23c; font-weight: 600; }
.pm-queued-x { margin-left: 4px; color: #c0c4cc; cursor: pointer; }
.pm-queued-x:hover { color: #f56c6c; }
.pm-queued-err { color: #f56c6c; }
.pm-input { width: 90px; }
.pc-compact .pm-input { width: 64px; }
.pc-compact .pm-edit .el-button + .el-button { margin-left: 0; }
.pm-input ::v-deep .el-input__inner { padding: 0 6px; text-align: right; }
.pm-save { color: #67c23a; padding: 2px; }
.pm-cancel { color: #909399; padding: 2px; }
</style>
