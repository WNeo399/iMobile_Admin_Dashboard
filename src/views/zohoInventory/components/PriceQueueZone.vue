<template>
    <!--
        The loading zone and its review dialog — Price Monitoring and Browse
        Items (moved out of priceMonitoring.vue 2026-10-07, unchanged). Price
        edits wait here and go to Zoho together: the server writes them one
        call at a time, because Zoho refuses more than a handful of
        simultaneous pricebook writes. Sticks to the bottom of a scrolling
        page so the push is always in reach. `pm` is the page with the
        price-editing mixin (../priceEditing.js).
    -->
    <div v-if="pm.queueCount || pm.pushingAll || pm.reviewVisible" class="pqz">
        <div v-if="pm.queueCount || pm.pushingAll" :class="['pm-zone', { pushing: pm.pushingAll }]">
            <div class="pm-zone-bar">
                <template v-if="pm.pushingAll">
                    <i class="el-icon-loading pm-zone-icon" />
                    <span class="pm-zone-text">Pushing to Zoho… <b>{{ pm.pushProgress.done }}</b> of {{ pm.pushProgress.total }}
                        <span v-if="pm.pushProgress.failed" class="pm-zone-bad">· {{ pm.pushProgress.failed }} refused</span></span>
                    <el-progress :percentage="pm.pushPercent" :show-text="false" :stroke-width="6" class="pm-zone-progress"
                        :status="pm.pushProgress.failed ? 'exception' : undefined" />
                    <div class="pqz-spacer" />
                    <span class="pqz-dim">the cells being written are locked meanwhile</span>
                </template>
                <template v-else>
                    <i class="el-icon-upload2 pm-zone-icon" />
                    <span class="pm-zone-text"><b>{{ pm.queueCount }}</b> price {{ pm.queueCount === 1 ? 'change' : 'changes' }}
                        on <b>{{ pm.queueGroups.length }}</b> {{ pm.queueGroups.length === 1 ? 'product' : 'products' }} waiting for Zoho
                        <span v-if="pm.queueErrors" class="pm-zone-bad">· {{ pm.queueErrors }} refused on the last push</span></span>
                    <div class="pqz-spacer" />
                    <el-button size="small" plain icon="el-icon-tickets" @click="pm.reviewVisible = true">Review changes</el-button>
                    <el-button size="small" plain @click="pm.confirmClear">Discard all</el-button>
                    <el-button size="small" type="primary" icon="el-icon-upload2" @click="pm.pushAll">
                        {{ pm.queueCount === 1 ? 'Push it to Zoho' : `Push all ${pm.queueCount} to Zoho` }}
                    </el-button>
                </template>
            </div>
        </div>

        <!-- Review: everything queued, one row per product, a chip per price
             list (old → new, the change in %). A chip's × drops that change,
             the bin the product's; clicking a chip reopens the cell. -->
        <el-dialog title="Price changes waiting for Zoho" :visible.sync="pm.reviewVisible" width="860px" append-to-body top="6vh">
            <div class="pm-review-list">
                <div v-for="g in pm.queueGroups" :key="g.itemId" class="pm-zone-row">
                    <div class="pm-zone-item">
                        <div class="pm-zone-name" :title="g.name">{{ g.name }}</div>
                        <div class="pqz-dim">{{ g.sku || '—' }}</div>
                    </div>
                    <div class="pm-zone-chips">
                        <div v-for="q in g.changes" :key="q.key" :class="['pm-chip', { err: q.error }]"
                            :title="q.error ? q.error : 'Click to change'" @click="pm.editQueued(q)">
                            <span class="pm-chip-list">{{ q.label }}</span>
                            <span class="pm-chip-from">{{ pm.money(q.from) }}</span>
                            <i class="el-icon-right" />
                            <b class="pm-chip-to">{{ pm.money(q.rate) }}</b>
                            <span v-if="pm.deltaText(q)" :class="['pm-chip-delta', pm.deltaClass(q)]">{{ pm.deltaText(q) }}</span>
                            <i class="el-icon-close pm-chip-x" title="Remove this change" @click.stop="pm.dequeue(q.key)" />
                        </div>
                        <div v-for="q in g.changes.filter(x => x.error)" :key="q.key + ':err'" class="pm-zone-err">
                            <i class="el-icon-warning" /> {{ q.label }}: {{ q.error }}
                        </div>
                    </div>
                    <el-tooltip content="Remove this product's changes" placement="top">
                        <el-button type="text" size="mini" icon="el-icon-delete" class="pm-zone-drop" @click="pm.dequeueItem(g.itemId)" />
                    </el-tooltip>
                </div>
                <div v-if="!pm.queueGroups.length" class="pm-review-empty">Nothing queued.</div>
            </div>
            <span slot="footer">
                <span class="pm-review-sum">{{ pm.queueCount }} {{ pm.queueCount === 1 ? 'change' : 'changes' }} on
                    {{ pm.queueGroups.length }} {{ pm.queueGroups.length === 1 ? 'product' : 'products' }}</span>
                <el-button size="small" plain :disabled="!pm.queueCount" @click="pm.confirmClear">Discard all</el-button>
                <el-button size="small" @click="pm.reviewVisible = false">Close</el-button>
                <el-button size="small" type="primary" icon="el-icon-upload2" :disabled="!pm.queueCount" @click="pm.pushAll">
                    {{ pm.queueCount === 1 ? 'Push it to Zoho' : `Push all ${pm.queueCount} to Zoho` }}
                </el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
