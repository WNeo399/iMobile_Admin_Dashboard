<template>
    <div class="nl app-container">
        <div class="nl-head">
            <div class="nl-head-text">
                <div class="nl-title">{{ $tp('New Listing') }}
                    <template v-if="listing"><b class="nl-no">{{ listing.listingNo }}</b><span :class="['nl-status', 'st-' + listing.status]">{{ $tp(statusLabel(listing.status)) }}</span></template>
                </div>
                <div class="nl-sub">{{ $tp('Tell the assistant about the item as you would a colleague — it fills in the listing and writes the text') }}</div>
            </div>
            <span class="nl-flex" />
            <el-button v-if="listing" size="small" icon="el-icon-edit-outline" @click="openEditor">{{ $tp('Open in editor') }}</el-button>
            <el-button size="small" type="primary" plain icon="el-icon-plus" :disabled="!listing" @click="startAnother">{{ $tp('Start another') }}</el-button>
        </div>

        <div class="nl-cols">
            <!-- the chat -->
            <div class="nl-chat">
                <!-- the listing so far: the facts at a glance; the text and photos behind Details -->
                <div v-if="listing" class="nl-summary">
                    <div class="nl-sum-head">
                        <div class="nl-sum-main">
                            <div class="nl-sum-dev"><span v-if="listing.category" class="nl-cat">{{ $tp(listing.category) }}</span><b>{{ deviceName(listing) }}</b><span v-if="listing.device && listing.device.imei" class="nl-dim"> · {{ listing.device.imei }}</span></div>
                            <div v-if="missing.length" class="nl-missing"><i class="el-icon-warning-outline" /> {{ $tp('Still needed: {list}', { list: missing.map(m => $tp(m)).join(', ') }) }}</div>
                            <div v-else-if="listing.status === 'draft' || listing.status === 'ready'" class="nl-ready"><i class="el-icon-success" /> {{ $tp('Complete — publish when you are happy with the text') }}</div>
                        </div>
                        <div class="nl-sum-side">
                            <div class="nl-price">{{ listing.price != null ? money(listing.price) : '—' }}</div>
                            <div class="nl-btns">
                                <el-button v-if="listing.status === 'draft'" size="mini" :disabled="!!missing.length" :loading="statusBusy" @click="setStatus('ready')">{{ $tp('Mark ready') }}</el-button>
                                <el-button v-if="listing.status === 'draft' || listing.status === 'ready'" size="mini" type="success" :disabled="!!missing.length" :loading="statusBusy" @click="setStatus('published')">{{ $tp('Publish') }}</el-button>
                                <el-button v-if="listing.status === 'published'" size="mini" plain @click="setStatus('withdrawn')">{{ $tp('Withdraw') }}</el-button>
                                <el-button v-if="listing.status === 'draft' && !listing.publishedAt" size="mini" type="danger" plain :loading="deleting" @click="del(listing)">{{ $tp('Delete') }}</el-button>
                            </div>
                        </div>
                    </div>
                    <div class="nl-sum-grid">
                        <div class="nl-blk">
                            <div class="nl-blk-h">{{ $tp('Item') }}</div>
                            <div v-if="itemRows.length" class="nl-kvs">
                                <span v-for="row in itemRows" :key="row.k" class="nl-kv"><em>{{ $tp(row.k) }}</em>{{ row.v }}</span>
                            </div>
                            <div v-else class="nl-dim">{{ $tp('Nothing recorded yet') }}</div>
                            <div class="nl-blk-h">{{ $tp('What works and what is faulty') }}</div>
                            <div v-if="findings.length" class="nl-chips">
                                <span v-for="(f, i) in findings" :key="i" :class="['nl-fchip', 'is-' + f.state]"><i :class="f.state === 'ok' ? 'el-icon-check' : f.state === 'faulty' ? 'el-icon-close' : 'el-icon-question'" /> {{ f.label }}<span v-if="f.note" class="nl-fchip-note"> — {{ f.note }}</span></span>
                            </div>
                            <div v-else class="nl-dim">{{ $tp('Nothing recorded yet') }}</div>
                            <div class="nl-blk-h">{{ $tp('Photos and video') }} <span class="nl-dim">{{ (listing.media || []).length }}</span></div>
                            <div v-if="(listing.media || []).length" class="nl-media">
                                <template v-for="a in listing.media">
                                    <el-image v-if="a.kind === 'photo'" :key="a.id" :src="a.thumbUrl || a.url" fit="cover" class="nl-thumb" :preview-src-list="photoUrls" />
                                    <a v-else :key="a.id" :href="a.url" target="_blank" rel="noopener" class="nl-thumb nl-thumb-video"><img v-if="a.poster" :src="a.poster.thumbUrl || a.poster.url" alt="" /><i class="el-icon-video-play" /></a>
                                </template>
                            </div>
                            <div v-else class="nl-dim">{{ $tp('None yet — attach them in the chat') }}</div>
                        </div>
                        <div class="nl-blk">
                            <div class="nl-blk-h">{{ $tp('Listing text') }}</div>
                            <template v-if="listing.title">
                                <div class="nl-ttl">{{ listing.title }}</div>
                                <div v-if="listing.conditionLabel" class="nl-cond">{{ listing.conditionLabel }}</div>
                                <div v-if="listing.summary" class="nl-sum">{{ listing.summary }}</div>
                                <div v-for="p in parts" :key="p.key" class="nl-part">
                                    <template v-if="listing.description && listing.description[p.key]">
                                        <div class="nl-part-h">{{ $tp(p.label) }}</div>
                                        <div class="nl-part-t">{{ listing.description[p.key] }}</div>
                                    </template>
                                </div>
                                <div v-if="questions.length" class="nl-q">
                                    <div class="nl-part-h">{{ $tp('The assistant could not tell:') }}</div>
                                    <ul><li v-for="(q, i) in questions" :key="i">{{ q }}</li></ul>
                                </div>
                            </template>
                            <div v-else class="nl-dim">{{ $tp('Not written yet — the assistant writes it once it knows the item, the faults and the price') }}</div>
                        </div>
                    </div>
                </div>
                <assistant-chat ref="chat" class="nl-ac" :listing="listing" :meta="meta"
                    :greeting="greeting"
                    :placeholder="$tp('Type here… e.g. iPhone 8 64GB space grey, cracked screen, powers on, $49')"
                    @listing="onChatListing" />
            </div>

            <!-- the listing so far -->
            <div class="nl-panel">
                <!-- the draft listings from the chat — pick one to go back to its chat -->
                <div class="nl-sec">{{ $tp('Your listings') }} <span class="nl-dim">{{ $tp('{n} drafts', { n: history.length }) }}</span></div>
                <div class="nl-hist">
                    <div :class="['nl-h', 'nl-h-new', { on: !listing }]" @click="startAnother">
                        <i class="el-icon-plus" /> {{ $tp('New listing') }}
                    </div>
                    <div v-for="h in history" :key="h._id" :class="['nl-h', { on: listing && h._id === listing._id }]" @click="pick(h)">
                        <div class="nl-h-1">
                            <b>{{ h.listingNo }}</b>
                            <span :class="['nl-status', 'st-' + h.status]">{{ $tp(statusLabel(h.status)) }}</span>
                            <span class="nl-flex" />
                            <span class="nl-dim">{{ when(h.updatedAt) }}</span>
                            <i v-if="h.status === 'draft' && !h.publishedAt" class="el-icon-close nl-h-x" :title="$tp('Delete')" @click.stop="del(h)" />
                        </div>
                        <div class="nl-h-2">{{ h.title || deviceName(h) }}</div>
                        <div class="nl-h-3">
                            <span v-if="h.price != null">{{ money(h.price) }}</span>
                            <span v-if="(h.media || []).length"><i class="el-icon-picture" /> {{ (h.media || []).length }}</span>
                            <span v-if="!h.title" class="nl-h-todo">{{ $tp('text not written') }}</span>
                        </div>
                    </div>
                    <div v-if="!history.length" class="nl-dim">{{ $tp('None yet') }}</div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { getDefectiveMeta, getDefectiveListing, listDefectiveListings, setDefectiveStatus, deleteDefectiveListing } from '@/api/defective'
