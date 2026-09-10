// Collection criteria builder — compile and STRICT parse.
//
// The raw Zoho Analytics criteria string is the ONLY stored form; the
// builder's rows are recovered by parsing it on load. That is safe
// because compile() emits a rigid canonical grammar and parse() accepts
// nothing else — plus the dialog only trusts a parse when re-compiling
// the parsed rows reproduces the stored string byte-for-byte. Anything
// hand-written that deviates (extra spaces, unknown columns, other
// functions) simply opens in Advanced mode, untouched.
//
// Canonical grammar, exactly as compile() writes it:
//   ["Status" = 'Active' AND ]body
//   body     = group | (group) OR (group) OR ...   (parens only when a
//              group has >1 clause; whole body parenthesised only when
//              ORs exist AND the Active prefix is present)
//   clause   = LOWER("<text col>") <op> '<value>'      (value lowercased)
//            | "Category ID" =|!= '<id>'
//   op       = = | != | LIKE '%v%' | NOT LIKE '%v%' | LIKE 'v%'
// Uppercase " AND "/" OR " can never appear inside a value (text values
// are lowercased, category values are ids), so top-level splitting on
// them is unambiguous.

export const CRITERIA_FIELDS = [
    { key: "name", label: "Product Name", column: "Item Name", input: "text" },
    { key: "location", label: "Location", column: "Location", input: "text" },
    { key: "category", label: "Category", column: "Category ID", input: "category" },
    { key: "classification", label: "Classification (Tag)", column: "Classification", input: "text" },
    { key: "brand", label: "Brand", column: "Brand", input: "text" }
];

export const CRITERIA_OPS = [
    { key: "eq", label: "is", tpl: (c, v) => `${c} = '${v}'` },
    { key: "ne", label: "is not", tpl: (c, v) => `${c} != '${v}'` },
    { key: "contains", label: "contains", tpl: (c, v) => `${c} LIKE '%${v}%'` },
    { key: "ncontains", label: "doesn't contain", tpl: (c, v) => `${c} NOT LIKE '%${v}%'` },
    { key: "starts", label: "starts with", tpl: (c, v) => `${c} LIKE '${v}%'` }
];

const ACTIVE_PREFIX = `"Status" = 'Active' AND `;
const esc = v => String(v).replace(/'/g, "''");
const unesc = v => String(v).replace(/''/g, "'");

// rows: [{ field, op, value, join }] — join is 'and'/'or' vs the PREVIOUS
// row (first row's ignored). Rows are assumed valid (the dialog filters).
export function compileCriteria(rows, activeOnly) {
    if (!rows.length) return "";
    const clause = r => {
        const f = CRITERIA_FIELDS.find(x => x.key === r.field);
        const o = CRITERIA_OPS.find(x => x.key === r.op);
        const isText = f.input !== "category";
        // Analytics LIKE and = are case-sensitive — text matches are
        // wrapped in LOWER() with a lowercased value so users never
        // trip on casing. Category ids compare exactly.
        const col = isText ? `LOWER("${f.column}")` : `"${f.column}"`;
        const val = esc(isText ? String(r.value).trim().toLowerCase() : String(r.value).trim());
        return o.tpl(col, val);
    };
    const groups = [];
    let current = [];
    rows.forEach((r, i) => {
        if (i > 0 && r.join === "or") { groups.push(current); current = []; }
        current.push(clause(r));
    });
    groups.push(current);
    let body;
    if (groups.length === 1) {
        body = groups[0].join(" AND ");
    } else {
        body = groups.map(g => (g.length > 1 ? `(${g.join(" AND ")})` : g[0])).join(" OR ");
    }
    if (!activeOnly) return body;
    return ACTIVE_PREFIX + (groups.length > 1 ? `(${body})` : body);
}

// Split on a separator at paren-depth 0, outside quoted strings.
function splitTop(s, sep) {
    const parts = [];
    let depth = 0, inQ = false, cur = "", i = 0;
    while (i < s.length) {
        const ch = s[i];
        if (inQ) {
            if (ch === "'") {
                if (s[i + 1] === "'") { cur += "''"; i += 2; continue; }
                inQ = false;
            }
            cur += ch; i++; continue;
        }
        if (ch === "'") { inQ = true; cur += ch; i++; continue; }
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        if (depth === 0 && s.startsWith(sep, i)) { parts.push(cur); cur = ""; i += sep.length; continue; }
        cur += ch; i++;
    }
    parts.push(cur);
    return parts;
}

// Strip ONE pair of parentheses, only when they span the whole string.
function stripSpanningParens(s) {
    if (!s.startsWith("(") || !s.endsWith(")")) return s;
    let depth = 0, inQ = false;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (inQ) { if (ch === "'" && s[i + 1] !== "'") inQ = false; else if (ch === "'") i++; continue; }
        if (ch === "'") { inQ = true; continue; }
        if (ch === "(") depth++;
        else if (ch === ")") { depth--; if (depth === 0 && i < s.length - 1) return s; }
    }
    return s.slice(1, -1);
}

