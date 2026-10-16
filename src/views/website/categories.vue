<template>
    <!--
        iMobile Website → Categories (user ask 2026-10-16): the online store's
        category tree, straight from Zoho Commerce. Commerce and Inventory
        share one tree, so this is also what Zoho Inventory items are filed
        under. Create and edit categories, see the products filed directly
        under one, and move products into a category. Nothing is deleted here.
        Backend routes/websiteRoutes/categories (listing:category:view / manage).
        Sits under iMobile Listing since 2026-10-16.
    -->
    <div class="app-container ct-page">
        <div class="ct-head">
            <div>
                <div class="ct-title">Categories</div>
                <div class="ct-sub">The online store's categories, straight from Zoho Commerce — the same tree Zoho Inventory files items under.</div>
            </div>
            <div class="ct-spacer" />
            <div class="ct-actions">
                <el-button v-if="canManage" size="small" type="primary" icon="el-icon-plus" @click="openEditor(null, current ? current.id : '')">New category</el-button>
                <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load(true)">Refresh</el-button>
            </div>
        </div>

        <div class="ct-body">
            <!-- ── the tree ─────────────────────────────────────────── -->
            <div class="ct-card ct-tree-card">
                <el-input v-model="filter" size="small" clearable prefix-icon="el-icon-search" placeholder="Find a category" />
                <div class="ct-dim ct-tree-meta">
                    {{ categories.length }} categories
                    <span v-if="loadedAt"> · read {{ loadedAt }}</span>
                </div>
                <el-tree ref="tree" v-loading="loading" :data="tree" node-key="id" :props="treeProps" :filter-node-method="filterNode"
                    :expand-on-click-node="false" :default-expanded-keys="expandedKeys" highlight-current class="ct-tree"
                    @node-click="select">
                    <span slot-scope="{ data }" class="ct-node">
                        <span :class="['ct-node-name', { 'ct-off': !data.visible }]">{{ data.name }}</span>
                        <span v-if="data.children" class="ct-node-n">{{ data.children.length }}</span>
                        <i v-if="!data.visible" class="el-icon-view ct-off" title="Hidden on the website" />
                    </span>
                </el-tree>
            </div>

            <!-- ── the picked category ──────────────────────────────── -->
            <div class="ct-card ct-detail-card">
                <div v-if="!current" class="ct-empty">
                    <i class="el-icon-menu" />
                    <div>Pick a category on the left to see its products.</div>
                </div>
                <template v-else>
                    <div class="ct-path">
                        <span v-for="(a, i) in pathOf(current)" :key="a.id">
                            <a class="ct-link" @click="selectById(a.id)">{{ a.name }}</a><span v-if="i < pathOf(current).length - 1" class="ct-dim"> / </span>
                        </span>
                    </div>
                    <div class="ct-d-head">
                        <div class="ct-d-title">{{ current.name }}</div>
                        <el-tag size="mini" :type="current.visible ? 'success' : 'info'" effect="plain">{{ current.visible ? 'Visible on website' : 'Hidden' }}</el-tag>
                        <el-tag v-if="current.showInMenu" size="mini" effect="plain">In menu</el-tag>
                        <div class="ct-spacer" />
                        <el-button v-if="canManage" size="mini" icon="el-icon-edit" @click="openEditor(current)">Edit</el-button>
                        <el-button v-if="canManage" size="mini" icon="el-icon-plus" @click="openEditor(null, current.id)">New sub-category</el-button>
                    </div>
                    <div class="ct-dim ct-d-meta">
                        URL <code>{{ current.url || '—' }}</code>
                        <span> · {{ childrenOf(current.id).length }} sub-categories</span>
                        <span v-if="current.description"> · {{ current.description }}</span>
                    </div>

                    <div class="ct-p-bar">
                        <span class="ct-p-title">Products filed directly under {{ current.name }}</span>
                        <span v-if="products.length" class="ct-dim">· page {{ page }}{{ hasMore ? ', more after this' : '' }}</span>
                        <div class="ct-spacer" />
                        <el-button v-if="canManage && picked.length" size="mini" type="warning" plain icon="el-icon-sort" @click="openMove(picked)">Move {{ picked.length }} to…</el-button>
                        <el-button v-if="canManage" size="mini" type="primary" plain icon="el-icon-plus" @click="openAdd">Add products</el-button>
                    </div>
                    <el-table v-loading="productsLoading" :data="products" size="small" border class="ct-table"
                        :empty-text="productsLoading ? ' ' : 'No products filed directly under this category'" @selection-change="r => picked = r">
                        <el-table-column v-if="canManage" type="selection" width="40" />
                        <el-table-column label="" width="56" align="center">
                            <template slot-scope="s">
                                <el-image v-if="s.row.imageUrl" :src="s.row.imageUrl" fit="contain" class="ct-thumb" lazy>
                                    <i slot="error" class="el-icon-picture-outline ct-dim" />
                                </el-image>
                                <i v-else class="el-icon-picture-outline ct-dim" />
                            </template>
                        </el-table-column>
                        <el-table-column label="Product" min-width="280">
                            <template slot-scope="s">
                                <div class="ct-pname">{{ s.row.name }}</div>
                                <div class="ct-dim">
                                    <span v-if="s.row.skus.length">SKU {{ s.row.skus.slice(0, 3).join(', ') }}<span v-if="s.row.skus.length > 3"> +{{ s.row.skus.length - 3 }}</span></span>
                                    <span v-if="s.row.variantCount > 1"> · {{ s.row.variantCount }} variants</span>
                                </div>
                            </template>
                        </el-table-column>
                        <el-table-column label="Brand" prop="brand" width="120" show-overflow-tooltip />
                        <el-table-column label="Price" width="120" align="right">
                            <template slot-scope="s">{{ priceOf(s.row) }}</template>
                        </el-table-column>
                        <el-table-column label="Status" width="130">
                            <template slot-scope="s">
                                <el-tag size="mini" :type="s.row.status === 'active' ? 'success' : 'info'" effect="plain">{{ s.row.status || '—' }}</el-tag>
                                <div v-if="!s.row.showInStorefront" class="ct-dim">not on storefront</div>
                            </template>
                        </el-table-column>
                        <el-table-column v-if="canManage" label="" width="90" align="center">
                            <template slot-scope="s">
                                <el-button type="text" size="mini" icon="el-icon-sort" @click="openMove([s.row])">Move…</el-button>
                            </template>
                        </el-table-column>
                    </el-table>
                    <div v-if="page > 1 || hasMore" class="ct-pager">
                        <el-button size="mini" icon="el-icon-arrow-left" :disabled="page <= 1 || productsLoading" @click="loadProducts(page - 1)">Previous</el-button>
                        <span class="ct-dim">Page {{ page }}</span>
                        <el-button size="mini" :disabled="!hasMore || productsLoading" @click="loadProducts(page + 1)">Next <i class="el-icon-arrow-right" /></el-button>
                    </div>
                </template>
            </div>
        </div>

        <!-- ── create / edit ───────────────────────────────────────── -->
        <el-dialog :title="editor.id ? 'Edit category' : 'New category'" :visible.sync="editorVisible" :width="narrow ? '96%' : '540px'"
            :close-on-click-modal="false" append-to-body>
            <el-form label-position="top" size="small" @submit.native.prevent>
                <el-form-item label="Name" required>
                    <el-input v-model="editor.name" maxlength="200" @input="onNameInput" />
                </el-form-item>
                <el-form-item label="URL">
                    <el-input v-model="editor.url" maxlength="100" placeholder="letters, numbers, - and _" @input="editor.urlTouched = true">
                        <template slot="prepend">/categories/</template>
                    </el-input>
                    <div class="ct-dim ct-hint">Must be unique in the store.</div>
                </el-form-item>
                <el-form-item label="Parent category">
                    <el-cascader v-model="editor.parentId" :options="parentOptions" :props="cascaderProps" filterable clearable
                        placeholder="None — a top-level category" class="ct-full" />
                </el-form-item>
                <el-form-item label="Description">
                    <el-input v-model="editor.description" type="textarea" :rows="2" maxlength="2000" />
                </el-form-item>
                <div class="ct-switches">
                    <el-switch v-model="editor.visible" active-text="Visible on the website" />
                    <el-switch v-model="editor.showInMenu" active-text="Show in the website menu" />
                </div>
            </el-form>
            <span slot="footer">
                <el-button size="small" @click="editorVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" :loading="saving" @click="saveEditor">{{ editor.id ? 'Save' : 'Create' }}</el-button>
            </span>
        </el-dialog>

        <!-- ── move products ───────────────────────────────────────── -->
        <el-dialog title="Move to category" :visible.sync="moveVisible" :width="narrow ? '96%' : '520px'" append-to-body>
            <div class="ct-dim ct-move-what">
                {{ moveRows.length === 1 ? moveRows[0].name : moveRows.length + ' products' }}
                <span v-if="moveRows.length === 1 && moveRows[0].categoryName"> · now in {{ moveRows[0].categoryName }}</span>
            </div>
            <el-cascader v-model="moveTarget" :options="categoryOptions" :props="cascaderProps" filterable
                placeholder="Pick the category to file them under" class="ct-full" />
            <span slot="footer">
                <el-button size="small" @click="moveVisible = false">Cancel</el-button>
                <el-button type="primary" size="small" :loading="moving" :disabled="!moveTarget" @click="doMove(moveRows, moveTarget)">Move</el-button>
            </span>
        </el-dialog>

        <!-- ── add products to the picked category ──────────────────── -->
        <el-dialog :title="current ? 'Add products to ' + current.name : 'Add products'" :visible.sync="addVisible"
            :width="narrow ? '96%' : '820px'" append-to-body>
            <el-input ref="addSearch" v-model="addQuery" size="small" clearable prefix-icon="el-icon-search"
                placeholder="Search products by name or SKU" @input="onAddSearch" />
            <el-table v-loading="addLoading" :data="addResults" size="small" border max-height="420" class="ct-add-table"
                :empty-text="addQuery.trim().length < 2 ? 'Type at least two letters' : 'No products found'" @selection-change="r => addPicked = r">
                <el-table-column type="selection" width="40" :selectable="r => !current || r.categoryId !== current.id" />
                <el-table-column label="Product" min-width="280">
                    <template slot-scope="s">
                        <div class="ct-pname">{{ s.row.name }}</div>
                        <div v-if="s.row.skus.length" class="ct-dim">SKU {{ s.row.skus.slice(0, 3).join(', ') }}</div>
                    </template>
                </el-table-column>
                <el-table-column label="Now in" min-width="170">
                    <template slot-scope="s">
                        <span v-if="current && s.row.categoryId === current.id" class="ct-ok">Already here</span>
                        <span v-else>{{ s.row.categoryName || '—' }}</span>
                    </template>
                </el-table-column>
                <el-table-column label="Status" width="90">
                    <template slot-scope="s">{{ s.row.status || '—' }}</template>
                </el-table-column>
            </el-table>
            <span slot="footer">
                <el-button size="small" @click="addVisible = false">Close</el-button>
                <el-button type="primary" size="small" :loading="moving" :disabled="!addPicked.length"
                    @click="doMove(addPicked, current.id, true)">Move {{ addPicked.length || '' }} here</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import { listCategories, createCategory, updateCategory, getCategoryProducts, searchCategoryProducts, moveProductsToCategory } from '@/api/website'
