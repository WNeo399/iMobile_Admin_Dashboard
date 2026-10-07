// An InFlow invoice drawn in the browser for an order that has no InFlow PDF
// (hand-entered orders — user ask 2026-10-07). Same structure and look as
// InFlow's own invoice (Invoice-SO-003829 as the example): US Letter; the
// vendor block top left, INVOICE + number + date top right; billing /
// shipping address, contact, phone; due date and payment terms; the item
// table (ITEM, DESCRIPTION, QUANTITY, UNIT PRICE, SUB-TOTAL); sub-total, tax
// and total; "Page x of y". Later pages repeat the header block and the
// table heading. Positions are in points, measured off the example.
//
// order: an InFlow sales order (invoiceNumber, invoiceDate / invoiceDateRaw,
// isCreditNote, lineItems [{ sku, description, quantity, unitPrice,
// subTotal }], subtotal, tax, totalAmount) with `invoiceParties`
// ({ vendor: { name, address, email, phone, abn }, customer: { name,
// billingAddress, shippingAddress, contact, phone, paymentTerms } }) as the
// order detail endpoints return it for orders without a PDF.
import { jsPDF } from 'jspdf'

const ORANGE = [237, 166, 61]
const TEXT = [88, 88, 88]
const SOFT = [128, 128, 128]
const LABEL = [144, 144, 144]
const RULE = [200, 200, 200]

const PAGE_W = 612
const L = 30.5
const R = 580.5
// table columns
const COL = { item: L, desc: 162, qty: 455, unit: 517, sub: 579 }
const DESC_W = 190
const ROW_STEP = 26.7
const LINE_STEP = 10.7
const BOTTOM = 728
const FOOTER_Y = 755

