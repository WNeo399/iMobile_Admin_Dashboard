// 100mm × 150mm shipping label, one per Exyon accessory order (Dispatch →
// Process). Top to bottom (user 2026-10-08):
//   the order number as a Code 128 barcode (with the number under it),
//   the delivery address (name, company, street, suburb / state / postcode,
//   country, receiver's phone),
//   the items — name, SKU (our Zoho SKU, else Neto's), quantity,
//   the references (Customer Ref No.1 = order number, No.2 = channel) and
//   the tracking number.
// buildShippingLabelsPdf(labels) — `labels` as GET /exyon-accessories/labels.

import { jsPDF } from 'jspdf'
import JsBarcode from 'jsbarcode'

const W = 100
const H = 150
const M = 5            // side margin
const INNER = W - M * 2
const lineH = (pt) => pt * 0.42  // baseline step (mm) for a font size

const COUNTRY = { AU: 'AUSTRALIA', NZ: 'NEW ZEALAND' }

// the barcode drawn big on a canvas, so it stays crisp scaled to millimetres
function barcodePng(value) {
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, String(value), { format: 'CODE128', displayValue: false, margin: 0, width: 4, height: 160 })
    return canvas.toDataURL('image/png')
}

// the largest font size (down to `min`) at which `text` fits `width` on one line
function fitSize(doc, text, width, max, min) {
    let pt = max
    doc.setFontSize(pt)
    while (pt > min && doc.getTextWidth(text) > width) {
        pt -= 0.5
        doc.setFontSize(pt)
    }
    return pt
}

function rule(doc, y) {
    doc.setDrawColor(0)
    doc.setLineWidth(0.3)
    doc.line(M, y, W - M, y)
}

function drawLabel(doc, l) {
    doc.setTextColor(0)

    // ── 1. the order number, as a barcode ──
    let y = M
    if (l.orderId) doc.addImage(barcodePng(l.orderId), 'PNG', M + 4, y, INNER - 8, 18)
    y += 18 + 5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text(String(l.orderId || ''), W / 2, y, { align: 'center' })
    y += 3
    rule(doc, y)

    // ── 2. the delivery address ──
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Delivery Address:', M, y)
    y += lineH(9) + 1.5
    const a = l.address
    if (a) {
        const lines = []
        if (a.name) lines.push({ text: a.name.toUpperCase(), pt: 13, bold: true })
        if (a.company) lines.push({ text: a.company.toUpperCase(), pt: 11 })
        if (a.street1) lines.push({ text: a.street1.toUpperCase(), pt: 11 })
        if (a.street2) lines.push({ text: a.street2.toUpperCase(), pt: 11 })
        const place = [a.city, [a.state, a.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
        if (place) lines.push({ text: place.toUpperCase(), pt: 11 })
        if (a.country) lines.push({ text: COUNTRY[a.country.toUpperCase()] || a.country.toUpperCase(), pt: 11 })
        for (const ln of lines) {
            doc.setFont('helvetica', ln.bold ? 'bold' : 'normal')
            const pt = fitSize(doc, ln.text, INNER, ln.pt, 8)
            y += lineH(pt) - lineH(9) + 1.2
            doc.text(ln.text, M, y)
            y += lineH(9)
        }
        if (a.phone) {
            y += 1.5
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(9)
            doc.text(`Receiver's Phone: ${a.phone}`, M, y)
            y += lineH(9)
        }
    } else {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(10)
        doc.text('Address not found in Neto', M, y + 2)
        y += lineH(10) + 2
    }
    y += 1.5
    rule(doc, y)

    // ── 4. (drawn first, bottom-anchored) the references + tracking number ──
    const refTop = H - M - 21
    rule(doc, refTop)
    doc.setFontSize(9)
    let ry = refTop + 5
    const pair = (label, value) => {
        doc.setFont('helvetica', 'normal')
        doc.text(label, M, ry)
        doc.setFont('helvetica', 'bold')
        doc.text(String(value || '—'), M + 33, ry)
        ry += lineH(9) + 1.2
    }
    pair('Customer Ref No.1:', l.orderId)
    pair('Customer Ref No.2:', l.ref2 || l.channel)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('Tracking Number:', M, ry)
    ry += lineH(11) + 0.5
    doc.setFont('helvetica', 'bold')
    const trk = String(l.tracking || '—')
    fitSize(doc, trk, INNER, 11, 6)
    doc.text(trk, M, ry)

    // ── 3. the items, between the address and the references ──
    const SKU_X = W - M - 30
    const QTY_X = W - M
    const NAME_W = SKU_X - M - 3
    y += 4.5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('Item', M, y)
    doc.text('SKU', SKU_X, y)
    doc.text('Qty', QTY_X, y, { align: 'right' })
    y += 1.5
    doc.setLineWidth(0.15)
    doc.line(M, y, W - M, y)
    const items = l.items || []
    const room = refTop - 2   // the items stop above the references
    let pt = 9
    // shrink the item text if the list would run into the references
    const heightAt = (size) => {
        doc.setFontSize(size)
        return items.reduce((h, it) => h + doc.splitTextToSize(String(it.name || '—'), NAME_W).length * lineH(size) + 1.6, 0)
    }
    while (pt > 6.5 && y + 3 + heightAt(pt) > room) pt -= 0.5
    doc.setFontSize(pt)
    let shown = 0
    for (const it of items) {
        doc.setFont('helvetica', 'normal')
        const nameLines = doc.splitTextToSize(String(it.name || '—'), NAME_W)
        const h = nameLines.length * lineH(pt) + 1.6
        if (y + 3 + h > room) break
        y += lineH(pt) + 0.6
        doc.text(nameLines, M, y)
        doc.setFont('helvetica', 'bold')
        const sku = String(it.zohoSku || it.sku || '—')
        fitSize(doc, sku, QTY_X - 7 - SKU_X, pt, 6)
        doc.text(sku, SKU_X, y)
        doc.setFontSize(pt + 1)
        doc.text(String(it.quantity || 0), QTY_X, y, { align: 'right' })
        doc.setFontSize(pt)
        y += (nameLines.length - 1) * lineH(pt) + 1
        shown++
    }
    if (shown < items.length) {
        doc.setFont('helvetica', 'italic')
        doc.text(`+ ${items.length - shown} more item${items.length - shown === 1 ? '' : 's'}`, M, Math.min(y + lineH(pt) + 0.6, room))
    }
}

export function buildShippingLabelsPdf(labels) {
    const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'portrait' })
    ;(labels || []).forEach((l, i) => {
        if (i > 0) doc.addPage([W, H], 'portrait')
        drawLabel(doc, l)
    })
    return doc
}

export function shippingLabelsFileName(labels) {
    const list = labels || []
    const one = list.length === 1 ? String(list[0].orderId || '').replace(/[^\w.-]+/g, '_') : `${list.length}-orders`
    return `labels_${one}.pdf`
}
