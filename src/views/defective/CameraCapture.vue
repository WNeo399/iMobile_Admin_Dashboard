<template>
    <!-- the device's camera, in the page: a photo (JPEG under ~1 MB) or a
         video of at most `maxSeconds` (recorded at a capped bitrate, so it
         stays well under 5 MB). Used by the chat box and the editor. -->
    <el-dialog :visible.sync="open" :fullscreen="small" width="560px" top="4vh" custom-class="cc-dialog" append-to-body
        :close-on-click-modal="false" :show-close="true" @opened="start" @closed="stop">
        <div slot="title" class="cc-title">
            <i :class="mode === 'video' ? 'el-icon-video-camera' : 'el-icon-camera'" />
            {{ mode === 'video' ? $tp('Record a video — {n} seconds at most', { n: maxSeconds }) : $tp('Take a photo') }}
        </div>

        <div class="cc-stage">
            <!-- live view -->
            <video v-show="!result" ref="live" autoplay playsinline muted class="cc-video" />
            <!-- what was captured -->
            <img v-if="result && mode === 'photo'" :src="result.url" alt="" class="cc-video" />
            <video v-if="result && mode === 'video'" :src="result.url" controls playsinline class="cc-video" />
            <div v-if="recording" class="cc-rec"><span class="cc-dot" /> {{ seconds }}s / {{ maxSeconds }}s</div>
            <div v-if="recording" class="cc-bar"><div class="cc-bar-fill" :style="{ width: (seconds / maxSeconds * 100) + '%' }" /></div>
            <div v-if="error" class="cc-error">
                <i class="el-icon-warning-outline" />
                <div>{{ error }}</div>
                <el-button size="small" @click="useFile">{{ $tp('Choose a file instead') }}</el-button>
            </div>
            <div v-else-if="starting" class="cc-wait"><i class="el-icon-loading" /> {{ $tp('Starting the camera…') }}</div>
        </div>

        <div class="cc-controls">
            <template v-if="!result">
                <el-button v-if="devices.length > 1" circle icon="el-icon-refresh" :disabled="recording || starting" :title="$tp('Switch camera')" @click="flip" />
                <span v-else class="cc-spacer" />
                <button v-if="mode === 'photo'" type="button" class="cc-shutter" :disabled="!ready" :title="$tp('Take the photo')" @click="snap" />
                <button v-else type="button" :class="['cc-shutter', 'is-video', { on: recording }]" :disabled="!ready" :title="recording ? $tp('Stop') : $tp('Start recording')" @click="recording ? stopRecording() : record()" />
                <el-button type="text" class="cc-file" @click="useFile">{{ $tp('File…') }}</el-button>
            </template>
            <template v-else>
                <el-button size="small" icon="el-icon-refresh-left" @click="retake">{{ $tp('Retake') }}</el-button>
                <span class="cc-spacer" />
                <span class="cc-size">{{ sizeText }}</span>
                <el-button size="small" type="primary" icon="el-icon-check" :loading="busy" @click="use">{{ mode === 'video' ? $tp('Use this video') : $tp('Use this photo') }}</el-button>
            </template>
        </div>
    </el-dialog>
</template>

<script>
import { compressImage, recorderMimeType, baseType, extOf, VIDEO_BITS, AUDIO_BITS } from './media'

