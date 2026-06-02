import request from '@/utils/request'

// Upload a PO PDF and get back the parsed line items + SKU lookups.
//
// Explicit Content-Type override is required because src/utils/request.js
// sets `axios.defaults.headers['Content-Type'] = 'application/json…'`
// globally. Without overriding, axios sees the default is already set and
// doesn't rewrite the header for the FormData body, so multer on the
// backend can't recognise the multipart payload and req.file ends up
// undefined. Setting it to 'multipart/form-data' here makes axios append
// the boundary parameter from the actual FormData instance.
export function parseBuzztechPdf(formData) {
    return request({
        url: '/zoho/buzztech/parsePdf',
        method: 'post',
        data: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
        // 60s — PDF parse + Analytics lookup can take a moment for large POs
        timeout: 60000
    })
}

// Submit the reviewed payload to the standalone sales-order create endpoint.
// Re-using /zoho/salesOrder/create means a single source of truth for how SOs
// are actually placed in Zoho.
export function createBuzztechSalesOrder(data) {
    return request({
        url: '/zoho/salesOrder/create',
        method: 'post',
        data,
        timeout: 30000
    })
}

// Attach a file to an existing Zoho sales order. `formData` is a FormData
// instance with `salesOrderId` and `file` fields. Same Content-Type override
// reason as parseBuzztechPdf — the project's request wrapper hard-codes a
// JSON content-type that we need to displace so axios injects the multipart
// boundary.
export function attachToBuzztechOrder(formData) {
    return request({
        url: '/zoho/salesOrder/attach',
        method: 'post',
        data: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000
    })
}
