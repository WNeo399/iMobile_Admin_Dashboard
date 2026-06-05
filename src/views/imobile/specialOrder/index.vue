<template>
    <div class="app-container tree-sidebar-manage-wrap special-order-page">
        <!--
            Left: shared TreePanel — same component the SQT Cases /
            Repair / Credit Note pages use, so the look + collapse /
            resize behaviour stays consistent across review pages.
            One root + four status leaves driven off STATUS_META.
        -->
        <tree-panel
            title="Status"
            title-icon-class="el-icon-s-flag"
            :tree-data="treeData"
            :default-expand-all="true"
            :show-search="false"
            storage-key="special-order-status-sidebar-width"
            @node-click="handleStatusClick"
        >
            <template #node="{ data }">
                <span class="status-node">
                    <i
                        :class="data.id === 'all' ? 'el-icon-files' : 'el-icon-collection-tag'"
                        class="status-node-icon"
                        :style="{ color: statusColor(data.id) }"
                    />
                    <span class="status-node-label" :title="data.label">{{ data.label }}</span>
                    <el-badge
                        v-if="data.count !== undefined"
                        :value="data.count"
                        :max="999"
                        :type="data.id === 'all' ? 'primary' : badgeType(data.id)"
                        class="status-node-badge"
                    />
                </span>
            </template>
        </tree-panel>

        <div class="tree-sidebar-content">
            <div class="content-inner">
                <!-- Search row -->
                <div class="filter-bar">
                    <el-input
                        v-model="queryParams.search"
                        placeholder="Search by name…"
                        clearable
                        size="small"
                        prefix-icon="el-icon-search"
                        class="filter-search"
                        @keyup.enter.native="handleQuery"
                        @clear="handleQuery"
                    />
                    <el-button size="small" type="primary" icon="el-icon-search" @click="handleQuery">
                        Search
                    </el-button>
                    <el-button
                        size="small"
                        icon="el-icon-refresh"
                        :loading="loading"
                        @click="getList"
                    >Refresh</el-button>

                    <span class="filter-spacer" />
                    <span class="filter-summary">
                        <strong>{{ total }}</strong>
                        {{ total === 1 ? 'submission' : 'submissions' }}
                        <span v-if="currentStatusLabel" class="filter-summary-scope">
                            · {{ currentStatusLabel }}
                        </span>
                    </span>
                </div>

                <el-table
                    v-loading="loading"
                    :data="list"
                    stripe
                    size="small"
                    class="special-table"
                    row-key="_id"
                >
                    <el-table-column label="Submitted" min-width="160">
                        <template slot-scope="scope">
                            {{ formatDate(scope.row.createdAt) || '—' }}
                        </template>
                    </el-table-column>
                    <el-table-column label="Name" min-width="180">
                        <template slot-scope="scope">
                            <span class="row-name">{{ scope.row.name || '—' }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="Description" min-width="280">
                        <template slot-scope="scope">
                            <!--
                                Single-line preview so the table stays
                                scannable; full text in the dialog.
                                Title attribute gives a native hover
                                tooltip for quick triage without click.
                            -->
                            <span class="row-description" :title="scope.row.description">
                                {{ scope.row.description || '—' }}
                            </span>
                        </template>
                    </el-table-column>
                    <el-table-column label="Images" width="90" align="center">
                        <template slot-scope="scope">
                            <span class="image-count" :class="{ 'is-empty': !(scope.row.images && scope.row.images.length) }">
                                <i class="el-icon-picture-outline" />
                                {{ (scope.row.images && scope.row.images.length) || 0 }}
                            </span>
                        </template>
                    </el-table-column>
                    <el-table-column label="Source" min-width="180">
                        <template slot-scope="scope">
                            <span v-if="scope.row.source && scope.row.source.origin" class="row-source">
                                {{ scope.row.source.origin }}
                            </span>
                            <span v-else class="muted">—</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="Status" min-width="120">
                        <template slot-scope="scope">
                            <el-tag
                                :type="badgeType(scope.row.status)"
                                size="mini"
                                effect="plain"
                            >{{ statusLabel(scope.row.status) }}</el-tag>
                        </template>
                    </el-table-column>
                    <el-table-column label="Action" width="100" align="center">
                        <template slot-scope="scope">
                            <el-button
                                size="mini"
                                type="text"
                                icon="el-icon-view"
                                @click="openReview(scope.row)"
                            >Review</el-button>
                        </template>
                    </el-table-column>
                </el-table>

                <pagination
                    v-show="total > 0"
                    :total="total"
                    :page.sync="queryParams.page"
                    :limit.sync="queryParams.pageSize"
                    @pagination="getList"
                />
            </div>
        </div>

        <!--
            Review dialog. Two-pane: details (name / source / description /
            status change) on the left, image gallery on the right.
            Falls back to a single column on narrow screens.
        -->
        <el-dialog
            :title="reviewTitle"
            :visible.sync="reviewOpen"
            width="1100px"
            top="6vh"
            append-to-body
            :close-on-click-modal="false"
            custom-class="special-review-dialog"
            @close="onReviewClose"
        >
            <div v-if="reviewRow" class="review-shell">
                <section class="review-left">
                    <div class="review-pane-head">
                        <i class="el-icon-document" />
                        Details
                    </div>
                    <div class="review-pane-body">
                        <div class="meta-grid">
                            <div class="meta-row">
                                <span class="meta-label">Submitted</span>
                                <span class="meta-value">{{ formatDate(reviewRow.createdAt) || '—' }}</span>
                            </div>
                            <div class="meta-row">
                                <span class="meta-label">Name</span>
                                <span class="meta-value meta-strong">{{ reviewRow.name || '—' }}</span>
                            </div>
                            <div class="meta-row">
                                <span class="meta-label">Status</span>
                                <span class="meta-value">
                                    <el-tag :type="badgeType(reviewRow.status)" size="mini" effect="plain">
                                        {{ statusLabel(reviewRow.status) }}
                                    </el-tag>
                                </span>
                            </div>
                            <div class="meta-row">
                                <span class="meta-label">From</span>
                                <span class="meta-value">
                                    <span v-if="reviewRow.source && reviewRow.source.origin">
                                        {{ reviewRow.source.origin }}
                                    </span>
                                    <span v-else class="muted">unknown</span>
                                </span>
                            </div>
                            <div v-if="reviewRow.source && reviewRow.source.ip" class="meta-row">
                                <span class="meta-label">IP</span>
                                <span class="meta-value meta-mono">{{ reviewRow.source.ip }}</span>
                            </div>
                        </div>

                        <div class="description-section">
                            <label class="description-label">
                                <i class="el-icon-tickets" />
                                Description
                            </label>
                            <!--
                                Read-only — staff can copy/paste from
                                here. Re-rendered with white-space:
                                pre-wrap so the customer's line breaks
                                survive the round trip.
                            -->
                            <pre class="description-text">{{ reviewRow.description || '—' }}</pre>
                        </div>

                        <!--
                            Status change row. Picker + Save button so
                            an accidental click doesn't immediately
                            promote the record — useful for status
                            transitions like fulfilled / rejected that
                            should feel deliberate.
                        -->
                        <div class="status-section">
                            <label class="status-section-label">
                                <i class="el-icon-s-flag" />
                                Set Status
                            </label>
                            <div class="status-section-controls">
                                <el-select
                                    v-model="statusDraft"
                                    size="small"
                                    class="status-select"
                                    :disabled="savingStatus"
                                >
                                    <el-option
                                        v-for="s in STATUS_META"
                                        :key="s.value"
                                        :value="s.value"
                                        :label="s.label"
                                    />
                                </el-select>
                                <el-button
                                    size="small"
                                    type="primary"
                                    :loading="savingStatus"
                                    :disabled="statusDraft === reviewRow.status"
                                    @click="saveStatus"
                                >Save</el-button>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="review-right">
                    <div class="review-pane-head">
                        <i class="el-icon-picture-outline" />
                        Images
                        <span class="review-pane-count">
                            {{ (reviewRow.images && reviewRow.images.length) || 0 }}
                        </span>
                    </div>
                    <div class="review-pane-body image-gallery">
                        <!--
                            el-image with preview-src-list gets us a
                            built-in lightbox (click thumb → fullscreen
                            modal with prev/next arrows). The thumbnail
                            grid uses object-fit: cover so portrait /
                            landscape mix doesn't break the layout.
                        -->
                        <div
                            v-if="reviewRow.images && reviewRow.images.length > 0"
                            class="thumb-grid"
                        >
                            <div
                                v-for="(img, idx) in reviewRow.images"
                                :key="idx"
                                class="thumb-tile"
                            >
                                <el-image
                                    :src="thumbUrl(img)"
                                    :preview-src-list="fullUrls"
                                    :initial-index="idx"
                                    fit="cover"
                                    class="thumb-image"
                                    :z-index="3000"
                                >
                                    <div slot="error" class="thumb-error">
                                        <i class="el-icon-picture-outline" />
                                    </div>
                                    <div slot="placeholder" class="thumb-placeholder">
                                        <i class="el-icon-loading" />
                                    </div>
                                </el-image>
                            </div>
                        </div>
                        <div v-else class="image-empty">
                            <i class="el-icon-picture-outline" />
                            <span>No images submitted.</span>
                        </div>
                    </div>
                </section>
            </div>
            <div slot="footer">
                <el-button :disabled="savingStatus" @click="reviewOpen = false">
                    Close
                </el-button>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import { listSpecialOrders, updateSpecialOrder } from '@/api/widget/specialOrder'
import TreePanel from '@/components/TreePanel'

// Status metadata — `tag` is the el-tag / el-badge variant, `color`
// drives the leaf icon tint in the tree. Lifecycle:
//   new        just landed from the widget, no triage yet
//   reviewed   triage done, work in progress
//   fulfilled  closed successfully
//   rejected   closed without fulfilment (spam / out of scope / etc.)
const STATUS_META = [
    { value: 'new',       label: 'New',       tag: 'warning', color: '#E6A23C' },
    { value: 'reviewed',  label: 'Reviewed',  tag: 'success', color: '#67C23A' },
    { value: 'fulfilled', label: 'Fulfilled', tag: 'primary', color: '#409EFF' },
    { value: 'rejected',  label: 'Rejected',  tag: 'danger',  color: '#F56C6C' }
]

// Same S3 bucket the credit-note flow uses — "Special Order Images"
// is a folder inside it (the user reused the existing bucket rather
// than spinning up a dedicated one). If the bucket ever moves, swap
// this constant AND the one in the credit-note page.
const S3_BUCKET_BASE_URL = 'https://imobile-credit-note-053188594440-us-east-1-an.s3.us-east-1.amazonaws.com/'

export default {
    name: 'ImobileSpecialOrder',
    components: { TreePanel },
    data() {
        return {
            STATUS_META,
            loading: false,
            list: [],
            total: 0,
            counts: { all: 0, new: 0, reviewed: 0, fulfilled: 0, rejected: 0 },
            queryParams: {
                page: 1,
                pageSize: 20,
                search: '',
                // '' means "all statuses" — tree's All node clears this.
                status: ''
            },

            // Review dialog state.
            reviewOpen: false,
            reviewRow: null,
            // Editable status — held separately so cancel (close
            // without save) reverts to the original.
            statusDraft: 'new',
            savingStatus: false
        }
    },
    computed: {
        treeData() {
            return [
                {
                    id: 'all',
                    label: 'All Submissions',
                    count: this.counts.all || 0,
                    children: STATUS_META.map(s => ({
                        id: s.value,
                        label: s.label,
                        count: this.counts[s.value] || 0
                    }))
                }
            ]
        },
        currentStatusLabel() {
            if (!this.queryParams.status) return 'All'
            const meta = STATUS_META.find(s => s.value === this.queryParams.status)
            return meta ? meta.label : this.queryParams.status
        },
        reviewTitle() {
            if (!this.reviewRow) return 'Special Order'
            return this.reviewRow.name
                ? `Special Order — ${this.reviewRow.name}`
                : 'Special Order'
        },
        // Pre-computed full-size URL list for the lightbox so el-image's
        // preview component can navigate prev/next across the gallery.
        fullUrls() {
            if (!this.reviewRow || !this.reviewRow.images) return []
            return this.reviewRow.images.map(img => this.fullUrl(img))
        }
    },
    created() {
        this.getList()
    },
    methods: {
        async getList() {
            this.loading = true
            try {
                const params = {
                    page: this.queryParams.page,
                    pageSize: this.queryParams.pageSize
                }
                if (this.queryParams.search) params.search = this.queryParams.search
                if (this.queryParams.status) params.status = this.queryParams.status

                const res = await listSpecialOrders(params)
                if (!res || res.success === false) {
                    throw new Error((res && res.message) || 'Failed to load special orders')
                }
                this.list = res.data || []
                this.total = res.total || 0
                this.counts = res.counts || { all: 0 }
            } catch (e) {
                console.error('Special Order list failed:', e)
                const msg = (e.response && e.response.data && e.response.data.message)
                    || e.message
                    || 'Failed to load special orders'
                this.$message.error(msg)
                this.list = []
                this.total = 0
            } finally {
                this.loading = false
            }
        },
        handleQuery() {
            this.queryParams.page = 1
            this.getList()
        },
        // ── Review dialog ─────────────────────────────────────────
        openReview(row) {
            if (!row) return
            this.reviewRow = row
            this.statusDraft = row.status || 'new'
            this.reviewOpen = true
        },
        onReviewClose() {
            this.reviewRow = null
            this.statusDraft = 'new'
            this.savingStatus = false
        },
        async saveStatus() {
            if (!this.reviewRow || this.savingStatus) return
            if (this.statusDraft === this.reviewRow.status) return
            this.savingStatus = true
            const previous = this.reviewRow.status
            try {
                const res = await updateSpecialOrder(this.reviewRow._id, {
                    status: this.statusDraft
                })
                if (!res || res.success === false) {
                    throw new Error((res && res.message) || 'Status update failed')
                }
                // Patch the live row + list row so the table and
                // tree counts reflect the change without a refetch.
                this.$set(this.reviewRow, 'status', this.statusDraft)
                const i = this.list.findIndex(
                    r => String(r._id) === String(this.reviewRow._id)
                )
                if (i !== -1) {
                    this.$set(this.list, i, { ...this.list[i], status: this.statusDraft })
                }
                // Locally adjust the counts so the badges update too.
                // If the new status is in our known map we can do a
                // cheap +/-1; otherwise refetch to stay correct.
                if (Object.prototype.hasOwnProperty.call(this.counts, previous) &&
                    Object.prototype.hasOwnProperty.call(this.counts, this.statusDraft)) {
                    this.counts = {
                        ...this.counts,
                        [previous]: Math.max(0, (this.counts[previous] || 0) - 1),
                        [this.statusDraft]: (this.counts[this.statusDraft] || 0) + 1
                    }
                }
                this.$message.success(`Status set to ${this.statusLabel(this.statusDraft)}.`)
            } catch (e) {
                console.error('Status save failed:', e)
                const msg = (e.response && e.response.data && e.response.data.message)
                    || e.message
                    || 'Status update failed'
                this.$message.error(msg)
            } finally {
                this.savingStatus = false
            }
        },
        // ── Tree ──────────────────────────────────────────────────
        handleStatusClick(data) {
            if (!data) return
            this.queryParams.status = data.id === 'all' ? '' : data.id
            this.queryParams.page = 1
            this.getList()
        },
        // ── Tree helpers (parity with Credit Note / Repair / SQT) ─
        statusColor(id) {
            if (id === 'all') return '#409EFF'
            const meta = STATUS_META.find(s => s.value === id)
            return meta ? meta.color : '#909399'
        },
        badgeType(id) {
            const meta = STATUS_META.find(s => s.value === id)
            return meta ? meta.tag : 'info'
        },
        statusLabel(value) {
            if (!value) return 'Unknown'
            const meta = STATUS_META.find(s => s.value === value)
            return meta ? meta.label : value
        },
        // ── Image URLs ────────────────────────────────────────────
        // Thumbnails live under "Special Order Images/yyyy-mm-dd/thumbs/"
        // — see routes/widgetRoutes/specialOrder.js for the backend
        // upload layout. Falls back to the full image when the
        // backend didn't generate a thumbnail (sharp failure, etc.).
        thumbUrl(img) {
            if (!img) return ''
            if (img.thumbnailKey) return S3_BUCKET_BASE_URL + encodeURI(img.thumbnailKey)
            return this.fullUrl(img)
        },
        fullUrl(img) {
            if (!img || !img.s3Key) return ''
            return S3_BUCKET_BASE_URL + encodeURI(img.s3Key)
        },
        // ── Cell formatters ───────────────────────────────────────
        formatDate(value) {
            if (!value) return ''
            const d = new Date(value)
            if (isNaN(d.getTime())) return ''
            return d.toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })
        }
    }
}
</script>

