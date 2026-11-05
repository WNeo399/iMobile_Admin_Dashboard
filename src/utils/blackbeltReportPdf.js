// Blackbelt analyst reports as one PDF (user ask 2026-11-05: on a Refurbished
// Device sales order, tick devices and review / download / print their
// reports together). One A4 report per device, laid out like the Stock
// page's "Blackbelt Report" tab (itself modelled on Blackbelt's Analyst
// Report): Device, Battery, Testing, Genuine Parts, Analyst. The data is the
// report fetched live from Blackbelt (GET /refurbished/devices/:id/report).
//
// jsPDF's built-in font has no Chinese, and some reports' status text is
// Chinese ("电池容量和循环次数不满足"): any text outside Latin-1 is drawn on a
// canvas with the system font and placed as an image.
import { jsPDF } from 'jspdf'
import { IMOBILE_LOGO } from '@/utils/blackbeltLogos'

const PAGE_W = 210
const PAGE_H = 297
const M = 14 // margin
const CONTENT_W = PAGE_W - M * 2
const ROW_H = 4.7 // tight enough for one A4 page per phone report
const PT = 0.3528 // mm per point

const GREEN = [46, 125, 50]
const RED = [198, 40, 40]
const ORANGE = [230, 126, 34]
const GREY = [120, 124, 130]
const LABEL = [96, 98, 102]
const INK = [33, 37, 41]

// "MultiTouchScreen" → "Multi Touch Screen"; all-caps names stay (as on the Stock page).
export const prettyName = (name) => String(name || '').replace(/([a-z])([A-Z])/g, '$1 $2')

// The Stock page's rows, in its order; empty values left out.
export function reportRows(report) {
    const d = (report && report.device) || {}
    const b = (report && report.battery) || {}
    const a = (report && report.analyst) || {}
    const keep = (rows) => rows.filter(c => c[1] != null && String(c[1]).trim() !== '')
    return {
        device: keep([
            ['Manufacturer', d.manufacturer],
            ['Model', d.model && d.modelNumber ? `${d.model} (${d.modelNumber})` : (d.model || d.modelNumber)],
            ['Operating System', d.os], ['Version', d.osVersion],
            ['Serial Number', d.serialNumber], ['IMEI/MEID', d.imei],
            ['IMEI 2', d.imei2],
            ['A Number', d.aNumber], ['Device Storage', d.storage],
            ['RAM', d.ram], ['Device Color', d.color],
            ['MLB Serial Number', d.mlbSerial], ['Region Info', d.region],
            ['FMIP', d.fmip], ['MDM Status', d.mdmStatus],
            ['CPU Name', d.cpuName], ['CPU Speed', d.cpuSpeed],
            ['Country Origin', d.countryOrigin],
            ['EID', d.eid, true],
            ['Manufacture Date', d.manufactureDate],
            ['Device ID', d.deviceId, true]
        ]),
        battery: keep([
            ['Serial', b.serial], ['Manufacturer Date', b.manufacturerDate],
            ['Temperature', b.temperature], ['Design Capacity', b.designCapacity],
            ['Actual Design Capacity', b.actualDesignCapacity], ['Full Charge Capacity', b.fullChargeCapacity],
            ['Cycle Count', b.cycleCount], ['Health', b.health && parseInt(b.health) === 0 ? '—' : b.health]
        ]),
        analyst: keep([
            ['Start Date', a.startDate], ['Start Time', a.startTime],
            ['Finish Date', a.finishDate], ['Finish Time', a.finishTime],
            ['Device Analyst Version', a.deviceAnalystVersion],
            ['Analyst Application Version', a.appVersion],
            ['Operator/User Name', a.operator], ['License Id', a.licenseId],
            ['Profile Name', a.profileName],
            ['Status', (report && report.status) || '']
        ])
    }
}

