import request from '@/utils/request'

// Embed Ordering — distributors who embed our parts widget and sell to
// their own customers.

export function getEmbedDistributors(query) {
  return request({ url: '/embed-ordering/distributors', method: 'get', params: query })
}
export function getEmbedDistributor(id) {
  return request({ url: `/embed-ordering/distributors/${id}`, method: 'get' })
}
export function createEmbedDistributor(data) {
  return request({ url: '/embed-ordering/distributors', method: 'post', data })
}
export function updateEmbedDistributor(id, data) {
  return request({ url: `/embed-ordering/distributors/${id}`, method: 'put', data })
}
// Retires the current key immediately — any widget still embedded with it
// stops resolving, so this is for a key that has leaked, not housekeeping.
export function rotateEmbedDistributorKey(id) {
  return request({ url: `/embed-ordering/distributors/${id}/rotate-key`, method: 'post' })
}
export function deleteEmbedDistributor(id) {
  return request({ url: `/embed-ordering/distributors/${id}`, method: 'delete' })
}

// ── Customers — each distributor's own customers ─────────────────────
// Scoped by distributor: the same email can hold an account with two
// distributors without their data mixing.
export function getEmbedCustomers(query) {
  return request({ url: '/embed-ordering/customers', method: 'get', params: query })
}
export function createEmbedCustomer(data) {
  return request({ url: '/embed-ordering/customers', method: 'post', data })
}
export function updateEmbedCustomer(id, data) {
  return request({ url: `/embed-ordering/customers/${id}`, method: 'put', data })
}
export function deleteEmbedCustomer(id) {
  return request({ url: `/embed-ordering/customers/${id}`, method: 'delete' })
}

// ── Embed Ordering — orders placed through the widget, and what the
// widget holds (for the Ordering Widget page) ─────────────────────────
export function getEmbedOrders(query) {
  return request({ url: '/embed-ordering/orders', method: 'get', params: query })
}
export function getEmbedOrder(id) {
  return request({ url: `/embed-ordering/orders/${id}`, method: 'get' })
}
export function setEmbedOrderStatus(id, data) {
  return request({ url: `/embed-ordering/orders/${id}/status`, method: 'post', data })
}
export function setEmbedOrderStaffNote(id, staffNote) {
  return request({ url: `/embed-ordering/orders/${id}/staff-note`, method: 'put', data: { staffNote } })
}
export function getEmbedWidgetSummary() {
  return request({ url: '/embed-ordering/widget-summary', method: 'get', timeout: 60000 })
}
