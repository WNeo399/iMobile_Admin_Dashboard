<template>
    <div class="dl app-container">
        <div class="dl-head">
            <div class="dl-head-text">
                <div class="dl-title">{{ $tp('Defective Devices') }}</div>
                <div class="dl-sub">{{ $tp('Old or faulty items sold as they are — one listing each, drafted by the AI assistant from the photos and your notes') }}</div>
            </div>
            <span class="dl-flex" />
            <el-button v-if="canManage" size="small" type="primary" icon="el-icon-chat-line-round" @click="$router.push('/defective/new')">{{ $tp('New listing') }}</el-button>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">{{ $tp('Refresh') }}</el-button>
        </div>

        <div class="dl-bar">
            <span v-for="s in statusTabs" :key="s.value" :class="['dl-tab', { on: status === s.value }]" @click="status = s.value; page = 1; load()">
                {{ $tp(s.label) }} <b>{{ s.count }}</b>
            </span>
            <span class="dl-flex" />
            <el-select v-model="category" size="small" clearable class="dl-cat" :placeholder="$tp('All categories')" @change="page = 1; load()">
                <el-option v-for="c in meta.categories" :key="c" :label="$tp(c)" :value="c" />
            </el-select>
            <el-input v-model="search" size="small" clearable class="dl-search" prefix-icon="el-icon-search"
                :placeholder="$tp('Search listing no. / model / IMEI')" @input="onSearch" />
        </div>

        <div v-loading="loading" class="dl-body">
            <div class="dl-grid">
                <div v-for="l in rows" :key="l._id" class="dl-card" @click="openEdit(l)">
                    <div class="dl-card-media">
                        <img v-if="cover(l)" :src="cover(l)" alt="" />
                        <div v-else class="dl-card-none"><i class="el-icon-picture-outline" /></div>
                        <span :class="['dl-status', 'st-' + l.status]">{{ $tp(statusLabel(l.status)) }}</span>
                        <span v-if="(l.media || []).length" class="dl-card-count"><i class="el-icon-picture" /> {{ photoCount(l) }}<template v-if="videoCount(l)"> · <i class="el-icon-video-camera" /> {{ videoCount(l) }}</template></span>
                    </div>
                    <div class="dl-card-body">
                        <div class="dl-card-no">{{ l.listingNo }}<span v-if="l.price != null" class="dl-card-price">{{ money(l.price) }}</span></div>
                        <div class="dl-card-name" :title="l.title || deviceName(l)">{{ l.title || deviceName(l) }}</div>
                        <div class="dl-card-dev"><template v-if="l.category">{{ $tp(l.category) }} · </template>{{ deviceName(l) }}<template v-if="l.device && l.device.imei"> · {{ l.device.imei }}</template></div>
                        <div v-if="l.conditionLabel" class="dl-card-cond">{{ l.conditionLabel }}</div>
                    </div>
                </div>
            </div>
            <div v-if="!loading && !rows.length" class="dl-empty">
                <i class="el-icon-mobile-phone" />
                <div>{{ search || status ? $tp('No listings match') : $tp('No listings yet') }}</div>
            </div>
            <el-pagination v-if="total > pageSize" background small class="dl-pager" layout="total, prev, pager, next"
                :total="total" :page-size="pageSize" :current-page="page" @current-change="p => { page = p; load() }" />
        </div>

        <!-- ───────── the editor: the assistant on the left, the listing on the right ───────── -->
        <el-dialog :visible.sync="dlgVisible" width="96%" top="2vh" custom-class="dl-dialog" :fullscreen="small" :close-on-press-escape="false" @close="onClose">
            <div slot="title" class="dl-dlg-title">
                <b>{{ isNew ? $tp('New listing') : listing.listingNo }}</b>
                <span v-if="!isNew" :class="['dl-status', 'st-' + listing.status]">{{ $tp(statusLabel(listing.status)) }}</span>
                <span v-if="!isNew" class="dl-dim dl-dlg-dev">{{ deviceName(listing) }}</span>
                <span v-if="!isNew && listing.price != null" class="dl-dlg-price">{{ money(listing.price) }}</span>
            </div>

            <div class="dl-cols">
                <!-- the assistant: the same chat as the New Listing page, on this listing -->
                <div class="dl-chat">
                    <div class="dl-chat-h"><i class="el-icon-chat-line-round" /> {{ $tp('Assistant') }}
                        <span class="dl-dim">{{ $tp('ask for any change — the fields update as it works') }}</span></div>
                    <assistant-chat v-if="!isNew" ref="chat" class="dl-ac" compact :listing="listing" :meta="meta" :before-send="beforeChat"
                        :greeting="$tp('Hi! Tell me what to change or add — I update the fields and can rewrite the text')"
                        :placeholder="$tp('Type here… e.g. make the title shorter, or add that the charger is missing')"
                        @listing="onChatListing" />
                    <div v-else class="dl-dim dl-pad dl-chat-none">{{ $tp('Create the listing first — then you can chat with the assistant here') }}</div>
                </div>

                <!-- the listing -->
                <div class="dl-pane">
                    <div class="dl-col">
                        <div class="dl-sec">{{ $tp('Item') }}</div>
                        <div class="dl-form">
                            <el-select v-model="form.category" size="small" clearable :placeholder="$tp('Category')" class="dl-full">
                                <el-option v-for="c in meta.categories" :key="c" :label="$tp(c)" :value="c" />
                            </el-select>
                            <el-input v-model="form.device.brand" size="small" :placeholder="$tp('Brand')" />
                            <el-input v-model="form.device.series" size="small" :placeholder="$tp('Series (optional), such as iPhone 14 or Galaxy S')" />
                            <el-input v-model="form.device.model" size="small" :placeholder="$tp('Model (required)')" />
                            <el-input v-model="form.device.storage" size="small" :placeholder="$tp('Storage')" />
                            <el-input v-model="form.device.color" size="small" :placeholder="$tp('Colour')" />
                        </div>
                        <div class="dl-form dl-form-2">
                            <el-input v-model="form.price" size="small" type="number" min="0" step="0.01" :placeholder="$tp('Price (AUD inc GST)')"><template slot="prepend">$</template></el-input>
                            <el-input v-model="form.included" size="small" :placeholder="$tp('What\'s included, e.g. device only')" />
                        </div>
                        <el-button type="text" size="mini" class="dl-more" :icon="moreOpen ? 'el-icon-arrow-up' : 'el-icon-arrow-down'" @click="moreOpen = !moreOpen">
                            {{ moreOpen ? $tp('Fewer details') : $tp('More details') }} <span class="dl-dim">{{ $tp('IMEI, serial, model number, battery health') }}</span></el-button>
                        <div v-show="moreOpen" class="dl-form">
                            <el-input v-model="form.device.imei" size="small" :placeholder="$tp('IMEI (optional)')" />
                            <el-input v-model="form.device.serialNumber" size="small" :placeholder="$tp('Serial number (optional)')" />
                            <el-input v-model="form.device.modelNumber" size="small" :placeholder="$tp('Model number, e.g. A2172')" />
                            <el-input v-model="form.device.batteryHealth" size="small" type="number" :placeholder="$tp('Battery health %')" />
                        </div>

                        <!-- the findings: free-form, the assistant fills them from the description; staff can edit -->
                        <div class="dl-sec">{{ $tp('What works and what is faulty') }} <span class="dl-dim">{{ $tp('the assistant fills this in from your description — edit if needed') }}</span></div>
                        <div class="dl-check">
                            <div v-for="(f, i) in form.faults" :key="i" class="dl-check-row">
                                <el-input v-model="f.label" size="mini" class="dl-check-label" :placeholder="$tp('Part or function, such as Screen')" />
                                <el-radio-group v-model="f.state" size="mini">
                                    <el-radio-button label="ok">{{ $tp('ok') }}</el-radio-button>
                                    <el-radio-button label="faulty">{{ $tp('faulty') }}</el-radio-button>
                                    <el-radio-button label="unknown">{{ $tp('unknown') }}</el-radio-button>
                                </el-radio-group>
                                <el-button type="text" icon="el-icon-close" class="dl-check-x" :title="$tp('Remove')" @click="form.faults.splice(i, 1)" />
                                <el-input v-model="f.note" size="mini" class="dl-check-note" :placeholder="$tp('What exactly?')" />
                            </div>
                            <div v-if="!form.faults.length" class="dl-dim dl-pad">{{ $tp('Nothing recorded yet — describe the item in the note below and let the assistant fill this in, or add items here') }}</div>
                            <el-button type="text" size="mini" icon="el-icon-plus" @click="form.faults.push({ label: '', state: 'faulty', note: '' })">{{ $tp('Add item') }}</el-button>
                        </div>

                        <div class="dl-sec">{{ $tp('Note for the assistant') }}</div>
                        <el-input v-model="form.note" type="textarea" :autosize="{ minRows: 3, maxRows: 8 }" resize="none"
                            :placeholder="$tp('Anything the buyer should know: what happened to it, what you tested, what\'s in the box…')" />
                    </div>

                    <div class="dl-col">
                        <div class="dl-sec">{{ $tp('Photos and video') }}
                            <span v-if="!isNew" class="dl-dim">{{ (listing.media || []).length }} / {{ meta.limits.maxPhotos }}</span></div>
                        <div v-if="isNew" class="dl-dim dl-pad">{{ $tp('Save the device first, then add photos and a video') }}</div>
                        <template v-else>
                            <div v-if="!meta.mediaConfigured" class="dl-warn"><i class="el-icon-warning" /> {{ $tp('The media bucket is not set up on the server — photos and videos cannot be uploaded yet') }}</div>
                            <div class="dl-media">
                                <div v-for="(m, i) in listing.media" :key="m.id" class="dl-m">
                                    <el-image v-if="m.kind === 'photo'" :src="m.thumbUrl || m.url" fit="cover" class="dl-m-img" :preview-src-list="photoUrls" />
                                    <a v-else :href="m.url" target="_blank" rel="noopener" class="dl-m-video" :title="$tp('Open the video')">
                                        <img v-if="m.poster" :src="m.poster.thumbUrl || m.poster.url" alt="" />
                                        <i class="el-icon-video-play" />
                                        <span v-if="m.duration" class="dl-m-dur">{{ dur(m.duration) }}</span>
                                    </a>
                                    <span v-if="i === 0" class="dl-m-cover">{{ $tp('Cover') }}</span>
                                    <div v-if="canManage && !frozen" class="dl-m-tools">
                                        <i class="el-icon-arrow-left" :class="{ off: i === 0 }" @click="moveMedia(i, -1)" />
                                        <i class="el-icon-arrow-right" :class="{ off: i === listing.media.length - 1 }" @click="moveMedia(i, 1)" />
                                        <i class="el-icon-delete" @click="removeMedia(m)" />
                                    </div>
                                </div>
                                <div v-if="videoUpload" class="dl-m dl-m-up">
                                    <el-progress type="circle" :percentage="videoUpload.pct" :width="64" :stroke-width="5" />
                                    <div class="dl-dim">{{ videoUpload.label }}</div>
                                </div>
                                <template v-if="canManage && !frozen && meta.mediaConfigured && (listing.media || []).length < meta.limits.maxPhotos">
                                    <div :class="['dl-m dl-m-add', { over }]" @click="$refs.photos.click()"
                                        @dragover.prevent="over = true" @dragleave="over = false" @drop.prevent="onDropPhotos">
                                        <i class="el-icon-plus" /><span>{{ uploadingPhotos ? $tp('Uploading…') : $tp('Photos') }}</span>
                                    </div>
                                    <div class="dl-m dl-m-add" @click="$refs.video.click()">
                                        <i class="el-icon-video-camera" /><span>{{ $tp('Video') }}</span>
                                    </div>
                                    <div class="dl-m dl-m-add dl-m-cam" @click="openCamera('photo')">
                                        <i class="el-icon-camera" /><span>{{ $tp('Camera') }}</span>
                                    </div>
                                    <div class="dl-m dl-m-add dl-m-cam" @click="openCamera('video')">
                                        <i class="el-icon-video-camera-solid" /><span>{{ $tp('Record') }}</span>
                                    </div>
                                </template>
                            </div>
                            <input ref="photos" type="file" accept="image/*" multiple class="dl-hidden" @change="onPickPhotos" />
                            <input ref="video" type="file" :accept="meta.limits.videoTypes.join(',')" class="dl-hidden" @change="onPickVideo" />
                            <input ref="camPhoto" type="file" accept="image/*" capture="environment" class="dl-hidden" @change="onPickPhotos" />
                            <input ref="camVideo" type="file" accept="video/*" capture="environment" class="dl-hidden" @change="onPickVideo" />
                            <camera-capture v-model="cam.open" :mode="cam.mode" :max-seconds="maxSeconds" @done="onCamera" @fallback="camFallback" />
                            <div class="dl-dim">{{ $tp('Photos are shrunk to about 1 MB; a video is {n} seconds and 5 MB at most (mp4, mov or webm). The first item is the cover.', { n: maxSeconds }) }}</div>
                        </template>

                        <div class="dl-sec">{{ $tp('Listing text') }}</div>
                        <div v-if="questions.length" class="dl-q">
                            <div class="dl-q-h">{{ $tp('The assistant could not tell:') }}</div>
                            <ul><li v-for="(q, i) in questions" :key="i">{{ q }}</li></ul>
                        </div>
                        <el-input v-model="form.title" size="small" maxlength="120" show-word-limit :placeholder="$tp('Title')" class="dl-gap" />
                        <el-input v-model="form.summary" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" resize="none" maxlength="300" show-word-limit :placeholder="$tp('Summary — the first thing a buyer reads')" class="dl-gap" />
                        <el-select v-model="form.conditionLabel" size="small" clearable :placeholder="$tp('Condition')" class="dl-gap dl-full">
                            <el-option v-for="c in meta.conditions" :key="c" :label="c" :value="c" />
                        </el-select>
                        <div v-for="p in parts" :key="p.key" class="dl-part">
                            <div class="dl-part-h">{{ $tp(p.label) }}</div>
                            <el-input v-model="form.description[p.key]" type="textarea" :autosize="{ minRows: 2, maxRows: 10 }" resize="none" :placeholder="$tp(p.hint)" />
                        </div>
                    </div>
                </div>
            </div>

            <div slot="footer" class="dl-foot">
                <template v-if="!isNew && canManage">
                    <el-button v-if="listing.status === 'draft' && !listing.publishedAt" size="small" type="text" class="dl-danger" @click="del">{{ $tp('Delete') }}</el-button>
                    <el-button v-for="to in moves" :key="to" size="small" :type="to === 'published' ? 'success' : to === 'sold' ? 'warning' : ''" plain :disabled="dirty" @click="setStatus(to)">{{ $tp(moveLabel(to)) }}</el-button>
                    <span v-if="dirty && moves.length" class="dl-dim">{{ $tp('Save to change the status') }}</span>
                </template>
                <span class="dl-flex" />
                <span v-if="dirty" class="dl-dim">{{ $tp('Unsaved changes') }}</span>
                <el-button size="small" @click="dlgVisible = false">{{ $tp('Close') }}</el-button>
                <el-button v-if="canManage && !frozen" size="small" type="primary" :loading="saving" :disabled="!dirty && !isNew" @click="save">{{ isNew ? $tp('Create') : $tp('Save') }}</el-button>
            </div>
        </el-dialog>

        <!-- mark sold -->
        <el-dialog :title="$tp('Mark as sold')" :visible.sync="soldVisible" width="420px" append-to-body>
            <el-form label-width="110px" size="small">
                <el-form-item :label="$tp('Sold price')"><el-input v-model="soldForm.price" type="number" min="0"><template slot="prepend">$</template></el-input></el-form-item>
                <el-form-item :label="$tp('Channel')"><el-input v-model="soldForm.channel" :placeholder="$tp('e.g. website, walk-in')" /></el-form-item>
                <el-form-item :label="$tp('Note')"><el-input v-model="soldForm.note" type="textarea" :rows="2" /></el-form-item>
            </el-form>
            <span slot="footer">
                <el-button size="small" @click="soldVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button size="small" type="warning" :loading="statusBusy" @click="confirmSold">{{ $tp('Mark as sold') }}</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import {
    getDefectiveMeta, listDefectiveListings, getDefectiveListing, createDefectiveListing, updateDefectiveListing, deleteDefectiveListing,
    orderDefectiveMedia, deleteDefectiveMedia, setDefectiveStatus
} from '@/api/defective'
import { hasPermission } from '@/utils/permission'
import { uploadPhotos as uploadPhotoFiles, uploadVideo as uploadVideoFile } from './mediaUpload'
import { compressImage, prepareVideo, videoProblem, canOpenCamera } from './media'
import AssistantChat from './AssistantChat.vue'
import CameraCapture from './CameraCapture.vue'

