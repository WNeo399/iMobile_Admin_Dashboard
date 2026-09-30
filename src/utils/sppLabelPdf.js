// 50mm × 40mm part label for Spare Parts Purchase shipment lines (Batches
// page, batch view). Same stock and layout family as the Order Dispatch item
// label (utils/dispatchItemLabelPdf.js), pared down to what the parts team
// asked for: the product name and the SKU (as a Code 128 barcode with the
// digits under it). No date, no batch number.
//
// buildSppLineLabelsPdf(line, copies, orientation)  — one line, `copies` identical labels
// buildSppBatchLabelsPdf(batch, orientation)        — every line, one label per unit
//                                                     (shipped, or ordered on an order batch)
// sppLabelCount(batch)                               — how many labels that is
// `line` is a batch line ({ sku, productName, shippedQty }).
//
// Orientation (user ask 2026-09-30, "allow for switching"): "landscape" is
// the 50 × 40 page; "portrait" a 40 × 50 page carrying the SAME label turned
// 90° clockwise — for a printer whose label stock is set up the other way.
// The choice is remembered per browser; portrait by default.

import { jsPDF } from 'jspdf'
import { deviceTerms } from '@/api/sparePartsPurchase'
import JsBarcode from 'jsbarcode'

const LABEL_W = 50
const LABEL_H = 40
const MARGIN = 3

// ── Orientation ─────────────────────────────────────────────────────
const ORIENT_KEY = 'spp-label-orientation'
export const LABEL_ORIENTATIONS = ['portrait', 'landscape']
export function getLabelOrientation() {
    try {
        const v = localStorage.getItem(ORIENT_KEY)
        if (LABEL_ORIENTATIONS.includes(v)) return v
    } catch (e) { /* private mode: the default */ }
    return 'portrait'
}
export function setLabelOrientation(v) {
    if (!LABEL_ORIENTATIONS.includes(v)) return
    try { localStorage.setItem(ORIENT_KEY, v) } catch (e) { /* not remembered */ }
}

// Render the barcode onto an off-screen canvas at a generous pixel size so it
// stays crisp when scaled down to label millimetres; `rotated` turns it 90°
// clockwise for the portrait page.
function barcodePng(value, rotated) {
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, String(value), { format: 'CODE128', displayValue: false, margin: 0, width: 4, height: 160 })
    if (!rotated) return canvas.toDataURL('image/png')
    const turned = document.createElement('canvas')
    turned.width = canvas.height
    turned.height = canvas.width
    const ctx = turned.getContext('2d')
    ctx.translate(turned.width, 0)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(canvas, 0, 0)
    return turned.toDataURL('image/png')
}

// Draws in the label's own 50 × 40 coordinates. On the portrait page a
// point (x, y) of the label lands at (40 − y, x): the label turned 90°
// clockwise, text running top to bottom.
function painter(doc, orientation) {
    if (orientation !== 'portrait') {
        return {
            rotated: false,
            text: (s, cx, y) => doc.text(s, cx, y, { align: 'center' }),
            image: (png, x, y, w, h) => doc.addImage(png, 'PNG', x, y, w, h)
        }
    }
    return {
        rotated: true,
        text: (s, cx, y) => doc.text(s, LABEL_H - y, cx - doc.getTextWidth(s) / 2, { angle: -90 }),
        image: (png, x, y, w, h) => doc.addImage(png, 'PNG', LABEL_H - (y + h), x, h, w)
    }
}

// ── The name on the label ───────────────────────────────────────────
// The product name without the item's Device Brand, and without the four
// words the team never wants on a label — iPhone, iPad, MacBook, Galaxy
// (user rule 2026-09-30, replacing an earlier brand-and-series rule): other
// series words (Note, Pixel, Reno…) stay. "Samsung Galaxy S20 Ultra
// Vibrator" → "S20 Ultra Vibrator", "iPhone 12 Pro Back Housing" → "12 Pro
// Back Housing", "OPPO Reno 6 LCD" → "Reno 6 LCD". Whole words, any case.
const ALWAYS_REMOVE = ['iPhone', 'iPad', 'MacBook', 'Galaxy']
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function labelName(name, terms) {
    const full = String(name || '').trim()
    if (!full) return full
    const words = [...ALWAYS_REMOVE]
    if (terms && terms.brand && terms.brand !== 'Other') words.push(terms.brand)
    let out = full
    for (const w of words.sort((a, b) => b.length - a.length)) {
        out = out.replace(new RegExp('(^|[^A-Za-z0-9])' + escRe(w) + '(?![A-Za-z0-9])', 'gi'), '$1')
    }
    out = out.replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/^[\s\-–—/,]+/, '').trim()
    return out || full
}
// The lines with their label names (`labelName`); the brand is looked up
// from the register by item id. A line without an item, or a failed
// lookup, loses only the four fixed words.
export async function withLabelNames(lines) {
    const list = lines || []
    const ids = [...new Set(list.map(l => l && l.itemId).filter(Boolean).map(String))]
    let terms = {}
    if (ids.length) {
        try {
            const r = await deviceTerms(ids)
            terms = (r && r.terms) || {}
        } catch (e) { /* brand stays in */ }
    }
    return list.map(l => ({ ...l, labelName: labelName(l.productName, terms[String(l.itemId)]) }))
}

