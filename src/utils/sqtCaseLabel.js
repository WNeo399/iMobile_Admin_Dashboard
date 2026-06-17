// "URGENT!" case label for the SQT Send Parts flow.
//
// 100mm (w) × 150mm (h) portrait page, single label. Content is
// rotated 90° (reads bottom-to-top). URGENT! sits in the LEFT-most
// column of the PDF (= the top of the label once it's turned upright),
// then shop name / Case ID / Service ID to its right, inside a border
// box.
//
// jsPDF's `align`/`baseline` options are NOT honoured together with
// `angle`, so we centre each rotated line manually: measure its width
// and anchor it at CENTER_Y + width/2 (angle-90 text is drawn from the
// anchor upward, so anchoring at the bottom centres it on the midline).
//
// Returns the jsPDF doc so the caller can both attach it to the Zoho
// sales order (.output('blob')) and preview it (.output('bloburl')).

import { jsPDF } from 'jspdf'

const PAGE = [100, 150]            // mm — label stock (portrait)
const CENTER_Y = PAGE[1] / 2       // 75mm — vertical midline
const MAX_LINE_MM = 132            // shrink a line that would overflow the height

export function buildCaseLabelDoc({ shopName, caseId, serviceRequestId } = {}) {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: PAGE })

    // Columns by anchor-x, left → right (URGENT! lowest x = left of the
    // PDF = top when the label is upright). Sizes in pt. Positions
    // chosen so the block centres on the 50mm page midline.
    const lines = [
        { text: 'URGENT!', x: 39, size: 34 },
        { text: shopName || '', x: 51, size: 13 },
        { text: `Case ID: ${caseId || ''}`, x: 61, size: 13 },
        { text: `Service ID: ${serviceRequestId || ''}`, x: 71, size: 13 }
    ]

    // Border box framing the columns, centred on the page (x 23–77).
    doc.setLineWidth(0.6)
    doc.rect(23, 32, 54, 86)

    doc.setFont('helvetica', 'bold')
    for (const ln of lines) {
        let size = ln.size
        doc.setFontSize(size)
        let w = doc.getTextWidth(ln.text)
        // Auto-shrink an over-long line (e.g. a long shop name) so it
        // stays within the label height.
        while (w > MAX_LINE_MM && size > 8) {
            size -= 1
            doc.setFontSize(size)
            w = doc.getTextWidth(ln.text)
        }
        // angle-90 text draws upward from the anchor, so anchor at the
        // bottom (CENTER_Y + w/2) to centre it on the midline.
        doc.text(String(ln.text == null ? '' : ln.text), ln.x, CENTER_Y + w / 2, { angle: 90 })
    }
    return doc
}
