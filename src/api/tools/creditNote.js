import request from '@/utils/request'

// Paginated list of credit-note rows for the /imobile/creditNote page.
// `params` accepts { status, search, page, pageSize }. Returns the data
// array plus a `counts` rollup so the tree-panel badges can render
// without a second round trip.
export function listCreditNotes(params) {
    return request({
        url: '/creditNote/list',
        method: 'get',
        params,
        timeout: 30000
    })
}

// Push the user's matched line items + edited note into the existing
// Zoho Inventory credit note, then re-attach the S3 PDF. On success
// the row's status flips to "completed" server-side. `data` is
// { items: [{matchedItemId, matchedSku, matchedName, quantity}, ...], note }.
export function submitCreditNoteToZoho(id, data) {
    return request({
        url: `/creditNote/${id}/submitToZoho`,
        method: 'post',
        data,
        timeout: 120000
    })
}

// Partial update for OCR-extracted fields the user can correct from
// the Review dialog. `data` is { creditNo?, items? }; only the keys
// you pass get touched server-side, and `items` is always sent as the
// full array (last-write-wins). Backend returns the updated row.
//
// Mapped to PATCH on the backend; the shared axios helper doesn't ship
// with an explicit `patch` shorthand, but `method: 'patch'` works the
// same since it just lowercases the verb internally.
export function updateCreditNote(id, data) {
    return request({
        url: `/creditNote/${id}`,
        method: 'patch',
        data,
        timeout: 30000
    })
}

// Delete a credit-note row from imb_credit_note and best-effort
// remove the associated PDF from S3. Backend returns
// { success: true, s3: { ok, message?, skipped? } } so the caller
// can warn the user if the S3 cleanup didn't land while still
// treating the overall delete as successful (the DB row is the
// primary index — leaving the PDF in S3 is recoverable).
export function deleteCreditNote(id) {
    return request({
        url: `/creditNote/${id}`,
        method: 'delete',
        timeout: 30000
    })
}

// Look up the Zoho Inventory credit note tied to this row's creditNo
// and return the fetched detail. Called on Review dialog open (and on
// every creditNo edit) so the dialog can show customer + price list,
// and so the submit path can skip the second Zoho fetch by passing
// the cached detail back in. Response shape:
//   { success, zohoCreditNoteId, customerName, customerId,
//     pricebookId, status, detail }
// `detail` is the full creditnote object verbatim from Zoho — the
// frontend just holds onto it and forwards on submit.
export function getCreditNoteZohoDetail(id) {
    return request({
        url: `/creditNote/${id}/zohoDetail`,
        method: 'get',
        // Zoho's resolve+fetch chain can be slow when Inventory misses
        // and we fall back to Analytics. Generous timeout matches the
        // submit endpoint's tolerance for the same chain.
        timeout: 60000
    })
}


// Submit a multi-image credit-note PDF to HandwritingOCR via our own
// backend. The frontend never sees the OCR token — the backend reads
// HANDWRITING_OCR_TOKEN from .env and adds the bearer header. `form`
// must be a FormData with a `data` field carrying the PDF blob.
//
// The explicit Content-Type override is required: src/utils/request.js
// sets `axios.defaults.headers['Content-Type'] = 'application/json…'`
// globally, and without displacing it the request goes out as JSON.
// express.json on the backend then consumes the body before multer can
// see it, so req.file is undefined and the endpoint returns "No file
// uploaded". Setting Content-Type to 'multipart/form-data' here tells
// axios to skip the JSON default; the browser fills in the
// `; boundary=...` parameter from the FormData instance for us.
export function submitCreditNote(form) {
    return request({
        url: '/creditNote/submit',
        method: 'post',
        data: form,
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000
    })
}
