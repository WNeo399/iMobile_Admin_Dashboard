// Consignment invoice to a partner shop (Consignment → Invoices, and the
// iMobile Accountant's Dashboard), A4 portrait, laid out like the refurb
// sales order (refurbSalesOrderPdf.js — user ask 2026-10-01): the iMobile
// Store letterhead and bank details on the left, "Consignment Invoice" + its number on
// the right, Bill to + Invoice Number / Invoice Date, then one line per
// device (IMEI first, no sold date) at its Shop Price, Sub Total + GST =
// Total. The dashboard raises these since 2026-10-01 (they used to come
// from AirTable); a paid invoice carries a PAID mark.
//
// buildConsignmentInvoicePdf(inv) → jsPDF, where inv is
//   { number, shopName, createdAt,
//     subTotal, gstRate, gstAmount, total, paymentStatus, paidAt,
//     lines: [{ imei, productName, grade, shopPrice }] }

import { jsPDF } from 'jspdf'
import { IMOBILE_LOGO } from '@/utils/blackbeltLogos'

const DARK = 40
const GREY = 120
const FILL = 243

const LEFT = 40
const RIGHT = 555
const PAGE_BOTTOM = 770
const ROW_H = 16

// Line columns (x = left edge, or right edge for the amount)
const C_IMEI = LEFT + 4
const C_PROD = 150
const PROD_W = 280
const C_GRADE = 446
const C_AMT = RIGHT - 4

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
    if (!d) return ''
    const x = new Date(d)
    if (isNaN(x.getTime())) return ''
    return x.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Australia/Melbourne' })
}
// ISO-style, as the sales order prints dates (2026-10-01)
function isoDate(d) {
    const x = d ? new Date(d) : new Date()
    if (isNaN(x.getTime())) return ''
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Australia/Melbourne' }).format(x)
}
function money(n) {
    const v = Math.round(Number(n || 0) * 100) / 100
    const s = '$' + Math.abs(v).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return v < 0 ? '-' + s : s
}

function fit(doc, text, width) {
    let t = String(text || '')
    if (doc.getTextWidth(t) <= width) return t
    while (t.length > 1 && doc.getTextWidth(t + '...') > width) t = t.slice(0, -1)
    return t + '...'
}

