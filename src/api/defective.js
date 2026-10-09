import request from '@/utils/request'

// Defective devices for sale — one-off listings (backend /defective).
const BASE = '/defective'

// fault states, conditions, statuses, limits, what's configured on the server
export function getDefectiveMeta() {
  return request({ url: `${BASE}/meta`, method: 'get' })
}
// params: status, q, page, pageSize → { rows, total, counts }
export function listDefectiveListings(params) {
  return request({ url: `${BASE}/listings`, method: 'get', params, timeout: 60000 })
}
export function getDefectiveListing(id) {
  return request({ url: `${BASE}/listings/${id}`, method: 'get' })
}
export function createDefectiveListing(data) {
  return request({ url: `${BASE}/listings`, method: 'post', data })
}
export function updateDefectiveListing(id, data) {
  return request({ url: `${BASE}/listings/${id}`, method: 'put', data })
}
export function deleteDefectiveListing(id) {
  return request({ url: `${BASE}/listings/${id}`, method: 'delete' })
}
// FormData with "photos" files
export function uploadDefectivePhotos(id, formData) {
  return request({ url: `${BASE}/listings/${id}/photos`, method: 'post', data: formData, headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 })
}
// a signed URL the browser PUTs the video to: { upload: { id, key, url, contentType, expiresAt } }
export function startDefectiveVideo(id, data) {
  return request({ url: `${BASE}/listings/${id}/video`, method: 'post', data })
}
export function finishDefectiveVideo(id, mediaId, data) {
  return request({ url: `${BASE}/listings/${id}/video/${mediaId}/finish`, method: 'post', data, timeout: 60000 })
}
// FormData with one "poster" image — a video's cover frame
export function uploadDefectivePoster(id, mediaId, formData) {
  return request({ url: `${BASE}/listings/${id}/media/${mediaId}/poster`, method: 'post', data: formData, headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 })
}
export function orderDefectiveMedia(id, ids) {
  return request({ url: `${BASE}/listings/${id}/media/order`, method: 'put', data: { ids } })
}
export function deleteDefectiveMedia(id, mediaId) {
  return request({ url: `${BASE}/listings/${id}/media/${mediaId}`, method: 'delete' })
}
// the AI draft: { draft, photos, model, usage }
export function draftDefectiveListing(id, instructions) {
  return request({ url: `${BASE}/listings/${id}/draft`, method: 'post', data: { instructions }, timeout: 180000 })
}
// to: ready | published | sold | withdrawn | draft; sold: { price, channel, note }; note (withdrawn)
export function setDefectiveStatus(id, data) {
  return request({ url: `${BASE}/listings/${id}/status`, method: 'post', data })
}
// the chat assistant on the New Listing page: { listingId?, message, mediaIds? } → { listing, reply, actions }
export function assistDefective(data) {
  return request({ url: `${BASE}/assist`, method: 'post', data, timeout: 120000 })
}

// yes / no to the details the assistant suggested from the photos (no AI call)
export function decideDefectiveSuggestion(data) {
  return request({ url: "/defective/assist/decide", method: "post", data })
}
