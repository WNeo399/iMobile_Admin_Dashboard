// Exyon Accessories pick list for one day (Pick Lists page). A4 portrait,
// plain monochrome layout like the Order Dispatch packing list. One row per
// Zoho item, in shelf-location order: the Product Name with its Zoho SKU
// under it, Location, then the units from single-line orders, from
// multi-line orders, and in all — no Neto SKU (user 2026-10-08).
// buildPickListPdf({ day, lines, summary }) — `lines` / `summary` as the
// GET /exyon-accessories/pick-lists/:day reply.

import { jsPDF } from 'jspdf'

const PAGE_W = 596
const PAGE_H = 842
const MARGIN = 40
const DARK = 40
const GREY = 130

// Column x-positions (left edges; the quantities right-aligned). The
// product's name and its Zoho SKU share one column (user 2026-10-08).
const COL = {
    idx: MARGIN,
    name: MARGIN + 22,
    loc: 388,
    single: 484,
    multi: 526,
    total: PAGE_W - MARGIN
}
const NAME_W = COL.loc - COL.name - 14
const LOC_W = COL.single - 30 - COL.loc

// "2026-10-08" → "Thursday 8 October 2026"
function fmtDay(day) {
    const [y, m, d] = String(day || '').split('-').map(Number)
    const x = new Date(y, (m || 1) - 1, d || 1)
    if (isNaN(x.getTime())) return String(day || '')
    return x.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtNow() {
    return new Date().toLocaleString('en-AU', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        timeZone: 'Australia/Melbourne'
    })
}
// a zero quantity prints as a dash, so the numbers that matter stand out
const qty = (n) => (Number(n) ? String(n) : '–')

export function buildPickListPdf({ day, lines, summary }) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const s = summary || {}

    const header = (pageNo) => {
        doc.setTextColor(DARK)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(20)
        doc.text('PICK LIST', MARGIN, 60)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(GREY)
        doc.text('Exyon Accessories', MARGIN + 112, 60)
        doc.text(`Page ${pageNo}`, COL.total, 60, { align: 'right' })

        doc.setFontSize(11)
        let y = 88
        const pair = (label, value) => {
            doc.setTextColor(GREY)
            doc.setFont('helvetica', 'normal')
            doc.text(label, MARGIN, y)
            doc.setTextColor(DARK)
            doc.setFont('helvetica', 'bold')
            doc.text(String(value), MARGIN + 70, y)
            doc.setFont('helvetica', 'normal')
            y += 17
        }
        pair('Date', fmtDay(day))
        pair('Orders', `${s.orders || 0}   (${s.singleOrders || 0} single-line, ${s.multiOrders || 0} multi-line)`)
        pair('Units', `${s.units || 0}   (${(lines || []).length} items)`)
        pair('Printed', fmtNow())

        // table header
        y += 10
        doc.setFontSize(9)
        doc.setTextColor(GREY)
        doc.text('#', COL.idx, y)
        doc.text('Product / Zoho SKU', COL.name, y)
        doc.text('Location', COL.loc, y)
        doc.text('Single', COL.single, y, { align: 'right' })
        doc.text('Multi', COL.multi, y, { align: 'right' })
        doc.text('Total', COL.total, y, { align: 'right' })
        doc.setFontSize(7)
        doc.text('line qty', COL.single, y + 9, { align: 'right' })
        doc.text('line qty', COL.multi, y + 9, { align: 'right' })
        doc.text('qty', COL.total, y + 9, { align: 'right' })
        y += 14
        doc.setDrawColor(150)
        doc.setLineWidth(0.8)
        doc.line(MARGIN, y, COL.total, y)
        return y + 15
    }

    let page = 1
    let y = header(page)
    const rows = lines || []
    rows.forEach((l, i) => {
        doc.setFontSize(10)
        // the Zoho item's name (what the shelf says), else the order's
        const nameLines = doc.splitTextToSize(l.zohoName || l.productName || '—', NAME_W)
        doc.setFont('helvetica', 'bold')
        const locLines = doc.splitTextToSize(l.location || '—', LOC_W)
        doc.setFont('helvetica', 'normal')
        // the name, then the Zoho SKU on its own line under it
        const rowH = Math.max(nameLines.length * 12 + 13, locLines.length * 12) + 8
        if (y + rowH > PAGE_H - 70) {
            doc.addPage()
            page++
            y = header(page)
            doc.setFontSize(10)
        }
        doc.setTextColor(GREY)
        doc.text(String(i + 1), COL.idx, y)
        doc.setTextColor(DARK)
        doc.text(nameLines, COL.name, y)
        doc.setFont('helvetica', 'bold')
        const skuY = y + nameLines.length * 12 + 1
        if (l.zohoSku) {
            doc.setFontSize(9)
            doc.setTextColor(GREY)
            doc.setFont('helvetica', 'normal')
            doc.text('SKU', COL.name, skuY)
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(DARK)
            doc.setFontSize(10)
            doc.text(l.zohoSku, COL.name + 22, skuY)
        } else {
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(9)
            doc.setTextColor(GREY)
            doc.text('No Zoho item', COL.name, skuY)
            doc.setTextColor(DARK)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'bold')
        }
        doc.text(locLines, COL.loc, y)
        doc.setFont('helvetica', 'normal')
        doc.text(qty(l.single), COL.single, y, { align: 'right' })
        doc.text(qty(l.multi), COL.multi, y, { align: 'right' })
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.text(String(l.total || 0), COL.total, y, { align: 'right' })
        doc.setFont('helvetica', 'normal')
        // a light rule between rows
        doc.setDrawColor(225)
        doc.setLineWidth(0.5)
        doc.line(MARGIN, y + rowH - 11, COL.total, y + rowH - 11)
        y += rowH
    })

    // totals
    if (y + 30 > PAGE_H - 50) {
        doc.addPage()
        page++
        y = header(page)
    }
    const sum = (k) => rows.reduce((t, l) => t + (Number(l[k]) || 0), 0)
    doc.setDrawColor(150)
    doc.setLineWidth(0.8)
    doc.line(MARGIN, y - 8, COL.total, y - 8)
    y += 8
    doc.setFontSize(11)
    doc.setTextColor(DARK)
    doc.setFont('helvetica', 'bold')
    doc.text('Total', COL.name, y)
    doc.text(String(sum('single')), COL.single, y, { align: 'right' })
    doc.text(String(sum('multi')), COL.multi, y, { align: 'right' })
    doc.text(String(sum('total')), COL.total, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')

    return doc
}

export function pickListFileName(day) {
    return `pick-list_${String(day || 'day').replace(/[^\w.-]+/g, '_')}.pdf`
}
