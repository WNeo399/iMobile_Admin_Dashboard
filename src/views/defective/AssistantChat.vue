<template>
    <!-- the chat with the listing assistant: used by the New Listing page and
         inside the listing editor. Turns come from listing.chat on the server;
         what is typed here is sent to POST /defective/assist. Photos are
         shrunk under ~1 MB before they go; a video is 10 s / 5 MB at most and
         can be recorded with the device's camera. -->
    <div :class="['ac', { 'is-compact': compact }]">
        <div ref="msgs" class="ac-msgs">
            <div v-if="greeting" class="ac-msg is-assistant"><div class="ac-bubble">{{ greeting }}</div></div>
            <div v-for="(m, i) in msgs" :key="i" :class="['ac-msg', m.role === 'user' ? 'is-user' : 'is-assistant']">
                <div class="ac-bubble">
                    <div v-if="m.text" class="ac-text">{{ m.text }}</div>
                    <div v-if="m.media && m.media.length" class="ac-attach">
                        <template v-for="a in m.media">
                            <el-image v-if="a.kind === 'photo'" :key="a.id" :src="a.thumbUrl || a.url" fit="cover" class="ac-thumb" :preview-src-list="[a.url]" />
                            <a v-else :key="a.id" :href="a.url" target="_blank" rel="noopener" class="ac-thumb ac-thumb-video"><img v-if="a.poster" :src="a.poster.thumbUrl || a.poster.url" alt="" /><i class="el-icon-video-play" /></a>
                        </template>
                    </div>
                    <div v-if="m.actions && m.actions.length" class="ac-actions">
                        <span v-for="a in m.actions" :key="a" class="ac-action"><i class="el-icon-check" /> {{ $tp(labelOf(a)) }}</span>
                    </div>
                    <!-- details the assistant saw in the photos: recorded only on Yes -->
                    <div v-if="i === msgs.length - 1 && m.role === 'assistant' && suggestion" class="ac-suggest">
                        <div class="ac-suggest-h"><i class="el-icon-view" /> {{ $tp('Seen in the photos — record these?') }}</div>
                        <div class="ac-suggest-rows">
                            <span v-for="row in suggestionRows" :key="row.k" class="ac-suggest-kv"><em>{{ $tp(row.k) }}</em>{{ row.v }}</span>
                        </div>
                        <div v-if="suggestion.note" class="ac-suggest-note">{{ suggestion.note }}</div>
                        <div class="ac-suggest-btns">
                            <el-button size="mini" type="primary" icon="el-icon-check" :loading="deciding" @click="decide(true)">{{ $tp('Yes, record') }}</el-button>
                            <el-button size="mini" :disabled="deciding" @click="decide(false)">{{ $tp('No') }}</el-button>
                        </div>
                    </div>
                </div>
            </div>
            <div v-if="busy" class="ac-msg is-assistant"><div class="ac-bubble ac-typing"><span /><span /><span /></div></div>
        </div>

        <div class="ac-compose">
            <!-- one-click asks -->
            <div v-if="chips && listing && !busy" class="ac-chips">
                <span class="ac-chip" @click="say(listing.title ? 'Rewrite the listing text.' : 'Write the listing text now.')">
                    <i class="el-icon-magic-stick" /> {{ $tp(listing.title ? 'Rewrite the text' : 'Write the listing text') }}</span>
                <span class="ac-chip" @click="say('What is still needed before this can be published?')">{{ $tp("What's still needed?") }}</span>
            </div>
            <div v-if="pending.length || upload || preparing" class="ac-pending">
                <span v-for="(f, i) in pending" :key="i" class="ac-pend"><i :class="f.type.startsWith('video/') ? 'el-icon-video-camera' : 'el-icon-picture'" /> {{ f.name }} <span class="ac-pend-size">{{ sizeOf(f) }}</span><i class="el-icon-close ac-pend-x" @click="pending.splice(i, 1)" /></span>
                <span v-if="preparing" class="ac-pend ac-pend-up"><i class="el-icon-loading" /> {{ $tp('Preparing video…') }} {{ prepPct ? prepPct + '%' : '' }}</span>
                <span v-if="upload" class="ac-pend ac-pend-up"><i class="el-icon-loading" /> {{ upload.label }} {{ upload.pct }}%</span>
            </div>
            <div class="ac-row">
                <div class="ac-tools">
                    <el-tooltip :content="$tp('Attach photos or a video')" placement="top">
                        <el-button circle size="small" icon="el-icon-paperclip" :disabled="busy || !meta.mediaConfigured" @click="$refs.files.click()" />
                    </el-tooltip>
                    <el-tooltip :content="$tp('Take a photo')" placement="top">
                        <el-button circle size="small" icon="el-icon-camera" :disabled="busy || !meta.mediaConfigured" @click="openCamera('photo')" />
                    </el-tooltip>
                    <el-tooltip :content="$tp('Record a video — {n} seconds at most', { n: maxSeconds })" placement="top">
                        <el-button circle size="small" icon="el-icon-video-camera" :disabled="busy || !meta.mediaConfigured" @click="openCamera('video')" />
                    </el-tooltip>
                </div>
                <input ref="files" type="file" multiple :accept="'image/*,' + videoTypes.join(',')" class="ac-hidden" @change="onPick" />
                <input ref="camPhoto" type="file" accept="image/*" capture="environment" class="ac-hidden" @change="onPick" />
                <input ref="camVideo" type="file" accept="video/*" capture="environment" class="ac-hidden" @change="onPick" />
                <el-input ref="input" v-model="text" type="textarea" :autosize="{ minRows: 1, maxRows: 5 }" resize="none" class="ac-input"
                    :placeholder="placeholder" :disabled="busy" @keydown.native.enter.exact.prevent="send()" />
                <el-button type="primary" icon="el-icon-s-promotion" :loading="busy" :disabled="(!text.trim() && !pending.length) || preparing > 0" @click="send()">{{ $tp('Send') }}</el-button>
            </div>
            <div v-if="!meta.mediaConfigured" class="ac-dim">{{ $tp('The media bucket is not set up on the server — photos and videos cannot be attached yet') }}</div>
            <div v-else-if="!meta.aiConfigured" class="ac-dim">{{ $tp('The AI assistant is not set up on the server') }}</div>
        </div>

        <camera-capture v-model="cam.open" :mode="cam.mode" :max-seconds="maxSeconds" @done="onCamera" @fallback="camFallback" />
    </div>
