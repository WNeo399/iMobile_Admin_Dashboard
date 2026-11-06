<template>
    <div class="d3p app-container">
        <!-- ── list ─────────────────────────────────────────────────── -->
        <template v-if="!current">
            <div class="d3p-bar">
                <el-input v-model="query.q" size="small" clearable class="f-search" prefix-icon="el-icon-search"
                    placeholder="Search brand / model…" />
                <el-select v-model="query.status" size="small" clearable placeholder="Status" class="f-sel">
                    <el-option label="Published" value="published" />
                    <el-option label="Draft" value="draft" />
                </el-select>
                <span class="d3p-spacer" />
                <el-button size="small" type="primary" plain icon="el-icon-upload2" @click="openCreate">New 3D Diagram</el-button>
                <el-button size="small" icon="el-icon-refresh" @click="load">Refresh</el-button>
            </div>
            <el-table v-loading="loading" :data="shownRows" border size="mini" height="calc(100vh - 210px)"
                empty-text="No 3D diagrams yet — upload a model's .glb file to start." @row-click="(r) => open(r.id)">
                <el-table-column label="Model" min-width="220">
                    <template slot-scope="s">
                        <b>{{ s.row.model }}</b> <span class="d3p-dim">{{ s.row.brand }}</span>
                        <el-tooltip v-if="!s.row.inCatalog" content="This model isn't in the widget's list any more (renamed, or no parts left) — the 3D view can't show. Pick the model again in the editor.">
                            <el-tag size="mini" type="danger" effect="plain" class="d3p-ml">Model not found</el-tag>
                        </el-tooltip>
                        <div class="d3p-dim">{{ s.row.title }}</div>
                    </template>
                </el-table-column>
                <el-table-column label="Parts linked" width="190">
                    <template slot-scope="s">
                        <el-progress :percentage="s.row.parts ? Math.round((s.row.linkedParts / s.row.parts) * 100) : 0"
                            :format="() => `${s.row.linkedParts} / ${s.row.parts}`" :stroke-width="8" />
                    </template>
                </el-table-column>
                <el-table-column label="Items" width="80" align="center" prop="links" />
                <el-table-column label="File" min-width="170" show-overflow-tooltip>
                    <template slot-scope="s">
                        <template v-if="s.row.file">
                            <div>{{ s.row.file.name || 'model.glb' }}</div>
                            <div class="d3p-dim">{{ mb(s.row.file.bytes) }} · {{ mb(s.row.file.gzBytes) }} to download</div>
                        </template>
                        <span v-else class="d3p-dim">—</span>
                    </template>
                </el-table-column>
                <el-table-column label="Status" width="100" align="center">
                    <template slot-scope="s">
                        <el-tag size="mini" :type="s.row.status === 'published' ? 'success' : 'info'" effect="plain">
                            {{ s.row.status === 'published' ? 'Published' : 'Draft' }}
                        </el-tag>
                    </template>
                </el-table-column>
                <el-table-column label="Updated" width="150">
                    <template slot-scope="s">
                        <div>{{ when(s.row.updatedAt) }}</div>
                        <div class="d3p-dim">{{ s.row.updatedBy || '' }}</div>
                    </template>
                </el-table-column>
                <el-table-column label="" width="120" align="center">
                    <template slot-scope="s">
                        <el-button size="mini" type="text" icon="el-icon-edit" @click.stop="open(s.row.id)">Open</el-button>
                        <el-button size="mini" type="text" icon="el-icon-delete" class="d3p-del" @click.stop="remove(s.row)" />
                    </template>
                </el-table-column>
            </el-table>
        </template>

        <!-- ── editor ───────────────────────────────────────────────── -->
        <div v-else class="d3p-ed">
            <div class="d3p-bar">
                <el-button size="small" icon="el-icon-arrow-left" @click="close">All 3D diagrams</el-button>
                <div class="d3p-head">
                    <b>{{ current.model }}</b> <span class="d3p-dim">{{ current.brand }}</span>
                    <el-tag size="mini" :type="current.status === 'published' ? 'success' : 'info'" effect="plain" class="d3p-ml">
                        {{ current.status === 'published' ? 'Published — in the widget' : 'Draft — not in the widget' }}
                    </el-tag>
                </div>
                <span class="d3p-spacer" />
                <el-button size="small" :disabled="!dirty || saving" :loading="saving && !publishing" type="primary" icon="el-icon-check" @click="save()">
                    {{ dirty ? 'Save changes' : 'Saved' }}
                </el-button>
                <el-button v-if="current.status !== 'published'" size="small" type="success" :loading="publishing" @click="setStatus('published')">Publish</el-button>
                <el-button v-else size="small" :loading="publishing" @click="setStatus('draft')">Unpublish</el-button>
            </div>

            <div class="d3p-cols">
                <!-- the model -->
                <div class="d3p-left">
                    <div class="d3p-stage">
                        <div ref="host" class="d3p-host" />
                        <div v-if="viewerState !== 'ready'" class="d3p-over">
                            <template v-if="viewerState === 'error'">
                                <i class="el-icon-warning-outline" />
                                <div>{{ viewerMsg }}</div>
                                <el-button size="mini" @click="startViewer">Try again</el-button>
                            </template>
                            <template v-else>
                                <i class="el-icon-loading" />
                                <div>{{ viewerMsg || 'Loading the 3D model…' }}</div>
                            </template>
                        </div>
                        <div v-if="tip" class="d3p-tip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">{{ tip.text }}</div>
                    </div>
                    <div class="d3p-ctl">
                        <span class="d3p-lbl">Separate</span>
                        <el-slider v-model="exploded" class="d3p-slider" :show-tooltip="false" @input="onSlide" />
                        <el-button size="mini" @click="explode(0)">Assembled</el-button>
                        <el-button size="mini" @click="explode(100)">Exploded</el-button>
                        <el-button size="mini" @click="resetView">Reset view</el-button>
                    </div>
                    <div class="d3p-file">
                        <span><i class="el-icon-document" /> {{ (current.file && current.file.name) || 'model.glb' }}</span>
                        <span v-if="current.file">{{ mb(current.file.bytes) }} ({{ mb(current.file.gzBytes) }} to download)</span>
                        <span v-if="current.stats">{{ current.parts.length }} parts · {{ num(current.stats.meshes) }} meshes · {{ num(current.stats.triangles) }} triangles</span>
                        <el-tooltip v-if="current.explode && current.explode !== 'file'" content="The file doesn't say how its parts separate, so they are spread along the phone's depth automatically. Add extras.explode or an Explode animation in the file for a better view.">
                            <el-tag size="mini" type="warning" effect="plain">Automatic separation</el-tag>
                        </el-tooltip>
                        <span class="d3p-spacer" />
                        <el-button size="mini" icon="el-icon-upload2" :loading="replacing" @click="$refs.replaceInput.click()">Replace file</el-button>
                        <input ref="replaceInput" type="file" accept=".glb" style="display:none" @change="replaceFile">
                    </div>
                    <div v-if="replacing" class="d3p-dim">Uploading {{ uploadPct }}%…</div>
                </div>

                <!-- the parts and their links -->
                <div class="d3p-right">
                    <div class="d3p-tools">
                        <el-input v-model="titleDraft" size="small" class="d3p-title" placeholder="Title" @change="onTitle">
                            <template slot="prepend">Title</template>
                        </el-input>
                        <div class="d3p-toolrow">
                            <el-button size="mini" icon="el-icon-magic-stick" :disabled="!suggestCount" @click="applySuggestions">
                                Use suggestions{{ suggestCount ? ` (${suggestCount} parts)` : '' }}
                            </el-button>
                            <el-select v-model="copyFrom" size="mini" placeholder="Copy links from…" class="d3p-copy" :disabled="dirty"
                                :title="dirty ? 'Save your changes first' : ''" @change="copyLinks">
                                <el-option v-for="r in otherRows" :key="r.id" :label="`${r.model} (${r.linkedParts} linked)`" :value="r.id" />
                            </el-select>
                        </div>
                        <div class="d3p-dim">{{ linkedCount }} of {{ parts.length }} parts linked · click a part here or on the model</div>
                    </div>
                    <div ref="list" class="d3p-parts">
                        <div v-for="(p, i) in parts" :key="p.code" :ref="'part-' + p.code"
                            :class="['d3p-part', { on: selected === p.code }]">
                            <div class="d3p-prow" @click="selectPart(selected === p.code ? '' : p.code)">
                                <span class="d3p-no">{{ String(i + 1).padStart(2, '0') }}</span>
                                <span class="d3p-pl">{{ p.label }}<small>{{ p.code }}{{ p.face === 'front' ? ' · seen from the front' : '' }}</small></span>
                                <span v-if="!p.items.length && (suggestions[p.code] || []).length" class="d3p-sug">{{ suggestions[p.code].length }} suggested</span>
                                <span :class="['d3p-pc', { has: p.items.length }]">{{ p.items.length || '–' }}</span>
                                <i :class="selected === p.code ? 'el-icon-arrow-up' : 'el-icon-arrow-down'" />
                            </div>
                            <div v-if="selected === p.code" class="d3p-pbody">
                                <div class="d3p-face">
                                    <span class="d3p-lbl">Look at it from</span>
                                    <el-radio-group :value="p.face || ''" size="mini" @input="(v) => setFace(p, v)">
                                        <el-radio-button label="">The back</el-radio-button>
                                        <el-radio-button label="front">The front</el-radio-button>
                                    </el-radio-group>
                                </div>
                                <div class="d3p-sec">Linked items ({{ p.items.length }})</div>
                                <div v-if="!p.items.length" class="d3p-dim d3p-pad">Nothing linked — customers see “We don’t list a part for this yet”.</div>
                                <div v-for="id in p.items" :key="'l' + id" class="d3p-item">
                                    <img v-if="itemOf(id) && itemOf(id).imageId" :src="img(itemOf(id).imageId)" alt="" @error="noImg">
                                    <i v-else class="el-icon-box d3p-noimg" />
                                    <div class="d3p-iname">
                                        <template v-if="itemOf(id) && !itemOf(id).missing">
                                            {{ itemOf(id).name }}
                                            <small>SKU {{ itemOf(id).sku }} · <span :class="stockClass(itemOf(id))">{{ stockText(itemOf(id)) }}</span>
                                                <template v-if="itemOf(id).elsewhere"> · not listed for this model</template></small>
                                        </template>
                                        <template v-else>Item {{ id }} <small class="d3p-bad">no longer in the store — remove it</small></template>
                                    </div>
                                    <el-button type="text" size="mini" icon="el-icon-close" class="d3p-del" title="Unlink" @click="unlink(p, id)" />
                                </div>

                                <div class="d3p-sec">Add items</div>
                                <div class="d3p-addbar">
                                    <el-input v-model="filter" size="mini" clearable prefix-icon="el-icon-search"
                                        :placeholder="searchAll ? 'Search all parts (name or SKU)…' : `Filter ${items.length} parts for this model…`"
                                        @input="onFilter" />
                                    <el-checkbox v-model="searchAll" size="mini" @change="onFilter">All models</el-checkbox>
                                </div>
                                <div class="d3p-cands">
                                    <div v-if="searchAll && searching" class="d3p-dim d3p-pad"><i class="el-icon-loading" /> Searching…</div>
                                    <div v-else-if="!candidates(p).length" class="d3p-dim d3p-pad">{{ searchAll && filter.trim().length < 2 ? 'Type at least 2 letters.' : 'No more items match.' }}</div>
                                    <div v-for="it in candidates(p)" :key="'c' + it.id" class="d3p-item d3p-cand" @click="link(p, it)">
                                        <img v-if="it.imageId" :src="img(it.imageId)" alt="" @error="noImg">
                                        <i v-else class="el-icon-box d3p-noimg" />
                                        <div class="d3p-iname">
                                            <el-tag v-if="isSuggested(p, it)" size="mini" type="warning" effect="plain" class="d3p-star">Suggested</el-tag>{{ it.name }}
                                            <small>{{ it.type }}{{ it.sub ? ' › ' + it.sub : '' }} · SKU {{ it.sku }} · <span :class="stockClass(it)">{{ stockText(it) }}</span></small>
                                        </div>
                                        <el-button type="text" size="mini" icon="el-icon-plus">Link</el-button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ── New 3D diagram ───────────────────────────────────────── -->
        <el-dialog title="New 3D Diagram" :visible.sync="createOpen" width="560px" :close-on-click-modal="false" append-to-body>
            <el-form label-position="top" size="small">
                <el-form-item label="Model (as it appears in the ordering widget)">
                    <el-cascader v-model="createForm.path" :options="modelOptions" filterable clearable style="width:100%"
                        :props="{ expandTrigger: 'hover' }" placeholder="Brand › Series › Model — type to search" />
                    <div v-if="!models" class="d3p-dim"><i class="el-icon-loading" /> Loading the models…</div>
                </el-form-item>
                <el-form-item label="3D file (.glb)">
                    <input ref="createInput" type="file" accept=".glb" @change="(e) => (createFile = e.target.files[0] || null)">
                    <div v-if="createFile" class="d3p-dim">{{ createFile.name }} · {{ mb(createFile.size) }}</div>
                    <div class="d3p-help">
                        One node per part, named <code>CODE_Label</code> (e.g. <code>QBA01_Battery</code>) or with
                        extras <code>{ code, label }</code>; separation from extras <code>explode</code> or an
                        “Explode” animation. Same layout as the Samsung S24 file. No Draco / Meshopt compression.
                    </div>
                </el-form-item>
                <el-form-item label="Title (optional)">
                    <el-input v-model="createForm.title" maxlength="120" placeholder="Defaults to Brand + Model" />
                </el-form-item>
            </el-form>
            <div v-if="uploading" class="d3p-dim">Uploading {{ uploadPct }}%{{ uploadPct === 100 ? ' — reading the file…' : '' }}</div>
            <span slot="footer">
                <el-button size="small" @click="createOpen = false">Cancel</el-button>
                <el-button size="small" type="primary" :loading="uploading" :disabled="!createFile || createForm.path.length < 2" @click="create">Upload</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import {
    get3dDiagrams, get3dModels, search3dItems, create3dDiagram, get3dDiagram, get3dDiagramFile,
    update3dDiagram, replace3dDiagramFile, copy3dDiagramLinks, delete3dDiagram
} from '@/api/embedOrdering'

