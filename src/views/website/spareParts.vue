<template>
    <!--
        iMobile Website → Spare Parts Widget (user ask 2026-09-30): the
        embeddable parts browser for the website — Brand → Series → Model →
        part type, and search; no prices, each part links to its store page
        (imobilestore.com.au/products/<Zoho item id>). Nothing to manage here:
        the widget reads the stock register (Zoho's Device Brand / Series /
        Compatible Model / Classification fields). This page shows what it
        holds, the embed code, the allowed websites and a live preview.
    -->
    <div class="app-container sp-page">
        <div class="sp-head">
            <div>
                <div class="sp-title">Spare Parts Widget</div>
                <div class="sp-sub">
                    The parts browser for the website — live spare parts that the online store shows, browsed by brand,
                    series and model. No prices; each part links to its page on the store.
                    <span v-if="updatedAt"> · list read {{ ago(updatedAt) }}</span>
                </div>
            </div>
            <div class="sp-spacer" />
            <el-button size="small" icon="el-icon-link" @click="openDemo">Open demo page</el-button>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">Refresh</el-button>
        </div>

        <div class="sp-tiles" v-loading="loading && !counts">
            <div v-for="t in tiles" :key="t.label" class="sp-tile">
                <div class="sp-tile-label">{{ t.label }}</div>
                <div class="sp-tile-value">{{ t.value }}</div>
                <div class="sp-dim">{{ t.note }}</div>
            </div>
        </div>

        <div class="sp-cols">
            <div class="sp-card">
                <div class="sp-card-title">What shoppers can browse</div>
                <el-table :data="brands" size="small" border v-loading="loading && !brands.length" empty-text="No parts">
                    <el-table-column label="Brand" prop="name" width="120" />
                    <el-table-column label="Parts" prop="parts" width="80" align="right" />
                    <el-table-column label="Series and models">
                        <template slot-scope="s">
                            <span v-for="(x, i) in s.row.series" :key="x.name + i" class="sp-series">
                                {{ x.name || 'Models' }} <span class="sp-dim">{{ x.models }}</span>
                            </span>
                        </template>
                    </el-table-column>
                </el-table>
                <div class="sp-note">
                    A part shows when it is active in Zoho, not archived, a spare part (not an accessory) and
                    <b>Show in online store</b> is on. Brand, series and models come from its <b>Device Brand</b>,
                    <b>Device Series</b> and <b>Compatible Model</b> fields and the part type from
                    <b>Classification</b> — fix those in Zoho and the widget follows after the next stock sync.
                    Tools are listed on their own.
                </div>
            </div>

            <div class="sp-card">
                <div class="sp-card-title">Embed code</div>
                <div class="sp-hint">Paste this where the parts browser should appear on the website (an HTML / code block).</div>
                <pre class="sp-snippet">{{ snippet }}</pre>
                <el-button size="mini" icon="el-icon-document-copy" @click="copy(snippet)">Copy code</el-button>

                <div class="sp-label">Optional settings (on the &lt;div&gt;)</div>
                <table class="sp-opts">
                    <tr><td><code>data-title="…"</code></td><td>The heading; <code>data-title=""</code> hides it.</td></tr>
                    <tr><td><code>data-accent="#0b7fd4"</code></td><td>Colour of the selected tabs and links.</td></tr>
                    <tr><td><code>data-new-tab="true"</code></td><td>Open a part in a new tab (default: same tab).</td></tr>
                    <tr><td><code>data-brand="Apple" data-model="iPhone 13"</code></td><td>Open straight on a brand or a model — e.g. on a model's page.</td></tr>
                </table>

                <div class="sp-label">Allowed websites</div>
                <template v-if="canOrigins">
                    <div v-if="originsLoading" class="sp-dim"><i class="el-icon-loading" /> Loading…</div>
                    <template v-else>
                        <div v-for="o in origins" :key="o.origin" class="sp-origin">
                            <i :class="o.enabled ? 'el-icon-circle-check sp-ok' : 'el-icon-remove-outline sp-dim'" />
                            {{ o.origin }}<span v-if="!o.enabled" class="sp-dim"> (disabled)</span>
                        </div>
                        <el-alert v-if="!origins.some(o => o.enabled)" type="warning" :closable="false" show-icon
                            title="No website is allowed yet — the widget shows an error until the website's address is added."
                            class="sp-alert" />
                        <router-link to="/system/widgetOrigin" class="sp-origin-link">
                            Manage on System → Widget Setting (Spare Parts) <i class="el-icon-right" />
                        </router-link>
                    </template>
                </template>
                <div v-else class="sp-hint">
                    The website's address must be on the allowlist under System → Widget Setting → Spare Parts —
                    ask an admin to add it.
                </div>
            </div>
        </div>

        <div class="sp-card">
            <div class="sp-pv-bar">
                <span class="sp-card-title sp-inline">Preview</span>
                <el-radio-group v-model="previewDevice" size="small" @change="fitPreview">
                    <el-radio-button v-for="f in FRAMES" :key="f.key" :label="f.key"><i :class="f.icon" /> {{ f.label }}</el-radio-button>
                </el-radio-group>
                <span class="sp-dim">{{ frame.width }} px wide · the real widget, as the website shows it</span>
                <div class="sp-spacer" />
                <el-button size="mini" icon="el-icon-refresh" @click="reloadPreview">Reload</el-button>
            </div>
            <div ref="pvBox" class="sp-pv-box">
                <div class="sp-pv-frame" :style="{ width: frame.width * pvScale + 'px', height: frame.height * pvScale + 'px' }">
                    <iframe v-if="previewSrc" :key="previewSrc" :src="previewSrc" title="Spare parts widget preview"
                        :style="{ width: frame.width + 'px', height: frame.height + 'px', transform: 'scale(' + pvScale + ')' }" />
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { sparePartsSummary } from '@/api/website'
import { listWidgetOrigins } from '@/api/system/widgetOrigin'
import { hasPermission } from '@/utils/permission'