</template>

<script>
import { assistDefective, decideDefectiveSuggestion } from '@/api/defective'
import { uploadPhotos, uploadVideo } from './mediaUpload'
import { compressImage, prepareVideo, videoProblem, canOpenCamera } from './media'
import CameraCapture from './CameraCapture.vue'

export default {
    name: 'DefectiveAssistantChat',
    components: { CameraCapture },
    props: {
        listing: { type: Object, default: null },     // null = the chat creates one on the first message
        meta: { type: Object, required: true },        // GET /defective/meta (limits, mediaConfigured, aiConfigured)
        greeting: { type: String, default: '' },
        placeholder: { type: String, default: '' },
        compact: Boolean,                              // smaller bubbles (inside the editor)
        chips: { type: Boolean, default: true },       // the one-click asks above the box
        beforeSend: { type: Function, default: null }  // async → false stops the send (the editor saves its form first)
    },
    data() {
        return { msgs: [], text: '', pending: [], upload: null, busy: false, builtId: null, preparing: 0, prepPct: 0, cam: { open: false, mode: 'photo' }, deciding: false }
    },
    computed: {
        // details the assistant saw in the photos, waiting for a yes / no
        suggestion() { return (this.listing && this.listing.pendingSuggestion) || null },
        suggestionRows() {
            const s = this.suggestion || {}; const d = s.device || {}
            const rows = [['Category', s.category], ['Brand', d.brand], ['Series', d.series], ['Model', d.model], ['Storage', d.storage], ['Colour', d.color], ['Included', s.included]]
            return rows.filter(([, v]) => v).map(([k, v]) => ({ k, v }))
        },
        videoTypes() { return (this.meta.limits && this.meta.limits.videoTypes) || ['video/mp4'] },
        maxSeconds() { return (this.meta.limits && this.meta.limits.maxVideoSeconds) || 10 },
        maxVideoBytes() { return (this.meta.limits && this.meta.limits.maxVideoBytes) || 5 * 1024 * 1024 }
    },
    watch: {
        listing: { handler(l) { this.syncFrom(l) }, immediate: true }
    },
    methods: {
        // the messages follow the listing's stored chat whenever it is a
        // different listing, or the server has turns this box hasn't shown
        syncFrom(l) {
            if (this.busy) return
            if (!l) { this.msgs = []; this.builtId = null; return }
            const turns = l.chat || []
            if (String(l._id) === this.builtId && turns.length === this.msgs.length) return
            this.builtId = String(l._id)
            const byId = new Map((l.media || []).map(m => [m.id, m]))
            this.msgs = turns.map(t => ({ role: t.role, text: t.text || '', media: (t.mediaIds || []).map(id => byId.get(id)).filter(Boolean), actions: t.actions || [] }))
            this.scroll()
        },
        focus() { this.$nextTick(() => { const i = this.$refs.input; if (i && i.focus) i.focus() }) },
        labelOf(a) { return a === 'wrote' ? 'Listing text written' : a === 'suggested' ? 'Details suggested from the photos' : 'Listing updated' },
        // yes / no to the suggestion — recorded on the server without another AI call
        async decide(accept) {
            if (!this.listing || this.deciding) return
            this.deciding = true
            try {
                const r = await decideDefectiveSuggestion({ listingId: this.listing._id, accept })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.msgs.push({ role: 'user', text: r.userText || (accept ? this.$tp('Yes, record') : this.$tp('No')), media: [] })
                this.msgs.push({ role: 'assistant', text: r.reply, actions: r.actions || [] })
                this.builtId = String(r.listing._id)
                this.scroll()
                this.$emit('listing', r.listing)
            } catch (e) {
                this.$message.error((e.response && e.response.data && e.response.data.message) || e.message || this.$tp('The assistant could not answer'))
            } finally { this.deciding = false }
        },
        sizeOf(f) { const kb = f.size / 1024; return kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : Math.round(kb) + ' KB' },

        // ── attachments: photos shrink at send time; a video is checked (and shrunk when possible) right away ──
        onPick(e) {
            const files = [...(e.target.files || [])]
            e.target.value = ''
            for (const f of files) {
                if (f.type.startsWith('video/')) this.addVideo(f)
                else if (f.type.startsWith('image/')) this.pending.push(f)
            }
        },
        async addVideo(f) {
            if (!this.videoTypes.includes(f.type)) { this.$message.warning(this.$tp('Videos must be mp4, mov or webm')); return }
            this.preparing++; this.prepPct = 0
            try {
                const ready = await prepareVideo(f, { maxSeconds: this.maxSeconds, target: this.maxVideoBytes, onProgress: pct => { this.prepPct = pct } })
                this.pending.push(ready)
            } catch (e) {
                this.$message.warning(videoProblem(e, this.$tp, this.maxSeconds))
            } finally { this.preparing--; this.prepPct = 0 }
        },
        // the device's camera (in the page when the browser allows it, else the phone's own camera app)
        openCamera(mode) { if (canOpenCamera()) this.cam = { open: true, mode }; else this.camFallback(mode) },
        camFallback(mode) { const i = this.$refs[mode === 'video' ? 'camVideo' : 'camPhoto']; if (i) i.click() },
        onCamera(file) { this.pending.push(file); this.focus() },

        say(preset) { if (!this.busy) this.send(preset) },
        async send(preset) {
            const typed = typeof preset === 'string'
            const text = (typed ? preset : this.text).trim()
            const files = typed ? [] : this.pending.slice()
            if ((!text && !files.length) || this.busy || this.preparing) return
            this.busy = true
            try {
                if (this.beforeSend && !(await this.beforeSend())) return
                // the listing exists from the first message, so attachments have somewhere to go
                let listing = this.listing
                if (!listing) {
                    const r = await assistDefective({ message: '' })
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                    listing = r.listing
                    this.$emit('listing', listing)
                }
                const media = []
                const images = files.filter(f => f.type.startsWith('image/'))
                if (images.length) {
                    this.upload = { pct: 0, label: this.$tp('Preparing…') }
                    const small = await Promise.all(images.map(f => compressImage(f)))
                    this.upload = { pct: 0, label: this.$tp('Uploading…') }
                    media.push(...await uploadPhotos(listing._id, small))
                }
                for (const v of files.filter(f => f.type.startsWith('video/'))) {
                    this.upload = { pct: 0, label: '' }
                    media.push(await uploadVideo(listing._id, v, { onProgress: (pct, label) => { this.upload = { pct, label: this.$tp(label) } } }))
                }
                this.upload = null
                if (!typed) { this.text = ''; this.pending = [] }
                this.msgs.push({ role: 'user', text, media })
                this.scroll()
                const r = await assistDefective({ listingId: listing._id, message: text, mediaIds: media.map(m => m.id) })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                const actions = r.actions || []
                this.msgs.push({ role: 'assistant', text: r.reply, actions })
                this.builtId = String(r.listing._id)
                this.scroll()
                this.$emit('listing', r.listing)
                if (actions.includes('wrote')) this.$emit('wrote', r.listing)
            } catch (e) {
                this.$message.error((e.response && e.response.data && e.response.data.message) || e.message || this.$tp('The assistant could not answer'))
            } finally {
                this.busy = false; this.upload = null
                this.focus()
            }
        },
        scroll() { this.$nextTick(() => { const el = this.$refs.msgs; if (el) el.scrollTop = el.scrollHeight }) }
    }
}
</script>

