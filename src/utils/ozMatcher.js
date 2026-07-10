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
    // "Back Cover" → the High Quality with Lens cover (the better stock). The
    // backend falls back to Original when a model doesn't carry that grade.
    { match: 'back cover', category: 'back-cover-glass', gradeFrom: null, defaultQuality: 'High Quality with Lens' },
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

    // Detect the header row AND which format the sheet is:
    //  • perRow — the in-store repairs export: one row per device, carrying a
    //    SKU + Fault notes column (model parsed from the SKU, part from the fault).
    //  • grid   — the older OZ sheet: a Model column + one column per part, with
    //    a "Product Grade" row.
    let headerIdx = -1
    let format = null
    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].map(c => String(c).trim().toLowerCase())
        if (cells.includes('sku') && cells.some(c => c.includes('fault'))) { headerIdx = i; format = 'perRow'; break }
        if (cells.includes('model') && cells.includes('screen')) { headerIdx = i; format = 'grid'; break }
    }
    if (headerIdx === -1) {
        throw new Error('Could not find a recognised header row (need "SKU" + "Fault notes", or "Model" + "Screen").')
    }

    // Build a column-name → index map from the header row (trailing spaces in
    // headers like "SKU " / "Fault notes " are trimmed away).
    const header = rows[headerIdx].map(c => String(c).trim())
    const columns = {}
    header.forEach((name, idx) => {
        if (name) columns[name.toLowerCase()] = idx
    })

    // Optional "Date:" row above the header (older sheets) — used on labels.
    // Left blank when absent (the label generator falls back to today).
    let sheetDate = ''
    for (let i = 0; i <= headerIdx; i++) {
        const joined = rows[i].map(c => String(c == null ? '' : c)).join(' ')
        if (/date/i.test(joined)) {
            const m = joined.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/)
            if (m) { sheetDate = m[1]; break }
        }
    }

    // Product Grade row — only the grid format has one.
    let gradeIdx = -1
    if (format === 'grid') {
        for (let i = headerIdx + 1; i < rows.length; i++) {
            const first = String((rows[i].find(c => String(c).trim() !== '')) || '').trim().toLowerCase()
            if (first.startsWith('product grade')) { gradeIdx = i; break }
        }
    }
    const gradeRow = gradeIdx !== -1 ? rows[gradeIdx] : null

    // Data rows. perRow: any row with a SKU. grid: rows keyed by Job Number (or
    // Model), starting after the grade row. Blank / spacer rows are dropped.
    const dataRows = []
    if (format === 'perRow') {
        const skuIdx = columns['sku']
        for (let i = headerIdx + 1; i < rows.length; i++) {
            const sku = skuIdx != null ? String(rows[i][skuIdx] == null ? '' : rows[i][skuIdx]).trim() : ''
            if (!sku) continue
            dataRows.push(rows[i])
        }
    } else {
        const dataStart = gradeIdx !== -1 ? gradeIdx + 1 : headerIdx + 1
        const keyIdx = columns['job number'] != null ? columns['job number'] : columns['model']
        for (let i = dataStart; i < rows.length; i++) {
            const key = keyIdx != null ? String(rows[i][keyIdx] == null ? '' : rows[i][keyIdx]).trim() : ''
            if (!key) continue
            dataRows.push(rows[i])
        }
    }

    return { format, columns, gradeRow, dataRows, sheetDate }
}

// ── Resolution ──────────────────────────────────────────────────────

export function resolveRows(parsed) {
    return parsed.format === 'perRow' ? resolvePerRow(parsed) : resolveGrid(parsed)
}