const IMG_BASE = 'https://www.imobilestore.com.au/product-images/image/'
const VIEWER_FILE = 'embed-ordering/viewer3d.js?v=2'

// Where the backend (and so the shared 3D viewer) lives: the API base when it
// is absolute (dev: http://localhost:3002, production: the Railway backend).
function backendOrigin() {
    try {
        return new URL(process.env.VUE_APP_BASE_API).origin
    } catch (e) {
        return window.location.origin
    }
}
// The viewer is the ordering widget's own ES module (backend
// public/widgets/embed-ordering/viewer3d.js + three.js), imported at run time
// — kept out of webpack on purpose.
let viewerModule = null
function loadViewer() {
    if (!viewerModule) {
        // eslint-disable-next-line no-new-func
        const dynamicImport = new Function('u', 'return import(u)')
        viewerModule = dynamicImport(`${backendOrigin()}/widget-assets/${VIEWER_FILE}`).catch((e) => {
            viewerModule = null
            throw e
        })
    }
    return viewerModule
}
const clone = (parts) => parts.map((p) => ({ code: p.code, label: p.label, face: p.face || '', items: [...(p.items || [])] }))

export default {
    name: 'EmbedDiagrams3d',
    data() {
        return {
            loading: false,
            rows: [],
            query: { q: '', status: '' },
            models: null,
            createOpen: false,
            createForm: { path: [], title: '' },
            createFile: null,
            uploading: false,
            uploadPct: 0,
            // editor
            current: null,
            parts: [],
            items: [],
            extra: {},
            suggestions: {},
            selected: '',
            dirty: false,
            saving: false,
            publishing: false,
            replacing: false,
            titleDraft: '',
            filter: '',
            searchAll: false,
            searching: false,
            searchRes: [],
            copyFrom: '',
            viewerState: 'idle',
            viewerMsg: '',
            exploded: 80,
            tip: null
        }
    },
    computed: {
        shownRows() {
            const q = this.query.q.trim().toLowerCase()
            return this.rows.filter((r) => (!this.query.status || r.status === this.query.status) &&
                (!q || `${r.brand} ${r.model} ${r.title}`.toLowerCase().includes(q)))
        },
        otherRows() {
            return this.current ? this.rows.filter((r) => r.id !== this.current.id && r.linkedParts) : []
        },
        itemMap() {
            const m = {}
            this.items.forEach((i) => { m[i.id] = i })
            Object.keys(this.extra).forEach((k) => { if (!m[k]) m[k] = this.extra[k] })
            return m
        },
        linkedCount() {
            return this.parts.filter((p) => p.items.length).length
        },
        suggestCount() {
            return this.parts.filter((p) => !p.items.length && (this.suggestions[p.code] || []).length).length
        },
        modelOptions() {
            if (!this.models) return []
            const taken = new Set(this.models.taken.map((t) => `${t.brand}|${t.model}`))
            const model = (b, m) => ({
                value: m.name,
                label: `${m.name} (${m.parts} parts)${taken.has(`${b.name}|${m.name}`) ? ' — has one' : ''}`,
                disabled: taken.has(`${b.name}|${m.name}`)
            })
            return this.models.brands.map((b) => {
                const named = b.series.filter((s) => s.name)
                if (!named.length) return { value: b.name, label: b.name, children: [].concat(...b.series.map((s) => s.models.map((m) => model(b, m)))) }
                return { value: b.name, label: b.name, children: b.series.map((s) => ({ value: s.name || '—', label: s.name || 'Other', children: s.models.map((m) => model(b, m)) })) }
            })
        }
    },
    created() {
        this._viewer = null
        this._searchTimer = null
        this.load()
    },
    beforeDestroy() {
        this.dropViewer()
    },
    beforeRouteLeave(to, from, next) {
        if (!this.dirty) return next()
        this.$confirm('You have unsaved link changes. Leave without saving?', 'Unsaved changes', { type: 'warning', confirmButtonText: 'Leave', cancelButtonText: 'Stay' })
            .then(() => next()).catch(() => next(false))
    },
    methods: {
        mb(n) {
            if (!n && n !== 0) return ''
            return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
        },
        num(n) {
            return Number(n || 0).toLocaleString()
        },
        when(t) {
            return t ? new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
        },
        img(id) {
            return `${IMG_BASE}${encodeURIComponent(id)}/400x400`
        },
        noImg(e) {
            e.target.style.visibility = 'hidden'
        },
        stockText(i) {
            return i.available > 0 ? `${i.available} in stock` : 'Out of stock'
        },
        stockClass(i) {
            return i.available > 0 ? 'd3p-ok' : 'd3p-out'
        },
        errMsg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback
        },

        // ── list ──
        async load() {
            this.loading = true
            try {
                const r = await get3dDiagrams()
                this.rows = r.items || []
            } catch (e) {
                this.$message.error(this.errMsg(e, 'Couldn’t load the 3D diagrams'))
            } finally {
                this.loading = false
            }
        },
        async openCreate() {
            this.createForm = { path: [], title: '' }
            this.createFile = null
            if (this.$refs.createInput) this.$refs.createInput.value = ''
            this.uploadPct = 0
            this.createOpen = true
            try {
                this.models = null
                this.models = await get3dModels()
            } catch (e) {
                this.$message.error(this.errMsg(e, 'Couldn’t load the models'))
            }
        },
        async create() {
            const path = this.createForm.path
            const brand = path[0]
            const model = path[path.length - 1]
            if (!/\.glb$/i.test(this.createFile.name)) return this.$message.warning('Choose a .glb file')
            const fd = new FormData()
            fd.append('brand', brand)
            fd.append('model', model)
            if (this.createForm.title.trim()) fd.append('title', this.createForm.title.trim())
            fd.append('file', this.createFile)
            this.uploading = true
            this.uploadPct = 0
            try {
                const r = await create3dDiagram(fd, (ev) => { if (ev.total) this.uploadPct = Math.round((ev.loaded / ev.total) * 100) })
                this.createOpen = false
                this.$message.success(`${model}: ${r.diagram.parts} parts found — link them to items, then Publish`)
                await this.load()
                this.open(String(r.id))
            } catch (e) {
                this.$message.error(this.errMsg(e, 'Upload failed'))
            } finally {
                this.uploading = false
            }
        },
        remove(row) {
            this.$confirm(`Delete the 3D diagram for ${row.model}? ${row.status === 'published' ? 'The widget stops showing its 3D view. ' : ''}The file and its links are deleted.`,
                'Delete 3D diagram', { type: 'warning', confirmButtonText: 'Delete', confirmButtonClass: 'el-button--danger' })
                .then(async () => {
                    try {
                        await delete3dDiagram(row.id)
                        this.$message.success('Deleted')
                        if (this.current && this.current.id === row.id) this.close(true)
                        this.load()
                    } catch (e) {
                        this.$message.error(this.errMsg(e, 'Delete failed'))
                    }
                }).catch(() => {})
        },

        // ── editor ──
        async open(id) {
            this.dropViewer()
            this.current = null
            this.selected = ''
            this.dirty = false
            this.filter = ''
            this.searchAll = false
            this.searchRes = []
            this.copyFrom = ''
            this.tip = null
            const loader = this.$loading({ text: 'Opening…' })
            try {
                await this.fetchDetail(id)
            } catch (e) {
                this.$message.error(this.errMsg(e, 'Couldn’t open the 3D diagram'))
                return
            } finally {
                loader.close()
            }
            this.$nextTick(() => this.startViewer())
        },
        async fetchDetail(id) {
            const r = await get3dDiagram(id)
            const d = r.diagram
            this.current = { ...d, id: String(d.id) }
            this.parts = clone(d.parts)
            this.items = r.items || []
            const extra = {}
            ;(r.linked || []).forEach((i) => { extra[i.id] = i })
            this.extra = extra
            this.suggestions = r.suggestions || {}
            this.titleDraft = d.title
            this.dirty = false
        },
        close(force) {
            const go = () => {
                this.dropViewer()
                this.current = null
                this.dirty = false
                this.load()
            }
            if (this.dirty && force !== true) {
                this.$confirm('You have unsaved link changes. Leave without saving?', 'Unsaved changes', { type: 'warning', confirmButtonText: 'Leave', cancelButtonText: 'Stay' })
                    .then(go).catch(() => {})
            } else go()
        },

        // ── the 3D preview ──
        dropViewer() {
            if (this._viewer) {
                try { this._viewer.dispose() } catch (e) { /* gone */ }
                this._viewer = null
            }
            this.viewerState = 'idle'
        },
        async startViewer() {
            this.dropViewer()
            const d = this.current
            if (!d || !this.$refs.host) return
            this.viewerState = 'loading'
            this.viewerMsg = 'Loading the 3D model…'
            try {
                const [mod, buf] = await Promise.all([loadViewer(), get3dDiagramFile(d.id, d.file && d.file.version)])
                if (this.current !== d) return
                if (mod.webglAvailable && !mod.webglAvailable()) throw new Error('This browser can’t show 3D (WebGL is off).')
                const v = mod.createViewer(this.$refs.host, {
                    accent: '#409eff',
                    onSelect: (code) => this.selectPart(code, true),
                    onHover: (p, at) => this.onHover(p, at),
                    onExploded: (t) => { this.exploded = Math.round(t * 100) }
                })
                this._viewer = v
                this.pushFaces()
                await v.load(buf)
                if (this._viewer !== v) return
                if (this.selected) v.select(this.selected)
                this.viewerState = 'ready'
            } catch (e) {
                if (this.current !== d) return
                this.viewerState = 'error'
                this.viewerMsg = this.errMsg(e, 'The 3D model couldn’t be loaded')
            }
        },
        pushFaces() {
            if (!this._viewer) return
            const faces = {}
            this.parts.forEach((p) => { faces[p.code] = { face: p.face || '' } })
            this._viewer.setPartOptions(faces)
        },
        onHover(p, at) {
            if (!p || !at || !this.$refs.host) { this.tip = null; return }
            const r = this.$refs.host.getBoundingClientRect()
            const part = this.parts.find((x) => x.code === p.code)
            this.tip = { x: at.x - r.left, y: at.y - r.top, text: `${p.label} · ${part ? part.items.length : 0} linked` }
        },
        onSlide(v) {
            if (this._viewer && Math.round(this._viewer.exploded * 100) !== v) this._viewer.setExploded(v / 100)
        },
        explode(v) {
            this.exploded = v
            if (this._viewer) this._viewer.setExploded(v / 100)
        },
        resetView() {
            if (this._viewer) this._viewer.reset()
        },

        // ── parts ──
        selectPart(code, fromModel) {
            if (this.selected === code) return
            this.selected = code || ''
            this.filter = ''
            this.searchRes = []
            if (!fromModel && this._viewer) this._viewer.select(this.selected)
            if (this.selected) {
                this.$nextTick(() => {
                    const el = this.$refs['part-' + this.selected]
                    const node = Array.isArray(el) ? el[0] : el
                    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
                })
            }
        },
        itemOf(id) {
            return this.itemMap[id] || null
        },
        isSuggested(p, it) {
            return (this.suggestions[p.code] || []).includes(it.id)
        },
        candidates(p) {
            const linked = new Set(p.items)
            if (this.searchAll) return this.searchRes.filter((i) => !linked.has(i.id))
            const words = this.filter.trim().toLowerCase().split(/\s+/).filter(Boolean)
            const sug = new Set(this.suggestions[p.code] || [])
            return this.items
                .filter((i) => !linked.has(i.id))
                .filter((i) => words.every((w) => `${i.name} ${i.sku} ${i.type} ${i.sub}`.toLowerCase().includes(w)))
                .sort((a, b) => (sug.has(b.id) ? 1 : 0) - (sug.has(a.id) ? 1 : 0))
        },
        onFilter() {
            if (!this.searchAll) return
            clearTimeout(this._searchTimer)
            const q = this.filter.trim()
            if (q.length < 2) { this.searchRes = []; return }
            this.searching = true
            this._searchTimer = setTimeout(async () => {
                try {
                    const r = await search3dItems(q)
                    if (this.filter.trim() !== q) return
                    this.searchRes = r.items || []
                } catch (e) {
                    this.$message.error(this.errMsg(e, 'Search failed'))
                } finally {
                    this.searching = false
                }
            }, 300)
        },
        link(p, it) {
            if (p.items.includes(it.id)) return
            if (p.items.length >= 60) return this.$message.warning('At most 60 items per part')
            if (!this.items.some((i) => i.id === it.id) && !this.extra[it.id]) this.$set(this.extra, it.id, { ...it, elsewhere: true })
            p.items.push(it.id)
            this.dirty = true
        },
        unlink(p, id) {
            p.items = p.items.filter((x) => x !== id)
            this.dirty = true
        },
        setFace(p, v) {
            p.face = v || ''
            this.dirty = true
            this.pushFaces()
            if (this._viewer && this.selected === p.code) this._viewer.select(p.code)
        },
        applySuggestions() {
            let n = 0
            this.parts.forEach((p) => {
                const s = this.suggestions[p.code] || []
                if (!p.items.length && s.length) { p.items = [...s]; n++ }
            })
            if (n) {
                this.dirty = true
                this.$message.success(`Suggested items added to ${n} parts — check them, then Save`)
            }
        },
        onTitle(v) {
            if (!v.trim()) { this.titleDraft = this.current.title; return }
            if (v.trim() !== this.current.title) this.dirty = true
        },
        body() {
            const b = { parts: this.parts.map((p) => ({ code: p.code, items: p.items, face: p.face || '' })) }
            if (this.titleDraft.trim() && this.titleDraft.trim() !== this.current.title) b.title = this.titleDraft.trim()
            return b
        },
        async save(extra) {
            this.saving = true
            try {
                const r = await update3dDiagram(this.current.id, { ...this.body(), ...(extra || {}) })
                if (r.diagram) {
                    this.current = { ...this.current, ...r.diagram, id: this.current.id, file: this.current.file, stats: this.current.stats }
                    this.titleDraft = this.current.title
                }
                this.dirty = false
                if (!extra) this.$message.success('Saved')
                return true
            } catch (e) {
                this.$message.error(this.errMsg(e, 'Save failed'))
                return false
            } finally {
                this.saving = false
            }
        },
        async setStatus(status) {
            if (status === 'published' && !this.linkedCount) {
                try {
                    await this.$confirm('No part is linked to an item yet — customers can turn the model but can’t order from it. Publish anyway?', 'Publish', { type: 'warning' })
                } catch (e) { return }
            }
            this.publishing = true
            const ok = await this.save({ status })
            this.publishing = false
            if (ok) this.$message.success(status === 'published' ? 'Published — the widget shows the 3D view (within a minute)' : 'Unpublished — the widget no longer shows it')
        },
        async copyLinks(fromId) {
            if (!fromId) return
            const from = this.rows.find((r) => r.id === fromId)
            try {
                await this.$confirm(`Copy links from ${from ? from.model : 'that model'} into parts with the same code that have no links yet?`, 'Copy links', { type: 'info' })
                const r = await copy3dDiagramLinks(this.current.id, fromId, false)
                await this.fetchDetail(this.current.id)
                this.pushFaces()
                this.$message.success(r.copied ? `Links copied into ${r.copied} parts` : 'No empty part with a matching code')
            } catch (e) {
                if (e !== 'cancel') this.$message.error(this.errMsg(e, 'Copy failed'))
            } finally {
                this.copyFrom = ''
            }
        },
        async replaceFile(e) {
            const file = e.target.files[0]
            e.target.value = ''
            if (!file) return
            if (!/\.glb$/i.test(file.name)) return this.$message.warning('Choose a .glb file')
            try {
                await this.$confirm(`Replace the 3D file with ${file.name} (${this.mb(file.size)})? Links stay with the parts whose code is in the new file.`, 'Replace file', { type: 'warning' })
            } catch (x) { return }
            if (this.dirty && !(await this.save())) return
            const fd = new FormData()
            fd.append('file', file)
            this.replacing = true
            this.uploadPct = 0
            try {
                const r = await replace3dDiagramFile(this.current.id, fd, (ev) => { if (ev.total) this.uploadPct = Math.round((ev.loaded / ev.total) * 100) })
                await this.fetchDetail(this.current.id)
                this.selected = ''
                this.$nextTick(() => this.startViewer())
                const lost = (r.removed || []).filter((x) => x.items).length
                this.$message({
                    type: lost ? 'warning' : 'success',
                    duration: 6000,
                    message: `File replaced. ${r.added.length} new part${r.added.length === 1 ? '' : 's'}, ${r.removed.length} gone` +
                        (lost ? ` (${lost} of them had links)` : '') + '.'
                })
            } catch (x) {
                this.$message.error(this.errMsg(x, 'Upload failed'))
            } finally {
                this.replacing = false
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.d3p-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    flex-wrap: wrap;
    .f-search { width: 280px; }
    .f-sel { width: 130px; }
}
.d3p-spacer { flex: 1; }
.d3p-dim { color: #909399; font-size: 12px; }
.d3p-ml { margin-left: 6px; }
.d3p-del { color: #f56c6c; }
.d3p-ok { color: #67c23a; }
.d3p-out { color: #909399; }
.d3p-bad { color: #f56c6c; }
.d3p-lbl { font-size: 12px; color: #606266; font-weight: 600; white-space: nowrap; }
.d3p-head { font-size: 15px; }
.d3p-cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 440px;
    gap: 14px;
    align-items: start;
}
.d3p-left { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.d3p-stage {
    position: relative;
    height: calc(100vh - 280px);
    min-height: 420px;
    border: 1px solid #e4e7ed;
    border-radius: 8px;
    overflow: hidden;
    background: radial-gradient(circle at 50% 40%, #fbfcfe, #e9eef4);
}
.d3p-host { position: absolute; inset: 0; }
.d3p-over {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: #909399;
    background: rgba(248, 250, 252, 0.8);
    i { font-size: 24px; }
}
.d3p-tip {
    position: absolute;
    pointer-events: none;
    transform: translate(-50%, calc(-100% - 12px));
    background: #303133;
    color: #fff;
    font-size: 12px;
    padding: 3px 8px;
    border-radius: 4px;
    white-space: nowrap;
}
.d3p-ctl { display: flex; align-items: center; gap: 10px; }
.d3p-slider { flex: 1; margin: 0 6px; }
.d3p-file {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 12px;
    color: #606266;
}
.d3p-right {
    border: 1px solid #e4e7ed;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    height: calc(100vh - 190px);
    min-height: 520px;
    overflow: hidden;
}
.d3p-tools {
    padding: 10px;
    border-bottom: 1px solid #ebeef5;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.d3p-toolrow { display: flex; gap: 8px; }
.d3p-copy { flex: 1; }
.d3p-parts { flex: 1; overflow: auto; }
.d3p-part { border-bottom: 1px solid #f0f2f5; }
.d3p-part.on { background: #f5f9ff; }
.d3p-prow {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    cursor: pointer;
    &:hover { background: #f5f7fa; }
}
.d3p-no { width: 20px; font-size: 11px; color: #909399; flex: none; }
.d3p-pl {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    font-weight: 600;
    font-size: 13px;
    small { font-weight: 400; color: #909399; font-size: 11px; }
}
.d3p-sug { font-size: 11px; color: #e6a23c; white-space: nowrap; }
.d3p-pc {
    font-size: 11px;
    font-weight: 700;
    border-radius: 10px;
    padding: 1px 8px;
    background: #f0f2f5;
    color: #909399;
    &.has { background: #ecf5ff; color: #409eff; }
}
.d3p-pbody { padding: 4px 10px 12px 38px; }
.d3p-face { display: flex; align-items: center; gap: 8px; margin: 4px 0 8px; }
.d3p-sec {
    font-size: 11px;
    font-weight: 700;
    color: #909399;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 10px 0 4px;
}
.d3p-pad { padding: 6px 0; }
.d3p-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    img, .d3p-noimg {
        width: 36px;
        height: 36px;
        border-radius: 4px;
        object-fit: contain;
        background: #fff;
        border: 1px solid #ebeef5;
        flex: none;
    }
    .d3p-noimg { display: flex; align-items: center; justify-content: center; color: #c0c4cc; font-size: 18px; }
}
.d3p-iname {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    line-height: 1.35;
    small { display: block; color: #909399; font-size: 11px; }
}
.d3p-star { margin-right: 4px; }
.d3p-addbar { display: flex; align-items: center; gap: 8px; }
.d3p-cands { max-height: 280px; overflow: auto; margin-top: 4px; }
.d3p-cand { cursor: pointer; border-radius: 4px; padding: 4px; &:hover { background: #ecf5ff; } }
.d3p-help {
    font-size: 12px;
    color: #909399;
    line-height: 1.5;
    margin-top: 4px;
    code { background: #f4f4f5; padding: 0 4px; border-radius: 3px; }
}
@media (max-width: 1200px) {
    .d3p-cols { grid-template-columns: minmax(0, 1fr); }
    .d3p-right { height: auto; }
}
</style>
