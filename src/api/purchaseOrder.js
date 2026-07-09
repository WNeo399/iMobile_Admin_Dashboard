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

// Create a purchase order in-app (from Stock Monitoring).
export function createPo(data) {
  return request({ url: '/purchaseOrder/create', method: 'post', data })
}
