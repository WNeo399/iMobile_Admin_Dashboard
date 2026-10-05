// Part labels for Spare Parts Purchase lines (Purchase Order, Order Batches,
// Batches): the SKU as a QR code, the product name, the SKU digits, and the
// print date as a three-character code in the bottom-right corner
// (labelDateCode). No batch number. Every size uses the same layout, scaled
// to the label (QR on every size since 2026-10-05 — it replaced the Code 128
// barcode), stacked and centred (user asks 2026-10-05): the QR at the top as
// large as the room allows, the name bold under it (at most 3 lines), the SKU
// digits bold at the bottom, the date code bottom-right on the SKU's row.
//
// buildSppLineLabelsPdf(line, copies, orientation, size)  — one line, `copies` identical labels
// buildSppBatchLabelsPdf(batch, orientation, size)        — every line, one label per unit
//                                                     (shipped, or ordered on an order batch)
// sppLabelCount(batch)                               — how many labels that is
// `line` is a batch line ({ sku, productName, shippedQty }).
//
// Orientation (user ask 2026-09-30, "allow for switching"): "landscape" is
// the label's own page; "portrait" turns the page 90° clockwise — for a
// printer whose label stock is set up the other way. The choice is
// remembered per browser; portrait by default.
//
// Size: 60 × 40 (default) or 50 × 40 (user ask 2026-09-30), or 40 × 30 two
// across (user ask 2026-10-05, the 40*30*2500*2 roll): a page is then one row
// of the roll — two labels side by side with a 2 mm gap (82 × 30). Labels
// fill the row in order; a lone last label leaves the right one blank —
// except a single label (Purchase Order), which fills the row with itself so
// no label is wasted. Portrait turns the whole row, as it turns a single label.

import { jsPDF } from 'jspdf'
import { deviceTerms } from '@/api/sparePartsPurchase'
import QRCode from 'qrcode'

// The layout per label height: margin, name size / lines, QR size range,
// the gap between the stacked parts, SKU size, date code size.
const LAYOUTS = {
    40: { margin: 3, nameFont: 10, minFont: 7, maxLines: 3, qrMax: 22, qrMin: 13, gap: 1.2, skuFont: 9, minSku: 6, dateFont: 8, dateBase: 2.6 },
    30: { margin: 1.8, nameFont: 8, minFont: 6, maxLines: 3, qrMax: 17, qrMin: 10, gap: 0.9, skuFont: 7, minSku: 5, dateFont: 7, dateBase: 2 }
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
    { key: '40x30x2', w: 40, h: 30, across: 2, label: '40 × 30 (2 across)' }
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
// labels printed side by side on one page with this size (2 for 40 × 30)
export const labelsAcross = (size) => sizeOf(size).across

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

// Draw one label onto the doc's CURRENT page, `col` labels across the row,
// stacked and centred: the QR at the top as large as the room allows, the
// name bold across the full width under it (up to three lines — it shrinks
// first, and only a name that still doesn't fit is cut with "…"), the SKU
// digits bold at the bottom, the date code in the bottom-right corner on the
// SKU's row. Without a SKU the name has the whole label. `pngCache` keeps
// one QR per SKU for every copy of a multi-unit line.
function drawLabel(doc, line, pngCache, orientation, size, dateCode, col = 0) {
    const { w: W, h: H } = sizeOf(size)
    const L = LAYOUTS[H] || LAYOUTS[40]
    const M = L.margin
    const p = painter(doc, orientation, H, col * (W + ACROSS_GAP))
    doc.setTextColor(0)
    const sku = String((line && line.sku) || '').trim()
    const name = String((line && (line.labelName || line.productName)) || '').replace(/\s+/g, ' ').trim() || '—'
    const maxLines = sku ? L.maxLines : 6
    const lineH = (fs) => fs * 0.4
    const nameW = W - M * 2
    const nameH = (fs, n) => fs * 0.45 + (n - 1) * lineH(fs) // cap top to the last line's descenders

    // the SKU first — the QR gets the height left above the name. It shares
    // the date code's row (same baseline), so it keeps clear of the code on
    // both sides (it stays centred).
    let skuSize = L.skuFont
    let skuCap = 0
    const skuBase = dateCode ? H - L.dateBase : H - M
    if (sku) {
        let dateW = 0
        if (dateCode) {
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(L.dateFont)
            dateW = doc.getTextWidth(dateCode) + L.gap
        }
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(skuSize)
        while (skuSize > L.minSku && doc.getTextWidth(sku) > nameW - dateW * 2) {
            skuSize -= 0.5
            doc.setFontSize(skuSize)
        }
        skuCap = skuSize * 0.253 // the digits' height in mm
    }
    const qrRoom = (fs, n) => skuBase - skuCap - L.gap * 2 - nameH(fs, n) - M

    // the name: shrink until it fits the allowed lines and leaves the QR its
    // minimum size, then cut
    doc.setFont('helvetica', 'bold')
    let fontSize = L.nameFont
    let lines
    for (;;) {
        doc.setFontSize(fontSize)
        lines = doc.splitTextToSize(name, nameW)
        const fits = lines.length <= maxLines && (!sku || qrRoom(fontSize, lines.length) >= L.qrMin)
        if (fits || fontSize <= L.minFont) break
        fontSize -= 0.5
    }
    let keep = Math.min(lines.length, maxLines)
    while (sku && keep > 1 && qrRoom(fontSize, keep) < L.qrMin) keep--
    if (lines.length > keep) {
        lines = lines.slice(0, keep)
        let last = lines[keep - 1]
        while (last.length > 1 && doc.getTextWidth(last + '…') > nameW) last = last.slice(0, -1)
        lines[keep - 1] = last.replace(/[\s,;:–-]+$/, '') + '…'
    }

    // the QR at the top margin; the name centred in the height between the
    // QR and the SKU (at the top margin without a SKU)
    let nameTop = M
    if (sku) {
        const room = qrRoom(fontSize, lines.length)
        const qs = Math.min(L.qrMax, room)
        const key = 'qr|' + sku
        const png = pngCache ? pngCache[key] || (pngCache[key] = qrPng(sku)) : qrPng(sku)
        p.image(png, (W - qs) / 2, M, qs, qs)
        nameTop = M + qs + L.gap + (room - qs) / 2
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(skuSize)
        p.text(sku, W / 2, skuBase)
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(fontSize)
    let y = nameTop + fontSize * 0.33 // first baseline: the cap height under the top
    for (const l of lines) {
        p.text(l, W / 2, y)
        y += lineH(fontSize)
    }

    if (dateCode) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(L.dateFont)
        p.text(dateCode, W - M, H - L.dateBase, 'right')
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
