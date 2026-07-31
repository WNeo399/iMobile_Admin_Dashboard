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
