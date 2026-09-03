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

export function itemLabelFileName(record, line) {
    const clean = (s) => String(s || '').replace(/[^a-z0-9-]/gi, '').slice(0, 30)
    return `label_${clean(record && record.invoiceNumber)}_${clean((line && line.sku) || (line && line.imbSku))}.pdf`
}

export function batchLabelsFileName(record, batch) {
    const clean = (s) => String(s || '').replace(/[^a-z0-9-]/gi, '').slice(0, 30)
    return `labels_${clean(record && record.invoiceNumber)}_batch${(batch && batch.batchNo) || ''}.pdf`
}
