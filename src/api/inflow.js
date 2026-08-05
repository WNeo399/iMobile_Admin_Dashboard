import request from '@/utils/request'

// InFlow — sales orders + customers.

export function getInflowOrders(query) {
  return request({ url: '/inflow/salesorders', method: 'get', params: query })
}

export function getInflowOrder(id) {
  return request({ url: `/inflow/salesorders/${id}`, method: 'get' })
}

export function recordInflowPayment(id, data) {
  return request({ url: `/inflow/salesorders/${id}/payment`, method: 'post', data })
}

// Available credit notes (for this order's customer) that can be applied.
export function getInflowOrderCredits(id) {
  return request({ url: `/inflow/salesorders/${id}/credits`, method: 'get' })
}

export function deleteInflowPayment(id, paymentId) {
  return request({ url: `/inflow/salesorders/${id}/payment/${paymentId}`, method: 'delete' })
}

export function getInflowCustomers(query) {
  return request({ url: '/inflow/customers', method: 'get', params: query })
}

export function getInflowFilters() {
  return request({ url: '/inflow/filters', method: 'get' })
}

// SKU mapping (barcode → iMobile warehouse SKU, per invoice) + warehouse dispatch
export function uploadInflowSkuMap(id, rows) {
  return request({ url: `/inflow/salesorders/${id}/skumap`, method: 'post', data: { rows }, timeout: 60000 })
}
export function getInflowDispatch(query) {
  return request({ url: '/inflow/dispatch', method: 'get', params: query })
}
export function setInflowDispatchQty(id, data) {
  return request({ url: `/inflow/dispatch/${id}/qty`, method: 'post', data })
}
// Record one warehouse dispatch batch (scanned picks): { lines: [{lineIndex, qty}], type? }
export function createInflowDispatchBatch(id, data) {
  return request({ url: `/inflow/dispatch/${id}/batch`, method: 'post', data })
}
// Update a recorded batch's quantities (qty 0 removes a line; all-zero deletes the batch)
export function updateInflowDispatchBatch(id, batchNo, data) {
  return request({ url: `/inflow/dispatch/${id}/batch/${batchNo}`, method: 'put', data })
}
// Manually uploaded dispatch lists (Excel + hand-typed invoice #), linkable
// to a real sales order later.
export function createInflowDispatchUpload(data) {
  return request({ url: '/inflow/dispatch/manual', method: 'post', data, timeout: 60000 })
}
// Unlinked manual records — the Sales Orders page's Link Dispatch picker.
export function getInflowDispatchUploads(query) {
  return request({ url: '/inflow/dispatch/manual', method: 'get', params: query })
}
// Outstanding (not yet fulfilled) stock grouped by SKU across all dispatch records.
export function getInflowOwingStocks(query) {
  return request({ url: '/inflow/dispatch/owing', method: 'get', params: query })
}

// Global customer-barcode → iMobile-SKU mapping list (map once, applied to
// existing orders on save and to future orders at webhook ingest).
export function getInflowSkuMap(query) {
  return request({ url: '/inflow/skumap', method: 'get', params: query })
}
export function saveInflowSkuMapping(data) {
  return request({ url: '/inflow/skumap', method: 'post', data })
}
export function importInflowSkuMap(rows) {
  return request({ url: '/inflow/skumap/import', method: 'post', data: { rows }, timeout: 60000 })
}
export function deleteInflowSkuMapping(id) {
  return request({ url: `/inflow/skumap/${id}`, method: 'delete' })
}
export function linkInflowDispatchUpload(id, data) {
  return request({ url: `/inflow/dispatch/manual/${id}/link`, method: 'post', data })
}
// Link/unlink a dispatch record to an existing customer ({ customerName } / { customerName: null })
export function setInflowDispatchCustomer(id, data) {
  return request({ url: `/inflow/dispatch/manual/${id}/customer`, method: 'post', data })
}
// The logged-in customer's own dispatch status (portal)
export function getMyInflowDispatch() {
  return request({ url: '/inflow/dispatch/mine', method: 'get' })
}
export function deleteInflowDispatchUpload(id) {
  return request({ url: `/inflow/dispatch/manual/${id}`, method: 'delete' })
}

// Customer portal management (admin)
export function getInflowPortal(name) {
  return request({ url: `/inflow/customers/${encodeURIComponent(name)}/portal`, method: 'get' })
}
export function createInflowPortalUser(name, data) {
  return request({ url: `/inflow/customers/${encodeURIComponent(name)}/portal/users`, method: 'post', data })
}
export function updateInflowPortalUser(name, userId, data) {
  return request({ url: `/inflow/customers/${encodeURIComponent(name)}/portal/users/${userId}`, method: 'put', data })
}
export function deleteInflowPortalUser(name, userId) {
  return request({ url: `/inflow/customers/${encodeURIComponent(name)}/portal/users/${userId}`, method: 'delete' })
}

// Customer statement (inflow-customer portal)
export function getInflowStatement() {
  return request({ url: '/inflow/statement', method: 'get' })
}
export function getInflowStatementOrder(id) {
  return request({ url: `/inflow/statement/order/${id}`, method: 'get' })
}
// Admin viewing a specific customer's statement (from the Customer page)
export function getInflowCustomerStatement(name) {
  return request({ url: `/inflow/customers/${encodeURIComponent(name)}/statement`, method: 'get' })
}
