// 60mm × 40mm (or 50mm × 40mm) part label for Spare Parts Purchase lines (Batches
// page, batch view). Same stock and layout family as the Order Dispatch item
// label (utils/dispatchItemLabelPdf.js), pared down to what the parts team
// asked for: the product name and the SKU (as a Code 128 barcode with the
// digits under it), plus the print date as a three-character code in the
// bottom-right corner (labelDateCode). No batch number.
//
// buildSppLineLabelsPdf(line, copies, orientation, size)  — one line, `copies` identical labels
// buildSppBatchLabelsPdf(batch, orientation, size)        — every line, one label per unit
//                                                     (shipped, or ordered on an order batch)
// sppLabelCount(batch)                               — how many labels that is
// `line` is a batch line ({ sku, productName, shippedQty }).
//
// Orientation (user ask 2026-09-30, "allow for switching"): "landscape" is
// the 50 × 40 page; "portrait" a 40 × 50 page carrying the SAME label turned
// 90° clockwise — for a printer whose label stock is set up the other way.
// The choice is remembered per browser; portrait by default.
//
// Size (user ask 2026-09-30): 60 × 40 (default) or 50 × 40 — the width
// changes, the layout follows it (text and barcode use the full width).
// 40 × 30 two across (user ask 2026-10-05, the 40*30*2500*2 roll): a page is
// one row of the roll — two labels side by side with a 2 mm gap (82 × 30) —
// and the layout is scaled down to the 30 mm height. Labels fill the row in
// order; a lone last label leaves the right one blank — except a single
// label (Purchase Order), which fills the row with itself so no label is
// wasted. Portrait turns the whole row, as it turns a single label.
// The 40 × 30 label carries a QR code instead of the barcode (the paper is
// too small for a readable barcode, user 2026-10-05): the name across the
// full width at the top (at most 3 lines), the QR (the SKU) bottom-left as
// large as the room under it allows, the SKU digits large beside it, the
// date code bottom-right.

import { jsPDF } from 'jspdf'
import { deviceTerms } from '@/api/sparePartsPurchase'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'

// The barcode layout (the 40-high sizes): name start / sizes, barcode band, bottom row.
const LAYOUTS = {
    40: { margin: 3, descTop: 6.5, nameFont: 10, minFont: 7, bottomRow: 3.2, barcodeGap: 8, barcodeMax: 14, barcodeMin: 8, smallFont: 8, minSmall: 6 }
}
const ACROSS_GAP = 2 // mm between the labels of a two-across row

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

// ── Size ────────────────────────────────────────────────────────────
const SIZE_KEY = 'spp-label-size'
export const LABEL_SIZES = [
    { key: '60x40', w: 60, h: 40, across: 1, label: '60 × 40' },
    { key: '50x40', w: 50, h: 40, across: 1, label: '50 × 40' },
    { key: '40x30x2', w: 40, h: 30, across: 2, qr: true, label: '40 × 30 (2 across)' }
]
export function getLabelSize() {
    try {
        const v = localStorage.getItem(SIZE_KEY)
        if (LABEL_SIZES.some(s => s.key === v)) return v
    } catch (e) { /* private mode: the default */ }
    return '60x40'
}
export function setLabelSize(v) {
    if (!LABEL_SIZES.some(s => s.key === v)) return
    try { localStorage.setItem(SIZE_KEY, v) } catch (e) { /* not remembered */ }
}
const sizeOf = (size) => LABEL_SIZES.find(s => s.key === size) || LABEL_SIZES[0]
// labels printed side by side on one page with this size (1 for the 40-high sizes)
export const labelsAcross = (size) => sizeOf(size).across

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

