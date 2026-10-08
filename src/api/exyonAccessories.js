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
