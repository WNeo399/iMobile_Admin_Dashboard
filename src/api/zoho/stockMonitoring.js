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

// Inline reorder-point edit — pushes straight to Zoho Inventory.
export function updateItemReorderLevel(itemId, reorderLevel) {
  return request({
    url: `/zoho/items/${itemId}/reorderLevel`,
    method: 'put',
    data: { reorderLevel }
  })
}
// iphone 12

// 0458625345