const verdictColor = (v) => {
    const s = String(v || '').toUpperCase()
    if (s === 'PASS') return GREEN
    if (s === 'FAIL') return RED
    if (s === 'WARNING') return ORANGE
    return GREY
}
const verdictText = (v) => {
    const s = String(v || '').toUpperCase()
    if (s === 'PASS' || s === 'FAIL' || s === 'WARNING') return s
    if (s === 'NOT SUPPORTED ON DEVICE') return 'N/S'
    return 'N/T'
}

// ── text that jsPDF's font can't draw → a canvas image ─────────────
const latin1 = (s) => /^[\x00-\xFF—–…•·’‘“”]*$/.test(s) // eslint-disable-line no-control-regex
const imgCache = new Map()
function textImage(s, sizePt, bold, color) {
    const key = [s, sizePt, bold, color.join(',')].join('|')
    if (imgCache.has(key)) return imgCache.get(key)
    const k = 12 // px per mm
    const px = sizePt * PT * k
    const font = `${bold ? 'bold ' : ''}${px}px "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif`
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')
    ctx.font = font
    const w = Math.ceil(ctx.measureText(s).width) + 2
    const h = Math.ceil(px * 1.3)
    c.width = w
    c.height = h
    ctx.font = font
    ctx.fillStyle = `rgb(${color.join(',')})`
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(s, 1, Math.round(px * 1.0))
    const out = { png: c.toDataURL('image/png'), w: w / k, h: h / k, base: px / k }
    imgCache.set(key, out)
    return out
}

// Text at baseline y, cut with "…" to maxW; non-Latin text as an image.
function put(doc, s, x, y, { size = 8, bold = false, color = INK, maxW = 0, align = 'left' } = {}) {
    let t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
    if (!t) return 0
    if (latin1(t)) {
        doc.setFont('helvetica', bold ? 'bold' : 'normal')
        doc.setFontSize(size)
        doc.setTextColor(...color)
        if (maxW && doc.getTextWidth(t) > maxW) {
            while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1)
            t = t.replace(/\s+$/, '') + '…'
        }
        const w = doc.getTextWidth(t)
        doc.text(t, align === 'right' ? x - w : x, y)
        return w
    }
    const img = textImage(t, size, bold, color)
    let w = img.w
    let h = img.h
    if (maxW && w > maxW) { h = h * maxW / w; w = maxW } // shrink rather than cut
    const left = align === 'right' ? x - w : x
    doc.addImage(img.png, 'PNG', left, y - img.base * (h / img.h), w, h)
    return w
}

