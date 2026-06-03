<template>
    <div class="credit-note-tool">
        <!--
            Two hidden file inputs. The first lets the user pick from their
            gallery / file system; the second uses `capture="environment"`
            which prompts mobile browsers to open the rear camera directly.
            Both have `multiple` so a single picker can add several images
            at once — the camera one stays mostly single-shot because most
            browsers only return one capture, but multiple is harmless.
        -->
        <input
            ref="fileInput"
            type="file"
            accept="image/*"
            multiple
            class="hidden-input"
            @change="onFilesChosen"
        />
        <input
            ref="cameraInput"
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            class="hidden-input"
            @change="onFilesChosen"
        />

        <!-- Idle state — show the two source buttons -->
        <div v-if="files.length === 0" class="picker">
            <div class="picker-help">
                Choose one or more credit-note images from your device or
                take photos with your camera. We'll combine them into a
                single PDF — one image per page — and submit it for
                processing.
            </div>
            <div class="picker-buttons">
                <el-button
                    type="primary"
                    icon="el-icon-picture"
                    @click="$refs.fileInput.click()"
                >Choose Images</el-button>
                <el-button
                    icon="el-icon-camera"
                    @click="$refs.cameraInput.click()"
                >Take Photo</el-button>
            </div>
        </div>

        <!--
            Files state — show the grid of selected images plus the action
            buttons. Submit kicks off the PDF build + upload; Clear resets
            so the user can pick different images without closing the
            dialog.
        -->
        <div v-if="files.length > 0" class="preview">
            <div class="files-header">
                <span class="files-summary">
                    <strong>{{ files.length }}</strong>
                    image{{ files.length === 1 ? '' : 's' }}
                    <span class="files-total-size">· {{ formatBytes(totalSize) }}</span>
                </span>
                <div class="files-header-actions">
                    <el-button
                        size="mini"
                        icon="el-icon-plus"
                        :disabled="submitting"
                        @click="$refs.fileInput.click()"
                    >Add</el-button>
                    <el-button
                        size="mini"
                        icon="el-icon-camera"
                        :disabled="submitting"
                        @click="$refs.cameraInput.click()"
                    >Camera</el-button>
                    <el-button
                        size="mini"
                        type="text"
                        :disabled="submitting"
                        @click="clearAll"
                    >Clear all</el-button>
                </div>
            </div>

            <!--
                Vertical list of selected images — one full-width row per
                file. The green corner badge is purely decorative and
                signals "added to this batch". Page order in the list IS
                the page order in the generated PDF; the up / down arrows
                let the user reorder without re-uploading.
            -->
            <div class="files-list">
                <div
                    v-for="(f, idx) in files"
                    :key="f.id"
                    class="file-row"
                >
                    <div class="file-row-thumb">
                        <img :src="f.previewUrl" :alt="f.name" />
                    </div>
                    <div class="file-row-body">
                        <div class="file-row-name" :title="f.name">{{ f.name }}</div>
                        <div class="file-row-meta">
                            <span class="file-page-tag">Page {{ idx + 1 }}</span>
                            <span class="file-row-dot">·</span>
                            <span class="file-row-size">{{ formatBytes(f.size) }}</span>
                        </div>
                    </div>
                    <div class="file-row-actions">
                        <el-button
                            size="mini"
                            type="text"
                            icon="el-icon-top"
                            class="file-action-btn"
                            :disabled="submitting || idx === 0"
                            @click="moveFile(idx, -1)"
                        />
                        <el-button
                            size="mini"
                            type="text"
                            icon="el-icon-bottom"
                            class="file-action-btn"
                            :disabled="submitting || idx === files.length - 1"
                            @click="moveFile(idx, 1)"
                        />
                        <el-button
                            size="mini"
                            type="text"
                            icon="el-icon-delete"
                            class="file-action-btn file-remove-btn"
                            :disabled="submitting"
                            @click="removeFile(idx)"
                        />
                    </div>
                    <!-- Decorative "added" badge in the top-right corner. -->
                    <span class="file-row-check" aria-hidden="true">
                        <i class="el-icon-check" />
                    </span>
                </div>
            </div>

            <el-alert
                v-if="lastError"
                :title="lastError"
                type="error"
                show-icon
                :closable="false"
                class="preview-alert"
            />

            <!--
                Successful submits no longer show a response banner —
                the success popup (raised in submit() below) is the
                only confirmation the user needs. Error state stays
                inline via the alert above; the user can read it,
                adjust the batch, and resubmit.
            -->

            <div class="preview-actions">
                <el-button
                    :disabled="submitting"
                    icon="el-icon-refresh"
                    @click="reset"
                >Clear</el-button>
                <el-button
                    type="primary"
                    :loading="submitting"
                    icon="el-icon-upload"
                    @click="submit"
                >{{ submitButtonLabel }}</el-button>
            </div>
        </div>
    </div>