function letterhead(doc, inv) {
    try {
        doc.addImage(IMOBILE_LOGO, 'PNG', LEFT, 36, 104, 40)
    } catch (e) {
        /* the logo is decorative — never block the invoice on it */
    }
    doc.setTextColor(DARK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(COMPANY[0], LEFT, 92)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(COMPANY.slice(1), LEFT, 106, { lineHeightFactor: 1.45 })
    doc.text(BANK, LEFT, 148, { lineHeightFactor: 1.45 })

    // Title block (right): "Consignment Invoice" and its number, as the sales order
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.text('Consignment Invoice', RIGHT, 60, { align: 'right' })
    doc.setFontSize(12)
    doc.setTextColor(GREY)
    doc.text(String(inv.number || ''), RIGHT, 80, { align: 'right' })
    doc.setTextColor(DARK)
    return 196
}

// Bill to (left) + Invoice Number / Invoice Date (right), as the sales
// order's Customer + Order Number / Order Date.
function headBlock(doc, inv, y) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(GREY)
    doc.text('Bill to:', LEFT, y)
    doc.setTextColor(DARK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    const name = doc.splitTextToSize(String(inv.shopName || ''), 260)
    doc.text(name, LEFT, y + 16, { lineHeightFactor: 1.3 })

    const pairs = [
        ['Invoice Number:', String(inv.number || '')],
        ['Invoice Date:', isoDate(inv.createdAt)]
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
    doc.setFont('helvetica', 'normal')
    return Math.max(y + 16 + name.length * 14, my) + 22
}

function tableHead(doc, y) {
    doc.setFillColor(FILL)
    doc.rect(LEFT, y - 11, RIGHT - LEFT, 17, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(DARK)
    doc.text('IMEI / Serial', C_IMEI, y)
    doc.text('Device', C_PROD, y)
    doc.text('Grade', C_GRADE, y)
    doc.text('Amount', C_AMT, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    return y + ROW_H + 2
}

function continuation(doc, inv) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(DARK)
    doc.text(`Consignment Invoice ${inv.number || ''}`, LEFT, 50)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(GREY)
    doc.text(fit(doc, String(inv.shopName || ''), RIGHT - LEFT - 150), LEFT, 64)
    doc.setTextColor(DARK)
    return tableHead(doc, 92)
}

function line(doc, l, y) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(DARK)
    doc.text(fit(doc, l.imei, C_PROD - C_IMEI - 8), C_IMEI, y)
    doc.text(fit(doc, l.productName, PROD_W), C_PROD, y)
    doc.text(fit(doc, l.grade || '', C_AMT - C_GRADE - 70), C_GRADE, y)
    doc.text(money(l.shopPrice), C_AMT, y, { align: 'right' })
    doc.setDrawColor(235)
    doc.setLineWidth(0.5)
    doc.line(LEFT, y + 5, RIGHT, y + 5)
}

export function buildConsignmentInvoicePdf(inv) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    let y = letterhead(doc, inv)
    y = headBlock(doc, inv, y)
    y = tableHead(doc, y)
    const lines = inv.lines || []
    lines.forEach((l) => {
        if (y > PAGE_BOTTOM) {
            doc.addPage()
            y = continuation(doc, inv)
        }
        line(doc, l, y)
        y += ROW_H
    })

    // Sub Total + GST = Total (an imported AirTable invoice: Total only),
    // then, on a paid one, the paid note
    const hasGst = inv.gstRate != null && inv.subTotal != null
    if (y + (hasGst ? 106 : 70) > PAGE_BOTTOM + 30) {
        doc.addPage()
        y = 70
    } else y += 6
    doc.setTextColor(DARK)
    if (hasGst) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9.5)
        doc.text('Sub Total', 370, y)
        doc.text(money(inv.subTotal), C_AMT, y, { align: 'right' })
        doc.text(`GST (${Math.round(inv.gstRate * 100)}%)`, 370, y + 16)
        doc.text(money(inv.gstAmount), C_AMT, y + 16, { align: 'right' })
        y += 34
    }
    doc.setFillColor(FILL)
    doc.rect(360, y - 11, RIGHT - 360, 20, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.text(hasGst ? 'Total (inc GST)' : 'Total', 370, y + 3)
    doc.text(money(inv.total), C_AMT, y + 3, { align: 'right' })
    y += 34
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    // an unpaid invoice ends at the total (no payment line — user ask 2026-10-01)
    if (inv.paymentStatus === 'paid') {
        doc.setTextColor(82, 155, 46)
        doc.setFont('helvetica', 'bold')
        doc.text(`PAID${inv.paidAt ? ' ' + fmtDate(inv.paidAt) : ''} — thank you.`, LEFT, y)
    }
    doc.setTextColor(DARK)

    // a paid invoice carries a PAID mark on its first page
    if (inv.paymentStatus === 'paid') {
        doc.setPage(1)
        doc.setDrawColor(82, 155, 46)
        doc.setTextColor(82, 155, 46)
        doc.setLineWidth(2)
        doc.roundedRect(210, 112, 112, 40, 6, 6)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(24)
        doc.text('PAID', 266, 140, { align: 'center' })
        doc.setTextColor(DARK)
    }

    const pages = doc.getNumberOfPages()
    const made = new Date().toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    for (let p = 1; p <= pages; p++) {
        doc.setPage(p)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(GREY)
        doc.text(`Generated ${made}`, LEFT, 822)
        doc.text(`Page ${p} of ${pages}`, RIGHT, 822, { align: 'right' })
    }
    return doc
}

export function consignmentInvoiceFileName(inv) {
    const clean = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
    return `Invoice ${clean(inv.number)} ${clean(inv.shopName)}.pdf`
}
