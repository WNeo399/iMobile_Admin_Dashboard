<template>
    <div class="credit-note-tool">
        <!--
            One hidden file input for "Choose Images" — multi-select
            file picker. The Take Photo path is handled by an explicit
            camera dialog (see <el-dialog> below) that uses
            navigator.mediaDevices.getUserMedia so the browser prompts
            for camera permission on both desktop and mobile.
        -->
        <input
            ref="fileInput"
            type="file"
            accept="image/*"
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
                    @click="openCamera"
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
                        @click="openCamera"
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

        <!--
            Camera dialog. Opened by the two "Take Photo" / "Camera"
            buttons. Uses navigator.mediaDevices.getUserMedia so the
            browser explicitly prompts for camera permission — on
            desktop this gives a real camera capture (the HTML5
            capture="environment" attribute alone is a no-op there),
            and on mobile it triggers the system permission prompt
            instead of jumping to the native camera app.

            Multi-capture friendly: each Capture click adds a photo to
            the queue and keeps the dialog open, so the user can take
            several in a row without re-opening.
        -->
        <el-dialog
            title="Take Photo"
            :visible.sync="cameraOpen"
            width="640px"
            append-to-body
            :close-on-click-modal="false"
            custom-class="camera-dialog"
            @opened="onCameraDialogOpened"
            @close="closeCamera"
        >
            <div class="camera-body">
                <div v-if="cameraError" class="camera-error">
                    <i class="el-icon-warning-outline" />
                    <div class="camera-error-text">
                        <div class="camera-error-title">{{ cameraError }}</div>
                        <div class="camera-error-hint">
                            Close this dialog and use “Choose Images”
                            instead, or check the camera permission in
                            your browser address bar.
                        </div>
                    </div>
                </div>
                <video
                    v-show="!cameraError"
                    ref="cameraVideo"
                    class="camera-video"
                    autoplay
                    muted
                    playsinline
                />
                <div v-if="!cameraError && !cameraReady" class="camera-loading">
                    <i class="el-icon-loading" />
                    Requesting camera access…
                </div>
                <div v-if="captureCount > 0" class="camera-count">
                    <i class="el-icon-circle-check" />
                    {{ captureCount }} photo{{ captureCount === 1 ? '' : 's' }} added
                </div>

                <!--
                    Mobile-only overlay controls. Hidden on desktop via
                    CSS — there, the el-dialog's header X handles close
                    and the footer button handles capture. On phones we
                    fullscreen the dialog and show these so the camera
                    feels like the system camera app.
                -->
                <button
                    v-show="!cameraError"
                    type="button"
                    class="camera-close"
                    aria-label="Close camera"
                    @click="closeCamera"
                >
                    <i class="el-icon-close" />
                </button>
                <button
                    v-show="!cameraError && cameraReady"
                    type="button"
                    class="camera-shutter"
                    :disabled="capturing"
                    aria-label="Capture photo"
                    @click="capturePhoto"
                />
            </div>
            <div slot="footer">
                <el-button @click="closeCamera">Close</el-button>
                <el-button
                    type="primary"
                    icon="el-icon-camera-solid"
                    :loading="capturing"
                    :disabled="!cameraReady || !!cameraError"
                    @click="capturePhoto"
                >Capture</el-button>
            </div>
        </el-dialog>
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
// into the PDF. 1600px is plenty for paper credit notes (the text
// stays readable past 300 DPI on an A4 page) and keeps the per-page
// JPEG closer to ~150–250 KB instead of the ~400 KB the older 2000px
// cap produced.
const PDF_IMAGE_MAX_EDGE = 1600
// JPEG quality for the canvas → PDF re-encode. 0.75 sheds another
// noticeable chunk vs 0.85 without hurting the readability of typed
// or handwritten characters on a credit note.
const PDF_IMAGE_JPEG_QUALITY = 0.75
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
            lastError: '',
            // Camera dialog state. `cameraStream` holds the live
            // MediaStream so we can stop its tracks on close (turns
            // the user's camera light off and releases the device for
            // other apps). `cameraReady` flips true once the video
            // element has its first frame; `cameraError` carries any
            // permission / device error to surface in the dialog.
            cameraOpen: false,
            cameraStream: null,
            cameraReady: false,
            cameraError: '',
            capturing: false,
            captureCount: 0
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
        // Defensive: kill any active camera stream so the user's
        // camera light goes off even if the parent dialog is closed
        // without going through closeCamera() first.
        this.stopCameraStream()
    },
    methods: {
        onFilesChosen(event) {
            // FileList → Array so we can iterate cleanly. Clear the
            // input's value so picking the same file twice still fires
            // change (browsers de-dupe by value otherwise).
            const incoming = Array.from((event.target && event.target.files) || [])
            if (event.target) event.target.value = ''
            if (incoming.length === 0) return
            this.addFilesToQueue(incoming)
        },
        // Shared add-to-queue path used by both the file picker
        // (onFilesChosen) and the camera capture (capturePhoto).
        // Returns the number of files actually accepted.
        addFilesToQueue(incoming) {
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
            return accepted.length
        },
        // ── Camera capture ────────────────────────────────────────
        openCamera() {
            // Resetting state up front so the dialog opens in a clean
            // state every time (previous error / capture-count don't
            // leak across opens).
            this.cameraOpen = true
            this.cameraReady = false
            this.cameraError = ''
            this.captureCount = 0
            // Stream request happens in @opened (after the dialog's
            // mount animation) so the <video> ref exists.
        },
        async onCameraDialogOpened() {
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    throw new Error('Camera not supported by this browser.')
                }
                // Prefer the back camera on phones; desktop ignores
                // facingMode and falls back to the default device.
                // ideal width/height nudge towards higher-res capture
                // but the browser is free to substitute.
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    }
                })
                this.cameraStream = stream
                const video = this.$refs.cameraVideo
                if (!video) {
                    throw new Error('Camera surface not ready.')
                }
                video.srcObject = stream
                await new Promise((resolve, reject) => {
                    let settled = false
                    video.onloadedmetadata = () => {
                        if (!settled) { settled = true; resolve() }
                    }
                    video.onerror = () => {
                        if (!settled) { settled = true; reject(new Error('Video element error')) }
                    }
                    // Hard timeout in case neither event ever fires
                    // (rare driver hiccups).
                    setTimeout(() => {
                        if (!settled) { settled = true; reject(new Error('Camera start timed out')) }
                    }, 8000)
                })
                await video.play()
                this.cameraReady = true
            } catch (e) {
                console.error('Camera open failed:', e)
                this.cameraError = this.describeCameraError(e)
                this.stopCameraStream()
            }
        },
        // Friendlier mapping for the common getUserMedia error names.
        describeCameraError(e) {
            const name = e && e.name
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                return 'Camera permission was denied.'
            }
            if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
                return 'No camera was found on this device.'
            }
            if (name === 'NotReadableError' || name === 'TrackStartError') {
                return 'Another app is using the camera right now.'
            }
            if (name === 'OverconstrainedError') {
                return 'No camera matches the requested settings.'
            }
            return (e && e.message) || 'Failed to open the camera.'
        },
        stopCameraStream() {
            if (this.cameraStream) {
                try {
                    this.cameraStream.getTracks().forEach(t => t.stop())
                } catch (_) { /* noop */ }
                this.cameraStream = null
            }
            const video = this.$refs.cameraVideo
            if (video) video.srcObject = null
        },
        closeCamera() {
            this.stopCameraStream()
            this.cameraOpen = false
            this.cameraReady = false
            this.cameraError = ''
            this.capturing = false
            // captureCount left as-is so the user briefly sees the
            // total after closing (it resets on next openCamera()).
        },
        async capturePhoto() {
            if (!this.cameraReady || this.capturing) return
            const video = this.$refs.cameraVideo
            if (!video || !video.videoWidth) return
            this.capturing = true
            try {
                // Snapshot the current frame to a canvas at the video's
                // native resolution. The downstream PDF build will
                // downscale + re-encode via PDF_IMAGE_MAX_EDGE /
                // PDF_IMAGE_JPEG_QUALITY so this canvas just needs to
                // be lossless-ish.
                const canvas = document.createElement('canvas')
                canvas.width = video.videoWidth
                canvas.height = video.videoHeight
                const ctx = canvas.getContext('2d')
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                const blob = await new Promise((resolve, reject) => {
                    canvas.toBlob(
                        b => b ? resolve(b) : reject(new Error('Failed to capture frame')),
                        'image/jpeg',
                        0.92
                    )
                })
                // Stamp the filename so the page list shows a
                // recognisable label and re-captures don't collide.
                const stamp = new Date().toISOString().replace(/[:.]/g, '-')
                const file = new File(
                    [blob],
                    `camera-${stamp}.jpg`,
                    { type: 'image/jpeg' }
                )
                const added = this.addFilesToQueue([file])
                if (added > 0) {
                    this.captureCount += added
                }
            } catch (e) {
                console.error('Capture failed:', e)
                this.$message.error('Failed to capture photo: ' + (e.message || e))
            } finally {
                this.capturing = false
            }
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

/* ── Camera dialog ──────────────────────────────────────────────── */
.camera-body {
    position: relative;
    background: #000;
    border-radius: 6px;
    min-height: 360px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
}
.camera-video {
    width: 100%;
    height: auto;
    max-height: 60vh;
    display: block;
    background: #000;
}
.camera-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #f5f7fa;
    font-size: 14px;
}
.camera-error {
    position: absolute;
    inset: 12px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 14px 16px;
    background: #fff;
    color: #303133;
    border-radius: 8px;
    border: 1px solid #fde2e2;
    z-index: 1;
}
.camera-error > i {
    color: #f56c6c;
    font-size: 20px;
    flex-shrink: 0;
}
.camera-error-text {
    flex: 1;
    min-width: 0;
}
.camera-error-title {
    color: #303133;
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 4px;
}
.camera-error-hint {
    color: #606266;
    font-size: 12px;
    line-height: 1.5;
}
.camera-count {
    position: absolute;
    left: 12px;
    bottom: 12px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 14px;
    background: rgba(103, 194, 58, 0.92);
    color: #fff;
    font-size: 12px;
    font-weight: 500;
}

