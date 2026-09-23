import request from '@/utils/request'

// Spare Parts Purchase — the in-app purchase process (orders SP-…, shipment
// batches PB-…). Backend: routes/sparePartsPurchaseRoutes.

const BASE = '/sparePartsPurchase'

// The pick lists: categories and the 供应商 options.
export function getMeta() {
  return request({ url: `${BASE}/meta`, method: 'get' })
}

// ── Orders ───────────────────────────────────────────────────────────
export function listOrders(params) {
  return request({ url: `${BASE}/orders`, method: 'get', params })
}
export function getOrder(id) {
  return request({ url: `${BASE}/orders/${id}`, method: 'get' })
}
// lines: [{ itemId, sku, productName, imageId, category, orderQty, note }]
export function createOrders(lines) {
  return request({ url: `${BASE}/orders`, method: 'post', data: { lines } })
}
// note any time; orderQty / category while pending
export function updateOrder(id, data) {
  return request({ url: `${BASE}/orders/${id}`, method: 'put', data })
}
// { unitPrice, toConfirm?, note? } — with toConfirm the line parks in To Confirm
export function quoteOrder(id, data) {
  return request({ url: `${BASE}/orders/${id}/quote`, method: 'post', data })
}
// 待确认: parked for a decision, the note says what needs confirming
export function toConfirmOrder(id, note) {
  return request({ url: `${BASE}/orders/${id}/to-confirm`, method: 'post', data: { note } })
}
// decision made: back to where the line came from
export function confirmOrder(id, note) {
  return request({ url: `${BASE}/orders/${id}/confirm`, method: 'post', data: { note } })
}
export function placeOrder(id, data) {
  return request({ url: `${BASE}/orders/${id}/place`, method: 'post', data })
}
// ── Order batches (下单批次) ─────────────────────────────────────────
export function listOrderBatches(params) {
  return request({ url: `${BASE}/order-batches`, method: 'get', params })
}
export function getOrderBatch(id) {
  return request({ url: `${BASE}/order-batches/${id}`, method: 'get' })
}
// { supplier, note, orderIds } — the selected pending lines placed as one batch
export function createOrderBatch(data) {
  return request({ url: `${BASE}/order-batches`, method: 'post', data })
}
// { lines: [{ orderId, unitPrice }] } — the supplier's prices onto the lines
export function priceOrderBatch(id, data) {
  return request({ url: `${BASE}/order-batches/${id}/prices`, method: 'put', data })
}
export function shortageOrder(id, note) {
  return request({ url: `${BASE}/orders/${id}/shortage`, method: 'post', data: { note } })
}
export function cancelOrder(id, note) {
  return request({ url: `${BASE}/orders/${id}/cancel`, method: 'post', data: { note } })
}
export function reopenOrder(id) {
  return request({ url: `${BASE}/orders/${id}/reopen`, method: 'post' })
}
// Scan-to-batch: the oldest waiting line for a SKU, skipping `exclude` ids.
export function lookupOrder(sku, exclude) {
  return request({ url: `${BASE}/orders/lookup`, method: 'get', params: { sku, exclude: (exclude || []).join(',') } })
}
// The ordered / pending lines waiting to ship (the batch picker).
export function openLines(search) {
  return request({ url: `${BASE}/orders/open-lines`, method: 'get', params: { search } })
}
// Live parts from the stock register, by name or SKU.
export function searchProducts(q) {
  return request({ url: `${BASE}/products/search`, method: 'get', params: { q } })
}
export function purchasesByItemIds(itemIds) {
  return request({ url: `${BASE}/byItemIds`, method: 'post', data: { itemIds } })
}

// ── Batches ──────────────────────────────────────────────────────────
export function listBatches(params) {
  return request({ url: `${BASE}/batches`, method: 'get', params })
}
export function getBatch(idOrNo) {
  return request({ url: `${BASE}/batches/${idOrNo}`, method: 'get' })
}
// { tracking, shippedAt (YYYY-MM-DD), note, lines: [{ orderId, qty, supplier, unitPrice }] }
// — ships straight away; with draft: true it is saved as a draft instead.
export function createBatch(data) {
  return request({ url: `${BASE}/batches`, method: 'post', data, timeout: 90000 })
}
export function updateBatchDraft(id, data) {
  return request({ url: `${BASE}/batches/${id}/draft`, method: 'put', data })
}
export function shipBatchDraft(id, data) {
  return request({ url: `${BASE}/batches/${id}/ship`, method: 'post', data, timeout: 90000 })
}
export function discardBatchDraft(id) {
  return request({ url: `${BASE}/batches/${id}`, method: 'delete' })
}
export function updateBatch(id, data) {
  return request({ url: `${BASE}/batches/${id}`, method: 'put', data })
}
// { receivedAt (YYYY-MM-DD), note, lines: [{ orderId, receivedQty }] }
export function receiveBatch(id, data) {
  return request({ url: `${BASE}/batches/${id}/receive`, method: 'post', data })
}
export function cancelBatch(id) {
  return request({ url: `${BASE}/batches/${id}/cancel`, method: 'post' })
}
// Create the Zoho Inventory PO(s) a batch is still missing.
export function retryBatchZoho(id) {
  return request({ url: `${BASE}/batches/${id}/zoho`, method: 'post', timeout: 60000 })
}
