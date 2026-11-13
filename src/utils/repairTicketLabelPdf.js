// Repair ticket label, 50mm × 40mm — the iMobile Repair shop portal's
// "Print label" (user 2026-11-13: "enable print 50*40 label in the portal").
// The same content as RepairDesk's own ticket label (0-35592 sample):
//   Apple iPhone 12                          (bold)
//   Other Issue: Earspeaker is not working.  (bold — the repair)
//   IMEI:357848536805768                     (bold; Serial: when no IMEI)
//   the fault, when the repair line doesn't already say it
//   ||||| Code 128 of the ticket number ||||| (as RepairDesk's: "0-35592")
//   Repair Ticket # 0-35592
//   SAM Star Phone    +61 433 731 710
// RepairDesk prints all that in the top half at 6pt; here it fills the label:
// the text block shrinks (then drops the fault line) before the barcode goes
// below a scannable height.
//
// buildRepairLabelsPdf(labels) — one page per label (GET /repair/portal/tickets/:id/label)

import { jsPDF } from 'jspdf'
import JsBarcode from 'jsbarcode'

const W = 50
const H = 40
const M = 2 // side margin
// top / bottom margins widened ~1.2 mm each (user 2026-11-13: "a bit more
// margin on the top and bottom"): was TOP 1.2, bar bottom 32, lines at 35.2 / 38.6
const TOP = 2.4 // above the first line's ascent
const PT = 0.3528 // mm per point
const BAR_W = 34
const BAR_BOTTOM = 30.8
const BAR_MAX = 10
const BAR_MIN = 6
const GAP = 1.2 // text block → barcode
const TICKET_Y = 34 // "Repair Ticket # …" baseline
const WHO_Y = 37.4 // the customer + mobile baseline (≈2 mm clear of the bottom edge)

function barcodePng(value) {
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, String(value), { format: 'CODE128', displayValue: false, margin: 0, width: 4, height: 160 })
    return canvas.toDataURL('image/png')
}

// the label's top lines: [{ text, size (pt), bold, maxLines }]
function blocksOf(label, withFault) {
    const code = label.imei ? `IMEI:${label.imei}` : label.serial ? `Serial:${label.serial}` : ''
    return [
        { text: label.title, size: 10, bold: true, maxLines: 2 },
        { text: label.repair, size: 8.5, bold: true, maxLines: 3 },
        { text: code, size: 8.5, bold: true, maxLines: 1 },
        withFault ? { text: label.fault, size: 8, bold: false, maxLines: 2 } : null
    ].filter(b => b && String(b.text || '').trim())
}

// lines of each block at a scale; a block over its maxLines ends with "…"
function layout(doc, blocks, scale) {
    let h = 0
    const out = blocks.map(b => {
        const size = b.size * scale
        doc.setFont('helvetica', b.bold ? 'bold' : 'normal')
        doc.setFontSize(size)
        let lines = doc.splitTextToSize(String(b.text).replace(/\s+/g, ' ').trim(), W - M * 2)
        if (lines.length > b.maxLines) {
            lines = lines.slice(0, b.maxLines)
            let last = lines[lines.length - 1]
            while (last.length > 1 && doc.getTextWidth(last + '…') > W - M * 2) last = last.slice(0, -1)
            lines[lines.length - 1] = last.replace(/\s+$/, '') + '…'
        }
        const lh = size * PT * 1.18
        h += lines.length * lh
        return { ...b, size, lines, lh }
    })
    return { out, h }
}

function drawLabel(doc, label) {
    doc.setTextColor(0)
    // the text block: full size, else smaller, else without the fault line
    const room = BAR_BOTTOM - BAR_MIN - GAP - TOP
    let fit = null
    for (const withFault of [true, false]) {
        for (let scale = 1; scale >= 0.7 - 1e-9; scale -= 0.05) {
            const l = layout(doc, blocksOf(label, withFault), scale)
            if (l.h <= room) { fit = l; break }
        }
        if (fit) break
    }
    if (!fit) fit = layout(doc, blocksOf(label, false), 0.7)

    let y = TOP
    for (const b of fit.out) {
        doc.setFont('helvetica', b.bold ? 'bold' : 'normal')
        doc.setFontSize(b.size)
        for (const line of b.lines) {
            y += b.lh
            doc.text(line, W / 2, y - b.lh * 0.22, { align: 'center' })
        }
    }

    // Code 128 of the ticket number, bottom-anchored, as tall as the text allows
    const number = String(label.ticketNumber || '')
    if (number) {
        const top = Math.max(y + GAP, BAR_BOTTOM - BAR_MAX)
        doc.addImage(barcodePng(number), 'PNG', (W - BAR_W) / 2, top, BAR_W, BAR_BOTTOM - top)
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(`Repair Ticket # ${number}`, W / 2, TICKET_Y, { align: 'center' })
    // the customer + mobile, one line (shrinks to fit)
    const who = [label.customer, label.phone].filter(Boolean).join('    ')
    let fs = 7.5
    doc.setFontSize(fs)
    while (doc.getTextWidth(who) > W - M * 2 && fs > 5) { fs -= 0.25; doc.setFontSize(fs) }
    doc.text(who, W / 2, WHO_Y, { align: 'center' })
}

export function buildRepairLabelsPdf(labels) {
    const list = (labels || []).filter(Boolean)
    if (!list.length) return null
    // format sorts [min, max]; landscape makes the larger side the width
    const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'landscape' })
    list.forEach((label, i) => {
        if (i) doc.addPage([W, H], 'landscape')
        drawLabel(doc, label)
    })
    return doc
}

export function repairLabelFileName(labels) {
    const no = String(((labels || [])[0] || {}).ticketNumber || 'ticket').replace(/[^a-z0-9-]/gi, '')
    return `label_${no}.pdf`
}
