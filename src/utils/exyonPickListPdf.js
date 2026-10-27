// Exyon Accessories pick list for one day (Pick Lists page). A4 portrait,
// plain monochrome layout like the Order Dispatch packing list. Two lists
// (user 2026-10-26: "separate the Single line Qty and the Multi line Qty into
// two different lists"): the units for SINGLE-LINE orders, then those for
// MULTI-LINE orders — each one row per Zoho item (the Product Name with its
// Zoho SKU under it, Location, Qty) with its own total. Rows run in the order
// the team processed them, earliest first (user 2026-10-27; shelf order on a
// tie / with no time) — the time itself isn't printed (user, same day).
// An item both kinds need is in both. No Neto SKU (user 2026-10-08).
// buildPickListPdf({ day, lines, summary, batch }) — `lines` / `summary` as the
// GET /exyon-accessories/pick-lists/:day reply: one batch's (2026-10-21, the
// list is printed batch by batch; `batch` = its number, printed under the date).

import { jsPDF } from 'jspdf'

const PAGE_W = 596
const PAGE_H = 842
const MARGIN = 40
const DARK = 40
const GREY = 130
const BOTTOM = PAGE_H - 60

// Column x-positions (left edges; the quantity right-aligned). The
// product's name and its Zoho SKU share one column (user 2026-10-08).
const COL = {
    idx: MARGIN,
    name: MARGIN + 22,
    loc: 410,
    qty: PAGE_W - MARGIN
}
const NAME_W = COL.loc - COL.name - 14
const LOC_W = COL.qty - 50 - COL.loc

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
const sumOf = (rows, k) => rows.reduce((t, l) => t + (Number(l[k]) || 0), 0)
// shelf order, A2 before A10, no location last (each list on its own — the
// server's lines put the multi-line-only items after the rest)
const byLocation = (a, b) => (a.location ? 0 : 1) - (b.location ? 0 : 1) ||
    String(a.location || '').localeCompare(String(b.location || ''), undefined, { numeric: true })
// The order the team processed them (user 2026-10-27: "sort the items by the
// time the team processed the SKU, earliest at the front"): a list's rows by
// the first time an order of THAT kind with the item was processed (the
// server's singleAt / multiAt), shelf order on a tie or with no time.
const atMs = (v) => { const t = v ? new Date(v).getTime() : NaN; return isNaN(t) ? Infinity : t }
const byProcessed = (key) => (a, b) => {
    const ta = atMs(a[key + 'At']), tb = atMs(b[key + 'At'])
    return (ta === tb ? 0 : ta < tb ? -1 : 1) || byLocation(a, b)
}

