<template>
    <!-- Scan part labels with the device camera (user ask 2026-10-13: the
         team creates batches on their phones). Continuous: every decode is
         handed up as one scan (one unit), the same code again only after a
         short pause so a label held still doesn't count twice. Decoding:
         the browser's own BarcodeDetector where it exists (Chrome on
         Android), otherwise ZXing in JavaScript (Safari on iPhone). -->
    <el-dialog :visible.sync="open" :fullscreen="fullscreen" :width="fullscreen ? undefined : '520px'" append-to-body top="4vh"
        custom-class="bsc-dialog" :close-on-click-modal="false" @closed="stop">
        <div slot="title" class="bsc-head"><i class="el-icon-camera" /> {{ $tp('Scan with the camera') }}</div>
        <div class="bsc-body" @pointerdown="unlockAudio">
        <!-- taller on phones (fullscreen) so more of the camera's view shows -->
        <div :class="['bsc-stage', { 'bsc-stage-tall': fullscreen }]">
            <video ref="video" class="bsc-video" autoplay playsinline muted />
            <div class="bsc-frame" />
            <div v-if="state === 'starting'" class="bsc-overlay">{{ $tp('Starting the camera…') }}</div>
            <div v-else-if="state === 'error'" class="bsc-overlay bsc-overlay-err">
                <i class="el-icon-warning-outline" />
                <div>{{ error }}</div>
                <el-button size="small" @click="start">{{ $tp('Try again') }}</el-button>
            </div>
        </div>
        <div class="bsc-bar">
            <div class="bsc-last">
                <template v-if="last">
                    <span class="bsc-last-code">{{ last }}</span>
                    <span class="bsc-dim"> · {{ $tp('{n} scanned', { n: count }) }}</span>
                </template>
                <span v-else class="bsc-dim">{{ $tp('Point the camera at the label’s barcode') }}</span>
            </div>
            <el-button v-if="torchable" size="small" :icon="torch ? 'el-icon-sunny' : 'el-icon-moon'" @click="toggleTorch">{{ $tp('Light') }}</el-button>
            <el-button v-if="cameras.length > 1" size="small" icon="el-icon-refresh" @click="switchCamera">{{ $tp('Switch camera') }}</el-button>
            <el-button size="small" :icon="sound ? 'el-icon-bell' : 'el-icon-close-notification'" :title="sound ? $tp('Sound on') : $tp('Sound off')" @click="toggleSound" />
        </div>
        <div class="bsc-engine bsc-dim">{{ engine === 'native' ? $tp('Using the built-in barcode reader') : engine === 'zxing' ? $tp('Using the JavaScript barcode reader') : '' }}</div>
        <!-- whatever the parent wants under the camera (Batches: the lines scanned so far) -->
        <slot />
        </div>
        <span slot="footer">
            <el-button type="primary" size="small" icon="el-icon-check" @click="open = false">{{ $tp('Done') }}</el-button>
        </span>
    </el-dialog>
</template>

<script>
// Formats a label can carry. Our part labels are QR codes holding the SKU
// (utils/sppLabelPdf); supplier packaging adds the 1-D ones.
const NATIVE_FORMATS = ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'qr_code', 'data_matrix']
const REPEAT_MS = 1500
// the beep switch, remembered per browser
const SOUND_KEY = 'spp.scanSound'
const readSound = () => { try { return localStorage.getItem(SOUND_KEY) !== 'off' } catch (e) { return true } }