const STATUS_LABELS = { draft: 'Draft', ready: 'Ready', published: 'Published', sold: 'Sold', withdrawn: 'Withdrawn' }
const MOVE_LABELS = { draft: 'Back to draft', ready: 'Mark ready', published: 'Publish', sold: 'Mark as sold', withdrawn: 'Withdraw' }
const PARTS = [
    { key: 'works', label: 'What works', hint: 'Only what was tested and works' },
    { key: 'faults', label: 'Known faults', hint: 'Every fault, plainly' },
    { key: 'included', label: "What's included", hint: 'Only if something comes with it — empty means the item alone' },
    { key: 'condition', label: 'Item description', hint: 'The item as you described it — nothing more' }
]
const blankForm = () => ({
    device: { brand: '', series: '', model: '', storage: '', color: '', imei: '', serialNumber: '', modelNumber: '', batteryHealth: '' },
    category: '', faults: [], note: '', included: '', price: '',
    title: '', summary: '', conditionLabel: '', description: { works: '', faults: '', included: '', condition: '' }
})

export default {
    name: 'DefectiveListings',
    components: { AssistantChat, CameraCapture },
    data() {
        return {
            meta: { conditions: [], categories: [], statuses: [], moves: {}, limits: { maxPhotos: 12, maxVideoBytes: 300e6, videoTypes: ['video/mp4'] }, mediaConfigured: false, aiConfigured: false },
            loading: false, rows: [], total: 0, counts: {}, page: 1, pageSize: 24, status: '', category: '', search: '', searchTimer: null,
            dlgVisible: false, isNew: true, listing: {}, form: blankForm(), savedJson: '', saving: false, moreOpen: false,
            over: false, uploadingPhotos: false, videoUpload: null, cam: { open: false, mode: 'photo' }, small: false,
            soldVisible: false, soldForm: { price: '', channel: '', note: '' }, statusBusy: false,
            parts: PARTS
        }
    },
    computed: {
        canManage() { return hasPermission(this.$store.getters.permissions, 'defect:listing:manage') },
        statusTabs() {
            const all = Object.values(this.counts).reduce((t, n) => t + n, 0)
            return [{ value: '', label: 'All', count: all }, ...Object.keys(STATUS_LABELS).map(s => ({ value: s, label: STATUS_LABELS[s], count: this.counts[s] || 0 }))]
        },
        dirty() { return JSON.stringify(this.form) !== this.savedJson },
        frozen() { return !this.isNew && this.listing.status === 'sold' },
        moves() { return this.isNew ? [] : (this.meta.moves[this.listing.status] || []) },
        photoUrls() { return (this.listing.media || []).filter(m => m.kind === 'photo').map(m => m.url) },
        maxSeconds() { return this.meta.limits.maxVideoSeconds || 10 },
        questions() { const d = this.listing && this.listing.ai && this.listing.ai.draft; return (d && d.openQuestions) || [] }
    },
    async created() {
        try {
            const r = await getDefectiveMeta()
            if (r && r.success !== false) this.meta = { ...this.meta, ...r }
        } catch (e) { /* the page still lists */ }
        this.load()
        if (this.$route.query.open) this.openById(this.$route.query.open)
    },
    beforeDestroy() { clearTimeout(this.searchTimer) },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await listDefectiveListings({ status: this.status || undefined, category: this.category || undefined, q: this.search.trim() || undefined, page: this.page, pageSize: this.pageSize })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.rows = r.rows || []; this.total = r.total || 0; this.counts = r.counts || {}
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load the listings')))
            } finally { this.loading = false }
        },
        onSearch() { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => { this.page = 1; this.load() }, 350) },

        // ── the editor ──
        async openById(id) {
            try {
                const r = await getDefectiveListing(id)
                if (r && r.success !== false) this.openEdit(r.listing)
            } catch (e) { this.$message.error(this.msg(e, this.$tp('Failed to load the listing'))) }
        },
        async openEdit(row) {
            this.isNew = false
            this.small = window.innerWidth < 900   // phones and small tablets get the dialog full screen
            this.applyListing(row); this.dlgVisible = true
            try {
                // the full listing: the list rows carry no text, note or chat
                const r = await getDefectiveListing(row._id)
                if (r && r.success !== false) this.applyListing(r.listing)
            } catch (e) { this.$message.error(this.msg(e, this.$tp('Failed to load the listing'))) }
        },
        applyListing(l) {
            this.listing = l
            const d = l.device || {}
            this.form = {
                device: { brand: d.brand || '', series: d.series || '', model: d.model || '', storage: d.storage || '', color: d.color || '', imei: d.imei || '', serialNumber: d.serialNumber || '', modelNumber: d.modelNumber || '', batteryHealth: d.batteryHealth == null ? '' : d.batteryHealth },
                category: l.category || '',
                faults: (l.faults || []).map(f => ({ label: f.label || '', state: f.state || 'unknown', note: f.note || '' })),
                note: l.note || '', included: l.included || '', price: l.price == null ? '' : l.price,
                title: l.title || '', summary: l.summary || '', conditionLabel: l.conditionLabel || '',
                description: { works: '', faults: '', included: '', condition: '', ...(l.description || {}) }
            }
            this.savedJson = JSON.stringify(this.form)
            if (d.imei || d.serialNumber || d.modelNumber || d.batteryHealth != null) this.moreOpen = true
        },
        onClose() { this.videoUpload = null; this.moreOpen = false; if (!this.isNew) this.load() },
        payload() {
            const f = this.form
            return { ...f, device: { ...f.device, batteryHealth: f.device.batteryHealth === '' ? null : Number(f.device.batteryHealth) }, price: f.price === '' ? null : Number(f.price) }
        },
        async save() {
            if (!String(this.form.device.model || '').trim()) { this.$message.warning(this.$tp('Enter the device model')); return }
            this.saving = true
            try {
                const r = this.isNew ? await createDefectiveListing(this.payload()) : await updateDefectiveListing(this.listing._id, this.payload())
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                const wasNew = this.isNew
                this.isNew = false
                this.applyListing(r.listing)
                this.$message.success(wasNew ? this.$tp('{no} created — now add photos and a video', { no: r.listing.listingNo }) : this.$tp('Saved'))
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save')))
            } finally { this.saving = false }
        },
        async del() {
            try { await this.$confirm(this.$tp('Delete {no}? It was never published.', { no: this.listing.listingNo }), this.$tp('Delete'), { type: 'warning', confirmButtonText: this.$tp('Delete'), cancelButtonText: this.$tp('Cancel') }) } catch (e) { return }
            try {
                const r = await deleteDefectiveListing(this.listing._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.dlgVisible = false; this.$message.success(this.$tp('Deleted'))
            } catch (e) { this.$message.error(this.msg(e, this.$tp('Failed to delete'))) }
        },

        // ── the assistant: it works on the saved listing, so unsaved edits go first ──
        async beforeChat() {
            if (!this.dirty) return true
            await this.save()
            return !this.dirty
        },
        onChatListing(l) { this.applyListing(l) },

        // ── photos ──
        onPickPhotos(e) { const files = [...(e.target.files || [])]; e.target.value = ''; this.uploadPhotos(files) },
        onDropPhotos(e) { this.over = false; this.uploadPhotos([...(e.dataTransfer.files || [])].filter(f => /^image\//.test(f.type))) },
        async uploadPhotos(files) {
            if (!files.length) return
            const room = this.meta.limits.maxPhotos - (this.listing.media || []).length
            if (files.length > room) { this.$message.warning(this.$tp('Only {n} more can be added', { n: room })); files = files.slice(0, room) }
            if (!files.length) return
            this.uploadingPhotos = true
            try {
                files = await Promise.all(files.map(f => compressImage(f)))   // under ~1 MB each
                const added = await uploadPhotoFiles(this.listing._id, files)
                this.listing.media = [...(this.listing.media || []), ...added]
                this.$message.success(this.$tp('{n} photos added', { n: added.length }))
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to upload the photos')))
            } finally { this.uploadingPhotos = false }
        },
        // ── video: signed PUT straight to the bucket, then the cover frame (./mediaUpload) ──
        onPickVideo(e) { const file = e.target.files && e.target.files[0]; e.target.value = ''; if (file) this.uploadVideo(file) },
        // a recorded video is within the limits already; a picked one is checked and shrunk when the browser can
        async uploadVideo(file, recorded) {
            if (!this.meta.limits.videoTypes.includes(file.type)) { this.$message.warning(this.$tp('Videos must be mp4, mov or webm')); return }
            this.videoUpload = { pct: 0, label: this.$tp('Preparing…') }
            try {
                if (!recorded) file = await prepareVideo(file, { maxSeconds: this.maxSeconds, target: this.meta.limits.maxVideoBytes, onProgress: pct => { this.videoUpload = { pct, label: this.$tp('Preparing…') } } })
                const added = await uploadVideoFile(this.listing._id, file, { onProgress: (pct, label) => { this.videoUpload = { pct, label: this.$tp(label) } } })
                this.listing.media = [...(this.listing.media || []), added]
                this.$message.success(this.$tp('Video added'))
            } catch (e) {
                this.$message.error(e && e.code ? videoProblem(e, this.$tp, this.maxSeconds) : this.msg(e, this.$tp('Failed to upload the video')))
            } finally { this.videoUpload = null }
        },
        // the device's camera (in the page when the browser allows it, else the phone's own camera app)
        openCamera(mode) { if (canOpenCamera()) this.cam = { open: true, mode }; else this.camFallback(mode) },
        camFallback(mode) { const i = this.$refs[mode === 'video' ? 'camVideo' : 'camPhoto']; if (i) i.click() },
        onCamera(file) { if (file.type.startsWith('video/')) this.uploadVideo(file, true); else this.uploadPhotos([file]) },
        async moveMedia(i, dir) {
            const list = [...this.listing.media]; const j = i + dir
            if (j < 0 || j >= list.length) return
            ;[list[i], list[j]] = [list[j], list[i]]
            try {
                const r = await orderDefectiveMedia(this.listing._id, list.map(m => m.id))
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.listing.media = list
            } catch (e) { this.$message.error(this.msg(e, this.$tp('Failed to reorder'))) }
        },
        async removeMedia(m) {
            try { await this.$confirm(this.$tp('Remove this {kind}?', { kind: this.$tp(m.kind) }), this.$tp('Remove'), { type: 'warning', confirmButtonText: this.$tp('Remove'), cancelButtonText: this.$tp('Cancel') }) } catch (e) { return }
            try {
                const r = await deleteDefectiveMedia(this.listing._id, m.id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.listing.media = this.listing.media.filter(x => x.id !== m.id)
            } catch (e) { this.$message.error(this.msg(e, this.$tp('Failed to remove'))) }
        },

        // ── status ──
        moveLabel(to) { return MOVE_LABELS[to] || to },
        statusLabel(s) { return STATUS_LABELS[s] || s },
        async setStatus(to) {
            if (to === 'sold') { this.soldForm = { price: this.listing.price == null ? '' : this.listing.price, channel: '', note: '' }; this.soldVisible = true; return }
            let note = ''
            if (to === 'withdrawn') {
                try { const r = await this.$prompt(this.$tp('Why is {no} withdrawn? (optional)', { no: this.listing.listingNo }), this.$tp('Withdraw'), { inputType: 'textarea', confirmButtonText: this.$tp('Withdraw'), cancelButtonText: this.$tp('Cancel') }); note = (r && r.value) || '' } catch (e) { return }
            }
            await this.applyStatus({ to, note })
        },
        async confirmSold() { await this.applyStatus({ to: 'sold', sold: { price: this.soldForm.price === '' ? null : Number(this.soldForm.price), channel: this.soldForm.channel, note: this.soldForm.note } }); this.soldVisible = false },
        async applyStatus(data) {
            this.statusBusy = true
            try {
                const r = await setDefectiveStatus(this.listing._id, data)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.applyListing(r.listing)
                this.$message.success(this.$tp('{no} is now {status}', { no: r.listing.listingNo, status: this.$tp(this.statusLabel(r.listing.status)) }))
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to change the status')))
            } finally { this.statusBusy = false }
        },

        // ── helpers ──
        deviceName(l) { const d = (l && l.device) || {}; return [d.brand, d.model, d.storage, d.color].filter(Boolean).join(' ') || '—' },
        cover(l) { const m = (l.media || [])[0]; if (!m) return ''; return m.kind === 'photo' ? (m.thumbUrl || m.url) : (m.poster ? (m.poster.thumbUrl || m.poster.url) : '') },
        photoCount(l) { return (l.media || []).filter(m => m.kind === 'photo').length },
        videoCount(l) { return (l.media || []).filter(m => m.kind === 'video').length },
        money(v) { const n = Number(v); return isFinite(n) ? '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '' },
        dur(s) { const n = Math.round(Number(s) || 0); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}` },
        msg(e, fallback) { return (e.response && e.response.data && e.response.data.message) || e.message || fallback }
    }
}
</script>

<style lang="scss" scoped>
.dl { padding: 14px 16px; }
.dl-flex { flex: 1; }
.dl-dim { font-size: 12px; color: #909399; font-weight: normal; }
.dl-pad { padding: 8px 0; }
.dl-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.dl-head-text { min-width: 0; }
.dl-title { font-size: 17px; font-weight: 600; color: #303133; }
.dl-sub { font-size: 13px; color: #909399; margin-top: 3px; }
.dl-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 12px; }
.dl-tab { padding: 5px 12px; border: 1px solid #dcdfe6; border-radius: 16px; font-size: 13px; color: #606266; cursor: pointer; white-space: nowrap; background: #fff;
    b { font-weight: 600; color: #909399; margin-left: 3px; }
    &:hover { border-color: #b3d8ff; color: #409eff; }
    &.on { border-color: #409eff; background: #ecf5ff; color: #409eff; b { color: #409eff; } } }
.dl-search { width: 260px; max-width: 100%; }
.dl-cat { width: 170px; }
.dl-body { min-height: 160px; }
.dl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
.dl-card { border: 1px solid #ebeef5; border-radius: 8px; background: #fff; overflow: hidden; cursor: pointer; transition: box-shadow .15s, border-color .15s;
    &:hover { border-color: #d9ecff; box-shadow: 0 2px 10px rgba(0, 0, 0, .06); } }
.dl-card-media { position: relative; aspect-ratio: 4 / 3; background: #f5f7fa;
    img { width: 100%; height: 100%; object-fit: cover; display: block; } }
.dl-card-none { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 34px; color: #c0c4cc; }
.dl-card-count { position: absolute; right: 8px; bottom: 8px; padding: 1px 7px; border-radius: 10px; background: rgba(0, 0, 0, .55); color: #fff; font-size: 11px; }
.dl-status { position: absolute; left: 8px; top: 8px; padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; color: #fff; background: #909399;
    &.st-ready { background: #409eff; } &.st-published { background: #67c23a; } &.st-sold { background: #e6a23c; } &.st-withdrawn { background: #f56c6c; } }
.dl-dlg-title .dl-status { position: static; margin: 0 8px; }
.dl-card-body { padding: 10px 12px; }
.dl-card-no { display: flex; align-items: baseline; font-size: 12px; font-weight: 600; color: #909399; }
.dl-card-price { margin-left: auto; font-size: 14px; color: #303133; }
.dl-card-name { margin-top: 2px; font-size: 13px; font-weight: 600; color: #303133; line-height: 1.35; word-break: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.dl-card-dev { margin-top: 2px; font-size: 12px; color: #606266; }
.dl-card-cond { margin-top: 4px; font-size: 11px; color: #b88200; }
.dl-empty { padding: 50px 0; text-align: center; color: #909399; font-size: 13px; i { display: block; font-size: 36px; color: #c0c4cc; margin-bottom: 8px; } }
.dl-pager { margin-top: 12px; text-align: right; }
.dl-hidden { display: none; }

/* the editor */
::v-deep .dl-dialog { max-width: 1280px; margin-bottom: 2vh;
    .el-dialog__header { padding: 14px 20px 10px; border-bottom: 1px solid #ebeef5; }
    .el-dialog__body { padding: 14px 20px; }
    .el-dialog__footer { padding: 10px 20px 14px; border-top: 1px solid #ebeef5; } }
.dl-dlg-title { display: flex; align-items: center; gap: 4px; padding-right: 28px; font-size: 15px; b { font-size: 16px; } }
.dl-dlg-dev { font-size: 13px; }
.dl-dlg-price { margin-left: auto; font-size: 15px; font-weight: 600; color: #303133; }
.dl-cols { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 16px; height: calc(100vh - 215px); min-height: 480px; }
.dl-chat { display: flex; flex-direction: column; min-height: 0; border: 1px solid #ebeef5; border-radius: 10px; overflow: hidden; background: #fff; }
.dl-chat-h { padding: 8px 12px; border-bottom: 1px solid #ebeef5; font-size: 13px; font-weight: 600; color: #303133; i { color: #409eff; margin-right: 2px; } }
.dl-ac { flex: 1; min-height: 0; }
.dl-chat-none { padding: 14px; }
.dl-pane { min-height: 0; overflow-y: auto; padding-right: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; align-content: start; }
.dl-col { min-width: 0; }
.dl-sec { margin: 14px 0 8px; font-size: 13px; font-weight: 600; color: #303133; &:first-child { margin-top: 0; } }
.dl-form { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.dl-form-2 { margin-top: 6px; }
.dl-more { padding: 6px 0 2px; }
.dl-gap { margin-bottom: 6px; }
.dl-full { width: 100%; }
.dl-check { border: 1px solid #ebeef5; border-radius: 6px; padding: 4px 10px; }
.dl-check-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 4px 0; & + & { border-top: 1px dashed #f0f2f5; } }
.dl-check-label { flex: 1; min-width: 150px; }
.dl-check-x { padding: 0 4px; color: #909399; &:hover { color: #c45656; } }
.dl-check-note { width: 100%; }
.dl-warn { margin-bottom: 8px; padding: 6px 10px; border-radius: 4px; background: #fdf6ec; color: #b88200; font-size: 12px; }
.dl-q { margin: 0 0 8px; padding: 8px 10px; border-radius: 6px; background: #fdf6ec; font-size: 12px; color: #303133; ul { margin: 4px 0 0; padding-left: 18px; } }
.dl-q-h { font-weight: 600; }
.dl-media { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; margin-bottom: 6px; }
.dl-m { position: relative; aspect-ratio: 1; border: 1px solid #ebeef5; border-radius: 6px; overflow: hidden; background: #f5f7fa;
    &:hover .dl-m-tools { opacity: 1; } }
.dl-m-img { width: 100%; height: 100%; display: block; }
.dl-m-video { display: block; width: 100%; height: 100%; position: relative; color: #fff;
    img { width: 100%; height: 100%; object-fit: cover; display: block; }
    i { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font-size: 34px; text-shadow: 0 1px 4px rgba(0, 0, 0, .6); color: #fff; } }
.dl-m-dur { position: absolute; right: 5px; bottom: 5px; padding: 0 5px; border-radius: 3px; background: rgba(0, 0, 0, .6); font-size: 11px; }
.dl-m-cover { position: absolute; left: 5px; top: 5px; padding: 0 6px; border-radius: 8px; background: rgba(0, 0, 0, .55); color: #fff; font-size: 10px; font-weight: 600; }
.dl-m-tools { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; gap: 10px; padding: 4px; background: rgba(0, 0, 0, .55); color: #fff; opacity: 0; transition: opacity .15s;
    i { cursor: pointer; font-size: 14px; &.off { opacity: .3; pointer-events: none; } &:hover { color: #ffd04b; } } }
.dl-m-add { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border-style: dashed; cursor: pointer; color: #909399; font-size: 12px;
    i { font-size: 20px; } &:hover, &.over { border-color: #409eff; color: #409eff; background: #ecf5ff; } }
.dl-m-up { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
.dl-part { margin-top: 6px; }
.dl-part-h { font-size: 12px; font-weight: 600; color: #606266; margin-bottom: 3px; }
.dl-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dl-danger { color: #f56c6c; }
@media (max-width: 1100px) {
    .dl-cols { grid-template-columns: minmax(0, 1fr); height: auto; }
    .dl-chat { height: 420px; }
    .dl-pane { overflow: visible; padding-right: 0; }
}
@media (max-width: 760px) {
    .dl-pane { grid-template-columns: minmax(0, 1fr); }
    .dl-form { grid-template-columns: minmax(0, 1fr); }
    .dl-media { grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); }
    .dl-foot { gap: 6px; .el-button + .el-button { margin-left: 0; } }
    .dl-dlg-title { flex-wrap: wrap; }
}
/* the dialog full screen (phones): everything stacks and the page scrolls */
::v-deep .dl-dialog.is-fullscreen {
    .el-dialog__body { padding: 10px 12px; }
    .dl-cols { grid-template-columns: minmax(0, 1fr); height: auto; min-height: 0; }
    .dl-chat { height: 55vh; min-height: 320px; }
    .dl-pane { overflow: visible; padding-right: 0; }
}
</style>
