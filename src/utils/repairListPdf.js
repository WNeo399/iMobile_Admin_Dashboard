// Printable device list for one repair batch (For Repair page).
//
// A4 portrait, plain monochrome, same bench layout as the dispatch packing
// list. The three groups match the filter tabs on the batch dialog and can
// be printed together or on their own:
//
//   remaining — still here, going out to the repairer (the list you send
//               with the box)
//   out       — at the repairer now
//   back      — returned, with outcome and repair cost
//
// buildRepairListPdf({ batch, picks }) where `batch` is the loaded batch
// ({ title, repairerName, currency, lines }) and `picks` is any subset of
// the group keys.

import { jsPDF } from 'jspdf'

const PAGE_W = 596
const PAGE_H = 842
const MARGIN = 48
const RIGHT = PAGE_W - MARGIN
const DARK = 40
const GREY = 130

// Each group knows which lines it holds and how it prints. Exported so the
// page can count and label the groups from the same definition.
export const REPAIR_LIST_GROUPS = [
    { key: 'remaining', label: 'Remaining', heading: 'REMAINING — TO SEND', test: l => !l.sent },
    { key: 'out', label: 'Out', heading: 'OUT FOR REPAIR', test: l => l.sent && !l.returned },
    { key: 'back', label: 'Back', heading: 'BACK FROM REPAIR', test: l => !!l.returned }
]

// Column x-positions per group. Anything right-aligned sits on RIGHT.
const TO_SEND_COLUMNS = { idx: MARGIN, code: MARGIN + 26, product: MARGIN + 116, grade: MARGIN + 296, issues: MARGIN + 342 }
const COLUMNS = {
    remaining: TO_SEND_COLUMNS,
    out: TO_SEND_COLUMNS,
    back: { idx: MARGIN, code: MARGIN + 26, product: MARGIN + 116, outcome: MARGIN + 286, grade: MARGIN + 372, costRight: RIGHT }
}

const OUTCOMES = { repaired: 'Repaired', 'not-repaired': 'Not repaired', 'written-off': 'Written off' }

function fmtDate(d, withTime) {
    const x = new Date(d)
    if (isNaN(x.getTime())) return ''
    return x.toLocaleString('en-AU', {
        day: 'numeric', month: 'short', year: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
        timeZone: 'Australia/Melbourne'
    })
}

// Blackbelt's answer wins the description, exactly as the on-screen table
// shows it; the sheet's own product name is the fallback.
function productOf(line) {
    const bb = line.bbDevice || {}
    const named = [bb.model, bb.storage, bb.color].filter(Boolean).join(' ')
    return named || line.productName || '—'
}

