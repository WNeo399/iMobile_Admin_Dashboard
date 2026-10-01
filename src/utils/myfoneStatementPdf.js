// Statement of account for one customer (iMobile Accountant → My Fone →
// shop statement), A4 portrait: the iMobile Store letterhead and bank
// details used on the refurb sales order (refurbSalesOrderPdf.js), the
// customer and a balance summary, then every transaction in the period with
// a running balance — opening balance first, balance due last. When the
// period runs to today an aging line (days past due) closes it off.
//
// buildMyfoneStatementPdf(s) → jsPDF, where s is
//   { shop: { name, address: [], email, phone }, from, to (YYYY-MM-DD),
//     opening, invoiced, received, closing,
//     rows: [{ date, type, number, details, debit, credit, balance }],
//     aging?: { current, d30, d60, d90, older } }

import { jsPDF } from 'jspdf'
import { IMOBILE_LOGO } from '@/utils/blackbeltLogos'

const DARK = 40
const GREY = 120
const LINE = 200
const FILL = 243

const LEFT = 40
const RIGHT = 555
const PAGE_BOTTOM = 790
const ROW_H = 16

// Transaction columns (x = left edge, or right edge for amounts)
const C_DATE = LEFT + 4
const C_TYPE = 104
const C_NO = 176
const C_DETAIL = 250
const DETAIL_W = 140
const C_AMOUNT = 432
const C_PAID = 494
const C_BAL = RIGHT - 4

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

