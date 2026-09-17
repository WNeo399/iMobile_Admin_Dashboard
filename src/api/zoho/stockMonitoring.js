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

// 海运 (sea freight) list — a pinned-products collection surfaced as a tab
// on Stock Monitoring. Membership resolves from Mongo, so changes are
// instant (no Zoho write, no Analytics lag).
export function getSeaFreight() {
  return request({ url: '/zoho/seaFreight', method: 'get' })
}
// items = [{ id, name, sku }]
export function addSeaFreightItems(items) {
  return request({ url: '/zoho/seaFreight/items', method: 'post', data: { items } })
}
export function removeSeaFreightItem(itemId) {
  return request({ url: `/zoho/seaFreight/items/${itemId}`, method: 'delete' })
}

// Hide the picked items from the Stock Monitoring list (page-level only —
// the dashboard and Price Monitoring still count them).
// items = [{ id, name, sku }]
export function hideStockItems(items) {
  return request({ url: '/zoho/stockHidden', method: 'post', data: { items } })
}

export function unhideStockItem(itemId) {
  return request({ url: `/zoho/stockHidden/${itemId}`, method: 'delete' })
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

