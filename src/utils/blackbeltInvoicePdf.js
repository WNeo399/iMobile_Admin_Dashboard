// Blackbelt invoice PDF — replicates the approved Exyon sample invoice
// (A4 portrait, 596×842pt) with the agreed changes:
//   · "Account Number (Customer ID)" → "Account Name"
//   · description is just "Blackbelt unique IMEI" (no Exyon id suffix)
//
// buildBlackbeltInvoicePdf(invoice) where invoice is a blackbelt_invoices
// doc: { number, accountName, rate, qty, total, createdAt }.

import { jsPDF } from 'jspdf'
import { EXYON_LOGO, BLACKBELT_LOGO, TECHELITE_LOGO, IMOBILE_LOGO } from '@/utils/blackbeltLogos'

const GREY = 130
const DARK = 40

function fmtDate(d) {
    const x = new Date(d)
    if (isNaN(x.getTime())) return ''
    // en-US gives the sample's "30 Jun 2026" style ("Jun"/"Jul" stay 3-letter;
    // en-AU would render "June"/"July").
    const parts = x.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Melbourne' })
    const [m, day, year] = parts.replace(',', '').split(' ')
    return `${day} ${m} ${year}`
}

function money(n) {
    return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// The BANK DETAILS box (drawn twice: header + payment advice).
function bankDetailsBox(doc, x, y, w, h) {
    doc.setDrawColor(190)
    doc.setLineWidth(0.8)
    doc.rect(x, y, w, h)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(DARK)
    doc.text('BANK DETAILS', x + w / 2, y + 17, { align: 'center' })
    const rows = [
        ['BANK:', 'NATIONAL AUSTRALIA BANK LTD'],
        ['ACC NAME:', 'EXYON PTY LTD'],
        ['ACC NUMBER:', '73-627-5576'],
        ['BSB CODE:', '083-004'],
        ['SWIFT CODE:', 'NATAAU3302S']
    ]
    doc.setFontSize(9)
    let ry = y + 37
    for (const [label, value] of rows) {
        doc.setFont('helvetica', 'bold')
        doc.text(label, x + 14, ry)
        doc.setFont('helvetica', 'normal')
        doc.text(value, x + 82, ry)
        ry += 20
    }
}

// Right-hand label/value pair used in the header meta column. Long values
// (account names) wrap within maxWidth instead of running off the page.
function metaPair(doc, x, y, label, value, maxWidth) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(GREY)
    doc.text(label, x, y)
    doc.setTextColor(DARK)
    doc.setFont('helvetica', 'bold')
    const lines = maxWidth ? doc.splitTextToSize(String(value), maxWidth) : [String(value)]
    doc.text(lines, x, y + 13, { lineHeightFactor: 1.25 })
}

