// 50mm × 40mm item label for dispatch-batch lines (Order Dispatch page).
// Layout, top to bottom:
//   item description (10pt, wrapped; a long name borrows height from the
//   barcode before the font ever shrinks), Code 128 of the item barcode
//   with human-readable digits, and a footer with the PO number and the
//   dispatched date on one line.
//
// buildItemLabelPdf({ record, batch, line })  — one label
// buildBatchLabelsPdf({ record, batch })      — every line, × its qty
// `record` is the dispatch row ({ invoiceNumber }), `batch` one
// dispatchBatches entry ({ at, lines }), `line` one of its lines
// ({ sku, description, qty }).

import { jsPDF } from 'jspdf'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'

const LABEL_W = 50
const LABEL_H = 40
const MARGIN = 3

function fmtDate(d) {
    const x = new Date(d)
    if (isNaN(x.getTime())) return ''
    return x.toLocaleDateString('en-AU', {
        day: 'numeric', month: 'short', year: 'numeric',
        timeZone: 'Australia/Melbourne'
    })
}

// Render the barcode onto an off-screen canvas at a generous pixel size so it
// stays crisp when scaled down to label millimetres.
function barcodePng(value) {
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, String(value), {
        format: 'CODE128',
        displayValue: false,
        margin: 0,
        width: 4,
        height: 160
    })
    return canvas.toDataURL('image/png')
}

// Draw one label onto the doc's CURRENT page. `pngCache` avoids re-rendering
// the same barcode for every copy of a multi-qty line.
function drawLabel(doc, record, batch, line, pngCache) {
    doc.setTextColor(0)

    // ── Flexible layout ────────────────────────────────────────────
    // The bottom half is anchored (barcode bottom, digits, footer never
    // move); the description prints at 10pt and, when it needs an extra
    // line, the barcode gives up height to make room — down to a minimum
    // a handheld scanner still reads comfortably. Only when even the
    // minimum-height barcode can't fit the text does the font shrink.
    const BARCODE_BOTTOM = 30.5
    const BARCODE_MAX_H = 13
    const BARCODE_MIN_H = 8
    const DESC_TOP = 6      // first baseline
    const DESC_GAP = 2.2    // last baseline → barcode top
    const lineH = (fs) => fs * 0.425

    const desc = String((line && line.description) || '').trim() || '—'
    doc.setFont('helvetica', 'bold')
    let fontSize = 10
    let lines
    for (;;) {
        doc.setFontSize(fontSize)
        lines = doc.splitTextToSize(desc, LABEL_W - MARGIN * 2)
        const descBottom = DESC_TOP + (lines.length - 1) * lineH(fontSize)
        if (BARCODE_BOTTOM - (descBottom + DESC_GAP) >= BARCODE_MIN_H || fontSize <= 7) break
        fontSize -= 0.5
    }
    // Absurdly long text even at 7pt: drop trailing lines rather than
    // squeeze the barcode below scannable.
    let descBottom = DESC_TOP + (lines.length - 1) * lineH(fontSize)
    while (lines.length > 1 && BARCODE_BOTTOM - (descBottom + DESC_GAP) < BARCODE_MIN_H) {
        lines.pop()
        descBottom = DESC_TOP + (lines.length - 1) * lineH(fontSize)
    }
    let y = DESC_TOP
    for (const l of lines) {
        doc.text(l, LABEL_W / 2, y, { align: 'center' })
        y += lineH(fontSize)
    }

    // ── Barcode (bottom-anchored, height flexes with the text) ─────
    const value = String((line && line.sku) || '').trim()
    if (value) {
        const png = pngCache
            ? pngCache[value] || (pngCache[value] = barcodePng(value))
            : barcodePng(value)
        const bw = LABEL_W - MARGIN * 2 - 2
        const barcodeTop = Math.max(descBottom + DESC_GAP, BARCODE_BOTTOM - BARCODE_MAX_H)
        doc.addImage(png, 'PNG', (LABEL_W - bw) / 2, barcodeTop, bw, BARCODE_BOTTOM - barcodeTop)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.text(value, LABEL_W / 2, 33.4, { align: 'center' })
    }

    // ── Footer: PO number + dispatched date, one line ──────────────
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.text(String((record && record.invoiceNumber) || ''), MARGIN, LABEL_H - 2.5)
    doc.text(fmtDate(batch && batch.at), LABEL_W - MARGIN, LABEL_H - 2.5, { align: 'right' })
}