import { hasPermission } from '@/utils/permission'

const ROOT = '-1'
const slugify = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)
const fmtTime = d => {
    const t = new Date(d)
    if (isNaN(t)) return ''
    const p = x => String(x).padStart(2, '0')
    return `${p(t.getHours())}:${p(t.getMinutes())}`
}

export default {
    name: 'ListingCategories',
    data() {
        return {
            loading: false,
            categories: [],
            loadedAt: '',
            filter: '',
            treeProps: { label: 'name', children: 'children' },
            current: null,
            products: [],
            productsLoading: false,
            page: 1,
            hasMore: false,
            picked: [],
            // create / edit
            editorVisible: false,
            saving: false,
            editor: { id: '', name: '', url: '', urlTouched: false, parentId: '', description: '', visible: true, showInMenu: false },
            // move
            moveVisible: false,
            moveRows: [],
            moveTarget: '',
            moving: false,
            // add products
            addVisible: false,
            addQuery: '',
            addResults: [],
            addLoading: false,
            addPicked: [],
            addTimer: null,
            narrow: typeof window !== 'undefined' && window.innerWidth < 768
        }
    },
    computed: {
        canManage() {
            return hasPermission(this.$store.getters.permissions, 'listing:category:manage')
        },
        byId() {
            return new Map(this.categories.map(c => [c.id, c]))
        },
        // nested copies for the tree; `children` only where there are some, so leaves stay leaves
        tree() {
            const nodes = new Map(this.categories.map(c => [c.id, { ...c }]))
            const roots = []
            for (const n of nodes.values()) {
                const parent = n.parentId !== ROOT ? nodes.get(n.parentId) : null
                if (parent) (parent.children || (parent.children = [])).push(n)
                else roots.push(n)
            }
            const sort = list => {
                list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
                for (const n of list) if (n.children) sort(n.children)
                return list
            }
            return sort(roots)
        },
        expandedKeys() {
            return this.current ? this.pathOf(this.current).map(a => a.id) : []
        },
        cascaderProps() {
            return { checkStrictly: true, emitPath: false, value: 'id', label: 'name', children: 'children' }
        },
        categoryOptions() {
            return this.tree
        },
        // a category can't go under itself or anything below it
        parentOptions() {
            if (!this.editor.id) return this.tree
            const blocked = new Set([this.editor.id])
            const walk = list => list.map(n => {
                const off = blocked.has(n.id) || blocked.has(n.parentId)
                if (off) blocked.add(n.id)
                return { ...n, disabled: off, children: n.children ? walk(n.children) : undefined }
            })
            return walk(this.tree)
        }
    },
    watch: {
        filter(v) {
            if (this.$refs.tree) this.$refs.tree.filter(v)
        }
    },
    created() {
        this.load(false)
    },
    beforeDestroy() {
        clearTimeout(this.addTimer)
    },
    methods: {
        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback
        },
        async load(refresh) {
            this.loading = true
            try {
                const r = await listCategories(refresh)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.categories = r.categories || []
                this.loadedAt = fmtTime(r.at || new Date())
                if (this.current) this.current = this.byId.get(this.current.id) || null
                this.$nextTick(() => {
                    if (this.filter && this.$refs.tree) this.$refs.tree.filter(this.filter)
                    if (this.current && this.$refs.tree) this.$refs.tree.setCurrentKey(this.current.id)
                })
            } catch (e) {
                this.$message.error(this.msg(e, 'Could not load the categories'))
            } finally {
                this.loading = false
            }
        },
        filterNode(value, data) {
            const q = String(value || '').trim().toLowerCase()
            return !q || data.name.toLowerCase().includes(q)
        },
        pathOf(c) {
            const out = []
            let cur = c
            const seen = new Set()
            while (cur && !seen.has(cur.id)) {
                seen.add(cur.id)
                out.unshift(cur)
                cur = cur.parentId !== ROOT ? this.byId.get(cur.parentId) : null
            }
            return out
        },
        childrenOf(id) {
            return this.categories.filter(c => c.parentId === id)
        },
        select(data) {
            this.selectById(data.id)
        },
        selectById(id) {
            const c = this.byId.get(id)
            if (!c) return
            this.current = c
            this.$nextTick(() => { if (this.$refs.tree) this.$refs.tree.setCurrentKey(id) })
            this.loadProducts(1)
        },
        async loadProducts(page) {
            if (!this.current) return
            const id = this.current.id
            this.productsLoading = true
            this.picked = []
            try {
                const r = await getCategoryProducts(id, page)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                if (!this.current || this.current.id !== id) return
                this.products = r.products || []
                this.page = r.page || page
                this.hasMore = !!r.hasMore
            } catch (e) {
                this.products = []
                this.$message.error(this.msg(e, 'Could not load the products'))
            } finally {
                this.productsLoading = false
            }
        },
        priceOf(p) {
            if (p.minRate == null) return '—'
            const f = n => '$' + Number(n).toFixed(2)
            return p.maxRate != null && p.maxRate !== p.minRate ? `${f(p.minRate)} – ${f(p.maxRate)}` : f(p.minRate)
        },
        // ── create / edit ──
        openEditor(c, parentId) {
            this.editor = c
                ? { id: c.id, name: c.name, url: c.url, urlTouched: true, parentId: c.parentId !== ROOT ? c.parentId : '', description: c.description, visible: c.visible, showInMenu: c.showInMenu }
                : { id: '', name: '', url: '', urlTouched: false, parentId: parentId || '', description: '', visible: true, showInMenu: false }
            this.editorVisible = true
        },
        onNameInput(v) {
            if (!this.editor.id && !this.editor.urlTouched) this.editor.url = slugify(v)
        },
        async saveEditor() {
            const e = this.editor
            if (!String(e.name || '').trim()) { this.$message.warning('Give the category a name'); return }
            if (e.url && !/^[A-Za-z0-9_-]+$/.test(e.url)) { this.$message.warning('The URL may only hold letters, numbers, - and _'); return }
            const data = { name: e.name.trim(), url: e.url.trim(), parentId: e.parentId || ROOT, description: e.description, visible: e.visible, showInMenu: e.showInMenu }
            this.saving = true
            try {
                const r = e.id ? await updateCategory(e.id, data) : await createCategory(data)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(r.message || 'Saved')
                this.editorVisible = false
                await this.load(true)
                if (r.category && r.category.id) this.selectById(r.category.id)
            } catch (err) {
                this.$message.error(this.msg(err, 'Could not save the category'))
            } finally {
                this.saving = false
            }
        },
        // ── move products ──
        openMove(rows) {
            this.moveRows = rows.slice()
            this.moveTarget = ''
            this.moveVisible = true
        },
        async doMove(rows, categoryId, fromAdd) {
            if (!rows.length || !categoryId) return
            const target = this.byId.get(categoryId)
            this.moving = true
            try {
                const r = await moveProductsToCategory(rows.map(p => p.productId), categoryId)
                const failed = (r && r.failed) || []
                if (failed.length) {
                    this.$notify.warning({ title: r.message || 'Some products were not moved', message: failed.map(f => `${f.productId}: ${f.message}`).join('\n'), duration: 0 })
                } else {
                    this.$message.success((r && r.message) || `Moved to ${target ? target.name : 'the category'}`)
                }
                this.moveVisible = false
                if (fromAdd) { this.addPicked = []; this.searchAdd() }
                this.loadProducts(this.page)
                this.load(true)
            } catch (e) {
                this.$message.error(this.msg(e, 'Could not move the products'))
            } finally {
                this.moving = false
            }
        },
        // ── add products ──
        openAdd() {
            this.addQuery = ''
            this.addResults = []
            this.addPicked = []
            this.addVisible = true
            this.$nextTick(() => { if (this.$refs.addSearch) this.$refs.addSearch.focus() })
        },
        onAddSearch() {
            clearTimeout(this.addTimer)
            this.addTimer = setTimeout(this.searchAdd, 400)
        },
        async searchAdd() {
            const q = this.addQuery.trim()
            if (q.length < 2) { this.addResults = []; return }
            this.addLoading = true
            try {
                const r = await searchCategoryProducts(q)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                if (q === this.addQuery.trim()) this.addResults = r.products || []
            } catch (e) {
                this.$message.error(this.msg(e, 'Search failed'))
            } finally {
                this.addLoading = false
            }
        }
    }
}
</script>