export function buildPickListPdf({ day, lines, summary, batch }) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const s = summary || {}
    const all = lines || []
    // the two lists, each in the order the team processed them (earliest first)
    const sections = [
        { key: 'single', title: 'SINGLE-LINE ORDERS', orders: s.singleOrders || 0, none: 'No single-line orders in this list' },
        { key: 'multi', title: 'MULTI-LINE ORDERS', orders: s.multiOrders || 0, none: 'No multi-line orders in this list' }
    ].map(x => ({ ...x, rows: all.filter(l => Number(l[x.key]) > 0).sort(byProcessed(x.key)) }))

    let page = 1
    // every page: the title and the list's facts
    const pageHeader = () => {
        doc.setTextColor(DARK)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(20)
        doc.text('PICK LIST', MARGIN, 60)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(GREY)
        doc.text('Exyon Accessories', MARGIN + 112, 60)
        doc.text(`Page ${page}`, COL.qty, 60, { align: 'right' })

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
        if (batch) pair('Batch', String(batch))
        pair('Orders', `${s.orders || 0}   (${s.singleOrders || 0} single-line, ${s.multiOrders || 0} multi-line)`)
        pair('Units', `${s.units || 0}   (${sumOf(all, 'single')} single-line, ${sumOf(all, 'multi')} multi-line)`)
        pair('Printed', fmtNow())
        return y + 6
    }
    // a list's heading and its column titles
    const sectionHeader = (sec, y, continued) => {
        doc.setFillColor(238, 238, 238)
        doc.rect(MARGIN, y - 13, COL.qty - MARGIN, 20, 'F')
        doc.setTextColor(DARK)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(12)
        doc.text(sec.title + (continued ? '  (continued)' : ''), MARGIN + 6, y + 1)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(GREY)
        doc.text(`${sec.orders} order${sec.orders === 1 ? '' : 's'} · ${sec.rows.length} item${sec.rows.length === 1 ? '' : 's'} · ${sumOf(sec.rows, sec.key)} units`, COL.qty - 6, y + 1, { align: 'right' })
        y += 24
        doc.text('#', COL.idx, y)
        doc.text('Product / Zoho SKU', COL.name, y)
        doc.text('Location', COL.loc, y)
        doc.text('Qty', COL.qty, y, { align: 'right' })
        y += 6
        doc.setDrawColor(150)
        doc.setLineWidth(0.8)
        doc.line(MARGIN, y, COL.qty, y)
        return y + 15
    }
    const newPage = () => {
        doc.addPage()
        page++
        return pageHeader()
    }

    let y = pageHeader()
    sections.forEach((sec, si) => {
        // room for the heading and a row, else the next page
        if (si && y + 80 > BOTTOM) y = newPage()
        else if (si) y += 14
        y = sectionHeader(sec, y, false)
        if (!sec.rows.length) {
            doc.setFont('helvetica', 'italic')
            doc.setFontSize(10)
            doc.setTextColor(GREY)
            doc.text(sec.none, COL.name, y)
            doc.setFont('helvetica', 'normal')
            y += 16
            return
        }
        sec.rows.forEach((l, i) => {
            doc.setFontSize(10)
            // the Zoho item's name (what the shelf says), else the order's
            const nameLines = doc.splitTextToSize(l.zohoName || l.productName || '—', NAME_W)
            doc.setFont('helvetica', 'bold')
            const locLines = doc.splitTextToSize(l.location || '—', LOC_W)
            doc.setFont('helvetica', 'normal')
            // the name, then the Zoho SKU on its own line under it
            const rowH = Math.max(nameLines.length * 12 + 13, locLines.length * 12) + 8
            if (y + rowH > BOTTOM - 26) {
                y = newPage()
                y = sectionHeader(sec, y, true)
                doc.setFontSize(10)
            }
            doc.setTextColor(GREY)
            doc.text(String(i + 1), COL.idx, y)
            doc.setTextColor(DARK)
            doc.text(nameLines, COL.name, y)
            const skuY = y + nameLines.length * 12 + 1
            doc.setFontSize(9)
            if (l.zohoSku) {
                doc.setTextColor(GREY)
                doc.text('SKU', COL.name, skuY)
                doc.setFont('helvetica', 'bold')
                doc.setTextColor(DARK)
                doc.setFontSize(10)
                doc.text(l.zohoSku, COL.name + 22, skuY)
            } else {
                doc.setTextColor(GREY)
                doc.text('No Zoho item', COL.name, skuY)
                doc.setTextColor(DARK)
                doc.setFontSize(10)
            }
            doc.setFont('helvetica', 'bold')
            doc.text(locLines, COL.loc, y)
            doc.setFontSize(12)
            doc.text(String(l[sec.key]), COL.qty, y, { align: 'right' })
            doc.setFont('helvetica', 'normal')
            // a light rule between rows
            doc.setDrawColor(225)
            doc.setLineWidth(0.5)
            doc.line(MARGIN, y + rowH - 11, COL.qty, y + rowH - 11)
            y += rowH
        })
        // the list's total
        doc.setDrawColor(150)
        doc.setLineWidth(0.8)
        doc.line(MARGIN, y - 8, COL.qty, y - 8)
        y += 8
        doc.setFontSize(11)
        doc.setTextColor(DARK)
        doc.setFont('helvetica', 'bold')
        doc.text(sec.key === 'single' ? 'Total — single-line' : 'Total — multi-line', COL.name, y)
        doc.text(String(sumOf(sec.rows, sec.key)), COL.qty, y, { align: 'right' })
        doc.setFont('helvetica', 'normal')
        y += 18
    })

    return doc
}

export function pickListFileName(day, batch) {
    return `pick-list_${String(day || 'day').replace(/[^\w.-]+/g, '_')}${batch ? '_batch-' + batch : ''}.pdf`
}