</template>

<script>
// jspdf is already in deps (pinned to ^2.5.1 for the QC Generator's
// doc.table API). Used here just for addImage / addPage; v2 or v3 would
// both work but we stay on v2 for consistency.
import { jsPDF } from 'jspdf'
import { submitCreditNote } from '@/api/tools/creditNote'

// Per-image raw cap — a 25 MB photo is more than enough for a paper
// credit note. We re-compress to JPEG before adding to the PDF, so the
// final PDF is usually a fraction of the raw total anyway.
const MAX_BYTES_PER_FILE = 25 * 1024 * 1024
// Safety cap on image count so an accidental "select all" of a camera
// roll doesn't lock the browser building a 200-page PDF.
const MAX_FILES = 30
// Each image is downscaled to fit inside this max edge before going
// into the PDF. 2000px is well above what a printed page can show, but
// keeps page weight reasonable (~200–400 KB / page vs multiple MB for
// raw phone photos).
const PDF_IMAGE_MAX_EDGE = 2000
// JPEG quality for the canvas → PDF re-encode. 0.85 is a sweet spot —
// sharper than 0.75, noticeably smaller than 0.95.
const PDF_IMAGE_JPEG_QUALITY = 0.85
// A4 portrait page margin in points (1pt = 1/72 inch). 24pt ≈ 8.5mm.
const PDF_PAGE_MARGIN_PT = 24

// Monotonic id used as the v-for :key on file cards. A counter beats
// using the filename (collisions when re-adding the same name) or an
// object reference (Vue 2 has trouble keying on Files in some browsers).
let nextFileId = 1

