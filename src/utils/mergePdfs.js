// Several PDFs as one (2026-10-21, Exyon Dispatch "Print all labels": our
// labels and the AusPost ones in one print). pdf-lib is loaded only when used.
// mergePdfs([ArrayBuffer | Uint8Array, …]) → Uint8Array (the pages in order;
// an empty / missing part is skipped).
export async function mergePdfs(parts) {
    const { PDFDocument } = await import(/* webpackChunkName: "pdf-lib" */ 'pdf-lib')
    const out = await PDFDocument.create()
    for (const bytes of parts) {
        if (!bytes || !bytes.byteLength) continue
        const src = await PDFDocument.load(bytes)
        const pages = await out.copyPages(src, src.getPageIndices())
        pages.forEach(p => out.addPage(p))
    }
    return out.save()
}

// a base64 string (the backend's AusPost PDF) → Uint8Array
export function bytesOfBase64(b64) {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
}
