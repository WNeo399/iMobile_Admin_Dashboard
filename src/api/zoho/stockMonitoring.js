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

// Item's product image, proxied through the backend (Zoho needs OAuth).
// Resolves to a Blob; an empty blob (204) means the item has no image.
export function getItemImage(itemId) {
  return request({
    url: `/zoho/items/${itemId}/image`,
    method: 'get',
    responseType: 'blob'
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