// ── perRow format (in-store repairs export) ─────────────────────────
// One device per row. Model comes from the SKU, the part from the Fault notes,
// the job number from "Po Device", and the colour from the Color column. The
// sheet carries no part grade, so requestedQuality is left blank (the buyer
// picks a grade per line in the review step).
function resolvePerRow(parsed) {
    const { columns, dataRows, sheetDate } = parsed
    const cell = (row, colName) => {
        const idx = columns[colName]
        return idx != null ? String(row[idx] == null ? '' : row[idx]).trim() : ''
    }

    const out = []
    for (const row of dataRows) {
        const sku = cell(row, 'sku')
        const parsedSku = parseSku(sku)
        if (!parsedSku || !parsedSku.modelTokens.length) continue

        const faultText = cell(row, 'fault notes')
        const part = faultToPart(faultText)
        if (!part) continue // no fault → nothing to order

        const category = part.category
        // Device colour (from the Color column, falling back to the SKU) — kept on
        // the printed label even for colourless parts, since it identifies the phone.
        const colorRaw = cell(row, 'color') || prettyWords(parsedSku.colorTokens)
        const jobNumber = cell(row, 'po device')
        const no = cell(row, 'no')
        // "Other" faults (e.g. "Rear Microphone") keep the buyer's wording and are
        // resolved by picking the product; known parts show the category name.
        const partsLabel = part.other ? faultText : prettyCategory(category)
        const source = part.other ? `other:${faultText}` : category
        // Standard grade per part (buyer can still change it in review).
        const requestedQuality = part.other ? '' : (PART_DEFAULT_QUALITY[category] || '')

        out.push({
            model_id: normalizeModelId(parsedSku.modelName, parsedSku.brand),
            // Colourless parts (screen / battery / charging port) match on
            // model + grade only — a battery isn't "Desert Titanium".
            color: COLOURLESS_CATEGORIES.has(category) ? null : normalizeColor(colorRaw),
            category,
            requestedQuality,
            source,
            _display: {
                model: prettyModel(parsedSku.modelTokens),
                part: partsLabel,
                requestedGrade: requestedQuality
            },
            _label: {
                no,
                jobNumber,
                device: prettyDevice(parsedSku.brand, parsedSku.modelTokens),
                color: colorRaw,
                parts: partsLabel,
                date: sheetDate || ''
            }
        })
    }
    return out
}