function newLabelDoc() {
    // format sorts [min, max]; landscape makes the larger side the width.
    return new jsPDF({ unit: 'mm', format: [LABEL_W, LABEL_H], orientation: 'landscape' })
}

export function buildItemLabelPdf({ record, batch, line }) {
    const doc = newLabelDoc()
    drawLabel(doc, record, batch, line)
    return doc
}

// One page per UNIT: a line with qty 5 gets 5 identical labels. Lines
// without a barcode are skipped (nothing to scan). Returns null when no
// line is printable.
export function buildBatchLabelsPdf({ record, batch }) {
    const doc = newLabelDoc()
    const pngCache = {}
    let pages = 0
    for (const line of (batch && batch.lines) || []) {
        if (!String((line && line.sku) || '').trim()) continue
        const copies = Math.floor(Number(line && line.qty)) || 0
        for (let i = 0; i < copies; i++) {
            if (pages > 0) doc.addPage([LABEL_W, LABEL_H], 'landscape')
            pages++
            drawLabel(doc, record, batch, line, pngCache)
        }
    }
    return pages ? doc : null
}

// Total labels buildBatchLabelsPdf would print — for the button caption.
export function batchLabelCount(batch) {
    return ((batch && batch.lines) || []).reduce(
        (s, l) =>
            s +
            (String((l && l.sku) || '').trim() ? Math.max(0, Math.floor(Number(l.qty)) || 0) : 0),
        0,
    )
}

// ════════════════════════════════════════════════════════════════════
// Oscar Mobile Pty Ltd — special customer. Each line item gets TWO
// 100mm × 50mm labels: a big item label (description, full-width
// barcode, code bottom-left) and a "Supplier Item Card" form the shop
// fills in by hand when a part comes back faulty. The card's return
// code is SS-<prefix>-<barcode>, where the prefix (typically a date
// like 310826) is typed when the dispatch list is uploaded and stored
// on the record as faultyCodePrefix.
// ════════════════════════════════════════════════════════════════════

const OSCAR_W = 100
const OSCAR_H = 50

export function isOscarCustomer(name) {
    return /oscar\s*mobile/i.test(String(name || ''))
}

export function oscarReturnCode(record, line) {
    const prefix = String((record && record.faultyCodePrefix) || '').trim()
    return `SS-${prefix}-${String((line && line.sku) || '').trim()}`
}

function newOscarDoc() {
    return new jsPDF({ unit: 'mm', format: [OSCAR_W, OSCAR_H], orientation: 'landscape' })
}

// Vector QR: draw the module bitmap as filled rects — crisp at any
// size, and synchronous (qrcode's canvas renderers are promise-based).
function drawQr(doc, text, x, y, size) {
    const qr = QRCode.create(String(text), { errorCorrectionLevel: 'M' })
    const n = qr.modules.size
    const data = qr.modules.data
    const cell = size / n
    doc.setFillColor(0, 0, 0)
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            if (data[r * n + c]) doc.rect(x + c * cell, y + r * cell, cell, cell, 'F')
        }
    }
}

// Label 1 — item label: description (monospace, shrink-to-fit one
// line), full-width barcode, human-readable code bottom-left.
function drawOscarItemLabel(doc, line, pngCache) {
    doc.setTextColor(0)
    const desc = String((line && line.description) || '').trim() || '—'
    doc.setFont('courier', 'bold')
    let fs = 14
    doc.setFontSize(fs)
    while (doc.getTextWidth(desc) > OSCAR_W - 6 && fs > 7) {
        fs -= 0.5
        doc.setFontSize(fs)
    }
    doc.text(desc, 3, 9)

    const value = String((line && line.sku) || '').trim()
    if (value) {
        const png = pngCache
            ? pngCache[value] || (pngCache[value] = barcodePng(value))
            : barcodePng(value)
        doc.addImage(png, 'PNG', 3, 12, OSCAR_W - 6, 28)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(12)
        doc.text(value, 3, 45.5)
    }
}