// Draw one label onto the doc's CURRENT page. `pngCache` avoids re-rendering
// the same barcode for every copy of a multi-unit line.
function drawLabel(doc, line, pngCache, orientation) {
    const p = painter(doc, orientation)
    doc.setTextColor(0)
    const sku = String((line && line.sku) || '').trim()

    // The bottom half is anchored (barcode bottom and digits never move);
    // the name prints at 10pt and, when it needs more lines, the barcode
    // gives up height down to a minimum a scanner still reads — only then
    // does the font shrink. Without a SKU the name has the whole label.
    const BARCODE_BOTTOM = sku ? 32 : LABEL_H - MARGIN
    const BARCODE_MAX_H = 14
    const BARCODE_MIN_H = 8
    const DESC_TOP = 6.5
    const DESC_GAP = 2.4
    const lineH = (fs) => fs * 0.425

    const name = String((line && (line.labelName || line.productName)) || '').trim() || '—'
    doc.setFont('helvetica', 'bold')
    let fontSize = 10
    let lines
    for (;;) {
        doc.setFontSize(fontSize)
        lines = doc.splitTextToSize(name, LABEL_W - MARGIN * 2)
        const descBottom = DESC_TOP + (lines.length - 1) * lineH(fontSize)
        const room = BARCODE_BOTTOM - (descBottom + DESC_GAP)
        if ((sku ? room >= BARCODE_MIN_H : room >= 0) || fontSize <= 7) break
        fontSize -= 0.5
    }
    let descBottom = DESC_TOP + (lines.length - 1) * lineH(fontSize)
    while (lines.length > 1 && BARCODE_BOTTOM - (descBottom + DESC_GAP) < (sku ? BARCODE_MIN_H : 0)) {
        lines.pop()
        descBottom = DESC_TOP + (lines.length - 1) * lineH(fontSize)
    }
    let y = DESC_TOP
    for (const l of lines) {
        p.text(l, LABEL_W / 2, y)
        y += lineH(fontSize)
    }

    if (sku) {
        const key = sku + (p.rotated ? '|r' : '')
        const png = pngCache ? pngCache[key] || (pngCache[key] = barcodePng(sku, p.rotated)) : barcodePng(sku, p.rotated)
        const bw = LABEL_W - MARGIN * 2 - 2
        const barcodeTop = Math.max(descBottom + DESC_GAP, BARCODE_BOTTOM - BARCODE_MAX_H)
        p.image(png, (LABEL_W - bw) / 2, barcodeTop, bw, BARCODE_BOTTOM - barcodeTop)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        p.text(sku, LABEL_W / 2, LABEL_H - 3.2)
    }
}

// format sorts [min, max]; the orientation decides which side is the width.
function newLabelDoc(orientation) {
    return new jsPDF({ unit: 'mm', format: [LABEL_W, LABEL_H], orientation: orientation === 'portrait' ? 'portrait' : 'landscape' })
}
function addLabelPage(doc, orientation) {
    doc.addPage([LABEL_W, LABEL_H], orientation === 'portrait' ? 'portrait' : 'landscape')
}

// Shipped units on a shipment line; ordered units on an order-batch line.
const unitCount = (line) => {
    const q = line && line.shippedQty != null ? line.shippedQty : line && line.orderQty
    return Math.max(0, Math.floor(Number(q)) || 0)
}

// One line, `copies` identical labels (defaults to the shipped units, at least one).
export function buildSppLineLabelsPdf(line, copies, orientation = getLabelOrientation()) {
    const n = Math.max(1, Math.floor(Number(copies)) || unitCount(line) || 1)
    const doc = newLabelDoc(orientation)
    const pngCache = {}
    for (let i = 0; i < n; i++) {
        if (i > 0) addLabelPage(doc, orientation)
        drawLabel(doc, line, pngCache, orientation)
    }
    return doc
}

// Every line of the batch, one label per shipped unit. Null when there is
// nothing to print.
export function buildSppBatchLabelsPdf(batch, orientation = getLabelOrientation()) {
    const doc = newLabelDoc(orientation)
    const pngCache = {}
    let pages = 0
    for (const line of (batch && batch.lines) || []) {
        for (let i = 0; i < unitCount(line); i++) {
            if (pages > 0) addLabelPage(doc, orientation)
            pages++
            drawLabel(doc, line, pngCache, orientation)
        }
    }
    return pages ? doc : null
}

export function sppLabelCount(batch) {
    return ((batch && batch.lines) || []).reduce((s, l) => s + unitCount(l), 0)
}

export function sppLabelFileName(batch, line) {
    const clean = (s) => String(s || '').replace(/[^a-z0-9-]/gi, '').slice(0, 30)
    return line ? `labels_${clean(batch && batch.batchNo)}_${clean(line.sku) || 'item'}.pdf` : `labels_${clean(batch && batch.batchNo)}.pdf`
}
