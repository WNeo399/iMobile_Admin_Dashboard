import request from '@/utils/request'

export function getCurrentStock(query) {
  return request({
    url: '/zoho/collectionStocks',
    method: 'get',
    params: query
  })
}

export function getSalesTotal(query) {
  return request({
    url: '/zoho/salesTotal',
    method: 'post',
    data: query
  })
}
// iphone 12

// 0458625345