// Label 2 — "Supplier Item Card - Screen": tick-box form with a QR and
// barcode of the return code. Grid coordinates traced from the sample.
function drawOscarCardLabel(doc, returnCode, pngCache) {
    const L = 1.5
    const R = OSCAR_W - 1.5
    doc.setTextColor(0)
    doc.setDrawColor(0)
    doc.setLineWidth(0.35)

    // Header + top checkboxes
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Supplier Item Card - Screen', OSCAR_W / 2, 6, { align: 'center' })
    doc.setFontSize(11)
    for (const [x, label] of [[22, 'Faulty'], [45, 'Warranty'], [70, 'Damage']]) {
        doc.rect(x, 8.2, 3.4, 3.4)
        doc.text(label, x + 4.6, 11.1)
    }
    doc.line(L, 13.2, R, 13.2)

    // Left cell — "Faulty Detail"
    doc.line(13.5, 13.2, 13.5, 38.5)
    doc.setFontSize(10)
    doc.text('Faulty', 7.5, 24.3, { align: 'center' })
    doc.text('Detail', 7.5, 28.3, { align: 'center' })

    // Fault checklist
    doc.line(33.5, 13.2, 33.5, 38.5)
    doc.setFontSize(7.5)
    let y = 16.2
    for (const item of ['No Display', 'Lifting', 'Screw Holes', 'Touch Issue', 'LCD Issue', 'Frame Fit', 'HB Issue', 'Others']) {
        doc.rect(15.2, y - 2.1, 2.4, 2.4)
        doc.text(item, 18.8, y)
        y += 3.05
    }

    // Middle fields (hand-filled)
    doc.setFontSize(9)
    doc.text('Branch No.:', 35.5, 16.6)
    doc.text('Transfer out Date:', 58, 16.6)
    doc.line(34.5, 18.2, R, 18.2)
    doc.text('Technician Name:', 35.5, 22.8)
    doc.line(34.5, 24.4, 74.5, 24.4)
    doc.text('Repair Order No: C-', 35.5, 28.6)
    doc.line(34.5, 30.2, 74.5, 30.2)
    doc.text('Comment:', 35.5, 34.2)

    // QR of the return code
    drawQr(doc, returnCode, 77, 19.4, 18)

    // Bottom band — return code barcode. The band is taller than the
    // sample's so the barcode gets more bar height for hand scanners.
    doc.line(L, 38.5, R, 38.5)
    doc.line(13.5, 38.5, 13.5, 48.5)
    doc.setFontSize(10)
    doc.text('Return', 7.5, 42.8, { align: 'center' })
    doc.text('Code', 7.5, 46.8, { align: 'center' })
    const png = pngCache
        ? pngCache[returnCode] || (pngCache[returnCode] = barcodePng(returnCode))
        : barcodePng(returnCode)
    doc.addImage(png, 'PNG', 15.5, 39.5, 60, 6)
    doc.setFontSize(7)
    doc.text(returnCode, 15.5, 48.3)
}

// One line → its label pair (item label page + supplier card page).
export function buildOscarItemLabelsPdf({ record, line }) {
    const doc = newOscarDoc()
    drawOscarItemLabel(doc, line)
    doc.addPage([OSCAR_W, OSCAR_H], 'landscape')
    drawOscarCardLabel(doc, oscarReturnCode(record, line))
    return doc
}

// Whole batch: a pair per UNIT, pairs kept together so the bench can
// apply both to each part in turn. Barcode-less lines are skipped.
export function buildOscarBatchLabelsPdf({ record, batch }) {
    const doc = newOscarDoc()
    const pngCache = {}
    let pages = 0
    for (const line of (batch && batch.lines) || []) {
        if (!String((line && line.sku) || '').trim()) continue
        const copies = Math.floor(Number(line && line.qty)) || 0
        const code = oscarReturnCode(record, line)
        for (let i = 0; i < copies; i++) {
            if (pages > 0) doc.addPage([OSCAR_W, OSCAR_H], 'landscape')
            drawOscarItemLabel(doc, line, pngCache)
            doc.addPage([OSCAR_W, OSCAR_H], 'landscape')
            drawOscarCardLabel(doc, code, pngCache)
            pages += 2
        }
    }
    return pages ? doc : null
}

export function itemLabelFileName(record, line) {
    const clean = (s) => String(s || '').replace(/[^a-z0-9-]/gi, '').slice(0, 30)
    return `label_${clean(record && record.invoiceNumber)}_${clean((line && line.sku) || (line && line.imbSku))}.pdf`
}

export function batchLabelsFileName(record, batch) {
    const clean = (s) => String(s || '').replace(/[^a-z0-9-]/gi, '').slice(0, 30)
    return `labels_${clean(record && record.invoiceNumber)}_batch${(batch && batch.batchNo) || ''}.pdf`
}