export default {
    name: 'PriceQueueZone',
    props: {
        // the page with the price-editing mixin
        pm: { type: Object, required: true }
    }
}
</script>

<style lang="scss" scoped>
/* The wrapper is what sticks: to the bottom of the window while a page
   scrolls, in its normal place once the page end is reached. */
.pqz { position: sticky; bottom: 12px; z-index: 5; }
.pqz-spacer { flex: 1; }
.pqz-dim { color: #909399; font-size: 12px; }
.pm-zone {
    /* the right margin keeps the Push button clear of the floating AI Agent button */
    margin: 12px 72px 0 0;
    background: #fff; border: 1px solid #f5dab1; border-radius: 8px; overflow: hidden;
    box-shadow: 0 6px 24px rgba(0, 0, 0, .12);
    &.pushing { border-color: #b3d8ff; }
}
.pm-zone-bar {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px;
    background: #fdf6ec; font-size: 13px; color: #606266;
    .pm-zone.pushing & { background: #ecf5ff; }
}
.pm-zone-icon { font-size: 18px; color: #e6a23c; .pm-zone.pushing & { color: #409eff; } }
.pm-zone-text b { color: #303133; }
.pm-zone-bad { color: #f56c6c; }
.pm-zone-progress { width: 320px; margin-left: 6px; }
.pm-review-list { max-height: 60vh; overflow: auto; margin: -10px 0; }
.pm-review-empty { padding: 24px; text-align: center; color: #909399; font-size: 13px; }
.pm-review-sum { float: left; line-height: 32px; font-size: 13px; color: #909399; }
.pm-zone-row {
    display: flex; align-items: flex-start; gap: 12px; padding: 8px 4px; border-bottom: 1px solid #f2f6fc;
    &:last-child { border-bottom: 0; }
    &:hover { background: #fafafa; }
}
.pm-zone-item { flex: 0 0 300px; min-width: 0; line-height: 1.35; }
.pm-zone-name { font-size: 12px; color: #303133; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pm-zone-chips { flex: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.pm-chip {
    display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 14px;
    border: 1px solid #f5dab1; background: #fdf6ec; font-size: 12px; cursor: pointer;
    font-variant-numeric: tabular-nums; line-height: 1.4;
    &:hover { border-color: #e6a23c; }
    &.err { border-color: #fbc4c4; background: #fef0f0; }
    .el-icon-right { color: #c0c4cc; font-size: 11px; }
}
.pm-chip-list { color: #909399; font-size: 11px; font-weight: 600; }
.pm-chip-from { color: #909399; text-decoration: line-through; }
.pm-chip-to { color: #303133; }
.pm-chip-delta { font-size: 11px; &.up { color: #67c23a; } &.down { color: #e6a23c; } }
.pm-chip-x { color: #c0c4cc; margin-left: 2px; &:hover { color: #f56c6c; } }
.pm-zone-err { flex-basis: 100%; font-size: 11px; color: #f56c6c; }
.pm-zone-drop { color: #c0c4cc; padding: 4px; margin-top: 2px; &:hover { color: #f56c6c; } }
</style>
