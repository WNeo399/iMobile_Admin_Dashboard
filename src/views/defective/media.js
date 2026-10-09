// Client-side media preparation for defective-device listings: photos are
// squeezed under about 1 MB, videos are checked (10 s at most) and, when the
// browser can, re-encoded under about 5 MB. Nothing here talks to the server.

export const PHOTO_TARGET = 1024 * 1024        // bytes
export const PHOTO_MAX_SIDE = 1600             // px, the long side
export const VIDEO_TARGET = 5 * 1024 * 1024    // bytes
export const VIDEO_MAX_SECONDS = 10
export const VIDEO_BITS = 2500000              // ≈ 3 MB for 10 s at 720p
export const AUDIO_BITS = 64000

// the container/codec this browser can record (Chrome/Firefox/Android → webm, Safari → mp4)
export function recorderMimeType() {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return ''
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4']
    return types.find(t => MediaRecorder.isTypeSupported(t)) || ''
}
export const canOpenCamera = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
export const canRecord = () => canOpenCamera() && !!recorderMimeType()
export const canTranscode = () => { const v = document.createElement('video'); return !!(v.captureStream || v.mozCaptureStream) && !!recorderMimeType() }
export const baseType = (mime) => String(mime || '').split(';')[0].trim()
export const extOf = (mime) => ({ 'video/webm': 'webm', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'image/jpeg': 'jpg', 'image/png': 'png' }[baseType(mime)] || 'bin')

async function loadBitmap(file) {
    if (window.createImageBitmap) {
        try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch (e) { /* older browsers: the Image route below */ }
    }
    return new Promise((resolve, reject) => {
        const img = new Image()
        const url = URL.createObjectURL(file)
        img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('cannot decode')) }
        img.src = url
    })
}
const toBlob = (canvas, type, q) => new Promise(resolve => canvas.toBlob(resolve, type, q))