export default {
    name: 'BarcodeScanner',
    props: {
        visible: { type: Boolean, default: false },
        fullscreen: { type: Boolean, default: false }
    },
    data() {
        return {
            state: 'idle', error: '', engine: '',
            stream: null, track: null, cameras: [], cameraIndex: 0,
            torchable: false, torch: false,
            detector: null, zxing: null, zxingControls: null, raf: 0,
            last: '', lastAt: 0, count: 0,
            sound: readSound(), audio: null
        }
    },
    computed: {
        open: {
            get() { return this.visible },
            set(v) { this.$emit('update:visible', v) }
        }
    },
    watch: {
        visible(v) {
            if (v) { this.last = ''; this.count = 0; this.$nextTick(this.start) } else this.stop()
        }
    },
    beforeDestroy() { this.stop() },
    methods: {
        async start() {
            this.stop()
            this.unlockAudio()
            this.state = 'starting'
            this.error = ''
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                this.state = 'error'
                this.error = this.$tp('This browser cannot use the camera — open the dashboard over https on your phone')
                return
            }
            try {
                const constraints = this.cameras.length
                    ? { video: { deviceId: { exact: this.cameras[this.cameraIndex].deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } }
                    : { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } }
                this.stream = await navigator.mediaDevices.getUserMedia(constraints)
                this.track = this.stream.getVideoTracks()[0]
                const video = this.$refs.video
                video.srcObject = this.stream
                await video.play().catch(() => {})
                // the camera list (labels only appear once a stream was granted)
                if (!this.cameras.length) {
                    try {
                        const all = await navigator.mediaDevices.enumerateDevices()
                        this.cameras = all.filter(d => d.kind === 'videoinput')
                        const cur = this.track.getSettings && this.track.getSettings().deviceId
                        const i = this.cameras.findIndex(c => c.deviceId === cur)
                        if (i >= 0) this.cameraIndex = i
                    } catch (e) { /* no list — no switching */ }
                }
                const caps = this.track.getCapabilities ? this.track.getCapabilities() : {}
                this.torchable = !!caps.torch
                this.torch = false
                this.state = 'scanning'
                if (window.BarcodeDetector) {
                    let formats = NATIVE_FORMATS
                    try {
                        const supported = await window.BarcodeDetector.getSupportedFormats()
                        formats = NATIVE_FORMATS.filter(f => supported.includes(f))
                    } catch (e) { /* keep the list */ }
                    this.detector = new window.BarcodeDetector({ formats })
                    this.engine = 'native'
                    this.nativeLoop()
                } else {
                    await this.startZxing(video)
                }
            } catch (e) {
                this.state = 'error'
                this.error = (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError'))
                    ? this.$tp('Camera access was refused — allow the camera for this site and try again')
                    : this.$tp('The camera could not be started') + (e && e.message ? ` (${e.message})` : '')
            }
        },
        // the browser's own reader: a frame every ~150 ms
        nativeLoop() {
            const video = this.$refs.video
            const tick = async () => {
                if (this.state !== 'scanning' || !this.detector || !video) return
                try {
                    if (video.readyState >= 2) {
                        const codes = await this.detector.detect(video)
                        if (codes && codes.length) this.hit(codes[0].rawValue)
                    }
                } catch (e) { /* a bad frame — keep going */ }
                this.raf = setTimeout(tick, 150)
            }
            tick()
        },
        // ZXing in JavaScript, loaded only when needed
        async startZxing(video) {
            const { BrowserMultiFormatReader } = await import(/* webpackChunkName: "zxing" */ '@zxing/browser')
            this.zxing = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 150, delayBetweenScanSuccess: 300 })
            this.engine = 'zxing'
            // decode from the stream we already hold, so the same camera is used
            this.zxingControls = await this.zxing.decodeFromStream(this.stream, video, (result) => {
                if (result) this.hit(result.getText())
            })
        },
        hit(text) {
            const code = String(text || '').trim()
            if (!code) return
            const now = Date.now()
            if (code === this.last && now - this.lastAt < REPEAT_MS) return
            this.last = code
            this.lastAt = now
            this.count += 1
            if (navigator.vibrate) { try { navigator.vibrate(60) } catch (e) { /* no haptics */ } }
            this.beep('ok')
            this.$emit('scan', code)
        },
        // ── sound: a short high beep per read; two low tones when the parent
        // reports a scan with no order behind it (`beep('bad')`) ──
        unlockAudio() {
            if (!this.sound) return
            try {
                const AC = window.AudioContext || window.webkitAudioContext
                if (!AC) return
                if (!this.audio) this.audio = new AC()
                if (this.audio.state === 'suspended') this.audio.resume().catch(() => {})
            } catch (e) { /* no sound on this device */ }
        },
        beep(kind) {
            if (!this.sound) return
            this.unlockAudio()
            const ctx = this.audio
            if (!ctx) return
            try {
                const bad = kind === 'bad'
                const tones = bad ? [[300, 0, 0.16], [300, 0.22, 0.16]] : [[1400, 0, 0.09]]
                for (const [freq, at, dur] of tones) {
                    const o = ctx.createOscillator()
                    const g = ctx.createGain()
                    o.type = bad ? 'square' : 'sine'
                    o.frequency.value = freq
                    const t = ctx.currentTime + at
                    g.gain.setValueAtTime(0.0001, t)
                    g.gain.exponentialRampToValueAtTime(bad ? 0.25 : 0.35, t + 0.01)
                    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
                    o.connect(g).connect(ctx.destination)
                    o.start(t)
                    o.stop(t + dur + 0.02)
                }
            } catch (e) { /* no sound */ }
        },
        toggleSound() {
            this.sound = !this.sound
            try { localStorage.setItem(SOUND_KEY, this.sound ? 'on' : 'off') } catch (e) { /* not remembered */ }
            if (this.sound) { this.unlockAudio(); this.beep('ok') }
        },
        async toggleTorch() {
            if (!this.track) return
            try {
                await this.track.applyConstraints({ advanced: [{ torch: !this.torch }] })
                this.torch = !this.torch
            } catch (e) { this.torchable = false }
        },
        switchCamera() {
            if (this.cameras.length < 2) return
            this.cameraIndex = (this.cameraIndex + 1) % this.cameras.length
            this.start()
        },
        stop() {
            if (this.raf) { clearTimeout(this.raf); this.raf = 0 }
            if (this.zxingControls) { try { this.zxingControls.stop() } catch (e) { /* already stopped */ } this.zxingControls = null }
            this.zxing = null
            this.detector = null
            if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null }
            this.track = null
            const video = this.$refs.video
            if (video) video.srcObject = null
            if (this.state !== 'error') this.state = 'idle'
        }
    },
    destroyed() {
        if (this.audio) { try { this.audio.close() } catch (e) { /* already closed */ } this.audio = null }
    }
}
</script>

