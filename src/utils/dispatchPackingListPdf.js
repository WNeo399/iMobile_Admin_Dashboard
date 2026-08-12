// Warehouse packing list for one dispatch batch (Order Dispatch page).
// A4 portrait, plain monochrome layout built for printing at the pack
// bench. buildPackingListPdf({ record, batch }) where `record` is the
// dispatch row ({ invoiceNumber, customerName?, recordType }) and `batch`
// is one dispatchBatches entry ({ batchNo, at, by, units, lines }).

import { jsPDF } from 'jspdf'

const PAGE_W = 596
const PAGE_H = 842
const MARGIN = 48
const DARK = 40
const GREY = 130

function fmtDate(d) {
    const x = new Date(d)
    if (isNaN(x.getTime())) return ''
    return x.toLocaleString('en-AU', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        timeZone: 'Australia/Melbourne'
    })
}

// Column x-positions (left edges; Qty right-aligned to the table's right edge)
const COL = {
    idx: MARGIN,
    sku: MARGIN + 30,
    barcode: MARGIN + 140,
    desc: MARGIN + 250,
    qtyRight: PAGE_W - MARGIN
}
const DESC_W = COL.qtyRight - 46 - COL.desc

export function buildPackingListPdf({ record, batch }) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })

    const header = (pageNo) => {
        doc.setTextColor(DARK)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(20)
        doc.text('PACKING LIST', MARGIN, 64)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(GREY)
        doc.text(`Page ${pageNo}`, COL.qtyRight, 64, { align: 'right' })

        doc.setTextColor(DARK)
        doc.setFontSize(11)
        let y = 92
        const pair = (label, value) => {
            doc.setTextColor(GREY)
            doc.text(label, MARGIN, y)
            doc.setTextColor(DARK)
            doc.setFont('helvetica', 'bold')
            doc.text(String(value || '—'), MARGIN + 90, y)
            doc.setFont('helvetica', 'normal')
            y += 18
        }
        pair('Invoice #', record.invoiceNumber)
        pair('Batch', `#${batch.batchNo}`)
        pair('Date', fmtDate(batch.at))
        if (batch.tracking) pair('Tracking #', batch.tracking)
        if (record.recordType !== 'manual' && record.customerName) {
            pair('Customer', record.customerName)
        }
        if (batch.by) pair('Picked by', batch.by)

        // table header
        y += 8
        doc.setFontSize(10)
        doc.setTextColor(GREY)
        doc.text('#', COL.idx, y)
        doc.text('iMobile SKU', COL.sku, y)
        doc.text('Barcode', COL.barcode, y)
        doc.text('Description', COL.desc, y)
        doc.text('Qty', COL.qtyRight, y, { align: 'right' })
        y += 6
        doc.setDrawColor(180)
        doc.line(MARGIN, y, COL.qtyRight, y)
        return y + 16
    }

    let page = 1
    let y = header(page)
    doc.setFontSize(10)

    const lines = batch.lines || []
    lines.forEach((l, i) => {
        const descLines = doc.splitTextToSize(l.description || '—', DESC_W)
        const rowH = Math.max(16, descLines.length * 12 + 4)
        if (y + rowH > PAGE_H - 90) {
            doc.addPage()
            page++
            y = header(page)
            doc.setFontSize(10)
        }
        doc.setTextColor(GREY)
        doc.text(String(i + 1), COL.idx, y)
        doc.setTextColor(DARK)
        doc.setFont('helvetica', 'bold')
        doc.text(l.imbSku || '—', COL.sku, y)
        doc.setFont('helvetica', 'normal')
        doc.text(l.sku || '—', COL.barcode, y)
        doc.text(descLines, COL.desc, y)
        doc.setFont('helvetica', 'bold')
        doc.text(String(l.qty), COL.qtyRight, y, { align: 'right' })
        doc.setFont('helvetica', 'normal')
        y += rowH
    })

    // total
    y += 4
    doc.setDrawColor(180)
    doc.line(MARGIN, y, COL.qtyRight, y)
    y += 18
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(`Total units: ${batch.units != null ? batch.units : lines.reduce((s, l) => s + (Number(l.qty) || 0), 0)}`, COL.qtyRight, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')

    return doc
}

