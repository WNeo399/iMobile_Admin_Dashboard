// Printable transfer note and spreadsheet for one device transfer record
// (Refurbished Device → Warehouse → Transfers; also offered right after an
// "Assign To Exyon" on the Stock page).
//
// A4 portrait, plain monochrome, the supply batch layout: devices grouped
// by "Model · Storage", a numbered line per device with its IMEI / serial,
// colour, grade and the shelf it came from, then a signature block so the
// sheet can travel with the devices.
//
// buildTransferPdf(transfer) → jsPDF   buildTransferWorkbook(transfer) → XLSX workbook
// transfer: { transferNo, to, count, note, createdAt, createdBy,
//             lines: [{ imei, serialNumber, brand, model, storage, color, grade, stockSource, from }] }

import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx-js-style'
import { groupSupplyLines } from './supplyBatchPdf'

const PAGE_W = 596
const PAGE_H = 842
const MARGIN = 48
const RIGHT = PAGE_W - MARGIN
const DARK = 40
const GREY = 130
const COL = { idx: MARGIN, imei: MARGIN + 26, colour: MARGIN + 170, grade: MARGIN + 290, from: MARGIN + 350 }

function fmtDate(d, withTime) {
    const x = new Date(d)
    if (isNaN(x.getTime())) return ''
    return x.toLocaleString('en-AU', {
        day: 'numeric', month: 'short', year: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
        timeZone: 'Australia/Melbourne'
    })
}
const idOf = (l) => l.imei || l.serialNumber || '—'

export function transferFileBase(t) {
    return `Transfer ${t.transferNo || ''} - ${String(t.to || '').replace(/[\\/:*?"<>|]+/g, ' ')}`.trim()
}

export function buildTransferPdf(t) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const groups = groupSupplyLines(t.lines || [])

    const pageHeader = (pageNo) => {
        doc.setTextColor(DARK)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(20)
        doc.text('DEVICE TRANSFER', MARGIN, 64)
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
        pair('Transfer', t.transferNo)
        pair('To', t.to)
        pair('Devices', String((t.lines || []).length))
        pair('Created', `${fmtDate(t.createdAt, true)}${t.createdBy ? ' · ' + t.createdBy : ''}`)
        if (t.note) pair('Note', t.note)
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
        doc.text(`${group.rows.length} device${group.rows.length === 1 ? '' : 's'}`, RIGHT, y, { align: 'right' })
        y += 16
        doc.setFontSize(9)
        doc.text('#', COL.idx, y)
        doc.text('IMEI / Serial', COL.imei, y)
        doc.text('Colour', COL.colour, y)
        doc.text('Grade', COL.grade, y)
        doc.text('From', COL.from, y)
        y += 6
        doc.setDrawColor(180)
        doc.line(MARGIN, y, RIGHT, y)
        return y + 15
    }

    let page = 1
    let y = pageHeader(page)
    let n = 0
    groups.forEach((group, gi) => {
        if (gi > 0) y += 14
        if (y > PAGE_H - 150) { doc.addPage(); page++; y = pageHeader(page) }
        y = sectionHeader(group, y, false)
        doc.setFontSize(9)
        group.rows.forEach((l) => {
            const rowH = 15
            if (y + rowH > PAGE_H - 70) {
                doc.addPage(); page++
                y = pageHeader(page)
                y = sectionHeader(group, y, true)
                doc.setFontSize(9)
            }
            n += 1
            doc.setTextColor(GREY)
            doc.text(String(n), COL.idx, y)
            doc.setTextColor(DARK)
            doc.setFont('helvetica', 'bold')
            doc.text(idOf(l), COL.imei, y)
            doc.setFont('helvetica', 'normal')
            doc.text(String(l.color || '—'), COL.colour, y)
            doc.text(String(l.grade || '—'), COL.grade, y)
            doc.text(String(l.from || '—'), COL.from, y)
            y += rowH
        })
        y += 4
        doc.setDrawColor(180)
        doc.line(MARGIN, y, RIGHT, y)
        y += 15
    })

    // total, then the signature block (on a fresh page if it would not fit)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(`${n} device${n === 1 ? '' : 's'} transferred to ${t.to || '—'}`, RIGHT, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    y += 30
    if (y > PAGE_H - 130) { doc.addPage(); page++; y = pageHeader(page) + 10 }
    const half = (RIGHT - MARGIN - 30) / 2
    const block = (x, title) => {
        doc.setFontSize(10)
        doc.setTextColor(DARK)
        doc.setFont('helvetica', 'bold')
        doc.text(title, x, y)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(GREY)
        doc.setDrawColor(150)
        ;[['Name', 30], ['Signature', 60], ['Date', 90]].forEach(([label, dy]) => {
            doc.text(label, x, y + dy)
            doc.line(x + 52, y + dy + 2, x + half, y + dy + 2)
        })
    }
    block(MARGIN, 'Released by')
    block(MARGIN + half + 30, `Received by (${t.to || ''})`)
    return doc
}

export function buildTransferWorkbook(t) {
    const font = { name: 'Arial', sz: 10 }
    const head = ['#', 'IMEI / Serial', 'Brand', 'Model', 'Storage', 'Colour', 'Grade', 'Stock source', 'From', 'To']
    const rows = (t.lines || []).map((l, i) => [i + 1, idOf(l), l.brand || '', l.model || '', l.storage || '', l.color || '', l.grade || '', l.stockSource || '', l.from || '', t.to || ''])
    const info = [
        ['Transfer', t.transferNo || ''], ['To', t.to || ''], ['Devices', (t.lines || []).length],
        ['Created', fmtDate(t.createdAt, true)], ['By', t.createdBy || ''], ['Note', t.note || ''], []
    ]
    const ws = XLSX.utils.aoa_to_sheet([...info, head, ...rows])
    const headRow = info.length
    const range = XLSX.utils.decode_range(ws['!ref'])
    for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
            const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })]
            if (!cell) continue
            const bold = R === headRow || (R < headRow && C === 0)
            cell.s = { font: { ...font, bold }, ...(R === headRow ? { fill: { fgColor: { rgb: 'DDEBF7' } } } : {}) }
        }
    }
    ws['!cols'] = [4, 18, 10, 40, 9, 12, 7, 12, 18, 18].map(wch => ({ wch }))
    ws['!freeze'] = { xSplit: 0, ySplit: headRow + 1 }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Transfer')
    return wb
}
