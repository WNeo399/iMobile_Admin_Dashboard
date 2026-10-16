<template>
    <!--
        iMobile Listing → Qualities (user ask 2026-10-16): the qualities each
        classification of part comes in — a screen as Service Pack / JK / JK+,
        a back cover as High Quality … The create dialogs (New Products, and
        "Create in Zoho" on the Purchase Order page) then offer only the item's
        classification's qualities, in this order; a classification with no list
        offers every quality. Each change is saved at once.
        Backend routes/websiteRoutes/qualities (listing:quality:view / manage).
    -->
    <div class="app-container ql-page">
        <div class="ql-head">
            <div>
                <div class="ql-title">{{ $tt('Qualities') }}</div>
                <div class="ql-sub">{{ $tp('The qualities each classification comes in — when an item is created in Zoho, its Quality list shows only these.') }}</div>
            </div>
            <div class="ql-spacer" />
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">{{ $tp('Refresh') }}</el-button>
        </div>

        <div class="ql-body">
            <!-- the classifications -->
            <div v-loading="loading" class="ql-card ql-classes">
                <div v-for="c in classes" :key="c.classification" :class="['ql-class', { on: c.classification === selected }]" @click="selected = c.classification">
                    <span class="ql-class-name">{{ classLabel(c.classification) }}</span>
                    <span v-if="c.qualities.length" class="ql-n">{{ c.qualities.length }}</span>
                    <span v-else class="ql-unset">{{ $tp('not set') }}</span>
                </div>
            </div>

            <!-- the picked one's list -->
            <div v-if="current" class="ql-card ql-detail">
                <div class="ql-d-head">
                    <span class="ql-d-title">{{ classLabel(current.classification) }}</span>
                    <span class="ql-dim">{{ $tp('{n} quality(s)', { n: current.qualities.length }) }}</span>
                    <span class="ql-spacer" />
                    <span v-if="saving" class="ql-dim"><i class="el-icon-loading" /> {{ $tp('Saving…') }}</span>
                    <span v-else-if="savedFor === current.classification" class="ql-ok"><i class="el-icon-check" /> {{ $tp('Saved') }}</span>
                </div>
                <div class="ql-hint">{{ current.qualities.length
                    ? $tp('The Quality list shows these, in this order — drag to reorder.')
                    : $tp('No list yet — the Quality list shows every quality.') }}</div>

                <draggable v-model="current.qualities" handle=".ql-handle" :disabled="!canManage" :animation="160" class="ql-list" @end="save">
                    <div v-for="q in current.qualities" :key="q" class="ql-row">
                        <i v-if="canManage" class="el-icon-rank ql-handle" :title="$tp('Drag to reorder')" />
                        <span class="ql-q">{{ q }}</span>
                        <span class="ql-dim">{{ usageOf(q) ? $tp('{n} item(s) in Zoho', { n: usageOf(q) }) : $tp('no item in Zoho yet') }}</span>
                        <span class="ql-spacer" />
                        <el-button v-if="canManage" type="text" size="mini" icon="el-icon-close" class="ql-del" :title="$tp('Remove')" @click="remove(q)" />
                    </div>
                </draggable>

                <!-- add one: a quality already in use somewhere, or a new one typed -->
                <el-select v-if="canManage" v-model="adding" size="small" filterable allow-create default-first-option clearable
                    :placeholder="$tp('Add a quality — pick or type')" class="ql-add" @change="add">
                    <el-option v-for="q in addOptions" :key="q" :label="q" :value="q" />
                </el-select>

                <!-- what this classification's items in Zoho use today, not on the list yet -->
                <div v-if="unlistedUsage.length" class="ql-used">
                    <div class="ql-used-head">{{ $tp('Used by {c} items in Zoho', { c: classLabel(current.classification) }) }}
                        <el-button v-if="canManage" type="text" size="mini" @click="addAll">{{ $tp('Add all') }}</el-button></div>
                    <div class="ql-chips">
                        <span v-for="u in unlistedUsage" :key="u.quality" :class="['ql-chip', { 'is-click': canManage }]" @click="canManage && add(u.quality)">
                            <i v-if="canManage" class="el-icon-plus" />{{ u.quality }} <b>{{ u.count }}</b></span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import draggable from 'vuedraggable'
import { listQualities, saveQualities } from '@/api/website'
import { hasPermission } from '@/utils/permission'

const CLASS_LABELS = { BackCover: 'Back Cover' }