// A JPEG under `target`: the long side is shrunk to `maxSide`, then the
// quality steps down, then the size steps down. A small JPEG passes untouched;
// an image this browser can't decode is left for the server to try.
export async function compressImage(file, { target = PHOTO_TARGET, maxSide = PHOTO_MAX_SIDE } = {}) {
    if (!/^image\//.test(file.type)) return file
    let bmp
    try { bmp = await loadBitmap(file) } catch (e) { return file }
    const w0 = bmp.width || bmp.naturalWidth || 0, h0 = bmp.height || bmp.naturalHeight || 0
    if (!w0 || !h0) return file
    if (file.type === 'image/jpeg' && file.size <= target && Math.max(w0, h0) <= maxSide) { if (bmp.close) bmp.close(); return file }
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const long = Math.max(w0, h0)
    let out = null
    for (const side of [Math.min(maxSide, long), 1280, 1024, 800]) {
        if (side > long && side !== Math.min(maxSide, long)) continue
        const scale = Math.min(1, side / long)
        canvas.width = Math.max(1, Math.round(w0 * scale)); canvas.height = Math.max(1, Math.round(h0 * scale))
        ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
        for (const q of [0.85, 0.75, 0.65, 0.55]) {
            out = await toBlob(canvas, 'image/jpeg', q)
            if (out && out.size <= target) break
        }
        if (out && out.size <= target) break
    }
    if (bmp.close) bmp.close()
    if (!out) return file
    const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg'
    return new File([out], name, { type: 'image/jpeg', lastModified: Date.now() })
}

// duration / size of a video this browser can decode (a freshly recorded
// webm reports an infinite duration until it is seeked to the end)
export function videoMeta(file) {
    return new Promise((resolve, reject) => {
        const v = document.createElement('video')
        v.preload = 'metadata'; v.muted = true; v.playsInline = true
        const url = URL.createObjectURL(file)
        let settled = false
        const finish = (ok, val) => { if (settled) return; settled = true; URL.revokeObjectURL(url); ok ? resolve(val) : reject(val) }
        const read = () => finish(true, { duration: isFinite(v.duration) ? v.duration : null, width: v.videoWidth || null, height: v.videoHeight || null })
        v.onerror = () => finish(false, new Error('cannot decode'))
        v.onloadedmetadata = () => {
            if (isFinite(v.duration)) return read()
            v.ontimeupdate = () => { v.ontimeupdate = null; v.currentTime = 0; read() }
            v.currentTime = 1e101
        }
        setTimeout(() => finish(false, new Error('timeout')), 15000)
        v.src = url
    })
}

// Re-encode a short video in this browser: play it (silently, through the
// Web Audio graph), capture the stream and record it at a capped bitrate.
// Chrome / Edge / Firefox / Android; Safari has no captureStream on videos.
export function transcodeVideo(file, { duration, target = VIDEO_TARGET, maxSeconds = VIDEO_MAX_SECONDS, onProgress = () => {} } = {}) {
    return new Promise((resolve, reject) => {
        const mime = recorderMimeType()
        const v = document.createElement('video')
        v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous'
        const url = URL.createObjectURL(file)
        const secs = Math.min(duration || maxSeconds, maxSeconds)
        const videoBits = Math.min(VIDEO_BITS, Math.floor(target * 8 * 0.8 / Math.max(secs, 1)) - AUDIO_BITS)
        let rec, ctxA, tick, hardStop
        const chunks = []
        const cleanup = () => { clearInterval(tick); clearTimeout(hardStop); try { v.pause() } catch (e) { /* */ } URL.revokeObjectURL(url); if (ctxA) ctxA.close().catch(() => {}) }
        const fail = (e) => { cleanup(); reject(e instanceof Error ? e : new Error(String(e))) }
        v.onerror = () => fail(new Error('cannot decode'))
        v.onloadedmetadata = async () => {
            try {
                const captured = (v.captureStream || v.mozCaptureStream).call(v)
                const tracks = [...captured.getVideoTracks()]
                try {
                    const AC = window.AudioContext || window.webkitAudioContext
                    ctxA = new AC()
                    const dest = ctxA.createMediaStreamDestination()
                    ctxA.createMediaElementSource(v).connect(dest)
                    tracks.push(...dest.stream.getAudioTracks())
                } catch (e) { v.muted = true }
                rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: videoBits, audioBitsPerSecond: AUDIO_BITS })
                rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }
                rec.onerror = (e) => fail(e.error || new Error('recorder failed'))
                rec.onstop = () => {
                    cleanup()
                    const type = baseType(mime)
                    const name = (file.name || 'video').replace(/\.[^.]+$/, '') + '.' + extOf(type)
                    resolve(new File(chunks, name, { type, lastModified: Date.now() }))
                }
                const stop = () => { if (rec.state !== 'inactive') rec.stop() }
                v.onended = stop
                hardStop = setTimeout(stop, (secs + 0.5) * 1000)
                tick = setInterval(() => onProgress(Math.min(99, Math.round(v.currentTime / Math.max(secs, 0.1) * 100))), 250)
                await v.play()
                rec.start(250)
            } catch (e) { fail(e) }
        }
        v.src = url
    })
}

// A picked video, ready to upload: at most `maxSeconds` long, and under
// `target` (re-encoded here when the browser can). Throws { code } for the
// caller to word: 'too-long' (with .duration) or 'too-big'.
export async function prepareVideo(file, { maxSeconds = VIDEO_MAX_SECONDS, target = VIDEO_TARGET, onProgress } = {}) {
    let meta = null
    try { meta = await videoMeta(file) } catch (e) { /* undecodable here — the size rule still applies */ }
    if (meta && meta.duration && meta.duration > maxSeconds + 0.5) throw Object.assign(new Error('too-long'), { code: 'too-long', duration: meta.duration })
    if (file.size <= target) return file
    if (!meta || !canTranscode()) throw Object.assign(new Error('too-big'), { code: 'too-big' })
    const out = await transcodeVideo(file, { duration: meta.duration, target, maxSeconds, onProgress })
    if (out.size > target) throw Object.assign(new Error('too-big'), { code: 'too-big' })
    return out
}

// the message for a prepareVideo failure
export function videoProblem(e, $tp, maxSeconds = VIDEO_MAX_SECONDS) {
    if (e && e.code === 'too-long') return $tp('A video must be {n} seconds or shorter — record it here with the camera button', { n: maxSeconds })
    if (e && e.code === 'too-big') return $tp('That video is over 5 MB and this browser cannot shrink it — record it here with the camera button instead')
    return (e && e.message) || $tp('That video cannot be used')
}
