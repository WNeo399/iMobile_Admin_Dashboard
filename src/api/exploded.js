import request from '@/utils/request'

// Exploded Diagrams — admin management of the widget's diagrams.

export function listExplodedDiagrams() {
  return request({ url: '/exploded/diagrams', method: 'get' })
}
export function getExplodedDiagram(id) {
  return request({ url: `/exploded/diagrams/${id}`, method: 'get' })
}
// data is a FormData: image file + brand / model / title / status fields.
// The multipart Content-Type must be set explicitly — the axios instance
// defaults to application/json, which strips the multipart boundary and
// leaves multer with no file (same trap documented in api/tools/creditNote).
// Uploads go to S3, so give them room.
export function createExplodedDiagram(data) {
  return request({
    url: '/exploded/diagrams',
    method: 'post',
    data,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000
  })
}
export function updateExplodedDiagram(id, data) {
  return request({ url: `/exploded/diagrams/${id}`, method: 'put', data })
}
export function saveExplodedHotspots(id, hotspots) {
  return request({ url: `/exploded/diagrams/${id}/hotspots`, method: 'put', data: { hotspots } })
}
export function replaceExplodedImage(id, data) {
  return request({
    url: `/exploded/diagrams/${id}/image`,
    method: 'post',
    data,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000
  })
}
export function deleteExplodedDiagram(id) {
  return request({ url: `/exploded/diagrams/${id}`, method: 'delete' })
}
// Photo for a linked product (multipart — same Content-Type note as above).
export function uploadExplodedProductImage(id, data) {
  return request({
    url: `/exploded/diagrams/${id}/product-image`,
    method: 'post',
    data,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000
  })
}