<style scoped>
.ct-page { display: flex; flex-direction: column; gap: 12px; }
.ct-head { display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap; }
.ct-title { font-size: 18px; font-weight: 600; color: #303133; }
.ct-sub { font-size: 12px; color: #909399; margin-top: 2px; }
.ct-spacer { flex: 1; }
.ct-actions { display: flex; gap: 8px; flex-wrap: nowrap; }
.ct-actions .el-button + .el-button { margin-left: 0; }
.ct-dim { color: #909399; font-size: 12px; }
.ct-off { color: #c0c4cc; }
.ct-ok { color: #67c23a; font-size: 12px; }
.ct-body { display: flex; gap: 12px; align-items: stretch; flex-wrap: wrap; }
.ct-card { background: #fff; border: 1px solid #ebeef5; border-radius: 6px; padding: 12px; min-width: 0; }
.ct-tree-card { width: 340px; flex: 0 0 340px; display: flex; flex-direction: column; gap: 6px; height: calc(100vh - 190px); min-height: 360px; }
.ct-tree-meta { padding: 0 2px; }
.ct-tree { flex: 1; overflow: auto; }
.ct-node { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 13px; }
.ct-node-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ct-node-n { font-size: 11px; color: #909399; background: #f4f4f5; border-radius: 8px; padding: 0 6px; line-height: 16px; }
.ct-detail-card { flex: 1; min-width: 300px; display: flex; flex-direction: column; gap: 8px; }
.ct-empty { margin: auto; text-align: center; color: #909399; padding: 40px 0; }
.ct-empty i { font-size: 32px; color: #dcdfe6; display: block; margin-bottom: 8px; }
.ct-path { font-size: 12px; }
.ct-link { color: #409eff; cursor: pointer; }
.ct-d-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ct-d-title { font-size: 16px; font-weight: 600; color: #303133; }
.ct-d-meta code { background: #f4f4f5; padding: 0 4px; border-radius: 3px; }
.ct-p-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
.ct-p-title { font-weight: 600; font-size: 13px; color: #303133; }
.ct-thumb { width: 36px; height: 36px; }
.ct-pname { line-height: 1.35; }
.ct-pager { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
.ct-full { width: 100%; }
.ct-hint { line-height: 1.4; margin-top: 2px; }
.ct-switches { display: flex; flex-direction: column; gap: 10px; }
.ct-move-what { margin-bottom: 10px; }
.ct-add-table { margin-top: 10px; }
@media (max-width: 767px) {
    .ct-tree-card { width: 100%; flex: 1 1 100%; height: 360px; }
}
</style>
