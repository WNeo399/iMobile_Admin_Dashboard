import request from '@/utils/request'

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
