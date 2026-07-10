import request from '@/utils/request'

// Purchase Order — reads the imb_purchase_order collection (synced from the
// supplier's Tencent Docs sheet by the backend).

// Paginated + filterable (category, status, free-text search).
export function getPoRecords(query) {
  return request({
    url: '/purchaseOrder/records',
    method: 'get',
    params: query
  })
}

// Pull the latest from Tencent Docs into the DB (a few seconds — it exports the
// whole sheet), then the page reloads from the DB.
export function syncPo() {
  return request({
    url: '/purchaseOrder/sync',
    method: 'post',
    timeout: 90000
  })
}

// Manually pull the latest edits from Tencent Docs into the DB — incremental:
// updates changed rows, inserts new ones, deletes nothing. Slow (exports the
// whole sheet), so a generous timeout.
export function updateSyncPo() {
  return request({
    url: '/purchaseOrder/updateSync',
    method: 'post',
    timeout: 120000
  })
}

// Mark a pending PO as ordered — supplier (required) + unitPrice (optional).
// Stamps 下单时间 and writes back to the Tencent sheet (slow), so allow a long timeout.
export function placePoOrder(data) {
  return request({ url: '/purchaseOrder/placeOrder', method: 'post', data, timeout: 120000 })
}

// Mark a PO as 缺货 (out of stock) — a dashboard-only status flag.
export function markPoShortage(id) {
  return request({ url: '/purchaseOrder/markShortage', method: 'post', data: { id } })
}

// Mark a PO as 已取消 (cancelled) — a dashboard-only status flag.
export function cancelPoOrder(id) {
  return request({ url: '/purchaseOrder/cancelOrder', method: 'post', data: { id } })
}

// Edit an order's 备注 / 订单数量. A quantity change is mirrored to the Tencent
// sheet (slow), so allow a long timeout.
export function updatePoDetail(data) {
  return request({ url: '/purchaseOrder/updateDetail', method: 'post', data, timeout: 120000 })
}

// Not-yet-received purchase summary per Zoho item_id (for Stock Monitoring).
export function getPoByZohoIds(zohoIds) {
  return request({
    url: '/purchaseOrder/byZohoIds',
    method: 'post',
    data: { zohoIds }
  })
}

// Category (sheet) list for the Create PO picker.
export function getPoCategories() {
  return request({ url: '/purchaseOrder/categories', method: 'get' })
}

// Create a purchase order in-app (from Stock Monitoring or the PO page). The
// backend also appends the row to the Tencent sheet, which exports the whole
// workbook first — slow — so allow a generous timeout instead of the 10s default.
export function createPo(data) {
  return request({ url: '/purchaseOrder/create', method: 'post', data, timeout: 120000 })
}

// Create several POs at once. Each item = { category, orderQty, sku, productName,
// note, zoho_id }. The backend appends to Tencent grouped by category (one export
// per distinct category), so allow an even longer timeout.
export function createPoBatch(items) {
  return request({ url: '/purchaseOrder/createBatch', method: 'post', data: { items }, timeout: 180000 })
}
