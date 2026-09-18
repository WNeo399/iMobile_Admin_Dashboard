// Printable product-label PDF for the Tools → Barcode Generator.
//
// One label per page at 89mm × 36mm (landscape label stock):
//
//   iPhone 16 Pro Max (6.9 Inch) Compatible LCD      ← name, up to 3 lines
//   (Soft OLED) Touch Digitizer Screen [JK+]
//   Wholesale Price                        ▛▀▀▜ ▄▛▀▀▜
//   $160.00                                ▌▐█ ▀▄ ▌▐█  ← QR code right
//   Retail Price                           ▙▄▄▟ █▀▙▄▄▟
//   $199.00                                   21280
//
// Prices are optional — toggled off, the QR code centres on the label.

import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'

const PAGE = [89, 36] // mm — label stock size
const MARGIN = 3.5    // top margin (mm)
const MARGIN_X = 5    // left/right padding (mm)
const QR_BOTTOM = 30.8 // QR stops here; the SKU text sits under it at y=34

// Vector QR: the module bitmap drawn as filled rects — crisp at any size,
// and synchronous (qrcode's canvas renderers are promise-based).
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

        // ── Bottom zone: prices LEFT, QR code RIGHT (centred with no prices) ──
        const zoneTop = Math.max(y + 0.8, 13.5)
        const qrSize = QR_BOTTOM - zoneTop
        const qrX = prices.length ? PAGE[0] - MARGIN_X - qrSize : (PAGE[0] - qrSize) / 2

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
            const sku = String(label.sku)
            drawQr(doc, sku, qrX, zoneTop, qrSize)
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(7)
            // Centred under the QR, but a SKU wider than the QR is pulled
            // back so it never runs off the right edge of the label.
            const half = doc.getTextWidth(sku) / 2
            const cx = Math.min(qrX + qrSize / 2, PAGE[0] - MARGIN_X - half)
            doc.text(sku, cx, 34, { align: 'center' })
        }
    })

    return doc
}