const TEXT_COLUMNS = {};
for (const f of CRITERIA_FIELDS) if (f.input === "text") TEXT_COLUMNS[f.column] = f.key;
const TEXT_COL_RE = Object.keys(TEXT_COLUMNS)
    .map(c => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const VALUE_RE = "((?:[^']|'')*)";

function parseClause(c) {
    let m = c.match(new RegExp(`^LOWER\\("(${TEXT_COL_RE})"\\) (=|!=) '${VALUE_RE}'$`));
    if (m) return { field: TEXT_COLUMNS[m[1]], op: m[2] === "=" ? "eq" : "ne", value: unesc(m[3]) };
    m = c.match(new RegExp(`^LOWER\\("(${TEXT_COL_RE})"\\) (LIKE|NOT LIKE) '${VALUE_RE}'$`));
    if (m) {
        const field = TEXT_COLUMNS[m[1]];
        const raw = m[3];
        if (/^%.+%$/.test(raw)) {
            const inner = raw.slice(1, -1);
            if (inner.includes("%")) return null;
            return { field, op: m[2] === "LIKE" ? "contains" : "ncontains", value: unesc(inner) };
        }
        if (m[2] === "LIKE" && /^.+%$/.test(raw) && !raw.slice(0, -1).includes("%")) {
            return { field, op: "starts", value: unesc(raw.slice(0, -1)) };
        }
        return null;
    }
    m = c.match(/^"Category ID" (=|!=) '([^']+)'$/);
    if (m) return { field: "category", op: m[1] === "=" ? "eq" : "ne", value: m[2] };
    return null;
}

// -> { ok, rows, activeOnly }. ok:false = not canonical builder output;
// the caller shows Advanced mode instead. Callers should additionally
// verify compileCriteria(rows, activeOnly) === the original text before
// trusting the rows (byte-identical round trip = provably lossless).
export function parseCriteria(text) {
    let s = String(text || "").trim();
    if (!s) return { ok: true, rows: [], activeOnly: true };
    let activeOnly = false;
    if (s.startsWith(ACTIVE_PREFIX)) { activeOnly = true; s = s.slice(ACTIVE_PREFIX.length); }
    s = stripSpanningParens(s);
    const rows = [];
    const orParts = splitTop(s, " OR ");
    for (let gi = 0; gi < orParts.length; gi++) {
        const group = stripSpanningParens(orParts[gi]);
        const clauses = splitTop(group, " AND ");
        for (let ci = 0; ci < clauses.length; ci++) {
            const r = parseClause(clauses[ci]);
            if (!r) return { ok: false, rows: [], activeOnly: true };
            r.join = ci === 0 && gi > 0 ? "or" : "and";
            rows.push(r);
        }
    }
    return { ok: true, rows, activeOnly };
}
