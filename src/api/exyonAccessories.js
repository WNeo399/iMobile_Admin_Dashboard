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
// one day's list: { list, lines (per SKU: single / multi / total), summary }
export function getExyonPickList(day) {
  return request({ url: `/exyon-accessories/pick-lists/${encodeURIComponent(day)}`, method: 'get' })
}
// processed on the Dispatch page: [{ orderId, tracking }] → today's pick list
export function processExyonOrders(orders) {
  return request({ url: '/exyon-accessories/pick-lists/today/process', method: 'post', data: { orders }, timeout: 60000 })
}
// shipping label data per order (the address comes from Neto)
export function getExyonLabels(orderIds) {
  return request({ url: '/exyon-accessories/labels', method: 'get', params: { orderIds: orderIds.join(',') }, timeout: 60000 })
}
export function removeFromPickList(day, orderId) {
  return request({ url: `/exyon-accessories/pick-lists/${encodeURIComponent(day)}/remove`, method: 'post', data: { orderId } })
}
