// Refurbished sales order invoice — replicates the supplied SO-N21601
// template (A4 portrait): iMobile Store letterhead with bank details on the
// left, "Sales Order" + number on the right, a Customer / Order meta row,
// an IMEI · Model · Price item table, and Remark + totals at the foot.
//
// buildRefurbSalesOrderPdf(order) where order is a refurb_sales_orders doc:
//   { orderNo, customerName, createdAt, currency, notes,
//     lines: [{ imei, brand, model, storage, color, grade, price }],
//     subTotal, gstRate, gstAmount, total }

import { jsPDF } from 'jspdf'
import { IMOBILE_LOGO } from '@/utils/blackbeltLogos'

const DARK = 40
const GREY = 120
const LINE = 200

// Page geometry
const LEFT = 40
const RIGHT = 555
const PAGE_BOTTOM = 800

// Item columns
const COL_IMEI = LEFT
const COL_MODEL = 190
const COL_PRICE = RIGHT

const COMPANY = [
    'iMobile Store',
    'ACN 610 947 281',
    'Shop 12 105 Cochranes Rd',
    'Moorabbin Victoria 3189'
]
const BANK = [
    'Bank: Commonwealth Bank',
    'Acc Name: iMobile Store Pty Ltd',
    'BSB: 063-581   Account No.: 10506295'
]

function fmtDate(d) {
    const x = d ? new Date(d) : new Date()
    if (isNaN(x.getTime())) return ''
    // The template prints ISO-style dates (2026-08-14).
    const parts = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Australia/Melbourne'
    }).format(x)
    return parts
}

// The template prints ungrouped amounts ("$ 2125.00"), so no thousands
// separator here either.
function money(n) {
    return Number(n || 0).toFixed(2)
}

// Line prices print bare in the template ("$125"), keeping cents only when
// they carry any.
function linePrice(n) {
    const v = Number(n || 0)
    return '$' + (Number.isInteger(v) ? String(v) : money(v))
}

// "APPLE IPHONE SE G2 64GB [BLACK] [A++]" — brand/model/storage then the
// bracketed colour and grade. Empty parts are simply left out.
export function describeLine(l) {
    const head = [l.brand, l.model, l.storage].map(v => String(v || '').trim()).filter(Boolean).join(' ')
    const tail = [l.color, l.grade].map(v => String(v || '').trim()).filter(Boolean).map(v => `[${v}]`).join(' ')
    return [head, tail].filter(Boolean).join(' ') || '—'
}

// Letterhead — drawn on every page so a long order still reads as one
// document. Returns the y the body should start at.
function header(doc, order) {
    try {
        doc.addImage(IMOBILE_LOGO, 'PNG', LEFT, 36, 104, 40)
    } catch (e) {
        /* logo is decorative — never block the invoice on it */
    }

    doc.setTextColor(DARK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(COMPANY[0], LEFT, 92)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(COMPANY.slice(1), LEFT, 106, { lineHeightFactor: 1.45 })
    doc.text(BANK, LEFT, 148, { lineHeightFactor: 1.45 })

    // Title block (right)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.text('Sales Order', RIGHT, 60, { align: 'right' })
    doc.setFontSize(12)
    doc.setTextColor(GREY)
    doc.text(String(order.orderNo || ''), RIGHT, 80, { align: 'right' })
    doc.setTextColor(DARK)

    return 196
}

// Customer (left) + order meta (right).
function metaBlock(doc, order, y) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(GREY)
    doc.text('Customer:', LEFT, y)
    doc.setTextColor(DARK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    const name = doc.splitTextToSize(String(order.customerName || ''), 260)
    doc.text(name, LEFT, y + 16, { lineHeightFactor: 1.3 })

    const pairs = [
        ['Order Number:', String(order.orderNo || '')],
        ['Order Date:', fmtDate(order.createdAt)]
    ]
    let my = y
    for (const [label, value] of pairs) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(GREY)
        doc.text(label, 430, my)
        doc.setTextColor(DARK)
        doc.setFont('helvetica', 'bold')
        doc.text(value, RIGHT, my, { align: 'right' })
        my += 16
    }

    return Math.max(y + 16 + name.length * 14, my) + 18
}

