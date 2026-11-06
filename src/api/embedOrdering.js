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

// ── 3D Diagrams — a 3D exploded model (.glb) per phone model, its parts
// linked to our items; shown in the ordering widget's "3D view" ─────────
const D3 = '/embed-ordering/diagrams-3d'
export function get3dDiagrams() {
  return request({ url: D3, method: 'get' })
}
export function get3dModels() {
  return request({ url: `${D3}/models`, method: 'get', timeout: 60000 })
}
export function search3dItems(q) {
  return request({ url: `${D3}/items`, method: 'get', params: { q } })
}
export function create3dDiagram(formData, onUploadProgress) {
  return request({ url: D3, method: 'post', data: formData, headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000, onUploadProgress })
}
export function get3dDiagram(id) {
  return request({ url: `${D3}/${id}`, method: 'get', timeout: 60000 })
}
// the .glb itself (ArrayBuffer), for the preview
export function get3dDiagramFile(id, version) {
  return request({ url: `${D3}/${id}/model.glb`, method: 'get', params: { v: version }, responseType: 'arraybuffer', timeout: 300000 })
}
export function update3dDiagram(id, data) {
  return request({ url: `${D3}/${id}`, method: 'put', data })
}
export function replace3dDiagramFile(id, formData, onUploadProgress) {
  return request({ url: `${D3}/${id}/file`, method: 'post', data: formData, headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000, onUploadProgress })
}
export function copy3dDiagramLinks(id, fromId, overwrite) {
  return request({ url: `${D3}/${id}/copy-links`, method: 'post', data: { fromId, overwrite: !!overwrite } })
}
export function delete3dDiagram(id) {
  return request({ url: `${D3}/${id}`, method: 'delete' })
}