<style lang="scss" scoped>
.filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
}
.filter-search { width: 280px; max-width: 100%; }
.filter-spacer { flex: 1; }
.filter-summary {
    color: #606266;
    font-size: 13px;
}
.filter-summary strong { color: #303133; font-weight: 600; }
.filter-summary-scope { color: #909399; }

/* Tree node template (same shape as the rest of the review pages) */
.status-node {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    padding-right: 6px;
}
.status-node-icon {
    font-size: 14px;
    flex-shrink: 0;
}
.status-node-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
}
.status-node-badge {
    flex-shrink: 0;
    margin-left: 4px;
}

.special-table {
    border: 1px solid #ebeef5;
    border-radius: 8px;
    overflow: hidden;
}
.row-name { font-weight: 500; color: #303133; }
.row-description {
    color: #606266;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
}
.row-source {
    color: #2563eb;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
}
.image-count {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: #606266;
    font-weight: 500;
    i { font-size: 13px; }
}
.image-count.is-empty { color: #c0c4cc; }
.muted {
    color: #c0c4cc;
    font-style: italic;
}

/* ── Review dialog ───────────────────────────────────────────────── */
.review-shell {
    display: flex;
    gap: 16px;
    height: 70vh;
    min-height: 480px;
}
.review-left,
.review-right {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
}
/* Slightly wider details pane so long descriptions don't wrap to
   half a dozen lines, and so the status section sits comfortably. */
.review-left { flex: 5 1 0; min-width: 420px; }
.review-right { flex: 4 1 0; min-width: 320px; }

.review-pane-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid #ebeef5;
    background: #f9fafb;
    color: #303133;
    font-size: 13px;
    font-weight: 600;
    flex-shrink: 0;
}
.review-pane-head i {
    color: #2563eb;
    font-size: 14px;
}
.review-pane-count {
    margin-left: auto;
    color: #909399;
    font-weight: 500;
    font-size: 12px;
}
.review-pane-body {
    flex: 1;
    overflow: auto;
    padding: 12px 14px;
}

.meta-grid {
    display: grid;
    grid-template-columns: 90px 1fr;
    gap: 6px 12px;
    margin-bottom: 14px;
}
.meta-row {
    display: contents;
}
.meta-label {
    color: #909399;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    align-self: center;
}
.meta-value {
    color: #303133;
    font-size: 13px;
}
.meta-strong { font-weight: 600; }
.meta-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: #606266;
}

.description-section {
    margin-bottom: 14px;
}
.description-label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #303133;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 4px;
}
.description-label i {
    color: #2563eb;
    font-size: 14px;
}
.description-text {
    margin: 0;
    padding: 8px 10px;
    border: 1px solid #ebeef5;
    border-radius: 6px;
    background: #fafbfc;
    color: #303133;
    font-size: 13px;
    font-family: inherit;
    line-height: 1.55;
    white-space: pre-wrap;
    word-wrap: break-word;
    max-height: 240px;
    overflow: auto;
}