// Draws in the label's own W × H coordinates; `ox` is where the label starts
// across the row (the second of a two-across row starts at W + gap). On the
// portrait page a point (X, y) of the row lands at (H − y, X): the row turned
// 90° clockwise, text running top to bottom.
function painter(doc, orientation, H, ox = 0) {
    if (orientation !== 'portrait') {
        return {
            rotated: false,
            text: (s, x, y, align = 'center') => doc.text(s, ox + x, y, { align }),
            image: (png, x, y, w, h) => doc.addImage(png, 'PNG', ox + x, y, w, h)
        }
    }
    return {
        rotated: true,
        text: (s, x, y, align = 'center') => doc.text(s, H - y, ox + x - (align === 'center' ? doc.getTextWidth(s) / 2 : align === 'right' ? doc.getTextWidth(s) : 0), { angle: -90 }),
        image: (png, x, y, w, h) => doc.addImage(png, 'PNG', H - (y + h), ox + x, h, w)
    }
}

// The SKU as a QR code PNG (black modules on white, no quiet zone — the
// label's margin is the quiet zone), drawn module by module so it stays
// synchronous; 10 px a module keeps it crisp at label size.
function qrPng(value) {
    const qr = QRCode.create(String(value), { errorCorrectionLevel: 'M' })
    const n = qr.modules.size
    const px = 10
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = n * px
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#000'
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            if (qr.modules.data[r * n + c]) ctx.fillRect(c * px, r * px, px, px)
        }
    }
    return canvas.toDataURL('image/png')
}

// ── Date code ───────────────────────────────────────────────────────
// The day the label is printed, in the team's year / month / day code
// (user rule 2026-10-01, 年月份代码): year 2023 A, 2024 B … 2028 F, one
// letter a year from there; month January A … December L; day 1–6 as the
// digit, 7 A … 20 N, then 21 P … 31 Z (no O — it reads as a zero).
// 1 Oct 2026 → "DJ1", 21 Mar 2027 → "ECP".
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DAY_CODES = [...'123456', ...'ABCDEFGHIJKLMN', ...'PQRSTUVWXYZ']
export function labelDateCode(date = new Date()) {
    const y = date.getFullYear() - 2023
    if (y < 0 || y >= LETTERS.length) return ''
    return LETTERS[y] + LETTERS[date.getMonth()] + DAY_CODES[date.getDate() - 1]
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

// Draw one label onto the doc's CURRENT page, `col` labels across the row.
// `pngCache` avoids re-rendering the same barcode for every copy of a
// multi-unit line.
function drawLabel(doc, line, pngCache, orientation, size, dateCode, col = 0) {
    if (sizeOf(size).qr) return drawQrLabel(doc, line, pngCache, orientation, size, dateCode, col)
    const { w: W, h: H } = sizeOf(size)
    const L = LAYOUTS[H]
    const MARGIN = L.margin
    const p = painter(doc, orientation, H, col * (W + ACROSS_GAP))
    doc.setTextColor(0)
    const sku = String((line && line.sku) || '').trim()
    const BOTTOM_ROW = H - L.bottomRow // baseline of the SKU digits and the date code

    // The bottom half is anchored (barcode bottom and digits never move);
    // the name prints at its full size and, when it needs more lines, the
    // barcode gives up height down to a minimum a scanner still reads — only
    // then does the font shrink. Without a SKU the name has the whole label.
    const BARCODE_BOTTOM = sku ? H - L.barcodeGap : dateCode ? BOTTOM_ROW - 3.5 : H - MARGIN
    const BARCODE_MAX_H = L.barcodeMax
    const BARCODE_MIN_H = L.barcodeMin
    const DESC_TOP = L.descTop
    const DESC_GAP = H >= 40 ? 2.4 : 1.6
    const lineH = (fs) => fs * 0.425

    const name = String((line && (line.labelName || line.productName)) || '').trim() || '—'
    doc.setFont('helvetica', 'bold')
    let fontSize = L.nameFont
    let lines
    for (;;) {
        doc.setFontSize(fontSize)
        lines = doc.splitTextToSize(name, W - MARGIN * 2)
        const descBottom = DESC_TOP + (lines.length - 1) * lineH(fontSize)
        const room = BARCODE_BOTTOM - (descBottom + DESC_GAP)
        if ((sku ? room >= BARCODE_MIN_H : room >= 0) || fontSize <= L.minFont) break
        fontSize -= 0.5
    }
    let descBottom = DESC_TOP + (lines.length - 1) * lineH(fontSize)
    while (lines.length > 1 && BARCODE_BOTTOM - (descBottom + DESC_GAP) < (sku ? BARCODE_MIN_H : 0)) {
        lines.pop()
        descBottom = DESC_TOP + (lines.length - 1) * lineH(fontSize)
    }
    let y = DESC_TOP
    for (const l of lines) {
        p.text(l, W / 2, y)
        y += lineH(fontSize)
    }

    if (sku) {
        const key = sku + (p.rotated ? '|r' : '')
        const png = pngCache ? pngCache[key] || (pngCache[key] = barcodePng(sku, p.rotated)) : barcodePng(sku, p.rotated)
        const bw = W - MARGIN * 2 - 2
        const barcodeTop = Math.max(descBottom + DESC_GAP, BARCODE_BOTTOM - BARCODE_MAX_H)
        p.image(png, (W - bw) / 2, barcodeTop, bw, BARCODE_BOTTOM - barcodeTop)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(L.smallFont)
        // centred, so the digits may run up to the date code on both sides;
        // a long SKU shrinks rather than reach the corner
        const dateW = dateCode ? doc.getTextWidth(dateCode) + 1.5 : 0
        let skuSize = L.smallFont
        while (skuSize > L.minSmall && doc.getTextWidth(sku) > W - 2 * (MARGIN + dateW)) {
            skuSize -= 0.5
            doc.setFontSize(skuSize)
        }
        p.text(sku, W / 2, BOTTOM_ROW)
    }

    if (dateCode) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(L.smallFont)
        p.text(dateCode, W - MARGIN - doc.getTextWidth(dateCode) / 2, BOTTOM_ROW)
    }
}