export function packingListFileName(record, batch) {
    const inv = String(record.invoiceNumber || 'dispatch').replace(/[^\w.-]+/g, '_')
    return `packing-list_${inv}_batch${batch.batchNo}.pdf`
}

// ── Remaining items ─────────────────────────────────────────────────
// Everything still to dispatch on one record — same bench-friendly A4
// layout as the packing list, with ordered / sent / remaining per line.
// buildRemainingListPdf({ record, lines }) where lines carry
// { imbSku, sku, description, ordered, dispatched, remaining }.

const RCOL = {
    idx: MARGIN,
    sku: MARGIN + 26,
    barcode: MARGIN + 126,
    desc: MARGIN + 224,
    ordered: PAGE_W - MARGIN - 120,
    dispatched: PAGE_W - MARGIN - 62,
    remaining: PAGE_W - MARGIN
}
const RDESC_W = RCOL.ordered - 54 - RCOL.desc

export function buildRemainingListPdf({ record, lines }) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })

    const header = (pageNo) => {
        doc.setTextColor(DARK)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(20)
        doc.text('REMAINING ITEMS', MARGIN, 64)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(GREY)
        doc.text(`Page ${pageNo}`, RCOL.remaining, 64, { align: 'right' })

        doc.setTextColor(DARK)
        doc.setFontSize(11)
        let y = 92
        const pair = (label, value) => {
            doc.setTextColor(GREY)
            doc.text(label, MARGIN, y)
            doc.setTextColor(DARK)
            doc.setFont('helvetica', 'bold')
            doc.text(String(value || '—'), MARGIN + 90, y)
            doc.setFont('helvetica', 'normal')
            y += 18
        }
        pair('Order', record.invoiceNumber)
        if (record.customerName) pair('Customer', record.customerName)
        pair('Printed', fmtDate(new Date()))

        // table header
        y += 8
        doc.setFontSize(10)
        doc.setTextColor(GREY)
        doc.text('#', RCOL.idx, y)
        doc.text('iMobile SKU', RCOL.sku, y)
        doc.text('Barcode', RCOL.barcode, y)
        doc.text('Description', RCOL.desc, y)
        doc.text('Ordered', RCOL.ordered, y, { align: 'right' })
        doc.text('Sent', RCOL.dispatched, y, { align: 'right' })
        doc.text('Left', RCOL.remaining, y, { align: 'right' })
        y += 6
        doc.setDrawColor(180)
        doc.line(MARGIN, y, RCOL.remaining, y)
        return y + 16
    }

    let page = 1
    let y = header(page)
    doc.setFontSize(10)

    ;(lines || []).forEach((l, i) => {
        const descLines = doc.splitTextToSize(l.description || '—', RDESC_W)
        const rowH = Math.max(16, descLines.length * 12 + 4)
        if (y + rowH > PAGE_H - 90) {
            doc.addPage()
            page++
            y = header(page)
            doc.setFontSize(10)
        }
        doc.setTextColor(GREY)
        doc.text(String(i + 1), RCOL.idx, y)
        doc.setTextColor(DARK)
        doc.setFont('helvetica', 'bold')
        doc.text(l.imbSku || '—', RCOL.sku, y)
        doc.setFont('helvetica', 'normal')
        doc.text(l.sku || '—', RCOL.barcode, y)
        doc.text(descLines, RCOL.desc, y)
        doc.text(String(l.ordered), RCOL.ordered, y, { align: 'right' })
        doc.text(String(l.dispatched), RCOL.dispatched, y, { align: 'right' })
        doc.setFont('helvetica', 'bold')
        doc.text(String(l.remaining), RCOL.remaining, y, { align: 'right' })
        doc.setFont('helvetica', 'normal')
        y += rowH
    })

    // total
    y += 4
    doc.setDrawColor(180)
    doc.line(MARGIN, y, RCOL.remaining, y)
    y += 18
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    const totalLeft = (lines || []).reduce((s, l) => s + (Number(l.remaining) || 0), 0)
    doc.text(`Units remaining: ${totalLeft}`, RCOL.remaining, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')

    return doc
}

export function remainingListFileName(record) {
    const inv = String(record.invoiceNumber || 'dispatch').replace(/[^\w.-]+/g, '_')
    return `remaining-items_${inv}.pdf`
}