const FRAMES = [
    { key: 'desktop', label: 'Desktop', icon: 'el-icon-monitor', width: 1280, height: 820 },
    { key: 'tablet', label: 'Tablet', icon: 'el-icon-mobile', width: 820, height: 900 },
    { key: 'mobile', label: 'Mobile', icon: 'el-icon-mobile-phone', width: 390, height: 780 }
]

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
    name: 'WebsiteSpareParts',
    data() {
        return {
            FRAMES,
            loading: false,
            counts: null,
            brands: [],
            updatedAt: null,
            origins: [],
            originsLoading: false,
            previewDevice: 'desktop',
            previewSrc: '',
            pvScale: 1,
            nowTick: Date.now()
        }
    },
    computed: {
        canOrigins() {
            return hasPermission(this.$store.getters.permissions, 'system:user:manage')
        },
        tiles() {
            const c = this.counts
            if (!c) return []
            const n = (v) => Number(v || 0).toLocaleString()
            const pct = (v) => (c.parts ? Math.round((v / c.parts) * 100) : 0) + '%'
            return [
                { label: 'Parts', value: n(c.parts), note: 'shown in the online store' },
                { label: 'Found by model', value: n(c.browsable), note: pct(c.browsable) + ' have a brand + model' },
                { label: 'Models', value: n(c.models), note: `${c.brands} brands` },
                { label: 'Tools', value: n(c.tools), note: 'listed on their own' },
                { label: 'With a photo', value: n(c.withImage), note: pct(c.withImage) + ' — the rest show a box icon' }
            ]
        },
        frame() {
            return FRAMES.find(f => f.key === this.previewDevice)
        },
        snippet() {
            return [
                '<div id="imobile-spare-parts"></div>',
                `<script src="${backendOrigin()}/widget-assets/spare-parts/v1.js" defer><\/script>`
            ].join('\n')
        }
    },
    created() {
        this.load()
        this.loadOrigins()
        this.reloadPreview()
        this.ticker = setInterval(() => { this.nowTick = Date.now() }, 30000)
    },
    mounted() {
        this.fitPreview()
        window.addEventListener('resize', this.fitPreview)
    },
    beforeDestroy() {
        clearInterval(this.ticker)
        window.removeEventListener('resize', this.fitPreview)
    },
    activated() {
        this.fitPreview()
    },
    methods: {
        async load() {
            this.loading = true
            try {
                const r = await sparePartsSummary()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.counts = r.counts
                this.brands = r.brands || []
                this.updatedAt = r.updatedAt
                this.nowTick = Date.now()
            } catch (e) {
                const m = (e && e.response && e.response.data && e.response.data.message) || (e && e.message)
                this.$message.error(m || 'Could not read the spare parts')
            } finally {
                this.loading = false
            }
        },
        async loadOrigins() {
            if (!this.canOrigins) return
            this.originsLoading = true
            try {
                const r = await listWidgetOrigins({ widget: 'spare-parts', pageSize: 100 })
                this.origins = r.data || []
            } catch (e) {
                this.origins = []
            } finally {
                this.originsLoading = false
            }
        },
        ago(t) {
            const mins = Math.max(0, Math.round((this.nowTick - new Date(t).getTime()) / 60000))
            return mins < 1 ? 'just now' : mins === 1 ? '1 min ago' : `${mins} min ago`
        },
        demoUrl(bare) {
            return `${backendOrigin()}/widget-assets/spare-parts/demo/index.html${bare ? '?bare=1&t=' + Date.now() : ''}`
        },
        openDemo() {
            window.open(this.demoUrl(false), '_blank', 'noopener')
        },
        reloadPreview() {
            this.previewSrc = this.demoUrl(true)
        },
        fitPreview() {
            this.$nextTick(() => {
                const box = this.$refs.pvBox
                const w = box ? box.clientWidth - 2 : this.frame.width
                this.pvScale = Math.min(1, w / this.frame.width)
            })
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
                this.$message.error('Copy failed — select the code and copy it by hand')
            }
            document.body.removeChild(ta)
        }
    }
}
</script>