export default {
    name: 'DefectiveCameraCapture',
    props: {
        value: Boolean,                               // v-model: open
        mode: { type: String, default: 'photo' },     // 'photo' | 'video'
        maxSeconds: { type: Number, default: 10 }
    },
    data() {
        return { stream: null, devices: [], facing: 'environment', starting: false, ready: false, error: '', recording: false, seconds: 0, timer: null, recorder: null, chunks: [], result: null, busy: false }
    },
    computed: {
        open: { get() { return this.value }, set(v) { this.$emit('input', v) } },
        small() { return window.innerWidth < 700 },
        sizeText() { if (!this.result) return ''; const kb = this.result.file.size / 1024; return kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : Math.round(kb) + ' KB' }
    },
    beforeDestroy() { this.stop() },
    methods: {
        async start() {
            this.error = ''; this.result = null; this.ready = false; this.starting = true
            if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { this.starting = false; this.error = this.$tp('This browser cannot open the camera'); return }
            try {
                this.stopTracks()
                const constraints = { video: { facingMode: this.facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: this.mode === 'video' }
                this.stream = await navigator.mediaDevices.getUserMedia(constraints)
                const v = this.$refs.live
                v.srcObject = this.stream
                await v.play().catch(() => {})
                this.ready = true
                try { this.devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput') } catch (e) { this.devices = [] }
            } catch (e) {
                this.error = e && e.name === 'NotAllowedError' ? this.$tp('Camera access was refused — allow it in the browser, or choose a file') : this.$tp('The camera could not be started — choose a file instead')
            } finally { this.starting = false }
        },
        stopTracks() { if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null } },
        stop() {
            clearInterval(this.timer); this.timer = null
            if (this.recorder && this.recorder.state !== 'inactive') { try { this.recorder.stop() } catch (e) { /* */ } }
            this.recorder = null; this.recording = false; this.seconds = 0
            this.stopTracks()
            if (this.result && this.result.url) URL.revokeObjectURL(this.result.url)
            this.result = null; this.ready = false
        },
        async flip() { this.facing = this.facing === 'environment' ? 'user' : 'environment'; await this.start() },
        // a frame of the live view → JPEG under ~1 MB
        async snap() {
            const v = this.$refs.live
            if (!v || !v.videoWidth) return
            const c = document.createElement('canvas')
            c.width = v.videoWidth; c.height = v.videoHeight
            c.getContext('2d').drawImage(v, 0, 0)
            const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9))
            if (!blob) return
            const raw = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
            const file = await compressImage(raw)
            this.result = { file, url: URL.createObjectURL(file) }
        },
        record() {
            if (!this.stream || this.recording) return
            const mime = recorderMimeType()
            if (!mime) { this.error = this.$tp('This browser cannot record video — choose a file instead'); return }
            this.chunks = []
            try {
                this.recorder = new MediaRecorder(this.stream, { mimeType: mime, videoBitsPerSecond: VIDEO_BITS, audioBitsPerSecond: AUDIO_BITS })
            } catch (e) { this.error = this.$tp('This browser cannot record video — choose a file instead'); return }
            this.recorder.ondataavailable = e => { if (e.data && e.data.size) this.chunks.push(e.data) }
            this.recorder.onstop = () => {
                clearInterval(this.timer); this.timer = null
                this.recording = false
                const type = baseType(mime)
                const file = new File(this.chunks, `video-${Date.now()}.${extOf(type)}`, { type, lastModified: Date.now() })
                this.result = { file, url: URL.createObjectURL(file) }
            }
            this.seconds = 0; this.recording = true
            this.recorder.start(250)
            const t0 = Date.now()
            this.timer = setInterval(() => {
                this.seconds = Math.min(this.maxSeconds, Math.round((Date.now() - t0) / 1000))
                if (Date.now() - t0 >= this.maxSeconds * 1000) this.stopRecording()
            }, 200)
        },
        stopRecording() { clearInterval(this.timer); this.timer = null; if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop() },
        retake() { if (this.result && this.result.url) URL.revokeObjectURL(this.result.url); this.result = null },
        use() {
            if (!this.result) return
            this.busy = true
            const file = this.result.file
            this.result = null           // keep the object URL: the parent may show the file
            this.$emit('done', file)
            this.busy = false
            this.open = false
        },
        useFile() { this.open = false; this.$emit('fallback', this.mode) }
    }
}
</script>

<style lang="scss" scoped>
.cc-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; color: #303133; i { color: #409eff; } }
.cc-stage { position: relative; background: #000; border-radius: 8px; overflow: hidden; aspect-ratio: 4 / 3; display: flex; align-items: center; justify-content: center; }
.cc-video { width: 100%; height: 100%; object-fit: contain; display: block; background: #000; }
.cc-rec { position: absolute; left: 10px; top: 10px; display: flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: 12px; background: rgba(0, 0, 0, .6); color: #fff; font-size: 13px; font-weight: 600; }
.cc-dot { width: 10px; height: 10px; border-radius: 50%; background: #f56c6c; animation: cc-blink 1s infinite; }
@keyframes cc-blink { 50% { opacity: .2; } }
.cc-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: rgba(255, 255, 255, .25); }
.cc-bar-fill { height: 100%; background: #f56c6c; transition: width .2s linear; }
.cc-error, .cc-wait { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 20px; text-align: center; color: #fff; font-size: 14px; background: rgba(0, 0, 0, .7); i { font-size: 28px; } }
.cc-controls { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; }
.cc-spacer { flex: 1; }
.cc-shutter { width: 64px; height: 64px; border-radius: 50%; border: 4px solid #fff; box-shadow: 0 0 0 2px #909399; background: #fff; cursor: pointer; transition: transform .1s;
    &:active { transform: scale(.92); } &:disabled { opacity: .4; cursor: default; }
    &.is-video { background: #f56c6c; }
    &.is-video.on { border-radius: 10px; width: 40px; height: 40px; margin: 12px; } }
.cc-file { color: #909399; }
.cc-size { font-size: 12px; color: #909399; margin-right: 8px; }
::v-deep .cc-dialog { .el-dialog__body { padding: 10px 16px 16px; } }
::v-deep .cc-dialog.is-fullscreen { .cc-stage { aspect-ratio: auto; height: calc(100vh - 170px); } }
</style>
