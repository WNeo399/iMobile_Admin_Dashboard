<template>
    <!--
        iMobile Website → Notification (user ask 2026-11-02): the popup shoppers
        see on opening the website, during its time period. Each has a title,
        an optional message and button, and how often one shopper sees it. The
        server decides what is inside its time period
        (routes/widgetRoutes/notification); Preview loads the real widget with
        what is in the form, saved or not.
    -->
    <div class="app-container wn-page">
        <div class="wn-head">
            <div>
                <div class="wn-title">{{ $tp('Notification') }}</div>
                <div class="wn-sub">{{ $tp('The popup shoppers see on opening the website, during its time period.') }}</div>
            </div>
            <div class="wn-spacer" />
            <el-button size="small" icon="el-icon-document-copy" @click="embedVisible = true">{{ $tp('Embed code') }}</el-button>
            <el-button v-if="canManage" type="primary" size="small" icon="el-icon-plus" @click="openCreate">{{ $tp('Add Notification') }}</el-button>
        </div>

        <el-alert v-if="noWebsite" type="warning" :closable="false" show-icon class="wn-alert" :title="$tp('No website is allowed yet, so nothing pops up.')">
            <router-link to="/system/widgetOrigin" class="wn-origin-link">{{ $tp('Add the website address') }} <i class="el-icon-right" /></router-link>
        </el-alert>

        <div v-loading="loading" class="wn-list">
            <div v-if="!rows.length && !loading" class="wn-empty">
                <i class="el-icon-bell" />
                <div>{{ $tp('No notifications yet') }}</div>
                <el-button v-if="canManage" type="primary" size="small" icon="el-icon-plus" @click="openCreate">{{ $tp('Add the first notification') }}</el-button>
            </div>

            <div v-for="n in sorted" :key="n._id" :class="['wn-card', 'is-' + statusOf(n).key]">
                <span class="wn-bell"><i class="el-icon-bell" /></span>
                <div class="wn-main">
                    <div class="wn-line">
                        <span class="wn-name" :title="n.title">{{ n.title }}</span>
                        <span :class="['wn-status', statusOf(n).key]">{{ $tp(statusOf(n).label) }}</span>
                    </div>
                    <div v-if="n.message" class="wn-msg" :title="n.message">{{ n.message }}</div>
                    <div class="wn-meta">
                        <span><i class="el-icon-time" /> {{ fmtWhen(n.startAt) }} → {{ fmtWhen(n.endAt) }}</span>
                        <span><i class="el-icon-refresh-right" /> {{ frequencyOf(n).label ? $tp(frequencyOf(n).label) : '' }}</span>
                        <span v-if="n.link" class="wn-link" :title="n.link"><i class="el-icon-link" /> {{ n.link }}</span>
                    </div>
                </div>
                <div class="wn-actions">
                    <el-switch :value="n.active" :disabled="!canManage || !!n.__busy" @change="v => toggleActive(n, v)" />
                    <el-button type="text" size="mini" icon="el-icon-view" @click="openPreview(n)">{{ $tp('Preview') }}</el-button>
                    <template v-if="canManage">
                        <el-button type="text" size="mini" icon="el-icon-edit" @click="openEdit(n)">{{ $tp('Edit') }}</el-button>
                        <el-button type="text" size="mini" icon="el-icon-delete" class="wn-del" @click="remove(n)">{{ $tp('Delete') }}</el-button>
                    </template>
                </div>
            </div>
        </div>

        <!-- ── Add / edit ─────────────────────────────────────────────── -->
        <el-dialog :title="form.id ? $tp('Edit Notification') : $tp('Add Notification')" :visible.sync="editVisible" width="min(620px, 96vw)" top="6vh"
            :close-on-click-modal="false">
            <el-form label-position="top" size="small" class="wn-form" @submit.native.prevent>
                <el-form-item>
                    <span slot="label">{{ $tp('Title') }} <span class="wn-req">*</span></span>
                    <el-input v-model="form.title" maxlength="120" show-word-limit />
                </el-form-item>
                <el-form-item :label="$tp('Message')">
                    <el-input v-model="form.message" type="textarea" :autosize="{ minRows: 3, maxRows: 8 }" resize="none" maxlength="1000" show-word-limit />
                </el-form-item>
                <el-form-item>
                    <span slot="label">{{ $tp('Time period') }} <span class="wn-req">*</span></span>
                    <el-date-picker v-model="form.period" type="datetimerange" format="dd/MM/yyyy HH:mm" :range-separator="'→'"
                        :start-placeholder="$tp('Start')" :end-placeholder="$tp('End')" :default-time="['00:00:00', '23:59:59']" class="wn-period" />
                    <div class="wn-hint">{{ $tp('It pops up only between these times, in your computer time zone ({zone}).', { zone: timeZone }) }}</div>
                </el-form-item>
                <el-form-item :label="$tp('Show')">
                    <el-select v-model="form.frequency" class="wn-full">
                        <el-option v-for="f in FREQUENCIES" :key="f.value" :label="$tp(f.label)" :value="f.value" />
                    </el-select>
                    <div class="wn-hint">{{ $tp(frequencyOf(form).hint) }}</div>
                </el-form-item>
                <div class="wn-row">
                    <el-form-item class="wn-col" :label="$tp('Button text')">
                        <el-input v-model="form.buttonText" maxlength="40" :placeholder="$tp(form.link ? 'Learn more' : 'Got it')" />
                    </el-form-item>
                    <el-form-item class="wn-col" :label="$tp('Button link')">
                        <el-input v-model="form.link" clearable :placeholder="$tp('Optional — https://… or a page on the website')" />
                    </el-form-item>
                </div>
                <el-checkbox v-model="form.newTab" :disabled="!form.link" class="wn-newtab">{{ $tp('Open in a new tab') }}</el-checkbox>
                <el-form-item :label="$tp('Active')">
                    <el-switch v-model="form.active" />
                    <span class="wn-hint wn-inline">{{ $tp('Notifications that are off stay here but do not pop up.') }}</span>
                </el-form-item>
            </el-form>
            <div slot="footer" class="wn-foot">
                <el-button size="small" icon="el-icon-view" @click="previewForm">{{ $tp('Preview') }}</el-button>
                <span class="wn-spacer" />
                <el-button size="small" @click="editVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button size="small" type="primary" :loading="saving" @click="save">{{ form.id ? $tp('Save') : $tp('Add Notification') }}</el-button>
            </div>
        </el-dialog>

        <!-- ── Preview: the real widget in a device-sized frame ───────── -->
        <el-dialog :title="$tp('Preview')" :visible.sync="previewVisible" width="92%" top="4vh" append-to-body @opened="fitPreview" @closed="previewSrc = ''">
            <div class="wn-pv-bar">
                <el-radio-group v-model="previewDevice" size="small" @change="fitPreview">
                    <el-radio-button v-for="f in FRAMES" :key="f.key" :label="f.key"><i :class="f.icon" /> {{ $tp(f.label) }}</el-radio-button>
                </el-radio-group>
                <span class="wn-dim">{{ frame.width }} px · {{ $tp('as the website shows it') }}</span>
                <div class="wn-spacer" />
                <el-button size="mini" icon="el-icon-refresh" @click="reloadPreview">{{ $tp('Reload') }}</el-button>
            </div>
            <el-alert v-if="previewOutside" type="info" :closable="false" show-icon class="wn-alert"
                :title="$tp('This one is outside its time period or switched off, so shoppers do not see it now.')" />
            <div ref="pvBox" class="wn-pv-box">
                <div class="wn-pv-frame" :style="{ width: frame.width * pvScale + 'px', height: frame.height * pvScale + 'px' }">
                    <iframe v-if="previewSrc" :key="previewSrc" :src="previewSrc" title="Notification preview"
                        :style="{ width: frame.width + 'px', height: frame.height + 'px', transform: 'scale(' + pvScale + ')' }" />
                </div>
            </div>
        </el-dialog>

        <!-- ── Embed code ─────────────────────────────────────────────── -->
        <el-dialog :title="$tp('Embed code')" :visible.sync="embedVisible" width="min(620px, 96vw)">
            <div class="wn-hint wn-embed-hint">{{ $tp('Paste this once in the site-wide code of the website, so it runs on every page. Nothing shows on the page itself until a notification pops up.') }}</div>
            <pre class="wn-snippet">{{ snippet }}</pre>
            <el-button size="mini" icon="el-icon-document-copy" @click="copy(snippet)">{{ $tp('Copy code') }}</el-button>

            <div class="wn-label">{{ $tp('Allowed websites') }}</div>
            <template v-if="canOrigins">
                <div v-if="originsLoading" class="wn-dim"><i class="el-icon-loading" /> {{ $tp('Loading…') }}</div>
                <template v-else>
                    <div v-for="o in origins" :key="o.origin" class="wn-origin">
                        <i :class="o.enabled ? 'el-icon-circle-check wn-ok' : 'el-icon-remove-outline wn-dim'" />
                        {{ o.origin }}<span v-if="!o.enabled" class="wn-dim"> {{ $tp('(disabled)') }}</span>
                    </div>
                    <router-link to="/system/widgetOrigin" class="wn-origin-link">{{ $tp('Manage on System → Widget Setting (Notification)') }} <i class="el-icon-right" /></router-link>
                </template>
            </template>
            <div v-else class="wn-hint">{{ $tp('Manage on System → Widget Setting (Notification)') }}</div>
        </el-dialog>
    </div>
