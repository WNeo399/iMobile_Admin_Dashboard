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

export function getInflowCustomers(query) {
  return request({ url: '/inflow/customers', method: 'get', params: query })
}

export function getInflowFilters() {
  return request({ url: '/inflow/filters', method: 'get' })
}
