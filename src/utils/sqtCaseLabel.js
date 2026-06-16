// "URGENT!" case label for the SQT Send Parts flow.
//
// 100mm (w) × 150mm (h) portrait page, single label. The content is
// rotated 90° (reads bottom-to-top) to match the printed label the
// shop uses — URGENT! header, shop name, Case ID, Service ID, inside
// a border box.
//
// Returns the jsPDF doc so the caller can both attach it to the Zoho
// sales order (.output('blob')) and preview it (.output('bloburl')).

import { jsPDF } from 'jspdf'

const PAGE = [100, 150] // mm — label stock (portrait)
const CENTER_Y = PAGE[1] / 2 // 75mm — vertical midline the rotated text centres on

export function buildCaseLabelDoc({ shopName, caseId, serviceRequestId } = {}) {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: PAGE })

    // Border box framing the text (cosmetic, matches the printed label).
    doc.setLineWidth(0.6)
    doc.rect(12, 26, 76, 98)

    // Columns laid out right-to-left across the page width; because the
    // text is rotated 90° CCW, the right-most column (highest x) prints
    // at the TOP when the label is turned upright. So URGENT! sits
    // highest, Service ID lowest. align:center + baseline:middle let us
    // anchor each line by its centre at (x, CENTER_Y) so the block is
    // vertically centred without measuring text widths.
    rotatedLine(doc, 'URGENT!', 72, 38, true)
    rotatedLine(doc, shopName || '', 54, 15, true)
    rotatedLine(doc, `Case ID: ${caseId || ''}`, 44, 15, true)
    rotatedLine(doc, `Service ID: ${serviceRequestId || ''}`, 34, 15, true)

    return doc
}

function rotatedLine(doc, text, x, size, bold) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.text(String(text == null ? '' : text), x, CENTER_Y, {
        angle: 90,
        align: 'center',
        baseline: 'middle'
    })
}