// The small label: the name bold and centred across the full width (up to
// three lines — it shrinks first, and only a name that still doesn't fit is
// cut with "…"), the QR bottom-left filling the height left under it (up
// to 17 mm), the SKU digits large and bold beside the QR, the date code in
// the bottom-right corner. Without a SKU the name has the whole label.
function drawQrLabel(doc, line, pngCache, orientation, size, dateCode, col) {
    const { w: W, h: H } = sizeOf(size)
    const M = 1.8
    const QR_MAX = 17
    const p = painter(doc, orientation, H, col * (W + ACROSS_GAP))
    doc.setTextColor(0)
    const sku = String((line && line.sku) || '').trim()
    const name = String((line && (line.labelName || line.productName)) || '').trim() || '—'
    const maxLines = sku ? 3 : 6
    const lineH = (fs) => fs * 0.4
    const nameW = W - M * 2

    // the name: shrink until it fits in the allowed lines, then cut
    doc.setFont('helvetica', 'bold')
    let fontSize = 8
    let lines
    for (;;) {
        doc.setFontSize(fontSize)
        lines = doc.splitTextToSize(name, nameW)
        if (lines.length <= maxLines || fontSize <= 6) break
        fontSize -= 0.5
    }
    if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines)
        let last = lines[lines.length - 1]
        while (last.length > 1 && doc.getTextWidth(last + '…') > nameW) last = last.slice(0, -1)
        lines[lines.length - 1] = last.replace(/[\s,;:–-]+$/, '') + '…'
    }
    const top = M + fontSize * 0.33 // first baseline: the cap height under the margin
    let y = top
    for (const l of lines) {
        p.text(l, W / 2, y)
        y += lineH(fontSize)
    }
    const nameBottom = top + (lines.length - 1) * lineH(fontSize) + fontSize * 0.12 // under the descenders

    if (sku) {
        // the QR fills the height under the name, flush with the bottom margin
        const qs = Math.min(QR_MAX, H - M - (nameBottom + 1.2))
        const qy = H - M - qs
        const key = 'qr|' + sku
        const png = pngCache ? pngCache[key] || (pngCache[key] = qrPng(sku)) : qrPng(sku)
        p.image(png, M, qy, qs, qs)

        // the SKU digits, as large as fit beside the QR, in the band above
        // the date code's row
        const x0 = M + qs + 1.6
        const x1 = W - M
        doc.setFont('helvetica', 'bold')
        let skuSize = 11
        doc.setFontSize(skuSize)
        while (skuSize > 5.5 && doc.getTextWidth(sku) > x1 - x0) {
            skuSize -= 0.5
            doc.setFontSize(skuSize)
        }
        const bandBottom = dateCode ? H - 4.6 : H - M
        p.text(sku, (x0 + x1) / 2, (qy + bandBottom) / 2 + skuSize * 0.15)
    }

    if (dateCode) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        p.text(dateCode, W - M, H - 2, 'right')
    }
}

