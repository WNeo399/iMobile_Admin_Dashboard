// Printable product-label PDF for the Tools → Barcode Generator.
//
// One label per page at 89mm × 36mm (landscape label stock):
//
//   iPhone 16 Pro Max (6.9 Inch) Compatible LCD      ← name, up to 3 lines
//   (Soft OLED) Touch Digitizer Screen [JK+]
//   Retail Price          ▌██▌█▌██▌▌█▌██▌▌█▌▌██▌█▌▌██  ← barcode right
//   $199.00               ▌██▌█▌██▌▌█▌██▌▌█▌▌██▌█▌▌██
//   Wholesale Price                21280
//   $160.00
//
// Prices are optional — toggled off, the barcode widens to use the space.

import { jsPDF } from 'jspdf'
import JsBarcode from 'jsbarcode'

const PAGE = [89, 36] // mm — label stock size
const MARGIN = 3.5    // top margin (mm)
const MARGIN_X = 5    // left/right padding (mm)

// CODE128 barcode of `value` as a PNG data URL (high-res canvas so it stays
// crisp when placed into the PDF).
function barcodePng(value) {
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, String(value), {
        format: 'CODE128',
        displayValue: false,
        margin: 0,
        width: 4,      // px per module on the canvas — scaled down in the PDF
        height: 120
    })
    return canvas.toDataURL('image/png')
}

function money(n) {
    return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// labels: array of { name, sku, sellingPrice?, platinumPrice? } — a page each.
// sellingPrice prints as "Retail Price", platinumPrice as "Wholesale Price".
// Returns the jsPDF doc (caller calls .save() / .output() / .autoPrint()).
export function buildBarcodeLabelDoc(labels) {
    const list = Array.isArray(labels) ? labels : [labels]
    const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: PAGE })

    list.forEach((label, idx) => {
        if (idx > 0) doc.addPage(PAGE, 'l')
        const width = PAGE[0] - MARGIN_X * 2
        const prices = []
        // Wholesale (platinum) sits ABOVE retail on the label.
        if (label.platinumPrice != null && label.platinumPrice !== '') {
            prices.push({ label: 'Wholesale Price', value: money(label.platinumPrice) })
        }
        if (label.sellingPrice != null && label.sellingPrice !== '') {
            prices.push({ label: 'Retail Price', value: money(label.sellingPrice) })
        }

        // ── Product name — up to 3 lines across the top ──
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.5)
        const lines = doc.splitTextToSize(String(label.name || ''), width).slice(0, 3)
        let y = MARGIN + 2.6
        lines.forEach(line => { doc.text(line, MARGIN_X, y); y += 3.1 })

        // ── Bottom zone: prices LEFT, barcode RIGHT ──
        const zoneTop = Math.max(y + 0.8, 13.5)
        const priceW = prices.length ? 30 : 0
        const barcodeW = width - priceW - (priceW ? 2 : 0)
        const barcodeX = MARGIN_X + priceW + (priceW ? 2 : 0)
        const barcodeH = 30.5 - zoneTop // leave ~3.5mm under for the SKU text

        if (prices.length) {
            // Stack the price blocks, vertically centred in the zone.
            const blockH = 7.4
            let py = zoneTop + ((34 - zoneTop) - prices.length * blockH) / 2 + 2.2
            prices.forEach(p => {
                doc.setFont('helvetica', 'normal')
                doc.setFontSize(6.5)
                doc.text(p.label, MARGIN_X, py)
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(11.5)
                doc.text(p.value, MARGIN_X, py + 4.4)
                py += blockH
            })
        }

        if (label.sku) {
            doc.addImage(barcodePng(label.sku), 'PNG', barcodeX, zoneTop, barcodeW, barcodeH)
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(7)
            doc.text(String(label.sku), barcodeX + barcodeW / 2, 34, { align: 'center' })
        }
    })

    return doc
}