</template>

<script>
import { listNotifications, createNotification, updateNotification, deleteNotification } from '@/api/website'
import { listWidgetOrigins } from '@/api/system/widgetOrigin'
import { hasPermission } from '@/utils/permission'

const FREQUENCIES = [
    { value: 'visit', label: 'Once per visit', hint: 'Shows again the next time they come to the website.' },
    { value: 'once', label: 'Once only', hint: 'Each shopper sees it once, then never again.' },
    { value: 'always', label: 'Every time a page opens', hint: 'Pops up on every page they open, even after closing it.' }
]
const FRAMES = [
    { key: 'desktop', label: 'Desktop', icon: 'el-icon-monitor', width: 1280, height: 720 },
    { key: 'mobile', label: 'Mobile', icon: 'el-icon-mobile-phone', width: 390, height: 720 }
]
const blankForm = () => ({ id: '', title: '', message: '', period: null, frequency: 'visit', buttonText: '', link: '', newTab: false, active: true })

// Where the backend (and so the widget script) lives: the API base when it
// is absolute (dev: http://localhost:3000, production: the Railway
// backend), else this origin.
function backendOrigin() {
    try {
        return new URL(process.env.VUE_APP_BASE_API).origin
    } catch (e) {
        return window.location.origin
    }
}

export default {
    name: 'WebsiteNotification',
    data() {
        return {
            FREQUENCIES,
            FRAMES,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            loading: false,
            rows: [],
            nowTick: Date.now(),
            editVisible: false,
            saving: false,
            form: blankForm(),
            previewVisible: false,
            previewDevice: 'desktop',
            previewData: null,
            previewOutside: false,
            previewSrc: '',
            pvScale: 1,
            embedVisible: false,
            origins: [],
            originsLoading: false
        }
    },
    computed: {
        canManage() {
            return hasPermission(this.$store.getters.permissions, 'web:notification:manage')
        },
        canOrigins() {
            return hasPermission(this.$store.getters.permissions, 'system:user:manage')
        },
        // live first, then what is coming, then the rest
        sorted() {
            return this.rows.slice().sort((a, b) => this.statusOf(a).rank - this.statusOf(b).rank || new Date(b.startAt) - new Date(a.startAt))
        },
        // nothing reaches the website until its address is on the allowlist
        noWebsite() {
            return this.canOrigins && !this.originsLoading && !this.origins.some(o => o.enabled)
        },
        frame() {
            return FRAMES.find(f => f.key === this.previewDevice)
        },
        snippet() {
            return `<script src="${backendOrigin()}/widget-assets/notification/v1.js" defer><\/script>`
        }
    },
    created() {
        this.load()
        this.loadOrigins()
        this.ticker = setInterval(() => { this.nowTick = Date.now() }, 30000)
    },
    mounted() {
        window.addEventListener('resize', this.fitPreview)
    },
    beforeDestroy() {
        clearInterval(this.ticker)
        window.removeEventListener('resize', this.fitPreview)
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await listNotifications()
                this.rows = r.rows || []
                this.nowTick = Date.now()
            } catch (e) {
                // the request layer has said why
            } finally {
                this.loading = false
            }
        },
        async loadOrigins() {
            if (!this.canOrigins) return
            this.originsLoading = true
            try {
                const r = await listWidgetOrigins({ widget: 'notification', pageSize: 100 })
                this.origins = r.data || []
            } catch (e) {
                this.origins = []
            } finally {
                this.originsLoading = false
            }
        },
        inPeriod(start, end) {
            return this.nowTick >= new Date(start).getTime() && this.nowTick <= new Date(end).getTime()
        },
        statusOf(n) {
            if (this.nowTick > new Date(n.endAt).getTime()) return { key: 'ended', label: 'Ended', rank: 3 }
            if (!n.active) return { key: 'off', label: 'Off', rank: 2 }
            if (this.inPeriod(n.startAt, n.endAt)) return { key: 'live', label: 'Live now', rank: 0 }
            return { key: 'scheduled', label: 'Scheduled', rank: 1 }
        },
        frequencyOf(n) {
            return FREQUENCIES.find(f => f.value === n.frequency) || FREQUENCIES[0]
        },
        fmtWhen(v) {
            return new Date(v).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
        },
        openCreate() {
            this.form = blankForm()
            this.editVisible = true
        },
        openEdit(n) {
            this.form = {
                ...blankForm(),
                id: n._id,
                title: n.title,
                message: n.message || '',
                period: [new Date(n.startAt), new Date(n.endAt)],
                frequency: n.frequency || 'visit',
                buttonText: n.buttonText || '',
                link: n.link || '',
                newTab: !!n.newTab,
                active: n.active !== false
            }
            this.editVisible = true
        },
        async save() {
            const f = this.form
            if (!f.title.trim()) return this.$message.warning(this.$tp('A title is required'))
            if (!f.period || !f.period[0] || !f.period[1]) return this.$message.warning(this.$tp('Set when the notification starts and ends'))
            const data = {
                title: f.title,
                message: f.message,
                startAt: f.period[0],
                endAt: f.period[1],
                frequency: f.frequency,
                buttonText: f.buttonText,
                link: f.link,
                newTab: f.newTab,
                active: f.active
            }
            this.saving = true
            try {
                if (f.id) await updateNotification(f.id, data)
                else await createNotification(data)
                this.$message.success(this.$tp('Saved'))
                this.editVisible = false
                this.load()
            } catch (e) {
                // the request layer has said why; the form stays open
            } finally {
                this.saving = false
            }
        },
        async toggleActive(n, active) {
            this.$set(n, '__busy', true)
            try {
                await updateNotification(n._id, { active })
                n.active = active
            } catch (e) {
                // the request layer has said why; the switch stays as it was
            } finally {
                n.__busy = false
            }
        },
        async remove(n) {
            try {
                await this.$confirm(this.$tp('Delete {title}?', { title: n.title }), this.$tp('Delete'),
                    { type: 'warning', confirmButtonText: this.$tp('Delete'), cancelButtonText: this.$tp('Cancel') })
            } catch (e) { return }
            try {
                await deleteNotification(n._id)
                this.$message.success(this.$tp('Deleted'))
                this.load()
            } catch (e) {
                // the request layer has said why
            }
        },
        // ── preview ──
        openPreview(n) {
            this.showPreview(n, !(n.active && this.inPeriod(n.startAt, n.endAt)))
        },
        previewForm() {
            const f = this.form
            if (!f.title.trim()) return this.$message.warning(this.$tp('A title is required'))
            this.nowTick = Date.now()
            this.showPreview(f, !(f.active && f.period && f.period[0] && this.inPeriod(f.period[0], f.period[1])))
        },
        showPreview(n, outside) {
            const { title, message, buttonText, link, newTab } = n
            this.previewData = { id: 'preview', version: '0', frequency: 'always', title, message, buttonText, link, newTab }
            this.previewOutside = outside
            this.previewVisible = true
            this.reloadPreview()
        },
        reloadPreview() {
            const q = encodeURIComponent(JSON.stringify(this.previewData))
            this.previewSrc = `${backendOrigin()}/widget-assets/notification/demo/index.html?bare=1&t=${Date.now()}&preview=${q}`
        },
        fitPreview() {
            this.$nextTick(() => {
                const box = this.$refs.pvBox
                const w = box ? box.clientWidth - 2 : this.frame.width
                this.pvScale = Math.min(1, w / this.frame.width)
            })
        },
        copy(text) {
            const done = () => this.$message.success(this.$tp('Copied'))
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text).then(done, () => this.copyFallback(text, done))
            } else {
                this.copyFallback(text, done)
            }
        },
        copyFallback(text, done) {
            const ta = document.createElement('textarea')
            ta.value = text
            ta.style.position = 'fixed'
            ta.style.opacity = '0'
            document.body.appendChild(ta)
            ta.select()
            try {
                document.execCommand('copy')
                done()
            } catch (e) {
                this.$message.error(this.$tp('Copy failed — select the code and copy it by hand'))
            }
            document.body.removeChild(ta)
        }
    }
}
</script>

