import request from '@/utils/request'

// Refurbished Phones — read-only Reebelo offer data from the scraper MySQL DB.

export function getRefurbSummary(date) {
  return request({
    url: '/refurbished/summary',
    method: 'get',
    params: { date }
  })
}

export function getRefurbFilters(date) {
  return request({
    url: '/refurbished/filters',
    method: 'get',
    params: { date }
  })
}

export function getRefurbOffers(query) {
  return request({
    url: '/refurbished/offers',
    method: 'get',
    params: query
  })
}

// ── Refurbished Device stock register (our own database) ────────────
export function getRefurbDevices(query) {
  return request({ url: '/refurbished/devices', method: 'get', params: query })
}
export function getRefurbDeviceFilters() {
  return request({ url: '/refurbished/devices/filters', method: 'get' })
}
export function createRefurbDevice(data) {
  return request({ url: '/refurbished/devices', method: 'post', data })
}
export function updateRefurbDevice(id, data) {
  return request({ url: `/refurbished/devices/${id}`, method: 'put', data })
}
export function deleteRefurbDevice(id) {
  return request({ url: `/refurbished/devices/${id}`, method: 'delete' })
}
// Device identity from an IMEI (model / colour / storage / location).
export function lookupRefurbDevice(imei) {
  return request({ url: '/refurbished/devices/lookup', method: 'get', params: { imei } })
}
// Full Blackbelt report for a device — fetched live via the stored report
// id (auth + download can take a few seconds).
export function getRefurbDeviceReport(id) {
  return request({ url: `/refurbished/devices/${id}/report`, method: 'get', timeout: 30000 })
}
// Re-ask Blackbelt about a device that had no report when it was added.
export function checkRefurbDeviceBlackbelt(id) {
  return request({ url: `/refurbished/devices/${id}/blackbelt-check`, method: 'post', timeout: 30000 })
}

// ── Customers — buyers of refurbished stock ───────────────────────────
export function getRefurbCustomers(query) {
  return request({ url: '/refurbished/customers', method: 'get', params: query })
}
export function createRefurbCustomer(data) {
  return request({ url: '/refurbished/customers', method: 'post', data })
}
export function updateRefurbCustomer(id, data) {
  return request({ url: `/refurbished/customers/${id}`, method: 'put', data })
}
export function deleteRefurbCustomer(id) {
  return request({ url: `/refurbished/customers/${id}`, method: 'delete' })
}

// ── Sales Orders — selling devices out of the stock register ──────────
export function getRefurbSalesOrders(query) {
  return request({ url: '/refurbished/sales-orders', method: 'get', params: query })
}
export function getRefurbSalesOrder(id) {
  return request({ url: `/refurbished/sales-orders/${id}`, method: 'get' })
}
// Creating marks every device on the order Sold.
export function createRefurbSalesOrder(data) {
  return request({ url: '/refurbished/sales-orders', method: 'post', data })
}
// Editing reconciles the device set: dropped devices go back In Stock,
// added ones are marked Sold. Active orders only.
export function updateRefurbSalesOrder(id, data) {
  return request({ url: `/refurbished/sales-orders/${id}`, method: 'put', data })
}
// Re-read model / colour / storage etc. from the device register onto the
// order's lines (prices and the device set are untouched).
export function refreshRefurbSalesOrderLines(id) {
  return request({ url: `/refurbished/sales-orders/${id}/refresh-lines`, method: 'post' })
}
// The remark stays editable after confirmation (everything else is locked).
export function updateRefurbSalesOrderNotes(id, notes) {
  return request({ url: `/refurbished/sales-orders/${id}/notes`, method: 'put', data: { notes } })
}
// Confirming locks the order — a confirmed order can no longer be edited.
export function confirmRefurbSalesOrder(id) {
  return request({ url: `/refurbished/sales-orders/${id}/confirm`, method: 'post' })
}
// Cancelling puts the order's devices back In Stock.
export function cancelRefurbSalesOrder(id) {
  return request({ url: `/refurbished/sales-orders/${id}/cancel`, method: 'post' })
}

// ── Incoming Stocks — supplier shipments counted in by the warehouse ──
export function getIncomingBatches() {
  return request({ url: '/refurbished/incoming', method: 'get' })
}
export function createIncomingBatch(data) {
  return request({ url: '/refurbished/incoming', method: 'post', data })
}
export function getIncomingBatch(id) {
  return request({ url: `/refurbished/incoming/${id}`, method: 'get' })
}
// Scanning is client-side; this is the one write of a stock take — the
// scanned codes are marked received and turned into stock records together.
// A bulk receive touches every device, and any unlisted extras get a live
// Blackbelt lookup, so it gets far more than the 10s default timeout.
export function commitIncoming(id, data) {
  return request({ url: `/refurbished/incoming/${id}/commit`, method: 'post', data, timeout: 120000 })
}
// Sell scanned units straight off a shipment — creates the stock records
// (at the iMobile location, status Sold) and the sales order in one call,
// so it gets the same generous timeout as a bulk receive.
export function sellIncoming(id, data) {
  return request({ url: `/refurbished/incoming/${id}/sell`, method: 'post', data, timeout: 120000 })
}
// Everything received against a batch, joined to its location in the
// register and the sales order it went out on (if any).
export function getIncomingReceived(id) {
  return request({ url: `/refurbished/incoming/${id}/received`, method: 'get' })
}
export function recheckIncoming(id, data) {
  return request({ url: `/refurbished/incoming/${id}/recheck`, method: 'post', data })
}
export function deleteIncomingBatch(id) {
  return request({ url: `/refurbished/incoming/${id}`, method: 'delete' })
}
