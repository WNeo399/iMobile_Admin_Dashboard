<template>
    <div class="credit-note-tool">
        <!--
            Two hidden file inputs. The first lets the user pick from their
            gallery / file system; the second uses `capture="environment"`
            which prompts mobile browsers to open the rear camera directly.
            On desktop, "capture" is silently ignored and falls back to the
            normal file picker — so both buttons stay useful everywhere.
        -->
        <input
            ref="fileInput"
            type="file"
            accept="image/*"
            class="hidden-input"
            @change="onFileChosen"
        />
        <input
            ref="cameraInput"
            type="file"
            accept="image/*"
            capture="environment"
            class="hidden-input"
            @change="onFileChosen"
        />

        <!-- Idle state — show the two source buttons -->
        <div v-if="!file" class="picker">
            <div class="picker-help">
                Choose a credit note image from your device or take a photo
                with your camera. We'll submit it for processing.
            </div>
            <div class="picker-buttons">
                <el-button
                    type="primary"
                    icon="el-icon-picture"
                    @click="$refs.fileInput.click()"
                >Choose Image</el-button>
                <el-button
                    icon="el-icon-camera"
                    @click="$refs.cameraInput.click()"
                >Take Photo</el-button>
            </div>
        </div>

        <!--
            Preview state — show the selected image plus filename/size and
            the action buttons. Submit kicks off the upload; Clear resets
            so the user can pick a different image without closing the
            dialog.
        -->
        <div v-else class="preview">
            <div class="preview-image-wrap">
                <img :src="previewUrl" alt="Credit note preview" class="preview-image" />
            </div>
            <div class="preview-meta">
                <div class="meta-name" :title="file.name">{{ file.name }}</div>
                <div class="meta-size">{{ formatBytes(file.size) }}</div>
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
                Show the webhook response after a successful submit so admins
                can confirm n8n actually accepted the payload (and see any
                JSON the workflow chose to return).
            -->
            <div v-if="lastResponse" class="preview-response">
                <div class="preview-response-label">
                    <i class="el-icon-success" /> Webhook response
                </div>
                <pre class="preview-response-body">{{ lastResponse }}</pre>
            </div>

            <div class="preview-actions">
                <el-button
                    :disabled="submitting"
                    icon="el-icon-refresh"
                    @click="reset"
                >{{ lastResponse ? 'Submit another' : 'Clear' }}</el-button>
                <el-button
                    v-if="!lastResponse"
                    type="primary"
                    :loading="submitting"
                    icon="el-icon-upload"
                    @click="submit"
                >{{ submitting ? 'Submitting…' : 'Submit Credit Note' }}</el-button>
            </div>
        </div>
    </div>
</template>

<script>
// Direct axios import — this hits an external n8n webhook, not our own API,
// so we bypass @/utils/request (which would attach our JWT and base URL).
import axios from 'axios'

// n8n production webhook for credit-note ingestion. Fires whenever the
// workflow is Active in the n8n editor. (Use the /webhook-test/ variant
// instead while iterating on the workflow — those only fire when the
// editor has "Listen for test event" enabled.)
const SUBMIT_URL = 'https://exyon.app.n8n.cloud/webhook/submitCreditNote'

// Cap so the user doesn't accidentally try to upload a 50MB camera roll.
// 10 MB is plenty for a phone photo of a paper credit note.
const MAX_BYTES = 10 * 1024 * 1024

