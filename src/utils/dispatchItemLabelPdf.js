// Item label for dispatch-batch lines (Order Dispatch page): 50mm × 40mm,
// or 100mm × 50mm for Best Sourcing (user ask 2026-11-05).
// Layout, top to bottom:
//   item description (wrapped; a long name borrows height from the
//   barcode before the font ever shrinks), Code 128 of the item barcode
//   with human-readable digits, and a footer with the PO number and the
//   dispatched date on one line.
//
// buildItemLabelPdf({ record, batch, line })  — one label
// buildBatchLabelsPdf({ record, batch })      — every line, × its qty
// `record` is the dispatch row ({ invoiceNumber, customerName }), `batch`
// one dispatchBatches entry ({ at, lines }), `line` one of its lines
// ({ sku, description, qty }). The record's customer picks the size.

import { jsPDF } from 'jspdf'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'

// Sizes in mm; baselines (descTop, digitsY, footY) from the label's top.
// The barcode's bottom is fixed and its height flexes between barMin and
// barMax with the description.
const SMALL = {
    w: 50, h: 40, margin: 3,
    font: 10, minFont: 7, descTop: 6, descGap: 2.2,
    barW: 42, barBottom: 30.5, barMax: 13, barMin: 8,
    digitsFs: 7, digitsY: 33.4, footFs: 6.5, footY: 37.5
}
const LARGE = {
    w: 100, h: 50, margin: 4,
    font: 14, minFont: 9, descTop: 8, descGap: 2.5,
    barW: 80, barBottom: 38, barMax: 22, barMin: 12,
    digitsFs: 10, digitsY: 42, footFs: 9, footY: 47
}

export function isBestSourcingCustomer(name) {
    return /best\s*sourc/i.test(String(name || '')) // "Best Sourcing Pty Ltd" / "BEST SOURCING"
}

// The label size for a dispatch record's customer.
export function dispatchLabelLayout(record) {
    return isBestSourcingCustomer(record && record.customerName) ? LARGE : SMALL
}

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

// Draw one label onto the doc's CURRENT page, `L` its layout (SMALL /
// LARGE). `pngCache` avoids re-rendering the same barcode for every copy
// of a multi-qty line.
function drawLabel(doc, record, batch, line, pngCache, L = SMALL) {
    doc.setTextColor(0)

    // ── Flexible layout ────────────────────────────────────────────
    // The bottom half is anchored (barcode bottom, digits, footer never
    // move); the description prints at the full font and, when it needs
    // an extra line, the barcode gives up height to make room — down to a
    // minimum a handheld scanner still reads comfortably. Only when even
    // the minimum-height barcode can't fit the text does the font shrink.
    const lineH = (fs) => fs * 0.425

    const desc = String((line && line.description) || '').trim() || '—'
    doc.setFont('helvetica', 'bold')
    let fontSize = L.font
    let lines
    for (;;) {
        doc.setFontSize(fontSize)
        lines = doc.splitTextToSize(desc, L.w - L.margin * 2)
        const descBottom = L.descTop + (lines.length - 1) * lineH(fontSize)
        if (L.barBottom - (descBottom + L.descGap) >= L.barMin || fontSize <= L.minFont) break
        fontSize -= 0.5
    }
    // Absurdly long text even at the smallest font: drop trailing lines
    // rather than squeeze the barcode below scannable.
    let descBottom = L.descTop + (lines.length - 1) * lineH(fontSize)
    while (lines.length > 1 && L.barBottom - (descBottom + L.descGap) < L.barMin) {
        lines.pop()
        descBottom = L.descTop + (lines.length - 1) * lineH(fontSize)
    }
    let y = L.descTop
    for (const l of lines) {
        doc.text(l, L.w / 2, y, { align: 'center' })
        y += lineH(fontSize)
    }

    // ── Barcode (bottom-anchored, height flexes with the text) ─────
    const value = String((line && line.sku) || '').trim()
    if (value) {
        const png = pngCache
            ? pngCache[value] || (pngCache[value] = barcodePng(value))
            : barcodePng(value)
        const barcodeTop = Math.max(descBottom + L.descGap, L.barBottom - L.barMax)
        doc.addImage(png, 'PNG', (L.w - L.barW) / 2, barcodeTop, L.barW, L.barBottom - barcodeTop)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(L.digitsFs)
        doc.text(value, L.w / 2, L.digitsY, { align: 'center' })
    }

    // ── Footer: PO number + dispatched date, one line ──────────────
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(L.footFs)
    doc.text(String((record && record.invoiceNumber) || ''), L.margin, L.footY)
    doc.text(fmtDate(batch && batch.at), L.w - L.margin, L.footY, { align: 'right' })
}