export default {
    name: 'ListingQualities',
    components: { draggable },
    data() {
        return {
            loading: false,
            // [{ classification, qualities, usage: [{ quality, count }] }]
            classes: [],
            // every quality in use or listed anywhere (the add picker)
            all: [],
            selected: '',
            adding: '',
            saving: false,
            saveSeq: 0,
            savedFor: ''
        }
    },
    computed: {
        canManage() {
            return hasPermission(this.$store.getters.permissions, 'listing:quality:manage')
        },
        current() {
            return this.classes.find(c => c.classification === this.selected) || null
        },
        addOptions() {
            const on = new Set((this.current ? this.current.qualities : []).map(q => q.toLowerCase()))
            return this.all.filter(q => !on.has(q.toLowerCase()))
        },
        unlistedUsage() {
            if (!this.current) return []
            const on = new Set(this.current.qualities.map(q => q.toLowerCase()))
            return this.current.usage.filter(u => !on.has(u.quality.toLowerCase()))
        }
    },
    created() {
        this.load()
    },
    methods: {
        classLabel(c) {
            return this.$tp(CLASS_LABELS[c] || c)
        },
        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback
        },
        usageOf(q) {
            const u = ((this.current && this.current.usage) || []).find(x => x.quality.toLowerCase() === String(q).toLowerCase())
            return u ? u.count : 0
        },
        async load() {
            this.loading = true
            try {
                const r = await listQualities()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.classes = r.classifications || []
                this.all = r.all || []
                if (!this.classes.some(c => c.classification === this.selected)) this.selected = (this.classes[0] || {}).classification || ''
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load the qualities')))
            } finally {
                this.loading = false
            }
        },
        add(q) {
            const v = String(q || '').replace(/\s+/g, ' ').trim()
            this.adding = ''
            if (!v || !this.current) return
            if (/[[\]]/.test(v)) { this.$message.warning(this.$tp('Quality can\'t contain [ or ]')); return }
            if (v.length > 60) { this.$message.warning(this.$tp('Quality is too long (60 characters at most)')); return }
            if (this.current.qualities.some(x => x.toLowerCase() === v.toLowerCase())) return
            this.current.qualities.push(v)
            if (!this.all.some(x => x.toLowerCase() === v.toLowerCase())) this.all.push(v)
            this.save()
        },
        addAll() {
            if (!this.current) return
            this.current.qualities.push(...this.unlistedUsage.map(u => u.quality))
            this.save()
        },
        remove(q) {
            if (!this.current) return
            this.current.qualities = this.current.qualities.filter(x => x !== q)
            this.save()
        },
        // The whole list as it stands; a later save's answer wins (quick
        // clicks send several).
        async save() {
            const c = this.current
            if (!c || !this.canManage) return
            const seq = ++this.saveSeq
            this.saving = true
            try {
                const r = await saveQualities(c.classification, c.qualities)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                if (seq === this.saveSeq) { c.qualities = r.qualities; this.savedFor = c.classification }
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Could not save the list')))
                this.load()
            } finally {
                if (seq === this.saveSeq) this.saving = false
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.ql-page { display: flex; flex-direction: column; gap: 12px; }
.ql-head { display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap; }
.ql-title { font-size: 18px; font-weight: 600; color: #303133; }
.ql-sub { font-size: 12px; color: #909399; margin-top: 2px; }
.ql-spacer { flex: 1; }
.ql-dim { font-size: 12px; color: #909399; }
.ql-ok { font-size: 12px; color: #67c23a; }
.ql-body { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.ql-card { background: #fff; border: 1px solid #ebeef5; border-radius: 6px; padding: 12px; min-width: 0; }
.ql-classes { width: 240px; flex: 0 0 240px; padding: 6px; }
.ql-class { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 4px; cursor: pointer; font-size: 13px; color: #303133;
    &:hover { background: #f5f7fa; }
    &.on { background: #ecf5ff; color: #409eff; font-weight: 600; } }
.ql-class-name { flex: 1; min-width: 0; }
.ql-n { font-size: 11px; color: #606266; background: #f0f2f5; border-radius: 9px; padding: 0 7px; line-height: 18px; font-weight: normal; }
.ql-unset { font-size: 11px; color: #c0c4cc; font-weight: normal; }
.ql-detail { flex: 1; min-width: 300px; display: flex; flex-direction: column; gap: 10px; }
.ql-d-head { display: flex; align-items: center; gap: 8px; }
.ql-d-title { font-size: 16px; font-weight: 600; color: #303133; }
.ql-hint { font-size: 12px; color: #909399; }
.ql-list { display: flex; flex-direction: column; gap: 4px; }
.ql-row { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border: 1px solid #ebeef5; border-radius: 4px; background: #fff; font-size: 13px;
    .el-button { padding: 0; } }
.ql-handle { color: #c0c4cc; cursor: grab; &:hover { color: #409eff; } }
.ql-q { color: #303133; font-weight: 500; }
.ql-del { color: #c0c4cc; &:hover { color: #f56c6c; } }
.ql-add { width: 320px; max-width: 100%; }
.ql-used { border-top: 1px dashed #ebeef5; padding-top: 10px; }
.ql-used-head { font-size: 12px; color: #606266; margin-bottom: 6px; .el-button { padding: 0; margin-left: 6px; } }
.ql-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ql-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border: 1px dashed #dcdfe6; border-radius: 12px; font-size: 12px; color: #606266; background: #fafafa;
    b { color: #909399; font-weight: normal; }
    i { color: #409eff; }
    &.is-click { cursor: pointer; &:hover { border-color: #409eff; color: #409eff; background: #ecf5ff; } } }
@media (max-width: 767px) {
    .ql-classes { width: 100%; flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 2px; }
    .ql-class { flex: 0 0 auto; }
}
</style>
