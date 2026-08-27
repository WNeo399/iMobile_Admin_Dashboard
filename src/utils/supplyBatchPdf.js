// Printable device list for one supply batch (Supply Batches page).
//
// A4 portrait, plain monochrome, the same bench layout as the repair list:
// devices grouped by model, each group under its own heading with a count,
// and a received tick per line so the sheet works as a packing list on the
// way out and a checklist on arrival.
//
// buildSupplyBatchPdf({ batch }) where `batch` is the loaded batch
// ({ batchNo, stockSource, tracking, notes, createdAt, createdBy,
//    lines: [{ imei, model, color, storage, grade, costPrice, currency,
//              received, receivedAt }] }).

import { jsPDF } from 'jspdf'

const PAGE_W = 596
const PAGE_H = 842
const MARGIN = 48
const RIGHT = PAGE_W - MARGIN
const DARK = 40
const GREY = 130

// Cost and Received are right-aligned; costRight leaves the date room.
const COL = {
    idx: MARGIN,
    imei: MARGIN + 26,
    colour: MARGIN + 160,
    storage: MARGIN + 262,
    grade: MARGIN + 322,
    costRight: MARGIN + 422,
    receivedRight: RIGHT
}

function fmtDate(d, withTime) {
    const x = new Date(d)
    if (isNaN(x.getTime())) return ''
    return x.toLocaleString('en-AU', {
        day: 'numeric', month: 'short', year: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
        timeZone: 'Australia/Melbourne'
    })
}

export function groupSupplyLines(lines) {
    const groups = new Map()
    for (const l of lines || []) {
        const k = String(l.model || '').trim() || '(No model)'
        if (!groups.has(k)) groups.set(k, [])
        groups.get(k).push(l)
    }
    const names = [...groups.keys()].sort((a, b) => {
        if (a === '(No model)') return 1
        if (b === '(No model)') return -1
        return a.localeCompare(b)
    })
    return names.map(name => ({ name, rows: groups.get(name) }))
}

export function buildSupplyBatchPdf({ batch }) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const groups = groupSupplyLines(batch.lines)

    const pageHeader = (pageNo) => {
        doc.setTextColor(DARK)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(20)
        doc.text('SUPPLY BATCH', MARGIN, 64)
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
        pair('Batch', batch.batchNo)
        pair('From', batch.stockSource)
        if (batch.tracking) pair('Tracking #', batch.tracking)
        pair('Created', `${fmtDate(batch.createdAt, true)}${batch.createdBy ? ' · ' + batch.createdBy : ''}`)
        pair('Printed', fmtDate(new Date(), true))
        return y + 8
    }

    const sectionHeader = (group, y, continued) => {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.setTextColor(DARK)
        doc.text(group.name + (continued ? ' (cont.)' : ''), MARGIN, y)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(GREY)
        const received = group.rows.filter(r => r.received).length
        doc.text(
            `${group.rows.length} device${group.rows.length === 1 ? '' : 's'}` +
            (received ? ` · ${received} received` : ''),
            RIGHT, y, { align: 'right' }
        )
        y += 16
        doc.setFontSize(9)
        doc.text('#', COL.idx, y)
        doc.text('IMEI / Serial', COL.imei, y)
        doc.text('Colour', COL.colour, y)
        doc.text('Storage', COL.storage, y)
        doc.text('Grade', COL.grade, y)
        doc.text('Cost', COL.costRight, y, { align: 'right' })
        doc.text('Received', COL.receivedRight, y, { align: 'right' })
        y += 6
        doc.setDrawColor(180)
        doc.line(MARGIN, y, RIGHT, y)
        return y + 15
    }

    let page = 1
    let y = pageHeader(page)

    groups.forEach((group, gi) => {
        if (gi > 0) y += 14
        if (y > PAGE_H - 150) {
            doc.addPage()
            page++
            y = pageHeader(page)
        }
        y = sectionHeader(group, y, false)
        doc.setFontSize(9)

        group.rows.forEach((l, i) => {
            const rowH = 15
            if (y + rowH > PAGE_H - 70) {
                doc.addPage()
                page++
                y = pageHeader(page)
                y = sectionHeader(group, y, true)
                doc.setFontSize(9)
            }
            doc.setTextColor(GREY)
            doc.text(String(i + 1), COL.idx, y)
            doc.setTextColor(DARK)
            doc.setFont('helvetica', 'bold')
            doc.text(l.imei || '—', COL.imei, y)
            doc.setFont('helvetica', 'normal')
            doc.text(String(l.color || '—'), COL.colour, y)
            doc.text(String(l.storage || '—'), COL.storage, y)
            doc.text(String(l.grade || '—'), COL.grade, y)
            doc.text(
                l.costPrice == null ? '—' : `${l.currency || 'AUD'} ${Number(l.costPrice).toFixed(2)}`,
                COL.costRight, y, { align: 'right' }
            )
            doc.text(l.received ? fmtDate(l.receivedAt) || 'Yes' : '—', COL.receivedRight, y, { align: 'right' })
            y += rowH
        })

        y += 4
        doc.setDrawColor(180)
        doc.line(MARGIN, y, RIGHT, y)
        y += 15
    })

    // grand total line
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    const total = (batch.lines || []).length
    const received = (batch.lines || []).filter(l => l.received).length
    doc.text(`${total} device${total === 1 ? '' : 's'} · ${received} received · ${total - received} remaining`, RIGHT, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')

    if (batch.notes) {
        y += 20
        doc.setFontSize(9)
        doc.setTextColor(GREY)
        doc.text('Notes', MARGIN, y)
        doc.setTextColor(DARK)
        const wrapped = doc.splitTextToSize(String(batch.notes), RIGHT - MARGIN - 50)
        doc.text(wrapped, MARGIN + 50, y)
    }

    return doc
}

export function supplyBatchPdfFileName(batch) {
    return `supply-batch_${String(batch.batchNo || 'batch').replace(/[^\w.-]+/g, '_')}.pdf`
}
