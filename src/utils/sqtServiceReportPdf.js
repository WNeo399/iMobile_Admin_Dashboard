// SQT Service Report PDF — replicates the approved Service_Report
// example (TECH ELITE letterhead): logo + title header, bordered info
// grid with shaded label cells (no Repair Ticket row), Reported Fault /
// Inspection Findings / Parts Used / Labour Performed sections, and the
// three-column Device Testing checklist with green ticks + PASS/FAIL
// legend. Attached images (if any) fill the pages after page 1.
//
// buildServiceReportPdf({ caseId, serviceRequest, status, customer,
//   phone, email, device, imei, fault, findings, labour: [..],
//   parts: [..], attachments: [{ dataUrl, w, h }] }) -> jsPDF doc
import { jsPDF } from 'jspdf'

// Extracted from the approved example PDF — the genuine logo image.
const TE_LOGO = 'data:image/png;base64,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'

const L = 45
const R = 550
const TEXT_L = 51

// The example's exact three-column checklist layout; every test PASS.
const TESTS_COLS = [
    ['Screen Burn', 'Microphone', 'Screen Test', 'Rear Camera Present', 'Volume Down Key', 'Gyro Sensor', 'MDM Status'],
    ['Bluetooth', 'Speaker', 'Front Camera Present', 'Rear Camera Result', 'Power Button', 'Multi Touch Screen'],
    ['WiFi', 'Screen Pixels', 'Front Camera Result', 'Volume Up Key', 'Accelerometer Sensor', 'Fingerprint Sensor']
]

export const DEFAULT_LABOUR = [
    'Device inspection and diagnosis',
    'Parts replacement',
    'Device reassembly',
    'Functional testing',
    'Quality assurance inspection'
]

