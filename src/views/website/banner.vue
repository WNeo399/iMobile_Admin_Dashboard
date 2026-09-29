<template>
    <!--
        iMobile Website → Banner: the banners of the carousel widget on the
        iMobile website. Each banner = a desktop, tablet and mobile image and
        an optional link; the active ones show in this list's order (drag to
        reorder). Preview loads the real widget in device-sized frames; Embed
        code gives the snippet for the website.
    -->
    <div class="app-container wb-page">
        <div class="wb-head">
            <div>
                <div class="wb-title">Banner</div>
                <div class="wb-sub">
                    The carousel on the iMobile website. Active banners show in this order<span v-if="canManage"> — drag to reorder</span>.
                </div>
            </div>
            <div class="wb-spacer" />
            <el-button size="small" icon="el-icon-view" :disabled="!activeRows.length" @click="openPreview">Preview</el-button>
            <el-button size="small" icon="el-icon-document-copy" @click="openEmbed">Embed code</el-button>
            <el-button v-if="canManage" type="primary" size="small" icon="el-icon-plus" @click="openCreate">Add Banner</el-button>
        </div>

        <div v-loading="loading" class="wb-list">
            <div v-if="!rows.length && !loading" class="wb-empty">
                <i class="el-icon-picture-outline" />
                <div>No banners yet.</div>
                <el-button v-if="canManage" type="primary" size="small" icon="el-icon-plus" @click="openCreate">Add the first banner</el-button>
            </div>

            <draggable v-model="rows" handle=".wb-handle" :disabled="!canManage" :animation="180"
                ghost-class="wb-ghost" @end="onDragEnd">
                <div v-for="(b, i) in rows" :key="b._id" class="wb-card" :class="{ 'is-off': !b.active }">
                    <div v-if="canManage" class="wb-handle" title="Drag to reorder"><i class="el-icon-rank" /></div>
                    <div class="wb-no">{{ b.active ? slotOf(b) : '–' }}</div>

                    <div class="wb-thumbs">
                        <figure v-for="d in DEVICES" :key="d.key" class="wb-thumb">
                            <div class="wb-thumb-img">
                                <img v-if="b.images && b.images[d.key]" :src="b.images[d.key].url" :alt="d.label" loading="lazy">
                            </div>
                            <figcaption>
                                <i :class="d.icon" /> {{ d.label }}
                                <span class="wb-dim">{{ dims(b.images && b.images[d.key]) }}</span>
                                <el-tooltip v-if="shapeWarning(b, d.key)" :content="shapeWarning(b, d.key)" placement="top">
                                    <i class="el-icon-warning wb-warn" />
                                </el-tooltip>
                            </figcaption>
                        </figure>
                    </div>

                    <div class="wb-meta">
                        <div class="wb-name" :title="b.title">{{ b.title }}</div>
                        <div class="wb-link">
                            <template v-if="b.link">
                                <i class="el-icon-link" />
                                <a :href="b.link" target="_blank" rel="noopener" :title="b.link">{{ b.link }}</a>
                                <el-tag v-if="b.newTab" size="mini" type="info">new tab</el-tag>
                            </template>
                            <span v-else class="wb-dim">No link</span>
                        </div>
                        <div class="wb-dim wb-by">
                            Updated {{ fmtWhen(b.updatedAt) }}<span v-if="b.updatedBy"> · {{ b.updatedBy }}</span>
                        </div>
                    </div>

                    <div class="wb-actions">
                        <el-tooltip :content="b.active ? 'Showing on the website' : 'Hidden from the website'" placement="top">
                            <el-switch :value="b.active" :disabled="!canManage || b.__busy" @change="v => toggleActive(b, v)" />
                        </el-tooltip>
                        <template v-if="canManage">
                            <el-button type="text" size="mini" icon="el-icon-edit" @click="openEdit(b)">Edit</el-button>
                            <el-button type="text" size="mini" icon="el-icon-delete" class="wb-del" @click="remove(b)">Delete</el-button>
                        </template>
                    </div>
                </div>
            </draggable>
        </div>

        <!-- ── Add / edit ─────────────────────────────────────────────── -->
        <el-dialog :title="form.id ? 'Edit Banner' : 'Add Banner'" :visible.sync="editVisible" width="780px"
            :close-on-click-modal="false" @closed="resetForm">
            <el-form label-width="90px" size="small" @submit.native.prevent>
                <el-form-item label="Title" required>
                    <el-input v-model="form.title" maxlength="160" placeholder="e.g. iPhone 17 screens in stock" />
                    <div class="wb-hint">Not shown on the banner — screen readers and search engines read it as the image description.</div>
                </el-form-item>
                <el-form-item label="Link">
                    <el-input v-model="form.link" placeholder="Optional — https://… or a page on the website, e.g. /products/…" clearable />
                    <el-checkbox v-model="form.newTab" :disabled="!form.link" class="wb-newtab">Open in a new tab</el-checkbox>
                </el-form-item>
                <el-form-item label="Active">
                    <el-switch v-model="form.active" />
                    <span class="wb-hint wb-inline">Inactive banners stay here but don't show on the website.</span>
                </el-form-item>
                <el-form-item label="Images" required>
                    <div class="wb-drops">
                        <div v-for="d in DEVICES" :key="d.key" class="wb-drop" :class="['wb-drop-' + d.key, { 'is-set': !!previewOf(d.key), 'is-over': dragOver === d.key }]"
                            @click="pick(d.key)" @dragover.prevent="dragOver = d.key" @dragleave="dragOver = ''"
                            @drop.prevent="onDrop(d.key, $event)">
                            <div class="wb-drop-head">
                                <i :class="d.icon" /> {{ d.label }}
                                <span v-if="form.files[d.key]" class="wb-new">new</span>
                            </div>
                            <div class="wb-drop-body">
                                <img v-if="previewOf(d.key)" :src="previewOf(d.key)" :alt="d.label">
                                <div v-else class="wb-drop-empty"><i class="el-icon-upload" /><span>Click or drop an image</span></div>
                            </div>
                            <div class="wb-drop-foot">
                                <span v-if="dimsOf(d.key)">{{ dimsOf(d.key) }}</span>
                                <span v-if="formShapeWarning(d.key)" class="wb-warn-text"><i class="el-icon-warning" /> {{ formShapeWarning(d.key) }}</span>
                                <span v-else class="wb-dim">{{ suggestion(d.key) }}</span>
                            </div>
                            <input :ref="'file-' + d.key" type="file" accept="image/png,image/jpeg,image/webp" class="wb-file"
                                @click.stop @change="onFile(d.key, $event)">
                        </div>
                    </div>
                    <div class="wb-hint">
                        PNG, JPEG or WebP, up to 15 MB each — saved as optimised WebP. The carousel takes its height
                        from the first banner, so keep the same shape for every banner of a device; a different shape is cropped to fit.
                    </div>
                </el-form-item>
            </el-form>
            <div slot="footer">
                <el-button size="small" @click="editVisible = false">Cancel</el-button>
                <el-button size="small" type="primary" :loading="saving" @click="save">{{ form.id ? 'Save' : 'Add Banner' }}</el-button>
            </div>
        </el-dialog>

        <!-- ── Preview: the real widget in device-sized frames ────────── -->
        <el-dialog title="Preview" :visible.sync="previewVisible" width="92%" top="4vh" @opened="fitPreview" @closed="previewSrc = ''">
            <div class="wb-pv-bar">
                <el-radio-group v-model="previewDevice" size="small" @change="fitPreview">
                    <el-radio-button v-for="d in DEVICES" :key="d.key" :label="d.key">
                        <i :class="d.icon" /> {{ d.label }}
                    </el-radio-button>
                </el-radio-group>
                <span class="wb-dim">{{ frame.width }} px wide · active banners only, as the website shows them</span>
                <div class="wb-spacer" />
                <el-button size="mini" icon="el-icon-refresh" @click="reloadPreview">Reload</el-button>
            </div>
            <div ref="pvBox" class="wb-pv-box">
                <div class="wb-pv-frame" :style="{ width: frame.width * pvScale + 'px', height: frame.height * pvScale + 'px' }">
                    <iframe v-if="previewSrc" :key="previewSrc" :src="previewSrc" title="Banner carousel preview"
                        :style="{ width: frame.width + 'px', height: frame.height + 'px', transform: 'scale(' + pvScale + ')' }" />
                </div>
            </div>
        </el-dialog>

        <!-- ── Embed code ─────────────────────────────────────────────── -->
        <el-dialog title="Embed code" :visible.sync="embedVisible" width="680px">
            <div class="wb-hint wb-embed-intro">
                Paste this where the carousel should appear on the website (an HTML / code block). It shows the active
                banners and updates by itself — no need to paste it again after changing banners.
            </div>
            <pre class="wb-snippet">{{ snippet }}</pre>
            <el-button size="mini" icon="el-icon-document-copy" @click="copy(snippet)">Copy code</el-button>

            <div class="wb-embed-label">Optional settings (on the &lt;div&gt;)</div>
            <table class="wb-opts">
                <tr><td><code>data-interval="5000"</code></td><td>Time per banner in ms; <code>0</code> stops the autoplay.</td></tr>
                <tr><td><code>data-radius="12"</code></td><td>Rounded corners, in px (default square).</td></tr>
                <tr><td><code>data-tablet-min="768"</code></td><td>Width where the tablet image starts.</td></tr>
                <tr><td><code>data-desktop-min="1024"</code></td><td>Width where the desktop image starts.</td></tr>
            </table>

            <div class="wb-embed-label">Allowed websites</div>
            <template v-if="canOrigins">
                <div v-if="originsLoading" class="wb-dim"><i class="el-icon-loading" /> Loading…</div>
                <template v-else>
                    <div v-for="o in origins" :key="o.origin" class="wb-origin">
                        <i :class="o.enabled ? 'el-icon-circle-check wb-ok' : 'el-icon-remove-outline wb-dim'" />
                        {{ o.origin }}<span v-if="!o.enabled" class="wb-dim"> (disabled)</span>
                    </div>
                    <el-alert v-if="!origins.some(o => o.enabled)" type="warning" :closable="false" show-icon
                        title="No website is allowed yet — the carousel stays empty until the website's address is added."
                        class="wb-embed-alert" />
                    <router-link to="/system/widgetOrigin" class="wb-origin-link" @click.native="embedVisible = false">
                        Manage on System → Widget Setting (Banner Carousel) <i class="el-icon-right" />
                    </router-link>
                </template>
            </template>
            <div v-else class="wb-hint">
                The website's address must be on the allowlist under System → Widget Setting → Banner Carousel —
                ask an admin to add it.
            </div>
            <div slot="footer">
                <el-button size="small" @click="embedVisible = false">Close</el-button>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import draggable from 'vuedraggable'