// Items header row; returns the y of the first item line.
function tableHead(doc, y) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(DARK)
    doc.text('Items', LEFT, y)

    const top = y + 12
    doc.setDrawColor(LINE)
    doc.setLineWidth(0.8)
    doc.line(LEFT, top, RIGHT, top)
    doc.setFontSize(9)
    doc.text('IMEI', COL_IMEI, top + 14)
    doc.text('Model', COL_MODEL, top + 14)
    doc.text('Price', COL_PRICE, top + 14, { align: 'right' })
    doc.line(LEFT, top + 21, RIGHT, top + 21)
    return top + 37
}

export function buildRefurbSalesOrderPdf(order) {
    const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' })
    const lines = Array.isArray(order.lines) ? order.lines : []
    const cur = order.currency || 'AUD'

    let y = header(doc, order)
    y = metaBlock(doc, order, y)
    y = tableHead(doc, y)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    for (const l of lines) {
        // Totals need ~86pt; break early so they never straddle a page.
        if (y > PAGE_BOTTOM - 30) {
            doc.addPage()
            y = tableHead(doc, header(doc, order))
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(9)
        }
        doc.setTextColor(DARK)
        doc.text(String(l.imei || ''), COL_IMEI, y)
        const desc = doc.splitTextToSize(describeLine(l), COL_PRICE - COL_MODEL - 70)
        doc.text(desc[0] || '', COL_MODEL, y)
        doc.text(l.price == null ? '—' : linePrice(l.price), COL_PRICE, y, { align: 'right' })
        y += 16
    }

    doc.setDrawColor(LINE)
    doc.line(LEFT, y - 2, RIGHT, y - 2)

    // Totals need their own page if the items ran to the bottom.
    if (y > PAGE_BOTTOM - 90) {
        doc.addPage()
        y = header(doc, order) + 10
    } else {
        y += 20
    }

    // Remark (left) — kept beside the totals, wrapped and capped.
    if (order.notes) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(GREY)
        doc.text('Remark:', LEFT, y)
        doc.setTextColor(DARK)
        const note = doc.splitTextToSize(String(order.notes), 260).slice(0, 6)
        doc.text(note, LEFT, y + 14, { lineHeightFactor: 1.35 })
    } else {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(GREY)
        doc.text('Remark:', LEFT, y)
        doc.setTextColor(DARK)
    }

    // Totals (right)
    const subTotal = order.subTotal == null ? order.total : order.subTotal
    const gstPct = order.gstRate ? Math.round(order.gstRate * 100) : 0
    const rows = [
        ['Sub Total:', `${cur === 'AUD' ? '$' : cur + ' '} ${money(subTotal)}`, false],
        [`GST (${gstPct}%):`, `${cur === 'AUD' ? '$' : cur + ' '} ${money(order.gstAmount)}`, false],
        ['Total:', `${cur === 'AUD' ? '$' : cur + ' '} ${money(order.total)}`, true]
    ]
    let ty = y
    for (const [label, value, strong] of rows) {
        doc.setFont('helvetica', strong ? 'bold' : 'normal')
        doc.setFontSize(strong ? 11 : 9)
        doc.setTextColor(DARK)
        doc.text(label, 430, ty, { align: 'right' })
        doc.text(value, RIGHT, ty, { align: 'right' })
        ty += strong ? 0 : 18
    }
    doc.setDrawColor(LINE)
    doc.line(430, y + 24, RIGHT, y + 24)

    return doc
}

export function salesOrderPdfFileName(order) {
    return `${order.orderNo || 'sales-order'}.pdf`
}