<style lang="scss" scoped>
.wn-head { display: flex; align-items: flex-end; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.wn-title { font-size: 18px; font-weight: 600; color: #303133; }
.wn-sub { font-size: 12px; color: #909399; margin-top: 2px; }
.wn-spacer { flex: 1; }
.wn-alert { margin-bottom: 12px; }
.wn-list { min-height: 120px; display: flex; flex-direction: column; gap: 10px; }
.wn-empty { padding: 56px 0; text-align: center; color: #909399; font-size: 13px; display: flex; flex-direction: column; align-items: center; gap: 10px;
    i { font-size: 34px; color: #c0c4cc; } }
.wn-card { display: flex; align-items: center; gap: 14px; padding: 12px 16px; background: #fff; border: 1px solid #ebeef5; border-radius: 10px;
    &.is-ended, &.is-off { background: #fafbfc; .wn-name, .wn-msg { color: #909399; } .wn-bell { background: #f0f2f5; color: #a8b0bd; } } }
.wn-bell { flex: none; width: 38px; height: 38px; border-radius: 10px; background: #e8f2ff; color: #1890ff; font-size: 19px;
    display: flex; align-items: center; justify-content: center; }
.wn-main { flex: 1; min-width: 0; }
.wn-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.wn-name { min-width: 0; font-size: 14px; font-weight: 600; color: #303133; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wn-status { flex: none; padding: 0 8px; border-radius: 10px; font-size: 12px; line-height: 20px; background: #f0f2f5; color: #606266;
    &.live { background: #e7f7ee; color: #1a9a5a; }
    &.scheduled { background: #e8f2ff; color: #1890ff; } }
.wn-msg { margin-top: 2px; font-size: 12px; color: #606266; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wn-meta { display: flex; flex-wrap: wrap; gap: 2px 14px; margin-top: 4px; font-size: 12px; color: #909399; min-width: 0; }
.wn-link { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wn-actions { flex: none; display: flex; align-items: center; gap: 10px;
    .el-button + .el-button { margin-left: 0; } }
.wn-del { color: #f56c6c; }
.wn-form { word-break: normal; .el-form-item { margin-bottom: 12px; } }
.wn-form ::v-deep .el-form-item__label { padding-bottom: 2px; font-weight: 600; line-height: 22px; }
.wn-form ::v-deep .el-textarea__inner { font-family: Arial, Helvetica, sans-serif; /* as the inputs */ }
.wn-req { color: #f56c6c; font-weight: normal; }
.wn-period, .wn-full { width: 100%; }
.wn-period ::v-deep .el-range-separator { width: 24px; padding: 0; }
.wn-hint { font-size: 12px; line-height: 1.5; color: #909399; margin-top: 2px; }
.wn-inline { display: inline; margin-left: 10px; }
.wn-row { display: flex; gap: 12px; }
.wn-col { flex: 1; min-width: 0; }
.wn-newtab { display: block; margin: -4px 0 12px; }
.wn-foot { display: flex; align-items: center; gap: 8px;
    .el-button + .el-button { margin-left: 0; } }
.wn-dim { font-size: 12px; color: #909399; }
.wn-pv-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.wn-pv-box { background: #f5f7fa; border: 1px solid #ebeef5; border-radius: 6px; overflow: hidden; display: flex; justify-content: center; }
.wn-pv-frame { overflow: hidden; background: #fff; }
.wn-pv-frame iframe { border: 0; transform-origin: 0 0; display: block; background: #fff; }
.wn-embed-hint { margin: 0 0 8px; word-break: normal; }
.wn-snippet { background: #f5f7fa; border: 1px solid #ebeef5; border-radius: 6px; padding: 10px 12px; font-size: 12px; white-space: pre-wrap; word-break: break-all; margin: 0 0 8px; }
.wn-label { font-size: 13px; font-weight: 600; color: #303133; margin: 16px 0 6px; }
.wn-origin { font-size: 13px; color: #303133; margin: 2px 0; }
.wn-ok { color: #67c23a; }
.wn-origin-link { display: inline-block; margin-top: 6px; font-size: 12px; color: #409eff; }
@media (max-width: 767px) {
    .wn-card { flex-wrap: wrap; }
    .wn-main { flex-basis: calc(100% - 52px); }
    .wn-actions { width: 100%; justify-content: flex-end; }
    .wn-row { flex-direction: column; gap: 0; }
}
</style>