<style lang="scss" scoped>
.bsc-head { font-size: 15px; font-weight: 600; color: #303133; i { color: #409eff; margin-right: 4px; } }
.bsc-stage { position: relative; width: 100%; aspect-ratio: 4 / 3; background: #000; border-radius: 8px; overflow: hidden; }
.bsc-stage-tall { aspect-ratio: 1 / 1; }
.bsc-video { width: 100%; height: 100%; object-fit: cover; display: block; }
.bsc-frame { position: absolute; left: 5%; right: 5%; top: 14%; bottom: 14%; border: 2px solid rgba(64, 158, 255, .9); border-radius: 8px;
    box-shadow: 0 0 0 2000px rgba(0, 0, 0, .25); pointer-events: none; }
.bsc-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
    color: #fff; font-size: 14px; text-align: center; padding: 20px; background: rgba(0, 0, 0, .55); i { font-size: 30px; } }
.bsc-overlay-err { color: #fde2e2; }
.bsc-bar { display: flex; align-items: center; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.bsc-last { flex: 1; min-width: 0; font-size: 14px; color: #303133; }
.bsc-last-code { font-weight: 700; font-variant-numeric: tabular-nums; }
.bsc-dim { font-size: 12px; color: #909399; }
.bsc-engine { margin-top: 6px; }
</style>