<style scoped>
.sp-head { display: flex; align-items: flex-end; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.sp-title { font-size: 18px; font-weight: 600; color: #303133; }
.sp-sub { font-size: 12px; color: #909399; margin-top: 2px; max-width: 820px; }
.sp-spacer { flex: 1; }
.sp-tiles { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; min-height: 60px; }
.sp-tile { background: #fff; border: 1px solid #ebeef5; border-radius: 8px; padding: 12px 16px; }
.sp-tile-label { font-size: 12px; color: #909399; }
.sp-tile-value { font-size: 20px; font-weight: 600; color: #303133; margin: 4px 0 2px; font-variant-numeric: tabular-nums; }
.sp-cols { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 14px; margin-bottom: 14px; }
.sp-card { background: #fff; border: 1px solid #ebeef5; border-radius: 8px; padding: 14px 16px; }
.sp-card-title { font-size: 14px; font-weight: 600; color: #303133; margin-bottom: 10px; }
.sp-inline { margin-bottom: 0; }
.sp-series { display: inline-block; margin: 1px 12px 1px 0; font-size: 12px; color: #606266; white-space: nowrap; }
.sp-note { font-size: 12px; color: #909399; margin-top: 10px; line-height: 1.6; }
.sp-hint { font-size: 12px; color: #909399; margin-bottom: 8px; }
.sp-snippet { background: #f5f7fa; border: 1px solid #ebeef5; border-radius: 6px; padding: 10px 12px; font-size: 12px; white-space: pre-wrap; word-break: break-all; margin: 0 0 8px; }
.sp-label { font-size: 13px; font-weight: 600; color: #303133; margin: 16px 0 6px; }
.sp-opts { width: 100%; border-collapse: collapse; font-size: 12px; }
.sp-opts td { padding: 5px 6px; border-top: 1px solid #f2f3f5; vertical-align: top; color: #606266; }
.sp-opts code { font-size: 11px; color: #303133; }
.sp-origin { font-size: 13px; color: #303133; margin: 2px 0; }
.sp-ok { color: #67c23a; }
.sp-alert { margin: 6px 0; }
.sp-origin-link { display: inline-block; margin-top: 6px; font-size: 12px; color: #409eff; }
.sp-dim { font-size: 12px; color: #909399; }
.sp-pv-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.sp-pv-box { background: #f5f7fa; border: 1px solid #ebeef5; border-radius: 6px; padding: 0; overflow: hidden; display: flex; justify-content: center; }
.sp-pv-frame { overflow: hidden; background: #fff; }
.sp-pv-frame iframe { border: 0; transform-origin: 0 0; display: block; background: #fff; }
@media (max-width: 1100px) { .sp-cols { grid-template-columns: 1fr; } .sp-tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 600px) { .sp-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