.status-section {
    padding-top: 10px;
    border-top: 1px solid #ebeef5;
}
.status-section-label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #303133;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 6px;
}
.status-section-label i {
    color: #2563eb;
    font-size: 14px;
}
.status-section-controls {
    display: flex;
    align-items: center;
    gap: 8px;
}
.status-select { width: 180px; }

/* Image gallery — auto-fill grid so the tiles flow naturally as the
   pane resizes. Square tiles keep portrait/landscape mix from
   breaking the layout. */
.image-gallery {
    padding: 12px;
}
.thumb-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
}
.thumb-tile {
    aspect-ratio: 1 / 1;
    border-radius: 6px;
    overflow: hidden;
    background: #f3f4f6;
    border: 1px solid #ebeef5;
}
.thumb-image {
    width: 100%;
    height: 100%;
    display: block;
    cursor: zoom-in;
}
.thumb-error,
.thumb-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #c0c4cc;
    font-size: 24px;
    background: #f3f4f6;
}
.image-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #909399;
    gap: 8px;
    i { font-size: 32px; }
}

/* Mobile: stack the two panes vertically. */
@media (max-width: 900px) {
    .review-shell {
        flex-direction: column;
        height: auto;
    }
    .review-left,
    .review-right {
        flex: 0 0 auto;
        max-height: 50vh;
    }
}
</style>

<style>
/* Unscoped — reaches the body-appended dialog wrapper. */
.special-review-dialog .el-dialog__body {
    padding: 12px 20px 4px;
}
.special-review-dialog .el-dialog__footer {
    padding: 10px 20px 14px;
}
@media (max-width: 1200px) {
    .special-review-dialog {
        width: 92vw !important;
    }
}
</style>
