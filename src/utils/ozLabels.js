// Printable job-label PDF for the Create Oz Order tool.
//
// One label per page at 150mm × 50mm (landscape), laid out like the
// warehouse's printed labels:
//
//                                        Dates: 12/06/2026
//   Job Number: 1-2
//   Device: Apple iPhone 17
//   Color: Silver
//   Parts: Back Glass
//
// `labels` is an array of { jobNumber, device, color, parts, date }.
// Returns the jsPDF doc so the caller can both .save() it (download)
// and .output('blob') it (attach to the Zoho sales order).

import { jsPDF } from 'jspdf'

const PAGE = [150, 50] // mm — label stock size
const LEFT = 8         // left margin (mm)

export function buildOzLabelDoc(labels) {
    const list = Array.isArray(labels) ? labels : []
    const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: PAGE })
    if (list.length === 0) {
        // Empty doc still valid — caller shouldn't reach here, but don't
        // produce a corrupt 0-page PDF.
        doc.setFontSize(12)
        doc.text('No labels', LEFT, 25)
        return doc
    }
    list.forEach((lab, i) => {
        if (i > 0) doc.addPage(PAGE, 'l')
        drawLabel(doc, lab || {})
    })
    return doc
}

function drawLabel(doc, lab) {
    // Date — small, top-right.
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`Dates: ${lab.date || ''}`, PAGE[0] - LEFT, 9, { align: 'right' })

    // Four labelled fields down the label.
    doc.setFontSize(13)
    field(doc, 'Job Number:', lab.jobNumber, LEFT, 19)
    field(doc, 'Device:', lab.device, LEFT, 28)
    field(doc, 'Color:', lab.color, LEFT, 37)
    field(doc, 'Parts:', lab.parts, LEFT, 46)
}

// Draw "Label: value" with a bold label and normal value. jsPDF can't
// mix weights in one text() call, so we measure the bold label width
// and place the value right after it.
function field(doc, label, value, x, y) {
    doc.setFont('helvetica', 'bold')
    doc.text(label, x, y)
    const w = doc.getTextWidth(label)
    doc.setFont('helvetica', 'normal')
    const v = value == null ? '' : String(value)
    doc.text(` ${v}`, x + w, y)
}