import { listBanners, createBanner, updateBanner, saveBannerOrder, deleteBanner } from '@/api/website'
import { listWidgetOrigins } from '@/api/system/widgetOrigin'
import { hasPermission } from '@/utils/permission'

const DEVICES = [
    { key: 'desktop', label: 'Desktop', icon: 'el-icon-monitor', frame: 1280, suggest: 'e.g. 1920 × 600' },
    { key: 'tablet', label: 'Tablet', icon: 'el-icon-mobile', frame: 820, suggest: 'e.g. 1536 × 768' },
    { key: 'mobile', label: 'Mobile', icon: 'el-icon-mobile-phone', frame: 390, suggest: 'e.g. 1080 × 1080' }
]
// Shapes further apart than this get the "cropped to fit" warning.
const SHAPE_TOLERANCE = 0.03

function emptyForm() {
    return {
        id: null,
        title: '',
        link: '',
        newTab: false,
        active: true,
        images: {}, // the saved images when editing
        files: {}, // device → newly picked File
        previews: {}, // device → object URL of the picked file
        dims: {} // device → { width, height } of the picked file
    }
}

// Where the backend (and so the widget script) lives: the API base when
// it is absolute (dev: http://localhost:3000, production: the Railway
// backend), else this origin.
function backendOrigin() {
    try {
        return new URL(process.env.VUE_APP_BASE_API).origin
    } catch (e) {
        return window.location.origin
    }
}

