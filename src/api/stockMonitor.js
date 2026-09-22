import request from '@/utils/request'

// Stock Dashboard — reads the stock register, never Zoho, so every call
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
// names aren't in the register — so it is slower than the rest and loads
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

// Refresh the register now (the dashboard's "Update Now" button).
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
// item is touched) and mirror it into the register.
export function updateStockItemPrice(itemId, list, rate) {
  return request({ url: `/stock-monitor/item/${itemId}/price`, method: 'put', data: { list, rate }, timeout: 30000 })
}
// Many price changes at once — the server writes them to Zoho one call at
// a time (Zoho refuses more than a few simultaneous pricebook writes).
// changes: [{ itemId, list, rate }] → { pushed, failed, results[] }
export function pushStockItemPrices(changes) {
  return request({ url: '/stock-monitor/prices/bulk', method: 'put', data: { changes }, timeout: 300000 })
}

// Upload product images to the item in Zoho (Missing Images page). files:
// File[] in order — the first becomes the main image when the item has
// none. Explicit multipart header: the default JSON one leaves multer with
// no files.
export function uploadStockItemImages(itemId, files) {
  const data = new FormData()
  files.forEach(f => data.append('images', f, f.name))
  return request({
    url: `/stock-monitor/item/${itemId}/images`,
    method: 'post',
    data,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000
  })
}

// The Stock Monitoring list for one collection (or a comma-list branch)
// from the register: rows with their four sales windows, in one call and
// nothing from Zoho. The page overlays live stock on the rows it shows.
export function getStockCollectionItems(params) {
  return request({ url: '/stock-monitor/collection-items', method: 'get', params })
}

// Browse mode: the catalogue as Device Brand → Series → Classification →
// Sub Classification with counts, from the register.
export function getBrowseTree(params) {
  return request({ url: '/stock-monitor/browse-tree', method: 'get', params })
}

// One node of that tree, server-paged: tile counts, the quality breakdown,
// and a page of rows (all=1: every row, for export).
export function getBrowseItems(params) {
  return request({ url: '/stock-monitor/browse-items', method: 'get', params })
}

// Live stock for the rows on screen — one Zoho Inventory read per page of
// ids. Overlaid on the stored numbers by liveStockMixin.
export function getLiveStock(itemIds) {
  return request({ url: '/stock-monitor/live', method: 'get', params: { ids: itemIds.join(',') }, timeout: 30000 })
}

// Units sold per week for one item, live from Zoho Analytics — the item
// drawer's trend.
export function getStockItemSalesTrend(itemId, weeks) {
  return request({ url: `/stock-monitor/item/${itemId}/sales-trend`, method: 'get', params: { weeks }, timeout: 30000 })
}
