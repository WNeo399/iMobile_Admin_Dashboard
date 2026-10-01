import request from '@/utils/request'

// Consignment — devices placed with partner shops.

// ── Shops (admin) ──
export function getConsignShops() {
  return request({ url: '/consignment/shops', method: 'get' })
}
export function createConsignShop(data) {
  return request({ url: '/consignment/shops', method: 'post', data })
}
export function updateConsignShop(id, data) {
  return request({ url: `/consignment/shops/${id}`, method: 'put', data })
}
export function getConsignLogins(shopId) {
  return request({ url: `/consignment/shops/${shopId}/logins`, method: 'get' })
}
export function createConsignLogin(shopId, data) {
  return request({ url: `/consignment/shops/${shopId}/logins`, method: 'post', data })
}
export function resetConsignLoginPassword(loginId, password) {
  return request({ url: `/consignment/logins/${loginId}/resetPassword`, method: 'post', data: { password } })
}

// ── Devices ──
export function getConsignDevices(params) {
  return request({ url: '/consignment/devices', method: 'get', params })
}
// Assignment batches — one per Assign, i.e. one per send to a shop.
export function getConsignBatches(params) {
  return request({ url: '/consignment/devices/batches', method: 'get', params })
}
// Resolve Stock IDs / IMEIs against the ExEngine stock DB.
export function lookupConsignDevices(codes) {
  return request({ url: '/consignment/devices/lookup', method: 'post', data: { codes }, timeout: 30000 })
}
export function assignConsignDevices(data) {
  return request({ url: '/consignment/devices/assign', method: 'post', data })
}
// action: receive | sell | return | markReturned
// prices (sell only): { deviceId: what it sold for } — optional per device
export function updateConsignDeviceStatus(action, ids, prices) {
  return request({ url: '/consignment/devices/updateStatus', method: 'post', data: { action, ids, prices } })
}
// The shop's price for one device (sold for / asking); null clears it
export function setConsignRetailPrice(id, retailPrice) {
  return request({ url: `/consignment/devices/${id}/retailPrice`, method: 'post', data: { retailPrice } })
}

// ── Insights (admin) ──
export function getConsignInsights() {
  return request({ url: '/consignment/insights', method: 'get' })
}

// ── Invoices (admin) ──
export function generateConsignInvoice(shopId) {
  return request({ url: '/consignment/invoices/generate', method: 'post', data: { shopId } })
}
export function getConsignInvoices(params) {
  return request({ url: '/consignment/invoices', method: 'get', params })
}
export function getConsignInvoiceDetail(id) {
  return request({ url: `/consignment/invoices/${id}`, method: 'get' })
}
// One invoice per shop, in one go (shopIds omitted = every shop with something to bill)
export function generateConsignInvoicesBatch(shopIds) {
  return request({ url: '/consignment/invoices/generate-batch', method: 'post', data: { shopIds }, timeout: 120000 })
}
// What invoices raised now would bill, per shop (sold, not invoiced yet)
export function previewConsignInvoices(params) {
  return request({ url: '/consignment/invoices/preview', method: 'get', params })
}
export function setConsignInvoicePaid(id, paid) {
  return request({ url: `/consignment/invoices/${id}/payment`, method: 'post', data: { paid } })
}
// Entered in inFlow (true) or not (false) — the label on the invoice lists
export function setConsignInvoiceInflow(id, recorded) {
  return request({ url: `/consignment/invoices/${id}/inflow`, method: 'post', data: { recorded } })
}
// Unpaid dashboard invoices only — their devices go back to "to invoice"
export function voidConsignInvoice(id) {
  return request({ url: `/consignment/invoices/${id}/void`, method: 'post' })
}
