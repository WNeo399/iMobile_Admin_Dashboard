// Zoho Inventory price list (pricebook) catalogue.
//
// The credit note flow needs to map a pricebook_id (the opaque
// numeric id Zoho stores on each line item) back to the human-readable
// price-list name we use in conversation ("VIP", "WholeSale", etc.).
// Other Zoho-side flows in the dashboard will likely need the same
// mapping, so it lives here as a shared module rather than buried in
// any one component.
//
// To add a new price list: drop another entry into PRICE_LIST_IDS
// using the human label as the key, then rebuild — the reverse-lookup
// helpers below pick it up automatically.

// Canonical map: human label → Zoho pricebook_id.
// Source: Zoho Inventory → Items → Price Lists. The ids are stable
// per org so they're safe to hard-code (Zoho doesn't recycle them).
export const PRICE_LIST_IDS = Object.freeze({
    VIP:       '2591985000000103001',
    SVIP:      '2591985000078196985',
    Platinum:  '2591985000001439015',
    WholeSale: '2591985000000103011'
})

// Reverse lookup built once at module load — id → label. Frozen so
// callers can't accidentally mutate the shared cache.
const ID_TO_LABEL = Object.freeze(
    Object.entries(PRICE_LIST_IDS).reduce((acc, [label, id]) => {
        acc[id] = label
        return acc
    }, {})
)

// Resolve a pricebook_id to its human label. Returns the id back
// (stringified) when the id isn't in our known catalogue so the UI
// can still show *something* useful instead of blanking out — staff
// can spot an unfamiliar id and add it to the map above.
export function priceListLabel(pricebookId) {
    if (pricebookId == null || pricebookId === '') return ''
    return ID_TO_LABEL[String(pricebookId)] || String(pricebookId)
}

// True when we recognise this pricebook_id — handy for styling
// (e.g. show an "unknown" badge in muted gray instead of the regular
// chip style).
export function isKnownPriceList(pricebookId) {
    return Boolean(ID_TO_LABEL[String(pricebookId)])
}