export function buildServiceReportPdf(r) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    doc.setTextColor(20)

    // ── header ─────────────────────────────────────────────────────
    doc.addImage(TE_LOGO, 'PNG', 40, 30, 78, 78)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(23)
    doc.text('Service Report', 398, 63)
    doc.setFontSize(8.5)
    doc.text('12/105 Cochranes Rd', L, 126)
    doc.text('Moorabbin, VIC 3189', L, 137.5)
    doc.text('1800 431 524', L, 149)
    doc.setDrawColor(120)
    doc.setLineWidth(0.8)
    doc.line(L, 158, R, 158)

    // ── info table ─────────────────────────────────────────────────
    const C1 = L, C2 = 123, C3 = 290, C4 = 360, C5 = R
    const ROW_H = 25.5
    let ty = 168
    const rows = [
        ['Case ID', r.caseId, 'Service Request', r.serviceRequest, null],
        ['Status', r.status, 'Repair Shop', r.repairShop, null],
        ['Created At', r.createdAt, 'Repaired At', r.repairedAt, null],
        ['Customer', r.customer, 'Phone', r.phone, null],
        ['Email', r.email, null, null, 'half'],
        ['Device', r.device, null, null, 'full'],
        ['IMEI', r.imei, null, null, 'full']
    ]
    doc.setLineWidth(0.7)
    for (const [l1, v1, l2, v2, span] of rows) {
        doc.setDrawColor(190)
        doc.setFillColor(242, 242, 242)
        doc.rect(C1, ty, C2 - C1, ROW_H, 'FD')
        const v1Right = span === 'full' ? C5 : span === 'half' ? C4 : C3
        doc.rect(C2, ty, v1Right - C2, ROW_H, 'D')
        if (span === 'half') doc.rect(C4, ty, C5 - C4, ROW_H, 'D')
        if (!span) {
            doc.setFillColor(242, 242, 242)
            doc.rect(C3, ty, C4 - C3, ROW_H, 'FD')
            doc.rect(C4, ty, C5 - C4, ROW_H, 'D')
        }
        doc.setFontSize(8.5)
        doc.text(String(l1 == null ? '' : l1), C1 + 5, ty + 16)
        doc.text(String(v1 == null ? '' : v1), C2 + 7, ty + 16)
        if (!span && l2) {
            doc.text(l2, C3 + 5, ty + 16)
            doc.text(String(v2 == null ? '' : v2), C4 + 7, ty + 16)
        }
        ty += ROW_H
    }

    // ── sections ───────────────────────────────────────────────────
    let y = ty + 26
    const section = (title) => {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10.5)
        doc.text(title, TEXT_L, y)
        y += 17
    }
    const paragraph = (text) => {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.7)
        const lines = doc.splitTextToSize(String(text || ''), R - TEXT_L)
        doc.text(lines, TEXT_L, y, { lineHeightFactor: 1.35 })
        y += lines.length * 8.7 * 1.35 + 18
    }
    const bullets = (items) => {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.7)
        for (const item of items) {
            const lines = doc.splitTextToSize('- ' + item, R - TEXT_L)
            doc.text(lines, TEXT_L, y)
            y += lines.length * 11.5
        }
        y += 12
    }

    section('Reported Fault')
    paragraph(r.fault)
    section('Inspection Findings')
    paragraph(r.findings)
    section('Parts Used')
    bullets(r.parts || [])
    section('Labour Performed')
    bullets(r.labour || [])

    // ── device testing ─────────────────────────────────────────────
    section('Device Testing Information')
    const GREEN = [33, 150, 83]
    const RED = [214, 69, 65]
    const tick = (x, by, color) => {
        doc.setDrawColor(color[0], color[1], color[2])
        doc.setLineWidth(1.4)
        if (color === GREEN) {
            doc.line(x, by - 3.2, x + 2.6, by)
            doc.line(x + 2.6, by, x + 7, by - 7)
        } else {
            doc.line(x, by - 7, x + 6.5, by)
            doc.line(x, by, x + 6.5, by - 7)
        }
    }
    const COLX = [TEXT_L, 216, 381]
    doc.setFontSize(8.7)
    const rowsN = Math.max(...TESTS_COLS.map((c) => c.length))
    for (let col = 0; col < 3; col++) {
        for (let row = 0; row < TESTS_COLS[col].length; row++) {
            const iy = y + row * 14.5
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(20)
            doc.text(TESTS_COLS[col][row] + ':', COLX[col], iy)
            tick(COLX[col] + 110, iy, GREEN)
        }
    }
    y += rowsN * 14.5 + 12
    tick(TEXT_L, y, GREEN)
    doc.setTextColor(20)
    doc.setFontSize(8)
    doc.text('PASS', TEXT_L + 12, y)
    tick(TEXT_L + 45, y, RED)
    doc.text('FAIL', TEXT_L + 57, y)

    // ── attachments: pages after page 1, two per row ───────────────
    const atts = (r.attachments || []).filter((a) => a && a.dataUrl)
    if (atts.length) {
        const CELL_W = 247
        const CELL_H = 300
        const GAP = 12
        let ax = L
        let ay = 0
        let col = 0
        const newPage = () => {
            doc.addPage('a4')
            ay = 45
            ax = L
            col = 0
        }
        newPage()
        for (const a of atts) {
            const ratio = a.w && a.h ? a.w / a.h : 3 / 4
            let w = CELL_W
            let h = w / ratio
            if (h > CELL_H) { h = CELL_H; w = h * ratio }
            if (ay + h > 800) newPage()
            const fmt = /^data:image\/png/i.test(a.dataUrl) ? 'PNG' : 'JPEG'
            doc.addImage(a.dataUrl, fmt, ax + (CELL_W - w) / 2, ay, w, h)
            col++
            if (col === 2) {
                col = 0
                ax = L
                ay += CELL_H + GAP
            } else {
                ax = L + CELL_W + GAP
            }
        }
    }
    return doc
}

export function serviceReportFileName(caseId) {
    return 'Service_Report ' + String(caseId || '').replace(/[^\w.-]+/g, '_') + '.pdf'
}
