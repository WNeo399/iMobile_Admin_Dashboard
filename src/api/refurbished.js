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
export function recheckIncoming(id, data) {
  return request({ url: `/refurbished/incoming/${id}/recheck`, method: 'post', data })
}
export function deleteIncomingBatch(id) {
  return request({ url: `/refurbished/incoming/${id}`, method: 'delete' })
}