export default {
    name: 'CreateCreditNote',
    data() {
        return {
            // Each entry: { id, raw (File), name, size, type, previewUrl }
            files: [],
            // True while the canvas → jsPDF pass plus the upload to our
            // backend are running. Used to disable the form controls
            // and to flip the Submit button label to a progress hint.
            submitting: false,
            lastError: ''
        }
    },
    computed: {
        totalSize() {
            return this.files.reduce((sum, f) => sum + (f.size || 0), 0)
        },
        submitButtonLabel() {
            if (this.submitting) return 'Submitting…'
            const n = this.files.length
            return `Submit (${n} page${n === 1 ? '' : 's'})`
        }
    },
    beforeDestroy() {
        // Release every blob URL we created for the previews so the
        // browser can reclaim the memory when the dialog closes.
        for (const f of this.files) this.revokePreview(f)
    },
    methods: {
        onFilesChosen(event) {
            // FileList → Array so we can iterate cleanly. Clear the
            // input's value so picking the same file twice still fires
            // change (browsers de-dupe by value otherwise).
            const incoming = Array.from((event.target && event.target.files) || [])
            if (event.target) event.target.value = ''
            if (incoming.length === 0) return

            const accepted = []
            const errors = []
            for (const f of incoming) {
                if (!f.type || !f.type.startsWith('image/')) {
                    errors.push(`${f.name}: not an image`)
                    continue
                }
                if (f.size > MAX_BYTES_PER_FILE) {
                    errors.push(`${f.name}: too large (${this.formatBytes(f.size)})`)
                    continue
                }
                accepted.push(f)
            }
            // Hard cap on total count — drop the tail and warn rather
            // than silently truncating.
            const room = MAX_FILES - this.files.length
            if (accepted.length > room) {
                errors.push(`Only the first ${room} of ${accepted.length} added (max ${MAX_FILES} per submission).`)
                accepted.length = room
            }

            for (const f of accepted) {
                this.files.push({
                    id: nextFileId++,
                    raw: f,
                    name: f.name,
                    size: f.size,
                    type: f.type,
                    previewUrl: URL.createObjectURL(f)
                })
            }
            if (errors.length > 0) {
                this.$message.warning(errors.join('\n'))
            }
            // Clear any prior error banner now that the user is
            // building a new batch.
            this.lastError = ''
        },
        removeFile(idx) {
            const [removed] = this.files.splice(idx, 1)
            if (removed) this.revokePreview(removed)
        },
        moveFile(idx, delta) {
            const target = idx + delta
            if (target < 0 || target >= this.files.length) return
            const [moved] = this.files.splice(idx, 1)
            this.files.splice(target, 0, moved)
        },
        clearAll() {
            for (const f of this.files) this.revokePreview(f)
            this.files = []
            this.lastError = ''
        },
        async submit() {
            if (this.files.length === 0 || this.submitting) return
            this.lastError = ''
            this.submitting = true
            try {
                const blob = await this.buildPdfBlob(this.files)
                const filename = this.makePdfFilename()
                const form = new FormData()
                // Backend's multer expects "data"; it renames to "file"
                // before forwarding to HandwritingOCR. See
                // routes/creditNoteRoutes/index.js for the rationale.
                form.append('data', blob, filename)

                const res = await submitCreditNote(form)
                if (!res || res.success === false) {
                    throw new Error((res && res.message) || 'Submit failed')
                }
                await this.showSuccessPrompt()
            } catch (e) {
                console.error('Credit note submit failed:', e)
                const errData = e.response && e.response.data
                this.lastError = (errData && errData.message)
                    || e.message
                    || 'Submit failed'
            } finally {
                this.submitting = false
            }
        },
        // Element UI's confirm box, themed as success. Two buttons:
        //   - Submit another → reset the form, stay in the dialog
        //   - Close          → ask the parent to close the el-dialog
        // Modal interaction is mandatory (no X / Esc / backdrop) so the
        // user has to make a deliberate choice — prevents a stray
        // dismissal from leaving the same files queued for a duplicate
        // submit on the next click.
        async showSuccessPrompt() {
            try {
                await this.$confirm(
                    'Credit note submitted successfully.',
                    'Submitted',
                    {
                        confirmButtonText: 'Submit another',
                        cancelButtonText: 'Close',
                        type: 'success',
                        closeOnClickModal: false,
                        closeOnPressEscape: false,
                        showClose: false
                    }
                )
                // Confirm path → "Submit another": wipe the list and
                // wait for the user to add the next batch.
                this.reset()
            } catch (_) {
                // Cancel path → "Close": tell the parent to dismiss the
                // outer el-dialog. tools/index.vue listens for @close.
                this.$emit('close')
            }
        },
        makePdfFilename() {
            // Random base36 suffix avoids name collisions across the
            // same-day downloads — the browser would otherwise append
            // "(1)", "(2)" etc and overwrite-confirm dialogs get
            // annoying. 6 chars (~2 billion combos) is plenty for
            // human-scale collision risk.
            const today = new Date().toISOString().slice(0, 10)
            const suffix = Math.random().toString(36).slice(2, 8)
            return `credit-note-${today}-${suffix}.pdf`
        },
        // ── PDF building ──────────────────────────────────────────
        // Reads each file, downscales via a canvas, re-encodes as JPEG,
        // and drops it onto its own A4 page in the doc. Returns a Blob
        // suitable for upload.
        async buildPdfBlob(files) {
            // 'pt' units so PDF_PAGE_MARGIN_PT is meaningful; A4 portrait
            // is 595×842 pt.
            const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' })
            const pageW = doc.internal.pageSize.getWidth()
            const pageH = doc.internal.pageSize.getHeight()
            const maxW = pageW - PDF_PAGE_MARGIN_PT * 2
            const maxH = pageH - PDF_PAGE_MARGIN_PT * 2

            for (let i = 0; i < files.length; i++) {
                const f = files[i]
                const img = await this.loadImage(f.raw)
                const { dataUrl, width, height } = this.imageToJpeg(img)

                // Fit-to-page preserving aspect ratio, centred within
                // the margins.
                const aspect = width / height
                let drawW = maxW
                let drawH = maxW / aspect
                if (drawH > maxH) {
                    drawH = maxH
                    drawW = maxH * aspect
                }
                const x = (pageW - drawW) / 2
                const y = (pageH - drawH) / 2

                if (i > 0) doc.addPage()
                doc.addImage(dataUrl, 'JPEG', x, y, drawW, drawH)
            }
            return doc.output('blob')
        },
        // Load a File into an HTMLImageElement so we can draw it to a
        // canvas. Reading via FileReader.readAsDataURL works across
        // browsers and lets the Image element apply any EXIF orientation
        // metadata on its own.
        loadImage(file) {
            return new Promise((resolve, reject) => {
                const fr = new FileReader()
                fr.onerror = () => reject(new Error(`Failed to read ${file.name}`))
                fr.onload = () => {
                    const img = new Image()
                    img.onerror = () => reject(new Error(`Failed to decode ${file.name}`))
                    img.onload = () => resolve(img)
                    img.src = String(fr.result)
                }
                fr.readAsDataURL(file)
            })
        },
        // Draw to a sized-down canvas, then export as JPEG. Keeps PDF
        // weight reasonable for a multi-page batch — a raw 12MP phone
        // photo (~6 MB) becomes a ~300 KB JPEG at quality 0.85.
        imageToJpeg(img) {
            const srcW = img.naturalWidth || img.width
            const srcH = img.naturalHeight || img.height
            const longest = Math.max(srcW, srcH)
            const scale = longest > PDF_IMAGE_MAX_EDGE
                ? PDF_IMAGE_MAX_EDGE / longest
                : 1
            const width = Math.max(1, Math.round(srcW * scale))
            const height = Math.max(1, Math.round(srcH * scale))
            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d')
            // Paint white so transparent PNGs don't render with the
            // PDF's default background showing through.
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, width, height)
            ctx.drawImage(img, 0, 0, width, height)
            const dataUrl = canvas.toDataURL('image/jpeg', PDF_IMAGE_JPEG_QUALITY)
            return { dataUrl, width, height }
        },
        // ── Misc ──────────────────────────────────────────────────
        reset() {
            for (const f of this.files) this.revokePreview(f)
            this.files = []
            this.lastError = ''
        },
        revokePreview(file) {
            if (file && file.previewUrl) {
                try { URL.revokeObjectURL(file.previewUrl) } catch (_) { /* noop */ }
                file.previewUrl = ''
            }
        },
        formatBytes(n) {
            if (!Number.isFinite(n)) return '—'
            if (n < 1024) return `${n} B`
            if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
            return `${(n / 1024 / 1024).toFixed(2)} MB`
        }
    }
}
</script>