// ── grid format (original OZ sheet) ─────────────────────────────────
function resolveGrid(parsed) {
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
                gradeText = mapped.gradeFrom ? gradeCell(mapped.gradeFrom) : ''
                // No grade text resolvable → use the mapping's default.
                if (!gradeText) gradeText = mapped.defaultQuality
                if (mapped === OTHER_FALLBACK) {
                    // Truly miscellaneous (no real catalogue category) — keep
                    // the buyer's wording and flag it "other" so the UI offers
                    // a product picker.
                    source = `other:${other}`
                    partsLabel = other
                } else {
                    // Maps to a real catalogue category (e.g. "Back Glass" →
                    // Back Cover Glass) — treat it like a standard part column:
                    // show the category name and use the grade/colour re-pick,
                    // not the "Other" product picker.
                    source = category
                    partsLabel = prettyCategory(category)
                }
            }
        }

        // No identifiable part — skip (garbage / notes-only row).
        if (!category) continue

        const requestedQuality = gradeToQuality(gradeText)
        const isScreen = category === 'screen'
        // Device for the label = "Brand Model" (e.g. "Apple iPhone 17").
        const device = [brandName, modelName].filter(Boolean).join(' ').trim() || modelName

        out.push({
            model_id: normalizeModelId(modelName, brandName),
            color: isScreen ? null : normalizeColor(colorRaw),
            category,
            requestedQuality,
            source,
            // Carry the human-readable model + part for the results table.
            // Use `partsLabel` (the part exactly as the buyer wrote it) rather
            // than the normalised category, so a free-text Other value like
            // "Sim Tray" / "Back Glass" shows verbatim instead of "Other".
            _display: {
                model: modelName,
                part: partsLabel || prettyCategory(category),
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

// ── perRow helpers ──────────────────────────────────────────────────

// Split a full SKU into brand / model / colour tokens. The SKU shape is
//   BRAND-MODEL…-<storage>-COLOUR…-GRADE-<x>
// e.g. APPLE-IPHONE-16-PRO-MAX-256GB-DESERT-TITANIUM-GRADE-A. The storage token
// (\d+GB/TB) bounds the model; the trailing GRADE-x is the DEVICE grade (not a
// part grade) and is ignored. Returns null for an unparseable SKU.
export function parseSku(sku) {
    const tokens = String(sku || '').split('-').map(t => t.trim()).filter(Boolean)
    if (tokens.length < 2) return null
    const brand = tokens[0]
    const storageIdx = tokens.findIndex(t => /^\d+(gb|tb)$/i.test(t))
    const gradeIdx = tokens.findIndex(t => /^grade$/i.test(t))
    const modelEnd = storageIdx >= 0 ? storageIdx : (gradeIdx >= 0 ? gradeIdx : tokens.length)
    const modelTokens = tokens.slice(1, modelEnd)
    const colorStart = storageIdx >= 0 ? storageIdx + 1 : modelEnd
    const colorEnd = gradeIdx >= 0 ? gradeIdx : tokens.length
    const colorTokens = tokens.slice(colorStart, colorEnd)
    return { brand, modelTokens, colorTokens, modelName: modelTokens.join(' ') }
}

// Free-text fault → catalogue part category (lowercase contains-match, first
// hit wins). "Middel/Middle Frame" → frame, "Charging Port" → charging-port,
// etc. Anything unrecognised (e.g. "Rear Microphone") becomes an "other" line
// the buyer maps by hand.
const FAULT_TO_PART = [
    { match: 'screen', category: 'screen' },
    { match: 'lcd', category: 'screen' },
    { match: 'display', category: 'screen' },
    { match: 'battery', category: 'battery' },
    { match: 'charge', category: 'charging-port' },
    { match: 'charging', category: 'charging-port' },
    { match: 'frame', category: 'frame' },
    { match: 'housing', category: 'frame' },
    { match: 'back glass', category: 'back-cover-glass' },
    { match: 'back cover', category: 'back-cover-glass' },
    { match: 'rear glass', category: 'back-cover-glass' }
]
export function faultToPart(faultText) {
    const t = String(faultText || '').trim().toLowerCase()
    if (!t) return null
    for (const rule of FAULT_TO_PART) {
        if (t.includes(rule.match)) return { category: rule.category, other: false }
    }
    return { category: 'other', other: true }
}

// The new export carries no part grade, so we apply the business's standard
// grade per part (canonical quality names, same as the old sheet's usage):
//   Screen → JK+ · Battery → IMB+ · Frame → No Small Parts.
// The buyer can still change any line's grade in the review step. "Other" faults
// have no default (they're mapped to a product by hand).
const PART_DEFAULT_QUALITY = {
    'screen': 'JK+',
    'battery': 'IMB+',
    'frame': 'No Small Parts',
    'charging-port': 'Original',
    'back-cover-glass': 'Original'
}

// Parts that have no colour variant — matched on model + grade only. The rest
// (frame, back cover glass) carry the device colour.
const COLOURLESS_CATEGORIES = new Set(['screen', 'battery', 'charging-port'])

// Display prettifiers for the SKU's UPPERCASE tokens (labels + review table).
const BRAND_PRETTY = {
    apple: 'Apple', samsung: 'Samsung', google: 'Google', huawei: 'Huawei',
    oppo: 'OPPO', xiaomi: 'Xiaomi', motorola: 'Motorola', nokia: 'Nokia', oneplus: 'OnePlus'
}
const MODEL_WORD_PRETTY = { iphone: 'iPhone', ipad: 'iPad', ipod: 'iPod', galaxy: 'Galaxy', macbook: 'MacBook' }
function titleWord(w) {
    const lw = String(w).toLowerCase()
    if (MODEL_WORD_PRETTY[lw]) return MODEL_WORD_PRETTY[lw]
    if (/\d/.test(w)) return String(w).toUpperCase() // model numbers: S24, 16, A55
    return lw.charAt(0).toUpperCase() + lw.slice(1)  // pro → Pro, max → Max
}
function prettyWords(tokens) {
    return (tokens || []).map(titleWord).join(' ')
}
function prettyModel(tokens) {
    return prettyWords(tokens)
}
function prettyDevice(brand, modelTokens) {
    const b = BRAND_PRETTY[String(brand).toLowerCase()] || titleWord(brand)
    return [b, prettyWords(modelTokens)].filter(Boolean).join(' ')
}

// ── Normalizers (exported for tests) ────────────────────────────────

// Build the catalogue model id (slug) from a sheet's model name. Brand-aware,
// because Apple and Samsung are keyed differently in imb_products_model:
//   Apple    "iPhone 16 Pro Max"        -> "iphone-16-pro-max"
//   Samsung  "Samsung Galaxy S24 Ultra" -> "galaxy-s24-ultra"
//            "Samsung S25 Ultra"        -> "galaxy-s25-ultra"  (Galaxy added)
// A trailing "(model number)" is dropped — catalogue ids never include it
// (e.g. "Galaxy S26 Ultra (S948)" is keyed "galaxy-s26-ultra"), and OZ sheets
// usually omit it anyway.
export function normalizeModelId(name, brand) {
    const lower = String(name || '').toLowerCase()
    const brandText = String(brand || '').toLowerCase()
    const isSamsung =
        brandText.includes('samsung') ||
        lower.includes('samsung') ||
        lower.includes('galaxy')

    if (isSamsung) {
        // Drop "(S948)"-style model numbers (catalogue ids omit them) and the
        // brand word, then ensure the "galaxy-" prefix the catalogue uses.
        let s = lower
            .replace(/\([^)]*\)/g, ' ')
            .replace(/samsung/g, ' ')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
        if (!s) return ''
        if (!s.startsWith('galaxy')) s = `galaxy-${s}`
        return s
    }

    // Apple — strip "iPhone", slugify, re-prefix "iphone-". Parentheticals are
    // kept here (e.g. "(2nd Gen)" is meaningful for the SE), matching the
    // original behaviour exactly.
    const stripped = lower
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
