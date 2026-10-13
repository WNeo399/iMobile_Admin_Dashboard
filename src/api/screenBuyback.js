import request from '@/utils/request'

// iMobile → Screen Buyback: the ABCD grade price list (what we pay back
// for a returned screen, per model and condition grade). Backend
// routes/screenBuybackRoutes.

export function listScreenBuyback() {
  return request({ url: '/screen-buyback/models', method: 'get' })
}
export function createScreenBuyback(data) {
  return request({ url: '/screen-buyback/models', method: 'post', data })
}
export function updateScreenBuyback(id, data) {
  return request({ url: `/screen-buyback/models/${id}`, method: 'put', data })
}
// The order inside a brand (the workbook's dropdown order): every model
// id of the brand in the wanted order, saved in one go.
export function saveScreenBuybackOrder(brand, ids) {
  return request({ url: `/screen-buyback/brands/${encodeURIComponent(brand)}/order`, method: 'put', data: { ids } })
}
export function deleteScreenBuyback(id) {
  return request({ url: `/screen-buyback/models/${id}`, method: 'delete' })
}
// The workbook (Phones / Price / Buyback sheets) as a blob.
export function exportScreenBuyback() {
  return request({ url: '/screen-buyback/export', method: 'get', responseType: 'blob', timeout: 60000 })
}
