// OZ order sheet parser + row resolver — pure functions, no Vue / no
// network, so they're easy to reason about and unit-test against
// "OZ EXAMPLE.xlsx". See IMB-matching-feature-strategy.md §2–3.
//
// Pipeline: parseWorkbook(arrayBuffer) -> { columns, gradeRow, dataRows }
//           resolveRows(parsed)        -> ResolvedLine[]
// The matched lookup against imb_products happens server-side
// (POST /catalogue/match); these functions only get the sheet into the
// ResolvedLine shape that endpoint expects.

import * as XLSX from 'xlsx-js-style'

// Part columns that map directly to a category. Order matters only for
// "which part is this row about" detection (first truthy wins).
const PART_COLUMN_CATEGORY = {
    'frame': 'frame',
    'screen': 'screen',
    'battery': 'battery',
    'charging port': 'charging-port'
}

// Free-text "Other" column → category mapping (lowercase contains-match).
// `gradeFrom` says where to source the grade: a part-column name to read
// from the Product Grade row, or null to use the default quality.
const OTHER_TEXT_MAP = [
    { match: 'back glass', category: 'back-cover-glass', gradeFrom: null, defaultQuality: 'Original' },
    { match: 'back cover', category: 'back-cover-glass', gradeFrom: null, defaultQuality: 'Original' },
    { match: 'housing', category: 'frame', gradeFrom: 'frame', defaultQuality: 'No Small Parts' },
    { match: 'charging', category: 'charging-port', gradeFrom: 'charging port', defaultQuality: 'Original' }
]
const OTHER_FALLBACK = { category: 'other', defaultQuality: 'Original' }

// Grade text → canonical quality name (lowercase contains-match, first
// hit wins so order longer-before-shorter where they'd overlap).
const GRADE_TO_QUALITY = [
    { match: 'no small parts', quality: 'No Small Parts' },
    { match: 'jk+ soft oled', quality: 'JK+' },
    { match: 'jk+', quality: 'JK+' },
    { match: 'imb+', quality: 'IMB+' },
    { match: 'imb soft oled', quality: 'IMB Soft Oled' },
    { match: 'service pack', quality: 'Service Pack' },
    { match: 'refurbished', quality: 'Refurbished' },
    { match: 'original', quality: 'Original' },
    { match: 'a+', quality: 'A+' }
]

// ── Parsing ─────────────────────────────────────────────────────────

// Parse an .xlsx ArrayBuffer into the structured rows we need. Detects
// the header + Product Grade rows dynamically (their position isn't
// fixed — strategy §8).
export function parseWorkbook(arrayBuffer) {
    const wb = XLSX.read(arrayBuffer, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    // header:1 → array of arrays; defval:'' so missing cells are stable.
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })

    // Header row = the one containing both "Model" and "Screen".
    let headerIdx = -1
    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].map(c => String(c).trim().toLowerCase())
        if (cells.includes('model') && cells.includes('screen')) {
            headerIdx = i
            break
        }
    }
    if (headerIdx === -1) {
        throw new Error('Could not find the header row (needs "Model" and "Screen" columns).')
    }

    // Build a column-name → index map from the header row.
    const header = rows[headerIdx].map(c => String(c).trim())
    const columns = {}
    header.forEach((name, idx) => {
        if (name) columns[name.toLowerCase()] = idx
    })

    // Sheet date — used on the printed labels. The OZ sheet carries a
    // "Date:" row above the header; scan the pre-header rows for a
    // dd/mm/yyyy-ish token. Left blank when absent (the label
    // generator falls back to today).
    let sheetDate = ''
    for (let i = 0; i <= headerIdx; i++) {
        const joined = rows[i].map(c => String(c == null ? '' : c)).join(' ')
        if (/date/i.test(joined)) {
            const m = joined.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/)
            if (m) { sheetDate = m[1]; break }
        }
    }

    // Product Grade row = first row after the header whose first non-empty
    // cell starts with "product grade".
    let gradeIdx = -1
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const first = String((rows[i].find(c => String(c).trim() !== '')) || '').trim().toLowerCase()
        if (first.startsWith('product grade')) {
            gradeIdx = i
            break
        }
    }
    const gradeRow = gradeIdx !== -1 ? rows[gradeIdx] : null

    // Data rows are everything after the grade row (or after the header if
    // no grade row), skipping blanks. A row counts as data when its
    // Job Number cell is non-empty — empty / spacer rows in the sheet
    // have no job number, so this drops them. Falls back to the Model
    // column only if the sheet has no Job Number column at all.
    const dataStart = gradeIdx !== -1 ? gradeIdx + 1 : headerIdx + 1
    const jobIdx = columns['job number']
    const modelIdx = columns['model']
    const keyIdx = jobIdx != null ? jobIdx : modelIdx
    const dataRows = []
    for (let i = dataStart; i < rows.length; i++) {
        const row = rows[i]
        const key = keyIdx != null ? String(row[keyIdx] == null ? '' : row[keyIdx]).trim() : ''
        if (!key) continue
        dataRows.push(row)
    }

    return { columns, gradeRow, dataRows, sheetDate }
}