<style scoped>
.credit-note-tool {
    padding: 4px 0;
}
.hidden-input {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
}

/* Idle picker */
.picker {
    text-align: center;
    padding: 12px 0;
}
.picker-help {
    color: #606266;
    font-size: 14px;
    line-height: 1.5;
    margin-bottom: 18px;
    padding: 0 12px;
}
.picker-buttons {
    display: flex;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
}

/* Files state */
.preview { display: flex; flex-direction: column; gap: 12px; }

.files-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    padding: 8px 12px;
    background: #f5f7fb;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    font-size: 13px;
    color: #606266;
}
.files-summary strong { color: #303133; font-weight: 600; }
.files-total-size { color: #909399; }
.files-header-actions {
    display: flex;
    gap: 6px;
    align-items: center;
}

/* Vertical list of file rows. The container has its own border/scroll
   so a long batch scrolls inside the list instead of pushing the
   action buttons off-screen — the dialog body already has overflow: auto
   but a scrollable inner panel feels more controllable on long lists. */
.files-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 360px;
    overflow-y: auto;
    padding: 6px;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    background: #fafafa;
}

/* Single horizontal row. `overflow: hidden` clips the corner badge so
   its triangle sits flush with the rounded corners; `padding-right`
   leaves clearance so the row's action buttons don't slip under the
   badge. */
.file-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 38px 10px 10px;
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    overflow: hidden;
    transition: box-shadow 0.15s ease, border-color 0.15s ease;
}
.file-row:hover {
    border-color: #c6cef0;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
}