function fmtDate(ymd) {
    if (!ymd) return ''
    const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function money(n) {
    const v = Math.round(Number(n || 0) * 100) / 100
    const s = '$' + Math.abs(v).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return v < 0 ? '-' + s : s
}

// Cut text to a width, ending in "..." when it had to be cut.
function fit(doc, text, width) {
    let t = String(text || '')
    if (doc.getTextWidth(t) <= width) return t
    while (t.length > 1 && doc.getTextWidth(t + '...') > width) t = t.slice(0, -1)
    return t + '...'
}

function letterhead(doc, s) {
    try {
        doc.addImage(IMOBILE_LOGO, 'PNG', LEFT, 36, 104, 40)
    } catch (e) {
        /* the logo is decorative — never block the statement on it */
    }
    doc.setTextColor(DARK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(COMPANY[0], LEFT, 92)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(COMPANY.slice(1), LEFT, 106, { lineHeightFactor: 1.45 })
    doc.text(BANK, LEFT, 148, { lineHeightFactor: 1.45 })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.text('Statement of Account', RIGHT, 60, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(GREY)
    doc.text(`${fmtDate(s.from)} to ${fmtDate(s.to)}`, RIGHT, 78, { align: 'right' })
    doc.setTextColor(DARK)
    return 200
}

// Customer (left) and the balance summary box (right).
function customerBlock(doc, s, y) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(GREY)
    doc.text('To:', LEFT, y)
    doc.setTextColor(DARK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    const name = doc.splitTextToSize(String(s.shop.name || ''), 250)
    doc.text(name, LEFT, y + 16, { lineHeightFactor: 1.3 })
    let ly = y + 16 + name.length * 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const extra = [...(s.shop.address || []), [s.shop.email, s.shop.phone].filter(Boolean).join('   ')].filter(Boolean)
    for (const line of extra) {
        doc.text(fit(doc, line, 250), LEFT, ly)
        ly += 12
    }

    const bx = 330
    const bw = RIGHT - bx
    const pairs = [
        ['Opening balance', money(s.opening)],
        ['Invoiced', money(s.invoiced)],
        ['Payments & credits', money(s.received)]
    ]
    const top = y - 12
    const bh = pairs.length * 16 + 34
    doc.setDrawColor(LINE)
    doc.setLineWidth(0.8)
    doc.rect(bx, top, bw, bh)
    let by = top + 16
    doc.setFontSize(9)
    for (const [label, value] of pairs) {
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(GREY)
        doc.text(label, bx + 10, by)
        doc.setTextColor(DARK)
        doc.text(value, RIGHT - 10, by, { align: 'right' })
        by += 16
    }
    doc.setFillColor(FILL)
    doc.rect(bx, by - 8, bw, 26, 'F')
    doc.line(bx, by - 8, RIGHT, by - 8)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('Balance due', bx + 10, by + 9)
    doc.text(money(s.closing), RIGHT - 10, by + 9, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    return Math.max(ly, top + bh) + 26
}

function tableHead(doc, y) {
    doc.setFillColor(FILL)
    doc.rect(LEFT, y - 11, RIGHT - LEFT, 17, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(DARK)
    doc.text('Date', C_DATE, y)
    doc.text('Transaction', C_TYPE, y)
    doc.text('Number', C_NO, y)
    doc.text('Details', C_DETAIL, y)
    doc.text('Amount', C_AMOUNT, y, { align: 'right' })
    doc.text('Payments', C_PAID, y, { align: 'right' })
    doc.text('Balance', C_BAL, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    return y + ROW_H + 2
}

// A later page: a short running head, then the column heads again.
function continuation(doc, s) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(DARK)
    doc.text('Statement of Account', LEFT, 50)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(GREY)
    doc.text(fit(doc, `${s.shop.name}  |  ${fmtDate(s.from)} to ${fmtDate(s.to)}`, RIGHT - LEFT - 150), LEFT, 64)
    doc.setTextColor(DARK)
    return tableHead(doc, 92)
}

function row(doc, r, y, bold) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(DARK)
    doc.text(fmtDate(r.date), C_DATE, y)
    // "Opening balance" / "Balance due" rows run across the empty columns
    doc.text(bold ? String(r.type) : fit(doc, r.type, C_NO - C_TYPE - 6), C_TYPE, y)
    doc.text(fit(doc, r.number, C_DETAIL - C_NO - 6), C_NO, y)
    doc.setTextColor(GREY)
    doc.text(fit(doc, r.details, DETAIL_W), C_DETAIL, y)
    doc.setTextColor(DARK)
    if (r.debit || r.showZero) doc.text(money(r.debit), C_AMOUNT, y, { align: 'right' })
    if (r.credit) doc.text(money(r.credit), C_PAID, y, { align: 'right' })
    doc.text(money(r.balance), C_BAL, y, { align: 'right' })
    doc.setDrawColor(235)
    doc.setLineWidth(0.5)
    doc.line(LEFT, y + 5, RIGHT, y + 5)
}

function agingBlock(doc, s, y) {
    const a = s.aging
    const cells = [
        ['Not yet due', a.current], ['1-30 days', a.d30], ['31-60 days', a.d60],
        ['61-90 days', a.d90], ['Over 90 days', a.older],
        ['Total owing', a.current + a.d30 + a.d60 + a.d90 + a.older]
    ]
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(DARK)
    doc.text('Unpaid invoices by days past due', LEFT, y)
    const top = y + 8
    const w = (RIGHT - LEFT) / cells.length
    doc.setDrawColor(LINE)
    doc.setLineWidth(0.8)
    cells.forEach(([label, v], i) => {
        const x = LEFT + i * w
        if (i === cells.length - 1) {
            doc.setFillColor(FILL)
            doc.rect(x, top, w, 36, 'FD')
        } else doc.rect(x, top, w, 36)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(GREY)
        doc.text(label, x + w / 2, top + 13, { align: 'center' })
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9.5)
        doc.setTextColor(DARK)
        doc.text(money(v), x + w / 2, top + 28, { align: 'center' })
    })
    return top + 36
}

export function buildMyfoneStatementPdf(s) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    let y = letterhead(doc, s)
    y = customerBlock(doc, s, y)
    y = tableHead(doc, y)

    const all = [
        { date: s.from, type: 'Opening balance', number: '', details: '', balance: s.opening, bold: true },
        ...s.rows,
        { date: s.to, type: 'Balance due', number: '', details: '', balance: s.closing, bold: true }
    ]
    for (const r of all) {
        if (y > PAGE_BOTTOM) {
            doc.addPage()
            y = continuation(doc, s)
        }
        row(doc, r, y, r.bold)
        y += ROW_H
    }

    if (s.aging) {
        if (y + 60 > PAGE_BOTTOM + 20) {
            doc.addPage()
            y = 60
        } else y += 14
        agingBlock(doc, s, y)
    }

    // page numbers + when it was made, on every page
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
