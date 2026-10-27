import request from '@/utils/request'

// Exyon Accessories — Exyon's accessory orders (their exyon.accessory_orders
// table, one row per order line). params: from / to (YYYY-MM-DD), channel,
// status, q, page, pageSize.
export function getExyonAccessoryOrders(params) {
  return request({
    url: '/exyon-accessories/orders',
    method: 'get',
    params,
    timeout: 60000
  })
}

// The orders still to process (Pick / New), grouped for the warehouse:
// bySku, sameItems, multiLine. params: channel, status, q.
export function getExyonAccessoryDispatch(params) {
  return request({
    url: '/exyon-accessories/dispatch',
    method: 'get',
    params,
    timeout: 60000
  })
}

// Pick Lists — one record per day of the orders being processed.
// { lists, today }
export function getExyonPickLists() {
  return request({ url: '/exyon-accessories/pick-lists', method: 'get', timeout: 60000 })
}
// which list(s) an order number is on: { matches: [{ day, orderId, channel, customerName, tracking, dispatch }] }
export function findOnPickLists(q) {
  return request({ url: '/exyon-accessories/pick-lists/find', method: 'get', params: { q } })
}
// one day's list: { list, lines (per SKU: single / multi / total), summary }
export function getExyonPickList(day) {
  return request({ url: `/exyon-accessories/pick-lists/${encodeURIComponent(day)}`, method: 'get' })
}
// Australia Post labels (2026-10-21) for Large / Other envelopes:
// orders [{ orderId, parcel? }] → { results, pdf (base64), labelError };
// dryRun = AusPost's price check only. An order's label made already is
// reprinted. Cancel deletes the shipment (before it is lodged).
// reprintOnly: only labels made already — never a new shipment
export function createAuspostLabels(orders, dryRun, reprintOnly) {
  return request({ url: '/exyon-accessories/auspost/labels', method: 'post', data: { orders, dryRun: !!dryRun, reprintOnly: !!reprintOnly }, timeout: 180000 })
}
export function cancelAuspostLabel(orderId) {
  return request({ url: `/exyon-accessories/auspost/labels/${encodeURIComponent(orderId)}/cancel`, method: 'post', timeout: 60000 })
}
// Printing (2026-10-21): { orderIds } — the new orders printed, closed as the
// day's next batch; { batch } — that batch printed again
export function printExyonPickList(day, data) {
  return request({ url: `/exyon-accessories/pick-lists/${encodeURIComponent(day)}/print`, method: 'post', data })
}
// processed on the Dispatch page: [{ orderId, tracking }] → today's pick list
export function processExyonOrders(orders) {
  return request({ url: '/exyon-accessories/pick-lists/today/process', method: 'post', data: { orders }, timeout: 60000 })
}
// shipping label data per order (the address comes from Neto)
export function getExyonLabels(orderIds) {
  return request({ url: '/exyon-accessories/labels', method: 'get', params: { orderIds: orderIds.join(',') }, timeout: 60000 })
}
// Confirm dispatch on a day's list: [{ orderId, dispatch: true, tracking? }
// | { orderId, dispatch: false, reason, note? }] — dispatched ones are set to
// Dispatched in Neto. dryRun: only shows what Neto would get.
export function confirmExyonDispatch(day, orders, dryRun) {
  return request({ url: `/exyon-accessories/pick-lists/${encodeURIComponent(day)}/dispatch`, method: 'post', data: { orders, dryRun: !!dryRun }, timeout: 180000 })
}
export function removeFromPickList(day, orderId) {
  return request({ url: `/exyon-accessories/pick-lists/${encodeURIComponent(day)}/remove`, method: 'post', data: { orderId } })
}
// An item's envelope chosen by hand on Dispatch (size '' = back to the rules)
export function setExyonEnvelope(sku, size) {
  return request({ url: `/exyon-accessories/envelopes/${encodeURIComponent(sku)}`, method: 'put', data: { size: size || '' } })
}
// Neto's current lines for these orders, kept; Dispatch uses them from then on
export function syncExyonNeto(orderIds) {
  return request({ url: '/exyon-accessories/neto-sync', method: 'post', data: { orderIds }, timeout: 120000 })
}
// A processed order's tracking number changed (not once it's dispatched)
export function changeExyonTracking(day, orderId, tracking) {
  return request({ url: `/exyon-accessories/pick-lists/${encodeURIComponent(day)}/tracking`, method: 'post', data: { orderId, tracking } })
}
