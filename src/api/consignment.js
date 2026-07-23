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
// Resolve Stock IDs / IMEIs against the ExEngine stock DB.
export function lookupConsignDevices(codes) {
  return request({ url: '/consignment/devices/lookup', method: 'post', data: { codes }, timeout: 30000 })
}
export function assignConsignDevices(data) {
  return request({ url: '/consignment/devices/assign', method: 'post', data })
}
// action: receive | sell | return | markReturned
export function updateConsignDeviceStatus(action, ids) {
  return request({ url: '/consignment/devices/updateStatus', method: 'post', data: { action, ids } })
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
