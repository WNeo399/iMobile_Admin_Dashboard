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

// The four price-list rates for one item, live from Zoho Analytics — the
// Price Monitoring page's per-row "check live" button.
export function getStockItemPrices(itemId) {
  return request({ url: `/stock-monitor/item/${itemId}/prices`, method: 'get', timeout: 30000 })
}

// Trigger the daily snapshot now (dashboard's "Update snapshot" button).
// Returns immediately; poll getStockSnapshotRun() until running is false.
export function runStockSnapshot() {
  return request({ url: '/stock-monitor/snapshot/run', method: 'post' })
}

export function getStockSnapshotRun() {
  return request({ url: '/stock-monitor/snapshot/run', method: 'get' })
}

// Move an item into the Archive bucket by hand, or restore it (restoring
// pins a criteria-matched name as never-archived).
export function setStockItemArchived(itemId, restore) {
  return request({ url: `/stock-monitor/item/${itemId}/archived`, method: 'post', data: { restore: !!restore } })
}

// Push one price-list rate to Zoho Inventory (merge endpoint — only this
// item is touched) and mirror it into today's snapshot.
export function updateStockItemPrice(itemId, list, rate) {
  return request({ url: `/stock-monitor/item/${itemId}/price`, method: 'put', data: { list, rate }, timeout: 30000 })
}
