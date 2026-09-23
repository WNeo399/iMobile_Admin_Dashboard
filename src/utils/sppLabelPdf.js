// 50mm × 40mm part label for Spare Parts Purchase shipment lines (Batches
// page, batch view). Same stock and layout family as the Order Dispatch item
// label (utils/dispatchItemLabelPdf.js), pared down to what the parts team
// asked for: the product name and the SKU (as a Code 128 barcode with the
// digits under it). No date, no batch number.
//
// buildSppLineLabelsPdf(line, copies)  — one line, `copies` identical labels
// buildSppBatchLabelsPdf(batch)        — every line, one label per unit (shipped,
//                                        or ordered on an order batch)
// sppLabelCount(batch)                 — how many labels that is
// `line` is a batch line ({ sku, productName, shippedQty }).

import { jsPDF } from 'jspdf'
import JsBarcode from 'jsbarcode'

const LABEL_W = 50
const LABEL_H = 40
const MARGIN = 3

// Render the barcode onto an off-screen canvas at a generous pixel size so it
// stays crisp when scaled down to label millimetres.
function barcodePng(value) {
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, String(value), { format: 'CODE128', displayValue: false, margin: 0, width: 4, height: 160 })
    return canvas.toDataURL('image/png')
}

// Draw one label onto the doc's CURRENT page. `pngCache` avoids re-rendering
// the same barcode for every copy of a multi-unit line.
function drawLabel(doc, line, pngCache) {
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

    const name = String((line && line.productName) || '').trim() || '—'
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
        doc.text(l, LABEL_W / 2, y, { align: 'center' })
        y += lineH(fontSize)
    }

    if (sku) {
        const png = pngCache ? pngCache[sku] || (pngCache[sku] = barcodePng(sku)) : barcodePng(sku)
        const bw = LABEL_W - MARGIN * 2 - 2
        const barcodeTop = Math.max(descBottom + DESC_GAP, BARCODE_BOTTOM - BARCODE_MAX_H)
        doc.addImage(png, 'PNG', (LABEL_W - bw) / 2, barcodeTop, bw, BARCODE_BOTTOM - barcodeTop)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.text(sku, LABEL_W / 2, LABEL_H - 3.2, { align: 'center' })
    }
}

function newLabelDoc() {
    // format sorts [min, max]; landscape makes the larger side the width.
    return new jsPDF({ unit: 'mm', format: [LABEL_W, LABEL_H], orientation: 'landscape' })
}

// Shipped units on a shipment line; ordered units on an order-batch line.
const unitCount = (line) => {
    const q = line && line.shippedQty != null ? line.shippedQty : line && line.orderQty
    return Math.max(0, Math.floor(Number(q)) || 0)
}

// One line, `copies` identical labels (defaults to the shipped units, at least one).
export function buildSppLineLabelsPdf(line, copies) {
    const n = Math.max(1, Math.floor(Number(copies)) || unitCount(line) || 1)
    const doc = newLabelDoc()
    const pngCache = {}
    for (let i = 0; i < n; i++) {
        if (i > 0) doc.addPage([LABEL_W, LABEL_H], 'landscape')
        drawLabel(doc, line, pngCache)
    }
    return doc
}

// Every line of the batch, one label per shipped unit. Null when there is
// nothing to print.
export function buildSppBatchLabelsPdf(batch) {
    const doc = newLabelDoc()
    const pngCache = {}
    let pages = 0
    for (const line of (batch && batch.lines) || []) {
        for (let i = 0; i < unitCount(line); i++) {
            if (pages > 0) doc.addPage([LABEL_W, LABEL_H], 'landscape')
            pages++
            drawLabel(doc, line, pngCache)
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