// A page is one row: one label, or two side by side. format sorts
// [min, max]; the orientation decides which side is the width.
function pageSize(size) {
    const { w, h, across } = sizeOf(size)
    return [across * w + (across - 1) * ACROSS_GAP, h]
}
function newLabelDoc(orientation, size) {
    return new jsPDF({ unit: 'mm', format: pageSize(size), orientation: orientation === 'portrait' ? 'portrait' : 'landscape' })
}
function addLabelPage(doc, orientation, size) {
    doc.addPage(pageSize(size), orientation === 'portrait' ? 'portrait' : 'landscape')
}
// Lays the labels out in order, `across` to a page.
function layLabels(lines, orientation, size) {
    if (!lines.length) return null
    const across = labelsAcross(size)
    const doc = newLabelDoc(orientation, size)
    const pngCache = {}
    const dateCode = labelDateCode()
    lines.forEach((line, i) => {
        if (i > 0 && i % across === 0) addLabelPage(doc, orientation, size)
        drawLabel(doc, line, pngCache, orientation, size, dateCode, i % across)
    })
    return doc
}

// Shipped units on a shipment line; ordered units on an order-batch line.
const unitCount = (line) => {
    const q = line && line.shippedQty != null ? line.shippedQty : line && line.orderQty
    return Math.max(0, Math.floor(Number(q)) || 0)
}

// One line, `copies` identical labels (defaults to the shipped units, at
// least one). Asked for exactly one (Purchase Order — the copies come from
// the printer dialog), a two-across size fills the row with it.
export function buildSppLineLabelsPdf(line, copies, orientation = getLabelOrientation(), size = getLabelSize()) {
    let n = Math.max(1, Math.floor(Number(copies)) || unitCount(line) || 1)
    if (Math.floor(Number(copies)) === 1) n = labelsAcross(size)
    return layLabels(Array.from({ length: n }, () => line), orientation, size)
}

// Every line of the batch, one label per shipped unit, in order. Null when
// there is nothing to print.
export function buildSppBatchLabelsPdf(batch, orientation = getLabelOrientation(), size = getLabelSize()) {
    const all = []
    for (const line of (batch && batch.lines) || []) {
        for (let i = 0; i < unitCount(line); i++) all.push(line)
    }
    return layLabels(all, orientation, size)
}

export function sppLabelCount(batch) {
    return ((batch && batch.lines) || []).reduce((s, l) => s + unitCount(l), 0)
}

export function sppLabelFileName(batch, line) {
    const clean = (s) => String(s || '').replace(/[^a-z0-9-]/gi, '').slice(0, 30)
    return line ? `labels_${clean(batch && batch.batchNo)}_${clean(line.sku) || 'item'}.pdf` : `labels_${clean(batch && batch.batchNo)}.pdf`
}