.file-row-thumb {
    width: 56px;
    height: 56px;
    flex-shrink: 0;
    border-radius: 6px;
    overflow: hidden;
    background: #f5f7fa;
    display: flex;
    align-items: center;
    justify-content: center;
}
.file-row-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.file-row-body {
    flex: 1;
    min-width: 0;
}
.file-row-name {
    color: #303133;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.file-row-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    color: #909399;
    font-size: 12px;
}
.file-page-tag {
    color: #2563eb;
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.3px;
    text-transform: uppercase;
}
.file-row-dot { color: #c0c4cc; }
.file-row-size { color: #909399; }

.file-row-actions {
    display: flex;
    align-items: center;
    gap: 0;
    flex-shrink: 0;
}
.file-action-btn {
    padding: 4px !important;
    color: #909399;
}
.file-action-btn:hover { color: #2563eb; }
.file-remove-btn:hover { color: #f56c6c; }

/* Green corner check — pure CSS triangle (no SVG dependency). Sits
   above the row content so it stays visible while scrolling. The
   `i` is offset so it lands inside the triangle. */
.file-row-check {
    position: absolute;
    top: 0;
    right: 0;
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 0 32px 32px 0;
    border-color: transparent #67c23a transparent transparent;
    pointer-events: none;
}
.file-row-check i {
    position: absolute;
    top: 2px;
    left: -22px;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
}

.preview-alert {
    margin: 0;
}

.preview-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 4px;
}

/*
 * Mobile (~ phones in portrait).
 *  - source buttons stack full-width so they're large tap targets
 *  - grid drops to two columns (or one on very narrow)
 *  - action buttons go full-width and stack
 */
@media (max-width: 600px) {
    .picker-buttons {
        flex-direction: column;
        gap: 8px;
    }
    .picker-buttons .el-button {
        width: 100%;
        /* Override Element UI's default .el-button + .el-button left
           margin which pushes the second button off-axis when the row
           is stacked. */
        margin-left: 0 !important;
        padding: 12px 16px;
        font-size: 15px;
    }
    .files-list {
        max-height: 280px;
    }
    .file-row {
        padding: 8px 32px 8px 8px;
        gap: 10px;
    }
    .file-row-thumb {
        width: 48px;
        height: 48px;
    }
    .file-row-name { font-size: 13px; }
    .preview-actions {
        flex-direction: column-reverse;
        gap: 8px;
    }
    .preview-actions .el-button {
        width: 100%;
        margin-left: 0 !important;
        padding: 12px 16px;
        font-size: 15px;
    }
    .files-header {
        gap: 6px;
    }
    .files-header-actions {
        flex-wrap: wrap;
    }
}
</style>
