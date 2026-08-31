import request from '@/utils/request'

// Stock Dashboard — reads the daily snapshot, never Zoho, so every call
// here returns in milliseconds. Everything is "as of" the last run; the
// summary carries the date and run status so the page can say how old it is.

export function getStockSummary(query) {
  return request({ url: '/stock-monitor/summary', method: 'get', params: query })
}

export function getStockItems(query) {
  return request({ url: '/stock-monitor/items', method: 'get', params: query })
}

export function getStockShelves(query) {
  return request({ url: '/stock-monitor/shelves', method: 'get', params: query })
}

export function getStockItem(itemId) {
  return request({ url: `/stock-monitor/item/${itemId}`, method: 'get' })
}

// Who bought it. This one reads Zoho live — invoice numbers and customer
// names aren't in the snapshot — so it is slower than the rest and loads
// only when a drawer opens.
export function getStockItemSales(itemId, params) {
  return request({ url: `/stock-monitor/item/${itemId}/sales`, method: 'get', params, timeout: 30000 })
}

// What we've ordered, from Zoho Inventory — the system POs are actually
// raised in, not the Tencent-synced supplier sheet. Also a live read.
export function getStockItemPurchaseOrders(itemId, params) {
  return request({
    url: `/stock-monitor/item/${itemId}/purchase-orders`, method: 'get', params, timeout: 30000
  })
}
