// Photos and videos onto a defective-device listing — shared by the editor
// dialog and the New Listing chat. Photos go through the server; a video
// is PUT straight to the bucket on the signed URL the server hands out,
// then reported done, then its cover frame (captured here) is uploaded.
import { uploadDefectivePhotos, startDefectiveVideo, finishDefectiveVideo, uploadDefectivePoster } from '@/api/defective'

const fail = (r, fallback) => new Error((r && r.message) || fallback)

export async function uploadPhotos(listingId, files) {
    const fd = new FormData()
    files.forEach(f => fd.append('photos', f))
    const r = await uploadDefectivePhotos(listingId, fd)
    if (!r || r.success === false) throw fail(r, 'Failed to upload the photos')
    return r.added
}

// onProgress(pct, label) keeps the page informed; resolves with the media record
export async function uploadVideo(listingId, file, { onProgress = () => {} } = {}) {
    onProgress(0, 'Starting…')
    const s = await startDefectiveVideo(listingId, { name: file.name, contentType: file.type, size: file.size })
    if (!s || s.success === false) throw fail(s, 'Failed to start the upload')
    onProgress(0, 'Uploading…')
    await putToS3(s.upload.url, file, pct => onProgress(pct, 'Uploading…'))
    onProgress(100, 'Finishing…')
    let info = { duration: null, width: null, height: null, poster: null }
    try { info = await capturePoster(file) } catch (e) { /* the browser can't decode it — no cover */ }
    const f = await finishDefectiveVideo(listingId, s.upload.id, { duration: info.duration, width: info.width, height: info.height })
    if (!f || f.success === false) throw fail(f, 'Failed to record the video')
    let added = f.added
    if (info.poster) {
        const fd = new FormData()
        fd.append('poster', info.poster, 'poster.jpg')
        try { const p = await uploadDefectivePoster(listingId, added.id, fd); if (p && p.media) added = p.media } catch (e) { /* no cover; the video is there */ }
    }
    return added
}

function putToS3(url, file, onPct) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', url)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.upload.onprogress = ev => { if (ev.lengthComputable) onPct(Math.round(ev.loaded / ev.total * 100)) }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`The bucket refused the upload (status ${xhr.status}) — check its CORS rule`)))
        xhr.onerror = () => reject(new Error('The upload to the bucket failed — check its CORS rule'))
        xhr.send(file)
    })
}

// a frame about a second in, as a JPEG, plus the video's size and length
export function capturePoster(file) {
    return new Promise((resolve, reject) => {
        const v = document.createElement('video')
        v.preload = 'auto'; v.muted = true; v.playsInline = true
        const url = URL.createObjectURL(file)
        const done = out => { URL.revokeObjectURL(url); resolve(out) }
        const failed = () => { URL.revokeObjectURL(url); reject(new Error('cannot decode')) }
        v.onerror = failed
        v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 2) }
        v.onseeked = () => {
            try {
                const scale = Math.min(1, 1280 / Math.max(v.videoWidth || 1, v.videoHeight || 1))
                const c = document.createElement('canvas')
                c.width = Math.round((v.videoWidth || 640) * scale); c.height = Math.round((v.videoHeight || 360) * scale)
                c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
                c.toBlob(blob => done({ duration: v.duration || null, width: v.videoWidth || null, height: v.videoHeight || null, poster: blob }), 'image/jpeg', 0.85)
            } catch (e) { failed() }
        }
        v.src = url
    })
}