// ── Resolution ──────────────────────────────────────────────────────

export function resolveRows(parsed) {
    const { columns, gradeRow, dataRows, sheetDate } = parsed
    const cell = (row, colName) => {
        const idx = columns[colName]
        return idx != null ? String(row[idx] == null ? '' : row[idx]).trim() : ''
    }
    const gradeCell = (colName) => {
        if (!gradeRow) return ''
        const idx = columns[colName]
        return idx != null ? String(gradeRow[idx] == null ? '' : gradeRow[idx]).trim() : ''
    }

    const out = []
    for (const row of dataRows) {
        const modelName = cell(row, 'model')
        const brandName = cell(row, 'brand')
        const colorRaw = cell(row, 'color')
        const jobNumber = cell(row, 'job number')

        // Which part is this row about? First truthy part column wins;
        // otherwise fall back to the Other free-text column.
        let category = null
        let source = ''
        let gradeText = ''
        // partsLabel = the part exactly as the buyer wrote it, for the
        // printed label: the column name for part columns, the raw Other
        // text otherwise (so "Back Glass" prints as "Back Glass", not the
        // normalised "Back Cover Glass").
        let partsLabel = ''

        for (const colName of Object.keys(PART_COLUMN_CATEGORY)) {
            if (isTruthy(cell(row, colName))) {
                category = PART_COLUMN_CATEGORY[colName]
                source = colName
                gradeText = gradeCell(colName)
                partsLabel = prettyCategory(category)
                break
            }
        }

        if (!category) {
            const other = cell(row, 'other')
            if (other) {
                const mapped = matchOther(other)
                category = mapped.category
                source = `other:${other}`
                gradeText = mapped.gradeFrom ? gradeCell(mapped.gradeFrom) : ''
                // No grade text resolvable → use the mapping's default.
                if (!gradeText) gradeText = mapped.defaultQuality
                partsLabel = other
            }
        }

        // No identifiable part — skip (garbage / notes-only row).
        if (!category) continue

        const requestedQuality = gradeToQuality(gradeText)
        const isScreen = category === 'screen'
        // Device for the label = "Brand Model" (e.g. "Apple iPhone 17").
        const device = [brandName, modelName].filter(Boolean).join(' ').trim() || modelName

        out.push({
            model_id: normalizeModelId(modelName),
            color: isScreen ? null : normalizeColor(colorRaw),
            category,
            requestedQuality,
            source,
            // Carry the human-readable model + part for the results table.
            _display: {
                model: modelName,
                part: prettyCategory(category),
                requestedGrade: requestedQuality
            },
            // Verbatim fields for the printable job label — independent
            // of SKU matching (a label prints even for NO_PART rows).
            _label: {
                jobNumber,
                device,
                color: colorRaw,
                parts: partsLabel,
                date: sheetDate || ''
            }
        })
    }
    return out
}

// ── Normalizers (exported for tests) ────────────────────────────────

// §3a: strip "iPhone", slugify the remainder, re-prefix "iphone-".
// "iPhone 16 Pro Max" -> "iphone-16-pro-max"; "16e" -> "iphone-16e".
export function normalizeModelId(name) {
    const stripped = String(name || '')
        .toLowerCase()
        .replace(/iphone/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    return stripped ? `iphone-${stripped}` : ''
}

// §3b: hyphens → spaces, collapse, trim. Returns null when blank so the
// matcher treats it as "no colour requested".
export function normalizeColor(raw) {
    const c = String(raw || '')
        .replace(/-/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    return c || null
}

// Grade text → canonical quality (lowercase contains-match). Falls back
// to the raw trimmed text so an unmapped grade still gets matched
// verbatim against the catalogue (and surfaces as NO_QUALITY with the
// real available list if it doesn't exist).
export function gradeToQuality(gradeText) {
    const t = String(gradeText || '').trim().toLowerCase()
    if (!t) return ''
    for (const rule of GRADE_TO_QUALITY) {
        if (t.includes(rule.match)) return rule.quality
    }
    return String(gradeText).trim()
}

function matchOther(text) {
    const t = String(text || '').toLowerCase()
    for (const rule of OTHER_TEXT_MAP) {
        if (t.includes(rule.match)) return rule
    }
    return OTHER_FALLBACK
}

// "false" / "0" / "" / "no" → not selected; anything else → selected.
function isTruthy(v) {
    const t = String(v == null ? '' : v).trim().toLowerCase()
    if (!t) return false
    if (t === 'false' || t === '0' || t === 'no' || t === 'n') return false
    return true
}

function prettyCategory(cat) {
    return {
        'frame': 'Frame',
        'screen': 'Screen',
        'battery': 'Battery',
        'charging-port': 'Charging Port',
        'back-cover-glass': 'Back Cover Glass',
        'other': 'Other'
    }[cat] || cat
}