function ratioOf(img) {
    return img && img.width && img.height ? img.height / img.width : null
}

export default {
    name: 'WebsiteBanner',
    components: { draggable },
    data() {
        return {
            DEVICES,
            loading: false,
            rows: [],
            editVisible: false,
            form: emptyForm(),
            saving: false,
            dragOver: '',
            previewVisible: false,
            previewDevice: 'desktop',
            previewSrc: '',
            pvScale: 1,
            embedVisible: false,
            origins: [],
            originsLoading: false
        }
    },
    computed: {
        canManage() {
            return hasPermission(this.$store.getters.permissions, 'web:banner:manage')
        },
        canOrigins() {
            return hasPermission(this.$store.getters.permissions, 'system:user:manage')
        },
        activeRows() {
            return this.rows.filter(b => b.active)
        },
        // The carousel's shape per device = the first active banner's image.
        reference() {
            const first = this.activeRows[0]
            const out = {}
            DEVICES.forEach(d => {
                out[d.key] = first && first.images ? first.images[d.key] : null
            })
            return out
        },
        frame() {
            const d = DEVICES.find(x => x.key === this.previewDevice)
            const r = ratioOf(this.reference[d.key]) || 0.4
            return { width: d.frame, height: Math.round(d.frame * r) }
        },
        snippet() {
            const base = backendOrigin()
            return [
                '<div id="imobile-banner-carousel"></div>',
                `<script src="${base}/widget-assets/banner-carousel/v1.js" defer><\/script>`
            ].join('\n')
        }
    },
    created() {
        this.load()
    },
    beforeDestroy() {
        this.revokePreviews()
    },
    methods: {
        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback
        },
        async load() {
            this.loading = true
            try {
                const r = await listBanners()
                this.rows = (r.rows || []).map(b => ({ ...b, __busy: false }))
            } catch (e) {
                this.$message.error(this.msg(e, 'Failed to load the banners'))
            } finally {
                this.loading = false
            }
        },

        // ── list ───────────────────────────────────────────────────
        slotOf(b) {
            return this.activeRows.indexOf(b) + 1
        },
        dims(img) {
            return img && img.width ? `${img.width} × ${img.height}` : ''
        },
        fmtWhen(v) {
            if (!v) return '—'
            const d = new Date(v)
            const p = n => String(n).padStart(2, '0')
            return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
        },
        shapeOff(img, ref) {
            const a = ratioOf(img)
            const b = ratioOf(ref)
            return !!(a && b && Math.abs(a - b) / b > SHAPE_TOLERANCE)
        },
        shapeWarning(b, device) {
            const ref = this.reference[device]
            const img = b.images && b.images[device]
            if (!b.active || !ref || ref === img || !this.shapeOff(img, ref)) return ''
            return `A different shape from the first banner (${this.dims(ref)}) — it is cropped to fit`
        },
        async onDragEnd(e) {
            if (e.oldIndex === e.newIndex) return
            try {
                await saveBannerOrder(this.rows.map(b => b._id))
                this.$message.success('Order saved')
            } catch (err) {
                this.$message.error(this.msg(err, 'Could not save the order'))
                this.load()
            }
        },
        async toggleActive(b, v) {
            b.__busy = true
            try {
                const r = await updateBanner(b._id, { active: v })
                b.active = v
                if (r && r.banner) {
                    b.updatedAt = r.banner.updatedAt
                    b.updatedBy = r.banner.updatedBy
                }
                this.$message.success(v ? 'Banner is showing on the website' : 'Banner hidden from the website')
            } catch (e) {
                this.$message.error(this.msg(e, 'Could not change the banner'))
            } finally {
                b.__busy = false
            }
        },
        remove(b) {
            this.$confirm(`Delete "${b.title}"? Its images are removed too.`, 'Delete banner', {
                type: 'warning',
                confirmButtonText: 'Delete',
                cancelButtonText: 'Cancel'
            }).then(async () => {
                try {
                    await deleteBanner(b._id)
                    this.rows = this.rows.filter(x => x !== b)
                    this.$message.success('Banner deleted')
                } catch (e) {
                    this.$message.error(this.msg(e, 'Could not delete the banner'))
                }
            }).catch(() => {})
        },

        // ── add / edit ─────────────────────────────────────────────
        openCreate() {
            this.resetForm()
            this.editVisible = true
        },
        openEdit(b) {
            this.resetForm()
            this.form = {
                ...emptyForm(),
                id: b._id,
                title: b.title || '',
                link: b.link || '',
                newTab: !!b.newTab,
                active: !!b.active,
                images: { ...(b.images || {}) }
            }
            this.editVisible = true
        },
        revokePreviews() {
            Object.values(this.form.previews || {}).forEach(u => URL.revokeObjectURL(u))
        },
        resetForm() {
            this.revokePreviews()
            this.form = emptyForm()
            DEVICES.forEach(d => {
                const input = this.$refs['file-' + d.key]
                const el = Array.isArray(input) ? input[0] : input
                if (el) el.value = ''
            })
        },
        pick(device) {
            const input = this.$refs['file-' + device]
            const el = Array.isArray(input) ? input[0] : input
            if (el) el.click()
        },
        onFile(device, e) {
            const f = e.target.files && e.target.files[0]
            e.target.value = ''
            if (f) this.takeFile(device, f)
        },
        onDrop(device, e) {
            this.dragOver = ''
            const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
            if (f) this.takeFile(device, f)
        },
        takeFile(device, f) {
            if (!/^image\/(png|jpe?g|webp)$/i.test(f.type)) {
                this.$message.warning('Only PNG, JPEG or WebP images')
                return
            }
            if (f.size > 15 * 1024 * 1024) {
                this.$message.warning('That image is over 15 MB')
                return
            }
            if (this.form.previews[device]) URL.revokeObjectURL(this.form.previews[device])
            const url = URL.createObjectURL(f)
            this.$set(this.form.files, device, f)
            this.$set(this.form.previews, device, url)
            this.$delete(this.form.dims, device)
            const img = new Image()
            img.onload = () => {
                if (this.form.previews[device] === url) {
                    this.$set(this.form.dims, device, { width: img.naturalWidth, height: img.naturalHeight })
                }
            }
            img.src = url
        },
        previewOf(device) {
            return this.form.previews[device] || (this.form.images[device] && this.form.images[device].url) || ''
        },
        imageOf(device) {
            return this.form.dims[device] || (this.form.files[device] ? null : this.form.images[device]) || null
        },
        dimsOf(device) {
            return this.dims(this.imageOf(device))
        },
        // What to aim for: the shape of the other banners when there are
        // some, else a suggested size.
        refFor(device) {
            const ref = this.activeRows.find(b => b._id !== this.form.id)
            return ref && ref.images ? ref.images[device] : null
        },
        suggestion(device) {
            const ref = this.refFor(device)
            if (ref) return `Other banners: ${this.dims(ref)}`
            return DEVICES.find(d => d.key === device).suggest
        },
        formShapeWarning(device) {
            const ref = this.refFor(device)
            const img = this.imageOf(device)
            if (!ref || !img || !this.shapeOff(img, ref)) return ''
            return `Others are ${this.dims(ref)} — this one gets cropped`
        },
        async save() {
            const f = this.form
            if (!f.title.trim()) return this.$message.warning('Give the banner a title')
            const link = f.link.trim()
            if (link && !/^(https?:\/\/|\/(?!\/))/i.test(link)) {
                return this.$message.warning('The link must start with https://, http:// or / (a page on the website)')
            }
            if (!f.id) {
                const missing = DEVICES.filter(d => !f.files[d.key]).map(d => d.label.toLowerCase())
                if (missing.length) return this.$message.warning(`Add the ${missing.join(', ')} image`)
            }
            const fields = { title: f.title.trim(), link, newTab: !!(link && f.newTab), active: f.active }
            const hasFiles = DEVICES.some(d => f.files[d.key])
            let data = fields
            if (hasFiles || !f.id) {
                data = new FormData()
                Object.keys(fields).forEach(k => data.append(k, String(fields[k])))
                DEVICES.forEach(d => {
                    if (f.files[d.key]) data.append(d.key, f.files[d.key])
                })
            }
            this.saving = true
            try {
                if (f.id) await updateBanner(f.id, data)
                else await createBanner(data)
                this.$message.success(f.id ? 'Banner saved' : 'Banner added')
                this.editVisible = false
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, 'Could not save the banner'))
            } finally {
                this.saving = false
            }
        },

        // ── preview ────────────────────────────────────────────────
        openPreview() {
            this.previewVisible = true
            this.reloadPreview()
        },
        reloadPreview() {
            this.previewSrc = `${backendOrigin()}/widget-assets/banner-carousel/demo/index.html?bare=1&t=${Date.now()}`
        },
        fitPreview() {
            this.$nextTick(() => {
                const box = this.$refs.pvBox
                const w = box ? box.clientWidth - 2 : this.frame.width
                this.pvScale = Math.min(1, w / this.frame.width)
            })
        },

        // ── embed ──────────────────────────────────────────────────
        async openEmbed() {
            this.embedVisible = true
            if (!this.canOrigins) return
            this.originsLoading = true
            try {
                const r = await listWidgetOrigins({ widget: 'banner-carousel', pageSize: 100 })
                this.origins = r.data || []
            } catch (e) {
                this.origins = []
            } finally {
                this.originsLoading = false
            }
        },
        copy(text) {
            const done = () => this.$message.success('Copied')
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
                this.$message.warning('Copy failed — select the code and copy it by hand')
            }
            document.body.removeChild(ta)
        }
    }
}
</script>