export default {
    name: 'CreateCreditNote',
    data() {
        return {
            file: null,
            previewUrl: '',
            submitting: false,
            lastError: '',
            // Pretty-printed body of the last successful submit response —
            // shown so admins can confirm n8n actually accepted the payload.
            lastResponse: ''
        }
    },
    beforeDestroy() {
        // Release the blob URL we created for the preview so it doesn't
        // leak when the dialog is closed.
        this.revokePreview()
    },
    methods: {
        onFileChosen(event) {
            const f = event.target.files && event.target.files[0]
            // Clear the input value so picking the same file again still
            // triggers the change event next time.
            event.target.value = ''
            if (!f) return

            if (!f.type || !f.type.startsWith('image/')) {
                this.$message.error('Please choose an image file')
                return
            }
            if (f.size > MAX_BYTES) {
                this.$message.error(
                    `Image is ${this.formatBytes(f.size)} — please keep it under ${this.formatBytes(MAX_BYTES)}`
                )
                return
            }

            this.revokePreview()
            this.file = f
            this.previewUrl = URL.createObjectURL(f)
            this.lastError = ''
        },
        async submit() {
            if (!this.file || this.submitting) return
            this.submitting = true
            this.lastError = ''
            this.lastResponse = ''

            const form = new FormData()
            // n8n's Webhook node defaults to looking for binary data under
            // the property name `data` — using a different field name here
            // (e.g. "file") means downstream nodes that reference
            // `$binary.data` see nothing. Stick with "data" so the upload
            // works against a default-configured webhook.
            form.append('data', this.file, this.file.name)

            try {
                const res = await axios.post(SUBMIT_URL, form, {
                    // Don't set Content-Type manually — letting the browser
                    // set it ensures the multipart boundary is included.
                    timeout: 60000
                })
                this.$message.success('Credit note submitted')
                // Surface the response so we can confirm n8n received it
                // and see what it returned. Most webhooks reply with
                // `{ message: "Workflow was started" }` or similar.
                this.lastResponse = this.formatResponse(res)
            } catch (e) {
                console.error('Credit note submit failed:', e)
                this.lastError = this.describeError(e)
            } finally {
                this.submitting = false
            }
        },
        formatResponse(res) {
            if (!res) return ''
            const body = res.data
            if (body == null || body === '') return `HTTP ${res.status} (no body)`
            try {
                return JSON.stringify(body, null, 2)
            } catch (_) {
                return String(body)
            }
        },
        reset() {
            this.revokePreview()
            this.file = null
            this.previewUrl = ''
            this.lastError = ''
            this.lastResponse = ''
        },
        revokePreview() {
            if (this.previewUrl) {
                try { URL.revokeObjectURL(this.previewUrl) } catch (_) { /* noop */ }
                this.previewUrl = ''
            }
        },
        describeError(e) {
            if (!e) return 'Submit failed'
            if (e.response) {
                const status = e.response.status
                const body = e.response.data
                const detail = typeof body === 'string' ? body : (body && body.message) || ''
                // n8n returns 404 with a "webhook not registered" message
                // when the workflow isn't Active (or, if pointing at the
                // /webhook-test/ URL, when the editor isn't listening for
                // a test event).
                if (status === 404 && String(detail).toLowerCase().includes('not registered')) {
                    return 'n8n webhook is not active. Activate the workflow in n8n (or use the test URL while iterating).'
                }
                return `Submit failed (HTTP ${status})${detail ? ': ' + detail : ''}`
            }
            if (e.code === 'ECONNABORTED') return 'Upload timed out. Check your connection and try again.'
            return e.message || 'Submit failed'
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

/* Preview state */
.preview { display: flex; flex-direction: column; gap: 12px; }
.preview-image-wrap {
    background: #fafafa;
    border: 1px dashed #dcdfe6;
    border-radius: 8px;
    padding: 8px;
    text-align: center;
    max-height: 360px;
    overflow: hidden;
}
.preview-image {
    max-width: 100%;
    max-height: 340px;
    border-radius: 4px;
    object-fit: contain;
}
.preview-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    color: #606266;
    gap: 12px;
    padding: 0 4px;
}
.meta-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #303133;
    font-weight: 500;
}
.meta-size { color: #909399; flex-shrink: 0; }

.preview-alert {
    margin: 0;
}
.preview-response {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 6px;
    padding: 10px 12px;
}
.preview-response-label {
    color: #15803d;
    font-size: 13px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
}
.preview-response-body {
    margin: 0;
    color: #166534;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 160px;
    overflow: auto;
}

/*
 * Mobile (~ phones in portrait). The dialog itself is already widened to
 * 96vw by the parent; here we just lay out the *content* better:
 *  - source buttons stack full-width so they're large tap targets
 *  - preview image shrinks so the actions stay visible without scrolling
 *  - action buttons go full-width and stack
 */
@media (max-width: 600px) {
    .picker-buttons {
        flex-direction: column;
        gap: 8px;
    }
    .picker-buttons .el-button {
        width: 100%;
        /* Override Element UI's default .el-button + .el-button left margin
           which pushes the second button off-axis when the row is stacked. */
        margin-left: 0 !important;
        padding: 12px 16px;
        font-size: 15px;
    }
    .preview-image-wrap { max-height: 260px; }
    .preview-image { max-height: 240px; }
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
    /* The filename ellipses can swallow the size — give it more room */
    .preview-meta {
        flex-wrap: wrap;
        gap: 4px 12px;
    }
}

.preview-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 4px;
}
</style>
