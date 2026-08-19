import request from '@/utils/request'

// Point of Sale — distributors who embed our parts widget and sell to
// their own customers.

export function getPosDistributors(query) {
  return request({ url: '/pos/distributors', method: 'get', params: query })
}
export function getPosDistributor(id) {
  return request({ url: `/pos/distributors/${id}`, method: 'get' })
}
export function createPosDistributor(data) {
  return request({ url: '/pos/distributors', method: 'post', data })
}
export function updatePosDistributor(id, data) {
  return request({ url: `/pos/distributors/${id}`, method: 'put', data })
}
// Retires the current key immediately — any widget still embedded with it
// stops resolving, so this is for a key that has leaked, not housekeeping.
export function rotatePosDistributorKey(id) {
  return request({ url: `/pos/distributors/${id}/rotate-key`, method: 'post' })
}
export function deletePosDistributor(id) {
  return request({ url: `/pos/distributors/${id}`, method: 'delete' })
}

// ── Customers — each distributor's own customers ─────────────────────
// Scoped by distributor: the same email can hold an account with two
// distributors without their data mixing.
export function getPosCustomers(query) {
  return request({ url: '/pos/customers', method: 'get', params: query })
}
export function createPosCustomer(data) {
  return request({ url: '/pos/customers', method: 'post', data })
}
export function updatePosCustomer(id, data) {
  return request({ url: `/pos/customers/${id}`, method: 'put', data })
}
export function deletePosCustomer(id) {
  return request({ url: `/pos/customers/${id}`, method: 'delete' })
}