const pad = n => String(n).padStart(2, '0')
// InFlow's date style: the day without a leading zero (2/09/2026)
const inflowDay = d => `${d.getDate()}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
function ddmmyyyy(d) {
    if (!d) return ''
    const x = d instanceof Date ? d : new Date(d)
    if (Number.isNaN(x.getTime())) return ''
    // the order's calendar day as stored (midnight AEST/AEDT is the day before in UTC)
    const local = new Date(x.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }))
    return inflowDay(local)
}
function parseDMY(s) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || '').trim())
    return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null
}
function money(v) {
    const n = Number(v) || 0
    const s = '$' + Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return n < 0 ? '-' + s : s
}
const lines = v => String(v || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)

// "Net 30" → 30 days after the invoice date
function dueDateOf(order, terms) {
    const m = /net\s*(\d+)/i.exec(String(terms || ''))
    if (!m) return ''
    const base = parseDMY(order.invoiceDateRaw) || (order.invoiceDate ? new Date(new Date(order.invoiceDate).toLocaleString('en-US', { timeZone: 'Australia/Melbourne' })) : null)
    if (!base) return ''
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + Number(m[1]))
    return inflowDay(d)
}

export function inflowInvoiceFileName(order) {
    const no = String((order && order.invoiceNumber) || 'invoice').replace(/[\\/:*?"<>|]+/g, '_')
    return `${order && order.isCreditNote ? 'CreditNote' : 'Invoice'}-${no}.pdf`
}

export function buildInflowInvoicePdf(order) {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' })
    const parties = order.invoiceParties || {}
    const vendor = parties.vendor || { name: order.vendor || '' }
    const customer = parties.customer || { name: order.customerName || '' }
    const title = order.isCreditNote ? 'CREDIT NOTE' : 'INVOICE'
    const raw = parseDMY(order.invoiceDateRaw)
    const dateText = raw ? inflowDay(raw) : order.invoiceDateRaw || ddmmyyyy(order.invoiceDate)
    doc.setProperties({ title: `${order.isCreditNote ? 'CreditNote' : 'Invoice'}-${order.invoiceNumber || ''}` })

    const font = (size, style = 'normal', color = TEXT) => {
        doc.setFont('helvetica', style)
        doc.setFontSize(size)
        doc.setTextColor(color[0], color[1], color[2])
    }

    // ── the block every page starts with: vendor + INVOICE / number / date
    const header = () => {
        let y = 56
        font(7.5, 'bold', TEXT)
        doc.text(vendor.name || '', L, y)
        font(7, 'normal', SOFT)
        for (const ln of lines(vendor.address)) { y += 11.5; doc.text(ln, L, y) }
        const kv = [['email', vendor.email], ['phone', vendor.phone], ['ABN', vendor.abn]].filter(x => x[1])
        for (const [k, v] of kv) { y += 11.5; doc.text(k, L, y); doc.text(String(v), L + 26, y) }

        font(19, 'normal', ORANGE)
        doc.text(title, R, 59, { align: 'right' })
        font(8, 'normal', ORANGE)
        doc.text(order.isCreditNote ? 'credit note #' : 'invoice #', 441, 77)
        doc.text('date', 441, 94)
        font(8, 'normal', TEXT)
        doc.text(String(order.invoiceNumber || ''), R, 77, { align: 'right' })
        doc.text(dateText, R, 94, { align: 'right' })
        return Math.max(y, 94)
    }

    const tableHead = (y) => {
        font(7.5, 'normal', LABEL)
        doc.text('ITEM', COL.item, y)
        doc.text('DESCRIPTION', COL.desc, y)
        doc.text('QUANTITY', COL.qty, y, { align: 'right' })
        doc.text('UNIT PRICE', COL.unit, y, { align: 'right' })
        doc.text('SUB-TOTAL', COL.sub, y, { align: 'right' })
        doc.setDrawColor(RULE[0], RULE[1], RULE[2])
        doc.setLineWidth(0.6)
        doc.line(L, y + 13.5, R, y + 13.5)
        return y + 25 // the first row's baseline
    }

    // ── page 1: the parties, the terms, then the table
    let top = header()
    let y = Math.max(129, top + 35)
    font(8, 'normal', ORANGE)
    doc.text('billing address', L, y)
    doc.text('shipping address', 387, y, { align: 'right' })
    font(8, 'bold', TEXT)
    doc.text(customer.name || '', 102, y)
    doc.text(customer.name || '', 397, y)
    font(8, 'normal', TEXT)
    const bill = lines(customer.billingAddress)
    const ship = customer.shippingAddress ? lines(customer.shippingAddress) : bill
    bill.forEach((ln, i) => doc.text(ln, 102, y + 11 * (i + 1)))
    ship.forEach((ln, i) => doc.text(ln, 397, y + 11 * (i + 1)))
    y += 11 * Math.max(bill.length, ship.length)

    const contactRows = [['contact', customer.contact], ['phone', customer.phone]].filter(x => x[1])
    if (contactRows.length) {
        y += 23
        for (const [k, v] of contactRows) {
            font(8, 'normal', ORANGE)
            doc.text(k, L, y)
            font(8, 'normal', TEXT)
            doc.text(String(v), 102, y)
            y += 12.5
        }
        y -= 12.5
    }

    const terms = customer.paymentTerms || ''
    const due = dueDateOf(order, terms)
    if (terms || due) {
        y += 30
        font(7.5, 'normal', LABEL)
        doc.text('due date', L, y)
        doc.text('payment terms', 307, y)
        font(8, 'normal', TEXT)
        doc.text(due || '—', L, y + 17)
        doc.text(terms || '—', 307, y + 17)
        y += 17
    }

    y = tableHead(y + 33)

    // ── the items
    for (const li of order.lineItems || []) {
        font(8, 'normal', TEXT)
        const desc = doc.splitTextToSize(String(li.description || ''), DESC_W)
        const h = ROW_STEP + LINE_STEP * (desc.length - 1)
        if (y + LINE_STEP * (desc.length - 1) > BOTTOM) {
            doc.addPage()
            header()
            y = tableHead(134)
            font(8, 'normal', TEXT)
        }
        doc.text(String(li.sku || li.itemNo || ''), COL.item, y)
        doc.text(desc, COL.desc, y, { lineHeightFactor: LINE_STEP / 8 })
        doc.text(String(li.quantity != null ? li.quantity : ''), COL.qty - 2, y, { align: 'right' })
        doc.text(money(li.unitPrice), COL.unit, y, { align: 'right' })
        const sub = li.subTotal != null ? li.subTotal : (Number(li.quantity) || 0) * (Number(li.unitPrice) || 0)
        doc.text(money(sub), COL.sub, y, { align: 'right' })
        y += h
    }

    // ── the totals (a new page when they don't fit)
    let ty = y - ROW_STEP + 33
    if (ty + 40 > BOTTOM) {
        doc.addPage()
        header()
        ty = 160
    }
    font(8, 'normal', ORANGE)
    doc.text('SUB-TOTAL', 438.5, ty)
    doc.text('TAX', 438.5, ty + 18.5)
    font(10.5, 'normal', ORANGE)
    doc.text('TOTAL', 438.5, ty + 39)
    font(8, 'normal', TEXT)
    doc.text(money(order.subtotal), R, ty, { align: 'right' })
    doc.text(money(order.tax), R, ty + 18.5, { align: 'right' })
    font(12, 'normal', TEXT)
    doc.text(money(order.totalAmount), R, ty + 39, { align: 'right' })

    // ── Page x of y
    const pages = doc.getNumberOfPages()
    for (let p = 1; p <= pages; p++) {
        doc.setPage(p)
        font(7, 'normal', SOFT)
        doc.text(`Page ${p} of ${pages}`, PAGE_W / 2, FOOTER_Y, { align: 'center' })
    }
    return doc
}