// ── one report ──────────────────────────────────────────────────────
// item: { report, reportId, line: { imei, model, storage, color, grade }, orderNo }
function drawReport(doc, item, first) {
    const r = item.report || {}
    const line = item.line || {}
    const rows = reportRows(r)
    let y = M
    const title = [line.model, line.storage, line.color].filter(Boolean).join(' · ') || (r.device && r.device.model) || ''

    const header = (cont) => {
        if (!cont) {
            try { doc.addImage(IMOBILE_LOGO, 'PNG', PAGE_W - M - 30, M - 2, 30, 30 * 57 / 142) } catch (e) { /* no logo */ }
        }
        put(doc, 'Blackbelt Analyst Report' + (cont ? ' (continued)' : ''), M, y + 5, { size: cont ? 11 : 16, bold: true })
        y += cont ? 8 : 11
        const id = (r.analyst && r.analyst.reportId) || item.reportId || ''
        const sub = [id && `Report #${id}`, r.analyst && r.analyst.finishDate, item.orderNo].filter(Boolean).join('  ·  ')
        put(doc, sub, M, y, { size: 8.5, color: GREY })
        y += 5
        put(doc, title, M, y + 1, { size: 10, bold: true, maxW: CONTENT_W * 0.62 })
        put(doc, 'IMEI ' + (line.imei || (r.device && r.device.imei) || '—'), PAGE_W - M, y + 1, { size: 9, align: 'right' })
        y += 5
        // (the coloured Status box under this line was removed at the user's ask, 2026-11-05)
        doc.setDrawColor(220, 223, 230)
        doc.setLineWidth(0.3)
        doc.line(M, y, PAGE_W - M, y)
        y += 3
    }
    const newPage = () => { doc.addPage('a4', 'portrait'); y = M; header(true) }
    const need = (h) => { if (y + h > PAGE_H - M - 6) newPage() }

    if (!first) doc.addPage('a4', 'portrait')
    header(false)

    const section = (name) => {
        need(7 + ROW_H)
        doc.setFillColor(242, 244, 247)
        doc.rect(M, y, CONTENT_W, 5.5, 'F')
        put(doc, name, M + 2, y + 3.9, { size: 8.5, bold: true })
        y += 7
    }
    // label: value pairs, `cols` across (a wide one takes the whole row)
    const grid = (pairs, cols) => {
        const colW = CONTENT_W / cols
        let col = 0
        for (const [label, value, wide] of pairs) {
            if (wide && col) { y += ROW_H; col = 0 }
            if (col === 0) need(ROW_H)
            const x = M + col * colW
            const lw = put(doc, label + ':', x, y + 3.3, { size: 7, color: LABEL, maxW: colW * 0.55 })
            const w = (wide ? CONTENT_W : colW) - lw - 4
            put(doc, value, x + lw + 1.5, y + 3.3, { size: 7.5, bold: true, maxW: w })
            col = wide ? cols : col + 1
            if (col >= cols) { y += ROW_H; col = 0 }
        }
        if (col) y += ROW_H
        y += 1
    }
    // test name + verdict, `cols` across
    const verdicts = (list, cols, textOf, colorOf) => {
        const colW = CONTENT_W / cols
        let col = 0
        for (const t of list) {
            if (col === 0) need(ROW_H)
            const x = M + col * colW
            put(doc, prettyName(t.name), x, y + 3.3, { size: 7, color: LABEL, maxW: colW - 17 })
            put(doc, textOf(t), x + colW - 3, y + 3.3, { size: 7, bold: true, color: colorOf(t), align: 'right', maxW: 15 })
            col++
            if (col >= cols) { y += ROW_H; col = 0 }
        }
        if (col) y += ROW_H
        y += 1
    }

    if (rows.device.length) { section('Device Information'); grid(rows.device, 2) }
    if (rows.battery.length) { section('Battery Information'); grid(rows.battery, 2) }
    if ((r.tests || []).length) {
        section('Device Testing Information')
        verdicts(r.tests, 4, t => verdictText(t.result), t => verdictColor(t.result))
        need(4)
        put(doc, 'PASS = passed · FAIL = failed · WARNING = check · N/T = not tested · N/S = not supported on the device', M, y + 2.6, { size: 6.2, color: GREY })
        y += 5
    }
    if ((r.parts || []).length) {
        section('Genuine Parts')
        verdicts(r.parts, 4, p => p.status || p.result || '—', p => (p.status === 'Genuine' ? GREEN : ORANGE))
    }
    if (rows.analyst.length) { section('Analyst Information'); grid(rows.analyst, 2) }
}

// Every item's report, each starting on a new page, numbered at the foot.
export function buildBlackbeltReportsPdf(items, { generatedAt = new Date() } = {}) {
    const list = (items || []).filter(i => i && i.report)
    if (!list.length) return null
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    list.forEach((item, i) => drawReport(doc, item, i === 0))
    const n = doc.getNumberOfPages()
    const when = generatedAt.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    for (let p = 1; p <= n; p++) {
        doc.setPage(p)
        put(doc, `From the Blackbelt report data · printed ${when}`, M, PAGE_H - 7, { size: 6.5, color: GREY })
        put(doc, `Page ${p} of ${n}`, PAGE_W - M, PAGE_H - 7, { size: 6.5, color: GREY, align: 'right' })
    }
    return doc
}

export function blackbeltReportsFileName(orderNo, count) {
    const clean = String(orderNo || 'devices').replace(/[^a-z0-9-]/gi, '')
    return `blackbelt_reports_${clean}_${count}-device${count === 1 ? '' : 's'}.pdf`
}