export function buildBlackbeltInvoicePdf(invoice) {
    const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' })
    const created = invoice.createdAt ? new Date(invoice.createdAt) : new Date()
    // Due date is stored on the invoice (picked at creation, default +15
    // days); fall back to +15 for records predating the field.
    const due = invoice.dueDate && !isNaN(new Date(invoice.dueDate).getTime())
        ? new Date(invoice.dueDate)
        : new Date(created.getTime() + 15 * 86400000)

    // ── Company block (top-left) ──
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(DARK)
    doc.text(['Exyon Pty Ltd', '12 105 Cochranes Rd', 'Moorabbin VIC 3189', 'ABN 73 644 368 507'], 28, 44, { lineHeightFactor: 1.8 })

    // ── Top-right logo cluster: blackbelt360 (padding-trimmed art, 1080×300)
    // on top, spanning the same width as the partner row (x352–542) ──
    doc.addImage(BLACKBELT_LOGO, 'JPEG', 352, 30, 190, 53)
    doc.addImage(EXYON_LOGO, 'PNG', 352, 93, 74, 23)
    doc.addImage(TECHELITE_LOGO, 'PNG', 436, 85, 38, 38)
    doc.addImage(IMOBILE_LOGO, 'PNG', 484, 93, 58, 23)

    // ── Header meta (right column, under the logos) —
    // Invoice Date + Invoice Number side by side, Account Name below ──
    metaPair(doc, 352, 168, 'Invoice Date', fmtDate(created))
    metaPair(doc, 459, 168, 'Invoice Number', invoice.number || '')
    metaPair(doc, 352, 204, 'Account Name', invoice.accountName || '', 214)

    // ── Title (below the company block) ──
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(24)
    doc.setTextColor(DARK)
    doc.text('INVOICE', 28, 152)

    // ── Bank details box (header) ──
    bankDetailsBox(doc, 25, 164, 290, 120)

    // ── Items table ──
    const tableTop = 296
    doc.setDrawColor(190)
    doc.setLineWidth(0.8)
    doc.line(28, tableTop, 566, tableTop)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Description', 31, tableTop + 14)
    doc.text('Quantity', 340, tableTop + 14, { align: 'right' })
    doc.text('Unit Price', 450, tableTop + 14, { align: 'right' })
    doc.text('Amount', 566, tableTop + 14, { align: 'right' })
    doc.line(28, tableTop + 22, 566, tableTop + 22)

    doc.setFont('helvetica', 'normal')
    doc.text('Blackbelt unique IMEI', 31, tableTop + 38)
    doc.text(money(invoice.qty), 340, tableTop + 38, { align: 'right' })
    doc.text('$' + money(invoice.rate), 450, tableTop + 38, { align: 'right' })
    doc.text('$' + money(invoice.total), 566, tableTop + 38, { align: 'right' })
    doc.line(28, tableTop + 50, 566, tableTop + 50)

    // ── Note (optional, under the table on the left; totals sit right) ──
    if (invoice.note) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(GREY)
        doc.text('Note', 28, tableTop + 72)
        doc.setTextColor(DARK)
        doc.setFontSize(9)
        // Keep clear of the Due Date line at y428 — cap at 5 wrapped lines.
        const noteLines = doc.splitTextToSize(String(invoice.note), 290).slice(0, 5)
        doc.text(noteLines, 28, tableTop + 85, { lineHeightFactor: 1.3 })
    }

    // ── Totals (right) + due date (left) ──
    const totals = [
        ['Subtotal', '$' + money(invoice.total), false],
        ['TOTAL GST', '$0.00', false],
        ['TOTAL', '$' + money(invoice.total), true]
    ]
    let ty = 420
    for (const [label, value, strong] of totals) {
        doc.setFont('helvetica', strong ? 'bold' : 'normal')
        doc.setFontSize(9)
        doc.text(label, 480, ty, { align: 'right' })
        doc.text(value, 566, ty, { align: 'right' })
        doc.setDrawColor(220)
        doc.line(340, ty - 14, 566, ty - 14)
        ty += 24
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(`Due Date: ${fmtDate(due)}`, 28, 428)

    // ── Tear-off divider ──
    doc.setDrawColor(150)
    doc.setLineWidth(0.8)
    doc.setLineDashPattern([3, 3], 0)
    doc.line(28, 633, 566, 633)
    doc.setLineDashPattern([], 0)

    // ── Payment advice (starts right under the divider so the bank
    // details box gets full breathing room above the page edge) ──
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(24)
    doc.text('PAYMENT ADVICE', 31, 656)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('To: Exyon Pty Ltd', 37, 676)

    bankDetailsBox(doc, 31, 686, 290, 124)

    const adviceRows = [
        ['Customer', invoice.accountName || ''],
        ['Invoice Number', invoice.number || ''],
        ['Amount Due', '$' + money(invoice.total)],
        ['Due Date', fmtDate(due)]
    ]
    let ay = 650
    for (const [label, value] of adviceRows) {
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(GREY)
        doc.setFontSize(9)
        doc.text(label, 343, ay)
        doc.setTextColor(DARK)
        doc.setFont('helvetica', 'bold')
        // Wrap long values (account names) within the column; later rows
        // shift down with the extra lines.
        const lines = doc.splitTextToSize(String(value), 138)
        doc.text(lines, 428, ay, { lineHeightFactor: 1.25 })
        ay += 18 + (lines.length - 1) * 11
    }
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(GREY)
    doc.text('Amount Enclosed', 343, ay)
    doc.setDrawColor(150)
    doc.line(428, ay + 2, 566, ay + 2)
    doc.setFontSize(7.5)
    doc.text('Enter the amount you are paying above', 428, ay + 13)
    doc.setTextColor(DARK)

    return doc
}