export function buildRepairListPdf({ batch, picks }) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const lines = (batch && batch.lines) || []
    const wanted = REPAIR_LIST_GROUPS
        .filter(g => (picks || []).includes(g.key))
        .map(g => ({ ...g, rows: lines.filter(g.test) }))
        .filter(g => g.rows.length)

    const pageHeader = (pageNo) => {
        doc.setTextColor(DARK)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(20)
        doc.text('REPAIR LIST', MARGIN, 64)
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
        pair('Batch', batch.title)
        pair('Repairer', batch.repairerName)
        pair('Printed', fmtDate(new Date(), true))
        return y + 10
    }

    // Section heading + its own column header, redrawn whenever a group
    // spills onto a new page so no table is left without labels.
    const sectionHeader = (group, y, continued) => {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.setTextColor(DARK)
        doc.text(group.heading + (continued ? ' (cont.)' : ''), MARGIN, y)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(GREY)
        doc.text(`${group.rows.length} device${group.rows.length === 1 ? '' : 's'}`, RIGHT, y, { align: 'right' })
        y += 16

        const C = COLUMNS[group.key]
        doc.setFontSize(9)
        doc.text('#', C.idx, y)
        doc.text('IMEI / Serial', C.code, y)
        doc.text('Product', C.product, y)
        if (group.key === 'back') {
            doc.text('Outcome', C.outcome, y)
            doc.text('Grade', C.grade, y)
            doc.text('Repair Cost', C.costRight, y, { align: 'right' })
        } else {
            doc.text('Grade', C.grade, y)
            doc.text('Issues', C.issues, y)
        }
        y += 6
        doc.setDrawColor(180)
        doc.line(MARGIN, y, RIGHT, y)
        return y + 15
    }

    let page = 1
    let y = pageHeader(page)

    wanted.forEach((group, gi) => {
        const C = COLUMNS[group.key]
        // Widths for the two columns that wrap.
        const productW = (group.key === 'back' ? C.outcome : C.grade) - 8 - C.product
        const issuesW = RIGHT - C.issues
        if (gi > 0) y += 14
        // Never strand a heading at the foot of a page.
        if (y > PAGE_H - 150) {
            doc.addPage()
            page++
            y = pageHeader(page)
        }
        y = sectionHeader(group, y, false)
        doc.setFontSize(9)

        group.rows.forEach((l, i) => {
            const product = doc.splitTextToSize(productOf(l), productW)
            const issues = group.key === 'back' ? [] : doc.splitTextToSize(l.issues || '—', issuesW)
            const codeLines = l.stockId ? 2 : 1
            const rowH = Math.max(15, Math.max(product.length, issues.length, codeLines) * 11 + 4)
            if (y + rowH > PAGE_H - 70) {
                doc.addPage()
                page++
                y = pageHeader(page)
                y = sectionHeader(group, y, true)
                doc.setFontSize(9)
            }
            doc.setTextColor(GREY)
            doc.text(String(i + 1), C.idx, y)
            doc.setTextColor(DARK)
            doc.setFont('helvetica', 'bold')
            doc.text(l.code || '—', C.code, y)
            doc.setFont('helvetica', 'normal')
            if (l.stockId) {
                doc.setFontSize(8)
                doc.setTextColor(GREY)
                doc.text(String(l.stockId), C.code, y + 10)
                doc.setFontSize(9)
                doc.setTextColor(DARK)
            }
            doc.text(product, C.product, y)
            if (group.key === 'back') {
                doc.text(OUTCOMES[l.outcome] || 'Returned', C.outcome, y)
                doc.text(l.returnGrade || l.grade || '—', C.grade, y)
                doc.text(l.repairCost == null ? '—' : Number(l.repairCost).toFixed(2), C.costRight, y, { align: 'right' })
            } else {
                doc.text(l.grade || '—', C.grade, y)
                doc.text(issues, C.issues, y)
            }
            y += rowH
        })

        y += 4
        doc.setDrawColor(180)
        doc.line(MARGIN, y, RIGHT, y)
        y += 15
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        if (group.key === 'back') {
            const total = group.rows.reduce((s, l) => s + (Number(l.repairCost) || 0), 0)
            doc.text(`Repair cost total: ${batch.currency || 'AUD'} ${total.toFixed(2)}`, RIGHT, y, { align: 'right' })
        } else {
            doc.text(`${group.rows.length} device${group.rows.length === 1 ? '' : 's'}`, RIGHT, y, { align: 'right' })
        }
        doc.setFont('helvetica', 'normal')
        y += 10
    })

    if (!wanted.length) {
        doc.setFontSize(11)
        doc.setTextColor(GREY)
        doc.text('Nothing to list.', MARGIN, y + 10)
    }

    return doc
}

export function repairListFileName(batch, picks) {
    const title = String((batch && batch.title) || 'repair-batch').replace(/[^\w.-]+/g, '_')
    const labels = REPAIR_LIST_GROUPS.filter(g => (picks || []).includes(g.key)).map(g => g.label.toLowerCase())
    return `repair-list_${title}${labels.length ? '_' + labels.join('-') : ''}.pdf`
}
