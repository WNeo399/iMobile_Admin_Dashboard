import request from '@/utils/request'

// ExEngine sales insights (from the Exyon vw_invoiced_order_items view).
// `days` bounds the "fast moving" window (0 = all time).
export function getExInsights(params) {
  return request({
    url: '/exengine/insights',
    method: 'get',
    params,
    timeout: 60000
  })
}