<style scoped>
.wb-head { display: flex; align-items: flex-end; gap: 8px; margin-bottom: 14px; }
.wb-title { font-size: 18px; font-weight: 600; color: #303133; }
.wb-sub { font-size: 12px; color: #909399; margin-top: 2px; }
.wb-spacer { flex: 1; }
.wb-dim { color: #909399; }
.wb-hint { font-size: 12px; color: #909399; line-height: 1.5; margin-top: 4px; }
.wb-inline { margin: 0 0 0 10px; }

.wb-list { min-height: 120px; }
.wb-empty { text-align: center; color: #909399; padding: 48px 0; border: 1px dashed #dcdfe6; border-radius: 8px; }
.wb-empty > i { font-size: 36px; color: #c0c4cc; }
.wb-empty > div { margin: 6px 0 14px; }

.wb-card {
    display: flex; align-items: center; gap: 14px; padding: 12px 14px; margin-bottom: 10px;
    background: #fff; border: 1px solid #ebeef5; border-radius: 8px;
}
.wb-card.is-off { background: #fafafa; }
.wb-card.is-off .wb-thumbs, .wb-card.is-off .wb-name { opacity: .55; }
.wb-ghost { opacity: .4; background: #ecf5ff; }
.wb-handle { cursor: grab; color: #c0c4cc; font-size: 16px; padding: 4px; }
.wb-handle:hover { color: #409eff; }
.wb-no { width: 22px; text-align: center; font-weight: 600; color: #606266; font-variant-numeric: tabular-nums; }

.wb-thumbs { display: flex; align-items: flex-end; gap: 10px; flex: none; }
.wb-thumb { margin: 0; }
/* Fixed frames (desktop / tablet / mobile) so every row lines up; an image
   of another shape shows letterboxed inside its frame. */
.wb-thumb-img {
    width: 76px; height: 76px; display: flex; background: #f5f7fa;
    border-radius: 4px; overflow: hidden; border: 1px solid #ebeef5;
}
.wb-thumb:nth-child(1) .wb-thumb-img { width: 244px; }
.wb-thumb:nth-child(2) .wb-thumb-img { width: 152px; }
.wb-thumb-img img { width: 100%; height: 100%; object-fit: contain; display: block; }
.wb-thumb figcaption { font-size: 11px; color: #606266; margin-top: 4px; white-space: nowrap; }
.wb-warn { color: #e6a23c; cursor: help; }

.wb-meta { flex: 1; min-width: 0; }
.wb-name { font-size: 14px; font-weight: 600; color: #303133; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-link { font-size: 12px; margin-top: 4px; display: flex; align-items: center; gap: 5px; min-width: 0; }
.wb-link a { color: #409eff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-link a:hover { text-decoration: underline; }
.wb-by { font-size: 11px; margin-top: 4px; }

.wb-actions { display: flex; align-items: center; gap: 10px; flex: none; }
.wb-actions .el-button + .el-button { margin-left: 0; }
.wb-del { color: #f56c6c; }

/* ── form ── */
.wb-newtab { margin-top: 6px; }
.wb-drops { display: flex; gap: 10px; align-items: stretch; }
.wb-drop {
    position: relative; display: flex; flex-direction: column; border: 1px dashed #c0c4cc; border-radius: 6px;
    cursor: pointer; background: #fafafa; transition: border-color .15s, background .15s; min-width: 0;
}
.wb-drop:hover, .wb-drop.is-over { border-color: #409eff; background: #f4f9ff; }
.wb-drop.is-set { border-style: solid; border-color: #dcdfe6; background: #fff; }
.wb-drop-desktop { flex: 2.2; }
.wb-drop-tablet { flex: 1.4; }
.wb-drop-mobile { flex: 1; }
.wb-drop-head { font-size: 12px; font-weight: 600; color: #606266; padding: 6px 8px 0; line-height: 18px; }
.wb-new { font-weight: normal; font-size: 11px; color: #67c23a; margin-left: 4px; }
.wb-drop-body { flex: 1; display: flex; align-items: center; justify-content: center; padding: 6px 8px; min-height: 110px; }
.wb-drop-body img { max-width: 100%; max-height: 150px; display: block; border-radius: 3px; }
.wb-drop-empty { display: flex; flex-direction: column; align-items: center; color: #909399; font-size: 12px; line-height: 1.4; text-align: center; }
.wb-drop-empty i { font-size: 24px; color: #c0c4cc; margin-bottom: 4px; }
.wb-drop-foot {
    font-size: 11px; color: #606266; padding: 0 8px 6px; line-height: 1.4; display: flex; flex-direction: column;
    word-break: normal; overflow-wrap: break-word;
}
.wb-warn-text { color: #e6a23c; }
.wb-file { display: none; }

/* ── preview ── */
.wb-pv-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.wb-pv-box { background: #f0f2f5; border-radius: 6px; padding: 16px 0; display: flex; justify-content: center; overflow: hidden; }
.wb-pv-frame { position: relative; overflow: hidden; background: #fff; box-shadow: 0 2px 12px rgba(0, 0, 0, .12); }
.wb-pv-frame iframe { border: 0; display: block; transform-origin: 0 0; }

/* ── embed ── */
.wb-embed-intro { margin: 0 0 10px; }
.wb-snippet {
    background: #1f2430; color: #e6edf3; padding: 12px 14px; border-radius: 6px; font-size: 12px;
    line-height: 1.6; white-space: pre-wrap; word-break: break-all; margin: 0 0 8px;
}
.wb-embed-label { font-size: 13px; font-weight: 600; color: #303133; margin: 18px 0 6px; }
.wb-opts { border-collapse: collapse; font-size: 12px; width: 100%; }
.wb-opts td { padding: 4px 8px 4px 0; vertical-align: top; color: #606266; }
.wb-opts td:first-child { white-space: nowrap; width: 1%; }
.wb-opts code { background: #f5f7fa; padding: 1px 5px; border-radius: 3px; color: #303133; }
.wb-origin { font-size: 13px; line-height: 24px; }
.wb-ok { color: #67c23a; }
.wb-embed-alert { margin: 6px 0; }
.wb-origin-link { display: inline-block; font-size: 12px; color: #409eff; margin-top: 6px; }
</style>
