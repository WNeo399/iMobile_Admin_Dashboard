// Printable device list for one sales return (Sales Return page).
//
// A4 portrait, plain monochrome, the same bench layout as the repair and
// supply lists: who sent the devices back, which order each went out on,
// and where they landed — so the sheet travels with the box.
//
// buildSalesReturnPdf({ salesReturn }) where the record carries
// ({ returnNo, customerName, location, notes, createdAt, createdBy, total,
//    currency, lines: [{ imei, serialNumber, model, color, storage, grade,
//                        orderNo, price, currency }] }).

import { jsPDF } from 'jspdf'

const PAGE_W = 596
const PAGE_H = 842
const MARGIN = 48
const RIGHT = PAGE_W - MARGIN
const DARK = 40
const GREY = 130

const COL = {
    idx: MARGIN,
    imei: MARGIN + 26,
    device: MARGIN + 142,
    grade: MARGIN + 302,
    order: MARGIN + 352,
    priceRight: RIGHT
}
const DEVICE_W = COL.grade - 8 - COL.device

function fmtDate(d, withTime) {
    const x = new Date(d)
    if (isNaN(x.getTime())) return ''
    return x.toLocaleString('en-AU', {
        day: 'numeric', month: 'short', year: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
        timeZone: 'Australia/Melbourne'
    })
}

function money(v, cur) {
    return `${cur || 'AUD'} ${(Number(v) || 0).toFixed(2)}`
}

export function buildSalesReturnPdf({ salesReturn }) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const r = salesReturn || {}
    const lines = r.lines || []

    const pageHeader = (pageNo) => {
        doc.setTextColor(DARK)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(20)
        doc.text('SALES RETURN', MARGIN, 64)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(GREY)
        doc.text(`Page ${pageNo}`, RIGHT, 64, { align: 'right' })

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
        pair('Return No', r.returnNo)
        pair('Customer', r.customerName)
        pair('Returned To', r.location || 'iMobile')
        pair('Created', `${fmtDate(r.createdAt, true)}${r.createdBy ? ' · ' + r.createdBy : ''}`)
        pair('Printed', fmtDate(new Date(), true))

        // table header
        y += 6
        doc.setFontSize(9)
        doc.setTextColor(GREY)
        doc.text('#', COL.idx, y)
        doc.text('IMEI / Serial', COL.imei, y)
        doc.text('Device', COL.device, y)
        doc.text('Grade', COL.grade, y)
        doc.text('Order', COL.order, y)
        doc.text('Price', COL.priceRight, y, { align: 'right' })
        y += 6
        doc.setDrawColor(180)
        doc.line(MARGIN, y, RIGHT, y)
        return y + 15
    }

    let page = 1
    let y = pageHeader(page)
    doc.setFontSize(9)

    lines.forEach((l, i) => {
        const device = doc.splitTextToSize(
            [l.model, l.storage, l.color].filter(Boolean).join(' · ') || '—', DEVICE_W)
        const codeLines = l.serialNumber ? 2 : 1
        const rowH = Math.max(15, Math.max(device.length, codeLines) * 11 + 4)
        if (y + rowH > PAGE_H - 90) {
            doc.addPage()
            page++
            y = pageHeader(page)
            doc.setFontSize(9)
        }
        doc.setTextColor(GREY)
        doc.text(String(i + 1), COL.idx, y)
        doc.setTextColor(DARK)
        doc.setFont('helvetica', 'bold')
        doc.text(l.imei || '—', COL.imei, y)
        doc.setFont('helvetica', 'normal')
        // The serial sits under the code, the way the register shows it.
        if (l.serialNumber) {
            doc.setFontSize(8)
            doc.setTextColor(GREY)
            doc.text(String(l.serialNumber), COL.imei, y + 10)
            doc.setFontSize(9)
            doc.setTextColor(DARK)
        }
        doc.text(device, COL.device, y)
        doc.text(String(l.grade || '—'), COL.grade, y)
        doc.text(String(l.orderNo || '—'), COL.order, y)
        doc.text(l.price == null ? '—' : money(l.price, l.currency || r.currency), COL.priceRight, y, { align: 'right' })
        y += rowH
    })

    y += 4
    doc.setDrawColor(180)
    doc.line(MARGIN, y, RIGHT, y)
    y += 18
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(
        `${lines.length} device${lines.length === 1 ? '' : 's'} · sale value ${money(r.total, r.currency)}`,
        RIGHT, y, { align: 'right' }
    )
    doc.setFont('helvetica', 'normal')

    if (r.notes) {
        y += 22
        doc.setFontSize(9)
        doc.setTextColor(GREY)
        doc.text('Notes', MARGIN, y)
        doc.setTextColor(DARK)
        doc.text(doc.splitTextToSize(String(r.notes), RIGHT - MARGIN - 50), MARGIN + 50, y)
    }

    return doc
}

export function salesReturnPdfFileName(salesReturn) {
    const no = String((salesReturn && salesReturn.returnNo) || 'sales-return').replace(/[^\w.-]+/g, '_')
    return `sales-return_${no}.pdf`
}