/* Mobile-only overlay controls. Hidden on desktop by default; the
   mobile media query at the bottom of this block flips them on
   alongside the fullscreen dialog treatment. */
.camera-close {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    border: 0;
    cursor: pointer;
    font-size: 18px;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 0;
    z-index: 2;
    transition: background 0.15s ease;
}
.camera-close:hover { background: rgba(0, 0, 0, 0.75); }
.camera-close:active { background: rgba(0, 0, 0, 0.85); }
.camera-close i { font-size: 18px; line-height: 1; }

.camera-shutter {
    position: absolute;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: transparent;
    /* Double-ring look — the outer border, an inner solid white
       circle via ::before. Reads as "shutter" without an icon. */
    border: 4px solid rgba(255, 255, 255, 0.92);
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 0;
    z-index: 2;
    transition: transform 0.12s ease;
}
.camera-shutter::before {
    content: '';
    width: 54px;
    height: 54px;
    border-radius: 50%;
    background: #fff;
    transition: background 0.12s ease;
}
.camera-shutter:active { transform: translateX(-50%) scale(0.94); }
.camera-shutter:active::before { background: #dcdfe6; }
.camera-shutter:disabled { opacity: 0.55; cursor: not-allowed; }

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

    /* ── Camera dialog goes fullscreen on phones ──────────────── */
    /* Fill the viewport edge-to-edge so the preview is as large as
       possible. Header / footer chrome disappear — the overlay
       shutter + close X take over. The body becomes a solid black
       canvas behind the video so any letterboxing from object-fit
       doesn't show the dialog background. */
    ::v-deep .camera-dialog {
        margin: 0 !important;
        width: 100vw !important;
        max-width: 100vw !important;
        min-width: 0 !important;
        top: 0 !important;
        height: 100vh !important;
        max-height: 100vh !important;
        border-radius: 0 !important;
        display: flex !important;
        flex-direction: column;
    }
    ::v-deep .camera-dialog .el-dialog__header,
    ::v-deep .camera-dialog .el-dialog__footer {
        display: none;
    }
    ::v-deep .camera-dialog .el-dialog__body {
        flex: 1;
        padding: 0;
        overflow: hidden;
        min-height: 0;
        background: #000;
    }
    .camera-body {
        min-height: 0;
        height: 100%;
        border-radius: 0;
    }
    /* Cover-fit the video so it fills the viewport without letter-
       boxing. The user can still see what they're capturing — the
       canvas snapshot below uses the video's native frame, so
       cropping in the preview is purely visual. */
    .camera-video {
        width: 100%;
        height: 100%;
        max-height: none;
        object-fit: cover;
    }
    /* Flip the overlay controls on. */
    .camera-close,
    .camera-shutter {
        display: flex;
    }
    /* Move the "N photos added" chip to the top so it doesn't
       collide with the shutter button at the bottom. */
    .camera-count {
        top: 14px;
        left: 14px;
        bottom: auto;
    }
    /* Inset for iOS notch + home-indicator safe areas so the close
       X and shutter button stay tappable on phones with rounded
       corners / chin gestures. Falls back gracefully to the base
       values on browsers that don't support env(). */
    .camera-close {
        top: calc(14px + env(safe-area-inset-top));
        right: calc(14px + env(safe-area-inset-right));
    }
    .camera-shutter {
        bottom: calc(28px + env(safe-area-inset-bottom));
    }
    .camera-count {
        top: calc(14px + env(safe-area-inset-top));
        left: calc(14px + env(safe-area-inset-left));
    }
    /* Error card stays inside the camera body but margins respect
       the safe area too. */
    .camera-error {
        inset: calc(20px + env(safe-area-inset-top))
               calc(16px + env(safe-area-inset-right))
               calc(20px + env(safe-area-inset-bottom))
               calc(16px + env(safe-area-inset-left));
    }
}
</style>