import AssistantChat from './AssistantChat.vue'

const STATUS_LABELS = { draft: 'Draft', ready: 'Ready', published: 'Published', sold: 'Sold', withdrawn: 'Withdrawn' }
const PARTS = [
    { key: 'works', label: 'What works' }, { key: 'faults', label: 'Known faults' },
    { key: 'included', label: "What's included" }, { key: 'condition', label: 'Item description' }
]

export default {
    name: 'DefectiveNewListing',
    components: { AssistantChat },
    data() {
        return {
            meta: { limits: { videoTypes: ['video/mp4'], maxVideoBytes: 300e6, maxPhotos: 12 }, mediaConfigured: false, aiConfigured: false },
            listing: null, statusBusy: false, deleting: false,
            history: [],
            parts: PARTS
        }
    },
    computed: {
        greeting() { return this.$tp("Hi! Let's list something. What is it — brand, model, storage and colour, whichever apply?") },
        // what the assistant recorded as working / faulty / not tested
        findings() { return (this.listing && this.listing.faults) || [] },
        // the item facts that are filled in, as label/value pairs
        itemRows() {
            const d = (this.listing && this.listing.device) || {}
            const rows = [['Brand', d.brand], ['Series', d.series], ['Model', d.model], ['Storage', d.storage], ['Colour', d.color], ['Serial number', d.serialNumber], ['Model number', d.modelNumber], ['Battery health', d.batteryHealth != null && d.batteryHealth !== '' ? d.batteryHealth + '%' : ''], ['Included', this.listing && this.listing.included]]
            return rows.filter(([, v]) => v).map(([k, v]) => ({ k, v }))
        },
        photoUrls() { return ((this.listing && this.listing.media) || []).filter(m => m.kind === 'photo').map(m => m.url) },
        questions() { const d = this.listing && this.listing.ai && this.listing.ai.draft; return (d && d.openQuestions) || [] },
        // mirrors the server's readiness check, for the panel
        missing() {
            const l = this.listing
            if (!l) return []
            const out = []
            if (!(l.device && l.device.brand)) out.push('the brand')
            if (!(l.device && l.device.model)) out.push('the device model')
            if (!l.category) out.push('the category')
            if (!(l.media || []).length) out.push('a photo or a video')
            if (!(l.price > 0)) out.push('a price')
            if (!l.title) out.push('the listing text')
            return out
        }
    },
    async created() {
        try { const r = await getDefectiveMeta(); if (r && r.success !== false) this.meta = { ...this.meta, ...r } } catch (e) { /* the chat still works without */ }
        this.loadHistory()
        if (this.$route.query.id) await this.resume(this.$route.query.id)
    },
    methods: {
        // the listings built or continued in the chat, last worked on first
        async loadHistory() {
            try {
                const r = await listDefectiveListings({ chat: 1, status: 'draft', page: 1, pageSize: 30 })
                if (r && r.success !== false) this.history = r.rows || []
            } catch (e) { /* the panel just stays as it was */ }
        },
        // go back to one of them
        pick(h) {
            if (this.chatBusy() || (this.listing && h._id === this.listing._id)) return
            this.resume(h._id)
        },
        chatBusy() { return !!(this.$refs.chat && this.$refs.chat.busy) },
        // the chat created or changed the listing
        onChatListing(l) { this.applyListing(l); this.loadHistory() },
        // continue a listing's chat (picked from the panel, or a reload)
        async resume(id) {
            try {
                const r = await getDefectiveListing(id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.applyListing(r.listing)
            } catch (e) { this.$message.error(this.msg(e, this.$tp('Failed to load the listing'))) }
        },
        applyListing(l) {
            this.listing = l
            if (String(this.$route.query.id || '') !== String(l._id)) this.$router.replace({ path: '/defective/new', query: { id: l._id } })
        },
        async setStatus(to) {
            this.statusBusy = true
            try {
                const r = await setDefectiveStatus(this.listing._id, { to })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.listing = r.listing
                this.loadHistory()
                this.$message.success(this.$tp('{no} is now {status}', { no: r.listing.listingNo, status: this.$tp(this.statusLabel(r.listing.status)) }))
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to change the status')))
            } finally { this.statusBusy = false }
        },
        openEditor() { this.$router.push({ path: '/defective/listings', query: { open: this.listing._id } }) },
        // a never-published draft can go (soft delete, like the editor)
        async del(l) {
            if (this.chatBusy()) return
            try { await this.$confirm(this.$tp('Delete {no}? It was never published.', { no: l.listingNo }), this.$tp('Delete'), { type: 'warning', confirmButtonText: this.$tp('Delete'), cancelButtonText: this.$tp('Cancel') }) } catch (e) { return }
            this.deleting = true
            try {
                const r = await deleteDefectiveListing(l._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('Deleted'))
                if (this.listing && String(this.listing._id) === String(l._id)) this.startAnother()
                this.loadHistory()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to delete')))
            } finally { this.deleting = false }
        },
        startAnother() {
            if (this.chatBusy()) return
            this.listing = null
            if (this.$route.query.id) this.$router.replace('/defective/new')
            if (this.$refs.chat) this.$refs.chat.focus()
        },
        // "2026-10-09T03:12:00.000Z" → "09/10 14:12"
        when(v) {
            const d = new Date(v)
            if (isNaN(d)) return ''
            return d.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
        },
        statusLabel(s) { return STATUS_LABELS[s] || s },
        deviceName(l) { const d = (l && l.device) || {}; return [d.brand, d.model, d.storage, d.color].filter(Boolean).join(' ') || '—' },
        money(v) { const n = Number(v); return isFinite(n) ? '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—' },
        msg(e, fallback) { return (e.response && e.response.data && e.response.data.message) || e.message || fallback }
    }
}
</script>

<style lang="scss" scoped>
.nl { padding: 14px 16px; }
.nl-flex { flex: 1; }
.nl-dim { font-size: 12px; color: #909399; font-weight: normal; }
.nl-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.nl-head-text { min-width: 0; }
.nl-title { display: flex; align-items: center; gap: 8px; font-size: 17px; font-weight: 600; color: #303133; }
.nl-no { font-size: 13px; color: #909399; }
.nl-sub { font-size: 13px; color: #909399; margin-top: 3px; }
.nl-status { padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; color: #fff; background: #909399;
    &.st-ready { background: #409eff; } &.st-published { background: #67c23a; } &.st-sold { background: #e6a23c; } &.st-withdrawn { background: #f56c6c; } }
.nl-cols { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 14px; align-items: start; }

/* the listing so far, above the messages: always open, scrolls when long */
.nl-summary { border-bottom: 1px solid #ebeef5; background: #fff; max-height: 46vh; overflow-y: auto; flex-shrink: 0; }
.nl-sum-head { display: flex; align-items: flex-start; gap: 12px; padding: 10px 14px 8px; }
.nl-sum-main { flex: 1; min-width: 0; }
.nl-sum-dev { font-size: 14px; color: #303133; }
.nl-cat { display: inline-block; padding: 0 7px; margin-right: 6px; border-radius: 9px; background: #ecf5ff; color: #409eff; font-size: 11px; font-weight: 600; line-height: 18px; vertical-align: 1px; }
.nl-sum-side { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.nl-price { font-size: 16px; font-weight: 700; color: #303133; line-height: 1.2; }
.nl-sum-grid { display: grid; grid-template-columns: 1fr 1.25fr; gap: 0 20px; padding: 0 14px 10px; border-top: 1px dashed #ebeef5; }
.nl-blk { min-width: 0; }
.nl-blk-h { margin: 9px 0 4px; font-size: 11px; font-weight: 600; letter-spacing: .3px; text-transform: uppercase; color: #909399; }
.nl-kvs { display: flex; flex-wrap: wrap; gap: 3px 14px; font-size: 13px; color: #303133; }
.nl-kv em { font-style: normal; font-size: 12px; color: #909399; margin-right: 4px; }
.nl-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.nl-fchip { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; padding: 1px 9px; border-radius: 10px; font-size: 12px; line-height: 20px; background: #f4f4f5; color: #606266;
    i { font-size: 11px; }
    &.is-ok { background: #f0f9eb; color: #529b2e; } &.is-faulty { background: #fef0f0; color: #c45656; } &.is-unknown { background: #f4f4f5; color: #909399; } }
.nl-fchip-note { font-weight: normal; opacity: .85; }

/* the chat */
.nl-chat { display: flex; flex-direction: column; height: calc(100vh - 180px); min-height: 480px; border: 1px solid #ebeef5; border-radius: 10px; background: #fff; overflow: hidden; }
.nl-ac { flex: 1; min-height: 0; }
.nl-media { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.nl-thumb { width: 56px; height: 56px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, .5); overflow: hidden; display: block; cursor: zoom-in; background: #f5f7fa; }
.nl-thumb-video { position: relative; color: #fff; img { width: 100%; height: 100%; object-fit: cover; display: block; }
    i { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font-size: 26px; text-shadow: 0 1px 4px rgba(0, 0, 0, .6); } }

/* the panel */
.nl-panel { padding: 14px 16px; border: 1px solid #ebeef5; border-radius: 10px; background: #fff; position: sticky; top: 70px; max-height: calc(100vh - 180px); overflow-y: auto; }
.nl-sec { margin: 14px 0 6px; font-size: 13px; font-weight: 600; color: #303133; &:first-child { margin-top: 0; } }
.nl-hist { display: flex; flex-direction: column; gap: 5px; }
.nl-h { padding: 7px 10px; border: 1px solid #ebeef5; border-radius: 6px; cursor: pointer; background: #fff;
    &:hover { border-color: #b3d8ff; }
    &.on { border-color: #409eff; background: #ecf5ff; } }
.nl-h-new { display: flex; align-items: center; gap: 6px; color: #409eff; font-size: 13px; border-style: dashed; }
.nl-h-1 { display: flex; align-items: center; gap: 6px; font-size: 12px; b { color: #303133; } }
.nl-h-2 { margin-top: 2px; font-size: 13px; color: #303133; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: normal; }
.nl-h-3 { display: flex; gap: 10px; margin-top: 2px; font-size: 12px; color: #606266; }
.nl-h-todo { color: #b88200; }
.nl-h-x { cursor: pointer; color: #c0c4cc; margin-left: 2px; &:hover { color: #f56c6c; } }
.nl-danger { color: #f56c6c; }
.nl-ttl { font-size: 14px; font-weight: 600; color: #303133; line-height: 1.35; }
.nl-cond { margin-top: 3px; font-size: 12px; color: #b88200; }
.nl-sum { margin-top: 6px; font-size: 13px; color: #606266; line-height: 1.45; }
.nl-part { margin-top: 8px; }
.nl-part-h { font-size: 12px; font-weight: 600; color: #606266; }
.nl-part-t { font-size: 13px; color: #303133; white-space: pre-wrap; line-height: 1.45; }
.nl-q { margin-top: 8px; padding: 8px 10px; border-radius: 6px; background: #fdf6ec; font-size: 12px; color: #303133; ul { margin: 4px 0 0; padding-left: 18px; } }
.nl-missing { font-size: 12px; color: #b88200; }
.nl-ready { font-size: 12px; color: #529b2e; }
.nl-btns { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; .el-button + .el-button { margin-left: 0; } }
@media (max-width: 960px) {
    .nl-cols { grid-template-columns: minmax(0, 1fr); }
    .nl-chat { height: calc(100vh - 150px); min-height: 360px; }
    .nl-panel { position: static; max-height: none; }
    .nl-summary { max-height: 52vh; }
    .nl-sum-head { flex-direction: column; gap: 6px; }
    .nl-sum-side { flex-direction: row; align-items: center; justify-content: space-between; width: 100%; }
    .nl-sum-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 600px) {
    .nl { padding: 10px 10px; }
    .nl-sub { display: none; }
    .nl-head { margin-bottom: 8px; }
    .nl-sum-head { padding: 8px 10px 6px; }
    .nl-sum-grid { padding: 0 10px 8px; }
}
</style>