<style lang="scss" scoped>
.ac { display: flex; flex-direction: column; height: 100%; min-height: 0; background: #fff; }
.ac-dim { font-size: 12px; color: #909399; margin-top: 4px; }
.ac-hidden { display: none; }
.ac-msgs { flex: 1; min-height: 0; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; background: #f7f8fa; -webkit-overflow-scrolling: touch; }
.ac-msg { display: flex; &.is-user { justify-content: flex-end; } }
.ac-bubble { max-width: 78%; padding: 9px 13px; border-radius: 14px; font-size: 14px; line-height: 1.5; color: #303133; background: #fff; border: 1px solid #ebeef5; word-break: normal;
    .is-user & { background: #409eff; color: #fff; border-color: #409eff; } }
.ac-text { white-space: pre-wrap; }
.ac-attach { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.ac-thumb { width: 72px; height: 72px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, .5); overflow: hidden; display: block; cursor: zoom-in; background: #f5f7fa; }
.ac-thumb-video { position: relative; color: #fff; img { width: 100%; height: 100%; object-fit: cover; display: block; }
    i { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font-size: 26px; text-shadow: 0 1px 4px rgba(0, 0, 0, .6); } }
.ac-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.ac-suggest { margin-top: 8px; padding: 8px 10px; border-radius: 10px; background: #f5f9ff; border: 1px solid #d9ecff; }
.ac-suggest-h { font-size: 12px; font-weight: 600; color: #409eff; margin-bottom: 4px; i { margin-right: 2px; } }
.ac-suggest-rows { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 13px; color: #303133; }
.ac-suggest-kv em { font-style: normal; font-size: 12px; color: #909399; margin-right: 4px; }
.ac-suggest-note { margin-top: 4px; font-size: 12px; color: #606266; }
.ac-suggest-btns { display: flex; gap: 6px; margin-top: 8px; .el-button + .el-button { margin-left: 0; } }
.ac-action { padding: 0 8px; border-radius: 10px; background: #f0f9eb; color: #529b2e; font-size: 11px; line-height: 18px; }
.ac-typing { display: flex; gap: 4px; padding: 12px 14px;
    span { width: 7px; height: 7px; border-radius: 50%; background: #c0c4cc; animation: ac-blink 1.2s infinite; &:nth-child(2) { animation-delay: .2s; } &:nth-child(3) { animation-delay: .4s; } } }
@keyframes ac-blink { 0%, 80%, 100% { opacity: .3; } 40% { opacity: 1; } }
.ac-compose { padding: 10px 12px; border-top: 1px solid #ebeef5; }
.ac-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.ac-chip { padding: 2px 10px; border: 1px solid #d9ecff; border-radius: 12px; background: #f5f9ff; color: #409eff; font-size: 12px; cursor: pointer; white-space: nowrap;
    &:hover { background: #ecf5ff; border-color: #409eff; } }
.ac-pending { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.ac-pend { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 10px; background: #f0f2f5; font-size: 12px; color: #606266; max-width: 100%; }
.ac-pend-size { color: #909399; }
.ac-pend-x { cursor: pointer; color: #909399; &:hover { color: #f56c6c; } }
.ac-pend-up { background: #ecf5ff; color: #409eff; }
.ac-row { display: flex; align-items: flex-end; gap: 8px; }
.ac-tools { display: flex; gap: 4px; flex-shrink: 0; .el-button + .el-button { margin-left: 0; } }
.ac-input { flex: 1; min-width: 0; }

/* inside the editor: tighter, and the narrow column gets the phone layout
   of the box (tools + icon-only Send on top, the box full width below) */
.is-compact {
    .ac-msgs { padding: 12px; gap: 8px; }
    .ac-bubble { max-width: 90%; padding: 7px 11px; font-size: 13px; border-radius: 12px; }
    .ac-thumb { width: 56px; height: 56px; }
    .ac-compose { padding: 8px 10px; }
    .ac-row { flex-wrap: wrap; align-items: center; }
    .ac-tools { order: 1; flex: 1; }
    .ac-row > .el-button { order: 2; padding: 9px 12px; span { display: none; } }
    .ac-input { order: 3; width: 100%; flex: none; }
}
/* phones: the tools and an icon-only Send share the top row, the box takes
   the full width below (clear of the app's floating chat bubble) */
@media (max-width: 600px) {
    .ac-bubble { max-width: 92%; }
    .ac-row { flex-wrap: wrap; align-items: center; }
    .ac-tools { order: 1; flex: 1; }
    .ac-row > .el-button { order: 2; padding: 9px 12px; span { display: none; } }
    .ac-input { order: 3; width: 100%; flex: none; }
    .ac-compose { padding: 8px 10px; }
}
</style>