function newLabelDoc(L = SMALL) {
    // format sorts [min, max]; landscape makes the larger side the width.
    return new jsPDF({ unit: 'mm', format: [L.w, L.h], orientation: 'landscape' })
}

export function buildItemLabelPdf({ record, batch, line }) {
    const L = dispatchLabelLayout(record)
    const doc = newLabelDoc(L)
    drawLabel(doc, record, batch, line, null, L)
    return doc
}

// One page per UNIT: a line with qty 5 gets 5 identical labels. Lines
// without a barcode are skipped (nothing to scan). Returns null when no
// line is printable.
export function buildBatchLabelsPdf({ record, batch }) {
    const L = dispatchLabelLayout(record)
    const doc = newLabelDoc(L)
    const pngCache = {}
    let pages = 0
    for (const line of (batch && batch.lines) || []) {
        if (!String((line && line.sku) || '').trim()) continue
        const copies = Math.floor(Number(line && line.qty)) || 0
        for (let i = 0; i < copies; i++) {
            if (pages > 0) doc.addPage([L.w, L.h], 'landscape')
            pages++
            drawLabel(doc, record, batch, line, pngCache, L)
        }
    }
    return pages ? doc : null
}

// The same label onto an existing jsPDF doc (or a new one when `doc` is
// null), `units` copies — the Spare Parts Purchase pages print it for a
// line ordered for a customer other than Oscar (Best Sourcing, 2026-10-19):
// the customer's description and barcode, their PO number and the date.
// `record.customerName` picks the size, as on Order Dispatch.
export function appendDispatchLabelsToDoc(doc, { record, batch, line }, units = 1) {
    const L = dispatchLabelLayout(record)
    const pngCache = {}
    for (let u = 0; u < Math.max(1, Math.floor(Number(units)) || 1); u++) {
        if (!doc) doc = newLabelDoc(L)
        else doc.addPage([L.w, L.h], 'landscape')
        drawLabel(doc, record, batch, line, pngCache, L)
    }
    return doc
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
// barcode of the return code. Grid traced from the sample, then (user
// 2026-10-27) the header, the Faulty Detail checklist and the hand-filled
// fields shrunk — smaller fonts, tighter rows — so the return-code band
// gets about 17 mm and the barcode 12.6 mm of bar height (was 6).
function drawOscarCardLabel(doc, returnCode, pngCache) {
    const L = 1.5
    const R = OSCAR_W - 1.5
    const HEAD = 9.8 // header rule
    const BAND = 31 // top of the return-code band
    doc.setTextColor(0)
    doc.setDrawColor(0)
    doc.setLineWidth(0.35)

    // Header + top checkboxes
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Supplier Item Card - Screen', OSCAR_W / 2, 4.4, { align: 'center' })
    doc.setFontSize(9)
    for (const [x, label] of [[24, 'Faulty'], [46, 'Warranty'], [70, 'Damage']]) {
        doc.rect(x, 5.9, 2.6, 2.6)
        doc.text(label, x + 3.6, 8.2)
    }
    doc.line(L, HEAD, R, HEAD)

    // Left cell — "Faulty Detail"
    doc.line(13.5, HEAD, 13.5, BAND)
    doc.setFontSize(8)
    doc.text('Faulty', 7.5, 19.5, { align: 'center' })
    doc.text('Detail', 7.5, 22.6, { align: 'center' })

    // Fault checklist
    doc.line(33.5, HEAD, 33.5, BAND)
    doc.setFontSize(6)
    let y = 12.1
    for (const item of ['No Display', 'Lifting', 'Screw Holes', 'Touch Issue', 'LCD Issue', 'Frame Fit', 'HB Issue', 'Others']) {
        doc.rect(14.8, y - 1.6, 1.9, 1.9)
        doc.text(item, 17.6, y)
        y += 2.5
    }

    // Middle fields (hand-filled)
    doc.setFontSize(7)
    doc.text('Branch No.:', 35.2, 12.6)
    doc.text('Transfer out Date:', 57, 12.6)
    doc.line(34.2, 14, R, 14)
    doc.text('Technician Name:', 35.2, 18.4)
    doc.line(34.2, 19.8, 79, 19.8)
    doc.text('Repair Order No: C-', 35.2, 24)
    doc.line(34.2, 25.4, 79, 25.4)
    doc.text('Comment:', 35.2, 29.4)

    // QR of the return code
    drawQr(doc, returnCode, 81.5, 15.2, 15)

    // Bottom band — return code barcode, as tall as the band allows for
    // hand scanners.
    doc.line(L, BAND, R, BAND)
    doc.line(13.5, BAND, 13.5, 48.5)
    doc.setFontSize(8)
    doc.text('Return', 7.5, 39, { align: 'center' })
    doc.text('Code', 7.5, 42.1, { align: 'center' })
    const png = pngCache
        ? pngCache[returnCode] || (pngCache[returnCode] = barcodePng(returnCode))
        : barcodePng(returnCode)
    doc.addImage(png, 'PNG', 15.5, 32.2, 81, 12.6)
    doc.setFontSize(7)
    doc.text(returnCode, 15.5, 47.5)
}

// One line → its label set: TWO copies of the item barcode label (one
// for the box, one for the device) plus one supplier card.
export function buildOscarItemLabelsPdf({ record, line }) {
    const doc = newOscarDoc()
    const pngCache = {}
    drawOscarItemLabel(doc, line, pngCache)
    doc.addPage([OSCAR_W, OSCAR_H], 'landscape')
    drawOscarItemLabel(doc, line, pngCache)
    doc.addPage([OSCAR_W, OSCAR_H], 'landscape')
    drawOscarCardLabel(doc, oscarReturnCode(record, line), pngCache)
    return doc
}

// Whole batch, barcode labels only: TWO per unit (box + device), the
// same set the per-line print gives. Printed as its own run so the
// bench can feed one label stock without card pages interleaved.
export function buildOscarBarcodeLabelsPdf({ batch }) {
    const doc = newOscarDoc()
    const pngCache = {}
    let pages = 0
    for (const line of (batch && batch.lines) || []) {
        if (!String((line && line.sku) || '').trim()) continue
        const copies = (Math.floor(Number(line && line.qty)) || 0) * 2
        for (let i = 0; i < copies; i++) {
            if (pages > 0) doc.addPage([OSCAR_W, OSCAR_H], 'landscape')
            drawOscarItemLabel(doc, line, pngCache)
            pages++
        }
    }
    return pages ? doc : null
}

// Whole batch, supplier cards only: one per unit.
export function buildOscarCardLabelsPdf({ record, batch }) {
    const doc = newOscarDoc()
    const pngCache = {}
    let pages = 0
    for (const line of (batch && batch.lines) || []) {
        if (!String((line && line.sku) || '').trim()) continue
        const copies = Math.floor(Number(line && line.qty)) || 0
        const code = oscarReturnCode(record, line)
        for (let i = 0; i < copies; i++) {
            if (pages > 0) doc.addPage([OSCAR_W, OSCAR_H], 'landscape')
            drawOscarCardLabel(doc, code, pngCache)
            pages++
        }
    }
    return pages ? doc : null
}

// Oscar's label set onto an existing jsPDF doc (or a new one when `doc` is
// null), one set per unit: item label ×2 and, once the record carries the
// return-code prefix, the supplier card. The Spare Parts Purchase pages
// use it for lines ordered for Oscar Mobile (2026-10-14).
export function appendOscarLabelsToDoc(doc, { record, line }, units = 1) {
    const pngCache = {}
    const hasPrefix = !!String((record && record.faultyCodePrefix) || '').trim()
    const page = () => { if (!doc) doc = newOscarDoc(); else doc.addPage([OSCAR_W, OSCAR_H], 'landscape') }
    for (let u = 0; u < Math.max(1, Math.floor(Number(units)) || 1); u++) {
        page(); drawOscarItemLabel(doc, line, pngCache)
        page(); drawOscarItemLabel(doc, line, pngCache)
        if (hasPrefix) { page(); drawOscarCardLabel(doc, oscarReturnCode(record, line), pngCache) }
    }
    return doc
}

export function itemLabelFileName(record, line) {
    const clean = (s) => String(s || '').replace(/[^a-z0-9-]/gi, '').slice(0, 30)
    return `label_${clean(record && record.invoiceNumber)}_${clean((line && line.sku) || (line && line.imbSku))}.pdf`
}

export function batchLabelsFileName(record, batch) {
    const clean = (s) => String(s || '').replace(/[^a-z0-9-]/gi, '').slice(0, 30)
    return `labels_${clean(record && record.invoiceNumber)}_batch${(batch && batch.batchNo) || ''}.pdf`
}
